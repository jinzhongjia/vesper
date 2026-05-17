import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { type Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { CacheDir } from './lib/cache.js';
import { HttpClient } from './lib/http.js';
import { Logger } from './lib/log.js';
import { TypedSettings } from './lib/settings.js';
import { createProvider } from './providers/index.js';
import type { WallpaperProvider } from './providers/provider.js';
import type { ColorVariant } from './types.js';

const BG_SCHEMA = 'org.gnome.desktop.background';
const BACKOFF_CAP_SECONDS = 3600; // hard cap: 1 hour between retries

export class WallpaperManager {
  private readonly log = new Logger('manager');
  private readonly settings: TypedSettings;
  private readonly bgSettings: Gio.Settings;
  private readonly http: HttpClient;
  private readonly cache: CacheDir;

  private provider: WallpaperProvider | null = null;
  private cancellable: Gio.Cancellable | null = null;
  private timerId = 0;
  private readonly handlerIds: number[] = [];
  private indicator: InstanceType<typeof PanelMenu.Button> | null = null;
  private pauseItem: PopupMenu.PopupMenuItem | null = null;
  private lastDualState: boolean | null = null;
  private paused = false;
  private lastTickFailed = false;
  private tickInFlight = false;
  private pendingTick = false;
  private consecutiveFailures = 0;

  constructor(private readonly extension: Extension) {
    this.settings = new TypedSettings(extension.getSettings());
    this.bgSettings = new Gio.Settings({ schema_id: BG_SCHEMA });
    this.http = new HttpClient();
    this.cache = CacheDir.forVesper();
  }

  start(): void {
    this.cancellable = new Gio.Cancellable();
    this.provider = this.makeProvider();

    this.handlerIds.push(this.settings.raw.connect('changed::source-type', () => {
      this.rebuildProvider();
      this.consecutiveFailures = 0;
      void this.tick();
    }));
    this.handlerIds.push(this.settings.raw.connect('changed::local-folder', () => {
      void this.tick();
    }));
    this.handlerIds.push(this.settings.raw.connect('changed::local-folder-dark', () => {
      void this.tick();
    }));
    this.handlerIds.push(this.settings.raw.connect('changed::interval-minutes', () => {
      this.scheduleTimer();
    }));
    this.handlerIds.push(this.settings.raw.connect('changed::follow-color-scheme', () => {
      void this.tick();
    }));

    this.addIndicator();
    this.scheduleTimer();
    void this.tick();
  }

  dispose(): void {
    for (const id of this.handlerIds) this.settings.raw.disconnect(id);
    this.handlerIds.length = 0;

    this.cancelTimer();

    this.cancellable?.cancel();
    this.cancellable = null;

    this.provider?.dispose();
    this.provider = null;

    this.http.dispose();

    this.indicator?.destroy();
    this.indicator = null;
    this.pauseItem = null;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Provider / timer
  // ────────────────────────────────────────────────────────────────────────

  private makeProvider(): WallpaperProvider {
    return createProvider(this.settings.sourceType, this.settings, this.http, this.cache);
  }

  private rebuildProvider(): void {
    this.provider?.dispose();
    this.provider = this.makeProvider();
  }

  /** Schedule a one-shot tick. Re-called by tick() in finally. */
  private scheduleTimer(): void {
    this.cancelTimer();
    if (this.paused || !this.cancellable) return;
    const baseSeconds = Math.max(1, this.settings.intervalMinutes * 60);
    const multiplier = this.consecutiveFailures === 0
      ? 1
      : Math.min(2 ** this.consecutiveFailures, BACKOFF_CAP_SECONDS);
    const seconds = Math.min(baseSeconds * multiplier, BACKOFF_CAP_SECONDS);
    this.timerId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, seconds, () => {
      this.timerId = 0;
      void this.tick();
      return GLib.SOURCE_REMOVE;
    });
    if (this.consecutiveFailures > 0) {
      this.log.info(`next tick in ${seconds}s (backoff after ${this.consecutiveFailures} failures)`);
    } else {
      this.log.info(`next tick in ${seconds}s`);
    }
  }

  private cancelTimer(): void {
    if (this.timerId) {
      GLib.source_remove(this.timerId);
      this.timerId = 0;
    }
  }

  private isDualMode(): boolean {
    const dualReady = this.settings.followColorScheme
      && this.settings.sourceType === 'local'
      && this.settings.localFolderDark !== '';
    if (this.lastDualState !== dualReady) {
      if (dualReady) {
        this.log.info('dual mode: light/dark from separate local folders');
      } else if (this.settings.followColorScheme) {
        const reason = this.settings.sourceType !== 'local'
          ? `source "${this.settings.sourceType}" cannot guarantee a dark variant`
          : 'local-folder-dark is empty';
        this.log.warn(`single mode (follow-color-scheme on, but ${reason})`);
      } else {
        this.log.info('single mode: one image written to both keys');
      }
      this.lastDualState = dualReady;
    }
    return dualReady;
  }

  private async tick(): Promise<void> {
    if (this.paused) return;
    if (this.tickInFlight) {
      this.pendingTick = true;
      return;
    }
    if (!this.provider || !this.cancellable) return;
    this.tickInFlight = true;

    let apiSucceeded = false;
    try {
      const dual = this.isDualMode();
      const light = await this.provider.getNext({
        variant: 'light',
        cancellable: this.cancellable,
      });
      this.applyVariant('light', light.localPath);

      if (dual) {
        try {
          const dark = await this.provider.getNext({
            variant: 'dark',
            cancellable: this.cancellable,
          });
          this.applyVariant('dark', dark.localPath);
        } catch (e) {
          this.log.warn(`dark variant failed; reusing light. err=${e}`);
          this.applyVariant('dark', light.localPath);
        }
      } else {
        this.applyVariant('dark', light.localPath);
      }

      this.cache.prune(this.settings.cacheKeepCount);
      apiSucceeded = true;
      if (this.lastTickFailed) {
        this.lastTickFailed = false;
        this.log.info('tick recovered');
      }
    } catch (apiError) {
      if (!this.cancellable || this.cancellable.is_cancelled()) {
        // Cancelled (disposing or source switch in flight). Don't touch wallpaper.
      } else {
        this.log.error('provider failed', apiError);
        const fallback = this.pickCachedFallback();
        if (fallback) {
          this.applyVariant('light', fallback);
          this.applyVariant('dark', fallback);
          this.log.info(`applied cached fallback: ${fallback}`);
        } else if (!this.lastTickFailed) {
          const msg = apiError instanceof Error ? apiError.message : String(apiError);
          Main.notify('Vesper', _('Wallpaper update failed: %s').format(msg));
          this.lastTickFailed = true;
        }
      }
    } finally {
      this.tickInFlight = false;
      if (apiSucceeded) {
        this.consecutiveFailures = 0;
      } else {
        this.consecutiveFailures++;
      }
      this.scheduleTimer();
      if (this.pendingTick) {
        this.pendingTick = false;
        GLib.idle_add(GLib.PRIORITY_LOW, () => {
          void this.tick();
          return GLib.SOURCE_REMOVE;
        });
      }
    }
  }

  /** Pick a random cached image distinct from the current one. Returns null if cache empty. */
  private pickCachedFallback(): string | null {
    const files = this.cache.listFiles();
    if (files.length === 0) return null;
    const currentUri = this.settings.getLastAppliedUri('light');
    const currentPath = currentUri.startsWith('file://')
      ? decodeURI(currentUri.slice(7))
      : currentUri;
    const candidates = files.filter(f => f !== currentPath);
    const pool = candidates.length > 0 ? candidates : files;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
  }

  private applyVariant(variant: ColorVariant, localPath: string): void {
    const uri = `file://${encodeURI(localPath)}`;
    const key = variant === 'dark' ? 'picture-uri-dark' : 'picture-uri';
    this.bgSettings.set_string(key, uri);
    this.settings.setLastAppliedUri(variant, uri);
    this.log.info(`applied ${variant}: ${uri}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Panel button / menu
  // ────────────────────────────────────────────────────────────────────────

  private addIndicator(): void {
    this.indicator = new PanelMenu.Button(0.0, this.extension.metadata.name, false);
    const icon = new St.Icon({
      icon_name: 'preferences-desktop-wallpaper-symbolic',
      style_class: 'system-status-icon',
    });
    this.indicator.add_child(icon);

    const menu = this.indicator.menu as PopupMenu.PopupMenu;

    const changeNow = new PopupMenu.PopupMenuItem(_('Change now'));
    changeNow.connect('activate', () => void this.tick());
    menu.addMenuItem(changeNow);

    this.pauseItem = new PopupMenu.PopupMenuItem(_('Pause'));
    this.pauseItem.connect('activate', () => this.togglePause());
    menu.addMenuItem(this.pauseItem);

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    const openCurrent = new PopupMenu.PopupMenuItem(_('Open current wallpaper'));
    openCurrent.connect('activate', () => this.openCurrentWallpaper());
    menu.addMenuItem(openCurrent);

    const prefs = new PopupMenu.PopupMenuItem(_('Preferences'));
    prefs.connect('activate', () => this.extension.openPreferences());
    menu.addMenuItem(prefs);

    Main.panel.addToStatusArea(this.extension.uuid, this.indicator);
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.pauseItem) this.pauseItem.label.text = this.paused ? _('Resume') : _('Pause');
    if (this.paused) {
      this.cancelTimer();
      this.log.info('paused');
    } else {
      this.consecutiveFailures = 0;
      this.scheduleTimer();
      this.log.info('resumed');
      void this.tick();
    }
  }

  private openCurrentWallpaper(): void {
    const uri = this.settings.getLastAppliedUri('light');
    if (!uri) {
      Main.notify('Vesper', _('No wallpaper has been applied yet'));
      return;
    }
    try {
      Gio.AppInfo.launch_default_for_uri(uri, null);
    } catch (e) {
      this.log.error('failed to open current wallpaper', e);
    }
  }
}

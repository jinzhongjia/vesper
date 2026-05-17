import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
  ExtensionPreferences,
  gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import type { SourceType, SwitchMode } from './types.js';

const SOURCE_KEYS: SourceType[] = ['local', 'wallhaven', 'peapix', 'picsum'];

const MODE_KEYS: SwitchMode[] = ['random', 'sequential'];

const PEAPIX_COUNTRIES = ['us', 'cn', 'de', 'jp', 'gb', 'fr', 'br', 'in', 'au', 'ca', 'it', 'es'];

export default class VesperPreferences extends ExtensionPreferences {
  async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
    const settings = this.getSettings();

    window.add(this.buildGeneralPage(settings));
    window.add(this.buildLocalPage(settings, window));
    window.add(this.buildWallhavenPage(settings));
    window.add(this.buildPeapixPage(settings));
    window.add(this.buildPicsumPage(settings));
  }

  // ────────────────────────────────────────────────────────────────────────
  // Pages
  // ────────────────────────────────────────────────────────────────────────

  private buildGeneralPage(settings: Gio.Settings): Adw.PreferencesPage {
    const page = new Adw.PreferencesPage({
      title: _('General'),
      icon_name: 'preferences-system-symbolic',
    });

    const activeGroup = new Adw.PreferencesGroup({
      description: _('When off, Vesper is loaded but does not change the wallpaper automatically.'),
    });
    const activeRow = new Adw.SwitchRow({
      title: _('Enable rotation'),
    });
    settings.bind('active', activeRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    activeGroup.add(activeRow);
    page.add(activeGroup);

    const sourceGroup = new Adw.PreferencesGroup({ title: _('Source') });
    sourceGroup.add(this.buildEnumComboRow(
      settings, 'source-type', SOURCE_KEYS,
      [_('Local folder'), _('Wallhaven'), _('Bing (via Peapix)'), _('Lorem Picsum')],
      _('Wallpaper source'), null,
    ));
    page.add(sourceGroup);

    const rotGroup = new Adw.PreferencesGroup({ title: _('Rotation') });
    const intervalRow = new Adw.SpinRow({
      title: _('Interval (minutes)'),
      subtitle: _('How often to change the wallpaper'),
      adjustment: new Gtk.Adjustment({
        lower: 1, upper: 1440, step_increment: 1, page_increment: 10,
      }),
    });
    settings.bind('interval-minutes', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    rotGroup.add(intervalRow);

    rotGroup.add(this.buildEnumComboRow(
      settings, 'switch-mode', MODE_KEYS,
      [_('Random'), _('Sequential')],
      _('Switch mode'), _('Only used for the local source'),
    ));
    page.add(rotGroup);

    const colorGroup = new Adw.PreferencesGroup({
      title: _('Color scheme'),
      description: _('Only effective when source is "Local folder" and a dark folder is set; remote sources cannot guarantee a dark variant.'),
    });
    const followRow = new Adw.SwitchRow({
      title: _('Use different wallpapers for light and dark modes'),
    });
    settings.bind('follow-color-scheme', followRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    colorGroup.add(followRow);
    page.add(colorGroup);

    const appearanceGroup = new Adw.PreferencesGroup({ title: _('Appearance') });
    const indicatorRow = new Adw.SwitchRow({
      title: _('Show panel indicator'),
      subtitle: _('When off, open preferences via the Extensions app or `gnome-extensions prefs vesper@nvimer.org`.'),
    });
    settings.bind('show-indicator', indicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    appearanceGroup.add(indicatorRow);
    page.add(appearanceGroup);

    const cacheGroup = new Adw.PreferencesGroup({ title: _('Cache') });
    const keepRow = new Adw.SpinRow({
      title: _('Keep last N downloaded images'),
      adjustment: new Gtk.Adjustment({
        lower: 1, upper: 1000, step_increment: 1, page_increment: 10,
      }),
    });
    settings.bind('cache-keep-count', keepRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    cacheGroup.add(keepRow);
    page.add(cacheGroup);

    return page;
  }

  private buildLocalPage(settings: Gio.Settings, window: Adw.PreferencesWindow): Adw.PreferencesPage {
    const page = new Adw.PreferencesPage({
      title: _('Local'),
      icon_name: 'folder-pictures-symbolic',
    });
    const group = new Adw.PreferencesGroup({
      title: _('Folders'),
      description: _('The light folder is also used when "follow color scheme" is off.'),
    });
    group.add(this.buildFolderRow(settings, 'local-folder', _('Light folder'), window));
    group.add(this.buildFolderRow(settings, 'local-folder-dark', _('Dark folder'), window));
    page.add(group);
    return page;
  }

  private buildWallhavenPage(settings: Gio.Settings): Adw.PreferencesPage {
    const page = new Adw.PreferencesPage({
      title: _('Wallhaven'),
      icon_name: 'web-browser-symbolic',
    });

    page.add(this.buildBitFlagGroup(
      settings, 'wallhaven-categories',
      _('Categories'), _('At least one should be enabled.'),
      [_('General'), _('Anime'), _('People')],
    ));

    page.add(this.buildBitFlagGroup(
      settings, 'wallhaven-purity',
      _('Purity'), _('Defaults to SFW only. Enable others at your own discretion.'),
      [_('SFW'), _('Sketchy'), _('NSFW')],
    ));

    return page;
  }

  private buildPeapixPage(settings: Gio.Settings): Adw.PreferencesPage {
    const page = new Adw.PreferencesPage({
      title: _('Peapix (Bing)'),
      icon_name: 'mark-location-symbolic',
    });
    const group = new Adw.PreferencesGroup({
      title: _('Region'),
      description: _('Bing serves a different daily image in each region.'),
    });
    group.add(this.buildEnumComboRow(
      settings, 'peapix-country', PEAPIX_COUNTRIES,
      [
        _('United States'), _('China'), _('Germany'), _('Japan'),
        _('United Kingdom'), _('France'), _('Brazil'), _('India'),
        _('Australia'), _('Canada'), _('Italy'), _('Spain'),
      ],
      _('Country'), null,
    ));
    page.add(group);
    return page;
  }

  private buildPicsumPage(settings: Gio.Settings): Adw.PreferencesPage {
    const page = new Adw.PreferencesPage({
      title: _('Picsum'),
      icon_name: 'image-x-generic-symbolic',
    });
    const group = new Adw.PreferencesGroup({ title: _('Resolution') });

    const widthRow = new Adw.SpinRow({
      title: _('Width (px)'),
      adjustment: new Gtk.Adjustment({
        lower: 320, upper: 7680, step_increment: 16, page_increment: 160,
      }),
    });
    settings.bind('picsum-width', widthRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    group.add(widthRow);

    const heightRow = new Adw.SpinRow({
      title: _('Height (px)'),
      adjustment: new Gtk.Adjustment({
        lower: 240, upper: 4320, step_increment: 16, page_increment: 120,
      }),
    });
    settings.bind('picsum-height', heightRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    group.add(heightRow);

    page.add(group);
    return page;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────

  private buildEnumComboRow(
    settings: Gio.Settings,
    key: string,
    values: string[],
    labels: string[],
    title: string,
    subtitle: string | null,
  ): Adw.ComboRow {
    const row = new Adw.ComboRow({
      title,
      ...(subtitle ? { subtitle } : {}),
      model: new Gtk.StringList({ strings: labels }),
    });
    const pull = () => {
      const idx = values.indexOf(settings.get_string(key));
      if (idx >= 0 && row.selected !== idx) row.selected = idx;
    };
    const push = () => {
      const next = values[row.selected];
      if (next !== undefined && settings.get_string(key) !== next) {
        settings.set_string(key, next);
      }
    };
    pull();
    row.connect('notify::selected', push);
    settings.connect(`changed::${key}`, pull);
    return row;
  }

  private buildBitFlagGroup(
    settings: Gio.Settings,
    key: string,
    title: string,
    description: string,
    labels: string[],
  ): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({ title, description });
    for (let i = 0; i < labels.length; i++) {
      const idx = i;
      const row = new Adw.SwitchRow({ title: labels[idx]! });
      row.active = this.flagAt(settings.get_string(key), idx);
      row.connect('notify::active', () => {
        const cur = settings.get_string(key);
        const next = this.setFlagAt(cur, idx, row.active);
        if (next !== cur) settings.set_string(key, next);
      });
      settings.connect(`changed::${key}`, () => {
        const v = this.flagAt(settings.get_string(key), idx);
        if (row.active !== v) row.active = v;
      });
      group.add(row);
    }
    return group;
  }

  private buildFolderRow(
    settings: Gio.Settings,
    key: string,
    title: string,
    parent: Adw.PreferencesWindow,
  ): Adw.ActionRow {
    const row = new Adw.ActionRow({
      title,
      subtitle: settings.get_string(key) || _('(not set)'),
    });

    const chooseButton = new Gtk.Button({
      label: _('Choose…'),
      valign: Gtk.Align.CENTER,
    });
    chooseButton.connect('clicked', () => {
      const dialog = new Gtk.FileDialog({
        title: _('Select %s').format(title),
        accept_label: _('Select'),
      });
      const cur = settings.get_string(key);
      if (cur) {
        try { dialog.set_initial_folder(Gio.File.new_for_path(cur)); } catch { /* ignore */ }
      }
      dialog.select_folder(parent, null, (src, res) => {
        try {
          const folder = (src as Gtk.FileDialog).select_folder_finish(res);
          const path = folder?.get_path();
          if (path) settings.set_string(key, path);
        } catch {
          // user dismissed or error — ignore
        }
      });
    });
    row.add_suffix(chooseButton);
    row.activatable_widget = chooseButton;

    const clearButton = new Gtk.Button({
      icon_name: 'edit-clear-symbolic',
      valign: Gtk.Align.CENTER,
      tooltip_text: _('Clear'),
    });
    clearButton.add_css_class('flat');
    clearButton.connect('clicked', () => settings.set_string(key, ''));
    row.add_suffix(clearButton);

    settings.connect(`changed::${key}`, () => {
      row.subtitle = settings.get_string(key) || _('(not set)');
    });
    return row;
  }

  private flagAt(s: string, i: number): boolean {
    return s.length > i && s[i] === '1';
  }

  private setFlagAt(s: string, i: number, v: boolean): string {
    const padded = s.padEnd(i + 1, '0');
    const chars = padded.split('');
    chars[i] = v ? '1' : '0';
    return chars.join('');
  }
}

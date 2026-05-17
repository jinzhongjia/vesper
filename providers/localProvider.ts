import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Logger } from '../lib/log.js';
import type { TypedSettings } from '../lib/settings.js';
import type { ColorVariant, SourceType } from '../types.js';
import type { WallpaperProvider, WallpaperRequest, WallpaperResult } from './provider.js';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);

export class LocalProvider implements WallpaperProvider {
  readonly id: SourceType = 'local';
  private readonly log = new Logger('local');

  constructor(private readonly settings: TypedSettings) {}

  async getNext(req: WallpaperRequest): Promise<WallpaperResult> {
    const folder = this.folderFor(req.variant);
    if (!folder) {
      throw new Error(
        req.variant === 'dark'
          ? 'local-folder-dark is empty'
          : 'local-folder is empty; set it via prefs or gsettings',
      );
    }

    const files = this.scanFolder(folder);
    if (files.length === 0) {
      throw new Error(`no supported images found in ${folder}`);
    }

    const pick = this.settings.switchMode === 'sequential'
      ? this.pickSequential(files, req.variant)
      : this.pickRandom(files, req.variant);

    this.log.info(`picked ${pick} (variant=${req.variant}, mode=${this.settings.switchMode}, pool=${files.length})`);
    return { localPath: pick };
  }

  dispose(): void {}

  private folderFor(variant: ColorVariant): string {
    if (variant === 'dark' && this.settings.localFolderDark) {
      return this.settings.localFolderDark;
    }
    return this.settings.localFolder;
  }

  private scanFolder(folder: string): string[] {
    const dir = Gio.File.new_for_path(folder);
    const enumerator = dir.enumerate_children(
      'standard::name,standard::type',
      Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
      null,
    );
    const out: string[] = [];
    let info = enumerator.next_file(null);
    while (info !== null) {
      if (info.get_file_type() === Gio.FileType.REGULAR) {
        const name = info.get_name();
        const dot = name.lastIndexOf('.');
        const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
        if (IMAGE_EXTENSIONS.has(ext)) {
          out.push(GLib.build_filenamev([folder, name]));
        }
      }
      info = enumerator.next_file(null);
    }
    enumerator.close(null);
    out.sort();
    return out;
  }

  private pickRandom(files: string[], variant: ColorVariant): string {
    if (files.length === 1) return files[0]!;
    const lastPath = this.uriToPath(this.settings.getLastAppliedUri(variant));
    let pick: string;
    do {
      pick = files[Math.floor(Math.random() * files.length)]!;
    } while (pick === lastPath);
    return pick;
  }

  private pickSequential(files: string[], variant: ColorVariant): string {
    const lastPath = this.uriToPath(this.settings.getLastAppliedUri(variant));
    const idx = lastPath ? files.indexOf(lastPath) : -1;
    return files[(idx + 1) % files.length]!;
  }

  private uriToPath(uri: string): string {
    if (!uri.startsWith('file://')) return uri;
    try {
      return decodeURI(uri.slice(7));
    } catch {
      return '';
    }
  }
}

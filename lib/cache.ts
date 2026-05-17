import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Logger } from './log.js';

export class CacheDir {
  private readonly log = new Logger('cache');

  constructor(public readonly root: string) {
    GLib.mkdir_with_parents(root, 0o755);
  }

  static forVesper(): CacheDir {
    return new CacheDir(GLib.build_filenamev([GLib.get_user_cache_dir(), 'vesper']));
  }

  pathFor(name: string): string {
    return GLib.build_filenamev([this.root, name]);
  }

  fileFor(name: string): Gio.File {
    return Gio.File.new_for_path(this.pathFor(name));
  }

  /** Keep the `keep` most-recently-modified entries; delete the rest. */
  prune(keep: number): void {
    if (keep < 1) return;
    const dir = Gio.File.new_for_path(this.root);
    let enumerator: Gio.FileEnumerator;
    try {
      enumerator = dir.enumerate_children(
        'standard::name,standard::type,time::modified',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        null,
      );
    } catch (e) {
      this.log.warn(`cannot enumerate ${this.root}: ${e}`);
      return;
    }

    const entries: { path: string; mtime: number }[] = [];
    let info = enumerator.next_file(null);
    while (info !== null) {
      if (info.get_file_type() === Gio.FileType.REGULAR) {
        const name = info.get_name();
        const dt = info.get_modification_date_time();
        const mtime = dt ? dt.to_unix() : 0;
        entries.push({ path: GLib.build_filenamev([this.root, name]), mtime });
      }
      info = enumerator.next_file(null);
    }
    enumerator.close(null);

    if (entries.length <= keep) return;
    entries.sort((a, b) => b.mtime - a.mtime);
    for (const entry of entries.slice(keep)) {
      try {
        Gio.File.new_for_path(entry.path).delete(null);
      } catch (e) {
        this.log.warn(`failed to delete ${entry.path}: ${e}`);
      }
    }
    this.log.info(`pruned cache to ${keep} files (was ${entries.length})`);
  }
}

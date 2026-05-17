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

  /** List absolute paths of all regular files in the cache. */
  listFiles(): string[] {
    const dir = Gio.File.new_for_path(this.root);
    let enumerator: Gio.FileEnumerator;
    try {
      enumerator = dir.enumerate_children(
        'standard::name,standard::type',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        null,
      );
    } catch {
      return [];
    }
    const out: string[] = [];
    let info = enumerator.next_file(null);
    while (info !== null) {
      if (info.get_file_type() === Gio.FileType.REGULAR) {
        out.push(GLib.build_filenamev([this.root, info.get_name()]));
      }
      info = enumerator.next_file(null);
    }
    enumerator.close(null);
    return out;
  }

  /** Keep cache below `maxBytes` total size, evicting oldest files first. */
  prune(maxBytes: number): void {
    if (maxBytes < 1) return;
    const dir = Gio.File.new_for_path(this.root);
    let enumerator: Gio.FileEnumerator;
    try {
      enumerator = dir.enumerate_children(
        'standard::name,standard::type,standard::size,time::modified',
        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
        null,
      );
    } catch (e) {
      this.log.warn(`cannot enumerate ${this.root}: ${e}`);
      return;
    }

    const entries: { path: string; mtime: number; size: number }[] = [];
    let info = enumerator.next_file(null);
    while (info !== null) {
      if (info.get_file_type() === Gio.FileType.REGULAR) {
        const name = info.get_name();
        const dt = info.get_modification_date_time();
        const mtime = dt ? dt.to_unix() : 0;
        const size = info.get_size();
        entries.push({ path: GLib.build_filenamev([this.root, name]), mtime, size });
      }
      info = enumerator.next_file(null);
    }
    enumerator.close(null);

    // Newest first; keep adding until budget exceeded, then mark the rest for deletion.
    entries.sort((a, b) => b.mtime - a.mtime);
    let running = 0;
    const toDelete: typeof entries = [];
    for (const e of entries) {
      if (running + e.size <= maxBytes) {
        running += e.size;
      } else {
        toDelete.push(e);
      }
    }
    if (toDelete.length === 0) return;

    let freed = 0;
    for (const e of toDelete) {
      try {
        Gio.File.new_for_path(e.path).delete(null);
        freed += e.size;
      } catch (err) {
        this.log.warn(`failed to delete ${e.path}: ${err}`);
      }
    }
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    this.log.info(
      `pruned ${toDelete.length} files (${mb(freed)} MB freed), keeping cache under ${mb(maxBytes)} MB`,
    );
  }
}

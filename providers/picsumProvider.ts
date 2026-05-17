import GLib from 'gi://GLib';

import type { CacheDir } from '../lib/cache.js';
import type { HttpClient } from '../lib/http.js';
import { Logger } from '../lib/log.js';
import type { TypedSettings } from '../lib/settings.js';
import type { SourceType } from '../types.js';
import type { WallpaperProvider, WallpaperRequest, WallpaperResult } from './provider.js';

export class PicsumProvider implements WallpaperProvider {
  readonly id: SourceType = 'picsum';
  private readonly log = new Logger('picsum');

  constructor(
    private readonly settings: TypedSettings,
    private readonly http: HttpClient,
    private readonly cache: CacheDir,
  ) {}

  async getNext(req: WallpaperRequest): Promise<WallpaperResult> {
    const w = this.settings.picsumWidth || 1920;
    const h = this.settings.picsumHeight || 1080;
    // Use /seed/{seed}/ to bust both Picsum's own randomness and our by-name cache.
    const seed = GLib.uuid_string_random();
    const url = `https://picsum.photos/seed/${seed}/${w}/${h}.jpg`;
    const file = this.cache.fileFor(`picsum-${seed}.jpg`);
    const path = file.get_path();
    if (!path) throw new Error('cache file has no path');

    await this.http.download(url, file, req.cancellable);
    this.log.info(`downloaded ${url} -> ${path}`);
    return { localPath: path, attribution: { sourceUrl: 'https://picsum.photos' } };
  }

  dispose(): void {}
}

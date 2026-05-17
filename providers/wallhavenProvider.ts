import type { CacheDir } from '../lib/cache.js';
import type { HttpClient } from '../lib/http.js';
import { Logger } from '../lib/log.js';
import type { TypedSettings } from '../lib/settings.js';
import type { SourceType } from '../types.js';
import type { WallpaperProvider, WallpaperRequest, WallpaperResult } from './provider.js';

interface WallhavenSearchResponse {
  data: Array<{
    id: string;
    path: string;
    file_type?: string;
  }>;
}

export class WallhavenProvider implements WallpaperProvider {
  readonly id: SourceType = 'wallhaven';
  private readonly log = new Logger('wallhaven');

  constructor(
    private readonly settings: TypedSettings,
    private readonly http: HttpClient,
    private readonly cache: CacheDir,
  ) {}

  async getNext(req: WallpaperRequest): Promise<WallpaperResult> {
    const categories = encodeURIComponent(this.settings.wallhavenCategories || '111');
    const purity = encodeURIComponent(this.settings.wallhavenPurity || '100');
    const searchUrl = `https://wallhaven.cc/api/v1/search?sorting=random&categories=${categories}&purity=${purity}`;

    const data = await this.http.getJson<WallhavenSearchResponse>(searchUrl, req.cancellable);
    if (!data.data || data.data.length === 0) {
      throw new Error('wallhaven returned no images');
    }
    const item = data.data[0]!;
    const ext = this.extensionFor(item.path, item.file_type);
    const file = this.cache.fileFor(`wh-${item.id}.${ext}`);
    const path = file.get_path();
    if (!path) throw new Error('cache file has no path');

    if (!file.query_exists(null)) {
      await this.http.download(item.path, file, req.cancellable);
      this.log.info(`downloaded ${item.id} -> ${path}`);
    } else {
      this.log.info(`reused cached ${path}`);
    }
    return {
      localPath: path,
      attribution: { sourceUrl: `https://wallhaven.cc/w/${item.id}` },
    };
  }

  dispose(): void {}

  private extensionFor(url: string, mime?: string): string {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg') return 'jpg';
    const dot = url.lastIndexOf('.');
    if (dot >= 0) {
      const ext = url.slice(dot + 1).toLowerCase();
      if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return ext;
    }
    return 'jpg';
  }
}

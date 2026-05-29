import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { CacheDir } from '../lib/cache.js';
import type { HttpClient } from '../lib/http.js';
import { Logger } from '../lib/log.js';
import type { TypedSettings } from '../lib/settings.js';
import type { SourceType } from '../types.js';
import type { WallpaperProvider, WallpaperRequest, WallpaperResult } from './provider.js';

const BING_BASE = 'https://www.bing.com';

interface BingImage {
  startdate: string;
  url: string;
  urlbase: string;
  copyright?: string;
  copyrightlink?: string;
  title?: string;
}

interface BingArchiveResponse {
  images: BingImage[];
}

export class BingProvider implements WallpaperProvider {
  readonly id: SourceType = 'bing';
  private readonly log = new Logger('bing');

  constructor(
    private readonly settings: TypedSettings,
    private readonly http: HttpClient,
    private readonly cache: CacheDir,
  ) {}

  async getNext(req: WallpaperRequest): Promise<WallpaperResult> {
    const market = this.settings.bingMarket || 'en-US';
    const feedUrl =
      `${BING_BASE}/HPImageArchive.aspx` +
      `?format=js&idx=0&n=1&mkt=${encodeURIComponent(market)}`;
    const data = await this.http.getJson<BingArchiveResponse>(feedUrl, req.cancellable);
    if (!data.images || data.images.length === 0) {
      throw new Error(_('Bing returned no images'));
    }
    const entry = data.images[0]!;
    const fullUrl = `${BING_BASE}${entry.url}`;
    const id = this.deriveId(entry.urlbase || entry.url);
    const ext = this.extFor(entry.url);
    const file = this.cache.fileFor(`bing-${id}.${ext}`);
    const path = file.get_path();
    if (!path) throw new Error(_('Cache file has no path'));

    if (!file.query_exists(null)) {
      await this.http.download(fullUrl, file, req.cancellable);
      this.log.info(`downloaded ${fullUrl} -> ${path}`);
    } else {
      this.log.info(`reused cached ${path}`);
    }
    return {
      localPath: path,
      attribution: {
        author: entry.copyright,
        sourceUrl: entry.copyrightlink,
      },
    };
  }

  dispose(): void {}

  /** Extract a stable ID from `?id=OHR.XYZ_ROW123` style query strings. */
  private deriveId(raw: string): string {
    const match = raw.match(/id=([^&]+)/);
    const candidate = match ? match[1]! : raw;
    return candidate.replace(/[^A-Za-z0-9_-]/g, '_');
  }

  /** Pull image extension out of Bing's URL (e.g. `..._1920x1080.jpg&...`). */
  private extFor(url: string): string {
    const match = url.match(/\.([A-Za-z]+)(?:[?&]|$)/);
    if (match) {
      const ext = match[1]!.toLowerCase();
      if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return ext;
    }
    return 'jpg';
  }
}

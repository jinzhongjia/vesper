import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { CacheDir } from '../lib/cache.js';
import type { HttpClient } from '../lib/http.js';
import { Logger } from '../lib/log.js';
import type { TypedSettings } from '../lib/settings.js';
import type { SourceType } from '../types.js';
import type { WallpaperProvider, WallpaperRequest, WallpaperResult } from './provider.js';

const APOD_BASE = 'https://api.nasa.gov/planetary/apod';
const MAX_VIDEO_RETRIES = 3;

interface ApodEntry {
  date: string;            // YYYY-MM-DD
  title?: string;
  explanation?: string;
  media_type: 'image' | 'video' | string;
  url?: string;            // standard-res
  hdurl?: string;          // hi-res, only present for image media_type
  copyright?: string;
}

export class NasaProvider implements WallpaperProvider {
  readonly id: SourceType = 'nasa';
  private readonly log = new Logger('nasa');

  constructor(
    private readonly settings: TypedSettings,
    private readonly http: HttpClient,
    private readonly cache: CacheDir,
  ) {}

  async getNext(req: WallpaperRequest): Promise<WallpaperResult> {
    const apiKey = (this.settings.nasaApiKey || 'DEMO_KEY').trim();
    const feedUrl = `${APOD_BASE}?api_key=${encodeURIComponent(apiKey)}&count=1`;

    let entry: ApodEntry | null = null;
    for (let attempt = 0; attempt < MAX_VIDEO_RETRIES && !entry; attempt++) {
      const data = await this.http.getJson<ApodEntry[]>(feedUrl, req.cancellable);
      const candidate = Array.isArray(data) && data.length > 0 ? data[0]! : null;
      if (!candidate) break;
      if (candidate.media_type === 'image' && (candidate.hdurl || candidate.url)) {
        entry = candidate;
      } else {
        this.log.info(`got media_type=${candidate.media_type} on attempt ${attempt + 1}, retrying`);
      }
    }
    if (!entry) {
      throw new Error(_('NASA returned no image (got videos only)'));
    }

    const imageUrl = entry.hdurl ?? entry.url!;
    const safeDate = entry.date.replace(/[^0-9-]/g, '');
    const ext = this.extFor(imageUrl);
    const file = this.cache.fileFor(`nasa-${safeDate}.${ext}`);
    const path = file.get_path();
    if (!path) throw new Error(_('Cache file has no path'));

    if (!file.query_exists(null)) {
      await this.http.download(imageUrl, file, req.cancellable);
      this.log.info(`downloaded ${imageUrl} -> ${path}`);
    } else {
      this.log.info(`reused cached ${path}`);
    }
    return {
      localPath: path,
      attribution: {
        author: entry.copyright ?? entry.title,
        sourceUrl: `https://apod.nasa.gov/apod/ap${entry.date.replace(/-/g, '').slice(2)}.html`,
      },
    };
  }

  dispose(): void {}

  private extFor(url: string): string {
    const last = url.split('?')[0]!;
    const dot = last.lastIndexOf('.');
    if (dot >= 0) {
      const ext = last.slice(dot + 1).toLowerCase();
      if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return ext;
    }
    return 'jpg';
  }
}

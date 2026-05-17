import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { CacheDir } from '../lib/cache.js';
import type { HttpClient } from '../lib/http.js';
import { Logger } from '../lib/log.js';
import type { TypedSettings } from '../lib/settings.js';
import type { SourceType } from '../types.js';
import type { WallpaperProvider, WallpaperRequest, WallpaperResult } from './provider.js';

interface PeapixEntry {
  title?: string;
  copyright?: string;
  fullUrl: string;
  pageUrl?: string;
}

export class PeapixProvider implements WallpaperProvider {
  readonly id: SourceType = 'peapix';
  private readonly log = new Logger('peapix');

  constructor(
    private readonly settings: TypedSettings,
    private readonly http: HttpClient,
    private readonly cache: CacheDir,
  ) {}

  async getNext(req: WallpaperRequest): Promise<WallpaperResult> {
    const country = this.settings.peapixCountry || 'us';
    const feedUrl = `https://peapix.com/bing/feed?country=${encodeURIComponent(country)}&n=1`;
    const items = await this.http.getJson<PeapixEntry[]>(feedUrl, req.cancellable);
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(_('Peapix returned no entries'));
    }
    const entry = items[0]!;
    const url = entry.fullUrl;
    const id = this.deriveId(url);
    const ext = this.extFor(url);
    const file = this.cache.fileFor(`peapix-${id}.${ext}`);
    const path = file.get_path();
    if (!path) throw new Error(_('Cache file has no path'));

    if (!file.query_exists(null)) {
      await this.http.download(url, file, req.cancellable);
      this.log.info(`downloaded ${url} -> ${path}`);
    } else {
      this.log.info(`reused cached ${path}`);
    }
    return {
      localPath: path,
      attribution: {
        author: entry.copyright,
        sourceUrl: entry.pageUrl,
      },
    };
  }

  dispose(): void {}

  private deriveId(url: string): string {
    const last = url.split('/').pop() ?? url;
    const noQuery = last.split('?')[0] ?? last;
    const dot = noQuery.lastIndexOf('.');
    return (dot >= 0 ? noQuery.slice(0, dot) : noQuery).replace(/[^A-Za-z0-9_-]/g, '_');
  }

  private extFor(url: string): string {
    const last = url.split('?')[0] ?? url;
    const dot = last.lastIndexOf('.');
    if (dot >= 0) {
      const ext = last.slice(dot + 1).toLowerCase();
      if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return ext;
    }
    return 'jpg';
  }
}

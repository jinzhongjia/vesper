import type { CacheDir } from '../lib/cache.js';
import type { HttpClient } from '../lib/http.js';
import type { TypedSettings } from '../lib/settings.js';
import type { SourceType } from '../types.js';
import { BingProvider } from './bingProvider.js';
import { LocalProvider } from './localProvider.js';
import { NasaProvider } from './nasaProvider.js';
import { PicsumProvider } from './picsumProvider.js';
import type { WallpaperProvider } from './provider.js';
import { WallhavenProvider } from './wallhavenProvider.js';

export function createProvider(
  source: SourceType,
  settings: TypedSettings,
  http: HttpClient,
  cache: CacheDir,
): WallpaperProvider {
  switch (source) {
    case 'local':
      return new LocalProvider(settings);
    case 'wallhaven':
      return new WallhavenProvider(settings, http, cache);
    case 'bing':
      return new BingProvider(settings, http, cache);
    case 'picsum':
      return new PicsumProvider(settings, http, cache);
    case 'nasa':
      return new NasaProvider(settings, http, cache);
  }
}

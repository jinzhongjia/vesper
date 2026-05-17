import type Gio from 'gi://Gio';
import type { ColorVariant, SourceType } from '../types.js';

export interface WallpaperRequest {
  variant: ColorVariant;
  cancellable: Gio.Cancellable;
}

export interface WallpaperResult {
  /** Absolute local path; caller is responsible for the file:// prefix. */
  localPath: string;
  attribution?: { author?: string; sourceUrl?: string };
}

export interface WallpaperProvider {
  readonly id: SourceType;
  getNext(req: WallpaperRequest): Promise<WallpaperResult>;
  dispose(): void;
}

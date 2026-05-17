import type Gio from 'gi://Gio';
import type { ColorVariant, SourceType, SwitchMode } from '../types.js';

export class TypedSettings {
  constructor(public readonly raw: Gio.Settings) {}

  get active(): boolean {
    return this.raw.get_boolean('active');
  }

  set active(v: boolean) {
    this.raw.set_boolean('active', v);
  }

  get showIndicator(): boolean {
    return this.raw.get_boolean('show-indicator');
  }

  get sourceType(): SourceType {
    return this.raw.get_string('source-type') as SourceType;
  }

  get localFolder(): string {
    return this.raw.get_string('local-folder');
  }

  get localFolderDark(): string {
    return this.raw.get_string('local-folder-dark');
  }

  get intervalMinutes(): number {
    return this.raw.get_int('interval-minutes');
  }

  get switchMode(): SwitchMode {
    return this.raw.get_string('switch-mode') as SwitchMode;
  }

  get followColorScheme(): boolean {
    return this.raw.get_boolean('follow-color-scheme');
  }

  get wallhavenCategories(): string {
    return this.raw.get_string('wallhaven-categories');
  }

  get wallhavenPurity(): string {
    return this.raw.get_string('wallhaven-purity');
  }

  get wallhavenApiKey(): string {
    return this.raw.get_string('wallhaven-api-key');
  }

  get peapixCountry(): string {
    return this.raw.get_string('peapix-country');
  }

  get picsumWidth(): number {
    return this.raw.get_int('picsum-width');
  }

  get picsumHeight(): number {
    return this.raw.get_int('picsum-height');
  }

  get cacheMaxBytes(): number {
    return this.raw.get_int('cache-max-mb') * 1024 * 1024;
  }

  get originalUri(): string {
    return this.raw.get_string('original-uri');
  }

  set originalUri(v: string) {
    this.raw.set_string('original-uri', v);
  }

  get originalUriDark(): string {
    return this.raw.get_string('original-uri-dark');
  }

  set originalUriDark(v: string) {
    this.raw.set_string('original-uri-dark', v);
  }

  getLastAppliedUri(variant: ColorVariant): string {
    return this.raw.get_string(this.lastAppliedKey(variant));
  }

  setLastAppliedUri(variant: ColorVariant, uri: string): void {
    this.raw.set_string(this.lastAppliedKey(variant), uri);
  }

  private lastAppliedKey(variant: ColorVariant): string {
    return variant === 'dark' ? 'last-applied-uri-dark' : 'last-applied-uri-light';
  }
}

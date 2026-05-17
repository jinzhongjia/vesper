import type GLib from 'gi://GLib';
import type Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Logger } from './log.js';
import { soupGetBytes, writeBytes } from './promisify.js';

const decoder = new TextDecoder('utf-8');

export class HttpClient {
  private readonly session: Soup.Session;
  private readonly log = new Logger('http');

  constructor() {
    this.session = new Soup.Session({
      timeout: 30,
      user_agent: 'Vesper/0.1 (+https://github.com/jinzhongjia/vesper)',
    });
  }

  async getJson<T>(url: string, cancellable: Gio.Cancellable | null = null): Promise<T> {
    const bytes = await this.fetch(url, cancellable);
    const text = decoder.decode(bytes.toArray());
    return JSON.parse(text) as T;
  }

  async download(
    url: string,
    file: Gio.File,
    cancellable: Gio.Cancellable | null = null,
  ): Promise<void> {
    const bytes = await this.fetch(url, cancellable);
    await writeBytes(file, bytes, cancellable);
  }

  dispose(): void {
    this.session.abort();
  }

  private async fetch(url: string, cancellable: Gio.Cancellable | null): Promise<GLib.Bytes> {
    const message = Soup.Message.new('GET', url);
    if (!message) throw new Error(_('Malformed URL: %s').format(url));
    const bytes = await soupGetBytes(this.session, message, cancellable);
    const status = message.get_status();
    if (status !== Soup.Status.OK) {
      throw new Error(_('HTTP %d from %s').format(status, url));
    }
    this.log.info(`fetched ${url} (${bytes.get_size()} bytes)`);
    return bytes;
  }
}

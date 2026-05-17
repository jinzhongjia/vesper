import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { resetLogSink, setLogSink } from './lib/log.js';
import { WallpaperManager } from './wallpaperManager.js';

export default class VesperExtension extends Extension {
  private manager: WallpaperManager | null = null;

  enable(): void {
    setLogSink(this.getLogger());
    this.manager = new WallpaperManager(this);
    this.manager.start();
  }

  disable(): void {
    this.manager?.dispose();
    this.manager = null;
    resetLogSink();
  }
}

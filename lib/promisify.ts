import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

export function soupGetBytes(
  session: Soup.Session,
  message: Soup.Message,
  cancellable: Gio.Cancellable | null = null,
): Promise<GLib.Bytes> {
  return new Promise((resolve, reject) => {
    session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (_src, res) => {
      try {
        resolve(session.send_and_read_finish(res));
      } catch (e) {
        reject(e);
      }
    });
  });
}

export function writeBytes(
  file: Gio.File,
  bytes: GLib.Bytes,
  cancellable: Gio.Cancellable | null = null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    file.replace_contents_bytes_async(
      bytes,
      null,
      false,
      Gio.FileCreateFlags.REPLACE_DESTINATION,
      cancellable,
      (_src, res) => {
        try {
          file.replace_contents_finish(res);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

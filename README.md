# Vesper

A GNOME 50 wallpaper rotator written in TypeScript. Pulls from a local folder
or remote APIs on a timer, with optional separate light/dark variants. No API
keys required for normal use; an optional Wallhaven key unlocks NSFW search
results.

## Features

- Time-based rotation (1–1440 minutes)
- Four sources, all anonymous:
  - **Local folder** — your own image library
  - **Wallhaven** — public random search
  - **Bing** — daily Bing image, regional (official HPImageArchive)
  - **Lorem Picsum** — random photo at any resolution
  - **NASA APOD** — Astronomy Picture of the Day (DEMO_KEY works without registration)
- Per-source preferences (categories, region, resolution, …)
- Light/dark variant support for the local source (two folders, two `picture-uri` keys)
- Panel button: change now, pause/resume, open current, preferences
- Disk cache with configurable retention

## Install (development)

```bash
git clone https://github.com/jinzhongjia/vesper
cd vesper
pnpm install
make link              # build + symlink into ~/.local/share/gnome-shell/extensions
make enable            # gnome-extensions enable vesper@nvimer.org
```

Then reload GNOME Shell:
- **Wayland**: log out and back in, or use `make dev` for a nested test session.
- **X11**: <kbd>Alt</kbd>+<kbd>F2</kbd>, type `r`, press Enter.

## Build / packaging

```bash
make             # compile TS + schemas
make pack        # produce vesper.zip
make install     # gnome-extensions install --force vesper.zip
make clean       # remove dist/, node_modules/, *.zip, gschemas.compiled
```

## Development

```bash
make dev         # nested Wayland Shell (requires mutter-devkit)
make logs        # tail gnome-shell logs from journald
```

The extension uses `Extension.getLogger()`, so logs are tagged with `[vesper:*]`
and appear in `journalctl --user -t gjs` or via the `make logs` shortcut.

## Configuration

All settings are stored under `org.gnome.shell.extensions.vesper`. The preferences
UI exposes every key; `gsettings` works too:

```bash
SCHEMA_DIR=$HOME/.local/share/gnome-shell/extensions/vesper@nvimer.org/schemas
gsettings --schemadir $SCHEMA_DIR set org.gnome.shell.extensions.vesper source-type wallhaven
gsettings --schemadir $SCHEMA_DIR set org.gnome.shell.extensions.vesper interval-minutes 30
```

### Sources

| Source     | Needs key      | Light/dark | Notes |
|------------|----------------|------------|-------|
| Local      | –              | Yes        | Set `local-folder` (and optionally `local-folder-dark`). |
| Wallhaven  | No (NSFW: yes) | No         | Anonymous returns SFW + Sketchy. Optional API key in prefs unlocks NSFW. |
| Bing       | No             | No         | Single daily image per market (en-US, zh-CN, …). Uses Bing's own HPImageArchive endpoint. |
| Picsum     | No             | No         | Random per tick at configured resolution. |
| NASA APOD  | DEMO_KEY ok    | No         | Random historical Astronomy Picture of the Day. Optional key raises rate limit (30/h → 1000/h). Skips entries that are videos. |

Light/dark mode separation is local-only. Remote sources write the same image to
both `picture-uri` and `picture-uri-dark` because they can't guarantee a
dark-toned variant.

## Architecture

```
extension.ts                    # lifecycle
prefs.ts                        # Adw preferences window
wallpaperManager.ts             # controller (timer, signals, panel menu)
providers/
  provider.ts                   # interface
  index.ts                      # factory
  localProvider.ts              # filesystem
  wallhavenProvider.ts          # /api/v1/search?sorting=random
  bingProvider.ts               # HPImageArchive.aspx?format=js
  picsumProvider.ts             # /seed/<uuid>/<w>/<h>.jpg
  nasaProvider.ts               # api.nasa.gov/planetary/apod?count=1
lib/
  http.ts                       # Soup 3 client
  cache.ts                      # disk cache + prune
  settings.ts                   # typed GSettings wrapper
  promisify.ts                  # hand-rolled Promise wrappers (no Gio._promisify)
  log.ts                        # tagged logger over Extension.getLogger()
schemas/
  org.gnome.shell.extensions.vesper.gschema.xml
```

## License

MIT

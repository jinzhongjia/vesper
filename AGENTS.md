# Vesper — Agent Notes

Context for AI agents (Claude Code / others) working on this codebase.

## What this is

A GNOME 50 Shell extension that rotates desktop wallpapers on a schedule.
Written in TypeScript, compiled to ESM JavaScript for GJS. Only targets
GNOME Shell 50 — no backward compatibility.

Sources, all anonymous (no API keys, ever):
- Local folder (with optional separate light/dark folders)
- Wallhaven (`/api/v1/search?sorting=random`)
- Bing daily (`https://www.bing.com/HPImageArchive.aspx?format=js`)
- Lorem Picsum (`/seed/<uuid>/<w>/<h>.jpg`)
- NASA APOD (`api.nasa.gov/planetary/apod?count=1`; `DEMO_KEY` is the default — optional user key raises rate limit 30/h → 1000/h)

## Project layout

```
extension.ts                # lifecycle, wires getLogger() to lib/log
prefs.ts                    # Adw.PreferencesWindow, runs in a separate process
wallpaperManager.ts         # controller: timer, signals, panel menu, dual-mode logic
providers/
  provider.ts               # WallpaperProvider interface
  index.ts                  # createProvider factory
  localProvider.ts          # filesystem; variant-aware folder selection
  wallhavenProvider.ts
  bingProvider.ts
  nasaProvider.ts
  picsumProvider.ts
lib/
  http.ts                   # Soup 3 client
  cache.ts                  # ~/.cache/vesper + prune
  settings.ts               # TypedSettings wrapper around Gio.Settings
  promisify.ts              # Soup/Gio.File Promise wrappers (NOT Gio._promisify)
  log.ts                    # Logger with redirectable sink
schemas/
  org.gnome.shell.extensions.vesper.gschema.xml
po/
  vesper.pot                # template
  zh_CN.po, ja.po, ...      # 10 locales fully translated
```

## Hard rules

- **GNOME 50 only.** `shell-version: ["50"]`. Don't add fallbacks for older Shell APIs.
- **Baseline must work without an API key.** Default operation never requires registration or a key. Optional API keys are allowed *only* to unlock additional features of a source we already support (e.g., the Wallhaven NSFW search results). They must never gate baseline behaviour, and they must not introduce compliance burdens (Unsplash-style "you must call the download endpoint" rules).
- **No multi-workspace per-wallpaper.** GNOME has no native concept; was deliberately cut.
- **Light/dark separation is local-only.** Remote sources cannot guarantee a dark-toned image, so when `follow-color-scheme=true` and source is remote, manager degrades to single mode and logs once.

## TS → GJS gotchas (critical)

1. **Relative imports must end `.js`** — `import x from './foo.js'` even though source is `foo.ts`. GJS resolves the compiled output. Missing `.js` fails at runtime with "module not found", invisible at compile time.
2. **Don't use `Gio._promisify`.** It mutates prototypes and breaks TS types. Instead, hand-roll Promise wrappers calling the typed `_async` + `_finish` pair directly. See `lib/promisify.ts`.
3. **Network must be async; local FS sync is fine.** GNOME Shell is single-threaded — any sync network call freezes the entire desktop. Sync `enumerate_children` on a local folder is fine.
4. **`URLSearchParams` doesn't exist in GJS.** Build query strings manually with `encodeURIComponent`.
5. **`String.prototype.format` does exist.** Use `_('Foo: %s').format(x)` — xgettext can extract the literal, template-literals can't.
6. **`fillPreferencesWindow` is typed `Promise<void>`** in the base class. Mark the override `async` even if its body is sync.

## Icon names

Before using any `icon_name`, verify the SVG exists in `/usr/share/icons/Adwaita/symbolic/`. Many "standard freedesktop" names (`globe-symbolic`, `applications-internet-symbolic`) are absent from Adwaita and render as a broken-image placeholder.

Confirmed-present set we use: `preferences-system-symbolic`, `folder-pictures-symbolic`, `web-browser-symbolic`, `mark-location-symbolic`, `image-x-generic-symbolic`, `preferences-desktop-wallpaper-symbolic`, `edit-clear-symbolic`.

## Build / dev workflow

```bash
make build       # TS → dist/, schemas → gschemas.compiled, po → .mo
make link        # symlink dist/ into ~/.local/share/gnome-shell/extensions/
make enable      # gnome-extensions enable vesper@nvimer.org
make dev         # nested Wayland Shell via mutter-devkit
make pot         # regenerate po/vesper.pot from sources
make update-po   # msgmerge new strings into existing .po
make pack        # vesper.zip for release
make clean       # remove dist, node_modules, locale, gschemas.compiled, zip
```

Schemas need regeneration after editing `*.gschema.xml`. `make build` handles this; from CLI: `glib-compile-schemas schemas`.

**After any schema change you MUST restart GNOME Shell** (Wayland: log out + log back in; X11: `Alt+F2` → `r`). `gnome-extensions disable+enable` is **not enough** — it reloads the JS, but the GLib `GSettingsSchemaSource` is cached at the process level, so a running Shell keeps using the old in-memory schema. Symptom of forgetting: at some point after the rebuild, a code path that reads a newly-added key throws `Settings schema 'org.gnome.shell.extensions.vesper' does not contain a key named '<key>'`. That critical can escape into GJS/GLib and **segfault GNOME Shell**. This crash has happened once during development (5月 17 21:22) — the schema was rebuilt at 21:12 with a new `active` key, the running Shell still had the old schema cached, and a settings access 10 minutes later took down the whole session.

We deliberately do NOT add defensive try/catch around settings access to paper over this — the user-facing release flow ships one matched (code, schema) pair, so this only bites in-development. Just remember to log out + back in.

## Verifying behaviour

- `gnome-extensions info vesper@nvimer.org` only talks to the running Shell; after `make link` the **main session won't see it** until restart. The **nested Shell from `make dev`** does see it after launching.
- Query the nested Shell's state by setting `DBUS_SESSION_BUS_ADDRESS` to the nested session bus:
  ```bash
  NB=$(tr '\0' '\n' < /proc/$(pgrep -f 'gnome-shell --devkit' | tail -1)/environ | grep '^DBUS_SESSION_BUS_ADDRESS=' | cut -d= -f2-)
  DBUS_SESSION_BUS_ADDRESS="$NB" gnome-extensions info vesper@nvimer.org
  ```
- **Logs from the nested Shell go to the `make dev` terminal**, not journald. To capture: `dbus-run-session gnome-shell --devkit --wayland 2>&1 | systemd-cat -t vesper`.
- Inspect GSettings directly: `gsettings --schemadir ~/.local/share/gnome-shell/extensions/vesper@nvimer.org/schemas get org.gnome.shell.extensions.vesper <key>`.

## i18n

- All user-visible strings in `prefs.ts` and `wallpaperManager.ts` are wrapped with `_()`.
- Provider error messages (`localProvider.ts` etc.) are **not** translated — they surface verbatim inside `_('Wallpaper update failed: %s').format(...)`. Translating them requires importing `gettext` in each provider; deferred.
- `gettext-domain` is `vesper` (not the UUID); .mo files at `locale/<lang>/LC_MESSAGES/vesper.mo`.

## Out of scope (don't add unless asked)

- Per-workspace wallpapers
- Sources that *require* an API key for any usable baseline (Unsplash, Pexels, …). Sources where a key only unlocks extras (Wallhaven NSFW) are fine.
- Automatic light/dark image classification for remote sources
- Image brightness analysis
- GNOME Shell <50 compatibility
- **Cross-provider fallback.** When the configured provider fails, the manager picks a random already-downloaded image from `~/.cache/vesper` instead of switching source. Trying e.g. Bing → Wallhaven → Picsum was considered and rejected: it muddles "what source is the user actually using", doubles the API surface to test, and the cache fallback covers the real need (keep rotating during outages).

## Failure handling (network down, API errors)

- **Single-flight tick.** `tickInFlight` guards `tick()`; concurrent calls are coalesced into one `pendingTick` that runs after the current finishes. The recurring timer is one-shot + reschedule, not `SOURCE_CONTINUE`, so settings changes during a tick still get applied promptly.
- **Exponential backoff.** Each consecutive `tick()` failure increments `consecutiveFailures`; next-tick delay is `baseInterval × 2^N`, capped at 1 hour. Resets to base on success.
- **Cache fallback.** On provider failure (and the cancellable isn't cancelled), `pickCachedFallback()` chooses a random file from `~/.cache/vesper` distinct from the currently applied one and applies it. Notification only fires when there's nothing to fall back to. The user's chosen `source-type` is **not** swapped to anything else — `picture-uri` still rotates, the configured provider just stays in retry/backoff.
- **Source change resets backoff.** `changed::source-type` zeros `consecutiveFailures` so the user's manual intervention isn't penalised.

## Development plan

`Vesper 开发方案（TypeScript 实现）.md` has the full design history and decisions. Read it before making architectural changes; many "obvious" alternatives were already considered and rejected.

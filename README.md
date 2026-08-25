# Bardo

Bardo is Liminal's fast, browser-based web proxy. Its interface is a Preact +
TypeScript + Tailwind app, while Scramjet, Sherpa, BareMux, Epoxy, and Wisp provide
the proxy transport and service-worker runtime.

## Features

### Core browsing

- Chrome-style toolbar with back/forward/reload/home, a morphing "gooey"
  address bar, copy-link, fullscreen mode, and a live loading progress bar
- Fully configurable toolbar: drag to reorder, toggle any action/pane/spacer
  on or off, reset to default
- Multi-tab browsing with drag-to-reorder, pinning, middle-click to close, and
  a right-click context menu
- Tab groups — named, colour-coded, collapsible, saveable and reopenable later
- Searchable tab switcher (`Ctrl/⌘+Shift+K`)
- Session restore — open tabs, order, pins, and groups persist across restarts
- Vertical (left/right) or horizontal (top/bottom) tab bar, with a collapsible
  sidebar in vertical modes
- New Tab page: optional clock/greeting, editable quick-links grid, pinned
  bookmarks and saved tab-group shelves, engine status line (optional widgets
  start disabled)
- Bookmarks bar and library: folders, search, pin-to-New-Tab, undo on delete,
  JSON import/export
- Full history page: grouped by day, searchable, per-entry delete, clear-all
  with undo

### Personalization

- 24 built-in themes (12 dark / 12 light, Neutral and Color groups) plus a
  curated Recommended shortlist
- Full custom theme editor — colours, corner radius, density, UI font,
  animation level, glass blur/opacity, live preview, contrast warnings,
  import/export, up to 20 saved themes
- Accent colour picker (presets or a custom colour wheel), New-Tab background
  (none, gradient, or uploaded image), searchable Settings sidebar
- Six optional New-Tab widgets: date, weather (via Open-Meteo), battery,
  to-do list, Pomodoro focus timer, and quick notes

### Privacy & safety

- Per-feature history/tab-restore toggles, session-only mode, clear browsing
  data, and full data reset — private by default, nothing leaves the device
- Disguise tools: tab-identity presets (Canvas, Google Drive, Canva,
  ClassLink, Blooket, Classroom, Docs), an about:blank launcher (with
  auto-launch and popup-blocked fallback), and custom launcher title/favicon
- Panic key — a configurable non-character key that instantly redirects and
  wipes tabs, history, notes, and to-dos

### System

- Four selectable proxy engines: Sherpa (default), Scramjet v1, Klystron
  (server-side), and OpulentAPI (server-side, with headless-render fallback)
- Eruda devtools toggle, force reload / clear cache, restore default settings
- Full keyboard shortcut set (tab switching, navigation, new tab, history,
  close tab, reload, escape-to-close overlays)
- Toast notification system, an app-wide error boundary, storage-quota
  resilience, and self-healing service-worker/engine init with retry and
  backoff
- Lazy-loaded settings, history, widgets, and developer tools
- Cached and compressed proxy runtime assets

## Requirements

- Node.js 18 or newer
- npm

## Run locally

```bash
npm install
npm run build
npm start
```

Bardo listens on `PORT` when set and otherwise uses
`http://localhost:8080`.

Cross-origin isolation is disabled by default so ordinary fonts, favicons, and
third-party page resources are not rejected by COEP. Set
`BARDO_CROSS_ORIGIN_ISOLATION=1` only when the optional synchronous-XHR path
needs `SharedArrayBuffer`.

For interface development, keep the proxy server running with `npm run server`
and run `npm run dev` in a second terminal. Vite serves the UI on port 5173 and
forwards the proxy/runtime paths to port 8080.

## Project structure

```text
.
├── server.ts
├── src/
├── public/
│   ├── ab-launcher.js
│   ├── sw.js
│   ├── sw-sherpa.js
│   ├── shortcuts.json
├── index.html
├── vite.config.ts
└── tsconfig*.json
```

The service workers and early about:blank launcher remain JavaScript deployment
artifacts because browsers execute them directly. Application and server source
is TypeScript. The production server fails fast when `dist/` has not been built.

## Scripts

- `npm run dev` — start the Vite interface server
- `npm run server` — start the TypeScript proxy server
- `npm run typecheck` — check all TypeScript projects
- `npm run build` — typecheck and create the production UI
- `npm start` — run the production server

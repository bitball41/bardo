# Bardo single-file deployment

The end-user artifact is the root-level `Bardo.html`. Opening it renders the
Bardo chrome directly in that local document. There is no launch button,
popup, redirect, `about:blank` page, fetched HTML injection, or iframe around
the Bardo application.

The file loads two stable production URLs:

```text
https://bardo-live.cj-nissim.workers.dev/bardo-app.js
https://bardo-live.cj-nissim.workers.dev/bardo-app.css
```

Vite regenerates those no-cache shims on every build. They point to the current
hashed UI entry and stylesheet, so a previously downloaded `Bardo.html` opens
the newest deployed Bardo without being replaced.

## How the proxy keeps an HTTPS worker origin

Scramjet cannot register a service worker from `file://`. In single-file mode,
the Bardo chrome therefore uses the same remote-controller design as other
single-file browser shells: each ordinary Bardo browsing tab loads
`/embed.html` on the production HTTPS origin. The embed initializes the chosen
Scramjet, Sherpa, or Klystron engine and places the proxied document in its own
full-size frame. Navigation is synchronized to the Bardo address bar using a
source-, origin-, and channel-checked `postMessage` bridge.

This does not frame the Bardo application. Bardo itself runs in the downloaded
file; only web pages opened as Bardo tabs use frames, as they do in the hosted
application.

## Required production routes

| Route | Purpose |
| --- | --- |
| `/bardo-app.js` and `/bardo-app.css` | Stable CORS-enabled current-UI loaders |
| `/embed.html` and its `/assets/<hash>.js` entry | HTTPS proxy controller used by local-file tabs |
| `/bardo.html` and `/assets/<hash>.*` | Stable entrypoint and Vite UI chunks |
| `/api/capabilities` | Enables the three browsing engines |
| `/wisp/` | Same-origin WebSocket transport endpoint |
| `/sw.js` | Scramjet service worker |
| `/sw-sherpa.js` | Sherpa service worker |
| `/sw-klystron.js` | Klystron service worker |
| `/scramjet/scramjet.all.js` | Scramjet controller/worker host bundle |
| `/scramjet/scramjet.sync.js` | Scramjet sync runtime |
| `/scramjet/scramjet.wasm.wasm` | Scramjet WASM runtime |
| `/scramjet/scramjet.runtime.js` | Sherpa client-bundle alias |
| `/scramjet/scramjet.runtime.sync.js` | Sherpa sync-bundle alias |
| `/scramjet/scramjet.runtime.wasm` | Sherpa WASM alias |
| `/scramjet/scramjet.sw.js` | Sherpa host-bundle alias used by its worker |
| `/scramjet/service/*` | Shared Scramjet/Sherpa proxied-document scope |
| `/sherpa/sherpa.all.js` | Sherpa controller host bundle |
| `/sherpa/sherpa.client.js` | Sherpa injected page runtime |
| `/sherpa/sherpa.sync.js` | Sherpa sync runtime |
| `/sherpa/sherpa.wasm.wasm` | Sherpa WASM runtime/preload |
| `/baremux/index.js` | BareMux page API |
| `/baremux/worker.js` | BareMux worker |
| `/epoxy/index.mjs` | Epoxy fallback transport |
| `/libcurl/index.mjs` | Bardo libcurl recovery wrapper |
| `/libcurl/libcurl-pool.mjs` | Wisp failover/session pool |
| `/libcurl/upstream.mjs` | Upstream libcurl transport |
| `/klystron/*` | Server-side HTTP and WebSocket proxy |
| `/ab-launcher.js` | Bardo's in-app about:blank mode |
| `/shortcuts.json`, `/manifest.json`, icons | New-tab, PWA, and branding assets |

The stable loaders, capability response, shortcuts, and hashed module graph are
served with `Access-Control-Allow-Origin: *` where the local document must read
them. Fixed proxy runtime routes remain same-origin to `/embed.html` and are
served from installed, lockfile-pinned packages or the repository.

## Why Supabase Storage is not the application host

The public object URL is useful for ordinary downloadable assets, but it is not
a complete Bardo origin. The Storage response applies an HTML sandbox CSP, does
not expose the required same-origin server/WebSocket routes, and cannot attach
Bardo's `Service-Worker-Allowed: /` behavior. Uploading only `bardo.html` there
would therefore produce a UI that cannot start its proxy engines.

Keep the complete Node deployment behind the current HTTPS hostname. The
downloadable `Bardo.html` may itself be distributed from Supabase because users
run it locally; it imports the current UI and routes proxy tabs to the complete
deployment.

## Verification

After building and starting the server, run:

```bash
npm run verify:deployment -- http://127.0.0.1:8080
```

For production, replace the URL with the production origin. The check validates
the stable UI loaders, embed entrypoint, CORS headers, backend capability
response, service-worker headers, runtime JavaScript, WASM MIME types,
transport modules, and static assets.

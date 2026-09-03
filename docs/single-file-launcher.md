# Bardo single-file launcher deployment

The end-user artifact is the root-level `Bardo.html`. It contains no bundled
application code or dependencies. As soon as it loads, it opens an `about:blank`
window and creates one full-viewport, unsandboxed iframe whose source is:

```text
https://bardo-live.cj-nissim.workers.dev/bardo.html
```

The Vite production build copies its generated `index.html` to
`dist/bardo.html`. All Bardo runtime URLs remain root-relative, so the UI,
workers, storage, and proxy frames retain the production HTTPS origin.

Browsers may reject an automatic popup when opening a local file does not carry
user activation. In that case the launcher automatically replaces its own tab
with the same production entrypoint; there is no launch button.

## Required production routes

| Route | Purpose |
| --- | --- |
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

The fixed runtime routes are served from installed, lockfile-pinned packages or
the repository. Vite-generated chunks use hashed filenames and are referenced
by the generated HTML/module graph.

## Why Supabase Storage is not the application host

The public object URL is useful for ordinary downloadable assets, but it is not
a complete Bardo origin. The Storage response applies an HTML sandbox CSP, does
not expose the required same-origin server/WebSocket routes, and cannot attach
Bardo's `Service-Worker-Allowed: /` behavior. Uploading only `bardo.html` there
would therefore produce a UI that cannot start its proxy engines.

Keep the complete Node deployment behind the current HTTPS hostname. The
downloadable launcher may itself be distributed from Supabase because users run
it locally; it always frames the current application deployment.

## Verification

After building and starting the server, run:

```bash
npm run verify:deployment -- http://127.0.0.1:8080
```

For production, replace the URL with the production origin. The check validates
the stable entrypoint, backend capability response, service-worker headers,
runtime JavaScript, WASM MIME types, transport modules, and static assets.

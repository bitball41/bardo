# Sherpa vs Scramjet

Short comparison for Bardo’s two client-side engines.

## What’s the same

- Same architecture: service worker intercepts navigations/fetches, rewrites HTML/CSS/JS so the page thinks it’s on the real origin, tunnels traffic over Wisp/bare-mux.
- Same WASM JS rewriter lineage (oxc-based) for scripts.
- Same controller + frame model in Bardo (`encodeUrl` → iframe under a service prefix).
- Same job: site compatibility through rewriting, not “stealth.”

## What’s different

| | **Scramjet v1** (`@mercuryworkshop/scramjet`) | **Sherpa** (Bardo’s fork of Scramjet 1.x) |
|---|---|---|
| Ownership | Upstream Mercury Workshop package | Owned fork (`bitball41/sherpa`) |
| Compat fixes | Baseline 1.x | Many (srcset, cookies, SW scope, CSS `url()`, selectors, streaming docs, …) |
| Perf | Baseline | Faster rewriters + response cache + streamed document TTFB (see Sherpa `bench/`) |
| Customization | Limited | Error-page theming, flags, codecs, file paths |
| Page-facing names | `$scramjet$*`, `scramjet-attr-*` | Same vocabulary on purpose (see below) |
| Paths in Bardo | `/scramjet/service/` | `/runtime/service/` + `/runtime/{all,sync,wasm}.*` |

## Why Scramjet “fixed” blocked Games pages

School/AI filters that scan the **proxied document** were hitting dense `sherpa` / `bitball41` strings Sherpa used to inject (`$sherpa$wrap`, `sherpa-attr-*`, `/sherpa/service/`, boot config with the GitHub repo URL). Scramjet injects the same *pattern* under the common `scramjet` name, so those filters mostly ignored it.

Sherpa’s page surface now uses Scramjet-compatible wrap/shadow/query names, and Bardo serves the engine under neutral `/runtime/` URLs. The public API stays Sherpa (`$sherpaLoadController`, etc.).

## How rewriting works (both)

1. Browser requests `https://yoursite/runtime/service/<encoded-url>`.
2. Service worker decodes the target, fetches it through the transport.
3. Response body is rewritten:
   - **HTML** — URL attrs, inline scripts/styles, boot scripts injected early
   - **CSS** — `url()` / `@import`
   - **JS** — identifiers like `location` wrapped via `$scramjet$wrap` / property getters
4. Client traps (`innerHTML`, `fetch`, `document.cookie`, …) keep runtime writes going through the same rewriters.

## Which is theoretically faster?

**Sherpa**, on paper and in its own benches vs Scramjet 1.x:

- Rewriters ~1.3–1.8× (more on script-heavy HTML)
- End-to-end page loads ~1.1–1.3× in Chromium benches
- Subresource **response cache** (Scramjet 1.x doesn’t have this)
- **Streamed documents** → document TTFB ≈ unproxied even on large HTML

Cold start and wire size are roughly at parity. Real-world wins show up most on repeat visits and large pages under latency.

Use Scramjet in Bardo when you want the unmodified upstream package; use Sherpa when you want the fork’s compat/perf work with the same page-facing footprint.

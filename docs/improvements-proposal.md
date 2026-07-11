# Bardo — Improvements Proposal

A review of the current codebase (client `src/`, server `server.ts` + `server/`)
turned up a small set of concrete, worthwhile changes. They are grouped by
priority below. Each item lists the affected code, why it matters, and a
suggested fix. Nothing here is a rewrite — most are contained, low-risk edits.

The headline item is **P1: two confirmed SSRF-guard bypasses in the server-side
proxy engines**. For a web proxy, that guard is the security boundary, so those
should go first.

| # | Area | Priority | Effort | Risk if untouched |
|---|------|----------|--------|-------------------|
| 1 | SSRF guard bypasses (server-side engines) | **P1 — security** | M | Proxy can reach loopback, LAN, and cloud metadata |
| 2 | No timeout on upstream fetches | P1 — security/DoS | S | A slow upstream ties up server sockets/memory |
| 3 | Cookie-jar eviction is FIFO, no TTL | P2 — robustness | S | Active sessions evicted early; jars never expire |
| 4 | Double jsdom parse in OpulentAPI | P3 — performance | S | Every HTML page parsed twice on the hot path |
| 5 | `puppeteer` is a hard prod dependency | P3 — DX/footprint | S | ~Chromium download for all installs, incl. client-only users |
| 6 | No automated tests | P4 — hygiene | M | Security-critical code has zero regression coverage |
| 7 | No CI / linter | P4 — hygiene | S | Breakage and drift land silently |

---

## Implemented in this PR

Beyond documenting the findings, this PR applies the security-critical subset
directly to the source:

- **Item 1 (mapped-IPv6 hole + DNS resolve-and-check).** `isBlockedHost` in
  `server/proxy-shared.ts` now decodes IPv4-mapped IPv6 addresses, and a new
  `assertSafeHost` resolves each hostname and rejects if the name — or any
  address it resolves to — is internal. It's wired into every upstream hop
  (`fetchUpstream`) and both engines' WebSocket upgrade paths. The remaining
  DNS-rebinding *socket pinning* (Part 2 below) is left as follow-up.
- **Item 2 (upstream fetch timeout).** A 20 s per-hop `AbortSignal.timeout` on
  the upstream `fetch`.
- **Item 6 (partial — guard tests).** `server/proxy-shared.test.ts` covers the
  guard with 34 cases, including both bypasses, on Node's built-in test runner
  via `npm test` — no new dependency.

Items 3, 4, 5, 7, the rest of 6, and item 1 Part 2 remain proposals below.

---

## P1 · Security

### 1. SSRF guard can be bypassed two ways

**Where:** `server/proxy-shared.ts` → `isBlockedHost()` (lines 16–37), used by
`server/klystron.ts:96`, `server/opulent.ts:141`, and per-redirect-hop in
`fetchUpstream` (`server/proxy-shared.ts:108–109`).

`isBlockedHost` is the only thing standing between the server-side engines
(Klystron, OpulentAPI) and Bardo's own network. It inspects the **literal
hostname string** and never looks at what that host actually resolves to. Two
gaps are confirmed by running the guard against real inputs:

**Bypass A — a hostname that resolves to a private IP (DNS-based SSRF).**
The guard returns `false` for any name that isn't a literal blocked IP:

```
isBlockedHost("internal.mycorp.example")  // => false  (isIP === 0, falls through)
```

Node's `fetch` does its own DNS resolution, so an attacker only needs a domain
whose A record points at `127.0.0.1`, `169.254.169.254` (cloud metadata),
`10.x`, `192.168.x`, etc. The proxy will resolve it and connect. With DNS
rebinding, this defeats even a naive "resolve once up front" check, because the
name can resolve to a public IP for the guard and a private IP for the real
connection.

**Bypass B — IPv4-mapped IPv6 addresses.** The IPv6 branch only handles `::1`,
`::`, `fc/fd` (ULA), and `fe80` (link-local). Mapped v4 addresses sail through:

```
isBlockedHost("[::ffff:127.0.0.1]")        // => false  → loopback
isBlockedHost("[::ffff:a9fe:a9fe]")        // => false  → 169.254.169.254 (metadata)
```

(Both verified: `new URL("http://[::ffff:127.0.0.1]/").hostname` normalizes to
`[::ffff:7f00:1]`, which `isIP` reports as a 6, and none of the current prefix
checks match it.)

**Impact.** Either bypass lets a proxied request reach the loopback interface,
the host's LAN, or the cloud metadata endpoint — the classic path to stealing
instance credentials. This is reachable through the normal proxy URL
(`/klystron/<encoded>` or `/opulent/<encoded>`) with no special access.

**Fix — two parts.**

*Part 1 (cheap, ship immediately): close the mapped-IPv6 hole and share the v4
logic.* Extract an embedded IPv4 from a mapped v6 address and re-run the v4
checks:

```ts
// "7f00:1" -> "127.0.0.1". Node normalizes ::ffff:a.b.c.d to compressed hex
// pairs, so recover the embedded v4 before running the v4 checks. Returns null
// for anything that isn't two clean hex groups so the caller denies rather than
// coercing a NaN into a bogus address.
function hexPairsToIPv4(hex: string): string | null {
  const parts = hex.split(":");
  if (parts.length !== 2 || !/^[0-9a-f]{1,4}$/.test(parts[0]) || !/^[0-9a-f]{1,4}$/.test(parts[1])) {
    return null;
  }
  const high = parseInt(parts[0], 16);
  const low = parseInt(parts[1], 16);
  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join(".");
}

function isBlockedIPv4(host: string): boolean {
  const o = host.split(".").map(Number);
  if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → deny
  if (o[0] === 127 || o[0] === 10 || o[0] === 0) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  if (o[0] === 169 && o[1] === 254) return true;      // link-local / metadata
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "metadata.google.internal") return true;

  if (isIP(host) === 4) return isBlockedIPv4(host);

  if (isIP(host) === 6) {
    if (host === "::1" || host === "::") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // ULA
    if (host.startsWith("fe80")) return true;                        // link-local
    // IPv4-mapped (::ffff:a.b.c.d, possibly compressed to ::ffff:AABB:CCDD)
    const mapped = host.match(/^::ffff:(.+)$/);
    if (mapped) {
      const v4 = mapped[1].includes(".")
        ? mapped[1]
        : hexPairsToIPv4(mapped[1]); // "7f00:1" -> "127.0.0.1"
      if (v4 && isBlockedIPv4(v4)) return true;
    }
    return false;
  }
  return false;
}
```

*Part 2 (the real fix): resolve-and-pin.* Because DNS rebinding defeats any
string- or pre-resolve-only check, resolve the hostname yourself, reject if
**any** returned address is private, and then connect **to the vetted IP** (not
the name) so the address that was checked is the address that's used. Node's
`fetch`/undici supports this via a custom `lookup` on the dispatcher, or drop to
`http.request` with a fixed `host`/`lookup`. This is the only way to fully close
Bypass A. Suggested shape:

```ts
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

async function assertSafeHost(hostname: string) {
  if (isBlockedHost(hostname)) throw new Error(`Blocked host: ${hostname}`);
  if (isIP(hostname) === 0) {
    const records = await lookup(hostname, { all: true });
    for (const { address } of records) {
      if (isBlockedHost(address)) throw new Error(`Blocked host (resolved): ${hostname} -> ${address}`);
    }
  }
}
```

…and pass a pinned-IP `lookup` into the request so the resolved-and-approved
address is the one dialed. Even without full pinning, adding `assertSafeHost`
in front of every hop is a large improvement over today's string check.

**Regression tests** for both bypasses should land with the fix (see item 6).

### 2. No timeout on upstream fetches

**Where:** `server/proxy-shared.ts:115` — `fetch(url, { method, headers, body,
redirect: "manual" })`.

There's no `AbortSignal`, so a slow or deliberately stalling upstream keeps the
request (and its buffered body) alive indefinitely. The headless render path in
OpulentAPI already caps itself at 15 s (`server/opulent.ts:106`); the plain
fetch path has no equivalent. Add a per-hop deadline:

```ts
const res = await fetch(url, {
  method, headers, body, redirect: "manual",
  signal: AbortSignal.timeout(20_000),
});
```

Wrap the `fetchUpstream` call so an abort surfaces as the existing `502` rather
than an unhandled rejection.

---

## P2 · Robustness

### 3. Cookie-jar eviction is FIFO with no TTL

**Where:** `server/klystron.ts:42–70` and the identical block in
`server/opulent.ts:42–70`.

`jars` is capped at `MAX_JARS = 1000`; on overflow it deletes
`jars.keys().next().value` — the **oldest-inserted** entry, regardless of
whether it's actively in use. A long-lived logged-in session can be evicted
while newer idle ones survive, silently logging the user out. Jars also have no
expiry, so they live until pushed out by the cap.

Two small changes make it a proper LRU with TTL:

- **Touch on use:** in `getSessionJar`, on a hit do `jars.delete(id);
  jars.set(id, jar)` so the most-recently-used entry moves to the end (Map
  preserves insertion order, so `keys().next()` then yields the true LRU).
- **TTL:** store `{ jar, lastUsed }` and sweep entries older than, say, 6 h on a
  cheap interval (or lazily during `getSessionJar`).

Since both engines carry a byte-identical copy of this logic, factor it into a
tiny `SessionJarStore` in `proxy-shared.ts` and have both import it — the
comment at the top of `proxy-shared.ts` already states that shared, security-
relevant logic should live in one place.

---

## P3 · Performance & footprint

### 4. OpulentAPI parses each HTML page with jsdom twice

**Where:** `server/opulent.ts:177–185`. `handle` builds a `JSDOM` to run
`looksLikeEmptyShell`, then calls `rewrite()` (`proxy-shared.ts:191`), which
constructs **another** `JSDOM` over the same markup. jsdom parsing is the most
expensive step on the request path, and this doubles it for every HTML response
that goes through OpulentAPI.

Options: (a) have `rewrite()` accept an already-parsed `JSDOM`/`Document` so the
shell check and the rewrite share one parse; or (b) do the shell heuristic on
the raw text (a cheap `scriptCount > 0 && strippedTextLength < threshold`
regex/length check) and let `rewrite` own the single parse.

### 5. `puppeteer` is a hard production dependency

**Where:** `package.json:27` (`"puppeteer": "^25.2.1"` under `dependencies`).

`puppeteer`'s install step downloads a full Chromium build. Yet the render path
is opt-in, server-side-only, and already **lazily imported**
(`server/opulent.ts:100`, `await import("puppeteer")`). Every install — including
anyone who only ever uses the client-side Sherpa/Scramjet engines — pays the
Chromium download.

Move it to `optionalDependencies` (the lazy import already tolerates it being
absent — `renderWithBrowser` can catch the import failure and fall back to
serving the un-rendered shell), or switch to `puppeteer-core` + a
system/`PUPPETEER_SKIP_DOWNLOAD` story and document it. Either way the common
case gets a much smaller, faster install.

---

## P4 · Engineering hygiene

### 6. No automated tests

There are no test files in the repo. The two pieces of code where a silent
regression is most costly — `isBlockedHost` (the SSRF boundary) and `rewrite`
(the URL rewriter that every proxied byte passes through) — are pure,
dependency-light functions that are ideal to unit test. A minimal Vitest suite
would pay for itself immediately; seed it with the P1 bypasses as regression
cases:

```ts
import { describe, it, expect } from "vitest";
import { isBlockedHost } from "../server/proxy-shared";

describe("isBlockedHost", () => {
  for (const h of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.169.254",
                   "localhost", "metadata.google.internal",
                   "[::1]", "[::ffff:127.0.0.1]", "[::ffff:a9fe:a9fe]"]) {
    it(`blocks ${h}`, () => expect(isBlockedHost(new URL(`http://${h}/`).hostname)).toBe(true));
  }
  for (const h of ["example.com", "1.1.1.1", "[2606:4700:4700::1111]"]) {
    it(`allows ${h}`, () => expect(isBlockedHost(new URL(`http://${h}/`).hostname)).toBe(false));
  }
});
```

Follow with rewriter tests (relative/protocol-relative/absolute URL resolution,
`srcset`, `@import`, skip-protocols, `integrity`/`nonce` stripping).

### 7. No CI and no linter/formatter

- **CI:** add a GitHub Actions workflow running `npm run typecheck`,
  `npm run build`, and the new tests on every PR. `tsc` is already strict
  (`strict`, `noUnusedLocals`, `noUnusedParameters`) — CI just enforces it.
- **Lint/format:** there's no ESLint or Prettier config. Adding
  `typescript-eslint` + Prettier keeps style consistent as more contributors
  touch the tree. Low urgency, but cheap and it prevents drift.

---

## Suggested sequencing

1. **Item 1 Part 1 + Item 2** — mapped-IPv6 fix and fetch timeout. Tiny, purely
   additive, closes the easy bypass and the hang. Ship first.
2. **Item 6 (guard tests) + Item 7 (CI)** — lock in the fix and prevent
   regressions before touching more.
3. **Item 1 Part 2** — resolve-and-pin DNS guard. The real SSRF fix; slightly
   more involved, so it goes in with tests and CI already in place.
4. **Items 3, 4, 5** — robustness and footprint cleanups, independent and
   low-risk, any order.

Happy to implement any subset of these — just say which.

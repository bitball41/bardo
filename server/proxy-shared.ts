// Shared primitives for Bardo's server-side proxy engines (Klystron, OpulentAPI).
//
// Security-relevant logic — the SSRF guard and the URL rewriter in particular —
// lives here once so every server-side engine gets the same protections instead
// of each one carrying its own copy that can drift out of sync.

import type { Request, Response } from "express";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { JSDOM } from "jsdom";
import type { CookieJar } from "tough-cookie";

// ---------------------------------------------------------------------------
// SSRF guard — refuse to let a proxy engine reach the box it runs on / the LAN.
// ---------------------------------------------------------------------------

// Recovers the embedded IPv4 from the compressed form of an IPv4-mapped IPv6
// address. `new URL("http://[::ffff:127.0.0.1]/").hostname` normalizes to
// `[::ffff:7f00:1]`, so the mapped tail arrives as hex pairs ("7f00:1"), not
// dotted-decimal. Returns null for anything that isn't two clean hex groups so
// the caller can deny rather than coerce a NaN into a bogus address.
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
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → deny
  if (o[0] === 127 || o[0] === 10 || o[0] === 0) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  if (o[0] === 169 && o[1] === 254) return true; // link-local / cloud metadata
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT
  return false;
}

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "metadata.google.internal") return true;

  if (isIP(host) === 4) return isBlockedIPv4(host);

  if (isIP(host) === 6) {
    if (host === "::1" || host === "::") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique-local
    if (host.startsWith("fe80")) return true; // link-local
    // IPv4-mapped IPv6 (::ffff:a.b.c.d, normalized to ::ffff:AABB:CCDD): pull out
    // the embedded v4 and run it through the v4 rules, else ::ffff:7f00:1 reaches
    // loopback and ::ffff:a9fe:a9fe reaches cloud metadata straight through.
    const mapped = host.match(/^::ffff:(.+)$/);
    if (mapped) {
      const v4 = mapped[1].includes(".") ? mapped[1] : hexPairsToIPv4(mapped[1]);
      if (!v4 || isBlockedIPv4(v4)) return true;
    }
    return false;
  }
  return false;
}

/**
 * Guards against SSRF where a public-looking hostname resolves to an internal
 * address. {@link isBlockedHost} only inspects the literal string, so a domain
 * whose A/AAAA record points at 127.0.0.1, 169.254.169.254, a 10.x host, etc.
 * would otherwise sail through. This resolves the name and rejects if the name
 * itself — or ANY address it resolves to — is blocked. Literal IPs are already
 * fully covered by isBlockedHost and skip the DNS round-trip.
 *
 * This checks at resolution time and does not pin the socket to the vetted
 * address, so a determined attacker running DNS rebinding with a sub-request TTL
 * could still differ between this check and fetch's own resolution. Closing that
 * last gap needs a custom undici dispatcher (a resolve-once-and-pin `lookup`);
 * it's noted as follow-up in docs/improvements-proposal.md.
 */
export async function assertSafeHost(hostname: string): Promise<void> {
  if (isBlockedHost(hostname)) throw new Error(`Blocked host: ${hostname}`);
  if (isIP(hostname) !== 0) return; // already a literal IP — isBlockedHost was authoritative
  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    return; // couldn't resolve — let the actual request surface the DNS failure
  }
  for (const { address } of records) {
    if (isBlockedHost(address)) {
      throw new Error(`Blocked host (resolved): ${hostname} -> ${address}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Outbound request headers.
// ---------------------------------------------------------------------------

export const STRIP_REQUEST_HEADERS = new Set([
  "host", "connection", "content-length", "cookie",
  "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
  "forwarded", "via",
]);

function decodeProxyRef(value: string | undefined, prefix: string): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value, "http://b");
    if (u.pathname.startsWith(prefix)) {
      return decodeURIComponent(u.pathname.slice(prefix.length));
    }
  } catch {
    /* fall through */
  }
  return value;
}

export function buildOutboundHeaders(req: Request, prefix: string): Headers {
  const h = new Headers();
  for (const [k, raw] of Object.entries(req.headers)) {
    if (raw == null) continue;
    const key = k.toLowerCase();
    if (STRIP_REQUEST_HEADERS.has(key)) continue;
    const value = Array.isArray(raw) ? raw.join(", ") : raw;
    if (key === "referer" || key === "origin") {
      // The browser's referer/origin point at our own proxy URL; translate back
      // to the real remote so the target sees a sane value.
      const real = decodeProxyRef(value, prefix);
      if (key === "referer" && real) h.set("referer", real);
      else if (key === "origin" && real) {
        try { h.set("origin", new URL(real).origin); } catch { /* drop */ }
      }
      continue;
    }
    try { h.set(k, value); } catch { /* skip invalid header */ }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Outbound request with manual redirect handling (so cookies follow each hop,
// and every hop is re-checked against the SSRF guard).
// ---------------------------------------------------------------------------

export interface Upstream {
  res: globalThis.Response;
  finalUrl: string;
}

// Per-hop deadline for upstream requests. Without it, a slow or deliberately
// stalling target holds the socket (and the buffered request body) open
// indefinitely.
const UPSTREAM_TIMEOUT_MS = 20_000;

export async function fetchUpstream(
  target: string,
  req: Request,
  jar: CookieJar,
  bodyBuf: Buffer | undefined,
  prefix: string,
): Promise<Upstream> {
  let url = target;
  let method = req.method.toUpperCase();
  const noBody = method === "GET" || method === "HEAD";
  let body: BodyInit | undefined = noBody ? undefined : bodyBuf && bodyBuf.length ? (bodyBuf as BodyInit) : undefined;
  const base = buildOutboundHeaders(req, prefix);

  for (let i = 0; i <= 10; i++) {
    const hop = new URL(url);
    await assertSafeHost(hop.hostname);

    const headers = new Headers(base);
    const cookie = await jar.getCookieString(url);
    if (cookie) headers.set("cookie", cookie);

    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    for (const c of res.headers.getSetCookie?.() ?? []) {
      try { await jar.setCookie(c, url); } catch { /* ignore bad cookie */ }
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        const next = new URL(location, url).toString();
        // 303, and 301/302 on POST, collapse to GET per browser behaviour.
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
        }
        url = next;
        try { await res.arrayBuffer(); } catch { /* drain */ }
        continue;
      }
    }
    return { res, finalUrl: url };
  }
  throw new Error("Too many redirects");
}

// ---------------------------------------------------------------------------
// Response content-type / header handling.
// ---------------------------------------------------------------------------

export const TEXT_MIMES = new Set([
  "application/xhtml+xml", "text/css", "application/javascript", "application/ecmascript",
  "application/x-javascript", "text/javascript", "text/ecmascript", "application/json",
  "application/ld+json", "image/svg+xml", "text/xml", "application/xml",
  "application/rss+xml", "application/atom+xml", "application/x-mpegurl",
  "application/vnd.apple.mpegurl", "application/dash+xml", "text/vtt",
]);

export function isTextual(contentType: string): boolean {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return mime.startsWith("text/") || TEXT_MIMES.has(mime) || mime.endsWith("+json") || mime.endsWith("+xml");
}

// Headers safe to forward verbatim. Intentionally excludes content-length (the
// body length changes after rewriting), x-frame-options & content-security-policy
// (we serve inside an iframe, same-origin), and set-cookie (handled by the jar).
export const COPY_RESPONSE_HEADERS = new Set([
  "cache-control", "expires", "last-modified", "etag", "pragma", "vary",
  "content-language", "content-disposition", "content-range", "accept-ranges",
]);

export function copyResponseHeaders(res: Response, headers: Headers): void {
  for (const [name, value] of headers.entries()) {
    if (value == null || !COPY_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
    try { res.setHeader(name, value); } catch { /* skip */ }
  }
}

// ---------------------------------------------------------------------------
// HTML / CSS / JS URL rewriting (jsdom). Every reference is pinned to the
// absolute remote URL, then wrapped as `${prefix}<encoded>`.
// ---------------------------------------------------------------------------

const SKIP_PROTOCOLS = [
  "data:", "javascript:", "mailto:", "tel:", "about:", "blob:",
  "chrome-extension:", "moz-extension:", "filesystem:", "ws:", "wss:",
];
const URL_ATTRS = new Set([
  "href", "src", "action", "formaction", "poster", "data", "cite",
  "background", "ping", "longdesc", "xlink:href",
]);
const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
const CSS_IMPORT = /@import\s+(['"])(.*?)\1/gi;
const JS_URL = /(['"`])(https?:\/\/[^'"`]+|\/\/[^'"`]+|\/[^'"`\s]+|\.{1,2}\/[^'"`\s]+)\1/g;
const LOOKS_LIKE_URL = /^(https?:)?\/\/|^\//i;

export function rewrite(baseUrl: string, content: string, contentType: string, prefix: string): string {
  const dom = new JSDOM(content, {
    url: baseUrl,
    contentType: contentType.includes("xml") ? "text/xml" : "text/html",
  });
  const { document } = dom.window;

  const resolve = (value: string): string => {
    try { return new URL(value, baseUrl).href; } catch { return value; }
  };
  const shouldSkip = (value: string): boolean => {
    if (!value) return true;
    const v = value.trim().toLowerCase();
    if (v.startsWith("#") || v.startsWith(prefix)) return true;
    return SKIP_PROTOCOLS.some((p) => v.startsWith(p));
  };
  const wrap = (value: string): string =>
    shouldSkip(value) ? value : prefix + encodeURIComponent(resolve(value));

  const fixSrcset = (value: string): string =>
    value
      .split(",")
      .map((part) => {
        const [url, descriptor] = part.trim().split(/\s+/, 2);
        return wrap(url) + (descriptor ? ` ${descriptor}` : "");
      })
      .join(", ");

  const fixCss = (css: string): string =>
    css
      .replace(CSS_URL, (_m, q, url) => `url(${q}${wrap(url)}${q})`)
      .replace(CSS_IMPORT, (_m, q, url) => `@import ${q}${wrap(url)}${q}`);

  const fixJs = (js: string): string => js.replace(JS_URL, (_m, q, url) => `${q}${wrap(url)}${q}`);

  for (const el of document.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (!value) continue;

      if (name === "srcset" || name === "imagesrcset") el.setAttribute(attr.name, fixSrcset(value));
      else if (name === "style") el.setAttribute(attr.name, fixCss(value));
      else if (name.startsWith("on")) el.setAttribute(attr.name, fixJs(value));
      else if (URL_ATTRS.has(name)) el.setAttribute(attr.name, wrap(value));
      else if (name === "integrity" || name === "nonce") el.removeAttribute(attr.name);
    }

    if (el.tagName === "STYLE" && el.textContent) el.textContent = fixCss(el.textContent);
    if (el.tagName === "SCRIPT" && !el.getAttribute("src") && el.textContent) {
      el.textContent = fixJs(el.textContent);
    }
  }

  // Only rewrite meta values that are actually URLs (og:image, canonical, …) so
  // plain-text metas like description aren't mangled.
  for (const meta of document.querySelectorAll("meta[property], meta[name]")) {
    const content = meta.getAttribute("content");
    if (content && LOOKS_LIKE_URL.test(content.trim())) meta.setAttribute("content", wrap(content));
  }

  for (const frame of document.querySelectorAll("iframe[srcdoc]")) {
    const srcdoc = frame.getAttribute("srcdoc");
    if (srcdoc) frame.setAttribute("srcdoc", rewrite(baseUrl, srcdoc, "text/html", prefix));
  }

  return dom.serialize();
}

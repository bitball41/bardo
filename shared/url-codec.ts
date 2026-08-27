/**
 * Opaque path codec for proxied destination URLs.
 *
 * Percent-encoding is not a codec: `/prefix/https%3A%2F%2Fhost%2Fsearch%3Fq%3D...`
 * still contains the dest host and query in trivially reversible form. School
 * classifiers read iframe src, rewritten hrefs, and network paths.
 *
 * This is XOR-with-key then URL-safe base64 (the usual pattern in this
 * ecosystem, stronger than UV's every-other-byte XOR). It is obfuscation for
 * scanners, not encryption. encode/decode are self-contained so Scramjet and
 * Sherpa can stringify them into the service worker via `new Function`.
 */

const HTTP_URL = /^https?:\/\//i;

/** Standalone codec object passed to Scramjet/Sherpa controllers. */
export const pathCodec = {
  encode: (url: string) => {
    if (!url) return url;
    const key = "bardo";
    const bytes = new TextEncoder().encode(url);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i] ^ key.charCodeAt(i % key.length));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  },
  decode: (url: string) => {
    if (!url) return url;
    const key = "bardo";
    let b64 = String(url).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    }
    return new TextDecoder().decode(bytes);
  },
};

export function encodeDest(url: string): string {
  return pathCodec.encode(url);
}

/**
 * Decode a codec payload. Falls back to `decodeURIComponent` so an old
 * percent-encoded path still round-trips after a deploy.
 */
export function decodeDest(encoded: string): string {
  const payload = String(encoded || "")
    .replace(/^\/+/, "")
    .split("#")[0]
    .split("?")[0];
  if (!payload) return payload;
  try {
    const decoded = pathCodec.decode(payload);
    if (HTTP_URL.test(decoded)) return decoded;
  } catch {
    /* try legacy */
  }
  try {
    const legacy = decodeURIComponent(payload);
    if (HTTP_URL.test(legacy)) return legacy;
  } catch {
    /* ignore */
  }
  return payload;
}

export function encodeProxyPath(prefix: string, dest: string): string {
  return prefix + encodeDest(dest);
}

export function decodeProxyPath(prefix: string, href: string): string | null {
  if (!href) return null;
  let path = href;
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
      path = new URL(href, "https://bardo.invalid").pathname;
    }
  } catch {
    return null;
  }
  if (!path.startsWith(prefix)) return null;
  const encoded = path.slice(prefix.length);
  if (!encoded) return null;
  const decoded = decodeDest(encoded);
  return HTTP_URL.test(decoded) ? decoded : null;
}

/** Hostname-only label for parent chrome (tabs, history, aria) so queries never land in the top document. */
export function pageLabel(url: string): string {
  if (!url) return "New Tab";
  try {
    return new URL(url).hostname || "New Tab";
  } catch {
    return "New Tab";
  }
}

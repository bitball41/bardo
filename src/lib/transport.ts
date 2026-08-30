import { PUBLIC_WISP_SERVERS } from "./constants";

/**
 * Client-side Wisp transports for Sherpa/Scramjet.
 *
 * libcurl.js is slower than epoxy but way less buggy — epoxy's rustls
 * ClientHello gets RST by a lot of CDNs as Hyper's `tls handshake eof`.
 * Pin libcurl-transport 1.x (bare-mux generation). 2.x expects iterable
 * header pairs and throws `headers is not iterable` on this stack.
 * Epoxy is only a last-ditch fallback if libcurl fails to load.
 *
 * `/libcurl/index.mjs` is Bardo's wrapper: HTTP/1.1 (so ALPN isn't `h2`,
 * which Cloudflare often RST as curl error 35), Wisp failover on 35/60,
 * then epoxy if mbedtls still hates the cert.
 */

export type TransportId = "libcurl" | "epoxy";

export interface TransportSpec {
  id: TransportId;
  name: string;
  path: string;
  options: (wispUrl: string) => Record<string, unknown>;
}

export const BAREMUX_WORKER = "/baremux/worker.js";

export const TRANSPORTS: TransportSpec[] = [
  {
    id: "libcurl",
    name: "libcurl",
    path: "/libcurl/index.mjs?v=1.5.2-recovery1",
    options: (wisp) => ({
      wisp,
      websocket: wisp,
      connections: [24, 16, 2],
      fallbacks: PUBLIC_WISP_SERVERS.filter((url) => url !== wisp),
    }),
  },
  {
    id: "epoxy",
    name: "epoxy",
    path: "/epoxy/index.mjs",
    options: (wisp) => ({
      wisp,
      // Match wisp-js's typical v1 handshake. Requiring v2/UDP makes epoxy
      // treat the TCP stream as dead and throw tls handshake eof.
      wisp_v2: false,
      udp_extension_required: false,
    }),
  },
];

export function wispUrlCandidates(localWisp: string, publicServers: readonly string[]): string[] {
  return orderedWispUrls(localWisp, true, null, publicServers);
}

/** Local (if it actually spoke Wisp) first, then a known-good public server, then the rest. */
export function orderedWispUrls(
  localWisp: string,
  localReady: boolean,
  publicUrl: string | null,
  publicServers: readonly string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url: string | null | undefined) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  if (localReady) push(localWisp);
  push(publicUrl);
  for (const url of publicServers) push(url);
  return out;
}

export function libcurlErrorCode(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/(?:error|curl)\s*code\s*[:=]?\s*(\d+)/i)
    ?? message.match(/CURLE_[A-Z_]+\s*\(?\s*(\d+)\s*\)?/i);
  return match ? Number(match[1]) : null;
}

export function isRetryableLibcurlError(error: unknown): boolean {
  const code = libcurlErrorCode(error);
  if (code !== null) return [6, 7, 28, 35, 52, 56, 60].includes(code);
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  const lower = message.toLowerCase();
  return (
    lower.includes("couldn't resolve host") ||
    lower.includes("could not resolve host") ||
    lower.includes("failed to connect") ||
    lower.includes("connection refused") ||
    lower.includes("operation timed out") ||
    lower.includes("empty reply") ||
    lower.includes("recv failure") ||
    lower.includes("receive error") ||
    isTlsHandshakeError(error)
  );
}

export function isTlsHandshakeError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  const lower = msg.toLowerCase();
  return (
    lower.includes("tls handshake eof") ||
    lower.includes("tls handshake") ||
    lower.includes("ssl connect error") ||
    lower.includes("ssl peer certificate") ||
    lower.includes("remote key was not ok") ||
    lower.includes("error code 35") ||
    lower.includes("error code 60") ||
    lower.includes("certificate verify failed") ||
    lower.includes("peer certificate cannot be authenticated") ||
    lower.includes("unexpectedeof") ||
    lower.includes("unexpected eof")
  );
}

export function transportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error ?? "unknown error");
}

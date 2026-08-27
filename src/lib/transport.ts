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
 * `/libcurl/index.mjs` is Bardo's wrapper: HTTP/1.1 (so ALPN isn't `h2`),
 * per-request Wisp failover on connect/TLS errors (6/7/28/35/60), then epoxy.
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
    path: "/libcurl/index.mjs?v=1.5.2-e7",
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
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  const match = msg.match(/error code (\d+)/i);
  return match ? Number(match[1]) : null;
}

export function isRetryableLibcurlError(error: unknown): boolean {
  const code = libcurlErrorCode(error);
  if (code === 6 || code === 7 || code === 28 || code === 35 || code === 52 || code === 56 || code === 60) {
    return true;
  }
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  const lower = msg.toLowerCase();
  return (
    lower.includes("could not connect") ||
    lower.includes("couldn't connect") ||
    lower.includes("could not resolve") ||
    lower.includes("couldn't resolve") ||
    lower.includes("ssl connect error") ||
    lower.includes("ssl peer certificate") ||
    lower.includes("remote key was not ok") ||
    lower.includes("tls handshake") ||
    lower.includes("unexpectedeof") ||
    lower.includes("unexpected eof")
  );
}

export function isTlsHandshakeError(error: unknown): boolean {
  const code = libcurlErrorCode(error);
  if (code === 35 || code === 60) return true;
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  const lower = msg.toLowerCase();
  return (
    lower.includes("tls handshake eof") ||
    lower.includes("tls handshake") ||
    lower.includes("ssl connect error") ||
    lower.includes("ssl peer certificate") ||
    lower.includes("remote key was not ok") ||
    lower.includes("unexpectedeof") ||
    lower.includes("unexpected eof")
  );
}

export function transportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error ?? "unknown error");
}

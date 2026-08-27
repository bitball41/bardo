/**
 * Client-side Wisp transports for Sherpa/Scramjet.
 *
 * Epoxy (rustls in WASM) is fast but a lot of CDNs RST its ClientHello, which
 * surfaces as Hyper's `tls handshake eof`. libcurl.js (mbedtls) is the
 * compatible default; epoxy stays as a fallback.
 */

export type TransportId = "libcurl" | "epoxy";

export interface TransportSpec {
  id: TransportId;
  name: string;
  path: string;
  options: (wispUrl: string) => Record<string, unknown>;
}

export const BAREMUX_WORKER = "/baremux/worker.js";

export const TRANSPORT_PROBE_URL = "https://example.com/";

export const TRANSPORTS: TransportSpec[] = [
  {
    id: "libcurl",
    name: "libcurl",
    path: "/libcurl/index.mjs",
    options: (wisp) => ({ wisp }),
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

export function isTlsHandshakeError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  const lower = msg.toLowerCase();
  return (
    lower.includes("tls handshake eof") ||
    lower.includes("tls handshake") ||
    lower.includes("unexpectedeof") ||
    lower.includes("unexpected eof")
  );
}

export function transportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error ?? "unknown error");
}

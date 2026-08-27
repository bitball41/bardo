/**
 * Bardo wrapper around Mercury's libcurl-transport (bare-mux 1.x).
 *
 * libcurl.js defaults to HTTP/2. That puts `h2` in the TLS ALPN list, which
 * a lot of CDNs (Cloudflare in particular) RST as a WASM/mbedtls fingerprint.
 * The result is CURLE_SSL_CONNECT_ERROR (35) — same class of failure as
 * epoxy's `tls handshake eof`, different lipstick.
 *
 * Force HTTP/1.1, and if a handshake still dies, rotate to the next Wisp
 * egress (local → public) and retry the request.
 */
import LibcurlClient from "./upstream.mjs";

function isSslConnectError(error) {
  const msg = String(error instanceof Error ? error.message : error ?? "").toLowerCase();
  return (
    msg.includes("error code 35") ||
    msg.includes("ssl connect error") ||
    msg.includes("tls handshake") ||
    msg.includes("unexpectedeof") ||
    msg.includes("unexpected eof")
  );
}

function uniqueUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    if (typeof url !== "string" || !url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

export default class BardoLibcurlClient extends LibcurlClient {
  constructor(options) {
    super(options);
    this._bardoWisps = uniqueUrls([
      options.wisp || options.websocket,
      ...(Array.isArray(options.fallbacks) ? options.fallbacks : []),
    ]);
    this._bardoWispIndex = 0;
    this._rotateLock = null;
  }

  async init() {
    await super.init();
    this._patchHttp11();
  }

  _patchHttp11() {
    const session = this.session;
    if (!session || session.__bardoHttp11) return;
    session.__bardoHttp11 = true;
    const origFetch = session.fetch.bind(session);
    session.fetch = (resource, params = {}) =>
      origFetch(resource, {
        ...params,
        _libcurl_http_version: params._libcurl_http_version ?? 1.1,
      });
  }

  async _rotateIfStill(startIndex) {
    if (this._rotateLock) await this._rotateLock;
    if (this._bardoWispIndex !== startIndex) return;
    if (this._bardoWispIndex >= this._bardoWisps.length - 1) return;

    this._rotateLock = (async () => {
      const next = this._bardoWisps[this._bardoWispIndex + 1];
      this._bardoWispIndex += 1;
      try {
        this.session?.close();
      } catch {
        /* session may already be dead */
      }
      this.wisp = next;
      console.warn(`[bardo] libcurl SSL connect failed; rotating Wisp to ${next}`);
      await this.init();
    })();

    try {
      await this._rotateLock;
    } finally {
      this._rotateLock = null;
    }
  }

  async request(remote, method, body, headers, signal) {
    let lastError;
    for (let attempt = 0; attempt < this._bardoWisps.length; attempt++) {
      const start = this._bardoWispIndex;
      try {
        return await super.request(remote, method, body, headers, signal);
      } catch (error) {
        lastError = error;
        if (!isSslConnectError(error)) throw error;
        await this._rotateIfStill(start);
        if (this._bardoWispIndex === start) throw error;
      }
    }
    throw lastError;
  }
}

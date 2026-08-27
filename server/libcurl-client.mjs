/**
 * Bardo wrapper around Mercury's libcurl-transport (bare-mux 1.x).
 *
 * libcurl.js defaults to HTTP/2. That puts `h2` in the TLS ALPN list, which
 * a lot of CDNs (Cloudflare in particular) RST as a WASM/mbedtls fingerprint.
 * The result is CURLE_SSL_CONNECT_ERROR (35) — same class of failure as
 * epoxy's `tls handshake eof`, different lipstick.
 *
 * After the handshake succeeds, mbedtls can still reject the peer cert
 * (CURLE_PEER_FAILED_VERIFICATION, 60). That happens when the current Wisp
 * egress sees a different/MITM chain than a browser would, or when mbedtls
 * chokes on Cloudflare's GTS WE1 cross-sign. Rotating egress often fixes it.
 *
 * Force HTTP/1.1, rotate Wisp on 35/60, then last-ditch epoxy on the original
 * Wisp (rustls's CA story is different from mbedtls).
 */
import LibcurlClient from "./upstream.mjs";

function isSslTransportError(error) {
  const msg = String(error instanceof Error ? error.message : error ?? "").toLowerCase();
  return (
    msg.includes("error code 35") ||
    msg.includes("error code 60") ||
    msg.includes("ssl connect error") ||
    msg.includes("ssl peer certificate") ||
    msg.includes("remote key was not ok") ||
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
    this._epoxy = null;
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
      console.warn(`[bardo] libcurl SSL failed; rotating Wisp to ${next}`);
      await this.init();
    })();

    try {
      await this._rotateLock;
    } finally {
      this._rotateLock = null;
    }
  }

  async _epoxyFallback(remote, method, body, headers, signal) {
    if (!this._epoxy) {
      const { default: EpoxyTransport } = await import("/epoxy/index.mjs");
      const wisp = this._bardoWisps[0];
      this._epoxy = new EpoxyTransport({
        wisp,
        wisp_v2: false,
        udp_extension_required: false,
      });
      await this._epoxy.init();
    }
    console.warn("[bardo] libcurl SSL failed on every Wisp; retrying via epoxy");
    return this._epoxy.request(remote, method, body, headers, signal);
  }

  async request(remote, method, body, headers, signal) {
    let lastError;
    for (let attempt = 0; attempt < this._bardoWisps.length; attempt++) {
      const start = this._bardoWispIndex;
      try {
        return await super.request(remote, method, body, headers, signal);
      } catch (error) {
        lastError = error;
        if (!isSslTransportError(error)) throw error;
        await this._rotateIfStill(start);
        if (this._bardoWispIndex === start) break;
      }
    }
    if (lastError && isSslTransportError(lastError)) {
      try {
        return await this._epoxyFallback(remote, method, body, headers, signal);
      } catch {
        throw lastError;
      }
    }
    throw lastError;
  }
}

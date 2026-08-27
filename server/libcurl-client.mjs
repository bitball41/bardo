/**
 * Bardo wrapper around Mercury's libcurl-transport (bare-mux 1.x).
 *
 * libcurl.js defaults to HTTP/2. That puts `h2` in the TLS ALPN list, which
 * a lot of CDNs RST as CURLE_SSL_CONNECT_ERROR (35). After HTTP/1.1, the
 * handshake can succeed and mbedtls still reject the cert (60), or the
 * current Wisp egress can fail TCP entirely (7).
 *
 * Failover is per-request: walk local → public Wisp on 6/7/28/35/60, one
 * extra retry on 7 (websocket often is not up yet after a rotate), then
 * epoxy. A failed public egress must not become the sticky default — that
 * is how #25 turned a cert error into "could not connect to server".
 */
import LibcurlClient from "./upstream.mjs";

function errorMessage(error) {
  return String(error instanceof Error ? error.message : error ?? "").toLowerCase();
}

function libcurlCode(error) {
  const match = errorMessage(error).match(/error code (\d+)/);
  return match ? Number(match[1]) : null;
}

function isRetryableTransportError(error) {
  const code = libcurlCode(error);
  if (code === 6 || code === 7 || code === 28 || code === 35 || code === 52 || code === 56 || code === 60) {
    return true;
  }
  const msg = errorMessage(error);
  return (
    msg.includes("could not connect") ||
    msg.includes("couldn't connect") ||
    msg.includes("could not resolve") ||
    msg.includes("couldn't resolve") ||
    msg.includes("ssl connect error") ||
    msg.includes("ssl peer certificate") ||
    msg.includes("remote key was not ok") ||
    msg.includes("tls handshake") ||
    msg.includes("unexpectedeof") ||
    msg.includes("unexpected eof") ||
    msg.includes("timed out") ||
    msg.includes("timeout")
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

const CONNECT_RETRY_MS = 200;

export default class BardoLibcurlClient extends LibcurlClient {
  constructor(options) {
    super(options);
    this._bardoWisps = uniqueUrls([
      options.wisp || options.websocket,
      ...(Array.isArray(options.fallbacks) ? options.fallbacks : []),
    ]);
    this._bardoWispIndex = 0;
    this._preferredIndex = 0;
    this._switchLock = Promise.resolve();
    this._epoxyByWisp = new Map();
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

  async _switchWisp(index) {
    const run = this._switchLock.then(async () => {
      if (this._bardoWispIndex === index && this.session) return;
      const next = this._bardoWisps[index];
      if (!next) return;
      try {
        this.session?.close();
      } catch {
        /* session may already be dead */
      }
      this.wisp = next;
      this._bardoWispIndex = index;
      console.warn(`[bardo] switching libcurl Wisp to ${next}`);
      await this.init();
    });
    this._switchLock = run.catch(() => {});
    await run;
  }

  async _requestOnce(remote, method, body, headers, signal) {
    try {
      return await super.request(remote, method, body, headers, signal);
    } catch (error) {
      if (libcurlCode(error) !== 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
      return super.request(remote, method, body, headers, signal);
    }
  }

  async _epoxyFallback(remote, method, body, headers, signal) {
    const { default: EpoxyTransport } = await import("/epoxy/index.mjs");
    const urls = uniqueUrls([this.wisp, this._bardoWisps[this._preferredIndex], this._bardoWisps[0]]);
    let lastError;
    for (const wisp of urls) {
      try {
        let epoxy = this._epoxyByWisp.get(wisp);
        if (!epoxy) {
          epoxy = new EpoxyTransport({
            wisp,
            wisp_v2: false,
            udp_extension_required: false,
          });
          await epoxy.init();
          this._epoxyByWisp.set(wisp, epoxy);
        }
        console.warn(`[bardo] libcurl failed every Wisp; retrying via epoxy on ${wisp}`);
        return await epoxy.request(remote, method, body, headers, signal);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async request(remote, method, body, headers, signal) {
    const count = this._bardoWisps.length || 1;
    let lastError;
    for (let step = 0; step < count; step++) {
      const index = (this._preferredIndex + step) % count;
      try {
        await this._switchWisp(index);
        const payload = await this._requestOnce(remote, method, body, headers, signal);
        this._preferredIndex = index;
        return payload;
      } catch (error) {
        lastError = error;
        if (!isRetryableTransportError(error)) throw error;
        console.warn(`[bardo] libcurl ${this._bardoWisps[index]} failed: ${errorMessage(error)}`);
      }
    }
    if (lastError && isRetryableTransportError(lastError)) {
      try {
        return await this._epoxyFallback(remote, method, body, headers, signal);
      } catch {
        throw lastError;
      }
    }
    throw lastError;
  }
}

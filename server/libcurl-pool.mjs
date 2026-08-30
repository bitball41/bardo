/**
 * Libcurl Wisp pool used by `/libcurl/index.mjs`.
 *
 * Kept as its own module so Node tests can drive rotate/replay/epoxy
 * behavior without importing Mercury's WASM transport.
 */
export const RETRYABLE_CODES = new Set([6, 7, 28, 35, 52, 56, 60]);
export const PRE_SEND_CODES = new Set([6, 7, 35, 60]);
export const SAFE_REPLAY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function errorMessage(error) {
  return String(error instanceof Error ? error.message : error ?? "");
}

export function libcurlErrorCode(error) {
  const message = errorMessage(error);
  const match = message.match(/(?:error|curl)\s*code\s*[:=]?\s*(\d+)/i)
    ?? message.match(/CURLE_[A-Z_]+\s*\(?\s*(\d+)\s*\)?/i);
  return match ? Number(match[1]) : null;
}

export function isRetryableTransportError(error) {
  const code = libcurlErrorCode(error);
  if (code !== null) return RETRYABLE_CODES.has(code);

  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("couldn't resolve host") ||
    message.includes("could not resolve host") ||
    message.includes("failed to connect") ||
    message.includes("connection refused") ||
    message.includes("operation timed out") ||
    message.includes("empty reply") ||
    message.includes("recv failure") ||
    message.includes("receive error") ||
    message.includes("ssl connect error") ||
    message.includes("ssl peer certificate") ||
    message.includes("remote key was not ok") ||
    message.includes("tls handshake") ||
    message.includes("unexpectedeof") ||
    message.includes("unexpected eof")
  );
}

export function canReplayRequest(error, method, body) {
  const code = libcurlErrorCode(error);
  if (code !== null && PRE_SEND_CODES.has(code)) return true;
  return body == null && SAFE_REPLAY_METHODS.has(String(method).toUpperCase());
}

export function uniqueUrls(urls) {
  const seen = new Set();
  const result = [];
  for (const url of urls) {
    if (typeof url !== "string" || !url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException("The operation was aborted", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function abortableDelay(ms, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }
    function aborted() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      reject(abortError(signal));
    }
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

function responseFromPayload(payload) {
  const headers = {};
  for (const [key, value] of payload.raw_headers) {
    if (!headers[key]) headers[key] = [value];
    else headers[key].push(value);
  }
  return {
    body: payload.body,
    headers,
    status: payload.status,
    statusText: payload.statusText,
  };
}

export function createBardoLibcurlClient(BaseClient) {
  return class BardoLibcurlClient extends BaseClient {
    constructor(options) {
      super(options);
      this._bardoWisps = uniqueUrls([
        options.wisp ?? options.websocket,
        ...(Array.isArray(options.fallbacks) ? options.fallbacks : []),
      ]);
      this._bardoWispIndex = 0;
      // Only a Wisp that has actually served a successful libcurl request
      // becomes preferred. Index 0 is just the starting candidate.
      this._preferredWispIndex = null;
      this._currentRecord = null;
      this._records = new Set();
      this._rotateLock = null;
      this._epoxyByWisp = new Map();
      this._retryDelayMs = options.retryDelayMs ?? 200;
      this._importEpoxy = options.importEpoxy ?? (() => import("/epoxy/index.mjs"));
    }

    async init() {
      await super.init();
      const record = this._makeRecord(this.session, this._bardoWispIndex);
      const previous = this._currentRecord;
      this._currentRecord = record;
      this.session = record.session;
      if (previous && previous !== record) this._retire(previous);
    }

    _makeRecord(session, index) {
      const record = {
        session,
        index,
        active: 0,
        retired: false,
        closed: false,
      };
      this._records.add(record);
      return record;
    }

    _retire(record) {
      record.retired = true;
      this._closeIfIdle(record);
    }

    _closeIfIdle(record) {
      if (!record.retired || record.active !== 0 || record.closed) return;
      record.closed = true;
      this._records.delete(record);
      try {
        record.session?.close();
      } catch {
        // A failed Wisp may already have torn its session down.
      }
    }

    async _requestWith(record, remote, method, body, headers, signal) {
      throwIfAborted(signal);
      record.active += 1;
      try {
        const payload = await record.session.fetch(remote.href, {
          method,
          headers,
          body,
          redirect: "manual",
          signal,
          // libcurl's HTTP/2 ALPN path is rejected by several common CDNs.
          _libcurl_http_version: 1.1,
        });
        return responseFromPayload(payload);
      } finally {
        record.active -= 1;
        this._closeIfIdle(record);
      }
    }

    async _activateIndex(index) {
      const previous = this._currentRecord;
      this._bardoWispIndex = index;
      this.wisp = this._bardoWisps[index];
      await super.init();
      const next = this._makeRecord(this.session, index);
      this._currentRecord = next;
      this.session = next.session;
      if (previous && previous !== next) this._retire(previous);
      return next;
    }

    async _rotateFrom(record) {
      if (this._bardoWisps.length < 2) return this._currentRecord;
      if (this._rotateLock) await this._rotateLock;
      if (this._currentRecord !== record) return this._currentRecord;

      const nextIndex = (record.index + 1) % this._bardoWisps.length;
      this._rotateLock = this._activateIndex(nextIndex);
      try {
        const next = await this._rotateLock;
        console.warn(`[bardo] transport failed; rotating Wisp to ${this._bardoWisps[nextIndex]}`);
        return next;
      } finally {
        this._rotateLock = null;
      }
    }

    async _restorePreferred() {
      if (this._preferredWispIndex == null) return;
      if (this._currentRecord?.index === this._preferredWispIndex) return;
      if (this._rotateLock) {
        try {
          await this._rotateLock;
        } catch {
          return;
        }
      }
      if (this._currentRecord?.index === this._preferredWispIndex) return;
      try {
        await this._activateIndex(this._preferredWispIndex);
      } catch {
        // Recovery must never replace the useful error from the request.
      }
    }

    async _epoxyFor(wisp) {
      let promise = this._epoxyByWisp.get(wisp);
      if (!promise) {
        promise = this._importEpoxy().then(async ({ default: EpoxyTransport }) => {
          const transport = new EpoxyTransport({
            wisp,
            wisp_v2: false,
            udp_extension_required: false,
          });
          await transport.init();
          return transport;
        });
        this._epoxyByWisp.set(wisp, promise);
        promise.catch(() => this._epoxyByWisp.delete(wisp));
      }
      return promise;
    }

    async _epoxyFallback(remote, method, body, headers, signal) {
      const current = this._currentRecord?.index ?? this._bardoWispIndex;
      const order = uniqueUrls([
        this._bardoWisps[current],
        this._bardoWisps[this._preferredWispIndex],
        this._bardoWisps[0],
        ...this._bardoWisps,
      ]);
      let lastError;
      for (const wisp of order) {
        throwIfAborted(signal);
        try {
          const epoxy = await this._epoxyFor(wisp);
          return await epoxy.request(remote, method, body, headers, signal);
        } catch (error) {
          lastError = error;
          if (!isRetryableTransportError(error)) throw error;
        }
      }
      throw lastError;
    }

    async request(remote, method, body, headers, signal) {
      let lastError;
      let sameSessionRetry = true;
      const attempts = Math.max(1, this._bardoWisps.length);

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        throwIfAborted(signal);
        const record = this._currentRecord;
        if (!record) throw new Error("libcurl transport was not initialized");
        try {
          const response = await this._requestWith(record, remote, method, body, headers, signal);
          this._preferredWispIndex = record.index;
          return response;
        } catch (error) {
          lastError = error;
          if (!isRetryableTransportError(error) || !canReplayRequest(error, method, body)) {
            throw error;
          }

          if (sameSessionRetry && libcurlErrorCode(error) === 7) {
            sameSessionRetry = false;
            await abortableDelay(this._retryDelayMs, signal);
            try {
              const response = await this._requestWith(record, remote, method, body, headers, signal);
              this._preferredWispIndex = record.index;
              return response;
            } catch (retryError) {
              lastError = retryError;
              if (!isRetryableTransportError(retryError) || !canReplayRequest(retryError, method, body)) {
                throw retryError;
              }
            }
          }

          await this._rotateFrom(record);
        }
      }

      try {
        const response = await this._epoxyFallback(remote, method, body, headers, signal);
        await this._restorePreferred();
        return response;
      } catch (epoxyError) {
        await this._restorePreferred();
        throw lastError ?? epoxyError;
      }
    }
  };
}

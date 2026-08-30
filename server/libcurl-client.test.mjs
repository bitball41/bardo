import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RETRYABLE_CODES,
  canReplayRequest,
  createBardoLibcurlClient,
  isRetryableTransportError,
  libcurlErrorCode,
} from "./libcurl-pool.mjs";

const WISP_A = "wss://a.example/wisp/";
const WISP_B = "wss://b.example/wisp/";
const REMOTE = new URL("https://example.com/resource");

function curlError(code, text = "transport failed") {
  return new TypeError(`Request failed with error code ${code}: ${text}`);
}

function okPayload(tag) {
  return {
    raw_headers: [["x-wisp", tag]],
    body: new Uint8Array(),
    status: 200,
    statusText: "OK",
  };
}

function makeClient({ wisps = [WISP_A, WISP_B], fetchFor, epoxy, retryDelayMs = 0 } = {}) {
  let epoxyCalls = 0;
  const fetches = [];
  const Client = createBardoLibcurlClient(class MockLibcurl {
    constructor(options) {
      this.wisp = options.wisp ?? options.websocket;
      this.session = null;
    }
    async init() {
      const wisp = this.wisp;
      this.session = {
        wisp,
        closed: false,
        fetch: async (href, params) => {
          fetches.push({ wisp, href, method: params.method, body: params.body });
          return fetchFor(wisp, href, params);
        },
        close() {
          this.closed = true;
        },
      };
    }
  });

  const client = new Client({
    wisp: wisps[0],
    websocket: wisps[0],
    fallbacks: wisps.slice(1),
    retryDelayMs,
    importEpoxy: async () => ({
      default: class MockEpoxy {
        constructor(options) {
          this.wisp = options.wisp;
        }
        async init() {}
        async request(remote, method, body, headers, signal) {
          epoxyCalls += 1;
          if (typeof epoxy === "function") {
            return epoxy({ remote, method, body, headers, signal, wisp: this.wisp, calls: epoxyCalls });
          }
          throw new Error("epoxy should not be used");
        }
      },
    }),
  });

  return { client, fetches, epoxyCalls: () => epoxyCalls };
}

test("retryable curl codes are 6/7/28/35/52/56/60", () => {
  assert.deepEqual([...RETRYABLE_CODES].sort((a, b) => a - b), [6, 7, 28, 35, 52, 56, 60]);
  for (const code of RETRYABLE_CODES) {
    assert.equal(isRetryableTransportError(curlError(code)), true);
  }
  assert.equal(isRetryableTransportError(curlError(22)), false);
});

test("unsafe POST/body requests are not replayed on ambiguous errors", () => {
  const timeout = curlError(28, "Operation timed out");
  assert.equal(canReplayRequest(timeout, "POST", "payload"), false);
  assert.equal(canReplayRequest(timeout, "PUT", new Uint8Array([1])), false);
  assert.equal(canReplayRequest(timeout, "GET", null), true);
  assert.equal(canReplayRequest(curlError(7), "POST", "payload"), true);
});

test("rotates to the next Wisp on retryable curl codes and skips epoxy", async () => {
  for (const code of [6, 28, 35, 52, 56, 60]) {
    const { client, fetches, epoxyCalls } = makeClient({
      fetchFor(wisp) {
        if (wisp === WISP_A) throw curlError(code);
        return okPayload(wisp);
      },
    });
    await client.init();
    const response = await client.request(REMOTE, "GET", null, {}, undefined);
    assert.equal(response.status, 200);
    assert.deepEqual(response.headers["x-wisp"], [WISP_B]);
    assert.equal(fetches.at(-1)?.wisp, WISP_B);
    assert.equal(epoxyCalls(), 0);
    assert.equal(client._preferredWispIndex, 1);
  }
});

test("error 7 retries the same session once before rotating", async () => {
  const hits = { [WISP_A]: 0, [WISP_B]: 0 };
  const { client, fetches, epoxyCalls } = makeClient({
    fetchFor(wisp) {
      hits[wisp] += 1;
      if (wisp === WISP_A && hits[WISP_A] === 1) throw curlError(7, "Could not connect");
      if (wisp === WISP_A) return okPayload(wisp);
      throw new Error("rotated too early");
    },
  });
  await client.init();
  const firstSession = client._currentRecord.session;
  const response = await client.request(REMOTE, "GET", null, {}, undefined);
  assert.equal(response.status, 200);
  assert.deepEqual(response.headers["x-wisp"], [WISP_A]);
  assert.equal(hits[WISP_A], 2);
  assert.equal(hits[WISP_B], 0);
  assert.equal(fetches.length, 2);
  assert.equal(client._currentRecord.session, firstSession);
  assert.equal(epoxyCalls(), 0);
  assert.equal(client._preferredWispIndex, 0);
});

test("a failed egress is not remembered as preferred", async () => {
  let failB = false;
  const { client, epoxyCalls } = makeClient({
    fetchFor(wisp) {
      if (wisp === WISP_A) throw curlError(35);
      if (failB) throw curlError(56);
      return okPayload(wisp);
    },
    epoxy: () => ({ status: 200, headers: {}, statusText: "OK", body: null }),
  });
  await client.init();
  await client.request(REMOTE, "GET", null, {}, undefined);
  assert.equal(client._preferredWispIndex, 1);
  assert.equal(epoxyCalls(), 0);

  failB = true;
  const response = await client.request(REMOTE, "GET", null, {}, undefined);
  assert.equal(response.status, 200);
  assert.equal(epoxyCalls(), 1);
  assert.equal(client._preferredWispIndex, 1);
  assert.equal(client._currentRecord.index, 1);
});

test("epoxy success does not crown a Wisp that never worked", async () => {
  const { client, epoxyCalls } = makeClient({
    fetchFor() {
      throw curlError(56);
    },
    epoxy: () => ({ status: 200, headers: {}, statusText: "OK", body: null }),
  });
  await client.init();
  assert.equal(client._preferredWispIndex, null);
  const response = await client.request(REMOTE, "GET", null, {}, undefined);
  assert.equal(response.status, 200);
  assert.equal(epoxyCalls(), 1);
  assert.equal(client._preferredWispIndex, null);
});

test("error 7 rotates after the extra same-session retry still fails", async () => {
  const hits = { [WISP_A]: 0, [WISP_B]: 0 };
  const { client, epoxyCalls } = makeClient({
    fetchFor(wisp) {
      hits[wisp] += 1;
      if (wisp === WISP_A) throw curlError(7, "Could not connect");
      return okPayload(wisp);
    },
  });
  await client.init();
  const response = await client.request(REMOTE, "GET", null, {}, undefined);
  assert.equal(response.status, 200);
  assert.equal(hits[WISP_A], 2);
  assert.equal(hits[WISP_B], 1);
  assert.equal(epoxyCalls(), 0);
  assert.equal(client._preferredWispIndex, 1);
});

test("POST with a body is not replayed across Wisp rotation", async () => {
  const { client, fetches, epoxyCalls } = makeClient({
    fetchFor() {
      throw curlError(28, "Operation timed out");
    },
    epoxy: () => {
      throw new Error("epoxy should not see an unreplaying POST");
    },
  });
  await client.init();
  await assert.rejects(
    () => client.request(REMOTE, "POST", "hello", {}, undefined),
    /error code 28/,
  );
  assert.equal(fetches.length, 1);
  assert.equal(epoxyCalls(), 0);
  assert.equal(client._preferredWispIndex, null);
});

test("epoxy is only used after every Wisp in the pool is exhausted", async () => {
  const hits = { [WISP_A]: 0, [WISP_B]: 0 };
  const { client, epoxyCalls } = makeClient({
    fetchFor(wisp) {
      hits[wisp] += 1;
      throw curlError(60);
    },
    epoxy: ({ wisp, calls }) => {
      assert.equal(calls, 1);
      return { status: 203, headers: { via: [wisp] }, statusText: "OK", body: null };
    },
  });
  await client.init();
  const response = await client.request(REMOTE, "GET", null, {}, undefined);
  assert.equal(response.status, 203);
  assert.equal(hits[WISP_A], 1);
  assert.equal(hits[WISP_B], 1);
  assert.equal(epoxyCalls(), 1);
});

test("successful libcurl never calls epoxy", async () => {
  const { client, epoxyCalls } = makeClient({
    fetchFor: () => okPayload(WISP_A),
  });
  await client.init();
  await client.request(REMOTE, "GET", null, {}, undefined);
  assert.equal(epoxyCalls(), 0);
});

test("in-flight requests keep their session while a later request rotates", async () => {
  let parked = 0;
  let releaseFirst;
  let firstStarted;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const firstStartedPromise = new Promise((resolve) => {
    firstStarted = resolve;
  });
  const { client } = makeClient({
    fetchFor(wisp) {
      if (wisp === WISP_A) {
        parked += 1;
        if (parked === 1) {
          firstStarted();
          return firstGate.then(() => okPayload(wisp));
        }
        throw curlError(35);
      }
      return okPayload(wisp);
    },
  });
  await client.init();
  const firstRecord = client._currentRecord;
  const first = client.request(REMOTE, "GET", null, {}, undefined);
  await firstStartedPromise;
  const second = client.request(new URL("https://example.com/other"), "GET", null, {}, undefined);
  const secondResponse = await second;
  assert.equal(secondResponse.status, 200);
  assert.equal(firstRecord.retired, true);
  assert.equal(firstRecord.closed, false);
  assert.equal(firstRecord.active, 1);
  assert.equal(firstRecord.session.closed, false);
  releaseFirst();
  const firstResponse = await first;
  assert.equal(firstResponse.status, 200);
  assert.equal(firstRecord.closed, true);
  assert.equal(firstRecord.session.closed, true);
});

test("libcurlErrorCode reads curl code strings", () => {
  assert.equal(libcurlErrorCode(curlError(7)), 7);
  assert.equal(libcurlErrorCode(new Error("CURLE_COULDNT_CONNECT (7)")), 7);
  assert.equal(libcurlErrorCode("nope"), null);
});

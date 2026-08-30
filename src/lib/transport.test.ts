import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRANSPORTS,
  isTlsHandshakeError,
  isRetryableLibcurlError,
  libcurlErrorCode,
  orderedWispUrls,
  transportErrorMessage,
  wispUrlCandidates,
} from "./transport.ts";

test("libcurl is the default transport, epoxy is the fallback", () => {
  assert.equal(TRANSPORTS[0]?.id, "libcurl");
  assert.equal(TRANSPORTS[1]?.id, "epoxy");
  assert.equal(TRANSPORTS[0]?.path, "/libcurl/index.mjs?v=1.5.2-recovery2");
  const libcurlOpts = TRANSPORTS[0].options("wss://bardo.example/wisp/");
  assert.equal(libcurlOpts.wisp, "wss://bardo.example/wisp/");
  assert.equal(libcurlOpts.websocket, "wss://bardo.example/wisp/");
  assert.deepEqual(libcurlOpts.connections, [24, 16, 2]);
  assert.ok(Array.isArray(libcurlOpts.fallbacks));
  assert.ok((libcurlOpts.fallbacks as string[]).includes("wss://wisp.mercurywork.shop/wisp/"));
  assert.equal((libcurlOpts.fallbacks as string[]).includes("wss://bardo.example/wisp/"), false);
  assert.equal(TRANSPORTS[1]?.path, "/epoxy/index.mjs");
});

test("epoxy options disable wisp v2 and required UDP", () => {
  const opts = TRANSPORTS[1].options("wss://example.com/wisp/");
  assert.equal(opts.wisp, "wss://example.com/wisp/");
  assert.equal(opts.wisp_v2, false);
  assert.equal(opts.udp_extension_required, false);
});

test("orderedWispUrls skip a dead local server so public is tried first", () => {
  assert.deepEqual(
    orderedWispUrls(
      "wss://bardo.example/wisp/",
      false,
      "wss://anura.pro/wisp/",
      ["wss://wisp.mercurywork.shop/wisp/", "wss://anura.pro/wisp/"],
    ),
    ["wss://anura.pro/wisp/", "wss://wisp.mercurywork.shop/wisp/"],
  );
});

test("wispUrlCandidates prefer local then unique public servers", () => {
  const local = "wss://bardo.example/wisp/";
  const publicServers = [
    "wss://wisp.mercurywork.shop/wisp/",
    local,
    "wss://anura.pro/wisp/",
    "wss://anura.pro/wisp/",
  ];
  assert.deepEqual(wispUrlCandidates(local, publicServers), [
    local,
    "wss://wisp.mercurywork.shop/wisp/",
    "wss://anura.pro/wisp/",
  ]);
});

test("isTlsHandshakeError matches Hyper/epoxy's eof wrapper", () => {
  const hyper = new Error(
    'Hyper client: hyper_util::client::legacy::Error(Connect, Io(Custom { kind: UnexpectedEof, error: "tls handshake eof" }))',
  );
  assert.equal(isTlsHandshakeError(hyper), true);
  assert.equal(isTlsHandshakeError(new Error("connection refused")), false);
  assert.equal(isTlsHandshakeError("tls handshake eof"), true);
  assert.equal(
    isTlsHandshakeError(new TypeError("Request failed with error code 35: SSL connect error")),
    true,
  );
  assert.equal(
    isTlsHandshakeError(
      new TypeError("Request failed with error code 60: SSL peer certificate or SSH remote key was not OK"),
    ),
    true,
  );
});

test("transportErrorMessage reads Error.message", () => {
  assert.equal(transportErrorMessage(new Error("tls handshake eof")), "tls handshake eof");
  assert.equal(transportErrorMessage("nope"), "nope");
});

test("libcurl errors expose their numeric code and retryability", () => {
  const connect = new TypeError("Request failed with error code 7: Could not connect");
  assert.equal(libcurlErrorCode(connect), 7);
  assert.equal(isRetryableLibcurlError(connect), true);
  assert.equal(isRetryableLibcurlError(new Error("error code 22: HTTP response error")), false);
  assert.equal(isRetryableLibcurlError(new Error("connection refused")), true);
});

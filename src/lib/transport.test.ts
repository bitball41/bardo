import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRANSPORTS,
  isTlsHandshakeError,
  orderedWispUrls,
  transportErrorMessage,
  wispUrlCandidates,
} from "./transport.ts";

test("libcurl is the default transport, epoxy is the fallback", () => {
  assert.equal(TRANSPORTS[0]?.id, "libcurl");
  assert.equal(TRANSPORTS[1]?.id, "epoxy");
  assert.equal(TRANSPORTS[0]?.path, "/libcurl/index.mjs?v=1.5.2");
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
});

test("transportErrorMessage reads Error.message", () => {
  assert.equal(transportErrorMessage(new Error("tls handshake eof")), "tls handshake eof");
  assert.equal(transportErrorMessage("nope"), "nope");
});

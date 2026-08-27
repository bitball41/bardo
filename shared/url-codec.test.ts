import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeDest, decodeProxyPath, encodeDest, encodeProxyPath, pageLabel, pathCodec } from "./url-codec.js";

const DEST = "https://www.startpage.com/search?q=unblocked+games";
const PREFIX = "/scramjet/service/";

test("path codec round-trips http(s) destinations including query strings", () => {
  const samples = [
    DEST,
    "https://example.com",
    "https://example.com/path?query=value",
    "https://example.com:8080/path",
    "http://subdomain.example.com/path",
    "https://example.com/search?q=hello world&lang=en",
    "https://example.com/search?q=日本語",
  ];
  for (const url of samples) {
    assert.equal(decodeDest(encodeDest(url)), url);
    assert.equal(pathCodec.decode(pathCodec.encode(url)), url);
  }
});

test("codec payload is not percent-encoding and hides dest host plus q=", () => {
  const encoded = encodeDest(DEST);
  assert.notEqual(encoded, encodeURIComponent(DEST));
  assert.doesNotMatch(encoded, /startpage/i);
  assert.doesNotMatch(encoded, /unblocked/i);
  assert.doesNotMatch(encoded, /q=/i);
  assert.doesNotMatch(encoded, /https?:/i);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
});

test("proxy path wrap/unwrap hides dest in iframe-style src", () => {
  const src = encodeProxyPath(PREFIX, DEST);
  assert.ok(src.startsWith(PREFIX));
  assert.doesNotMatch(src, /startpage/i);
  assert.doesNotMatch(src, /unblocked/i);
  assert.doesNotMatch(src, /q=/i);
  assert.doesNotMatch(src, /https%3A/i);
  assert.equal(decodeProxyPath(PREFIX, src), DEST);
  assert.equal(decodeProxyPath(PREFIX, "https://bardo.example" + src), DEST);
});

test("decodeDest still accepts legacy encodeURIComponent paths", () => {
  assert.equal(decodeDest(encodeURIComponent(DEST)), DEST);
  assert.equal(decodeProxyPath(PREFIX, PREFIX + encodeURIComponent(DEST)), DEST);
});

test("pageLabel is hostname-only so queries stay out of chrome text", () => {
  assert.equal(pageLabel(DEST), "www.startpage.com");
  assert.equal(pageLabel(""), "New Tab");
  assert.equal(pageLabel("not a url"), "New Tab");
});

test("scramjet/sherpa codec functions are self-contained expressions", () => {
  const encode = new Function(`return ${pathCodec.encode}`)();
  const decode = new Function(`return ${pathCodec.decode}`)();
  assert.equal(decode(encode(DEST)), DEST);
  assert.doesNotMatch(encode(DEST), /unblocked/i);
});

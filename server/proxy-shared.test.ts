// Unit tests for the SSRF guard in proxy-shared. Runs on Node's built-in test
// runner (node:test) through tsx — no extra dependency. See package.json "test".
//
// The blocked list intentionally includes the two bypasses these tests were
// written to lock down: IPv4-mapped IPv6 (::ffff:...) reaching loopback and
// cloud metadata. `assertSafeHost`'s DNS resolution path is not covered here
// (it needs live/mocked DNS); this focuses on the pure, deterministic guard.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { isBlockedHost, rewrite } from "./proxy-shared.js";

// Feed hostnames the way callers do: via URL parsing, which normalizes IP forms
// (e.g. decimal/hex IPv4, and ::ffff:127.0.0.1 -> [::ffff:7f00:1]).
const hn = (h: string) => new URL(`http://${h}/`).hostname;

const BLOCKED = [
  "127.0.0.1", "127.255.255.254", "10.0.0.1", "172.16.0.1", "172.31.255.255",
  "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
  "2130706433", "0x7f000001", // decimal / hex spellings of 127.0.0.1
  "localhost", "foo.localhost", "printer.local", "metadata.google.internal",
  "[::1]", "[::]", "[fc00::1]", "[fd12:3456::1]", "[fe80::1]",
  "[::ffff:127.0.0.1]", "[::ffff:169.254.169.254]", "[::ffff:192.168.0.1]",
];

const ALLOWED = [
  "example.com", "sub.example.co.uk", "1.1.1.1", "8.8.8.8",
  "172.15.255.255", "172.32.0.1", // just outside the 172.16/12 private range
  "100.63.255.255", "100.128.0.1", // just outside the 100.64/10 CGNAT range
  "[2606:4700:4700::1111]", "[2001:4860:4860::8888]",
];

for (const h of BLOCKED) {
  test(`blocks ${h}`, () => assert.equal(isBlockedHost(hn(h)), true));
}

for (const h of ALLOWED) {
  test(`allows ${h}`, () => assert.equal(isBlockedHost(hn(h)), false));
}

test("blocks an empty host", () => assert.equal(isBlockedHost(""), true));


const BASE = "https://example.com/path/page.html";
const PREFIX = "/proxy/";

test("rewrites srcset without splitting a data URL comma", () => {
  const html = '<img srcset="data:image/svg+xml,%3Csvg%3E 1x, /image-2x.png 2x">';
  const output = rewrite(BASE, html, "text/html", PREFIX);
  assert.match(output, /data:image\/svg\+xml,%3Csvg%3E 1x/);
  assert.match(output, /\/proxy\/https%3A%2F%2Fexample\.com%2Fimage-2x\.png 2x/);
});

test("rewrites quoted CSS URLs containing parentheses and imports", () => {
  const html = '<style>@import "./theme.css"; .hero{background:url("/image(foo).png")}</style>';
  const output = rewrite(BASE, html, "text/html", PREFIX);
  assert.match(output, /\/proxy\/https%3A%2F%2Fexample\.com%2Fpath%2Ftheme\.css/);
  assert.match(output, /\/proxy\/https%3A%2F%2Fexample\.com%2Fimage\(foo\)\.png/);
});

test("rewrites JavaScript URL literals but leaves comments and labels alone", () => {
  const html = '<script>// "/comment-only"\nconst api="/api"; const label="not/a/url";</script>';
  const output = rewrite(BASE, html, "text/html", PREFIX);
  assert.match(output, /\/\/ "\/comment-only"/);
  assert.match(output, /const api="\/proxy\/https%3A%2F%2Fexample\.com%2Fapi"/);
  assert.match(output, /const label="not\/a\/url"/);
});

test("reuses an existing parsed document", () => {
  const dom = new JSDOM('<a href="/next">Next</a>', { url: BASE });
  rewrite(BASE, dom.serialize(), "text/html", PREFIX, dom);
  assert.equal(
    dom.window.document.querySelector("a")?.getAttribute("href"),
    PREFIX + encodeURIComponent("https://example.com/next"),
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { attachClosedMount, parentDomExposes, parentDomHaystack } from "../src/lib/closed-shadow.ts";
import { encodeProxyPath, pageLabel } from "./url-codec.ts";

const DEST = "https://www.startpage.com/search?q=unblocked+games";

test("closed shadow keeps dest/query out of a parent-document scrape", () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="chrome"></div>
    <iframe class="nav-frame"></iframe>
  </body></html>`);
  const { document } = dom.window;
  const host = document.createElement("div");
  host.id = "chrome-form";
  document.getElementById("chrome")!.appendChild(host);

  const { mount } = attachClosedMount(host);
  const input = document.createElement("input");
  input.id = "url-bar";
  input.value = DEST;
  input.setAttribute("aria-label", DEST);
  mount.appendChild(input);

  const iframe = document.querySelector("iframe")!;
  iframe.src = encodeProxyPath("/scramjet/service/", DEST);

  const tab = document.createElement("span");
  tab.className = "tab-title";
  tab.textContent = pageLabel(DEST);
  tab.setAttribute("aria-label", pageLabel(DEST));
  document.body.appendChild(tab);

  const haystack = parentDomHaystack(document);
  const hits = parentDomExposes(haystack, DEST);
  assert.deepEqual(hits, [], `parent DOM leaked: ${hits.join(", ")}\n${haystack.slice(0, 500)}`);
  assert.equal(document.querySelector("#url-bar"), null);
  assert.equal(document.querySelector("input")?.value, undefined);
  assert.ok(input.value === DEST, "user-facing input inside closed shadow still holds the dest");
});

test("light-DOM input with dest would fail the scrape (control)", () => {
  const dom = new JSDOM(`<!doctype html><html><body><input id="url-bar"></body></html>`);
  const input = dom.window.document.querySelector("input")!;
  input.value = DEST;
  const hits = parentDomExposes(parentDomHaystack(dom.window.document), DEST);
  assert.ok(hits.length > 0);
});

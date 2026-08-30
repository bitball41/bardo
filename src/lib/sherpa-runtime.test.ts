import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHERPA_RUNTIME, SVC_PREFIX, SVC_PREFIX_SHERPA } from "./constants.ts";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../../public/sw-sherpa.js", import.meta.url), "utf8");
const server = readFileSync(new URL("../../server.ts", import.meta.url), "utf8");
const core = readFileSync(new URL("./core.ts", import.meta.url), "utf8");

test("Sherpa pages inject the client bundle via files.all, not sherpa.all.js", () => {
  assert.equal(SHERPA_RUNTIME.client, "/scramjet/scramjet.runtime.js");
  assert.equal(SHERPA_RUNTIME.host, "/scramjet/scramjet.sw.js");
  assert.match(core, /all:\s*SHERPA_RUNTIME\.client/);
  assert.equal(/all:\s*SHERPA_RUNTIME\.host/.test(core), false);
  assert.match(server, /scramjet\.runtime\.js[\s\S]*sherpa\.client\.js/);
  assert.match(server, /scramjet\.sw\.js[\s\S]*sherpa\.all\.js/);
});

test("parent chrome loads sherpa.all.js and the SW loads the host bundle alias", () => {
  assert.match(html, /src="\/sherpa\/sherpa\.all\.js"/);
  assert.match(html, /href="\/sherpa\/sherpa\.all\.js"/);
  assert.equal(html.includes("sherpa.client.js"), false);
  assert.match(sw, /importScripts\("\/scramjet\/scramjet\.sw\.js"\)/);
  assert.match(sw, /\$sherpaLoadWorker/);
});

test("Sherpa and Scramjet share a service prefix so dest URLs stay quiet", () => {
  assert.equal(SVC_PREFIX_SHERPA, SVC_PREFIX);
});

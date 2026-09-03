import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_SETTINGS } from "./constants.ts";

const launcher = readFileSync(new URL("../../Bardo.html", import.meta.url), "utf8");
const index = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const server = readFileSync(new URL("../../server.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("../main.tsx", import.meta.url), "utf8");
const vite = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");

test("launcher automatically opens about:blank and frames the stable HTTPS entrypoint", () => {
  assert.match(launcher, /window\.open\("about:blank","_blank"\)/);
  assert.match(launcher, /const launch=\(\)=>\{/);
  assert.match(launcher, /\n\s*launch\(\);\s*\n/);
  assert.match(launcher, /https:\/\/bardo-live\.cj-nissim\.workers\.dev\/bardo\.html/);
  assert.match(launcher, /doc\.createElement\("iframe"\)/);
  assert.doesNotMatch(launcher, /document\.write|fetch\s*\(/);
  assert.doesNotMatch(launcher, /<button|addEventListener\("click"/);
  assert.doesNotMatch(launcher, /sandbox\s*=/i);
});

test("blocked automatic popups fall back to Bardo in the launcher tab", () => {
  assert.match(launcher, /if\(!popup\)[\s\S]*?location\.replace\(REMOTE\)/);
});

test("launcher delegates useful iframe permissions and waits for Bardo readiness", () => {
  for (const permission of ["autoplay", "clipboard-read", "clipboard-write", "fullscreen", "gamepad", "picture-in-picture"]) {
    assert.match(launcher, new RegExp(permission));
  }
  assert.match(launcher, /frame\.allowFullscreen=true/);
  assert.match(launcher, /event\.source!==frame\.contentWindow/);
  assert.match(launcher, /event\.origin!==ORIGIN/);
  assert.match(launcher, /event\.data\?\.type!=="bardo:ready"/);
  assert.match(launcher, /setTimeout\(\(\)=>\{[\s\S]*?window\.close\(\)[\s\S]*?location\.replace\("about:blank"\)[\s\S]*?\},3000\)/);
  assert.match(main, /window\.parent\.postMessage\(\{ type: "bardo:ready", version: 1 \}, "\*"\)/);
});

test("Bardo can be embedded while retaining its own restrictive application CSP", () => {
  assert.doesNotMatch(index, /frame-ancestors/);
  assert.doesNotMatch(server, /frame-ancestors/);
  assert.match(index, /object-src 'none'/);
  assert.match(server, /"object-src 'none'"/);
});

test("production build emits the stable remote bardo.html alias", () => {
  assert.match(vite, /copyFileSync\(path\.join\(dist, 'index\.html'\), path\.join\(dist, 'bardo\.html'\)\)/);
});

test("fresh Bardo profiles default to DuckDuckGo", () => {
  assert.equal(DEFAULT_SETTINGS.searchEngine, "duckduckgo");
});

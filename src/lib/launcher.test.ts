import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_SETTINGS } from "./constants.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const launcher = read("../../Bardo.html");
const embedHtml = read("../../embed.html");
const embed = read("../embed.ts");
const remote = read("./remote-controller.ts");
const core = read("./core.ts");
const server = read("../../server.ts");
const vite = read("../../vite.config.ts");

test("Bardo.html directly loads the current Bardo UI without a redirect or wrapper iframe", () => {
  assert.match(launcher, /<div id="root"><\/div>/);
  assert.match(launcher, /https:\/\/bardo-live\.cj-nissim\.workers\.dev\/bardo-app\.js/);
  assert.match(launcher, /https:\/\/bardo-live\.cj-nissim\.workers\.dev\/bardo-app\.css/);
  assert.doesNotMatch(launcher, /<iframe|about:blank|window\.open|location\.replace|document\.write|http-equiv="refresh"/i);
});

test("the one-file loader has a restrictive policy and a visible network error", () => {
  assert.match(launcher, /Content-Security-Policy/);
  assert.match(launcher, /frame-src https:\/\/bardo-live\.cj-nissim\.workers\.dev/);
  assert.match(launcher, /Bardo could not load\. Check your connection/);
  assert.match(launcher, /crossorigin="anonymous"/);
});

test("file mode routes Bardo tabs through the remote HTTPS embed controller", () => {
  assert.match(core, /isSingleFileMode\(\)[\s\S]*?initRemoteEngine/);
  assert.match(core, /new RemoteController\(engine\)/);
  assert.match(remote, /\/embed\.html\?/);
  assert.match(remote, /bardo-embed:command/);
  assert.match(remote, /event\.origin !== remoteOrigin\(\)/);
  assert.match(remote, /event\.source !== this\.iframe\.contentWindow/);
});

test("the embed owns the remotely hosted proxy runtimes and service workers", () => {
  assert.match(embedHtml, /id="proxy-frame"/);
  assert.match(embedHtml, /src="\/sherpa\/sherpa\.all\.js"/);
  assert.match(embedHtml, /src="\/scramjet\/scramjet\.all\.js"/);
  assert.match(embedHtml, /src="\/baremux\/index\.js"/);
  assert.match(embed, /registerWorker\("\/sw\.js", SVC_PREFIX\)/);
  assert.match(embed, /registerWorker\("\/sw-sherpa\.js", SVC_PREFIX_SHERPA\)/);
  assert.match(embed, /new window\.BareMux\.BareMuxConnection\(BAREMUX_WORKER\)/);
  assert.match(embed, /TRANSPORTS/);
  assert.match(embed, /PUBLIC_WISP_SERVERS/);
  assert.match(embed, /SVC_PREFIX_KLYSTRON/);
});

test("tab frames delegate the permissions Bardo reasonably needs", () => {
  for (const permission of ["autoplay", "clipboard-read", "clipboard-write", "fullscreen", "gamepad", "picture-in-picture"]) {
    assert.match(core, new RegExp(permission));
  }
  assert.match(core, /iframe\.allowFullscreen = true/);
});

test("production emits stable loader assets and makes them CORS-readable", () => {
  assert.match(vite, /bardo-app\.js/);
  assert.match(vite, /bardo-app\.css/);
  assert.match(vite, /path\.join\(dist, 'Bardo\.html'\)/);
  assert.match(vite, /embed: path\.resolve\(__dirname, 'embed\.html'\)/);
  assert.match(server, /Access-Control-Allow-Origin", "\*"/);
  assert.match(server, /Cross-Origin-Resource-Policy", "cross-origin"/);
});

test("fresh Bardo profiles default to DuckDuckGo", () => {
  assert.equal(DEFAULT_SETTINGS.searchEngine, "duckduckgo");
});

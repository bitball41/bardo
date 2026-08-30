if (navigator.userAgent.includes("Firefox")) {
  Object.defineProperty(globalThis, "crossOriginIsolated", { value: true });
}

importScripts("/scramjet/scramjet.sw.js");

const { SherpaServiceWorker } = $sherpaLoadWorker();
const engine = new SherpaServiceWorker();

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      await engine.loadConfig();
      if (engine.route(event)) return engine.fetch(event);
      return fetch(event.request);
    })(),
  );
});

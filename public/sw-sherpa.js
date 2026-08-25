if (navigator.userAgent.includes("Firefox")) {
  Object.defineProperty(globalThis, "crossOriginIsolated", { value: true });
}

importScripts("/scramjet/scramjet.sw.js");

const { SherpaServiceWorker } = $sherpaLoadWorker();
const engine = new SherpaServiceWorker();

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      await engine.loadConfig();
      if (engine.route(event)) return engine.fetch(event);
      return fetch(event.request);
    })(),
  );
});

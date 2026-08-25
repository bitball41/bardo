if (navigator.userAgent.includes("Firefox")) {
  Object.defineProperty(globalThis, "crossOriginIsolated", { value: true });
}

importScripts("/runtime/all.js");

const { SherpaServiceWorker } = $sherpaLoadWorker();
const sherpa = new SherpaServiceWorker();

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      await sherpa.loadConfig();
      if (sherpa.route(event)) return sherpa.fetch(event);
      return fetch(event.request);
    })(),
  );
});

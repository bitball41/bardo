self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

importScripts('/scramjet/scramjet.all.js');

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const sw = new ScramjetServiceWorker();

const configReady = sw.loadConfig().catch(err => console.error('[scramjet] config load failed:', err));

self.addEventListener('fetch', event => {
  event.respondWith(
    configReady.then(() => {
      if (!sw.config || !sw.route(event)) return fetch(event.request);
      return sw.fetch(event);
    })
  );
});

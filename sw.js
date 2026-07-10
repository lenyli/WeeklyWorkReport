const LEGACY_CACHES = ["weekly-report-pwa-v1", "weekly-report-pwa-v2", "weekly-report-pwa-v3"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => LEGACY_CACHES.includes(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

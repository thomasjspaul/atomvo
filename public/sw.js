// Minimal offline shell. API calls are always network-only.
const CACHE = "fuel-v3";
const SHELL = ["/", "/pwa/manifest.webmanifest", "/pwa/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never intercept the API

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fromNetwork = fetch(request)
        .then((res) => {
          if (res.ok) {
            // clone synchronously, before the async cache open / before the
            // page starts streaming the body
            const copy = res.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(request, copy))
              .catch(() => {});
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || fromNetwork;
    }),
  );
});

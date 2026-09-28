// Offline support. Everything the app needs is precached on install.
// Bump VERSION whenever a file below changes so installed copies pick it up.
const VERSION = "v1";
const CACHE = "a-noise-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./fonts/figtree-latin.woff2",
  "./fonts/fraunces-latin.woff2",
  "./icons/icon.svg",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("a-noise-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Stale-while-revalidate: answer from the cache instantly (works offline),
// then refresh the cached copy in the background when the network is there.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === "navigate" ? "./index.html" : req;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const hit = await cache.match(key, { ignoreSearch: true });
      const net = fetch(req).then(res => {
        if (res.ok && res.type === "basic") cache.put(key, res.clone());
        return res;
      }).catch(() => undefined);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || new Response("Offline", { status: 503, statusText: "Offline" });
    })
  );
});

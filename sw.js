const CACHE = "nexap-v28";
const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./nexap-icon.svg",
  "./offline.html",
  "./supabase-client.js"
];
const IMAGE_CACHE = "nexap-images-v1";
const MAX_CACHED_IMAGES = 60;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith("nexap-v") && key !== CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function trimImageCache(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_CACHED_IMAGES) {
    await Promise.all(keys.slice(0, keys.length - MAX_CACHED_IMAGES).map(key => cache.delete(key)));
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSupabaseImage = url.origin === "https://balojriovbjzywjrvpyw.supabase.co" && request.destination === "image";
  if (url.origin !== self.location.origin && !isSupabaseImage) return;

  // Never cache API/data requests or navigations as generic assets.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put("./index.html", response.clone());
        }
        return response;
      } catch {
        return (await caches.match("./offline.html")) ||
          (await caches.match("./index.html")) ||
          new Response("Você está sem conexão.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (request.destination === "image") {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          await trimImageCache(cache);
        }
        return response;
      } catch {
        return new Response("", { status: 504, statusText: "Image unavailable offline" });
      }
    })());
    return;
  }

  const isAppAsset = /\.(?:css|js|svg|png|webp|ico|woff2?)$/i.test(url.pathname) ||
    url.pathname.endsWith("/manifest.json");
  if (!isAppAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => null);
    return cached || await network || new Response("", { status: 504 });
  })());
});

// A release is cached as one shell. No auth, API, room response or save enters it.
const CACHE = "nusantara-classic-v4110-__BUILD_ID__";
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const urls = await fetch("/precache.json", { cache: "no-store" }).then(
        (r) => {
          if (!r.ok) throw Error("Precache unavailable");
          return r.json();
        },
      );
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll(
          urls.map((url) => new Request(url, { cache: "reload" })),
        );
      } catch (error) {
        await caches.delete(CACHE);
        throw error;
      }
      // Updates wait until every game tab closes or explicitly reports it is safe.
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (
          (/^nusantara-v\d+$/.test(key) ||
            /^nusantara-(?:kepulauan|classic)-v/.test(key)) &&
          key !== CACHE
        )
          await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type !== "ACTIVATE_UPDATE") return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const safe = await Promise.all(
        clients.map(
          (client) =>
            new Promise((resolve) => {
              const channel = new MessageChannel();
              const timer = setTimeout(() => {
                channel.port1.close();
                resolve(false);
              }, 2000);
              channel.port1.onmessage = (response) => {
                clearTimeout(timer);
                channel.port1.close();
                resolve(response.data?.safe === true);
              };
              client.postMessage({ type: "CAN_ACTIVATE" }, [channel.port2]);
            }),
        ),
      );
      if (safe.every(Boolean)) await self.skipWaiting();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const shell =
    request.mode === "navigate" && ["/", "/index.html"].includes(url.pathname);
  const asset =
    /^\/(assets|frontend|lib)\//.test(url.pathname) ||
    ["/manifest.webmanifest", "/favicon.ico"].includes(url.pathname);
  if (!shell && !asset) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(shell ? "/" : url.pathname);
      // Cache-first keeps lazy workers and modules on the same release as the shell.
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch {
        return new Response(
          "Hanya aset publik yang tersedia offline. Hubungkan internet untuk memuat aplikasi.",
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          },
        );
      }
    })(),
  );
});

const CACHE_NAME = "trenes-arg-v1";
const ARCHIVOS_PRECACHE = [
  "/index.html",
  "/gps.html",
  "/css/style.css",
  "/js/app.js",
  "/js/gps.js",
  "/js/buscador.js",
  "/js/mapa.js",
  "/estaciones.json",
  "/tren.png",
  "/icon-192.png",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS_PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Los horarios son datos en vivo: nunca se cachean, van directo a red.
  if (url.hostname.includes("sofse.gob.ar")) return;

  event.respondWith(caches.match(event.request).then((cacheado) => cacheado || fetch(event.request)));
});

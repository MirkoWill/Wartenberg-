/**
 * Service Worker – macht die App offline-fähig (App-Shell-Cache).
 * Notfallnummern & Verhaltensregeln sind damit auch ohne Netz verfügbar.
 * Beim Ändern von Dateien CACHE_VERSION hochzählen.
 */
const CACHE_VERSION = "mieterapp-v42";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=42",
  "./js/config.js?v=42",
  "./js/i18n.js?v=42",
  "./js/app.js?v=42",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/hausverwaltung.vcf",
  "./assets/abfuhrkalender-2026.ics",
  "./fonts/playfair-display-latin-400-normal.woff2",
  "./fonts/playfair-display-latin-600-normal.woff2",
  "./fonts/source-sans-3-latin-400-normal.woff2",
  "./fonts/source-sans-3-latin-600-normal.woff2",
  "./fonts/source-sans-3-latin-700-normal.woff2",
  "./fonts/oswald-latin-400-normal.woff2",
  "./fonts/oswald-latin-600-normal.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Nur eigene GET-Anfragen: zuerst Netz (immer aktuelle Version), bei fehlender
// Verbindung aus dem Cache. API-Aufrufe (Apps Script, transport.rest) werden nicht angefasst.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    // "no-cache": beim Server nachfragen, ob es eine neuere Version gibt (sonst liefert der
    // Browser-Cache evtl. alte Dateien und die App besteht aus alten und neuen Teilen).
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

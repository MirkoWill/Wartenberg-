/**
 * Service Worker – macht die App offline-fähig (App-Shell-Cache).
 * Notfallnummern & Verhaltensregeln sind damit auch ohne Netz verfügbar.
 * Beim Ändern von Dateien CACHE_VERSION hochzählen.
 */
const CACHE_VERSION = "mieterapp-v66";
const PUSH_CACHE = "mieterapp-push"; // Benachrichtigungen: { api, id } – bleibt bei neuen Versionen erhalten
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=66",
  "./js/config.js?v=66",
  "./js/i18n.js?v=66",
  "./js/app.js?v=66",
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
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION && k !== PUSH_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Nur eigene GET-Anfragen: zuerst Netz (immer aktuelle Version), bei fehlender
// Verbindung aus dem Cache. API-Aufrufe (Apps Script) werden nicht angefasst.
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

/* ---------- Benachrichtigungen (nur Android) ----------
   Das Signal vom Push-Dienst ist leer; den Text holen wir mit der Geräte-Kennung beim Backend ab. */
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let item = null;
    try {
      const res = await (await caches.open(PUSH_CACHE)).match("push-config");
      const cfg = res ? await res.json() : null;
      if (cfg && cfg.api && cfg.id) {
        const r = await fetch(`${cfg.api}?action=pushInbox&id=${encodeURIComponent(cfg.id)}`, { cache: "no-store" });
        item = (await r.json()).item || null;
      }
    } catch (e) { /* ohne Netz: allgemeiner Hinweis */ }
    const msg = item || { title: "Mieter-App", body: "Es gibt Neuigkeiten – bitte die App öffnen.", url: "#notfall" };
    await self.registration.showNotification(String(msg.title || "Mieter-App"), {
      body: String(msg.body || ""),
      tag: msg.tag || undefined,
      icon: "icons/icon-192.png",
      data: { url: /^#[a-z]{1,20}$/.test(msg.url || "") ? msg.url : "#notfall" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(`./${(event.notification.data && event.notification.data.url) || "#notfall"}`, self.registration.scope).href;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin && "focus" in c) {
        await c.focus();
        if ("navigate" in c) await c.navigate(url).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

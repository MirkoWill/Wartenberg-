/**
 * Service Worker – macht die App offline-fähig (App-Shell-Cache).
 * Notfallnummern & Verhaltensregeln sind damit auch ohne Netz verfügbar.
 * Beim Ändern von Dateien CACHE_VERSION hochzählen.
 */
const CACHE_VERSION = "mieterapp-v70";
const PUSH_CACHE = "mieterapp-push"; // Benachrichtigungen: { api, id } – bleibt bei neuen Versionen erhalten
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=70",
  "./js/config.js?v=70",
  "./js/i18n.js?v=70",
  "./js/app.js?v=70",
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

// Nur eigene GET-Anfragen (API-Aufrufe an Apps Script werden nicht angefasst):
// • Dateien mit Versionsnummer (?v=…), Schriften, Symbole, Bibliotheken ändern sich nie → sofort aus dem Speicher.
// • Seite und übrige Dateien: zuerst Netz (immer aktuell), aber höchstens 3 Sekunden warten –
//   bei schlechtem Empfang sofort die gespeicherte Fassung, ohne Netz ebenfalls.
function fromNetwork(req) {
  return fetch(req, { cache: "no-cache" }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
    }
    return res;
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  const immutable = url.searchParams.has("v") || /\/(fonts|icons|vendor)\//.test(url.pathname);
  if (immutable) {
    event.respondWith(caches.match(req).then((hit) => hit || fromNetwork(req)));
    return;
  }
  event.respondWith(new Promise((resolve) => {
    let done = false;
    const finish = (res) => { if (!done && res) { done = true; resolve(res); } };
    const net = fromNetwork(req);
    const timer = setTimeout(() => {
      caches.match(req, { ignoreSearch: true }).then(finish); // langsames Netz: gespeicherte Fassung
    }, 3000);
    net.then((res) => { clearTimeout(timer); finish(res); })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => finish(hit || Response.error())));
    // Hat die Wartezeit nichts Gespeichertes gefunden, gewinnt das Netz, sobald es antwortet.
    net.then(finish, () => {});
  }));
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

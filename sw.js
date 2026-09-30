/**
 * Service Worker – macht die App offline-fähig (App-Shell-Cache).
 * Notfallnummern & Verhaltensregeln sind damit auch ohne Netz verfügbar.
 * Beim Ändern von Dateien CACHE_VERSION hochzählen.
 */
const CACHE_VERSION = "mieterapp-v81";
const PUSH_CACHE = "mieterapp-push"; // Benachrichtigungen: { api, id } – bleibt bei neuen Versionen erhalten
const VERSION = CACHE_VERSION.replace(/^.*-v/, ""); // z. B. "71" – muss zu den ?v= in index.html passen
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css?v=81",
  "./js/config.js?v=81",
  "./js/i18n.js?v=81",
  "./js/app.js?v=81",
  "./manifest.json",
  "./icons/favicon-32.png",
  "./icons/apple-touch-icon.png",
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

  // Datei einer anderen Version (alte Seite, neuer Server oder umgekehrt): nie speichern, sonst passen
  // Seite und Programm dauerhaft nicht zusammen – einfach frisch laden.
  const v = url.searchParams.get("v");
  if (v && v !== VERSION) {
    event.respondWith(fetch(req, { cache: "no-cache" }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  const immutable = !!v || /\/(fonts|icons|vendor)\//.test(url.pathname);
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
const URGENT_ALERTS = 3;
const URGENT_GAP_MS = 4000;

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
    if (!item) {
      // Nichts abzuholen (z. B. doppeltes Signal, Nachricht schon abgeholt): Chrome verlangt trotzdem eine Anzeige.
      // Liegt schon eine unserer Benachrichtigungen da, diese still erneut zeigen statt „Es gibt Neuigkeiten“.
      const open = await self.registration.getNotifications();
      const last = open[open.length - 1];
      if (last) {
        await self.registration.showNotification(last.title, { body: last.body, tag: last.tag || undefined, renotify: false, silent: true,
          requireInteraction: last.requireInteraction, icon: "icons/icon-192.png", data: last.data });
        return;
      }
    }
    const msg = item || { title: "Mieter-App", body: "Es gibt Neuigkeiten – bitte die App öffnen.", url: "#notfall" };
    // Android (ab Version 8) ignoriert eigene Vibrationsmuster von Web-Apps – unterscheidbar wird „dringend“ daher so:
    // 🔴 im Titel und der Hinweiston kommt 3× (alle 4 Sek.), bis die Benachrichtigung geöffnet oder weggewischt wird.
    const kind = msg.kind === "urgent" || msg.kind === "meldung" ? msg.kind : "info";
    const tag = msg.tag || (kind === "urgent" ? `urgent-${Date.now()}` : undefined);
    const show = (alerts) => self.registration.showNotification((kind === "urgent" ? "🔴 " : "") + String(msg.title || "Mieter-App"), {
      body: String(msg.body || ""),
      tag,
      renotify: !!tag,                  // gleiche Meldung erneut → trotzdem wieder Ton
      requireInteraction: kind === "urgent",
      vibrate: kind === "urgent" ? [600, 200, 600, 200, 600] : kind === "meldung" ? [150, 100, 150, 100, 150] : [150],
      icon: "icons/icon-192.png",
      data: { url: /^#[a-z]{1,20}$/.test(msg.url || "") ? msg.url : "#notfall", kind, alerts },
    });
    await show(1);
    if (kind !== "urgent") return;
    for (let n = 2; n <= URGENT_ALERTS; n++) {
      await new Promise((r) => setTimeout(r, URGENT_GAP_MS));
      const still = await self.registration.getNotifications({ tag });
      if (!still.length) return;       // schon geöffnet oder weggewischt
      await show(n);
    }
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

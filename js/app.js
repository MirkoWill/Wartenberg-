/**
 * Mieter-App – Frontend-Logik (Vanilla JS, keine Abhängigkeiten).
 *
 * Aufbau:
 *   1. Objekt-/Hauskonfiguration auflösen (?obj=...)
 *   2. Hash-Router für die Ansichten
 *   3. Epic 1: Notfall, Kalender, ÖPNV, Dokumente
 *   4. Epic 2: Formulare (Wasserzähler, WhatsApp, Elektroraum, Klingel, Mangel)
 *   5. Hilfsfunktionen (API, Foto, Datum, Toast)
 */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ======================================================================
     1. Objekt (Haus) bestimmen
     ====================================================================== */

  const OBJ_STORAGE_KEY = "mieterapp.obj";

  /** Alle Aufgänge als flache Liste: { id, name, house }. */
  const ENTRANCES = CFG.HOUSES.flatMap((house) =>
    house.entrances.map((e) => ({ id: e.id, name: e.name, house })));

  /**
   * Liefert die zusammengeführte Konfiguration SITE → Haus → Aufgang.
   * Ist kein Aufgang bekannt, nur SITE (key = null) – die App zeigt dann die Auswahl.
   */
  function resolveObject() {
    const fromUrl = new URLSearchParams(location.search).get("obj");
    const known = (id) => ENTRANCES.some((e) => e.id === id);
    let key = known(fromUrl) ? fromUrl : null;

    // Beim Start vom Homescreen fehlt der Parameter evtl. – letzten Aufgang merken.
    try {
      if (key) localStorage.setItem(OBJ_STORAGE_KEY, key);
      else key = localStorage.getItem(OBJ_STORAGE_KEY);
    } catch (e) { /* Storage blockiert – egal */ }

    const entrance = ENTRANCES.find((e) => e.id === key);
    if (!entrance) return Object.assign({ key: null, label: CFG.SITE.name }, CFG.SITE);

    const { house } = entrance;
    const entranceCfg = house.entrances.find((e) => e.id === key);
    return Object.assign(
      {},
      CFG.SITE,
      house.overrides,
      entranceCfg.overrides,
      {
        key,
        houseId: house.id,
        houseName: house.name,
        entranceName: entrance.name,
        address: house.address,
        label: entrance.name, // z. B. "Lindenberger Str. 6"
      }
    );
  }

  const OBJ = resolveObject();

  /** Ersetzt {feld} im Text durch den Wert aus der Konfiguration. */
  function fill(text) {
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (OBJ[k] != null ? OBJ[k] : m));
  }

  /* ======================================================================
     2. Router
     ====================================================================== */

  const DEFAULT_VIEW = "notfall";
  const LEGAL_VIEWS = ["impressum", "datenschutz"]; // immer erreichbar, auch ohne Zustimmung
  const viewEnterHooks = {};
  const viewLeaveHooks = {};
  let currentView = null;
  let lastAppView = DEFAULT_VIEW;

  function showView(name) {
    const view = $(`.view[data-view="${name}"]`) || $(`.view[data-view="${DEFAULT_VIEW}"]`);
    const viewName = view.dataset.view;
    if (viewName === currentView) return;

    if (currentView && viewLeaveHooks[currentView]) viewLeaveHooks[currentView]();

    $$(".view").forEach((v) => { v.hidden = v !== view; });
    $("#viewTitle").textContent = view.dataset.title;
    document.title = `${view.dataset.title} · ${OBJ.label}`;

    const parent = view.dataset.parent;
    const activeTab = parent || viewName;
    $$(".tabbar__item").forEach((t) => {
      if (t.dataset.tab === activeTab) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });

    const back = $("#backBtn");
    back.hidden = !parent;
    if (parent) {
      const parentView = $(`.view[data-view="${parent}"]`);
      $("#backLabel").textContent = parentView ? parentView.dataset.title : "Zurück";
      back.setAttribute("aria-label", `Zurück zu ${$("#backLabel").textContent}`);
    }
    back.onclick = () => { location.hash = parent; };

    currentView = viewName;
    if (!LEGAL_VIEWS.includes(viewName)) lastAppView = viewName;
    window.scrollTo(0, 0);
    updateConsentUi();
    // Externe Dienste (Abfahrten, aponet) erst nach Zustimmung laden.
    if (hasConsent() && viewEnterHooks[viewName]) viewEnterHooks[viewName]();
  }

  /* ======================================================================
     Datenschutz-Zustimmung – bei jedem App-Start (gilt für die Sitzung)
     ====================================================================== */

  const CONSENT_KEY = "mieterapp.consent";
  const CONSENT_VERSION = "2026-09b"; // bei Änderung der Hinweise hochzählen
  let consentGiven = false;

  function hasConsent() {
    if (consentGiven) return true;
    try { consentGiven = sessionStorage.getItem(CONSENT_KEY) === CONSENT_VERSION; } catch (e) { /* blockiert */ }
    return consentGiven;
  }

  function updateConsentUi() {
    const needed = !hasConsent();
    const onLegalPage = LEGAL_VIEWS.includes(currentView);
    const dialog = $("#consent");
    const wasHidden = dialog.hidden;
    dialog.hidden = !needed || onLegalPage;
    $("#consentReturn").hidden = !needed || !onLegalPage;
    document.body.classList.toggle("has-modal", !dialog.hidden);
    if (wasHidden && !dialog.hidden) {
      showConsentStep("ask");
      $("#consentTitle").focus();
    }
  }

  function showConsentStep(step) {
    $("#consentAsk").hidden = step !== "ask";
    $("#consentDeclined").hidden = step !== "declined";
    $("#consent").scrollTop = 0;
  }

  function initConsent() {
    const check = $("#consentCheck");
    const accept = $("#consentAccept");
    $("#consentTitle").tabIndex = -1;
    check.addEventListener("change", () => { accept.disabled = !check.checked; });

    accept.addEventListener("click", () => {
      if (!check.checked) return;
      consentGiven = true;
      try { sessionStorage.setItem(CONSENT_KEY, CONSENT_VERSION); } catch (e) { /* nur für diese Seite */ }
      updateConsentUi();
      if (viewEnterHooks[currentView]) viewEnterHooks[currentView]();
    });
    $("#consentDecline").addEventListener("click", () => showConsentStep("declined"));
    $("#consentBack").addEventListener("click", () => showConsentStep("ask"));
    $("#consentReturn").addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = lastAppView;
    });
    // Links zu Impressum/Datenschutz im Dialog: Dialog ausblenden, Seite zeigen.
    $$("#consent a[href^='#']").forEach((a) => a.addEventListener("click", () => {
      $("#consent").hidden = true;
    }));

    $("#consentEmergency").innerHTML = contactItems(
      OBJ.emergencyContacts.filter((c) => c.danger || /hausmeister/i.test(c.label))
    );
  }

  function initRouter() {
    // Ohne bekannten Aufgang zuerst die Auswahl zeigen.
    if (!OBJ.key && !location.hash) history.replaceState(null, "", "#aufgang");
    const route = () => showView(location.hash.replace(/^#/, "") || DEFAULT_VIEW);
    window.addEventListener("hashchange", route);
    route();
  }

  /* ======================================================================
     Aufgang-Auswahl (falls die App ohne QR-Code-Link geöffnet wird)
     ====================================================================== */

  function renderEntrancePicker() {
    $("#entranceList").innerHTML = CFG.HOUSES.map((house) => `
      <div class="picker-group">
        <h2 class="section-title">${esc(house.name)}<span class="section-title__sub">${esc(house.address || "")}</span></h2>
        <div class="picker">
          ${house.entrances.map((e) => `
            <a class="picker__item${e.id === OBJ.key ? " is-active" : ""}" href="?obj=${encodeURIComponent(e.id)}#notfall">
              ${esc(e.name)}${e.id === OBJ.key ? '<span class="picker__check" aria-label="ausgewählt">✓</span>' : ""}
            </a>`).join("")}
        </div>
      </div>`).join("");
  }

  /* ======================================================================
     3. EPIC 1 – Information & Sicherheit
     ====================================================================== */

  // US 1.1 – Notfall-Dashboard
  function renderEmergency() {
    $("#emergencyList").innerHTML = contactItems(OBJ.emergencyContacts);
    $("#emergencyRules").innerHTML = renderAccordion(OBJ.emergencyRules, false);
  }

  function contactItems(list) {
    return list.map((c) => `
      <li>
        <a class="contact${c.danger ? " contact--danger" : ""}" href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">
          <span class="contact__icon" aria-hidden="true">${esc(c.icon || "📞")}</span>
          <span class="contact__body">
            <span class="contact__label">${esc(c.label)}</span>
            <span class="contact__sub">${esc(c.sub || formatPhone(c.phone))}</span>
          </span>
          <span class="contact__call" aria-hidden="true">📞</span>
        </a>
      </li>`).join("");
  }

  // US 1.2 – Kalender abonnieren
  // US 1.2 – Abfall: nächste Abholungen aus der BSR-.ics, Kalender-Abo, Sperrmüll, Trennhilfe
  function renderWaste() {
    const w = OBJ.waste;
    const icsAbs = new URL(w.icsUrl, location.href).href;
    // webcal:// öffnet auf iPhone und vielen Android-Geräten direkt das Kalender-Abo.
    $("#wasteSubscribe").href = icsAbs.replace(/^https?:\/\//, "webcal://");
    $("#wastePdf").href = w.pdfUrl;
    $("#bulkyLink").href = w.bulkyUrl;
    $("#sortingLink").href = w.sortingUrl;

    $("#wasteGuide").innerHTML = OBJ.wasteGuide.map((g) => `
      <details class="rule">
        <summary>${esc(g.title)}</summary>
        <div class="rule__body">
          ${g.no ? `<p><strong class="yes">Ja:</strong> ${esc(g.yes)}</p><p><strong class="no">Nein:</strong> ${esc(g.no)}</p>` : `<p>${esc(g.yes)}</p>`}
          ${g.tip ? `<p class="muted">Tipp: ${esc(g.tip)}</p>` : ""}
        </div>
      </details>`).join("");
  }

  let pickupsLoaded = false;
  async function loadPickups() {
    if (pickupsLoaded) return;
    const list = $("#pickupList");
    try {
      const res = await fetch(OBJ.waste.icsUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const events = parseIcsDates(await res.text());
      const start = today();
      const upcoming = events.filter((e) => e.date >= start).sort((a, b) => a.date - b.date);
      pickupsLoaded = true;
      if (!upcoming.length) {
        list.innerHTML = `<li class="muted">Keine weiteren Termine hinterlegt. Bitte Abfuhrkalender der BSR prüfen.</li>`;
        return;
      }
      list.innerHTML = upcoming.slice(0, 6).map((e) => {
        const type = OBJ.waste.types.find((t) => e.summary.includes(t.match)) || { label: e.summary, bin: "", color: "#999" };
        return `
          <li class="pickup">
            <span class="pickup__dot" style="background:${esc(type.color)}" aria-hidden="true"></span>
            <span class="pickup__what"><strong>${esc(type.label)}</strong><span class="muted">${esc(type.bin)}</span></span>
            <span class="pickup__when">${esc(relativeDay(e.date))}</span>
          </li>`;
      }).join("");
    } catch (err) {
      console.error("Abfuhrkalender:", err);
      list.innerHTML = `<li class="muted">Termine konnten nicht geladen werden. Bitte das PDF öffnen.</li>`;
    }
  }

  /** Liest ganztägige Termine (DTSTART;VALUE=DATE) und SUMMARY aus einer .ics-Datei. */
  function parseIcsDates(text) {
    const unfolded = text.replace(/\r?\n[ \t]/g, "");
    return unfolded.split("BEGIN:VEVENT").slice(1).map((block) => {
      const d = /DTSTART[^:]*:(\d{4})(\d{2})(\d{2})/.exec(block);
      const sum = /SUMMARY[^:]*:(.*)/.exec(block);
      return d ? { date: new Date(+d[1], d[2] - 1, +d[3]), summary: sum ? sum[1].trim() : "" } : null;
    }).filter(Boolean);
  }

  function relativeDay(date) {
    const diff = Math.round((date - today()) / 86400000);
    const label = date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    if (diff === 0) return `Heute · ${label}`;
    if (diff === 1) return `Morgen · ${label}`;
    return label;
  }

  // US 1.4 – Kiez-Guide, Dokumente, Apotheken-Notdienst
  function renderInfos() {
    $("#documentList").innerHTML = OBJ.documents.map((d) => `
      <li>
        <a class="link-item" href="${esc(d.url)}" target="_blank" rel="noopener"${d.url.endsWith(".vcf") ? " download" : ""}>
          <span class="link-item__icon" aria-hidden="true">${esc(d.icon || "📄")}</span>
          <span class="link-item__body">
            <span class="link-item__label">${esc(d.label)}</span>
            <span class="link-item__sub">${esc(d.sub || "")}</span>
          </span>
        </a>
      </li>`).join("");

    $("#kiezList").innerHTML = OBJ.kiez.map((g) => `
      <h3 class="subsection-title"><span aria-hidden="true">${esc(g.icon)}</span> ${esc(g.group)}</h3>
      <ul class="place-list">
        ${g.places.map((pl) => `
          <li class="place">
            <span class="place__body">
              <span class="place__name">${esc(pl.name)}</span>
              <span class="place__addr">${esc(pl.address)}${pl.note ? ` · ${esc(pl.note)}` : ""}</span>
            </span>
            <a class="btn btn--ghost btn--small" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pl.name + ", " + pl.address)}"
               target="_blank" rel="noopener" aria-label="${esc(pl.name)} auf der Karte zeigen">Karte</a>
          </li>`).join("")}
      </ul>`).join("");

    $("#pharmacyLink").href = OBJ.pharmacyUrl;

    // Sprungmarken oben auf der Seite
    $$(".jump a[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(a.dataset.jump).scrollIntoView({ behavior: "smooth" });
    }));
  }

  // Termine und iFrame erst beim Öffnen der Infos-Seite laden (spart Datenvolumen).
  viewEnterHooks.infos = () => {
    loadPickups();
    const frame = $("#pharmacyFrame");
    if (!frame.src) frame.src = OBJ.pharmacyUrl;
  };

  // US 1.3 – Live-ÖPNV-Monitor
  // Die kostenlosen transport.rest-Dienste sind oft überlastet. Strategie:
  //  1. Der zuletzt funktionierende Dienst wird zuerst gefragt; antwortet er nicht
  //     innerhalb von TRANSIT_HEDGE_SECONDS, werden die anderen parallel dazugenommen.
  //  2. Die erste gültige Antwort gewinnt, die übrigen Anfragen werden abgebrochen.
  //  3. Klappt nichts, werden die zuletzt geladenen Abfahrten angezeigt (mit Hinweis).
  //  4. Nach Fehlschlägen wird seltener neu versucht (bis max. 5 Minuten).
  const TRANSIT_CACHE_KEY = "mieterapp.departures";
  const TRANSIT_HEDGE_SECONDS = 3;
  const transit = { timer: null, loading: false, preferred: 0, failures: 0, nextTry: 0 };

  async function loadDepartures(force) {
    if (transit.loading) return;
    if (!force && Date.now() < transit.nextTry) return;
    transit.loading = true;
    const status = $("#transitStatus");
    status.textContent = "Lade Abfahrten …";
    status.classList.remove("is-error", "is-warn");

    const apis = CFG.TRANSIT_APIS;
    const order = apis.map((_, i) => (transit.preferred + i) % apis.length);
    const controllers = [];
    const problems = [];
    let settled = false;
    // Schlägt ein Dienst fehl, starten die übrigen sofort (statt erst nach der Wartezeit).
    let kick;
    const failedOnce = new Promise((res) => { kick = res; });

    const attempt = (i, delayMs) => new Promise((resolve, reject) => {
      const wait = delayMs ? Promise.race([new Promise((r) => setTimeout(r, delayMs)), failedOnce]) : Promise.resolve();
      wait.then(async () => {
        if (settled) return reject(new Error("nicht benötigt"));
        const api = apis[i];
        const ctrl = new AbortController();
        controllers.push(ctrl);
        try {
          const stopId = await resolveStopId(api, ctrl.signal);
          const data = await fetchJson(`${api}/stops/${encodeURIComponent(stopId)}/departures`
            + `?duration=60&results=${CFG.TRANSIT_RESULTS}&remarks=false&language=de`, ctrl.signal);
          // transport.rest v6 liefert { departures: [...] }, ältere Versionen ein Array.
          resolve({ i, departures: Array.isArray(data) ? data : data.departures || [] });
        } catch (err) {
          if (!settled) {
            console.warn(`ÖPNV über ${api} fehlgeschlagen:`, err);
            problems.push(`${new URL(api).hostname.split(".")[1]}: ${err.message}`);
          }
          kick();
          reject(err);
        }
      });
    });

    try {
      const result = await Promise.any(order.map((i, n) => attempt(i, n === 0 ? 0 : TRANSIT_HEDGE_SECONDS * 1000)));
      settled = true;
      controllers.forEach((c) => c.abort());
      transit.preferred = result.i;
      transit.failures = 0;
      transit.nextTry = 0;
      renderDepartures(result.departures);
      try {
        localStorage.setItem(TRANSIT_CACHE_KEY, JSON.stringify({ time: Date.now(), departures: result.departures }));
      } catch (e) { /* egal */ }
      status.textContent = `Stand ${formatTime(new Date())} Uhr · aktualisiert alle ${CFG.TRANSIT_REFRESH_SECONDS} s`;
    } catch (err) {
      settled = true;
      transit.failures++;
      const waitS = Math.min(300, CFG.TRANSIT_REFRESH_SECONDS * 2 ** (transit.failures - 1));
      transit.nextTry = Date.now() + waitS * 1000;
      const cached = readCachedDepartures();
      if (cached) {
        renderDepartures(cached.departures);
        status.textContent = `Live-Daten gerade nicht erreichbar – Fahrplan vom ${formatTime(new Date(cached.time))} Uhr. `
          + `Neuer Versuch in ${Math.round(waitS / 60) || 1} min.`;
        status.classList.add("is-warn");
      } else {
        $("#departures").innerHTML = "";
        status.textContent = "Abfahrten derzeit nicht verfügbar – der kostenlose Fahrplandienst antwortet nicht. "
          + `Neuer Versuch in ${Math.round(waitS / 60) || 1} min. (${problems.join(" · ")})`;
        status.classList.add("is-error");
      }
    } finally {
      transit.loading = false;
    }
  }

  /** Zuletzt geladene Abfahrten (max. 3 Stunden alt), nur noch künftige. */
  function readCachedDepartures() {
    try {
      const cached = JSON.parse(localStorage.getItem(TRANSIT_CACHE_KEY) || "null");
      if (!cached || Date.now() - cached.time > 3 * 3600 * 1000) return null;
      const now = Date.now() - 60 * 1000;
      const departures = cached.departures.filter((d) => new Date(d.when || d.plannedWhen).getTime() >= now);
      return departures.length ? { time: cached.time, departures } : null;
    } catch (e) {
      return null;
    }
  }

  /** fetch mit Zeitlimit, damit die Anzeige nicht endlos „lädt“. */
  async function fetchJson(url, outerSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CFG.TRANSIT_TIMEOUT_SECONDS * 1000);
    const onOuterAbort = () => ctrl.abort();
    if (outerSignal) outerSignal.addEventListener("abort", onOuterAbort);
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Zeitüberschreitung");
      if (err instanceof TypeError) throw new Error("nicht erreichbar");
      throw err;
    } finally {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener("abort", onOuterAbort);
    }
  }

  /**
   * Haltestellen-ID ermitteln: fest konfiguriert (id) oder per Namenssuche (query).
   * Das Suchergebnis wird je Dienst im Browser gespeichert, damit nur einmal gesucht wird.
   */
  async function resolveStopId(api, signal) {
    const stop = OBJ.transitStop;
    if (stop.id) return stop.id;

    const cacheKey = `mieterapp.stop.${new URL(api).hostname}.${stop.query}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return cached;
    } catch (e) { /* Storage blockiert */ }

    const data = await fetchJson(`${api}/locations?query=${encodeURIComponent(stop.query)}`
      + "&results=8&addresses=false&poi=false", signal);
    const results = (Array.isArray(data) ? data : [])
      .filter((r) => r.type === "stop" || r.type === "station");
    const wanted = (stop.match || stop.query).toLowerCase();
    const hit = results.find((r) => r.name.toLowerCase().includes(wanted));
    if (!hit) throw new Error("Haltestelle nicht gefunden");

    console.info(`Haltestelle "${hit.name}" hat bei ${api} die ID ${hit.id}.`);
    try { localStorage.setItem(cacheKey, hit.id); } catch (e) { /* egal */ }
    return hit.id;
  }

  function renderDepartures(list) {
    const ul = $("#departures");
    if (!list.length) {
      ul.innerHTML = `<li class="card muted">Keine Abfahrten in der nächsten Stunde.</li>`;
      return;
    }
    ul.innerHTML = list.map((d) => {
      const planned = new Date(d.plannedWhen || d.when);
      const delayMin = typeof d.delay === "number" ? Math.round(d.delay / 60) : null;
      let delayHtml = "";
      if (d.cancelled) delayHtml = `<span class="departure__delay delay--late">fällt aus</span>`;
      else if (delayMin === null) delayHtml = `<span class="departure__delay muted">Plan</span>`;
      else if (delayMin > 0) delayHtml = `<span class="departure__delay delay--late">+${delayMin} min</span>`;
      else delayHtml = `<span class="departure__delay delay--ok">pünktlich</span>`;

      const inMin = Math.max(0, Math.round((new Date(d.when || d.plannedWhen) - Date.now()) / 60000));
      const platform = d.platform ? ` · Gl. ${esc(d.platform)}` : "";
      const line = d.line || {};

      return `
        <li class="departure${d.cancelled ? " departure--cancelled" : ""}">
          <span class="departure__line" data-product="${esc(line.product || "")}">${esc(line.name || "?")}</span>
          <span class="departure__dir">${esc(d.direction || "")}
            <span class="departure__meta">in ${inMin} min${platform}</span>
          </span>
          <span class="departure__time">
            <span class="departure__planned">${formatTime(planned)}</span>
            ${delayHtml}
          </span>
        </li>`;
    }).join("");
  }

  function startTransit() {
    stopTransit();
    loadDepartures(true);
    transit.timer = setInterval(() => {
      if (document.visibilityState === "visible") loadDepartures();
    }, CFG.TRANSIT_REFRESH_SECONDS * 1000);
  }
  function stopTransit() {
    clearInterval(transit.timer);
    transit.timer = null;
  }

  viewEnterHooks.oepnv = startTransit;
  viewLeaveHooks.oepnv = stopTransit;

  function initTransit() {
    $("#transitStop").textContent = OBJ.transitStop.name;
    if (OBJ.transitStop.infoUrl) {
      const link = $("#transitInfo");
      link.href = OBJ.transitStop.infoUrl;
      link.hidden = false;
    }
    $("#transitRefresh").addEventListener("click", () => loadDepartures(true));
    // Nach Rückkehr in die App sofort aktualisieren.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && currentView === "oepnv" && hasConsent()) loadDepartures();
    });
  }

  /* ======================================================================
     4. EPIC 2 – Formulare, Zähler & Services
     ====================================================================== */

  // US 2.1 – Wasserzähler
  // Mehrere Zähler pro Meldung. Zählernummern, Raum und Art werden auf dem Gerät
  // gemerkt, damit bei der nächsten Ablesung nur noch Stand und Foto nötig sind.
  const METERS_KEY = "mieterapp.meters";
  const MAX_METERS = 8;
  let meterSeq = 0;

  function initWaterForm() {
    const form = $("#formWater");
    const list = $("#meterList");

    const renumber = () => {
      const cards = $$(".meter", list);
      cards.forEach((c, i) => {
        $(".meter__title", c).textContent = `Zähler ${i + 1}`;
        $(".meter__remove", c).hidden = cards.length === 1;
      });
      $("#addMeter").hidden = cards.length >= MAX_METERS;
      $("#waterSubmit").textContent = cards.length === 1
        ? "Zählerstand senden" : `${cards.length} Zählerstände senden`;
    };

    const addMeter = (preset = {}) => {
      const id = ++meterSeq;
      list.insertAdjacentHTML("beforeend", `
        <fieldset class="meter form-block" data-meter="${id}">
          <div class="meter__head">
            <legend class="form-block__title meter__title">Zähler</legend>
            <button class="meter__remove" type="button" aria-label="Diesen Zähler entfernen">Entfernen</button>
          </div>
          <div class="field-row">
            <label class="field">
              <span class="field__label">Raum *</span>
              <select data-f="raum" required>
                ${OBJ.waterRooms.map((r) => `<option${r === preset.raum ? " selected" : ""}>${esc(r)}</option>`).join("")}
              </select>
            </label>
            <div class="field">
              <span class="field__label">Art *</span>
              <div class="segmented">
                <label><input type="radio" name="art-${id}" value="Kalt" required${preset.art !== "Warm" ? " checked" : ""}><span>Kalt</span></label>
                <label><input type="radio" name="art-${id}" value="Warm"${preset.art === "Warm" ? " checked" : ""}><span>Warm</span></label>
              </div>
            </div>
          </div>
          <div class="field-row">
            <label class="field">
              <span class="field__label">Zählernummer *</span>
              <input data-f="zaehlernummer" required autocomplete="off" value="${esc(preset.zaehlernummer || "")}" placeholder="auf dem Zähler">
            </label>
            <label class="field">
              <span class="field__label">Stand (m³) *</span>
              <input data-f="zaehlerstand" required inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,3})?" placeholder="123,456">
            </label>
          </div>
          <label class="field">
            <span class="field__label">Foto des Zählers *</span>
            <input type="file" data-f="foto" accept="image/*" capture="environment" required>
            <img class="photo-preview" alt="Vorschau" hidden>
          </label>
        </fieldset>`);
      const card = list.lastElementChild;
      const file = $('[data-f="foto"]', card);
      const img = $(".photo-preview", card);
      file.addEventListener("change", () => {
        if (img.src) URL.revokeObjectURL(img.src);
        if (!file.files[0]) { img.hidden = true; img.removeAttribute("src"); return; }
        img.src = URL.createObjectURL(file.files[0]);
        img.hidden = false;
      });
      $(".meter__remove", card).addEventListener("click", () => { card.remove(); renumber(); });
      renumber();
      return card;
    };

    const rebuild = () => {
      list.innerHTML = "";
      const saved = readJson(METERS_KEY);
      const presets = saved && Array.isArray(saved.meters) && saved.meters.length ? saved.meters : [{}];
      presets.slice(0, MAX_METERS).forEach((m) => addMeter(m));
      $("#meterHint").hidden = !(saved && saved.meters && saved.meters.length);
      const date = $("#waterDate");
      date.max = toIsoDate(today());
      date.value = toIsoDate(today());
    };

    $("#addMeter").addEventListener("click", () => {
      const card = addMeter();
      $('[data-f="zaehlernummer"]', card).focus();
    });
    form.addEventListener("app:reset", rebuild);
    rebuild();

    bindForm("#formWater", async () => {
      const f = form.elements;
      const meters = [];
      for (const card of $$(".meter", list)) {
        meters.push({
          raum: $('[data-f="raum"]', card).value,
          art: $('input[type="radio"]:checked', card).value,
          zaehlernummer: $('[data-f="zaehlernummer"]', card).value.trim(),
          zaehlerstand: $('[data-f="zaehlerstand"]', card).value.trim().replace(",", "."),
          photo: await readPhoto($('[data-f="foto"]', card).files[0]),
        });
      }
      return {
        action: "submitMeterReadings",
        type: "Wasserzähler",
        wohnung: f.wohnung.value.trim(),
        name: f.name.value.trim(),
        ablesedatum: f.ablesedatum.value,
        meters,
      };
    }, "Danke! Ihre Zählerstände wurden übermittelt.", null, (payload) => {
      // Nach Erfolg: Zähler (ohne Stand/Foto) für die nächste Ablesung merken – nur wenn gewünscht
      if (!form.elements.remember || !form.elements.remember.checked) return;
      writeJson(METERS_KEY, {
        wohnung: payload.wohnung,
        meters: payload.meters.map(({ raum, art, zaehlernummer }) => ({ raum, art, zaehlernummer })),
      });
    });
  }

  // US 2.2 – Stromzähler via WhatsApp-Deep-Link
  function initPowerForm() {
    $("#formPower").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      if (!validate(form)) return;
      const wohnung = form.elements.wohnung.value.trim();
      const where = OBJ.key ? ` (${OBJ.label})` : "";
      const text = `Hallo, ich benötige den Zählerstand/Zugang für Wohnung ${wohnung}${where}.`;
      const url = `https://wa.me/${OBJ.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener");
    });
  }

  // US 2.3 – Elektroraum mit 2-Werktage-Bremse
  function initElectricForm() {
    const input = $("#electricDate");
    const hint = $("#electricDateHint");
    let minDate, defaultHint;

    // Bei jedem Öffnen neu berechnen – die App kann über Nacht offen bleiben.
    const refreshMin = () => {
      minDate = addWorkdays(today(), 2);
      input.min = toIsoDate(minDate);
      defaultHint = `Frühester Termin: ${formatDateLong(minDate)}. Keine Wochenenden.`;
      if (!input.value) { hint.textContent = defaultHint; hint.classList.remove("is-error"); }
    };
    refreshMin();
    viewEnterHooks.elektro = refreshMin;
    $("#formElectric").addEventListener("app:reset", () => { input.setCustomValidity(""); refreshMin(); });

    const check = () => {
      const msg = validateWorkday(input.value, minDate);
      input.setCustomValidity(msg);
      hint.textContent = msg || (input.value ? `Gewählt: ${formatDateLong(parseIsoDate(input.value))}` : defaultHint);
      hint.classList.toggle("is-error", !!msg);
      return !msg;
    };
    input.addEventListener("input", check);
    input.addEventListener("change", () => {
      // Wochenende/zu früh gewählt → Feld leeren, damit der Wert nicht versehentlich gesendet wird.
      if (!check() && input.value) {
        const msg = input.validationMessage;
        input.value = "";
        input.setCustomValidity("Bitte einen Termin wählen.");
        hint.textContent = msg;
      }
    });

    bindForm("#formElectric", (form) => {
      const f = form.elements;
      return {
        action: "submitTicket",
        type: "Elektroraum",
        wohnung: f.wohnung.value.trim(),
        date: f.date.value,
        name: f.name.value.trim(),
        details: f.details.value.trim(),
        telefon: f.telefon.value.trim(),
      };
    }, "Danke! Der Termin wurde angemeldet.", () => check());
  }

  // US 2.4a – Klingelschild
  function initBellForm() {
    bindForm("#formBell", (form) => {
      const f = form.elements;
      return {
        action: "submitTicket",
        type: "Klingelschild",
        wohnung: f.wohnung.value.trim(),
        name: f.name.value.trim(),
        details: f.details.value.trim(),
        kontakt: f.kontakt.value.trim(),
      };
    }, "Danke! Ihr Antrag ist eingegangen.");
  }

  // US 2.4b – Mängelmeldung (Foto optional)
  function initDefectForm() {
    bindForm("#formDefect", async (form) => {
      const f = form.elements;
      return {
        action: "submitTicket",
        type: "Mangel",
        ort: f.ort.value,
        wohnung: f.wohnung.value.trim(),
        name: f.name.value.trim(),
        details: f.details.value.trim(),
        photo: f.foto.files[0] ? await readPhoto(f.foto.files[0]) : null,
      };
    }, "Danke! Ihre Meldung wurde übermittelt.");
  }

  /**
   * Gemeinsamer Submit-Ablauf: validieren → Payload bauen → POST → Feedback.
   * @param {string} selector       Formular-Selektor
   * @param {Function} buildPayload (form) => Payload (darf async sein)
   * @param {string} successMsg     Text für die Erfolgsmeldung
   * @param {Function} [preValidate] zusätzliche Prüfung vor checkValidity()
   */
  function bindForm(selector, buildPayload, successMsg, preValidate, onSuccess) {
    const form = $(selector);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (preValidate) preValidate();
      if (!validate(form)) return;

      const btn = form.querySelector('[type="submit"]');
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Wird gesendet …";

      try {
        const payload = await buildPayload(form);
        payload.object = OBJ.key;          // Aufgang-ID, z. B. "lind6"
        payload.house = OBJ.houseName || "";
        payload.entrance = OBJ.entranceName || "";
        payload.website = form.elements.website ? form.elements.website.value : ""; // Honeypot
        payload.submittedAt = new Date().toISOString();
        await postToBackend(payload);
        rememberProfile(form);
        if (onSuccess) onSuccess(payload);
        toast(successMsg, "ok");
        form.reset();
        prefillProfile();
        form.classList.remove("was-validated");
        $$(".photo-preview", form).forEach((img) => { img.hidden = true; img.removeAttribute("src"); });
        form.dispatchEvent(new Event("app:reset"));
      } catch (err) {
        console.error(err);
        toast(err.userMessage || "Senden fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = label;
      }
    });
  }

  function validate(form) {
    form.classList.add("was-validated");
    if (form.checkValidity()) return true;
    const firstInvalid = form.querySelector(":invalid");
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.reportValidity();
    }
    return false;
  }

  // Wohnung und Name auf dem Gerät merken (nur wenn gewünscht) und in alle Formulare vorbelegen.
  const PROFILE_KEY = "mieterapp.profile";

  function initProfile() {
    $$("form.form").forEach((form) => {
      if (!form.elements.wohnung || form.id === "formPower") return;
      const submit = form.querySelector('[type="submit"]');
      submit.insertAdjacentHTML("beforebegin", `
        <label class="remember">
          <input type="checkbox" name="remember" checked>
          <span>Wohnung und Name auf diesem Gerät merken</span>
        </label>`);
    });
    prefillProfile();
  }

  function prefillProfile() {
    const p = readJson(PROFILE_KEY);
    if (!p) return;
    $$("form.form").forEach((form) => {
      ["wohnung", "name"].forEach((k) => {
        const el = form.elements[k];
        if (el && !el.value && p[k]) el.value = p[k];
      });
    });
  }

  function rememberProfile(form) {
    const remember = form.elements.remember;
    if (!remember) return;
    if (!remember.checked) {
      try { localStorage.removeItem(PROFILE_KEY); localStorage.removeItem(METERS_KEY); } catch (e) { /* egal */ }
      return;
    }
    const prev = readJson(PROFILE_KEY) || {};
    const next = {
      wohnung: form.elements.wohnung ? form.elements.wohnung.value.trim() || prev.wohnung : prev.wohnung,
      name: form.elements.name ? form.elements.name.value.trim() || prev.name : prev.name,
    };
    writeJson(PROFILE_KEY, next);
  }

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* egal */ }
  }

  function initPhotoPreviews() {
    $$('input[type="file"][data-preview]').forEach((input) => {
      input.addEventListener("change", () => {
        const img = document.getElementById(input.dataset.preview);
        const file = input.files[0];
        if (img.src) URL.revokeObjectURL(img.src);
        if (!file) { img.hidden = true; img.removeAttribute("src"); return; }
        img.src = URL.createObjectURL(file);
        img.hidden = false;
      });
    });
  }

  /* ======================================================================
     5. Hilfsfunktionen
     ====================================================================== */

  // ---------- Backend (Google Apps Script) ----------

  /**
   * POST an die Apps-Script-Web-App.
   * Content-Type "text/plain" ist Absicht: So entsteht kein CORS-Preflight,
   * den Apps Script nicht beantworten kann. Im Script: JSON.parse(e.postData.contents).
   */
  async function postToBackend(payload) {
    try {
      return await postJson(payload);
    } catch (err) {
      // Übergang: älteres Backend kennt die Mehrfach-Meldung noch nicht → Zähler einzeln senden.
      if (payload.action === "submitMeterReadings" && err.userMessage === "Unbekannte Aktion") {
        const { meters, ...common } = payload;
        for (const m of meters) await postJson({ ...common, ...m, action: "submitMeterReading" });
        return { ok: true };
      }
      throw err;
    }
  }

  async function postJson(payload) {
    if (!hasConsent()) {
      const err = new Error("Keine Zustimmung");
      err.userMessage = "Bitte stimmen Sie zuerst den Datenschutzhinweisen zu.";
      throw err;
    }
    if (!CFG.API_URL) {
      console.info("[Demo-Modus] POST-Payload:", payload);
      await new Promise((r) => setTimeout(r, 600));
      return { ok: true, demo: true };
    }
    const res = await fetch(CFG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    if (data.ok === false) {
      const err = new Error(data.error || "Backend-Fehler");
      err.userMessage = data.error; // z. B. "Termin frühestens in 2 Werktagen möglich"
      throw err;
    }
    return data;
  }

  // ---------- Foto → verkleinertes JPEG als Base64 ----------

  async function readPhoto(file) {
    if (!file) return null;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Bild konnte nicht gelesen werden"));
        i.src = url;
      });
      const scale = Math.min(1, CFG.PHOTO_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", CFG.PHOTO_QUALITY);
      return {
        name: file.name.replace(/\.[^.]+$/, "") + ".jpg",
        mimeType: "image/jpeg",
        data: dataUrl.split(",")[1], // reines Base64 ohne "data:"-Präfix
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------- Datum & Werktage ----------
  // Alle Berechnungen in lokaler Zeit. Bewusst NICHT toISOString() verwenden,
  // da das in UTC umrechnet und nachts in Deutschland den Vortag liefert.

  function today() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // So = 0, Sa = 6
  }

  /** Addiert n Werktage (Mo–Fr). Feiertage werden im MVP ignoriert. */
  function addWorkdays(start, n) {
    const d = new Date(start);
    let added = 0;
    while (added < n) {
      d.setDate(d.getDate() + 1);
      if (!isWeekend(d)) added++;
    }
    return d;
  }

  function toIsoDate(d) {
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parseIsoDate(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  /** Liefert "" wenn gültig, sonst eine Fehlermeldung. */
  function validateWorkday(value, minDate) {
    if (!value) return "Bitte einen Termin wählen.";
    const date = parseIsoDate(value);
    if (isNaN(date)) return "Ungültiges Datum.";
    if (isWeekend(date)) return "Am Wochenende ist kein Zugang möglich. Bitte Mo–Fr wählen.";
    if (date < minDate) return `Frühestens ab ${formatDateLong(minDate)} möglich (2 Werktage Vorlauf).`;
    return "";
  }

  function formatDateLong(d) {
    return d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function formatTime(d) {
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }
  function formatPhone(p) {
    return p.replace(/^\+49/, "0");
  }

  // ---------- UI ----------

  function renderAccordion(items, openFirst) {
    return items.map((r, i) => `
      <details class="rule"${openFirst && i === 0 ? " open" : ""}>
        <summary>${esc(fill(r.title))}</summary>
        <p>${esc(fill(r.text))}</p>
        ${r.actions ? `<div class="rule__actions">${r.actions.map(actionButton).join("")}</div>` : ""}
      </details>`).join("");
  }

  /** Direkt-Button (Anruf oder WhatsApp) für Verhaltensregeln. */
  function actionButton(a) {
    if (a.type === "tel") {
      return `<a class="btn btn--primary btn--block" href="tel:${esc(a.phone)}">📞 ${esc(a.label)}</a>`;
    }
    if (a.type === "whatsapp") {
      const url = `https://wa.me/${OBJ.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(fill(a.text))}`;
      return `<a class="btn btn--whatsapp btn--block" href="${esc(url)}" target="_blank" rel="noopener">💬 ${esc(a.label)}</a>`;
    }
    return "";
  }

  let toastTimer;
  function toast(msg, kind) {
    const el = $("#toast");
    el.textContent = (kind === "ok" ? "✓ " : "") + msg;
    el.className = `toast${kind ? " toast--" + kind : ""}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4500);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  /* ======================================================================
     Start
     ====================================================================== */

  function init() {
    $("#objectName").textContent = OBJ.key ? OBJ.label : "Bitte Adresse wählen";
    $("#demoBanner").hidden = !!CFG.API_URL;
    $("#siteName").textContent = CFG.SITE.name;
    const provider = $("#providerLink");
    provider.textContent = CFG.PROVIDER.name;
    provider.href = CFG.PROVIDER.url;

    // Unsichtbares Honeypot-Feld in jedes Formular: Bots füllen es aus, Menschen nicht.
    $$("form.form").forEach((form) => form.insertAdjacentHTML("beforeend",
      '<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>'));

    renderEntrancePicker();
    renderEmergency();
    renderWaste();
    renderInfos();
    initTransit();

    initWaterForm();
    initPowerForm();
    initElectricForm();
    initBellForm();
    initDefectForm();
    initPhotoPreviews();
    initProfile();

    initConsent();
    initRouter();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service Worker:", e));
    }
  }

  // Für Tests in der Browser-Konsole.
  window.MieterApp = { addWorkdays, isWeekend, toIsoDate, validateWorkday };

  init();
})();

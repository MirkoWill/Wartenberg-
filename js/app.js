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

  // Keine automatische „App installieren“-Einblendung: Manche Handys blockieren die dabei erzeugte
  // Android-App („für ältere Android-Version“). Die App läuft im Browser; wer ein Symbol möchte, nutzt
  // bewusst Menü ⋮ → „Zum Startbildschirm hinzufügen“.
  window.addEventListener("beforeinstallprompt", (e) => e.preventDefault());

  // Größere Schrift (Schalter „A+“), sofort anwenden, damit nichts springt.
  const TEXT_KEY = "mieterapp.textsize";
  try { if (localStorage.getItem(TEXT_KEY) === "large") document.documentElement.classList.add("text-large"); } catch (e) { /* egal */ }

  // Fehlerüberwachung: unerwartete Fehler (nur nach Zustimmung, max. 5 je Sitzung, ohne persönliche
  // Daten) an die Verwaltung melden – Blatt „Fehlerprotokoll“, Systemprüfung per Mail.
  const APP_VERSION = ((document.querySelector('script[src*="app.js"]') || {}).src || "").replace(/.*v=/, "") || "?";
  const reportedErrors = new Set();
  function reportError(message, source) {
    try {
      const msg = String(message || "").slice(0, 300);
      if (!msg || !CFG.API_URL || reportedErrors.size >= 5 || reportedErrors.has(msg) || !hasConsent()) return;
      reportedErrors.add(msg);
      const s = readJson("mieterapp.staff");
      fetch(CFG.API_URL, {
        method: "POST", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "reportError", message: msg, source: String(source || "").slice(0, 200),
          view: location.hash.slice(1, 40), browser: navigator.userAgent.slice(0, 200), version: APP_VERSION,
          pin: storedPin(), token: s && s.token }),
      }).catch(() => {});
    } catch (e) { /* Melden darf nie selbst stören */ }
  }
  window.addEventListener("error", (e) => reportError(e.message, `${String(e.filename || "").split("/").pop()}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => reportError((e.reason && e.reason.message) || e.reason, "promise"));

  const CFG = window.APP_CONFIG;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ======================================================================
     0. Sprache (Deutsch = Quelle; Übersetzungen in js/i18n.js)
     ====================================================================== */

  const I18N = window.I18N || { LANGS: [{ code: "de", label: "Deutsch", locale: "de-DE" }], T: {} };
  const LANG_KEY = "mieterapp.lang";
  const LANG = (() => {
    const codes = I18N.LANGS.map((l) => l.code);
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (codes.includes(saved)) return saved;
    } catch (e) { /* egal */ }
    const browser = (navigator.languages || [navigator.language || "de"]).map((l) => String(l).slice(0, 2).toLowerCase());
    return browser.find((l) => codes.includes(l)) || "de";
  })();
  const LANG_INDEX = I18N.LANGS.findIndex((l) => l.code === LANG) - 1; // -1 = Deutsch
  const LOCALE = () => (I18N.LANGS.find((l) => l.code === LANG) || {}).locale || "de-DE";
  const norm = (text) => String(text).replace(/\s+/g, " ").trim();

  /** Übersetzt einen deutschen Text; {name}-Platzhalter werden danach ersetzt. */
  function t_(de, vars) {
    let out = de;
    if (LANG_INDEX >= 0) {
      const entry = I18N.T[norm(de)];
      if (entry && entry[LANG_INDEX]) out = entry[LANG_INDEX];
    }
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return out;
  }

  /** Übersetzt Textknoten und Attribute unterhalb von root (außer in [data-no-i18n]). */
  function translateDom(root) {
    if (LANG_INDEX < 0 || !root) return;
    const skip = (el) => el && el.closest && el.closest("[data-no-i18n], script, style");
    if (root.nodeType === 3) {
      if (!skip(root.parentElement)) translateText(root);
      return;
    }
    if (root.nodeType !== 1 || skip(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => { if (!skip(n.parentElement)) translateText(n); });
    [root, ...root.querySelectorAll("[placeholder],[aria-label],[title],[alt],[data-title]")].forEach((el) => {
      if (skip(el)) return;
      ["placeholder", "aria-label", "title", "alt"].forEach((a) => {
        if (el.hasAttribute && el.hasAttribute(a)) {
          const v = el.getAttribute(a);
          const tr = t_(v);
          if (tr !== v) el.setAttribute(a, tr);
        }
      });
    });
  }

  function translateText(node) {
    const raw = node.nodeValue;
    const key = norm(raw);
    if (!key || !/[A-Za-zÄÖÜäöüß]/.test(key)) return;
    const tr = t_(key);
    if (tr !== key) node.nodeValue = raw.replace(raw.trim(), tr);
  }

  /** Später eingefügte Inhalte (Listen, Hinweise, Zählerkarten …) automatisch übersetzen. */
  function watchTranslations() {
    if (LANG_INDEX < 0) return;
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(translateDom)))
      .observe(document.body, { childList: true, subtree: true });
  }

  function initLanguage() {
    document.documentElement.lang = LANG;
    document.body.classList.toggle("lang-de", LANG === "de");
    $("#langCode").textContent = LANG.toUpperCase();
    $$(".lang-options").forEach((box) => {
      box.innerHTML = I18N.LANGS.map((l) => `
        <button type="button" class="lang__opt${l.code === LANG ? " is-active" : ""}" data-lang="${l.code}" lang="${l.code}"
          ${l.code === LANG ? 'aria-current="true"' : ""}>${esc(l.label)}</button>`).join("");
    });
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".lang__opt");
      if (!btn) return;
      if (btn.dataset.lang === LANG) { $("#langMenu").open = false; return; }
      try { localStorage.setItem(LANG_KEY, btn.dataset.lang); } catch (e2) { /* egal */ }
      location.reload();
    });
  }

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
    // Umbenannte Aufgänge (alte Links/gespeicherte Auswahl weiter gültig).
    const alias = (id) => ({ dorf27: "dorf24" }[id] || id);
    const fromUrl = alias(new URLSearchParams(location.search).get("obj"));
    const known = (id) => ENTRANCES.some((e) => e.id === id);
    let key = known(fromUrl) ? fromUrl : null;

    // Beim Start vom Homescreen fehlt der Parameter evtl. – letzten Aufgang merken.
    try {
      if (!key) key = alias(localStorage.getItem(OBJ_STORAGE_KEY));
      if (key) localStorage.setItem(OBJ_STORAGE_KEY, key);
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
    // Ansicht per Vergleich suchen, nicht per Selektor: Die Adresse (#…) kann beliebigen Text enthalten.
    const byName = (n) => $$(".view").find((v) => v.dataset.view === n);
    const view = byName(name) || byName(DEFAULT_VIEW);
    const viewName = view.dataset.view;
    if (viewName === currentView) return;

    if (currentView && viewLeaveHooks[currentView]) viewLeaveHooks[currentView]();

    $$(".view").forEach((v) => { v.hidden = v !== view; });
    $("#viewTitle").textContent = t_(view.dataset.title);
    document.title = `${t_(view.dataset.title)} · ${OBJ.label}`;

    const parent = view.dataset.parent;
    const activeTab = parent || viewName;
    $$(".tabbar__item").forEach((t) => {
      if (String(t.dataset.tab).split(" ").includes(activeTab)) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });

    const back = $("#backBtn");
    back.hidden = !parent;
    if (parent) {
      const parentView = byName(parent);
      $("#backLabel").textContent = t_(parentView ? parentView.dataset.title : "Zurück");
      back.setAttribute("aria-label", t_("Zurück zu {ziel}", { ziel: $("#backLabel").textContent }));
    }
    back.onclick = () => { location.hash = parent; };

    currentView = viewName;
    if (!LEGAL_VIEWS.includes(viewName)) lastAppView = viewName;
    window.scrollTo(0, 0);
    updateConsentUi();
    // Externe Dienste (z. B. Abfahrten) erst nach Zustimmung laden.
    if (hasConsent() && viewEnterHooks[viewName]) viewEnterHooks[viewName]();
  }

  /* ======================================================================
     Datenschutz-Zustimmung – bei jedem App-Start (gilt für die Sitzung)
     ====================================================================== */

  const CONSENT_KEY = "mieterapp.consent";
  const CONSENT_VERSION = "2026-09b"; // bei Änderung der Hinweise hochzählen → alle stimmen neu zu
  const CONSENT_DAYS = 30;            // danach wird die Zustimmung erneut abgefragt
  let consentGiven = false;

  /** Gültige Zustimmung (höchstens 30 Tage alt, aktuelle Fassung) UND gültige PIN auf diesem Gerät. */
  function hasConsent() {
    if (!pinOk()) return false;
    if (consentGiven) return true;
    const c = readJson(CONSENT_KEY);
    consentGiven = !!(c && c.v === CONSENT_VERSION && Date.now() - c.at < CONSENT_DAYS * 86400000);
    return consentGiven;
  }

  /** Zustimmung und PIN auf diesem Gerät löschen (Widerruf). */
  function revokeConsent() {
    consentGiven = false;
    sessionPin = null;
    localRemove(CONSENT_KEY);
    localRemove(PIN_KEY);
    try { sessionStorage.removeItem(CONSENT_KEY); sessionStorage.removeItem(PIN_KEY); } catch (e) { /* egal */ }
  }

  /* ---------- Zugangs-PIN (einmal pro Gerät; 3 Fehlversuche → 15 Minuten Sperre) ---------- */

  const PIN_KEY = "mieterapp.pin";
  const PIN_LOCK_KEY = "mieterapp.pinlock";
  let pinTimer = null;
  let sessionPin = null; // Ersatz, falls der Gerätespeicher blockiert ist

  /** Gespeicherte PIN, sofern sie zur aktuell gültigen PIN passt (sonst ""). */
  function storedPin() {
    let saved = null;
    saved = readJson(PIN_KEY);
    if (!saved && sessionPin) saved = sessionPin;
    return saved && saved.hash === CFG.PIN_SHA256 ? String(saved.pin || "") : "";
  }
  function pinOk() { return !CFG.PIN_SHA256 || isStaff() || !!storedPin(); } // Hausmeister: persönlicher Link statt PIN

  function pinLock() { return readJson(PIN_LOCK_KEY) || { fails: 0, until: 0 }; }
  function pinLockedFor() { return Math.max(0, pinLock().until - Date.now()); }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /** Prüft die eingegebene PIN. Gibt true zurück, wenn sie stimmt. */
  async function checkPinInput() {
    const input = $("#pinInput");
    const msg = $("#pinMsg");
    const pin = input.value.trim();
    if (pinLockedFor()) { updatePinUi(); return false; }
    if (!/^\d{5}$/.test(pin)) {
      msg.textContent = t_("Bitte die 5-stellige PIN eingeben.");
      input.focus();
      return false;
    }
    if ((await sha256Hex(pin)) === CFG.PIN_SHA256) {
      sessionPin = { pin, hash: CFG.PIN_SHA256 };
      writeJson(PIN_KEY, sessionPin); // bleibt auf dem Gerät, bis die PIN sich ändert oder widerrufen wird
      localRemove(PIN_LOCK_KEY);
      msg.textContent = "";
      return true;
    }
    const lock = pinLock();
    lock.fails = (lock.fails || 0) + 1;
    const max = CFG.PIN_MAX_TRIES || 3;
    if (lock.fails >= max) {
      lock.fails = 0;
      lock.until = Date.now() + (CFG.PIN_LOCK_MINUTES || 15) * 60000;
    }
    writeJson(PIN_LOCK_KEY, lock);
    input.value = "";
    if (lock.until > Date.now()) updatePinUi();
    else {
      msg.textContent = t_("Falsche PIN. Noch {n} Versuch(e).", { n: max - lock.fails });
      input.focus();
    }
    return false;
  }

  /** PIN-Feld ein-/ausblenden, Sperre mit Restzeit anzeigen. */
  function updatePinUi() {
    const box = $("#consentPin");
    if (!box) return;
    const needPin = !pinOk();
    box.hidden = !needPin;
    const input = $("#pinInput");
    const locked = needPin ? pinLockedFor() : 0;
    input.disabled = !!locked;
    clearTimeout(pinTimer);
    if (locked) {
      $("#pinMsg").textContent = t_("Zu viele Fehlversuche. Bitte in {n} Minute(n) erneut versuchen.",
        { n: Math.ceil(locked / 60000) });
      pinTimer = setTimeout(updatePinUi, Math.min(locked, 30000));
    } else if (input.dataset.wasLocked) {
      $("#pinMsg").textContent = "";
    }
    input.dataset.wasLocked = locked ? "1" : "";
    updateAcceptButton();
  }

  function updateAcceptButton() {
    const accept = $("#consentAccept");
    const checked = $("#consentCheck").checked;
    const pinReady = pinOk() || (!pinLockedFor() && $("#pinInput").value.trim().length === 5);
    accept.disabled = !(checked && pinReady);
  }

  /** Backend meldet „PIN ungültig“ (z. B. nach PIN-Wechsel): neu abfragen. */
  let pinRejectedAt = 0;
  function handlePinRejected() {
    // Schutz vor einer Endlosschleife (Dialog immer wieder): höchstens einmal pro Minute neu fragen.
    if (isStaff() || Date.now() - pinRejectedAt < 60000) {
      toast(t_("Der Server hat den Zugang abgelehnt. Bitte später erneut versuchen oder die Hausverwaltung informieren."), "error", 8000);
      return;
    }
    pinRejectedAt = Date.now();
    revokeConsent();
    $("#pinInput").value = "";
    $("#pinMsg").textContent = t_("Die PIN hat sich geändert. Bitte die aktuelle PIN vom Aushang eingeben.");
    updateConsentUi();
  }

  function localRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* egal */ }
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
    if (!dialog.hidden) updatePinUi();
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
    check.addEventListener("change", updateAcceptButton);
    const pinInput = $("#pinInput");
    pinInput.addEventListener("input", () => {
      pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 5);
      if (!pinLockedFor()) $("#pinMsg").textContent = "";
      updateAcceptButton();
    });
    pinInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !accept.disabled) accept.click();
    });

    accept.addEventListener("click", async () => {
      if (!check.checked) return;
      if (!pinOk() && !(await checkPinInput())) { updateAcceptButton(); return; }
      consentGiven = true;
      writeJson(CONSENT_KEY, { v: CONSENT_VERSION, at: Date.now() });
      updateConsentUi();
      if (viewEnterHooks[currentView]) viewEnterHooks[currentView]();
      maybeShowIntro();
    });
    $("#consentDecline").addEventListener("click", () => showConsentStep("declined"));
    $("#consentRevoke").addEventListener("click", () => {
      revokeConsent();
      toast(t_("Zustimmung widerrufen. Die App fragt beim nächsten Öffnen erneut."), "ok");
      $("#consentRevoke").disabled = true;
    });
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
      OBJ.emergencyContacts.filter((c) => c.level || c.danger)
    );
  }

  /* ======================================================================
     Meine Meldungen – Nummern auf dem Gerät merken, Status beim Backend abfragen
     ====================================================================== */

  const TICKETS_KEY = "mieterapp.tickets";
  const STATUS_LABEL = {
    offen: "offen", "in Arbeit": "in Arbeit", erledigt: "erledigt",
    eingegangen: "eingegangen", "geprüft": "geprüft", unbekannt: "nicht gefunden",
  };

  function rememberTicket(id, type) {
    const list = (readJson(TICKETS_KEY) || []).filter((t) => t.id !== id);
    list.unshift({ id, type: type || "", date: new Date().toISOString() });
    writeJson(TICKETS_KEY, list.slice(0, 20));
  }

  function renderStatusList(statusById = {}) {
    const list = readJson(TICKETS_KEY) || [];
    $("#statusEmpty").hidden = list.length > 0;
    $("#statusRefresh").hidden = !list.length;
    $("#statusList").innerHTML = list.map((t) => {
      const st = statusById[t.id];
      const status = st ? st.status : null;
      const type = (st && st.type) || t.type || (t.id[0] === "E" ? "Zählerstände" : "Meldung");
      const date = new Date((st && st.created) || t.date);
      return `
        <li class="status-item">
          <span class="status-item__body">
            <span class="status-item__type">${esc(t_(type))}</span>
            <span class="status-item__meta">${esc(t.id)} · ${esc(formatDate(date))}${st && st.count ? ` · ${esc(t_("Zähler: {n}", { n: st.count }))}` : ""}</span>
          </span>
          <span class="badge badge--${esc((status || "loading").replace(/\s/g, "-"))}">
            ${esc(status ? t_(STATUS_LABEL[status] || status) : "…")}
          </span>
        </li>`;
    }).join("");
  }

  async function loadStatus() {
    const list = readJson(TICKETS_KEY) || [];
    renderStatusList();
    if (!list.length || !CFG.API_URL) return;
    try {
      const url = `${CFG.API_URL}?action=status&ids=${encodeURIComponent(list.map((t) => t.id).join(","))}${pinParam()}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.code === "pin") { handlePinRejected(); return; }
      const byId = {};
      (data.items || []).forEach((i) => { byId[i.id] = i; });
      renderStatusList(byId);
    } catch (err) {
      console.error("Status:", err);
      toast(t_("Status konnte nicht geladen werden."), "error");
    }
  }

  function initStatus() {
    $("#statusRefresh").addEventListener("click", loadStatus);
    $("#statusLookup").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      if (!validate(form)) return;
      rememberTicket(form.elements.id.value.trim().toUpperCase(), "");
      form.reset();
      form.classList.remove("was-validated");
      loadStatus();
    });
    viewEnterHooks.meldungen = loadStatus;
    renderStatusList();
  }

  /* ======================================================================
     Aktuelles – Hinweise der Verwaltung (Blatt „Aktuelles“) auf der Startseite
     ====================================================================== */

  const NEWS_KEY = "mieterapp.news";
  let newsLoadedAt = 0;

  /** Wiederkehrende Hinweise aus der Konfiguration, die heute (Berliner Zeit) gelten. */
  function recurringNotices() {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", weekday: "short" }).format(new Date());
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
    return (OBJ.recurringNotices || []).filter((n) => n.weekday === weekday)
      .map((n) => ({ title: t_(n.title), text: t_(n.text), important: !!n.important }));
  }

  function renderNews(sheetItems) {
    const items = recurringNotices().concat(sheetItems || []);
    const box = $("#newsBox");
    if (!items || !items.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = `
      <h2 class="news__heading">${esc(t_("Aktuelles"))}</h2>
      ${items.map((n) => `
        <article class="news__item${n.important ? " news__item--important" : ""}">
          ${n.important ? `<span class="news__flag">${esc(t_("Wichtig"))}</span>` : ""}
          ${n.title ? `<h3 class="news__title">${esc(n.title)}</h3>` : ""}
          ${n.text ? `<p class="news__text">${esc(n.text)}</p>` : ""}
          ${n.to ? `<p class="news__date">${esc(t_("bis"))} ${esc(formatDate(parseIsoDate(n.to)))}</p>` : ""}
        </article>`).join("")}`;
  }

  async function loadNews() {
    // Höchstens alle 5 Minuten neu laden; bis dahin gespeicherten Stand zeigen.
    const cached = readJson(NEWS_KEY);
    renderNews(cached && cached.obj === OBJ.key ? cached.items : []);
    renderCare(cached && cached.obj === OBJ.key ? cached.care : null, cached ? cached.cleaningIcs : "");
    renderPolls(cached && cached.obj === OBJ.key ? cached.polls : []);
    renderWeather(cached ? cached.weather : null);
    if (!CFG.API_URL || Date.now() - newsLoadedAt < 5 * 60 * 1000) return;
    try {
      const res = await fetch(`${CFG.API_URL}?action=news&obj=${encodeURIComponent(OBJ.key || "")}${pinParam()}`);
      const data = await res.json();
      if (data.code === "pin") { handlePinRejected(); return; }
      if (!data.ok) return;
      newsLoadedAt = Date.now();
      writeJson(NEWS_KEY, { obj: OBJ.key, items: data.items, care: data.care || null, weather: data.weather || null, cleaningIcs: data.cleaningIcs || "", polls: data.polls || [] });
      renderNews(data.items);
      renderPolls(data.polls);
      renderCare(data.care, data.cleaningIcs);
      renderWeather(data.weather);
    } catch (err) {
      console.warn("Aktuelles:", err);
    }
  }
  viewEnterHooks.notfall = loadNews;

  /* ======================================================================
     Stimmungsbild – anonyme Umfrage auf der Startseite
     ====================================================================== */

  const POLLS_KEY = "mieterapp.polls";   // { [umfrageId]: gewählte Antwort } – nur auf diesem Gerät
  const VOTER_KEY = "mieterapp.voter";   // Zufallswert gegen doppelte Stimmen (kein Personenbezug)

  function voterId() {
    let v = null;
    try { v = localStorage.getItem(VOTER_KEY); } catch (e) { /* egal */ }
    if (!/^[a-f0-9]{32}$/.test(v || "")) {
      v = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      try { localStorage.setItem(VOTER_KEY, v); } catch (e) { /* egal */ }
    }
    return v;
  }

  function pollBars(options, counts) {
    const total = counts.reduce((a, b) => a + (Number(b) || 0), 0);
    return `<ul class="poll__results">${options.map((o, i) => {
      const n = Number(counts[i]) || 0, pct = total ? Math.round((n / total) * 100) : 0;
      return `<li><span class="poll__opt">${esc(o)}</span><span class="poll__bar"><i style="width:${pct}%"></i></span><span class="poll__pct">${pct} %</span></li>`;
    }).join("")}</ul><p class="muted small">${esc(t_("{n} Stimmen", { n: total }))}</p>`;
  }

  function renderPolls(polls) {
    const box = $("#pollBox");
    const list = Array.isArray(polls) ? polls.filter((p) => p && p.id && Array.isArray(p.options)) : [];
    if (!list.length) { box.hidden = true; box.innerHTML = ""; return; }
    const voted = readJson(POLLS_KEY) || {};
    box.hidden = false;
    box.innerHTML = list.map((p) => {
      const mine = Object.prototype.hasOwnProperty.call(voted, p.id) ? voted[p.id] : null;
      return `<article class="poll" data-poll="${esc(p.id)}">
        <span class="poll__flag">${esc(t_("Ihre Meinung ist gefragt"))}</span>
        <h3 class="poll__q">${esc(p.question)}</h3>
        ${mine === null
          ? `<div class="poll__options">${p.options.map((o, i) => `<button class="btn btn--ghost btn--block" type="button" data-vote="${i}">${esc(o)}</button>`).join("")}</div>
             <p class="muted small">${esc(t_("Anonym – eine Stimme je Gerät."))}${p.to ? " " + esc(t_("Läuft bis {datum}.", { datum: formatDate(parseIsoDate(p.to)) })) : ""}</p>`
          : `<p class="poll__thanks">✓ ${esc(t_("Danke für Ihre Stimme!"))}</p>${Array.isArray(p.results) ? pollBars(p.options, p.results) : ""}`}
      </article>`;
    }).join("");
  }

  async function vote(btn) {
    const card = btn.closest("[data-poll]");
    const id = card.dataset.poll;
    $$("[data-vote]", card).forEach((b) => { b.disabled = true; });
    try {
      const res = await fetch(CFG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "vote", pollId: id, option: Number(btn.dataset.vote), voter: voterId(), obj: OBJ.key || "", pin: storedPin() }) });
      const data = await res.json();
      if (!data.ok && data.code !== "voted") throw Object.assign(new Error(data.error), { userMessage: data.error });
      const voted = readJson(POLLS_KEY) || {};
      voted[id] = Number(btn.dataset.vote);
      writeJson(POLLS_KEY, voted);
      const cached = readJson(NEWS_KEY);
      if (cached && Array.isArray(cached.polls)) {
        const p = cached.polls.find((x) => x.id === id);
        if (p && Array.isArray(data.results)) p.results = data.results;
        writeJson(NEWS_KEY, cached);
        renderPolls(cached.polls);
      }
      toast(t_("Danke für Ihre Stimme!"), "ok");
    } catch (err) {
      $$("[data-vote]", card).forEach((b) => { b.disabled = false; });
      toast(err.userMessage || t_("Senden fehlgeschlagen. Bitte Internetverbindung prüfen."), "error");
    }
  }

  /* ======================================================================
     Wetter – 3 Tage + Warnungen (Daten: Deutscher Wetterdienst, abgerufen vom Backend)
     ====================================================================== */

  const WEATHER_ICONS = {
    "clear-day": ["☀️", "Sonnig"], "partly-cloudy-day": ["⛅", "Teils bewölkt"], cloudy: ["☁️", "Bewölkt"],
    fog: ["🌫️", "Nebel"], wind: ["💨", "Windig"], rain: ["🌧️", "Regen"], sleet: ["🌨️", "Schneeregen"],
    snow: ["❄️", "Schnee"], hail: ["🌨️", "Hagel"], thunderstorm: ["⛈️", "Gewitter"],
  };

  function renderWeather(w) {
    const box = $("#weatherBox");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date()); // yyyy-mm-dd
    const fresh = w && Array.isArray(w.days) && Date.now() - new Date(w.at).getTime() < 24 * 3600000;
    const days = fresh ? w.days.filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date >= today).slice(0, 3) : [];
    if (!days.length) { box.hidden = true; box.innerHTML = ""; return; }
    const cfg = CFG.WEATHER || {};
    const num = (x) => (typeof x === "number" && isFinite(x) ? Math.round(x) : null);
    const dayName = (d, i) => (d.date === today ? t_("Heute") : i <= 1 && days[0].date === today ? t_("Morgen")
      : parseIsoDate(d.date).toLocaleDateString(LOCALE(), { weekday: "long" }));
    const alerts = (Array.isArray(w.alerts) ? w.alerts : []).filter((a) => a && (a.headline || a.event));
    const dwdHeat = alerts.some((a) => /hitze|wärme/i.test(a.event + a.headline));
    const dwdCold = alerts.some((a) => /frost|kälte/i.test(a.event + a.headline));
    const maxT = Math.max(...days.map((d) => num(d.max) ?? -99));
    const minT = Math.min(...days.map((d) => num(d.min) ?? 99));
    const warn = [];
    if (!dwdHeat && maxT >= (cfg.hot ?? 30)) {
      warn.push({ cls: "heat", icon: "🌡️", title: t_("Hitze: bis {t} °C erwartet", { t: maxT }),
        text: t_("Tagsüber Fenster und Rollläden geschlossen halten, früh morgens und nachts lüften. Viel trinken – und bitte auf ältere Nachbarn achten.") });
    }
    if (!dwdCold && minT <= (cfg.cold ?? -10)) {
      warn.push({ cls: "cold", icon: "🥶", title: t_("Strenger Frost: bis {t} °C erwartet", { t: minT }),
        text: t_("Heizung nicht ganz abdrehen (Frostgefahr für Leitungen), Keller- und Treppenhausfenster geschlossen halten, Haustüren nicht offen stehen lassen. Vorsicht auf Wegen.") });
    }
    const until = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString(LOCALE(), { weekday: "short", hour: "2-digit", minute: "2-digit" }); };
    alerts.forEach((a) => {
      const extreme = a.severity === "severe" || a.severity === "extreme";
      warn.push({ cls: extreme ? "severe" : "dwd", icon: "⚠️", title: (LANG !== "de" && a.headlineEn) || a.headline || a.event,
        text: [t_("Warnung des Deutschen Wetterdienstes"), until(a.expires) ? t_("gültig bis {zeit}", { zeit: until(a.expires) }) : ""].filter(Boolean).join(" · ") });
    });
    box.hidden = false;
    box.innerHTML = `
      <div class="weather__days">${days.map((d, i) => {
        const [icon, label] = Object.prototype.hasOwnProperty.call(WEATHER_ICONS, d.icon) ? WEATHER_ICONS[d.icon] : ["🌡️", ""];
        const hi = num(d.max), lo = num(d.min);
        return `<div class="weather__day">
          <div class="weather__name">${esc(dayName(d, i))}</div>
          <div class="weather__icon" role="img" aria-label="${esc(label ? t_(label) : "")}">${icon}</div>
          <div class="weather__temp"><strong>${hi === null ? "–" : esc(hi) + "°"}</strong> <span class="muted">${lo === null ? "" : esc(lo) + "°"}</span></div>
        </div>`;
      }).join("")}</div>
      ${warn.map((x) => `<div class="weather__warn weather__warn--${x.cls}" role="note">
        <span class="weather__warn-icon" aria-hidden="true">${x.icon}</span>
        <div><strong>${esc(x.title)}</strong>${x.text ? `<p>${esc(x.text)}</p>` : ""}</div></div>`).join("")}
      <p class="weather__src">${esc(t_("Quelle: Deutscher Wetterdienst"))}</p>`;
  }

  // „Adresse kopieren“ (Kalender-Abo)
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    try { await navigator.clipboard.writeText(b.dataset.copy); toast(t_("Adresse kopiert – im Kalender unter „Abonnieren“ einfügen."), "ok", 5000); }
    catch (err) { window.prompt(t_("Adresse kopieren:"), b.dataset.copy); }
  });

  document.addEventListener("click", (e) => { const b = e.target.closest("[data-vote]"); if (b && !b.disabled) vote(b); });

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
        <a class="contact${c.level === "danger" || c.danger ? " contact--danger" : c.level === "urgent" ? " contact--urgent" : ""}" href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">
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
    $("#wasteCal").innerHTML = calendarButtons(icsAbs);
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
        list.innerHTML = `<li class="muted">${esc(t_("Keine weiteren Termine hinterlegt. Bitte Abfuhrkalender der BSR prüfen."))}</li>`;
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
      list.innerHTML = `<li class="muted">${esc(t_("Termine konnten nicht geladen werden. Bitte das PDF öffnen."))}</li>`;
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
    const label = date.toLocaleDateString(LOCALE(), { weekday: "short", day: "2-digit", month: "2-digit" });
    if (diff === 0) return `${t_("Heute")} · ${label}`;
    if (diff === 1) return `${t_("Morgen")} · ${label}`;
    return label;
  }

  // US 1.4 – Kiez-Guide (inkl. Link zum Apotheken-Notdienst), Dokumente
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
      <h3 class="subsection-title"${g.id ? ` id="${esc(g.id)}"` : ""}><span aria-hidden="true">${esc(g.icon)}</span> ${esc(g.group)}</h3>
      <ul class="place-list">
        ${g.places.map((pl) => `
          <li class="place">
            <span class="place__body">
              <span class="place__name">${esc(pl.name)}</span>
              <span class="place__addr">${esc(pl.address)}${pl.note ? ` · ${esc(pl.note)}` : ""}</span>
            </span>
            <a class="btn btn--ghost btn--small" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pl.name + ", " + pl.address)}"
               target="_blank" rel="noopener" aria-label="${esc(t_("{name} auf der Karte zeigen", { name: pl.name }))}">Karte</a>
          </li>`).join("")}
      </ul>
      ${(g.links || []).map((l) => `<a class="btn btn--ghost btn--block kiez-link" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}`).join("");

    // Sprungmarken oben auf der Seite
    $$(".jump a[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(a.dataset.jump).scrollIntoView({ behavior: "smooth" });
    }));
  }

  // Termine erst beim Öffnen der Infos-Seite laden (spart Datenvolumen).
  viewEnterHooks.infos = () => {
    loadPickups();
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

  /** Abfahrten über unser Backend (zentral zwischengespeichert, letzter Stand bleibt bei Ausfall erhalten). */
  async function serverDepartures() {
    if (!CFG.API_URL) throw new Error("kein Backend");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(`${CFG.API_URL}?action=departures${pinParam()}`, { signal: ctrl.signal });
      const data = await res.json();
      if (!data || !data.ok || !Array.isArray(data.departures) || !data.time) throw new Error("keine Daten");
      const now = Date.now() - 60 * 1000;
      const departures = data.departures.filter((d) => d && new Date(d.when || d.plannedWhen).getTime() >= now);
      if (!departures.length) throw new Error("keine Daten");
      return { departures, time: new Date(data.time).getTime(), live: data.live === true };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Direkt bei den transport.rest-Diensten (schnellster gewinnt). */
  function directDepartures() {
    const apis = CFG.TRANSIT_APIS;
    const order = apis.map((_, i) => (transit.preferred + i) % apis.length);
    const controllers = [];
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
          if (!settled) console.warn(`ÖPNV über ${api} fehlgeschlagen:`, err);
          kick();
          reject(err);
        }
      });
    });

    return Promise.any(order.map((i, n) => attempt(i, n === 0 ? 0 : TRANSIT_HEDGE_SECONDS * 1000)))
      .then((result) => { settled = true; controllers.forEach((c) => c.abort()); transit.preferred = result.i; return result.departures; })
      .catch((err) => { settled = true; throw err; });
  }

  async function loadDepartures(force) {
    if (transit.loading) return;
    if (!force && Date.now() < transit.nextTry) return;
    transit.loading = true;
    const status = $("#transitStatus");
    status.textContent = t_("Lade Abfahrten …");
    status.classList.remove("is-error", "is-warn");
    const stand = (time) => formatTime(new Date(time));

    // Beide Wege gleichzeitig: Backend (meist verfügbar, ggf. etwas älter) und direkt (live, oft überlastet).
    let liveShown = false;
    const server = serverDepartures().then((r) => {
      if (!liveShown) {
        renderDepartures(r.departures.slice(0, CFG.TRANSIT_RESULTS));
        status.textContent = t_("Stand {zeit} Uhr · aktualisiert alle {s} s", { zeit: stand(r.time), s: CFG.TRANSIT_REFRESH_SECONDS });
      }
      return r;
    }).catch(() => null);

    try {
      const departures = await directDepartures();
      liveShown = true;
      transit.failures = 0;
      transit.nextTry = 0;
      renderDepartures(departures);
      try {
        localStorage.setItem(TRANSIT_CACHE_KEY, JSON.stringify({ time: Date.now(), departures }));
      } catch (e) { /* egal */ }
      status.classList.remove("is-warn", "is-error");
      status.textContent = t_("Stand {zeit} Uhr · aktualisiert alle {s} s", { zeit: formatTime(new Date()), s: CFG.TRANSIT_REFRESH_SECONDS });
    } catch (err) {
      const r = await server;
      if (r && r.live) {
        // Backend hat gerade frische Daten geholt – das ist so gut wie live.
        transit.failures = 0;
        transit.nextTry = 0;
        return;
      }
      transit.failures++;
      const waitS = Math.min(300, CFG.TRANSIT_REFRESH_SECONDS * 2 ** (transit.failures - 1));
      transit.nextTry = Date.now() + waitS * 1000;
      const local = readCachedDepartures();
      const best = r && (!local || r.time >= local.time) ? r : local;
      if (best) {
        renderDepartures(best.departures.slice(0, CFG.TRANSIT_RESULTS));
        status.textContent = t_("Live-Daten gerade nicht erreichbar – Fahrplan vom {zeit} Uhr.", { zeit: stand(best.time) })
          + " " + t_("Neuer Versuch in {n} min.", { n: Math.round(waitS / 60) || 1 });
        status.classList.add("is-warn");
      } else {
        $("#departures").innerHTML = "";
        status.textContent = t_("Abfahrten derzeit nicht verfügbar – der kostenlose Fahrplandienst antwortet nicht.")
          + " " + t_("Neuer Versuch in {n} min.", { n: Math.round(waitS / 60) || 1 });
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
      ul.innerHTML = `<li class="card muted">${esc(t_("Keine Abfahrten in der nächsten Stunde."))}</li>`;
      return;
    }
    ul.innerHTML = list.map((d) => {
      const planned = new Date(d.plannedWhen || d.when);
      const delayMin = typeof d.delay === "number" ? Math.round(d.delay / 60) : null;
      let delayHtml = "";
      if (d.cancelled) delayHtml = `<span class="departure__delay delay--late">fällt aus</span>`;
      else if (delayMin === null) delayHtml = `<span class="departure__delay muted">Plan</span>`;
      else if (delayMin > 0) delayHtml = `<span class="departure__delay delay--late">+${delayMin} ${esc(t_("min"))}</span>`;
      else delayHtml = `<span class="departure__delay delay--ok">pünktlich</span>`;

      const inMin = Math.max(0, Math.round((new Date(d.when || d.plannedWhen) - Date.now()) / 60000));
      const platform = d.platform ? ` · Gl. ${esc(d.platform)}` : "";
      const line = d.line || {};

      return `
        <li class="departure${d.cancelled ? " departure--cancelled" : ""}">
          <span class="departure__line" data-product="${esc(line.product || "")}">${esc(line.name || "?")}</span>
          <span class="departure__dir">${esc(d.direction || "")}
            <span class="departure__meta">${esc(t_("in {n} min", { n: inMin }))}${platform}</span>
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

  // US 2.1 – Zählerstände (Wasser kalt/warm und Heizung)
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
        $(".meter__title", c).textContent = t_("Zähler {n}", { n: i + 1 });
        $(".meter__remove", c).hidden = cards.length === 1;
      });
      $("#addMeter").hidden = cards.length >= MAX_METERS;
      $("#waterSubmit").textContent = cards.length === 1
        ? t_("Zählerstand senden") : t_("{n} Zählerstände senden", { n: cards.length });
    };

    const addMeter = (preset = {}) => {
      const id = ++meterSeq;
      list.insertAdjacentHTML("beforeend", `
        <fieldset class="meter form-block" data-meter="${id}">
          <div class="meter__head">
            <legend class="form-block__title meter__title">Zähler</legend>
            <button class="meter__remove" type="button" aria-label="Diesen Zähler entfernen">Entfernen</button>
          </div>
          <div class="field">
            <span class="field__label">Art *</span>
            <div class="segmented segmented--3">
              ${["Kalt", "Warm", "Heizung"].map((a, i) => `<label><input type="radio" name="art-${id}" value="${a}"${i ? "" : " required"}${(preset.art || "Kalt") === a ? " checked" : ""}><span>${a}</span></label>`).join("")}
            </div>
          </div>
          <div class="field-row">
            <label class="field">
              <span class="field__label">Raum *</span>
              <select data-f="raum" required>
                ${OBJ.waterRooms.map((r) => `<option value="${esc(r)}"${r === preset.raum ? " selected" : ""}>${esc(t_(r))}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Zählernummer *</span>
              <input data-f="zaehlernummer" required autocomplete="off" value="${esc(preset.zaehlernummer || "")}" placeholder="auf dem Zähler">
            </label>
          </div>
          <label class="field">
            <span class="field__label"><span data-unit-label>Stand (m³)</span> *</span>
            <span class="stand">
              <input data-f="zaehlerstand" required inputmode="decimal" pattern="[0-9]+([.,][0-9]{1,3})?" placeholder="123,456">
              <select data-f="einheit" aria-label="Einheit" hidden>
                ${["kWh", "MWh"].map((u) => `<option${u === preset.einheit ? " selected" : ""}>${u}</option>`).join("")}
              </select>
            </span>
          </label>
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

      // Heizungszähler: Einheit kWh/MWh wählbar, Raum meist Flur.
      const unitSel = $('[data-f="einheit"]', card);
      const unitLabel = $("[data-unit-label]", card);
      const syncArt = (userChange) => {
        const heat = $('input[type="radio"]:checked', card).value === "Heizung";
        unitSel.hidden = !heat;
        unitLabel.textContent = heat ? t_("Stand") : t_("Stand (m³)");
        const room = $('[data-f="raum"]', card);
        if (userChange && heat && room.value !== "Flur" && OBJ.waterRooms.includes("Flur")) room.value = "Flur";
      };
      $$('input[type="radio"]', card).forEach((r) => r.addEventListener("change", () => syncArt(true)));
      syncArt(false);
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
          einheit: $('input[type="radio"]:checked', card).value === "Heizung" ? $('[data-f="einheit"]', card).value : "m³",
          zaehlernummer: $('[data-f="zaehlernummer"]', card).value.trim(),
          zaehlerstand: $('[data-f="zaehlerstand"]', card).value.trim().replace(",", "."),
          photo: await readPhoto($('[data-f="foto"]', card).files[0]),
        });
      }
      return {
        action: "submitMeterReadings",
        type: "Zählerstände",
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
        meters: payload.meters.map(({ raum, art, einheit, zaehlernummer }) => ({ raum, art, einheit, zaehlernummer })),
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
      const text = `Hallo, ich benötige den Zählerstand/Zugang für ${whgLabel(wohnung)}${where}.`;
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
      defaultHint = t_("Frühester Termin: {datum}. Keine Wochenenden.", { datum: formatDateLong(minDate) });
      if (!input.value) { hint.textContent = defaultHint; hint.classList.remove("is-error"); }
    };
    refreshMin();
    viewEnterHooks.elektro = refreshMin;
    $("#formElectric").addEventListener("app:reset", () => { input.setCustomValidity(""); refreshMin(); });

    const check = () => {
      const msg = validateWorkday(input.value, minDate);
      input.setCustomValidity(msg);
      hint.textContent = msg || (input.value ? t_("Gewählt: {datum}", { datum: formatDateLong(parseIsoDate(input.value)) }) : defaultHint);
      hint.classList.toggle("is-error", !!msg);
      return !msg;
    };
    input.addEventListener("input", check);
    input.addEventListener("change", () => {
      // Wochenende/zu früh gewählt → Feld leeren, damit der Wert nicht versehentlich gesendet wird.
      if (!check() && input.value) {
        const msg = input.validationMessage;
        input.value = "";
        input.setCustomValidity(t_("Bitte einen Termin wählen."));
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
      btn.textContent = t_("Wird gesendet …");

      try {
        const payload = await buildPayload(form);
        payload.object = OBJ.key;          // Aufgang-ID, z. B. "lind6"
        payload.house = OBJ.houseName || "";
        payload.entrance = OBJ.entranceName || "";
        payload.website = form.elements.website ? form.elements.website.value : ""; // Honeypot
        payload.submittedAt = new Date().toISOString();
        const res = (await postToBackend(payload)) || {};
        rememberProfile(form);
        if (onSuccess) onSuccess(payload);
        if (res.id) rememberTicket(res.id, payload.type);
        toast(res.id ? `${t_(successMsg)} ${t_("Nr.")} ${res.id}` : t_(successMsg), "ok", res.id ? 7000 : 0);
        form.reset();
        prefillProfile();
        form.classList.remove("was-validated");
        $$(".photo-preview", form).forEach((img) => { img.hidden = true; img.removeAttribute("src"); });
        form.dispatchEvent(new Event("app:reset"));
      } catch (err) {
        console.error(err);
        toast(t_(err.userMessage || "Senden fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen."), "error");
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
  function pinParam() {
    const pin = storedPin();
    const s = isStaff() ? staff() : null;
    return (pin ? `&pin=${encodeURIComponent(pin)}` : "") + (s ? `&token=${encodeURIComponent(s.token)}` : "");
  }

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
      body: JSON.stringify({ ...payload, pin: storedPin(), token: isStaff() ? staff().token : undefined }),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    if (data.ok === false) {
      if (data.code === "pin") handlePinRejected();
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
    if (!value) return t_("Bitte einen Termin wählen.");
    const date = parseIsoDate(value);
    if (isNaN(date)) return t_("Ungültiges Datum.");
    if (isWeekend(date)) return t_("Am Wochenende ist kein Zugang möglich. Bitte Mo–Fr wählen.");
    if (date < minDate) return t_("Frühestens ab {datum} möglich (2 Werktage Vorlauf).", { datum: formatDateLong(minDate) });
    return "";
  }

  function formatDate(d) {
    return d.toLocaleDateString(LOCALE(), { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function formatDateLong(d) {
    return d.toLocaleDateString(LOCALE(), { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function formatTime(d) {
    return d.toLocaleTimeString(LOCALE(), { hour: "2-digit", minute: "2-digit" });
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
        ${r.guide ? renderGuide(r.guide) : ""}
      </details>`).join("");
  }

  /** Schritt-für-Schritt-Anleitung innerhalb einer Verhaltensregel. */
  function renderGuide(g) {
    return `
      <div class="guide">
        <h3 class="guide__title">${esc(g.title)}</h3>
        ${g.figure && FIGURES[g.figure] ? FIGURES[g.figure] : ""}
        <ol class="guide__steps">
          ${g.steps.map((s) => `<li><strong>${esc(s.label)}</strong> <span>${esc(s.text)}</span></li>`).join("")}
        </ol>
      </div>`;
  }

  // Einfache Grafiken (inline SVG, Farben über CSS). Texte werden wie der Rest übersetzt.
  const FIGURES = {
    valves: `
      <div class="valves" role="img" aria-label="Hebel: längs zum Rohr offen, quer zum Rohr zu. Drehgriff: im Uhrzeigersinn zudrehen.">
        <figure class="valve">
          <svg viewBox="0 0 120 70" aria-hidden="true">
            <rect class="v-pipe" x="4" y="42" width="112" height="12" rx="3"/>
            <circle class="v-body" cx="60" cy="48" r="11"/>
            <rect class="v-lever v-ok" x="55" y="43.5" width="54" height="9" rx="4.5"/>
            <circle class="v-hub" cx="60" cy="48" r="4"/>
          </svg>
          <figcaption><span class="tag tag--ok">offen</span> Hebel längs</figcaption>
        </figure>
        <figure class="valve">
          <svg viewBox="0 0 120 70" aria-hidden="true">
            <rect class="v-pipe" x="4" y="42" width="112" height="12" rx="3"/>
            <circle class="v-body" cx="60" cy="48" r="11"/>
            <rect class="v-lever v-stop" x="55.5" y="2" width="9" height="46" rx="4.5"/>
            <circle class="v-hub" cx="60" cy="48" r="4"/>
          </svg>
          <figcaption><span class="tag tag--stop">zu</span> Hebel quer</figcaption>
        </figure>
        <figure class="valve">
          <svg viewBox="0 0 120 70" aria-hidden="true">
            <rect class="v-pipe" x="4" y="54" width="112" height="12" rx="3"/>
            <rect class="v-body" x="56" y="36" width="8" height="20"/>
            <circle class="v-wheel" cx="60" cy="34" r="14"/>
            <circle class="v-hub" cx="60" cy="34" r="4"/>
            <path class="v-arrow" d="M 38 26 A 23 23 0 0 1 82 26"/>
            <path class="v-arrowhead" d="M 86 30 l -10 -1 l 7 -8 z"/>
          </svg>
          <figcaption><span class="tag tag--stop">zu</span> Drehgriff im Uhrzeigersinn</figcaption>
        </figure>
      </div>`,
  };

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
  function toast(msg, kind, duration) {
    const el = $("#toast");
    el.textContent = (kind === "ok" ? "✓ " : "") + msg;
    el.className = `toast${kind ? " toast--" + kind : ""}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, duration || 4500);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  /* ======================================================================
     Epic 3 – Hausmeister-Portal (persönlicher Link ?hm=TOKEN)
     Scannen (QR-Code am Ort) → Tätigkeit → Nachweis; offline wird gespeichert
     und später mit der Scan-Uhrzeit nachgesendet. Aufträge, Mängel, QR-Druck.
     ====================================================================== */

  const STAFF_KEY = "mieterapp.staff";              // { token, user, areas, activities }
  const STAFF_QUEUE_KEY = "mieterapp.staffQueue";   // noch nicht gesendete Nachweise
  const STAFF_TODAY_KEY = "mieterapp.staffToday";   // Liste „Heute erfasst“
  let pendingScan = null;                           // ?scan=CODE aus einem QR-Code (Handy-Kamera)
  let scanner = null;
  let scanCtx = null;                               // { area, time, manual }

  function staff() { return readJson(STAFF_KEY); }
  function isStaff() { const s = staff(); return !!(s && s.token); }

  /** ?hm=TOKEN (persönlicher Link) und ?scan=CODE übernehmen und aus der Adresse entfernen. */
  function captureStaffParams() {
    const params = new URLSearchParams(location.search);
    const token = params.get("hm");
    const scan = params.get("scan");
    if (token && /^[a-f0-9]{24,64}$/i.test(token)) {
      const cur = staff();
      if (!cur || cur.token !== token) writeJson(STAFF_KEY, { token });
    }
    if (scan && /^[A-Z0-9_\-]{1,40}$/i.test(scan)) pendingScan = scan.toUpperCase();
    if (token || scan) {
      params.delete("hm");
      params.delete("scan");
      const q = params.toString();
      history.replaceState(null, "", location.pathname + (q ? `?${q}` : "") + (token || scan ? "#hausmeister" : location.hash));
    }
  }

  async function staffPost(payload, timeoutMs = 30000) {
    const s = staff();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs); // Google antwortet manchmal gar nicht
    let res;
    try {
      res = await fetch(CFG.API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ...payload, token: payload.token || (s && s.token) }),
        redirect: "follow",
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    if (data.ok === false) {
      const err = new Error(data.error || "Fehler");
      err.userMessage = data.error;
      err.code = data.code;
      const cur = staff();
      if (data.code === "staff" && cur && cur.token === (payload.token || (s && s.token))) { localRemove(STAFF_KEY); renderStaff(); }
      throw err;
    }
    return data;
  }

  const scriptLoads = {};
  function loadScript(src) {
    if (!scriptLoads[src]) {
      scriptLoads[src] = new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = resolve;
        el.onerror = () => { delete scriptLoads[src]; reject(new Error(`${src} nicht geladen`)); };
        document.head.appendChild(el);
      });
    }
    return scriptLoads[src];
  }

  // Anmeldung beim Server: läuft höchstens einmal gleichzeitig; beim ersten Mal ohne gespeicherte Daten
  // zeigt die Seite „Anmeldung läuft …“ und versucht es bei Netzproblemen einmal automatisch erneut.
  let staffLoginRun = null;
  let staffLoginFailed = false;

  function staffLogin() {
    if (!staffLoginRun) staffLoginRun = doStaffLogin().finally(() => { staffLoginRun = null; renderStaff(); });
    renderStaff();
    return staffLoginRun;
  }

  async function doStaffLogin() {
    const s = staff();
    if (!s || !CFG.API_URL) return;
    staffLoginFailed = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const data = await staffPost({ action: "hmLogin", token: s.token });
        // Inzwischen abgemeldet oder anderer Zugang? Dann die verspätete Antwort verwerfen.
        const cur = staff();
        if (!cur || cur.token !== s.token) return;
        writeJson(STAFF_KEY, { ...cur, user: data.user, areas: data.areas, activities: data.activities, plan: data.plan || null });
        loadTasks(); // Aufträge schon im Hintergrund holen
        if (isAdmin() && currentView === "cockpit") loadCockpit();
        fetch("vendor/html5-qrcode.min.js").catch(() => {}); // für Scans ohne Netz vorab in den Cache
        break;
      } catch (err) {
        const cur = staff();
        if (!cur || cur.token !== s.token) return;
        if (err.code === "staff") { toast(err.userMessage, "error", 8000); break; }
        if (attempt === 2) {
          staffLoginFailed = !s.user;
          if (!s.user) toast("Anmeldung nicht möglich – bitte Internetverbindung prüfen.", "error");
        }
      }
    }
    renderStaff();
    flushStaffQueue();
    if (pendingScan) { const code = pendingScan; pendingScan = null; handleScanCode(code, false); }
  }

  function renderStaff() {
    const s = staff();
    const loggedIn = !!(s && s.token);
    // Angemeldet: „Zum Startbildschirm hinzufügen“ legt eine eigene Hausmeister-App an,
    // die direkt den Hausmeister-Bereich öffnet (sonst startet das Symbol die Mieter-App).
    const manifest = $("#appManifest");
    const wanted = loggedIn || new URLSearchParams(location.search).get("app") === "hausmeister"
      ? "manifest-hausmeister.json" : "manifest.json";
    if (manifest && manifest.getAttribute("href") !== wanted) manifest.setAttribute("href", wanted);
    $("#staffTab").hidden = !loggedIn;
    // Cockpit: Verwaltung (alles) und Leitung des Hausmeisterdienstes (Hausmeister-Aufträge + Team)
    const admin = !!(loggedIn && s.user && (s.user.role === "Verwaltung" || s.user.role === "Leitung"));
    const tab = $("#staffTab");
    if (tab.dataset.role !== String(admin)) {
      tab.dataset.role = String(admin);
      tab.setAttribute("href", admin ? "#cockpit" : "#hausmeister");
      tab.dataset.tab = admin ? "cockpit hausmeister" : "hausmeister";
      tab.innerHTML = admin ? '<span aria-hidden="true">📊</span>Cockpit' : '<span aria-hidden="true">🧹</span>Hausmeister';
    }
    $("#cockpitNone").hidden = admin || !!(loggedIn && !s.user);
    $("#cockpitArea").hidden = !admin;
    $(".tabbar").classList.toggle("tabbar--5", loggedIn);
    // Link geöffnet, Anmeldung noch nicht fertig: Ladeanzeige statt „Bitte Link öffnen“
    const pending = loggedIn && !s.user;
    $("#staffNone").hidden = loggedIn;
    $("#staffPending").hidden = !pending;
    $("#staffPendingWait").hidden = !pending || (staffLoginFailed && !staffLoginRun);
    $("#staffPendingFailed").hidden = !pending || !staffLoginFailed || !!staffLoginRun;
    $("#cockpitPending").hidden = !pending;
    $("#staffArea").hidden = !(loggedIn && s.user);
    if (!loggedIn || !s.user) return;

    $("#staffName").textContent = s.user.role === "Hausmeister" ? s.user.name : `${s.user.name} · ${s.user.role}`;
    $("#staffAdmin").hidden = !admin;
    const opts = (list, sel) => list.map((v) => `<option${v === sel ? " selected" : ""}>${esc(v)}</option>`).join("");
    $("#scanActivity").innerHTML = opts(s.activities || []);
    $("#scanManual").innerHTML = `<option value="">Ort wählen …</option>`
      + (s.areas || []).map((a) => `<option value="${esc(a.code)}">${esc(a.ort)}</option>`).join("");
    const defectOrt = $("#defectOrt");
    const keep = defectOrt.value;
    defectOrt.innerHTML = `<option value="">Bitte wählen …</option>`
      + (s.areas || []).map((a) => `<option>${esc(a.ort)}</option>`).join("")
      + `<option value="__frei">Anderer Ort / Wohnung …</option>`;
    defectOrt.value = keep;
    renderQueueBadge();
    renderToday();
  }

  /* ---------- Scannen ---------- */

  function beep() {
    try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { /* egal */ }
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = 1320;
      g.gain.value = 0.15;
      o.connect(g).connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.15);
      o.onended = () => ac.close();
    } catch (e) { /* ohne Ton */ }
  }

  async function startScan() {
    $("#scanStart").hidden = true;
    $("#scanner").hidden = false;
    try {
      await loadScript("vendor/html5-qrcode.min.js");
      scanner = new window.Html5Qrcode("scannerView", {
        formatsToSupport: [window.Html5QrcodeSupportedFormats.QR_CODE], verbose: false,
        useBarCodeDetectorIfSupported: true, // schnelle eingebaute Erkennung (Android/Chrome)
      });
      await scanner.start(
        { facingMode: "environment" }, // zwingend Rückkamera
        { fps: 10, qrbox: (w, h) => { const m = Math.floor(Math.min(w, h) * 0.7); return { width: m, height: m }; } },
        (text) => { stopScan(); handleScanCode(text); },
        () => {}
      );
    } catch (err) {
      console.error("Scanner:", err);
      toast("Kamera nicht verfügbar. Bitte Kamerazugriff erlauben oder den Ort manuell wählen.", "error", 7000);
      stopScan();
    }
  }

  function stopScan() {
    const s = scanner;
    scanner = null;
    if (s) s.stop().then(() => s.clear()).catch(() => {});
    $("#scanner").hidden = true;
    $("#scanStart").hidden = false;
  }

  /** QR-Inhalt: Link mit ?scan=CODE oder nur der Code. */
  function handleScanCode(text, fromCamera = true) {
    let code = String(text || "").trim();
    try { code = new URL(code).searchParams.get("scan") || code; } catch (e) { /* kein Link */ }
    code = code.toUpperCase();
    const area = ((staff() || {}).areas || []).find((a) => a.code.toUpperCase() === code);
    if (!area) { toast(`Unbekannter QR-Code (${code.slice(0, 40)}).`, "error", 6000); return; }
    if (fromCamera) beep();
    showScanForm(area, false);
  }

  function showScanForm(area, manual) {
    scanCtx = { area, time: new Date().toISOString(), manual };
    location.hash !== "#hausmeister" && (location.hash = "hausmeister");
    selectStaffPane("scan");
    $("#scanStart").hidden = true;
    $("#scanForm").hidden = false;
    $("#scanHow").textContent = manual ? "Ort (manuell gewählt)" : "Ort (per QR-Code)";
    $("#scanPlace").textContent = area ? area.ort : "";
    $("#scanPlace").hidden = manual;
    $("#scanManual").hidden = !manual;
    $("#scanManual").required = manual;
    $("#scanManual").value = area ? area.code : "";
    if (area && area.activity) $("#scanActivity").value = area.activity;
    $("#scanForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetScanForm() {
    const form = $("#scanForm");
    form.reset();
    form.classList.remove("was-validated");
    $$(".photo-preview", form).forEach((img) => { img.hidden = true; img.removeAttribute("src"); });
    form.hidden = true;
    $("#scanStart").hidden = false;
    scanCtx = null;
  }

  function showScanDone(text, queued) {
    const box = $("#scanDone");
    box.classList.toggle("scan-done--queued", !!queued);
    $("#scanDoneText").textContent = text;
    box.hidden = false;
    setTimeout(() => { box.hidden = true; }, 3000);
  }

  async function submitScan(e) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!validate(form) || !scanCtx) return;
    const areas = (staff() || {}).areas || [];
    const area = scanCtx.manual ? areas.find((a) => a.code === $("#scanManual").value) : scanCtx.area;
    if (!area) return;
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    const entry = {
      action: "logCleaning", areaToken: area.code, activity: form.elements.activity.value,
      note: form.elements.note.value.trim(), timestamp: scanCtx.time, manual: scanCtx.manual,
    };
    // Sofort bestätigen und im Hintergrund senden (Google braucht oft mehrere Sekunden).
    // Die Scan-Uhrzeit steht im Nachweis, deshalb ist spätes Senden unkritisch.
    try {
      entry.photo = await readPhoto(form.elements.foto.files[0]);
    } catch (err) {
      entry.photo = null;
    }
    queueStaffEntry(entry);
    addToday(area.ort, entry.activity, true);
    showScanDone(`${area.ort} – ${entry.activity}`, false);
    resetScanForm();
    btn.disabled = false;
    flushStaffQueue();
  }

  function queueStaffEntry(entry) {
    const q = readJson(STAFF_QUEUE_KEY) || [];
    q.push({ ...entry, token: (staff() || {}).token }); // Token mitspeichern: wird auch nach Abmelden noch gesendet
    try { localStorage.setItem(STAFF_QUEUE_KEY, JSON.stringify(q)); } catch (e) {
      q[q.length - 1] = { ...entry, photo: null }; // Speicher voll: ohne Foto
      writeJson(STAFF_QUEUE_KEY, q);
    }
    renderQueueBadge();
  }

  let flushing = false;
  let flushWarned = false;
  async function flushStaffQueue() {
    const q = readJson(STAFF_QUEUE_KEY) || [];
    if (flushing || !q.length || !navigator.onLine) return;
    flushing = true;
    try {
      while (q.length) {
        try {
          await staffPost(q[0]);
        } catch (err) {
          if (!err.userMessage) { // kein Netz: Hinweis einmal, später erneut versuchen
            if (!flushWarned) { flushWarned = true; toast("Kein Netz – Nachweise werden gesendet, sobald wieder Verbindung besteht.", "error", 6000); }
            break;
          }
          toast(`Nachweis verworfen: ${err.userMessage}`, "error", 7000);
        }
        q.shift();
        writeJson(STAFF_QUEUE_KEY, q);
        flushWarned = false;
      }
    } finally {
      flushing = false;
      renderQueueBadge();
      renderToday();
    }
  }

  function renderQueueBadge() {
    const n = (readJson(STAFF_QUEUE_KEY) || []).length;
    const b = $("#staffQueue");
    b.hidden = !n;
    b.textContent = `${n} nicht gesendet`;
    b.className = "badge badge--offen";
  }

  function addToday(ort, activity, queued) {
    const day = toIsoDate(today());
    const t = readJson(STAFF_TODAY_KEY);
    const items = t && t.day === day ? t.items : [];
    items.unshift({ ort, activity, time: new Date().toISOString(), queued });
    writeJson(STAFF_TODAY_KEY, { day, items: items.slice(0, 50) });
    renderToday();
  }

  function renderToday() {
    const t = readJson(STAFF_TODAY_KEY);
    const items = t && t.day === toIsoDate(today()) ? t.items : [];
    const pending = (readJson(STAFF_QUEUE_KEY) || []).length;
    $("#todayList").innerHTML = items.length ? items.map((i, idx) => `
      <li><span class="today-list__time">${esc(formatTime(new Date(i.time)))}</span>
        <span><strong>${esc(i.activity)}</strong><br>${esc(i.ort)}</span>
        ${i.queued && idx < pending ? '<span class="badge badge--offen">wartet</span>' : '<span class="badge badge--erledigt">✓</span>'}</li>`).join("")
      : '<li class="muted">Noch nichts erfasst.</li>';
    renderPlanToday();
  }

  /** „Heute zu tun“ aus dem Reinigungsplan; eigene Scans von heute haken sofort ab (auch offline). */
  function renderPlanToday() {
    const box = $("#planToday");
    const s = staff() || {};
    const plan = s.plan;
    const day = toIsoDate(today());
    const items = plan && plan.day === day && Array.isArray(plan.items) ? plan.items : [];
    box.hidden = !items.length;
    if (!items.length) return;
    const low = (v) => String(v || "").trim().toLowerCase();
    const t = readJson(STAFF_TODAY_KEY);
    const mine = t && t.day === day ? t.items : [];
    const areaNames = (s.areas || []).map((a) => low(a.ort));
    const isDone = (x) => x.done || mine.some((m) => low(m.activity) === low(x.activity)
      && (low(m.ort) === low(x.ort) || !areaNames.includes(low(x.ort))));
    const list = items.map((x) => ({ ...x, ok: isDone(x) }));
    const n = list.filter((x) => x.ok).length;
    $("#planTodayCount").textContent = `${n}/${list.length}`;
    $("#planTodayCount").className = `badge ${n === list.length ? "badge--erledigt" : "badge--offen"}`;
    $("#planTodayList").innerHTML = list.sort((a, b) => a.ok - b.ok).map((x) => `
      <li class="${x.ok ? "is-done" : ""}"><span aria-hidden="true">${x.ok ? "✓" : "○"}</span>
        <span><strong>${esc(x.activity)}</strong><br><span class="muted small">${esc(x.ort)}</span></span></li>`).join("");
  }

  /* ---------- Aufträge ---------- */

  // Zuletzt geladene Aufträge sofort zeigen, im Hintergrund aktualisieren (Google braucht oft 5–15 s).
  const TASKS_KEY = "mieterapp.staffTasks";
  let tasksLoading = null;

  function showCachedTasks() {
    const c = readJson(TASKS_KEY);
    const s = staff();
    if (!c || !s || c.token !== s.token) return null;
    renderTasks(c.tasks || []);
    return c;
  }

  function loadTasks() {
    if (tasksLoading) return tasksLoading;
    const status = $("#tasksStatus");
    const cached = showCachedTasks();
    const stand = (at) => `Stand ${formatTime(new Date(at))}`;
    status.textContent = cached ? `${stand(cached.at)} · wird aktualisiert …` : "Lade Aufträge … (kann einige Sekunden dauern)";
    const token = (staff() || {}).token;
    tasksLoading = staffPost({ action: "getTasks" }, 25000).then((data) => {
      const tasks = data.tasks || [];
      writeJson(TASKS_KEY, { token, at: Date.now(), tasks });
      renderTasks(tasks);
      status.textContent = `${tasks.length} offen · ${stand(Date.now())}`;
    }).catch((err) => {
      const why = err.userMessage || (err.name === "AbortError"
        ? "Google hat nicht rechtzeitig geantwortet" : "keine Verbindung");
      status.textContent = cached
        ? `Aktualisieren fehlgeschlagen (${why}) – angezeigt: ${stand(cached.at)}. Bitte „Aktualisieren“ tippen.`
        : `Aufträge konnten nicht geladen werden (${why}). Bitte „Aktualisieren“ tippen.`;
    }).finally(() => { tasksLoading = null; });
    return tasksLoading;
  }

  function renderTasks(tasks) {
    const admin = ((staff() || {}).user || {}).role === "Verwaltung";
    $("#taskList").innerHTML = tasks.length ? tasks.map((t) => {
      const where = [t.entrance, t.wohnung ? whgLabel(t.wohnung) : "", t.ort].filter(Boolean).join(" · ");
      const phone = String(t.contact || "").replace(/[^\d+]/g, "");
      return `
        <li class="task${t.urgent ? " task--urgent" : ""}">
          <div class="task__head">
            <span class="task__type">${esc(t.type)}</span>
            ${t.urgent ? '<span class="badge badge--dringend">dringend</span>' : ""}
            ${t.status === "in Arbeit" ? '<span class="badge badge--in-Arbeit">in Arbeit</span>' : ""}
            ${admin && t.owner ? `<span class="badge badge--owner">${esc(t.owner)}</span>` : ""}
          </div>
          ${where ? `<div class="task__where">${esc(where)}</div>` : ""}
          ${t.date ? `<div class="task__date">Termin: <strong>${esc(formatDateLong(parseIsoDate(t.date)))}</strong></div>` : ""}
          ${t.details ? `<p class="task__details">${esc(t.details)}</p>` : ""}
          ${t.name || t.contact ? `<div class="task__contact">${esc(t.name || "")}${t.contact ? " · " + (phone.length >= 6
            ? `<a href="tel:${esc(phone)}">${esc(t.contact)}</a>` : esc(t.contact)) : ""}</div>` : ""}
          <div class="task__meta muted small">${esc(t.id)} · ${esc(t.source)}${t.created ? " · " + esc(formatDate(parseIsoDate(t.created))) : ""}</div>
          <button class="btn btn--primary btn--small" type="button" data-done="${esc(t.id)}">✓ Erledigt</button>
          <div class="task__complete" data-panel="${esc(t.id)}" hidden>
            <label class="field"><span class="field__label">Foto nachher (optional)</span>
              <input type="file" accept="image/*" capture="environment" data-photo></label>
            <div class="task__complete-actions">
              <button class="btn btn--primary btn--small" type="button" data-confirm-done="${esc(t.id)}">Als erledigt melden</button>
              <button class="btn btn--ghost btn--small" type="button" data-cancel-done>Abbrechen</button>
            </div>
          </div>
        </li>`;
    }).join("") : '<li class="muted">Keine offenen Aufträge. 👍</li>';
  }

  function whgLabel(v) {
    const s = String(v).replace(/^'/, "");
    // Nur reine Nummern bekommen „Whg“ davor („04“, „4a“) – Gewerbe wie „Laden EG“ bleibt, wie es ist.
    return /^\d/.test(s) ? `Whg ${s}` : s;
  }

  async function completeTask(id, btn) {
    const panel = btn.closest(".task__complete");
    const file = panel && panel.querySelector("[data-photo]").files[0];
    btn.disabled = true;
    const old = btn.textContent;
    if (file) btn.textContent = "Foto wird gesendet …";
    try {
      await staffPost({ action: "completeTask", id, photo: file ? await readPhoto(file) : undefined }, file ? 60000 : 30000);
      toast("Als erledigt gemeldet.", "ok");
      const c = readJson(TASKS_KEY); // sofort aus der Liste nehmen, nicht auf Google warten
      if (c) { c.tasks = (c.tasks || []).filter((t) => t.id !== id); writeJson(TASKS_KEY, c); renderTasks(c.tasks); }
      loadTasks();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = old;
      toast(err.userMessage || "Senden fehlgeschlagen – bitte später erneut versuchen.", "error");
    }
  }

  /* ---------- Mangel erfassen ---------- */

  async function submitStaffDefect(e) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!validate(form)) return;
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const free = form.elements.ort.value === "__frei";
      const res = await staffPost({
        action: "submitStaffDefect",
        ort: free ? form.elements.ortFrei.value.trim() : form.elements.ort.value,
        beschreibung: form.elements.beschreibung.value.trim(),
        dringend: form.elements.dringend.checked,
        photo: await readPhoto(form.elements.foto.files[0]),
      });
      toast(`Mangel gemeldet. Nr. ${res.id}`, "ok", 7000);
      form.reset();
      form.classList.remove("was-validated");
      $("#defectOrtFreeWrap").hidden = true;
      $$(".photo-preview", form).forEach((img) => { img.hidden = true; img.removeAttribute("src"); });
    } catch (err) {
      toast(err.userMessage || "Senden fehlgeschlagen. Bitte Internetverbindung prüfen.", "error");
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- QR-Codes drucken (Verwaltung) ---------- */

  async function renderQrSheet() {
    const s = staff();
    const sheet = $("#qrSheet");
    if (!s || !s.user || (s.user.role !== "Verwaltung" && s.user.role !== "Leitung")) {
      sheet.innerHTML = '<p class="muted">Nur für Verwaltung und Leitung.</p>';
      return;
    }
    try {
      await loadScript("vendor/qrcode-generator.js");
    } catch (err) {
      sheet.innerHTML = '<p class="muted">QR-Bibliothek konnte nicht geladen werden.</p>';
      return;
    }
    const base = `${location.origin}${location.pathname}`;
    sheet.innerHTML = (s.areas || []).map((a) => {
      const qr = window.qrcode(0, "M");
      qr.addData(`${base}?scan=${encodeURIComponent(a.code)}#hausmeister`);
      qr.make();
      return `
        <figure class="qr-card">
          <div class="qr-card__brand">Willbrandt <strong>und Kompagnon</strong></div>
          <div class="qr-card__code">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>
          <figcaption>
            <strong class="qr-card__place">${esc(a.ort)}</strong>
            <span class="qr-card__hint">Hausmeisterdienst: nach Erledigung scannen</span>
            <span class="qr-card__id">${esc(a.code)}</span>
          </figcaption>
        </figure>`;
    }).join("");
  }

  /* ---------- Cockpit (Verwaltung 007/008) ---------- */

  const COCKPIT_KEY = "mieterapp.cockpit";
  let cockpitLoading = null;
  let cockpitFilter = "open";

  function isAdmin() { const r = ((staff() || {}).user || {}).role; return r === "Verwaltung" || r === "Leitung"; }

  function loadCockpit() {
    if (!isAdmin()) return Promise.resolve();
    if (cockpitLoading) return cockpitLoading;
    const status = $("#cockpitStatus");
    const token = staff().token;
    const cached = readJson(COCKPIT_KEY);
    const stand = (at) => `Stand ${formatTime(new Date(at))}`;
    if (cached && cached.token === token) renderCockpit(cached.data);
    status.textContent = cached && cached.token === token ? `${stand(cached.at)} · wird aktualisiert …` : "Lade Cockpit … (kann einige Sekunden dauern)";
    cockpitLoading = staffPost({ action: "adminOverview" }, 30000).then((data) => {
      if ((staff() || {}).token !== token) return;
      writeJson(COCKPIT_KEY, { token, at: Date.now(), data });
      renderCockpit(data);
      status.textContent = stand(Date.now());
    }).catch((err) => {
      const why = err.userMessage || (err.name === "AbortError" ? "Google hat nicht rechtzeitig geantwortet" : "keine Verbindung");
      status.textContent = `Aktualisieren fehlgeschlagen (${why}).`;
    }).finally(() => { cockpitLoading = null; });
    return cockpitLoading;
  }

  function renderCockpit(d) {
    const k = d.kpi || {};
    const pct = (x) => (typeof x !== "number" ? "–" : `${Math.round(x * 100)} %`);
    const num = (x, digits) => (typeof x !== "number" ? "–" : x.toLocaleString("de-DE", { maximumFractionDigits: digits }));
    const tile = (label, value, cls, sub) => `<div class="kpi${cls ? " kpi--" + cls : ""}"><div class="kpi__value">${esc(value)}</div>`
      + `<div class="kpi__label">${esc(label)}</div>${sub ? `<div class="kpi__sub">${esc(sub)}</div>` : ""}</div>`;
    $("#cockpitKpis").innerHTML = [
      tile("Offen", String(k.open || 0)),
      tile("Überfällig", String(k.overdue || 0), k.overdue ? "red" : "green"),
      tile("Bald fällig", String(k.dueSoon || 0), k.dueSoon ? "yellow" : ""),
      tile("SLA eingehalten", pct(k.slaQuote), k.slaQuote === null ? "" : k.slaQuote >= 0.9 ? "green" : k.slaQuote >= 0.7 ? "yellow" : "red", `${k.closed90 || 0} erledigt in 90 Tagen`),
      tile("Ø Reaktion", k.avgReactHours === null ? "–" : `${num(k.avgReactHours, 1)} Std.`, "", "90 Tage"),
      tile("Ø Durchlauf", k.avgLeadDays === null ? "–" : `${num(k.avgLeadDays, 1)} Tage`, "", "90 Tage"),
      tile("Reinigung laut Plan", pct(k.cleaningQuote), k.cleaningQuote === null ? "" : k.cleaningQuote >= 0.95 ? "green" : k.cleaningQuote >= 0.8 ? "yellow" : "red", `${k.cleaningIst || 0} von ${k.cleaningSoll || 0} (30 Tage)`),
      typeof k.errors24 === "number" ? tile("App-Fehler 24 Std.", String(k.errors24), k.errors24 ? "yellow" : "") : "",
    ].join("");
    // Leitung: keine Filter nach Zuständigkeit (sieht nur Hausmeister-Aufträge)
    const lead = d.role === "Leitung";
    $$('#cockpitFilter [data-filter="Hausmeister"], #cockpitFilter [data-filter="Verwaltung"]').forEach((b) => { b.hidden = lead; });
    renderWork(d.work);
    renderNewsAdmin(d);
    renderPollAdmin(d);
    renderCockpitList(Array.isArray(d.tasks) ? d.tasks : []);
    renderCockpitCharts(d);
    const looker = $("#cockpitLooker");
    const okUrl = /^https:\/\/lookerstudio\.google\.com\//.test(d.lookerUrl || "");
    looker.hidden = !okUrl;
    if (okUrl) looker.href = d.lookerUrl;
  }

  function dueText(t) {
    const dt = (iso) => new Date(iso).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const s = t.sla || {};
    if (t.status === "erledigt") return `Erledigt ${t.done ? formatDate(new Date(t.done)) : ""}${s.react === "late" || s.done === "late" ? " · SLA verfehlt" : " · SLA eingehalten"}`;
    if (s.react === "overdue") return `Reaktion überfällig seit ${dt(s.reactDue)}`;
    if (s.done === "overdue") return `Erledigung überfällig seit ${dt(s.doneDue)}`;
    if (s.react === "open") return `Reaktion bis ${dt(s.reactDue)} · erledigen bis ${dt(s.doneDue)}`;
    return `Erledigen bis ${dt(s.doneDue)}`;
  }

  function renderCockpitList(tasks) {
    const f = cockpitFilter;
    tasks.forEach((t) => { t.sla = t.sla && typeof t.sla === "object" ? t.sla : {}; t.status = String(t.status || ""); });
    const list = tasks.filter((t) => (f === "done" ? t.status === "erledigt"
      : t.status !== "erledigt" && (f === "open" || t.sla.light === f || t.owner === f)));
    const opt = (vals, sel) => vals.map((v) => `<option${v === sel ? " selected" : ""}>${esc(v)}</option>`).join("");
    const lead = ((staff() || {}).user || {}).role === "Leitung";
    const light = { red: "Überfällig", yellow: "Bald fällig", green: "Im Plan", done: "Erledigt" };
    $("#cockpitList").innerHTML = list.length ? list.map((t) => {
      const where = [t.entrance, t.wohnung ? whgLabel(t.wohnung) : "", t.ort].filter(Boolean).join(" · ");
      const phone = String(t.contact || "").replace(/[^\d+]/g, "");
      return `
        <li class="task task--sla-${esc(t.sla.light)}" data-id="${esc(t.id)}">
          <div class="task__head">
            <span class="sla-dot sla-dot--${esc(t.sla.light)}" role="img" aria-label="${esc(light[t.sla.light] || "")}"></span>
            <span class="task__type">${esc(t.type)}</span>
            ${t.urgent ? '<span class="badge badge--dringend">dringend</span>' : ""}
            <span class="badge badge--${esc(t.status.replace(" ", "-"))}">${esc(t.status)}</span>
            <span class="badge badge--owner">${esc(t.owner)}</span>
          </div>
          <div class="task__due">${esc(dueText(t))}</div>
          ${where ? `<div class="task__where">${esc(where)}</div>` : ""}
          ${t.termin ? `<div class="task__date">Termin: <strong>${esc(formatDate(new Date(t.termin)))}</strong></div>` : ""}
          ${t.details ? `<p class="task__details">${esc(t.details)}</p>` : ""}
          ${t.name || t.contact ? `<div class="task__contact">${esc(t.name || "")}${t.contact ? " · " + (phone.length >= 6
            ? `<a href="tel:${esc(phone)}">${esc(t.contact)}</a>` : esc(t.contact)) : ""}</div>` : ""}
          ${photoLinks(t)}
          <div class="task__meta muted small">${esc(t.id)} · ${esc(t.source === "Bewohner" ? "Bewohner" : "intern " + t.source)}`
            + `${t.created ? " · Eingang " + esc(formatDate(new Date(t.created))) : ""}${t.by ? " · zuletzt: " + esc(t.by) : ""}</div>
          <details class="task__edit">
            <summary>Bearbeiten</summary>
            <form class="form" data-edit="${esc(t.id)}">
              <label class="field"><span class="field__label">Status</span>
                <select name="status">${opt(["offen", "in Arbeit", "erledigt"], t.status)}</select></label>
              ${lead ? "" : `<label class="field"><span class="field__label">Zuständig</span>
                <select name="owner">${opt(["Hausmeister", "Verwaltung"], t.owner)}</select></label>
              <label class="field"><span class="field__label">Notiz (nur intern)</span>
                <textarea name="note" rows="2" maxlength="1000">${esc(t.note || "")}</textarea></label>`}
              <button class="btn btn--primary btn--small" type="submit">Speichern</button>
            </form>
          </details>
        </li>`;
    }).join("") : `<li class="muted">${f === "open" ? "Keine offenen Aufträge. 👍" : "Keine Aufträge in dieser Auswahl."}</li>`;
  }

  /** Vorher/Nachher-Fotos (Google Drive, nur mit Zugriff auf das Konto der Verwaltung sichtbar). */
  function photoLinks(t) {
    const ok = (u) => /^https:\/\/(drive|docs)\.google\.com\//.test(String(u || ""));
    const links = [ok(t.photo) ? `<a href="${esc(t.photo)}" target="_blank" rel="noopener">📷 Foto vorher</a>` : "",
      ok(t.photoDone) ? `<a href="${esc(t.photoDone)}" target="_blank" rel="noopener">📷 Foto nachher</a>` : ""].filter(Boolean);
    return links.length ? `<div class="task__photos">${links.join(" · ")}</div>` : "";
  }

  async function saveCockpitTask(e) {
    const form = e.target.closest("[data-edit]");
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.edit;
    const change = { status: form.elements.status.value };
    if (form.elements.owner) change.owner = form.elements.owner.value; // Leitung: nur Status
    if (form.elements.note) change.note = form.elements.note.value;
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await staffPost({ action: "adminUpdateTask", id, ...change }, 30000);
      toast(`${id} gespeichert.`, "ok");
      const c = readJson(COCKPIT_KEY); // sofort anzeigen, Ampel kommt mit dem nächsten Laden
      if (c) {
        const t = (c.data.tasks || []).find((x) => x.id === id);
        if (t) {
          Object.assign(t, change, { by: staff().user.name });
          if (change.status === "erledigt") { t.sla.light = "done"; t.done = t.done || new Date().toISOString(); }
        }
        writeJson(COCKPIT_KEY, c);
        renderCockpitList(c.data.tasks || []);
      }
      localRemove(TASKS_KEY);
      loadCockpit();
    } catch (err) {
      btn.disabled = false;
      toast(err.userMessage || "Speichern fehlgeschlagen – bitte erneut versuchen.", "error");
    }
  }

  /** Hinweise für Bewohner: aktive Liste + Formular (nur Verwaltung). */
  function renderNewsAdmin(d) {
    const box = $("#cockpitNews");
    const show = d.role !== "Leitung" && Array.isArray(d.news);
    box.hidden = !show;
    if (!show) return;
    const names = {};
    CFG.HOUSES.forEach((h) => h.entrances.forEach((e) => { names[e.id] = e.name; }));
    const who = (only) => { const ids = String(only || "").split(/[,;\s]+/).filter(Boolean); return ids.length ? ids.map((i) => names[i] || i).join(", ") : "alle Aufgänge"; };
    const day = (iso) => (iso ? formatDate(parseIsoDate(iso)) : "");
    $("#newsAdminList").innerHTML = d.news.length ? d.news.map((n) => `
      <li class="news__item${n.important ? " news__item--important" : ""}">
        ${n.important ? '<span class="news__flag">Wichtig</span>' : ""}
        <h3 class="news__title">${esc(n.title)}</h3>
        ${n.text ? `<p class="news__text">${esc(n.text)}</p>` : ""}
        <p class="muted small">${esc(who(n.only))} · ab ${esc(day(n.from) || "sofort")}${n.to ? ` bis ${esc(day(n.to))}` : " · ohne Enddatum"}</p>
        <button class="btn btn--ghost btn--small" type="button" data-news-end="${esc(n.row)}" data-news-title="${esc(n.title)}">Beenden</button>
      </li>`).join("") : '<li class="muted">Derzeit keine Hinweise.</li>';
    const chips = $("#newsAdminEntrances");
    if (!chips.children.length) {
      chips.innerHTML = CFG.HOUSES.flatMap((h) => h.entrances).map((e) =>
        `<label class="chip chip--check"><input type="checkbox" name="only" value="${esc(e.id)}"><span>${esc(e.name)}</span></label>`).join("");
      const f = $("#formNewsAdmin");
      if (!f.elements.from.value) f.elements.from.value = toIsoDate(new Date());
    }
  }

  async function saveNewsAdmin(e) {
    e.preventDefault();
    const f = e.currentTarget;
    if (!validate(f)) return;
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await staffPost({ action: "adminNewsSave", title: f.elements.title.value.trim(), text: f.elements.text.value.trim(),
        from: f.elements.from.value, to: f.elements.to.value, important: f.elements.important.checked,
        only: $$('input[name="only"]:checked', f).map((x) => x.value) }, 30000);
      toast("Hinweis veröffentlicht – Bewohner sehen ihn auf der Startseite.", "ok", 6000);
      f.reset();
      f.elements.from.value = toIsoDate(new Date());
      $("#newsAdminNew").open = false;
      loadCockpit();
    } catch (err) {
      toast(err.userMessage || "Veröffentlichen fehlgeschlagen – bitte erneut versuchen.", "error");
    } finally {
      btn.disabled = false;
    }
  }

  async function endNewsAdmin(btn) {
    if (!window.confirm("Diesen Hinweis beenden? Er verschwindet dann bei den Bewohnern.")) return;
    btn.disabled = true;
    try {
      await staffPost({ action: "adminNewsEnd", row: Number(btn.dataset.newsEnd), title: btn.dataset.newsTitle }, 30000);
      btn.closest("li").remove();
      toast("Hinweis beendet.", "ok");
      loadCockpit();
    } catch (err) {
      btn.disabled = false;
      toast(err.userMessage || "Beenden fehlgeschlagen.", "error");
    }
  }

  /** Stimmungsbild: Ergebnisse, Beenden, neue Umfrage (nur Verwaltung). */
  function renderPollAdmin(d) {
    const box = $("#cockpitPolls");
    const show = d.role !== "Leitung" && Array.isArray(d.polls);
    box.hidden = !show;
    if (!show) return;
    const names = {};
    CFG.HOUSES.forEach((h) => h.entrances.forEach((e) => { names[e.id] = e.name; }));
    const who = (only) => { const ids = String(only || "").split(/[,;\s]+/).filter(Boolean); return ids.length ? ids.map((i) => names[i] || i).join(", ") : "alle Aufgänge"; };
    $("#pollAdminList").innerHTML = d.polls.length ? d.polls.map((p) => `
      <li class="poll poll--admin">
        <span class="badge ${p.open ? "badge--in-Arbeit" : ""}">${p.open ? "läuft" : "beendet"}</span>
        <h3 class="poll__q">${esc(p.question)}</h3>
        ${pollBars(Array.isArray(p.options) ? p.options : [], Array.isArray(p.counts) ? p.counts : [])}
        <p class="muted small">${esc(who(p.only))}${p.to ? ` · bis ${esc(formatDate(parseIsoDate(p.to)))}` : ""} · ${p.showResults ? "Ergebnis für Bewohner sichtbar" : "Ergebnis nur für die Verwaltung"}</p>
        ${p.open ? `<button class="btn btn--ghost btn--small" type="button" data-poll-end="${esc(p.id)}">Umfrage beenden</button>` : ""}
      </li>`).join("") : '<li class="muted">Noch keine Umfragen.</li>';
    const chips = $("#pollAdminEntrances");
    if (!chips.children.length) {
      chips.innerHTML = CFG.HOUSES.flatMap((h) => h.entrances).map((e) =>
        `<label class="chip chip--check"><input type="checkbox" name="only" value="${esc(e.id)}"><span>${esc(e.name)}</span></label>`).join("");
    }
  }

  async function savePollAdmin(e) {
    e.preventDefault();
    const f = e.currentTarget;
    if (!validate(f)) return;
    const options = f.elements.options.value.split("\n").map((x) => x.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 6) { toast("Bitte 2 bis 6 Antworten eingeben (eine pro Zeile).", "error"); return; }
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await staffPost({ action: "adminPollSave", question: f.elements.question.value.trim(), options, to: f.elements.to.value,
        showResults: f.elements.showResults.checked, only: $$('input[name="only"]:checked', f).map((x) => x.value) }, 30000);
      toast("Umfrage gestartet – Bewohner sehen sie auf der Startseite.", "ok", 6000);
      f.reset();
      $("#pollAdminNew").open = false;
      loadCockpit();
    } catch (err) {
      toast(err.userMessage || "Starten fehlgeschlagen – bitte erneut versuchen.", "error");
    } finally {
      btn.disabled = false;
    }
  }

  async function endPollAdmin(btn) {
    if (!window.confirm("Umfrage beenden? Danach kann niemand mehr abstimmen.")) return;
    btn.disabled = true;
    try {
      await staffPost({ action: "adminPollEnd", id: btn.dataset.pollEnd }, 30000);
      toast("Umfrage beendet.", "ok");
      loadCockpit();
    } catch (err) {
      btn.disabled = false;
      toast(err.userMessage || "Beenden fehlgeschlagen.", "error");
    }
  }

  /** Erledigte Arbeiten je Tag mit Plan-Abgleich – ohne Mitarbeiternummern. */
  function renderWork(work) {
    const box = $("#cockpitTeam");
    const days = work && Array.isArray(work.days) ? work.days : [];
    const arr = (x) => (Array.isArray(x) ? x : []);
    const dayName = (iso) => { const d = parseIsoDate(String(iso)); return d ? d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) : ""; };
    if (!days.length) { box.innerHTML = '<p class="muted">Keine Nachweise und keine geplanten Arbeiten in den letzten 14 Tagen.</p>'; return; }
    box.innerHTML = days.map((d, i) => {
      const done = arr(d.done), missed = arr(d.missed), open = arr(d.open);
      const planned = Number(d.planned) || 0, plannedDone = Number(d.plannedDone) || 0;
      const badge = planned ? `<span class="badge ${plannedDone >= planned ? "badge--erledigt" : i === 0 ? "badge--offen" : "badge--unbekannt"}">Plan ${plannedDone}/${planned}</span>` : "";
      return `<details class="rule work-day"${i < 2 || missed.some((m) => !m.lateOn) ? " open" : ""}>
        <summary><strong>${esc(dayName(d.date))}</strong> ${badge} <span class="muted small">${done.length} erledigt</span></summary>
        <ul class="work-list">
          ${done.map((x) => `<li>✓ <span class="muted small">${esc(x.time)}</span> ${esc(x.activity)} – ${esc(x.ort)}${x.planned ? "" : ' <span class="badge">zusätzlich</span>'}${x.manual ? ' <span class="badge">ohne QR</span>' : ""}</li>`).join("")}
          ${missed.map((x) => `<li class="${x.lateOn ? "work-late" : "work-missed"}">${x.lateOn ? "↻" : "✗"} ${esc(x.activity)} – ${esc(x.ort)} <span class="small">${x.lateOn ? `nachgeholt am ${esc(dayName(x.lateOn))}` : "nicht nachgewiesen"}</span></li>`).join("")}
          ${open.map((x) => `<li class="muted">○ ${esc(x.activity)} – ${esc(x.ort)} <span class="small">heute geplant, noch offen</span></li>`).join("")}
          ${!done.length && !missed.length && !open.length ? '<li class="muted">Nichts erfasst.</li>' : ""}
        </ul></details>`;
    }).join("");
  }

  /** Einfache Balkendiagramme als SVG (keine externe Bibliothek, keine Daten an Dritte). */
  function barChart(title, months, series) {
    const W = 340, H = 150, top = 10, bottom = 22, left = 26;
    const totals = months.map((m) => series.reduce((a, s) => a + (Number(m[s.key]) || 0), 0));
    const max = Math.max(1, ...totals);
    const bw = (W - left) / months.length;
    const y = (v) => top + (H - top - bottom) * (1 - v / max);
    let bars = "";
    months.forEach((m, i) => {
      let acc = 0;
      series.forEach((s) => {
        const v = Number(m[s.key]) || 0;
        if (!v) return;
        bars += `<rect x="${(left + i * bw + 2).toFixed(1)}" y="${y(acc + v).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${(y(acc) - y(acc + v)).toFixed(1)}" fill="${s.color}"><title>${esc(s.label)} ${esc(m.month)}: ${v}</title></rect>`;
        acc += v;
      });
      bars += `<text x="${(left + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="chart__axis">${esc(m.month.slice(5))}</text>`;
    });
    const grid = `<line x1="${left}" x2="${W}" y1="${y(max)}" y2="${y(max)}" class="chart__grid"/><text x="${left - 4}" y="${y(max) + 4}" text-anchor="end" class="chart__axis">${max}</text>`
      + `<line x1="${left}" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="chart__grid"/><text x="${left - 4}" y="${y(0) + 4}" text-anchor="end" class="chart__axis">0</text>`;
    const legend = series.map((s) => `<span class="chart__key"><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("");
    return `<figure class="chart"><figcaption>${esc(title)}</figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${bars}</svg>
      <div class="chart__legend">${legend}</div></figure>`;
  }

  function renderCockpitCharts(d) {
    const months = (Array.isArray(d.months) ? d.months : []).map((m) => ({ ...m, month: String(m.month || "") }));
    if (!months.length) { $("#cockpitCharts").innerHTML = ""; return; }
    const entrances = Object.entries(d.perEntrance || {}).sort((a, b) => b[1] - a[1]);
    const maxE = Math.max(1, ...entrances.map((e) => Number(e[1]) || 0));
    $("#cockpitCharts").innerHTML = barChart("Meldungen je Monat", months, [
      { key: "Mangel", label: "Mangel", color: "#b3261e" },
      { key: "Mangel (intern)", label: "Mangel (intern)", color: "#e08a00" },
      { key: "Klingelschild", label: "Klingelschild", color: "#6d7454" },
      { key: "Elektroraum", label: "Elektroraum", color: "#3a6ea5" },
    ]) + barChart("Reinigungsnachweise je Monat", months, [{ key: "Nachweise", label: "Nachweise (Scans)", color: "#4f7a28" }])
      + (d.role === "Leitung" ? "" : barChart("Zählerablesungen je Monat", months, [{ key: "Zähler", label: "Meldungen Zählerstand", color: "#3a6ea5" }]))
      + (entrances.length ? `<figure class="chart"><figcaption>Meldungen je Aufgang (12 Monate)</figcaption>
        <ul class="hbars">${entrances.map(([name, n]) => `<li><span class="hbars__label">${esc(name)}</span>`
          + `<span class="hbars__bar"><i style="width:${Math.round(((Number(n) || 0) / maxE) * 100)}%"></i></span><span class="hbars__n">${esc(n)}</span></li>`).join("")}</ul></figure>` : "");
  }

  /* ---------- Start ---------- */

  function selectStaffPane(name) {
    $$("#staffTabs input").forEach((r) => { r.checked = r.value === name; });
    $$(".staff-pane").forEach((p) => { p.hidden = p.dataset.pane !== name; });
    if (name === "tasks") loadTasks();
  }

  function initStaff() {
    captureStaffParams();
    renderStaff();
    // QR-Code mit der Handy-Kamera gescannt: sofort das Formular zeigen (Orte sind gespeichert),
    // nicht erst auf die Anmeldung beim Server warten.
    const cached = staff();
    if (pendingScan && cached && cached.areas) {
      const code = pendingScan;
      pendingScan = null;
      setTimeout(() => handleScanCode(code, false), 0);
    }
    $$("#staffTabs input").forEach((r) => r.addEventListener("change", () => selectStaffPane(r.value)));
    $("#scanBtn").addEventListener("click", startScan);
    $("#scanCancel").addEventListener("click", stopScan);
    $("#manualBtn").addEventListener("click", () => showScanForm(null, true));
    $("#scanManual").addEventListener("change", (e) => {
      const area = ((staff() || {}).areas || []).find((a) => a.code === e.target.value);
      if (area && area.activity) $("#scanActivity").value = area.activity;
    });
    $("#scanForm").addEventListener("submit", submitScan);
    $("#scanFormCancel").addEventListener("click", resetScanForm);
    $("#tasksRefresh").addEventListener("click", loadTasks);
    // „✓ Erledigt“ öffnet ein kleines Feld für das (optionale) Nachher-Foto, dann „Als erledigt melden“.
    $("#taskList").addEventListener("click", (e) => {
      const open = e.target.closest("[data-done]");
      if (open) {
        const li = open.closest("li");
        li.querySelector(".task__complete").hidden = false;
        open.hidden = true;
        return;
      }
      const ok = e.target.closest("[data-confirm-done]");
      if (ok) { completeTask(ok.dataset.confirmDone, ok); return; }
      const cancel = e.target.closest("[data-cancel-done]");
      if (cancel) {
        const li = cancel.closest("li");
        li.querySelector(".task__complete").hidden = true;
        li.querySelector("[data-done]").hidden = false;
      }
    });
    $("#defectOrt").addEventListener("change", (e) => {
      const free = e.target.value === "__frei";
      $("#defectOrtFreeWrap").hidden = !free;
      $("#defectOrtFree").required = free;
    });
    $("#formStaffDefect").addEventListener("submit", submitStaffDefect);
    $("#staffRetry").addEventListener("click", () => { staffLoginFailed = false; staffLogin(); });
    $("#staffLinkForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = $("#staffLinkInput").value.trim();
      const m = /(?:[?&]hm=)?([a-f0-9]{24,64})(?![a-f0-9])/i.exec(text);
      if (!m) { toast("Das ist kein gültiger persönlicher Link.", "error"); return; }
      writeJson(STAFF_KEY, { token: m[1].toLowerCase() });
      $("#staffLinkInput").value = "";
      renderStaff();
      staffLogin();
    });
    $("#qrPrint").addEventListener("click", () => window.print());
    $("#staffLogout").addEventListener("click", () => {
      const pending = (readJson(STAFF_QUEUE_KEY) || []).length;
      const msg = "Auf diesem Gerät abmelden? Zum erneuten Anmelden brauchen Sie Ihren persönlichen Link."
        + (pending ? ` ${pending} Nachweis(e) werden noch gesendet, sobald Netz da ist.` : "");
      if (!window.confirm(msg)) return;
      stopScan();
      resetScanForm();
      pendingScan = null;
      localRemove(STAFF_KEY);
      localRemove(STAFF_TODAY_KEY);
      localRemove(TASKS_KEY);
      localRemove(COCKPIT_KEY);
      renderStaff();
      location.hash = "notfall";
      toast("Abgemeldet.", "ok");
    });
    window.addEventListener("online", flushStaffQueue);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flushStaffQueue(); });
    viewEnterHooks.hausmeister = staffLogin;
    viewLeaveHooks.hausmeister = stopScan;
    viewEnterHooks.qrdruck = renderQrSheet;
    // Gespeicherten Stand sofort zeigen; nach frischer Anmeldung (Rolle erst jetzt bekannt) nachladen.
    viewEnterHooks.cockpit = () => {
      loadCockpit();
      staffLogin().then(() => { if (currentView === "cockpit" && !readJson(COCKPIT_KEY)) loadCockpit(); });
    };
    $("#cockpitRefresh").addEventListener("click", loadCockpit);
    $("#cockpitFilter").addEventListener("click", (e) => {
      const b = e.target.closest("[data-filter]");
      if (!b) return;
      cockpitFilter = b.dataset.filter;
      $$("#cockpitFilter [data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      const c = readJson(COCKPIT_KEY);
      if (c && c.data) renderCockpitList(Array.isArray(c.data.tasks) ? c.data.tasks : []);
    });
    $("#cockpitList").addEventListener("submit", saveCockpitTask);
    $("#formNewsAdmin").addEventListener("submit", saveNewsAdmin);
    $("#formPollAdmin").addEventListener("submit", savePollAdmin);
    $("#pollAdminList").addEventListener("click", (e) => { const b = e.target.closest("[data-poll-end]"); if (b) endPollAdmin(b); });
    $("#newsAdminList").addEventListener("click", (e) => { const b = e.target.closest("[data-news-end]"); if (b) endNewsAdmin(b); });
  }

  /* ---------- Bewohner: Hausreinigung (zuletzt erledigt / geplant) ---------- */

  /** Buttons „In den Kalender“: iPhone/Outlook (webcal), Google Kalender, Adresse kopieren. */
  function calendarButtons(httpsUrl) {
    const webcal = httpsUrl.replace(/^https?:\/\//, "webcal://");
    const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
    return `<div class="cal-buttons">
      <a class="btn btn--ghost btn--small" href="${esc(webcal)}">📅 ${esc(t_("iPhone / Outlook"))}</a>
      <a class="btn btn--ghost btn--small" href="${esc(google)}" target="_blank" rel="noopener">📅 ${esc(t_("Google Kalender"))}</a>
      <button class="btn btn--ghost btn--small" type="button" data-copy="${esc(httpsUrl)}">🔗 ${esc(t_("Adresse kopieren"))}</button>
    </div>`;
  }

  function renderCare(care, cleaningIcs) {
    const box = $("#careBox");
    const last = (care && care.last) || [];
    const next = (care && care.next) || [];
    if (!last.length && !next.length) { box.hidden = true; box.innerHTML = ""; return; }
    const day = (iso) => new Date(iso).toLocaleDateString(LOCALE(), { weekday: "short", day: "2-digit", month: "2-digit" });
    const range = (n) => (n.to && n.to !== n.from
      ? `${formatDate(parseIsoDate(n.from))} – ${formatDate(parseIsoDate(n.to))}`
      : parseIsoDate(n.from).toLocaleDateString(LOCALE(), { weekday: "short", day: "2-digit", month: "2-digit" }));
    box.hidden = false;
    box.innerHTML = `
      <h2 class="news__heading">${esc(t_("Hausreinigung & Pflege"))}</h2>
      <div class="card care__card">
        ${last.length ? `<h3 class="care__title">${esc(t_("Zuletzt erledigt"))}</h3>
          <ul class="care__list">${last.map((l) => `<li><span class="care__date">${esc(day(l.time))}</span>
            <span><strong>${esc(t_(l.activity))}</strong><br><span class="muted">${esc(l.ort)}</span></span></li>`).join("")}</ul>` : ""}
        ${next.length ? `<h3 class="care__title">${esc(t_("Geplant"))}</h3>
          <ul class="care__list">${next.map((n) => `<li><span class="care__date">${esc(range(n))}</span>
            <span><strong>${esc(t_(n.activity))}</strong>${n.ort ? `<br><span class="muted">${esc(n.ort)}</span>` : ""}</span></li>`).join("")}</ul>` : ""}
        ${/^https:\/\/calendar\.google\.com\//.test(cleaningIcs || "") ? `<details class="care__cal"><summary>${esc(t_("Reinigungstermine im eigenen Kalender"))}</summary>
          <p class="muted small">${esc(t_("Einmal abonnieren – neue Termine erscheinen automatisch."))}</p>${calendarButtons(cleaningIcs)}</details>` : ""}
      </div>`;
  }

  /* ======================================================================
     Kurze Einführung (3 Schritte, einmal pro Gerät) und größere Schrift
     ====================================================================== */

  const INTRO_KEY = "mieterapp.intro";
  const INTRO = [
    { icon: "🏠", title: "Start", text: "Aktuelles aus dem Haus und alle Notfallnummern. Ein Tipp genügt, und der Anruf startet." },
    { icon: "🧰", title: "Services", text: "Zählerstände, Mängel, Klingelschild oder einen Techniker-Termin melden – gern mit Foto. Sie erhalten sofort eine Nummer." },
    { icon: "📋", title: "Meldungen und Infos", text: "Unter „Meldungen“ sehen Sie, wie weit Ihr Anliegen ist. Unter „Infos“ finden Sie Müllabfuhr, Hausordnung, Einkaufen und Abfahrten." },
  ];
  let introStep = 0;

  function renderIntro() {
    const s = INTRO[introStep];
    $("#introIcon").textContent = s.icon;
    $("#introTitle").textContent = t_(s.title);
    $("#introText").textContent = t_(s.text);
    $("#introDots").innerHTML = INTRO.map((_, i) => `<span class="${i === introStep ? "is-active" : ""}"></span>`).join("");
    $("#introNext").textContent = introStep === INTRO.length - 1 ? t_("Los geht's") : t_("Weiter");
    $("#introSkip").hidden = introStep === INTRO.length - 1;
  }

  function showIntro() {
    introStep = 0;
    renderIntro();
    $("#intro").hidden = false;
    document.body.classList.add("has-modal");
    $("#introTitle").focus();
  }

  function closeIntro() {
    $("#intro").hidden = true;
    document.body.classList.toggle("has-modal", !$("#consent").hidden);
    writeJson(INTRO_KEY, { seen: Date.now() });
  }

  /** Einmal pro Gerät, nach der Zustimmung; nicht für den Hausmeisterdienst. */
  function maybeShowIntro() {
    if (readJson(INTRO_KEY) || isStaff() || !hasConsent() || !$("#consent").hidden) return;
    if (LEGAL_VIEWS.includes(currentView)) return;
    showIntro();
  }

  function initIntro() {
    $("#introNext").addEventListener("click", () => {
      if (introStep < INTRO.length - 1) { introStep++; renderIntro(); $("#introTitle").focus(); } else closeIntro();
    });
    $("#introSkip").addEventListener("click", closeIntro);
    $("#intro").addEventListener("keydown", (e) => { if (e.key === "Escape") closeIntro(); });
    $("#introOpen").addEventListener("click", (e) => { e.preventDefault(); showIntro(); });
  }

  function initTextSize() {
    const btn = $("#textSize");
    const sync = () => {
      const large = document.documentElement.classList.contains("text-large");
      btn.setAttribute("aria-pressed", String(large));
      btn.setAttribute("aria-label", t_(large ? "Normale Schrift" : "Größere Schrift"));
      btn.textContent = large ? "A−" : "A+";
    };
    btn.addEventListener("click", () => {
      const large = document.documentElement.classList.toggle("text-large");
      try { localStorage.setItem(TEXT_KEY, large ? "large" : "normal"); } catch (e) { /* nur für jetzt */ }
      sync();
    });
    sync();
  }

  /* ======================================================================
     Start
     ====================================================================== */

  function init() {
    // Schutz vor Clickjacking: Die App darf nicht in fremden Seiten eingebettet laufen.
    if (window.top !== window.self) {
      document.body.innerHTML = '<p style="padding:24px;font:18px sans-serif">Bitte die Mieter-App direkt öffnen: '
        + '<a href="https://app.willbrandt-kompagnon.de/" target="_top" rel="noopener">app.willbrandt-kompagnon.de</a></p>';
      return;
    }
    $("#objectName").textContent = OBJ.key ? OBJ.label : t_("Bitte Adresse wählen");
    $("#demoBanner").hidden = !!CFG.API_URL;
    $("#siteName").textContent = CFG.SITE.name;
    const provider = $("#providerLink");
    provider.textContent = CFG.PROVIDER.name;
    provider.href = CFG.PROVIDER.url;

    // Unsichtbares Honeypot-Feld in jedes Formular: Bots füllen es aus, Menschen nicht.
    $$("form.form").forEach((form) => form.insertAdjacentHTML("beforeend",
      '<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>'));

    // Jeder Bereich einzeln abgesichert: Ein Fehler in einem Teil darf Navigation,
    // Notfallnummern und Zustimmung nicht lahmlegen.
    [
      renderEntrancePicker, renderEmergency, renderWaste, renderInfos, initTransit,
      initWaterForm, initPowerForm, initElectricForm, initBellForm, initDefectForm,
      initPhotoPreviews, initProfile, initConsent, initStatus, initLanguage, initStaff, initIntro, initTextSize,
    ].forEach((step) => {
      try { step(); } catch (err) { console.error(`Fehler in ${step.name}:`, err); setTimeout(() => reportError(`${step.name}: ${err.message}`, "init"), 3000); }
    });
    try { translateDom(document.body); watchTranslations(); } catch (err) { console.error("Übersetzung:", err); }
    initRouter();
    setTimeout(() => { try { maybeShowIntro(); } catch (e) { /* egal */ } }, 400);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service Worker:", e));
    }
  }

  // Für Tests in der Browser-Konsole.
  window.MieterApp = { addWorkdays, isWeekend, toIsoDate, validateWorkday };

  init();
})();

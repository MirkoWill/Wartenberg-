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
  const viewEnterHooks = {};
  const viewLeaveHooks = {};
  let currentView = null;

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
    back.onclick = () => { location.hash = parent; };

    currentView = viewName;
    window.scrollTo(0, 0);
    if (viewEnterHooks[viewName]) viewEnterHooks[viewName]();
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
    $("#emergencyList").innerHTML = OBJ.emergencyContacts.map((c) => `
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

    $("#emergencyRules").innerHTML = renderAccordion(OBJ.emergencyRules, true);
  }

  // US 1.2 – Kalender abonnieren
  function renderCalendar() {
    const ics = OBJ.calendarIcsUrl;
    const webcal = ics.replace(/^https?:\/\//, "webcal://");
    $("#calendarSubscribe").href = webcal;
    $("#calendarDownload").href = ics;
    if (OBJ.calendarWebUrl) {
      const web = $("#calendarWeb");
      web.href = OBJ.calendarWebUrl;
      web.hidden = false;
    }
  }

  // US 1.4 – Dokumente, Kiez-Guide, Apotheken-Notdienst
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

    $("#kiezList").innerHTML = renderAccordion(OBJ.kiezTips, false);

    $("#pharmacyLink").href = OBJ.pharmacyIframeUrl;
  }

  // iFrame erst beim ersten Öffnen der Infos-Seite laden (spart Datenvolumen).
  viewEnterHooks.infos = () => {
    const frame = $("#pharmacyFrame");
    if (!frame.src) frame.src = OBJ.pharmacyIframeUrl;
  };

  // US 1.3 – Live-ÖPNV-Monitor
  // Die kostenlosen transport.rest-Dienste sind nicht immer erreichbar. Deshalb werden
  // mehrere nacheinander versucht; der zuletzt funktionierende wird zuerst genommen.
  const transit = { timer: null, loading: false, preferred: 0 };

  async function loadDepartures() {
    if (transit.loading) return;
    transit.loading = true;
    const status = $("#transitStatus");
    status.textContent = "Lade Abfahrten …";
    status.classList.remove("is-error");

    const apis = CFG.TRANSIT_APIS;
    const order = apis.map((_, i) => (transit.preferred + i) % apis.length);
    const problems = [];

    try {
      for (const i of order) {
        const api = apis[i];
        try {
          const stopId = await resolveStopId(api);
          const data = await fetchJson(`${api}/stops/${encodeURIComponent(stopId)}/departures`
            + `?duration=60&results=${CFG.TRANSIT_RESULTS}&remarks=false&language=de`);
          // transport.rest v6 liefert { departures: [...] }, ältere Versionen ein Array.
          renderDepartures(Array.isArray(data) ? data : data.departures || []);
          transit.preferred = i;
          status.textContent = `Stand ${formatTime(new Date())} Uhr · aktualisiert alle ${CFG.TRANSIT_REFRESH_SECONDS} s`;
          return;
        } catch (err) {
          console.warn(`ÖPNV über ${api} fehlgeschlagen:`, err);
          problems.push(`${new URL(api).hostname.split(".")[1]}: ${err.message}`);
        }
      }
      status.textContent = "Abfahrten derzeit nicht verfügbar – der kostenlose Fahrplandienst antwortet nicht. "
        + "Neuer Versuch in Kürze. (" + problems.join(" · ") + ")";
      status.classList.add("is-error");
    } finally {
      transit.loading = false;
    }
  }

  /** fetch mit Zeitlimit, damit die Anzeige nicht endlos „lädt“. */
  async function fetchJson(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CFG.TRANSIT_TIMEOUT_SECONDS * 1000);
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
    }
  }

  /**
   * Haltestellen-ID ermitteln: fest konfiguriert (id) oder per Namenssuche (query).
   * Das Suchergebnis wird je Dienst im Browser gespeichert, damit nur einmal gesucht wird.
   */
  async function resolveStopId(api) {
    const stop = OBJ.transitStop;
    if (stop.id) return stop.id;

    const cacheKey = `mieterapp.stop.${new URL(api).hostname}.${stop.query}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return cached;
    } catch (e) { /* Storage blockiert */ }

    const data = await fetchJson(`${api}/locations?query=${encodeURIComponent(stop.query)}`
      + "&results=8&addresses=false&poi=false");
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
    loadDepartures();
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
    $("#transitRefresh").addEventListener("click", loadDepartures);
    // Nach Rückkehr in die App sofort aktualisieren.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && currentView === "oepnv") loadDepartures();
    });
  }

  /* ======================================================================
     4. EPIC 2 – Formulare, Zähler & Services
     ====================================================================== */

  // US 2.1 – Wasserzähler
  function initWaterForm() {
    $("#waterRoom").innerHTML = OBJ.waterRooms.map((r) => `<option>${esc(r)}</option>`).join("");

    bindForm("#formWater", async (form) => {
      const f = form.elements;
      return {
        action: "submitMeterReading",
        type: "Wasserzähler",
        wohnung: f.wohnung.value.trim(),
        raum: f.raum.value,
        art: form.querySelector('input[name="art"]:checked').value,
        zaehlernummer: f.zaehlernummer.value.trim(),
        zaehlerstand: f.zaehlerstand.value.trim().replace(",", "."),
        name: f.name.value.trim(),
        photo: await readPhoto(f.foto.files[0]),
      };
    }, "Danke! Ihr Zählerstand wurde übermittelt.");
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
  function bindForm(selector, buildPayload, successMsg, preValidate) {
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
        toast(successMsg, "ok");
        form.reset();
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
      </details>`).join("");
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
    renderCalendar();
    renderInfos();
    initTransit();

    initWaterForm();
    initPowerForm();
    initElectricForm();
    initBellForm();
    initDefectForm();
    initPhotoPreviews();

    initRouter();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service Worker:", e));
    }
  }

  // Für Tests in der Browser-Konsole.
  window.MieterApp = { addWorkdays, isWeekend, toIsoDate, validateWorkday };

  init();
})();

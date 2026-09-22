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

  function resolveObject() {
    const fromUrl = new URLSearchParams(location.search).get("obj");
    let key = fromUrl && CFG.OBJECTS[fromUrl] ? fromUrl : null;

    // Beim Start vom Homescreen fehlt der Parameter evtl. – letztes Haus merken.
    try {
      if (key) localStorage.setItem(OBJ_STORAGE_KEY, key);
      else key = localStorage.getItem(OBJ_STORAGE_KEY);
    } catch (e) { /* Storage blockiert – egal */ }

    if (!key || !CFG.OBJECTS[key]) key = CFG.DEFAULT_OBJECT;
    const base = CFG.OBJECTS[CFG.DEFAULT_OBJECT];
    return Object.assign({ key }, base, CFG.OBJECTS[key]);
  }

  const OBJ = resolveObject();

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
    document.title = `${view.dataset.title} · ${OBJ.name}`;

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
    const route = () => showView(location.hash.replace(/^#/, "") || DEFAULT_VIEW);
    window.addEventListener("hashchange", route);
    route();
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
  const transit = { timer: null, loading: false };

  async function loadDepartures() {
    if (transit.loading) return;
    transit.loading = true;
    const status = $("#transitStatus");
    status.textContent = "Lade Abfahrten …";

    const url = `${CFG.TRANSIT_API}/stops/${encodeURIComponent(OBJ.transitStop.id)}/departures`
      + `?duration=60&results=${CFG.TRANSIT_RESULTS}&remarks=false&language=de`;

    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // transport.rest v6 liefert { departures: [...] }, ältere Versionen ein Array.
      const departures = Array.isArray(data) ? data : data.departures || [];
      renderDepartures(departures);
      status.textContent = `Stand ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr · aktualisiert alle ${CFG.TRANSIT_REFRESH_SECONDS} s`;
    } catch (err) {
      console.error("ÖPNV-Abfrage fehlgeschlagen:", err);
      status.textContent = "Abfahrten konnten nicht geladen werden. Neuer Versuch in Kürze.";
    } finally {
      transit.loading = false;
    }
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
      const text = `Hallo, ich benötige den Zählerstand/Zugang für Wohnung ${wohnung}.`;
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
        payload.object = OBJ.key;
        payload.objectName = OBJ.name;
        payload.submittedAt = new Date().toISOString();
        await postToBackend(payload);
        toast(successMsg, "ok");
        form.reset();
        form.classList.remove("was-validated");
        $$(".photo-preview", form).forEach((img) => { img.hidden = true; img.removeAttribute("src"); });
        form.dispatchEvent(new Event("app:reset"));
      } catch (err) {
        console.error(err);
        toast("Senden fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.", "error");
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
    if (data.ok === false) throw new Error(data.error || "Backend-Fehler");
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
        <summary>${esc(r.title)}</summary>
        <p>${esc(r.text)}</p>
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
    $("#objectName").textContent = OBJ.name;
    $("#demoBanner").hidden = !!CFG.API_URL;

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

/**
 * Mieter-App – Backend (Google Apps Script, an eine Google-Tabelle gebunden)
 *
 * Einrichtung: siehe backend/README.md
 *   1. Tabelle anlegen → Erweiterungen → Apps Script → diesen Code einfügen
 *   2. Funktion setup() einmal ausführen
 *   3. Bereitstellen → Web-App (Ausführen als: Ich, Zugriff: Jeder)
 *
 * Script-Eigenschaften (Projekteinstellungen → Script-Eigenschaften):
 *   NOTIFY_EMAIL        optional, E-Mail(s) für Benachrichtigungen, kommagetrennt
 *   HAUSMEISTER_EMAIL   optional, überschreibt CONFIG.HAUSMEISTER_EMAIL (Aufträge an den Hausmeister)
 *   HAUSMEISTER_TOKENS  optional (Epic 3), JSON: {"geheimer-token": "hm_becker"}
 *   PHOTO_FOLDER_ID     wird von setup() automatisch gesetzt
 *   APP_PIN             optional, Zugangs-PIN der App (Standard: CONFIG.APP_PIN). Bei Änderung auch
 *                       PIN_SHA256 in js/config.js anpassen.
 */

const CONFIG = {
  SHEETS: {
    tickets: {
      name: "Tickets",
      headers: ["ID", "Eingang", "Typ", "Status", "Haus", "Aufgang", "Aufgang-ID", "Wohnung", "Name",
        "Termin", "Details", "Ort", "Telefon/Kontakt", "Foto", "Erledigt am", "Notiz Verwaltung",
        "Erledigt-Code"],
    },
    meter: {
      name: "Zählerstände",
      headers: ["ID", "Eingang", "Haus", "Aufgang", "Aufgang-ID", "Wohnung", "Raum", "Art",
        "Zählernummer", "Zählerstand", "Name", "Foto", "Geprüft", "Erfassungs-ID", "Ablesedatum", "Einheit"],
    },
    // Wird automatisch aus "Zählerstände" erzeugt – nicht von Hand bearbeiten.
    meterOverview: {
      name: "Übersicht Zähler",
      headers: ["Haus", "Aufgang", "Wohnung", "Ablesedatum", "Raum", "Art", "Zählernummer",
        "Zählerstand", "Einheit", "Foto", "Name", "Eingang", "Erfassungs-ID", "Geprüft"],
    },
    // Hinweise für die App-Startseite, von der Verwaltung gepflegt.
    news: {
      name: "Aktuelles",
      headers: ["Aktiv", "Von", "Bis", "Titel", "Text", "Wichtig", "Nur für Aufgang-IDs"],
    },
    cleaning: {
      name: "Reinigung",
      headers: ["Zeitpunkt (Scan)", "Bereich-Token", "Hausmeister", "Eingang Server"],
    },
  },
  TICKET_TYPES: ["Elektroraum", "Klingelschild", "Mangel"],
  STATUS_OPEN: "offen",
  STATUS_VALUES: ["offen", "in Arbeit", "erledigt"],
  PHOTO_FOLDER_NAME: "Mieter-App Fotos",
  MAX_TEXT: 2000,
  MAX_PHOTO_BYTES: 6 * 1024 * 1024,
  TIMEZONE: "Europe/Berlin",
  MIN_WORKDAYS_ELEKTRO: 2,
  MAX_METERS: 8,
  // Zählerarten und erlaubte Einheiten (erste = Standard).
  METER_UNITS: { Kalt: ["m³"], Warm: ["m³"], Heizung: ["kWh", "MWh"] },
  SITE_NAME: "WEG Wartenberger Dorfkrug",
  SENDER_NAME: "Willbrandt und Kompagnon",
  // Aufträge an den Hausmeister (z. B. Klingelschild) gehen an diese Adresse.
  HAUSMEISTER_EMAIL: "info@gs-schreier.de",
  // Adresse dieser Web-App (für den Erledigt-Link in E-Mails). Leer = automatisch ermitteln.
  // Zugangs-PIN (steht auf den Aushängen). Script-Eigenschaft APP_PIN hat Vorrang.
  APP_PIN: "13059",
  // Schutz vor Missbrauch der offenen Adresse (gilt für alle Nutzer zusammen):
  LIMITS: {
    pinFailsPer15Min: 30,     // danach 15 Minuten keine PIN-Prüfung möglich
    submitsPerHour: 40,       // Meldungen insgesamt pro Stunde
    hausmeisterMailsPer6h: 10, // Klingelschild-Aufträge per E-Mail je 6 Stunden
    maxRequestBytes: 25 * 1024 * 1024,
  },
  WEBAPP_URL: "https://script.google.com/macros/s/AKfycbzhN3ZvHKkXgBEyHddQNgCMd7rGNDpnvLdrS82Q8XO-MC8r4UFhDQnJWVnGtTygYcrd/exec",
};

/* ==========================================================================
   Einmalige Einrichtung
   ========================================================================== */

/** Legt Tabellenblätter, Kopfzeilen, Status-Auswahl und den Foto-Ordner an. */
function setup() {
  const ss = getSpreadsheet();
  Object.values(CONFIG.SHEETS).forEach((def) => {
    const sheet = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
    sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers])
      .setFontWeight("bold").setBackground("#eef0e6");
    sheet.setFrozenRows(1);
  });

  const tickets = ss.getSheetByName(CONFIG.SHEETS.tickets.name);
  const statusCol = CONFIG.SHEETS.tickets.headers.indexOf("Status") + 1;
  tickets.getRange(2, statusCol, tickets.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STATUS_VALUES, true).build()
  );

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("PHOTO_FOLDER_ID")) {
    const folder = DriveApp.createFolder(CONFIG.PHOTO_FOLDER_NAME);
    props.setProperty("PHOTO_FOLDER_ID", folder.getId());
  }

  const leer = ss.getSheetByName("Tabellenblatt1") || ss.getSheetByName("Sheet1");
  if (leer && leer.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(leer);

  setupNewsSheet();
  rebuildMeterOverview();
  Logger.log("Einrichtung abgeschlossen. Foto-Ordner: %s", props.getProperty("PHOTO_FOLDER_ID"));
}

/** Menü „Mieter-App“ in der Tabelle. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Mieter-App")
    .addItem("Zähler-Übersicht aktualisieren", "rebuildMeterOverview")
    .addToUi();
}

/* ==========================================================================
   HTTP-Endpunkte
   ========================================================================== */

/**
 * POST: Das Frontend sendet JSON als text/plain (vermeidet CORS-Preflight).
 */
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || "{}";
    if (raw.length > CONFIG.LIMITS.maxRequestBytes) throw userError("Anfrage zu groß");
    const p = JSON.parse(raw);

    // Hausmeister-Aktion hat eigenen Zugang (Token), alles andere braucht die App-PIN.
    if (p.action === "logCleaning") return json(logCleaning(p));
    requirePin(p.pin);

    // Honeypot: Nur Bots füllen das unsichtbare Feld aus. Still "Erfolg" melden.
    if (p.website) return json({ ok: true });

    switch (p.action) {
      case "submitTicket": rateLimit("submit", CONFIG.LIMITS.submitsPerHour, 3600); return json(submitTicket(p));
      case "submitMeterReadings": rateLimit("submit", CONFIG.LIMITS.submitsPerHour, 3600); return json(submitMeterReadings(p));
      case "submitMeterReading": // ältere App-Version
        rateLimit("submit", CONFIG.LIMITS.submitsPerHour, 3600);
        return json(submitMeterReadings(Object.assign({}, p, { meters: [p] })));
      default: return json({ ok: false, error: "Unbekannte Aktion" });
    }
  } catch (err) {
    return errorJson(err);
  }
}

/**
 * GET: Statusprüfung (ohne Parameter) und Auftragsliste für Hausmeister (US 3.3).
 *   ?action=getTasks&token=...
 */
function doGet(e) {
  try {
    const q = (e && e.parameter) || {};
    if (q.action === "getTasks") return json(getTasks(q.token));
    if (q.action === "done") return completeTicketPage(q);
    if (q.action === "status") { requirePin(q.pin); return json(getStatus(q.ids)); }
    if (q.action === "news") { requirePin(q.pin); return json(getNews(q.obj)); }
    return json({ ok: true, service: "mieter-app" });
  } catch (err) {
    return errorJson(err);
  }
}

/* ==========================================================================
   Aktionen
   ========================================================================== */

/** US 2.3 / 2.4 – Elektroraum, Klingelschild, Mangel */
function submitTicket(p) {
  const type = str(p.type, 40);
  if (CONFIG.TICKET_TYPES.indexOf(type) === -1) throw userError("Unbekannter Antragstyp");

  const details = str(p.details);
  if (!details) throw userError("Bitte Details angeben");

  let termin = "";
  if (type === "Elektroraum") {
    termin = str(p.date, 10);
    const dateError = checkWorkdayDate(termin);
    if (dateError) throw userError(dateError);
    if (!str(p.wohnung) || !str(p.name)) throw userError("Wohnung und Name sind Pflichtfelder");
  }
  if (type === "Klingelschild" && (!str(p.wohnung) || !str(p.name))) {
    throw userError("Wohnung und Name sind Pflichtfelder");
  }

  const id = newId("T");
  const doneCode = Utilities.getUuid().replace(/-/g, "");
  const photoUrl = p.photo ? savePhoto(p.photo, `${id}_${type}`) : "";

  appendRow(CONFIG.SHEETS.tickets.name, [
    id, new Date(), type, CONFIG.STATUS_OPEN,
    str(p.house, 60), str(p.entrance, 60), str(p.object, 20),
    str(p.wohnung, 60), str(p.name, 80), termin, details,
    str(p.ort, 60), str(p.telefon || p.kontakt, 120), photoUrl, "", "", doneCode,
  ]);

  if (type === "Klingelschild") {
    if (withinLimit("hausmeisterMail", CONFIG.LIMITS.hausmeisterMailsPer6h, 21600)) sendBellOrder(id, doneCode, p);
    else console.warn("Tageslimit Hausmeister-Mails erreicht – Auftrag nur in der Tabelle:", id);
  }

  notify(`Neuer Antrag: ${type} (${id})`, [
    `Typ: ${type}`,
    `Aufgang: ${str(p.house)} · ${str(p.entrance)}`,
    `Wohnung: ${str(p.wohnung)}`,
    `Name: ${str(p.name)}`,
    termin ? `Termin: ${termin}` : "",
    str(p.ort) ? `Ort: ${str(p.ort)}` : "",
    `Details: ${details}`,
    photoUrl ? `Foto: ${photoUrl}` : "",
  ]);

  return { ok: true, id };
}

/** US 2.1 – Wasserzähler: mehrere Zähler einer Wohnung in einer Meldung */
function submitMeterReadings(p) {
  const wohnung = str(p.wohnung, 60);
  if (!wohnung) throw userError("Bitte die Wohnung angeben");
  const meters = Array.isArray(p.meters) ? p.meters : [];
  if (!meters.length) throw userError("Bitte mindestens einen Zähler erfassen");
  if (meters.length > CONFIG.MAX_METERS) throw userError("Zu viele Zähler in einer Meldung");

  const ablesedatum = parseIsoDate(p.ablesedatum) || new Date();
  const checked = meters.map((m, i) => {
    const nr = str(m.zaehlernummer, 60);
    const stand = str(m.zaehlerstand, 20).replace(",", ".");
    const art = str(m.art, 10);
    const label = `Zähler ${i + 1}`;
    if (!nr) throw userError(`${label}: Zählernummer fehlt`);
    if (!/^\d+(\.\d{1,3})?$/.test(stand)) throw userError(`${label}: ungültiger Zählerstand`);
    if (CONFIG.METER_UNITS[art] === undefined) throw userError(`${label}: ungültige Zählerart`);
    const units = CONFIG.METER_UNITS[art];
    const einheit = units.indexOf(str(m.einheit, 5)) !== -1 ? str(m.einheit, 5) : units[0];
    if (!m.photo) throw userError(`${label}: bitte ein Foto anhängen`);
    return { nr, stand: Number(stand), art, einheit, raum: str(m.raum, 30), photo: m.photo };
  });

  const batchId = newId("E");
  const now = new Date();
  const rows = checked.map((m) => {
    const id = newId("Z");
    const photoUrl = savePhoto(m.photo, `${id}_${wohnung}_${m.raum}_${m.art}`);
    return [
      id, now, str(p.house, 60), str(p.entrance, 60), str(p.object, 20),
      wohnung, m.raum, m.art, m.nr, m.stand, str(p.name, 80), photoUrl, false, batchId, ablesedatum, m.einheit,
    ];
  });
  appendRows(CONFIG.SHEETS.meter.name, rows);

  try { rebuildMeterOverview(); } catch (err) { console.error("Übersicht:", err); }

  notify(`Neue Zählerstände: ${plain(p.entrance, 60)}, ${whg(wohnung)} (${rows.length} Zähler)`, [
    `Aufgang: ${plain(p.house, 60)} · ${plain(p.entrance, 60)}`,
    `Wohnung: ${wohnung}`,
    `Name: ${plain(p.name, 80)}`,
    `Ablesedatum: ${Utilities.formatDate(ablesedatum, CONFIG.TIMEZONE, "dd.MM.yyyy")}`,
    "",
    ...rows.map((r) => `${r[6]} ${r[7]}: Zähler ${r[8]} – Stand ${String(r[9]).replace(".", ",")} ${r[15]} – Foto: ${r[11]}`),
    "",
    `Erfassungs-ID: ${batchId}`,
  ]);
  return { ok: true, id: batchId, count: rows.length };
}

/**
 * Baut das Blatt „Übersicht Zähler“ neu auf: sortiert nach Haus, Aufgang, Wohnung und
 * Ablesedatum (neueste zuerst), jede Wohnung farblich als „Paket“ gruppiert, mit
 * Foto-Link und Filter. Wird nach jeder Meldung und über das Menü aufgerufen.
 */
function rebuildMeterOverview() {
  const ss = getSpreadsheet();
  const src = ss.getSheetByName(CONFIG.SHEETS.meter.name);
  if (!src) return;
  const def = CONFIG.SHEETS.meterOverview;
  const out = ss.getSheetByName(def.name) || ss.insertSheet(def.name);

  const values = src.getDataRange().getValues();
  const h = values.shift() || [];
  const col = (name) => h.indexOf(name);
  const get = (r, name) => (col(name) >= 0 ? r[col(name)] : "");

  const rows = values.filter((r) => r[0]).map((r) => {
    const eingang = get(r, "Eingang");
    const ablese = get(r, "Ablesedatum") || eingang;
    return {
      haus: String(get(r, "Haus")), aufgang: String(get(r, "Aufgang")), wohnung: String(get(r, "Wohnung")),
      ablese, raum: get(r, "Raum"), art: get(r, "Art"), nr: get(r, "Zählernummer"),
      stand: col("Zählerstand") >= 0 ? get(r, "Zählerstand") : get(r, "Zählerstand (m³)"), // alte Kopfzeile
      einheit: get(r, "Einheit") || (CONFIG.METER_UNITS[get(r, "Art")] || ["m³"])[0], foto: String(get(r, "Foto") || ""), name: get(r, "Name"),
      eingang, erfassung: get(r, "Erfassungs-ID") || get(r, "ID"), geprueft: get(r, "Geprüft") === true,
    };
  });

  const cmp = (a, b) => String(a).localeCompare(String(b), "de", { numeric: true, sensitivity: "base" });
  const time = (d) => (d instanceof Date ? d.getTime() : 0);
  rows.sort((a, b) => cmp(a.haus, b.haus) || cmp(a.aufgang, b.aufgang) || cmp(a.wohnung, b.wohnung)
    || time(b.ablese) - time(a.ablese) || cmp(a.raum, b.raum) || cmp(a.art, b.art));

  const existingFilter = out.getFilter();
  if (existingFilter) existingFilter.remove();
  out.clear();
  out.getRange(1, 1, 1, def.headers.length).setValues([def.headers])
    .setFontWeight("bold").setBackground("#6d7454").setFontColor("#ffffff");
  out.setFrozenRows(1);

  if (rows.length) {
    // getValues() liefert Text ohne das schützende ' – daher erneut absichern.
    const data = rows.map((r) => [
      r.haus, r.aufgang, r.wohnung, r.ablese, r.raum, r.art, r.nr, r.stand, r.einheit,
      "", // Foto-Link wird unten als echter Link gesetzt
      r.name, r.eingang, r.erfassung, r.geprueft,
    ].map(protectCell));
    const range = out.getRange(2, 1, data.length, def.headers.length);
    range.setValues(data);

    // Foto als echter Link (Rich Text) – unabhängig von der Spracheinstellung der Tabelle,
    // anders als eine HYPERLINK-Formel (dort Komma vs. Semikolon).
    const fotoCol = def.headers.indexOf("Foto") + 1;
    out.getRange(2, fotoCol, data.length, 1).setRichTextValues(rows.map((r) => [
      /^https:\/\/drive\.google\.com\//.test(r.foto)
        ? SpreadsheetApp.newRichTextValue().setText("Foto öffnen").setLinkUrl(r.foto).build()
        : SpreadsheetApp.newRichTextValue().setText("").build(),
    ]));

    // Jede Wohnung als farbiges „Paket“ (abwechselnd hell/weiß)
    let shade = false;
    let lastKey = null;
    const colors = rows.map((r) => {
      const key = `${r.haus}|${r.aufgang}|${r.wohnung}`;
      if (key !== lastKey) { shade = !shade; lastKey = key; }
      return new Array(def.headers.length).fill(shade ? "#eef0e6" : "#ffffff");
    });
    range.setBackgrounds(colors);
    const oc = (name) => def.headers.indexOf(name) + 1;
    out.getRange(2, oc("Ablesedatum"), data.length, 1).setNumberFormat("dd.MM.yyyy");
    out.getRange(2, oc("Eingang"), data.length, 1).setNumberFormat("dd.MM.yyyy HH:mm");
    out.getRange(2, oc("Zählerstand"), data.length, 1).setNumberFormat("0.000");
  }
  out.getRange(1, 1, Math.max(rows.length, 1) + 1, def.headers.length).createFilter();
  out.autoResizeColumns(1, def.headers.length);
}

/** US 3.2 – Reinigungsnachweis per QR-Scan (Frontend folgt in Epic 3) */
function logCleaning(p) {
  const user = authHausmeister(p.token);
  const areaToken = str(p.areaToken, 80);
  if (!/^[A-Z0-9_\-]+$/i.test(areaToken)) throw userError("Ungültiger QR-Code");

  const scanned = new Date(p.timestamp);
  appendRow(CONFIG.SHEETS.cleaning.name, [
    isNaN(scanned) ? "" : scanned, areaToken, user, new Date(),
  ]);
  return { ok: true };
}

/** US 3.3 – offene Aufträge (read-only) */
function getTasks(token) {
  authHausmeister(token);
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.tickets.name);
  const values = sheet.getDataRange().getValues();
  const h = values.shift();
  const col = (name) => h.indexOf(name);

  const tasks = values
    .filter((r) => r[col("Status")] && r[col("Status")] !== "erledigt")
    .map((r) => ({
      id: r[col("ID")],
      type: r[col("Typ")],
      status: r[col("Status")],
      house: r[col("Haus")],
      entrance: r[col("Aufgang")],
      wohnung: r[col("Wohnung")],
      date: r[col("Termin")] instanceof Date
        ? Utilities.formatDate(r[col("Termin")], CONFIG.TIMEZONE, "yyyy-MM-dd")
        : String(r[col("Termin")] || ""),
      details: r[col("Details")],
      ort: r[col("Ort")],
    }))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  return { ok: true, tasks };
}

/* ==========================================================================
   Status von Meldungen (für „Meine Meldungen“ in der App)
   Gibt bewusst nur Art, Status und Datum zurück – keine persönlichen Daten.
   ========================================================================== */

function getStatus(idsParam) {
  const ids = String(idsParam || "").split(",").map((x) => x.trim().toUpperCase())
    .filter((x) => /^[TE]-\d{6}-[A-Z0-9]{4}$/.test(x)).slice(0, 20);
  if (!ids.length) return { ok: true, items: [] };
  const ss = getSpreadsheet();
  const iso = (d) => (d instanceof Date ? d.toISOString() : "");

  const tickets = ss.getSheetByName(CONFIG.SHEETS.tickets.name).getDataRange().getValues();
  const th = tickets.shift();
  const tc = (n) => th.indexOf(n);
  const meters = ss.getSheetByName(CONFIG.SHEETS.meter.name).getDataRange().getValues();
  const mh = meters.shift();
  const mc = (n) => mh.indexOf(n);

  const items = ids.map((id) => {
    if (id[0] === "T") {
      const r = tickets.find((row) => row[tc("ID")] === id);
      if (!r) return { id, status: "unbekannt" };
      return {
        id, kind: "ticket", type: r[tc("Typ")], status: r[tc("Status")] || "offen",
        created: iso(r[tc("Eingang")]), done: iso(r[tc("Erledigt am")]),
      };
    }
    const rows = meters.filter((row) => mc("Erfassungs-ID") >= 0 && row[mc("Erfassungs-ID")] === id);
    if (!rows.length) return { id, status: "unbekannt" };
    const checked = rows.every((row) => row[mc("Geprüft")] === true);
    return {
      id, kind: "meter", type: "Zählerstände", count: rows.length,
      status: checked ? "geprüft" : "eingegangen", created: iso(rows[0][mc("Eingang")]),
    };
  });
  return { ok: true, items };
}

/* ==========================================================================
   Aktuelles / Schwarzes Brett – Pflege im Blatt „Aktuelles“
   ========================================================================== */

function setupNewsSheet() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.news.name);
  if (!sheet) return;
  const rules = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange(2, 1, 200, 1).setDataValidation(rules);
  sheet.getRange(2, 6, 200, 1).setDataValidation(rules);
  sheet.getRange(2, 2, 200, 2).setNumberFormat("dd.MM.yyyy");
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 1, 7).setValues([[
      false, new Date(), "", "Beispiel: Wasser abgestellt",
      "Am Mittwoch von 9 bis 12 Uhr ist wegen Wartungsarbeiten das Wasser abgestellt.", false, "",
    ]]);
  }
}

function getNews(obj) {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.news.name);
  if (!sheet) return { ok: true, items: [] };
  const values = sheet.getDataRange().getValues();
  const h = values.shift() || [];
  const c = (n) => h.indexOf(n);
  const [ty, tm, td] = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd").split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  const day = (d) => (d instanceof Date ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null);
  const ymd = (d) => (d instanceof Date ? Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd") : "");
  const object = String(obj || "").trim();

  const items = values
    .filter((r) => r[c("Aktiv")] === true && String(r[c("Titel")] || r[c("Text")]).trim())
    .filter((r) => {
      const from = day(r[c("Von")]);
      const to = day(r[c("Bis")]);
      return (!from || from <= today) && (!to || to >= today);
    })
    .filter((r) => {
      const only = String(r[c("Nur für Aufgang-IDs")] || "").split(/[,;\s]+/).filter(Boolean);
      return !only.length || only.indexOf(object) !== -1;
    })
    .map((r) => ({
      title: plain(r[c("Titel")], 120), text: plain(r[c("Text")], 1000),
      important: r[c("Wichtig")] === true, from: ymd(r[c("Von")]), to: ymd(r[c("Bis")]),
    }))
    .sort((a, b) => (b.important - a.important) || b.from.localeCompare(a.from));
  return { ok: true, items: items.slice(0, 10) };
}

/* ==========================================================================
   Hilfsfunktionen
   ========================================================================== */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function userError(message, code) {
  const err = new Error(message);
  err.userMessage = message;
  if (code) err.code = code;
  return err;
}

function errorJson(err) {
  if (!err.userMessage) console.error(err);
  const out = { ok: false, error: err.userMessage || "Serverfehler" };
  if (err.code) out.code = err.code;
  return json(out);
}

/* ---------- Zugangs-PIN und Missbrauchsschutz ---------- */

function appPin() {
  return String(PropertiesService.getScriptProperties().getProperty("APP_PIN") || CONFIG.APP_PIN || "").trim();
}

/**
 * Prüft die App-PIN. Fehlversuche werden (für alle Nutzer zusammen) gezählt; ab
 * CONFIG.LIMITS.pinFailsPer15Min ist 15 Minuten lang keine Prüfung möglich (gegen Durchprobieren).
 */
function requirePin(pin) {
  const expected = appPin();
  if (!expected) return;
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get("pinFails") || 0);
  if (fails >= CONFIG.LIMITS.pinFailsPer15Min) {
    throw userError("Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.", "pin_locked");
  }
  if (String(pin || "").trim() === expected) return;
  cache.put("pinFails", String(fails + 1), 900);
  throw userError("PIN ungültig", "pin");
}

/** Wie withinLimit, wirft aber einen Fehler, wenn das Limit erreicht ist. */
function rateLimit(key, max, seconds) {
  if (!withinLimit(key, max, seconds)) {
    throw userError("Derzeit gehen sehr viele Meldungen ein. Bitte später erneut versuchen oder anrufen.");
  }
}

/** Zählt Aufrufe je Zeitfenster (Script-Cache, max. 6 Std.). true = noch im Limit. */
function withinLimit(key, max, seconds) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const slot = Math.floor(Date.now() / 1000 / seconds);
    const k = `rl_${key}_${slot}`;
    const n = Number(cache.get(k) || 0);
    if (n >= max) return false;
    cache.put(k, String(n + 1), Math.min(seconds, 21600));
    return true;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Text bereinigen: kürzen, trimmen und gegen Formel-Injection schützen
 * (Eingaben wie "=HYPERLINK(...)" würden sonst in der Tabelle ausgeführt).
 */
function str(value, max) {
  return protectCell(value == null ? "" : String(value).trim().slice(0, max || CONFIG.MAX_TEXT));
}

/** Text, der in Tabellen als Formel gelten würde, mit ' als reinen Text kennzeichnen. */
function protectCell(s) {
  return typeof s === "string" && /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function newId(prefix) {
  const day = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyMMdd");
  const rand = Utilities.getUuid().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `${prefix}-${day}-${rand}`;
}

/** Die Tabelle, an die das Script gebunden ist. */
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** "2026-09-23" → Date (lokal) oder null. */
function parseIsoDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/** Schreibt mehrere Zeilen am Stück (unter Sperre). */
function appendRows(sheetName, rows) {
  if (!rows.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSpreadsheet().getSheetByName(sheetName);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
}

/** Schreibt eine Zeile; die Sperre verhindert Konflikte bei gleichzeitigen Anfragen. */
function appendRow(sheetName, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    getSpreadsheet().getSheetByName(sheetName).appendRow(row);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Speichert ein Base64-Foto im (privaten) Drive-Ordner und gibt den Link zurück.
 * Die Dateien werden NICHT öffentlich freigegeben (Datenschutz).
 */
function savePhoto(photo, baseName) {
  if (!photo || !photo.data) return "";
  const mime = String(photo.mimeType || "");
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) throw userError("Nur Bilddateien erlaubt");

  const bytes = Utilities.base64Decode(photo.data);
  if (bytes.length > CONFIG.MAX_PHOTO_BYTES) throw userError("Foto zu groß");

  const folderId = PropertiesService.getScriptProperties().getProperty("PHOTO_FOLDER_ID");
  if (!folderId) throw new Error("PHOTO_FOLDER_ID fehlt – bitte setup() ausführen");

  const ext = mime.split("/")[1].replace("jpeg", "jpg");
  const safeName = String(baseName).replace(/[^\wäöüÄÖÜß\-]+/g, "_").slice(0, 80);
  const file = DriveApp.getFolderById(folderId)
    .createFile(Utilities.newBlob(bytes, mime, `${safeName}.${ext}`));
  return file.getUrl();
}

/**
 * Prüft das Elektroraum-Datum wie im Frontend: Mo–Fr, mindestens 2 Werktage Vorlauf.
 * Gibt "" zurück, wenn gültig, sonst eine Fehlermeldung.
 */
function checkWorkdayDate(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "Ungültiges Datum";
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  if (day === 0 || day === 6) return "Am Wochenende ist kein Termin möglich";

  // "Heute" in Berliner Zeit, unabhängig von der Zeitzone des Servers.
  const [ty, tm, td] = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd").split("-").map(Number);
  const min = new Date(ty, tm - 1, td);
  let added = 0;
  while (added < CONFIG.MIN_WORKDAYS_ELEKTRO) {
    min.setDate(min.getDate() + 1);
    if (min.getDay() !== 0 && min.getDay() !== 6) added++;
  }
  if (date < min) return "Termin frühestens in 2 Werktagen möglich";
  return "";
}

/** Hausmeister-Token prüfen (Epic 3). Gibt die Hausmeister-ID zurück. */
function authHausmeister(token) {
  const raw = PropertiesService.getScriptProperties().getProperty("HAUSMEISTER_TOKENS") || "{}";
  let tokens;
  try { tokens = JSON.parse(raw); } catch (e) { tokens = {}; }
  const user = token && Object.prototype.hasOwnProperty.call(tokens, token) ? tokens[token] : null;
  if (!user) throw userError("Nicht berechtigt");
  return user;
}

/** Optionale E-Mail an die Verwaltung. Fehler hier dürfen den Antrag nicht scheitern lassen. */
function notify(subject, lines) {
  const to = (PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || "").trim();
  if (!to) return;
  try {
    MailApp.sendEmail({
      to,
      subject: `[Mieter-App] ${subject}`,
      body: lines.filter(Boolean).join("\n") + "\n\n" + getSpreadsheet().getUrl(),
    });
  } catch (err) {
    console.error("E-Mail fehlgeschlagen:", err);
  }
}

/**
 * Test im Script-Editor: Funktion „testMail“ auswählen → Ausführen.
 * Zeigt im Ausführungsprotokoll, an wen gesendet wird, und verschickt eine Testmail.
 */
function testMail() {
  const to = (PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || "").trim();
  if (!to) {
    Logger.log("NOTIFY_EMAIL ist NICHT gesetzt. Projekteinstellungen → Script-Eigenschaften → NOTIFY_EMAIL anlegen.");
    return;
  }
  Logger.log("NOTIFY_EMAIL = %s · verbleibendes Mail-Kontingent heute: %s", to, MailApp.getRemainingDailyQuota());
  MailApp.sendEmail({
    to,
    subject: "[Mieter-App] Testmail",
    body: "Diese Testmail bestätigt, dass die Benachrichtigungen der Mieter-App ankommen.\n\n" + getSpreadsheet().getUrl(),
  });
  Logger.log("Testmail an %s verschickt. Bitte auch den Spam-Ordner prüfen.", to);
}

/* ==========================================================================
   Aufträge an den Hausmeister (Klingelschild) mit Erledigt-Link
   ========================================================================== */

/** Reiner Text ohne Tabellen-Schutzzeichen, für E-Mails. */
function plain(value, max) {
  return value == null ? "" : String(value).trim().slice(0, max || CONFIG.MAX_TEXT);
}

/** "04" → "Whg 04", "Whg 04" bleibt unverändert. */
function whg(value) {
  const v = String(value || "").replace(/^'/, "").trim();
  return /^(whg|wohnung|we)\b/i.test(v) ? v : `Whg ${v}`;
}

function escHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function doneUrl(id, code) {
  const base = CONFIG.WEBAPP_URL || ScriptApp.getService().getUrl();
  return `${base}?action=done&id=${encodeURIComponent(id)}&t=${encodeURIComponent(code)}`;
}

/** E-Mail an den Hausmeister: Klingelschild aktualisieren. Fehler blockieren den Antrag nicht. */
function sendBellOrder(id, code, p) {
  const to = PropertiesService.getScriptProperties().getProperty("HAUSMEISTER_EMAIL") || CONFIG.HAUSMEISTER_EMAIL;
  if (!to) return;
  const link = doneUrl(id, code);
  const facts = [
    ["Adresse", [plain(p.entrance, 60), plain(p.house, 60)].filter(Boolean).join(" · ")],
    ["Wohnung", plain(p.wohnung, 60)],
    ["Name", plain(p.name, 80)],
    ["Neue Beschriftung", plain(p.details, 200)],
    ["Kontakt", plain(p.kontakt || p.telefon, 120)],
  ].filter((f) => f[1]);

  const body = [
    "Liebes Hausmeister-Team,",
    "",
    `bitte aktualisieren Sie folgendes Klingelschild in der ${CONFIG.SITE_NAME}:`,
    "",
    ...facts.map(([k, v]) => `${k}: ${v}`),
    "",
    `Ticketnummer: ${id}`,
    "",
    "Nach Erledigung bitte hier bestätigen:",
    link,
    "",
    "Vielen Dank!",
    CONFIG.SENDER_NAME,
  ].join("\n");

  const htmlBody = `
    <p>Liebes Hausmeister-Team,</p>
    <p>bitte aktualisieren Sie folgendes Klingelschild in der ${escHtml(CONFIG.SITE_NAME)}:</p>
    <table cellpadding="4" style="border-collapse:collapse">
      ${facts.map(([k, v]) => `<tr><td style="color:#555">${escHtml(k)}:</td><td><strong>${escHtml(v)}</strong></td></tr>`).join("")}
    </table>
    <p>Ticketnummer: <strong>${escHtml(id)}</strong></p>
    <p><a href="${escHtml(link)}" style="display:inline-block;padding:12px 20px;background:#6d7454;color:#fff;
      text-decoration:none;border-radius:8px;font-weight:bold">Als erledigt melden</a></p>
    <p>Vielen Dank!<br>${escHtml(CONFIG.SENDER_NAME)}</p>`;

  try {
    const replyTo = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || "";
    MailApp.sendEmail({
      to,
      subject: `Klingelschild aktualisieren – ${plain(p.entrance, 60)}, ${whg(plain(p.wohnung, 60))} (${id})`,
      body,
      htmlBody,
      name: CONFIG.SENDER_NAME,
      replyTo: replyTo.split(",")[0].trim() || undefined,
    });
  } catch (err) {
    console.error("Hausmeister-Mail fehlgeschlagen:", err);
  }
}

/**
 * Erledigt-Link aus der E-Mail. Erst eine Bestätigungsseite, dann (confirm=1) Status setzen –
 * so lösen automatische Link-Prüfungen von E-Mail-Programmen nichts aus.
 */
function completeTicketPage(q) {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.tickets.name);
  const values = sheet.getDataRange().getValues();
  const h = values[0];
  const c = (name) => h.indexOf(name);
  const rowIndex = values.findIndex((r, i) => i > 0 && r[c("ID")] === q.id);
  const row = rowIndex > 0 ? values[rowIndex] : null;

  if (!row || !q.t || String(row[c("Erledigt-Code")]) !== String(q.t)) {
    return donePage("Link ungültig", "Dieser Link ist ungültig oder abgelaufen. Bitte wenden Sie sich an die Hausverwaltung.");
  }
  const what = `${row[c("Typ")]} · ${row[c("Aufgang")]}, Whg ${row[c("Wohnung")]} · Ticket ${q.id}`;

  if (row[c("Status")] === "erledigt") {
    return donePage("Bereits erledigt", `${what} ist bereits als erledigt gemeldet. Vielen Dank!`);
  }
  if (q.confirm !== "1") {
    const url = `${doneUrl(q.id, q.t)}&confirm=1`;
    return donePage("Auftrag erledigt?", `${what}`,
      `<a class="btn" href="${escHtml(url)}" target="_top">Ja, als erledigt melden</a>`);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    sheet.getRange(rowIndex + 1, c("Status") + 1).setValue("erledigt");
    sheet.getRange(rowIndex + 1, c("Erledigt am") + 1).setValue(new Date());
  } finally {
    lock.releaseLock();
  }
  notify(`Erledigt: ${row[c("Typ")]} (${q.id})`, [what, "Vom Hausmeister über den Link in der E-Mail als erledigt gemeldet."]);
  return donePage("Vielen Dank!", `${what} ist jetzt als erledigt eingetragen.`);
}

function donePage(title, text, action) {
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
    <style>
      body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8f8f8;color:#151515}
      .box{max-width:520px;margin:40px auto;padding:28px 22px;background:#fff;border-top:6px solid #6d7454;border-radius:8px}
      .brand{font-weight:600;color:#6d7454;margin:0 0 12px}
      h1{font-family:Georgia,serif;font-weight:400;color:#6d7454;margin:0 0 12px}
      p{font-size:18px;line-height:1.45}
      .btn{display:block;text-align:center;padding:16px;background:#6d7454;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:18px}
    </style></head><body><div class="box">
      <p class="brand">${escHtml(CONFIG.SENDER_NAME)}</p>
      <h1>${escHtml(title)}</h1><p>${escHtml(text)}</p>${action || ""}
    </div></body></html>`;
  return HtmlService.createHtmlOutput(html)
    .setTitle(title)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

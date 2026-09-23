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
        "Zählernummer", "Zählerstand (m³)", "Name", "Foto", "Geprüft", "Erfassungs-ID", "Ablesedatum"],
    },
    // Wird automatisch aus "Zählerstände" erzeugt – nicht von Hand bearbeiten.
    meterOverview: {
      name: "Übersicht Zähler",
      headers: ["Haus", "Aufgang", "Wohnung", "Ablesedatum", "Raum", "Art", "Zählernummer",
        "Zählerstand (m³)", "Foto", "Name", "Eingang", "Erfassungs-ID", "Geprüft"],
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
  SITE_NAME: "WEG Wartenberger Dorfkrug",
  SENDER_NAME: "Willbrandt und Kompagnon",
  // Aufträge an den Hausmeister (z. B. Klingelschild) gehen an diese Adresse.
  HAUSMEISTER_EMAIL: "info@gs-schreier.de",
  // Adresse dieser Web-App (für den Erledigt-Link in E-Mails). Leer = automatisch ermitteln.
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
    const p = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    // Honeypot: Nur Bots füllen das unsichtbare Feld aus. Still "Erfolg" melden.
    if (p.website) return json({ ok: true });

    switch (p.action) {
      case "submitTicket": return json(submitTicket(p));
      case "submitMeterReadings": return json(submitMeterReadings(p));
      case "submitMeterReading": return json(submitMeterReadings(Object.assign({}, p, { meters: [p] }))); // ältere App-Version
      case "logCleaning": return json(logCleaning(p));
      default: return json({ ok: false, error: "Unbekannte Aktion" });
    }
  } catch (err) {
    if (!err.userMessage) console.error(err);
    return json({ ok: false, error: err.userMessage || "Serverfehler" });
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
    return json({ ok: true, service: "mieter-app", time: new Date().toISOString() });
  } catch (err) {
    if (!err.userMessage) console.error(err);
    return json({ ok: false, error: err.userMessage || "Serverfehler" });
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

  if (type === "Klingelschild") sendBellOrder(id, doneCode, p);

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
    if (["Kalt", "Warm"].indexOf(art) === -1) throw userError(`${label}: ungültige Zählerart`);
    if (!m.photo) throw userError(`${label}: bitte ein Foto anhängen`);
    return { nr, stand: Number(stand), art, raum: str(m.raum, 30), photo: m.photo };
  });

  const batchId = newId("E");
  const now = new Date();
  const rows = checked.map((m) => {
    const id = newId("Z");
    const photoUrl = savePhoto(m.photo, `${id}_${wohnung}_${m.raum}_${m.art}`);
    return [
      id, now, str(p.house, 60), str(p.entrance, 60), str(p.object, 20),
      wohnung, m.raum, m.art, m.nr, m.stand, str(p.name, 80), photoUrl, false, batchId, ablesedatum,
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
    ...rows.map((r) => `${r[6]} ${r[7]}: Zähler ${r[8]} – Stand ${String(r[9]).replace(".", ",")} m³ – Foto: ${r[11]}`),
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
      stand: get(r, "Zählerstand (m³)"), foto: String(get(r, "Foto") || ""), name: get(r, "Name"),
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
    const data = rows.map((r) => [
      r.haus, r.aufgang, r.wohnung, r.ablese, r.raum, r.art, r.nr, r.stand,
      "", // Foto-Link wird unten als echter Link gesetzt
      r.name, r.eingang, r.erfassung, r.geprueft,
    ]);
    const range = out.getRange(2, 1, data.length, def.headers.length);
    range.setValues(data);

    // Foto als echter Link (Rich Text) – unabhängig von der Spracheinstellung der Tabelle,
    // anders als eine HYPERLINK-Formel (dort Komma vs. Semikolon).
    const fotoCol = def.headers.indexOf("Foto") + 1;
    out.getRange(2, fotoCol, data.length, 1).setRichTextValues(rows.map((r) => [
      r.foto
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
    out.getRange(2, 4, data.length, 1).setNumberFormat("dd.MM.yyyy");
    out.getRange(2, 11, data.length, 1).setNumberFormat("dd.MM.yyyy HH:mm");
    out.getRange(2, 8, data.length, 1).setNumberFormat("0.000");
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
   Hilfsfunktionen
   ========================================================================== */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function userError(message) {
  const err = new Error(message);
  err.userMessage = message;
  return err;
}

/**
 * Text bereinigen: kürzen, trimmen und gegen Formel-Injection schützen
 * (Eingaben wie "=HYPERLINK(...)" würden sonst in der Tabelle ausgeführt).
 */
function str(value, max) {
  let s = value == null ? "" : String(value).trim().slice(0, max || CONFIG.MAX_TEXT);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function newId(prefix) {
  const day = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyMMdd");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
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

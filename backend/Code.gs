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
 *   HAUSMEISTER_TOKENS  optional (Epic 3), JSON: {"geheimer-token": "hm_becker"}
 *   PHOTO_FOLDER_ID     wird von setup() automatisch gesetzt
 */

const CONFIG = {
  SHEETS: {
    tickets: {
      name: "Tickets",
      headers: ["ID", "Eingang", "Typ", "Status", "Haus", "Aufgang", "Aufgang-ID", "Wohnung", "Name",
        "Termin", "Details", "Ort", "Telefon/Kontakt", "Foto", "Erledigt am", "Notiz Verwaltung"],
    },
    meter: {
      name: "Zählerstände",
      headers: ["ID", "Eingang", "Haus", "Aufgang", "Aufgang-ID", "Wohnung", "Raum", "Art",
        "Zählernummer", "Zählerstand (m³)", "Name", "Foto", "Geprüft"],
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
};

/* ==========================================================================
   Einmalige Einrichtung
   ========================================================================== */

/** Legt Tabellenblätter, Kopfzeilen, Status-Auswahl und den Foto-Ordner an. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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

  Logger.log("Einrichtung abgeschlossen. Foto-Ordner: %s", props.getProperty("PHOTO_FOLDER_ID"));
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
      case "submitMeterReading": return json(submitMeterReading(p));
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
  const photoUrl = p.photo ? savePhoto(p.photo, `${id}_${type}`) : "";

  appendRow(CONFIG.SHEETS.tickets.name, [
    id, new Date(), type, CONFIG.STATUS_OPEN,
    str(p.house, 60), str(p.entrance, 60), str(p.object, 20),
    str(p.wohnung, 60), str(p.name, 80), termin, details,
    str(p.ort, 60), str(p.telefon || p.kontakt, 120), photoUrl, "", "",
  ]);

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

/** US 2.1 – Wasserzähler */
function submitMeterReading(p) {
  const wohnung = str(p.wohnung, 60);
  const zaehlernummer = str(p.zaehlernummer, 60);
  const standRaw = str(p.zaehlerstand, 20).replace(",", ".");
  const art = str(p.art, 10);

  if (!wohnung || !zaehlernummer) throw userError("Wohnung und Zählernummer sind Pflichtfelder");
  if (!/^\d+(\.\d{1,3})?$/.test(standRaw)) throw userError("Ungültiger Zählerstand");
  if (["Kalt", "Warm"].indexOf(art) === -1) throw userError("Ungültige Zählerart");
  if (!p.photo) throw userError("Bitte ein Belegfoto anhängen");

  const id = newId("Z");
  const photoUrl = savePhoto(p.photo, `${id}_${wohnung}_${art}`);

  appendRow(CONFIG.SHEETS.meter.name, [
    id, new Date(), str(p.house, 60), str(p.entrance, 60), str(p.object, 20),
    wohnung, str(p.raum, 30), art, zaehlernummer, Number(standRaw), str(p.name, 80), photoUrl, false,
  ]);

  return { ok: true, id };
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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEETS.tickets.name);
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

/** Schreibt eine Zeile; die Sperre verhindert Konflikte bei gleichzeitigen Anfragen. */
function appendRow(sheetName, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName).appendRow(row);
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
  const to = PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL");
  if (!to) return;
  try {
    MailApp.sendEmail({
      to,
      subject: `[Mieter-App] ${subject}`,
      body: lines.filter(Boolean).join("\n") + "\n\n" + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
    });
  } catch (err) {
    console.error("E-Mail fehlgeschlagen:", err);
  }
}

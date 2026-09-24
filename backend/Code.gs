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
 *   CALENDAR_ID         optional, Kalender für den Reinigungsplan (sonst Suche nach CONFIG.CALENDAR_NAME)
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
        "Erledigt-Code", "Zuständig", "In Arbeit seit", "Bearbeitet von"],
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
    // Epic 3 – Hausmeister-Portal
    cleaning: {
      name: "Reinigung",
      headers: ["Zeitpunkt (Scan)", "Ort-Code", "Mitarbeiter-Nr", "Eingang Server", "Ort", "Tätigkeit",
        "Notiz", "Foto", "Aufgang-ID", "Erfassung"],
    },
    staff: {
      name: "Mitarbeiter",
      // Pseudonym: nur Nummern, keine Namen. Wer hinter einer Nummer steht, dokumentiert die Firma selbst.
      headers: ["Nr", "Rolle", "Aktiv", "Token", "Persönlicher Link"],
    },
    areas: {
      name: "QR-Orte",
      headers: ["Code", "Ort", "Bereich", "Aufgang-ID", "Standard-Tätigkeit", "Für Bewohner anzeigen", "Aktiv"],
    },
    activities: {
      name: "Tätigkeiten",
      headers: ["Tätigkeit", "Aktiv"],
    },
    staffDefects: {
      name: "Mängel Hausmeister",
      headers: ["ID", "Eingang", "Erfasst von (Nr)", "Rolle", "Ort", "Aufgang-ID", "Beschreibung", "Dringend", "Foto",
        "Status", "Erledigt am", "Notiz Verwaltung", "Zuständig", "In Arbeit seit", "Bearbeitet von"],
    },
    // Für Looker Studio / Auswertungen – werden nachts und per Menü neu aufgebaut (nicht von Hand bearbeiten)
    analytics: {
      name: "Auswertung Aufträge",
      headers: ["ID", "Quelle", "Art", "Aufgang", "Zuständig", "Status", "Dringend", "Eingang", "In Arbeit seit",
        "Erledigt am", "Reaktion fällig", "Erledigung fällig", "Reaktionszeit (Std.)", "Durchlaufzeit (Tage)",
        "SLA Reaktion", "SLA Erledigung", "Ampel", "Monat", "Offen", "Erledigt", "Überfällig", "SLA eingehalten"],
    },
    analyticsCleaning: {
      name: "Auswertung Reinigung",
      headers: ["Datum", "Tätigkeit", "Ort", "Soll", "Ist", "Erfüllt", "Monat"],
    },
    // Fehlerüberwachung: Serverfehler und von der App gemeldete Fehler (90 Tage)
    errors: {
      name: "Fehlerprotokoll",
      headers: ["Zeit", "Quelle", "Meldung", "Details", "Ansicht", "Browser"],
    },
    plan: {
      name: "Reinigungsplan",
      headers: ["Datum", "Bis", "Tätigkeit", "Ort", "Bemerkung", "Kalender-ID"],
    },
  },
  TICKET_TYPES: ["Elektroraum", "Klingelschild", "Mangel"],
  STATUS_OPEN: "offen",
  STATUS_VALUES: ["offen", "in Arbeit", "erledigt"],
  // Wer erledigt welchen Auftrag? Der Hausmeister sieht im Portal nur „Hausmeister“-Aufträge,
  // die Verwaltung sieht alle. Pro Auftrag in der Spalte „Zuständig“ änderbar.
  OWNERS: ["Hausmeister", "Verwaltung"],
  // Rollen im Blatt „Mitarbeiter“: Leitung = Chef des Hausmeisterdienstes (Team-Cockpit, nur Hausmeister-Aufträge)
  ROLES: ["Hausmeister", "Leitung", "Verwaltung"],
  // Aufgang-IDs → lesbarer Name (für Auswertungen, z. B. Mängel vom Hausmeister)
  ENTRANCE_NAMES: {
    dorf24: "Dorfstr. 24", lind2: "Lindenberger Str. 2", lind4: "Lindenberger Str. 4",
    lind6: "Lindenberger Str. 6", lind8: "Lindenberger Str. 8",
  },
  DEFAULT_OWNER: { Elektroraum: "Verwaltung", Klingelschild: "Hausmeister", Mangel: "Verwaltung", "Mangel (intern)": "Verwaltung" },
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
  // Adresse der App (für die persönlichen Links der Mitarbeiter und die QR-Codes).
  APP_URL: "https://app.willbrandt-kompagnon.de/",
  // Google-Kalender für den Reinigungsplan (Script-Eigenschaft CALENDAR_ID hat Vorrang).
  CALENDAR_NAME: "WEG Wartenberger Dorfkrug",
  // Mitarbeiternummern: feste Nummern plus STAFF_LINKS Nummern ab STAFF_FIRST_NR.
  STAFF_FIXED: [["007", "Verwaltung"], ["008", "Verwaltung"], ["001", "Leitung"]], // 007/008 Verwaltung, 001 Leitung Hausmeisterdienst
  // Service-Ziele (SLA): Reaktion = Status „in Arbeit“ (oder erledigt), Erledigung = Status „erledigt“.
  // days = Kalendertage, workdays = Mo–Fr. Elektroraum: bestätigt 1 Werktag vor dem Termin, erledigt am Termin.
  SLA: {
    urgent: { react: { days: 1 }, done: { days: 3 } },
    Mangel: { react: { workdays: 3 }, done: { days: 14 } },
    "Mangel (intern)": { react: { workdays: 3 }, done: { days: 14 } },
    Klingelschild: { react: { workdays: 3 }, done: { workdays: 10 } },
    Elektroraum: { react: { workdaysBeforeAppointment: 1 }, done: { appointment: true } },
  },
  SLA_WARN_HOURS: 24,
  // Wetter für die Startseite: Daten des Deutschen Wetterdienstes über Bright Sky (kostenlos, ohne Schlüssel).
  // Abruf nur durch dieses Script (1× pro Stunde, zwischengespeichert) – die Handys verbinden sich nicht mit Wetterdiensten.
  WEATHER: { lat: 52.574, lon: 13.514, days: 3, cacheMinutes: 60 },
  // Abfahrten: Das Script fragt die freien transport.rest-Dienste zentral ab (höchstens alle 90 s) und
  // merkt sich die letzte gute Antwort (3 Std.). Fällt der Dienst aus, zeigt die App die geplanten
  // Abfahrten daraus weiter an. Nur diese Haltestelle – kein offener Proxy.
  TRANSIT: {
    apis: ["https://v6.bvg.transport.rest", "https://v6.vbb.transport.rest", "https://v6.db.transport.rest"],
    query: "Dorfstr./Lindenberger Str. (Berlin)", match: "dorfstr./lindenberger",
    freshSeconds: 90, keepHours: 3, duration: 180, results: 60,
  },
  STAFF_FIRST_NR: 100,
  STAFF_LINKS: 20,
  // Löschkonzept: Aufbewahrung in Jahren (offene Vorgänge werden nie gelöscht). Täglich um 3 Uhr.
  RETENTION: {
    ticketsDoneYears: 2,      // erledigte Bewohner-Meldungen inkl. Fotos (ab „Erledigt am“)
    staffDefectsDoneYears: 2, // erledigte Mängel vom Hausmeister inkl. Fotos
    meterYears: 3,            // Zählerstände inkl. Fotos (ab Ablesedatum)
    cleaningYears: 2,         // Tätigkeitsnachweise inkl. Fotos
    planYears: 2,             // vergangene Einträge im Reinigungsplan
    errorLogDays: 90,         // Fehlerprotokoll
  },
  // Aufträge an den Hausmeister (z. B. Klingelschild) gehen an diese Adresse.
  HAUSMEISTER_EMAIL: "info@gs-schreier.de",
  // Adresse dieser Web-App (für den Erledigt-Link in E-Mails). Leer = automatisch ermitteln.
  // Zugangs-PIN (steht auf den Aushängen). Script-Eigenschaft APP_PIN hat Vorrang.
  APP_PIN: "13059",
  // Schutz vor Missbrauch der offenen Adresse (gilt für alle Nutzer zusammen):
  LIMITS: {
    // Hoch angesetzt: Die PIN hängt ohnehin im Hausflur. Ein niedriger Wert ließe einen Störer mit
    // wenigen Fehlversuchen ALLE Bewohner aussperren; so wird nur massenhaftes Durchprobieren gebremst.
    pinFailsPer15Min: 300,
    staffActionsPerHour: 150, // je persönlichem Zugang (Schutz, falls ein Link in falsche Hände gerät)
    mailReserve: 20,          // so viele Mails pro Tag bleiben für Hausmeister-Aufträge reserviert
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
  [CONFIG.SHEETS.tickets, CONFIG.SHEETS.staffDefects].forEach((def) => {
    const sh = ss.getSheetByName(def.name);
    sh.getRange(2, def.headers.indexOf("Zuständig") + 1, sh.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.OWNERS, true).build());
  });
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
  setupPortalSheets();
  rebuildMeterOverview();
  Logger.log("Einrichtung abgeschlossen. Foto-Ordner: %s", props.getProperty("PHOTO_FOLDER_ID"));
}

/** Menü „Mieter-App“ in der Tabelle. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Mieter-App")
    .addItem("Zähler-Übersicht aktualisieren", "rebuildMeterOverview")
    .addSeparator()
    .addItem("Reinigungsplan → Kalender übertragen", "syncPlanToCalendar")
    .addItem("Reinigungsplan heute prüfen (Test)", "checkPlanFulfilment")
    .addItem("Mitarbeiter-Links ergänzen", "ensureStaffLinks")
    .addSeparator()
    .addItem("Auswertung aktualisieren", "rebuildAnalyticsNow")
    .addItem("Systemprüfung jetzt", "healthCheckNow")
    .addItem("Alte Daten jetzt löschen (Löschkonzept)", "cleanupNow")
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

    // Hausmeister-Portal hat eigenen Zugang (persönlicher Token), alles andere braucht die App-PIN.
    if (p && typeof p.action === "string" && Object.prototype.hasOwnProperty.call(STAFF_ACTIONS, p.action)) {
      const user = authStaff(p.token);
      rateLimit(`staff_${user.nr}`, CONFIG.LIMITS.staffActionsPerHour, 3600);
      return json(STAFF_ACTIONS[p.action](p, user));
    }
    requirePin(p.pin, p.token);

    // Honeypot: Nur Bots füllen das unsichtbare Feld aus. Still "Erfolg" melden.
    if (p.website) return json({ ok: true });

    switch (p.action) {
      case "submitTicket": rateLimit("submit", CONFIG.LIMITS.submitsPerHour, 3600); return json(submitTicket(p));
      case "submitMeterReadings": rateLimit("submit", CONFIG.LIMITS.submitsPerHour, 3600); return json(submitMeterReadings(p));
      case "submitMeterReading": // ältere App-Version
        rateLimit("submit", CONFIG.LIMITS.submitsPerHour, 3600);
        return json(submitMeterReadings(Object.assign({}, p, { meters: [p] })));
      case "reportError": return json(reportClientError(p));
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
    if (q.action === "getTasks") {
      const user = authStaff(q.token);
      rateLimit(`staff_${user.nr}`, CONFIG.LIMITS.staffActionsPerHour, 3600); // wie bei POST
      return json(getTasks({}, user));
    }
    if (q.action === "done") return completeTicketPage(q);
    if (q.action === "status") { requirePin(q.pin, q.token); return json(getStatus(q.ids)); }
    if (q.action === "news") { requirePin(q.pin, q.token); return json(getNews(q.obj)); }
    if (q.action === "departures") { requirePin(q.pin, q.token); return json(getDepartures()); }
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
    str(p.house, 60), str(p.entrance, 60), objectId(p.object),
    str(p.wohnung, 60), str(p.name, 80), termin, details,
    str(p.ort, 60), str(p.telefon || p.kontakt, 120), photoUrl, "", "", doneCode, defaultOwner(type),
  ]);

  // Klingelschild: Auftrag per Mail an den Hausmeister; das Ergebnis steht in der Info-Mail an die Verwaltung.
  let bell = null;
  if (type === "Klingelschild") {
    if (withinLimit("hausmeisterMail", CONFIG.LIMITS.hausmeisterMailsPer6h, 21600)) bell = sendBellOrder(id, doneCode, p);
    else bell = { sent: false, reason: "Limit für Hausmeister-Mails erreicht – Auftrag bitte selbst weitergeben" };
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
    ...(bell ? ["", bell.sent
      ? `✔ Auftrag per E-Mail an den Hausmeister gesendet (${bell.to}). Gesendeter Text:`
      : `✘ KEINE Mail an den Hausmeister: ${bell.reason}`,
    bell.sent ? "------------------------------\n" + bell.body + "\n------------------------------" : ""] : []),
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
      id, now, str(p.house, 60), str(p.entrance, 60), objectId(p.object),
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
  let care = null;
  try { care = residentCareInfo(object); } catch (err) { console.error("Reinigungsinfo:", err); }
  let weather = null;
  try { weather = getWeather(); } catch (err) {
    console.error("Wetter:", err);
    CacheService.getScriptCache().put("weather", "null", 600); // Dienst gestört: 10 Min. nicht erneut versuchen
  }
  return { ok: true, items: items.slice(0, 10), care, weather };
}

/**
 * Wetter der nächsten Tage + amtliche DWD-Warnungen für den Standort.
 * Ergebnis: { days: [{ date, icon, min, max, rain }], alerts: [{ event, headline, severity, onset, expires, instruction }] }
 */
function getWeather() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get("weather");
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* neu laden */ } }
  const w = CONFIG.WEATHER;
  const ymd = (d) => Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd");
  const first = new Date();
  const last = new Date(first.getTime() + w.days * 86400000);
  const base = "https://api.brightsky.dev";
  const q = `lat=${w.lat}&lon=${w.lon}`;
  const [wr, ar] = UrlFetchApp.fetchAll([
    { url: `${base}/weather?${q}&date=${ymd(first)}&last_date=${ymd(last)}&tz=${encodeURIComponent(CONFIG.TIMEZONE)}`, muteHttpExceptions: true },
    { url: `${base}/alerts?${q}&tz=${encodeURIComponent(CONFIG.TIMEZONE)}`, muteHttpExceptions: true },
  ]);
  if (wr.getResponseCode() !== 200) throw new Error(`Wetterdienst antwortet mit ${wr.getResponseCode()}`);
  const hours = (JSON.parse(wr.getContentText()).weather || []).filter((h) => h && h.timestamp);
  // Tagessymbol: Niederschlag/Gewitter zählt, wenn er tagsüber mind. 2 Stunden vorkommt, sonst das häufigste Symbol.
  const WET = ["thunderstorm", "hail", "snow", "sleet", "rain"];
  const byDay = {};
  hours.forEach((h) => { const d = String(h.timestamp).slice(0, 10); (byDay[d] = byDay[d] || []).push(h); });
  const days = Object.keys(byDay).sort().slice(0, w.days).map((date) => {
    const list = byDay[date];
    const temps = list.map((h) => h.temperature).filter((t) => typeof t === "number");
    const daytime = list.filter((h) => { const hr = Number(String(h.timestamp).slice(11, 13)); return hr >= 7 && hr <= 20; });
    const count = {};
    (daytime.length ? daytime : list).forEach((h) => { if (h.icon) count[h.icon] = (count[h.icon] || 0) + 1; });
    let icon = WET.find((i) => (count[i] || 0) >= 2);
    if (!icon) icon = Object.keys(count).sort((a, b) => count[b] - count[a])[0] || "";
    const rain = list.reduce((a, h) => a + (typeof h.precipitation === "number" ? h.precipitation : 0), 0);
    return {
      date, icon: String(icon).replace(/-night$/, "-day"),
      min: temps.length ? Math.round(Math.min.apply(null, temps)) : null,
      max: temps.length ? Math.round(Math.max.apply(null, temps)) : null,
      rain: Math.round(rain * 10) / 10,
    };
  });
  let alerts = [];
  if (ar.getResponseCode() === 200) {
    alerts = (JSON.parse(ar.getContentText()).alerts || [])
      .filter((a) => a && a.status !== "test" && ["moderate", "severe", "extreme"].indexOf(a.severity) !== -1)
      .slice(0, 5)
      .map((a) => ({
        event: plain(a.event_de, 80), headline: plain(a.headline_de, 160), headlineEn: plain(a.headline_en, 160),
        severity: a.severity, onset: String(a.onset || ""), expires: String(a.expires || ""),
        instruction: plain(a.instruction_de, 600),
      }));
  }
  const out = { days, alerts, at: new Date().toISOString() };
  cache.put("weather", JSON.stringify(out), w.cacheMinutes * 60);
  return out;
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
  if (!err.userMessage) { console.error(err); logServerError(err, "Server"); }
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
function requirePin(pin, staffToken) {
  const expected = appPin();
  if (!expected) return;
  // Hausmeister/Verwaltung mit persönlichem Link brauchen keine PIN.
  if (staffToken) { try { authStaff(staffToken); return; } catch (e) { /* weiter mit PIN-Prüfung */ } }
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

/** Optionale E-Mail an die Verwaltung. Fehler hier dürfen den Antrag nicht scheitern lassen. */
function notify(subject, lines) {
  const to = (PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || "").trim();
  if (!to) return;
  // Tageskontingent (100 Mails) für Hausmeister-Aufträge freihalten, falls jemand massenhaft Meldungen schickt.
  try {
    if (MailApp.getRemainingDailyQuota() < CONFIG.LIMITS.mailReserve) {
      console.warn("Mail-Kontingent knapp – Info-Mail ausgelassen:", subject);
      return;
    }
  } catch (e) { /* Kontingent unbekannt – trotzdem senden */ }
  try {
    MailApp.sendEmail({
      to,
      subject: oneLine(`[Mieter-App] ${subject}`),
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

/** Betreffzeilen: keine Zeilenumbrüche/Steuerzeichen aus Eingaben, max. 200 Zeichen. */
function oneLine(v) {
  return String(v).replace(/[\r\n\t\u0000-\u001f]+/g, " ").slice(0, 200);
}

/** Reiner Text ohne Tabellen-Schutzzeichen, für E-Mails. */
function plain(value, max) {
  return value == null ? "" : String(value).trim().slice(0, max || CONFIG.MAX_TEXT);
}

/** "04" → "Whg 04", "Whg 04" bleibt unverändert. */
function whg(value) {
  const v = String(value || "").replace(/^'/, "").trim();
  // Nur reine Nummern bekommen „Whg“ davor („04“, „4a“) – Gewerbe wie „Laden EG“ bleibt, wie es ist.
  return /^\d/.test(v) ? `Whg ${v}` : v;
}

function escHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function doneUrl(id, code) {
  const base = CONFIG.WEBAPP_URL || ScriptApp.getService().getUrl();
  return `${base}?action=done&id=${encodeURIComponent(id)}&t=${encodeURIComponent(code)}`;
}

/** E-Mail an den Hausmeister: Klingelschild aktualisieren. Fehler blockieren den Antrag nicht. */
/** Gibt { sent, to, body } bzw. { sent: false, reason } zurück. */
function sendBellOrder(id, code, p) {
  const to = (PropertiesService.getScriptProperties().getProperty("HAUSMEISTER_EMAIL") || CONFIG.HAUSMEISTER_EMAIL || "").trim();
  if (!to) return { sent: false, reason: "keine Hausmeister-Adresse eingetragen" };
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
      subject: oneLine(`Klingelschild aktualisieren – ${plain(p.entrance, 60)}, ${whg(plain(p.wohnung, 60))} (${id})`),
      body,
      htmlBody,
      name: CONFIG.SENDER_NAME,
      replyTo: replyTo.split(",")[0].trim() || undefined,
    });
    return { sent: true, to, body };
  } catch (err) {
    console.error("Hausmeister-Mail fehlgeschlagen:", err);
    return { sent: false, reason: `Versand fehlgeschlagen (${err.message || err})` };
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
  const what = `${row[c("Typ")]} · ${row[c("Aufgang")]}, ${whg(row[c("Wohnung")])} · Ticket ${q.id}`;

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
    if (c("Bearbeitet von") !== -1) sheet.getRange(rowIndex + 1, c("Bearbeitet von") + 1).setValue("Mail-Link");
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

/* ==========================================================================
   Epic 3 – Hausmeister-Portal
   Zugang über persönliche Links (Blatt „Mitarbeiter“), QR-Orte, Tätigkeitsnachweise,
   Auftragsliste, Mängel, Reinigungsplan mit Google-Kalender und täglicher Kontrolle.
   ========================================================================== */

const STAFF_ACTIONS = {
  adminOverview: (p, user) => adminOverview(p, user),
  adminUpdateTask: (p, user) => adminUpdateTask(p, user),
  hmLogin: (p, user) => staffLogin(user),
  logCleaning: (p, user) => logCleaning(p, user),
  getTasks: (p, user) => getTasks(p, user),
  completeTask: (p, user) => completeTask(p, user),
  submitStaffDefect: (p, user) => submitStaffDefect(p, user),
};

const DEFAULT_ACTIVITIES = [
  "Treppenhausreinigung", "Fensterreinigung Aufgang", "Reinigung", "Kontrollgang", "Winterdienst",
  "Gartenpflege", "Reinigung Regenabflüsse", "Müllplatzreinigung", "Schnitt Bepflanzung", "Reparatur / Wartung",
];

// [Code, Ort, Bereich, Aufgang-ID, Standard-Tätigkeit, Für Bewohner anzeigen]
const DEFAULT_AREAS = [
  ["TH_DORF24", "Treppenhaus Dorfstr. 24", "Aufgang", "dorf24", "Treppenhausreinigung", true],
  ["TH_LIND2", "Treppenhaus Lindenberger Str. 2", "Aufgang", "lind2", "Treppenhausreinigung", true],
  ["TH_LIND4", "Treppenhaus Lindenberger Str. 4", "Aufgang", "lind4", "Treppenhausreinigung", true],
  ["TH_LIND6", "Treppenhaus Lindenberger Str. 6", "Aufgang", "lind6", "Treppenhausreinigung", true],
  ["TH_LIND8", "Treppenhaus Lindenberger Str. 8", "Aufgang", "lind8", "Treppenhausreinigung", true],
  ["KE_DORF24", "Kellerbereich Dorfstr. 24", "Keller", "dorf24", "Reinigung", true],
  ["KE_LIND2", "Kellerbereich Lindenberger Str. 2", "Keller", "lind2", "Reinigung", true],
  ["KE_LIND4", "Kellerbereich Lindenberger Str. 4", "Keller", "lind4", "Reinigung", true],
  ["KE_LIND6", "Kellerbereich Lindenberger Str. 6", "Keller", "lind6", "Reinigung", true],
  ["WK_LIND4", "Waschküche Lindenberger Str. 4", "Waschküche", "lind4", "Reinigung", true],
  ["WK_LIND6", "Waschküche Lindenberger Str. 6", "Waschküche", "lind6", "Reinigung", true],
  ["MUELL", "Müllplatz (außen)", "Außen", "", "Müllplatzreinigung", true],
  ["HOF", "Innenhof", "Außen", "", "Gartenpflege", true],
  ["TG", "Tiefgarage", "Tiefgarage", "", "Reinigung", true],
  ["REGEN", "Regenabflüsse Gehwege", "Außen", "", "Reinigung Regenabflüsse", false],
  ["ER_LIND2", "Elektroraum Lindenberger Str. 2", "Technik", "lind2", "Kontrollgang", false],
  ["ER_LIND6", "Elektroraum Lindenberger Str. 6", "Technik", "lind6", "Kontrollgang", false],
  ["HZ_LIND2", "Heizungsraum Lindenberger Str. 2", "Technik", "lind2", "Kontrollgang", false],
  ["FH_LIND2", "Raum Fettabscheider und Hebeanlage Lindenberger Str. 2", "Technik", "lind2", "Kontrollgang", false],
  ["GW_LIND2", "Gaszähler und Hauptwasser-Raum Lindenberger Str. 2", "Technik", "lind2", "Kontrollgang", false],
  ["HA_LIND8", "Raum Hebeanlage Lindenberger Str. 8", "Technik", "lind8", "Kontrollgang", false],
];

const PLAN_TAG = "[Mieter-App Reinigungsplan]";

/** Legt die Portal-Blätter an und füllt sie beim ersten Mal mit Startwerten. */
function setupPortalSheets() {
  const ss = getSpreadsheet();
  const checkbox = SpreadsheetApp.newDataValidation().requireCheckbox().build();

  const areas = ss.getSheetByName(CONFIG.SHEETS.areas.name);
  if (areas.getLastRow() < 2) {
    areas.getRange(2, 1, DEFAULT_AREAS.length, 7).setValues(DEFAULT_AREAS.map((a) => a.concat([true])));
  }
  areas.getRange(2, 6, 300, 2).setDataValidation(checkbox);

  const acts = ss.getSheetByName(CONFIG.SHEETS.activities.name);
  if (acts.getLastRow() < 2) {
    acts.getRange(2, 1, DEFAULT_ACTIVITIES.length, 2).setValues(DEFAULT_ACTIVITIES.map((a) => [a, true]));
  }
  acts.getRange(2, 2, 200, 1).setDataValidation(checkbox);

  const defects = ss.getSheetByName(CONFIG.SHEETS.staffDefects.name);
  const stCol = CONFIG.SHEETS.staffDefects.headers.indexOf("Status") + 1;
  defects.getRange(2, stCol, defects.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STATUS_VALUES, true).build());

  const plan = ss.getSheetByName(CONFIG.SHEETS.plan.name);
  plan.getRange(2, 1, plan.getMaxRows() - 1, 2).setNumberFormat("dd.MM.yyyy");
  plan.getRange(2, 3, 300, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(acts.getRange("A2:A200"), true).setAllowInvalid(true).build());

  ensureStaffLinks();
  ensureDailyCheckTrigger();
  ensureMaintenanceTrigger();
  ensureMorningTrigger();
  CacheService.getScriptCache().removeAll(["areas", "staff"]);
}

/**
 * Füllt das Blatt „Mitarbeiter“ auf: feste Nummern (007 Verwaltung, 001 Leitung) und
 * CONFIG.STAFF_LINKS Nummern ab 100, jeweils mit persönlichem Link. Keine Namen (Pseudonym).
 */
function ensureStaffLinks() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.staff.name);
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat("@"); // „007“ bleibt „007“
  const rows = Math.max(sheet.getLastRow() - 1, 0);
  const have = rows ? sheet.getRange(2, 1, rows, 4).getValues().filter((r) => r[3]).map((r) => String(r[0])) : [];
  const add = CONFIG.STAFF_FIXED.filter(([nr]) => have.indexOf(nr) === -1).map(([nr, role]) => [nr, role]);
  const numbered = have.map(Number).filter((n) => n >= CONFIG.STAFF_FIRST_NR);
  let next = numbered.length ? Math.max.apply(null, numbered) + 1 : CONFIG.STAFF_FIRST_NR;
  // Vorrats-Nummern ab 100 sind gesperrt, bis sie vergeben werden (Haken bei „Aktiv“ setzen).
  // So öffnet ein versehentlich weitergegebener, noch unbenutzter Link nichts.
  for (let i = numbered.length; i < CONFIG.STAFF_LINKS; i++) add.push([String(next++), "Hausmeister", false]);
  sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.ROLES, true).build());
  // Einmalig: 001 (bisher „Hausmeister“) wird „Leitung“ – danach bleibt die Auswahl in der Tabelle maßgeblich.
  const props = PropertiesService.getScriptProperties();
  if (rows && !props.getProperty("ROLE_001_LEITUNG")) {
    const vals = sheet.getRange(2, 1, rows, 2).getValues();
    vals.forEach((r, i) => { if (String(r[0]) === "001" && r[1] === "Hausmeister") sheet.getRange(i + 2, 2).setValue("Leitung"); });
    props.setProperty("ROLE_001_LEITUNG", "1");
    CacheService.getScriptCache().remove("staff");
  }
  if (!add.length) return;
  // Hinter die letzte Zeile mit Nummer schreiben – nicht getLastRow(): leere Kästchen in „Aktiv“ zählen dort als belegt.
  const colA = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();
  let lastUsed = colA.length;
  while (lastUsed > 1 && String(colA[lastUsed - 1][0]).trim() === "") lastUsed--;
  sheet.getRange(lastUsed + 1, 1, add.length, 5).setValues(add.map(([nr, role, active]) => {
    const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
    return [nr, role, active !== false, token, `${CONFIG.APP_URL}?hm=${token}#hausmeister`];
  }));
  sheet.getRange(2, 3, sheet.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  CacheService.getScriptCache().remove("staff");
}

/** Liest ein Blatt als Liste von Objekten (Schlüssel = Spaltenüberschrift). */
function sheetObjects(def) {
  const sheet = getSpreadsheet().getSheetByName(def.name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const h = values.shift();
  return values.map((r, i) => {
    const o = { _row: i + 2 };
    h.forEach((name, j) => { o[name] = r[j]; });
    return o;
  });
}

/** Prüft den persönlichen Zugang. Ergebnis: { nr, name: "Nr. 100", role } – keine Klarnamen. */
function authStaff(token) {
  const t = String(token || "").trim();
  if (!/^[a-f0-9]{24,64}$/i.test(t)) throw userError("Kein gültiger Zugang", "staff");
  const cache = CacheService.getScriptCache();
  let map = null;
  try { map = JSON.parse(cache.get("staff") || "null"); } catch (e) { map = null; }
  if (!map) {
    map = {};
    sheetObjects(CONFIG.SHEETS.staff).forEach((r) => {
      if (r.Token && r.Aktiv === true) {
        const nr = String(r.Nr).trim();
        map[String(r.Token)] = { nr, name: `Nr. ${nr}`, role: String(r.Rolle || "Hausmeister") };
      }
    });
    cache.put("staff", JSON.stringify(map), 300);
  }
  const user = map[t];
  if (!user) throw userError("Dieser Zugang ist nicht (mehr) freigeschaltet. Bitte an die Hausverwaltung wenden.", "staff");
  return user;
}

function activeAreas() {
  // 5 Minuten zwischenspeichern: jeder Scan fragt die Orte ab, das Blatt ändert sich selten.
  const cache = CacheService.getScriptCache();
  try { const hit = JSON.parse(cache.get("areas") || "null"); if (hit) return hit; } catch (e) { /* neu laden */ }
  const list = readActiveAreas();
  try { cache.put("areas", JSON.stringify(list), 300); } catch (e) { /* zu groß – egal */ }
  return list;
}

function readActiveAreas() {
  return sheetObjects(CONFIG.SHEETS.areas).filter((a) => a.Code && a.Aktiv !== false).map((a) => ({
    code: String(a.Code).trim(), ort: String(a.Ort || a.Code), bereich: String(a.Bereich || ""),
    aufgang: String(a["Aufgang-ID"] || "").trim(), activity: String(a["Standard-Tätigkeit"] || ""),
    residents: a["Für Bewohner anzeigen"] === true,
  }));
}

function activeActivities() {
  const list = sheetObjects(CONFIG.SHEETS.activities).filter((a) => a["Tätigkeit"] && a.Aktiv !== false)
    .map((a) => String(a["Tätigkeit"]).trim());
  return list.length ? list : DEFAULT_ACTIVITIES;
}

/** US 3.1 – Anmeldung: Name, Rolle, Orte und Tätigkeiten für die App. */
function staffLogin(user) {
  return {
    ok: true, user: { name: user.name, role: user.role },
    areas: activeAreas().map(({ residents, ...a }) => a), activities: activeActivities(),
  };
}

/** US 3.2 – Nachweis per QR-Scan (oder manuell gewählter Ort, als solcher gekennzeichnet). */
function logCleaning(p, user) {
  const code = String(p.areaToken || "").trim().toUpperCase();
  const area = activeAreas().find((a) => a.code.toUpperCase() === code);
  if (!area) throw userError("Unbekannter QR-Code. Bitte an die Hausverwaltung wenden.");
  const wanted = String(p.activity || "").trim() || area.activity || "Reinigung";
  const activity = activeActivities().find((a) => a.toLowerCase() === wanted.toLowerCase());
  if (!activity) throw userError("Unbekannte Tätigkeit. Bitte aus der Liste wählen.");

  // Zeitpunkt vom Gerät (auch nachträglich gesendete Offline-Scans), aber nicht in der Zukunft
  // und höchstens 7 Tage zurück.
  const now = new Date();
  let when = new Date(p.timestamp);
  if (isNaN(when) || when > new Date(now.getTime() + 5 * 60000) || when < new Date(now.getTime() - 7 * 86400000)) when = now;

  const photoUrl = p.photo ? savePhoto(p.photo, `Nachweis_${area.code}_${Utilities.formatDate(when, CONFIG.TIMEZONE, "yyyyMMdd_HHmm")}`) : "";
  appendRow(CONFIG.SHEETS.cleaning.name, [
    when, area.code, str(String(user.nr), 10), now, str(area.ort, 120), activity,
    str(p.note, 500), photoUrl, area.aufgang,
    (p.manual ? "manuell gewählt" : "QR-Scan")
      + (Math.abs(now - when) > 30 * 60000 ? ` (nachgesendet ${Utilities.formatDate(now, CONFIG.TIMEZONE, "dd.MM. HH:mm")})` : ""),
  ]);
  return { ok: true, ort: area.ort, activity, time: when.toISOString() };
}

/** US 3.3 – offene Aufträge: Anträge der Bewohner und Mängel des Hausmeisters. */
/** Zuständigkeit laut CONFIG.DEFAULT_OWNER (unbekannte Typen: Verwaltung). */
function defaultOwner(type) {
  return CONFIG.DEFAULT_OWNER[type] || "Verwaltung";
}

/** Zuständig laut Spalte, sonst Standard je Typ (ältere Zeilen ohne Eintrag). */
function ownerOf(r, type) {
  const v = String(r["Zuständig"] || "").trim();
  return CONFIG.OWNERS.indexOf(v) !== -1 ? v : defaultOwner(type);
}

function mayHandle(user, owner) {
  return user.role === "Verwaltung" || owner === "Hausmeister";
}

function getTasks(p, user) {
  const iso = (d) => (d instanceof Date ? Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd") : String(d || ""));
  const open = (r) => r.Status && r.Status !== "erledigt";
  const tickets = sheetObjects(CONFIG.SHEETS.tickets).filter(open).map((r) => ({
    id: r.ID, source: "Bewohner", type: r.Typ, status: r.Status, entrance: r.Aufgang, wohnung: r.Wohnung,
    name: r.Name, contact: r["Telefon/Kontakt"], date: iso(r.Termin), details: r.Details, ort: r.Ort,
    created: iso(r.Eingang), owner: ownerOf(r, r.Typ),
  }));
  const defects = sheetObjects(CONFIG.SHEETS.staffDefects).filter(open).map((r) => ({
    id: r.ID, source: r["Erfasst von (Nr)"], type: "Mangel (intern)", status: r.Status, entrance: "", wohnung: "",
    name: "", contact: "", date: "", details: r.Beschreibung, ort: r.Ort, urgent: r.Dringend === true,
    created: iso(r.Eingang), owner: ownerOf(r, "Mangel (intern)"),
  }));
  const tasks = tickets.concat(defects).filter((t) => mayHandle(user, t.owner)).sort((a, b) =>
    (b.urgent === true) - (a.urgent === true) || (a.date || "9999").localeCompare(b.date || "9999")
    || String(a.created).localeCompare(String(b.created)));
  return { ok: true, tasks };
}

/** Auftrag im Portal als erledigt melden. */
function completeTask(p, user) {
  const id = String(p.id || "").trim();
  if (!id) throw userError("Auftrag nicht gefunden");
  const def = /^M-/.test(id) ? CONFIG.SHEETS.staffDefects : CONFIG.SHEETS.tickets;
  const sheet = getSpreadsheet().getSheetByName(def.name);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let row;
  try {
    row = sheetObjects(def).find((r) => r.ID === id);
    if (!row || !mayHandle(user, ownerOf(row, row.Typ || "Mangel (intern)"))) throw userError("Auftrag nicht gefunden");
    if (row.Status !== "erledigt") {
      sheet.getRange(row._row, def.headers.indexOf("Status") + 1).setValue("erledigt");
      applyStatusTimestamps(sheet, def, row._row, "erledigt", row);
      sheet.getRange(row._row, def.headers.indexOf("Bearbeitet von") + 1).setValue(str(user.name, 40));
    }
  } finally {
    lock.releaseLock();
  }
  notify(`Erledigt: ${row.Typ || "Mangel (intern)"} (${id})`, [
    `${row.Typ || "Mangel"} · ${row.Aufgang || row.Ort || ""}${row.Wohnung ? ", " + whg(row.Wohnung) : ""}`,
    `Im Hausmeister-Portal als erledigt gemeldet von ${user.name}.`,
  ]);
  return { ok: true };
}

/** Mangel, vom Hausmeister oder der Verwaltung erfasst – eigenes Blatt. */
function submitStaffDefect(p, user) {
  const text = str(p.beschreibung, 2000);
  if (!text) throw userError("Bitte den Mangel beschreiben");
  const id = newId("M");
  const photoUrl = p.photo ? savePhoto(p.photo, `${id}_Mangel`) : "";
  const ort = str(p.ort, 120);
  const area = activeAreas().find((a) => a.ort === p.ort);
  appendRow(CONFIG.SHEETS.staffDefects.name, [
    id, new Date(), str(user.name, 80), user.role, ort, area ? area.aufgang : "", text, p.dringend === true,
    photoUrl, CONFIG.STATUS_OPEN, "", "", defaultOwner("Mangel (intern)"),
  ]);
  notify(`${p.dringend === true ? "DRINGEND – " : ""}Mangel vom ${user.role}: ${plain(ort, 60)} (${id})`, [
    `Erfasst von: ${user.name}`, `Ort: ${plain(ort, 120)}`, `Beschreibung: ${plain(text)}`,
    photoUrl ? `Foto: ${photoUrl}` : "",
  ]);
  return { ok: true, id };
}

/* ---------- Reinigungsplan ---------- */

/** Datum aus Zelle (Datum oder Text „dd.mm.yyyy“ / „yyyy-mm-dd“) → Date ohne Uhrzeit oder null. */
function cellDate(v) {
  if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === "number" && v > 30000 && v < 80000) { // Excel-Seriennummer (Tage seit 30.12.1899)
    const d = new Date(1899, 11, 30);
    d.setDate(d.getDate() + Math.floor(v));
    return d;
  }
  const s = String(v || "").trim();
  let m = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/.exec(s); // auch „Mi., 07.10.2026“
  if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/** Heutiges Datum (Berliner Zeit) ohne Uhrzeit. */
function berlinToday() {
  return parseIsoDate(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd"));
}

function planRows() {
  return sheetObjects(CONFIG.SHEETS.plan).map((r) => {
    const from = cellDate(r.Datum);
    const to = cellDate(r.Bis);
    return {
      row: r._row, from, to: to && from && to >= from ? to : from, activity: String(r["Tätigkeit"] || "").trim(),
      ort: String(r.Ort || "").trim(), note: String(r.Bemerkung || "").trim(), eventId: String(r["Kalender-ID"] || ""),
    };
  }).filter((r) => r.from && r.activity);
}

/** Welche QR-Orte sind mit dem Ort-Text im Plan gemeint? (mehrere kommagetrennt, „alle Aufgänge“ …) */
function planAreas(ortText, areas) {
  const parts = String(ortText || "").split(/[,;\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!parts.length || parts.some((x) => x === "alle" || x === "gesamte anlage")) return null; // = überall
  const out = [];
  parts.forEach((part) => {
    if (/^alle aufgänge|^alle treppenhäuser/.test(part)) out.push(...areas.filter((a) => a.bereich === "Aufgang"));
    else if (/^alle keller/.test(part)) out.push(...areas.filter((a) => a.bereich === "Keller"));
    else out.push(...areas.filter((a) => a.ort.toLowerCase() === part || a.code.toLowerCase() === part
      || a.ort.toLowerCase().indexOf(part) !== -1));
  });
  return out;
}

function findCalendar() {
  const id = (PropertiesService.getScriptProperties().getProperty("CALENDAR_ID") || "").trim();
  const cal = id ? CalendarApp.getCalendarById(id) : (CalendarApp.getCalendarsByName(CONFIG.CALENDAR_NAME) || [])[0];
  if (!cal) {
    const names = CalendarApp.getAllCalendars().map((c) => `„${c.getName()}“`).join(", ");
    throw userError(id
      ? `Kalender mit der ID ${id} (Script-Eigenschaft CALENDAR_ID) nicht gefunden oder kein Schreibzugriff.`
      : `Kalender „${CONFIG.CALENDAR_NAME}“ nicht gefunden. Dieses Google-Konto sieht nur: ${names || "(keine)"}. `
        + "Den Kalender in diesem Konto anlegen bzw. mit „Änderungen vornehmen“ freigeben, oder die Kalender-ID als "
        + "Script-Eigenschaft CALENDAR_ID eintragen.");
  }
  return cal;
}

/** Menü: Ergebnis bzw. Fehler als Hinweisfenster in der Tabelle anzeigen. */
function showResult(title, text) {
  Logger.log(`${title}: ${text}`);
  try { SpreadsheetApp.getUi().alert(title, text, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* ohne Tabelle */ }
}

/** Überträgt das Blatt „Reinigungsplan“ in den Google-Kalender (neu, geändert, gelöscht). */
function syncPlanToCalendar() {
  try {
    return showPlanSyncResult(syncPlanToCalendarCore());
  } catch (err) {
    showResult("Reinigungsplan – Fehler", err.userMessage || String(err.message || err));
    return String(err.message || err);
  }
}

function showPlanSyncResult(msg) {
  showResult("Reinigungsplan → Kalender", msg);
  return msg;
}

function syncPlanToCalendarCore() {
  const cal = findCalendar();
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.plan.name);
  const idCol = CONFIG.SHEETS.plan.headers.indexOf("Kalender-ID") + 1;
  const rows = planRows();
  const keep = {};
  let created = 0, updated = 0, removed = 0;

  rows.forEach((r) => {
    const title = r.ort ? `${r.activity} – ${r.ort}` : r.activity;
    const endExcl = new Date(r.to.getFullYear(), r.to.getMonth(), r.to.getDate() + 1);
    const desc = `${r.note ? r.note + "\n\n" : ""}${PLAN_TAG}`;
    let ev = r.eventId ? cal.getEventById(r.eventId) : null;
    if (ev) {
      ev.setTitle(title); ev.setAllDayDates(r.from, endExcl); ev.setDescription(desc);
      updated++;
    } else {
      ev = cal.createAllDayEvent(title, r.from, endExcl, { description: desc });
      sheet.getRange(r.row, idCol).setValue(ev.getId());
      created++;
    }
    keep[ev.getId()] = true;
  });

  // Einträge, die aus dem Plan gelöscht wurden, auch im Kalender entfernen.
  const now = new Date();
  const start = new Date(now.getFullYear() - 1, 0, 1);
  const end = new Date(now.getFullYear() + 2, 0, 1);
  cal.getEvents(start, end).forEach((ev) => {
    if (String(ev.getDescription()).indexOf(PLAN_TAG) !== -1 && !keep[ev.getId()]) { ev.deleteEvent(); removed++; }
  });
  // Zeilen mit Inhalt, die nicht übertragen werden konnten (Datum oder Tätigkeit fehlt/unlesbar).
  const valid = {};
  rows.forEach((r) => { valid[r.row] = true; });
  const skipped = sheetObjects(CONFIG.SHEETS.plan)
    .filter((r) => !valid[r._row] && [r.Datum, r["Tätigkeit"], r.Ort].some((v) => String(v || "").trim()))
    .map((r) => r._row);
  let msg = `Kalender „${cal.getName()}“: ${created} neu, ${updated} aktualisiert, ${removed} entfernt.`;
  if (!rows.length) msg += " Im Blatt „Reinigungsplan“ wurden keine gültigen Zeilen gefunden.";
  if (skipped.length) {
    msg += ` Nicht übertragen (Datum oder Tätigkeit fehlt bzw. Datum nicht lesbar – bitte TT.MM.JJJJ): Zeile ${skipped.slice(0, 20).join(", ")}${skipped.length > 20 ? " …" : ""}.`;
  }
  return msg;
}

/** Tägliche Kontrolle (Trigger 19 Uhr): Geplante Tätigkeiten von heute ohne Nachweis → E-Mail. */
/**
 * Soll/Ist der eintägigen Plan-Einträge eines Tages: [{ activity, ort, done }].
 * Zeiträume (z. B. Winterdienst) werden nicht geprüft.
 */
function planStatusForDay(day, areas, allScans, plan) {
  const key = (d) => Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd");
  const k = key(day);
  // Tagesschlüssel je Nachweis nur einmal berechnen (Auswertung ruft dies für 365 Tage auf)
  allScans.forEach((s) => { if (s._day === undefined) s._day = s["Zeitpunkt (Scan)"] instanceof Date ? key(s["Zeitpunkt (Scan)"]) : ""; });
  const scans = allScans.filter((s) => s._day === k);
  const done = (activity, area) => scans.some((s) => String(s["Tätigkeit"]).toLowerCase() === activity.toLowerCase()
    && (!area || String(s["Ort-Code"]).toUpperCase() === area.code.toUpperCase()));
  const out = [];
  plan.filter((r) => key(r.from) === k && key(r.to) === k).forEach((r) => {
    const targets = planAreas(r.ort, areas);
    if (targets === null || !targets.length) {
      out.push({ activity: r.activity, ort: r.ort || "ohne Ort", done: done(r.activity, null) });
      return;
    }
    targets.forEach((a) => out.push({ activity: r.activity, ort: a.ort, done: done(r.activity, a) }));
  });
  return out;
}

function checkPlanFulfilment() {
  const today = berlinToday();
  const missing = planStatusForDay(today, activeAreas(), sheetObjects(CONFIG.SHEETS.cleaning), planRows())
    .filter((x) => !x.done).map((x) => `${x.activity} – ${x.ort}`);
  if (missing.length) {
    notify(`Fehlende Nachweise heute (${missing.length})`, [
      `Für heute (${Utilities.formatDate(today, CONFIG.TIMEZONE, "dd.MM.yyyy")}) geplant, aber bis jetzt ohne Scan:`, "",
      ...missing.map((m) => `• ${m}`),
    ]);
  }
  Logger.log(missing.length ? "Fehlend: " + missing.join("; ") : "Alle geplanten Tätigkeiten von heute sind nachgewiesen.");
  return missing;
}

function ensureDailyCheckTrigger() {
  const exists = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "checkPlanFulfilment");
  if (!exists) ScriptApp.newTrigger("checkPlanFulfilment").timeBased().everyDays(1).atHour(19).inTimezone(CONFIG.TIMEZONE).create();
}

/** Für die Bewohner-App: zuletzt erledigt (60 Tage) und demnächst geplant (14 Tage) für einen Aufgang. */
function residentCareInfo(object) {
  const areas = activeAreas().filter((a) => a.residents && (!a.aufgang || a.aufgang === object));
  if (!areas.length) return { last: [], next: [] };
  const byCode = {};
  areas.forEach((a) => { byCode[a.code.toUpperCase()] = a; });
  const since = new Date(Date.now() - 60 * 86400000);
  const latest = {};
  sheetObjects(CONFIG.SHEETS.cleaning).forEach((s) => {
    const a = byCode[String(s["Ort-Code"] || "").toUpperCase()];
    const t = s["Zeitpunkt (Scan)"];
    if (!a || !(t instanceof Date) || t < since) return;
    const k = `${a.code}|${s["Tätigkeit"]}`;
    if (!latest[k] || latest[k].time < t) latest[k] = { ort: a.ort, bereich: a.bereich, activity: String(s["Tätigkeit"]), time: t };
  });
  const last = Object.keys(latest).map((k) => latest[k])
    .sort((x, y) => (x.bereich === "Aufgang" ? 0 : 1) - (y.bereich === "Aufgang" ? 0 : 1) || y.time - x.time)
    .slice(0, 6).map((x) => ({ ort: x.ort, activity: x.activity, time: x.time.toISOString() }));

  const allAreas = activeAreas();
  const today = berlinToday();
  const until = new Date(today.getTime() + 14 * 86400000);
  const ymd = (d) => Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd");
  const next = planRows().filter((r) => r.to >= today && r.from <= until).filter((r) => {
    const t = planAreas(r.ort, allAreas);
    return t === null || t.some((a) => byCode[a.code.toUpperCase()]);
  }).sort((a, b) => a.from - b.from).slice(0, 5)
    .map((r) => ({ activity: r.activity, ort: r.ort, from: ymd(r.from), to: ymd(r.to) }));
  return { last, next };
}

/**
 * Fehlersuche Kalender: im Editor „kalenderTest“ auswählen → Ausführen → Ausführungsprotokoll ansehen.
 * Prüft Konto, Kalender-ID, Schreibrecht (Test-Termin wird angelegt und sofort gelöscht) und das Blatt „Reinigungsplan“.
 */
/** Im Editor ausführen, wenn kein Wetter erscheint: zeigt Abruf-Ergebnis oder Fehler im Protokoll. */
function wetterTest() {
  CacheService.getScriptCache().remove("weather");
  try {
    const w = getWeather();
    Logger.log("OK – %s Tage, %s Warnung(en): %s", w.days.length, w.alerts.length, JSON.stringify(w.days));
  } catch (err) {
    Logger.log("FEHLER beim Wetterabruf: %s", err && err.message);
  }
}

function kalenderTest() {
  const log = (label, value) => Logger.log(`${label}: ${value}`);
  try { log("1. Google-Konto des Scripts", Session.getEffectiveUser().getEmail() || "(nicht ermittelbar)"); } catch (e) { log("1. Google-Konto", "Fehler " + e.message); }
  const id = (PropertiesService.getScriptProperties().getProperty("CALENDAR_ID") || "").trim();
  log("2. Script-Eigenschaft CALENDAR_ID", id || "(nicht gesetzt)");
  try {
    log("3. Kalender, die dieses Konto sieht", CalendarApp.getAllCalendars().map((c) => `${c.getName()} [${c.getId()}]`).join(" | ") || "(keine)");
  } catch (e) { log("3. Kalenderliste", "Fehler " + e.message); }
  let cal = null;
  try {
    cal = id ? CalendarApp.getCalendarById(id) : (CalendarApp.getCalendarsByName(CONFIG.CALENDAR_NAME) || [])[0];
    log("4. Gefundener Kalender", cal ? `${cal.getName()} [${cal.getId()}]` : "KEINER – ID/Name passt nicht oder keine Freigabe");
  } catch (e) { log("4. Kalender suchen", "Fehler " + e.message); }
  if (cal) {
    try {
      const ev = cal.createAllDayEvent("Test Mieter-App (wird gelöscht)", new Date());
      log("5. Schreibtest", "OK – Termin angelegt");
      ev.deleteEvent();
      log("5b. Löschen", "OK");
    } catch (e) { log("5. Schreibtest", "FEHLER " + e.message + " → Kalender nur lesbar freigegeben?"); }
  }
  try {
    const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.plan.name);
    log("6. Blatt „Reinigungsplan“", sheet ? `${Math.max(sheet.getLastRow() - 1, 0)} Zeilen, Kopfzeile: ${sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0].join(" | ")}` : "FEHLT – setup ausführen");
    const rows = planRows();
    log("7. Gültige Termine", rows.length);
    rows.slice(0, 5).forEach((r, i) => log(`   Termin ${i + 1}`, `${Utilities.formatDate(r.from, CONFIG.TIMEZONE, "dd.MM.yyyy")} ${r.activity} ${r.ort}`));
    if (sheet && sheet.getLastRow() > 1) {
      const raw = sheet.getRange(2, 1, Math.min(3, sheet.getLastRow() - 1), 4).getValues();
      raw.forEach((r, i) => log(`   Rohdaten Zeile ${i + 2}`, r.map((v) => `${v instanceof Date ? "Datum " + v.toISOString() : typeof v + " " + v}`).join(" | ")));
    }
  } catch (e) { log("6. Blatt lesen", "Fehler " + e.message); }
}

/* ==========================================================================
   Löschkonzept und Wartung (täglich 3 Uhr): alte Daten löschen, Systemprüfung
   ========================================================================== */

function ensureMaintenanceTrigger() {
  const exists = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "dailyMaintenance");
  if (!exists) ScriptApp.newTrigger("dailyMaintenance").timeBased().everyDays(1).atHour(3).inTimezone(CONFIG.TIMEZONE).create();
}

function dailyMaintenance() {
  let removed = null;
  try { removed = cleanupOldData(); } catch (err) { logServerError(err, "Löschkonzept"); }
  try { rebuildAnalytics(); } catch (err) { logServerError(err, "Auswertung"); }
  healthCheck({ removed });
}

/** Drive-Datei zu einem Foto-Link in den Papierkorb legen (Google löscht ihn nach 30 Tagen endgültig). */
function trashPhoto(url) {
  const m = /\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/.exec(String(url || ""));
  if (!m) return false;
  try { DriveApp.getFileById(m[1] || m[2]).setTrashed(true); return true; } catch (e) { return false; }
}

/**
 * Löscht Zeilen, für die keep(row) false ergibt, samt Foto (Spalte „Foto“). Von unten nach oben,
 * damit sich die Zeilennummern beim Löschen nicht verschieben. Gibt die Anzahl zurück.
 */
function deleteRowsWhere(def, isOld) {
  const sheet = getSpreadsheet().getSheetByName(def.name);
  if (!sheet) return 0;
  const rows = sheetObjects(def).filter(isOld);
  if (!rows.length) return 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    rows.sort((a, b) => b._row - a._row).forEach((r) => {
      if (r.Foto) trashPhoto(r.Foto);
      sheet.deleteRow(r._row);
    });
  } finally {
    lock.releaseLock();
  }
  return rows.length;
}

/** Alte Daten nach CONFIG.RETENTION löschen. Offene Vorgänge bleiben immer erhalten. */
function cleanupOldData() {
  const R = CONFIG.RETENTION;
  const now = new Date();
  const before = (years) => new Date(now.getFullYear() - years, now.getMonth(), now.getDate());
  const date = (v) => (v instanceof Date && !isNaN(v) ? v : cellDate(v));
  // Nur mit gültigem Datum löschen – fehlt es oder ist es unlesbar, bleibt die Zeile stehen.
  const older = (d, limit) => !!d && d < limit;
  const doneBefore = (limit) => (r) => r.Status === "erledigt" && older(date(r["Erledigt am"]) || date(r.Eingang), limit);
  const result = {
    tickets: deleteRowsWhere(CONFIG.SHEETS.tickets, doneBefore(before(R.ticketsDoneYears))),
    staffDefects: deleteRowsWhere(CONFIG.SHEETS.staffDefects, doneBefore(before(R.staffDefectsDoneYears))),
    meter: deleteRowsWhere(CONFIG.SHEETS.meter, (r) => older(date(r.Ablesedatum) || date(r.Eingang), before(R.meterYears))),
    cleaning: deleteRowsWhere(CONFIG.SHEETS.cleaning, (r) => older(date(r["Zeitpunkt (Scan)"]), before(R.cleaningYears))),
    plan: deleteRowsWhere(CONFIG.SHEETS.plan, (r) => older(date(r.Bis) || date(r.Datum), before(R.planYears))),
    errors: deleteRowsWhere(CONFIG.SHEETS.errors, (r) => older(date(r.Zeit), new Date(now.getTime() - R.errorLogDays * 86400000))),
  };
  if (result.meter) { try { rebuildMeterOverview(); } catch (e) { console.error(e); } }
  const total = Object.keys(result).reduce((n, k) => n + result[k], 0);
  if (total) Logger.log("Löschkonzept: " + JSON.stringify(result));
  return result;
}

function cleanupNow() {
  const r = cleanupOldData();
  showResult("Löschkonzept", `Gelöscht: ${r.tickets} Meldungen, ${r.staffDefects} interne Mängel, ${r.meter} Zählerstände, `
    + `${r.cleaning} Nachweise, ${r.plan} Plan-Einträge, ${r.errors} Fehlereinträge (jeweils samt Fotos).`);
}

/* ---------- Fehlerüberwachung ---------- */

function errorRow(source, message, details, view, browser) {
  return [new Date(), source, str(message, 300), str(details, 500), str(view, 40), str(browser, 200)];
}

/** Unerwarteten Serverfehler protokollieren und (höchstens alle 3 Std.) sofort per Mail melden. */
function logServerError(err, context) {
  try {
    const msg = String((err && err.message) || err);
    appendRow(CONFIG.SHEETS.errors.name, errorRow(`Server: ${context || ""}`, msg, String((err && err.stack) || "").slice(0, 500), "", ""));
    if (withinLimit("errorMail", 1, 10800)) {
      notify("Fehler im Backend", [`${context || "Server"}: ${msg}`, "", "Details im Blatt „Fehlerprotokoll“. Weitere Fehler der nächsten 3 Stunden nur dort."]);
    }
  } catch (e) { console.error("Fehlerprotokoll nicht möglich:", e); }
}

/** Von der App gemeldeter Fehler (nur mit PIN/Zugang, begrenzt, gleiche Meldung nur 1× pro Stunde). */
function reportClientError(p) {
  const msg = String(p.message || "").slice(0, 300);
  if (!msg || !withinLimit("clientError", 30, 3600)) return { ok: true };
  const cache = CacheService.getScriptCache();
  const key = "ce_" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, msg)).slice(0, 20);
  if (cache.get(key)) return { ok: true };
  cache.put(key, "1", 3600);
  appendRow(CONFIG.SHEETS.errors.name, errorRow("App", msg, `${p.source || ""} · Version ${p.version || "?"}`, p.view, p.browser));
  return { ok: true };
}

/**
 * Tägliche Systemprüfung. Mail an NOTIFY_EMAIL nur bei Problemen oder neuen Fehlern.
 * Gibt die Liste der Hinweise zurück.
 */
function healthCheck(extra) {
  const issues = [];
  const info = [];
  const props = PropertiesService.getScriptProperties();
  if (!(props.getProperty("NOTIFY_EMAIL") || "").trim()) issues.push("Script-Eigenschaft NOTIFY_EMAIL fehlt – es kommen keine Benachrichtigungen an.");
  try {
    const q = MailApp.getRemainingDailyQuota();
    if (q < CONFIG.LIMITS.mailReserve) issues.push(`Mail-Kontingent fast aufgebraucht (noch ${q} heute).`);
  } catch (e) { issues.push("Mail-Kontingent nicht abrufbar: " + e.message); }
  try { DriveApp.getFolderById(props.getProperty("PHOTO_FOLDER_ID")); } catch (e) { issues.push("Foto-Ordner nicht erreichbar – setup ausführen."); }
  const ss = getSpreadsheet();
  Object.keys(CONFIG.SHEETS).forEach((k) => {
    if (!ss.getSheetByName(CONFIG.SHEETS[k].name)) issues.push(`Blatt „${CONFIG.SHEETS[k].name}“ fehlt – setup ausführen.`);
  });
  const handlers = ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
  ["checkPlanFulfilment", "dailyMaintenance", "morningDigest"].forEach((h) => { if (handlers.indexOf(h) === -1) issues.push(`Automatik „${h}“ fehlt – setup ausführen.`); });
  if (planRows().length) { try { findCalendar(); } catch (e) { issues.push(e.userMessage || e.message); } }
  if (!activeAreas().length) issues.push("Keine aktiven QR-Orte.");

  const since = new Date(Date.now() - 86400000);
  const errs = sheetObjects(CONFIG.SHEETS.errors).filter((r) => r.Zeit instanceof Date && r.Zeit > since);
  if (errs.length) {
    issues.push(`${errs.length} Fehler in den letzten 24 Stunden (Blatt „Fehlerprotokoll“):`);
    errs.slice(-5).forEach((r) => issues.push(`   • ${r.Quelle}: ${String(r.Meldung).slice(0, 120)}`));
  }
  const old = new Date(Date.now() - 14 * 86400000);
  const stale = sheetObjects(CONFIG.SHEETS.tickets).filter((r) => r.Status && r.Status !== "erledigt" && r.Eingang instanceof Date && r.Eingang < old);
  if (stale.length) info.push(`${stale.length} Meldung(en) seit über 14 Tagen offen.`);
  const removed = extra && extra.removed;
  if (removed) {
    const n = Object.keys(removed).reduce((a, k) => a + removed[k], 0);
    if (n) info.push(`Löschkonzept: ${n} alte Einträge gelöscht (${JSON.stringify(removed)}).`);
  }
  if (issues.length) {
    notify(`Systemprüfung: ${issues.filter((i) => !/^\s+•/.test(i)).length} Hinweis(e)`, [...issues, info.length ? "" : null, ...info]);
  }
  Logger.log([...issues, ...info].join("\n") || "Systemprüfung: alles in Ordnung.");
  return { issues, info };
}

function healthCheckNow() {
  const r = healthCheck();
  showResult("Systemprüfung", [...r.issues, ...r.info].join("\n") || "Alles in Ordnung.");
}

/* ==========================================================================
   Cockpit für die Verwaltung (007/008): SLA-Ampel, Aufträge steuern, Kennzahlen,
   Auswertungsblätter für Looker Studio, Morgen-Mail bei Überfälligen
   ========================================================================== */

function requireAdmin(user) {
  if (!user || (user.role !== "Verwaltung" && user.role !== "Leitung")) throw userError("Nur für Verwaltung und Leitung.", "staff");
}

/** Aufgang-ID aus der App: nur Kleinbuchstaben/Ziffern (z. B. „lind6“), sonst leer. */
function objectId(value) {
  const v = String(value || "").trim();
  return /^[a-z0-9]{1,20}$/i.test(v) ? v : "";
}

function entranceName(id) {
  const k = String(id || "").trim();
  // hasOwnProperty: Kennungen wie „constructor“ oder „__proto__“ (aus Anfragen) dürfen nichts nachschlagen
  return Object.prototype.hasOwnProperty.call(CONFIG.ENTRANCE_NAMES, k) ? CONFIG.ENTRANCE_NAMES[k] : k;
}

/** Datum + n Werktage (Mo–Fr), Uhrzeit bleibt. Start am Wochenende zählt ab Montag. */
function addWorkdays(date, n) {
  const d = new Date(date.getTime());
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

function subtractWorkdays(date, n) {
  const d = new Date(date.getTime());
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

function endOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0); }

/** Einheitliche Sicht auf Bewohner-Tickets und interne Mängel. */
function allTasks() {
  const date = (v) => (v instanceof Date && !isNaN(v) ? v : cellDate(v));
  const tickets = sheetObjects(CONFIG.SHEETS.tickets).filter((r) => r.ID).map((r) => ({
    id: String(r.ID), kind: "ticket", source: "Bewohner", type: String(r.Typ || ""), status: String(r.Status || "offen"),
    owner: ownerOf(r, r.Typ), created: date(r.Eingang), inWork: date(r["In Arbeit seit"]), done: date(r["Erledigt am"]),
    termin: date(r.Termin), urgent: false, object: String(r["Aufgang-ID"] || ""),
    entrance: String(r.Aufgang || "") || entranceName(r["Aufgang-ID"]),
    wohnung: String(r.Wohnung || ""), name: String(r.Name || ""), contact: String(r["Telefon/Kontakt"] || ""),
    details: String(r.Details || ""), ort: String(r.Ort || ""), note: String(r["Notiz Verwaltung"] || ""),
    by: String(r["Bearbeitet von"] || ""), _row: r._row,
  }));
  const defects = sheetObjects(CONFIG.SHEETS.staffDefects).filter((r) => r.ID).map((r) => ({
    id: String(r.ID), kind: "defect", source: String(r["Erfasst von (Nr)"] || ""), type: "Mangel (intern)",
    status: String(r.Status || "offen"), owner: ownerOf(r, "Mangel (intern)"), created: date(r.Eingang),
    inWork: date(r["In Arbeit seit"]), done: date(r["Erledigt am"]), termin: null, urgent: r.Dringend === true,
    entrance: entranceName(r["Aufgang-ID"]), object: String(r["Aufgang-ID"] || ""), wohnung: "", name: "", contact: "",
    details: String(r.Beschreibung || ""), ort: String(r.Ort || ""), note: String(r["Notiz Verwaltung"] || ""),
    by: String(r["Bearbeitet von"] || ""), _row: r._row,
  }));
  return tickets.concat(defects);
}

/** Fälligkeiten und Ampel eines Auftrags nach CONFIG.SLA. */
function slaInfo(t, now) {
  const rule = t.urgent ? CONFIG.SLA.urgent : (CONFIG.SLA[t.type] || CONFIG.SLA.Mangel);
  const start = t.created || now;
  const due = (spec) => {
    if (spec.appointment || spec.workdaysBeforeAppointment) {
      if (!t.termin) return addWorkdays(start, 3);
      return endOfDay(spec.appointment ? t.termin : subtractWorkdays(t.termin, spec.workdaysBeforeAppointment));
    }
    if (spec.workdays) return addWorkdays(start, spec.workdays);
    return new Date(start.getTime() + spec.days * 86400000);
  };
  const reactDue = due(rule.react);
  const doneDue = due(rule.done);
  const closed = t.status === "erledigt";
  const reactAt = t.inWork || t.done || (closed ? now : null);
  const state = (at, limit) => (at ? (at <= limit ? "ok" : "late") : (now > limit ? "overdue" : "open"));
  const react = state(reactAt, reactDue);
  const done = state(closed ? (t.done || now) : null, doneDue);
  const warn = CONFIG.SLA_WARN_HOURS * 3600000;
  let light = "green";
  if (closed) light = "done";
  else if (react === "overdue" || done === "overdue") light = "red";
  else if ((react === "open" && reactDue - now < warn) || (done === "open" && doneDue - now < warn)) light = "yellow";
  const hours = reactAt && t.created ? Math.max(0, (reactAt - t.created) / 3600000) : null;
  const days = closed && t.done && t.created ? Math.max(0, (t.done - t.created) / 86400000) : null;
  return { reactDue, doneDue, react, done, light, reactHours: hours, leadDays: days };
}

function isoOrEmpty(d) { return d instanceof Date && !isNaN(d) ? d.toISOString() : ""; }

/** Daten für das Cockpit: Aufträge mit Ampel, Kennzahlen, Statistik. */
function adminOverview(p, user) {
  requireAdmin(user);
  const lead = user.role === "Leitung"; // Leitung Hausmeisterdienst: nur Hausmeister-Aufträge, keine Zähler/Fehler
  const now = new Date();
  const tasks = allTasks().filter((t) => !lead || t.owner === "Hausmeister").map((t) => Object.assign(t, { sla: slaInfo(t, now) }));
  const since = (days) => new Date(now.getTime() - days * 86400000);
  const recentClosed = tasks.filter((t) => t.status === "erledigt" && t.done && t.done > since(90));
  const open = tasks.filter((t) => t.status !== "erledigt");
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const slaOk = recentClosed.filter((t) => t.sla.react === "ok" && t.sla.done === "ok").length;

  // Statistik: 12 Monate
  const monthKey = (d) => Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM");
  const months = [];
  for (let i = 11; i >= 0; i--) months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 15)));
  const perMonth = {};
  months.forEach((m) => { perMonth[m] = { Mangel: 0, Klingelschild: 0, Elektroraum: 0, "Mangel (intern)": 0, Zähler: 0, Nachweise: 0 }; });
  tasks.forEach((t) => { const m = t.created && monthKey(t.created); if (perMonth[m] && perMonth[m][t.type] !== undefined) perMonth[m][t.type]++; });
  const meterBatches = {};
  (lead ? [] : sheetObjects(CONFIG.SHEETS.meter)).forEach((r) => {
    const d = r.Eingang instanceof Date ? r.Eingang : null;
    const id = r["Erfassungs-ID"] || r.ID;
    if (d && !meterBatches[id]) { meterBatches[id] = true; const m = monthKey(d); if (perMonth[m]) perMonth[m].Zähler++; }
  });
  const scans = sheetObjects(CONFIG.SHEETS.cleaning);
  scans.forEach((s) => { const d = s["Zeitpunkt (Scan)"]; if (d instanceof Date) { const m = monthKey(d); if (perMonth[m]) perMonth[m].Nachweise++; } });

  // Meldungen je Aufgang (12 Monate)
  const perEntrance = {};
  tasks.filter((t) => t.created && t.created > since(365)).forEach((t) => {
    const k = t.entrance || t.object || "ohne Aufgang";
    perEntrance[k] = (perEntrance[k] || 0) + 1;
  });

  // Reinigungsquote 30 Tage (Plan gegen Nachweis)
  const areas = activeAreas();
  const plan = planRows();
  let soll = 0, ist = 0;
  for (let i = 1; i <= 30; i++) {
    planStatusForDay(new Date(now.getTime() - i * 86400000), areas, scans, plan).forEach((x) => { soll++; if (x.done) ist++; });
  }
  const errors24 = lead ? null : sheetObjects(CONFIG.SHEETS.errors).filter((r) => r.Zeit instanceof Date && r.Zeit > since(1)).length;

  const list = tasks.filter((t) => t.status !== "erledigt" || (t.done && t.done > since(30))).map((t) => ({
    id: t.id, kind: t.kind, source: t.source, type: t.type, status: t.status, owner: t.owner, urgent: t.urgent,
    created: isoOrEmpty(t.created), inWork: isoOrEmpty(t.inWork), done: isoOrEmpty(t.done), termin: isoOrEmpty(t.termin),
    entrance: t.entrance, wohnung: t.wohnung, name: t.name, contact: t.contact, details: t.details, ort: t.ort,
    note: t.note, by: t.by,
    sla: { light: t.sla.light, react: t.sla.react, done: t.sla.done, reactDue: isoOrEmpty(t.sla.reactDue), doneDue: isoOrEmpty(t.sla.doneDue) },
  }));
  const rank = { red: 0, yellow: 1, green: 2, done: 3 };
  list.sort((a, b) => rank[a.sla.light] - rank[b.sla.light] || String(a.sla.doneDue).localeCompare(String(b.sla.doneDue)));

  return {
    ok: true,
    kpi: {
      open: open.length,
      overdue: open.filter((t) => t.sla.light === "red").length,
      dueSoon: open.filter((t) => t.sla.light === "yellow").length,
      avgReactHours: avg(recentClosed.map((t) => t.sla.reactHours).filter((x) => x !== null)),
      avgLeadDays: avg(recentClosed.map((t) => t.sla.leadDays).filter((x) => x !== null)),
      slaQuote: recentClosed.length ? slaOk / recentClosed.length : null,
      closed90: recentClosed.length,
      cleaningQuote: soll ? ist / soll : null, cleaningSoll: soll, cleaningIst: ist,
      errors24,
    },
    months: months.map((m) => Object.assign({ month: m }, perMonth[m])),
    perEntrance,
    tasks: list,
    lookerUrl: lead ? "" : PropertiesService.getScriptProperties().getProperty("LOOKER_URL") || "",
    role: user.role,
    team: teamOverview(scans, areas, plan, now),
    time: now.toISOString(),
  };
}

/**
 * Team-Übersicht aus den Tätigkeitsnachweisen (nur Mitarbeiternummern, keine Namen):
 * je Nummer Anzahl der Nachweise (30 Tage) und letzter Nachweis, die letzten Nachweise und
 * Plan-Einträge der letzten 7 Tage ohne Nachweis.
 */
function teamOverview(scans, areas, plan, now) {
  const since = new Date(now.getTime() - 30 * 86400000);
  const recent = scans.filter((s) => s["Zeitpunkt (Scan)"] instanceof Date && s["Zeitpunkt (Scan)"] > since)
    .sort((a, b) => b["Zeitpunkt (Scan)"] - a["Zeitpunkt (Scan)"]);
  const per = {};
  recent.forEach((s) => {
    const nr = String(s["Mitarbeiter-Nr"] || "?");
    const x = per[nr] || (per[nr] = { nr, count: 0, manual: 0, last: s["Zeitpunkt (Scan)"].toISOString() });
    x.count++;
    if (/^manuell/.test(String(s.Erfassung || ""))) x.manual++;
  });
  const missed = [];
  for (let i = 1; i <= 7; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    planStatusForDay(day, areas, scans, plan).filter((x) => !x.done)
      .forEach((x) => missed.push({ date: Utilities.formatDate(day, CONFIG.TIMEZONE, "yyyy-MM-dd"), activity: x.activity, ort: x.ort }));
  }
  return {
    members: Object.keys(per).map((k) => per[k]).sort((a, b) => b.count - a.count),
    recent: recent.slice(0, 25).map((s) => ({
      time: s["Zeitpunkt (Scan)"].toISOString(), nr: String(s["Mitarbeiter-Nr"] || ""), ort: plain(s.Ort, 80),
      activity: plain(s["Tätigkeit"], 60), manual: /^manuell/.test(String(s.Erfassung || "")), note: plain(s.Notiz, 200),
    })),
    missed: missed.slice(0, 40),
  };
}

/** Status/Zuständigkeit/Notiz eines Auftrags ändern (Verwaltung; Leitung nur Status). Setzt die Zeitstempel. */
function adminUpdateTask(p, user) {
  requireAdmin(user);
  const id = String(p.id || "").trim();
  if (!id) throw userError("Auftrag nicht gefunden");
  const def = /^M-/.test(id) ? CONFIG.SHEETS.staffDefects : CONFIG.SHEETS.tickets;
  const sheet = getSpreadsheet().getSheetByName(def.name);
  const col = (h) => def.headers.indexOf(h) + 1;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = sheetObjects(def).find((r) => r.ID === id);
    if (!row) throw userError("Auftrag nicht gefunden");
    if (user.role === "Leitung") {
      if (ownerOf(row, row.Typ || "Mangel (intern)") !== "Hausmeister") throw userError("Auftrag nicht gefunden");
      if (p.owner !== undefined || p.note !== undefined) throw userError("Zuständigkeit und Notiz ändert die Verwaltung.");
    }
    if (p.status !== undefined) {
      if (CONFIG.STATUS_VALUES.indexOf(p.status) === -1) throw userError("Ungültiger Status");
      sheet.getRange(row._row, col("Status")).setValue(p.status);
      applyStatusTimestamps(sheet, def, row._row, p.status, row);
    }
    if (p.owner !== undefined) {
      if (CONFIG.OWNERS.indexOf(p.owner) === -1) throw userError("Ungültige Zuständigkeit");
      sheet.getRange(row._row, col("Zuständig")).setValue(p.owner);
    }
    if (p.note !== undefined) sheet.getRange(row._row, col("Notiz Verwaltung")).setValue(protectCell(str(p.note, 1000)));
    sheet.getRange(row._row, col("Bearbeitet von")).setValue(str(user.name, 40));
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/** Zeitstempel passend zum Status: „in Arbeit“ → In Arbeit seit; „erledigt“ → Erledigt am; wieder offen → leeren. */
function applyStatusTimestamps(sheet, def, rowNo, status, row) {
  const col = (h) => def.headers.indexOf(h) + 1;
  const now = new Date();
  const has = (h) => row && row[h] instanceof Date;
  if ((status === "in Arbeit" || status === "erledigt") && !has("In Arbeit seit")) sheet.getRange(rowNo, col("In Arbeit seit")).setValue(now);
  if (status === "erledigt" && !has("Erledigt am")) sheet.getRange(rowNo, col("Erledigt am")).setValue(now);
  if (status !== "erledigt" && has("Erledigt am")) sheet.getRange(rowNo, col("Erledigt am")).setValue("");
}

/** Einfacher Trigger: Status direkt in der Tabelle geändert → Zeitstempel setzen. */
function onEdit(e) {
  try {
    const sheet = e && e.range && e.range.getSheet();
    if (!sheet) return;
    const def = [CONFIG.SHEETS.tickets, CONFIG.SHEETS.staffDefects].find((d) => d.name === sheet.getName());
    if (!def) return;
    const statusCol = def.headers.indexOf("Status") + 1;
    if (e.range.getColumn() > statusCol || e.range.getLastColumn() < statusCol) return;
    const rows = sheetObjects(def);
    for (let r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
      if (r < 2) continue;
      const row = rows.find((x) => x._row === r);
      if (!row || !row.Status) continue;
      applyStatusTimestamps(sheet, def, r, String(row.Status), row);
      sheet.getRange(r, def.headers.indexOf("Bearbeitet von") + 1).setValue("Tabelle");
    }
  } catch (err) { console.error("onEdit:", err); }
}

/** Blätter „Auswertung Aufträge“ und „Auswertung Reinigung“ für Looker Studio neu aufbauen. */
function rebuildAnalytics() {
  const now = new Date();
  const ss = getSpreadsheet();
  const monthKey = (d) => (d ? Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM") : "");
  const round = (x, n) => (x === null || x === undefined ? "" : Math.round(x * Math.pow(10, n)) / Math.pow(10, n));
  const label = { ok: "eingehalten", late: "verspätet", overdue: "überfällig", open: "offen" };
  const ampel = { red: "rot", yellow: "gelb", green: "grün", done: "erledigt" };
  const rows = allTasks().map((t) => {
    const s = slaInfo(t, now);
    return [t.id, t.source === "Bewohner" ? "Bewohner" : "Hausmeister", t.type, t.entrance || t.object, t.owner, t.status,
      t.urgent, t.created || "", t.inWork || "", t.done || "", s.reactDue, s.doneDue, round(s.reactHours, 1),
      round(s.leadDays, 1), label[s.react], label[s.done], ampel[s.light], monthKey(t.created),
      // Fertige Zähler für Looker Studio (keine Formeln nötig): Summe bzw. Durchschnitt (= Quote)
      t.status === "erledigt" ? 0 : 1, t.status === "erledigt" ? 1 : 0, s.light === "red" ? 1 : 0,
      t.status === "erledigt" ? (s.react === "ok" && s.done === "ok" ? 1 : 0) : ""].map(protectCell);
  });
  writeTable(ss, CONFIG.SHEETS.analytics, rows);

  const areas = activeAreas();
  const plan = planRows();
  const scans = sheetObjects(CONFIG.SHEETS.cleaning);
  const cleanRows = [];
  for (let i = 365; i >= 1; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    planStatusForDay(day, areas, scans, plan).forEach((x) => cleanRows.push([day, x.activity, x.ort, 1, x.done ? 1 : 0, x.done, monthKey(day)].map(protectCell)));
  }
  writeTable(ss, CONFIG.SHEETS.analyticsCleaning, cleanRows);
  return { tasks: rows.length, cleaning: cleanRows.length };
}

function writeTable(ss, def, rows) {
  const sheet = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
  sheet.clear();
  sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight("bold").setBackground("#eef0e6");
  sheet.setFrozenRows(1);
  if (rows.length) sheet.getRange(2, 1, rows.length, def.headers.length).setValues(rows);
}

function rebuildAnalyticsNow() {
  const r = rebuildAnalytics();
  showResult("Auswertung", `Aktualisiert: ${r.tasks} Aufträge, ${r.cleaning} Reinigungs-Soll-Einträge (365 Tage).`);
}

function ensureMorningTrigger() {
  const exists = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "morningDigest");
  if (!exists) ScriptApp.newTrigger("morningDigest").timeBased().everyDays(1).atHour(7).inTimezone(CONFIG.TIMEZONE).create();
}

/** Morgens 7 Uhr: Mail nur, wenn Aufträge überfällig oder heute fällig sind. */
function morningDigest() {
  const now = new Date();
  const fmt = (d) => Utilities.formatDate(d, CONFIG.TIMEZONE, "dd.MM. HH:mm");
  const open = allTasks().filter((t) => t.status !== "erledigt").map((t) => Object.assign(t, { sla: slaInfo(t, now) }));
  const red = open.filter((t) => t.sla.light === "red");
  const yellow = open.filter((t) => t.sla.light === "yellow");
  if (!red.length && !yellow.length) return { red: 0, yellow: 0 };
  const line = (t) => `• ${t.id} ${t.type}${t.entrance ? " · " + t.entrance : ""}${t.wohnung ? " · " + whg(t.wohnung) : ""}`
    + ` – ${t.owner} – ${t.sla.react === "overdue" ? "Reaktion fällig seit " + fmt(t.sla.reactDue) : "Erledigung fällig " + fmt(t.sla.doneDue)}`;
  notify(`Guten Morgen: ${red.length} überfällig, ${yellow.length} heute fällig`, [
    red.length ? "ÜBERFÄLLIG:" : "", ...red.map(line), red.length ? "" : "",
    yellow.length ? "Heute/bald fällig:" : "", ...yellow.map(line), "",
    "Details und Bearbeitung: in der App im Cockpit.",
  ]);
  return { red: red.length, yellow: yellow.length };
}

/* ==========================================================================
   Abfahrten (zentral abgefragt und zwischengespeichert)
   ========================================================================== */

/**
 * Ergebnis: { ok, time (ISO der Abfrage), live (true = gerade eben geladen), departures: [...] }.
 * Frisch (< freshSeconds) aus dem Zwischenspeicher; sonst holt genau eine Anfrage neu (Sperre),
 * alle anderen bekommen den letzten Stand. Schlägt das Laden fehl, bleibt der letzte Stand gültig.
 */
function getDepartures() {
  const cfg = CONFIG.TRANSIT;
  const cache = CacheService.getScriptCache();
  let last = null;
  try { last = JSON.parse(cache.get("departures") || "null"); } catch (e) { last = null; }
  const age = last ? (Date.now() - new Date(last.time).getTime()) / 1000 : Infinity;
  const future = (list) => list.filter((d) => new Date(d.when || d.plannedWhen).getTime() > Date.now() - 60000);
  const answer = (x, live) => ({ ok: true, time: x.time, live, departures: future(x.departures).slice(0, 15) });
  if (last && age < cfg.freshSeconds) return answer(last, true);

  // Eigene „weiche“ Sperre im Zwischenspeicher – NICHT die Script-Sperre: hängt der Fahrplandienst,
  // sollen Meldungen, Scans usw. trotzdem sofort gespeichert werden können.
  const empty = { ok: true, time: "", live: false, departures: [] };
  if (cache.get("departures_busy")) return last ? answer(last, false) : empty;
  cache.put("departures_busy", "1", 45);
  try {
    const fresh = fetchDepartures();
    cache.put("departures", JSON.stringify(fresh), cfg.keepHours * 3600);
    return answer(fresh, true);
  } catch (err) {
    console.warn("Abfahrten:", err && err.message);
    return last ? answer(last, false) : empty;
  } finally {
    cache.remove("departures_busy");
  }
}

/** Fragt alle Dienste parallel; die erste gültige Antwort zählt. Nur die nötigen Felder werden behalten. */
function fetchDepartures() {
  const cfg = CONFIG.TRANSIT;
  const props = PropertiesService.getScriptProperties();
  const stopIds = cfg.apis.map((api) => props.getProperty("STOP_" + api.replace(/\W/g, "_")) || "");
  // Haltestellen-ID einmalig je Dienst suchen und merken
  const missing = cfg.apis.map((api, i) => (stopIds[i] ? null : i)).filter((i) => i !== null);
  if (missing.length) {
    const res = UrlFetchApp.fetchAll(missing.map((i) => ({ muteHttpExceptions: true,
      url: `${cfg.apis[i]}/locations?query=${encodeURIComponent(cfg.query)}&results=8&addresses=false&poi=false` })));
    res.forEach((r, n) => {
      if (r.getResponseCode() !== 200) return;
      let list = [];
      try { list = JSON.parse(r.getContentText()); } catch (e) { return; }
      const hit = (Array.isArray(list) ? list : []).find((x) => x && (x.type === "stop" || x.type === "station")
        && String(x.name || "").toLowerCase().indexOf(cfg.match) !== -1);
      if (hit) {
        const i = missing[n];
        stopIds[i] = String(hit.id);
        props.setProperty("STOP_" + cfg.apis[i].replace(/\W/g, "_"), stopIds[i]);
      }
    });
  }
  const tries = cfg.apis.map((api, i) => (stopIds[i] ? { i, url: `${api}/stops/${encodeURIComponent(stopIds[i])}/departures`
    + `?duration=${cfg.duration}&results=${cfg.results}&remarks=false&language=de` } : null)).filter(Boolean);
  if (!tries.length) throw new Error("Haltestelle nicht gefunden");
  const res = UrlFetchApp.fetchAll(tries.map((t) => ({ url: t.url, muteHttpExceptions: true })));
  for (let n = 0; n < res.length; n++) {
    if (res[n].getResponseCode() !== 200) continue;
    let data;
    try { data = JSON.parse(res[n].getContentText()); } catch (e) { continue; }
    const list = Array.isArray(data) ? data : (data && data.departures) || [];
    if (!Array.isArray(list)) continue;
    return {
      time: new Date().toISOString(),
      departures: list.filter((d) => d && (d.when || d.plannedWhen)).map((d) => ({
        when: d.when || null, plannedWhen: d.plannedWhen || null, delay: typeof d.delay === "number" ? d.delay : null,
        cancelled: d.cancelled === true, direction: plain(d.direction, 80), platform: plain(d.platform, 10),
        line: { name: plain(d.line && d.line.name, 12), product: plain(d.line && d.line.product, 20) },
      })),
    };
  }
  throw new Error("Kein Fahrplandienst erreichbar");
}


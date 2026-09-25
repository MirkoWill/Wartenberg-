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
        "Erledigt-Code", "Zuständig", "In Arbeit seit", "Bearbeitet von", "Foto erledigt", "Langläufer", "Langläufer-Grund"],
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
        "Status", "Erledigt am", "Notiz Verwaltung", "Zuständig", "In Arbeit seit", "Bearbeitet von", "Foto erledigt", "Langläufer", "Langläufer-Grund"],
    },
    // Für Looker Studio / Auswertungen – werden nachts und per Menü neu aufgebaut (nicht von Hand bearbeiten)
    analytics: {
      name: "Auswertung Aufträge",
      headers: ["ID", "Quelle", "Art", "Aufgang", "Zuständig", "Status", "Dringend", "Eingang", "In Arbeit seit",
        "Erledigt am", "Reaktion fällig", "Erledigung fällig", "Reaktionszeit (Std.)", "Durchlaufzeit (Tage)",
        "SLA Reaktion", "SLA Erledigung", "Ampel", "Monat", "Offen", "Erledigt", "Überfällig", "SLA eingehalten", "Langläufer"],
    },
    analyticsCleaning: {
      name: "Auswertung Reinigung",
      headers: ["Datum", "Tätigkeit", "Ort", "Soll", "Ist", "Erfüllt", "Monat"],
    },
    // Fehlerüberwachung: Serverfehler und von der App gemeldete Fehler (90 Tage)
    polls: {
      name: "Umfragen",
      headers: ["ID", "Aktiv", "Frage", "Antworten", "Von", "Bis", "Nur für Aufgang-IDs", "Ergebnis für Bewohner sichtbar", "Erstellt"],
    },
    votes: {
      name: "Umfrage-Stimmen",
      headers: ["Zeit", "Umfrage-ID", "Antwort", "Aufgang-ID", "Stimm-Kennung"],
    },
    fitness: {
      name: "Fitness-Buchungen",
      headers: ["ID", "Nr", "Beginn", "Ende", "Minuten", "Gebucht am", "Storniert"],
    },
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
  ROLES: ["Hausmeister", "Leitung", "Verwaltung", "Fitness"],
  // Fitnessraum (privat): Mitglieder nach Nummer, Buchungsregeln, Wochenziel für die Statistik
  FITNESS: { members: ["007", "008", "010", "011"], fromHour: 6, toHour: 23, minMinutes: 30, maxMinutes: 120,
    stepMinutes: 30, daysAhead: 28, maxFuture: 10, weeklyGoal: 2 },
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
  STAFF_FIXED: [["007", "Verwaltung"], ["008", "Verwaltung"], ["001", "Leitung"], ["010", "Fitness"], ["011", "Fitness"]], // 007/008 Verwaltung, 001 Leitung Hausmeisterdienst
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
  // Monatsbericht für den Beirat: Entwurf am 1. um 8 Uhr an die Verwaltung, Versand um REPORT_SEND_HOUR.
  REPORT_SEND_HOUR: 12,
  REPORT_REPLY_TO: "info@willbrandt-kompagnon.de",
  REPORT_SIGNATURE: [
    "Mirko Willbrandt",
    "Willbrandt und Kompagnon · Hausverwaltung",
    "Lindenberger Str. 6 · 13059 Berlin",
    "Telefon +49 30 99 27 07 47 · info@willbrandt-kompagnon.de",
    "www.willbrandt-kompagnon.de",
  ],
  // Wetter für die Startseite: Daten des Deutschen Wetterdienstes über Bright Sky (kostenlos, ohne Schlüssel).
  // Abruf nur durch dieses Script (1× pro Stunde, zwischengespeichert) – die Handys verbinden sich nicht mit Wetterdiensten.
  WEATHER: { lat: 52.574, lon: 13.514, days: 3, cacheMinutes: 60 },
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
    votesYears: 2,            // anonyme Umfrage-Stimmen
    fitnessYears: 2,          // Fitnessraum-Buchungen
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
    // Langläufer: Auswahl „ja“ (bewusst kein Kästchen – leere Kästchen würden als belegte Zeilen zählen)
    sh.getRange(2, def.headers.indexOf("Langläufer") + 1, sh.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(["ja"], true).setAllowInvalid(true).build());
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
  setupPollSheet();
  setupPortalSheets();
  rebuildMeterOverview();
  try { formatSpreadsheet(); } catch (err) { console.warn("Formatieren:", err); }
  Logger.log("Einrichtung abgeschlossen. Foto-Ordner: %s", props.getProperty("PHOTO_FOLDER_ID"));
}

/** Menü „Mieter-App“ in der Tabelle. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Mieter-App")
    .addItem("Tabelle übersichtlich formatieren", "formatSpreadsheetNow")
    .addItem("Zähler-Übersicht aktualisieren", "rebuildMeterOverview")
    .addSeparator()
    .addItem("Reinigungsplan → Kalender übertragen", "syncPlanToCalendar")
    .addItem("Reinigungsplan heute prüfen (Test)", "checkPlanFulfilment")
    .addItem("Mitarbeiter-Links ergänzen", "ensureStaffLinks")
    .addSeparator()
    .addItem("Auswertung aktualisieren", "rebuildAnalyticsNow")
    .addItem("Monatsbericht: Vorschau an mich", "reportPreviewNow")
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
      case "vote": rateLimit("vote", 300, 3600); return json(submitVote(p));
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
      requireStaffWork(user);
      return json(getTasks({}, user));
    }
    if (q.action === "done") return completeTicketPage(q);
    if (q.action === "releaseReport") return releaseReportPage(q);
    if (q.action === "status") { requirePin(q.pin, q.token); return json(getStatus(q.ids)); }
    if (q.action === "news") { requirePin(q.pin, q.token); return json(getNews(q.obj)); }
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
  // Kalender-Abo „Reinigung“: öffentliche iCal-Adresse des Google-Kalenders (Script-Eigenschaft CLEANING_ICS_URL)
  const ics = String(PropertiesService.getScriptProperties().getProperty("CLEANING_ICS_URL") || "").trim();
  const cleaningIcs = /^https:\/\/calendar\.google\.com\/calendar\/ical\/[^\s"'<>]+\.ics$/.test(ics) ? ics : "";
  let polls = [];
  try { polls = residentPolls(object); } catch (err) { console.error("Umfragen:", err); }
  return { ok: true, items: items.slice(0, 10), care, weather, cleaningIcs, polls };
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
  adminNewsSave: (p, user) => adminNewsSave(p, user),
  adminPollSave: (p, user) => adminPollSave(p, user),
  adminPollEnd: (p, user) => adminPollEnd(p, user),
  adminNewsEnd: (p, user) => adminNewsEnd(p, user),
  hmLogin: (p, user) => staffLogin(user),
  logCleaning: (p, user) => { requireStaffWork(user); return logCleaning(p, user); },
  getTasks: (p, user) => { requireStaffWork(user); return getTasks(p, user); },
  completeTask: (p, user) => { requireStaffWork(user); return completeTask(p, user); },
  submitStaffDefect: (p, user) => { requireStaffWork(user); return submitStaffDefect(p, user); },
  fitnessOverview: (p, user) => fitnessOverview(p, user),
  fitnessBook: (p, user) => fitnessBook(p, user),
  fitnessCancel: (p, user) => fitnessCancel(p, user),
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
  ensureReportTrigger();
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
    return [nr, role, active !== false, token, `${CONFIG.APP_URL}?hm=${token}#${role === "Fitness" ? "fitness" : "hausmeister"}`];
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
  const fitness = CONFIG.FITNESS.members.indexOf(String(user.nr)) !== -1;
  if (user.role === "Fitness") return { ok: true, user: { name: user.name, role: user.role, fitness }, areas: [], activities: [], plan: null };
  return {
    ok: true, user: { name: user.name, role: user.role, fitness },
    areas: activeAreas().map(({ residents, ...a }) => a), activities: activeActivities(),
    // „Heute zu tun“ nur für den Hausmeisterdienst – die Verwaltung braucht es nicht (Anmeldung bleibt schnell)
    plan: user.role === "Verwaltung" ? null : todayPlan(),
  };
}

/** „Heute zu tun“: eintägige Einträge des Reinigungsplans für heute mit Stand laut Nachweisen. */
function todayPlan() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get("todayPlan");
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* neu berechnen */ } }
  try {
    const day = berlinToday();
    const items = planStatusForDay(day, activeAreas(), sheetObjects(CONFIG.SHEETS.cleaning), planRows())
      .map((x) => ({ activity: plain(x.activity, 60), ort: plain(x.ort, 80), done: x.done === true }));
    const out = { day: Utilities.formatDate(day, CONFIG.TIMEZONE, "yyyy-MM-dd"), items: items.slice(0, 40) };
    cache.put("todayPlan", JSON.stringify(out), 120); // 2 Min.: mehrere Anmeldungen hintereinander rechnen nicht neu
    return out;
  } catch (err) {
    console.warn("Heute zu tun:", err);
    return { day: "", items: [] };
  }
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
    if (p.photo && !row["Foto erledigt"]) {
      // Nachher-Foto (optional) – Nachweis für Verwaltung und Beirat
      const url = savePhoto(p.photo, `${id}_erledigt`);
      if (url) sheet.getRange(row._row, def.headers.indexOf("Foto erledigt") + 1).setValue(url);
    }
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
      if (r["Foto erledigt"]) trashPhoto(r["Foto erledigt"]);
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
    fitness: deleteRowsWhere(CONFIG.SHEETS.fitness, (r) => older(date(r.Beginn), before(R.fitnessYears))),
    votes: deleteRowsWhere(CONFIG.SHEETS.votes, (r) => older(date(r.Zeit), before(R.votesYears))),
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
  ["checkPlanFulfilment", "dailyMaintenance", "morningDigest", "monthlyReport", "monthlyReportSend"].forEach((h) => { if (handlers.indexOf(h) === -1) issues.push(`Automatik „${h}“ fehlt – setup ausführen.`); });
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
    by: String(r["Bearbeitet von"] || ""), _row: r._row, photo: driveUrl(r.Foto), photoDone: driveUrl(r["Foto erledigt"]),
    longRunner: isYes(r["Langläufer"]), longReason: String(r["Langläufer-Grund"] || "").replace(/^'/, ""),
  }));
  const defects = sheetObjects(CONFIG.SHEETS.staffDefects).filter((r) => r.ID).map((r) => ({
    id: String(r.ID), kind: "defect", source: String(r["Erfasst von (Nr)"] || ""), type: "Mangel (intern)",
    status: String(r.Status || "offen"), owner: ownerOf(r, "Mangel (intern)"), created: date(r.Eingang),
    inWork: date(r["In Arbeit seit"]), done: date(r["Erledigt am"]), termin: null, urgent: r.Dringend === true,
    entrance: entranceName(r["Aufgang-ID"]), object: String(r["Aufgang-ID"] || ""), wohnung: "", name: "", contact: "",
    details: String(r.Beschreibung || ""), ort: String(r.Ort || ""), note: String(r["Notiz Verwaltung"] || ""),
    by: String(r["Bearbeitet von"] || ""), _row: r._row, photo: driveUrl(r.Foto), photoDone: driveUrl(r["Foto erledigt"]),
    longRunner: isYes(r["Langläufer"]), longReason: String(r["Langläufer-Grund"] || "").replace(/^'/, ""),
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
  const hours0 = reactAt && t.created ? Math.max(0, (reactAt - t.created) / 3600000) : null;
  const days0 = closed && t.done && t.created ? Math.max(0, (t.done - t.created) / 86400000) : null;
  // Langläufer (wartet z. B. auf Firmen): außerhalb der Service-Ziele – keine Ampel, nicht in Quoten/Durchschnitten
  if (t.longRunner) return { reactDue, doneDue, react: "long", done: "long", light: closed ? "done" : "long", reactHours: hours0, leadDays: days0, long: true };
  let light = "green";
  if (closed) light = "done";
  else if (react === "overdue" || done === "overdue") light = "red";
  else if ((react === "open" && reactDue - now < warn) || (done === "open" && doneDue - now < warn)) light = "yellow";
  const hours = reactAt && t.created ? Math.max(0, (reactAt - t.created) / 3600000) : null;
  const days = closed && t.done && t.created ? Math.max(0, (t.done - t.created) / 86400000) : null;
  return { reactDue, doneDue, react, done, light, reactHours: hours, leadDays: days };
}

function isYes(v) {
  return v === true || /^(ja|x|true|1)$/i.test(String(v || "").trim());
}

/** Nur echte Drive-Links weitergeben (keine beliebigen URLs aus der Tabelle). */
function driveUrl(v) {
  const s = String(v || "").trim();
  return /^https:\/\/(drive|docs)\.google\.com\/[^\s"'<>]+$/.test(s) ? s : "";
}

function isoOrEmpty(d) { return d instanceof Date && !isNaN(d) ? d.toISOString() : ""; }

/** Daten für das Cockpit: Aufträge mit Ampel, Kennzahlen, Statistik. */
function adminOverview(p, user) {
  requireAdmin(user);
  const lead = user.role === "Leitung"; // Leitung Hausmeisterdienst: nur Hausmeister-Aufträge, keine Zähler/Fehler
  const now = new Date();
  const tasks = allTasks().filter((t) => !lead || t.owner === "Hausmeister").map((t) => Object.assign(t, { sla: slaInfo(t, now) }));
  const since = (days) => new Date(now.getTime() - days * 86400000);
  const recentClosed = tasks.filter((t) => t.status === "erledigt" && t.done && t.done > since(90) && !t.longRunner);
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
    note: t.note, by: t.by, photo: t.photo, photoDone: t.photoDone, longRunner: t.longRunner, longReason: t.longReason,
    sla: { light: t.sla.light, react: t.sla.react, done: t.sla.done, reactDue: isoOrEmpty(t.sla.reactDue), doneDue: isoOrEmpty(t.sla.doneDue) },
  }));
  const rank = { red: 0, yellow: 1, green: 2, long: 3, done: 4 };
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
      longRunners: open.filter((t) => t.longRunner).length,
    },
    months: months.map((m) => Object.assign({ month: m }, perMonth[m])),
    perEntrance,
    tasks: list,
    lookerUrl: lead ? "" : PropertiesService.getScriptProperties().getProperty("LOOKER_URL") || "",
    role: user.role,
    work: workLog(scans, areas, plan, now),
    news: lead ? [] : adminNewsList(),
    polls: lead ? [] : adminPollList(),
    time: now.toISOString(),
  };
}

/**
 * Erledigte Arbeiten je Tag (14 Tage) mit Abgleich gegen den Reinigungsplan – bewusst OHNE
 * Mitarbeiternummern (Datensparsamkeit; wer eingesetzt war, weiß der Hausmeisterdienst aus seinen Einsatzplänen).
 * Ergebnis: { days: [{ date, done: [{ time, activity, ort, planned, manual }], missed: [{ activity, ort, lateOn }] }] }
 */
function workLog(scans, areas, plan, now) {
  const DAYS = 14;
  const key = (d) => Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd");
  const low = (x) => String(x || "").trim().toLowerCase();
  const valid = scans.filter((s) => s["Zeitpunkt (Scan)"] instanceof Date);
  const days = [];
  for (let i = 0; i < DAYS; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = key(day);
    const status = planStatusForDay(day, areas, scans, plan);
    const done = valid.filter((s) => key(s["Zeitpunkt (Scan)"]) === k)
      .sort((a, b) => a["Zeitpunkt (Scan)"] - b["Zeitpunkt (Scan)"])
      .map((s) => ({
        time: Utilities.formatDate(s["Zeitpunkt (Scan)"], CONFIG.TIMEZONE, "HH:mm"),
        activity: plain(s["Tätigkeit"], 60), ort: plain(s.Ort, 80),
        planned: status.some((x) => low(x.activity) === low(s["Tätigkeit"]) && (low(x.ort) === low(s.Ort) || !areas.some((a) => low(a.ort) === low(x.ort)))),
        manual: /^manuell/.test(String(s.Erfassung || "")),
      }));
    // Geplant, aber an dem Tag kein Nachweis – später nachgeholt (bis 7 Tage)?
    const missed = i === 0 ? [] : status.filter((x) => !x.done).map((x) => {
      const later = laterScan(valid, day, x, areas);
      return { activity: plain(x.activity, 60), ort: plain(x.ort, 80), lateOn: later ? key(later["Zeitpunkt (Scan)"]) : "" };
    });
    const open = i === 0 ? status.filter((x) => !x.done).map((x) => ({ activity: plain(x.activity, 60), ort: plain(x.ort, 80) })) : [];
    if (done.length || missed.length || open.length || status.length) {
      days.push({ date: k, done, missed, open, planned: status.length, plannedDone: status.filter((x) => x.done).length });
    }
  }
  return { days };
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
      if (p.owner !== undefined || p.note !== undefined || p.longRunner !== undefined || p.longReason !== undefined) {
        throw userError("Zuständigkeit, Notiz und Langläufer ändert die Verwaltung.");
      }
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
    if (p.longRunner !== undefined) sheet.getRange(row._row, col("Langläufer")).setValue(p.longRunner === true ? "ja" : "");
    if (p.longReason !== undefined) sheet.getRange(row._row, col("Langläufer-Grund")).setValue(protectCell(str(p.longReason, 300)));
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
  const label = { ok: "eingehalten", late: "verspätet", overdue: "überfällig", open: "offen", long: "Langläufer" };
  const ampel = { red: "rot", yellow: "gelb", green: "grün", done: "erledigt", long: "Langläufer" };
  const rows = allTasks().map((t) => {
    const s = slaInfo(t, now);
    return [t.id, t.source === "Bewohner" ? "Bewohner" : "Hausmeister", t.type, t.entrance || t.object, t.owner, t.status,
      t.urgent, t.created || "", t.inWork || "", t.done || "", s.reactDue, s.doneDue, round(s.reactHours, 1),
      round(s.leadDays, 1), label[s.react], label[s.done], ampel[s.light], monthKey(t.created),
      // Fertige Zähler für Looker Studio (keine Formeln nötig): Summe bzw. Durchschnitt (= Quote)
      t.status === "erledigt" ? 0 : 1, t.status === "erledigt" ? 1 : 0, s.light === "red" ? 1 : 0,
      t.status === "erledigt" && !t.longRunner ? (s.react === "ok" && s.done === "ok" ? 1 : 0) : "", t.longRunner ? 1 : 0].map(protectCell);
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
   Monatsbericht für den Beirat (PDF) – nur Zahlen, keine personenbezogenen Daten.
   Ablauf: Am 1. um 8 Uhr erstellt „monthlyReport“ das PDF für den Vormonat, legt es im Drive-Ordner
   „Beiratsberichte“ ab und schickt es an NOTIFY_EMAIL mit einem Freigabe-Link. Erst nach Klick auf
   „An den Beirat senden“ geht es an die Adressen in der Script-Eigenschaft BEIRAT_EMAILS.
   ========================================================================== */

const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

function beiratEmails() {
  return String(PropertiesService.getScriptProperties().getProperty("BEIRAT_EMAILS") || "")
    .split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 10);
}

/** Kennzahlen für einen Monat (y, m = 0–11). */
function reportData(y, m) {
  const now = new Date();
  const start = new Date(y, m, 1), end = new Date(y, m + 1, 1);
  const tasks = allTasks().map((t) => Object.assign(t, { sla: slaInfo(t, now) }));
  const inRange = (d, a, b) => d instanceof Date && d >= a && d < b;
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const TYPES = ["Mangel", "Mangel (intern)", "Klingelschild", "Elektroraum"];
  const stats = (a, b) => {
    const received = tasks.filter((t) => inRange(t.created, a, b));
    const closedAll = tasks.filter((t) => t.status === "erledigt" && inRange(t.done, a, b));
    const closed = closedAll.filter((t) => !t.longRunner); // Langläufer zählen nicht in die Service-Ziele
    const open = tasks.filter((t) => t.created instanceof Date && t.created < b && !(t.status === "erledigt" && t.done instanceof Date && t.done < b));
    const ok = (t) => t.sla.react === "ok" && t.sla.done === "ok";
    const byEntrance = {};
    received.forEach((t) => { const k = t.entrance || t.object || "ohne Aufgang"; byEntrance[k] = (byEntrance[k] || 0) + 1; });
    return {
      received: received.length, closed: closedAll.length, open: open.length, longOpen: open.filter((t) => t.longRunner).length,
      slaQuote: closed.length ? closed.filter(ok).length / closed.length : null,
      avgReactHours: avg(closed.map((t) => t.sla.reactHours).filter((x) => x !== null)),
      avgLeadDays: avg(closed.map((t) => t.sla.leadDays).filter((x) => x !== null)),
      byType: TYPES.map((type) => {
        const r = received.filter((t) => t.type === type), c = closed.filter((t) => t.type === type);
        return { type, received: r.length, closed: closedAll.filter((t) => t.type === type).length, slaQuote: c.length ? c.filter(ok).length / c.length : null };
      }),
      byEntrance,
    };
  };
  const cur = stats(start, end);
  const prev = stats(new Date(y, m - 1, 1), start);
  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const a = new Date(y, m - i, 1), b = new Date(y, m - i + 1, 1);
    const st = stats(a, b);
    trend.push({ label: MONTHS_DE[a.getMonth()].slice(0, 3), received: st.received, slaQuote: st.slaQuote });
  }
  // Reinigung laut Plan
  const areas = activeAreas(), plan = planRows(), scans = sheetObjects(CONFIG.SHEETS.cleaning);
  const valid = scans.filter((s) => s["Zeitpunkt (Scan)"] instanceof Date);
  let soll = 0, ist = 0, late = 0;
  const missing = [];
  for (let d = new Date(start); d < end && d < now; d.setDate(d.getDate() + 1)) {
    const day = new Date(d);
    planStatusForDay(day, areas, scans, plan).forEach((x) => {
      soll++;
      if (x.done) { ist++; return; }
      if (laterScan(valid, day, x, areas)) late++;
      else missing.push({ date: Utilities.formatDate(day, CONFIG.TIMEZONE, "dd.MM."), activity: x.activity, ort: x.ort });
    });
  }
  // Langläufer: offen am Monatsende oder im Monat erledigt – gesondert aufgeführt
  const fmtD = (d) => Utilities.formatDate(d, CONFIG.TIMEZONE, "dd.MM.yyyy");
  const longRunners = tasks.filter((t) => t.longRunner && t.created instanceof Date && t.created < end
    && (t.status !== "erledigt" || (t.done instanceof Date && t.done >= start))).map((t) => ({
    type: t.type, entrance: t.entrance || "", since: fmtD(t.created), reason: plain(t.longReason, 200),
    state: t.status === "erledigt" && t.done instanceof Date ? `erledigt ${fmtD(t.done)}` : t.status,
  })).slice(0, 20);
  const overdue = tasks.filter((t) => t.status !== "erledigt" && t.sla.light === "red").map((t) => ({
    type: t.type, entrance: t.entrance || "", since: t.created ? Utilities.formatDate(t.created, CONFIG.TIMEZONE, "dd.MM.yyyy") : "",
  })).slice(0, 15);
  return {
    title: `${MONTHS_DE[m]} ${y}`, prevTitle: MONTHS_DE[(m + 11) % 12], cur, prev, trend,
    cleaning: { soll, ist, late, missing: missing.slice(0, 20), missingCount: missing.length },
    overdue, longRunners, created: Utilities.formatDate(now, CONFIG.TIMEZONE, "dd.MM.yyyy HH:mm"),
  };
}

/** Erster Nachweis nach dem geplanten Tag (bis 7 Tage) für einen Plan-Eintrag – oder null. */
function laterScan(valid, day, x, areas) {
  const key = (d) => Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd");
  const low = (v) => String(v || "").trim().toLowerCase();
  const k = key(day);
  const generic = !areas.some((a) => low(a.ort) === low(x.ort));
  return valid.filter((s) => s["Zeitpunkt (Scan)"] > day && s["Zeitpunkt (Scan)"] - day < 8 * 86400000
    && key(s["Zeitpunkt (Scan)"]) > k && low(s["Tätigkeit"]) === low(x.activity) && (generic || low(s.Ort) === low(x.ort)))
    .sort((a, b) => a["Zeitpunkt (Scan)"] - b["Zeitpunkt (Scan)"])[0] || null;
}

function reportHtml(r, preview, comment) {
  const e = escHtml;
  const pct = (x) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)} %`);
  const num = (x, d) => (x === null || x === undefined ? "–" : (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toString().replace(".", ","));
  const diff = (a, b) => (b === null || b === undefined || a === null ? "" : a > b ? " ▲" : a < b ? " ▼" : "");
  const bar = (v, max, color) => `<div style="background:#eef0e6;height:10px;border-radius:5px"><div style="width:${max ? Math.round((v / max) * 100) : 0}%;background:${color};height:10px;border-radius:5px"></div></div>`;
  const kpi = (label, value, sub) => `<td class="kpi"><div class="v">${e(value)}</div><div class="l">${e(label)}</div>${sub ? `<div class="s">${e(sub)}</div>` : ""}</td>`;
  const c = r.cur, p = r.prev;
  const cleanQuote = r.cleaning.soll ? r.cleaning.ist / r.cleaning.soll : null;
  const entr = Object.keys(c.byEntrance).map((k) => [k, c.byEntrance[k]]).sort((a, b) => b[1] - a[1]);
  const maxE = Math.max(1, ...entr.map((x) => x[1]));
  const maxT = Math.max(1, ...r.trend.map((t) => t.received));
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#151515;font-size:11pt;margin:0}
    h1{font-family:Georgia,serif;font-weight:400;color:#6d7454;font-size:22pt;margin:0 0 2pt}
    h2{font-family:Georgia,serif;font-weight:400;color:#6d7454;font-size:14pt;margin:16pt 0 6pt;border-bottom:1px solid #e2e3dc;padding-bottom:3pt}
    .brand{color:#6d7454;font-weight:bold;font-size:10pt}.muted{color:#5f625a;font-size:9pt}
    table{border-collapse:collapse;width:100%}td,th{padding:4pt 6pt;text-align:left;vertical-align:middle}
    th{font-size:9pt;color:#5f625a;font-weight:normal;border-bottom:1px solid #e2e3dc}
    .kpi{border:1px solid #e2e3dc;padding:8pt;width:25%}.kpi .v{font-size:18pt;font-weight:bold}.kpi .l{font-weight:bold;font-size:9.5pt}.kpi .s{font-size:8.5pt;color:#5f625a}
    .rows td{border-bottom:1px solid #f0f0ea}.warn{color:#b3261e}.preview{background:#fff1c7;padding:6pt;margin-bottom:8pt;font-weight:bold}
  </style></head><body>
    ${preview ? '<div class="preview">VORSCHAU – nicht an den Beirat versendet</div>' : ""}
    <div class="brand">Willbrandt und Kompagnon · Hausverwaltung</div>
    <h1>Monatsbericht ${e(r.title)}</h1>
    <div class="muted">WEG Wartenberger Dorfkrug · für den Verwaltungsbeirat · erstellt ${e(r.created)} · ohne personenbezogene Daten</div>
    ${String(comment || "").trim() ? `<div style="border-left:4pt solid #6d7454;background:#eef0e6;padding:8pt 10pt;margin-top:12pt"><strong>Anmerkungen der Verwaltung</strong><br>${e(String(comment).trim()).replace(/\n/g, "<br>")}</div>` : ""}

    <h2>Überblick</h2>
    <table><tr>
      ${kpi("Meldungen eingegangen", String(c.received), `Vormonat ${p.received}${diff(c.received, p.received)}`)}
      ${kpi("Erledigt", String(c.closed), `Vormonat ${p.closed}`)}
      ${kpi("Offen am Monatsende", String(c.open), `Vormonat ${p.open}`)}
      ${kpi("Service-Ziele eingehalten", pct(c.slaQuote), `Vormonat ${pct(p.slaQuote)}`)}
    </tr><tr>
      ${kpi("Ø Reaktionszeit", c.avgReactHours === null ? "–" : `${num(c.avgReactHours, 1)} Std.`, "bis „in Arbeit“")}
      ${kpi("Ø Erledigungsdauer", c.avgLeadDays === null ? "–" : `${num(c.avgLeadDays, 1)} Tage`, "Eingang bis erledigt")}
      ${kpi("Reinigung laut Plan", pct(cleanQuote), `${r.cleaning.ist} von ${r.cleaning.soll} am Plantag`)}
      ${kpi("Derzeit überfällig", String(r.overdue.length), "Stand heute")}
    </tr></table>

    <h2>Meldungen nach Art</h2>
    <table class="rows"><tr><th>Art</th><th>eingegangen</th><th>erledigt</th><th>Service-Ziel eingehalten</th></tr>
      ${c.byType.map((t) => `<tr><td>${e(t.type === "Mangel (intern)" ? "Mangel (vom Hausmeister gemeldet)" : t.type)}</td><td>${t.received}</td><td>${t.closed}</td><td>${pct(t.slaQuote)}</td></tr>`).join("")}
    </table>
    <p class="muted">Service-Ziele: Dringend – Reaktion 1 Tag, erledigt 3 Tage · Mangel – Reaktion 3 Werktage, erledigt 14 Tage ·
      Klingelschild – Reaktion 3 Werktage, erledigt 10 Werktage · Elektroraum – bestätigt 1 Werktag vor dem Termin, erledigt am Termin.</p>

    <h2>Meldungen nach Aufgang</h2>
    ${entr.length ? `<table class="rows">${entr.map(([k, v]) => `<tr><td style="width:40%">${e(k)}</td><td style="width:50%">${bar(v, maxE, "#6d7454")}</td><td>${v}</td></tr>`).join("")}</table>` : '<p class="muted">Keine Meldungen in diesem Monat.</p>'}

    <h2>Reinigung laut Plan</h2>
    <table class="rows">
      <tr><td style="width:40%">Am geplanten Tag nachgewiesen</td><td>${r.cleaning.ist} von ${r.cleaning.soll} (${pct(cleanQuote)})</td></tr>
      <tr><td>Später nachgeholt (bis 7 Tage)</td><td>${r.cleaning.late}</td></tr>
      <tr><td>Nicht nachgewiesen</td><td class="${r.cleaning.missingCount ? "warn" : ""}">${r.cleaning.missingCount}</td></tr>
    </table>
    ${r.cleaning.missing.length ? `<p class="muted">Nicht nachgewiesen: ${r.cleaning.missing.map((x) => `${e(x.date)} ${e(x.activity)} – ${e(x.ort)}`).join(" · ")}${r.cleaning.missingCount > r.cleaning.missing.length ? " …" : ""}</p>` : ""}

    <h2>Entwicklung (6 Monate)</h2>
    <table class="rows"><tr><th>Monat</th><th>Meldungen</th><th></th><th>Service-Ziele</th></tr>
      ${r.trend.map((t) => `<tr><td style="width:15%">${e(t.label)}</td><td style="width:10%">${t.received}</td><td style="width:50%">${bar(t.received, maxT, "#3a6ea5")}</td><td>${pct(t.slaQuote)}</td></tr>`).join("")}
    </table>

    ${(r.longRunners || []).length ? `<h2>Langläufer (gesondert, nicht in den Service-Zielen)</h2>
      <p class="muted">Maßnahmen, die von Dritten abhängen (z. B. Fachfirmen, Ersatzteile) und daher nicht in die Service-Ziele eingerechnet werden.</p>
      <table class="rows"><tr><th>Art</th><th>Aufgang</th><th>seit</th><th>Stand</th><th>Grund</th></tr>
      ${r.longRunners.map((o) => `<tr><td>${e(o.type)}</td><td>${e(o.entrance)}</td><td>${e(o.since)}</td><td>${e(o.state)}</td><td>${e(o.reason)}</td></tr>`).join("")}</table>` : ""}

    ${r.overdue.length ? `<h2>Derzeit überfällige Aufträge</h2><table class="rows"><tr><th>Art</th><th>Aufgang</th><th>eingegangen</th></tr>
      ${r.overdue.map((o) => `<tr><td>${e(o.type)}</td><td>${e(o.entrance)}</td><td>${e(o.since)}</td></tr>`).join("")}</table>` : ""}

    <p class="muted" style="margin-top:18pt">Automatisch erstellt aus der Mieter-App. Enthält nur Zahlen – keine Namen, Wohnungen,
      Beschreibungen oder Mitarbeiterdaten. Fragen gern an Willbrandt und Kompagnon.</p>
  </body></html>`;
}

/** PDF für y/m erstellen (mit optionalen Anmerkungen der Verwaltung) und – außer bei der Vorschau – ablegen. */
function createReportPdf(y, m, preview, comment) {
  const r = reportData(y, m);
  const name = `Monatsbericht ${r.title} – WEG Wartenberger Dorfkrug${preview ? " (Vorschau)" : ""}.pdf`;
  const blob = HtmlService.createHtmlOutput(reportHtml(r, preview, comment)).getBlob().getAs("application/pdf").setName(name);
  let fileId = "";
  if (!preview) {
    const props = PropertiesService.getScriptProperties();
    let folder = null;
    try { folder = props.getProperty("REPORT_FOLDER_ID") ? DriveApp.getFolderById(props.getProperty("REPORT_FOLDER_ID")) : null; } catch (e) { folder = null; }
    if (!folder) { folder = DriveApp.createFolder("Beiratsberichte Mieter-App"); props.setProperty("REPORT_FOLDER_ID", folder.getId()); }
    fileId = folder.createFile(blob).getId();
  }
  return { r, blob, fileId, name };
}

function previousMonth() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return [d.getFullYear(), d.getMonth()];
}

function reportPending() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty("REPORT_PENDING") || "null"); } catch (e) { return null; }
}
function saveReportPending(p) { PropertiesService.getScriptProperties().setProperty("REPORT_PENDING", JSON.stringify(p)); }
function reportLink(token) { return `${CONFIG.WEBAPP_URL || ScriptApp.getService().getUrl()}?action=releaseReport&t=${token}`; }

/** Automatik am 1. um 8 Uhr: Bericht erstellen, Verwaltung bekommt PDF + Link zur Anmerkungs-/Freigabeseite. */
function monthlyReport() {
  const [y, m] = previousMonth();
  const to = (PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || "").trim();
  const res = createReportPdf(y, m, true, ""); // Entwurf zum Ansehen; abgelegt wird die versendete Fassung
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  saveReportPending({ token, y, m, title: res.r.title, created: Date.now(), sent: false, hold: false, comment: "" });
  const emails = beiratEmails();
  if (!to) return { ok: false, error: "NOTIFY_EMAIL fehlt" };
  MailApp.sendEmail({
    to, subject: oneLine(`[Mieter-App] Monatsbericht ${res.r.title} – Versand heute um ${CONFIG.REPORT_SEND_HOUR} Uhr`),
    body: [`Der Monatsbericht ${res.r.title} für den Beirat ist fertig (Entwurf im Anhang).`, "",
      emails.length ? `Er geht heute um ${CONFIG.REPORT_SEND_HOUR} Uhr automatisch an ${emails.length} Empfänger: ${emails.join(", ")}.`
        : "ACHTUNG: Script-Eigenschaft BEIRAT_EMAILS ist nicht eingetragen – kein Versand möglich.", "",
      "Anmerkungen ergänzen, sofort senden oder den Versand anhalten:", reportLink(token), "",
      "Ohne Ihr Zutun wird der Bericht unverändert versendet."].join("\n"),
    attachments: [res.blob],
  });
  return { ok: true, title: res.r.title };
}

/** Automatik am 1. um 12 Uhr: versenden, wenn nicht schon geschehen oder angehalten. */
function monthlyReportSend() {
  const p = reportPending();
  if (!p || p.sent || p.hold || Date.now() - p.created > 86400000) return { sent: false };
  return sendReportToBeirat(p);
}

/** Versand an BEIRAT_EMAILS (PDF mit Anmerkungen neu erstellt und abgelegt), Kopie an NOTIFY_EMAIL. */
function sendReportToBeirat(p) {
  const emails = beiratEmails();
  if (!emails.length) return { sent: false, error: "BEIRAT_EMAILS fehlt" };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cur = reportPending();
    if (!cur || cur.token !== p.token || cur.sent) return { sent: false, error: "bereits versendet" };
    const res = createReportPdf(cur.y, cur.m, false, cur.comment);
    const cc = (PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || "").trim();
    const mail = reportMail(res.r, cur.comment);
    MailApp.sendEmail({ to: emails.join(","), cc: cc || undefined, name: CONFIG.SENDER_NAME, replyTo: CONFIG.REPORT_REPLY_TO,
      subject: oneLine(`Monatsbericht ${res.r.title} – WEG Wartenberger Dorfkrug`), body: mail.text, htmlBody: mail.html, attachments: [res.blob] });
    cur.sent = true;
    cur.sentAt = Date.now();
    cur.fileId = res.fileId;
    saveReportPending(cur);
    return { sent: true, count: emails.length };
  } finally {
    lock.releaseLock();
  }
}

/** Anschreiben an den Beirat (Text + HTML) mit Kurzfassung, Anmerkungen und Signatur. */
function reportMail(r, comment) {
  const pct = (x) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)} %`);
  const c = r.cur;
  const clean = r.cleaning.soll ? r.cleaning.ist / r.cleaning.soll : null;
  const facts = [
    `Meldungen: ${c.received} eingegangen, ${c.closed} erledigt, ${c.open} offen am Monatsende`,
    `Service-Ziele eingehalten: ${pct(c.slaQuote)} (Vormonat ${pct(r.prev.slaQuote)})`,
    `Reinigung laut Plan: ${pct(clean)} am geplanten Tag${r.cleaning.late ? `, ${r.cleaning.late} nachgeholt` : ""}`,
  ];
  if ((r.longRunners || []).length) facts.push(`Langläufer (abhängig von Fachfirmen, gesondert aufgeführt): ${r.longRunners.length}`);
  const note = String(comment || "").trim();
  const sig = CONFIG.REPORT_SIGNATURE;
  const text = [
    "Sehr geehrte Mitglieder des Verwaltungsbeirats,", "",
    `anbei erhalten Sie den Monatsbericht ${r.title} für die WEG Wartenberger Dorfkrug. Er zeigt, welche Anliegen über die Mieter-App eingegangen sind, wie zügig sie bearbeitet wurden und ob die Reinigung wie geplant erfolgt ist.`, "",
    "Auf einen Blick:", ...facts.map((f) => `• ${f}`), "",
    ...(note ? ["Anmerkungen der Verwaltung:", note, ""] : []),
    "Der Bericht enthält ausschließlich Zahlen und keine personenbezogenen Daten. Für Rückfragen stehen wir Ihnen gern zur Verfügung – gern besprechen wir die Entwicklung auch in der nächsten Beiratssitzung.", "",
    "Mit freundlichen Grüßen", "", ...sig,
  ].join("\n");
  const e = escHtml;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#151515;max-width:640px">
    <p>Sehr geehrte Mitglieder des Verwaltungsbeirats,</p>
    <p>anbei erhalten Sie den <strong>Monatsbericht ${e(r.title)}</strong> für die WEG Wartenberger Dorfkrug. Er zeigt, welche Anliegen
      über die Mieter-App eingegangen sind, wie zügig sie bearbeitet wurden und ob die Reinigung wie geplant erfolgt ist.</p>
    <p style="margin-bottom:4px"><strong>Auf einen Blick:</strong></p>
    <ul style="margin-top:0">${facts.map((f) => `<li>${e(f)}</li>`).join("")}</ul>
    ${note ? `<div style="border-left:4px solid #6d7454;background:#eef0e6;padding:10px 14px;margin:14px 0"><strong>Anmerkungen der Verwaltung</strong><br>${e(note).replace(/\n/g, "<br>")}</div>` : ""}
    <p>Der Bericht enthält ausschließlich Zahlen und keine personenbezogenen Daten. Für Rückfragen stehen wir Ihnen gern zur Verfügung –
      gern besprechen wir die Entwicklung auch in der nächsten Beiratssitzung.</p>
    <p>Mit freundlichen Grüßen</p>
    <p style="margin-top:18px">${sig.map((l, i) => (i === 0 ? `<strong>${e(l)}</strong>` : i === 1 ? `<span style="color:#6d7454;font-weight:bold">${e(l)}</span>` : `<span style="color:#5f625a;font-size:13px">${e(l)}</span>`)).join("<br>")}</p>
  </div>`;
  return { text, html };
}

/** Seite hinter dem Link: Anmerkungen eintragen, sofort senden, um 12 Uhr senden lassen oder anhalten. */
function releaseReportPage(q) {
  const p = reportPending();
  const valid = p && typeof q.t === "string" && /^[a-f0-9]{32,}$/i.test(q.t) && q.t === p.token && Date.now() - p.created < 14 * 86400000;
  if (!valid) return donePage("Link ungültig", "Dieser Link ist ungültig oder abgelaufen.");
  if (p.sent) return donePage("Bereits versendet", `Der Monatsbericht ${p.title} wurde bereits an den Beirat gesendet.`);
  const emails = beiratEmails();
  const act = String(q.do || "");
  if (act) {
    p.comment = String(q.comment || "").replace(/\r/g, "").slice(0, 3000);
    if (act === "save") { p.hold = false; saveReportPending(p); return donePage("Gespeichert", `Ihre Anmerkungen sind gespeichert. Der Bericht geht heute um ${CONFIG.REPORT_SEND_HOUR} Uhr an den Beirat.`, backLink(p)); }
    if (act === "hold") { p.hold = true; saveReportPending(p); return donePage("Angehalten", "Der automatische Versand ist angehalten. Über den Link in Ihrer Mail können Sie den Bericht später senden.", backLink(p)); }
    if (act === "send") {
      saveReportPending(p);
      const res = sendReportToBeirat(p);
      return res.sent ? donePage("Versendet", `Der Monatsbericht ${p.title} ging an ${res.count} Empfänger im Beirat. Sie erhalten eine Kopie.`)
        : donePage("Nicht versendet", res.error === "BEIRAT_EMAILS fehlt" ? "Bitte zuerst die Script-Eigenschaft BEIRAT_EMAILS eintragen." : "Der Bericht wurde bereits versendet.");
    }
  }
  const base = CONFIG.WEBAPP_URL || ScriptApp.getService().getUrl();
  const status = p.hold ? "Automatischer Versand ist <strong>angehalten</strong>."
    : `Geht heute um <strong>${CONFIG.REPORT_SEND_HOUR} Uhr</strong> automatisch an ${emails.length} Empfänger.`;
  const form = `<form method="get" action="${escHtml(base)}" target="_top">
      <input type="hidden" name="action" value="releaseReport"><input type="hidden" name="t" value="${escHtml(p.token)}">
      <p style="font-size:15px">${status}${emails.length ? "" : " <strong>BEIRAT_EMAILS fehlt!</strong>"}</p>
      <label style="font-weight:bold">Anmerkungen der Verwaltung (optional – erscheinen in der Mail und im PDF)</label>
      <textarea name="comment" rows="7" maxlength="1500" style="width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:10px;margin:6px 0 14px;border:1px solid #ccc;border-radius:8px">${escHtml(p.comment || "")}</textarea>
      <button name="do" value="send" class="btn" style="width:100%;border:0;cursor:pointer">Jetzt an den Beirat senden</button>
      <button name="do" value="save" style="width:100%;margin-top:10px;padding:14px;border:2px solid #6d7454;background:#fff;color:#6d7454;border-radius:8px;font-weight:bold;font-size:16px;cursor:pointer">Speichern – um ${CONFIG.REPORT_SEND_HOUR} Uhr senden</button>
      <button name="do" value="hold" style="width:100%;margin-top:10px;padding:12px;border:0;background:none;color:#b3261e;font-size:15px;cursor:pointer">Diesen Monat nicht automatisch senden</button>
    </form>`;
  return donePage(`Monatsbericht ${p.title}`, "", form);
}

function backLink(p) {
  return `<a class="btn" href="${escHtml(reportLink(p.token))}" target="_top">Zurück zum Bericht</a>`;
}

/** Menü: Vorschau des Vormonats an NOTIFY_EMAIL (ohne Ablage, ohne Versand). */
function reportPreviewNow() {
  const [y, m] = previousMonth();
  const to = (PropertiesService.getScriptProperties().getProperty("NOTIFY_EMAIL") || "").trim();
  const res = createReportPdf(y, m, true, "");
  if (to) {
    const mail = reportMail(res.r, "(Hier stehen Ihre Anmerkungen, falls Sie welche eintragen.)");
    MailApp.sendEmail({ to, subject: oneLine(`[Mieter-App] VORSCHAU Monatsbericht ${res.r.title}`),
      body: "VORSCHAU – so sieht die Mail an den Beirat aus:\n\n" + mail.text,
      htmlBody: `<p style="background:#fff1c7;padding:8px;font-family:Arial"><strong>VORSCHAU</strong> – so sieht die Mail an den Beirat aus (Empfänger: ${escHtml(beiratEmails().join(", ") || "noch keine eingetragen")})</p>` + mail.html,
      attachments: [res.blob] });
  }
  showResult("Monatsbericht", to ? `Vorschau ${res.r.title} an ${to} gesendet.` : "NOTIFY_EMAIL fehlt – keine Vorschau versendet.");
}

function ensureReportTrigger() {
  const handlers = ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
  if (handlers.indexOf("monthlyReport") === -1) ScriptApp.newTrigger("monthlyReport").timeBased().onMonthDay(1).atHour(8).inTimezone(CONFIG.TIMEZONE).create();
  if (handlers.indexOf("monthlyReportSend") === -1) ScriptApp.newTrigger("monthlyReportSend").timeBased().onMonthDay(1).atHour(CONFIG.REPORT_SEND_HOUR).inTimezone(CONFIG.TIMEZONE).create();
}

/* ==========================================================================
   Hinweise für Bewohner direkt aus dem Cockpit (Blatt „Aktuelles“) – nur Verwaltung
   ========================================================================== */

function requireVerwaltung(user) {
  if (!user || user.role !== "Verwaltung") throw userError("Nur für die Verwaltung.", "staff");
}

/** Letzte Zeile mit Inhalt in den angegebenen Spalten (Kästchen-Spalten zählen nicht). */
function lastContentRow(sheet, cols) {
  const n = sheet.getLastRow();
  if (n < 2) return 1;
  const vals = sheet.getRange(1, 1, n, Math.max.apply(null, cols)).getValues();
  for (let r = n; r > 1; r--) if (cols.some((c) => String(vals[r - 1][c - 1] === undefined ? "" : vals[r - 1][c - 1]).trim() !== "")) return r;
  return 1;
}

/** Aktuelle und geplante Hinweise (für die Liste im Cockpit). */
function adminNewsList() {
  const ymd = (d) => (d instanceof Date ? Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd") : "");
  const today = ymd(new Date());
  return sheetObjects(CONFIG.SHEETS.news)
    .filter((r) => r.Aktiv === true && String(r.Titel || r.Text || "").trim() && (!(r.Bis instanceof Date) || ymd(r.Bis) >= today))
    .map((r) => ({ row: r._row, title: plain(r.Titel, 120), text: plain(r.Text, 1000), important: r.Wichtig === true,
      from: ymd(r.Von), to: ymd(r.Bis), only: String(r["Nur für Aufgang-IDs"] || "") }))
    .slice(-20).reverse();
}

function adminNewsSave(p, user) {
  requireVerwaltung(user);
  const title = str(p.title, 120), text = str(p.text, 1000);
  if (!title && !text) throw userError("Bitte Titel oder Text eingeben");
  const date = (v) => { const d = parseIsoDate(String(v || "")); return d || ""; };
  const from = date(p.from) || new Date(), to = date(p.to);
  if (to && to < new Date(from.getFullYear(), from.getMonth(), from.getDate())) throw userError("„Bis“ liegt vor „Von“");
  const only = (Array.isArray(p.only) ? p.only : []).map(objectId).filter(Boolean).slice(0, 20).join(", ");
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.news.name);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = lastContentRow(sheet, [4, 5]) + 1;
    sheet.getRange(row, 1, 1, 7).setValues([[true, from, to, protectCell(title), protectCell(text), p.important === true, only]]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function adminNewsEnd(p, user) {
  requireVerwaltung(user);
  const row = Number(p.row);
  const hit = sheetObjects(CONFIG.SHEETS.news).find((r) => r._row === row && r.Aktiv === true && plain(r.Titel, 120) === String(p.title || ""));
  if (!hit) throw userError("Hinweis nicht gefunden");
  getSpreadsheet().getSheetByName(CONFIG.SHEETS.news.name).getRange(row, 1).setValue(false);
  return { ok: true };
}

/* ==========================================================================
   Stimmungsbild (anonyme Umfrage) – Verwaltung legt an, Bewohner stimmen in der App ab.
   Gespeichert wird je Stimme nur: Zeit, Umfrage, Antwort, Aufgang und eine Einweg-Kennung
   (SHA-256 aus Umfrage + Zufallswert des Geräts) gegen doppelte Stimmen – kein Name, keine Wohnung.
   ========================================================================== */

function setupPollSheet() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.polls.name);
  if (!sheet) return;
  const box = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange(2, 2, 200, 1).setDataValidation(box);
  sheet.getRange(2, 8, 200, 1).setDataValidation(box);
  sheet.getRange(2, 5, 200, 2).setNumberFormat("dd.MM.yyyy");
}

function pollOptions(v) {
  return String(v || "").split(/\n|\s\|\s/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
}

function pollRows() {
  return sheetObjects(CONFIG.SHEETS.polls).filter((r) => String(r.ID || "").trim() && String(r.Frage || "").trim());
}

function pollCounts(id, n) {
  const counts = Array.from({ length: n }, () => 0);
  const perEntrance = {};
  sheetObjects(CONFIG.SHEETS.votes).forEach((v) => {
    if (String(v["Umfrage-ID"]) !== id) return;
    const i = Number(v.Antwort);
    if (i >= 0 && i < n) {
      counts[i]++;
      const e = entranceName(v["Aufgang-ID"]) || "ohne Aufgang";
      (perEntrance[e] = perEntrance[e] || Array.from({ length: n }, () => 0))[i]++;
    }
  });
  return { counts, total: counts.reduce((a, b) => a + b, 0), perEntrance };
}

function pollIsOpen(r, obj) {
  const ymd = (d) => (d instanceof Date ? Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd") : "");
  const today = ymd(new Date());
  const only = String(r["Nur für Aufgang-IDs"] || "").split(/[,;\s]+/).filter(Boolean);
  return r.Aktiv === true && (!(r.Von instanceof Date) || ymd(r.Von) <= today) && (!(r.Bis instanceof Date) || ymd(r.Bis) >= today)
    && (!only.length || only.indexOf(String(obj || "")) !== -1);
}

/** Für die App (mit „Aktuelles“): offene Umfragen für diesen Aufgang, Ergebnis nur falls freigegeben. */
function residentPolls(obj) {
  return pollRows().filter((r) => pollIsOpen(r, obj)).slice(0, 3).map((r) => {
    const options = pollOptions(r.Antworten);
    const show = r["Ergebnis für Bewohner sichtbar"] === true;
    return { id: String(r.ID), question: plain(r.Frage, 200), options: options.map((o) => plain(o, 80)),
      to: r.Bis instanceof Date ? Utilities.formatDate(r.Bis, CONFIG.TIMEZONE, "yyyy-MM-dd") : "",
      results: show ? pollCounts(String(r.ID), options.length).counts : null };
  });
}

function voterHash(pollId, voter) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, `${pollId}:${voter}:${CONFIG.APP_URL}`);
  return bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Abstimmen (App, mit PIN). Eine Stimme je Gerät und Umfrage. */
function submitVote(p) {
  const id = String(p.pollId || "").trim();
  const voter = String(p.voter || "");
  if (!/^[a-f0-9]{32,64}$/i.test(voter)) throw userError("Abstimmung nicht möglich – bitte App neu laden.");
  const obj = objectId(p.obj);
  const poll = pollRows().find((r) => String(r.ID) === id);
  if (!poll || !pollIsOpen(poll, obj)) throw userError("Diese Umfrage ist beendet.");
  const options = pollOptions(poll.Antworten);
  const choice = Number(p.option);
  if (!Number.isInteger(choice) || choice < 0 || choice >= options.length) throw userError("Bitte eine Antwort wählen.");
  const hash = voterHash(id, voter);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (sheetObjects(CONFIG.SHEETS.votes).some((v) => String(v["Umfrage-ID"]) === id && v["Stimm-Kennung"] === hash)) {
      throw userError("Von diesem Gerät wurde bereits abgestimmt.", "voted");
    }
    const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.votes.name);
    sheet.appendRow([new Date(), id, choice, obj, hash]);
  } finally {
    lock.releaseLock();
  }
  const show = poll["Ergebnis für Bewohner sichtbar"] === true;
  return { ok: true, results: show ? pollCounts(id, options.length).counts : null };
}

/** Cockpit: Umfragen der letzten Zeit mit Ergebnis. */
function adminPollList() {
  const ymd = (d) => (d instanceof Date ? Utilities.formatDate(d, CONFIG.TIMEZONE, "yyyy-MM-dd") : "");
  return pollRows().slice(-10).reverse().map((r) => {
    const options = pollOptions(r.Antworten);
    const c = pollCounts(String(r.ID), options.length);
    return { id: String(r.ID), question: plain(r.Frage, 200), options: options.map((o) => plain(o, 80)), open: pollIsOpen(r, "")
      || (r.Aktiv === true && (!(r.Bis instanceof Date) || ymd(r.Bis) >= ymd(new Date()))),
      to: ymd(r.Bis), only: String(r["Nur für Aufgang-IDs"] || ""), showResults: r["Ergebnis für Bewohner sichtbar"] === true,
      counts: c.counts, total: c.total, perEntrance: c.perEntrance };
  });
}

function adminPollSave(p, user) {
  requireVerwaltung(user);
  const question = str(p.question, 200);
  const options = (Array.isArray(p.options) ? p.options : []).map((o) => str(o, 80)).filter(Boolean).slice(0, 6);
  if (!question) throw userError("Bitte eine Frage eingeben");
  if (options.length < 2) throw userError("Bitte mindestens zwei Antworten eingeben");
  const to = parseIsoDate(String(p.to || ""));
  if (to && to < berlinToday()) throw userError("Das Enddatum liegt in der Vergangenheit");
  const only = (Array.isArray(p.only) ? p.only : []).map(objectId).filter(Boolean).slice(0, 20).join(", ");
  const id = newId("U");
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.polls.name);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const row = lastContentRow(sheet, [1, 3]) + 1;
    sheet.getRange(row, 1, 1, CONFIG.SHEETS.polls.headers.length).setValues([[id, true, protectCell(question),
      options.map(protectCell).join("\n"), new Date(), to || "", only, p.showResults === true, new Date()]]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, id };
}

function adminPollEnd(p, user) {
  requireVerwaltung(user);
  const hit = pollRows().find((r) => String(r.ID) === String(p.id || ""));
  if (!hit) throw userError("Umfrage nicht gefunden");
  getSpreadsheet().getSheetByName(CONFIG.SHEETS.polls.name).getRange(hit._row, 2).setValue(false);
  return { ok: true };
}

/* ==========================================================================
   Tabelle übersichtlich formatieren (Menü + setup) – verändert keine Daten, nur Aussehen,
   Reihenfolge der Blätter, Spaltenbreiten, Farben je Status und ein Startblatt mit Anleitung.
   ========================================================================== */

const SHEET_GROUPS = [
  // [Blattname, Gruppe] – Reihenfolge = Reihenfolge der Reiter
  ["Tickets", "arbeit"], ["Mängel Hausmeister", "arbeit"], ["Aktuelles", "arbeit"], ["Umfragen", "arbeit"],
  ["Reinigungsplan", "arbeit"], ["Übersicht Zähler", "auswertung"], ["Zählerstände", "daten"], ["Reinigung", "daten"],
  ["Mitarbeiter", "einstellung"], ["QR-Orte", "einstellung"], ["Tätigkeiten", "einstellung"],
  ["Auswertung Aufträge", "auswertung"], ["Auswertung Reinigung", "auswertung"], ["Umfrage-Stimmen", "daten"], ["Fitness-Buchungen", "daten"], ["Fehlerprotokoll", "daten"],
];
const GROUP_COLORS = { start: "#151515", arbeit: "#6d7454", auswertung: "#3a6ea5", daten: "#9aa0a6", einstellung: "#b36b00" };
const GROUP_TEXT = {
  arbeit: "Tägliche Arbeit – hier dürfen Sie Einträge ändern (Status, Zuständig, Notizen, Plan, Hinweise).",
  auswertung: "Wird automatisch erstellt – bitte nicht bearbeiten.",
  daten: "Automatisch erfasste Daten (Nachweise, Zählerstände, Stimmen, Fehler) – nur lesen.",
  einstellung: "Einstellungen: Mitarbeiter-Links, QR-Orte, Tätigkeiten.",
};

function columnLetter(n) {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function formatSpreadsheet() {
  const ss = getSpreadsheet();
  const defs = Object.keys(CONFIG.SHEETS).map((k) => CONFIG.SHEETS[k]);
  const WIDE = /Details|Beschreibung|Text|Notiz|Frage|Antworten|Meldung|Persönlicher Link|Ort$|^Ort|Tätigkeit|Anmerkung/;
  const DATETIME = /^(Eingang|Zeit|Zeitpunkt \(Scan\)|Eingang Server|Erledigt am|In Arbeit seit|Erstellt|Reaktion fällig|Erledigung fällig)$/;
  const DATE = /^(Von|Bis|Termin|Ablesedatum|Datum)$/;
  const HIDE = { "Tickets": ["Erledigt-Code"], "Mitarbeiter": ["Token"], "Umfrage-Stimmen": ["Stimm-Kennung"] };
  const REBUILT = ["Übersicht Zähler", "Auswertung Aufträge", "Auswertung Reinigung"]; // werden neu aufgebaut – nur Reiter/Breiten
  const done = [];
  defs.forEach((def) => {
    const sheet = ss.getSheetByName(def.name);
    if (!sheet) return;
    try {
      const n = def.headers.length;
      sheet.setFrozenRows(1);
      if (REBUILT.indexOf(def.name) === -1) {
        sheet.getRange(1, 1, 1, n).setFontWeight("bold").setBackground("#6d7454").setFontColor("#ffffff")
          .setVerticalAlignment("middle").setWrap(true);
        sheet.setRowHeight(1, 36);
      }
      def.headers.forEach((h, i) => {
        const col = i + 1;
        sheet.setColumnWidth(col, WIDE.test(h) ? 260 : /^(ID|Nr|Status|Aktiv|Wichtig|Dringend|Geprüft|Rolle)$/.test(h) ? 100 : 140);
        if (REBUILT.indexOf(def.name) !== -1) return;
        const body = sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1);
        if (DATETIME.test(h)) body.setNumberFormat("dd.MM.yyyy HH:mm");
        else if (DATE.test(h)) body.setNumberFormat("dd.MM.yyyy");
        if (WIDE.test(h)) body.setWrap(true);
        body.setVerticalAlignment("top");
      });
      (HIDE[def.name] || []).forEach((h) => { const c = def.headers.indexOf(h) + 1; if (c) sheet.hideColumns(c); });
      // Zeilen je Status einfärben (offen gelb, in Arbeit blau, erledigt grün)
      const st = def.headers.indexOf("Status") + 1;
      if (st && REBUILT.indexOf(def.name) === -1) {
        const L = columnLetter(st);
        const range = sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), n);
        const rule = (value, color) => SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=$${L}2="${value}"`)
          .setBackground(color).setRanges([range]).build();
        const rules = [rule("offen", "#fff4d6"), rule("in Arbeit", "#e3eefa"), rule("erledigt", "#e8f3e0")];
        const lc = def.headers.indexOf("Langläufer") + 1;
        if (lc) rules.unshift(SpreadsheetApp.newConditionalFormatRule() // Langläufer (nicht erledigt) lila
          .whenFormulaSatisfied(`=AND($${columnLetter(lc)}2="ja",$${L}2<>"erledigt")`).setBackground("#efe7f6").setRanges([range]).build());
        sheet.setConditionalFormatRules(rules);
      }
      const group = (SHEET_GROUPS.find((g) => g[0] === def.name) || [])[1];
      if (group) sheet.setTabColor(GROUP_COLORS[group]);
      done.push(def.name);
    } catch (err) {
      console.warn(`Formatieren ${def.name}:`, err);
    }
  });
  buildStartSheet(ss);
  // Reiter-Reihenfolge: Start, dann Arbeit, Auswertung, Daten, Einstellungen
  try {
    let pos = 1;
    ["Start"].concat(SHEET_GROUPS.map((g) => g[0])).forEach((name) => {
      const sh = ss.getSheetByName(name);
      if (!sh) return;
      ss.setActiveSheet(sh);
      ss.moveActiveSheet(pos++);
    });
    ss.setActiveSheet(ss.getSheetByName("Start"));
  } catch (err) {
    console.warn("Reihenfolge:", err);
  }
  return { formatted: done.length };
}

/** Startblatt: kurze Anleitung und Sprungmarken zu allen Blättern. */
function buildStartSheet(ss) {
  const sheet = ss.getSheetByName("Start") || ss.insertSheet("Start", 0);
  sheet.clear();
  sheet.setTabColor(GROUP_COLORS.start);
  sheet.setHiddenGridlines(true);
  sheet.setColumnWidth(1, 30);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 560);
  const rows = [
    ["", "Mieter-App WEG Wartenberger Dorfkrug", ""],
    ["", "Willbrandt und Kompagnon · Tagesgeschäft", ""],
    ["", "", ""],
    ["", "So arbeiten Sie mit der Tabelle", ""],
    ["", "Menü „Mieter-App“", "Oben in der Menüleiste: Auswertung, Monatsbericht-Vorschau, Kalender, Mitarbeiter-Links, Systemprüfung."],
    ["", "Am Handy", "Im Cockpit der App (Links 007/008) lassen sich Aufträge, Hinweise und Umfragen bequemer bearbeiten."],
    ["", "Bitte nicht", "Spalten löschen, umbenennen oder verschieben – die App liest die Spalten über ihre Überschrift."],
    ["", "", ""],
    ["", "Blätter", ""],
  ];
  const groups = ["arbeit", "auswertung", "daten", "einstellung"];
  const linkRows = [];
  groups.forEach((g) => {
    rows.push(["", GROUP_TEXT[g], ""]);
    SHEET_GROUPS.filter((x) => x[1] === g).forEach(([name]) => {
      const sh = ss.getSheetByName(name);
      if (!sh) return;
      rows.push(["", name, sheetPurpose(name)]);
      linkRows.push({ row: rows.length, gid: sh.getSheetId(), name });
    });
    rows.push(["", "", ""]);
  });
  sheet.getRange(1, 1, rows.length, 3).setValues(rows).setVerticalAlignment("middle").setWrap(true);
  sheet.getRange(1, 2).setFontSize(18).setFontWeight("bold").setFontColor("#6d7454");
  sheet.getRange(2, 2).setFontColor("#5f625a");
  [4, 9].forEach((r) => sheet.getRange(r, 2).setFontSize(13).setFontWeight("bold"));
  sheet.getRange(5, 2, 3, 1).setFontWeight("bold");
  rows.forEach((r, i) => { if (groups.some((g) => GROUP_TEXT[g] === r[1])) sheet.getRange(i + 1, 2, 1, 2).merge().setFontWeight("bold").setBackground("#eef0e6"); });
  linkRows.forEach((l) => {
    sheet.getRange(l.row, 2).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(l.name).setLinkUrl(`#gid=${l.gid}`).build());
  });
}

function sheetPurpose(name) {
  return {
    "Tickets": "Meldungen der Bewohner (Mangel, Klingelschild, Elektroraum) – Status, Zuständig, Notiz.",
    "Mängel Hausmeister": "Vom Hausmeisterdienst gemeldete Mängel.",
    "Aktuelles": "Hinweise auf der Startseite der App (auch im Cockpit anlegbar).",
    "Umfragen": "Stimmungsbilder (auch im Cockpit anlegbar).",
    "Reinigungsplan": "Geplante Reinigungen – werden in den Google-Kalender übertragen.",
    "Übersicht Zähler": "Zählerstände je Wohnung, übersichtlich (wird neu aufgebaut).",
    "Zählerstände": "Alle gemeldeten Zählerstände mit Foto.",
    "Reinigung": "Tätigkeitsnachweise per QR-Scan.",
    "Mitarbeiter": "Persönliche Links (007/008 Verwaltung, 001 Leitung, 010/011 Fitnessraum, 100+ Hausmeister). „Aktiv“ = freigeschaltet.",
    "QR-Orte": "Orte mit QR-Code für die Nachweise.",
    "Tätigkeiten": "Auswahl der Tätigkeiten beim Scannen.",
    "Auswertung Aufträge": "Für Looker Studio – nachts neu berechnet.",
    "Auswertung Reinigung": "Für Looker Studio – nachts neu berechnet.",
    "Umfrage-Stimmen": "Anonyme Stimmen (nur Antwort, Aufgang, Zeit).",
    "Fehlerprotokoll": "Technische Fehler (90 Tage).",
  }[name] || "";
}

function formatSpreadsheetNow() {
  const r = formatSpreadsheet();
  showResult("Tabelle", `${r.formatted} Blätter übersichtlich formatiert. Das Blatt „Start“ erklärt alle Blätter.`);
}

/* ==========================================================================
   Fitnessraum (privat): Buchung, Belegung, Statistik zum gegenseitigen Anfeuern.
   Nur für die Nummern in CONFIG.FITNESS.members (007/008 Verwaltung, 010/011 Rolle „Fitness“).
   Anzeige nur mit Nummern. Eine Buchung zur Zeit.
   ========================================================================== */

function requireFitness(user) {
  if (!user || CONFIG.FITNESS.members.indexOf(String(user.nr)) === -1) throw userError("Kein Zugang zum Fitnessraum.", "staff");
}

/** Hausmeister-Funktionen: nicht für reine Fitness-Zugänge. */
function requireStaffWork(user) {
  if (!user || ["Hausmeister", "Leitung", "Verwaltung"].indexOf(user.role) === -1) throw userError("Kein Zugang zu dieser Funktion.", "staff");
}

function fitnessRows() {
  return sheetObjects(CONFIG.SHEETS.fitness).filter((r) => r.ID && r.Beginn instanceof Date && r.Ende instanceof Date && r.Storniert !== "ja")
    .map((r) => Object.assign(r, { Nr: fitnessNr(r.Nr) }));
}

/** Google Sheets macht aus „010“ gern die Zahl 10 – beim Lesen wieder dreistellig. */
function fitnessNr(v) {
  const s = String(v == null ? "" : v).trim();
  return /^\d{1,2}$/.test(s) ? s.padStart(3, "0") : s;
}

function fitnessWeekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Montag
  return x;
}

/** Übersicht: Belegung (bis 4 Wochen), eigene Buchungen, Statistik je Nummer. */
function fitnessOverview(p, user) {
  requireFitness(user);
  const F = CONFIG.FITNESS;
  const now = new Date();
  const rows = fitnessRows();
  const iso = (d) => d.toISOString();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const until = new Date(today.getTime() + (F.daysAhead + 1) * 86400000);
  const upcoming = rows.filter((r) => r.Ende > now && r.Beginn < until).sort((a, b) => a.Beginn - b.Beginn)
    .map((r) => ({ id: String(r.ID), nr: String(r.Nr), start: iso(r.Beginn), end: iso(r.Ende), mine: String(r.Nr) === user.nr }));
  const mine = rows.filter((r) => String(r.Nr) === user.nr && r.Ende > new Date(now.getTime() - 7 * 86400000)).sort((a, b) => a.Beginn - b.Beginn)
    .map((r) => ({ id: String(r.ID), start: iso(r.Beginn), end: iso(r.Ende), past: r.Beginn < now }));
  // Statistik: vergangene Buchungen zählen als Training
  const done = rows.filter((r) => r.Beginn < now);
  const weekStart = fitnessWeekStart(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const stat = (nr, from) => {
    const list = done.filter((r) => String(r.Nr) === nr && r.Beginn >= from);
    return { count: list.length, minutes: list.reduce((a, r) => a + Math.round((r.Ende - r.Beginn) / 60000), 0) };
  };
  const streak = (nr) => { // Wochen in Folge mit mind. einem Training (laufende Woche zählt, wenn schon trainiert)
    let n = 0;
    let ws = fitnessWeekStart(now);
    const has = (a, b) => done.some((r) => String(r.Nr) === nr && r.Beginn >= a && r.Beginn < b);
    if (!has(ws, new Date(ws.getTime() + 7 * 86400000))) ws = new Date(ws.getTime() - 7 * 86400000);
    while (n < 104 && has(ws, new Date(ws.getTime() + 7 * 86400000))) { n++; ws = new Date(ws.getTime() - 7 * 86400000); }
    return n;
  };
  const members = F.members.map((nr) => ({ nr, week: stat(nr, weekStart), month: stat(nr, monthStart), year: stat(nr, yearStart), streak: streak(nr) }));
  return { ok: true, me: user.nr, upcoming, mine, members, weeklyGoal: F.weeklyGoal,
    rules: { fromHour: F.fromHour, toHour: F.toHour, minMinutes: F.minMinutes, maxMinutes: F.maxMinutes, stepMinutes: F.stepMinutes, daysAhead: F.daysAhead } };
}

function fitnessBook(p, user) {
  requireFitness(user);
  const F = CONFIG.FITNESS;
  const d = parseIsoDate(String(p.date || ""));
  const tm = /^(\d{2}):(\d{2})$/.exec(String(p.time || ""));
  const minutes = Number(p.minutes);
  if (!d || !tm) throw userError("Bitte Tag und Uhrzeit wählen.");
  const h = Number(tm[1]), mi = Number(tm[2]);
  if (mi % F.stepMinutes !== 0 || !Number.isInteger(minutes) || minutes < F.minMinutes || minutes > F.maxMinutes || minutes % F.stepMinutes !== 0) {
    throw userError(`Dauer ${F.minMinutes}–${F.maxMinutes} Minuten in ${F.stepMinutes}-Minuten-Schritten.`);
  }
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi);
  const end = new Date(start.getTime() + minutes * 60000);
  const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), F.toHour, 0);
  if (h < F.fromHour || end > dayEnd) throw userError(`Buchbar von ${F.fromHour} bis ${F.toHour} Uhr.`);
  const now = new Date();
  if (end <= now) throw userError("Dieser Zeitraum liegt in der Vergangenheit.");
  if (start > new Date(now.getTime() + F.daysAhead * 86400000)) throw userError(`Höchstens ${F.daysAhead} Tage im Voraus.`);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const rows = fitnessRows();
    if (rows.filter((r) => String(r.Nr) === user.nr && r.Beginn > now).length >= F.maxFuture) throw userError(`Höchstens ${F.maxFuture} offene Buchungen je Person.`);
    const clash = rows.find((r) => r.Beginn < end && r.Ende > start);
    if (clash) {
      const t = (x) => Utilities.formatDate(x, CONFIG.TIMEZONE, "HH:mm");
      throw userError(`Schon belegt von ${t(clash.Beginn)} bis ${t(clash.Ende)} Uhr (Nr. ${clash.Nr}).`);
    }
    const id = newId("F");
    const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.fitness.name);
    const row = lastContentRow(sheet, [1]) + 1;
    sheet.getRange(row, 2).setNumberFormat("@"); // „010“ bleibt „010“
    sheet.getRange(row, 1, 1, CONFIG.SHEETS.fitness.headers.length)
      .setValues([[id, user.nr, start, end, minutes, now, ""]]);
    return { ok: true, id };
  } finally {
    lock.releaseLock();
  }
}

/** Eigene Buchung stornieren (auch nachträglich bis 7 Tage, z. B. „nicht stattgefunden“); Verwaltung darf jede. */
function fitnessCancel(p, user) {
  requireFitness(user);
  const hit = fitnessRows().find((r) => String(r.ID) === String(p.id || ""));
  if (!hit || (String(hit.Nr) !== user.nr && user.role !== "Verwaltung")) throw userError("Buchung nicht gefunden.");
  if (hit.Beginn < new Date(Date.now() - 7 * 86400000)) throw userError("Ältere Buchungen können nicht mehr storniert werden.");
  const def = CONFIG.SHEETS.fitness;
  getSpreadsheet().getSheetByName(def.name).getRange(hit._row, def.headers.indexOf("Storniert") + 1).setValue("ja");
  return { ok: true };
}

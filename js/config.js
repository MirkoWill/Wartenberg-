/**
 * Zentrale Konfiguration der Mieter-App.
 *
 * Aufbau in drei Ebenen – spätere Ebenen überschreiben frühere:
 *   SITE (ganze Wohnanlage)  →  Haus (overrides)  →  Aufgang (overrides)
 *
 * Der Aufgang wird über den URL-Parameter ?obj=<aufgang-id> gewählt,
 * z. B. index.html?obj=lind6 (dieser Link steckt im QR-Code am Aushang).
 * Ohne Parameter zeigt die App eine Auswahl der Aufgänge.
 *
 * WICHTIG: Alle mit "TODO" markierten Werte sind Platzhalter und müssen
 * vor dem Livegang durch echte Daten ersetzt werden.
 */
window.APP_CONFIG = {
  // URL der veröffentlichten Google-Apps-Script-Web-App (endet auf /exec).
  // Leer lassen = Demo-Modus: Formulare werden nur simuliert (Konsole).
  API_URL: "", // TODO nach Einrichtung von backend/Code.gs eintragen

  // Basis-URL der transport.rest-Instanz (VBB = Berlin/Brandenburg).
  TRANSIT_API: "https://v6.vbb.transport.rest",
  TRANSIT_REFRESH_SECONDS: 60,
  TRANSIT_RESULTS: 10,

  // Max. Kantenlänge (px) für Fotos, bevor sie Base64-kodiert werden.
  PHOTO_MAX_SIZE: 1600,
  PHOTO_QUALITY: 0.8,

  // Anbieter der App (erscheint im Footer).
  PROVIDER: { name: "Willbrandt und Kompagnon", url: "https://www.willbrandt-kompagnon.de" },

  /* ------------------------------------------------------------------
     Gilt für die ganze Wohnanlage
     ------------------------------------------------------------------ */
  SITE: {
    name: "WEG Wartenberger Dorfkrug",
    mainWaterValve: "Ort bitte bei der Hausverwaltung erfragen",

    // Notfall-Dashboard (US 1.1)
    // Notfälle (Rohrbruch, Heizungsausfall …) laufen über den Hausmeister.
    emergencyContacts: [
      { label: "Hausmeister", sub: "Notfälle: Wasser, Heizung, Strom", phone: "+4930000000001", icon: "🧰" }, // TODO Telefonnummer
      { label: "Willbrandt und Kompagnon", sub: "Hausverwaltung · 030 99270747", phone: "+493099270747", icon: "🏢" },
      { label: "Schlüsseldienst Günther", sub: "Schlossmontage J. Günther GmbH · Mo, Mi, Fr 8–18 · Di, Do 8–16 Uhr", phone: "+49304237223", icon: "🔑" }, // Nummer laut Branchenverzeichnis – bitte prüfen
      { label: "Feuerwehr / Rettung", sub: "Lebensgefahr", phone: "112", icon: "🚒", danger: true },
      { label: "Polizei", sub: "Notruf", phone: "110", icon: "🚓", danger: true },
    ],
    emergencyRules: [
      {
        title: "Rohrbruch / Wasserschaden",
        // {mainWaterValve} wird durch den Wert des jeweiligen Hauses ersetzt.
        text: "Hauptwasserhahn schließen: {mainWaterValve}. Danach den Hausmeister anrufen.",
      },
      {
        title: "Stromausfall",
        text: "Sicherungskasten Ihrer Wohnung prüfen (Flur). Ist das ganze Haus betroffen, bitte den Hausmeister informieren.",
      },
      {
        title: "Gasgeruch",
        text: "Keine Schalter betätigen, kein offenes Feuer. Fenster öffnen, Haus verlassen, von draußen 112 anrufen.",
      },
    ],

    // Abfall- & Hauskalender (US 1.2) – öffentliche iCal-Adresse des Google Kalenders.
    // Google Kalender → Einstellungen → "Öffentliche Adresse im iCal-Format".
    calendarIcsUrl: "https://calendar.google.com/calendar/ical/TODO%40group.calendar.google.com/public/basic.ics", // TODO
    calendarWebUrl: "", // optional: Link zur Web-Ansicht des Kalenders

    // Live-ÖPNV (US 1.3) – Bus 256, 893, N56.
    // Ohne "id" sucht die App die Haltestelle beim ersten Aufruf über "query" und merkt sich die ID.
    // Die gefundene ID steht in der Browser-Konsole und kann hier als id: "900…" fest eingetragen werden.
    transitStop: {
      name: "Dorfstr./Lindenberger Str.",
      query: "Dorfstr./Lindenberger Str. (Berlin)",
      match: "dorfstr./lindenberger",
    },

    // Kiez-Guide & Dokumente (US 1.4)
    documents: [
      { label: "Hausordnung", sub: "PDF", url: "https://drive.google.com/TODO", icon: "📄" }, // TODO
      { label: "Mülltrennung", sub: "PDF", url: "https://drive.google.com/TODO", icon: "♻️" }, // TODO
      { label: "Visitenkarte Willbrandt und Kompagnon", sub: "Kontakt speichern (.vcf)", url: "assets/hausverwaltung.vcf", icon: "👤" },
    ],
    kiezTips: [
      { title: "Supermarkt", text: "TODO – Name, Adresse, Öffnungszeiten" },
      { title: "Hausarzt", text: "TODO – Praxis, Telefon" },
      { title: "Paketshop", text: "TODO – Adresse" },
    ],
    pharmacyIframeUrl: "https://www.aponet.de/apotheke/notdienstsuche",

    // Stromzähler per WhatsApp (US 2.2) – internationales Format ohne "+" und ohne Leerzeichen.
    whatsappNumber: "493099270747",

    // Auswahl im Wasserzähler-Formular (US 2.1)
    waterRooms: ["Bad", "Küche", "Gäste-WC", "Sonstiges"],
  },

  /* ------------------------------------------------------------------
     3 Häuser mit insgesamt 5 Aufgängen
     Die Aufgang-ID gehört in den QR-Code am jeweiligen Eingang: ?obj=lind6
     "overrides" darf jedes Feld aus SITE überschreiben.
     ------------------------------------------------------------------ */
  HOUSES: [
    {
      id: "haus1",
      name: "Haus 1",
      address: "Dorfstr. 27, 13059 Berlin",
      overrides: { mainWaterValve: "TODO Ort im Keller" }, // TODO
      entrances: [
        { id: "dorf27", name: "Dorfstr. 27" },
      ],
    },
    {
      id: "haus2",
      name: "Haus 2",
      address: "Lindenberger Str. 2 und 4, 13059 Berlin",
      overrides: { mainWaterValve: "TODO Ort im Keller" }, // TODO
      entrances: [
        { id: "lind2", name: "Lindenberger Str. 2" },
        { id: "lind4", name: "Lindenberger Str. 4" },
      ],
    },
    {
      id: "haus3",
      name: "Haus 3",
      address: "Lindenberger Str. 6 und 8, 13059 Berlin",
      overrides: { mainWaterValve: "TODO Ort im Keller" }, // TODO
      entrances: [
        { id: "lind6", name: "Lindenberger Str. 6" },
        { id: "lind8", name: "Lindenberger Str. 8" },
      ],
    },
  ],
};

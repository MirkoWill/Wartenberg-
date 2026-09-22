/**
 * Zentrale Konfiguration der Mieter-App.
 *
 * Aufbau in drei Ebenen – spätere Ebenen überschreiben frühere:
 *   SITE (ganze Wohnanlage)  →  Haus (overrides)  →  Aufgang (overrides)
 *
 * Der Aufgang wird über den URL-Parameter ?obj=<aufgang-id> gewählt,
 * z. B. index.html?obj=h1-a (dieser Link steckt im QR-Code am Aushang).
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
    emergencyContacts: [
      { label: "Hausverwaltung", sub: "Mo–Fr 8–17 Uhr", phone: "+4930000000000", icon: "🏢" }, // TODO
      { label: "Havarie-Notdienst", sub: "24/7 – Wasser, Heizung, Strom", phone: "+4930000000001", icon: "🚨" }, // TODO
      { label: "Schlüsseldienst", sub: "Festpreis 89 € (tagsüber)", phone: "+4930000000002", icon: "🔑" }, // TODO
      { label: "Feuerwehr / Rettung", sub: "Lebensgefahr", phone: "112", icon: "🚒", danger: true },
      { label: "Polizei", sub: "Notruf", phone: "110", icon: "🚓", danger: true },
    ],
    emergencyRules: [
      {
        title: "Rohrbruch / Wasserschaden",
        // {mainWaterValve} wird durch den Wert des jeweiligen Hauses ersetzt.
        text: "Hauptwasserhahn schließen: {mainWaterValve}. Danach Havarie-Notdienst anrufen.",
      },
      {
        title: "Stromausfall",
        text: "Sicherungskasten Ihrer Wohnung prüfen (Flur). Ist das ganze Haus betroffen, bitte Hausverwaltung informieren.",
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

    // Live-ÖPNV (US 1.3) – Haltestellen-ID aus transport.rest.
    // Ermitteln: https://v6.vbb.transport.rest/locations?query=S%20Wartenberg
    transitStop: { id: "900100003", name: "S+U Alexanderplatz (Demo – TODO)" }, // TODO

    // Kiez-Guide & Dokumente (US 1.4)
    documents: [
      { label: "Hausordnung", sub: "PDF", url: "https://drive.google.com/TODO", icon: "📄" }, // TODO
      { label: "Mülltrennung", sub: "PDF", url: "https://drive.google.com/TODO", icon: "♻️" }, // TODO
      { label: "Visitenkarte Hausverwaltung", sub: "Kontakt speichern (.vcf)", url: "assets/hausverwaltung.vcf", icon: "👤" },
    ],
    kiezTips: [
      { title: "Supermarkt", text: "TODO – Name, Adresse, Öffnungszeiten" },
      { title: "Hausarzt", text: "TODO – Praxis, Telefon" },
      { title: "Paketshop", text: "TODO – Adresse" },
    ],
    pharmacyIframeUrl: "https://www.aponet.de/apotheke/notdienstsuche",

    // Stromzähler per WhatsApp (US 2.2) – internationales Format ohne "+" und ohne Leerzeichen.
    whatsappNumber: "49170XXXXXXX", // TODO

    // Auswahl im Wasserzähler-Formular (US 2.1)
    waterRooms: ["Bad", "Küche", "Gäste-WC", "Sonstiges"],
  },

  /* ------------------------------------------------------------------
     3 Häuser mit insgesamt 5 Aufgängen
     Die Aufgang-ID (z. B. "h1-a") gehört in den QR-Code: ?obj=h1-a
     "overrides" darf jedes Feld aus SITE überschreiben.
     ------------------------------------------------------------------ */
  HOUSES: [
    {
      id: "h1",
      name: "Haus 1",               // TODO echter Name / Hausnummer
      address: "TODO Straße 1",     // TODO
      overrides: {
        mainWaterValve: "Keller Haus 1, Raum TODO, rechts neben der Tür (blaues Handrad)", // TODO
      },
      entrances: [
        { id: "h1-a", name: "Aufgang A" }, // TODO
        { id: "h1-b", name: "Aufgang B" }, // TODO
      ],
    },
    {
      id: "h2",
      name: "Haus 2",
      address: "TODO Straße 2",
      overrides: { mainWaterValve: "TODO" },
      entrances: [
        { id: "h2-a", name: "Aufgang A" },
        { id: "h2-b", name: "Aufgang B" },
      ],
    },
    {
      id: "h3",
      name: "Haus 3",
      address: "TODO Straße 3",
      overrides: { mainWaterValve: "TODO" },
      entrances: [
        { id: "h3-a", name: "Aufgang A" },
      ],
    },
  ],
};

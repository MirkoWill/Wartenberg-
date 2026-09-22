/**
 * Zentrale Konfiguration der Mieter-App.
 *
 * Alles, was sich pro Wohnanlage/Haus unterscheidet, steht hier.
 * Das Haus wird über den URL-Parameter ?obj=<schluessel> gewählt,
 * z. B. index.html?obj=haus12 (dieser Link steckt im QR-Code am Aushang).
 *
 * WICHTIG: Alle mit "TODO" markierten Werte sind Platzhalter und müssen
 * vor dem Livegang durch echte Daten ersetzt werden.
 */
window.APP_CONFIG = {
  // URL der veröffentlichten Google-Apps-Script-Web-App (endet auf /exec).
  // Leer lassen = Demo-Modus: Formulare werden nur simuliert (Konsole).
  API_URL: "", // TODO

  // Basis-URL der transport.rest-Instanz (VBB = Berlin/Brandenburg).
  TRANSIT_API: "https://v6.vbb.transport.rest",
  TRANSIT_REFRESH_SECONDS: 60,
  TRANSIT_RESULTS: 10,

  // Max. Kantenlänge (px) für Fotos, bevor sie Base64-kodiert werden.
  PHOTO_MAX_SIZE: 1600,
  PHOTO_QUALITY: 0.8,

  // Wird genutzt, wenn ?obj= fehlt oder unbekannt ist.
  DEFAULT_OBJECT: "dorfkrug",

  OBJECTS: {
    dorfkrug: {
      name: "WEG Dorfkrug Wartenberg",
      address: "TODO Straße 1, 13059 Berlin",

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
          text: "Hauptwasserhahn schließen: Keller, Raum K-03, rechts neben der Tür (blaues Handrad). Danach Havarie-Notdienst anrufen.", // TODO
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

    // Beispiel für ein weiteres Haus – per ?obj=haus12 erreichbar.
    // Nicht gesetzte Felder werden vom DEFAULT_OBJECT übernommen.
    haus12: {
      name: "Haus 12",
    },
  },
};

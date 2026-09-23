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
  API_URL: "https://script.google.com/macros/s/AKfycbzhN3ZvHKkXgBEyHddQNgCMd7rGNDpnvLdrS82Q8XO-MC8r4UFhDQnJWVnGtTygYcrd/exec",

  // Zugangs-PIN (steht auf den Aushängen). Hier nur als SHA-256-Prüfsumme; geprüft wird sie
  // zusätzlich im Backend (Script-Eigenschaft APP_PIN). PIN ändern: beide Stellen anpassen,
  // Prüfsumme z. B. mit: printf '12345' | sha256sum
  PIN_SHA256: "0a8d9ad647b7466f586c6e9083a079605fdf1b2d7aca69b3c8f6ea6583d41c96",
  PIN_MAX_TRIES: 3,
  PIN_LOCK_MINUTES: 15,

  // transport.rest-Dienste für Abfahrten, werden der Reihe nach versucht (kostenlos, ohne Gewähr).
  TRANSIT_APIS: [
    "https://v6.bvg.transport.rest",
    "https://v6.vbb.transport.rest",
    "https://v6.db.transport.rest",
  ],
  TRANSIT_TIMEOUT_SECONDS: 12,
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

    // Notfall-Dashboard (US 1.1)
    // Notfälle (Rohrbruch, Heizungsausfall …) laufen über den Hausmeister.
    emergencyContacts: [
      { label: "Hausmeister-Notdienst", sub: "GS Schreier · 0179 4073564 · Wasser, Heizung, Strom", phone: "+491794073564", icon: "🧰" },
      { label: "Willbrandt und Kompagnon", sub: "Hausverwaltung · 030 99270747", phone: "+493099270747", icon: "🏢" },
      { label: "Schlüsseldienst Günther", sub: "Schlossmontage J. Günther GmbH · Mo, Mi, Fr 8–18 · Di, Do 8–16 Uhr", phone: "+49304237223", icon: "🔑" }, // Nummer laut Branchenverzeichnis – bitte prüfen
      { label: "GASAG-Entstörungsdienst", sub: "Gasgeruch, Störung der Gasversorgung · 030 787272", phone: "+4930787272", icon: "🔥" },
      { label: "Stromnetz Berlin – Störungsdienst", sub: "Stromausfall im Haus oder in der Straße · 0800 2112525", phone: "+498002112525", icon: "⚡️" },
      { label: "Feuerwehr / Rettung", sub: "Lebensgefahr", phone: "112", icon: "🚒", danger: true },
      { label: "Polizei", sub: "Notruf", phone: "110", icon: "🚓", danger: true },
    ],
    emergencyRules: [
      {
        title: "Rohrbruch / Wasserschaden",
        text: "Bitte sofort den Hausmeister-Notdienst anrufen und die Hausverwaltung per WhatsApp informieren. "
          + "Den Hauptwasserhahn bitte nicht selbst suchen – der Zugang ist nur dem Hausmeister möglich. "
          + "Bis Hilfe eintrifft: Elektrogeräte in der Nähe des Wassers nicht berühren und Wertsachen in Sicherheit bringen.",
        // Direkt-Buttons unter dem Text ({label} = Adresse des Aufgangs)
        actions: [
          { type: "tel", label: "Hausmeister-Notdienst anrufen", phone: "+491794073564" },
          { type: "whatsapp", label: "Hausverwaltung per WhatsApp", text: "Wasserschaden / Rohrbruch in {label}, Wohnung: " },
        ],
        // Anleitung: Wasser in der eigenen Wohnung abstellen (mit Grafik Hebel/Hahn)
        guide: {
          title: "Wasser in Ihrer Wohnung abstellen",
          figure: "valves",
          steps: [
            { label: "Bad:", text: "Die Absperrhähne sitzen direkt neben den Wasserzählern, oft hinter einer Revisionsklappe." },
            { label: "Küche:", text: "Unter der Spüle bei den Wasserzählern – meist mit Hebel." },
            { label: "Schließen:", text: "Kalt und warm schließen. Drehgriff im Uhrzeigersinn zudrehen, Hebel quer zum Rohr stellen. Nicht mit Gewalt drehen." },
            { label: "Heizungswasser?", text: "Tritt Wasser an Heizkörper oder Heizungsrohr aus: Hebel am Heizungszulauf im Kasten im Flur quer stellen." },
            { label: "Strom:", text: "Steht Wasser bei Steckdosen oder Geräten, die Sicherung im Sicherungskasten ausschalten." },
            { label: "Wasser von oben?", text: "Dann hilft Ihr Hahn nicht – sofort den Hausmeister-Notdienst anrufen und beim Nachbarn klingeln." },
          ],
        },
      },
      {
        title: "Stromausfall",
        text: "Sicherungskasten Ihrer Wohnung prüfen (Flur). Ist das ganze Haus betroffen, bitte den Hausmeister informieren.",
        actions: [{ type: "tel", label: "Stromnetz Berlin anrufen", phone: "+498002112525" }],
      },
      {
        title: "Gasgeruch",
        text: "Keine Schalter betätigen, kein offenes Feuer. Fenster öffnen, Haus verlassen, von draußen 112 anrufen.",
        actions: [
          { type: "tel", label: "Feuerwehr 112 anrufen", phone: "112" },
          { type: "tel", label: "GASAG-Entstörungsdienst anrufen", phone: "+4930787272" },
        ],
      },
    ],

    // Wiederkehrende Hinweise unter „Aktuelles“ (ohne Eintrag in der Tabelle).
    // weekday: 0 = Sonntag, 1 = Montag … 3 = Mittwoch (Berliner Zeit).
    recurringNotices: [
      {
        weekday: 2,
        title: "Morgen Treppenhausreinigung",
        text: "Mittwoch ist Reinigungstag (D. Schreier Gebäudeservice). Bitte Läufer, Schuhe und Kinderwagen "
          + "bis morgen früh aus dem Treppenhaus entfernen.",
      },
      {
        weekday: 3,
        important: true,
        title: "Heute Treppenhausreinigung",
        text: "Mittwoch ist Reinigungstag (D. Schreier Gebäudeservice). Bitte Läufer, Schuhe und Kinderwagen "
          + "aus dem Treppenhaus entfernen. Achtung: erhöhte Rutschgefahr!",
      },
    ],

    // Live-ÖPNV (US 1.3) – Bus 256, 893, N56.
    // Ohne "id" sucht die App die Haltestelle beim ersten Aufruf über "query" und merkt sich die ID.
    // Die gefundene ID steht in der Browser-Konsole und kann hier als id: "900…" fest eingetragen werden.
    transitStop: {
      name: "Dorfstr./Lindenberger Str.",
      query: "Dorfstr./Lindenberger Str. (Berlin)",
      match: "dorfstr./lindenberger",
      infoUrl: "https://www.bvg.de/en/connections/station-overview/dorfstr-lindenberger-str",
    },

    // Abfall (US 1.2) – Termine der BSR für die Wohnanlage.
    // Neue Termine: .ics bei bsr.de herunterladen und die Datei in assets/ ersetzen.
    waste: {
      icsUrl: "assets/abfuhrkalender-2026.ics",
      pdfUrl: "assets/abfuhrkalender-2026.pdf",
      bulkyUrl: "https://www.bsr.de/sperrmuell-abholung-buchen",
      sortingUrl: "https://www.bsr.de/abfallarten",
      // Zuordnung Kalendereintrag → Anzeige (Stichwort im SUMMARY der .ics)
      types: [
        { match: "Hausmüll", label: "Hausmüll", bin: "graue Tonne", color: "#5b6770" },
        { match: "Biogut", label: "Biogut", bin: "braune Tonne", color: "#7a3b2e" },
        { match: "Wertstoffe", label: "Wertstoffe", bin: "gelbe Tonne", color: "#f2c200" },
      ],
    },

    // Mülltrennung (Kurzfassung, maßgeblich sind die Angaben der BSR)
    wasteGuide: [
      {
        title: "Wertstofftonne (gelb)",
        yes: "Verpackungen aus Kunststoff, Metall und Verbundstoff: Joghurtbecher, Folien, Konservendosen, Getränkekartons, Alufolie. In Berlin auch Gegenstände aus Kunststoff oder Metall, die keine Verpackung sind, z. B. Plastikspielzeug, Kochtöpfe, Werkzeug.",
        no: "Elektrogeräte, Batterien, Papier, Glas, Essensreste.",
        tip: "Verpackungen nur löffelrein entleeren, nicht ausspülen. Deckel und Becher getrennt einwerfen.",
      },
      {
        title: "Biogut (braune Tonne)",
        yes: "Obst- und Gemüsereste, Speisereste (auch gekocht), Kaffeesatz und Filter, Teebeutel, Eierschalen, Schnittblumen.",
        no: "Plastiktüten – auch keine „kompostierbaren“ Bioplastikbeutel –, Katzenstreu, Windeln, Asche.",
        tip: "Zum Einwickeln Zeitungspapier oder Papiertüten verwenden.",
      },
      {
        title: "Papier (blaue Tonne)",
        yes: "Zeitungen, Zeitschriften, Kartons (flach gefaltet), Papiertüten, Schreibpapier.",
        no: "Verschmutztes oder beschichtetes Papier, Kassenbons, Tapeten, Fotos, Getränkekartons (→ Wertstoffe).",
      },
      {
        title: "Glas (Glascontainer)",
        yes: "Flaschen und Gläser, getrennt nach Weiß, Braun und Grün. Andere Farben zu Grün.",
        no: "Trinkgläser, Porzellan, Keramik, Fensterglas, Spiegel, Glühbirnen. Deckel gehören in die Wertstofftonne.",
        tip: "Bitte nur werktags zwischen 7 und 20 Uhr einwerfen.",
      },
      {
        title: "Hausmüll (graue Tonne)",
        yes: "Hygieneartikel, Windeln, Staubsaugerbeutel, Kehricht, Zigarettenkippen, Katzenstreu, kleine Mengen Porzellan und Keramik.",
        no: "Wertstoffe, Bioabfall, Elektrogeräte, Batterien, Farben und andere Schadstoffe.",
      },
      {
        title: "Sonderfälle",
        yes: "Elektrogeräte und Batterien: Rückgabe im Handel oder auf dem BSR-Recyclinghof. Farben, Lacke, Chemikalien: Schadstoffsammelstelle der BSR. Möbel und große Gegenstände: Sperrmüll (siehe oben).",
      },
    ],

    // Hausordnung als eigene Seite (#hausordnung), Text direkt in index.html.

    // Kiez-Guide (US 1.4)
    kiez: [
      {
        group: "Supermärkte",
        icon: "🛒",
        places: [
          { name: "ALDI Nord", address: "Dorfstraße 22, 13059 Berlin", note: "mit DHL Packstation 508" },
          { name: "REWE", address: "Ernst-Barlach-Straße 19, 13059 Berlin" },
          { name: "Penny", address: "Rostocker Str. 1, 13059 Berlin" },
        ],
      },
      {
        group: "Apotheke",
        icon: "💊",
        places: [
          { name: "Amsel-Apotheke", address: "Rostocker Str. 15, 13059 Berlin" },
        ],
      },
      {
        group: "Pakete",
        icon: "📦",
        places: [
          { name: "Fair Kauf", address: "Dorfstraße 25, 13059 Berlin", note: "Paketshop" },
          { name: "DHL Packstation 508", address: "Dorfstraße 22, 13059 Berlin", note: "bei ALDI Nord" },
        ],
      },
    ],

    // Dokumente zum Herunterladen
    documents: [
      { label: "Abfuhrkalender 2026", sub: "PDF der BSR", url: "assets/abfuhrkalender-2026.pdf", icon: "🗓️" },
      { label: "Visitenkarte Willbrandt und Kompagnon", sub: "Kontakt speichern (.vcf)", url: "assets/hausverwaltung.vcf", icon: "👤" },
    ],

    // Apotheken-Notdienst, Postleitzahl 13059 vorausgewählt
    pharmacyUrl: "https://www.aponet.de/notdienstsuche/13059-Berlin",

    // Stromzähler per WhatsApp (US 2.2) – internationales Format ohne "+" und ohne Leerzeichen.
    whatsappNumber: "493099270747",

    // Auswahl im Wasserzähler-Formular (US 2.1)
    waterRooms: ["Bad", "Küche", "Gäste-WC", "Flur", "Sonstiges"],
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
      address: "Dorfstr. 24, 13059 Berlin",
      overrides: {},
      entrances: [
        { id: "dorf24", name: "Dorfstr. 24" },
      ],
    },
    {
      id: "haus2",
      name: "Haus 2",
      address: "Lindenberger Str. 2 und 4, 13059 Berlin",
      overrides: {},
      entrances: [
        { id: "lind2", name: "Lindenberger Str. 2" },
        { id: "lind4", name: "Lindenberger Str. 4" },
      ],
    },
    {
      id: "haus3",
      name: "Haus 3",
      address: "Lindenberger Str. 6 und 8, 13059 Berlin",
      overrides: {},
      entrances: [
        { id: "lind6", name: "Lindenberger Str. 6" },
        { id: "lind8", name: "Lindenberger Str. 8" },
      ],
    },
  ],
};

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

  // Zugangs-PIN: steht bewusst NICHT in der App (auch nicht als Prüfsumme – eine kurze PIN wäre daraus
  // in Millisekunden zu errechnen). Geprüft wird nur im Backend; ändern im Tabellen-Menü „Zugangs-PIN ändern …“.
  PIN_MAX_TRIES: 3,
  PIN_LOCK_MINUTES: 15,

  // Wetter auf der Startseite: eigene Hinweise ab dieser Höchst- bzw. Tiefsttemperatur (°C) in den nächsten 3 Tagen.
  // Amtliche Warnungen des Deutschen Wetterdienstes werden zusätzlich immer angezeigt.
  WEATHER: { hot: 30, cold: -10 },

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
    // Reihenfolge nach Dringlichkeit. level: "danger" = Lebensgefahr (rot), "urgent" = dringende Störung (orange),
    // ohne level = normale Kontakte.
    emergencyContacts: [
      { label: "Hausmeister-Notdienst", sub: "GS Schreier · 0179 4073564 · Wasser, Heizung, Strom", phone: "+491794073564", icon: "🧰", level: "urgent" },
      { label: "Feuerwehr / Rettung", sub: "Lebensgefahr", phone: "112", icon: "🚒", level: "danger" },
      { label: "Polizei", sub: "Notruf", phone: "110", icon: "🚓", level: "danger" },
      { label: "GASAG-Entstörungsdienst", sub: "Gasgeruch, Störung der Gasversorgung · 030 787272", phone: "+4930787272", icon: "⚠️", level: "danger" },
      { label: "Stromnetz Berlin – Störungsdienst", sub: "Stromausfall im Haus oder in der Straße · 0800 2112525", phone: "+498002112525", icon: "⚡️", level: "urgent" },
      { label: "Willbrandt und Kompagnon", sub: "Hausverwaltung · 030 99270747", phone: "+493099270747", icon: "🏢" },
      { label: "Schlüsseldienst Günther", sub: "Schlossmontage J. Günther GmbH · Mo, Mi, Fr 8–18 · Di, Do 8–16 Uhr", phone: "+49304237223", icon: "🔑" }, // Nummer laut Branchenverzeichnis – bitte prüfen
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
            { label: "Bad:", text: "Die Absperrhähne sitzen direkt neben den Wasserzählern." },
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
        text: "Nur Ihre Wohnung ohne Strom: Sicherungskasten im Flur prüfen. Ganzes Haus ohne Strom: Hausmeister-Notdienst anrufen. "
          + "Auch die Nachbarhäuser oder die Straße dunkel: Stromnetz Berlin anrufen.",
        actions: [
          { type: "tel", label: "Hausmeister-Notdienst anrufen", phone: "+491794073564" },
          { type: "tel", label: "Stromnetz Berlin anrufen", phone: "+498002112525" },
        ],
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

    // Abfahrten (US 1.3): Haltestelle, Linien und Link zur offiziellen Live-Anzeige der BVG.
    transitStop: {
      name: "Dorfstr./Lindenberger Str.",
      infoUrl: "https://www.bvg.de/en/connections/station-overview/dorfstr-lindenberger-str",
      lines: ["Bus 256", "Bus 893", "Nachtbus N56"],
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
        id: "apotheke",
        icon: "💊",
        places: [
          { name: "Amsel-Apotheke", address: "Rostocker Str. 15, 13059 Berlin" },
        ],
        // Link unter der Gruppe (Apotheken-Notdienst, PLZ 13059 vorausgewählt)
        links: [{ label: "Apotheken-Notdienst in der Nähe (aponet.de)", url: "https://www.aponet.de/notdienstsuche/13059-Berlin" }],
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
      { label: "Visitenkarte Willbrandt und Kompagnon", sub: "Kontakt speichern (.vcf)", url: "assets/hausverwaltung.vcf", icon: "👤" },
    ],


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

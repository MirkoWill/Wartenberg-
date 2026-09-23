# Wartenberg – Mieter-App (PWA)

Mieter-App für die WEG Wartenberger Dorfkrug. Reines Frontend (HTML, CSS, Vanilla JS) für **GitHub Pages**,
Backend über **Google Apps Script + Google Sheets**. Betriebskosten: 0 €.

Stand: **Epic 1 (Information & Sicherheit)** und **Epic 2 (Formulare & Services)** für Mieter, inkl.
fertigem Google-Apps-Script-Backend. Das Hausmeister-Portal (Epic 3) ist im Backend vorbereitet, das Frontend folgt.

Design angelehnt an willbrandt-kompagnon.de: Oliv `#6d7454`, Hellgrün `#e3f2b3` auf Dunkel,
Hintergrund `#f8f8f8`, Schriften Playfair Display / Source Sans 3 / Oswald (lokal in `fonts/`,
SIL Open Font License, keine Verbindung zu Google), mit automatischem Dark Mode.

## Funktionen

| Story | Ansicht | Umsetzung |
|---|---|---|
| US 1.1 Notfall-Dashboard | `#notfall` | Klickbare `tel:`-Links, aufklappbare Verhaltensregeln |
| US 1.2 Hauskalender | `#infos` | `webcal://`-Abo und `.ics`-Download des Google Kalenders |
| US 1.3 Live-ÖPNV | `#oepnv` | transport.rest (VBB), Verspätung rot/grün, Auto-Refresh 60 s (nur solange sichtbar) |
| US 1.4 Kiez & Dokumente | `#infos` | Drive-PDF-Links, `.vcf`-Visitenkarte, aponet-iFrame mit Fallback-Link |
| US 2.1 Wasserzähler | `#wasser` | Formular + Kamera-Foto → verkleinert, Base64, POST |
| US 2.2 Stromzähler | `#strom` | WhatsApp-Deep-Link `wa.me` mit vorausgefülltem Text |
| US 2.3 Elektroraum | `#elektro` | Datum ≥ 2 Werktage, Sa/So werden abgelehnt und geleert |
| US 2.4 Klingelschild / Mangel | `#klingel`, `#mangel` | POST ans Backend, Mangel mit optionalem Foto |
| Rechtliches | `#impressum`, `#datenschutz` | Impressum, Datenschutzerklärung; Zustimmungsdialog bei jedem App-Start (Sitzung). Vor der Zustimmung werden keine externen Dienste geladen; bei Ablehnung Kontaktdaten und Notrufnummern |

## Struktur

```
index.html            App-Shell mit allen Ansichten (Hash-Routing)
css/style.css         Mobile-First-Styles inkl. Dark Mode
js/config.js          ALLE anpassbaren Daten (Telefonnummern, Haltestelle, Links …)
js/app.js             Logik
sw.js, manifest.json  PWA (installierbar, Notfallseite offline verfügbar)
fonts/                Schriften (woff2) inkl. Lizenzen
assets/               Visitenkarte der Hausverwaltung (.vcf)
backend/Code.gs       Google-Apps-Script-Backend (Tabelle + Drive-Fotos + E-Mail)
backend/README.md     Schritt-für-Schritt-Einrichtung des Backends
docs/API.md           Schnittstelle Frontend ↔ Backend
```

## Lokal starten

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html?obj=lind6
```

Ist `API_URL` in `js/config.js` leer, läuft die App im **Demo-Modus**: Formulare werden nicht
gesendet, sondern die Payload wird in der Browser-Konsole ausgegeben.

## Häuser, Aufgänge & QR-Codes

Die Wohnanlage hat 3 Häuser mit 5 Aufgängen, gepflegt unter `HOUSES` in `js/config.js`. Die
Konfiguration erbt: **SITE → Haus → Aufgang** (z. B. eigener Ort des Hauptwasserhahns pro Haus).

Jeder Aufgang bekommt einen eigenen QR-Code am Aushang:

| Haus | Aufgang | QR-Code-Link |
|---|---|---|
| Haus 1 | Dorfstr. 27 | `https://mirkowill.github.io/Wartenberg-/?obj=dorf27` |
| Haus 2 | Lindenberger Str. 2 | `https://mirkowill.github.io/Wartenberg-/?obj=lind2` |
| Haus 2 | Lindenberger Str. 4 | `https://mirkowill.github.io/Wartenberg-/?obj=lind4` |
| Haus 3 | Lindenberger Str. 6 | `https://mirkowill.github.io/Wartenberg-/?obj=lind6` |
| Haus 3 | Lindenberger Str. 8 | `https://mirkowill.github.io/Wartenberg-/?obj=lind8` |

Der gewählte Aufgang wird gemerkt, auch nach dem Start vom Homescreen. Ohne Link zeigt die App eine
Auswahl; über den Aufgangsnamen oben in der Kopfzeile lässt er sich jederzeit wechseln.
Jede Meldung ans Backend enthält Haus und Aufgang.

## Veröffentlichen (GitHub Pages)

Repository → *Settings* → *Pages* → Source: *Deploy from a branch* → Branch `main`, Ordner `/ (root)`.

Nach Änderungen an Dateien `CACHE_VERSION` in `sw.js` hochzählen, damit Nutzer die neue Version erhalten.

## Offene Platzhalter (`TODO` in `js/config.js`, `assets/hausverwaltung.vcf`)

- Telefonnummer des Hausmeisters (Notfälle)
- Ort des Hauptwasserhahns je Haus und weitere Verhaltensregeln
- Öffentliche iCal-Adresse des Google Kalenders
- Optional: VBB-Haltestellen-ID fest eintragen (wird sonst automatisch per Name gesucht)
- Google-Drive-Links (Hausordnung usw.) und Kiez-Tipps
- `API_URL` der Apps-Script-Web-App (Einrichtung: `backend/README.md`)

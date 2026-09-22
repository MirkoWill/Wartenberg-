# Wartenberg – Mieter-App (PWA)

Mieter-App für die WEG Wartenberger Dorfkrug. Reines Frontend (HTML, CSS, Vanilla JS) für **GitHub Pages**,
Backend über **Google Apps Script + Google Sheets**. Betriebskosten: 0 €.

Stand: **Epic 1 (Information & Sicherheit)** und **Epic 2 (Formulare & Services)** für Mieter, inkl.
fertigem Google-Apps-Script-Backend. Das Hausmeister-Portal (Epic 3) ist im Backend vorbereitet, das Frontend folgt.

Design im Stil von Willbrandt und Kompagnon (Petrol `#107082`, Kupfer `#b87333`, Serifen-Überschriften),
mit automatischem Dark Mode.

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

## Struktur

```
index.html            App-Shell mit allen Ansichten (Hash-Routing)
css/style.css         Mobile-First-Styles inkl. Dark Mode
js/config.js          ALLE anpassbaren Daten (Telefonnummern, Haltestelle, Links …)
js/app.js             Logik
sw.js, manifest.json  PWA (installierbar, Notfallseite offline verfügbar)
assets/               Visitenkarte der Hausverwaltung (.vcf)
backend/Code.gs       Google-Apps-Script-Backend (Tabelle + Drive-Fotos + E-Mail)
backend/README.md     Schritt-für-Schritt-Einrichtung des Backends
docs/API.md           Schnittstelle Frontend ↔ Backend
```

## Lokal starten

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html?obj=h1-a
```

Ist `API_URL` in `js/config.js` leer, läuft die App im **Demo-Modus**: Formulare werden nicht
gesendet, sondern die Payload wird in der Browser-Konsole ausgegeben.

## Häuser, Aufgänge & QR-Codes

Die Wohnanlage hat 3 Häuser mit 5 Aufgängen, gepflegt unter `HOUSES` in `js/config.js`. Die
Konfiguration erbt: **SITE → Haus → Aufgang** (z. B. eigener Ort des Hauptwasserhahns pro Haus).

Jeder Aufgang bekommt einen eigenen QR-Code am Aushang:

| Aufgang | QR-Code-Link |
|---|---|
| Haus 1 · Aufgang A | `https://mirkowill.github.io/Wartenberg-/?obj=h1-a` |
| Haus 1 · Aufgang B | `https://mirkowill.github.io/Wartenberg-/?obj=h1-b` |
| Haus 2 · Aufgang A | `https://mirkowill.github.io/Wartenberg-/?obj=h2-a` |
| Haus 2 · Aufgang B | `https://mirkowill.github.io/Wartenberg-/?obj=h2-b` |
| Haus 3 · Aufgang A | `https://mirkowill.github.io/Wartenberg-/?obj=h3-a` |

Der gewählte Aufgang wird gemerkt, auch nach dem Start vom Homescreen. Ohne Link zeigt die App eine
Auswahl; über den Aufgangsnamen oben in der Kopfzeile lässt er sich jederzeit wechseln.
Jede Meldung ans Backend enthält Haus und Aufgang.

## Veröffentlichen (GitHub Pages)

Repository → *Settings* → *Pages* → Source: *Deploy from a branch* → Branch `main`, Ordner `/ (root)`.

Nach Änderungen an Dateien `CACHE_VERSION` in `sw.js` hochzählen, damit Nutzer die neue Version erhalten.

## Offene Platzhalter (`TODO` in `js/config.js`, `assets/hausverwaltung.vcf`)

- Telefonnummern Hausverwaltung, Havarie-Notdienst, Schlüsseldienst (+ Festpreis)
- WhatsApp-Nummer für den Stromzähler
- Ort des Hauptwasserhahns und weitere Verhaltensregeln
- Öffentliche iCal-Adresse des Google Kalenders
- VBB-Haltestellen-ID (derzeit Demo: Alexanderplatz)
- Google-Drive-Links (Hausordnung usw.) und Kiez-Tipps
- `API_URL` der Apps-Script-Web-App (Einrichtung: `backend/README.md`)
- Echte Namen/Adressen der 3 Häuser und die Zuordnung der 5 Aufgänge

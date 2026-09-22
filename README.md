# Wartenberg – Mieter-App (PWA)

Mieter-App für die WEG Dorfkrug Wartenberg. Reines Frontend (HTML, CSS, Vanilla JS) für **GitHub Pages**,
Backend über **Google Apps Script + Google Sheets**. Betriebskosten: 0 €.

Stand: **Epic 1 (Information & Sicherheit)** und **Epic 2 (Formulare & Services)** für Mieter.
Das Hausmeister-Portal (Epic 3) folgt.

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
docs/API.md           Schnittstelle zum Google-Apps-Script-Backend
```

## Lokal starten

```bash
python3 -m http.server 8000
# → http://localhost:8000/index.html?obj=dorfkrug
```

Ist `API_URL` in `js/config.js` leer, läuft die App im **Demo-Modus**: Formulare werden nicht
gesendet, sondern die Payload wird in der Browser-Konsole ausgegeben.

## Mehrere Häuser / QR-Code

Jedes Haus bekommt einen Eintrag in `OBJECTS` in `js/config.js`. Der QR-Code am Aushang zeigt auf
`https://<user>.github.io/Wartenberg-/index.html?obj=<schluessel>`. Das zuletzt gewählte Haus wird
gemerkt, damit die App auch nach dem Start vom Homescreen das richtige Haus zeigt.

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
- `API_URL` der Apps-Script-Web-App

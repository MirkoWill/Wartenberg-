# CLAUDE.md – Mieter-App WEG Wartenberger Dorfkrug

Hinweise für Claude (und alle, die hier mitarbeiten). Diese Datei wird zu Beginn jeder Sitzung gelesen.

## Projekt in Kürze

Bewohner-App (PWA) für die WEG Wartenberger Dorfkrug (3 Häuser, 5 Aufgänge), betreut von
**Willbrandt und Kompagnon**. Reines Frontend (HTML, CSS, Vanilla JS) auf GitHub Pages unter
`app.willbrandt-kompagnon.de`, Backend als **Google Apps Script** mit Google-Tabelle (`backend/Code.gs`).
Betriebskosten 0 €. Details: `README.md`, `backend/README.md`, `docs/API.md`.
Backup: monatlich als ZIP im Google Drive („Mieter-App Backups“); Wiederherstellen: `docs/WIEDERHERSTELLUNG.md`.

- `index.html` – alle Ansichten (Hash-Routing), `js/app.js` – Logik, `js/config.js` – alle Daten
  (Telefonnummern, Aufgänge, Kiez …), `js/i18n.js` – Übersetzungen (Schlüssel = deutscher Text; DE, EN, RU, UK, CS)
- `css/style.css` – Styles; am Ende der Block „Design 2026“ mit Linien-Symbolen (`.ico .ico--name`)
- `sw.js` – Service Worker (offline), `tests/` – automatische Tests (laufen in GitHub Actions)

## Kommunikation mit dem Nutzer

- Immer **Deutsch**, Sie-Form in Texten für Bewohner, im Chat Du. Kurze, klare Sätze, einfache Sprache.
- Der Nutzer ist oft **am Handy**; Schritte am PC mit 💻 kennzeichnen.
- Vor größeren Design-Änderungen **Screenshot schicken** und Freigabe abwarten.

## Feste Regeln (immer einhalten)

- **Mitarbeiter nur als Nummern**, nie mit Namen in App, Mails, Berichten:
  `007`/`008` Verwaltung · `001`/`002` Leitung Hausmeisterdienst · `010`/`011` Fitnessraum · ab `100` Hausmeister-Team.
  Wer hinter einer Nummer steht, weiß nur der Arbeitgeber.
- **Keine E-Mails an Mieter** aus dem System.
- **Die Zugangs-PIN nie veröffentlichen** (nicht im Code, nicht auf Aushängen/Flyern, nicht in Commits).
- **Arbeitsprotokoll und Berichte ohne Mitarbeiternummern** (Datensparsamkeit).
- **Reinigungskalender nicht öffentlich** freigeben.
- **Beiratsbericht: nur Zahlen** – keine Namen, Wohnungen, Beschreibungen.
- **Eigentümer-Themen** (Finanzen, Beschlüsse, Dokumente) gehören ins separate **Eigentümerportal**, nicht in diese App.
- **Google Tasks ist nicht führend** – führend sind App und Google-Tabelle (Tasks nur Einbahnstraße zur Übersicht).
- Notfälle (Wasser, Heizung, Strom) laufen über den **Hausmeister-Notdienst am Telefon**; die App ersetzt keinen Notruf.
- Das Projekt „Kaffeekarte“ wird hier **nicht** behandelt.

## Ablauf bei jeder Änderung

1. Änderung umsetzen, Texte für Bewohner auch in `js/i18n.js` übersetzen (sonst erscheint Deutsch).
2. **Version hochzählen**: `CACHE_VERSION "mieterapp-vN"` in `sw.js` **und** alle `?v=N` in `sw.js` und `index.html`
   (ein Test prüft, dass beides passt). Neue Dateien, die offline nötig sind, in die Liste in `sw.js` aufnehmen.
3. Tests lokal: `npm run test:backend` und `npm run test:frontend`
   (Backend, Sicherheit, Browser, Browser-Sicherheit – alle müssen grün sein). Neue Funktionen bekommen Tests.
   Fehlt lokal der zur Playwright-Version passende Browser: `PW_CHROMIUM=/opt/pw-browsers/chromium` davorsetzen.
4. Commit auf dem Arbeitszweig, PR nach `main`, CI abwarten, bei Grün squash-mergen, danach den Arbeitszweig
   auf `origin/main` zurücksetzen. Veröffentlicht ist erst, was in `main` ist (GitHub Pages).
5. Dem Nutzer sagen: App am Handy einmal komplett schließen und neu öffnen.
6. Neue oder geänderte Dienste/Bausteine in „Technik-Bestandteile“ eintragen (für die Sicherheits-Routine).

**Backend (`backend/Code.gs`) wird nicht automatisch veröffentlicht.** Nach Änderungen muss der Nutzer 💻:
Code.gs im Apps-Script-Editor ersetzen → ggf. `setup` ausführen → Bereitstellen → Bereitstellungen verwalten →
Stift → „Neue Version“ (keine neue Bereitstellung anlegen). `appsscript.json` wird dabei nicht mitkopiert
(Dienst „Google Tasks API“ ggf. von Hand hinzufügen). Immer darauf hinweisen, wenn eine Änderung das Backend betrifft.

## Design

Wie die Website willbrandt-kompagnon.de: Schriftzug Oswald („und Kompagnon“ fett), Überschriften Playfair Display,
Text Source Sans 3 (alle lokal in `fonts/`, nichts von Google laden). Farben: Oliv `#6d7454`, Limette `#e3f2b3`
auf Dunkel, Schiefer `#2c3134`, Hintergrund `#f8f8f8`. Dunkles Kopfband mit schräger Oberkante und dezentem
Hausfoto, weiße Karten mit weichem Schatten, feine Linien-Symbole in Oliv statt Emojis. Notfallnummern farbig
nach Stufe (rot/orange). Seriös, ruhig, gut lesbar; Tipp-Flächen mind. 44 px, Kontrast nach WCAG AA.

## Sicherheit

- Content-Security-Policy in `index.html` (nur eigene Skripte), Schutz gegen Einbetten, alle Ausgaben mit `esc()`;
  Zahlen vom Server immer als Zahl behandeln.
- Mitarbeiter melden sich über persönliche Links (`?hm=TOKEN`) an, Bewohner über die Haus-PIN.
- Backend: Formeln in Eingaben werden zu Text, Längen begrenzt, Rollen/Zuständigkeit nur serverseitig,
  Zuweisen-Links in Mails signiert (`assignSig`). Sicherheitstests: `tests/backend-security.test.js`,
  `tests/frontend-security.test.js`.

## Technik-Bestandteile (für die wöchentliche Sicherheitsprüfung)

Diese Liste liest die Sicherheits-Routine jeden Montag und gleicht sie mit aktuellen Warnungen (BSI, CERT-Bund,
GitHub Advisories, Hersteller) ab. **Wer einen Dienst oder Baustein hinzufügt, entfernt oder aktualisiert,
trägt das hier im selben Commit ein** (Teil des Ablaufs bei jeder Änderung).

| Bestandteil | Version / Stand | Wo | Wofür |
|---|---|---|---|
| GitHub Pages | Hosting (statisch, kein Server-Code) | app.willbrandt-kompagnon.de | App ausliefern |
| Google Apps Script + Google Sheets/Drive/Kalender/Mail | V8-Laufzeit | `backend/Code.gs` | Backend, Daten, Fotos, Mails |
| Google Tasks API (Advanced Service) | v1 | `backend/appsscript.json` | Übersicht für die Verwaltung (optional) |
| html5-qrcode | 2.3.8 (Apache-2.0) | `vendor/html5-qrcode.min.js` | QR-Scanner (nur Hausmeister-Bereich) |
| qrcode-generator | 1.4.4 (Code identisch bis 2.0.2, MIT) | `vendor/qrcode-generator.js` | QR-Codes drucken |
| Web Push (VAPID, ES256) | eigene Umsetzung | `backend/Code.gs`, `sw.js` | Benachrichtigungen (Android) |
| ntfy.sh | öffentlicher Dienst | `backend/Code.gs` | Alarm-App für Verwaltung/Leitung |
| Bright Sky (DWD-Wetter) | öffentlicher Dienst, ohne Schlüssel | `backend/Code.gs` | Wetter und Warnungen |
| BVG, BSR, aponet | nur Links | `js/config.js` | Abfahrten, Abfall, Apotheken |
| GitHub-Archiv (codeload.github.com) | monatlicher ZIP-Download | `backend/Code.gs` (`backupRepo`) | Code-Backup ins Google Drive |
| Playwright | siehe `package.json` (nur Tests) | `tests/` | automatische Tests, nicht in der App |
| Endgeräte | Android (Chrome, Samsung Internet), iPhone (Safari) | – | Nutzung der App |
| Website willbrandt-kompagnon.de | im Aufbau: statisches HTML bei Strato (Hosting Basic, PHP verfügbar, derzeit nicht genutzt); bisher IONOS-Baukasten | – | nur informativ, eigenes Projekt |

## Offene Punkte beim Nutzer (Stand Oktober 2026)

- Backend-Stand ab Anfang Oktober einspielen (002, Hausmeister-Ablauf mit Zuweisung und 8-Uhr-Mail,
  „Allgemeines Anliegen“, Fitnessraum-Verbesserungen, Vorgangsnummern ohne Dopplung).
- Hausmeister-Team (100–102) im Blatt „Mitarbeiter“ auf „Aktiv“ setzen, Links an Herrn Schreier senden.
- QR-Codes für alle Orte aushängen.
- Später, nur auf Wunsch: Zustimmungsdialog kürzen, Infos-Seite aufteilen, Zuweisen-Links mit Ablaufdatum.

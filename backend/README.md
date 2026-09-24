# Backend einrichten (Google Apps Script)

Dauer: ca. 10 Minuten, einmalig. Kosten: 0 €.

## 1. Tabelle und Script anlegen

1. In Google Drive eine neue **Google-Tabelle** anlegen, z. B. „Mieter-App WEG Wartenberger Dorfkrug“.
2. In der Tabelle: **Erweiterungen → Apps Script**.
3. Den Inhalt von `Code.gs` komplett in die Datei `Code.gs` im Editor kopieren (vorhandenen Code ersetzen).
4. Optional: Im Editor links auf ⚙️ **Projekteinstellungen** → „Manifestdatei appsscript.json anzeigen“
   aktivieren und den Inhalt von `appsscript.json` übernehmen (setzt die Zeitzone Europe/Berlin).
5. Speichern (💾).

## 2. Einmalig `setup()` ausführen

1. Oben in der Funktionsauswahl **setup** wählen → **Ausführen**.
2. Google fragt nach Berechtigungen → Konto wählen → „Erweitert“ → „Zu … wechseln (unsicher)“ → **Zulassen**.
   (Die Warnung erscheint, weil das Script von Ihnen selbst und nicht von Google geprüft ist.)
3. Danach gibt es die Blätter **Tickets**, **Zählerstände**, **Reinigung** und in Drive den privaten Ordner
   **Mieter-App Fotos**.

## 3. Einstellungen (optional)

⚙️ **Projekteinstellungen → Script-Eigenschaften → Eigenschaft hinzufügen**:

| Eigenschaft | Beispiel | Zweck |
|---|---|---|
| `NOTIFY_EMAIL` | `verwaltung@example.org` | E-Mail bei jedem neuen Antrag, jeder Zählermeldung und jeder Erledigt-Meldung (mehrere kommagetrennt). Prüfen: Funktion **testMail** ausführen. |
| `APP_PIN` | `13059` | Zugangs-PIN der App (ohne Eintrag gilt 13059). Bei Änderung auch `PIN_SHA256` in `js/config.js` anpassen. |
| `CALENDAR_ID` | `abc…@group.calendar.google.com` | Optional: Kalender für den Reinigungsplan (sonst Suche nach Name „WEG Wartenberger Dorfkrug“) |

## 4. Als Web-App bereitstellen

1. **Bereitstellen → Neue Bereitstellung** → Typ ⚙️ **Web-App**.
2. *Ausführen als:* **Ich** · *Zugriff:* **Jeder**.
3. **Bereitstellen** → die **Web-App-URL** (endet auf `/exec`) kopieren.
4. Die URL in `js/config.js` bei `API_URL` eintragen. Damit endet der Demo-Modus.

Test: Die URL im Browser öffnen, dann sollte `{"ok":true,"service":"mieter-app",…}` erscheinen.

> **Wichtig bei Code-Änderungen:** Nach jeder Änderung an `Code.gs` unter
> **Bereitstellen → Bereitstellungen verwalten → ✏️ → Version: Neue Version** neu bereitstellen.
> Sonst läuft weiter der alte Code, die URL bleibt dabei gleich.

## Script aktualisieren (bei neuen Versionen)

1. Tabelle öffnen → **Erweiterungen → Apps Script**.
2. Den gesamten Inhalt von `Code.gs` durch die neue Version ersetzen → speichern.
3. **setup** einmal ausführen (ergänzt neue Spalten und Blätter, vorhandene Daten bleiben erhalten).
4. **Bereitstellen → Bereitstellungen verwalten → ✏️ (Bearbeiten) → Version: „Neue Version“ → Bereitstellen.**
   Die Adresse (`…/exec`) bleibt dabei gleich.

## Arbeiten mit der Tabelle (Hausverwaltung)

- **Übersicht Zähler:** alle Zählerstände sortiert nach Haus, Aufgang, Wohnung und Ablesedatum (neueste zuerst).
  Jede Wohnung ist farblich als „Paket“ zusammengefasst, das Foto öffnet sich über „Foto öffnen“, über die
  Filter-Pfeile in der Kopfzeile lässt sich nach Wohnung, Datum usw. filtern. Das Blatt wird nach jeder Meldung
  neu erstellt – Änderungen bitte im Blatt **Zählerstände** vornehmen. Manuell: Menü **Mieter-App → Zähler-Übersicht aktualisieren**.
- **Klingelschild:** Jeder Antrag geht automatisch per E-Mail an den Hausmeister (`HAUSMEISTER_EMAIL`, Standard
  info@gs-schreier.de) – mit Ticketnummer und einem Link „Als erledigt melden“. Nach Bestätigung steht im Blatt
  **Tickets** der Status `erledigt` samt Datum, und Sie erhalten eine Info-Mail (`NOTIFY_EMAIL`).
- **Aktuelles:** Hinweise für die Startseite der App. Eine Zeile je Hinweis: *Aktiv* anhaken, optional *Von*/*Bis*
  (sonst unbegrenzt), *Titel* und *Text*; *Wichtig* hebt den Hinweis rot hervor. In *Nur für Aufgang-IDs* können
  Aufgänge eingetragen werden (z. B. `lind6, lind8`), leer = alle. Die App aktualisiert höchstens alle 5 Minuten.
  Hinweise erscheinen in der eingegebenen Sprache (nicht automatisch übersetzt).
  Wiederkehrende Hinweise (z. B. jeden Mittwoch „Heute Treppenhausreinigung“) stehen nicht in der Tabelle,
  sondern in `js/config.js` unter `recurringNotices` und erscheinen automatisch, übersetzt.
- **Meine Meldungen:** Mieter sehen in der App den Status ihrer Tickets (Spalte *Status*) und Zählermeldungen
  (*eingegangen*, bzw. *geprüft*, sobald alle Zähler der Meldung in *Zählerstände* abgehakt sind).
- **Tickets:** Spalte *Status* per Auswahl auf `in Arbeit` / `erledigt` setzen. Alles, was nicht `erledigt` ist,
  erscheint später in der Auftragsliste des Hausmeisters.
- **Zählerstände:** Spalte *Geprüft* nach Kontrolle des Fotos abhaken. Art *Kalt*/*Warm* (Wasser, m³) oder
  *Heizung* (Spalte *Einheit*: kWh oder MWh). Nach dem Update einmal **setup** ausführen (neue Spalte *Einheit*).
- **Fotos** liegen im privaten Drive-Ordner und sind **nicht öffentlich**; der Link in der Tabelle
  funktioniert nur für Sie bzw. für Personen, mit denen Sie den Ordner teilen.

## Hausmeister-Portal (Epic 3)

`setup` legt dafür diese Blätter an und füllt sie beim ersten Mal:

| Blatt | Inhalt |
|---|---|
| **Mitarbeiter** | **Nur Nummern, keine Namen** (pseudonym): `007` Verwaltung, `001` Leitung Hausmeisterdienst, `100`–`119` Mitarbeiter, je mit **persönlichem Link**. Die Liste (Nr + Link) geht an den Hausmeisterdienst, der selbst festhält, wer welche Nummer hat. Link einmal am Handy öffnen, dann bleibt man angemeldet. Zugang sperren: *Aktiv* abhaken (wirkt nach spätestens 5 Minuten); für eine neue Person besser eine unbenutzte Nummer vergeben. Mehr Nummern: `STAFF_LINKS` erhöhen, dann Menü **Mieter-App → Mitarbeiter-Links ergänzen**. Rolle *Verwaltung* sieht zusätzlich „QR-Codes drucken“. |
| **QR-Orte** | Alle Orte mit QR-Code (Code, Ort, Bereich, Aufgang-ID, Standard-Tätigkeit). *Für Bewohner anzeigen* = erscheint bei den Bewohnern unter „Hausreinigung & Pflege“ (bei Aufgang-ID nur in diesem Aufgang, leer = alle). Neue Orte einfach als Zeile ergänzen (in der App nach spätestens 5 Minuten sichtbar); *Code* nur Buchstaben/Ziffern/_ und danach nicht mehr ändern (steht im gedruckten QR-Code). |
| **Tätigkeiten** | Auswahlliste beim Scannen; beliebig erweiterbar. |
| **Reinigung** | Jeder Nachweis: Scan-Zeit, Ort, Tätigkeit, Mitarbeiter-Nr, Notiz, Foto, *Erfassung* = „QR-Scan“ oder „manuell gewählt“ (QR-Code beschädigt). |
| **Mängel Hausmeister** | Vom Hausmeister/der Verwaltung erfasste Mängel, getrennt von den Bewohner-Tickets; Status wie bei *Tickets*. |
| **Reinigungsplan** | Termine vom Hausmeister (siehe unten). |

**QR-Codes drucken:** Mit dem Verwaltungs-Link in der App **Hausmeister → QR-Codes drucken** → Drucken (A4, 3 Codes
pro Zeile). Der Code ist ein Link: Die Hausmeister scannen in der App, zur Not geht auch die normale Handy-Kamera.

**Reinigungsplan:** Die Liste des Hausmeisters (Excel) in das Blatt **Reinigungsplan** kopieren – eine Zeile je Termin:

| Datum | Bis | Tätigkeit | Ort | Bemerkung |
|---|---|---|---|---|
| 07.10.2026 | | Treppenhausreinigung | alle Aufgänge | |
| 12.10.2026 | | Fensterreinigung Aufgang | Treppenhaus Lindenberger Str. 6 | |
| 01.11.2026 | 31.03.2027 | Winterdienst | | Bereitschaft |

- *Bis* nur bei Zeiträumen. *Ort*: Name aus **QR-Orte** (auch mehrere, mit Komma), `alle Aufgänge`, `alle Keller` oder leer (= ganze Anlage).
- Menü **Mieter-App → Reinigungsplan → Kalender übertragen**: überträgt alles in den Google-Kalender
  „WEG Wartenberger Dorfkrug“ (neu, geändert, gelöscht). Nach jeder Änderung am Plan erneut ausführen.
  Beim ersten Mal fragt Google nach der Kalender-Berechtigung. Anderer Kalender: Script-Eigenschaft `CALENDAR_ID`.
- **Es erscheint nichts im Kalender?** Nach dem Übertragen zeigt ein Fenster das Ergebnis („x neu …“) oder den Grund:
  Kalender nicht gefunden (dann nennt es die Kalender, die das Konto sieht), oder Zeilen, deren Datum nicht lesbar ist.
  Der Kalender muss im **selben Google-Konto** liegen, dem die Tabelle gehört, oder für dieses Konto mit
  „Änderungen an Terminen vornehmen“ freigegeben sein. Das Menü „Mieter-App“ erscheint erst nach dem Neuladen der Tabelle.
- **Tägliche Kontrolle um 19 Uhr:** Für eintägige Termine von heute ohne passenden Scan (gleiche Tätigkeit, gleicher Ort)
  kommt eine Mail an `NOTIFY_EMAIL` („Fehlende Nachweise“). Zeiträume (z. B. Winterdienst) werden nicht geprüft.
- Die Bewohner sehen in der App die nächsten Termine (14 Tage) und die zuletzt erledigten Arbeiten (60 Tage) für ihren Aufgang.

## Fehlersuche: Es kommen keine E-Mails an

1. **Aktuellen Code eingespielt?** Benachrichtigungen bei Zählermeldungen gibt es erst ab der Version mit der
   Funktion `testMail`. Sonst: Code ersetzen, speichern, **neue Version bereitstellen** (siehe oben).
2. **testMail ausführen:** Im Editor oben die Funktion **testMail** wählen → **▷ Ausführen** → unten erscheint
   das Ausführungsprotokoll.
   - „NOTIFY_EMAIL ist NICHT gesetzt“ → Script-Eigenschaft fehlt oder ist falsch geschrieben
     (exakt `NOTIFY_EMAIL`, Großbuchstaben, Unterstrich).
   - „Testmail an … verschickt“ → Postfach prüfen, auch **Spam**, **„Alle Nachrichten“** und **„Gesendet“**.
   - Fehlermeldung zu Berechtigungen → einmal **Berechtigungen prüfen → Zulassen** (wie bei der Einrichtung).
3. **„Testmail verschickt“, kommt aber nie an (auch nicht im Spam)?** Dann ist das Google-Konto vermutlich
   mit einer Adresse der eigenen Domain angelegt (z. B. info@willbrandt-kompagnon.de) ohne eigenes Gmail.
   Google versendet dann in deren Namen, der Mailserver der Domain hält das für eine Fälschung (SPF) und
   verwirft die Mail still – das betrifft auch die Mails an den Hausmeister.
   **Lösung (so eingerichtet):** Dem Google-Konto eine Gmail-Adresse hinzufügen
   (hier: willbrandtundkompagnon@gmail.com). Absendername bleibt „Willbrandt und Kompagnon“, Antworten
   gehen an `NOTIFY_EMAIL`. Alternative: im DNS der Domain den SPF-Eintrag um `include:_spf.google.com` ergänzen.
4. **Welche Aktionen senden eine Mail?** Techniker-Termin, Klingelschild, Mängelmeldung, Wasserzähler und
   „Erledigt“-Meldungen des Hausmeisters. Die Stromzähler-Anfrage läuft über WhatsApp und sendet keine Mail.
5. **Protokoll ansehen:** Im Apps-Script-Editor links **Ausführungen** (Uhr-Symbol) – dort stehen Fehler wie
   „E-Mail fehlgeschlagen: …“ mit Grund.

## Sicherheit & Datenschutz

- **Zugangs-PIN:** Die App fragt bei jedem Start (wie die Zustimmung) die PIN ab (3 Fehlversuche → 15 Minuten Sperre auf dem Gerät).
  Das Backend prüft die PIN bei jeder Meldung und Statusabfrage selbst; nach 30 Fehlversuchen in 15 Minuten
  (alle Geräte zusammen) nimmt es 15 Minuten lang keine PIN an. Der Erledigt-Link des Hausmeisters braucht keine PIN.
- **Missbrauchsbremse:** höchstens 40 Meldungen pro Stunde und 10 Hausmeister-Mails je 6 Stunden (insgesamt).
  Darüber hinaus werden Meldungen abgelehnt bzw. Aufträge nur in der Tabelle gespeichert (`CONFIG.LIMITS`).

- Eingaben werden serverseitig geprüft (Pflichtfelder, Werktags-Regel, Bildtyp, max. 6 MB).
- Formel-Injection wird verhindert (Eingaben, die mit `=`, `+`, `-`, `@`, Tab oder Zeilenumbruch beginnen, werden als Text gespeichert – auch in der Zähler-Übersicht).
- Ein unsichtbares Honeypot-Feld filtert einfache Spam-Bots.
- Die Daten liegen in Ihrem Google-Konto. Für den Livebetrieb bitte die Datenschutzerklärung der App um
  Google (Speicherung) und transport.rest (Abfahrten) ergänzen.

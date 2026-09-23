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
| `HAUSMEISTER_TOKENS` | `{"langer-zufallscode": "hm_becker"}` | Zugang für das Hausmeister-Portal (Epic 3) |

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
- **Tickets:** Spalte *Status* per Auswahl auf `in Arbeit` / `erledigt` setzen. Alles, was nicht `erledigt` ist,
  erscheint später in der Auftragsliste des Hausmeisters.
- **Zählerstände:** Spalte *Geprüft* nach Kontrolle des Fotos abhaken.
- **Fotos** liegen im privaten Drive-Ordner und sind **nicht öffentlich**; der Link in der Tabelle
  funktioniert nur für Sie bzw. für Personen, mit denen Sie den Ordner teilen.

## Sicherheit & Datenschutz

- Eingaben werden serverseitig geprüft (Pflichtfelder, Werktags-Regel, Bildtyp, max. 6 MB).
- Formel-Injection wird verhindert (Eingaben, die mit `=`, `+`, `-` oder `@` beginnen, werden als Text gespeichert).
- Ein unsichtbares Honeypot-Feld filtert einfache Spam-Bots.
- Die Daten liegen in Ihrem Google-Konto. Für den Livebetrieb bitte die Datenschutzerklärung der App um
  Google (Speicherung) und transport.rest (Abfahrten) ergänzen.

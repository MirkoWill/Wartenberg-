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
| `APP_PIN` | – | Zugangs-PIN der App (6–12 Ziffern). **Nur über das Menü „Mieter-App → Zugangs-PIN ändern …“ setzen**, nie in den Code schreiben (das Projekt ist öffentlich). Ohne PIN sind alle Bewohner-Funktionen gesperrt. |
| `CALENDAR_ID` | `abc…@group.calendar.google.com` | Optional: Kalender für den Reinigungsplan (sonst Suche nach Name „WEG Wartenberger Dorfkrug“) |
| `BEIRAT_EMAILS` | `a@x.de, b@y.de, c@z.de` | Empfänger des Monatsberichts (nach Ihrer Freigabe) |
| `CLEANING_ICS_URL` | – (leer lassen) | Nur falls der Reinigungs-Kalender doch öffentlich sein soll: dessen iCal-Adresse → Abo-Knopf in der App. Empfehlung: **nicht** setzen |

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

## Allgemeines Anliegen (Services → großer Knopf oben)

Bewohner schicken Fragen, Hinweise oder Wünsche über die App statt per WhatsApp: Thema (Auswahl), Nachricht, optional
Foto, Wohnung und Name (Pflicht, damit Sie antworten können), Telefon oder E-Mail (optional). Es entsteht eine
Meldung vom Typ **„Anliegen“** im Blatt *Tickets* (Thema steht in der Spalte „Ort“), zuständig **Verwaltung** – mit
Mail, Benachrichtigung, Ampel/Service-Ziel, Statistik und Monatsbericht wie die anderen Meldungen. Im Cockpit können
Sie es wie gewohnt bearbeiten oder an den Hausmeister geben. Die Bewohner sehen den Stand unter „Meldungen“.

## Hausmeister-Portal (Epic 3)

`setup` legt dafür diese Blätter an und füllt sie beim ersten Mal:

| Blatt | Inhalt |
|---|---|
| **Mitarbeiter** | **Nur Nummern, keine Namen** (pseudonym): `007` Verwaltung, `001` Leitung Hausmeisterdienst, `100`–`119` Mitarbeiter, je mit **persönlichem Link**. Die Liste (Nr + Link) geht an den Hausmeisterdienst, der selbst festhält, wer welche Nummer hat. **Die Nummern ab 100 sind zunächst gesperrt** – beim Vergeben einer Nummer den Haken bei *Aktiv* setzen. Link einmal am Handy öffnen, dann bleibt man angemeldet. Zugang sperren: *Aktiv* abhaken (wirkt nach spätestens 5 Minuten); für eine neue Person besser eine unbenutzte Nummer vergeben. Mehr Nummern: `STAFF_LINKS` erhöhen, dann Menü **Mieter-App → Mitarbeiter-Links ergänzen**. Rolle *Verwaltung* sieht zusätzlich „QR-Codes drucken“. |
| **QR-Orte** | Alle Orte mit QR-Code (Code, Ort, Bereich, Aufgang-ID, Standard-Tätigkeit). *Für Bewohner anzeigen* = erscheint bei den Bewohnern unter „Hausreinigung & Pflege“ (bei Aufgang-ID nur in diesem Aufgang, leer = alle). Neue Orte einfach als Zeile ergänzen (in der App nach spätestens 5 Minuten sichtbar); *Code* nur Buchstaben/Ziffern/_ und danach nicht mehr ändern (steht im gedruckten QR-Code). |
| **Tätigkeiten** | Auswahlliste beim Scannen; beliebig erweiterbar. |
| **Reinigung** | Jeder Nachweis: Scan-Zeit, Ort, Tätigkeit, Mitarbeiter-Nr, Notiz, Foto, *Erfassung* = „QR-Scan“ oder „manuell gewählt“ (QR-Code beschädigt). |
| **Zuständig** (Spalte in *Tickets* und *Mängel Hausmeister*) | Wer den Auftrag erledigt: *Hausmeister* oder *Verwaltung*. Der Hausmeister sieht im Portal **nur** „Hausmeister“-Aufträge, die Verwaltung (007) sieht alle. Voreinstellung: Klingelschild → Hausmeister; Elektroraum, Mängel der Bewohner und interne Mängel → Verwaltung (umstellen per Auswahl in der Zelle, z. B. einen Mangel an den Hausmeister geben). Standards in `CONFIG.DEFAULT_OWNER`. |
| **Mängel Hausmeister** | Vom Hausmeister/der Verwaltung erfasste Mängel, getrennt von den Bewohner-Tickets; Status wie bei *Tickets*. Die Verwaltung wählt beim Erfassen („🛠️ Mangel erfassen“ im Cockpit) gleich *Dringend* und *Wer kümmert sich?* (Verwaltung oder Hausmeister). |
| **Reinigungsplan** | Termine vom Hausmeister (siehe unten). |

**Als App auf dem Startbildschirm:** Nach dem Öffnen des persönlichen Links im Browser-Menü „Zum Startbildschirm
hinzufügen“ bzw. „App installieren“ wählen – es entsteht eine eigene App **„Hausmeister“**, die direkt den
Hausmeister-Bereich öffnet. Fehlt dort die Anmeldung, den persönlichen Link einfach in das Feld „Link einfügen“ kopieren.

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

## Cockpit für Verwaltung (007 / 008) und Leitung (001 / 002)

**Leitung des Hausmeisterdienstes (001 und 002, Rolle „Leitung“, gleiche Rechte):** sieht im Cockpit nur die
Aufträge mit Zuständigkeit „Hausmeister“, kann deren Status ändern und sie **im Team verteilen** (nicht
Zuständigkeit/Notiz), sieht „Erledigte Arbeiten (14 Tage)“ und kann QR-Codes drucken. Keine Zählerstände, keine
Fehlerprotokolle. 002 legt `setup` bzw. „Mitarbeiter-Links ergänzen“ automatisch an; danach gilt die Auswahl in der
Spalte „Rolle“.

### Hausmeister-Aufträge in zwei Stufen

1. **Stufe 1 – Leitung (001/002):** Alles mit Zuständigkeit „Hausmeister“ (Klingelschild, von der Verwaltung
   übergebene Mängel) landet zuerst bei der Leitung – im Cockpit als **„📥 zu verteilen“** (eigener Filter) und in
   der **Morgen-Übersicht um 8 Uhr** an `HAUSMEISTER_EMAIL` (Script-Eigenschaft, sonst `CONFIG.HAUSMEISTER_EMAIL`).
   **Dringende** Aufträge kommen zusätzlich **sofort** per Mail (höchstens 10 je 6 Std.).
2. **Stufe 2 – Team (Nr. ab 100):** Die Leitung gibt den Auftrag an einen Hausmeister – im Cockpit („Zuweisen“) oder
   per Knopf **„→ Nr. …“** direkt in der Mail (mit Bestätigungsseite). Ab dann sehen **alle** Hausmeister im Team den
   Auftrag in der App, beim Zugewiesenen mit „👷 für dich“; das Team bekommt eine Benachrichtigung.

**Morgen-Übersicht (8 Uhr, nur wenn es etwas gibt):** 1. zu verteilende Aufträge mit Zuweisen-Knöpfen (neue
markiert), 2. beim Team offene Aufträge, 3. vom Team gemeldete Mängel (zur Info – die **Verwaltung** entscheidet;
diese Mängel gehen zuerst an 007/008), 4. **Bericht über den Vortag**: Nachweise per QR-Code mit Uhrzeit und laut
Reinigungsplan geplante, aber nicht nachgewiesene Arbeiten (ohne Mitarbeiternummern). Menü zum Testen:
**Mieter-App → Hausmeister-Übersicht jetzt senden**. Neue Spalten in *Tickets* / *Mängel Hausmeister*:
„Zugewiesen an“, „Zugewiesen am“, „An Leitung gemeldet“.

**Ansicht für das Team (Nr. ab 100):** nur noch die drei Bereiche **📷 Scannen, 📋 Aufträge (mit Zahl), 🛠️ Mangel** –
große Schrift und Knöpfe, ohne die Bewohner-Reiter. Klingelschild-Aufträge gehen nicht mehr sofort per Mail an
den Hausmeister, sondern über diesen Ablauf (alte Erledigt-Links aus früheren Mails funktionieren weiter).

**Erledigte Arbeiten (14 Tage)** – für Verwaltung und Leitung: je Tag, was mit Uhrzeit nachgewiesen wurde, Abgleich
mit dem Reinigungsplan (Plan x/y, „zusätzlich“, „nachgeholt am …“, „nicht nachgewiesen“). **Bewusst ohne
Mitarbeiternummern** (Datensparsamkeit, keine Leistungskontrolle einzelner Beschäftigter in der App). Die Nummer
bleibt nur im Blatt „Reinigung“ als Nachweis gespeichert.

### Verwaltung (007 / 008)

Wer mit dem persönlichen Link von **007** oder **008** angemeldet ist, sieht unten den Tab **📊 Cockpit**
(statt „Hausmeister“). Die Hausmeister-Tools (Scannen, Mangel erfassen, QR-Druck) sind von dort verlinkt.
Nr. 008 legt `setup` bzw. **Mieter-App → Mitarbeiter-Links ergänzen** automatisch an – den Link aus dem Blatt
„Mitarbeiter“ der Partnerin geben. Das Cockpit zeigt:

- **Kennzahlen**: offen, überfällig, bald fällig, SLA-Quote (90 Tage), Ø Reaktions- und Durchlaufzeit,
  Reinigung laut Plan (Soll/Ist, 30 Tage), App-Fehler der letzten 24 Stunden.
- **Aufträge mit Ampel** (rot = Frist überschritten, gelb = Frist in < 24 Std., grün = im Plan), Filter und
  **Bearbeiten** (Status, Zuständig, interne Notiz). Die App speichert, wer zuletzt geändert hat (Spalte „Bearbeitet von“).
- **Diagramme** der letzten 12 Monate: Meldungen je Monat und Art, Reinigungsnachweise, Zählermeldungen, Meldungen je Aufgang.

**SLA-Ziele** (in `CONFIG.SLA` änderbar):

| Art | Reaktion (Status „in Arbeit“) | Erledigt |
|---|---|---|
| Dringend (Mangel vom Hausmeister mit „dringend“) | 1 Tag | 3 Tage |
| Mangel (Bewohner und intern) | 3 Werktage | 14 Tage |
| Klingelschild | 3 Werktage | 10 Werktage |
| Allgemeines Anliegen | 3 Werktage | 14 Tage |
| Elektroraum | bestätigt 1 Werktag vor dem Termin | am Termin |

Werktage = Mo–Fr (Feiertage zählen als Werktage). Zeitstempel „In Arbeit seit“ und „Erledigt am“ setzt das
System selbst – auch wenn der Status **direkt in der Tabelle** geändert wird (dann steht „Tabelle“ bei „Bearbeitet von“).
Wird ein erledigter Auftrag wieder geöffnet, wird „Erledigt am“ geleert.

**Langläufer:** Aufträge, die von Dritten abhängen (Fachfirma, Ersatzteile, Teilreparatur), im Cockpit beim
Bearbeiten als „⏳ Langläufer“ kennzeichnen und kurz begründen (ohne Namen – der Grund erscheint im Beiratsbericht).
Sie zählen dann **nicht** in Ampel, „überfällig“, SLA-Quote, Ø-Zeiten und Morgen-Mail, werden aber **gesondert**
geführt: Kennzahl und Filter im Cockpit, eigener Abschnitt im Monatsbericht und in der Mail an den Beirat, Spalte
In der Tabelle: Spalten „Langläufer“ (ja) und „Langläufer-Grund“, Zeile lila.

**Morgen-Mail um 7 Uhr** an `NOTIFY_EMAIL` – **nur**, wenn Aufträge überfällig oder bald fällig sind.

## Fitnessraum (privat: 007, 008, 010, 011)

- `setup()` legt die Nummern **010** und **011** (Rolle „Fitness“) und das Blatt **Fitness-Buchungen** an.
  Die Links von 010/011 stehen im Blatt „Mitarbeiter“ und öffnen direkt den Fitnessraum (`#fitness`).
- 010/011 sehen nur den Fitnessraum – keine Aufträge, Nachweise, Mängel oder das Cockpit.
  007/008 erreichen ihn über „💪 Fitnessraum“ bei den Werkzeugen.
- Regeln (`CONFIG.FITNESS`): eine Buchung zur Zeit, 6–23 Uhr, 30 Min bis 2 Std in 30-Minuten-Schritten,
  bis 28 Tage im Voraus, höchstens 10 offene Buchungen je Nummer. Stornieren: eigene Buchung (bis 7 Tage danach
  als „nicht trainiert“), die Verwaltung darf jede.
- **Gemeinsam trainieren:** Beim Buchen optional „Gemeinsam mit“ andere Nummern wählen (Spalte „Mit“).
  Die Buchung zählt dann für alle Beteiligten; ein Partner kann für sich absagen, die Buchung bleibt bestehen.
- Statistik „Anfeuern“: Trainings (gebuchte Zeiten, die begonnen haben) je Woche/Monat/Jahr, Minuten,
  🔥 Wochen in Folge, Wochenziel (2×). Anzeige nur mit Nummern. Buchungen werden nach 2 Jahren gelöscht.

## Benachrichtigungen (nur Android)

- In der App gibt es auf Android-Handys den Kasten **„🔔 Benachrichtigungen“** (Startseite für Bewohner; Hausmeister-Bereich,
  Cockpit und Fitnessraum für Mitarbeiter). Freiwillig, jederzeit ausschaltbar.
- Wer bekommt was:
  - **Bewohner:** neuer Hinweis aus dem Cockpit (sofort gültig) und neue Umfrage – nur für den eigenen Aufgang.
  - **Hausmeister / Leitung:** neuer Auftrag für den Hausmeisterdienst (z. B. Klingelschild, Zuständigkeit geändert).
  - **Verwaltung (007/008):** jede neue Meldung von Bewohnern und Mängel vom Hausmeister (dringend = laut). Erfasst die
    Verwaltung selbst einen Mangel („🛠️ Mangel erfassen“ im Cockpit), bekommt nur die Kollegin/der Kollege eine Info;
    wird er dabei an den Hausmeister übergeben, bekommen Hausmeister und Leitung einen neuen Auftrag (dringend = laut).
  - **Fitnessraum:** wenn dich jemand als Trainingspartner einträgt, absagt oder die gemeinsame Buchung storniert.
    Außerdem eine **Erinnerung ca. 1 Stunde vor jeder Buchung** an alle Beteiligten (Zeitauslöser `fitnessReminders`
    alle 15 Minuten, legt sich beim ersten Buchen selbst an; Spalte „Erinnert“ verhindert doppelte Erinnerungen).
- Auf dem Sperrbildschirm stehen nur Art und Aufgang – keine Namen oder Wohnungen.
- **Unterscheidbar am Handy:** dringend = 🔴 im Titel, der Hinweiston kommt **3× (alle 4 Sekunden)**, bis die Benachrichtigung
  geöffnet oder weggewischt wird; alles andere klingelt 1×. Eigene Vibrationsmuster je Art kann Android (ab Version 8)
  für Web-Apps nicht – Ton und Vibration legt Android einheitlich für die App fest.
- **Eigener Ton (Android):** App über Chrome → „Zum Startbildschirm hinzufügen“/„App installieren“ installieren,
  dann eine Benachrichtigung lange antippen → ⚙️ Einstellungen → „Ton“ → eigenen Ton wählen. (Web-Apps können den Ton
  nicht selbst festlegen; der Ton gilt dann für alle Benachrichtigungen dieser App.)
- Technik: Web Push mit VAPID. Die Schlüssel legt das Script beim ersten Einschalten selbst an
  (Script-Eigenschaften `VAPID_PRIVATE` / `VAPID_PUBLIC` – **nicht ändern oder löschen**, sonst müssen alle neu einschalten).
  Über den Push-Dienst (bei Chrome: Google) geht nur ein leeres Signal; den Text holt die App bei uns ab.
- Blatt **„Benachrichtigungen“**: je Gerät Push-Adresse, Gruppe, Nummer bzw. Aufgang. Abgemeldete Geräte löscht das Script
  automatisch, unbenutzte nach einem Jahr.
- Test: Menü **Mieter-App → „Benachrichtigung testen (an Verwaltung)“** schickt eine Testnachricht an alle Handys der Verwaltung.

## Neuigkeiten für die Leitung (Release-Notes) und Anleitung fürs Team

- **Neuigkeiten-Mail an 001/002:** Bei neuen Funktionen für den Hausmeisterdienst oben in `RELEASES` (Code.gs, Abschnitt
  „Neuigkeiten“) einen Eintrag ergänzen – neuester zuerst: Titel, kurze Einleitung, Punkte (Symbol, Überschrift, Text),
  optional Hinweise „So geben Sie es an Ihr Team weiter“. Nach dem Bereitstellen:
  1. Menü **Mieter-App → „Neuigkeiten: Vorschau an mich“** (geht an `NOTIFY_EMAIL`),
  2. passt alles: **„Neuigkeiten an die Leitung (001/002) senden“** (geht an `HAUSMEISTER_EMAIL`).
  Jede Ausgabe geht nur einmal raus (Script-Eigenschaft `RELEASE_SENT_<id>`).
- **Anleitung fürs Hausmeister-Team (Nr. ab 100):** erscheint beim ersten Start auf jedem Handy automatisch
  (5 kurze Schritte, große Schrift: Willkommen, Scannen, Aufträge, Mangel, Hilfe) und ist jederzeit über
  **„❓ Anleitung“** oben im Hausmeister-Bereich wieder abrufbar.

## Alarm-App ntfy (Verwaltung 007/008, Leitung 001)

Web-Apps können auf Android weder eigene Töne noch lange Vibration auslösen. Für einen echten Alarm gibt es daher
zusätzlich die kostenlose App **ntfy** (Play Store, „ntfy“ von Philipp Heckel).

- Jede Nummer bekommt beim Anmelden automatisch einen **eigenen, geheimen Kanal** (`wk007-…`, 32 Zufallszeichen;
  Script-Eigenschaft `NTFY_TOPICS` – nicht löschen, sonst muss jede/r neu abonnieren).
- Einrichten am Handy: App → Cockpit (bzw. Hausmeister-Bereich für 001) → Kasten **„🚨 Alarm-App (ntfy)“** →
  ntfy installieren → Link „Alarm-Kanal abonnieren“ antippen → in ntfy beim Kanal unter „Benachrichtigungen“ für
  *Höchste Priorität* Ton/Vibration wählen und „Nicht stören überschreiben“ einschalten → „Test-Alarm senden“.
- Was kommt: neue Meldungen/Aufträge mit **Priorität 4** (laut), **dringende** mit **Priorität 5** (Alarm, 🚨).
  Hinweise, Umfragen und Fitnessraum gehen nicht an ntfy. Selbst erfasste Mängel bekommt man nicht; die Kollegin/der
  Kollege nur als Priorität 4.
- Inhalt wie bei den Benachrichtigungen: nur Art und Aufgang/Ort, keine Namen, Wohnungen oder Telefonnummern.
  Die Nachrichten laufen über den öffentlichen Server ntfy.sh; geschützt ist der Kanal nur durch seinen geheimen Namen.
- Neuen Kanal (z. B. Handy verloren): Eintrag der Nummer in `NTFY_TOPICS` löschen – beim nächsten Anmelden entsteht ein neuer.

## Google Tasks (Übersicht, optional) 💻 einmal am Computer

App und Tabelle bleiben **führend**. Google Tasks zeigt nur zusätzlich alle offenen Aufträge an – z. B. in Gmail,
im Google Kalender oder in der Tasks-App am Handy – neben eigenen Büro-Aufgaben.

- **Einrichten (einmal):**
  1. Apps-Script-Editor → links bei **„Dienste“** auf **+** → **„Google Tasks API“** → Kennung `Tasks` lassen → **Hinzufügen**.
  2. Tabelle neu laden → Menü **Mieter-App → „Google Tasks: einrichten / jetzt abgleichen“** → Berechtigung erlauben.
- Es entsteht die Liste **„Mieter-App Wartenberg“** im Google-Konto des Scripts. Jeder offene Auftrag (Bewohner-Meldungen
  und Mängel vom Hausmeister) wird eine Aufgabe: Titel = Art · Aufgang (Hausmeister-Aufträge mit „(Hausmeister)“,
  dringend mit 🔴), Fälligkeit = Service-Ziel „erledigen bis“, Notiz mit Auftragsnummer und Link ins Cockpit.
  Keine Telefonnummern.
- **Nur eine Richtung:** erledigt in App/Tabelle → Aufgabe wird abgehakt; wieder geöffnet → Aufgabe wieder offen.
  Abhaken in Google Tasks ändert **nichts** am Auftrag.
- Abgleich automatisch alle 15 Minuten (Zeitauslöser `gtasksSync`, höchstens 40 Änderungen je Lauf).
  Zuordnung im Blatt **„Google Tasks“** – nicht von Hand bearbeiten.
- **Eigene Themen** (Büro, Organisation): in Google Tasks eine eigene Liste anlegen, z. B. „Büro“. Die fasst das Script nie an.
- Ausschalten: Menü **„Google Tasks: Abgleich ausschalten“** (vorhandene Aufgaben bleiben stehen).
- Fehler (z. B. Kontingent) landen im **Fehlerprotokoll**; der nächste Lauf holt Fehlendes nach.

## Hinweise und Stimmungsbild aus dem Cockpit

- **Hinweise für Bewohner:** Cockpit → „Hinweise für Bewohner“ → Titel, Text, ab/bis, Aufgänge, „wichtig“ →
  erscheint auf der Startseite der App (Blatt „Aktuelles“). „Beenden“ nimmt ihn sofort heraus.
- **Stimmungsbild:** Cockpit → „Neue Umfrage starten“ (Frage, 2–6 Antworten, Enddatum, Aufgänge, Ergebnis für
  Bewohner sichtbar ja/nein). Bewohner stimmen auf der Startseite ab – **anonym**, eine Stimme je Gerät. Ergebnis je
  Antwort und je Aufgang im Cockpit. Blätter „Umfragen“ und „Umfrage-Stimmen“ (Stimmen werden nach 2 Jahren gelöscht).

## Tabelle übersichtlich (Menü „Tabelle übersichtlich formatieren“)

Läuft auch bei `setup`: Blatt **„Start“** mit Anleitung und Sprungmarken, Reiter nach Farbe geordnet
(grün = tägliche Arbeit, blau = Auswertung, grau = automatisch erfasst, orange = Einstellungen), Kopfzeilen, Spaltenbreiten,
Datumsformate, Zeilen je Status eingefärbt (offen gelb, in Arbeit blau, erledigt grün), technische Spalten
(Erledigt-Code, Token, Stimm-Kennung) ausgeblendet. **Daten werden nicht verändert.** Hinweis: eigene bedingte
Formatierungen in Blättern mit Status-Spalte werden dabei ersetzt.

## Kalender-Abo für Bewohner

- **Müllabfuhr:** Infos → Müllabfuhr: iPhone/Outlook, Google Kalender oder Adresse kopieren (BSR-Termine aus `assets/*.ics`).
- **Reinigung:** Der Google-Kalender bleibt **privat** – bitte **nicht** „öffentlich freigeben“ (sonst wäre weltweit
  sichtbar, wann der Hausmeisterdienst im Haus ist). Ausgewählten Personen teilen Sie ihn in Google Kalender → ⚙️ beim
  Kalender → *Für bestimmte Personen freigeben* (Google-Konto nötig). Die Script-Eigenschaft `CLEANING_ICS_URL` bleibt
  leer; dann zeigt die App keinen Abo-Knopf für die Reinigung (Müllabfuhr-Abo bleibt).

## Wetter auf der Startseite

Das Script holt stündlich die Vorhersage für 3 Tage und die amtlichen Warnungen des **Deutschen Wetterdienstes**
(über den freien Dienst Bright Sky, ohne Schlüssel, kostenlos) und liefert sie mit „Aktuelles“ an die App. Die Handys
verbinden sich nicht selbst mit einem Wetterdienst. Standort: `CONFIG.WEATHER` (lat/lon).
Die App zeigt zusätzlich eigene Hinweise ab 30 °C (Hitze) bzw. ab −10 °C (strenger Frost) – änderbar in
`js/config.js` unter `WEATHER`. Ist der Wetterdienst gestört, fehlt nur die Wetteranzeige.
Beim ersten Ausführen nach dem Einspielen fragt Google einmal nach der Berechtigung „Verbindung zu einem externen Dienst“.

## Monatsbericht für den Beirat (PDF)

Am **1. jedes Monats um 8 Uhr** erstellt das Script den Bericht für den Vormonat: Meldungen (eingegangen, erledigt,
offen, Vergleich Vormonat), Service-Ziele je Art, Ø Reaktions-/Erledigungszeit, Meldungen je Aufgang, Reinigung laut
Plan (am Plantag / nachgeholt / nicht nachgewiesen), 6-Monats-Trend, derzeit überfällige Aufträge (nur Art, Aufgang,
Datum). **Nur Zahlen – keine Namen, Wohnungen, Beschreibungen oder Mitarbeiterdaten.**

1. **8 Uhr:** Sie (`NOTIFY_EMAIL`) bekommen den Entwurf als PDF und einen Link.
2. Der Link öffnet eine Seite mit **Anmerkungsfeld** (erscheint in der Mail und oben im PDF) und drei Knöpfen:
   **Jetzt an den Beirat senden** · **Speichern – um 12 Uhr senden** · **Diesen Monat nicht automatisch senden**.
3. **12 Uhr** (`CONFIG.REPORT_SEND_HOUR`): Versand an **`BEIRAT_EMAILS`** (Komma-getrennt), Kopie an Sie, Antworten gehen an
   `CONFIG.REPORT_REPLY_TO` – sofern nicht schon gesendet oder angehalten. Die versendete Fassung wird im Drive-Ordner
   „Beiratsberichte Mieter-App“ abgelegt. Anschreiben und Signatur: `reportMail()` bzw. `CONFIG.REPORT_SIGNATURE`.
4. Menü **Mieter-App → Monatsbericht: Vorschau an mich** zeigt Bericht und Mail jederzeit vorab (nur an Sie).

## Löschkonzept und Überwachung (automatisch, täglich 3 Uhr)

`setup` richtet einen nächtlichen Wartungslauf ein:

**Löschkonzept** (Werte in `CONFIG.RETENTION`, bitte mit dem Beirat abstimmen):

| Daten | gelöscht nach |
|---|---|
| Erledigte Bewohner-Meldungen samt Fotos | 2 Jahren ab „Erledigt am“ |
| Erledigte Mängel vom Hausmeister samt Fotos | 2 Jahren |
| Zählerstände samt Fotos | 3 Jahren ab Ablesedatum |
| Tätigkeitsnachweise (Blatt „Reinigung“) samt Fotos | 2 Jahren |
| Vergangene Einträge im Reinigungsplan | 2 Jahren |
| Fehlerprotokoll | 90 Tagen |

Offene Vorgänge und Zeilen ohne gültiges Datum werden nie gelöscht. Fotos wandern in den Drive-Papierkorb
(Google leert ihn nach 30 Tagen). Sofort ausführen: Menü **Mieter-App → Alte Daten jetzt löschen**.

**Fehlerüberwachung:**
- Unerwartete Fehler im Backend landen im Blatt **Fehlerprotokoll**; zusätzlich kommt sofort eine Mail „Fehler im
  Backend“ (höchstens alle 3 Stunden).
- Fehler auf den Handys der Bewohner meldet die App ebenfalls dorthin (nur nach Zustimmung, ohne Namen/Eingaben).
- **Systemprüfung** jede Nacht: fehlende Einstellungen/Blätter/Automatiken, Mail-Kontingent, Foto-Ordner, Kalender,
  Fehler der letzten 24 Stunden, seit über 14 Tagen offene Meldungen. **Mail nur, wenn es etwas zu tun gibt.**
  Sofort ausführen: Menü **Mieter-App → Systemprüfung jetzt**.

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

### Tempo
- Die Startseite der Bewohner (Hinweise, Reinigung, Umfragen, Wetter) wird je Aufgang 60 Sekunden zwischengespeichert.
  Hinweise, Umfragen und Stimmen aus der App/dem Cockpit leeren den Speicher sofort; direkt in der Tabelle geänderte
  Hinweise erscheinen spätestens nach einer Minute.
- Umfrage-Stimmen werden je Aufruf nur einmal gelesen; ohne angemeldete Geräte kostet der Versand von Benachrichtigungen nichts.
- In der App liefert der Service Worker Programmdateien sofort aus dem Speicher; die Seite selbst kommt aus dem Netz,
  bei schlechtem Empfang nach höchstens 3 Sekunden aus dem Speicher.

### Sicherheits-Werkzeuge (Menü „Mieter-App“)
- **Zugangs-PIN ändern …** – neue PIN (6–12 Ziffern, keine Zahlenfolge). Gilt sofort; wer die App nutzt, wird beim nächsten
  Öffnen nach der neuen PIN gefragt. Die PIN steht nirgends im Code und nicht in der App.
- **Mitarbeiter-Link neu erzeugen …** – z. B. bei verlorenem Handy: Nummer eingeben, der alte Link ist sofort ungültig,
  der neue steht im Blatt „Mitarbeiter“.
- **Alarm-Mails:** Wird ein Schutz-Limit erreicht (falsche PINs, Meldungen, Stimmen, Anmeldungen, Aktionen eines persönlichen
  Links), kommt eine Mail an `NOTIFY_EMAIL` (je Limit höchstens alle 6 Stunden) mit Handlungsempfehlung.
- **Umfragen:** Mehr als 15 Stimmen innerhalb einer Stunde werden im Cockpit als auffällig markiert (mögliche Mehrfachabstimmung).


**Pen-Test (lokal, vor Einspielen):** Zugriffsschutz, Rechte Hausmeister/Verwaltung, Formel-Injection in allen
Blättern, Uploads (SVG/HTML, Größe, Dateinamen), manipulierte Nachweise, Überlastung, Erledigt-Link, Mail-Betreff sowie
im Browser eingeschleuster Code über jede Server-Antwort, manipulierte Adressen, Einbettung in fremde Seiten und
manipulierten Gerätespeicher – ohne offene Befunde. Bewusste Restrisiken: Die PIN ist öffentlich (Aushang); ein
abfotografierter QR-Code lässt sich auch woanders scannen; manuell gewählte und nachgesendete Nachweise sind in der
Spalte *Erfassung* gekennzeichnet. Wichtigster Schutz insgesamt: **2-Faktor-Anmeldung** für das Google-Konto und das
GitHub-Konto.

- **Zugangs-PIN:** Die App fragt die PIN einmal pro Gerät ab (erneut nach Widerruf oder PIN-Wechsel) (3 Fehlversuche → 15 Minuten Sperre auf dem Gerät).
  Das Backend prüft die PIN bei jeder Meldung und Statusabfrage selbst; nach 300 Fehlversuchen in 15 Minuten
  (alle Geräte zusammen) nimmt es 15 Minuten lang keine PIN an (bewusst hoch, damit Störer nicht alle Bewohner aussperren können). Der Erledigt-Link des Hausmeisters braucht keine PIN.
- **Missbrauchsbremse:** höchstens 40 Meldungen pro Stunde und 10 Hausmeister-Mails je 6 Stunden (insgesamt).
  Darüber hinaus werden Meldungen abgelehnt bzw. Aufträge nur in der Tabelle gespeichert (`CONFIG.LIMITS`).

- **Hausmeister-Zugänge:** 150 Aktionen pro Stunde je Zugang; unbenutzte Nummern gesperrt; Abmelden löscht Aufträge
  vom Gerät. Die Tabelle enthält die persönlichen Links – **nur mit Personen teilen, die sie wirklich brauchen**
  (Beiräte bekommen den Kalender, nicht die Tabelle).
- Eingaben werden serverseitig geprüft (Pflichtfelder, Werktags-Regel, Bildtyp, max. 6 MB).
- Formel-Injection wird verhindert (Eingaben, die mit `=`, `+`, `-`, `@`, Tab oder Zeilenumbruch beginnen, werden als Text gespeichert – auch in der Zähler-Übersicht).
- Ein unsichtbares Honeypot-Feld filtert einfache Spam-Bots.
- Die Daten liegen in Ihrem Google-Konto. Für den Livebetrieb bitte die Datenschutzerklärung der App um
  Google (Speicherung) ergänzen.

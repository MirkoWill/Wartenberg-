# Wiederherstellung der Mieter-App

Diese Anleitung liegt in jedem Backup (ZIP-Datei im Google Drive, Ordner **„Mieter-App Backups“**). Sie beschreibt,
wie die App wieder online geht, falls das GitHub-Konto oder GitHub selbst nicht mehr zur Verfügung steht.

## Was wo liegt

| Teil | Wo | Betroffen, wenn GitHub ausfällt? |
|---|---|---|
| **App** (alles, was Bewohner und Mitarbeiter im Browser sehen) | GitHub Pages, Adresse `app.willbrandt-kompagnon.de` | **ja** – aus diesem Backup wiederherstellen |
| **Backend** (`backend/Code.gs`) | Google Apps Script, an die Google-Tabelle gebunden | nein |
| **Daten** (Meldungen, Zählerstände, Nachweise, Mitarbeiter-Links …) | Google-Tabelle | nein |
| **Fotos** | Google Drive, Ordner „Mieter-App Fotos“ | nein |
| Reinigungsplan-Kalender | Google Kalender | nein |

Fällt nur GitHub aus, muss also **nur die App** neu ins Netz. Backend, Daten, PIN und Mitarbeiter-Links bleiben,
wie sie sind – die App spricht weiter mit demselben Backend.

## Inhalt des Backups

Das ZIP enthält das komplette Projekt (Ordner `Wartenberg--main/`):
`index.html`, `css/`, `js/`, `fonts/`, `icons/`, `assets/`, `vendor/`, `sw.js`, `manifest*.json`, `CNAME`
(= die App), `backend/` (Backend-Code und Anleitung), `tests/` (automatische Tests), `docs/`, `README.md`,
`CLAUDE.md` (Regeln und Aufbau für Claude). Nicht enthalten: Daten aus der Google-Tabelle (die liegen bei Google).

## Variante A – neues GitHub-Konto (wie bisher)

1. 💻 ZIP herunterladen und entpacken.
2. Auf github.com ein Konto anlegen bzw. anmelden → **New repository** (öffentlich) → Inhalt des Ordners
   `Wartenberg--main/` hochladen („uploading an existing file“, alle Dateien und Ordner hineinziehen).
3. Repository → **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, Ordner `/ (root)` → Save.
4. Unter **Custom domain** `app.willbrandt-kompagnon.de` eintragen, „Enforce HTTPS“ anhaken (geht erst, wenn Schritt 5 wirkt).
5. Beim Anbieter der Domain (DNS-Einstellungen von willbrandt-kompagnon.de) den Eintrag für **app** ändern:
   **Typ CNAME · Name `app` · Ziel `<neuer-github-name>.github.io`**. Wirkt nach Minuten bis wenigen Stunden.
6. Fertig – die installierten Apps auf den Handys laden beim nächsten Öffnen von der neuen Quelle.
   Am Code muss nichts geändert werden.

## Variante B – auf dem Strato-Webspace (ohne GitHub)

1. 💻 ZIP entpacken.
2. Im Strato-Kundenbereich eine **Subdomain `app.willbrandt-kompagnon.de`** anlegen und auf einen eigenen Ordner
   zeigen lassen (z. B. `/mieter-app`), **SSL-Zertifikat aktivieren** (ohne HTTPS funktionieren App-Installation,
   Offline-Modus und Benachrichtigungen nicht).
3. Per SFTP (z. B. FileZilla) den Inhalt von `Wartenberg--main/` in diesen Ordner hochladen. Die Ordner `tests/`,
   `backend/`, `docs/` und die Datei `CNAME` braucht der Webspace nicht (schaden aber auch nicht).
4. Liegt `app` bisher als CNAME bei GitHub, den DNS-Eintrag bei Strato auf den Webspace umstellen (macht Strato beim
   Anlegen der Subdomain meist automatisch, wenn die Domain dort verwaltet wird).
5. Wichtig: Es werden **keine PHP-Skripte** benötigt – die App besteht nur aus fertigen Dateien.

## Variante C – anderer Anbieter

Jeder Anbieter, der statische Dateien über **HTTPS** ausliefert, funktioniert (z. B. Netlify, Cloudflare Pages,
ein anderer Webspace). Inhalt von `Wartenberg--main/` hochladen, Domain `app.willbrandt-kompagnon.de` verbinden,
DNS-Eintrag `app` umstellen.

## Falls auch das Backend neu aufgebaut werden muss (nur wenn das Google-Konto verloren ist)

1. Neue Google-Tabelle anlegen → **Erweiterungen → Apps Script** → Inhalt von `backend/Code.gs` einfügen,
   in den Projekteinstellungen „appsscript.json im Editor anzeigen“ aktivieren und den Inhalt von
   `backend/appsscript.json` übernehmen.
2. Funktion **setup** ausführen (legt Blätter, Mitarbeiter-Links, Ordner und Zeitauslöser an), danach
   **Bereitstellen → Neue Bereitstellung → Web-App** (Ausführen als: ich, Zugriff: jeder).
3. Die neue Web-App-Adresse eintragen: in `js/config.js` bei `API_URL` und in `backend/Code.gs` bei `WEBAPP_URL`,
   dann die App wie oben neu veröffentlichen und Code.gs erneut einspielen.
4. Im Menü **Mieter-App → Zugangs-PIN ändern …** die PIN setzen, Script-Eigenschaft **NOTIFY_EMAIL** eintragen.
5. Die **Mitarbeiter-Links sind neu** (neue Tokens) und müssen neu verteilt werden; Bewohner geben die PIN neu ein.
6. Daten aus einer Sicherungskopie der Tabelle (falls vorhanden) in die neuen Blätter kopieren.
   Details: `backend/README.md`.

## Mit Claude wiederherstellen

Neue Claude-Code-Sitzung starten, das ZIP hochladen (oder ein neues Repository mit dem Inhalt verbinden) und schreiben:

> „Das ist das Backup der Mieter-App WEG Wartenberger Dorfkrug. Lies CLAUDE.md und docs/WIEDERHERSTELLUNG.md und
> hilf mir, die App nach Variante A/B wieder online zu bringen. Prüfe vorher mit den Tests, dass alles vollständig ist.“

`CLAUDE.md` enthält die festen Regeln, den Ablauf bei Änderungen und die Liste der Technik-Bestandteile;
`README.md`, `backend/README.md` und `docs/API.md` beschreiben Aufbau und Schnittstelle im Detail.

## Wie das Backup entsteht

Das Backend lädt am **2. jedes Monats um 4 Uhr** das Projekt als ZIP von GitHub und legt es im Google Drive ab
(Ordner „Mieter-App Backups“, die letzten **6** bleiben erhalten). Sofort auslösen: Menü **Mieter-App →
Code-Backup jetzt ins Google Drive**. Die Systemprüfung meldet, wenn das letzte Backup älter als 40 Tage ist.
Tipp: Gelegentlich ein Backup zusätzlich auf den eigenen PC herunterladen.

# Backend-Schnittstelle (Google Apps Script)

Fertiges Backend: [`backend/Code.gs`](../backend/Code.gs), Einrichtung siehe [`backend/README.md`](../backend/README.md).

Das Frontend sendet alle Formulare per `POST` an `APP_CONFIG.API_URL` (Apps-Script-Web-App, endet auf `/exec`).

- Header `Content-Type: text/plain;charset=utf-8`, damit **kein CORS-Preflight** entsteht, den Apps
  Script nicht beantworten kann. Der Body ist trotzdem JSON: `JSON.parse(e.postData.contents)`.
- Erwartete Antwort: JSON `{ "ok": true }` bzw. `{ "ok": false, "error": "..." }`
  (`ContentService.createTextOutput(JSON.stringify(...)).setMimeType(ContentService.MimeType.JSON)`).
- Die Web-App muss mit *Ausführen als: Ich* und *Zugriff: Jeder* bereitgestellt werden.

Jede Anfrage enthält zusätzlich:

| Feld | Beispiel | Bedeutung |
|---|---|---|
| `object` | `h1-a` | Aufgang-ID aus dem QR-Code |
| `house` | `Haus 1` | Hausname laut `js/config.js` |
| `entrance` | `Aufgang A` | Aufgangname |
| `submittedAt` | `2026-09-22T14:30:00.000Z` | Zeitpunkt im Browser (ISO-8601) |
| `website` | `""` | Honeypot, muss leer sein, sonst verwirft das Backend die Anfrage still |

Fehlermeldungen des Backends (`error`) werden dem Mieter direkt angezeigt, sie sind daher auf Deutsch formuliert.

## `submitTicket`

```jsonc
{
  "action": "submitTicket",
  "type": "Elektroraum",          // "Elektroraum" | "Klingelschild" | "Mangel"
  "wohnung": "Haus 12, Whg 04",
  "date": "2026-09-28",           // nur Elektroraum
  "name": "Müller",
  "details": "Telekom Techniker zwischen 10-12 Uhr",
  "telefon": "",                  // nur Elektroraum
  "kontakt": "",                  // nur Klingelschild
  "ort": "Keller",                // nur Mangel
  "photo": null                   // nur Mangel, optional, Format siehe unten
}
```

## `submitMeterReading` (Wasserzähler)

```jsonc
{
  "action": "submitMeterReading",
  "type": "Wasserzähler",
  "wohnung": "Whg 04",
  "raum": "Bad",
  "art": "Kalt",                  // "Kalt" | "Warm"
  "zaehlernummer": "WZ-123",
  "zaehlerstand": "123.456",      // Komma wird zu Punkt normalisiert
  "name": "Müller",
  "photo": { "name": "IMG_1234.jpg", "mimeType": "image/jpeg", "data": "<Base64>" }
}
```

Fotos werden im Browser auf max. 1600 px verkleinert und als JPEG (Qualität 0,8) kodiert, typischerweise
150–400 KB. Im Script z. B.:
`DriveApp.getFolderById(ID).createFile(Utilities.newBlob(Utilities.base64Decode(p.photo.data), p.photo.mimeType, p.photo.name))`.

## Hausmeister (Epic 3, Backend bereits vorbereitet)

Authentifizierung über ein geheimes Token je Hausmeister (Script-Eigenschaft `HAUSMEISTER_TOKENS`).
Das Backend ermittelt die Hausmeister-ID aus dem Token; ein mitgeschicktes `user`-Feld wird nicht vertraut.

```json
{ "action": "logCleaning", "token": "…", "areaToken": "TG_H12_XYZ", "timestamp": "2026-09-22T14:30:00Z" }
```

Auftragsliste: `GET <API_URL>?action=getTasks&token=…` →
`{ "ok": true, "tasks": [{ "id", "type", "status", "house", "entrance", "wohnung", "date", "details", "ort" }] }`
(alle Tickets, deren Status nicht `erledigt` ist, sortiert nach Termin).

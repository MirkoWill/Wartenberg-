# Backend-Schnittstelle (Google Apps Script)

Das Frontend sendet alle Formulare per `POST` an `APP_CONFIG.API_URL` (Apps-Script-Web-App, endet auf `/exec`).

- Header `Content-Type: text/plain;charset=utf-8`, damit **kein CORS-Preflight** entsteht, den Apps
  Script nicht beantworten kann. Der Body ist trotzdem JSON: `JSON.parse(e.postData.contents)`.
- Erwartete Antwort: JSON `{ "ok": true }` bzw. `{ "ok": false, "error": "..." }`
  (`ContentService.createTextOutput(JSON.stringify(...)).setMimeType(ContentService.MimeType.JSON)`).
- Die Web-App muss mit *Ausführen als: Ich* und *Zugriff: Jeder* bereitgestellt werden.

Jede Anfrage enthält zusätzlich `object` (Hausschlüssel, z. B. `dorfkrug`), `objectName` und `submittedAt` (ISO-8601).

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

## `logCleaning` (Epic 3, folgt)

```json
{ "action": "logCleaning", "areaToken": "TG_H12_XYZ", "timestamp": "2026-09-22T14:30:00Z", "user": "hm_becker" }
```

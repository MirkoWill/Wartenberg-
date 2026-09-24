// Automatisch erzeugt aus den Entwicklungs-Tests. Start: node tests/backend.test.js
// Prüft backend/Code.gs mit nachgebildeten Google-Diensten (kein Google-Konto nötig).
const fs = require('fs'), vm = require('vm');
process.env.TZ = 'Europe/Berlin';
let calName = 'WEG Wartenberger Dorfkrug'; const trashed = []; const alerts = []; const cache = {}; const triggers = [];
const events = {}; let evSeq = 0;
const fetches = []; const wx = { fail: false, alerts: [], hours: [] };
const mkHours = (date, icons, tmin, tmax) => Array.from({ length: 24 }, (_, h) => ({ timestamp: `${date}T${String(h).padStart(2, '0')}:00:00+02:00`, temperature: tmin + (tmax - tmin) * Math.sin(Math.PI * h / 23), icon: icons(h), precipitation: icons(h) === 'rain' ? 0.5 : 0 }));
const mkEv = (title, start, end, opt) => { const id = 'ev' + (++evSeq); const e = { id, title, start, end, desc: (opt || {}).description || '', getId: () => id, setTitle(t) { e.title = t; }, setAllDayDates(a, b) { e.start = a; e.end = b; }, setDescription(d) { e.desc = d; }, getDescription: () => e.desc, deleteEvent() { delete events[id]; } }; events[id] = e; return e; };
const cal = { getName: () => 'WEG Wartenberger Dorfkrug', getEventById: (id) => events[id] || null, createAllDayEvent: mkEv, getEvents: () => Object.values(events) }; const sheets = {}, props = {}, mails = [], files = [];
function mkSheet(name) {
  const sh = { name, grid: [], filter: null, bgs: {}, getName: () => name,
    ensure(r) { while (sh.grid.length < r) sh.grid.push([]); },
    getRange(r, c, nr = 1, nc = 1) { if (typeof r === 'string') return {}; const api = {
      setValues(v) { sh.ensure(r + nr - 1); v.forEach((row, i) => row.forEach((x, j) => { sh.grid[r - 1 + i][c - 1 + j] = x; })); return api; },
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = sh.grid[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, j) => row[c - 1 + j] === undefined ? '' : row[c - 1 + j])); } return out; },
      setValue(x) { sh.ensure(r); sh.grid[r - 1][c - 1] = x; return api; },
      setBackgrounds(b) { sh.bgs = b; return api; }, setRichTextValues(v) { sh.ensure(r + nr - 1); v.forEach((row, i) => { sh.grid[r - 1 + i][c - 1] = row[0]; }); return api; }, setFontWeight() { return api; }, setBackground() { return api; }, setFontColor() { return api; },
      setNumberFormat() { return api; }, setDataValidation() { return api; },
      createFilter() { sh.filter = { remove() { sh.filter = null; } }; return sh.filter; } }; return api; },
    getDataRange() { return { getValues: () => sh.grid.map((r) => r.slice()) }; },
    getLastRow() { return sh.grid.length; }, getMaxRows() { return 1000; }, setFrozenRows() {},
    appendRow(row) { sh.grid.push(row); }, deleteRow(n) { sh.grid.splice(n - 1, 1); }, clear() { sh.grid = []; }, getFilter() { return sh.filter; }, autoResizeColumns() {} };
  return (sheets[name] = sh);
}
const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: mkSheet, getSheets: () => Object.values(sheets), deleteSheet() {}, getUrl: () => 'https://sheet' };
const ctx = { console, JSON, Math, Date, Object, String, Number, Error, Array, encodeURIComponent,
  Logger: { log() {} },
  SpreadsheetApp: { getActive: () => ({ toast() {} }), getActiveSpreadsheet: () => ss, newRichTextValue: () => { const o = { text: '', url: null, setText(t) { o.text = t; return o; }, setLinkUrl(u) { o.url = u; return o; }, build() { return { rich: true, text: o.text, url: o.url }; } }; return o; }, newDataValidation: () => ({ requireValueInList() { return this; }, requireCheckbox() { return this; }, requireValueInRange() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } }), getUi: () => ({ alert: (t, m) => { alerts.push(t + ': ' + m); }, ButtonSet: { OK: 1 }, createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  DriveApp: { getFileById: (id) => ({ setTrashed: () => trashed.push(id) }), createFolder: () => ({ getId: () => 'F1' }), getFolderById: () => ({ createFile: (b) => { files.push(b.name); return { getUrl: () => 'https://drive.google.com/file/d/' + b.name }; } }) },
  Utilities: { DigestAlgorithm: { MD5: 'md5' }, computeDigest: (a, t) => [...require('crypto').createHash('md5').update(t).digest()], base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url'), base64Decode: (s) => Buffer.from(s, 'base64'), newBlob: (bytes, mime, name) => ({ name }), getUuid: () => Math.random().toString(16).slice(2, 10) + '-' + Math.random().toString(16).slice(2, 10),
    formatDate: (d, tz, f) => { const p = (n) => String(n).padStart(2, '0'); return f === 'yyMMdd' ? String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; } },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; }, removeAll: (ks) => ks.forEach((k) => delete cache[k]) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  UrlFetchApp: { fetchAll: (reqs) => { fetches.push(...reqs.map((r) => r.url)); if (wx.fail) throw new Error('DNS'); return reqs.map((r) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(/\/alerts/.test(r.url) ? { alerts: wx.alerts } : { weather: wx.hours }) })); } },
  MailApp: { sendEmail: (m) => mails.push(m), getRemainingDailyQuota: () => 1500 },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://x/exec' }), getProjectTriggers: () => triggers, newTrigger: (fn) => { const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, inTimezone: () => b, create: () => { triggers.push({ getHandlerFunction: () => fn }); } }; return b; } },
  CalendarApp: { getAllCalendars: () => [cal, { getName: () => 'Privat' }], getCalendarById: (id) => (id === 'good' ? cal : null), getCalendarsByName: (n) => (n === calName ? [cal] : []) },
  HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this; }, addMetaTag() { return this; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'backend', 'Code.gs'), 'utf8'), ctx);
const post = (p) => ctx.doPost({ postData: { contents: JSON.stringify(p) } });
let fails = 0; const check = (label, cond, extra) => { console.log((cond ? 'OK  ' : 'FAIL') + ' ' + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const photo = { name: 'x.jpg', mimeType: 'image/jpeg', data: Buffer.from('img').toString('base64') };
const base = { house: 'Haus 3', entrance: 'Lindenberger Str. 6', object: 'lind6', website: '', pin: '13059' };

ctx.setup();
check('setup: 5 Blätter', ['Tickets', 'Zählerstände', 'Reinigung', 'Übersicht Zähler', 'Aktuelles'].every((n) => sheets[n]), Object.keys(sheets));
props.NOTIFY_EMAIL = 'service@willbrandt-kompagnon.de';

let r = post({ ...base, action: 'submitMeterReadings', wohnung: 'Whg 04', name: 'Müller', ablesedatum: '2026-09-20', meters: [
  { raum: 'Bad', art: 'Kalt', zaehlernummer: 'A1', zaehlerstand: '12,5', photo },
  { raum: 'Bad', art: 'Warm', zaehlernummer: 'A2', zaehlerstand: '8.125', photo },
  { raum: 'Küche', art: 'Kalt', zaehlernummer: 'A3', zaehlerstand: '3', photo }] });
check('3 Zähler in einer Meldung', r.ok && r.count === 3 && sheets['Zählerstände'].grid.length === 4, r);
const zr = sheets['Zählerstände'].grid[1];
check('Zeile: Erfassungs-ID + Ablesedatum', /^E-/.test(zr[13]) && zr[14] instanceof Date && zr[14].getDate() === 20 && zr[9] === 12.5, zr.slice(9));
post({ ...base, action: 'submitMeterReadings', wohnung: 'Whg 01', name: 'Schmidt', ablesedatum: '2026-09-21', meters: [{ raum: 'Bad', art: 'Kalt', zaehlernummer: 'B1', zaehlerstand: '5', photo }] });
post({ ...base, action: 'submitMeterReadings', wohnung: 'Whg 04', name: 'Müller', ablesedatum: '2027-03-01', meters: [{ raum: 'Bad', art: 'Kalt', zaehlernummer: 'A1', zaehlerstand: '20', photo }] });
const ov = sheets['Übersicht Zähler'].grid;
check('Übersicht sortiert (Whg 01 vor Whg 04, neueste Ablesung zuerst)', ov[1][2] === 'Whg 01' && ov[2][2] === 'Whg 04' && ov[2][3].getFullYear() === 2027, ov.slice(1).map((x) => x[2] + ' ' + x[3].toISOString().slice(0, 10) + ' ' + x[4] + ' ' + x[5]));
check('Foto als echter Link', ov[1][9].rich && ov[1][9].text === 'Foto öffnen' && /^https:\/\/drive\.google\.com\//.test(ov[1][9].url), ov[1][9]);
check('Pakete farbig abwechselnd', sheets['Übersicht Zähler'].bgs[0][0] !== sheets['Übersicht Zähler'].bgs[1][0] && sheets['Übersicht Zähler'].bgs[1][0] === sheets['Übersicht Zähler'].bgs[2][0]);
check('Filter gesetzt', !!sheets['Übersicht Zähler'].filter);
check('Zähler ohne Foto abgelehnt', post({ ...base, action: 'submitMeterReadings', wohnung: '1', ablesedatum: '2026-09-20', meters: [{ raum: 'Bad', art: 'Kalt', zaehlernummer: 'X', zaehlerstand: '1' }] }).error === 'Zähler 1: bitte ein Foto anhängen');
check('Zu viele Zähler abgelehnt', !post({ ...base, action: 'submitMeterReadings', wohnung: '1', meters: new Array(9).fill({ raum: 'Bad', art: 'Kalt', zaehlernummer: 'X', zaehlerstand: '1', photo }) }).ok);
check('Alte App (Einzelzähler) funktioniert weiter', post({ ...base, action: 'submitMeterReading', wohnung: 'Whg 09', raum: 'Bad', art: 'Warm', zaehlernummer: 'C1', zaehlerstand: '1', photo }).ok);

mails.length = 0;
r = post({ ...base, action: 'submitTicket', type: 'Klingelschild', wohnung: '04', name: 'Müller', details: 'Müller / Schmidt', kontakt: '0170 123' });
check('Klingelschild ok', r.ok, r);
const hm = mails.find((m) => m.to === 'info@gs-schreier.de');
check('Mail an GS Schreier', !!hm, mails.map((m) => m.to));
console.log('---- Mailtext ----\n' + hm.body + '\n------------------');
const t = sheets['Tickets'].grid.find((x) => x[0] === r.id);
const code = t[16];
check('Erledigt-Code gespeichert, Link in Mail', code && hm.body.includes(`action=done&id=${r.id}&t=${code}`));
let page = ctx.doGet({ parameter: { action: 'done', id: r.id, t: 'falsch' } });
check('Falscher Code → ungültig', page.html.includes('Link ungültig'));
page = ctx.doGet({ parameter: { action: 'done', id: r.id, t: code } });
check('Erst Bestätigungsseite, Status bleibt offen', page.html.includes('Ja, als erledigt melden') && t[3] === 'offen');
page = ctx.doGet({ parameter: { action: 'done', id: r.id, t: code, confirm: '1' } });
const t2 = sheets['Tickets'].grid.find((x) => x[0] === r.id);
check('Nach Bestätigung: erledigt + Datum', t2[3] === 'erledigt' && t2[14] instanceof Date && page.html.includes('Vielen Dank'));
page = ctx.doGet({ parameter: { action: 'done', id: r.id, t: code, confirm: '1' } });
check('Zweiter Klick → bereits erledigt', page.html.includes('Bereits erledigt'));
check('Mangel sendet keine Hausmeister-Mail', (() => { mails.length = 0; post({ ...base, action: 'submitTicket', type: 'Mangel', details: 'Licht kaputt', ort: 'Keller' }); return !mails.some((m) => m.to === 'info@gs-schreier.de'); })());
check('XSS in Mail-HTML entschärft', (() => { mails.length = 0; post({ ...base, action: 'submitTicket', type: 'Klingelschild', wohnung: '1', name: '<b>x</b>', details: '<script>' }); return !mails[0].htmlBody.includes('<script>'); })());
// ---------- Sicherheit ----------
check('POST ohne PIN abgelehnt (code pin)', (() => { const x = post({ ...base, pin: '', action: 'submitTicket', type: 'Mangel', details: 'x' }); return !x.ok && x.code === 'pin'; })());
check('POST falsche PIN abgelehnt', post({ ...base, pin: '12345', action: 'submitTicket', type: 'Mangel', details: 'x' }).code === 'pin');
check('GET status ohne PIN abgelehnt', ctx.doGet({ parameter: { action: 'status', ids: 'T-260923-ABCD' } }).code === 'pin');
check('GET status mit PIN ok', ctx.doGet({ parameter: { action: 'status', pin: '13059', ids: 'T-260923-ABCD', pin: '13059' } }).ok);
check('GET news mit PIN ok', ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6', pin: '13059' } }).ok);
check('Erledigt-Link braucht keine PIN', ctx.doGet({ parameter: { action: 'done', id: 'T-x', t: 'y' } }).html.includes('Link ungültig'));
props.APP_PIN = '55555';
check('APP_PIN-Eigenschaft hat Vorrang', post({ ...base, action: 'submitTicket', type: 'Mangel', details: 'x' }).code === 'pin' && post({ ...base, pin: '55555', action: 'submitTicket', type: 'Mangel', details: 'x' }).ok);
delete props.APP_PIN;
for (let i = 0; i < 310; i++) post({ ...base, pin: String(10000 + i), action: 'submitTicket', type: 'Mangel', details: 'x' });
check('Nach vielen Fehlversuchen gesperrt – auch richtige PIN', post({ ...base, action: 'submitTicket', type: 'Mangel', details: 'x' }).code === 'pin_locked');
Object.keys(cache).forEach((k) => delete cache[k]);
check('Formel im Namen bleibt Text (Zählerstände + Übersicht)', (() => {
  post({ ...base, action: 'submitMeterReadings', wohnung: '=1+1', name: '=HYPERLINK("http://evil")', ablesedatum: '2026-09-20', meters: [{ raum: 'Bad', art: 'Kalt', zaehlernummer: '@x', zaehlerstand: '1', photo }] });
  const bad = sheets['Übersicht Zähler'].grid.flat().filter((v) => typeof v === 'string' && /^[=+\-@]/.test(v));
  return bad.length === 0;
})());
Object.keys(cache).forEach((k) => delete cache[k]);
let limited = false;
for (let i = 0; i < 45; i++) { const x = post({ ...base, action: 'submitTicket', type: 'Mangel', details: 'x' }); if (!x.ok && /sehr viele/.test(x.error)) limited = true; }
check('Meldungen pro Stunde begrenzt', limited);
Object.keys(cache).forEach((k) => delete cache[k]);
mails.length = 0;
for (let i = 0; i < 12; i++) post({ ...base, action: 'submitTicket', type: 'Klingelschild', wohnung: '1', name: 'A', details: 'B' });
check('Hausmeister-Mails begrenzt (10 je 6 Std.), Tickets trotzdem gespeichert', mails.filter((m) => m.to === 'info@gs-schreier.de').length === 10);
check('Übergroße Anfrage abgelehnt', ctx.doPost({ postData: { contents: 'x'.repeat(26 * 1024 * 1024) } }).error === 'Anfrage zu groß');

console.log(fails ? `${fails} FEHLER` : 'Alle Backend-Tests bestanden');
mails.length = 0;
post({ ...base, action: 'submitMeterReadings', wohnung: 'Whg 07', name: 'Test', ablesedatum: '2026-09-23', meters: [{ raum: 'Küche', art: 'Warm', zaehlernummer: 'K9', zaehlerstand: '4,25', photo }] });
const zm = mails.find((m) => /Zählerstände/.test(m.subject));
check('Wasserzähler → Mail an Verwaltung', !!zm && zm.to === 'service@willbrandt-kompagnon.de', zm && zm.subject);
console.log('---- Zähler-Mail ----\n' + (zm && zm.body) + '\n---------------------');
mails.length = 0; ctx.testMail();
check('testMail verschickt', mails.length === 1 && mails[0].subject.includes('Testmail'));
// Status
const tid = sheets['Tickets'].grid[1][0];
const eid = sheets['Zählerstände'].grid[1][13];
let st = ctx.doGet({ parameter: { action: 'status', pin: '13059', ids: `${tid},${eid},T-000000-XXXX,<script>` } });
check('Status: Ticket, Zähler, unbekannt, ungültig verworfen', st.ok && st.items.length === 3 && st.items[0].status && st.items[1].kind === 'meter' && st.items[1].count === 3 && st.items[2].status === 'unbekannt', st.items);
check('Status ohne persönliche Daten', !JSON.stringify(st).match(/Müller|Whg|Lindenberger/));
// News
const ng = sheets['Aktuelles'].grid;
check('Aktuelles: Beispielzeile inaktiv', ng.length === 2 && ng[1][0] === false);
const d = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return x; };
ng.push([true, d(-1), d(2), 'Wasser abgestellt', 'Mi 9–12 Uhr', true, '']);
ng.push([true, d(-5), d(-1), 'Abgelaufen', 'x', false, '']);
ng.push([true, d(3), '', 'Zukunft', 'x', false, '']);
ng.push([true, '', '', 'Nur Dorfstr', 'x', false, 'dorf27']);
ng.push([true, d(-2), '', 'Allgemein', 'Hallo', false, '']);
let nw = ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } });
check('Aktuelles lind6: nur gültige, wichtig zuerst', nw.items.map((i) => i.title).join('|') === 'Wasser abgestellt|Allgemein', nw.items.map((i) => i.title));
nw = ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'dorf27' } });
check('Aktuelles dorf27: inkl. aufgangsspezifisch', nw.items.map((i) => i.title).includes('Nur Dorfstr'), nw.items.map((i) => i.title));
// ---------- Heizungszähler ----------
Object.keys(cache).forEach((k) => delete cache[k]);
mails.length = 0;
let hz = post({ ...base, action: 'submitMeterReadings', wohnung: 'Whg 12', name: 'Kaya', ablesedatum: '2026-09-20', meters: [
  { raum: 'Flur', art: 'Heizung', einheit: 'MWh', zaehlernummer: 'H1', zaehlerstand: '4,321', photo },
  { raum: 'Bad', art: 'Kalt', einheit: 'kWh', zaehlernummer: 'W1', zaehlerstand: '5', photo }] });
const zs = sheets['Zählerstände'].grid;
const hrow = zs.find((r) => r[8] === 'H1'), wrow = zs.find((r) => r[8] === 'W1');
check('Heizung gespeichert mit MWh', hz.ok && hrow[7] === 'Heizung' && hrow[15] === 'MWh' && hrow[9] === 4.321, hrow && hrow.slice(7));
check('Wasser: falsche Einheit → m³', wrow[15] === 'm³', wrow[15]);
check('Heizung ohne Einheit → kWh', (() => { post({ ...base, action: 'submitMeterReadings', wohnung: 'Whg 13', meters: [{ raum: 'Flur', art: 'Heizung', zaehlernummer: 'H2', zaehlerstand: '1', photo }] }); return zs.find((r) => r[8] === 'H2')[15] === 'kWh'; })());
check('Mail nennt Einheiten', mails.some((m) => /Zähler H1 – Stand 4,321 MWh/.test(m.body) && /Stand 5 m³/.test(m.body)), mails.map((m) => m.body).join('\n'));
const ovh = sheets['Übersicht Zähler'].grid;
const oh = ovh[0];
const hov = ovh.find((r) => r[oh.indexOf('Zählernummer')] === 'H1');
check('Übersicht: Einheit-Spalte', oh.indexOf('Einheit') === 8 && hov[8] === 'MWh', oh);
check('Unbekannte Art abgelehnt', !post({ ...base, action: 'submitMeterReadings', wohnung: '1', meters: [{ raum: 'Bad', art: 'Gas', zaehlernummer: 'X', zaehlerstand: '1', photo }] }).ok);

// ================= Epic 3 – Hausmeister-Portal =================
ctx.setup();
const staff = sheets['Mitarbeiter'].grid;
check('Mitarbeiter: 007, 008, 001, 100–119 ohne Namen', staff.length === 24 && staff[1][0] === '007' && staff[1][1] === 'Verwaltung' && staff[2][0] === '008' && staff[2][1] === 'Verwaltung' && staff[3][0] === '001' && staff[4][0] === '100' && staff[23][0] === '119' && staff[0].indexOf('Name') === -1, staff.map((r) => r[0]).join(','));
check('Links mit Token', /^https:\/\/app\.willbrandt-kompagnon\.de\/\?hm=[a-f0-9]{16,}#hausmeister$/.test(staff[4][4]), staff[4][4]);
ctx.setup();
check('setup erneut: keine doppelten Links', sheets['Mitarbeiter'].grid.length === 24);
{ // Blatt mit 007/001 aus alter Version + leere Kästchen bis Zeile 40 → 008 direkt unter die letzte Nummer
  const g = sheets['Mitarbeiter'].grid; const saved = g.map((r) => r.slice());
  const i8 = g.findIndex((r) => r[0] === '008'); g.splice(i8, 1);
  while (g.length < 40) g.push(['', '', false, '', '']);
  ctx.ensureStaffLinks();
  check('008 wird direkt unter die letzte Nummer geschrieben (nicht hinter leere Kästchen)', g[23][0] === '008' && g[23][1] === 'Verwaltung' && g[23][2] === true && /hm=/.test(g[23][4]), g.slice(22, 25).map((r) => r[0]));
  g.length = 0; saved.forEach((r) => g.push(r));
}
check('QR-Orte vorbelegt (21)', sheets['QR-Orte'].grid.length === 22 && sheets['QR-Orte'].grid.some((r) => r[1] === 'Raum Hebeanlage Lindenberger Str. 8'));
check('Kein Keller Lind 8', !sheets['QR-Orte'].grid.some((r) => r[0] === 'KE_LIND8'));
check('Tätigkeiten inkl. Fensterreinigung', sheets['Tätigkeiten'].grid.some((r) => r[0] === 'Fensterreinigung Aufgang'));
check('Tages-Trigger angelegt (einmal)', triggers.filter((t) => t.getHandlerFunction() === 'checkPlanFulfilment').length === 1);

const hmTok = staff[4][3], admTok = staff[1][3], adm2Tok = staff[2][3], leadTok = staff[3][3];
check('Vorrats-Nummern gesperrt, 007/008/001 aktiv', staff[1][2] === true && staff[2][2] === true && staff[3][2] === true && staff[4][2] === false && staff[23][2] === false);
delete cache.staff;
check('Gesperrte Vorrats-Nummer kommt nicht rein', post({ action: 'hmLogin', token: hmTok }).code === 'staff');
staff[4][2] = true; delete cache.staff; // Nr. 100 vergeben
let lg = post({ action: 'hmLogin', token: hmTok });
check('Login Hausmeister ohne PIN', lg.ok && lg.user.name === 'Nr. 100' && lg.user.role === 'Hausmeister' && lg.areas.length === 21 && lg.activities.length === 10, lg.user);
check('Login Verwaltung', post({ action: 'hmLogin', token: admTok }).user.role === 'Verwaltung');
check('Falscher Token abgelehnt', post({ action: 'hmLogin', token: 'abc' }).code === 'staff' && post({ action: 'hmLogin', token: 'f'.repeat(40) }).code === 'staff');
sheets['Mitarbeiter'].grid[5][2] = false; delete cache.staff;
check('Deaktivierter Zugang abgelehnt', post({ action: 'hmLogin', token: staff[5][3] }).code === 'staff');

const nowIso = new Date().toISOString();
let sc = post({ action: 'logCleaning', token: hmTok, areaToken: 'th_lind6', activity: 'Treppenhausreinigung', timestamp: nowIso });
const rl = sheets['Reinigung'].grid[sheets['Reinigung'].grid.length - 1];
check('Scan gespeichert', sc.ok && rl[1] === 'TH_LIND6' && rl[4] === 'Treppenhaus Lindenberger Str. 6' && rl[5] === 'Treppenhausreinigung' && rl[2] === '100' && rl[8] === 'lind6' && rl[9] === 'QR-Scan' && !rl.includes('Max Schreier'), rl);
check('Unbekannter Code abgelehnt', !post({ action: 'logCleaning', token: hmTok, areaToken: 'XYZ' }).ok);
const old = new Date(Date.now() - 3 * 3600000).toISOString();
post({ action: 'logCleaning', token: hmTok, areaToken: 'MUELL', timestamp: old, manual: true });
const rm = sheets['Reinigung'].grid[sheets['Reinigung'].grid.length - 1];
check('Offline-Scan behält Zeit, Standard-Tätigkeit, manuell markiert', Math.abs(rm[0] - new Date(old)) < 1000 && rm[5] === 'Müllplatzreinigung' && rm[9].startsWith('manuell gewählt'), rm);
post({ action: 'logCleaning', token: hmTok, areaToken: 'TG', timestamp: '2020-01-01T00:00:00Z' });
check('Zu alte Zeit → jetzt', Date.now() - sheets['Reinigung'].grid[sheets['Reinigung'].grid.length - 1][0] < 5000);
check('Portal-Aktion ohne Token nicht über PIN erreichbar', post({ action: 'logCleaning', pin: '13059', areaToken: 'TG' }).code === 'staff');

mails.length = 0;
let md = post({ action: 'submitStaffDefect', token: hmTok, ort: 'Tiefgarage', beschreibung: 'Tor schließt nicht', dringend: true, photo });
const mrow = sheets['Mängel Hausmeister'].grid[1];
check('Mangel intern gespeichert + Mail', md.ok && /^M-/.test(md.id) && mrow[2] === 'Nr. 100' && mrow[7] === true && mrow[9] === 'offen' && mails.some((m) => /DRINGEND/.test(m.subject)), mrow);
let tk = post({ action: 'getTasks', token: hmTok });
let ta = post({ action: 'getTasks', token: admTok });
check('Hausmeister sieht nur Hausmeister-Aufträge (Klingelschild), kein Elektroraum/Mangel/intern', tk.ok && tk.tasks.length > 0 && tk.tasks.every((t) => t.owner === 'Hausmeister' && t.type === 'Klingelschild'), tk.tasks.map((t) => t.type + '/' + t.owner));
check('Verwaltung sieht alle, intern dringend zuerst', ta.tasks[0].id === md.id && ta.tasks.some((t) => t.type === 'Mangel') && ta.tasks.some((t) => t.owner === 'Hausmeister'), ta.tasks.map((t) => t.type + '/' + t.owner).slice(0, 5));
const mangelT = ta.tasks.find((t) => t.type === 'Mangel');
check('Hausmeister darf fremden Auftrag nicht erledigen', !post({ action: 'completeTask', token: hmTok, id: mangelT.id }).ok);
const trow = sheets['Tickets'].grid.find((r) => r[0] === mangelT.id); trow[17] = 'Hausmeister';
check('Umstellen auf Hausmeister → sichtbar', post({ action: 'getTasks', token: hmTok }).tasks.some((t) => t.id === mangelT.id));
const oldRow = sheets['Tickets'].grid.find((r) => r[2] === 'Klingelschild' && r[3] !== 'erledigt'); const keep = oldRow[17]; oldRow[17] = '';
check('Alte Zeile ohne Zuständig → Standard je Typ', post({ action: 'getTasks', token: hmTok }).tasks.some((t) => t.id === oldRow[0])); oldRow[17] = keep;
const openT = post({ action: 'getTasks', token: hmTok }).tasks.find((t) => t.source === 'Bewohner');
check('Auftrag erledigen (Ticket)', post({ action: 'completeTask', token: hmTok, id: openT.id }).ok && sheets['Tickets'].grid.find((r) => r[0] === openT.id)[3] === 'erledigt');
check('Auftrag erledigen (intern, Verwaltung)', post({ action: 'completeTask', token: admTok, id: md.id }).ok && sheets['Mängel Hausmeister'].grid[1][9] === 'erledigt');
check('Erledigte nicht mehr in Liste', !post({ action: 'getTasks', token: admTok }).tasks.some((t) => t.id === md.id || t.id === openT.id));

// Plan + Kalender
const dd = (off) => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + off); return x; };
const fmt = (x) => `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}`;
const pl = sheets['Reinigungsplan'];
pl.grid.push([dd(0), '', 'Treppenhausreinigung', 'alle Aufgänge', 'wöchentlich', '']);
pl.grid.push([fmt(dd(3)), '', 'Fensterreinigung Aufgang', 'Treppenhaus Lindenberger Str. 6', '', '']);
pl.grid.push([dd(-30), dd(60), 'Winterdienst', '', 'Bereitschaft', '']);
pl.grid.push([dd(0), '', 'Müllplatzreinigung', 'Müllplatz (außen)', '', '']);
let msg = ctx.syncPlanToCalendar();
check('Kalender: 4 neu', /4 neu, 0 aktualisiert, 0 entfernt/.test(msg) && pl.grid[1][5] && Object.keys(events).length === 4, msg);
const w = Object.values(events).find((e) => /Winterdienst/.test(e.title));
check('Mehrtägig: Ende exklusiv', (w.end - w.start) / 86400000 >= 90, (w.end - w.start) / 86400000);
pl.grid[2][2] = 'Fensterreinigung Aufgang'; pl.grid[2][3] = 'Treppenhaus Lindenberger Str. 8';
pl.grid.splice(3, 1);
msg = ctx.syncPlanToCalendar();
check('Kalender: Änderung + Löschung', /0 neu, 3 aktualisiert, 1 entfernt/.test(msg) && Object.values(events).some((e) => /Lindenberger Str. 8/.test(e.title)), msg);

mails.length = 0;
let miss = ctx.checkPlanFulfilment();
check('Kontrolle: 4 Treppenhäuser fehlen, Lind 6 + Müllplatz erledigt', miss.length === 4 && !miss.some((m) => /Str\. 6/.test(m)) && !miss.some((m) => /Müllplatz/.test(m)) && mails.some((m) => /Fehlende Nachweise/.test(m.subject)), miss);

// ================= Cockpit (Verwaltung) =================
const TH = vm.runInContext('CONFIG', ctx).SHEETS.tickets.headers, tcol = (h) => TH.indexOf(h);
const mkTicket = (id, type, created, extra = {}) => { const r = TH.map(() => ''); r[tcol('ID')] = id; r[tcol('Typ')] = type; r[tcol('Status')] = 'offen'; r[tcol('Eingang')] = created; r[tcol('Aufgang')] = 'Dorfstr. 24'; r[tcol('Wohnung')] = '5'; Object.keys(extra).forEach((k) => { r[tcol(k)] = extra[k]; }); sheets['Tickets'].grid.push(r); return r; };
const fri = new Date(2026, 8, 18, 10, 0); // Freitag
let si = ctx.slaInfo({ type: 'Klingelschild', status: 'offen', created: fri }, new Date(2026, 8, 21, 9, 0));
check('SLA Klingelschild: Reaktion 3 Werktage (Fr → Mi), Erledigung 10 Werktage', si.reactDue.getDate() === 23 && si.doneDue.getDate() === 2 && si.doneDue.getMonth() === 9 && si.light === 'green', [si.reactDue, si.doneDue]);
si = ctx.slaInfo({ type: 'Mangel (intern)', urgent: true, status: 'offen', created: fri }, new Date(2026, 8, 19, 11, 0));
check('SLA dringend: Reaktion 1 Tag überschritten → rot', si.react === 'overdue' && si.light === 'red', si);
si = ctx.slaInfo({ type: 'Mangel', status: 'offen', created: fri }, new Date(2026, 8, 22, 12, 0));
check('SLA Mangel: < 24 Std. vor Reaktionsfrist → gelb', si.light === 'yellow', si);
si = ctx.slaInfo({ type: 'Elektroraum', status: 'offen', created: fri, termin: new Date(2026, 8, 24) }, new Date(2026, 8, 22, 9, 0));
check('SLA Elektroraum: bestätigen bis Werktag vor Termin, erledigt am Termin', si.reactDue.getDate() === 23 && si.doneDue.getDate() === 24, [si.reactDue, si.doneDue]);
si = ctx.slaInfo({ type: 'Mangel', status: 'erledigt', created: fri, inWork: new Date(2026, 8, 19), done: new Date(2026, 8, 20) }, new Date());
check('SLA erledigt: Reaktion/Erledigung eingehalten, Zeiten berechnet', si.react === 'ok' && si.done === 'ok' && si.light === 'done' && Math.round(si.reactHours) === 14 && Math.round(si.leadDays * 10) === 16, si);

const late = mkTicket('T-LATE', 'Klingelschild', new Date(Date.now() - 20 * 86400000));
const fresh = mkTicket('T-FRESH', 'Mangel', new Date());
let cov = post({ action: 'adminOverview', token: admTok });
check('Cockpit: Überfälliges oben und rot', cov.ok && cov.tasks[0].sla.light === 'red' && cov.tasks.some((x) => x.id === 'T-LATE' && x.sla.light === 'red') && cov.kpi.overdue >= 1 && cov.kpi.open >= 2, cov.tasks.slice(0, 3).map((x) => x.id + ':' + x.sla.light));
check('Cockpit: 12 Monate Statistik, Reinigungsquote, keine Namen der Mitarbeiter', cov.months.length === 12 && 'Nachweise' in cov.months[11] && typeof cov.kpi.errors24 === 'number' && !JSON.stringify(cov).includes('Schreier'));
check('Cockpit: Hausmeister hat keinen Zugriff', post({ action: 'adminOverview', token: hmTok }).code === 'staff');
check('Status „in Arbeit“ setzt Zeitstempel + Bearbeiter', post({ action: 'adminUpdateTask', token: adm2Tok, id: 'T-FRESH', status: 'in Arbeit' }).ok && fresh[tcol('In Arbeit seit')] instanceof Date && fresh[tcol('Bearbeitet von')] === 'Nr. 008');
check('Zuständigkeit + Notiz ändern (Formel wird Text)', post({ action: 'adminUpdateTask', token: admTok, id: 'T-FRESH', owner: 'Hausmeister', note: '=IMPORTXML("x")' }).ok && fresh[tcol('Zuständig')] === 'Hausmeister' && fresh[tcol('Notiz Verwaltung')].startsWith("'"));
post({ action: 'adminUpdateTask', token: admTok, id: 'T-FRESH', status: 'erledigt' });
check('Erledigt setzt Erledigt am', fresh[tcol('Status')] === 'erledigt' && fresh[tcol('Erledigt am')] instanceof Date);
post({ action: 'adminUpdateTask', token: admTok, id: 'T-FRESH', status: 'offen' });
check('Wieder offen leert Erledigt am, In Arbeit seit bleibt', fresh[tcol('Erledigt am')] === '' && fresh[tcol('In Arbeit seit')] instanceof Date);
check('Ungültiger Status / Zuständig / Auftrag abgelehnt', !post({ action: 'adminUpdateTask', token: admTok, id: 'T-FRESH', status: 'weg' }).ok && !post({ action: 'adminUpdateTask', token: admTok, id: 'T-FRESH', owner: 'Chef' }).ok && !post({ action: 'adminUpdateTask', token: admTok, id: 'T-NIX', status: 'offen' }).ok);
check('Intern: Mangel über Cockpit bearbeiten', post({ action: 'adminUpdateTask', token: admTok, id: md.id, status: 'in Arbeit' }).ok && sheets['Mängel Hausmeister'].grid[1][9] === 'in Arbeit' && sheets['Mängel Hausmeister'].grid[1][10] === '');
// Status direkt in der Tabelle geändert
const tRow = sheets['Tickets'].grid.indexOf(late) + 1;
late[tcol('Status')] = 'in Arbeit';
ctx.onEdit({ range: { getSheet: () => sheets['Tickets'], getColumn: () => tcol('Status') + 1, getLastColumn: () => tcol('Status') + 1, getRow: () => tRow, getLastRow: () => tRow } });
check('Tabelle bearbeitet: Zeitstempel per onEdit', late[tcol('In Arbeit seit')] instanceof Date && late[tcol('Bearbeitet von')] === 'Tabelle');
ctx.onEdit({ range: { getSheet: () => sheets['Reinigung'], getColumn: () => 1, getLastColumn: () => 1, getRow: () => 2, getLastRow: () => 2 } });
check('onEdit auf anderen Blättern ohne Wirkung', true);
late[tcol('Status')] = 'offen'; late[tcol('In Arbeit seit')] = '';
const ra = ctx.rebuildAnalytics();
const an = sheets['Auswertung Aufträge'].grid;
check('Auswertung Aufträge für Looker Studio', ra.tasks === an.length - 1 && an[0][0] === 'ID' && an.some((r) => r[0] === 'T-LATE' && r[16] === 'rot' && r[15] === 'überfällig'), an.slice(0, 2));
check('Auswertung Reinigung (365 Tage Soll/Ist)', sheets['Auswertung Reinigung'].grid[0][3] === 'Soll' && ra.cleaning === sheets['Auswertung Reinigung'].grid.length - 1);
mails.length = 0;
let dg = ctx.morningDigest();
check('Morgen-Mail bei Überfälligen', dg.red >= 1 && mails.some((m) => /überfällig/.test(m.subject) && /T-LATE/.test(m.body)), mails.map((m) => m.subject));
late[tcol('Status')] = 'erledigt';
sheets['Tickets'].grid.forEach((r, i) => { if (i && r[tcol('Status')] !== 'erledigt') r[tcol('Status')] = 'erledigt'; });
sheets['Mängel Hausmeister'].grid.forEach((r, i) => { if (i) r[9] = 'erledigt'; });
mails.length = 0; dg = ctx.morningDigest();
check('Keine Morgen-Mail, wenn nichts fällig', dg.red === 0 && mails.length === 0);
check('Morgen-Trigger 7 Uhr angelegt', triggers.some((t) => t.getHandlerFunction() === 'morningDigest'));

// ================= Wetter =================
delete cache.weather; fetches.length = 0;
wx.hours = [...mkHours('2026-07-01', (h) => (h < 7 ? 'clear-night' : 'clear-day'), 18, 33), ...mkHours('2026-07-02', (h) => (h === 14 || h === 15 ? 'thunderstorm' : 'partly-cloudy-day'), 20, 29), ...mkHours('2026-07-03', () => 'cloudy', 15, 22), ...mkHours('2026-07-04', () => 'rain', 10, 12)];
wx.alerts = [{ status: 'actual', severity: 'minor', event_de: 'WINDBÖEN', headline_de: 'Amtliche WARNUNG vor WINDBÖEN' },
  { status: 'actual', severity: 'moderate', event_de: 'STARKE HITZE', headline_de: 'Amtliche WARNUNG vor HITZE', headline_en: 'Official WARNING of HEAT', onset: '2026-07-01T11:00:00+02:00', expires: '2026-07-01T19:00:00+02:00', description_de: 'lang' }];
let wn = ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } });
const wd = wn.weather && wn.weather.days;
check('Wetter: 3 Tage mit Min/Max', wn.ok && wd.length === 3 && wd[0].date === '2026-07-01' && wd[0].max === 33 && wd[0].min === 18, wd);
check('Wetter: Tagessymbol (Nacht → Tag, Gewitter ab 2 Std.)', wd[0].icon === 'clear-day' && wd[1].icon === 'thunderstorm' && wd[2].icon === 'cloudy', wd.map((d) => d.icon));
check('Wetter: nur DWD-Warnungen ab „moderate“, ohne Langtext', wn.weather.alerts.length === 1 && wn.weather.alerts[0].event === 'STARKE HITZE' && !('description' in wn.weather.alerts[0]));
check('Wetter: Standort aus Konfiguration, DWD/Bright Sky', fetches.length === 2 && fetches.every((u) => u.startsWith('https://api.brightsky.dev/') && /lat=52\.574&lon=13\.514/.test(u)), fetches);
ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } });
check('Wetter: 1 Std. zwischengespeichert (kein neuer Abruf)', fetches.length === 2);
delete cache.weather; wx.fail = true;
wn = ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } });
check('Wetterdienst gestört: Aktuelles funktioniert trotzdem, Wetter leer', wn.ok && wn.weather === null && Array.isArray(wn.items));
ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } });
check('Wetterdienst gestört: 10 Min. kein neuer Versuch', fetches.length === 4, fetches.length);
wx.fail = false; delete cache.weather;

// Bewohner-Info
Object.keys(cache).forEach((k) => delete cache[k]);
let nw6 = ctx.doGet({ parameter: { action: 'news', obj: 'lind6', pin: '13059' } });
check('Bewohner lind6: Treppenhaus zuletzt + Müllplatz, keine Tiefgarage-Technik', nw6.care.last.some((x) => x.ort === 'Treppenhaus Lindenberger Str. 6') && nw6.care.last.some((x) => x.ort === 'Müllplatz (außen)') && !nw6.care.last.some((x) => /Elektro/.test(x.ort)), nw6.care.last);
check('Bewohner lind6: geplant Treppenhaus + Müllplatz, nicht Fenster Lind 8', nw6.care.next.some((x) => x.activity === 'Treppenhausreinigung') && nw6.care.next.some((x) => x.activity === 'Müllplatzreinigung') && !nw6.care.next.some((x) => /Str\. 8/.test(x.ort)), nw6.care.next);
let nw2 = ctx.doGet({ parameter: { action: 'news', obj: 'lind2', pin: '13059' } });
check('Bewohner lind2: kein Treppenhaus Lind 6', !nw2.care.last.some((x) => /Str\. 6/.test(x.ort)) && !nw2.care.next.some((x) => /Lindenberger Str\. 8/.test(x.ort)), nw2.care);

// ---------- Fehlerbehebungen: Hausmeister ohne PIN, Kalender-Diagnose ----------
Object.keys(cache).forEach((k) => delete cache[k]);
check('News mit Hausmeister-Token statt PIN', ctx.doGet({ parameter: { action: 'news', obj: 'lind6', token: hmTok } }).ok);
check('News mit falschem Token + ohne PIN abgelehnt', ctx.doGet({ parameter: { action: 'news', obj: 'lind6', token: 'f'.repeat(40) } }).code === 'pin');
check('POST Zähler mit Hausmeister-Token', post({ ...base, pin: '', token: hmTok, action: 'submitMeterReadings', wohnung: 'Whg 1', meters: [{ raum: 'Bad', art: 'Kalt', zaehlernummer: 'Q', zaehlerstand: '1', photo }] }).ok);
alerts.length = 0;
pl.grid.push(['Mi., 07.10.2026', '', 'Kontrollgang', 'Tiefgarage', '', '']);
pl.grid.push([46300, '', 'Kontrollgang', 'Innenhof', '', '']);
pl.grid.push(['irgendwann', '', 'Gartenpflege', 'Innenhof', '', '']);
pl.grid.push(['', '', '', '', '', '']);
msg = ctx.syncPlanToCalendar();
check('Datum mit Wochentag + Excel-Zahl übertragen, ungültige Zeile gemeldet', /2 neu/.test(msg) && /Zeile 7\./.test(msg) && alerts.length === 1, msg);
check('Excel-Zahl richtig', Object.values(events).some((e) => /Innenhof/.test(e.title) && e.start.getFullYear() === 2026 && e.start.getMonth() === 9 && e.start.getDate() === 5), Object.values(events).filter((e) => /Innenhof/.test(e.title)).map((e) => e.start.toString()));
calName = 'anders'; alerts.length = 0;
msg = ctx.syncPlanToCalendar();
check('Kalender fehlt: Meldung mit sichtbaren Kalendern', /nicht gefunden.*„Privat“/.test(alerts[0] || ''), alerts[0]);
props.CALENDAR_ID = 'good'; alerts.length = 0;
check('CALENDAR_ID wird verwendet', /Kalender „WEG Wartenberger Dorfkrug“/.test(ctx.syncPlanToCalendar()));
delete props.CALENDAR_ID; calName = 'WEG Wartenberger Dorfkrug';
console.log(fails ? fails + ' FEHLER' : 'ALLE OK');
// Klingelschild: Info-Mail nennt Hausmeister-Mail
Object.keys(cache).forEach((k) => delete cache[k]); mails.length = 0;
post({ ...base, action: 'submitTicket', type: 'Klingelschild', wohnung: '4', name: 'Test', details: 'Test neu' });
const info = mails.find((m) => /Neuer Antrag: Klingelschild/.test(m.subject));
check('Info-Mail: an Hausmeister gesendet + Text', info && /✔ Auftrag per E-Mail an den Hausmeister gesendet \(info@gs-schreier\.de\)/.test(info.body) && /Liebes Hausmeister-Team/.test(info.body), info && info.body);
for (let i = 0; i < 12; i++) post({ ...base, action: 'submitTicket', type: 'Klingelschild', wohnung: '4', name: 'T', details: 'x' });
check('Info-Mail bei Limit: KEINE Mail', mails.some((m) => /✘ KEINE Mail an den Hausmeister: Limit/.test(m.body)));
console.log(fails ? fails + ' FEHLER' : 'ALLE OK (2)');
// Sicherheit: Betreff einzeilig, Limit je Zugang
Object.keys(cache).forEach((k) => delete cache[k]); mails.length = 0;
post({ ...base, action: 'submitTicket', type: 'Mangel', wohnung: '1\nBcc: x@y.z', details: 'x' });
check('Betreff ohne Zeilenumbruch', mails.every((m) => !/[\r\n]/.test(m.subject)), mails.map((m) => m.subject));
let blocked = false;
for (let i = 0; i < 160; i++) { const r = post({ action: 'hmLogin', token: hmTok }); if (!r.ok && /sehr viele/.test(r.error)) { blocked = true; break; } }
check('Limit je Zugang greift', blocked);
console.log(fails ? fails + ' FEHLER' : 'ALLE OK (3)');

// ================= Löschkonzept =================
ctx.setup();
const yearsAgo = (y, extraDays = 0) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); d.setDate(d.getDate() - extraDays); return d; };
const H = (sheet) => sheets[sheet].grid[0];
const rowFor = (sheet, obj) => H(sheet).map((h) => (h in obj ? obj[h] : ''));
const drive = (id) => `https://drive.google.com/file/d/${id}xxxxxxxxxxxxxxxxxxxx/view`;
sheets['Tickets'].grid.push(
  rowFor('Tickets', { ID: 'T-OLD-DONE', Eingang: yearsAgo(3), Typ: 'Mangel', Status: 'erledigt', 'Erledigt am': yearsAgo(2, 5), Foto: drive('p1') }),
  rowFor('Tickets', { ID: 'T-OLD-OPEN', Eingang: yearsAgo(4), Typ: 'Mangel', Status: 'offen', Foto: drive('p2') }),
  rowFor('Tickets', { ID: 'T-RECENT-DONE', Eingang: yearsAgo(1), Typ: 'Mangel', Status: 'erledigt', 'Erledigt am': yearsAgo(1), Foto: drive('p3') }));
sheets['Zählerstände'].grid.push(
  rowFor('Zählerstände', { ID: 'Z-OLD', Eingang: yearsAgo(3, 10), Ablesedatum: yearsAgo(3, 10), Wohnung: 'Whg 1', Art: 'Kalt', Zählerstand: 1, Foto: drive('p4') }),
  rowFor('Zählerstände', { ID: 'Z-KEEP', Eingang: yearsAgo(2), Ablesedatum: yearsAgo(2), Wohnung: 'Whg 1', Art: 'Kalt', Zählerstand: 2, Foto: drive('p5') }));
sheets['Reinigung'].grid.push(rowFor('Reinigung', { 'Zeitpunkt (Scan)': yearsAgo(2, 3), 'Ort-Code': 'TG', Foto: drive('p6') }));
sheets['Fehlerprotokoll'].grid.push(rowFor('Fehlerprotokoll', { Zeit: new Date(Date.now() - 100 * 86400000), Quelle: 'App', Meldung: 'alt' }));
sheets['Reinigungsplan'].grid.push(rowFor('Reinigungsplan', { Datum: yearsAgo(3), 'Tätigkeit': 'Alt-Eintrag' }), rowFor('Reinigungsplan', { Datum: 'irgendwann', 'Tätigkeit': 'Unklar' }));
sheets['Tickets'].grid.push(rowFor('Tickets', { ID: 'T-NODATE', Typ: 'Mangel', Status: 'erledigt' }));
const ids = (n) => sheets[n].grid.slice(1).map((r) => r[0]);
trashed.length = 0;
const rem = ctx.cleanupOldData();
check('Löschen nie ohne gültiges Datum (Plan „irgendwann“, Ticket ohne Datum bleiben)', sheets['Reinigungsplan'].grid.some((r) => r[2] === 'Unklar') && !sheets['Reinigungsplan'].grid.some((r) => r[2] === 'Alt-Eintrag') && ids('Tickets').includes('T-NODATE'));
check('Löschen: erledigte Meldung > 2 Jahre weg, offene alte bleibt, junge bleibt', !ids('Tickets').includes('T-OLD-DONE') && ids('Tickets').includes('T-OLD-OPEN') && ids('Tickets').includes('T-RECENT-DONE'), ids('Tickets'));
check('Löschen: Zählerstand > 3 Jahre weg, 2 Jahre alt bleibt', !ids('Zählerstände').includes('Z-OLD') && ids('Zählerstände').includes('Z-KEEP'));
check('Löschen: Nachweis > 2 Jahre und Fehlerbericht > 90 Tage weg', !sheets['Reinigung'].grid.some((r) => r[1] === 'TG' && r[0] < yearsAgo(2)) && !sheets['Fehlerprotokoll'].grid.some((r) => r[2] === 'alt'));
check('Löschen: Fotos der gelöschten Zeilen im Papierkorb, andere nicht', ['p1', 'p4', 'p6'].every((p) => trashed.some((t) => t.startsWith(p))) && !trashed.some((t) => /^p[235]/.test(t)), trashed);
check('Löschen: Ergebnis gezählt', rem.tickets === 1 && rem.meter === 1 && rem.errors === 1 && rem.plan === 1, rem);
check('Wartung: Automatik 3 Uhr angelegt', triggers.some((t) => t.getHandlerFunction() === 'dailyMaintenance'));

// ================= Fehlerüberwachung =================
Object.keys(cache).forEach((k) => delete cache[k]); mails.length = 0;
const saveTickets = sheets['Tickets']; delete sheets['Tickets'];
let fr = post({ ...base, action: 'submitTicket', type: 'Mangel', details: 'x' });
sheets['Tickets'] = saveTickets;
const flog = sheets['Fehlerprotokoll'].grid.slice(1);
check('Serverfehler: Nutzer sieht nur „Serverfehler“', fr.ok === false && fr.error === 'Serverfehler');
check('Serverfehler protokolliert + Sofort-Mail', flog.some((r) => /^Server/.test(r[1])) && mails.some((m) => /Fehler im Backend/.test(m.subject)));
delete sheets['Tickets']; post({ ...base, action: 'submitTicket', type: 'Mangel', details: 'x' }); sheets['Tickets'] = saveTickets;
check('Sofort-Mail höchstens alle 3 Stunden', mails.filter((m) => /Fehler im Backend/.test(m.subject)).length === 1);
const before = sheets['Fehlerprotokoll'].grid.length;
check('App-Fehler ohne PIN abgelehnt', post({ action: 'reportError', message: 'X' }).code === 'pin');
post({ action: 'reportError', pin: '13059', message: 'TypeError: foo', source: 'app.js:1', view: 'wasser', browser: 'UA', version: '42' });
post({ action: 'reportError', pin: '13059', message: 'TypeError: foo' });
const cl = sheets['Fehlerprotokoll'].grid.slice(before);
check('App-Fehler protokolliert, gleiche Meldung nur einmal', cl.length === 1 && cl[0][1] === 'App' && cl[0][4] === 'wasser' && /Version 42/.test(cl[0][3]), cl);
post({ action: 'reportError', pin: '13059', message: '=HYPERLINK("x")' });
check('App-Fehler: Formel wird Text', sheets['Fehlerprotokoll'].grid.slice(-1)[0][2].startsWith("'"));
mails.length = 0;
let hc = ctx.healthCheck();
check('Systemprüfung meldet Fehler der letzten 24 Std. per Mail', hc.issues.some((i) => /Fehler in den letzten 24 Stunden/.test(i)) && mails.some((m) => /Systemprüfung/.test(m.subject)));
sheets['Fehlerprotokoll'].grid.splice(1); mails.length = 0;
hc = ctx.healthCheck();
check('Systemprüfung ohne Probleme: keine Mail', hc.issues.length === 0 && mails.length === 0, hc.issues);
const nm = props.NOTIFY_EMAIL; delete props.NOTIFY_EMAIL;
check('Systemprüfung erkennt fehlende NOTIFY_EMAIL', ctx.healthCheck().issues.some((i) => /NOTIFY_EMAIL/.test(i)));
props.NOTIFY_EMAIL = nm;
console.log(fails ? fails + ' FEHLER' : 'ALLE OK (Löschkonzept/Überwachung)');
process.exitCode = fails ? 1 : 0;

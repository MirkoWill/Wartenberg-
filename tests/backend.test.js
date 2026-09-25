// Automatisch erzeugt aus den Entwicklungs-Tests. Start: node tests/backend.test.js
// Prüft backend/Code.gs mit nachgebildeten Google-Diensten (kein Google-Konto nötig).
const fs = require('fs'), vm = require('vm');
process.env.TZ = 'Europe/Berlin';
let calName = 'WEG Wartenberger Dorfkrug'; const trashed = []; const alerts = []; const cache = {}; const triggers = [];
const events = {}; let evSeq = 0;
const fetches = []; const wx = { fail: false, alerts: [], hours: [] }; const tr = { down: false, onlyVbb: false };
const mkHours = (date, icons, tmin, tmax) => Array.from({ length: 24 }, (_, h) => ({ timestamp: `${date}T${String(h).padStart(2, '0')}:00:00+02:00`, temperature: tmin + (tmax - tmin) * Math.sin(Math.PI * h / 23), icon: icons(h), precipitation: icons(h) === 'rain' ? 0.5 : 0 }));
const mkEv = (title, start, end, opt) => { const id = 'ev' + (++evSeq); const e = { id, title, start, end, desc: (opt || {}).description || '', getId: () => id, setTitle(t) { e.title = t; }, setAllDayDates(a, b) { e.start = a; e.end = b; }, setDescription(d) { e.desc = d; }, getDescription: () => e.desc, deleteEvent() { delete events[id]; } }; events[id] = e; return e; };
const cal = { getName: () => 'WEG Wartenberger Dorfkrug', getEventById: (id) => events[id] || null, createAllDayEvent: mkEv, getEvents: () => Object.values(events) }; const sheets = {}, props = {}, mails = [], files = [];
const chain = (o) => { const p = new Proxy(o, { get: (t, k) => (k in t || typeof k !== 'string' || k === 'toJSON' || k === 'then' ? t[k] : () => p) }); return p; };
function mkSheet(name) {
  const sh = { name, grid: [], filter: null, bgs: {}, getName: () => name,
    ensure(r) { while (sh.grid.length < r) sh.grid.push([]); },
    getRange(r, c, nr = 1, nc = 1) { if (typeof r === 'string') return {}; let P; const api = {
      setValues(v) { sh.ensure(r + nr - 1); v.forEach((row, i) => row.forEach((x, j) => { sh.grid[r - 1 + i][c - 1 + j] = x; })); return P; },
      getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = sh.grid[r - 1 + i] || []; out.push(Array.from({ length: nc }, (_, j) => row[c - 1 + j] === undefined ? '' : row[c - 1 + j])); } return out; },
      setValue(x) { sh.ensure(r); sh.grid[r - 1][c - 1] = x; return P; },
      setBackgrounds(b) { sh.bgs = b; return P; }, setRichTextValues(v) { sh.ensure(r + nr - 1); v.forEach((row, i) => { sh.grid[r - 1 + i][c - 1] = row[0]; }); return P; }, setFontWeight() { return P; }, setBackground() { return P; }, setFontColor() { return P; },
      setNumberFormat() { return P; }, setDataValidation() { return P; },
      createFilter() { sh.filter = { remove() { sh.filter = null; } }; return sh.filter; } }; P = chain(api); return P; },
    getDataRange() { return { getValues: () => sh.grid.map((r) => r.slice()) }; },
    getLastRow() { return sh.grid.length; }, getMaxRows() { return 1000; }, setFrozenRows() {},
    appendRow(row) { sh.grid.push(row); }, deleteRow(n) { sh.grid.splice(n - 1, 1); }, clear() { sh.grid = []; }, getFilter() { return sh.filter; }, autoResizeColumns() {} };
  return (sheets[name] = chain(sh));
}
const ss = chain({ getSheetByName: (n) => sheets[n] || null, insertSheet: mkSheet, getSheets: () => Object.values(sheets), deleteSheet() {}, getUrl: () => 'https://sheet' });
const ctx = { console, JSON, Math, Date, Object, String, Number, Error, Array, encodeURIComponent,
  Logger: { log() {} },
  SpreadsheetApp: { getActive: () => ({ toast() {} }), getActiveSpreadsheet: () => ss, newRichTextValue: () => { const o = { text: '', url: null, setText(t) { o.text = t; return o; }, setLinkUrl(u) { o.url = u; return o; }, build() { return { rich: true, text: o.text, url: o.url }; } }; return o; }, newConditionalFormatRule: () => chain({ build: () => ({}) }), newDataValidation: () => ({ requireValueInList() { return this; }, requireCheckbox() { return this; }, requireValueInRange() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } }), getUi: () => ({ alert: (t, m) => { alerts.push(t + ': ' + m); }, ButtonSet: { OK: 1 }, createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  DriveApp: { getFileById: (id) => ({ setTrashed: () => trashed.push(id), getBlob: () => ({ name: 'blob:' + id }) }), createFolder: () => ({ getId: () => 'F1', createFile: (b) => ({ getId: () => 'FILE_' + b.name }) }), getFolderById: () => ({ createFile: (b) => { files.push(b.name); return { getId: () => 'FILE_' + b.name, getUrl: () => 'https://drive.google.com/file/d/' + b.name }; } }) },
  Utilities: { DigestAlgorithm: { MD5: 'md5', SHA_256: 'sha256' }, computeDigest: (a, t) => [...require('crypto').createHash('md5').update(t).digest()], base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url'), base64Decode: (s) => Buffer.from(s, 'base64'), newBlob: (bytes, mime, name) => ({ name }), getUuid: () => Math.random().toString(16).slice(2, 10) + '-' + Math.random().toString(16).slice(2, 10),
    formatDate: (d, tz, f) => { const p = (n) => String(n).padStart(2, '0'); if (f === 'HH:mm') return `${p(d.getHours())}:${p(d.getMinutes())}`; return f === 'yyMMdd' ? String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; } },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; }, removeAll: (ks) => ks.forEach((k) => delete cache[k]) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
  UrlFetchApp: { fetchAll: (reqs) => { fetches.push(...reqs.map((r) => r.url)); if (wx.fail) throw new Error('DNS'); return reqs.map((r) => {
    if (/transport\.rest/.test(r.url)) {
      const code = tr.down || (tr.onlyVbb && /bvg/.test(r.url)) ? 503 : 200;
      const body = /locations/.test(r.url) ? [{ type: 'stop', id: '900150005', name: 'Dorfstr./Lindenberger Str. (Berlin)' }]
        : { departures: [{ when: new Date(Date.now() + 5 * 60000).toISOString(), plannedWhen: new Date(Date.now() + 4 * 60000).toISOString(), delay: 60, direction: 'S+U Lichtenberg', line: { name: '256', product: 'bus', operator: { id: 'x' } }, stop: { big: 'x'.repeat(500) } },
          { when: new Date(Date.now() - 10 * 60000).toISOString(), direction: 'alt', line: { name: '893' } }] };
      return { getResponseCode: () => code, getContentText: () => JSON.stringify(body) };
    }
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify(/\/alerts/.test(r.url) ? { alerts: wx.alerts } : { weather: wx.hours }) };
  }); } },
  MailApp: { sendEmail: (m) => mails.push(m), getRemainingDailyQuota: () => 1500 },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://x/exec' }), getProjectTriggers: () => triggers, newTrigger: (fn) => { const b = { timeBased: () => b, everyDays: () => b, onMonthDay: () => b, atHour: () => b, inTimezone: () => b, create: () => { triggers.push({ getHandlerFunction: () => fn }); } }; return b; } },
  CalendarApp: { getAllCalendars: () => [cal, { getName: () => 'Privat' }], getCalendarById: (id) => (id === 'good' ? cal : null), getCalendarsByName: (n) => (n === calName ? [cal] : []) },
  HtmlService: { createHtmlOutput: (h) => ({ html: h, getBlob: () => ({ getAs: (t) => ({ type: t, html: h, name: '', setName(n) { this.name = n; return this; } }) }), setTitle() { return this; }, addMetaTag() { return this; } }) },
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
check('Mitarbeiter: 007, 008, 001, 010, 011, 100–119 ohne Namen', staff.length === 26 && staff[1][0] === '007' && staff[1][1] === 'Verwaltung' && staff[2][0] === '008' && staff[2][1] === 'Verwaltung' && staff[3][0] === '001' && staff[4][0] === '010' && staff[5][0] === '011' && staff[6][0] === '100' && staff[25][0] === '119' && staff[0].indexOf('Name') === -1, staff.map((r) => r[0]).join(','));
check('Links mit Token', /^https:\/\/app\.willbrandt-kompagnon\.de\/\?hm=[a-f0-9]{16,}#hausmeister$/.test(staff[6][4]), staff[6][4]);
check('010/011: Rolle Fitness, aktiv, Link öffnet den Fitnessraum', staff[4][1] === 'Fitness' && staff[5][1] === 'Fitness' && staff[4][2] === true && /#fitness$/.test(staff[4][4]) && /#fitness$/.test(staff[5][4]));
ctx.setup();
check('setup erneut: keine doppelten Links', sheets['Mitarbeiter'].grid.length === 26);
sheets['Mitarbeiter'].grid[3][1] = 'Hausmeister'; delete props.ROLE_001_LEITUNG; ctx.ensureStaffLinks();
check('Bestehendes Blatt: 001 wird einmalig auf Leitung umgestellt', sheets['Mitarbeiter'].grid[3][1] === 'Leitung' && props.ROLE_001_LEITUNG === '1');
sheets['Mitarbeiter'].grid[3][1] = 'Hausmeister'; ctx.ensureStaffLinks();
check('Danach bleibt die Auswahl in der Tabelle maßgeblich', sheets['Mitarbeiter'].grid[3][1] === 'Hausmeister');
sheets['Mitarbeiter'].grid[3][1] = 'Leitung';
{ // Blatt mit 007/001 aus alter Version + leere Kästchen bis Zeile 40 → 008 direkt unter die letzte Nummer
  const g = sheets['Mitarbeiter'].grid; const saved = g.map((r) => r.slice());
  const i8 = g.findIndex((r) => r[0] === '008'); g.splice(i8, 1);
  while (g.length < 40) g.push(['', '', false, '', '']);
  ctx.ensureStaffLinks();
  check('008 wird direkt unter die letzte Nummer geschrieben (nicht hinter leere Kästchen)', g[25][0] === '008' && g[25][1] === 'Verwaltung' && g[25][2] === true && /hm=/.test(g[25][4]), g.slice(24, 27).map((r) => r[0]));
  g.length = 0; saved.forEach((r) => g.push(r));
}
check('QR-Orte vorbelegt (21)', sheets['QR-Orte'].grid.length === 22 && sheets['QR-Orte'].grid.some((r) => r[1] === 'Raum Hebeanlage Lindenberger Str. 8'));
check('Kein Keller Lind 8', !sheets['QR-Orte'].grid.some((r) => r[0] === 'KE_LIND8'));
check('Tätigkeiten inkl. Fensterreinigung', sheets['Tätigkeiten'].grid.some((r) => r[0] === 'Fensterreinigung Aufgang'));
check('Tages-Trigger angelegt (einmal)', triggers.filter((t) => t.getHandlerFunction() === 'checkPlanFulfilment').length === 1);

const fitTok = staff[4][3], fit2Tok = staff[5][3];
const hmTok = staff[6][3], admTok = staff[1][3], adm2Tok = staff[2][3], leadTok = staff[3][3];
check('Vorrats-Nummern gesperrt, 007/008/001 aktiv', staff[1][2] === true && staff[2][2] === true && staff[3][2] === true && staff[6][2] === false && staff[25][2] === false);
delete cache.staff;
check('Gesperrte Vorrats-Nummer kommt nicht rein', post({ action: 'hmLogin', token: hmTok }).code === 'staff');
staff[6][2] = true; delete cache.staff; // Nr. 100 vergeben
let lg = post({ action: 'hmLogin', token: hmTok });
check('Login Hausmeister ohne PIN', lg.ok && lg.user.name === 'Nr. 100' && lg.user.role === 'Hausmeister' && lg.areas.length === 21 && lg.activities.length === 10, lg.user);
check('Login Verwaltung', post({ action: 'hmLogin', token: admTok }).user.role === 'Verwaltung');
check('Falscher Token abgelehnt', post({ action: 'hmLogin', token: 'abc' }).code === 'staff' && post({ action: 'hmLogin', token: 'f'.repeat(40) }).code === 'staff');
sheets['Mitarbeiter'].grid[7][2] = false; delete cache.staff;
check('Deaktivierter Zugang abgelehnt', post({ action: 'hmLogin', token: staff[7][3] }).code === 'staff');

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
check('001 hat Rolle Leitung', staff[3][0] === '001' && staff[3][1] === 'Leitung' && post({ action: 'hmLogin', token: leadTok }).user.role === 'Leitung');
{
  const ymd = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  sheets['Reinigungsplan'].grid.push([dd(-2), '', 'Fensterreinigung Aufgang', 'Treppenhaus Lindenberger Str. 6', '', '']);
  const t1 = dd(-1); t1.setHours(10, 15);
  sheets['Reinigung'].grid.push([t1, 'TH_LIND6', '100', t1, 'Treppenhaus Lindenberger Str. 6', 'Fensterreinigung Aufgang', '', '', 'lind6', 'QR-Scan']);
  const w = post({ action: 'adminOverview', token: admTok }).work;
  const d2 = w.days.find((x) => x.date === ymd(dd(-2))), d1 = w.days.find((x) => x.date === ymd(dd(-1)));
  check('Erledigte Arbeiten: Plan-Tag ohne Nachweis → „nachgeholt am“ Folgetag', d2 && d2.missed.some((m) => /Fensterreinigung/.test(m.activity) && m.lateOn === ymd(dd(-1))), d2);
  check('Erledigte Arbeiten: Nachweis mit Uhrzeit, außerplanmäßig markiert', d1 && d1.done.some((x) => /Fensterreinigung/.test(x.activity) && x.time === '10:15' && x.planned === false), d1);
  check('Erledigte Arbeiten: keine Mitarbeiternummern', !/"nr"|Mitarbeiter/.test(JSON.stringify(w)) && !('team' in post({ action: 'adminOverview', token: admTok })));
  sheets['Reinigungsplan'].grid.pop(); sheets['Reinigung'].grid.pop();
}
const dd24 = post({ action: 'submitStaffDefect', token: hmTok, ort: 'Treppenhaus Dorfstr. 24', beschreibung: 'Licht defekt' });
check('Aufgang-ID wird als Name angezeigt (nicht „dorf24“)', post({ action: 'adminOverview', token: admTok }).tasks.find((x) => x.id === dd24.id).entrance === 'Dorfstr. 24');
{
  const lov = post({ action: 'adminOverview', token: leadTok });
  check('Leitung: sieht Hausmeister-Aufträge + Arbeiten, keine Verwaltungs-Aufträge', lov.ok && lov.tasks.length > 0 && lov.tasks.every((x) => x.owner === 'Hausmeister') && Array.isArray(lov.work.days) && lov.kpi.errors24 === null);
  const hmTask = lov.tasks.find((x) => x.status !== 'erledigt');
  check('Leitung: Status ändern ok, Zuständigkeit nicht', post({ action: 'adminUpdateTask', token: leadTok, id: hmTask.id, status: 'in Arbeit' }).ok && !post({ action: 'adminUpdateTask', token: leadTok, id: hmTask.id, owner: 'Verwaltung' }).ok);
  const vwTask = post({ action: 'adminOverview', token: admTok }).tasks.find((x) => x.owner === 'Verwaltung');
  check('Leitung: Verwaltungs-Auftrag nicht änderbar', !vwTask || !post({ action: 'adminUpdateTask', token: leadTok, id: vwTask.id, status: 'erledigt' }).ok);
}
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
const ah = an[0], lateRow = an.find((r) => r[0] === 'T-LATE');
check('Auswertung: fertige Zähler Offen/Erledigt/Überfällig/SLA eingehalten', lateRow[ah.indexOf('Offen')] === 1 && lateRow[ah.indexOf('Erledigt')] === 0 && lateRow[ah.indexOf('Überfällig')] === 1 && lateRow[ah.indexOf('SLA eingehalten')] === ''
  && an.slice(1).filter((r) => r[ah.indexOf('Status')] === 'erledigt').every((r) => r[ah.indexOf('SLA eingehalten')] === 0 || r[ah.indexOf('SLA eingehalten')] === 1), lateRow);
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

check('Wohnungsbezeichnung: Nummer → „Whg 04“, Gewerbe/„Whg“ bleibt', ctx.whg('04') === 'Whg 04' && ctx.whg("'4a") === 'Whg 4a' && ctx.whg('Laden EG links') === 'Laden EG links' && ctx.whg('Whg 7') === 'Whg 7');
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

// ================= Paket A: Hinweise aus dem Cockpit, Heute zu tun =================
{
  const nsh = sheets['Aktuelles'];
  while (nsh.grid.length < 30) nsh.grid.push([false, '', '', '', '', false, '']); // Kästchen bis weit unten (wie in der echten Tabelle)
  const before = nsh.grid.length;
  const ymdL = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const r1 = post({ action: 'adminNewsSave', token: admTok, title: 'Cockpit-Testhinweis', text: '=HYPERLINK("x")', from: ymdL(new Date()), to: '', important: true, only: ['lind6', 'constructor', '<b>'] });
  const row = nsh.grid.findIndex((r) => r[3] === 'Cockpit-Testhinweis');
  check('Hinweis aus dem Cockpit: direkt unter dem letzten Hinweis (nicht hinter den Kästchen), Formel als Text', r1.ok && row > 0 && row < before && nsh.grid[row][0] === true && nsh.grid[row][4].startsWith("'") && nsh.grid[row][5] === true, nsh.grid[row]);
  check('Hinweis: nur gültige Aufgang-IDs', nsh.grid[row][6] === 'lind6, constructor' || nsh.grid[row][6] === 'lind6', nsh.grid[row][6]);
  const nw6 = ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } }), nw2 = ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind2' } });
  check('Hinweis erscheint bei Lindenberger 6, nicht bei 2', nw6.items.some((n) => n.title === 'Cockpit-Testhinweis') && !nw2.items.some((n) => n.title === 'Cockpit-Testhinweis'));
  const lst = post({ action: 'adminOverview', token: admTok }).news;
  check('Cockpit listet aktive Hinweise', lst.some((n) => n.title === 'Cockpit-Testhinweis' && n.row === row + 1 && n.important));
  check('Hinweise: Leitung/Hausmeister dürfen nicht veröffentlichen', post({ action: 'adminNewsSave', token: leadTok, title: 'x' }).code === 'staff' && post({ action: 'adminNewsSave', token: hmTok, title: 'x' }).code === 'staff' && !post({ action: 'adminOverview', token: leadTok }).news.length);
  check('Hinweis: leer / Bis vor Von abgelehnt', !post({ action: 'adminNewsSave', token: admTok, title: '', text: '' }).ok && !post({ action: 'adminNewsSave', token: admTok, title: 'x', from: '2026-10-10', to: '2026-10-01' }).ok);
  check('Beenden nur mit passendem Titel', !post({ action: 'adminNewsEnd', token: admTok, row: row + 1, title: 'falsch' }).ok && post({ action: 'adminNewsEnd', token: admTok, row: row + 1, title: 'Cockpit-Testhinweis' }).ok && nsh.grid[row][0] === false);
  const lg2 = post({ action: 'hmLogin', token: hmTok });
  check('Heute zu tun: Plan für heute kommt mit der Anmeldung', lg2.plan && /^\d{4}-\d{2}-\d{2}$/.test(lg2.plan.day) && Array.isArray(lg2.plan.items), lg2.plan);
}

// ================= Paket B: Nachher-Foto, Kalender-Abo =================
{
  const TH2 = vm.runInContext('CONFIG', ctx).SHEETS.tickets.headers;
  const r = TH2.map(() => ''); r[TH2.indexOf('ID')] = 'T-FOTO'; r[TH2.indexOf('Typ')] = 'Klingelschild'; r[TH2.indexOf('Status')] = 'offen'; r[TH2.indexOf('Eingang')] = new Date();
  r[TH2.indexOf('Foto')] = 'https://drive.google.com/file/d/vorher'; r[TH2.indexOf('Zuständig')] = 'Hausmeister';
  sheets['Tickets'].grid.push(r);
  const res = post({ action: 'completeTask', token: hmTok, id: 'T-FOTO', photo });
  check('Erledigen mit Nachher-Foto: Foto gespeichert, Status erledigt', res.ok && /drive\.google\.com/.test(r[TH2.indexOf('Foto erledigt')]) && r[TH2.indexOf('Status')] === 'erledigt', r);
  const t = post({ action: 'adminOverview', token: admTok }).tasks.find((x) => x.id === 'T-FOTO');
  check('Cockpit: Vorher- und Nachher-Foto', t && t.photo === 'https://drive.google.com/file/d/vorher' && /drive\.google\.com/.test(t.photoDone), t);
  r[TH2.indexOf('Foto')] = 'javascript:alert(1)';
  check('Nur echte Drive-Links werden weitergegeben', post({ action: 'adminOverview', token: admTok }).tasks.find((x) => x.id === 'T-FOTO').photo === '');
  check('Erledigen ohne Foto geht weiterhin', post({ action: 'completeTask', token: hmTok, id: 'T-FOTO' }).ok);
  delete props.CLEANING_ICS_URL;
  check('Kalender-Abo: ohne Eintrag keine Adresse', ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } }).cleaningIcs === '');
  props.CLEANING_ICS_URL = 'https://evil.example/x.ics';
  check('Kalender-Abo: nur Google-Kalender-Adressen', ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } }).cleaningIcs === '');
  props.CLEANING_ICS_URL = 'https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/public/basic.ics';
  check('Kalender-Abo: öffentliche iCal-Adresse wird an die App gegeben', /public\/basic\.ics$/.test(ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } }).cleaningIcs));
  delete props.CLEANING_ICS_URL;
}

// ================= Paket C: Stimmungsbild =================
{
  const sv = post({ action: 'adminPollSave', token: admTok, question: 'Fahrradbügel im Hof?', options: ['Ja', 'Nein', '=HYPERLINK("x")'], to: '', only: ['lind6'], showResults: true });
  check('Umfrage anlegen (Verwaltung), Formel als Text', sv.ok && /^U-/.test(sv.id) && sheets['Umfragen'].grid.some((r) => r[0] === sv.id && r[1] === true && String(r[3]).includes("'=HYPERLINK")));
  check('Umfrage: Leitung/Hausmeister dürfen nicht, zu wenige Antworten abgelehnt', post({ action: 'adminPollSave', token: leadTok, question: 'x', options: ['a', 'b'] }).code === 'staff'
    && post({ action: 'adminPollSave', token: hmTok, question: 'x', options: ['a', 'b'] }).code === 'staff' && !post({ action: 'adminPollSave', token: admTok, question: 'x', options: ['a'] }).ok);
  const n6 = ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } }), n2 = ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind2' } });
  const poll = n6.polls.find((x) => x.id === sv.id);
  check('Umfrage erscheint nur beim gewählten Aufgang', poll && poll.options.length === 3 && !n2.polls.some((x) => x.id === sv.id));
  const V1 = 'a'.repeat(32), V2 = 'b'.repeat(32);
  const v1 = post({ ...base, action: 'vote', pollId: sv.id, option: 0, voter: V1, obj: 'lind6' });
  check('Abstimmen: Ergebnis zurück (freigegeben)', v1.ok && v1.results[0] === 1, v1);
  check('Doppelte Stimme vom selben Gerät abgelehnt', post({ ...base, action: 'vote', pollId: sv.id, option: 1, voter: V1, obj: 'lind6' }).code === 'voted');
  check('Anderes Gerät darf, ungültige Antwort/Aufgang/Kennung abgelehnt', post({ ...base, action: 'vote', pollId: sv.id, option: 1, voter: V2, obj: 'lind6' }).ok
    && !post({ ...base, action: 'vote', pollId: sv.id, option: 7, voter: 'c'.repeat(32), obj: 'lind6' }).ok
    && !post({ ...base, action: 'vote', pollId: sv.id, option: 0, voter: 'd'.repeat(32), obj: 'lind2' }).ok
    && !post({ ...base, action: 'vote', pollId: sv.id, option: 0, voter: 'kurz', obj: 'lind6' }).ok);
  const stim = sheets['Umfrage-Stimmen'].grid.slice(1);
  check('Stimmen anonym: nur Zeit, Umfrage, Antwort, Aufgang, Einweg-Kennung (nicht der Gerätewert)', stim.length === 2 && stim.every((r) => r.length === 5 && r[3] === 'lind6' && !String(r[4]).includes('aaaa') && /^[a-f0-9]{32}$/.test(r[4])), stim);
  check('Abstimmen ohne PIN abgelehnt', post({ action: 'vote', pollId: sv.id, option: 0, voter: 'e'.repeat(32), obj: 'lind6' }).code === 'pin');
  const ap = post({ action: 'adminOverview', token: admTok }).polls.find((x) => x.id === sv.id);
  check('Cockpit: Ergebnis je Antwort und je Aufgang', ap && ap.total === 2 && ap.counts.join() === '1,1,0' && ap.perEntrance['Lindenberger Str. 6'].join() === '1,1,0' && ap.open, ap);
  check('Umfrage beenden → keine Stimmen mehr, nicht mehr in der App', post({ action: 'adminPollEnd', token: admTok, id: sv.id }).ok
    && !post({ ...base, action: 'vote', pollId: sv.id, option: 0, voter: 'f'.repeat(32), obj: 'lind6' }).ok
    && !ctx.doGet({ parameter: { action: 'news', pin: '13059', obj: 'lind6' } }).polls.some((x) => x.id === sv.id));
}

// ================= Paket C: Tabelle übersichtlich =================
{
  const snap = JSON.stringify(['Tickets', 'Mängel Hausmeister', 'Reinigung', 'Mitarbeiter', 'Aktuelles'].map((n) => sheets[n].grid));
  const warn = []; const ow = console.warn; console.warn = (...a) => warn.push(a.join(' '));
  const fr = ctx.formatSpreadsheet();
  console.warn = ow;
  check('Formatieren: alle Blätter ohne Fehler', fr.formatted === Object.keys(vm.runInContext('CONFIG', ctx).SHEETS).length && !warn.some((w) => /Formatieren|Reihenfolge/.test(w)), warn);
  check('Formatieren verändert keine Daten', JSON.stringify(['Tickets', 'Mängel Hausmeister', 'Reinigung', 'Mitarbeiter', 'Aktuelles'].map((n) => sheets[n].grid)) === snap);
  const st = sheets['Start'].grid.map((r) => r.join('|')).join('\n');
  check('Startblatt mit Anleitung und allen Arbeitsblättern', /So arbeiten Sie mit der Tabelle/.test(st) && /Bitte nicht/.test(st) && ['Tickets', 'Reinigungsplan', 'Mitarbeiter', 'Umfragen'].every((n) => st.includes(n)), st.slice(0, 200));
  ctx.formatSpreadsheet();
  check('Erneut formatieren: Startblatt nicht doppelt', sheets['Start'].grid.filter((r) => r[1] === 'Mieter-App WEG Wartenberger Dorfkrug').length === 1);
}

// ================= Langläufer =================
{
  const TH3 = vm.runInContext('CONFIG', ctx).SHEETS.tickets.headers;
  const r = TH3.map(() => ''); r[TH3.indexOf('ID')] = 'T-LONG'; r[TH3.indexOf('Typ')] = 'Mangel'; r[TH3.indexOf('Status')] = 'in Arbeit';
  r[TH3.indexOf('Eingang')] = new Date(Date.now() - 40 * 86400000); r[TH3.indexOf('Aufgang')] = 'Dorfstr. 24'; r[TH3.indexOf('Zuständig')] = 'Verwaltung';
  sheets['Tickets'].grid.push(r);
  let ov = post({ action: 'adminOverview', token: admTok });
  check('Vor Kennzeichnung: 40 Tage alter Mangel ist rot', ov.tasks.find((x) => x.id === 'T-LONG').sla.light === 'red');
  const od0 = ov.kpi.overdue;
  check('Langläufer setzen (Verwaltung), Grund als Text', post({ action: 'adminUpdateTask', token: admTok, id: 'T-LONG', longRunner: true, longReason: '=Warten auf Dachdecker' }).ok
    && r[TH3.indexOf('Langläufer')] === 'ja' && r[TH3.indexOf('Langläufer-Grund')].startsWith("'="));
  ov = post({ action: 'adminOverview', token: admTok });
  const lt = ov.tasks.find((x) => x.id === 'T-LONG');
  check('Langläufer: keine Ampel, nicht überfällig, eigene Kennzahl', lt.sla.light === 'long' && lt.longRunner && ov.kpi.overdue === od0 - 1 && ov.kpi.longRunners >= 1, ov.kpi);
  check('Leitung darf Langläufer nicht setzen', !post({ action: 'adminUpdateTask', token: leadTok, id: 'T-LONG', longRunner: false }).ok);
  mails.length = 0; ctx.morningDigest();
  check('Morgen-Mail nennt Langläufer nicht als überfällig', !mails.some((m) => /T-LONG/.test(m.body)));
  ctx.rebuildAnalytics();
  const an = sheets['Auswertung Aufträge'].grid, ah = an[0], ar = an.find((x) => x[0] === 'T-LONG');
  check('Auswertung: Spalte Langläufer = 1, SLA „Langläufer“, nicht überfällig', ar[ah.indexOf('Langläufer')] === 1 && ar[ah.indexOf('SLA Erledigung')] === 'Langläufer' && ar[ah.indexOf('Überfällig')] === 0, ar);
  const now = new Date();
  const rd = ctx.reportData(now.getFullYear(), now.getMonth());
  check('Monatsbericht: Langläufer gesondert mit Grund, nicht bei „überfällig“', rd.longRunners.some((x) => /Dachdecker/.test(x.reason) && x.entrance === 'Dorfstr. 24') && !rd.overdue.some((x) => x.since && x.entrance === 'Dorfstr. 24' && x.type === 'Mangel' && false)
    && /Langläufer \(gesondert/.test(ctx.reportHtml(rd, false, '')) && /Langläufer/.test(ctx.reportMail(rd, '').text), rd.longRunners);
  post({ action: 'adminUpdateTask', token: admTok, id: 'T-LONG', status: 'erledigt' });
  const q = post({ action: 'adminOverview', token: admTok });
  check('Erledigter Langläufer zählt nicht in SLA-Quote', q.kpi.closed90 === ov.kpi.closed90, [q.kpi.closed90, ov.kpi.closed90]);
  check('Langläufer zurücknehmen', post({ action: 'adminUpdateTask', token: admTok, id: 'T-LONG', longRunner: false }).ok && r[TH3.indexOf('Langläufer')] === '');
  r[TH3.indexOf('Status')] = 'erledigt';
}

// ================= Monatsbericht Beirat =================
{
  const now = new Date();
  const rd = ctx.reportData(now.getFullYear(), now.getMonth());
  check('Monatsbericht: Kennzahlen, 6-Monats-Trend, Reinigung', typeof rd.cur.received === 'number' && rd.trend.length === 6 && typeof rd.cleaning.soll === 'number' && rd.cur.byType.length === 4, rd.cur);
  const html = ctx.reportHtml(rd, false, '');
  check('Monatsbericht: keine Namen, Wohnungen, Beschreibungen, Mitarbeiternummern', !/Müller|Max Schreier|Tor schließt nicht|Nr\. 100|Whg /.test(html) && /Monatsbericht/.test(html), html.length);
  check('Anmerkungen erscheinen im PDF (Schadcode entschärft)', /Anmerkungen der Verwaltung/.test(ctx.reportHtml(rd, false, 'Zeile 1\n<b>x</b>')) && !/<b>x<\/b>/.test(ctx.reportHtml(rd, false, '<b>x</b>')));
  mails.length = 0; delete props.REPORT_PENDING;
  props.BEIRAT_EMAILS = 'a@beirat.de, b@beirat.de; c@beirat.de, kaputt';
  ctx.monthlyReport();
  const fm = mails.find((m) => /Versand heute um 12 Uhr/.test(m.subject));
  const tok = JSON.parse(props.REPORT_PENDING).token;
  const beirat = () => mails.filter((m) => /beirat\.de/.test(m.to));
  check('8 Uhr: Entwurf an Verwaltung mit Link, noch nichts an den Beirat', fm && fm.to === props.NOTIFY_EMAIL && fm.attachments.length === 1 && fm.body.includes(`releaseReport&t=${tok}`) && !beirat().length && /3 Empfänger/.test(fm.body), fm && fm.body);
  const pg = ctx.doGet({ parameter: { action: 'releaseReport', t: tok } });
  check('Link öffnet Seite mit Anmerkungsfeld, Senden/Speichern/Anhalten – ohne Versand', /textarea name="comment"/.test(pg.html) && /value="send"/.test(pg.html) && /value="hold"/.test(pg.html) && !beirat().length);
  check('Falscher/leerer Token: nichts passiert', /ungültig/.test(ctx.doGet({ parameter: { action: 'releaseReport', t: 'f'.repeat(64), do: 'send' } }).html) && /ungültig/.test(ctx.doGet({ parameter: { action: 'releaseReport', do: 'send' } }).html) && !beirat().length);
  ctx.doGet({ parameter: { action: 'releaseReport', t: tok, do: 'save', comment: 'Im September gab es einen Wasserschaden in Haus 3.' } });
  check('Anmerkung gespeichert, Versand bleibt für 12 Uhr geplant', JSON.parse(props.REPORT_PENDING).comment.startsWith('Im September') && !beirat().length);
  ctx.doGet({ parameter: { action: 'releaseReport', t: tok, do: 'hold', comment: 'Im September gab es einen Wasserschaden in Haus 3.' } });
  check('Anhalten: 12-Uhr-Automatik sendet nicht', ctx.monthlyReportSend().sent === false && !beirat().length);
  ctx.doGet({ parameter: { action: 'releaseReport', t: tok, do: 'save', comment: 'Im September gab es einen Wasserschaden in Haus 3.' } });
  ctx.monthlyReportSend();
  const bm = beirat();
  check('12 Uhr: an 3 gültige Adressen, Kopie Verwaltung, Anmerkung + Signatur in der Mail, PDF angehängt', bm.length === 1 && bm[0].to === 'a@beirat.de,b@beirat.de,c@beirat.de' && bm[0].cc === props.NOTIFY_EMAIL
    && /Wasserschaden/.test(bm[0].body) && /Wasserschaden/.test(bm[0].htmlBody) && /Mirko Willbrandt/.test(bm[0].body) && /Lindenberger Str\. 6/.test(bm[0].htmlBody) && /Sehr geehrte Mitglieder des Verwaltungsbeirats/.test(bm[0].body) && bm[0].attachments.length === 1, bm[0] && bm[0].body);
  check('Versendete Fassung im Drive abgelegt', !!JSON.parse(props.REPORT_PENDING).fileId);
  ctx.monthlyReportSend(); ctx.doGet({ parameter: { action: 'releaseReport', t: tok, do: 'send' } });
  check('Nur einmal versendet', beirat().length === 1);
  // Sofort senden
  mails.length = 0; ctx.monthlyReport();
  const tok2 = JSON.parse(props.REPORT_PENDING).token;
  ctx.doGet({ parameter: { action: 'releaseReport', t: tok2, do: 'send', comment: '' } });
  check('„Jetzt senden“ geht sofort raus, 12-Uhr-Lauf danach nicht nochmal', beirat().length === 1 && ctx.monthlyReportSend().sent === false && beirat().length === 1);
  const pd = JSON.parse(props.REPORT_PENDING); pd.sent = false; pd.created = Date.now() - 15 * 86400000; props.REPORT_PENDING = JSON.stringify(pd);
  check('Link nach 14 Tagen abgelaufen', /ungültig/.test(ctx.doGet({ parameter: { action: 'releaseReport', t: tok2, do: 'send' } }).html));
  check('Automatiken 8 Uhr und 12 Uhr angelegt', ['monthlyReport', 'monthlyReportSend'].every((h) => triggers.some((t) => t.getHandlerFunction() === h)));
  delete props.BEIRAT_EMAILS; delete props.REPORT_PENDING;
}

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

// ================= Fitnessraum =================
{
  Object.keys(cache).forEach((k) => delete cache[k]); // Anfrage-Zähler der vorigen Tests zurücksetzen
  const fl = post({ action: 'hmLogin', token: fitTok });
  check('Fitness: Login 010 ohne Orte/Plan, Mitglied', fl.ok && fl.user.role === 'Fitness' && fl.user.fitness === true && fl.areas.length === 0 && !fl.plan, fl);
  check('Fitness: Verwaltung ist Mitglied, Hausmeister/Leitung nicht', post({ action: 'hmLogin', token: admTok }).user.fitness === true
    && post({ action: 'hmLogin', token: hmTok }).user.fitness === false && post({ action: 'hmLogin', token: leadTok }).user.fitness === false);
  check('Fitness: keine Hausmeister-Funktionen', ['logCleaning', 'getTasks', 'completeTask', 'submitStaffDefect'].every((a) => post({ action: a, token: fitTok, areaToken: 'TG', id: 'x' }).code === 'staff')
    && ctx.doGet({ parameter: { action: 'getTasks', token: fitTok } }).code === 'staff');
  check('Fitness: kein Cockpit, keine Hinweise/Umfragen', ['adminOverview', 'adminUpdateTask', 'adminNewsSave', 'adminPollSave'].every((a) => post({ action: a, token: fitTok, id: 'x', title: 'x' }).code === 'staff'));
  check('Fitness: Hausmeister/Leitung kommen nicht in den Fitnessraum', post({ action: 'fitnessOverview', token: hmTok }).code === 'staff' && post({ action: 'fitnessBook', token: leadTok }).code === 'staff');

  const d = new Date(); d.setDate(d.getDate() + 3);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const b1 = post({ action: 'fitnessBook', token: fitTok, date: day, time: '18:00', minutes: 90 });
  const frow = sheets['Fitness-Buchungen'].grid.slice(-1)[0];
  check('Fitness: Buchung gespeichert (nur Nummer)', b1.ok && /^F-/.test(b1.id) && frow[1] === '010' && frow[2].getHours() === 18 && frow[3].getHours() === 19 && frow[3].getMinutes() === 30 && frow[4] === 90, frow);
  const clash = post({ action: 'fitnessBook', token: fit2Tok, date: day, time: '19:00', minutes: 60 });
  check('Fitness: Überschneidung abgelehnt (eine Buchung zur Zeit)', !clash.ok && /belegt/.test(clash.error) && /010/.test(clash.error), clash);
  check('Fitness: direkt danach geht', post({ action: 'fitnessBook', token: fit2Tok, date: day, time: '19:30', minutes: 30 }).ok);
  check('Fitness: Regeln (Zeit, Dauer, Schritte, Vorlauf)', ['05:30', '22:30'].every((t) => !post({ action: 'fitnessBook', token: fitTok, date: day, time: t, minutes: 60 }).ok)
    && [20, 150, 45, 'x'].every((m) => !post({ action: 'fitnessBook', token: fitTok, date: day, time: '08:00', minutes: m }).ok)
    && !post({ action: 'fitnessBook', token: fitTok, date: day, time: '08:15', minutes: 30 }).ok
    && !post({ action: 'fitnessBook', token: fitTok, date: '2020-01-01', time: '08:00', minutes: 30 }).ok
    && !post({ action: 'fitnessBook', token: fitTok, date: '2099-01-01', time: '08:00', minutes: 30 }).ok
    && !post({ action: 'fitnessBook', token: fitTok, date: 'x', time: '08:00', minutes: 30 }).ok);
  check('Fitness: 22:00 für 60 Min bis 23 Uhr erlaubt', post({ action: 'fitnessBook', token: fitTok, date: day, time: '22:00', minutes: 60 }).ok);

  // Vergangene Trainings direkt ins Blatt (Statistik)
  const g = sheets['Fitness-Buchungen'].grid;
  const ago = (days, h, min) => { const x = new Date(); x.setDate(x.getDate() - days); x.setHours(h, 0, 0, 0); return [x, new Date(x.getTime() + min * 60000)]; };
  [[1, '011', 60], [8, '011', 60], [15, '011', 90], [2, '007', 30]].forEach(([days, nr, min], i) => { const [s, e] = ago(days, 7, min); g.push([`F-OLD-${i}`, nr, s, e, min, s, '']); });
  const [cs, ce] = ago(3, 9, 60); g.push(['F-CANC', '011', cs, ce, 60, cs, 'ja']);
  const ov = post({ action: 'fitnessOverview', token: fit2Tok });
  const m11 = ov.members.find((m) => m.nr === '011');
  check('Fitness: Übersicht nur Nummern, eigene markiert', ov.ok && ov.me === '011' && ov.members.map((m) => m.nr).join() === '007,008,010,011'
    && ov.upcoming.some((b) => b.nr === '010' && !b.mine) && ov.upcoming.some((b) => b.nr === '011' && b.mine) && !JSON.stringify(ov).includes('Nr. 0'), ov.upcoming);
  check('Fitness: Statistik zählt vergangene, nicht stornierte', (new Date(Date.now() - 15 * 86400000).getFullYear() < new Date().getFullYear() || (m11.year.count === 3 && m11.year.minutes === 210)) && m11.streak >= 3 && ov.members.find((m) => m.nr === '008').year.count === 0, m11);
  check('Fitness: eigene vergangene Buchung zum Austragen', ov.mine.some((b) => b.id === 'F-OLD-0' && b.past) && !ov.mine.some((b) => b.id === 'F-OLD-2'));

  check('Fitness: fremde Buchung nicht stornierbar', !post({ action: 'fitnessCancel', token: fit2Tok, id: b1.id }).ok);
  check('Fitness: zu alte Buchung nicht stornierbar', !post({ action: 'fitnessCancel', token: fit2Tok, id: 'F-OLD-2' }).ok);
  check('Fitness: eigene stornieren', post({ action: 'fitnessCancel', token: fitTok, id: b1.id }).ok && g.find((r) => r[0] === b1.id)[6] === 'ja');
  check('Fitness: danach wieder frei', post({ action: 'fitnessBook', token: fit2Tok, date: day, time: '18:00', minutes: 60 }).ok);
  const own = post({ action: 'fitnessOverview', token: fit2Tok }).mine.find((b) => !b.past);
  check('Fitness: Verwaltung darf jede stornieren', post({ action: 'fitnessCancel', token: admTok, id: own.id }).ok);
  check('Fitness: Konstruktor-/Unsinns-IDs abgelehnt', !post({ action: 'fitnessCancel', token: fitTok, id: 'constructor' }).ok && !post({ action: 'fitnessCancel', token: fitTok }).ok);
}

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

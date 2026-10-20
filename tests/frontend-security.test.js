// Sicherheitstest im Browser: bösartige Server-Antworten, manipulierter Gerätespeicher und manipulierte Adressen
// dürfen nie eingeschleusten Code oder HTML in die Seite bringen (zusätzlich zur Content-Security-Policy).
const H = require('./helpers');
const { check, summary, startServer, launch, newContext, newPage, acceptConsent } = H;
const X = `<img src=x class=pwn onerror="window.__xss=1"><svg class=pwn onload="window.__xss=1"></svg>"'><script class=pwn>window.__xss=1</script>`;
const J = 'javascript:window.__xss=1';
const T = 'a'.repeat(40);
const task = { id: 'T-261020-ABCD', source: X, type: X, status: 'offen', entrance: X, wohnung: X, name: X, contact: J, date: '2026-10-01', details: X, ort: X, urgent: true, created: '2026-10-01', owner: 'Hausmeister', assignee: '100', mine: true, note: X, by: X, photo: J, photoDone: J, longRunner: true, longReason: X,
  sla: { light: 'red', react: 'late', done: 'open', reactDue: X, doneDue: X } };
const evil = (role) => (d) => {
  const m = {
    hmLogin: { ok: true, user: { name: X, role, fitness: true }, areas: [{ code: 'TG', ort: X, activity: X }, { code: X, ort: X }], activities: [X], plan: { today: [{ activity: X, ort: X }] }, ntfy: J },
    getTasks: { ok: true, tasks: [task], me: X },
    adminOverview: { ok: true, role, kpi: { open: X, overdue: X, dueSoon: X, avgReactHours: X, avgLeadDays: X, slaQuote: X, closed90: X, cleaningQuote: X, errors24: X, longRunners: X },
      months: [{ month: X, Mangel: X }], perEntrance: { [X]: X }, tasks: [task], team: [X, '100'], news: [{ id: X, title: X, text: X, from: X, to: X, entrances: [X] }], polls: [{ id: X, question: X, options: [X, X], votes: [X], until: X }],
      work: { days: [{ date: X, done: [{ time: X, activity: X, ort: X }], missing: [{ activity: X, ort: X }] }] } },
    fitnessOverview: { ok: true, me: X, weeklyGoal: X, upcoming: [{ id: X, nr: X, with: [X], start: '2030-01-01T08:00:00Z', end: '2030-01-01T09:00:00Z', mine: true }], mine: [{ id: X, nr: X, with: [X], own: true, start: '2030-01-01T08:00:00Z', end: '2030-01-01T09:00:00Z', past: false }],
      members: [{ nr: X, week: { count: X, minutes: X, together: X }, month: { count: 1, minutes: 60 }, year: { count: 1, minutes: 60 }, streak: X }], rules: {} },
    news: { ok: true, items: [{ title: X, text: X, important: true, from: X, to: '2030-12-31' }], care: { last: [{ ort: X, activity: X, time: '2026-09-23T08:00:00Z' }], next: [{ activity: X, ort: X, from: '2030-01-01', to: X }] },
      polls: [{ id: X, question: X, options: [X, X], until: X, showResults: true, results: [X, 1] }], weather: { days: [{ date: X, tmax: X, tmin: X, icon: X, precip: X }], warnings: [{ headline: X, description: X, severity: X, onset: X, expires: X }] } },
    status: { ok: true, items: [{ id: 'T-260924-ABCD', kind: 'ticket', type: X, status: X, created: X, done: X }] },
  };
  return m[d.action] || { ok: true, id: X, error: X };
};
setTimeout(() => { console.log('FAIL Sicherheitstest hängt (Zeitüberschreitung)'); process.exit(1); }, 180000).unref();
(async () => {
  const { server, base } = await startServer(); const b = await launch();
  const watch = async (ctx) => { const p = await newPage(ctx); p.csp = 0; await p.exposeFunction('__cspHit', () => { p.csp++; }); await p.addInitScript(() => document.addEventListener('securitypolicyviolation', () => window.__cspHit && window.__cspHit())); return p; };
  const pwned = async (p) => ({ xss: await p.evaluate(() => window.__xss || 0), nodes: await p.evaluate(() => document.querySelectorAll('.pwn, script:not([src])').length), csp: p.csp, js: await p.evaluate(() => [...document.querySelectorAll('a[href]')].filter((a) => /^\s*javascript:/i.test(a.getAttribute('href'))).length) });
  const clean = (r) => !r.xss && !r.nodes && !r.js;
  // Bewohner
  let ctx = await newContext(b, { backend: evil('Verwaltung'), preset: 'resident' }); let p = await watch(ctx);
  for (const v of ['notfall', 'infos', 'meldungen', 'services', 'anliegen']) { await p.goto(`${base}?obj=lind6#${v}`); await p.waitForTimeout(700); }
  let r = await pwned(p); check('F1 Bewohner: Hinweise, Umfrage, Wetter, Reinigung, Status – kein eingeschleuster Code', clean(r), r);
  await ctx.close();
  // Verwaltung: Cockpit + Hausmeister + Fitness + QR-Druck
  ctx = await newContext(b, { backend: evil('Verwaltung') }); p = await watch(ctx);
  await p.goto(`${base}?obj=lind6&hm=${T}#cockpit`); await acceptConsent(p); await p.waitForTimeout(1200);
  for (const f of await p.$$('#cockpitFilters [data-filter], .chips [data-filter]')) { await f.click({ timeout: 1000 }).catch(() => {}); }
  await p.click('#cockpitTools [data-tool-pane="tasks"]', { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(900);
  for (const v of ['fitness', 'qrdruck']) { await p.goto(`${base}?obj=lind6#${v}`); await p.waitForTimeout(900); }
  r = await pwned(p); check('F2 Verwaltung: Cockpit, Aufträge, Arbeiten, Hinweise/Umfragen-Verwaltung, Fitness, QR-Druck – kein eingeschleuster Code', clean(r), r);
  const tel = await p.$$eval('a[href^="tel:"]', (a) => a.map((x) => x.getAttribute('href')));
  check('F3 Telefon-Links nur mit Ziffern', tel.every((h) => /^tel:[+\d]*$/.test(h)), tel);
  const imgs = await p.$$eval('a[href], img[src]', (a) => a.map((x) => x.getAttribute('href') || x.getAttribute('src')).filter((h) => /^\s*(javascript|data:text)/i.test(h)));
  check('F4 Keine javascript:/data:text-Links (Fotos, Alarm-App)', imgs.length === 0, imgs);
  await ctx.close();
  // Hausmeister-Team (einfache Ansicht)
  ctx = await newContext(b, { backend: evil('Hausmeister') }); p = await watch(ctx);
  await p.goto(`${base}?obj=lind6&hm=${T}#hausmeister`); await acceptConsent(p); await p.waitForTimeout(1000);
  for (const pane of ['tasks', 'defect', 'scan']) { await p.click(`#hmTabbar [data-hm-pane="${pane}"]`, { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(600); }
  r = await pwned(p); check('F5 Hausmeister-Team: Aufträge, Orte, Plan – kein eingeschleuster Code', clean(r), r);
  await ctx.close();
  // Manipulierter Gerätespeicher
  ctx = await newContext(b, { backend: evil('Verwaltung'), preset: 'resident' }); p = await watch(ctx);
  await p.addInitScript((X) => { try { localStorage.setItem('mieterapp.myTickets', JSON.stringify([{ id: X, type: X, at: X }])); localStorage.setItem('mieterapp.staff', JSON.stringify({ token: 'zz', user: { name: X, role: X }, areas: [{ code: X, ort: X }] })); localStorage.setItem('mieterapp.fitness', '{"token":"zz","data":' + JSON.stringify({ me: X, members: [{ nr: X }] }) + '}'); localStorage.setItem('mieterapp.lang', X); localStorage.setItem('mieterapp.object', X); } catch (e) {} }, X);
  for (const v of ['notfall', 'meldungen', 'hausmeister', 'cockpit', 'fitness']) { await p.goto(`${base}#${v}`); await p.waitForTimeout(600); }
  r = await pwned(p); check('F6 Manipulierter Gerätespeicher → kein Code', clean(r), r);
  // Adress-Tricks
  for (const u of [`?obj=${encodeURIComponent(X)}#notfall`, `?hm=${encodeURIComponent(X)}#hausmeister`, `?scan=${encodeURIComponent(X)}#hausmeister`, `#${encodeURIComponent(X)}`, `?obj=__proto__#notfall`]) { await p.goto(base + u); await p.waitForTimeout(500); }
  r = await pwned(p); check('F7 Manipulierte Adressen (obj, hm, scan, Hash) → kein Code', clean(r), r);
  await ctx.close(); await b.close(); server.close(); summary();
})();

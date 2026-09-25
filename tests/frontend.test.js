// Browser-Tests der App (Chromium über Playwright). Start: node tests/frontend.test.js
// Das Backend (Google Apps Script) und die Abfahrts-API werden nachgebildet.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PIN, PIN_HASH, check, summary, startServer, launch, newContext, newPage, acceptConsent } = require("./helpers");

const STAFF = "a".repeat(40);
const ADMIN = "b".repeat(40);
const LEAD = "c".repeat(40);
const AREAS = [
  { code: "TH_LIND6", ort: "Treppenhaus Lindenberger Str. 6", bereich: "Aufgang", aufgang: "lind6", activity: "Treppenhausreinigung" },
  { code: "MUELL", ort: "Müllplatz (außen)", bereich: "Außen", aufgang: "", activity: "Müllplatzreinigung" },
];
const ACTIVITIES = ["Treppenhausreinigung", "Fensterreinigung Aufgang", "Müllplatzreinigung", "Kontrollgang"];

/** Standard-Backend: prüft PIN/Token wie das echte Backend und antwortet plausibel. */
function fakeBackend(state = {}) {
  return (d) => {
    const staff = { [STAFF]: { name: "Nr. 100", role: "Hausmeister" }, [ADMIN]: { name: "Nr. 007", role: "Verwaltung" }, [LEAD]: { name: "Nr. 001", role: "Leitung" } }[d.token];
    if (["hmLogin", "logCleaning", "getTasks", "completeTask", "submitStaffDefect", "adminOverview", "adminUpdateTask", "adminNewsSave", "adminNewsEnd", "adminPollSave", "adminPollEnd"].includes(d.action)) {
      if (!staff) return { ok: false, error: "Kein gültiger Zugang", code: "staff" };
      if (state.offline && d.action === "logCleaning") return "abort";
      if (d.action === "hmLogin") return { ok: true, user: staff, areas: AREAS, activities: ACTIVITIES, plan: state.plan || null };
      if (d.action === "getTasks") return state.hangTasks ? null : { ok: true, tasks: state.tasks || [] };
      if (d.action === "completeTask") { state.tasks = (state.tasks || []).filter((t) => t.id !== d.id); return { ok: true }; }
      if (d.action === "submitStaffDefect") return { ok: true, id: "M-260924-ABCD" };
      if (["adminOverview", "adminUpdateTask", "adminNewsSave", "adminNewsEnd", "adminPollSave", "adminPollEnd"].includes(d.action)) {
        if (staff.role === "Hausmeister") return { ok: false, error: "Nur für Verwaltung und Leitung.", code: "staff" };
        if (staff.role === "Leitung" && state.leadOverview && d.action === "adminOverview") return state.leadOverview;
        if (["adminUpdateTask", "adminNewsSave", "adminNewsEnd", "adminPollSave", "adminPollEnd"].includes(d.action)) { (state.updates = state.updates || []).push(d); return { ok: true }; }
        return state.overview || { ok: true, kpi: { open: 0, overdue: 0, dueSoon: 0, avgReactHours: null, avgLeadDays: null, slaQuote: null, closed90: 0, cleaningQuote: null, errors24: 0 }, months: [], perEntrance: {}, tasks: [], lookerUrl: "" };
      }
      return { ok: true };
    }
    const pin = state.pin || PIN;
    if (d.pin !== pin && !staff) return { ok: false, error: "PIN ungültig", code: "pin" };
    if (d.action === "news") return { ok: true, items: state.news || [], care: state.care || null, weather: state.weather || null, polls: state.polls || [] };
    if (d.action === "vote") { const p = (state.polls || []).find((x) => x.id === d.pollId); return { ok: true, results: p ? p.options.map((_, i) => (i === d.option ? 1 : 0)) : null }; }
    if (d.action === "status") return { ok: true, items: [] };
    return { ok: true, id: d.action === "submitMeterReadings" ? "E-260924-ABCD" : "T-260924-ABCD", count: 1 };
  };
}

/** Kamera-Attrappe: Video (Y4M) mit einem QR-Code, den der Scanner lesen muss. */
function makeQrVideo(text) {
  global.window = global.window || {};
  const qrcode = require("../vendor/qrcode-generator.js");
  const qr = qrcode(0, "M"); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), W = 640, H = 480, cell = Math.floor(380 / (n + 8));
  const size = cell * (n + 8), ox = (W - size) >> 1, oy = (H - size) >> 1;
  const Y = Buffer.alloc(W * H, 235);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c))
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) Y[(oy + (r + 4) * cell + y) * W + ox + (c + 4) * cell + x] = 16;
  const UV = Buffer.alloc((W / 2) * (H / 2), 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < 15; i++) parts.push(Buffer.from("FRAME\n"), Y, UV, UV);
  const file = path.join(os.tmpdir(), `mieterapp-qr-${process.pid}.y4m`);
  fs.writeFileSync(file, Buffer.concat(parts));
  return file;
}

(async () => {
  const { server, base } = await startServer();
  const video = makeQrVideo(`${base}?scan=TH_LIND6#hausmeister`);
  const browser = await launch(["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`]);
  const tabs = async (p) => (await p.$$eval(".tabbar__item:not([hidden])", (t) => t.map((x) => x.textContent.trim() + (x.getAttribute("aria-current") ? "*" : "")))).join("|");

  try {
    console.log("--- Zustimmung und PIN");
    {
      const ctx = await newContext(browser, { backend: fakeBackend() });
      let p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6#notfall`); await p.waitForTimeout(300);
      check("Erststart: Dialog mit PIN-Feld", await p.isVisible("#consent") && await p.isVisible("#pinInput"));
      await p.check("#consentCheck");
      check("Zustimmen ohne PIN gesperrt", await p.isDisabled("#consentAccept"));
      for (const wrong of ["11111", "22222", "33333"]) { await p.fill("#pinInput", wrong); await p.click("#consentAccept"); await p.waitForTimeout(100); }
      check("3 Fehlversuche → Sperre", await p.isDisabled("#pinInput") && /Fehlversuche/.test(await p.textContent("#pinMsg")));
      await p.reload(); await p.waitForTimeout(300);
      check("Sperre bleibt nach Neuladen", await p.isDisabled("#pinInput"));
      await p.evaluate(() => localStorage.setItem("mieterapp.pinlock", JSON.stringify({ fails: 0, until: Date.now() - 1 })));
      await p.reload(); await p.waitForTimeout(300);
      await acceptConsent(p);
      check("Richtige PIN → App frei", !(await p.isVisible("#consent")));
      check("Impressum ohne Zustimmung erreichbar", await (async () => { const q = await newPage(await newContext(browser)); await q.goto(`${base}#impressum`); await q.waitForTimeout(200); return (await q.isVisible('[data-view="impressum"]')) && !(await q.isVisible("#consent")); })());
      p = await newPage(ctx); await p.goto(`${base}?obj=lind6#notfall`); await p.waitForTimeout(300);
      check("Neuer Start: kein Dialog (PIN pro Gerät, Zustimmung 30 Tage)", !(await p.isVisible("#consent")));
      await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("mieterapp.consent")); c.at -= 31 * 86400000; localStorage.setItem("mieterapp.consent", JSON.stringify(c)); });
      await p.reload(); await p.waitForTimeout(300);
      check("Nach 31 Tagen: Zustimmung erneut, ohne PIN", await p.isVisible("#consent") && !(await p.isVisible("#pinInput")));
      await acceptConsent(p);
      await p.goto(`${base}?obj=lind6#datenschutz`); await p.click("#consentRevoke"); await p.waitForTimeout(200);
      await p.goto(`${base}?obj=lind6#notfall`); await p.reload(); await p.waitForTimeout(300);
      check("Widerruf: Dialog mit PIN", await p.isVisible("#consent") && await p.isVisible("#pinInput"));
      check("Keine Skriptfehler", !p.errors.length, p.errors);
      await ctx.close();
    }
    {
      const state = { pin: "99999" };
      const ctx = await newContext(browser, { backend: fakeBackend(state), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6#notfall`); await p.waitForTimeout(800);
      check("PIN geändert → Dialog mit PIN-Feld", await p.isVisible("#pinInput") && /geändert/.test(await p.textContent("#pinMsg")));
      await acceptConsent(p); await p.goto(`${base}?obj=lind6#infos`); await p.goto(`${base}?obj=lind6#notfall`); await p.waitForTimeout(800);
      check("Keine Dialog-Schleife bei dauerhafter Ablehnung", ctx.requests.filter((r) => r.action === "news").length <= 3);
      await ctx.close();
    }

    console.log("--- Navigation");
    {
      const ctx = await newContext(browser, { backend: fakeBackend(), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6#notfall`); await p.waitForTimeout(300);
      check("Tabs: Start, Services, Infos, Meldungen", (await tabs(p)).replace(/[^\w|äöüÄÖÜ*]/g, "") === "Start*|Services|Infos|Meldungen", await tabs(p));
      check("Startseite: Titel Start, Abschnitt Im Notfall", (await p.textContent("#viewTitle")) === "Start" && /Im Notfall/.test(await p.textContent('[data-view="notfall"]')));
      const levels = await p.$$eval("#emergencyList .contact", (c) => c.map((x) => x.className));
      check("Notfallnummern: rote und orange Stufen", levels.filter((c) => /danger/.test(c)).length === 3 && levels.filter((c) => /urgent/.test(c)).length === 2, levels);
      await p.goto(`${base}?obj=lind6#infos`); await p.click(".transit-link"); await p.waitForSelector(".departure__dir", { timeout: 15000 });
      check("Abfahrten über Infos, Zurück → Infos", (await p.textContent("#backLabel")) === "Infos" && /Infos\*/.test(await tabs(p)));
      check("Apotheken-Notdienst als Link, kein eingebettetes Fenster", (await p.$$("iframe")).length === 0 && /aponet\.de/.test(await p.getAttribute(".kiez-link", "href")));
      check("Services: 5 Kacheln ohne „Meine Meldungen“", (await p.$$eval(".tile", (t) => t.map((x) => x.getAttribute("href")))).join() === "#wasser,#mangel,#elektro,#klingel,#strom");
      for (const bad of ['#x"],body,[a="', "#__proto__", "?obj=<b>#notfall"]) {
        await p.goto(base + bad); await p.waitForTimeout(200);
        check(`Manipulierte Adresse ${bad} → Startseite`, (await p.textContent("#viewTitle")) === "Start");
      }
      check("Keine Skriptfehler", !p.errors.length, p.errors);
      await ctx.close();
    }

    console.log("--- Formulare");
    {
      const ctx = await newContext(browser, { backend: fakeBackend(), preset: "resident" });
      const p = await newPage(ctx);
      const png = path.join(__dirname, "..", "icons", "icon-192.png");
      await p.goto(`${base}?obj=lind6#wasser`); await p.waitForTimeout(300);
      await p.fill("#formWater [name=wohnung]", "Whg 04");
      await p.fill(".meter >> nth=0 >> [data-f=zaehlernummer]", "A1"); await p.fill(".meter >> nth=0 >> [data-f=zaehlerstand]", "12,5");
      await p.setInputFiles(".meter >> nth=0 >> [data-f=foto]", png);
      await p.click("#addMeter");
      const m2 = p.locator(".meter").nth(1);
      await m2.locator("input[value=Heizung]").check({ force: true });
      check("Heizungszähler: Raum Flur, Einheit wählbar", (await m2.locator("[data-f=raum]").inputValue()) === "Flur" && await m2.locator("[data-f=einheit]").isVisible());
      await m2.locator("[data-f=einheit]").selectOption("MWh"); await m2.locator("[data-f=zaehlernummer]").fill("H1"); await m2.locator("[data-f=zaehlerstand]").fill("4,321");
      await m2.locator("[data-f=foto]").setInputFiles(png);
      await p.click("#waterSubmit"); await p.waitForTimeout(1200);
      const sent = ctx.requests.find((r) => r.action === "submitMeterReadings");
      check("Zählermeldung gesendet (mit PIN, Einheiten)", sent && sent.pin === PIN && sent.meters.map((m) => `${m.art}/${m.einheit}/${m.zaehlerstand}`).join() === "Kalt/m³/12.5,Heizung/MWh/4.321", sent && sent.meters);
      check("Bestätigung mit Nummer", /E-260924-ABCD/.test(await p.textContent("#toast")));
      await p.goto(`${base}?obj=lind6#mangel`); await p.waitForTimeout(200);
      await p.selectOption("#formDefect [name=ort]", "Keller"); await p.fill("#formDefect [name=details]", "Licht kaputt");
      await p.click("#formDefect [type=submit]"); await p.waitForTimeout(800);
      const mangel = ctx.requests.find((r) => r.action === "submitTicket");
      check("Mangel gesendet", mangel && mangel.type === "Mangel" && mangel.object === "lind6" && mangel.ort === "Keller");
      check("Meldung unter „Meldungen“ gemerkt", (await p.evaluate(() => JSON.parse(localStorage.getItem("mieterapp.tickets") || "[]").length)) >= 2);
      check("Keine Skriptfehler", !p.errors.length, p.errors);
      await ctx.close();
    }

    console.log("--- Hinweise Treppenhausreinigung");
    for (const [when, expect] of [["2026-09-22T19:00:00+02:00", "Morgen Treppenhausreinigung"], ["2026-09-23T07:00:00+02:00", "Heute Treppenhausreinigung"], ["2026-09-24T07:00:00+02:00", null]]) {
      const ctx = await newContext(browser, { backend: fakeBackend(), preset: "resident" });
      const p = await newPage(ctx);
      await p.clock.install({ time: new Date(when) });
      await p.goto(`${base}?obj=lind6#notfall`); await p.clock.runFor(1500);
      const titles = await p.$$eval(".news__title", (h) => h.map((x) => x.textContent));
      check(`${when.slice(0, 10)}: ${expect || "kein Reinigungshinweis"}`, expect ? titles.includes(expect) : !titles.some((t) => /Treppenhausreinigung/.test(t)), titles);
      await ctx.close();
    }

    console.log("--- Sprachen");
    for (const lang of ["en", "ru", "uk", "cs"]) {
      const ctx = await newContext(browser, { backend: fakeBackend(), preset: "resident", lang });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6#services`); await p.waitForTimeout(400);
      const label = await p.textContent('.tabbar__item[data-tab="services"]');
      check(`${lang}: übersetzt, ohne Fehler`, !/Services/.test(label) || lang === "en", label);
      check(`${lang}: keine Skriptfehler`, !p.errors.length, p.errors);
      await ctx.close();
    }

    console.log("--- Hausmeister-Portal");
    {
      const state = { tasks: [
        { id: "M-1", source: "Nr. 100", type: "Mangel (intern)", status: "offen", details: "Tor klemmt", ort: "Tiefgarage", urgent: true, created: "2026-09-24", owner: "Hausmeister" },
        { id: "T-1", source: "Bewohner", type: "Klingelschild", status: "offen", entrance: "Lindenberger Str. 6", wohnung: "04", name: "Müller", contact: "0170 1234567", created: "2026-09-20", owner: "Hausmeister" },
      ] };
      const ctx = await newContext(browser, { backend: fakeBackend(state), extra: { permissions: ["camera"] } });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6&hm=${STAFF}#hausmeister`); await p.waitForTimeout(300);
      check("Persönlicher Link: Token aus der Adresse entfernt", !p.url().includes("hm="));
      check("Hausmeister ohne PIN-Feld", !(await p.isVisible("#pinInput")));
      await acceptConsent(p); await p.waitForSelector("#staffArea:not([hidden])");
      check("Angemeldet als Nr. 100, Tab sichtbar", (await p.textContent("#staffName")) === "Nr. 100" && await p.isVisible("#staffTab"));
      check("Manifest der Hausmeister-App aktiv", (await p.getAttribute("#appManifest", "href")) === "manifest-hausmeister.json");
      await p.click("#scanBtn"); await p.waitForSelector("#scanForm:not([hidden])", { timeout: 15000 });
      check("Kamera-Scan erkennt den QR-Code", (await p.textContent("#scanPlace")) === AREAS[0].ort && (await p.inputValue("#scanActivity")) === "Treppenhausreinigung");
      const t0 = Date.now(); await p.click("#scanForm [type=submit]"); await p.waitForSelector("#scanDone:not([hidden])");
      check("Haken sofort (< 1,5 s)", Date.now() - t0 < 1500);
      await p.waitForTimeout(3200);
      state.offline = true;
      await p.click("#manualBtn"); await p.selectOption("#scanManual", "MUELL"); await p.click("#scanForm [type=submit]"); await p.waitForTimeout(800);
      check("Ohne Netz: Nachweis wartet", await p.isVisible("#staffQueue"));
      state.offline = false; await p.evaluate(() => window.dispatchEvent(new Event("online"))); await p.waitForTimeout(800);
      const sentScans = ctx.requests.filter((r) => r.action === "logCleaning");
      check("Nachgesendet mit Scan-Zeit, manuell gekennzeichnet", !(await p.isVisible("#staffQueue")) && sentScans.some((r) => r.areaToken === "MUELL" && r.manual === true && r.timestamp));
      await p.waitForTimeout(3000);
      await p.check("#staffTabs input[value=tasks]", { force: true }); await p.waitForSelector(".task");
      check("Aufträge: dringend zuerst, Telefon als Link", (await p.$$eval(".task__type", (t) => t.map((x) => x.textContent))).join() === "Mangel (intern),Klingelschild" && (await p.getAttribute(".task a[href^=tel]", "href")) === "tel:01701234567");
      await p.click('[data-done="M-1"]');
      check("Erledigt öffnet Feld für Nachher-Foto", await p.isVisible('[data-panel="M-1"] [data-photo]'));
      await p.setInputFiles('[data-panel="M-1"] [data-photo]', { name: "nachher.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
      await p.click('[data-confirm-done="M-1"]'); await p.waitForTimeout(800);
      check("Nachher-Foto wird mitgesendet", ctx.requests.some((r) => r.action === "completeTask" && r.id === "M-1" && r.photo && r.photo.data && /^image\//.test(r.photo.mimeType)));
      check("Erledigt verschwindet sofort", !(await p.$('[data-done="M-1"]')));
      state.hangTasks = true;
      await p.goto(`${base}#notfall`); await p.goto(`${base}#hausmeister`); await p.check("#staffTabs input[value=tasks]", { force: true }); await p.waitForTimeout(300);
      check("Hängendes Backend: gespeicherte Liste sofort sichtbar", await p.isVisible(".task") && /wird aktualisiert/.test(await p.textContent("#tasksStatus")));
      state.hangTasks = false;
      p.once("dialog", (dlg) => dlg.accept()); await p.click("#staffLogout"); await p.waitForTimeout(300);
      check("Abmelden", !(await p.isVisible("#staffTab")) && !(await p.evaluate(() => localStorage.getItem("mieterapp.staff"))));
      check("Keine Skriptfehler", !p.errors.length, p.errors);
      await ctx.close();
    }
    {
      // Abmelden, während die Anmeldung noch läuft (verspätete Antwort darf nicht wieder anmelden)
      let release;
      const ctx = await newContext(browser, { backend: async (d) => {
        if (d.action === "hmLogin") { await new Promise((r) => { release = r; }); return { ok: true, user: { name: "Nr. 100", role: "Hausmeister" }, areas: AREAS, activities: ACTIVITIES }; }
        return fakeBackend()(d);
      }, preset: "resident" });
      const p = await newPage(ctx);
      await p.addInitScript((t) => { if (!localStorage.getItem("mieterapp.staff")) localStorage.setItem("mieterapp.staff", JSON.stringify({ token: t, user: { name: "Nr. 100", role: "Hausmeister" }, areas: [], activities: [] })); }, STAFF);
      await p.goto(`${base}?obj=lind6#hausmeister`); await p.waitForTimeout(300);
      p.once("dialog", (dlg) => dlg.accept()); await p.click("#staffLogout"); await p.waitForTimeout(100);
      if (release) release(); await p.waitForTimeout(500);
      check("Abmelden während laufender Anmeldung bleibt abgemeldet", !(await p.evaluate(() => localStorage.getItem("mieterapp.staff"))));
      await ctx.close();
    }
    {
      const ctx = await newContext(browser, { backend: fakeBackend(), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?app=hausmeister#hausmeister`); await p.waitForTimeout(300);
      await p.fill("#staffLinkInput", `Link: ${base}?hm=${ADMIN}#hausmeister`); await p.click("#staffLinkForm [type=submit]");
      await p.waitForSelector("#staffArea:not([hidden])");
      check("Link einfügen meldet an (Verwaltung)", /007/.test(await p.textContent("#staffName")) && await p.isVisible("#staffAdmin"));
      await p.click('a[href="#qrdruck"]'); await p.waitForSelector(".qr-card svg");
      check("QR-Druckbogen", (await p.$$(".qr-card")).length === AREAS.length);
      await ctx.close();
    }
    {
      const iso = (h) => new Date(Date.now() + h * 3600000).toISOString();
      const mk = (id, light, extra) => ({ id, kind: "ticket", source: "Bewohner", type: "Klingelschild", status: "offen", owner: "Hausmeister", urgent: false, created: iso(-100), inWork: "", done: "", termin: "", entrance: "Dorfstr. 24", wohnung: "5", name: "", contact: "", details: "Name falsch", ort: "", note: "", by: "",
        sla: { light, react: light === "red" ? "overdue" : "open", done: "open", reactDue: iso(light === "red" ? -5 : 10), doneDue: iso(100) }, ...extra });
      const state = { overview: { ok: true, kpi: { open: 2, overdue: 1, dueSoon: 1, avgReactHours: 5.5, avgLeadDays: 2.25, slaQuote: 0.8, closed90: 10, cleaningQuote: 0.95, cleaningIst: 19, cleaningSoll: 20, errors24: 0 },
        months: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, Mangel: i % 3, Klingelschild: 1, Elektroraum: 0, "Mangel (intern)": 0, Zähler: 2, Nachweise: 20 })),
        perEntrance: { "Dorfstr. 24": 5, "Lindenberger Str. 6": 2 }, lookerUrl: "https://lookerstudio.google.com/reporting/abc", role: "Verwaltung",
        work: { days: [
          { date: "2026-09-24", planned: 2, plannedDone: 1, done: [{ time: "08:10", activity: "Treppenhausreinigung", ort: "Treppenhaus Dorfstr. 24", planned: true, manual: false },
            { time: "09:00", activity: "Kontrollgang", ort: "Tiefgarage", planned: false, manual: true }], missed: [], open: [{ activity: "Müllplatzreinigung", ort: "Müllplatz" }] },
          { date: "2026-09-22", planned: 2, plannedDone: 0, done: [], missed: [{ activity: "Treppenhausreinigung", ort: "Treppenhaus Lindenberger Str. 6", lateOn: "2026-09-23" },
            { activity: "Fensterreinigung Aufgang", ort: "Treppenhaus Lindenberger Str. 8", lateOn: "" }], open: [] }] },
        tasks: [mk("T-1", "red"), mk("T-2", "yellow", { owner: "Verwaltung", type: "Mangel" }), mk("T-3", "done", { status: "erledigt", done: iso(-2) })] } };
      const ctx = await newContext(browser, { backend: fakeBackend(state), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?hm=${ADMIN}#hausmeister`); await p.waitForSelector("#staffArea:not([hidden])");
      check("Verwaltung: Tab heißt Cockpit", /Cockpit/.test(await p.textContent("#staffTab")) && (await p.getAttribute("#staffTab", "href")) === "#cockpit");
      await p.click("#staffTab"); await p.waitForSelector("#cockpitList .task");
      check("Cockpit: Kennzahlen", (await p.$$(".kpi")).length === 8 && /80 %/.test(await p.textContent("#cockpitKpis")) && /5,5 Std\./.test(await p.textContent("#cockpitKpis")));
      check("Cockpit: offene Aufträge mit Ampel, Überfälliges markiert", (await p.$$("#cockpitList .task")).length === 2 && await p.isVisible(".task--sla-red .sla-dot--red") && /überfällig/.test(await p.textContent(".task--sla-red .task__due")));
      check("Cockpit-Tab aktiv markiert", (await p.getAttribute("#staffTab", "aria-current")) === "page");
      await p.click('#cockpitFilter [data-filter="red"]');
      check("Filter Überfällig", (await p.$$("#cockpitList .task")).length === 1);
      await p.click('#cockpitFilter [data-filter="Verwaltung"]');
      check("Filter Verwaltung", (await p.$$("#cockpitList .task")).length === 1 && /Mangel/.test(await p.textContent("#cockpitList .task__type")));
      await p.click('#cockpitFilter [data-filter="done"]');
      check("Filter Erledigt", (await p.$$("#cockpitList .task")).length === 1 && /eingehalten/.test(await p.textContent("#cockpitList .task__due")));
      await p.click('#cockpitFilter [data-filter="open"]');
      await p.click('.task--sla-red .task__edit summary');
      await p.selectOption('.task--sla-red select[name="status"]', "in Arbeit");
      await p.fill('.task--sla-red textarea[name="note"]', "Schild bestellt");
      await p.click('.task--sla-red [type="submit"]'); await p.waitForTimeout(400);
      check("Bearbeiten sendet Status + Notiz", (state.updates || []).some((u) => u.id === "T-1" && u.status === "in Arbeit" && u.note === "Schild bestellt" && u.owner === "Hausmeister" && u.token === ADMIN), state.updates);
      check("Diagramme (3 Monats-Charts + Aufgänge)", (await p.$$("#cockpitCharts svg")).length === 3 && (await p.$$(".hbars li")).length === 2);
      check("Looker-Link", (await p.getAttribute("#cockpitLooker", "href")) === "https://lookerstudio.google.com/reporting/abc" && await p.isVisible("#cockpitLooker"));
      {
        const txt = await p.textContent("#cockpitTeam");
        check("Erledigte Arbeiten je Tag: Plan-Abgleich, zusätzlich, nachgeholt, nicht nachgewiesen – ohne Nummern",
          (await p.$$(".work-day")).length === 2 && /Plan 1\/2/.test(txt) && /außerplanmäßig/.test(txt) && /nachgeholt/.test(txt) && /nicht nachgewiesen/.test(txt) && /heute geplant/.test(txt) && !/Nr\./.test(txt), txt);
      }
      check("Keine Fehler im Cockpit", p.errors.length === 0, p.errors);
      await ctx.close();
    }
    {
      const iso = (h) => new Date(Date.now() + h * 3600000).toISOString();
      const state = { leadOverview: { ok: true, role: "Leitung", kpi: { open: 1, overdue: 0, dueSoon: 0, avgReactHours: 3, avgLeadDays: 1, slaQuote: 1, closed90: 2, cleaningQuote: 0.9, cleaningIst: 9, cleaningSoll: 10, errors24: null },
        months: [{ month: "2026-09", Mangel: 1, Klingelschild: 1, Elektroraum: 0, "Mangel (intern)": 0, Zähler: 0, Nachweise: 5 }], perEntrance: { "Dorfstr. 24": 1 }, lookerUrl: "",
        work: { days: [{ date: "2026-09-24", planned: 1, plannedDone: 1, done: [{ time: "07:30", activity: "Müllplatzreinigung", ort: "Müllplatz", planned: true, manual: false }], missed: [], open: [] }] },
        tasks: [{ id: "T-9", source: "Bewohner", type: "Klingelschild", status: "offen", owner: "Hausmeister", created: iso(-5), entrance: "Dorfstr. 24", wohnung: "3", details: "x", note: "", by: "",
          sla: { light: "green", react: "open", done: "open", reactDue: iso(20), doneDue: iso(200) } }] } };
      const ctx = await newContext(browser, { backend: fakeBackend(state), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?hm=${LEAD}#hausmeister`); await p.waitForSelector("#staffArea:not([hidden])");
      check("Leitung (001): Tab Cockpit + Werkzeuge", /Cockpit/.test(await p.textContent("#staffTab")) && await p.isVisible("#staffAdmin") && /Leitung/.test(await p.textContent("#staffName")));
      await p.click("#staffTab"); await p.waitForSelector("#cockpitList .task");
      check("Leitung: keine Filter nach Zuständigkeit, kein App-Fehler-/Zähler-Bereich, kein Looker", !(await p.isVisible('#cockpitFilter [data-filter="Verwaltung"]')) && (await p.$$(".kpi")).length === 7 && (await p.$$("#cockpitCharts svg")).length === 2 && !(await p.isVisible("#cockpitLooker")));
      await p.click(".task__edit summary");
      check("Leitung: nur Status bearbeitbar", await p.isVisible('.task__edit select[name="status"]') && !(await p.$('.task__edit select[name="owner"]')) && !(await p.$('.task__edit textarea[name="note"]')));
      await p.selectOption('.task__edit select[name="status"]', "erledigt"); await p.click('.task__edit [type="submit"]'); await p.waitForTimeout(400);
      check("Leitung: sendet nur Status", (state.updates || []).some((u) => u.id === "T-9" && u.status === "erledigt" && !("owner" in u) && !("note" in u)), state.updates);
      check("Erledigte Arbeiten für Leitung", /Müllplatzreinigung/.test(await p.textContent("#cockpitTeam")) && /Plan 1\/1/.test(await p.textContent("#cockpitTeam")));
      check("Keine Fehler (Leitung)", p.errors.length === 0, p.errors);
      await ctx.close();
    }
    {
      const ctx = await newContext(browser, { backend: fakeBackend(), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?hm=${STAFF}#hausmeister`); await p.waitForSelector("#staffArea:not([hidden])");
      check("Hausmeister: Tab heißt Hausmeister, kein Cockpit", /Hausmeister/.test(await p.textContent("#staffTab")) && !(await p.isVisible("#staffAdmin")));
      await p.goto(`${base}#cockpit`); await p.waitForTimeout(500);
      check("Hausmeister sieht Cockpit nicht", await p.isVisible("#cockpitNone") && !(await p.isVisible("#cockpitArea")) && !ctx.requests.some((r) => r.action === "adminOverview"));
      await ctx.close();
    }

    console.log("--- Paket A: Hinweise aus dem Cockpit, Heute zu tun");
    {
      const state = { overview: { ok: true, role: "Verwaltung", kpi: {}, months: [], perEntrance: {}, tasks: [], work: { days: [] },
        news: [{ row: 5, title: "Wasser abgestellt", text: "Mi 9–12 Uhr", important: true, from: "2026-09-25", to: "2026-09-30", only: "lind6" }] } };
      const ctx = await newContext(browser, { backend: fakeBackend(state), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?hm=${ADMIN}#hausmeister`); await p.waitForSelector("#staffArea:not([hidden])");
      await p.click("#staffTab"); await p.waitForSelector("#newsAdminList li .news__title");
      check("Cockpit: aktive Hinweise mit Zielgruppe und Zeitraum", /Wasser abgestellt/.test(await p.textContent("#newsAdminList")) && /Lindenberger Str\. 6/.test(await p.textContent("#newsAdminList")) && /bis 30\.09\.2026/.test(await p.textContent("#newsAdminList")));
      await p.click("#newsAdminNew summary");
      await p.fill('#formNewsAdmin [name="title"]', "Treppenhaus frisch gestrichen");
      await p.fill('#formNewsAdmin [name="text"]', "Bitte Geländer bis Freitag nicht berühren.");
      await p.$eval('#newsAdminEntrances', (el) => el.scrollIntoView({ block: "center" }));
      await p.click('#newsAdminEntrances label:has(input[value="dorf24"])');
      await p.$eval('#formNewsAdmin [type="submit"]', (el) => el.scrollIntoView({ block: "center" }));
      await p.check('#formNewsAdmin [name="important"]');
      await p.click('#formNewsAdmin [type="submit"]'); await p.waitForTimeout(400);
      const up = (state.updates || []).find((u) => u.action === "adminNewsSave");
      check("Veröffentlichen sendet Titel, Text, Ab-Datum, Aufgang, wichtig", up && up.title === "Treppenhaus frisch gestrichen" && up.only.join() === "dorf24" && up.important === true && /^\d{4}-\d{2}-\d{2}$/.test(up.from), up);
      p.once("dialog", (dlg) => dlg.accept()); await p.click('[data-news-end="5"]'); await p.waitForTimeout(300);
      check("Beenden sendet Zeile + Titel", (state.updates || []).some((u) => u.action === "adminNewsEnd" && u.row === 5 && u.title === "Wasser abgestellt"));
      check("Keine Fehler (Hinweise)", p.errors.length === 0, p.errors);
      await ctx.close();
    }
    {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
      const state = { plan: { day, items: [{ activity: "Müllplatzreinigung", ort: "Müllplatz (außen)", done: false }, { activity: "Treppenhausreinigung", ort: "Treppenhaus Lindenberger Str. 6", done: false }] } };
      const ctx = await newContext(browser, { backend: fakeBackend(state), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6&hm=${STAFF}#hausmeister`); await p.waitForSelector("#planToday:not([hidden])");
      check("Heute zu tun: Plan für heute sichtbar (0/2)", (await p.textContent("#planTodayCount")) === "0/2" && /Müllplatzreinigung/.test(await p.textContent("#planTodayList")));
      await p.click("#manualBtn"); await p.selectOption("#scanManual", "MUELL"); await p.click("#scanForm [type=submit]"); await p.waitForTimeout(600);
      check("Scan hakt passenden Punkt sofort ab (1/2)", (await p.textContent("#planTodayCount")) === "1/2" && (await p.$$("#planTodayList li.is-done")).length === 1);
      check("Keine Fehler (Heute zu tun)", p.errors.length === 0, p.errors);
      await ctx.close();
    }

    console.log("--- Stimmungsbild");
    {
      const state = { polls: [{ id: "U-1", question: "Fahrradbügel im Hof?", options: ["Ja", "Nein"], to: "2026-10-31", results: null }] };
      const ctx = await newContext(browser, { backend: fakeBackend(state), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6#notfall`); await p.waitForSelector("#pollBox .poll");
      check("Umfrage auf der Startseite mit Antwort-Knöpfen", /Fahrradbügel/.test(await p.textContent("#pollBox")) && (await p.$$("#pollBox [data-vote]")).length === 2);
      await p.click('#pollBox [data-vote="0"]'); await p.waitForSelector("#pollBox .poll__thanks");
      const v = ctx.requests.find((r) => r.action === "vote");
      check("Stimme: Umfrage, Antwort, Aufgang, zufällige Gerätekennung, PIN", v && v.pollId === "U-1" && v.option === 0 && v.obj === "lind6" && /^[a-f0-9]{32}$/.test(v.voter) && v.pin === "13059", v);
      check("Nach der Stimme: Dank + Ergebnisbalken", /Danke/.test(await p.textContent("#pollBox")) && /100 %/.test(await p.textContent("#pollBox")));
      await p.reload(); await p.waitForSelector("#pollBox .poll");
      check("Nach Neuladen: bereits abgestimmt, keine Knöpfe mehr", !(await p.$("#pollBox [data-vote]")));
      await ctx.close();
    }
    {
      const state = { overview: { ok: true, role: "Verwaltung", kpi: {}, months: [], perEntrance: {}, tasks: [], work: { days: [] }, news: [],
        polls: [{ id: "U-1", question: "Fahrradbügel im Hof?", options: ["Ja", "Nein"], open: true, to: "", only: "", showResults: true, counts: [7, 3], total: 10, perEntrance: {} }] } };
      const ctx = await newContext(browser, { backend: fakeBackend(state), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?hm=${ADMIN}#hausmeister`); await p.waitForSelector("#staffArea:not([hidden])");
      await p.click("#staffTab"); await p.waitForSelector("#pollAdminList .poll");
      check("Cockpit: Ergebnis 70/30 % mit Stimmenzahl", /70 %/.test(await p.textContent("#pollAdminList")) && /10 Stimmen/.test(await p.textContent("#pollAdminList")));
      await p.click("#pollAdminNew summary");
      await p.fill('#formPollAdmin [name="question"]', "Grillplatz im Hof?");
      await p.fill('#formPollAdmin [name="options"]', "Ja\nNein\n\nEgal");
      await p.$eval('#formPollAdmin [type="submit"]', (el) => el.scrollIntoView({ block: "center" }));
      await p.click('#formPollAdmin [type="submit"]'); await p.waitForTimeout(400);
      const up = (state.updates || []).find((u) => u.action === "adminPollSave");
      check("Umfrage starten sendet Frage + 3 Antworten (Leerzeile ignoriert)", up && up.question === "Grillplatz im Hof?" && up.options.join("|") === "Ja|Nein|Egal" && up.showResults === true, up);
      p.once("dialog", (dlg) => dlg.accept()); await p.click('[data-poll-end="U-1"]'); await p.waitForTimeout(300);
      check("Umfrage beenden", (state.updates || []).some((u) => u.action === "adminPollEnd" && u.id === "U-1"));
      check("Keine Fehler (Stimmungsbild)", p.errors.length === 0, p.errors);
      await ctx.close();
    }

    console.log("--- Anmeldung über Link (langsamer Server)");
    {
      const state = { failLogin: 0 };
      const be = fakeBackend(state);
      const ctx = await newContext(browser, { backend: async (d) => {
        if (d.action === "hmLogin") {
          await new Promise((r) => setTimeout(r, 2500));
          if (state.failLogin > 0) { state.failLogin--; return "abort"; }
        }
        return be(d);
      } });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6&hm=${ADMIN}#hausmeister`); await p.waitForTimeout(300);
      await acceptConsent(p); await p.waitForTimeout(500);
      check("Während der Anmeldung: „Anmeldung läuft“ statt „Link öffnen“", await p.isVisible("#staffPendingWait") && !(await p.isVisible("#staffNone")));
      await p.waitForSelector("#staffArea:not([hidden])", { timeout: 10000 });
      check("Nach der Anmeldung erscheint der Bereich von selbst (ohne Seitenwechsel)", /007/.test(await p.textContent("#staffName")) && !(await p.isVisible("#staffPending")) && /Cockpit/.test(await p.textContent("#staffTab")));
      await ctx.close();
    }
    {
      const state = { failLogin: 2 };
      const be = fakeBackend(state);
      const ctx = await newContext(browser, { backend: async (d) => {
        if (d.action === "hmLogin" && state.failLogin > 0) { state.failLogin--; return "abort"; }
        return be(d);
      } });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6&hm=${ADMIN}#hausmeister`); await p.waitForTimeout(300);
      await acceptConsent(p);
      await p.waitForSelector("#staffRetry", { state: "visible", timeout: 10000 }).catch(() => {});
      check("Zweimal gescheitert: „Erneut versuchen“ sichtbar", await p.isVisible("#staffRetry") && !(await p.isVisible("#staffPendingWait")));
      await p.click("#staffRetry"); await p.waitForSelector("#staffArea:not([hidden])", { timeout: 10000 });
      check("Erneut versuchen meldet an", /007/.test(await p.textContent("#staffName")));
      await ctx.close();
    }

    console.log("--- Abfahrten über Backend");
    {
      const inMin = (m) => new Date(Date.now() + m * 60000).toISOString();
      const state = {};
      const be = fakeBackend(state);
      const ctx = await newContext(browser, { preset: "resident", backend: (d) => (d.action === "departures"
        ? { ok: true, live: false, time: new Date(Date.now() - 7 * 60000).toISOString(), departures: [
          { when: inMin(6), plannedWhen: inMin(6), delay: null, direction: "Ahrensfelde", line: { name: "893", product: "bus" } },
          { when: inMin(-5), direction: "vorbei", line: { name: "N56" } }] }
        : be(d)) });
      await ctx.route("**/*.transport.rest/**", (route) => route.abort("internetdisconnected"));
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6#oepnv`); await p.waitForSelector(".departure__dir", { timeout: 20000 });
      await p.waitForTimeout(1500);
      const txt = await p.textContent("#departures");
      check("Fahrplandienste ausgefallen: Abfahrten kommen vom Backend (nur künftige)", /Ahrensfelde/.test(txt) && !/vorbei/.test(txt), txt);
      check("Hinweis mit Stand statt roter Fehlermeldung, keine Technik-Details", /Fahrplan vom/.test(await p.textContent("#transitStatus")) && !/nicht erreichbar ·|bvg:/.test(await p.textContent("#transitStatus")), await p.textContent("#transitStatus"));
      check("Keine Fehler (Abfahrten)", p.errors.length === 0, p.errors);
      await ctx.close();
    }

    console.log("--- Wetter");
    {
      const day = (off) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(Date.now() + off * 86400000));
      const hot = { at: new Date().toISOString(), alerts: [], days: [
        { date: day(-1), icon: "rain", min: 5, max: 9 },
        { date: day(0), icon: "clear-day", min: 19, max: 31 }, { date: day(1), icon: "thunderstorm", min: 20, max: 34 },
        { date: day(2), icon: "cloudy", min: 15, max: 22 }, { date: day(3), icon: "snow", min: 1, max: 2 }] };
      const state = { weather: hot };
      const ctx = await newContext(browser, { backend: fakeBackend(state), preset: "resident" });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6#notfall`); await p.waitForSelector("#weatherBox .weather__day");
      const names = await p.$$eval(".weather__name", (els) => els.map((e) => e.textContent));
      check("Wetter: 3 Tage ab heute (Vortag ausgeblendet)", names.length === 3 && names[0] === "Heute" && names[1] === "Morgen", names);
      check("Wetter: Symbole und Temperaturen", /☀️/.test(await p.textContent(".weather__days")) && /⛈️/.test(await p.textContent(".weather__days")) && /31°/.test(await p.textContent(".weather__days")));
      check("Hitze-Hinweis ab 30 °C mit Höchstwert", /Hitze: bis 34 °C/.test(await p.textContent("#weatherBox")) && await p.isVisible(".weather__warn--heat"));
      check("Quelle DWD genannt", /Deutscher Wetterdienst/.test(await p.textContent(".weather__src")));
      await ctx.close();

      state.weather = { at: new Date().toISOString(), days: [{ date: day(0), icon: "snow", min: -14, max: -6 }, { date: day(1), icon: "snow", min: -12, max: -5 }],
        alerts: [{ event: "STRENGER FROST", headline: "Amtliche WARNUNG vor STRENGEM FROST", headlineEn: "Official WARNING of SEVERE FROST", severity: "moderate", expires: new Date(Date.now() + 86400000).toISOString() }] };
      const ctx2 = await newContext(browser, { backend: fakeBackend(state), preset: "resident", lang: "en" });
      const p2 = await newPage(ctx2);
      await p2.goto(`${base}?obj=lind6#notfall`); await p2.waitForSelector("#weatherBox .weather__warn");
      const txt = await p2.textContent("#weatherBox");
      check("Frost: DWD-Warnung (englisch), kein doppelter eigener Frost-Hinweis", /Official WARNING of SEVERE FROST/.test(txt) && /valid until/.test(txt) && !(await p2.isVisible(".weather__warn--cold")) && (await p2.$$(".weather__warn")).length === 1, txt);
      check("Wetter übersetzt", /Today/.test(txt) && /Source: Deutscher Wetterdienst/.test(txt));
      await ctx2.close();

      state.weather = { at: new Date(Date.now() - 30 * 3600000).toISOString(), days: [{ date: day(0), icon: "rain", min: 1, max: 2 }], alerts: [] };
      const ctx3 = await newContext(browser, { backend: fakeBackend(state), preset: "resident" });
      const p3 = await newPage(ctx3);
      await p3.goto(`${base}?obj=lind6#notfall`); await p3.waitForTimeout(800);
      check("Veraltetes Wetter (> 24 Std.) wird nicht gezeigt", !(await p3.isVisible("#weatherBox")) && p3.errors.length === 0, p3.errors);
      await ctx3.close();
    }

    console.log("--- Einführung und Schriftgröße");
    {
      const ctx = await newContext(browser, { backend: fakeBackend() });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6#notfall`); await p.waitForTimeout(300);
      check("Einführung nicht vor der Zustimmung", !(await p.isVisible("#intro")));
      await p.check("#consentCheck"); await p.fill("#pinInput", PIN); await p.click("#consentAccept"); await p.waitForTimeout(300);
      check("Einführung nach der ersten Zustimmung", await p.isVisible("#intro") && (await p.textContent("#introTitle")) === "Start");
      await p.click("#introNext"); await p.click("#introNext");
      check("Letzter Schritt: „Los geht's“, ohne Überspringen", (await p.textContent("#introNext")) === "Los geht's" && !(await p.isVisible("#introSkip")));
      await p.click("#introNext"); await p.reload(); await p.waitForTimeout(700);
      check("Einführung nur einmal", !(await p.isVisible("#intro")));
      await p.click("#introOpen"); await p.waitForTimeout(100);
      check("Einführung über Fußzeile erneut aufrufbar", await p.isVisible("#intro"));
      await p.keyboard.press("Escape");
      check("Esc schließt", !(await p.isVisible("#intro")));
      await p.click("#textSize");
      check("Größere Schrift an", await p.evaluate(() => document.documentElement.classList.contains("text-large")) && (await p.getAttribute("#textSize", "aria-pressed")) === "true");
      await p.reload(); await p.waitForTimeout(300);
      check("Schriftgröße gemerkt", await p.evaluate(() => document.documentElement.classList.contains("text-large")));
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check("Große Schrift: kein seitliches Scrollen", overflow <= 0, overflow);
      await p.click("#textSize");
      check("Wieder normale Schrift", !(await p.evaluate(() => document.documentElement.classList.contains("text-large"))));
      check("Keine Skriptfehler", !p.errors.length, p.errors);
      await ctx.close();
    }
    {
      const ctx = await newContext(browser, { backend: fakeBackend() });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6&hm=${STAFF}#hausmeister`); await p.waitForTimeout(300);
      await p.check("#consentCheck"); await p.click("#consentAccept"); await p.waitForTimeout(400);
      check("Hausmeister bekommt keine Bewohner-Einführung", !(await p.isVisible("#intro")));
      await ctx.close();
    }

    console.log("--- Fehlerüberwachung");
    {
      const ctx = await newContext(browser, { backend: fakeBackend() });
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6#notfall`); await p.waitForTimeout(300);
      await p.evaluate(() => setTimeout(() => { throw new Error("Testfehler vor Zustimmung"); }));
      await p.waitForTimeout(300);
      check("Vor der Zustimmung wird nichts gemeldet", !ctx.requests.some((r) => r.action === "reportError"));
      await acceptConsent(p);
      for (let i = 0; i < 8; i++) await p.evaluate((i) => setTimeout(() => { throw new Error("Testfehler " + i); }), i);
      await p.evaluate(() => setTimeout(() => { throw new Error("Testfehler 0"); }));
      await p.waitForTimeout(600);
      const reps = ctx.requests.filter((r) => r.action === "reportError");
      check("Fehler nach Zustimmung gemeldet (mit PIN, Ansicht, Version), max. 5, ohne Doppelte", reps.length === 5 && reps[0].pin === PIN && reps[0].view === "notfall" && reps[0].version && new Set(reps.map((r) => r.message)).size === 5, reps.map((r) => r.message));
      await ctx.close();
    }

    console.log("--- Sicherheit (Browser)");
    {
      const X = `<img src=x class=pwn onerror="window.__xss=1"><svg class=pwn onload="window.__xss=1"></svg>"'><script class=pwn>window.__xss=1</script>`;
      const evil = (d) => {
        if (d.action === "hmLogin") return { ok: true, user: { name: X, role: "Verwaltung" }, areas: [{ code: "TG", ort: X, activity: X }], activities: [X] };
        if (d.action === "adminOverview") return { ok: true, role: X, polls: [{ id: X, question: X, options: [X], open: true, to: X, only: X, counts: [X], total: X }], news: [{ row: X, title: X, text: X, only: X, from: X, to: X }], work: { days: [{ date: X, planned: X, plannedDone: X, done: [{ time: X, activity: X, ort: X, planned: false, manual: true }, X], missed: [{ activity: X, ort: X, lateOn: X }], open: [{ activity: X, ort: X }] }, X] }, kpi: { open: X, overdue: X, dueSoon: X, avgReactHours: X, slaQuote: X }, months: [{ month: X, Mangel: X }, { month: 5 }], perEntrance: { [X]: X }, lookerUrl: "javascript:window.__xss=1", tasks: [{ id: X, source: X, type: X, status: X, owner: X, entrance: X, name: X, contact: "javascript:window.__xss=1", details: X, note: X, by: X, created: X, termin: X, photo: "javascript:window.__xss=1", photoDone: X, sla: { light: X, react: X, reactDue: X, doneDue: X } }, { id: "x", sla: X }] };
        if (d.action === "getTasks") return { ok: true, tasks: [{ id: X, source: X, type: X, status: "offen", entrance: X, wohnung: X, name: X, contact: "javascript:window.__xss=1", details: X, ort: X, created: X, owner: X }] };
        if (d.action === "news") return { ok: true, polls: [{ id: X, question: X, options: [X, X], to: X, results: [X, 1] }, X], weather: { at: new Date().toISOString(), days: [{ date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date()), icon: X, min: X, max: 40 }, { date: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(Date.now() + 86400000)), icon: "__proto__", min: 1, max: 2 }, { date: X }], alerts: [{ event: X, headline: X, headlineEn: X, severity: X, expires: X }, X] }, items: [{ title: X, text: X, important: true, to: "2026-12-31" }], care: { last: [{ ort: X, activity: X, time: "2026-09-23T08:00:00Z" }], next: [{ activity: X, ort: X, from: "2026-10-01", to: "2026-10-02" }] } };
        if (d.action === "status") return { ok: true, items: [{ id: "T-260924-ABCD", type: X, status: X, created: X }] };
        return { ok: false, error: X };
      };
      const ctx = await newContext(browser, { backend: evil, preset: "resident" });
      const p = await newPage(ctx);
      await p.addInitScript(() => { localStorage.setItem("mieterapp.tickets", JSON.stringify([{ id: "T-260924-ABCD", type: "<img src=x class=pwn>", date: new Date().toISOString() }])); });
      for (const v of ["notfall", "meldungen", "mangel"]) { await p.goto(`${base}?obj=lind6#${v}`); await p.waitForTimeout(700); }
      await p.goto(`${base}?hm=${ADMIN}#hausmeister`); await p.waitForTimeout(800);
      await p.check("#staffTabs input[value=tasks]", { force: true }); await p.waitForTimeout(800);
      await p.goto(`${base}#qrdruck`); await p.waitForTimeout(800);
      await p.goto(`${base}#cockpit`); await p.waitForTimeout(1000);
      await p.click('#cockpitFilter [data-filter="done"]'); await p.click('#cockpitFilter [data-filter="open"]');
      const pwn = await p.evaluate(() => ({ xss: window.__xss || 0, nodes: document.querySelectorAll(".pwn, script:not([src])").length, js: [...document.querySelectorAll("a[href]")].filter((a) => /^\s*javascript:/i.test(a.getAttribute("href"))).length }));
      check("Schadcode aus Server-Antworten wird nicht ausgeführt/eingefügt", !pwn.xss && !pwn.nodes && !pwn.js, pwn);
      await ctx.close();
    }
    {
      const http = require("http");
      const evilSite = http.createServer((req, res) => { res.setHeader("Content-Type", "text/html"); res.end(`<iframe id=f src="${base}?obj=lind6#hausmeister" width=400 height=600></iframe>`); });
      await new Promise((r) => evilSite.listen(0, "127.0.0.1", r));
      const ctx = await newContext(browser);
      const p = await newPage(ctx);
      await p.goto(`http://127.0.0.1:${evilSite.address().port}/`); await p.waitForTimeout(1000);
      check("Einbettung in fremde Seite wird verweigert", /direkt öffnen/.test(await p.frameLocator("#f").locator("body").textContent()));
      evilSite.close(); await ctx.close();
    }
    {
      const ctx = await newContext(browser);
      const p = await newPage(ctx);
      await p.goto(`${base}?obj=lind6#notfall`);
      const prevented = await p.evaluate(() => { const e = new Event("beforeinstallprompt", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
      check("Keine automatische Installations-Einblendung", prevented);
      await ctx.close();
    }
  } catch (err) {
    check("Test lief ohne Abbruch durch", false, String(err && err.stack || err));
  } finally {
    await browser.close();
    server.close();
    try { fs.unlinkSync(video); } catch (e) { /* egal */ }
    summary();
  }
})();

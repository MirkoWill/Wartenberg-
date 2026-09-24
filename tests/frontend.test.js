// Browser-Tests der App (Chromium über Playwright). Start: node tests/frontend.test.js
// Das Backend (Google Apps Script) und die Abfahrts-API werden nachgebildet.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PIN, PIN_HASH, check, summary, startServer, launch, newContext, newPage, acceptConsent } = require("./helpers");

const STAFF = "a".repeat(40);
const ADMIN = "b".repeat(40);
const AREAS = [
  { code: "TH_LIND6", ort: "Treppenhaus Lindenberger Str. 6", bereich: "Aufgang", aufgang: "lind6", activity: "Treppenhausreinigung" },
  { code: "MUELL", ort: "Müllplatz (außen)", bereich: "Außen", aufgang: "", activity: "Müllplatzreinigung" },
];
const ACTIVITIES = ["Treppenhausreinigung", "Fensterreinigung Aufgang", "Müllplatzreinigung", "Kontrollgang"];

/** Standard-Backend: prüft PIN/Token wie das echte Backend und antwortet plausibel. */
function fakeBackend(state = {}) {
  return (d) => {
    const staff = { [STAFF]: { name: "Nr. 100", role: "Hausmeister" }, [ADMIN]: { name: "Nr. 007", role: "Verwaltung" } }[d.token];
    if (["hmLogin", "logCleaning", "getTasks", "completeTask", "submitStaffDefect"].includes(d.action)) {
      if (!staff) return { ok: false, error: "Kein gültiger Zugang", code: "staff" };
      if (state.offline && d.action === "logCleaning") return "abort";
      if (d.action === "hmLogin") return { ok: true, user: staff, areas: AREAS, activities: ACTIVITIES };
      if (d.action === "getTasks") return state.hangTasks ? null : { ok: true, tasks: state.tasks || [] };
      if (d.action === "completeTask") { state.tasks = (state.tasks || []).filter((t) => t.id !== d.id); return { ok: true }; }
      if (d.action === "submitStaffDefect") return { ok: true, id: "M-260924-ABCD" };
      return { ok: true };
    }
    const pin = state.pin || PIN;
    if (d.pin !== pin && !staff) return { ok: false, error: "PIN ungültig", code: "pin" };
    if (d.action === "news") return { ok: true, items: state.news || [], care: state.care || null };
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
      p.once("dialog", (dlg) => dlg.accept()); await p.click('[data-done="M-1"]'); await p.waitForTimeout(300);
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
        if (d.action === "getTasks") return { ok: true, tasks: [{ id: X, source: X, type: X, status: "offen", entrance: X, wohnung: X, name: X, contact: "javascript:window.__xss=1", details: X, ort: X, created: X, owner: X }] };
        if (d.action === "news") return { ok: true, items: [{ title: X, text: X, important: true, to: "2026-12-31" }], care: { last: [{ ort: X, activity: X, time: "2026-09-23T08:00:00Z" }], next: [{ activity: X, ort: X, from: "2026-10-01", to: "2026-10-02" }] } };
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

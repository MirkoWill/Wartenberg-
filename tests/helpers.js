// Hilfsfunktionen für die Browser-Tests: kleiner Webserver für das Projekt,
// Browser mit nachgebildetem Backend (Apps Script) und Abfahrts-Dienst, Prüf-Ausgabe.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PIN = "13059";
const PIN_HASH = "0a8d9ad647b7466f586c6e9083a079605fdf1b2d7aca69b3c8f6ea6583d41c96";
const CONSENT_VERSION = "2026-09b";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
  ".ics": "text/calendar", ".pdf": "application/pdf", ".vcf": "text/vcard",
};

let fails = 0;
let passed = 0;
function check(label, ok, detail) {
  if (ok) passed++;
  else fails++;
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${ok || detail === undefined ? "" : " → " + JSON.stringify(detail).slice(0, 300)}`);
}
function summary() {
  console.log(`\n${passed} bestanden, ${fails} fehlgeschlagen`);
  process.exitCode = fails ? 1 : 0;
}

/** Statischer Webserver für das Projekt (wie GitHub Pages). */
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let file = path.join(ROOT, url.endsWith("/") ? url + "index.html" : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

async function launch(extraArgs = []) {
  return chromium.launch({ args: extraArgs });
}

/**
 * Neuer Browser-Kontext mit nachgebildetem Backend.
 * backend(d) bekommt die Anfrage (POST-JSON oder GET-Parameter) und gibt die Antwort zurück
 * (Objekt, oder null = Anfrage hängen lassen, oder "abort" = Netzfehler).
 */
async function newContext(browser, { backend, preset, lang, width = 390, height = 844, scheme, extra = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: "de-DE", colorScheme: scheme, ...extra });
  ctx.requests = [];
  await ctx.route("https://script.google.com/**", async (route) => {
    const req = route.request();
    const d = req.method() === "POST" ? JSON.parse(req.postData() || "{}") : Object.fromEntries(new URL(req.url()).searchParams);
    ctx.requests.push(d);
    const res = backend ? await backend(d) : { ok: true, items: [] };
    if (res === null) return; // hängt
    if (res === "abort") return route.abort("internetdisconnected");
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(res) });
  });
  await ctx.route("**/*.transport.rest/**", (route) => {
    const url = route.request().url();
    const body = url.includes("/locations")
      ? [{ type: "stop", id: "900150005", name: "Dorfstr./Lindenberger Str. (Berlin)" }]
      : { departures: [{ when: new Date(Date.now() + 240000).toISOString(), direction: "S+U Lichtenberg", line: { name: "256", product: "bus" } }] };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
  await ctx.addInitScript(({ preset, lang, PIN, PIN_HASH, CONSENT_VERSION }) => {
    if (sessionStorage.getItem("__preset")) return; // nur beim ersten Laden des Tabs
    sessionStorage.setItem("__preset", "1");
    if (preset === "resident") {
      localStorage.setItem("mieterapp.consent", JSON.stringify({ v: CONSENT_VERSION, at: Date.now() }));
      localStorage.setItem("mieterapp.pin", JSON.stringify({ pin: PIN, hash: PIN_HASH }));
      localStorage.setItem("mieterapp.intro", JSON.stringify({ seen: Date.now() }));
    }
    if (lang) localStorage.setItem("mieterapp.lang", lang);
  }, { preset, lang, PIN, PIN_HASH, CONSENT_VERSION });
  return ctx;
}

async function newPage(ctx) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR|Scanner|vibrate/i.test(m.text())) page.errors.push(m.text()); });
  return page;
}

/** Zustimmung (und ggf. PIN) im Dialog erteilen, falls er offen ist. */
async function acceptConsent(page, pin = PIN) {
  if (!(await page.isVisible("#consent"))) return;
  await page.check("#consentCheck");
  if (await page.isVisible("#pinInput")) await page.fill("#pinInput", pin);
  await page.click("#consentAccept");
  await page.waitForTimeout(300);
  if (await page.isVisible("#intro")) { await page.click("#introSkip"); await page.waitForTimeout(100); }
}

module.exports = { ROOT, PIN, PIN_HASH, check, summary, startServer, launch, newContext, newPage, acceptConsent };

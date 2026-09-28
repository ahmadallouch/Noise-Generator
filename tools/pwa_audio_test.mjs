// End-to-end check that the PWA changes did not alter the sound.
//
// 1. Serves this folder, loads the app so the service worker installs,
//    then shuts the server down and reloads: the app must come up fully offline.
// 2. Records the real audio output (after all Web Audio filters) in headless Chromium
//    for several settings and writes the samples to disk.
// 3. Optionally does the same for a baseline copy of index.html (e.g. the original app)
//    so tools/compare_captures.py can compare the two spectra band by band.
//
// Usage: node tools/pwa_audio_test.mjs [path/to/baseline/index.html]
// Needs: playwright (npm), python3 with numpy + scipy.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(process.execPath, "../../lib/node_modules/playwright"))); }

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "tools", ".captures");
const SECONDS = 14, SKIP = 4;
const PURE = { weight: 0, hiss: 0, relief: 0, move: 0, pace: 35, width: 70, vol: 60 };
const SCENARIOS = {
  brown:   { ...PURE, tone: 0 },
  pink:    { ...PURE, tone: 100 },
  default: { tone: 50, weight: 0, hiss: 35, relief: 25, move: 0, pace: 35, width: 70, vol: 40 },
  white:   { ...PURE, tone: 200 },
  blue:    { ...PURE, tone: 300 },
  violet:  { ...PURE, tone: 400 },
};
const BASELINE_SCENARIOS = ["brown", "pink", "default"];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
function serve(dir, indexFile) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = p === "/" || p === "/index.html" ? indexFile : path.join(dir, p);
    if (!file.startsWith(dir) && file !== indexFile) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(buf);
    });
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv)));
}

// Taps the output right where the app's analyser sits (end of the chain) without changing it.
const TAP = () => {
  const orig = AudioContext.prototype.createAnalyser;
  window.__cap = []; window.__capOn = false;
  AudioContext.prototype.createAnalyser = function () {
    const an = orig.call(this);
    const tap = this.createScriptProcessor(4096, 2, 2);
    an.connect(tap); tap.connect(this.destination); // tap output stays silent
    tap.onaudioprocess = e => { if (window.__capOn) window.__cap.push([Float32Array.from(e.inputBuffer.getChannelData(0)), Float32Array.from(e.inputBuffer.getChannelData(1))]); };
    window.__sr = this.sampleRate;
    return an;
  };
};

async function capture(page, settings) {
  await page.evaluate(s => localStorage.setItem("noise-settings", JSON.stringify(s)), settings);
  await page.reload();
  await page.click("#play");
  await page.waitForTimeout(SKIP * 1000);
  await page.evaluate(() => { window.__cap = []; window.__capOn = true; });
  await page.waitForTimeout(SECONDS * 1000);
  const { sr, b64L, b64R } = await page.evaluate(() => {
    window.__capOn = false;
    const join = ch => { const n = window.__cap.reduce((a, c) => a + c[ch].length, 0), out = new Float32Array(n); let o = 0; for (const c of window.__cap) { out.set(c[ch], o); o += c[ch].length; } return out; };
    const b64 = a => { const u = new Uint8Array(a.buffer); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
    return { sr: window.__sr, b64L: b64(join(0)), b64R: b64(join(1)) };
  });
  await page.click("#play"); // stop
  return { sr, L: Buffer.from(b64L, "base64"), R: Buffer.from(b64R, "base64") };
}

function write(tag, name, c) {
  fs.writeFileSync(path.join(OUT, `${tag}-${name}.L.f32`), c.L);
  fs.writeFileSync(path.join(OUT, `${tag}-${name}.R.f32`), c.R);
  return { tag, name, sr: c.sr, seconds: c.L.length / 4 / c.sr };
}

const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const index = [];

// ---- new app, installed then run offline ----
{
  const srv = await serve(ROOT, path.join(ROOT, "index.html"));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const ctx = await browser.newContext();
  await ctx.addInitScript(TAP);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker controls the page");
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  ok(manifest.name === "A's Noise Generator" && manifest.icons.some(i => i.purpose === "maskable"), "manifest has name and icons");

  await new Promise(r => srv.close(r)); srv.closeAllConnections?.();
  await ctx.setOffline(true);
  await page.reload();
  ok((await page.title()) === "A's Noise Generator", "page loads with the server down and the network offline");
  await page.evaluate(() => document.fonts.ready);
  ok(await page.evaluate(() => document.fonts.check("16px Figtree") && document.fonts.check("600 20px Fraunces")), "self-hosted fonts load offline");
  ok(await page.evaluate(() => [...document.fonts].filter(f => f.status === "loaded").length >= 2), "font files actually came from the cache");

  for (const [name, s] of Object.entries(SCENARIOS)) {
    const c = await capture(page, s);
    index.push(write("pwa", name, c));
    console.log(`  captured pwa/${name}: ${(c.L.length / 4 / c.sr).toFixed(1)} s @ ${c.sr} Hz`);
  }
  ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
  await ctx.close();
}

// ---- baseline, online ----
const baseline = process.argv[2];
if (baseline) {
  const srv = await serve(path.dirname(path.resolve(baseline)), path.resolve(baseline));
  const ctx = await browser.newContext();
  await ctx.addInitScript(TAP);
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/`);
  for (const name of BASELINE_SCENARIOS) {
    const c = await capture(page, SCENARIOS[name]);
    index.push(write("base", name, c));
    console.log(`  captured base/${name}: ${(c.L.length / 4 / c.sr).toFixed(1)} s @ ${c.sr} Hz`);
  }
  await ctx.close(); srv.close();
}
await browser.close();

fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
const py = spawnSync("python3", [path.join(ROOT, "tools", "compare_captures.py"), OUT], { stdio: "inherit" });
if (py.status !== 0) process.exitCode = 1;

// Measures the real app in headless Chromium.
// Installs it, shuts the server down, reloads offline, then records the audio output
// (after every Web Audio filter) for each noise color and runs tools/analyze.py on it.
//
// Usage: node tools/measure.mjs   (needs playwright, and python3 with numpy, scipy, matplotlib)
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
// Body, Hiss, Ear pressure, and Movement off: the textbook-pure setting.
const PURE = { weight: 0, hiss: 0, relief: 0, move: 0, pace: 35, width: 70, vol: 60 };
const COLORS = ["brown", "pink", "white", "blue", "violet"];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml" };
function serve(dir) {
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(dir, p === "/" ? "index.html" : p);
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
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
  return { sr, L: Buffer.from(b64L, "base64"), R: Buffer.from(b64R, "base64") };
}

const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) process.exitCode = 1; };

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const index = [];
const srv = await serve(ROOT);
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

for (const [i, name] of COLORS.entries()) {
  const c = await capture(page, { ...PURE, tone: i * 100 });
  fs.writeFileSync(path.join(OUT, `${name}.L.f32`), c.L);
  fs.writeFileSync(path.join(OUT, `${name}.R.f32`), c.R);
  index.push({ name, sr: c.sr });
  console.log(`  recorded ${name}: ${(c.L.length / 4 / c.sr).toFixed(1)} s at ${c.sr} Hz`);
}
ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join("; ") : ""));
await browser.close();

fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
const py = spawnSync("python3", [path.join(ROOT, "tools", "analyze.py"), OUT], { stdio: "inherit" });
if (py.status !== 0) process.exitCode = 1;

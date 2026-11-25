// Apre l'app (index.html) in un browser headless, legge i punteggi calcolati
// e, se ci sono giorni favorevoli, invia un messaggio su Telegram.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const PAGE = path.resolve(__dirname, "..", "index.html");
const TOKEN = process.env.TELEGRAM_TOKEN, CHAT = process.env.TELEGRAM_CHAT;
const DRY = process.env.DRY === "1" || !TOKEN || !CHAT;
const TEST = process.env.TEST === "1";

(async () => {
  // Serve index.html da un piccolo server locale (come su GitHub Pages)
  const http = require("http");
  const srv = http.createServer((q, r) => {
    const f = q.url.startsWith("/manifest") ? "manifest.webmanifest" : "index.html";
    try { r.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html; charset=utf-8" : "application/json" }); r.end(fs.readFileSync(path.join(__dirname, "..", f))); }
    catch (e) { r.writeHead(404); r.end(); }
  }).listen(0);
  const url = "http://127.0.0.1:" + srv.address().port + "/";

  const b = await chromium.launch();
  const ctx = await b.newContext({ locale: "it-IT", timezoneId: "Europe/Rome" });
  if (process.env.NOTIFY_MOCK) await require(process.env.NOTIFY_MOCK)(ctx);
  const pg = await ctx.newPage();
  pg.on("pageerror", e => console.log("[pageerror]", e.message));
  pg.on("requestfailed", q => console.log("[richiesta fallita]", q.url().slice(0, 110), q.failure() && q.failure().errorText));
  pg.on("response", r => { if (r.status() >= 400) console.log("[HTTP " + r.status() + "]", r.url().slice(0, 110)); });

  let days = null;
  for (let t = 1; t <= 4 && !days; t++) {
    await pg.goto(url);
    try {
      await pg.waitForFunction(() => (typeof S !== "undefined" && S && S.days && S.days.length) || /^Errore/.test((document.getElementById("st") || {}).textContent || ""), null, { timeout: 60000 });
    } catch (e) { /* timeout: lo stato viene stampato sotto */ }
    days = await pg.evaluate(() => (typeof S !== "undefined" && S && S.days && S.days.length) ? S.days.map((x, i) => ({
      i, d: x.date.toISOString(), apnea: x.apnea, canna: x.canna, clarity: x.clarity, vento: Math.round(x.avgW)
    })) : null);
    if (!days) {
      console.log("Tentativo " + t + " fallito. Stato app: " + await pg.evaluate(() => (document.getElementById("st") || {}).textContent));
      if (t < 4) await new Promise(r => setTimeout(r, 20000 * t));
    }
  }
  srv.close();
  await b.close();
  if (!days) { console.error("Dati non disponibili: nessuna notifica."); process.exit(1); }

  const today = 7; // l'app mostra 7 giorni passati, oggi, 7 futuri
  const from = cfg.includi_oggi ? today : today + 1, to = today + cfg.giorni_avanti;
  const nomi = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  const righe = [];
  for (const x of days.slice(from, to + 1)) {
    const a = x.apnea >= cfg.soglia_apnea, c = x.canna >= cfg.soglia_pesca;
    if (!a && !c) continue;
    const dt = new Date(x.d), lab = nomi[dt.getDay()] + " " + dt.getDate() + "/" + (dt.getMonth() + 1);
    const parti = [];
    if (a) parti.push("🤿 apnea " + x.apnea);
    if (c) parti.push("🎣 pesca " + x.canna);
    righe.push(`<b>${lab}</b>: ${parti.join(" · ")} · acqua ${x.clarity} · vento ${x.vento} kn`);
  }
  let testo = null;
  if (righe.length) testo = "🌊 <b>Pesca: Venezia</b>, condizioni favorevoli\n\n" + righe.join("\n");
  else if (TEST) testo = "✅ Notifiche Pesca: Venezia attive. Al momento nessun giorno supera le soglie.";
  console.log(testo || "Nessun giorno sopra soglia: nessuna notifica.");
  if (!testo || DRY) { if (DRY && testo) console.log("(dry run: non inviato)"); return; }
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text: testo, parse_mode: "HTML", disable_web_page_preview: true })
  });
  if (!r.ok) { console.error("Telegram:", r.status, await r.text()); process.exit(1); }
  console.log("Inviato.");
})().catch(e => { console.error(e); process.exit(1); });

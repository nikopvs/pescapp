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
    days = await pg.evaluate(() => (typeof S !== "undefined" && S && S.days && S.days.length) ? S.days.map((x, i) => {
      const n = snap(x);
      return { i, giorno: n.giorno, apnea: x.apnea, canna: x.canna, clarity: x.clarity,
        vento: n.vento, pressione: n.pressione, pioggia: n.pioggia, onda: n.onda_m, acqua: n.acqua, marea: n.marea, luna: n.luna,
        sole_luna: n.sole_luna, why: { a: whyText("a", x), c: whyText("c", x), p: whyText("p", x) } };
    }) : null);
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
  const qual = v => v >= 80 ? "ottime" : v >= 60 ? "buone" : v >= 40 ? "discrete" : v >= 20 ? "difficili" : "pessime";
  const qualAcqua = v => v >= 80 ? "ottima" : v >= 60 ? "buona" : v >= 40 ? "discreta" : v >= 20 ? "scarsa" : "pessima";
  const GG = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  const dec = (v, d = 0) => v == null ? "n/d" : Number(v).toFixed(d).replace(".", ",");
  const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const bullets = html => {
    const [pro, con = ""] = html.split("⚠️ <b>Contro</b>");
    const pick = h => h.split("<br>").filter(r => r.startsWith("• ") && !r.includes("nessuno")).map(r => r.slice(2).replace(/<[^>]+>/g, "").trim());
    return { pro: pick(pro.split("✅ <b>A favore</b>")[1] || ""), con: pick(con) };
  };
  const uniq = arr => [...new Set(arr)];
  const blocchi = [];
  for (const x of days.slice(from, to + 1)) {
    const a = x.apnea >= cfg.soglia_apnea, c = x.canna >= cfg.soglia_pesca;
    if (!a && !c) continue;
    const [Y, M, D] = x.giorno.split("-").map(Number);
    const nome = GG[new Date(Date.UTC(Y, M - 1, D)).getUTCDay()];
    const oggi = x.i === today ? " (oggi)" : x.i === today + 1 ? " (domani)" : "";
    const L = [`📅 <b>${nome[0].toUpperCase() + nome.slice(1)} ${D}/${M}${oggi}</b>`];
    L.push(`${a ? "⭐" : "▫️"} 🤿 Apnea: <b>${qual(x.apnea)}</b>`);
    L.push(`${c ? "⭐" : "▫️"} 🎣 Canna: <b>${qual(x.canna)}</b>`);
    L.push("");
    const v = x.vento, pr = x.pioggia, pe = x.pressione;
    L.push(`💧 Acqua: trasparenza ${qualAcqua(x.clarity)}` + (x.acqua && x.acqua.media_c != null ? `, ${dec(x.acqua.media_c, 1)} °C` : ""));
    L.push(`💨 Vento: ${dec(v.medio_kn)} kn da ${v.prov}, raffiche fino a ${dec(v.raffica_kn)} kn`);
    const ev = (x.marea.eventi || []).map(e => `${e.cm > 0 ? "+" : ""}${e.cm} (${e.ora})`);
    if (ev.length) L.push(`🌊 Marea: ${ev.join(" · ")}` + (x.marea.escursione_m != null ? ` · Δ ${dec(x.marea.escursione_m, 1)} m` : ""));
    if (x.onda != null) L.push(`〰️ Onda: ${dec(x.onda, 1)} m`);
    L.push(`🌧 Pioggia: ${pr.giorno_mm > 0.2 ? dec(pr.giorno_mm, 1) + " mm oggi" : "nessuna oggi"}` + (pr.prec60h_mm > 0.5 ? `, ${dec(pr.prec60h_mm, 1)} mm nelle ultime 60 ore` : ""));
    L.push(`🧭 Pressione: ${pe.hpa} hPa (${pe.var24h > 0 ? "+" : ""}${dec(pe.var24h)} in 24 ore)`);
    blocchi.push(L.join("\n"));
  }
  const testa = "🌊 <b>Pesca: Venezia</b>\nCondizioni favorevoli nei prossimi giorni (⭐ = sopra soglia)\n";
  let testo = null;
  if (blocchi.length) testo = testa + "\n" + blocchi.join("\n\n──────────\n\n");
  else if (TEST) testo = "✅ Notifiche Pesca: Venezia attive. Al momento nessun giorno supera le soglie.";
  console.log(testo || "Nessun giorno sopra soglia: nessuna notifica.");
  if (!testo || DRY) { if (DRY && testo) console.log("(dry run: non inviato)"); return; }
  const pezzi = [], parti = testo.split("\n\n──────────\n\n");
  let cur = "";
  for (const p of parti) { if (cur && (cur + p).length > 3800) { pezzi.push(cur); cur = ""; } cur += (cur ? "\n\n──────────\n\n" : "") + p; }
  if (cur) pezzi.push(cur);
  for (const t of pezzi) {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text: t, parse_mode: "HTML", disable_web_page_preview: true })
    });
    if (!r.ok) { console.error("Telegram:", r.status, await r.text()); process.exit(1); }
  }
  console.log("Inviato.");
})().catch(e => { console.error(e); process.exit(1); });

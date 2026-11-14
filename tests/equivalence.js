/*
 * Equivalence test: the page built from the separate calculation engine must give exactly the same
 * answers as the last page built before the engine was split out (tests/baseline/pre-engine-0.3.0-beta.html).
 * Applies the same random inputs to both and compares every displayed result. Run: node tests/equivalence.js [cases]
 */
"use strict";
const path = require("path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
const N = +process.argv[2] || 500;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b, d = 1) => +(a + rnd() * (b - a)).toFixed(d);

const AIR = ["", "", "lidocaine 4% 3 ml", "10 sprays of 10% lidocaine", "2% lidocaine 5 ml, then 1% 4 ml, ketamine 50 mg", "lignocaine gel 6 ml and 4% 2 ml", "xylocaine 10% 5 sprays", "lidocaine 200 mg", "co-phenylcaine 2 ml", "banana 3 ml", "5 ml", "4% 4 ml 2% 3 ml"];
const IDS = ["tb", "dr", "ur", "plan", "kr", "pbadge", "aw", "ab", "lr", "pinfo", "pwarn", "sas", "wk", "asum", "ap"];

async function open(browser, file) {
  const p = await browser.newPage({ viewport: { width: 420, height: 900 } });
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto("file://" + file);
  await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  return p;
}

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, path.join(ROOT, "tests/baseline/pre-engine-0.3.0-beta.html"));
  const B = await open(browser, path.join(ROOT, "dist/default/index.html"));
  const ids = await A.evaluate(() => [...document.querySelectorAll("#d1 option")].map((o) => o.value));
  const kids = await A.evaluate(() => [...document.querySelectorAll("#k1 option")].map((o) => o.value));
  let diffs = 0, shown = 0;
  const run = (p, c) => p.evaluate((c) => {
    PM = c.pm; WM = c.wm; CH = c.ch ? JSON.parse(JSON.stringify(c.ch)) : null; SEL = c.sel;
    Object.assign(S, c.S);
    $("w").value = c.w; $("h").value = c.h; $("s").value = c.sx; $("age").value = c.age; $("ageu").value = c.au;
    $("at").value = c.at; $("am").value = c.am; $("u1").value = c.u1; $("u2").value = c.u2;
    calc();
    if (c.d1 && [...$("d1").options].some((o) => o.value == c.d1)) $("d1").value = c.d1;
    if (c.d2 && [...$("d2").options].some((o) => o.value == c.d2)) $("d2").value = c.d2;
    $("kv").value = c.kv;
    if ([...$("k1").options].some((o) => o.value == c.k1)) $("k1").value = c.k1;
    calc();
    if (c.ch && CH) { const k = st.ch ? st.ch.a.id + "|" + st.ch.b.id : null; if (k) { CH.k = k; calc(); } }
    const out = { P: st.P, W: st.W, pool: st.pool, used: st.used, fr: st.fr, dual: st.dual && { m1: st.dual.m1, m2: st.dual.m2, mix: st.dual.mix, u1: st.dual.u1, u2: st.dual.u2 }, air: st.airItems };
    for (const i of c.ids) { const e = document.getElementById(i); out[i] = e ? e.innerHTML : null; }
    try { LM = "asra"; out.lastAsra = lastData(st.P.wt); LM = "aagbi"; out.lastAagbi = lastData(st.P.wt); } catch (e) { out.lastErr = String(e); }
    return JSON.stringify(out);
  }, c);
  for (let n = 0; n < N; n++) {
    const pm = rnd() < 0.35;
    const au = pm ? pick(["y", "y", "m", "w", "d"]) : "y";
    const age = pm ? (au == "y" ? between(0, 22, 2) : au == "m" ? between(0, 30, 1) : au == "w" ? between(0, 60, 1) : between(0, 200, 0)) : (rnd() < 0.7 ? between(18, 95, 0) : "");
    const c = {
      pm, au, age, wm: pick(["auto", "auto", "lbw", "tbw"]), sx: pick(["Male", "Female"]),
      w: pm ? between(2, 90, 1) : (rnd() < 0.05 ? pick(["", "0", "350"]) : between(35, 220, 1)),
      h: rnd() < 0.08 ? "" : pm ? between(50, 185, 0) : between(140, 200, 0),
      at: pick(AIR), am: rnd() < 0.2 ? between(0, 150, 0) : "", u1: rnd() < 0.5 ? between(0, 40, 1) : "", u2: rnd() < 0.4 ? between(0, 40, 1) : "",
      d1: pick(ids), d2: pick(ids), k1: pick(kids), kv: pick([10, 20, 30, 50, 100, ""]), sel: rnd() < 0.2 ? pick(ids) : null,
      S: { lbw: pick(["jan", "boer", "james", "hume", "peters"]), lbwP: pick(["jan", "boer", "james", "hume", "peters"]), bmi: pick([25, 28, 30, 35]), blend: rnd() < 0.5, pc: pick(["c91", "c98", "c996"]), neoRed: pick([0, 25, 50]), lidoCap: pick([4, 5, 6]), lidoMax: pick([400, 500, 700]) },
      ch: rnd() < 0.35 ? pick([{ row: Math.floor(rnd() * 11) }, { src: 1, val: between(0, 60, 1) }, { src: 2, val: between(0, 60, 1) }, { src: 1, val: 0.3 }]) : null,
      ids: IDS,
    };
    const ra = await run(A, c), rb = await run(B, c);
    if (ra !== rb) {
      diffs++;
      if (shown++ < 3) { const a = JSON.parse(ra), b = JSON.parse(rb); console.log("DIFF case", n, JSON.stringify(c).slice(0, 400)); for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log("  field", k, "\n   old", JSON.stringify(a[k]).slice(0, 300), "\n   new", JSON.stringify(b[k]).slice(0, 300)); }
    }
  }
  console.log("page errors old/new:", A.errs.length, B.errs.length, (A.errs.concat(B.errs))[0] || "");
  console.log(`equivalence: ${N - diffs}/${N} identical, ${diffs} different`);
  await browser.close();
  process.exit(diffs || A.errs.length !== B.errs.length ? 1 : 0);
})();

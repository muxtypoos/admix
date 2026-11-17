/*
 * Regression tests. Run with:  npm test   (builds every organisation first)
 * Needs Playwright with Chromium (npm i && npx playwright install chromium).
 * Checks the shared core behaves identically for every organisation, and that
 * each organisation's config is actually reflected in its built app.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) pass++;
  else { fail++; console.log("FAIL", name, extra === undefined ? "" : JSON.stringify(extra)); }
};
const near = (a, b, t = 0.06) => Math.abs(a - b) <= t;

async function open(browser, org) {
  const p = await browser.newPage({ viewport: { width: 420, height: 900 } });
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push("pageerror: " + e.message));
  p.on("console", (m) => m.type() === "error" && p.errs.push("console: " + m.text()));
  await p.goto("file://" + path.join(ROOT, "dist", org, "index.html"));
  // open every collapsible so elements are visible
  await p.evaluate(() => {
    document.querySelectorAll("details").forEach((d) => (d.open = true));
    document.querySelectorAll(".cl").forEach((c) => c.classList.remove("col"));
  });
  return p;
}
const setPt = (p, w, h, sx, age) =>
  p.evaluate(([w, h, sx, age]) => { $("w").value = w; $("h").value = h; $("s").value = sx; $("age").value = age || ""; calc(); }, [w, h, sx, age]);

/* ---------- core behaviour, run for every organisation ---------- */
async function coreTests(browser, org, cfg) {
  const p = await open(browser, org);
  const T = (n) => `[${org}] ${n}`;
  const ev = (f, a) => p.evaluate(f, a);

  // dosing weight: TBW, LBW (Janmahasatian), blend
  await setPt(p, 70, 1.75, "Male");
  ok(T("TBW below threshold"), (await ev(() => st.P.mode)) === "TBW" && near(await ev(() => st.P.wt), 70));
  const T0 = cfg.defaults.bmi;
  await setPt(p, 120, 1.7, "Male");
  const bmi = 120 / (1.7 * 1.7), jan = (9270 * 120) / (6680 + 216 * bmi);
  if (cfg.defaults.lbw === "jan") ok(T("LBW Janmahasatian"), near(await ev(() => st.P.wt), jan, 0.1), [await ev(() => st.P.wt), jan]);
  await setPt(p, 90, "", "Male");
  ok(T("no height -> TBW"), (await ev(() => st.P.wt)) === 90);

  // Expert option: hold the weight at the threshold BMI weight (set through the real settings control)
  await setPt(p, 120, 1.7, "Male");
  await ev(() => ov(1));
  await ev(() => { const s = document.querySelector('select[data-f="hi"]'); s.value = "hold"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  ok(T("hold option: weight = threshold BMI x height^2"), near(await ev(() => st.P.wt), T0 * 1.7 * 1.7, 0.01), [await ev(() => st.P.wt), T0 * 1.7 * 1.7]);
  ok(T("hold option: mode label"), (await ev(() => st.P.mode)) === "Held at BMI threshold weight");
  ok(T("demo graph drawn with 3 lines"), (await ev(() => document.querySelectorAll("#bmig polyline").length)) === 3);
  const gHold = await ev(() => document.querySelector("#bmig .g-d").getAttribute("points"));
  await ev(() => { const s = document.querySelector('select[data-f="hi"]'); s.value = "strict"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  const gStrict = await ev(() => document.querySelector("#bmig .g-d").getAttribute("points"));
  ok(T("demo graph changes live with the setting"), gHold !== gStrict);
  await ev(() => { const s = document.querySelector('select[data-f="lbw"]'); s.value = "boer"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  ok(T("demo graph changes with the LBW formula"), (await ev(() => document.querySelector("#bmig .g-d").getAttribute("points"))) !== gStrict);
  await ev(() => { const s = document.querySelector('select[data-f="lbw"]'); s.value = "jan"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  await ev(() => { const s = document.querySelector('select[data-f="hi"]'); s.value = "hold"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  await setPt(p, 70, 1.75, "Male");
  ok(T("hold option: below threshold still TBW"), near(await ev(() => st.P.wt), 70));
  await ev(() => { const s = document.querySelector('select[data-f="hi"]'); s.value = "blend"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  ok(T("hold option off again"), (await ev(() => S.hold)) === false);
  await ev(() => ov(0));

  // doses follow the config: for every enabled agent, max ml = W * k / c
  await setPt(p, 70, 1.75, "Male");
  const en = await ev(() => st.en.map((a) => [a.id, a.k, a.c, st.W * a.k / a.c]));
  const expected = cfg.agents.filter((a) => a.enabled);
  ok(T("enabled agents match config"), en.length === expected.length && expected.every((a, i) => en[i][0] === a.id), [en.map((e) => e[0]), expected.map((e) => e.id)]);
  expected.forEach((a, i) => ok(T(`dose ${a.id}`), near(en[i][3], (70 * a.maxMgPerKg) / a.mgPerMl, 0.01), [en[i], a]));

  // airway pool uses config defaults and cap
  const lbw = await ev(() => st.P.lbw);
  const pool = await ev(() => st.pool);
  ok(T("airway pool = lidoCap*LBW (no absolute cap)"), near(pool, cfg.defaults.lidoCap * lbw, 0.1), [pool, lbw]);
  await p.fill("#at", "4% lidocaine 5ml");
  await ev(() => calc());
  ok(T("airway parse 200 mg"), near(await ev(() => st.used), 200, 0.5));
  await p.fill("#at", "");
  await p.fill("#am", String(Math.ceil(pool) + 100));
  await ev(() => calc());
  ok(T("airway exceed -> no dose left"), (await ev(() => st.W)) === 0);
  ok(T("airway exceed -> message shows maximum in mg"), /EXCEEDED THE MAXIMUM/.test(await ev(() => $("aw").textContent)) && new RegExp("maximum " + Math.floor(pool)).test(await ev(() => $("aw").textContent)), await ev(() => $("aw").textContent));
  ok(T("airway exceed -> plan box red"), await ev(() => $("plan").classList.contains("bad")));
  {
    const used = await ev(() => st.used), usedPool = await ev(() => st.pool);
    const pct = Math.round((used / usedPool - 1) * 100);
    ok(T("airway exceed -> alert shows % over"), (await ev(() => $("aw").textContent)).includes(pct + "% over"), await ev(() => $("aw").textContent));
    ok(T("airway exceed -> plan box shows % over"), (await ev(() => $("plan").textContent)).includes("by " + pct + "%"), await ev(() => $("plan").textContent));
    ok(T("airway exceed -> % over is at the start of the plan box (not clipped)"), (await ev(() => $("plan").textContent)).slice(0, 60).includes(pct + "%"), await ev(() => $("plan").textContent));
  }
  await p.fill("#am", "");
  await ev(() => calc());

  // selection and plan
  await p.click("#tb tr[data-a]");
  ok(T("row selection"), (await ev(() => document.querySelectorAll("#tb tr.hl").length)) === 1);
  ok(T("plan shown"), (await ev(() => $("plan").style.display)) !== "none");

  // LAST: only configured guidelines are available
  const toggleVisible = await ev(() => $("lseg").style.display !== "none");
  ok(T("LAST toggle visibility"), toggleVisible === (cfg.last.enabled.length > 1));
  ok(T("LAST default guideline"), (await ev(() => LM)) === cfg.last.default);
  await setPt(p, 80, 1.75, "Male");
  const lr = await ev(() => $("lr").textContent);
  if (cfg.last.default === "asra") ok(T("ASRA bolus capped at 100 ml"), /BOLUS\s*100\s*ml/.test(lr), lr.slice(0, 120));
  if (cfg.last.default === "aagbi") ok(T("UK (Association of Anaesthetists QRH) bolus 1.5 ml/kg"), /BOLUS NOW\s*120/.test(lr), lr.slice(0, 120));
  await ev(() => { $("imA").style.width = "100%"; });
  await p.click(cfg.last.default === "asra" ? "#imS" : "#imA");
  ok(T("LAST image tap-to-zoom works"), (await ev(() => (LM === "asra" ? $("imS") : $("imA")).style.width)) === "220%" && p.errs.length === 0, p.errs);
  ok(T("LAST caption from config"), (await ev(() => $("lcap").textContent)) === cfg.last.captions[cfg.last.default]);

  // implausible values pop-up
  const pop = async (id, v) => {
    await p.fill("#" + id, String(v));
    await p.press("#" + id, "Tab");
    const on = await ev(() => $("chk").classList.contains("on"));
    if (on) await p.click("#chkb");
    return on;
  };
  ok(T("popup weight 350"), await pop("w", 350));
  ok(T("no popup weight 280"), !(await pop("w", 280)));
  ok(T("popup height 2.6 m"), await pop("h", 2.6));
  ok(T("popup height 260 cm"), await pop("h", 260));
  ok(T("popup height 301 cm"), await pop("h", 301));
  ok(T("no popup height 180"), !(await pop("h", 180)));
  ok(T("popup age 121"), await pop("age", 121));
  ok(T("no popup age 45"), !(await pop("age", 45)));
  await setPt(p, 350, 1.75, "Male");
  ok(T("weight over 300 pauses calculation"), (await ev(() => st.P.ok)) === false);
  await setPt(p, 70, 1.75, "Male", "");

  // paediatric mode
  await ev(() => { PM = true; $("ageu").value = "m"; $("age").value = 2; $("w").value = 5; $("h").value = 0.58; calc(); });
  const warn = await ev(() => $("pwarn").textContent);
  ok(T("neonate banner uses config text"), warn.includes(cfg.text.neonate.replace(/<[^>]*>/g, "")), warn.slice(0, 200));
  ok(T("prilocaine locked out for neonate"), !(await ev(() => st.en.some((a) => a.id.startsWith("p") && a.g === "pr"))));
  ok(T("height under 25 cm accepted in paeds"), (await (async () => { await ev(() => { $("h").value = 0.2; calc(); }); return ev(() => st.P.h); })()) === 0.2);
  await ev(() => { $("ageu").value = "m"; $("age").value = 8; calc(); });
  ok(T("infant banner uses config text"), (await ev(() => $("pwarn").textContent)).includes(cfg.text.infant.replace(/<[^>]*>/g, "")));
  await ev(() => { PM = false; $("age").value = ""; $("h").value = 1.75; $("w").value = 70; calc(); });
  ok(T("height under 25 cm ignored in adult mode"), (await (async () => { await ev(() => { $("h").value = 0.2; calc(); }); return ev(() => st.P.noh); })()) === true);

  // static text and branding come from the config
  const title = await ev(() => document.title);
  ok(T("title"), title === cfg.org.title, title);
  ok(T("protein-binding line"), (await ev(() => $("rmline").textContent)) === cfg.text.proteinBinding.replace(/<[^>]*>/g, ""));
  ok(T("footer contains stamp"), (await ev(() => document.querySelector("main").lastElementChild.textContent)).includes(cfg.build.stamp));
  ok(T("primary colour"), (await ev(() => getComputedStyle(document.documentElement).getPropertyValue("--pr").trim())) === cfg.theme.primary);
  const ds = await ev(() => document.body.innerHTML);
  ok(T("disclaimer present"), ds.includes("Disclaimer:") && (!cfg.org.contactEmail || ds.includes(cfg.org.contactEmail)));

  // settings persist under the organisation's storage prefix, and reset works
  await p.click('#hbtn button[onclick="ov(1)"]');
  await ev(() => { const i = document.querySelector("#sg [data-f=lidoCap]"); i.value = 7; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); });
  ok(T("settings saved with storage prefix"), (await ev((k) => !!localStorage.getItem(k + "Set"), cfg.storagePrefix)) === true);
  await p.click("#rst");
  ok(T("reset restores the org's defaults"), (await ev(() => S.lidoCap)) === cfg.defaults.lidoCap && (await ev(() => S.hold)) === cfg.defaults.hold);
  await p.click('#ov button:has-text("Close")');

  // print is one A4 page
  await setPt(p, 70, 1.75, "Male", "");
  await p.emulateMedia({ media: "print" });
  const pdf = await p.pdf({ format: "A4", printBackground: true });
  await p.emulateMedia({ media: "screen" });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(T("prints on one page"), pages === 1, pages);

  ok(T("no console or page errors"), p.errs.length === 0, p.errs);

  // show working: every step present, and its numbers agree with the main screen
  await setPt(p, 120, 175, "Male", "");
  await p.fill("#at", "4ml 4% lignocaine nebulised");
  await ev(() => { calc(); ov(1); $("wkd").open = true; });
  const wk = await ev(() => $("wk").innerText);
  for (const h of ["1. Patient", "2. Lean body weight", "3. Dosing weight", "5. Airway lidocaine pool", "6. Single agent", "7. Dual agent", "9. Lipid rescue", "10. Warnings", "Rounding"])
    ok(T("show working has step: " + h), wk.includes(h), wk.slice(0, 200));
  const agree = await ev(() => {
    const main = {}; [].forEach.call(document.querySelectorAll("#tb tr[data-a]"), (r) => { main[r.dataset.a] = r.children[1].innerText.trim(); });
    const w = {}; [].forEach.call(document.querySelectorAll("#wk table tr"), (r, i) => { if (i) w[r.children[0].innerText.trim()] = r.children[4].innerText.trim(); });
    return st.en.every((a) => String(w[a.name]) === String(main[a.id]));
  });
  ok(T("show working: step 6 max ml equals the main table for every agent"), agree);
  ok(T("show working sits at the top of Expert settings"), await ev(() => $("wkd").compareDocumentPosition($("sg")) & Node.DOCUMENT_POSITION_FOLLOWING));
  await p.fill("#at", "");
  await ev(() => ov(0));
  ok(T("show working: no script errors"), p.errs.length === 0, p.errs.join("; "));
  await p.close();
}


/* ---------- reload persistence, limit bounds, settings-changed badge, lipid guards, height limit ---------- */
async function safetyTests(browser, org, cfg) {
  const p = await open(browser, org);
  const T = (n) => `[${org}] ${n}`;
  const ev = (f, a) => p.evaluate(f, a);
  const key = (k) => cfg.storagePrefix + k;
  const shown = (id) => ev((id) => getComputedStyle(document.getElementById(id)).display !== "none", id);
  const fire = (sel, v, type) => ev(([sel, v, type]) => { const i = document.querySelector(sel); if (v !== null) i.value = v; i.dispatchEvent(new Event(type, { bubbles: true })); }, [sel, v, type]);

  // ---- item 1: reload keeps the airway reduction, used volumes and agents; notice shown only when restored
  ok(T("fresh start: no restored-patient notice"), !(await shown("restored")));
  await setPt(p, 80, 180, "Male");
  await p.fill("#at", "5 ml 4% lidocaine, 10 sprays 10% lidocaine");
  const ids = await ev(() => st.en.map((a) => a.id));
  await ev((ids) => { $("d1").value = ids[2]; $("d2").value = ids[0]; $("u1").value = 3; $("u2").value = 5; calc(); }, ids);
  const before = await ev(() => ({ used: st.used, W: st.W, ml: st.en.map((a) => Admix.maxDose(st.W, a).ml) }));
  ok(T("airway text counted before reload (300 mg, weight reduced)"), before.used === 300 && before.W < 80, before);
  await p.reload();
  const after = await ev(() => ({ used: st.used, W: st.W, ml: st.en.map((a) => Admix.maxDose(st.W, a).ml), at: $("at").value, u1: $("u1").value, u2: $("u2").value, d1: $("d1").value, d2: $("d2").value, usedOpen: $("used").open }));
  ok(T("reload: airway text restored"), after.at === "5 ml 4% lidocaine, 10 sprays 10% lidocaine", after.at);
  ok(T("reload: maximum doses unchanged for every agent"), JSON.stringify(after.ml) === JSON.stringify(before.ml) && after.used === 300 && after.W === before.W, [before, after]);
  ok(T("reload: used volumes and agents restored (hidden section still counted, and opened)"), after.u1 === "3" && after.u2 === "5" && after.d1 === ids[2] && after.d2 === ids[0] && after.usedOpen === true, after);
  ok(T("reload: used-so-far volumes reach the dual-agent plan"), await ev(() => st.dual && st.dual.u1 === 3 && st.dual.u2 === 5));
  ok(T("reload: restored-patient notice is shown"), (await shown("restored")) && /previous patient/.test(await ev(() => $("restored").textContent)));
  await p.click("#rsx");
  ok(T("notice can be dismissed"), !(await shown("restored")));
  await p.reload();
  ok(T("notice returns on the next reload while a patient is saved"), await shown("restored"));
  await p.click("#newpt");
  ok(T("New patient hides the notice"), !(await shown("restored")));
  ok(T("New patient clears weight, airway text, manual airway mg and used volumes"), await ev(() => ["w", "h", "age", "at", "am", "u1", "u2"].every((i) => $(i).value === "") && st.used === 0));
  ok(T("New patient leaves nothing to restore"), await ev((k) => { try { const v = JSON.parse(localStorage.getItem(k) || "{}"); return !v.w && !v.at && !v.am && !v.u1 && !v.u2; } catch (e) { return false; } }, key("Pt")));
  await p.reload();
  ok(T("after New patient and reload: no notice, nothing restored"), !(await shown("restored")) && (await ev(() => $("at").value === "" && $("w").value === "" && st.used === 0)));

  // ---- item 2: limit bounds, field shows the value used, settings-changed badge
  await ev(() => { document.querySelectorAll("details").forEach((d) => (d.open = true)); document.querySelectorAll(".cl").forEach((c) => c.classList.remove("col")); });
  await setPt(p, 70, 1.75, "Male");
  ok(T("badge hidden with the organisation defaults"), !(await shown("chg")));
  const a0 = await ev(() => st.en[0].id);
  await ev(() => ov(1));
  const ksel = `#sg [data-a=k][data-id=${a0}]`;
  await fire(ksel, "30", "input");
  ok(T("override 30 mg/kg is used as 15 while typing"), (await ev((id) => A().find((a) => a.id === id).k, a0)) === 15);
  await fire(ksel, null, "change");
  ok(T("override 30 mg/kg: field shows 15 after change"), (await ev((s) => document.querySelector(s).value, ksel)) === "15");
  ok(T("override stored as 15"), (await ev((k) => JSON.parse(localStorage.getItem(k)), key("Ov")))[a0].k === 15);
  ok(T("main screen shows the settings-changed badge"), (await shown("chg")) && /Settings changed from this organisation/.test(await ev(() => $("chg").textContent)));
  await p.evaluate(() => { window.__cp = null; Object.defineProperty(navigator, "clipboard", { value: { writeText: (t) => { window.__cp = t; return Promise.resolve(); } }, configurable: true }); window.alert = () => {}; });
  await ev(() => copySummary());
  const sum = await ev(() => window.__cp);
  ok(T("copied summary carries the settings-changed line"), /SETTINGS CHANGED from this organisation/.test(sum), sum);
  ok(T("copied summary names the lipid guideline and weight basis"), /Association of Anaesthetists QRH 3-10 \(2023\); total body weight 70 kg/.test(sum) || cfg.last.default === "asra" || /ASRA/.test(sum), sum);
  await ev(() => printPrep());
  ok(T("print header line carries the settings-changed note"), /SETTINGS CHANGED/.test(await ev(() => $("pd").textContent)));
  await fire(ksel, "0", "input"); await fire(ksel, null, "change");
  ok(T("override 0 is allowed"), (await ev((id) => A().find((a) => a.id === id).k, a0)) === 0);
  await p.click("#rst");
  ok(T("Reset removes the badge"), !(await shown("chg")));
  ok(T("Reset restores the default limit"), (await ev((id) => A().find((a) => a.id === id).k, a0)) === cfg.agents.find((a) => a.id === a0).maxMgPerKg);
  await fire("#sg [data-f=bmi]", "200", "input"); await fire("#sg [data-f=bmi]", null, "change");
  ok(T("BMI threshold 200: field shows the clamped 60 and the app uses 60"), (await ev(() => document.querySelector("#sg [data-f=bmi]").value)) === "60" && (await ev(() => S.bmi)) === 60);
  ok(T("a changed default also raises the badge"), await shown("chg"));
  await fire("#sg [data-f=bmi]", "", "input"); await fire("#sg [data-f=bmi]", null, "change");
  ok(T("emptied field shows the value in use"), (await ev(() => document.querySelector("#sg [data-f=bmi]").value)) === "60");
  await p.click("#rst");
  await p.click("#addc");
  ok(T("a custom agent raises the badge"), await shown("chg"));
  await fire("#sg [data-a=pct]", "500", "input"); await fire("#sg [data-a=pct]", null, "change");
  ok(T("custom 500% is clamped to 20% (200 mg/ml) in the field and the engine"), (await ev(() => document.querySelector("#sg [data-a=pct]").value)) === "20" && (await ev(() => A().find((a) => a.cu).c)) === 200);
  await fire("#sg [data-a=k][data-id^=cu]", "30", "input"); await fire("#sg [data-a=k][data-id^=cu]", null, "change");
  ok(T("custom 30 mg/kg is clamped to 15"), (await ev(() => A().find((a) => a.cu).k)) === 15 && (await ev(() => document.querySelector("#sg [data-a=k][data-id^=cu]").value)) === "15");
  await p.click("#rst");
  // out-of-range values already in storage are clamped on load
  await ev(([k1, k2, id]) => { localStorage.setItem(k1, JSON.stringify({ [id]: { k: 30 } })); localStorage.setItem(k2, JSON.stringify([{ id: "cuX", name: "X", c: 500, k: 40, on: true }])); }, [key("Ov"), key("Cu"), a0]);
  await p.reload();
  ok(T("load clamps stored out-of-range limits"), await ev((id) => A(1).find((a) => a.id === id).k === 15 && A(1).find((a) => a.id === "cuX").c === 200 && A(1).find((a) => a.id === "cuX").k === 15, a0));
  ok(T("badge shows after load with stored overrides"), await shown("chg"));
  await ev(() => ov(1)); await p.click("#rst"); await ev(() => ov(0));
  ok(T("badge gone after Reset"), !(await shown("chg")));

  // ---- items 4/7/8: lipid panel
  await ev(() => { document.querySelectorAll("details").forEach((d) => (d.open = true)); document.querySelectorAll(".cl").forEach((c) => c.classList.remove("col")); });
  for (const mode of ["aagbi", "asra"]) {
    for (const w of ["-70", "0", "", "320"]) {
      await ev((m) => { LM = m; }, mode);
      await setPt(p, w, 1.75, "Male");
      const lt = await ev(() => document.querySelectorAll("#lr .lt").length), txt = await ev(() => $("lr").textContent);
      ok(T(`lipid (${mode}) shows no doses for weight '${w}'`), lt === 0 && !/\d+\s*ml|BOLUS/.test(txt) && (await ev(() => document.querySelectorAll("#lr .alert").length)) === 1, txt);
    }
  }
  await ev(() => { LM = "aagbi"; }); await setPt(p, -70, 1.75, "Male");
  ok(T("lipid -70: asks for the weight"), /Enter the patient.s weight to calculate lipid doses/.test(await ev(() => $("lr").textContent)));
  await setPt(p, 320, 1.75, "Male");
  ok(T("lipid 320: says the weight is implausible"), /implausible/.test(await ev(() => $("lr").textContent)));
  await setPt(p, 70, 301, "Male");
  ok(T("lipid with height 301: no doses"), (await ev(() => document.querySelectorAll("#lr .lt").length)) === 0 && /implausible/.test(await ev(() => $("lr").textContent)));

  // UK option text follows the Association of Anaesthetists QRH 3-10 Box A
  await ev(() => { LM = "aagbi"; }); await setPt(p, 70, 1.75, "Male");
  const uk = await ev(() => $("lr").textContent);
  for (const t of ["BOLUS NOW", "105", "over 2\u20133 min", "AT 5 AND 10 MIN, IF STILL UNSTABLE", "REPEAT BOLUS", "ANY TIME AFTER 5 MIN", "DOUBLE INFUSION RATE", "17.5 ml/min", "35 ml/min", "1050", "2100", "MAXIMUM CUMULATIVE DOSE 840 ml", "20% Intralipid", "vasopressin", "1 hour", "70 mcg"])
    ok(T("UK lipid text contains: " + t), uk.includes(t), uk.slice(0, 400));
  ok(T("UK lipid text no longer says over 1 min or AAGBI"), !/over 1 min|AAGBI/.test(uk));
  ok(T("UK lipid footnote: total body weight, no ASRA attribution"), /total body weight \(70 kg\)/.test(uk) && !/ASRA/.test(uk), uk.slice(-300));
  ok(T("UK image caption carries the licence"), /Association of Anaesthetists 2023, www\.anaesthetists\.org\/qrh, CC BY-NC-SA 4\.0/.test(await ev(() => $("lcap").textContent)));
  ok(T("UK image is the QRH page (embedded jpeg)"), await ev(() => $("imA").src.startsWith("data:image/jpeg") && /Association of Anaesthetists QRH/.test($("imA").alt)));
  ok(T("toggle label names the QRH"), /QRH/.test(await ev(() => $("lsA").textContent)) && !/AAGBI/.test(await ev(() => document.body.innerText)));

  // lean weight for lipid with the hold option (and the footnote says so truthfully)
  await ev(() => { S.hold = true; }); await setPt(p, 120, 1.7, "Male");
  const lw = await ev(() => Math.round(st.P.lbw * 12)), heldCap = await ev(() => Math.round(st.P.wt * 12));
  const ukH = await ev(() => $("lr").textContent);
  ok(T("hold: lipid maximum uses lean weight, not the held weight"), ukH.includes("MAXIMUM CUMULATIVE DOSE " + lw + " ml") && lw !== heldCap, [lw, heldCap, ukH.slice(0, 300)]);
  ok(T("hold: footnote says lean body weight and that the held weight is not lean"), /lean body weight/.test(ukH) && /not lean weight/.test(ukH));
  ok(T("hold + UK option: lean weight is not attributed to the QRH"), !/ASRA/.test(ukH) && /QRH does not state/.test(ukH));
  await ev(() => { LM = "asra"; lipid(); });
  const asH = await ev(() => $("lr").textContent);
  ok(T("hold + ASRA: lean weight, 'as ASRA advises'"), /lean body weight/.test(asH) && /as ASRA advises/.test(asH));
  await p.evaluate(() => { window.__cp = null; Object.defineProperty(navigator, "clipboard", { value: { writeText: (t) => { window.__cp = t; return Promise.resolve(); } }, configurable: true }); window.alert = () => {}; });
  await ev(() => copySummary());
  ok(T("hold: copied summary uses the lean weight"), (await ev(() => window.__cp)).includes(await ev(() => "lean body weight " + fl(st.P.lbw, 1) + " kg")), await ev(() => window.__cp));
  ok(T("hold: working step 9 uses the lean weight"), /9\. Lipid rescue[\s\S]*lean body weight[\s\S]*not lean weight/.test(await ev(() => (ov(1), $("wk").innerText))));
  await ev(() => { ov(0); S.hold = false; LM = "aagbi"; }); await setPt(p, 120, 1.7, "Male");
  ok(T("LBW mode (hold off): lean footnote, QRH not credited"), /lean body weight/.test(await ev(() => $("lr").textContent)) && !/ASRA/.test(await ev(() => $("lr").textContent)));
  await setPt(p, 90, 1.7, "Male");
  ok(T("blend mode: adjusted-weight footnote"), /adjusted weight/.test(await ev(() => $("lr").textContent)));
  await setPt(p, 70, 1.75, "Male");

  // ---- item 6: height over 3 m / 300 cm pauses calculations
  await setPt(p, 70, 301, "Male");
  ok(T("height 301 pauses (P.ok false)"), (await ev(() => st.P.ok)) === false);
  ok(T("height 301: tables show a dash"), (await ev(() => $("tb").querySelector(".pill").textContent)) === "\u2014");
  ok(T("height 301: plan hidden"), (await ev(() => $("plan").style.display)) === "none");
  ok(T("height 301: message explains"), /height over 3 m \/ 300 cm: calculations paused until corrected/.test(await ev(() => $("pwarn").textContent)));
  ok(T("height 301: dilution does not check against a weight"), !/exceeds max for this patient/.test(await ev(() => $("kr").textContent)));
  await setPt(p, 70, 1750, "Male");
  ok(T("height 1750 pauses"), (await ev(() => st.P.ok)) === false);
  await setPt(p, 70, 300, "Male");
  ok(T("height 300 cm does not pause (soft warning)"), (await ev(() => st.P.ok)) === true && /height over 2\.5 m/.test(await ev(() => $("pwarn").textContent)));
  await setPt(p, 70, 2.99, "Male");
  ok(T("height 2.99 m does not pause"), (await ev(() => st.P.ok)) === true);
  await p.fill("#h", "301"); await p.press("#h", "Tab");
  ok(T("height 301 blocking pop-up says calculations are paused"), (await ev(() => $("chk").classList.contains("on"))) && /300 cm.*paused/.test(await ev(() => $("chkm").textContent)), await ev(() => $("chkm").textContent));
  await p.click("#chkb");
  await p.fill("#h", "1.75");
  ok(T("no console or page errors (safety tests)"), p.errs.length === 0, p.errs);
  await p.close();
}

/* ---------- builder: bad configs must be rejected ---------- */
function builderTests() {
  const tmp = path.join(ROOT, "orgs", "test-tmp");
  const tryCfg = (cfg) => {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, "config.json"), JSON.stringify({ org: { id: "test-tmp", name: "T", title: "T" }, ...cfg }));
    try { execFileSync("node", [path.join(ROOT, "scripts", "build.js"), "--check"], { stdio: "pipe" }); return null; }
    catch (e) { return String(e.stderr); }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  };
  // note: --check validates every org, so a bad tmp org makes the run fail while default/example still pass
  const rejects = (name, cfg, re) => { const err = tryCfg(cfg); ok("builder rejects " + name, err && re.test(err), err); };
  rejects("negative dose limit", { agentOverrides: { lp1: { maxMgPerKg: -1 } } }, /maxMgPerKg/);
  rejects("unknown agent override", { agentOverrides: { nope: { maxMgPerKg: 1 } } }, /unknown agent id/);
  rejects("duplicate agent id", { addAgents: [{ id: "lp1", name: "x", mgPerMl: 10, maxMgPerKg: 3, group: "lP" }] }, /duplicate id/);
  rejects("bad colour", { theme: { primary: "blue" } }, /theme\.primary/);
  rejects("LAST default not enabled", { last: { enabled: ["asra"], default: "aagbi" } }, /last\.default/);
  rejects("out-of-range default", { defaults: { lidoCap: 99999 } }, /defaults\.lidoCap/);
  rejects("a change to the lipid bolus", { defaults: { bolus: 2 } }, /lipid rescue/);
  rejects("a change to the lipid maximum", { defaults: { cap: 10 } }, /lipid rescue/);
  rejects("an empty list of high BMI options", { bmiOptions: [] }, /bmiOptions/);
  rejects("an unknown high BMI option", { bmiOptions: ["blend", "ibw"] }, /bmiOptions/);
  rejects("a default high BMI option that is not offered", { bmiOptions: ["strict", "hold"] }, /default high-BMI option/);
  rejects("dose limit above 15 mg/kg", { agentOverrides: { lp1: { maxMgPerKg: 30 } } }, /maxMgPerKg/);
  rejects("concentration above 200 mg/ml", { addAgents: [{ id: "z2", name: "z", mgPerMl: 250, maxMgPerKg: 3, group: "z" }] }, /mgPerMl/);
  rejects("zero concentration", { addAgents: [{ id: "z1", name: "z", mgPerMl: 0, maxMgPerKg: 3, group: "z" }] }, /mgPerMl/);
  ok("builder accepts a valid minimal org", tryCfg({}) === null);
  // reserved folder names are refused
  const rd = path.join(ROOT, "orgs", "src");
  fs.mkdirSync(rd, { recursive: true });
  fs.writeFileSync(path.join(rd, "config.json"), JSON.stringify({ org: { id: "src", name: "S" } }));
  let rerr = null;
  try { execFileSync("node", [path.join(ROOT, "scripts", "build.js"), "--check"], { stdio: "pipe" }); } catch (e) { rerr = String(e.stderr); }
  fs.rmSync(rd, { recursive: true, force: true });
  ok("builder rejects a reserved org id", rerr && /reserved/.test(rerr), rerr);
  // pages: default at the root, publishable orgs in their own folder, publish:false skipped
  execFileSync("node", [path.join(ROOT, "scripts", "build.js"), "--pages"], { stdio: "pipe" });
  ok("pages: default at ./index.html", fs.existsSync(path.join(ROOT, "index.html")));
  ok("pages: org with publish:false has no public folder", !fs.existsSync(path.join(ROOT, "example-hospital", "index.html")));
  ok("app title is fixed for requests", JSON.parse(fs.readFileSync(path.join(ROOT, "orgs", "example-hospital", "config.json"), "utf8")).org.title.startsWith("Admix - Local Anaesthetic Calculator"));
}

(async () => {
  builderTests();
  const browser = await chromium.launch();
  const orgs = fs.readdirSync(path.join(ROOT, "orgs"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const { loadConfig } = require("../scripts/build.js");
  for (const org of orgs) {
    const { cfg } = loadConfig(org);
    cfg.build = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", org, "build-info.json"), "utf8"));
    cfg.text.disclaimer = cfg.text.disclaimer; // not compared verbatim
    await coreTests(browser, org, cfg);
    await safetyTests(browser, org, cfg);
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

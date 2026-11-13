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

  // doses follow the config: for every enabled agent, max ml = W * k / c
  await setPt(p, 70, 1.75, "Male");
  const en = await ev(() => st.en.map((a) => [a.id, a.k, a.c, st.W * a.k / a.c]));
  const expected = cfg.agents.filter((a) => a.enabled);
  ok(T("enabled agents match config"), en.length === expected.length && expected.every((a, i) => en[i][0] === a.id), [en.map((e) => e[0]), expected.map((e) => e.id)]);
  expected.forEach((a, i) => ok(T(`dose ${a.id}`), near(en[i][3], (70 * a.maxMgPerKg) / a.mgPerMl, 0.01), [en[i], a]));

  // airway pool uses config defaults and cap
  const lbw = await ev(() => st.P.lbw);
  const pool = await ev(() => st.pool);
  ok(T("airway pool = min(lidoCap*LBW, lidoMax)"), near(pool, Math.min(cfg.defaults.lidoCap * lbw, cfg.defaults.lidoMax), 0.1), [pool, lbw]);
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
  if (cfg.last.default === "aagbi") ok(T("AAGBI bolus 1.5 ml/kg"), /BOLUS NOW\s*120/.test(lr), lr.slice(0, 120));
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
  ok(T("reset restores the org's defaults"), (await ev(() => S.lidoCap)) === cfg.defaults.lidoCap && (await ev(() => S.lidoMax)) === cfg.defaults.lidoMax);
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
  rejects("out-of-range default", { defaults: { lidoMax: 99999 } }, /defaults\.lidoMax/);
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
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

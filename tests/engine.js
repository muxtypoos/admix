/*
 * Engine tests: fixed worked examples with answers that can be checked by hand, run directly against
 * src/engine.js with no browser. Run: node tests/engine.js
 */
"use strict";
const E = require("../src/engine.js");
let pass = 0, fail = 0;
const eq = (name, got, want, tol = 0) => {
  const good = typeof want === "number" ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want);
  if (good) pass++; else { fail++; console.log("FAIL", name, "got", JSON.stringify(got), "want", JSON.stringify(want)); }
};
const lido = { c: 10, k: 3 }, bupi = { c: 2.5, k: 2 };

/* rounding helper */
eq("fl rounds down", E.fl(0.29, 1), 0.2);
eq("fl epsilon (0.3 stays 0.3)", E.fl(0.1 + 0.2, 1), 0.3);

/* single agent: 70 kg x 3 mg/kg = 210 mg = 21 ml of 1%;  70 x 2 = 140 mg = 56 ml of 0.25% */
eq("max lidocaine 1% ml", E.maxDose(70, lido).ml, 21);
eq("max lidocaine 1% mg", E.maxDose(70, lido).mg, 210);
eq("max bupivacaine 0.25% ml", E.maxDose(70, bupi).ml, 56);
eq("max bupivacaine 0.25% mg", E.maxDose(70, bupi).mg, 140);
eq("rounding is down (33 kg lido 1%: 9.9 ml, 99 mg)", E.maxDose(33, lido), { ml: 9.9, mg: 99 });

/* two agents: 21 ml and 56 ml; largest 1:1 mix = 2 x 21 x 56 / 77 = 30.545 -> 30.5 */
const pl = E.pairLimits(lido, bupi, 70);
eq("pair m1", pl.m1, 21); eq("pair m2", pl.m2, 56); eq("pair mix", pl.mix, 30.5);
eq("fraction used half+half", E.fractionUsed(10.5, 28, 21, 56), 1, 1e-12);
eq("fraction used 7 ml + 14 ml", E.fractionUsed(7, 14, 21, 56), 1 / 3 + 0.25, 1e-12);
eq("pair not ok when a limit is zero", E.pairLimits(lido, { c: 2.5, k: 0 }, 70).ok, false);

/* over-maximum text */
eq("20% over", E.overText(1.2), "20%"); eq("50% over", E.overText(1.5), "50%"); eq("tiny over", E.overText(1.001), "<1%");

/* chart */
eq("chart row 0 = all agent 1", E.chartFromRow(0, 21, 56), { x: 21, y: 0 });
eq("chart row 10 = all agent 2", E.chartFromRow(10, 21, 56), { x: 0, y: 56 });
eq("chart row 5 = half each", E.chartFromRow(5, 21, 56), { x: 10.5, y: 28 });
eq("chart from 10.5 ml of agent 1", E.chartFromVolume(1, 10.5, 21, 56), { x: 10.5, y: 28 });
eq("chart volume above the maximum is capped", E.chartFromVolume(1, 30, 21, 56), { x: 21, y: 0 });
eq("chart fraction", E.chartFraction(10.5, 28, 21, 56, 1).fr, 1, 1e-12);

/* dilution: 10 ml of 0.5% from 1% stock needs 5 ml stock + 5 ml diluent */
const d = E.dilution({ c: 10 }, { c: 5 }, 10);
eq("dilution stock", d.hf, 5); eq("dilution diluent", d.df, 5); eq("dilution strength %", d.ach, 0.5, 1e-12);
eq("dilution rounds stock down", E.dilution({ c: 10 }, { c: 3 }, 10).hf, 3);
eq("dilution total drug mg", E.dilution({ c: 10 }, { c: 5 }, 20).total, 100);

/* lean body weight: 70 kg, 175 cm, male (BMI 22.857) */
eq("LBW Janmahasatian male", E.lbwRaw("jan", 70, 175, true, 70 / 1.75 / 1.75), 9270 * 70 / (6680 + 216 * (70 / 1.75 / 1.75)), 1e-9);
eq("LBW Janmahasatian male value", E.lbwRaw("jan", 70, 175, true, 70 / 1.75 / 1.75), 55.86, 0.01);
eq("LBW Boer male", E.lbwRaw("boer", 70, 175, true, 0), 0.407 * 70 + 0.267 * 175 - 19.2, 1e-9);
eq("LBW Boer female", E.lbwRaw("boer", 60, 165, false, 0), 0.252 * 60 + 0.473 * 165 - 48.3, 1e-9);
eq("LBW never above total weight", E.lbwF("boer", 40, 1.9, true, 40 / 1.9 / 1.9) <= 40, true);

/* age */
eq("6 months", E.ageYears(6, "m", true), 0.5, 1e-12);
eq("unit ignored in adult mode", E.ageYears(6, "m", false), 6);
eq("30 days", E.ageYears(30, "d", true), 30 / 365.25, 1e-12);
eq("no age", E.ageYears("", "y", true), 0);

/* patient / dosing weight */
const S = { bmi: 30, blend: true, lbw: "jan", lbwP: "jan", pc: "c98" };
let P = E.patient({ w: 70, h: 175, age: 40, male: true, PM: false, WM: "auto", S, CEN: {} });
eq("normal BMI uses TBW", [P.mode, P.wt, P.ok], ["TBW", 70, true]);
P = E.patient({ w: 120, h: 170, age: 40, male: true, PM: false, WM: "auto", S, CEN: {} });
eq("BMI 41.5 uses LBW", [P.mode, P.wt === P.lbw], ["LBW", true]);
P = E.patient({ w: 90, h: 170, age: 40, male: false, PM: false, WM: "auto", S, CEN: {} });   // BMI 31.1: inside the 5-unit blend zone
eq("blend zone", P.mode, "Adjusted (TBW→LBW)");
const Sh = { ...S, hold: true };
P = E.patient({ w: 90, h: 170, age: 40, male: false, PM: false, WM: "auto", S: Sh, CEN: {} });
eq("hold: weight is threshold BMI x height^2", P.wt, 30 * 1.7 * 1.7, 1e-9);
eq("hold: mode label", P.mode, "Held at BMI threshold weight");
P = E.patient({ w: 150, h: 170, age: 40, male: false, PM: false, WM: "auto", S: Sh, CEN: {} });
eq("hold: stays flat at high BMI", P.wt, 30 * 1.7 * 1.7, 1e-9);
P = E.patient({ w: 80, h: 170, age: 40, male: false, PM: false, WM: "auto", S: Sh, CEN: {} });
eq("hold: below threshold is total weight", P.wt, 80);
P = E.patient({ w: 90, h: 170, age: 40, male: false, PM: false, WM: "auto", S, CEN: {} });
eq("blend value", P.wt, 90 + (P.lbw - 90) * ((P.bmi - 30) / 5), 1e-9);
P = E.patient({ w: 120, h: 170, age: 40, male: true, PM: false, WM: "tbw", S, CEN: {} });
eq("manual TBW", P.mode, "TBW (manual)");
P = E.patient({ w: 70, h: 0, age: 40, male: true, PM: false, WM: "auto", S, CEN: {} });
eq("no height: TBW, no LBW", [P.noh, P.lbw, P.wt], [true, 0, 70]);
P = E.patient({ w: 4, h: 0.55, age: 0.1, male: true, PM: true, WM: "auto", S, CEN: {} });
eq("neonate flag", P.neo, true); eq("under 2 y paediatric = TBW only", P.tbwOnly, true);
P = E.patient({ w: 400, h: 175, age: 40, male: true, PM: false, WM: "auto", S, CEN: {} });
eq("weight over 300 kg is not accepted", P.ok, false);

/* agent list: 3 mg/kg with a 50% neonatal reduction = 1.5; raw (settings screen) is unchanged; prilocaine off in neonates */
const BASE = [["l", "Lidocaine", 10, 3, "la", 1], ["p", "Prilocaine", 10, 6, "pr", 1]], Sx = { neoRed: 50 };
let ag = E.agents(BASE, {}, [], Sx, true, false);
eq("neonatal limit", ag[0].k, 1.5); eq("prilocaine locked out in neonates", ag[1].on, false);
ag = E.agents(BASE, {}, [], Sx, true, true);
eq("raw limit unchanged", ag[0].k, 3); eq("raw keeps prilocaine", ag[1].on, true);
ag = E.agents(BASE, { l: { k: 2, on: false } }, [], Sx, false, false);
eq("expert override", [ag[0].k, ag[0].on], [2, false]);
ag = E.agents(BASE, {}, [{ id: "x", name: "Custom", c: -1, k: 2, on: true }], Sx, false, false);
eq("invalid custom agent is flagged and off", [ag[2].inv, ag[2].on], [true, false]);

/* airway lidocaine pool: 50 kg LBW x 6 mg/kg = 300 mg; 150 mg used leaves half; dosing weight 60 -> 30 */
const ap = E.airwayPool({ lbw: 50, w: 80, wt: 60 }, { lidoCap: 6 }, 150);
eq("pool", ap.pool, 300); eq("fraction left", ap.fr, 0.5); eq("weight for other doses", ap.W, 30);
eq("pool has no absolute cap", E.airwayPool({ lbw: 100, w: 100, wt: 100 }, { lidoCap: 9 }, 0).pool, 900);
eq("pool uses TBW without height", E.airwayPool({ lbw: 0, w: 70, wt: 70 }, { lidoCap: 6 }, 0).pool, 420);
eq("over-used pool leaves nothing", E.airwayPool({ lbw: 50, w: 80, wt: 60 }, { lidoCap: 6 }, 400).W, 0);

/* airway text: 4% = 40 mg/ml so 3 ml = 120 mg; 2% 5 ml = 100 mg plus 1% 4 ml = 40 mg */
const SA = { cpMg: 10, cpN: 4 };
eq("4% 3 ml", E.parseAirway("lidocaine 4% 3 ml", SA).tot, 120);
eq("two entries", E.parseAirway("lidocaine 2% 5 ml, lidocaine 1% 4 ml", SA).tot, 140);
eq("other drugs are not counted", E.parseAirway("lidocaine 4% 3 ml, ketamine 50 mg", SA).tot, 120);
eq("empty text", E.parseAirway("", SA).tot, 0);

/* lipid rescue (settings: 1.5 ml/kg bolus, 15 ml/kg/h infusion, doubled once, cap 12 ml/kg) */
/* (the mode key "aagbi" is historic: it now means the Association of Anaesthetists QRH 3-10 (2023) option) */
const SL = { bolus: 1.5, inf: 15, mult: 2, cap: 12 };
let L = E.lastDoses(70, SL, "aagbi");
eq("UK (QRH) 70 kg", [L.b, L.inf, L.dbl, L.cap, L.over], [105, 1050, 2100, 840, false]);
L = E.lastDoses(70, SL, "asra"); eq("ASRA 70 kg bolus capped at 100", [L.b, L.over], [100, false]);
L = E.lastDoses(80, SL, "asra"); eq("ASRA over 70 kg fixed", [L.b, L.over], [100, true]);
L = E.lastDoses(50, SL, "asra"); eq("ASRA 50 kg", L.b, 75);

/* QRH 70 kg example: infusion 15 ml/kg/h = 17.5 ml/min, doubled 35 ml/min */
L = E.lastDoses(70, SL, "aagbi"); eq("QRH infusion ml/min", [L.mn, L.dmn], [17.5, 35]);

/* ---------- height limit: above 3 m (or 300 cm) pauses calculations ---------- */
const pH = (h) => E.patient({ w: 70, h, age: 40, male: true, PM: false, WM: "auto", S, CEN: {} });
eq("height 301 (cm) pauses", [pH(301).ok, pH(301).hbad], [false, true]);
eq("height 1750 pauses", [pH(1750).ok, pH(1750).hbad], [false, true]);
eq("height 3.01 is read as 3.01 cm: ignored (flagged on screen), not a pause", [pH(3.01).ok, pH(3.01).noh], [true, true]);
eq("height 300 (cm = 3 m) does not pause", [pH(300).ok, pH(300).hbad], [true, false]);
eq("height 2.99 m does not pause", [pH(2.99).ok, pH(2.99).hbad], [true, false]);
eq("height 175 cm normal", [pH(175).ok, pH(175).hbad, pH(175).h], [true, false, 1.75]);
eq("weight 300 ok, 301 pauses", [E.patient({ w: 300, h: 1.7, age: 40, male: true, PM: false, WM: "auto", S, CEN: {} }).ok, E.patient({ w: 301, h: 1.7, age: 40, male: true, PM: false, WM: "auto", S, CEN: {} }).ok], [true, false]);

/* ---------- dose-limit bounds (mg/kg 0 to 15, custom concentration above 0 up to 200 mg/ml) ---------- */
eq("bounds exported", [E.KMAX, E.CMAX], [15, 200]);
ag = E.agents(BASE, { l: { k: 30 } }, [], Sx, false, false); eq("override 30 mg/kg is clamped to 15", ag[0].k, 15);
ag = E.agents(BASE, { l: { k: 30 } }, [], Sx, false, true); eq("override 30 mg/kg is clamped in the settings (raw) list too", ag[0].k, 15);
ag = E.agents(BASE, { l: { k: 15 } }, [], Sx, false, false); eq("override 15 allowed", ag[0].k, 15);
ag = E.agents(BASE, { l: { k: 0 } }, [], Sx, false, false); eq("override 0 allowed", ag[0].k, 0);
ag = E.agents(BASE, { l: { k: -2 } }, [], Sx, false, false); eq("negative override is not used (default kept)", ag[0].k, 3);
ag = E.agents(BASE, { l: { k: Infinity } }, [], Sx, false, false); eq("infinite override is not used", ag[0].k, 3);
ag = E.agents(BASE, { l: { k: 30 } }, [], Sx, true, false); eq("clamp applies before the neonatal reduction (15 x 0.5)", ag[0].k, 7.5);
ag = E.agents(BASE, {}, [{ id: "x", name: "C", c: 500, k: 30, on: true }], Sx, false, false); eq("custom 500 mg/ml and 30 mg/kg clamped to 200 and 15", [ag[2].c, ag[2].k, ag[2].inv, ag[2].on], [200, 15, false, true]);
ag = E.agents(BASE, {}, [{ id: "x", name: "C", c: 200, k: 15, on: true }], Sx, false, false); eq("custom at the limits allowed", [ag[2].c, ag[2].k, ag[2].inv], [200, 15, false]);
ag = E.agents(BASE, {}, [{ id: "x", name: "C", c: 0, k: 3, on: true }], Sx, false, false); eq("custom concentration 0 is invalid", [ag[2].inv, ag[2].on], [true, false]);

/* ---------- airway text parser ---------- */
const SP = { cpMg: 5, cpN: 10 };   // co-phenylcaine: 5 mg lidocaine per spray (the app default)
const pa = (t) => E.parseAirway(t, SP);
const flagged = (r) => r.sk.length > 0 || r.items.some((i) => i.bad);
let r = pa("lidocaine 1.5 mg/kg");
eq("per-kg dose is not counted", r.tot, 0); eq("per-kg dose is flagged", [r.items[0].bad, r.items[0].fl[0]], [1, "dose given per kg: not counted, enter the total mg"]);
eq("mg per kg wording is flagged too", [pa("lidocaine 3 mg per kg").tot, flagged(pa("lidocaine 3 mg per kg"))], [0, true]);
eq("per-kg next to another item: only the other is counted", [pa("lidocaine 1.5 mg/kg, lidocaine 4% 5 ml").tot, flagged(pa("lidocaine 1.5 mg/kg, lidocaine 4% 5 ml"))], [200, true]);
eq("twice", pa("lidocaine 4% 5ml nebulised twice").tot, 400);
eq("twice shown in the label", pa("lidocaine 4% 5ml nebulised twice").items[0].label.includes("× 2"), true);
eq("thrice", pa("lidocaine 4% 5ml thrice").tot, 600);
eq("3 times", pa("lidocaine 4% 5ml 3 times").tot, 600);
eq("times 3", pa("lidocaine 4% 5ml times 3").tot, 600);
eq("two times (word number)", pa("lidocaine 4% 5ml two times").tot, 400);
eq("twice with sprays", pa("co-phenylcaine 5 sprays each nostril twice").tot, 100);
eq("x 2 and twice together are multiplied and flagged", [pa("lidocaine 4% 5ml x 2 twice").tot, flagged(pa("lidocaine 4% 5ml x 2 twice"))], [800, true]);
eq("a separate 'twice' item is flagged, never dropped", [pa("lidocaine 4% 5ml, twice").sk, pa("lidocaine 4% 5ml, twice").tot], [["twice"], 200]);
eq("comma between items: 4% 5ml x 2, 2% 2ml", pa("lidocaine 4% 5ml x 2,2% 2ml").tot, 440);
eq("comma between items: spray x 10, 4% 5ml", pa("lidocaine 10% spray x 10,4% lidocaine 5ml").tot, 300);
eq("second part without a drug name is flagged as assumed", pa("lidocaine 4% 5ml x 2,2% 2ml").items[1].fl.includes("drug name not stated: assumed lidocaine"), true);
eq("a bare leftover number is flagged as not counted", [pa("lidocaine 4% 5ml, 2").tot, pa("lidocaine 4% 5ml, 2").sk], [200, ["2"]]);
eq("a comma is never a decimal point: 2,5 ml is flagged", flagged(pa("lidocaine 2,5 ml 4%")), true);
eq("x 2 nostrils is a nostril count, not a repeat", [pa("co-phenylcaine 5 sprays x 2 nostrils").tot, pa("co-phenylcaine 5 sprays x 2 nostrils").items[0].fl.length], [50, 0]);
/* regressions */
eq("5 ml 4% lidocaine", pa("5 ml 4% lidocaine").tot, 200);
eq("co-phenylcaine 5 sprays per nostril", pa("co-phenylcaine 5 sprays per nostril").tot, 50);
eq("10 sprays 10% lidocaine", pa("10 sprays 10% lidocaine").tot, 100);
eq("lidocaine 0.5 g", pa("lidocaine 0.5 g").tot, 500);
eq("lidocaine 4% 5 ml x2", pa("lidocaine 4% 5 ml x2").tot, 400);
eq("2 x 5ml 4% lidocaine", pa("2 x 5ml 4% lidocaine").tot, 400);
eq("three items", pa("5 ml 4% lidocaine topical, 3 ml co-phenylcaine, 2 ml 2% lidocaine via scope").tot, 390);
eq("thousands comma 1,000 mg", pa("lidocaine 1,000 mg").tot, 1000);
eq("five ml 4% lidocaine", pa("five ml 4% lidocaine").tot, 200);
eq("regression inputs are not flagged", ["5 ml 4% lidocaine", "co-phenylcaine 5 sprays per nostril", "10 sprays 10% lidocaine", "lidocaine 0.5 g", "lidocaine 4% 5 ml x2", "2 x 5ml 4% lidocaine", "lidocaine 1,000 mg", "five ml 4% lidocaine"].some((t) => flagged(pa(t))), false);

/* ---------- lipid weight: lean body weight when the dosing weight is held at the BMI threshold weight ---------- */
const pL = (w, h, Sx2, WM) => E.patient({ w, h, age: 40, male: true, PM: false, WM: WM || "auto", S: Sx2, CEN: {} });
P = pL(120, 1.7, Sh);
eq("hold mode: lipid weight is LBW (not the held weight)", [P.mode, E.lipidWeight(P) === P.lbw, P.lbw > 0, P.wt > P.lbw], ["Held at BMI threshold weight", true, true, true]);
eq("hold mode: basis text", E.lipidBasis(P), "lean body weight");
P = pL(70, 1.75, Sh); eq("hold mode below threshold: total weight", [P.mode, E.lipidWeight(P), E.lipidBasis(P)], ["TBW", 70, "total body weight"]);
P = pL(120, 1.7, S); eq("LBW mode: lean weight", [P.mode, E.lipidWeight(P) === P.wt, E.lipidBasis(P)], ["LBW", true, "lean body weight"]);
P = pL(90, 1.7, S); eq("blend mode: dosing (adjusted) weight, not lean", [P.mode, E.lipidWeight(P) === P.wt, E.lipidWeight(P) > P.lbw, E.lipidBasis(P)], ["Adjusted (TBW→LBW)", true, true, "adjusted weight (between total and lean body weight)"]);
P = pL(120, 1.7, S, "tbw"); eq("manual TBW: total weight", [E.lipidWeight(P), E.lipidBasis(P)], [120, "total body weight"]);
P = pL(120, 1.7, S, "lbw"); eq("manual LBW: lean weight", [E.lipidWeight(P) === P.lbw, E.lipidBasis(P)], [true, "lean body weight"]);
P = pL(120, 1.7, { ...Sh }, "tbw"); eq("hold set but manual TBW chosen: total weight", E.lipidWeight(P), 120);
eq("hold mode lipid doses use the lean weight", E.lastDoses(E.lipidWeight(pL(120, 1.7, Sh)), SL, "asra").cap, Math.round(pL(120, 1.7, Sh).lbw * 12));

eq("mgOf: 20 ml of 1% = 200 mg", E.mgOf(20, 10), 200);
eq("mgOf: rounds down to whole mg from 10 mg", E.mgOf(32.3, 2.5), 80);
eq("mgOf: one decimal below 10 mg", E.mgOf(1.7, 2.5), 4.2);
eq("mgOf: text input", E.mgOf("5", 20), 100);

console.log(`engine tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

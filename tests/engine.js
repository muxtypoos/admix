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
const ap = E.airwayPool({ lbw: 50, w: 80, wt: 60 }, { lidoCap: 6, lidoMax: 500 }, 150);
eq("pool", ap.pool, 300); eq("fraction left", ap.fr, 0.5); eq("weight for other doses", ap.W, 30);
eq("pool is capped", E.airwayPool({ lbw: 100, w: 100, wt: 100 }, { lidoCap: 6, lidoMax: 500 }, 0).pool, 500);
eq("pool uses TBW without height", E.airwayPool({ lbw: 0, w: 70, wt: 70 }, { lidoCap: 6, lidoMax: 500 }, 0).pool, 420);
eq("over-used pool leaves nothing", E.airwayPool({ lbw: 50, w: 80, wt: 60 }, { lidoCap: 6, lidoMax: 500 }, 400).W, 0);

/* airway text: 4% = 40 mg/ml so 3 ml = 120 mg; 2% 5 ml = 100 mg plus 1% 4 ml = 40 mg */
const SA = { cpMg: 10, cpN: 4 };
eq("4% 3 ml", E.parseAirway("lidocaine 4% 3 ml", SA).tot, 120);
eq("two entries", E.parseAirway("lidocaine 2% 5 ml, lidocaine 1% 4 ml", SA).tot, 140);
eq("other drugs are not counted", E.parseAirway("lidocaine 4% 3 ml, ketamine 50 mg", SA).tot, 120);
eq("empty text", E.parseAirway("", SA).tot, 0);

/* lipid rescue (settings: 1.5 ml/kg bolus, 15 ml/kg/h infusion, doubled once, cap 12 ml/kg) */
const SL = { bolus: 1.5, inf: 15, mult: 2, cap: 12 };
let L = E.lastDoses(70, SL, "aagbi");
eq("AAGBI 70 kg", [L.b, L.inf, L.dbl, L.cap, L.over], [105, 1050, 2100, 840, false]);
L = E.lastDoses(70, SL, "asra"); eq("ASRA 70 kg bolus capped at 100", [L.b, L.over], [100, false]);
L = E.lastDoses(80, SL, "asra"); eq("ASRA over 70 kg fixed", [L.b, L.over], [100, true]);
L = E.lastDoses(50, SL, "asra"); eq("ASRA 50 kg", L.b, 75);

console.log(`engine tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

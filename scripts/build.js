#!/usr/bin/env node
/*
 * Admix build: merges the core app (src/template.html) with an organisation's
 * config (orgs/<id>/config.json) into ONE self-contained HTML file:
 *   dist/<id>/index.html        the app (also used as the Capacitor web dir)
 *   dist/<id>/build-info.json   version, org, config hash
 *
 * Usage:  node scripts/build.js --org <id>      build one organisation
 *         node scripts/build.js --all           build every folder in orgs/
 *         node scripts/build.js --check         validate every config, write nothing
 *         node scripts/build.js --pages         build all orgs and write the GitHub Pages files: ./index.html (default) and ./<id>/index.html
 * No dependencies: Node 18+ only.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(p, "utf8");
const readJSON = (p) => JSON.parse(read(p));
const pkg = readJSON(path.join(ROOT, "package.json"));

const LBW_FORMULAS = ["jan", "boer", "james", "hume", "peters"];
const CENTILES = ["c91", "c98", "c996"];
const LAST_GUIDELINES = ["aagbi", "asra"];
// Bounds the app itself clamps to at runtime (keep in sync with BND in template.html)
const BOUNDS = {
  bmi: [15, 60], lidoCap: [0.5, 30], lidoMax: [50, 2000], cpMg: [0.5, 50], cpN: [1, 60],
  bolus: [0.1, 5], inf: [1, 60], mult: [1, 4], cap: [1, 30], neoRed: [0, 90],
};

function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
function merge(a, b) {
  if (!isObj(a) || !isObj(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = isObj(a[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k];
  return out;
}
function strip(o) { // drop "_comment" style keys
  if (Array.isArray(o)) return o.map(strip);
  if (!isObj(o)) return o;
  const r = {};
  for (const k of Object.keys(o)) if (!k.startsWith("_")) r[k] = strip(o[k]);
  return r;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function loadConfig(orgId) {
  const dir = path.join(ROOT, "orgs", orgId);
  const file = path.join(dir, "config.json");
  if (!fs.existsSync(file)) throw new Error(`orgs/${orgId}/config.json not found`);
  const org = readJSON(file);
  const base = readJSON(path.join(ROOT, "src", "config.base.json"));
  const ops = { overrides: org.agentOverrides || {}, remove: org.removeAgents || [], add: org.addAgents || [] };
  delete org.agentOverrides; delete org.removeAgents; delete org.addAgents;
  let cfg = merge(base, org);
  // agent operations apply on top of whichever agent list is in force
  let agents = cfg.agents.map((a) => ({ ...a }));
  for (const id of ops.remove) {
    if (!agents.some((a) => a.id === id)) throw new Error(`removeAgents: unknown agent id "${id}"`);
    agents = agents.filter((a) => a.id !== id);
  }
  for (const id of Object.keys(ops.overrides)) {
    const a = agents.find((x) => x.id === id);
    if (!a) throw new Error(`agentOverrides: unknown agent id "${id}" (removed or misspelt?)`);
    Object.assign(a, ops.overrides[id]);
  }
  agents = agents.concat(ops.add.map((a) => ({ enabled: true, ...a })));
  cfg.agents = agents;
  cfg.org.id = cfg.org.id === "base" ? orgId : cfg.org.id;
  if (cfg.org.id !== orgId) throw new Error(`org.id "${cfg.org.id}" must match its folder name "${orgId}"`);
  return { cfg: strip(cfg), dir };
}

// folder names an organisation may not use: they would collide with repository folders or the default build
const RESERVED_IDS = ["src", "orgs", "scripts", "tests", "docs", "dist", "node_modules", "github", "assets", "android", "base"];

function validate(cfg) {
  const errs = [];
  const bad = (m) => errs.push(m);
  if (!/^[A-Za-z0-9_]+$/.test(cfg.storagePrefix || "")) bad("storagePrefix must be letters, digits or _");
  if (!/^[a-z0-9-]+$/.test(cfg.org.id)) bad("org.id must be lower-case letters, digits or -");
  if (RESERVED_IDS.includes(cfg.org.id)) bad(`org.id "${cfg.org.id}" is reserved`);
  if (!cfg.org.name) bad("org.name is required");
  if (!cfg.org.title) bad("org.title is required");
  if (cfg.org.shortName && !/^[A-Za-z0-9 &.-]{1,12}$/.test(cfg.org.shortName)) bad("org.shortName must be 1-12 letters, digits, spaces, & . or -");
  for (const k of ["primary", "primaryDark"])
    if (!/^#[0-9a-fA-F]{6}$/.test(cfg.theme[k] || "")) bad(`theme.${k} must be a #rrggbb colour`);
  const d = cfg.defaults;
  if (!LBW_FORMULAS.includes(d.lbw)) bad(`defaults.lbw must be one of ${LBW_FORMULAS}`);
  if (!LBW_FORMULAS.includes(d.lbwP)) bad(`defaults.lbwP must be one of ${LBW_FORMULAS}`);
  if (!CENTILES.includes(d.pc)) bad(`defaults.pc must be one of ${CENTILES}`);
  if (typeof d.blend !== "boolean") bad("defaults.blend must be true or false");
  for (const [k, [lo, hi]] of Object.entries(BOUNDS))
    if (typeof d[k] !== "number" || !isFinite(d[k]) || d[k] < lo || d[k] > hi) bad(`defaults.${k} must be a number from ${lo} to ${hi}`);
  const ids = new Set();
  if (!cfg.agents.length) bad("at least one agent is required");
  for (const a of cfg.agents) {
    const w = `agent "${a.id}"`;
    if (!a.id || !/^[A-Za-z0-9_]+$/.test(a.id)) bad(`${w}: id must be letters, digits or _`);
    if (ids.has(a.id)) bad(`${w}: duplicate id`);
    ids.add(a.id);
    if (!a.name) bad(`${w}: name is required`);
    if (!(typeof a.mgPerMl === "number" && a.mgPerMl > 0)) bad(`${w}: mgPerMl must be a number above 0 (e.g. 1% = 10)`);
    if (!(typeof a.maxMgPerKg === "number" && a.maxMgPerKg >= 0)) bad(`${w}: maxMgPerKg must be a number, 0 or more`);
    if (!a.group || typeof a.group !== "string") bad(`${w}: group is required (agents mix/dilute only within the same group; "pr" is locked out in neonates)`);
    if (typeof a.enabled !== "boolean") bad(`${w}: enabled must be true or false`);
  }
  if (cfg.agents.filter((a) => a.enabled).length < 2) bad("at least two agents must be enabled (dual-agent and dilution need two)");
  const L = cfg.last;
  if (!Array.isArray(L.enabled) || !L.enabled.length || L.enabled.some((x) => !LAST_GUIDELINES.includes(x)))
    bad(`last.enabled must be a non-empty list drawn from ${LAST_GUIDELINES}`);
  else if (!L.enabled.includes(L.default)) bad("last.default must be one of last.enabled");
  for (const g of LAST_GUIDELINES) {
    if (!L.captions[g]) bad(`last.captions.${g} is required`);
    if (!L.alt[g]) bad(`last.alt.${g} is required`);
  }
  for (const k of ["proteinBinding", "footer", "defaultLimits", "defaultLimitsShort", "neonate", "infant", "airwayGuideline", "disclaimer"])
    if (typeof cfg.text[k] !== "string" || !cfg.text[k].trim()) bad(`text.${k} is required`);
  return errs;
}

function imgData(rel, dir) {
  const cands = [path.resolve(dir, rel), path.resolve(ROOT, rel)];
  const f = cands.find((p) => fs.existsSync(p));
  if (!f) throw new Error(`image not found: ${rel}`);
  const ext = path.extname(f).toLowerCase();
  const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[ext];
  if (!mime) throw new Error(`unsupported image type: ${rel}`);
  const kb = fs.statSync(f).size / 1024;
  if (kb > 900) throw new Error(`image too large (${kb.toFixed(0)} KB, max 900): ${rel}`);
  return `data:${mime};base64,${fs.readFileSync(f).toString("base64")}`;
}

function build(orgId, outRoot) {
  const { cfg, dir } = loadConfig(orgId);
  const errs = validate(cfg);
  if (errs.length) throw new Error(`orgs/${orgId}/config.json is invalid:\n  - ` + errs.join("\n  - "));

  // contact line for the disclaimer
  const contact = cfg.org.contactName
    ? ` For feedback or questions please contact ${esc(cfg.org.contactName)}` +
      (cfg.org.contactEmail ? ` (<a href="mailto:${esc(cfg.org.contactEmail)}">${esc(cfg.org.contactEmail)}</a>)` : "")
    : "";
  cfg.text.disclaimer = cfg.text.disclaimer.replace("{contact}", contact);

  // sign-off is a record about the organisation, not part of the app: keep it out of the page and the hash
  const signoff = cfg.org.signoff || null;
  delete cfg.org.signoff;
  const hash = crypto.createHash("sha256").update(JSON.stringify(cfg)).digest("hex").slice(0, 8);
  const stamp = `Admix v${pkg.version} · ${cfg.org.id} · ${hash}`;
  cfg.build = { version: pkg.version, org: cfg.org.id, hash, stamp };

  const data = (n) => readJSON(path.join(ROOT, "src", "data", n));
  const imgs = {
    bmiGirls: imgData("src/assets/rcpch-bmi-girls.jpg", ROOT),
    bmiBoys: imgData("src/assets/rcpch-bmi-boys.jpg", ROOT),
    "last.aagbi": imgData(cfg.last.images.aagbi, dir),
    "last.asra": imgData(cfg.last.images.asra, dir),
  };
  // the images are inlined into the page; keep them out of the CFG object
  const cfgForPage = JSON.parse(JSON.stringify(cfg));
  delete cfgForPage.last.images;
  const safeJSON = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

  // the calculation engine is inlined unchanged; it must not be able to break out of its script tag or hold tokens
  const engine = read(path.join(ROOT, "src", "engine.js")).trim();
  if (/@@|<\/script|<!--/i.test(engine)) throw new Error("src/engine.js must not contain '@@', '</script' or '<!--'");
  let html = read(path.join(ROOT, "src", "template.html"));
  const get = (p) => p.split(".").reduce((o, k) => (o == null ? o : o[k]), cfg);
  html = html.replace(/@@([A-Za-z0-9_.:-]+)@@/g, (m, key) => {
    if (key === "config-script") return `<script>var CFG=${safeJSON(cfgForPage)};var SK=CFG.storagePrefix;</script>`;
    if (key === "stamp") return esc(stamp);
    if (key === "engine") return engine;
    if (key === "json:cen") return safeJSON(data("rcpch-bmi-centiles.json"));
    if (key === "json:cal") return safeJSON(data("rcpch-chart-calibration.json"));
    if (key.startsWith("img:")) {
      const v = imgs[key.slice(4)];
      if (!v) throw new Error(`unknown image token ${m}`);
      return v;
    }
    const v = get(key);
    if (typeof v !== "string") throw new Error(`template token ${m} has no string value in the config`);
    return key.startsWith("text.") ? v : esc(v);
  });
  const left = html.match(/@@[A-Za-z0-9_.:-]+@@/);
  if (left) throw new Error(`unreplaced token ${left[0]}`);

  const out = path.join(outRoot, cfg.org.id);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "index.html"), html);
  fs.writeFileSync(path.join(out, "build-info.json"), JSON.stringify({ ...cfg.build, signoff }, null, 1) + "\n");
  return { out, stamp, kb: Math.round(html.length / 1024), publish: cfg.org.publish !== false };
}

function main() {
  const a = process.argv.slice(2);
  const outRoot = path.join(ROOT, "dist");
  const orgs = fs.readdirSync(path.join(ROOT, "orgs"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  let todo;
  // --pages: build every organisation and publish it for GitHub Pages:
  //   default -> ./index.html,  every other org (unless org.publish is false) -> ./<id>/index.html
  const pages = a.includes("--pages");
  if (a.includes("--all") || a.includes("--check") || pages) todo = orgs;
  else if (a.includes("--org")) todo = [a[a.indexOf("--org") + 1]];
  else { console.error("usage: build.js --org <id> | --all | --check | --pages"); process.exit(2); }
  let failed = 0;
  for (const id of todo) {
    try {
      if (a.includes("--check")) {
        const { cfg } = loadConfig(id);
        const e = validate(cfg);
        if (e.length) throw new Error(`orgs/${id}/config.json is invalid:\n  - ` + e.join("\n  - "));
        console.log(`ok     ${id}`);
      } else {
        const r = build(id, outRoot);
        console.log(`built  ${id.padEnd(20)} ${String(r.kb).padStart(5)} KB  ${r.stamp}`);
        if (pages && id === "default") {
          fs.copyFileSync(path.join(r.out, "index.html"), path.join(ROOT, "index.html"));
          console.log("wrote  ./index.html");
        } else if (pages && r.publish) {
          fs.mkdirSync(path.join(ROOT, id), { recursive: true });
          fs.copyFileSync(path.join(r.out, "index.html"), path.join(ROOT, id, "index.html"));
          console.log(`wrote  ./${id}/index.html`);
        }
      }
    } catch (e) {
      failed++;
      console.error(`FAILED ${id}: ${e.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
if (require.main === module) main();
module.exports = { build, loadConfig, validate, RESERVED_IDS };

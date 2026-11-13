#!/usr/bin/env python3
"""Checks for the Excel request form: it matches the app defaults, and a filled form becomes a valid config."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import admix_form as F  # noqa: E402
from openpyxl import load_workbook  # noqa: E402

passed = failed = 0


def ok(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL", name, extra)


def values(path):
    wb = load_workbook(path, data_only=True)
    return {ws.title: [[c.value for c in row] for row in ws.iter_rows()] for ws in wb}


tmp = Path(tempfile.mkdtemp())
try:
    # 1. committed form is up to date with src/config.base.json
    F.make(tmp / "fresh.xlsx")
    ok("request form is up to date (run `npm run template`)", values(tmp / "fresh.xlsx") == values(F.DEFAULT_FORM))

    # 2. an untouched form (name + sign-off only) gives no overrides
    wb = load_workbook(F.DEFAULT_FORM)
    wb["1 Organisation"]["B3"] = "Test Trust"
    wb["1 Organisation"]["B8"] = "Yes"
    wb.save(tmp / "f1.xlsx")
    org_id, cfg, _ = F.read(tmp / "f1.xlsx")
    ok("untouched form -> only organisation block", list(cfg) == ["org"] and org_id == "test-trust", cfg)

    # 3. a missing sign-off is refused
    wb["1 Organisation"]["B8"] = "No"
    wb.save(tmp / "f_nosign.xlsx")
    try:
        F.read(tmp / "f_nosign.xlsx")
        ok("missing sign-off is refused", False)
    except SystemExit:
        ok("missing sign-off is refused", True)

    # 4. a changed form becomes the expected config, and the build accepts it
    wb = load_workbook(F.DEFAULT_FORM)
    o = wb["1 Organisation"]
    o["B3"], o["B4"], o["B5"], o["B7"], o["B8"] = "Form Test Trust", "Dr T", "t@example.invalid", "#0a7d5a", "Yes"
    a = wb["2 Anaesthetics"]
    rows = {a.cell(r, 1).value: r for r in range(5, 40) if a.cell(r, 1).value}
    a.cell(rows["1% Lidocaine (Plain)"], 3).value = 2.5
    a.cell(rows["1% Prilocaine"], 4).value = "Yes"
    for c in range(1, 5):
        a.cell(rows["0.75% Ropivacaine"], c).value = None
    free = max(rows.values()) + 1
    for c, v in enumerate(["0.5% Mepivacaine", 5, 4, "Yes"], start=1):
        a.cell(free, c).value = v
    s = wb["3 Settings"]
    for r in range(5, 25):
        lab = s.cell(r, 1).value
        if lab == "Airway lidocaine absolute maximum (mg)":
            s.cell(r, 2).value = 600
        if lab == "Lipid (LAST) guidelines to show":
            s.cell(r, 2).value = "ASRA only"
    wb["4 Wording"]["B5"] = "Local policy: see guideline 12."
    wb["5 Other requests"]["A4"] = "Please add a block table."
    wb.save(tmp / "f2.xlsx")
    org_id, cfg, notes = F.read(tmp / "f2.xlsx")
    ok("org id from name", org_id == "form-test-trust", org_id)
    ok("limit override", cfg.get("agentOverrides", {}).get("lp1") == {"maxMgPerKg": 2.5}, cfg.get("agentOverrides"))
    ok("drug switched on", cfg["agentOverrides"].get("p1") == {"enabled": True})
    ok("drug removed", cfg.get("removeAgents") == ["r75"], cfg.get("removeAgents"))
    ok("drug added with group", cfg["addAgents"][0]["name"] == "0.5% Mepivacaine" and cfg["addAgents"][0]["id"] == "mepivacaine", cfg["addAgents"])
    ok("setting changed", cfg["defaults"] == {"lidoMax": 600}, cfg.get("defaults"))
    ok("LAST ASRA only, default follows", cfg["last"] == {"enabled": ["asra"], "default": "asra"}, cfg.get("last"))
    ok("wording changed", cfg["text"] == {"footer": "Local policy: see guideline 12."}, cfg.get("text"))
    ok("free text captured", notes == "Please add a block table.")
    # the produced config must pass the real build
    d = ROOT / "orgs" / "form-test-trust"
    d.mkdir(parents=True, exist_ok=True)
    (d / "config.json").write_text(json.dumps(cfg))
    r = subprocess.run(["node", str(ROOT / "scripts" / "build.js"), "--org", "form-test-trust"], capture_output=True, text=True)
    ok("generated config builds", r.returncode == 0, r.stderr)
    shutil.rmtree(d, ignore_errors=True)
    shutil.rmtree(ROOT / "dist" / "form-test-trust", ignore_errors=True)
finally:
    shutil.rmtree(tmp, ignore_errors=True)
    shutil.rmtree(ROOT / "orgs" / "form-test-trust", ignore_errors=True)

print(f"form checks: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

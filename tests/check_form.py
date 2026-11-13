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


def row_of(ws, label, after=1):
    """First row at or after `after` whose column A is `label`."""
    for r in range(after, ws.max_row + 1):
        v = ws.cell(row=r, column=1).value
        if isinstance(v, str) and v.strip() == label:
            return r
    raise KeyError(label)


def sec(ws, i):
    return row_of(ws, F.SECTIONS[i])


tmp = Path(tempfile.mkdtemp())
try:
    # 1. committed form is up to date with src/config.base.json
    F.make(tmp / "fresh.xlsx")
    ok("request form is up to date (run `npm run template`)", values(tmp / "fresh.xlsx") == values(F.DEFAULT_FORM))

    # 2. an untouched form (name + sign-off only) gives no overrides
    wb = load_workbook(F.DEFAULT_FORM)
    ws = wb[F.SHEET]
    ws.cell(row=row_of(ws, "Organisation name"), column=2).value = "Test Trust"
    ws.cell(row=row_of(ws, "Clinical sign-off"), column=2).value = "Yes"
    wb.save(tmp / "f1.xlsx")
    org_id, cfg, _ = F.read(tmp / "f1.xlsx")
    ok("untouched form -> only organisation block", list(cfg) == ["org"] and org_id == "test-trust", cfg)

    # 3. a missing sign-off is refused
    ws.cell(row=row_of(ws, "Clinical sign-off"), column=2).value = "No"
    wb.save(tmp / "f_nosign.xlsx")
    try:
        F.read(tmp / "f_nosign.xlsx")
        ok("missing sign-off is refused", False)
    except SystemExit:
        ok("missing sign-off is refused", True)

    # 4. a changed form becomes the expected config, and the build accepts it
    wb = load_workbook(F.DEFAULT_FORM)
    ws = wb[F.SHEET]
    setv = lambda label, v, col=2, after=1: ws.cell(row=row_of(ws, label, after), column=col).__setattr__("value", v)
    setv("Organisation name", "Form Test Trust")
    setv("Contact name", "Dr T")
    setv("Contact email", "t@example.invalid")
    setv("Accent colour (hex, e.g. #0b6bcb)", "#0a7d5a")
    setv("Clinical sign-off", "Yes")
    s2, s3, s4, s5 = sec(ws, 1), sec(ws, 2), sec(ws, 3), sec(ws, 4)
    ws.cell(row=row_of(ws, "1% Lidocaine (Plain)", s2), column=3).value = 2.5
    ws.cell(row=row_of(ws, "1% Prilocaine", s2), column=4).value = "Yes"
    rr = row_of(ws, "0.75% Ropivacaine", s2)
    for c in range(1, 6):
        ws.cell(row=rr, column=c).value = None
    free = next(r for r in range(row_of(ws, "Name", s2) + 1, s3) if not ws.cell(row=r, column=1).value)
    for c, v in enumerate(["0.5% Mepivacaine", 5, 4, "Yes"], start=1):
        ws.cell(row=free, column=c).value = v
    setv("Airway lidocaine absolute maximum (mg)", 600, after=s3)
    setv("Lipid (LAST) guidelines to show", "ASRA only", after=s3)
    setv("Footer", "Local policy: see guideline 12.", after=s4)
    ws.cell(row=s5 + 2, column=1).value = "Please add a block table."
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
    # 5. short name -> id and title; wording is HTML-escaped
    wb = load_workbook(F.DEFAULT_FORM)
    ws = wb[F.SHEET]
    setv = lambda label, v, after=1: ws.cell(row=row_of(ws, label, after), column=2).__setattr__("value", v)
    setv("Organisation name", "North Central Intensive Care")
    setv("Short name or abbreviation (e.g. NCIC)", "NCIC")
    setv("Clinical sign-off", "Yes")
    setv("Footer", "<script>alert(1)</script> Tom & Jerry", after=sec(ws, 3))
    wb.save(tmp / "f3.xlsx")
    org_id, cfg, _ = F.read(tmp / "f3.xlsx")
    ok("short name makes the id and title", org_id == "ncic" and cfg["org"]["title"] == "NCIC - Local Anaesthetic Calculator" and cfg["org"]["shortName"] == "NCIC", cfg["org"])
    ok("wording is HTML-escaped", cfg["text"]["footer"] == "&lt;script&gt;alert(1)&lt;/script&gt; Tom &amp; Jerry", cfg["text"])

    # 6. the request handler (used by the GitHub automation)
    import handle_request as H  # noqa: E402
    ok("finds the attachment link in an issue", H.find_url("see ![x](https://github.com/user-attachments/files/123/Admix-request-form.xlsx) thanks") == "https://github.com/user-attachments/files/123/Admix-request-form.xlsx")
    ok("no link -> none", H.find_url("I forgot the file") is None)
    env = dict(__import__("os").environ, RESULT_FILE=str(tmp / "res.md"))

    def run_handler(path):
        return subprocess.run([sys.executable, str(ROOT / "scripts" / "handle_request.py"), "--file", str(path)], capture_output=True, text=True, env=env)

    r = run_handler(tmp / "f3.xlsx")
    ok("handler accepts a good form", r.returncode == 0 and "org=ncic" in r.stdout, r.stdout + r.stderr)
    ok("handler wrote config and notes", (ROOT / "orgs" / "ncic" / "config.json").exists() and (ROOT / "orgs" / "ncic" / "REQUEST-NOTES.md").exists())
    r2 = subprocess.run(["node", str(ROOT / "scripts" / "build.js"), "--org", "ncic"], capture_output=True, text=True)
    ok("handler output builds", r2.returncode == 0, r2.stderr)
    shutil.rmtree(ROOT / "orgs" / "ncic", ignore_errors=True)
    shutil.rmtree(ROOT / "dist" / "ncic", ignore_errors=True)
    r = run_handler(tmp / "f_nosign.xlsx")
    ok("handler rejects a form without sign-off, with a message", r.returncode == 2 and "sign-off" in (tmp / "res.md").read_text().lower(), (tmp / "res.md").read_text() if (tmp / "res.md").exists() else "")
    wb = load_workbook(F.DEFAULT_FORM)
    ws = wb[F.SHEET]
    ws.cell(row=row_of(ws, "Organisation name"), column=2).value = "default"
    ws.cell(row=row_of(ws, "Clinical sign-off"), column=2).value = "Yes"
    wb.save(tmp / "f_res.xlsx")
    r = run_handler(tmp / "f_res.xlsx")
    ok("handler refuses a reserved id", r.returncode == 2 and "reserved" in (tmp / "res.md").read_text(), r.stdout)
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "handle_request.py")], capture_output=True, text=True, env=dict(env, ISSUE_BODY="no file here"))
    ok("handler asks for the attachment when missing", r.returncode == 3 and "xlsx" in (tmp / "res.md").read_text())
finally:
    shutil.rmtree(tmp, ignore_errors=True)
    shutil.rmtree(ROOT / "orgs" / "form-test-trust", ignore_errors=True)
    shutil.rmtree(ROOT / "orgs" / "ncic", ignore_errors=True)
    shutil.rmtree(ROOT / "orgs" / "default-reserved", ignore_errors=True)

print(f"form checks: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

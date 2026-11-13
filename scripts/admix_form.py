#!/usr/bin/env python3
"""
The organisation request form (Excel).

  python3 scripts/admix_form.py make [out.xlsx]
      Write the blank form, pre-filled with the current defaults from src/config.base.json.
  python3 scripts/admix_form.py read <filled.xlsx> [--id my-trust]
      Turn a filled-in form into orgs/<id>/config.json (only the differences from the defaults)
      plus orgs/<id>/REQUEST-NOTES.md (the free-text requests). Prints any problems and exits 1.

Needs openpyxl (pip install openpyxl).
"""
import json
import re
import sys
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
BASE = json.loads((ROOT / "src" / "config.base.json").read_text(encoding="utf8"))
DEFAULT_FORM = ROOT / "Admix-request-form.xlsx"

LBW = {"jan": "Janmahasatian", "boer": "Boer", "james": "James", "hume": "Hume", "peters": "Peters"}
CENT = {"c91": "91st", "c98": "98th", "c996": "99.6th"}
LAST_SHOW = ["Both", "AAGBI only", "ASRA only"]
LAST_FIRST = {"aagbi": "AAGBI", "asra": "ASRA"}
EXTRA_ROWS = 8  # empty rows for new drugs


def plain(s):
    return re.sub(r"<[^>]*>", "", s)


def yn(b):
    return "Yes" if b else "No"


# (label, key path, kind, options)  -- label text is what the reader matches on
def settings_rows():
    d, last = BASE["defaults"], BASE["last"]
    return [
        ("Lean body weight formula", "defaults.lbw", "map", LBW, LBW[d["lbw"]]),
        ("Use lean body weight at or above BMI", "defaults.bmi", "num", None, d["bmi"]),
        ("Blend gradually from total to lean body weight", "defaults.blend", "yn", None, yn(d["blend"])),
        ("Children: lean body weight formula", "defaults.lbwP", "map", LBW, LBW[d["lbwP"]]),
        ("Children: obesity threshold (RCPCH BMI centile)", "defaults.pc", "map", CENT, CENT[d["pc"]]),
        ("Neonatal dose reduction (%) when age is 3 months or less", "defaults.neoRed", "num", None, d["neoRed"]),
        ("Airway lidocaine maximum (mg/kg lean body weight)", "defaults.lidoCap", "num", None, d["lidoCap"]),
        ("Airway lidocaine absolute maximum (mg)", "defaults.lidoMax", "num", None, d["lidoMax"]),
        ("Co-phenylcaine lidocaine per spray (mg)", "defaults.cpMg", "num", None, d["cpMg"]),
        ("Co-phenylcaine sprays assumed if not stated", "defaults.cpN", "num", None, d["cpN"]),
        ("Lipid (LAST) guidelines to show", "last.enabled", "show", LAST_SHOW, "Both"),
        ("Lipid (LAST) guideline shown first", "last.default", "map", LAST_FIRST, LAST_FIRST[last["default"]]),
        ("AAGBI bolus (ml/kg)", "defaults.bolus", "num", None, d["bolus"]),
        ("AAGBI infusion (ml/kg/h)", "defaults.inf", "num", None, d["inf"]),
        ("Maximum total lipid (ml/kg)", "defaults.cap", "num", None, d["cap"]),
    ]


def wording_rows():
    t = BASE["text"]
    return [
        ("Footer", "text.footer", plain(t["footer"])),
        ("Low protein binding line (patient box)", "text.proteinBinding", plain(t["proteinBinding"])),
        ("Neonate note", "text.neonate", plain(t["neonate"])),
        ("Infant note", "text.infant", plain(t["infant"])),
        ("Airway lidocaine guideline note (Expert settings)", "text.airwayGuideline", plain(t["airwayGuideline"])),
        ("Default limits note, short (Expert settings)", "text.defaultLimitsShort", plain(t["defaultLimitsShort"])),
        ("Default limits note, full (Expert settings)", "text.defaultLimits", plain(t["defaultLimits"])),
    ]


ORG_LABELS = ["Organisation name", "Contact name", "Contact email", "App name (shown in the title bar)",
              "Accent colour (hex, e.g. #0b6bcb)", "Clinical sign-off"]
SIGNOFF = "My organisation's clinical lead will check and sign off these doses and wording before the app is used with patients."

# ---------------------------------------------------------------- make
THIN = Side(style="thin", color="B0B7BF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
INPUT = PatternFill("solid", fgColor="FFF8DC")


def make(out):
    wb = Workbook()
    acc = BASE["theme"]["primary"].lstrip("#").upper()
    head = PatternFill("solid", fgColor=acc)
    hfont = Font(bold=True, color="FFFFFF")
    wrap = Alignment(wrap_text=True, vertical="top")

    def title(ws, text, sub=None):
        ws["A1"] = text
        ws["A1"].font = Font(bold=True, size=14)
        if sub:
            ws["A2"] = sub
            ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
            ws["A2"].font = Font(italic=True, color="555555")

    # --- Read me
    ws = wb.active
    ws.title = "Read me"
    title(ws, "Admix: request a version for your organisation")
    lines = [
        "Yellow cells are for you. They are already filled in with the current defaults, so only change what you need.",
        "1. Organisation: who you are and who to contact.",
        "2. Anaesthetics: change maximum doses, switch drugs on or off (Yes/No), delete rows you do not want, add new drugs in the empty rows.",
        "3. Settings: calculation and lipid (LAST) settings.",
        "4. Wording: the sentences shown in the app.",
        "5. Other requests: anything else, in your own words.",
        "Then save the file and email it to Dr George Lui (george.lui@nhs.net), or attach it to a GitHub request.",
        "",
        "Admix is decision support only. Your organisation must check and sign off its own doses and guidelines before use with patients.",
    ]
    for i, l in enumerate(lines, start=3):
        ws.cell(row=i, column=1, value=l).alignment = Alignment(wrap_text=True, vertical="top")
    ws.column_dimensions["A"].width = 110

    # --- Organisation
    ws = wb.create_sheet("1 Organisation")
    title(ws, "1. Your organisation")
    ws.append([])
    vals = ["", "", "", BASE["org"]["title"], BASE["theme"]["primary"], "No"]
    for i, (lab, v) in enumerate(zip(ORG_LABELS, vals), start=3):
        ws.cell(row=i, column=1, value=lab).font = Font(bold=True)
        c = ws.cell(row=i, column=2, value=v)
        c.fill, c.border = INPUT, BOX
    ws["C8"] = SIGNOFF
    ws["C8"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[8].height = 45
    dv = DataValidation(type="list", formula1='"Yes,No"', allow_blank=False)
    dv.error, dv.errorTitle = "Choose Yes or No", "Clinical sign-off"
    ws.add_data_validation(dv)
    dv.add("B8")
    ws["A10"] = "Clinical sign-off: choose Yes to confirm the statement next to it."
    ws["A10"].font = Font(italic=True, color="555555")
    ws.column_dimensions["A"].width = 38
    ws.column_dimensions["B"].width = 44
    ws.column_dimensions["C"].width = 60

    # --- Anaesthetics
    ws = wb.create_sheet("2 Anaesthetics")
    title(ws, "2. Local anaesthetics and maximum doses")
    ws["A2"] = ("Edit values, delete the contents of rows you do not want, or add new drugs in the empty rows at the bottom. "
                "mg per ml: 1% = 10, 0.5% = 5. Prilocaine and chloroprocaine start switched off.")
    ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells("A2:E2")
    ws.row_dimensions[2].height = 45
    for j, h in enumerate(["Name", "mg per ml", "Maximum mg/kg", "In use?", "Notes (optional)"], start=1):
        c = ws.cell(row=4, column=j, value=h)
        c.fill, c.font, c.border = head, hfont, BOX
    agents = BASE["agents"]
    for i, a in enumerate(agents, start=5):
        for j, v in enumerate([a["name"], a["mgPerMl"], a["maxMgPerKg"], yn(a["enabled"]), ""], start=1):
            c = ws.cell(row=i, column=j, value=v)
            c.fill, c.border = INPUT, BOX
    last_row = 4 + len(agents) + EXTRA_ROWS
    for i in range(5 + len(agents), last_row + 1):
        for j in range(1, 6):
            c = ws.cell(row=i, column=j)
            c.fill, c.border = INPUT, BOX
    dv = DataValidation(type="list", formula1='"Yes,No"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"D5:D{last_row}")
    dn = DataValidation(type="decimal", operator="greaterThan", formula1="0", allow_blank=True)
    dn.error = "Enter a number above 0"
    ws.add_data_validation(dn)
    dn.add(f"B5:B{last_row}")
    dm = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True)
    dm.error = "Enter a number, 0 or more"
    ws.add_data_validation(dm)
    dm.add(f"C5:C{last_row}")
    for col, w in zip("ABCDE", [44, 12, 16, 10, 40]):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "A5"

    # --- Settings
    ws = wb.create_sheet("3 Settings")
    title(ws, "3. Calculation and lipid (LAST) settings")
    ws["A2"] = "Change any value in the yellow column. Leave a value as it is to keep the default."
    for j, h in enumerate(["Setting", "Your value", "Default", "Choices"], start=1):
        c = ws.cell(row=4, column=j, value=h)
        c.fill, c.font, c.border = head, hfont, BOX
    for i, (lab, _key, kind, opts, dflt) in enumerate(settings_rows(), start=5):
        ws.cell(row=i, column=1, value=lab).border = BOX
        c = ws.cell(row=i, column=2, value=dflt)
        c.fill, c.border = INPUT, BOX
        ws.cell(row=i, column=3, value=dflt).border = BOX
        choices = None
        if kind == "map":
            choices = list(opts.values())
        elif kind == "show":
            choices = list(opts)
        elif kind == "yn":
            choices = ["Yes", "No"]
        ws.cell(row=i, column=4, value=", ".join(choices) if choices else "a number").border = BOX
        if choices:
            dv = DataValidation(type="list", formula1='"' + ",".join(choices) + '"', allow_blank=False)
            ws.add_data_validation(dv)
            dv.add(f"B{i}")
    for col, w in zip("ABCD", [60, 18, 18, 48]):
        ws.column_dimensions[col].width = w

    # --- Wording
    ws = wb.create_sheet("4 Wording")
    title(ws, "4. Wording shown in the app")
    ws["A2"] = "Edit the sentences to match your local policy."
    for j, h in enumerate(["Where it appears", "Your wording"], start=1):
        c = ws.cell(row=4, column=j, value=h)
        c.fill, c.font, c.border = head, hfont, BOX
    for i, (lab, _key, txt) in enumerate(wording_rows(), start=5):
        a = ws.cell(row=i, column=1, value=lab)
        a.alignment, a.border = wrap, BOX
        c = ws.cell(row=i, column=2, value=txt)
        c.fill, c.border, c.alignment = INPUT, BOX, wrap
        ws.row_dimensions[i].height = 62
    ws.column_dimensions["A"].width = 36
    ws.column_dimensions["B"].width = 100

    # --- Other requests
    ws = wb.create_sheet("5 Other requests")
    title(ws, "5. Anything else?")
    ws["A2"] = "Write any other request here: extra features, another guideline, different layout, questions. Free text."
    ws.merge_cells("A4:H30")
    ws["A4"].fill, ws["A4"].border = INPUT, BOX
    ws["A4"].alignment = Alignment(wrap_text=True, vertical="top")
    for col in "ABCDEFGH":
        ws.column_dimensions[col].width = 16

    wb.save(out)


# ---------------------------------------------------------------- read
def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def infer_group(name):
    n = name.lower()
    if re.search(r"lido|ligno", n):
        return "lA" if re.search(r"adren|epineph", n) else "lP"
    for pat, g in [(r"bupi|levobup", "bu"), (r"ropiv", "ro"), (r"prilo", "pr"), (r"chloroproc", "ch")]:
        if re.search(pat, n):
            return g
    return "x" + (slug(re.sub(r"^[\d.]+%?\s*", "", n)).split("-")[0] or "new")[:8]


def lighten(hex6, f=0.35):
    r, g, b = (int(hex6[i:i + 2], 16) for i in (0, 2, 4))
    r, g, b = (round(c + (255 - c) * f) for c in (r, g, b))
    return "#%02x%02x%02x" % (r, g, b)


def sval(ws, r, c=2):
    v = ws.cell(row=r, column=c).value
    return v.strip() if isinstance(v, str) else v


def find_rows(ws, labels, first=3):
    """label -> row number, matching column A text."""
    out = {}
    for r in range(first, ws.max_row + 1):
        v = ws.cell(row=r, column=1).value
        if isinstance(v, str) and v.strip() in labels:
            out[v.strip()] = r
    return out


def num(v, what, errs):
    try:
        x = float(v)
        return int(x) if x == int(x) else x
    except (TypeError, ValueError):
        errs.append(f"{what}: '{v}' is not a number")
        return None


def read(path, org_id=None):
    errs = []
    wb = load_workbook(path, data_only=True)
    need = ["1 Organisation", "2 Anaesthetics", "3 Settings", "4 Wording", "5 Other requests"]
    for n in need:
        if n not in wb.sheetnames:
            raise SystemExit(f"sheet '{n}' is missing: use the original form")
    cfg = {}

    # organisation
    ws = wb["1 Organisation"]
    rows = find_rows(ws, ORG_LABELS)
    g = lambda lab: sval(ws, rows[lab]) if lab in rows else None
    name = g("Organisation name")
    if not name:
        errs.append("Organisation name is empty")
    org_id = org_id or slug(name or "")
    if not org_id:
        errs.append("could not make an organisation id (give --id)")
    title_cell = g("App name (shown in the title bar)") or BASE["org"]["title"]
    if title_cell == BASE["org"]["title"] and name:
        title_cell = f"{name} - Local Anaesthetic Calculator"
    cfg["org"] = {"id": org_id, "name": name or "", "title": title_cell,
                  "contactName": g("Contact name") or "", "contactEmail": g("Contact email") or ""}
    colour = (g("Accent colour (hex, e.g. #0b6bcb)") or "").lower()
    if colour and colour != BASE["theme"]["primary"].lower():
        if re.fullmatch(r"#[0-9a-f]{6}", colour):
            cfg["theme"] = {"primary": colour, "primaryDark": lighten(colour[1:])}
        else:
            errs.append(f"Accent colour '{colour}' must look like #0b6bcb")
    if (g("Clinical sign-off") or "").lower() != "yes":
        errs.append("Clinical sign-off is not 'Yes' (the organisation must confirm its clinical lead will sign off)")

    # anaesthetics
    ws = wb["2 Anaesthetics"]
    base_by_name = {a["name"].strip().lower(): a for a in BASE["agents"]}
    seen, overrides, add = set(), {}, []
    used_ids = {a["id"] for a in BASE["agents"]}
    r = 5
    while r <= ws.max_row:
        nm = sval(ws, r, 1)
        if nm:
            mg, mk, use = sval(ws, r, 2), sval(ws, r, 3), (sval(ws, r, 4) or "").lower()
            if use not in ("yes", "no"):
                errs.append(f"Anaesthetics row {r} ({nm}): 'In use?' must be Yes or No")
            mgv, mkv = num(mg, f"Anaesthetics row {r} ({nm}) mg per ml", errs), num(mk, f"Anaesthetics row {r} ({nm}) maximum mg/kg", errs)
            if mgv is not None and mgv <= 0:
                errs.append(f"Anaesthetics row {r} ({nm}): mg per ml must be above 0")
            if mkv is not None and mkv < 0:
                errs.append(f"Anaesthetics row {r} ({nm}): maximum mg/kg cannot be negative")
            key = nm.lower()
            if key in seen:
                errs.append(f"Anaesthetics row {r}: '{nm}' is listed twice")
            seen.add(key)
            if mgv is not None and mkv is not None and use in ("yes", "no"):
                b = base_by_name.get(key)
                if b:
                    diff = {}
                    if mgv != b["mgPerMl"]:
                        diff["mgPerMl"] = mgv
                    if mkv != b["maxMgPerKg"]:
                        diff["maxMgPerKg"] = mkv
                    if (use == "yes") != b["enabled"]:
                        diff["enabled"] = use == "yes"
                    if diff:
                        overrides[b["id"]] = diff
                else:
                    base_id = slug(re.sub(r"^[\d.]+\s*%?\s*", "", nm)).replace("-", "_")[:20] or "drug"
                    i, nid = 1, base_id
                    while nid in used_ids:
                        i += 1
                        nid = f"{base_id}{i}"
                    used_ids.add(nid)
                    add.append({"id": nid, "name": nm, "mgPerMl": mgv, "maxMgPerKg": mkv,
                                "group": infer_group(nm), "enabled": use == "yes"})
        r += 1
    removed = [a["id"] for a in BASE["agents"] if a["name"].strip().lower() not in seen]
    if removed:
        cfg["removeAgents"] = removed
    if overrides:
        cfg["agentOverrides"] = overrides
    if add:
        cfg["addAgents"] = add

    # settings
    ws = wb["3 Settings"]
    spec = {lab: (key, kind, opts, dflt) for lab, key, kind, opts, dflt in settings_rows()}
    rows = find_rows(ws, spec)
    defaults, last = {}, {}
    for lab, (key, kind, opts, dflt) in spec.items():
        if lab not in rows:
            errs.append(f"Settings: row '{lab}' is missing")
            continue
        v = sval(ws, rows[lab])
        if v in (None, ""):
            continue
        sect, k = key.split(".")
        out = None
        if kind == "num":
            out = num(v, f"Settings '{lab}'", errs)
            if out is not None and out == BASE[sect][k]:
                out = None
        elif kind == "yn":
            if str(v).lower() not in ("yes", "no"):
                errs.append(f"Settings '{lab}': choose Yes or No")
            else:
                out = str(v).lower() == "yes"
                out = None if out == BASE[sect][k] else out
        elif kind == "map":
            inv = {vv.lower(): kk for kk, vv in opts.items()}
            kk = inv.get(str(v).lower())
            if kk is None:
                errs.append(f"Settings '{lab}': '{v}' is not one of {', '.join(opts.values())}")
            else:
                out = None if kk == BASE[sect][k] else kk
        elif kind == "show":
            m = {"both": ["aagbi", "asra"], "aagbi only": ["aagbi"], "asra only": ["asra"]}.get(str(v).lower())
            if m is None:
                errs.append(f"Settings '{lab}': choose Both, AAGBI only or ASRA only")
            elif m != BASE["last"]["enabled"]:
                last["enabled"] = m
            continue
        if out is not None:
            (defaults if sect == "defaults" else last)[k] = out
    if defaults:
        cfg["defaults"] = defaults
    if "enabled" in last and "default" not in last and BASE["last"]["default"] not in last["enabled"]:
        last["default"] = last["enabled"][0]
    if "enabled" in last and "default" in last and last["default"] not in last["enabled"]:
        errs.append("Settings: the guideline shown first must be one of the guidelines to show")
    if last:
        cfg["last"] = last

    # wording
    ws = wb["4 Wording"]
    text = {}
    for lab, key, dflt in wording_rows():
        rr = find_rows(ws, [lab]).get(lab)
        if rr is None:
            errs.append(f"Wording: row '{lab}' is missing")
            continue
        v = sval(ws, rr)
        if v and v != dflt:
            text[key.split(".")[1]] = v
    if text:
        cfg["text"] = text

    notes = ws_notes = wb["5 Other requests"]["A4"].value
    if errs:
        print("Problems in the form:", file=sys.stderr)
        for e in errs:
            print("  - " + e, file=sys.stderr)
        raise SystemExit(1)
    return org_id, cfg, (notes or "").strip()


def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("make", "read"):
        raise SystemExit(__doc__)
    if a[0] == "make":
        out = Path(a[1]) if len(a) > 1 else DEFAULT_FORM
        make(out)
        print(f"wrote {out}")
    else:
        if len(a) < 2:
            raise SystemExit("usage: admix_form.py read <filled.xlsx> [--id my-trust]")
        oid = a[a.index("--id") + 1] if "--id" in a else None
        org_id, cfg, notes = read(a[1], oid)
        d = ROOT / "orgs" / org_id
        d.mkdir(parents=True, exist_ok=True)
        (d / "config.json").write_text(json.dumps(cfg, indent=1, ensure_ascii=False) + "\n", encoding="utf8")
        (d / "REQUEST-NOTES.md").write_text(f"# Request notes: {cfg['org']['name']}\n\n{notes or '(none)'}\n", encoding="utf8")
        print(f"wrote orgs/{org_id}/config.json and REQUEST-NOTES.md")
        if notes:
            print("\nFree-text requests:\n" + notes)


if __name__ == "__main__":
    main()

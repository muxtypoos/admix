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
import html
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


ORG_LABELS = ["Organisation name", "Short name or abbreviation (e.g. NCIC)", "Contact name", "Contact email", "App name (shown in the title bar)",
              "Accent colour (hex, e.g. #0b6bcb)", "Clinical sign-off"]
SIGNOFF = "My organisation's clinical lead will check and sign off these doses and wording before the app is used with patients."

# ---------------------------------------------------------------- make
THIN = Side(style="thin", color="B0B7BF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
INPUT = PatternFill("solid", fgColor="FFF8DC")
SHEET = "Request form"
SECTIONS = ["1. Your organisation", "2. Local anaesthetics and maximum doses",
            "3. Calculation and lipid (LAST) settings", "4. Wording shown in the app", "5. Anything else?"]


def make(out):
    wb = Workbook()
    ws = wb.active
    ws.title = SHEET
    acc = BASE["theme"]["primary"].lstrip("#").upper()
    bar = PatternFill("solid", fgColor=acc)
    barfont = Font(bold=True, color="FFFFFF", size=12)
    sub = PatternFill("solid", fgColor="DDE6F0")
    wrapt = Alignment(wrap_text=True, vertical="top")
    for col, w in zip("ABCDE", [58, 16, 16, 14, 44]):
        ws.column_dimensions[col].width = w
    r = 1
    ws.cell(row=r, column=1, value="Admix: request a version for your organisation").font = Font(bold=True, size=15)
    r += 1
    intro = ("Yellow cells are for you. They are already filled in with the current defaults, so only change what you need. "
             "Save the file and email it to Dr George Lui (george.lui@nhs.net). Admix is decision support only: your organisation "
             "must check and sign off its own doses and guidelines before use with patients.")
    ws.cell(row=r, column=1, value=intro).alignment = wrapt
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
    ws.row_dimensions[r].height = 48
    r += 2

    def section(title_, note=None):
        nonlocal r
        for c in range(1, 6):
            ws.cell(row=r, column=c).fill = bar
        ws.cell(row=r, column=1, value=title_).font = barfont
        r += 1
        if note:
            ws.cell(row=r, column=1, value=note).alignment = wrapt
            ws.cell(row=r, column=1).font = Font(italic=True, color="555555")
            ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
            ws.row_dimensions[r].height = 32
            r += 1

    def wide_input(row, value, height=None):
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=5)
        c = ws.cell(row=row, column=2, value=value)
        c.fill, c.alignment = INPUT, wrapt
        for cc in range(2, 6):
            ws.cell(row=row, column=cc).border = BOX
            ws.cell(row=row, column=cc).fill = INPUT
        if height:
            ws.row_dimensions[row].height = height

    def dropdown(cells, options, allow_blank=False):
        dv = DataValidation(type="list", formula1='"' + ",".join(options) + '"', allow_blank=allow_blank)
        ws.add_data_validation(dv)
        dv.add(cells)

    # 1 organisation
    section(SECTIONS[0])
    vals = ["", "", "", "", BASE["org"]["title"], BASE["theme"]["primary"], "No"]
    for lab, v in zip(ORG_LABELS, vals):
        ws.cell(row=r, column=1, value=lab).font = Font(bold=True)
        wide_input(r, v)
        if lab == "Clinical sign-off":
            ws.cell(row=r + 1, column=1, value="Choose Yes to confirm: " + SIGNOFF).alignment = wrapt
            ws.cell(row=r + 1, column=1).font = Font(italic=True, color="555555")
            ws.merge_cells(start_row=r + 1, start_column=1, end_row=r + 1, end_column=5)
            ws.row_dimensions[r + 1].height = 32
            dropdown(f"B{r}", ["Yes", "No"])
            r += 1
        r += 1
    r += 1

    # 2 anaesthetics
    section(SECTIONS[1], "Edit values, clear the row of any drug you do not want, or add new drugs in the empty rows at the bottom. "
                         "mg per ml: 1% = 10, 0.5% = 5. Prilocaine and chloroprocaine start switched off.")
    for j_, h in enumerate(["Name", "mg per ml", "Maximum mg/kg", "In use?", "Notes (optional)"], start=1):
        c = ws.cell(row=r, column=j_, value=h)
        c.fill, c.font, c.border = sub, Font(bold=True), BOX
    r += 1
    first = r
    agents = BASE["agents"]
    for a in agents:
        for j_, v in enumerate([a["name"], a["mgPerMl"], a["maxMgPerKg"], yn(a["enabled"]), ""], start=1):
            c = ws.cell(row=r, column=j_, value=v)
            c.fill, c.border = INPUT, BOX
        r += 1
    for _ in range(EXTRA_ROWS):
        for j_ in range(1, 6):
            c = ws.cell(row=r, column=j_)
            c.fill, c.border = INPUT, BOX
        r += 1
    last = r - 1
    dropdown(f"D{first}:D{last}", ["Yes", "No"], allow_blank=True)
    dn = DataValidation(type="decimal", operator="greaterThan", formula1="0", allow_blank=True)
    dn.error = "Enter a number above 0"
    ws.add_data_validation(dn)
    dn.add(f"B{first}:B{last}")
    dm = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True)
    dm.error = "Enter a number, 0 or more"
    ws.add_data_validation(dm)
    dm.add(f"C{first}:C{last}")
    r += 1

    # 3 settings
    section(SECTIONS[2], "Change any value in the yellow column. Leave a value as it is to keep the default.")
    for j_, h in enumerate(["Setting", "Your value", "Default", "Choices"], start=1):
        c = ws.cell(row=r, column=j_, value=h)
        c.fill, c.font, c.border = sub, Font(bold=True), BOX
    r += 1
    for lab, _key, kind, opts, dflt in settings_rows():
        ws.cell(row=r, column=1, value=lab).border = BOX
        c = ws.cell(row=r, column=2, value=dflt)
        c.fill, c.border = INPUT, BOX
        ws.cell(row=r, column=3, value=dflt).border = BOX
        choices = list(opts.values()) if kind == "map" else list(opts) if kind == "show" else ["Yes", "No"] if kind == "yn" else None
        ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=5)
        ws.cell(row=r, column=4, value=", ".join(choices) if choices else "a number").border = BOX
        if choices:
            dropdown(f"B{r}", choices)
        r += 1
    r += 1

    # 4 wording
    section(SECTIONS[3], "Edit the sentences to match your local policy.")
    for lab, _key, txt in wording_rows():
        a = ws.cell(row=r, column=1, value=lab)
        a.alignment, a.border = wrapt, BOX
        wide_input(r, txt, 62)
        r += 1
    r += 1

    # 5 other
    section(SECTIONS[4], "Write any other request here: extra features, another guideline, different layout, questions. Free text.")
    ws.merge_cells(start_row=r, start_column=1, end_row=r + 11, end_column=5)
    c = ws.cell(row=r, column=1)
    c.fill, c.alignment = INPUT, wrapt
    for rr in range(r, r + 12):
        for cc in range(1, 6):
            ws.cell(row=rr, column=cc).border = BOX
            ws.cell(row=rr, column=cc).fill = INPUT

    ws.page_setup.orientation = "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
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


def section_rows(ws):
    """section title -> row number."""
    out = {}
    for r in range(1, ws.max_row + 1):
        v = ws.cell(row=r, column=1).value
        if isinstance(v, str) and v.strip() in SECTIONS:
            out[v.strip()] = r
    return out


def find_rows(ws, labels, first=1, last=None):
    """label -> row number, matching column A text, between two rows."""
    out = {}
    for r in range(first, (last or ws.max_row + 1)):
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
    if SHEET not in wb.sheetnames:
        raise SystemExit(f"sheet '{SHEET}' is missing: use the original form")
    W = wb[SHEET]
    srow = section_rows(W)
    for t in SECTIONS:
        if t not in srow:
            raise SystemExit(f"section '{t}' is missing: use the original form")
    cfg = {}

    # organisation
    ws = W
    rows = find_rows(ws, ORG_LABELS, srow[SECTIONS[0]], srow[SECTIONS[1]])
    g = lambda lab: sval(ws, rows[lab]) if lab in rows else None
    name = g("Organisation name")
    if not name:
        errs.append("Organisation name is empty")
    short = g("Short name or abbreviation (e.g. NCIC)") or ""
    if short and not re.fullmatch(r"[A-Za-z0-9 &.-]{1,12}", short):
        errs.append("Short name must be 1-12 letters, digits, spaces, & . or -")
    org_id = org_id or slug(short or name or "")
    if not org_id:
        errs.append("could not make an organisation id (give --id)")
    title_cell = g("App name (shown in the title bar)") or BASE["org"]["title"]
    if title_cell == BASE["org"]["title"] and name:
        title_cell = f"{short or name} - Local Anaesthetic Calculator"
    cfg["org"] = {"id": org_id, "name": name or "", "shortName": short, "title": title_cell,
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
    ws = W
    base_by_name = {a["name"].strip().lower(): a for a in BASE["agents"]}
    seen, overrides, add = set(), {}, []
    used_ids = {a["id"] for a in BASE["agents"]}
    r = srow[SECTIONS[1]] + 1
    while r < srow[SECTIONS[2]] and sval(ws, r, 1) != "Name":
        r += 1
    r += 1
    while r < srow[SECTIONS[2]]:
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
    ws = W
    spec = {lab: (key, kind, opts, dflt) for lab, key, kind, opts, dflt in settings_rows()}
    rows = find_rows(ws, spec, srow[SECTIONS[2]], srow[SECTIONS[3]])
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
    ws = W
    text = {}
    for lab, key, dflt in wording_rows():
        rr = find_rows(ws, [lab], srow[SECTIONS[3]], srow[SECTIONS[4]]).get(lab)
        if rr is None:
            errs.append(f"Wording: row '{lab}' is missing")
            continue
        v = sval(ws, rr)
        if v and v != dflt:
            text[key.split(".")[1]] = html.escape(str(v), quote=False)
    if text:
        cfg["text"] = text

    nr = srow[SECTIONS[4]] + 2
    notes = W.cell(row=nr, column=1).value
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

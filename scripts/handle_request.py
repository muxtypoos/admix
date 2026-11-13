#!/usr/bin/env python3
"""
Turn a submitted request (a GitHub issue with the filled-in Excel form attached) into an organisation config.
Used by .github/workflows/organisation-request.yml; can also be run by hand:

  python3 scripts/handle_request.py --file filled.xlsx            use a local file
  ISSUE_BODY="..." python3 scripts/handle_request.py              find the .xlsx link in the issue text and download it

Writes orgs/<id>/config.json and REQUEST-NOTES.md, and /tmp/request-result.md (the message to post back).
Exit codes: 0 ok, 2 the form has problems (message explains), 3 no usable attachment.
Prints  org=<id>  on success (the workflow reads it).
"""
import contextlib
import io
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import admix_form as F  # noqa: E402

RESERVED = {"default", "example-hospital"}
MAX_BYTES = 2_000_000
URL_RE = re.compile(r"https://github\.com/[^\s)\]\"'<>]+?\.xlsx", re.I)
RESULT = Path(os.environ.get("RESULT_FILE", "/tmp/request-result.md"))


def find_url(body):
    m = URL_RE.search(body or "")
    return m.group(0) if m else None


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "admix-request-bot"})
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        req.add_header("Authorization", f"Bearer {tok}")
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("the file is larger than 2 MB")
    if data[:2] != b"PK":
        raise ValueError("the downloaded file is not an Excel workbook")
    Path(dest).write_bytes(data)


def summary(cfg):
    lines = [f"**{cfg['org']['name']}** (`{cfg['org']['id']}`)"]
    if cfg.get("removeAgents"):
        lines.append("- Removed drugs: " + ", ".join(cfg["removeAgents"]))
    for k, v in (cfg.get("agentOverrides") or {}).items():
        lines.append(f"- Changed `{k}`: " + ", ".join(f"{a} = {b}" for a, b in v.items()))
    for a in cfg.get("addAgents") or []:
        lines.append(f"- Added **{a['name']}** ({a['mgPerMl']} mg/ml, max {a['maxMgPerKg']} mg/kg, mixing group `{a['group']}`: please check)")
    for k, v in (cfg.get("defaults") or {}).items():
        lines.append(f"- Setting `{k}` = {v}")
    if cfg.get("last"):
        lines.append(f"- Lipid guidelines: {cfg['last']}")
    for k in (cfg.get("text") or {}):
        lines.append(f"- Wording changed: `{k}`")
    if cfg.get("theme"):
        lines.append(f"- Accent colour {cfg['theme']['primary']}")
    if len(lines) == 1:
        lines.append("- No changes from the defaults.")
    return "\n".join(lines)


def main():
    a = sys.argv[1:]
    path = Path("/tmp/request-form.xlsx")
    if "--file" in a:
        path = Path(a[a.index("--file") + 1])
    else:
        url = find_url(os.environ.get("ISSUE_BODY", ""))
        if not url:
            RESULT.write_text("I could not find an attached `.xlsx` file in this request. Please drag your completed **Admix-request-form.xlsx** into the box (or email it to Dr George Lui) and edit this issue.\n")
            return 3
        try:
            download(url, path)
        except Exception as e:  # noqa: BLE001
            RESULT.write_text(f"I could not download the attached file ({e}). Please check it is the Excel form, re-attach it and edit this issue.\n")
            return 3
    err = io.StringIO()
    try:
        with contextlib.redirect_stderr(err):
            org_id, cfg, notes = F.read(path)
    except SystemExit as e:
        msg = err.getvalue().strip() or str(e)
        RESULT.write_text("The form has some problems, so I have not created a version yet:\n\n```\n" + msg + "\n```\n\nPlease fix them in the Excel file, re-attach it and edit this issue; I will try again.\n")
        return 2
    except Exception as e:  # noqa: BLE001
        RESULT.write_text(f"I could not read this file ({type(e).__name__}). Please use the original Admix-request-form.xlsx.\n")
        return 2
    if org_id in RESERVED:
        RESULT.write_text(f"The organisation id `{org_id}` is reserved. Please use a different short name or organisation name.\n")
        return 2
    d = Path(__file__).resolve().parent.parent / "orgs" / org_id
    d.mkdir(parents=True, exist_ok=True)
    (d / "config.json").write_text(json.dumps(cfg, indent=1, ensure_ascii=False) + "\n", encoding="utf8")
    (d / "REQUEST-NOTES.md").write_text(f"# Request notes: {cfg['org']['name']}\n\n{notes or '(none)'}\n", encoding="utf8")
    (d / "SIGNOFF.md").write_text(
        f"# {cfg['org']['name']}: clinical sign-off\n\n| Config version (tag) | Reviewed by (name, role) | Date | Notes |\n|---|---|---|---|\n|  |  |  | Requested via issue form; not yet reviewed |\n",
        encoding="utf8")
    RESULT.write_text(summary(cfg) + ("\n\n**Free-text requests (need a person):**\n\n" + "\n".join("> " + l for l in notes.splitlines()) if notes else "") + "\n")
    print(f"org={org_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

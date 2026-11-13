# Changelog

All notable changes to the core app and to each organisation's config. The version number appears in the app footer.
Format: [Keep a Changelog](https://keepachangelog.com), versions follow [SemVer](https://semver.org)
(major = dosing logic or limits change, minor = new feature, patch = fix or wording). Versions below 1.0.0 are pre-release: not yet signed off for clinical use.

## [Unreleased]
### Added
- Request form for organisations: one-page Excel workbook (`Admix-request-form.xlsx`), pre-filled with the current default anaesthetics, maximum doses, settings and wording, with a free-text box at the end. Generated from `src/config.base.json` and checked by the tests.
- Hands-off requests: submitting the Excel form as a GitHub issue builds the organisation, runs the tests and opens a pull request for review (`.github/workflows/organisation-request.yml`, `scripts/handle_request.py`).
- Short name or abbreviation (e.g. NCIC) on the form, now required: it becomes the organisation's online link (`<site>/ncic/`) and its app name.
- Clinical sign-off moved to the end of the form (section 6): Yes, plus the name and email of the person confirming. This is recorded in the organisation's config and build info, so `SIGNOFF.md` files are no longer used.
- Every published organisation is built to `<id>/index.html` for GitHub Pages (`npm run pages`); `org.publish: false` opts out.
- `scripts/admix_form.py read` turns a returned Excel form into an organisation config (differences from the defaults only) plus request notes.
### Changed
- Every "over the maximum" message (airway lidocaine, chart, plan box, dual-agent, dilution) now also shows how many % over the maximum the dose is.
- App name is fixed as `Admix - Local Anaesthetic Calculator - <short name>`; it can no longer be edited on the form.
- Accent colour removed from the form (still available to developers in `theme`).
- README rewritten for users; developer notes moved to `docs/MAINTAINING.md`.

## [0.3.0-beta] - 2026-11-13
### Added
- Core app split from a single HTML file into `src/` (core) plus one `config.json` per organisation (`orgs/`).
- Build tool (`scripts/build.js`) producing one self-contained HTML file per organisation, with config validation.
- App footer shows `Admix v<version> · <org> · <config hash>`, which is also included in the copied summary.
- Regression tests covering the core and each organisation's config.
- `npm run pages` writes the default organisation's build to `./index.html`, which GitHub Pages serves; CI fails if it is stale.
- Organisations: `default` (behaviour identical to the pre-split app) and `example-hospital` (illustrative only).

### Fixed
- Tapping the LAST guideline image to zoom did nothing (quoting error in the click handler).
- Print layout: slightly tighter spacing so the page keeps to one A4 sheet with the new footer.

### Earlier history (before version control)
Calculator features built up to the pre-split "v4": dosing-weight logic (TBW/LBW/blend), paediatric mode (RCPCH centiles),
airway lidocaine pool (9 mg/kg LBW, 700 mg cap), dual-agent and "I have used" calculators, dilution, LAST (AAGBI/ASRA),
implausible-value pop-ups, one-page print, Android print plugin support.

# Changelog

All notable changes to the core app and to each organisation's config. The version number appears in the app footer.
Format: [Keep a Changelog](https://keepachangelog.com), versions follow [SemVer](https://semver.org)
(major = dosing logic or limits change, minor = new feature, patch = fix or wording). Versions below 1.0.0 are pre-release: not yet signed off for clinical use.

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

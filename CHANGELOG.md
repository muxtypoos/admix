# Changelog

All notable changes to the core app and to each organisation's config. The version number appears in the app footer.
Format: [Keep a Changelog](https://keepachangelog.com), versions follow [SemVer](https://semver.org)
(major = dosing logic or limits change, minor = new feature, patch = fix or wording). Versions below 1.0.0 are pre-release: not yet signed off for clinical use.


## [0.4.0-beta] - 2026-11-16
### Added
- Organisations choose which high BMI options are offered in Expert settings (`bmiOptions`: blend, strict SOBA switch, hold) and which is the default. A saved choice that the organisation does not offer falls back to its default.
- Request form: "In use?" is now "On by default?"; the three lean-body-weight rows are replaced by "Adults: default threshold for obesity (BMI)", an Enabled/Disabled row for each high BMI option, and "High BMI option used by default"; the lipid guideline is named "AoA QRH (AAGBI)" (older "AAGBI" wording is still read); the lipid dose rows are removed. Older forms with the previous BMI rows are refused with a request to use the current form.
- The builder refuses an organisation config that changes the lipid rescue doses (bolus, infusion, doubling, maximum).
- The mg of drug is shown in brackets beside every volume of a local anaesthetic (for example "20 ml 1% lidocaine (200 mg)"): plan box, selected agent and row boxes, quick reference table, "used so far" and remaining amounts, 1:1 mixture (split into its two drugs), dilution, over-limit message, working page and copied summary. Rounded down: whole mg from 10 mg, 0.1 mg below.
- Expert settings: live demonstration graph under the BMI threshold. It shows total weight, lean weight and the dosing weight for an example 175 cm man across BMI 18 to 50 or more, using the real engine, and redraws as the lean weight formula, threshold and blend/strict/hold option change.
- New Expert option for high BMI: "Hold weight at the threshold BMI weight" (`defaults.hold`, off by default). At or above the BMI threshold the dosing weight stays at threshold BMI x height squared, instead of blending or switching to lean body weight. Adults and children (RCPCH centile threshold).
- "Show working" section at the top of Expert settings: walks through every step behind the numbers on screen (patient, lean body weight, dosing weight, neonatal adjustment, airway pool, single and dual agent maximums, dilution, lipid rescue, warnings and rounding), using the live patient and settings. Tests check it agrees with the main table.
- Request form for organisations: one-page Excel workbook (`Admix-request-form.xlsx`), pre-filled with the current default anaesthetics, maximum doses, settings and wording, with a free-text box at the end. Generated from `src/config.base.json` and checked by the tests.
- Hands-off requests: submitting the Excel form as a GitHub issue builds the organisation, runs the tests and opens a pull request for review (`.github/workflows/organisation-request.yml`, `scripts/handle_request.py`).
- Short name or abbreviation (e.g. NCIC) on the form, now required: it becomes the organisation's online link (`<site>/ncic/`) and its app name.
- Clinical sign-off moved to the end of the form (section 6): Yes, plus the name and email of the person confirming. This is recorded in the organisation's config and build info, so `SIGNOFF.md` files are no longer used.
- Every published organisation is built to `<id>/index.html` for GitHub Pages (`npm run pages`); `org.publish: false` opts out.
- `scripts/admix_form.py read` turns a returned Excel form into an organisation config (differences from the defaults only) plus request notes.
- Reload keeps the airway topicalisation text, the manual airway mg, the "I have used" volumes and the two agents they refer to, together with the patient. Previously only weight, height, sex and age came back, so the maximum doses silently rose after a reload. A dismissible notice now says when a previous patient's details have been restored ("New patient" clears everything and the notice).
- A "Settings changed from this organisation's defaults: check Expert settings" badge on the main screen, in the print header and in the copied summary whenever any agent limit, custom agent or other default differs from the organisation's defaults.
- Height over 3 m (300 cm) is implausible and pauses all calculations, like a weight over 300 kg (message, blocking pop-up, tables show a dash, plan hidden, lipid doses not shown).
- Airway text: "twice", "thrice", "N times" and "times N" count as a repeat multiplier like "x N". A dose given per kg ("1.5 mg/kg", "mg per kg") is flagged as not counted. An entry that cannot be counted (a leftover number or "twice" on its own) is always flagged, never dropped silently.
### Removed
- The 700 mg absolute cap on the airway lidocaine pool, with its Expert setting, form row and per-organisation `lidoMax` default. The pool is now 9 mg/kg of lean body weight (DAS guideline). No source for 700 mg could be found.
### Changed
- Lipid rescue, UK option: now follows the Association of Anaesthetists Quick Reference Handbook 3-10 "Local anaesthetic toxicity" v.2 (2023), Box A, with its page shown (replaces the archived AAGBI 2010 guideline and image). Bolus over 2 to 3 min; repeat bolus at 5 and 10 min; double the rate any time after 5 min; do not exceed 12 ml/kg; infusion shown in ml/min as well as ml/h; smaller adrenaline dose (1 mcg/kg or less) and avoid vasopressin. The doses (1.5, 15, x2, 12) still come from the settings. The internal option key stays `aagbi`. Licence: Association of Anaesthetists 2023, www.anaesthetists.org/qrh, CC BY-NC-SA 4.0.
- Lipid rescue weight is lean body weight when the dosing weight is held at the BMI threshold weight (Expert "hold" option), since that held weight is not lean weight. Other modes are unchanged. The footnote now states the weight actually used (total, adjusted or lean) and credits ASRA only where lean weight is used with the ASRA option; the QRH gives no weight basis.
- Lipid rescue shows no doses, only a message, when the weight is missing, zero, negative or implausible (over 300 kg) or the height is over 3 m (it previously showed, for example, a bolus of -105 ml for -70 kg). The copied summary is refused while calculations are paused.
- Dose limits are bounded: mg/kg limit 0 to 15, custom concentration above 0 up to 200 mg/ml (20%), enforced in the engine, on load of stored settings and in the Expert settings fields. The builder rejects organisation configs outside these ranges. Settings fields now show the value actually used after editing (for example BMI threshold 200 becomes 60).
- Airway text: a comma now always separates items. It was read as a decimal point between digits, which under-counted "4% 5ml x 2, 2% 2ml" (200 mg instead of 440) and "10% spray x 10, 4% lidocaine 5ml" (500 mg instead of 300). The thousands form "1,000" is still understood. A number fragment joined to a previous incomplete entry is flagged. A spray count with "x N" or "twice" is now multiplied, and "x 2 nostrils" is read as a nostril count.
- Retired `tests/equivalence.js` from the test run: it compared against the pre-engine build, which still had the 700 mg cap.
- All equations and dosing rules now live in one separate file, `src/engine.js` (no screen code, no hidden state), so they can be audited, tested and changed on their own. The page only gathers inputs and shows results. The build inserts the engine into each page unchanged. No change to any number: a 500-case comparison against the previous build found zero differences (`tests/equivalence.js`, baseline kept in `tests/baseline/`), and `tests/engine.js` checks fixed worked examples by hand-calculated answers.
- Airway topicalisation note now asks users to double check the amounts and calculations (replaces "Parsed by: Rules").
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
airway lidocaine pool (9 mg/kg LBW), dual-agent and "I have used" calculators, dilution, LAST (AAGBI/ASRA),
implausible-value pop-ups, one-page print, Android print plugin support.

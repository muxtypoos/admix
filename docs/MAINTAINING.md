# Maintaining Admix (for the developer)

Technical notes for whoever builds and releases the app. Users should read the main README instead.

One shared core app, plus one small `config.json` per organisation. A build step merges them into a single
self-contained HTML file per organisation (also the web content for its Android/Capacitor app).

**Decision-support tool. Every organisation must verify its own doses and guidelines and own its sign-off.**

```
src/template.html            the core app (all logic and layout)
src/config.base.json         complete defaults every organisation inherits
src/assets, src/data         guideline images, RCPCH BMI charts and centile data
orgs/<id>/config.json        what ONE organisation changes (only the differences)
scripts/build.js             merge + validate + build
tests/run.js                 regression tests (core, and every organisation's config)
dist/<id>/index.html         build output (not committed)
index.html                   the DEFAULT organisation's build, committed because GitHub Pages serves it
                             (https://muxtypoos.github.io/admix/). Refresh with `npm run pages`.
```

## Everyday commands

```bash
npm install                       # once (also: npx playwright install chromium)
npm run check                     # validate every org's config, write nothing
npm run build                     # build every organisation into dist/
npm run build:org -- my-trust     # build one
npm run template                  # regenerate both request forms (after changing src/config.base.json)
python3 scripts/admix_form.py read filled.xlsx   # turn a returned Excel form into orgs/<id>/config.json (then review, build, test)
npm run pages                     # rebuild the committed ./index.html (do this before every commit that changes src/ or orgs/default/)
npm test                          # build everything, then run all checks
node scripts/new-org.js my-trust "My Trust"   # start a new organisation
scripts/sync-android.sh my-trust ../my-capacitor-project   # build, copy to www/, cap sync
```

## What an organisation can change (`orgs/<id>/config.json`)

Only list what differs from `src/config.base.json`. Objects merge; lists are replaced.

| Key | Meaning |
|---|---|
| `org` | `id` (= folder name), `name`, `title` (browser/app title; requests get `Admix - Local Anaesthetic Calculator - <short name>`), `shortName`, `contactName`, `contactEmail` (disclaimer line), `publish` (false = no public link), `signoff` (`name`, `email`, `date` from form section 6; kept out of the page, written to `build-info.json`) |
| `theme` | `primary`, `primaryDark` (#rrggbb accent colours for light/dark mode) |
| `defaults` | Starting values of the Expert settings: `lbw`, `lbwP`, `pc`, `bmi`, `blend`, `lidoCap`, `lidoMax`, `cpMg`, `cpN`, `bolus`, `inf`, `mult`, `cap`, `neoRed` |
| `agentOverrides` | Tweak individual agents by id, e.g. `{"b25": {"maxMgPerKg": 2.5, "enabled": false}}` |
| `removeAgents` | Ids to remove from the list |
| `addAgents` | New agents: `{id, name, mgPerMl, maxMgPerKg, group, enabled}` (1% = 10 mg/ml) |
| `agents` | Replace the whole agent list (use instead of the three above for a very different formulary) |
| `last` | `enabled` (`["aagbi"]`, `["asra"]` or both), `default`, `captions`, `alt`, `images` (own guideline pictures, jpg/png under 900 KB) |
| `text` | `proteinBinding`, `footer`, `defaultLimits`, `defaultLimitsShort`, `neonate`, `infant`, `airwayGuideline`, `disclaimer` (HTML allowed; config is reviewed code, not user input) |

Agent `group` rules: agents only mix or dilute within the same group (`lP` lidocaine plain, `lA` lidocaine with adrenaline,
`bu` bupivacaine/levobupivacaine, `ro` ropivacaine, `pr` prilocaine, `ch` chloroprocaine). `pr` is locked out in neonates.
A new drug needs a new group name. Anything in the app that is not in this table is core behaviour and is changed in
`src/template.html` for everyone.

The build refuses invalid configs (negative limits, unknown ids, bad colours, out-of-range defaults, fewer than two
enabled agents, LAST default not enabled) and lists every problem.

Users' own Expert-setting edits stay in their browser (`localStorage`, keys prefixed by `storagePrefix`, default `la`).
Give an organisation a different `storagePrefix` if two organisations' apps could ever run from the same web origin.

## GitHub: exact steps

### One-off setup
1. Create an empty **private** repository on GitHub, e.g. `admix` (no README/licence).
2. In this folder:
   ```bash
   git init -b main
   git add .
   git commit -m "feat: core app + per-organisation config (v0.3.0-beta)"
   git remote add origin git@github.com:<you>/admix.git
   git push -u origin main
   git tag v0.3.0-beta && git push origin v0.3.0-beta
   ```
3. Repository **Settings → Branches → Add rule** for `main`: require a pull request, require the `build-and-test`
   check to pass, no force pushes. (This is what makes every change reviewed and tested.)
4. **Settings → Collaborators**: add each organisation's clinical reviewer with *Read*, or *Write* if they edit their own config.
5. Optional: **Settings → Rules → CODEOWNERS** (a `CODEOWNERS` file with `orgs/my-trust/ @their-reviewer`) so that
   organisation must approve changes to its own folder.

### Adding a feature that every organisation gets
1. `git switch -c feat/short-name`
2. Change `src/` only. If the feature needs something organisation-specific (a limit, a text), add a key with a
   sensible value to `src/config.base.json`; every organisation inherits it automatically and can override it.
3. Add or extend a check in `tests/run.js`. Run `npm test`.
4. Run `npm run pages` and commit the refreshed `index.html` (CI fails if it is stale). Add a line to `CHANGELOG.md` under *Unreleased*.
5. Commit with a clear prefix (`feat:`, `fix:`, `docs:`), push, open a pull request (the template has a safety checklist).
6. After review and a green check, merge. CI builds **all** organisations from the merged code, so they all get the feature.
7. Release: move the changelog entry under a new version, bump `version` in `package.json`, merge, then
   `git tag vX.Y.Z && git push origin vX.Y.Z`. CI attaches each organisation's `index.html` to the GitHub release.

### Changing one organisation
Branch `config/<org>-<what>`, edit only `orgs/<org>/`, run `npm test`, open a PR (CI rejects an invalid config),
get the organisation's reviewer to approve, merge, tag. The organisation's own sign-off is the name and email in `org.signoff`.
Commit messages `config(<org>): ...` make `git log --grep "config(<org>)"` the full audit trail of that organisation's limits.

### Tracking every change
- `git log` / pull requests show who changed what, when and why; `git log -p orgs/<org>/config.json` shows every dose-limit change.
- The footer of every built app (and the printout/copied summary) shows `Admix v<version> · <org> · <config hash>`,
  so any dose seen in clinic can be traced to an exact release and configuration.
- Tags + GitHub Releases hold the exact file given to each organisation.

### If an organisation insists on its own fork
Keep all its changes inside `orgs/<id>/`. Then `git remote add upstream <this repo>`, and to take new features:
`git fetch upstream && git merge upstream/main`. Because the fork only touches its own folder, merges should not conflict.

## Android (Capacitor)
Per organisation: `scripts/sync-android.sh <org> <capacitor-project>` builds the org, copies `index.html` into the project's
`www/` and runs `npx cap sync android`. Use a separate Capacitor project (or Android product flavour) per organisation so
each has its own app name/ID. The native `PrintPlugin` stays in your Android project; the web app calls it unchanged.

## Regulatory note
Distributing this to other organisations may make it clinical decision-support software, which can bring UK clinical
safety standards (DCB0129 / DCB0160) and possibly MHRA medical-device rules. Versioning, change tracking and sign-off here are
the groundwork; check early with your clinical safety / digital governance lead.

## Automatic handling of request forms (GitHub)

`.github/workflows/organisation-request.yml` runs when an issue made from the "Submit your organisation's request form"
template is opened or edited. It downloads the attached `.xlsx`, converts it with `scripts/handle_request.py`, builds and tests
every organisation, then opens a pull request on branch `request/<org>-<issue number>` and comments on the issue.
If the form has problems it comments with what to fix instead. Nothing is merged automatically: a reviewer checks the doses,
checks the sign-off recorded from the form (section 6, in `org.signoff`), handles the free-text requests in `REQUEST-NOTES.md`, then merges.

One-off setting needed: **Settings, Actions, General, Workflow permissions**: choose "Read and write permissions" and tick
"Allow GitHub Actions to create and approve pull requests". Pull requests opened by the workflow do not trigger the normal
`build-and-test` workflow, which is why the request workflow runs the full tests itself.
Reserved ids (`default`, `example-hospital`) are refused. Wording from forms is HTML-escaped. Attachments over 2 MB are refused.

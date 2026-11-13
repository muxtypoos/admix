#!/usr/bin/env node
/* Create a new organisation folder:  node scripts/new-org.js <id> "<Display name>" */
"use strict";
const fs = require("fs");
const path = require("path");
const [id, name] = process.argv.slice(2);
if (!id || !name || !/^[a-z0-9-]+$/.test(id)) {
  console.error('usage: node scripts/new-org.js <id: lower-case-with-dashes> "<Display name>"');
  process.exit(2);
}
const dir = path.join(__dirname, "..", "orgs", id);
if (fs.existsSync(dir)) { console.error(`orgs/${id} already exists`); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const cfg = {
  org: { id, name, title: `${name} - Local Anaesthetic Calculator`, contactName: "", contactEmail: "" },
  _comment: "Only list what differs from src/config.base.json. See README.md, 'What an organisation can change'.",
};
fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(cfg, null, 1) + "\n");
fs.writeFileSync(path.join(dir, "SIGNOFF.md"),
`# ${name}: clinical sign-off

| Config version (tag) | Reviewed by (name, role) | Date | Notes |
|---|---|---|---|
|  |  |  |  |
`);
console.log(`created orgs/${id}/config.json and SIGNOFF.md\nnext: edit the config, then  npm run build:org -- ${id}`);

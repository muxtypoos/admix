#!/usr/bin/env bash
# Copy one organisation's built app into a Capacitor project and sync it.
#   scripts/sync-android.sh <org-id> <path-to-capacitor-project>
# The Capacitor project's webDir (usually "www") receives index.html.
set -euo pipefail
org="${1:?usage: sync-android.sh <org-id> <capacitor-project-dir>}"
proj="${2:?usage: sync-android.sh <org-id> <capacitor-project-dir>}"
here="$(cd "$(dirname "$0")/.." && pwd)"
node "$here/scripts/build.js" --org "$org"
web="$proj/www"
mkdir -p "$web"
cp "$here/dist/$org/index.html" "$web/index.html"
cp "$here/dist/$org/build-info.json" "$web/build-info.json"
echo "copied dist/$org to $web"
(cd "$proj" && npx cap sync android)

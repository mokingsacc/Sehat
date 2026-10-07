#!/usr/bin/env bash
# Copies the web app (the folder above android/) into the APK's assets: app/src/main/assets/www/.
# Gradle runs this before every build; you can also run it by hand: bash android/sync-web.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="${WEB_ROOT:-$(cd "$HERE/.." && pwd)}"
OUT="$HERE/app/src/main/assets/www"

for f in index.html manifest.webmanifest sw.js content/book.json content/version.json; do
  [ -f "$WEB/$f" ] || { echo "sync-web: missing $WEB/$f (run python3 tools/build.py first)" >&2; exit 1; }
done

rm -rf "$OUT"
mkdir -p "$OUT/content"
cp "$WEB/index.html" "$WEB/manifest.webmanifest" "$WEB/sw.js" "$OUT/"
cp "$WEB/content/book.json" "$WEB/content/version.json" "$OUT/content/"
for d in css js fonts img; do cp -R "$WEB/$d" "$OUT/$d"; done
rm -rf "$OUT/img/_preview" "$OUT/js/sw.template.js"
if [ -d "$WEB/audio" ] && [ -n "$(find "$WEB/audio" -type f ! -name '.*' -print -quit)" ]; then
  cp -R "$WEB/audio" "$OUT/audio"
fi
# no hidden files (.DS_Store, .gitkeep) in the APK
find "$OUT" -name '.*' -type f -delete

# Every file the service worker precaches must exist, or it will not install.
if command -v python3 >/dev/null 2>&1; then
  python3 - "$OUT" <<'PY'
import json, os, re, sys
out = sys.argv[1]
src = open(os.path.join(out, "sw.js"), encoding="utf-8").read()
m = re.search(r"const PRECACHE = (\[.*?\]);", src, re.S)
missing = [p for p in (json.loads(m.group(1)) if m else []) if p not in ("./", "") and not os.path.isfile(os.path.join(out, p.split("?")[0]))]
if missing:
    print("sync-web: warning, sw.js precaches files that are not in the APK:", ", ".join(missing[:10]), file=sys.stderr)
PY
fi

echo "sync-web: copied $(find "$OUT" -type f | wc -l) files ($(du -sh "$OUT" | cut -f1)) into ${OUT#$HERE/}"

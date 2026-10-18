#!/usr/bin/env bash
# Copies the phone app (tutor/app) into the APK's assets: app/src/main/assets/www/. Gradle runs this before every
# build; by hand: bash tutor/android/sync-web.sh. Left out: the tests, the staff pages (/admin/, /teacher/,
# /review/ and their scripts: staff use a browser), /get/ (the download page and the APK itself) and every sound
# (app/audio: the voice clips and the bells, C5.6 and the owner's note of 17 Oct: the APK stays small enough to
# share by Bluetooth; after install the app downloads the voice pack for her language, or opens one shared to it).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="${WEB_ROOT:-$(cd "$HERE/../app" && pwd)}"
OUT="$HERE/app/src/main/assets/www"

for f in index.html sw.js css/app.css js/main.js; do
  [ -f "$WEB/$f" ] || { echo "sync-web: missing $WEB/$f" >&2; exit 1; }
done

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R "$WEB/." "$OUT/"
rm -rf "$OUT/tests" "$OUT/admin" "$OUT/teacher" "$OUT/review" "$OUT/get" \
       "$OUT/js/admin" "$OUT/js/teacher" "$OUT/js/review" "$OUT/js/staff" "$OUT/js/get.js"
rm -rf "$OUT/audio"
# the APK's own service worker keeps no audio either (the shell lists app/audio for the web app)
python3 - "$OUT/sw.js" <<'PY'
import re, sys
p = sys.argv[1]
src = open(p, encoding="utf-8").read()
out = re.sub(r"^\s*'/?audio/[^']*',\n", "", src, flags=re.M)
open(p, "w", encoding="utf-8").write(out)
PY
find "$OUT" -name '.*' -type f -delete
find "$OUT" -name '__pycache__' -type d -prune -exec rm -rf {} +

# every file the service worker keeps must be there, or it will not install
python3 - "$OUT" <<'PY'
import os, re, sys
out = sys.argv[1]
src = open(os.path.join(out, "sw.js"), encoding="utf-8").read()
m = re.search(r"const SHELL = \[(.*?)\];", src, re.S)
want = re.findall(r"'([^']+)'", m.group(1)) if m else []
missing = [p for p in want if p not in ("./",) and not os.path.isfile(os.path.join(out, p))]
if missing:
    sys.exit("sync-web: the service worker keeps files the APK lacks: " + ", ".join(missing))
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
print(f"sync-web: {len(want)} shell files checked; the app in the APK is {size / 1e3:.0f} KB")
PY

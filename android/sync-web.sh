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
if [ -f "$WEB/content/who-growth.json" ]; then cp "$WEB/content/who-growth.json" "$OUT/content/"; fi   # WHO growth tables (js/growth.js)
for d in css js fonts img anim; do if [ -d "$WEB/$d" ]; then cp -R "$WEB/$d" "$OUT/$d"; fi; done
rm -rf "$OUT/img/_preview" "$OUT/js/sw.template.js" "$OUT/anim/demo.html"
find "$OUT" -name '*.cjs' -delete   # local screenshot helpers (anim/cine/shots.cjs), not part of the app
# Picture-step sets: only the Emergency and CPR ones ("precache" in book.steps, chosen by tools/build.py) go in the APK.
# Every other set (on-demand, or not live yet) stays on the website: the app downloads it the first time its page is
# opened and plays the SVG version until then (js/anim.js, docs/STEPS_PLAYER.md). Keeps the APK about 12 MB (Mo 9 Oct: all Emergency sets in the APK; under 15 MB).
python3 - "$WEB" "$OUT" <<'PY'
import json, os, sys
web, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(web, "tools"))
import anims   # prune_apk: the same filter tools/validate.py runs; keeps only "precache" sets of book.steps
steps = json.load(open(os.path.join(web, "content/book.json"), encoding="utf-8")).get("steps") or {}
keep, gone, size = anims.prune_apk(out, steps)
print(f"sync-web: picture steps in the APK: {' '.join(keep) or 'none'}; left on the website: {len(gone)} files or folders ({size / 1e3:.0f} KB)")
PY
# Narration: only the Emergency and CPR clips in the woman's voice of Dari and Pashto (book.bundle, listed by
# tools/build.py; about 3 MB each), so a phone that gets the app by Bluetooth and never goes online still hears
# emergencies. Everything else (audio/ is about 260 MB for four voices) comes from the website (config.appUrl) for the
# chosen voice only, and is kept on the phone (js/app.js: bundledIn, normBook, startDownloads).
python3 - "$WEB" "$OUT" <<'PY'
import json, os, shutil, sys
web, out = sys.argv[1], sys.argv[2]
b = json.load(open(os.path.join(web, "content/book.json"), encoding="utf-8"))
bu, n, size, missing = b.get("bundle") or {}, 0, 0, []
for sl in bu.get("slots", []):
    for i in bu.get("ids", []):
        u = (b.get("audio", {}).get(sl) or {}).get(i)
        if not u or not u.startswith("audio/"): continue
        rel = u.split("?")[0]; src = os.path.join(web, rel)
        if not os.path.isfile(src): missing.append(rel); continue
        os.makedirs(os.path.dirname(os.path.join(out, rel)), exist_ok=True)
        shutil.copyfile(src, os.path.join(out, rel)); n += 1; size += os.path.getsize(src)
print(f"sync-web: {n} Emergency and CPR clips ({size / 1e6:.1f} MB) in {' '.join(bu.get('slots', [])) or 'no voice'}")
if missing: print("sync-web: warning, clips listed in book.bundle are missing:", ", ".join(missing[:10]), file=sys.stderr)
PY
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
    print("sync-web: ERROR, sw.js precaches files that are not in the APK (the service worker would not install):", ", ".join(missing[:10]), file=sys.stderr)
    sys.exit(1)
PY
fi

echo "sync-web: copied $(find "$OUT" -type f | wc -l) files ($(du -sh "$OUT" | cut -f1)) into ${OUT#$HERE/}"

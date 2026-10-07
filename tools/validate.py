#!/usr/bin/env python3
"""Validate content/src/topics/*.json and content/src/vaccines.json against docs/CONTENT_SPEC.md.
Usage: python3 tools/validate.py [file ...]   (no args = all)"""
import json, re, sys, glob, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = set("""clinic hospital car phone calendar clock moon family talk card check no warning money house
baby newborn-warm cord breastfeed bowl-food cup-spoon ors zinc water handwash thermometer fever cough breathing-fast chest-indrawing no-drink vomit convulsion sleepy stool-blood eye-sunken skin-pinch growth muac swollen-feet milestones jaundice syringe drops pill rash toys-play
pregnant bleeding headache eye-blurred belly-pain swelling baby-movement waters iron-pill birth-plan midwife rest food-iron sad
heart stroke-face bp sugar foot lungs mask window weight-loss lump urine-blood stiff-neck wound burn cool-water dog poison choking stove smoke salt walk sleep breathe people eye tooth animals milk insect""".split())
TYPES = {"lead", "step", "alert", "dont", "tip"}
SECTIONS = {"children", "women", "everyone"}
ID_RE = re.compile(r'^[a-z0-9-]+(\.[a-z0-9-]+)*$')
LANGS = ("fa", "ps", "en")

errors, warnings = [], []
seen_ids = {}

def err(f, m): errors.append(f"{os.path.relpath(f, ROOT)}: {m}")
def warn(f, m): warnings.append(f"{os.path.relpath(f, ROOT)}: {m}")

def check_L(f, where, L, maxwords=None):
    if not isinstance(L, dict):
        err(f, f"{where}: text must be an object with fa/ps/en"); return
    for lg in LANGS:
        v = L.get(lg)
        if not isinstance(v, str) or not v.strip():
            err(f, f"{where}: missing '{lg}' text"); continue
        if lg in ("fa", "ps"):
            if re.search(r'[0-9]', v): warn(f, f"{where}.{lg}: ASCII digits, use Persian digits ۰-۹")
            if re.search(r'[A-Za-z]{2,}', v): warn(f, f"{where}.{lg}: Latin letters in {lg} text")
            if lg == "fa" and re.search(r'[ټډړږښګڼېۍ]', v): warn(f, f"{where}.fa: Pashto-only letters in Dari text")
        if maxwords and lg == "en" and len(v.split()) > maxwords:
            warn(f, f"{where}.en: {len(v.split())} words (aim ≤{maxwords})")

def reg_id(f, i, where):
    if not isinstance(i, str) or not ID_RE.match(i):
        err(f, f"{where}: bad id {i!r}"); return
    if i in seen_ids and seen_ids[i] != (f, where):
        err(f, f"{where}: duplicate id {i} (also in {os.path.relpath(seen_ids[i][0], ROOT)})")
    seen_ids[i] = (f, where)

def check_icon(f, where, ic, required=True):
    if ic is None:
        if required: err(f, f"{where}: missing icon")
        return
    if ic not in ICONS: err(f, f"{where}: unknown icon {ic!r}")

def check_topic(f, d):
    tid = d.get("id")
    if not tid or not ID_RE.match(tid): err(f, "bad or missing topic id"); return
    if os.path.basename(f) != tid + ".json": err(f, f"file name must be {tid}.json")
    if d.get("section") not in SECTIONS: err(f, f"section must be one of {sorted(SECTIONS)}")
    check_L(f, "title", d.get("title"), 6)
    check_L(f, "summary", d.get("summary"), 12)
    if d.get("image") != tid: warn(f, "image should equal the topic id")
    blocks = d.get("blocks")
    if not isinstance(blocks, list) or not blocks: err(f, "blocks missing"); return
    if blocks[0].get("type") != "lead": err(f, "first block must be the lead")
    counts = {}
    for n, b in enumerate(blocks):
        w = f"blocks[{n}]"
        t = b.get("type"); counts[t] = counts.get(t, 0) + 1
        if t not in TYPES: err(f, f"{w}: unknown type {t!r}"); continue
        reg_id(f, b.get("id"), w)
        if isinstance(b.get("id"), str) and not b["id"].startswith(tid + "."): err(f, f"{w}: id must start with '{tid}.'")
        if t == "lead": check_L(f, w + ".text", b.get("text"), 45)
        elif t == "step":
            check_icon(f, w, b.get("icon")); check_L(f, w + ".title", b.get("title"), 7); check_L(f, w + ".text", b.get("text"), 32)
        elif t == "tip":
            check_icon(f, w, b.get("icon"), required=False); check_L(f, w + ".text", b.get("text"), 32)
        elif t in ("alert", "dont"):
            if t == "alert" and b.get("level") not in ("urgent", "soon"): err(f, f"{w}: level must be urgent or soon")
            check_L(f, w + ".title", b.get("title"), 16)
            items = b.get("items")
            if not isinstance(items, list) or not items: err(f, f"{w}: items missing"); continue
            for m, it in enumerate(items):
                iw = f"{w}.items[{m}]"
                reg_id(f, it.get("id"), iw)
                if isinstance(it.get("id"), str) and not it["id"].startswith(b.get("id", "") + "."): err(f, f"{iw}: id must start with '{b.get('id')}.'")
                check_icon(f, iw, it.get("icon")); check_L(f, iw + ".text", it.get("text"), 14)
    if counts.get("lead", 0) != 1: err(f, "exactly one lead block")
    if not (2 <= counts.get("step", 0) <= 8): warn(f, f"{counts.get('step',0)} steps (aim 3-7)")
    if not d.get("sources"): err(f, "sources missing")

def check_vaccines(f, d):
    check_L(f, "title", d.get("title")); check_L(f, "summary", d.get("summary"))
    lead = d.get("lead", {}); reg_id(f, lead.get("id"), "lead"); check_L(f, "lead.text", lead.get("text"))
    last = -1
    for n, v in enumerate(d.get("visits", [])):
        w = f"visits[{n}]"; reg_id(f, v.get("id"), w); check_L(f, w + ".age", v.get("age"))
        if not isinstance(v.get("ageDays"), int) or v["ageDays"] <= last and n > 0: err(f, f"{w}: ageDays must increase")
        last = v.get("ageDays", last)
        for m, dz in enumerate(v.get("doses", [])):
            dw = f"{w}.doses[{m}]"
            if not ID_RE.match(dz.get("id", "")): err(f, f"{dw}: bad id")
            check_L(f, dw + ".name", dz.get("name")); check_L(f, dw + ".protects", dz.get("protects"))
    for n, x in enumerate(d.get("notes", [])):
        reg_id(f, x.get("id"), f"notes[{n}]"); check_icon(f, f"notes[{n}]", x.get("icon"), required=False); check_L(f, f"notes[{n}].text", x.get("text"))
    wm = d.get("women")
    if wm:
        reg_id(f, wm.get("id"), "women"); check_L(f, "women.title", wm.get("title")); check_L(f, "women.text", wm.get("text"))
        for n, x in enumerate(wm.get("doses", [])): check_L(f, f"women.doses[{n}].when", x.get("when"))

files = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, "content/src/topics/*.json"))) + [p for p in [os.path.join(ROOT, "content/src/vaccines.json")] if os.path.exists(p)]
# always load all files so duplicate-id checks span the book
allfiles = sorted(set(os.path.abspath(x) for x in files) | set(glob.glob(os.path.join(ROOT, "content/src/topics/*.json"))) | ({os.path.join(ROOT, "content/src/vaccines.json")} if os.path.exists(os.path.join(ROOT, "content/src/vaccines.json")) else set()))
for f in allfiles:
    try:
        d = json.load(open(f, encoding="utf-8"))
    except Exception as e:
        err(f, f"invalid JSON: {e}"); continue
    if os.path.basename(f) == "vaccines.json": check_vaccines(f, d)
    else: check_topic(f, d)

want = {os.path.abspath(x) for x in files}
show = lambda lst: [x for x in lst if any(x.startswith(os.path.relpath(w, ROOT)) for w in want)] if sys.argv[1:] else lst
E, W = show(errors), show(warnings)
for m in E: print("ERROR  ", m)
for m in W: print("warning", m)
print(f"{len(E)} errors, {len(W)} warnings in {len(want)} file(s)")
sys.exit(1 if E else 0)

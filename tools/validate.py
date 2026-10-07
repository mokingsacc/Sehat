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

# disease watch: content/src/syndromes.json and content/src/districts.json
def check_surveillance():
    f = os.path.join(ROOT, "content/src/syndromes.json"); fd = os.path.join(ROOT, "content/src/districts.json")
    if not os.path.exists(f): return
    try:
        d = json.load(open(f, encoding="utf-8"))
        places = json.load(open(fd, encoding="utf-8")) if os.path.exists(fd) else None
    except Exception as e:
        err(f, f"invalid JSON: {e}"); return
    if places is None: err(fd, "missing: the disease watch needs the list of districts"); return
    topic_ids = {os.path.basename(x)[:-5] for x in glob.glob(os.path.join(ROOT, "content/src/topics/*.json"))}
    try: sym_ids = {x["id"] for x in json.load(open(os.path.join(ROOT, "content/src/symptoms.json"), encoding="utf-8"))["symptoms"]}
    except Exception: sym_ids = set()
    if not isinstance(d.get("version"), str) or not d["version"]: err(f, "version missing")
    ages = d.get("ageGroups") or []
    if not ages: err(f, "ageGroups missing")
    for n, a in enumerate(ages):
        if not ID_RE.match(str(a.get("id", "")).replace("+", "")): err(f, f"ageGroups[{n}]: bad id")
        check_L(f, f"ageGroups[{n}].name", a.get("name"))
    seen = set()
    for n, x in enumerate(d.get("syndromes") or []):
        w = f"syndromes[{n}]"; sid = x.get("id")
        if not isinstance(sid, str) or not ID_RE.match(sid) or "." in sid: err(f, f"{w}: bad id {sid!r}"); continue
        if sid in seen: err(f, f"{w}: duplicate syndrome {sid}")
        seen.add(sid)
        if not isinstance(x.get("version"), int) or x["version"] < 1: err(f, f"{w}: version must be a whole number from 1")
        if not isinstance(x.get("history", []), list): err(f, f"{w}: history must be a list")
        if not isinstance(x.get("active"), bool): err(f, f"{w}: active must be true or false")
        check_L(f, w + ".name", x.get("name")); check_L(f, w + ".ask", x.get("ask"), 16)
        if not str(x.get("definition", "")).strip(): err(f, f"{w}: case definition text missing")
        src = x.get("source") or {}
        if not src.get("title") or not str(src.get("url", "")).startswith("https://"): err(f, f"{w}: source needs a title and an https link")
        for t in x.get("topics", []):
            if t not in topic_ids: err(f, f"{w}: unknown topic {t!r}")
        for y in x.get("symptoms", []):
            if y not in sym_ids: err(f, f"{w}: unknown symptom {y!r}")
        if x.get("active") and not (x.get("topics") or x.get("symptoms")): warn(f, f"{w}: active but no topic or symptom shows the question")
    rules = d.get("alertRules") or {}
    if not rules.get("version"): err(f, "alertRules.version missing")
    if not isinstance(rules.get("baselineWeeks"), int) or rules["baselineWeeks"] < 1: err(f, "alertRules.baselineWeeks must be a whole number")
    rseen = set()
    for n, r in enumerate(rules.get("rules") or []):
        w = f"alertRules.rules[{n}]"
        if r.get("id") in rseen or not r.get("id"): err(f, f"{w}: missing or duplicate id")
        rseen.add(r.get("id"))
        if r.get("kind") not in ("any", "rise"): err(f, f"{w}: kind must be 'any' or 'rise'")
        sy = r.get("syndromes")
        if sy != "*" and (not isinstance(sy, list) or any(s not in seen for s in sy)): err(f, f"{w}: syndromes must be '*' or a list of known syndrome ids")
        if not isinstance(r.get("min"), int) or r["min"] < 1: err(f, f"{w}: min must be a whole number from 1")
        if r.get("kind") == "rise" and not (isinstance(r.get("ratio"), (int, float)) and r["ratio"] > 0): err(f, f"{w}: ratio missing")
        if not r.get("text"): err(f, f"{w}: plain-words text missing")
    if not isinstance((d.get("suppression") or {}).get("minCell"), int): err(f, "suppression.minCell missing")
    pseen = set()
    for key in ("districts", "provinces"):
        for n, p in enumerate(places.get(key) or []):
            w = f"{key}[{n}]"
            if not isinstance(p.get("id"), str) or not ID_RE.match(p["id"]) or p["id"] in pseen: err(fd, f"{w}: bad or duplicate id {p.get('id')!r}")
            pseen.add(p.get("id")); check_L(fd, w + ".name", p.get("name"))
    if not places.get("districts"): err(fd, "districts missing")
    if not places.get("version"): err(fd, "version missing")
check_surveillance()

want = {os.path.abspath(x) for x in files}
show = lambda lst: [x for x in lst if any(x.startswith(os.path.relpath(w, ROOT)) for w in want)] if sys.argv[1:] else lst
E, W = show(errors), show(warnings)
for m in E: print("ERROR  ", m)
for m in W: print("warning", m)
print(f"{len(E)} errors, {len(W)} warnings in {len(want)} file(s)")
sys.exit(1 if E else 0)

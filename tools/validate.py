#!/usr/bin/env python3
"""Validate content/src/topics/*.json and content/src/vaccines.json against docs/CONTENT_SPEC.md.
Usage: python3 tools/validate.py [file ...]   (no args = all)"""
import json, re, sys, glob, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anims as ANIM

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = set("""clinic hospital car phone calendar clock moon family talk card check no warning money house
baby newborn-warm cord breastfeed bowl-food cup-spoon ors zinc water handwash thermometer fever cough breathing-fast chest-indrawing no-drink vomit convulsion sleepy stool-blood eye-sunken skin-pinch growth muac swollen-feet milestones jaundice syringe drops pill rash toys-play
pregnant bleeding headache eye-blurred belly-pain swelling baby-movement waters iron-pill birth-plan midwife rest food-iron sad
heart stroke-face bp sugar foot lungs mask window weight-loss lump urine-blood stiff-neck wound burn cool-water dog poison choking stove smoke salt walk sleep breathe people eye tooth animals milk insect""".split())
TYPES = {"lead", "step", "alert", "dont", "tip", "link", "anim", "clinic"}
# "clinic": what the clinic or the hospital actually does for this problem (title "At the clinic: ..." / "At the hospital: ...", and a text)
# "link" blocks open another screen of the app: a tool, a topic, the home kit, the family record, the clinic finder,
# "What is wrong?" (ask) or the Emergency screen; urgent: true draws it as a red row (the Home tab's way to the Health side)
TOOL_ROWS = {"growth", "breaths", "reading"}  # tool rows in lists (growth: the growth chart, once this version has it)
TOOLS = {"breaths", "reading", "reading/temp", "reading/bp", "reading/sugar", "reading/spo2", "reading/muac"}
LINK_RE = re.compile(r'^(tool/(?P<tool>[a-z0-9/-]+)|topic/(?P<topic>[a-z0-9-]+)|kit|family|near|growth|growth/measure|share|ask|emergency)$')
SECTIONS = {"children", "women", "everyone"}
# lists in content/src/sections.json: the three sections, "emergency" (the Emergency screen), and the lists with their own page
# and home card named in config.lists ("kit" the home health kit, "safety" home safety, "hospital", "food" food and garden)
try: CONFIG_LISTS = json.load(open(os.path.join(ROOT, "content/src/config.json"), encoding="utf-8")).get("lists") or {}
except Exception: CONFIG_LISTS = {}
PAGE_LISTS = set(CONFIG_LISTS) | {"kit"}
SECTION_LISTS = SECTIONS | {"emergency"} | PAGE_LISTS
ANIM_FILES, ANIM_GROUPS, ANIM_TEXT = set(ANIM.names()), ANIM.groups(), ANIM.narration()
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

anims_used = set()
def check_anim(f, w, b):
    """An "anim" block: a poster that opens the animation player (js/anim.js). anim = a file in anim/ or a group (cpr);
    pick = one variant of the group, to go straight to it; title is optional (default: the animation's own title)."""
    a, pick = b.get("anim"), b.get("pick")
    if not isinstance(a, str) or (a not in ANIM_FILES and a not in ANIM_GROUPS):
        err(f, f"{w}: unknown animation {a!r} (anim/<name>.js or one of the groups {sorted(ANIM_GROUPS)})"); return
    if pick is not None and pick not in ANIM_GROUPS.get(a, []):
        err(f, f"{w}: pick {pick!r} is not a variant of {a!r} ({ANIM_GROUPS.get(a, [])})")
    if b.get("title") is not None: check_L(f, w + ".title", b["title"], 7)
    for x in ([a] + ([pick] if pick else [])):
        for i in ANIM.needed_ids(x):
            if i not in ANIM_TEXT: err(f, f"{w}: narration {i} missing from content/src/anims.json")
        anims_used.add(x)

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
        elif t == "link":
            check_icon(f, w, b.get("icon"), required=False); check_L(f, w + ".title", b.get("title"), 7); check_L(f, w + ".text", b.get("text"), 32)
            m = LINK_RE.match(str(b.get("to", "")))
            if not m: err(f, f"{w}: 'to' must be tool/<name>, topic/<id>, kit, family, near, ask or emergency")
            if b.get("urgent") not in (None, True, False): err(f, f"{w}: urgent must be true or false")
            elif m.group("tool") and m.group("tool") not in TOOLS: err(f, f"{w}: unknown tool {m.group('tool')!r}")
            elif m.group("topic") and not os.path.exists(os.path.join(ROOT, "content/src/topics", m.group("topic") + ".json")) and m.group("topic") != "vaccines":
                err(f, f"{w}: link to unknown topic {m.group('topic')!r}")
        elif t == "clinic":
            check_icon(f, w, b.get("icon"), required=False); check_L(f, w + ".title", b.get("title"), 7); check_L(f, w + ".text", b.get("text"), 32)
        if t == "anim": check_anim(f, w, b)
        if t in ("step", "link") and b.get("picture") is not None:
            if not ID_RE.match(str(b["picture"])) or not os.path.exists(os.path.join(ROOT, "img/pics", str(b["picture"]) + ".svg")):
                err(f, f"{w}: picture img/pics/{b['picture']}.svg not found")
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
    if counts.get("anim", 0) > 2: warn(f, f"{counts['anim']} animations (aim for at most 2 per topic)")
    if counts.get("lead", 0) != 1: err(f, "exactly one lead block")
    lo = 1 if counts.get("alert", 0) else 2  # a reading page (what a number means) is one step and its alert boxes
    if not (lo <= counts.get("step", 0) <= 8): warn(f, f"{counts.get('step',0)} steps (aim 3-7)")
    if not d.get("sources"): err(f, "sources missing")
    try: kit = json.load(open(os.path.join(ROOT, "content/src/sections.json"), encoding="utf-8")).get("kit", [])
    except Exception: kit = []
    if tid in kit and d.get("section") not in ("children", "everyone"): err(f, "home kit topics use section children or everyone")
    # red links to the emergency pages and the closing "What is wrong?" link do not count
    plain = sum(1 for b in d.get("blocks", []) if b.get("type") == "link" and not b.get("urgent") and b.get("to") != "ask")
    if plain > 2: warn(f, f"{plain} links (aim for at most 2 per topic)")

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
    for n, b in enumerate(d.get("anims") or []):
        w = f"anims[{n}]"; reg_id(f, b.get("id"), w)
        if b.get("type") != "anim": err(f, f"{w}: type must be anim")
        if isinstance(b.get("id"), str) and not b["id"].startswith("vaccines."): err(f, f"{w}: id must start with 'vaccines.'")
        check_anim(f, w, b)
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

def check_anims_and_lists():
    fa = os.path.join(ROOT, "content/src/anims.json")
    for k, L in ANIM_TEXT.items():
        if not ID_RE.match(k) or not k.startswith("anim."): err(fa, f"{k}: ids look like anim.<name>.s1")
        check_L(fa, k, L)
    for name in sorted(ANIM_FILES):
        miss = [i for i in ANIM.needed_ids(name) if i not in ANIM_TEXT]
        if miss and name not in anims_used: warn(fa, f"anim/{name}.js: no narration yet for {', '.join(miss[:4])}{' ...' if len(miss) > 4 else ''}")
    topic_ids = {os.path.basename(x)[:-5] for x in glob.glob(os.path.join(ROOT, "content/src/topics/*.json"))} | {"vaccines"}
    fs = os.path.join(ROOT, "content/src/sections.json")
    try: secs = json.load(open(fs, encoding="utf-8"))
    except Exception as e: err(fs, f"invalid JSON: {e}"); return
    for k, ids in secs.items():
        if k.startswith("_"): continue
        if k not in SECTION_LISTS: err(fs, f"unknown list {k!r} (use {sorted(SECTION_LISTS)})"); continue
        for t in ids:
            if t not in topic_ids: err(fs, f"{k}: unknown topic {t!r}")
    fc = os.path.join(ROOT, "content/src/config.json"); fu = os.path.join(ROOT, "content/src/ui.json")
    try: cfg = json.load(open(fc, encoding="utf-8")); ui = json.load(open(fu, encoding="utf-8"))
    except Exception as e: err(fc, f"invalid JSON: {e}"); return
    for t in cfg.get("urgentTopics") or []:
        if t not in topic_ids: err(fc, f"urgentTopics: unknown topic {t!r}")
    cpr_variants = {v for g in ANIM_GROUPS.values() for v in g}
    for n, a in enumerate(cfg.get("emergency") or []):
        w = f"emergency[{n}]"
        if not ID_RE.match(str(a.get("id", ""))): err(fc, f"{w}: bad id")
        if a.get("label") not in ui["text"]: err(fc, f"{w}: label {a.get('label')!r} is not a ui.text key")
        if a.get("icon") not in ICONS: err(fc, f"{w}: unknown icon {a.get('icon')!r}")
        if a.get("cpr") not in topic_ids: err(fc, f"{w}: unknown 'not breathing' topic {a.get('cpr')!r}")
        if a.get("anim") is not None and a["anim"] not in cpr_variants | ANIM_FILES: err(fc, f"{w}: unknown animation {a['anim']!r}")
        for t in a.get("topics") or []:
            if t not in topic_ids: err(fc, f"{w}: unknown topic {t!r}")
    # the list pages (#/s/<name>) and their home cards
    known_mods = {"emergency", "firstAid", "install", "ask", "nextVaccine", "sections", "children", "adults", "share", "near", "sendApp", "feedback", "disclaimer"}
    for m in cfg.get("home") or []:
        if m not in known_mods and m not in PAGE_LISTS: err(fc, f"home: unknown module {m!r}")
        if m in PAGE_LISTS and m not in CONFIG_LISTS: err(fc, f"home: {m!r} needs an entry in config.lists")
    for k, v in CONFIG_LISTS.items():
        w = f"lists.{k}"
        if not ID_RE.match(k) or "." in k or k in SECTIONS | {"emergency"}: err(fc, f"{w}: bad list name"); continue
        if not secs.get(k): err(fc, f"{w}: content/src/sections.json has no topics for {k!r}")
        for key in ("title", "sub"):
            if v.get(key) not in ui["text"]: err(fu, f"text.{v.get(key)} missing ({w}.{key})")
        if v.get("say") not in ui["say"]: err(fu, f"say.{v.get('say')} missing ({w}.say)")
        if v.get("image") not in topic_ids: err(fc, f"{w}: image must be a topic id (its picture is used), not {v.get('image')!r}")
        if v.get("icon") is not None and v["icon"] not in ICONS: err(fc, f"{w}: unknown icon {v['icon']!r}")
        for x in v.get("tools") or []:
            if x not in TOOL_ROWS: err(fc, f"{w}: unknown tool {x!r}")
        if v.get("tab") not in ("health", "house"): err(fc, f"{w}: tab must be health or house")
        if v.get("near") not in (None, True, False): err(fc, f"{w}: near must be true or false")
    # the Home tab (#/house): lists only, and no medical advice on their pages (Mo's rule: urgent signs live on the Health side)
    for m in cfg.get("house") or []:
        if m not in CONFIG_LISTS: err(fc, f"house: {m!r} needs an entry in config.lists")
        elif CONFIG_LISTS[m].get("tab") != "house": err(fc, f"house: list {m!r} has tab {CONFIG_LISTS[m].get('tab')!r}, not 'house'")
    for k, v in CONFIG_LISTS.items():
        if v.get("tab") != "house": continue
        for t in secs.get(k) or []:
            try: td = json.load(open(os.path.join(ROOT, "content/src/topics", t + ".json"), encoding="utf-8"))
            except Exception: continue
            for b in td.get("blocks", []):
                if b.get("type") in ("alert", "clinic"): err(f"content/src/topics/{t}.json", f"{b.get('id')}: the Home tab ({k}) gives no medical advice: no '{b['type']}' blocks; link to the Health page instead")
    fa = cfg.get("firstAid")
    if fa is not None:
        if fa.get("title") not in ui["text"] or fa.get("sub") not in ui["text"]: err(fu, "firstAid: title and sub must be ui.text keys")
        if fa.get("say") not in ui["say"]: err(fu, f"say.{fa.get('say')} missing (firstAid.say)")
        if fa.get("image") not in topic_ids: err(fc, "firstAid: image must be a topic id")
        for t in fa.get("topics") or []:
            if t not in topic_ids: err(fc, f"firstAid: unknown topic {t!r}")
        for k in ("notBreathing", "firstAidAll") + tuple(a.get("label", "") + "Short" for a in cfg.get("emergency") or []):
            if k not in ui["text"]: err(fu, f"text.{k} missing (the CPR and first aid screen needs it)")
        for k in ("ui.cprWho", "ui.firstAidAll") + tuple("ui." + a.get("label", "") for a in cfg.get("emergency") or []):
            if k not in ui["say"]: err(fu, f"say.{k} missing (the CPR and first aid screen needs it)")
    sc = cfg.get("shareCard")
    if sc is not None and not (str(sc.get("href", "")).startswith("#/") and sc.get("title") and sc.get("say")): err(fc, "shareCard: needs href (#/...), title and say")
    # the Children and Adults screens: groups in order
    for which, groups in (cfg.get("listGroups") or {}).items():
        if which not in ("children", "adults"): err(fc, f"listGroups: unknown screen {which!r}"); continue
        rests = 0
        for n, g in enumerate(groups):
            w = f"listGroups.{which}[{n}]"
            if "tools" in g:
                for x in g["tools"]:
                    if x not in TOOL_ROWS: err(fc, f"{w}: unknown tool {x!r}")
                continue
            if g.get("title") not in ui["text"]: err(fu, f"text.{g.get('title')} missing ({w}.title)")
            if g.get("say") not in ui["say"]: err(fu, f"say.{g.get('say')} missing ({w}.say)")
            if g.get("rest"): rests += 1
            for t in (g.get("topics") or []) + (g.get("include") or []):
                if t not in topic_ids: err(fc, f"{w}: unknown topic {t!r}")
        if rests != 1: warn(fc, f"listGroups.{which}: give exactly one group rest: true, so that every topic is shown")
    if "emergency" in (cfg.get("home") or []):
        for k in ("emergency", "emergencySub", "emergencyWho", "notBreathing", "otherEmergencies", "sendForCar"):
            if k not in ui["text"]: err(fu, f"text.{k} missing (the Emergency button needs it)")
        for k in ("ui.emergency", "ui.emergencyWho"):
            if k not in ui["say"]: err(fu, f"say.{k} missing (the Emergency button needs it)")
check_anims_and_lists()

# the symptom finder's word list (js/search.js): every key must open something, every list is plain phrases, and
# "danger" (the red Emergency badge) is only for urgent pages
def check_search():
    f = os.path.join(ROOT, "content/src/search-phrases.json")
    if not os.path.exists(f): return
    try: d = json.load(open(f, encoding="utf-8"))
    except Exception as e: err(f, f"invalid JSON: {e}"); return
    topics = {}
    for x in glob.glob(os.path.join(ROOT, "content/src/topics/*.json")):
        try: topics[os.path.basename(x)[:-5]] = json.load(open(x, encoding="utf-8"))
        except Exception: pass
    try: emerg = set(json.load(open(os.path.join(ROOT, "content/src/sections.json"), encoding="utf-8")).get("emergency") or [])
    except Exception: emerg = set()
    screens = {"emergency", "kit", "near", "family", "children", "adults"}
    tools = {"tool/" + t for t in TOOLS}
    urgent_pages = emerg | {"emergency"} | {t for t, x in topics.items() if any(b.get("type") == "alert" and b.get("level") == "urgent" for b in x.get("blocks") or [])}
    review, n = 0, 0
    for k, e in (d.get("pages") or {}).items():
        tid = k.split(".")[0]
        if k in screens or k in tools or k in topics or k == "vaccines": pass
        elif tid in topics and any(b.get("id") == k for b in topics[tid].get("blocks") or []): pass
        else: err(f, f"{k}: opens nothing (not a topic, a topic's block id, a tool or a screen)"); continue
        for fld, v in e.items():
            if fld == "urgent":
                if v is not True: err(f, f"{k}.urgent: use true or leave it out")
                elif tid not in urgent_pages: err(f, f"{k}.urgent: only for urgent pages (Emergency section, or a page with an urgent alert)")
                continue
            if fld not in ("fa", "ps", "lat", "en", "danger"): err(f, f"{k}: unknown field {fld!r} (fa, ps, lat, en, danger, urgent)"); continue
            if not isinstance(v, list) or not all(isinstance(x, str) and x.strip() for x in v): err(f, f"{k}.{fld}: must be a list of phrases"); continue
            if fld == "danger" and v and tid not in urgent_pages: err(f, f"{k}.danger: the red badge is only for urgent pages (Emergency section, or a page with an urgent alert)")
            seen = set()
            for x in v:
                n += 1; review += x.startswith("?")
                y = x.lstrip("?").strip()
                if y in seen: warn(f, f"{k}.{fld}: {y!r} twice")
                seen.add(y)
                if k.startswith("tool/reading") and re.search(r"[0-9۰-۹٠-٩]", y): warn(f, f"{k}.{fld}: {y!r} has a number (readings are found by js/search.js NUM_HINTS)")
                if fld == "danger" and len(y.split()) == 1 and len(y) <= 2: warn(f, f"{k}.danger: {y!r} is very short for a red badge")
                if fld in ("fa", "ps") and re.search(r"[A-Za-z]", y): warn(f, f"{k}.{fld}: {y!r} has Latin letters (put it under lat or en)")
                if fld == "lat" and re.search(r"[\u0600-\u06ff]", y): warn(f, f"{k}.lat: {y!r} has Arabic letters")
    print(f"search-phrases.json: {len(d.get('pages') or {})} pages, {n} phrases, {review} marked ? for native review")
check_search()

# the symptom finder's pictures (content/src/symptoms.json): each opens its own page (#/sym/<id>), danger first.
# A page: "lead" (a ui.ask.* line), "ages" (who is sick), then for each age (or "all") a red box (required: the danger
# signs come first on every page) and an amber box, each {"title": narration id, "items": [narration id, or {id, icon}]},
# reusing the alert lines of the topic pages; "now" (first-aid pages), "tools", "care" (step, tip and do-not blocks of
# the pages) and "pages" (topics to read). Never a Home-tab page (Mo's rule: no medical advice from the Home side).
SYM_AGES = {"baby", "child", "older", "pregnant", "after", "anyone"}
SYM_TOOLS = {"breaths", "reading"}
def check_symptoms():
    f = os.path.join(ROOT, "content/src/symptoms.json")
    if not os.path.exists(f): return
    try:
        d = json.load(open(f, encoding="utf-8"))
        cfg = json.load(open(os.path.join(ROOT, "content/src/config.json"), encoding="utf-8"))
        secs = json.load(open(os.path.join(ROOT, "content/src/sections.json"), encoding="utf-8"))
        ui = json.load(open(os.path.join(ROOT, "content/src/ui.json"), encoding="utf-8"))
    except Exception as e: err(f, f"cannot read: {e}"); return
    topics = {}
    for x in glob.glob(os.path.join(ROOT, "content/src/topics/*.json")):
        try: topics[os.path.basename(x)[:-5]] = json.load(open(x, encoding="utf-8"))
        except Exception: pass
    pages = set(topics) | {"vaccines"}
    house = {t for n, c in (cfg.get("lists") or {}).items() if c.get("tab") == "house" for t in secs.get(n) or []}
    say = set((ui.get("say") or {}))
    for x in glob.glob(os.path.join(ROOT, "content/src/ui-*.json")):
        try: say |= set((json.load(open(x, encoding="utf-8")).get("say") or {}))
        except Exception: pass
    # every narration line of the topic pages: alert titles and items (for the boxes), blocks (for "care")
    lines, blocks, item_icon = set(), {}, {}
    for tid, t in topics.items():
        for b in t.get("blocks") or []:
            blocks[b.get("id")] = (tid, b)
            if b.get("type") in ("alert", "dont"):
                lines.add(b.get("id"))
                for it in b.get("items") or []: lines.add(it.get("id")); item_icon[it.get("id")] = it.get("icon")
    for t in d.get("danger") or []:
        if t not in topics: err(f, f"danger: unknown page {t!r}")
        if t in house: err(f, f"danger: {t} is a Home-tab page")
    srcs = d.get("sources") or {}
    seen = set()
    for s in d.get("symptoms") or []:
        w = f"symptom {s.get('id')}"
        if s.get("id") in seen: err(f, f"{w}: duplicate id")
        seen.add(s.get("id"))
        check_L(f, f"{w}.label", s.get("label"))
        if "go" in s: err(f, f"{w}: \"go\" is gone: the tile opens its own page (\"page\")")
        pg = s.get("page")
        if not isinstance(pg, dict): err(f, f"{w}: no page"); continue
        if pg.get("lead") not in say: err(f, f"{w}: lead {pg.get('lead')!r} is not a spoken line (ui-ask.json)")
        ages = pg.get("ages") or []
        if not ages or any(a not in SYM_AGES for a in ages): err(f, f"{w}: ages must be some of {sorted(SYM_AGES)}")
        if pg.get("default") and pg["default"] not in ages: err(f, f"{w}: default {pg['default']!r} is not one of its ages")
        keys = set(ages) | {"all"}
        def per_age(k):
            v = pg.get(k)
            if v is None: return {}
            if not isinstance(v, dict) or any(a not in keys for a in v): err(f, f"{w}.{k}: by age ({', '.join(ages)}) or \"all\""); return {}
            return v
        red, amber = per_age("red"), per_age("amber")
        for a in ages:
            if a not in red and "all" not in red: err(f, f"{w}: no red 'hospital now' box for {a} (danger signs come first on every page)")
        for lvl, boxes in (("red", red), ("amber", amber)):
            for a, bx in boxes.items():
                bw = f"{w}.{lvl}.{a}"
                if not isinstance(bx, dict) or not bx.get("items"): err(f, f"{bw}: needs a title and items"); continue
                tl = bx.get("title")
                if tl not in lines and tl not in say: err(f, f"{bw}: title {tl!r} is not an alert title or a ui line")
                elif tl in blocks:
                    b = blocks[tl][1]
                    want = "urgent" if lvl == "red" else "soon"
                    if b.get("type") != "alert" or b.get("level") != want: err(f, f"{bw}: title {tl} is not a {want} alert box")
                ids = []
                for it in bx["items"]:
                    iid, ic_ = (it, None) if isinstance(it, str) else (it.get("id"), it.get("icon"))
                    ids.append(iid)
                    if iid in lines:
                        tb = blocks.get(".".join(iid.split(".")[:-1]))
                        if tb and tb[1].get("type") == "alert":
                            want = "urgent" if lvl == "red" else "soon"
                            if tb[1].get("level") != want: err(f, f"{bw}: {iid} is a {tb[1].get('level')} sign, not {want}")
                        if ic_ is not None: check_icon(f, bw, ic_)
                    elif iid in say:
                        if not iid.startswith("ui.ask."): err(f, f"{bw}: {iid}: signs written for these pages are ui.ask.* lines")
                        check_icon(f, f"{bw} {iid}", ic_)
                    else: err(f, f"{bw}: unknown sign {iid!r}")
                if len(set(ids)) != len(ids): err(f, f"{bw}: a sign is listed twice")
        for k in ("now", "pages"):
            for a, ids in per_age(k).items():
                for t in ids:
                    if t not in pages: err(f, f"{w}.{k}.{a}: unknown page {t!r}")
                    elif t in house: err(f, f"{w}.{k}.{a}: {t} is a Home-tab page (no medical advice from the Home side)")
        emerg = set(secs.get("emergency") or [])
        for a, ids in per_age("now").items():
            for t in ids:
                urgent_box = any(b.get("type") == "alert" and b.get("level") == "urgent" for b in (topics.get(t) or {}).get("blocks") or [])
                if t in topics and t not in emerg and t != "first-aid" and not urgent_box: err(f, f"{w}.now.{a}: {t} is not a first-aid page")
        for a, ids in per_age("tools").items():
            for x in ids:
                if x not in SYM_TOOLS: err(f, f"{w}.tools.{a}: unknown tool {x!r} ({sorted(SYM_TOOLS)})")
        for a, ids in per_age("care").items():
            for bid in ids:
                if bid not in blocks: err(f, f"{w}.care.{a}: unknown block {bid!r}"); continue
                tid, b = blocks[bid]
                if b.get("type") not in ("step", "tip", "dont"): err(f, f"{w}.care.{a}: {bid} is a {b.get('type')} block (step, tip or dont)")
                if tid in house: err(f, f"{w}.care.{a}: {bid} is from a Home-tab page")
        if not pg.get("sources"): err(f, f"{w}: sources missing")
        for k in pg.get("sources") or []:
            if k not in srcs: err(f, f"{w}: unknown source {k!r} (the sources table in symptoms.json)")
        if not pg.get("_notes"): warn(f, f"{w}: no _notes saying where each sign comes from")
check_symptoms()
def check_ui_features():
    # content/src/ui-<feature>.json: extra buttons (text) and narrated lines (say) that tools/build.py adds to ui.json's
    fu = os.path.join(ROOT, "content/src/ui.json")
    try: base = json.load(open(fu, encoding="utf-8"))
    except Exception: return
    seen = {part: set(base.get(part) or {}) for part in ("text", "say")}
    for f in sorted(glob.glob(os.path.join(ROOT, "content/src/ui-*.json"))):
        try: d = json.load(open(f, encoding="utf-8"))
        except Exception as e: err(f, f"invalid JSON: {e}"); continue
        for part in ("text", "say"):
            for k, L in (d.get(part) or {}).items():
                if k in seen[part]: err(f, f"{part}.{k} is defined twice (ui.json or another ui-*.json)")
                seen[part].add(k)
                if part == "say" and (not ID_RE.match(k) or not k.startswith("ui.")): err(f, f"say.{k}: narration ids look like ui.<name>")
                check_L(f, f"{part}.{k}", L, 45 if part == "say" else None)
check_ui_features()
# picture-step animations (js/steps.js, docs/STEPS_PLAYER.md): anim/steps/<name>.json and its pictures
STEP_MOTIONS = {"loop", "swap", "fade", "move", "xfade"}
STEP_OVERLAYS = {"ring", "arrow", "guide", "dot", "depth", "tick", "cross", "shade", "icon", "waves", "counter", "timer"}
def check_steps():
    live = ANIM.steps_live()
    for name in live:
        if not os.path.exists(ANIM.steps_path(name)): err(os.path.join(ROOT, "js/anim.js"), f"STEPS lists {name!r} but anim/steps/{name}.json is missing")
    for f in sorted(glob.glob(os.path.join(ROOT, "anim/steps/*.json"))):
        name = os.path.basename(f)[:-5]
        try: d = json.load(open(f, encoding="utf-8"))
        except Exception as e: err(f, f"invalid JSON: {e}"); continue
        W, H = d.get("w"), d.get("h")
        if not (isinstance(W, int) and isinstance(H, int) and W > 0 and H > 0): err(f, "w and h (picture size in pixels) missing"); continue
        if name in live and not str(d.get("approved") or "").strip():
            err(f, "is live (STEPS in js/anim.js) but has no \"approved\" note: only pictures Mo has approved go live")
        pdir = os.path.join(ROOT, (d.get("dir") or f"img/steps/{name}/"))
        layers = {}
        for fr, v in (d.get("frames") or {}).items():
            for L in (v.get("layers") if isinstance(v, dict) else v) or []:
                layers.setdefault(fr, set()).add(L.get("id"))
                if not os.path.exists(os.path.join(pdir, str(L.get("src")))): err(f, f"frame {fr}: picture {L.get('src')} missing in {os.path.relpath(pdir, ROOT)}")
                b = L.get("box")
                if b is not None and not (len(b) == 4 and b[0] >= 0 and b[1] >= 0 and b[0] + b[2] <= W + 1 and b[1] + b[3] <= H + 1): err(f, f"frame {fr} layer {L.get('id')}: box {b} outside the {W}x{H} picture")
        if not layers: err(f, "no frames"); continue
        for n, sc in enumerate(d.get("scenes") or []):
            w = f"scenes[{n}]"
            if not str(sc.get("id", "")).startswith(f"anim.{name}.s") and name in live: err(f, f"{w}: id should be anim.{name}.s<n> (the narration id)")
            if sc.get("frame") not in layers: err(f, f"{w}: unknown frame {sc.get('frame')!r}"); continue
            ids = {m.get("id") for m in sc.get("motions") or [] if m.get("id")}
            for m in sc.get("motions") or []:
                if m.get("type") not in STEP_MOTIONS: err(f, f"{w}: unknown motion type {m.get('type')!r} ({sorted(STEP_MOTIONS)})"); continue
                if m.get("type") == "xfade":
                    if m.get("to") not in layers: err(f, f"{w}: xfade to unknown frame {m.get('to')!r}")
                    continue
                refs = m.get("layers") or ([m["layer"]] if m.get("layer") else [])
                if m.get("type") == "swap":
                    if not m.get("under") or not m.get("layer"): err(f, f"{w}: a swap needs layer (the down version) and under (the up version)")
                    else: refs = refs + [m["under"]]
                for ref in refs:
                    fr, ly = (ref.split(".", 1) if "." in ref else (m.get("frame") or sc["frame"], ref))
                    if ly not in layers.get(fr, set()): err(f, f"{w}: motion on unknown layer {fr}.{ly}")
                if m.get("follow") and m["follow"] not in ids: err(f, f"{w}: follows unknown motion {m['follow']!r}")
                if m.get("type") in ("loop", "swap") and not m.get("follow") and not m.get("rate"): err(f, f"{w}: a {m['type']} needs a rate (per minute)")
            for o in sc.get("overlays") or []:
                if o.get("type") not in STEP_OVERLAYS: err(f, f"{w}: unknown overlay type {o.get('type')!r} ({sorted(STEP_OVERLAYS)})"); continue
                if o.get("follow") and o["follow"] not in ids: err(f, f"{w}: overlay follows unknown motion {o['follow']!r}")
                need = {"ring": ("x", "y"), "arrow": ("from", "to"), "guide": ("from", "to"), "depth": ("x", "y1", "y2"), "tick": ("x", "y"), "cross": ("x", "y"), "shade": ("x", "y"), "dot": ("x", "y"), "icon": ("name", "x", "y"), "waves": ("x", "y")}.get(o["type"], ())
                for k in need:
                    if o.get(k) is None: err(f, f"{w}: {o['type']} needs {k}")
                if o.get("label") is not None and isinstance(o["label"], dict): check_L(f, f"{w}.label", o["label"])
                if o["type"] == "icon" and o.get("name") and not os.path.exists(os.path.join(ROOT, "img/icons", o["name"] + ".svg")): err(f, f"{w}: no icon img/icons/{o['name']}.svg")
        kb = sum(os.path.getsize(p) for p in glob.glob(os.path.join(pdir, "*.webp"))) / 1024
        if name not in live: print(f"anim/steps/{name}.json: not live (not in STEPS in js/anim.js), {kb:.0f} KB of pictures")
check_steps()
# where pictures live (Mo, 9 Oct 2026; docs/STEPS_PLAYER.md): Emergency and CPR picture steps are precached and in the
# APK, every other set downloads on demand. tools/anims.py chooses from the group; nobody sets it by hand.
APK_PICTURES_MB = 3.0   # img/ inside the APK; with code (~1 MB) and the bundled narration (~7 MB) the APK stays ~11 MB
def check_picture_storage():
    live, em = ANIM.steps_live(), ANIM.emergency_anims()
    on_demand = [n for n in live if os.path.exists(ANIM.steps_path(n)) and ANIM.steps_offline(n, em) == "on-demand"]
    for f in sorted(glob.glob(os.path.join(ROOT, "anim/steps/*.json"))):
        try: d = json.load(open(f, encoding="utf-8"))
        except Exception: continue
        if "offline" in d: warn(f, f"\"offline\": {d['offline']!r} is ignored: tools/build.py chooses precache (Emergency and CPR) or on-demand from the animation's group")
    for n in on_demand:
        if not ANIM.has_fallback(n): warn(ANIM.steps_path(n), f"on-demand picture steps with no SVG version (anim/{n}.js): the animation is left off its page until the pictures are downloaded")
    # the generated service worker must not precache an on-demand set (it would be downloaded at the first open)
    sw = os.path.join(ROOT, "sw.js")
    if os.path.exists(sw):
        m = re.search(r"const PRECACHE = (\[.*?\]);", open(sw, encoding="utf-8").read(), re.S)
        pre = json.loads(m.group(1)) if m else []
        for n in on_demand:
            js, pics, folder = ANIM.steps_files(n)
            bad = [p for p in pre if p == f"anim/steps/{n}.json" or p.startswith(folder + "/")]
            if bad: err(sw, f"precaches the on-demand set {n} ({len(bad)} files): run python3 tools/build.py")
        for n in live:
            if n not in on_demand and os.path.exists(ANIM.steps_path(n)) and f"anim/steps/{n}.json" not in pre:
                err(sw, f"does not precache the Emergency / CPR set {n}: run python3 tools/build.py")
    # android/sync-web.sh must leave on-demand sets out of the APK (it reads book.steps)
    sync = os.path.join(ROOT, "android/sync-web.sh")
    if os.path.exists(sync) and '"precache"' not in open(sync, encoding="utf-8").read():
        err(sync, "does not leave on-demand picture steps out of the APK (book.steps \"precache\" check missing)")
    keep = {(json.load(open(ANIM.steps_path(n), encoding="utf-8")).get("dir") or f"img/steps/{n}").rstrip("/") for n in live if n not in on_demand and os.path.exists(ANIM.steps_path(n))}
    total = 0
    for a, dirs, fs in os.walk(os.path.join(ROOT, "img")):
        rel = os.path.relpath(a, ROOT)
        if rel.startswith(os.path.join("img", "_preview")) or (rel.startswith(os.path.join("img", "steps") + os.sep) and not any(rel == k or rel.startswith(k + os.sep) for k in keep)): continue
        total += sum(os.path.getsize(os.path.join(a, f)) for f in fs if not f.startswith("."))
    if total > APK_PICTURES_MB * 1e6:
        warn(os.path.join(ROOT, "img"), f"{total / 1e6:.1f} MB of pictures go into the APK (aim: under {APK_PICTURES_MB:.0f} MB, so the APK stays about 11 MB)")
check_picture_storage()
# Old Android phones (Chrome/WebView before 80) cannot run ?? or ?. and then the app never opens
def check_old_phone_js():
    strip = re.compile(r"""//[^\n]*|/\*.*?\*/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`""", re.S)
    for f in sorted(glob.glob(os.path.join(ROOT, "js", "**", "*.js"), recursive=True)) + sorted(glob.glob(os.path.join(ROOT, "anim", "**", "*.js"), recursive=True)) + [os.path.join(ROOT, "sw.js")]:
        if not os.path.exists(f): continue
        code = strip.sub(lambda m: re.sub(r"[^\n]", " ", m.group(0)), open(f, encoding="utf-8").read())
        for m in re.finditer(r"\?\?|\?\.(?!\d)", code):
            err(f, f"line {code.count(chr(10), 0, m.start()) + 1}: {m.group(0)!r} does not work on old Android phones")
check_old_phone_js()

want = {os.path.abspath(x) for x in files}
show = lambda lst: [x for x in lst if any(x.startswith(os.path.relpath(w, ROOT)) for w in want)] if sys.argv[1:] else lst
E, W = show(errors), show(warnings)
for m in E: print("ERROR  ", m)
for m in W: print("warning", m)
print(f"{len(E)} errors, {len(W)} warnings in {len(want)} file(s)")
sys.exit(1 if E else 0)

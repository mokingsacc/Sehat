#!/usr/bin/env python3
"""Build the app: merge content/src into content/book.json, index audio clips, write sw.js and narration scripts.
Run from anywhere: python3 tools/build.py"""
import json, os, glob, hashlib, datetime, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import anims as ANIM

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = lambda *p: os.path.join(ROOT, *p)
load = lambda p: json.load(open(p, encoding="utf-8"))
LANGS = ("fa", "ps", "en")
AUDIO_EXT = (".mp3", ".m4a", ".ogg", ".opus", ".webm")
VOICES = ("f", "m")  # f = a woman's voice, m = a man's voice
PACKS = ("urgent", "children", "women", "everyone")

ui = load(J("content/src/ui.json"))
# feature files content/src/ui-<feature>.json ({"text": {...}, "say": {...}}) add their buttons and narrated lines to ui.json's
for f in sorted(glob.glob(J("content/src/ui-*.json"))):
    extra = load(f)
    for part in ("text", "say"):
        for k, v in (extra.get(part) or {}).items():
            if k in ui[part]: print(f"WARNING {os.path.basename(f)}: {part}.{k} is also in ui.json (ui.json wins)")
            else: ui[part][k] = v
sections_cfg = load(J("content/src/sections.json"))
config = load(J("content/src/config.json"))
config["contentUrl"] = (config.get("contentUrl") or "").strip().rstrip("/")
if config["contentUrl"] and not config["contentUrl"].startswith("https://"):
    print("WARNING contentUrl should start with https:// (phones may refuse it):", config["contentUrl"])
topics = {}
for f in sorted(glob.glob(J("content/src/topics/*.json"))):
    try:
        t = load(f)
    except Exception as e:
        print("SKIP (invalid JSON)", os.path.basename(f), e); continue
    topics[t["id"]] = t
symptoms = load(J("content/src/symptoms.json"))["symptoms"] if os.path.exists(J("content/src/symptoms.json")) else []
facilities = load(J("content/src/facilities.json")) if os.path.exists(J("content/src/facilities.json")) else {"facilities": []}
vaccines = load(J("content/src/vaccines.json")) if os.path.exists(J("content/src/vaccines.json")) else None
# disease watch: syndromes (case definitions, alert rules) and the places people choose
syndromes = load(J("content/src/syndromes.json")) if os.path.exists(J("content/src/syndromes.json")) else None
districts = load(J("content/src/districts.json")) if os.path.exists(J("content/src/districts.json")) else None

def exists(rel): return os.path.exists(J(rel))

# images: fall back to generic pictures when a topic picture is missing
def topic_image(tid, section):
    for cand in (f"img/topics/{tid}.svg", f"img/topics/{'children' if section == 'children' else 'adults'}-generic.svg"):
        if exists(cand): return cand
    return "img/app/placeholder.svg"

icon_names = set()
def icon(name):
    icon_names.add(name)
    return name if exists(f"img/icons/{name}.svg") else "_dot"

# sections: configured order first, then any extra topics by their own "section" field.
# "kit" (the home health kit screen) lists its own topics; they are not added again to children / adults.
sections = {}
for sec, ids in sections_cfg.items():
    sections[sec] = [i for i in ids if i in topics or (i == "vaccines" and vaccines)]
for tid, t in topics.items():
    sec = t.get("section")
    if tid in sections.get("kit", []): continue
    if sec in sections and tid not in sections[sec]:
        sections[sec].append(tid)
        print("auto-added", tid, "to", sec)

narr = {}
def say(i, L):
    if i in narr: print("WARNING duplicate narration id", i)
    narr[i] = {lg: (L.get(lg) or "").strip() for lg in LANGS}

def join(*Ls, sep=" "):
    return {lg: sep.join(x[lg].strip() for x in Ls if x and x.get(lg)) for lg in LANGS}

for k, L in ui["say"].items(): say(k, L)
# the plain-words sign of each syndrome the app asks about (narrated, kept with the interface lines)
if syndromes:
    for x in syndromes["syndromes"]:
        if x.get("active"): say(f"ui.syn.{x['id']}", x["ask"])

out_topics = {}
for tid, t in topics.items():
    t = dict(t)
    t["image"] = topic_image(tid, t.get("section"))
    say(f"{tid}.title", t["title"])
    for b in t["blocks"]:
        if b.get("icon"): b["icon"] = icon(b["icon"])
        ty = b["type"]
        if b.get("picture"): b["picture"] = f"img/pics/{b['picture']}.svg"
        if ty in ("step", "link"):
            say(b["id"], {lg: (b["title"][lg].rstrip(".:،") + ". " + b["text"][lg]) for lg in LANGS})
        elif ty in ("lead", "tip"):
            say(b["id"], b["text"])
        elif ty == "anim":
            # the block's speaker reads only its title (default: the animation's own title, anim.<name>.title);
            # the scenes are read by the player
            if b.get("title"): say(b["id"], b["title"])
        elif ty in ("alert", "dont"):
            say(b["id"], b["title"])
            for it in b["items"]:
                if it.get("icon"): it["icon"] = icon(it["icon"])
                say(it["id"], it["text"])
    t.pop("review", None)
    out_topics[tid] = t

if vaccines:
    v = dict(vaccines)
    v["image"] = topic_image("vaccines", "children")
    say("vaccines.title", v["title"])
    say(v["lead"]["id"], v["lead"]["text"])
    for vis in v["visits"]:
        parts = {lg: [] for lg in LANGS}
        for d in vis["doses"]:
            for lg in LANGS:
                sep = {"fa": "، برای ", "ps": "، د ", "en": ", against "}[lg]
                tail = {"fa": "", "ps": " پر وړاندې", "en": ""}[lg]
                parts[lg].append(d["name"][lg] + sep + d["protects"][lg] + tail)
        say(vis["id"], {lg: vis["age"][lg] + ": " + ("؛ " if lg != "en" else "; ").join(parts[lg]) + "." for lg in LANGS})
    for n in v.get("notes", []):
        if n.get("icon"): n["icon"] = icon(n["icon"])
        say(n["id"], n["text"])
    for b in v.get("anims") or []:
        if b.get("title"): say(b["id"], b["title"])
    if v.get("women"):
        w = v["women"]
        say(w["id"], join(w["title"], w["text"]))
    v.pop("review", None)
    out_topics["vaccines"] = v

# narration of the explainer animations (content/src/anims.json): every scene, title, picker question and label
anim_text = ANIM.narration()
for k, L in anim_text.items(): say(k, L)
anim_groups = ANIM.groups()

# audio index, one "slot" per language and voice: audio/<lang>-<f|m>/<id>.<ext> (f = woman, m = man).
# The old layout audio/<lang>/ is still read, as the woman's voice of that language.
audio, audio_bytes = {}, {}
for lg in LANGS:
    for v in VOICES:
        slot = f"{lg}-{v}"
        audio[slot], audio_bytes[slot] = {}, {}
        dirs = [slot] + ([lg] if v == "f" else [])
        for d in dirs:
            for f in sorted(glob.glob(J("audio", d, "*"))):
                base, ext = os.path.splitext(os.path.basename(f))
                if ext.lower() not in AUDIO_EXT or base in audio[slot]: continue
                if base not in narr: print("audio without text id:", d, base); continue
                data = open(f, "rb").read()
                audio[slot][base] = f"audio/{d}/{os.path.basename(f)}?v={hashlib.sha1(data).hexdigest()[:8]}"
                audio_bytes[slot][base] = len(data)

missing_icons = sorted(n for n in icon_names if not exists(f"img/icons/{n}.svg"))
book = {
    "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
    "config": config,
    "ui": ui["text"], "months": ui["months"], "langNames": ui["langNames"],
    "sections": sections,
    "topics": out_topics,
    "narration": narr,
    "audio": audio,
    "symptoms": [dict(x, icon=icon(x.get("icon", "warning")), go=[g for g in x["go"] if g in out_topics]) for x in symptoms],
    "facilities": facilities,
    # animations the player can open (anim/<name>.js), the groups with a picker (cpr) and each one's narration ids;
    # the dashboard editor uses this to check "anim" blocks and to rebuild the recording order like this script does
    "anims": {"groups": anim_groups, "ids": {n: ANIM.needed_ids(n) for n in ANIM.names()}},
    "pictures": sorted(os.path.relpath(p, ROOT) for p in glob.glob(J("img/pics/*.svg"))),  # as step and link "picture" in this book
}
if syndromes and districts:
    sym_ids = {x["id"] for x in symptoms}
    book["surveillance"] = {
        "version": syndromes["version"], "rulesVersion": syndromes["alertRules"]["version"],
        "dedupeDays": syndromes.get("dedupeDays", 14),
        "ageGroups": [{"id": a["id"], "name": a["name"]} for a in syndromes["ageGroups"]],
        "syndromes": [{"id": x["id"], "version": x["version"], "name": x["name"],
                       "topics": [t for t in x["topics"] if t in out_topics], "symptoms": [y for y in x["symptoms"] if y in sym_ids]}
                      for x in syndromes["syndromes"] if x.get("active")],
        "province": districts["province"], "districts": districts["districts"], "provinces": districts["provinces"],
    }

# the symptom finder's word list (js/search.js): everyday words and phrases per page, section, tool and screen.
# Only keys that open something in this book are kept; a leading "?" marks a phrase waiting for native review.
SEARCH_SCREENS = {"emergency", "kit", "near", "family", "children", "adults"}
SEARCH_TOOLS = {"tool/breaths", "tool/reading", "tool/reading/temp", "tool/reading/bp", "tool/reading/sugar", "tool/reading/spo2", "tool/reading/muac"}
def search_key_ok(k):
    if k in SEARCH_SCREENS or k in SEARCH_TOOLS or k in out_topics: return True
    tid = k.split(".")[0]
    return tid in out_topics and any(b.get("id") == k for b in out_topics[tid].get("blocks") or [])
if os.path.exists(J("content/src/search-phrases.json")):
    sp = load(J("content/src/search-phrases.json"))
    book["search"] = {"version": sp.get("version", 1), "pages": {
        k: {f: v for f, v in e.items() if v} for k, e in sp["pages"].items() if search_key_ok(k)}}

# narration scripts for the people recording audio
# (an animation's lines come right after the first page that shows it, and go in that page's audio pack)
order, owner = [], {}
for k in ui["say"]: order.append(k)
for k in narr:
    if k.startswith("ui.") and k not in order: order.append(k)
for sec in ("children", "women", "everyone", "kit"):
    for tid in sections.get(sec, []):
        ids = [k for k in narr if k == f"{tid}.title" or k.startswith(tid + ".")]
        t = out_topics.get(tid) or {}
        for b in (t.get("blocks") or []) + (t.get("anims") or []):
            if b.get("type") == "anim": ids += [k for k in ANIM.block_ids(b) if k in anim_text]
        for k in ids:
            if k not in order: order.append(k); owner.setdefault(k, tid)
for k in anim_text:
    if k not in order: order.append(k)
book["order"] = order

# audio packs: the phone downloads the chosen voice pack by pack, most important first.
# urgent = interface lines, every topic title, every red "go to hospital now" box, and the urgent topics (config.urgentTopics);
# then children, women, everyone (a topic in two sections goes in the first). Same rule as packIds() in server/worker.js.
urgent_topics = set(config.get("urgentTopics") or ["danger-child", "pregnancy-danger", "red-flags", "first-aid"])
urgent_ids = set()
for tid, t in out_topics.items():
    for b in t.get("blocks") or []:
        if b.get("type") == "alert" and b.get("level") == "urgent":
            urgent_ids.add(b["id"]); urgent_ids.update(it["id"] for it in b.get("items", []))
pack_ids = {p: [] for p in PACKS}
for k in order + [k for k in narr if k not in order]:
    tid = owner.get(k) or k.split(".")[0]
    if k.startswith("ui.") or tid in urgent_topics or k == tid + ".title" or k in urgent_ids: p = "urgent"
    else: p = next((sec for sec in PACKS[1:] if tid in sections.get(sec, [])), "everyone")
    pack_ids[p].append(k)
# size of each pack per voice: [bytes, clips] (the phone shows it in Settings before downloading)
pack_size = {slot: {p: [sum(audio_bytes[slot].get(k, 0) for k in ids), sum(1 for k in ids if k in audio[slot])] for p, ids in pack_ids.items()}
             for slot in audio if audio[slot]}
book["packs"] = {"order": list(PACKS), "ids": pack_ids, "size": pack_size}

# precache list: everything the app needs offline except audio
pre = ["./", "index.html", "manifest.webmanifest", "content/book.json"] + [p for p in ("content/who-growth.json",) if exists(p)]  # WHO growth tables (js/growth.js)
for pat in ("css/*.css", "js/*.js", "js/cine/*.js", "anim/*.js", "anim/cine/*.js", "fonts/*.woff2", "fonts/*.css", "img/icons/*.svg", "img/topics/*.svg", "img/pics/*.svg", "img/app/*.svg", "img/app/*.png"):
    pre += sorted(os.path.relpath(p, ROOT) for p in glob.glob(J(pat)))
# js/cine/*.js is the CPR drawing kit and anim/cine/*.js the CPR versions built with it: js/anim.js loads anim/cine/<name>.js
# when it is there and falls back to the SVG version when it is not, so precache whatever exists (sub-folders are listed
# explicitly because these globs do not recurse). anim/*-3d.js (an earlier plan) is still left out.
pre = [p for p in pre if not p.startswith("js/sw") and not p.endswith("-3d.js")]

# version = hash of all precached content (not of the build time: rebuilding the same content keeps the same version,
# so phones do not download an "update" that changes nothing)
hsh = hashlib.sha1()
book_bytes = json.dumps(dict(book, built=""), ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
hsh.update(book_bytes)
for p in pre:
    if p in ("./", "content/book.json"): continue
    hsh.update(p.encode()); hsh.update(open(J(p), "rb").read())
version = datetime.date.today().strftime("%Y.%m.%d") + "-" + hsh.hexdigest()[:6]
try:
    prev = json.load(open(J("content/book.json"), encoding="utf-8"))
    if str(prev.get("version", "")).endswith("-" + hsh.hexdigest()[:6]) and prev.get("built"):
        version, book["built"] = prev["version"], prev["built"]
except (OSError, ValueError):
    pass
book["version"] = version

os.makedirs(J("content"), exist_ok=True)
json.dump(book, open(J("content/book.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump({"version": version, "built": book["built"]}, open(J("content/version.json"), "w"))

sw = open(J("js/sw.template.js"), encoding="utf-8").read()
sw = sw.replace("__VERSION__", version).replace("__PRECACHE__", json.dumps(pre, indent=1))
open(J("sw.js"), "w", encoding="utf-8").write(sw)

# the server's copy of the definitions (server/surveillance.js imports it): one source of truth, content/src/syndromes.json
if syndromes and districts:
    defs = {"version": syndromes["version"], "dedupeDays": syndromes.get("dedupeDays", 14),
            "ageGroups": [{"id": a["id"], "en": a["name"]["en"]} for a in syndromes["ageGroups"]],
            "syndromes": [{k: x[k] for k in ("id", "active", "version", "history", "definition", "topics", "symptoms", "source")} | {"en": x["name"]["en"], "ask": x["ask"]["en"]}
                          for x in syndromes["syndromes"]],
            "alertRules": syndromes["alertRules"], "suppression": syndromes["suppression"],
            "placesVersion": districts["version"],
            "places": [{"id": d["id"], "en": d["name"]["en"], "province": "Samangan"} for d in districts["districts"]]
                      + [{"id": d["id"], "en": d["name"]["en"] + " (province)", "province": d["name"]["en"]} for d in districts["provinces"]]}
    with open(J("server/surveillance-defs.js"), "w", encoding="utf-8") as fh:
        fh.write("// GENERATED by tools/build.py from content/src/syndromes.json and content/src/districts.json. Do not edit by hand.\n")
        fh.write("export default " + json.dumps(defs, ensure_ascii=False, indent=1) + ";\n")

# the server's copy of the book's sections, English titles and privacy wording (server/usage.js imports it for the
# "What people use" dashboard and the /privacy page)
usage_defs = {"urgent": [t for t in (config.get("urgentTopics") or []) if t in out_topics],
              "sections": {k: list(v) for k, v in sections.items()},
              "titles": {tid: (t.get("title") or {}).get("en", tid) for tid, t in out_topics.items()},
              "consentVersion": config.get("consentVersion"),
              "privacy": {"ids": [k for k in ui["say"] if k.startswith("ui.privacy.")],
                          "text": {k: v for k, v in ui["say"].items() if k.startswith("ui.privacy.")}}}
with open(J("server/usage-defs.js"), "w", encoding="utf-8") as fh:
    fh.write("// GENERATED by tools/build.py from content/src (sections, topic titles, privacy wording). Do not edit by hand.\n")
    fh.write("export default " + json.dumps(usage_defs, ensure_ascii=False, indent=1) + ";\n")

os.makedirs(J("content/scripts"), exist_ok=True)
for lg in ("fa", "ps"):
    with open(J(f"content/scripts/narration-{lg}.tsv"), "w", encoding="utf-8") as fh:
        fh.write("id\ttext\tenglish\n")
        for k in order: fh.write(f"{k}\t{narr[k][lg]}\t{narr[k]['en']}\n")

words = sum(len(narr[k]["en"].split()) for k in narr)
print(f"version {version}: {len(out_topics)} topics, {len(narr)} narration clips (~{words/150:.0f} min of English-equivalent speech), "
      f"{len(pre)} precached files")
for slot in audio:
    if audio[slot]: print(f"  audio {slot}: {len(audio[slot])} clips, " + ", ".join(f"{p} {pack_size[slot][p][1]} clips {pack_size[slot][p][0] / 1e6:.1f} MB" for p in PACKS))
print("  packs (clips each voice needs): " + ", ".join(f"{p} {len(pack_ids[p])}" for p in PACKS))
if missing_icons: print("missing icons (shown as dots):", " ".join(missing_icons))

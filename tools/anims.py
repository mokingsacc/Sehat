"""Explainer animations (anim/<name>.js, played by js/anim.js), as tools/build.py and tools/validate.py see them.
Only reads the files: anim/*.js and js/anim.js belong to the animation player and are never changed here."""
import glob, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NARRATION = os.path.join(ROOT, "content/src/anims.json")


def names():
    """Animation files: anim/<name>.js (anim/demo.html is a preview page, not an animation), plus picture-step
    animations that are live (listed in STEPS in js/anim.js, with anim/steps/<name>.json).
    anim/*-3d.js are 3D versions that js/anim.js may load itself later; they are not animations of their own."""
    js = {os.path.basename(p)[:-3] for p in glob.glob(os.path.join(ROOT, "anim/*.js")) if not p.endswith("-3d.js")}
    return sorted(js | {n for n in steps_live() if os.path.exists(steps_path(n))})


def steps_path(name):
    return os.path.join(ROOT, "anim/steps", name + ".json")


def steps_live():
    """Names in STEPS in js/anim.js: picture-step versions (js/steps.js) the app plays. Empty until Mo approves."""
    try:
        src = open(os.path.join(ROOT, "js/anim.js"), encoding="utf-8").read()
    except OSError:
        return []
    m = re.search(r"export const STEPS\s*=\s*\[(.*?)\]", src, re.S)
    return re.findall(r"['\"]([a-z0-9-]+)['\"]", m.group(1)) if m else []


def narration():
    """{id: {fa, ps, en}} from content/src/anims.json; keys starting with "_" are notes, not narration."""
    if not os.path.exists(NARRATION): return {}
    d = json.load(open(NARRATION, encoding="utf-8"))
    return {k: v for k, v in d.items() if not k.startswith("_")}


def groups():
    """Groups of variants with an age picker first, e.g. {"cpr": ["cpr-newborn", "cpr-baby", ...]}.
    Read from GROUPS in js/anim.js; if that cannot be read, a name with an "anim.<name>.ask" line and no file of
    its own is a group of the files named <name>-*."""
    out = {}
    try:
        src = open(os.path.join(ROOT, "js/anim.js"), encoding="utf-8").read()
        m = re.search(r"GROUPS\s*=\s*\{(.*?)\n\};", src, re.S)
        if m:
            body = m.group(1)
            keys = list(re.finditer(r"^\s{1,4}['\"]?([a-z0-9-]+)['\"]?\s*:\s*\{", body, re.M))
            for i, k in enumerate(keys):
                seg = body[k.end(): keys[i + 1].start() if i + 1 < len(keys) else len(body)]
                items = re.findall(r"anim\s*:\s*['\"]([a-z0-9-]+)['\"]", seg)
                if items: out[k.group(1)] = items
    except OSError:
        pass
    if not out:
        files, n = set(names()), narration()
        for k in n:
            g = k.split(".")[1] if k.count(".") >= 2 else None
            if g and k == f"anim.{g}.ask" and g not in files:
                out[g] = [f for f in sorted(files) if f.startswith(g + "-")]
    return out


def steps_data(name):
    """The JSON of a live picture-step set (anim/steps/<name>.json), or None (not live, missing or broken)."""
    if name not in steps_live() or not os.path.exists(steps_path(name)): return None
    try:
        d = json.load(open(steps_path(name), encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return d if isinstance(d, dict) else None


def scene_ids(name):
    """The narration ids of an animation's scenes, in order (anim.<name>.s1, ...). A live picture-step version
    (anim/steps/<name>.json) is what plays, so its scenes count. Such a set may instead read its topic page's own
    lines (choking-baby.back, unconscious.roll, ...): Mo's sets of 9 Oct 2026 do (docs/STEPS_PLAYER.md)."""
    d = steps_data(name)
    if d is not None:
        try:
            return [sc["id"] for sc in d.get("scenes") or [] if sc.get("id")]
        except (AttributeError, TypeError):
            return []
    p = os.path.join(ROOT, "anim", name + ".js")
    if not os.path.exists(p): return []
    src = open(p, encoding="utf-8").read()
    seen = []
    for i in re.findall(r"['\"](anim\." + re.escape(name) + r"\.s\d+)['\"]", src):
        if i not in seen: seen.append(i)
    return seen


def title_id(name):
    """The narration id of an animation's title: anim.<name>.title, or for a live picture-step set whose "id" is a topic
    (it reads that page's own lines) the page's title, <topic>.title, as js/anim.js shows it (d.id + '.title')."""
    d = steps_data(name)
    sid = str((d or {}).get("id") or "")
    return f"{sid}.title" if sid and sid != f"anim.{name}" else f"anim.{name}.title"


def own_line(i):
    """An animation's own narration line (content/src/anims.json, anim.*), not a line it borrows from a page or the
    interface (those are recorded and translated with their page)."""
    return i.startswith("anim.")


def needed_ids(name):
    """Every narration id an animation (or a group) needs: its title and scenes; a group also its question,
    each variant's label and everything each variant needs. Lines a picture-step set borrows from its page are
    included (they must exist); they come with the page, not with content/src/anims.json."""
    g = groups().get(name)
    if g is not None:
        ids = [f"anim.{name}.title", f"anim.{name}.ask"] + [f"anim.{v}.label" for v in g]
        for v in g: ids += needed_ids(v)
        return ids
    return [title_id(name)] + scene_ids(name)


def claims(block):
    """The animation names an "anim" block can play: the animation itself, the chosen variant, a group's variants."""
    out = [block.get("anim")]
    if block.get("pick"): out.append(block["pick"])
    out += groups().get(block.get("anim"), [])
    return [x for i, x in enumerate(out) if x and x not in out[:i]]


def block_ids(block):
    """The narration ids an "anim" block brings to its page, in recording order. With pick: the group's picker
    lines and that one variant (the other variants come with their own pages); otherwise everything it can play.
    Only the animation's own lines (anim.*): the page lines a picture-step set reads are recorded with their page,
    so they are neither asked for twice nor moved to another page's recording order."""
    a, pick = block.get("anim"), block.get("pick")
    g = groups().get(a)
    if pick and g is not None:
        ids = [f"anim.{a}.title", f"anim.{a}.ask"] + [f"anim.{v}.label" for v in g] + needed_ids(pick)
    else:
        ids = needed_ids(a)
    return [i for n, i in enumerate(ids) if own_line(i) and i not in ids[:n]]


def page_lines():
    """Every narration id the book has outside content/src/anims.json, from content/src as tools/build.py writes them:
    the interface lines (ui.json and ui-*.json "say"), and each topic's title, summary and spoken blocks (and the
    vaccines page). A picture-step scene may read one of these instead of an anim.<name>.s<n> line."""
    src = os.path.join(ROOT, "content/src")
    out = set()
    for f in [os.path.join(src, "ui.json")] + sorted(glob.glob(os.path.join(src, "ui-*.json"))):
        out.update((_load(f).get("say") or {}).keys())
    for f in sorted(glob.glob(os.path.join(src, "topics", "*.json"))):
        t = _load(f)
        tid = t.get("id")
        if not tid: continue
        out.add(f"{tid}.title")
        if t.get("summary"): out.add(f"{tid}.summary")
        for b in t.get("blocks") or []:
            if not isinstance(b, dict) or not b.get("id"): continue
            if b.get("type") != "anim" or b.get("title"): out.add(b["id"])
            out.update(it["id"] for it in b.get("items") or [] if isinstance(it, dict) and it.get("id"))
    v = _load(os.path.join(src, "vaccines.json"))
    if v:
        out.add("vaccines.title")
        if v.get("summary"): out.add("vaccines.summary")
        for x in [v.get("lead"), v.get("women")] + (v.get("visits") or []) + (v.get("notes") or []) + [b for b in v.get("anims") or [] if b.get("title")]:
            if isinstance(x, dict) and x.get("id"): out.add(x["id"])
    return out


# ---------- where the pictures of a picture-step animation live (Mo, 9 Oct 2026) ----------
# Emergency and CPR sets are inside the APK and precached on the website from the first open; every other set is
# "on-demand": it downloads the first time its page is opened (online), is then kept on the phone, and the
# animation's fallback (the SVG version, or the page's own text steps) shows until then. Chosen here from the
# animation's group, never by hand: tools/build.py writes it into book.json (book.steps) and the precache list,
# android/sync-web.sh leaves on-demand sets out of the APK, tools/validate.py checks it. docs/STEPS_PLAYER.md.
SRC = os.path.join(ROOT, "content/src")


def _load(p):
    try:
        return json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def emergency_topics():
    """Topics of the Emergency group: the Emergency section, every Emergency card's topics, CPR page and film
    (config.json "emergency"), every CPR and choking topic (cpr-*, choking*) and the newborn topic."""
    sections, config = _load(os.path.join(SRC, "sections.json")), _load(os.path.join(SRC, "config.json"))
    out = set(sections.get("emergency") or [])
    for card in config.get("emergency") or []:
        out.update(card.get("topics") or [])
        if card.get("cpr"): out.add(card["cpr"])
    every = {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(SRC, "topics", "*.json"))}
    out.update(t for t in every if re.match(r"(cpr|choking)\b", t) or t == "newborn")
    return out


def _anim_blocks(x):
    """Every "anim" block anywhere inside a topic's JSON."""
    if isinstance(x, dict):
        if x.get("type") == "anim" and x.get("anim"): yield x
        for v in x.values(): yield from _anim_blocks(v)
    elif isinstance(x, list):
        for v in x: yield from _anim_blocks(v)


def emergency_anims():
    """Animations the Emergency group plays: the anim blocks of its topics (a group such as cpr brings all its
    variants) and the Emergency cards' "watch how" films."""
    out = set()
    for t in emergency_topics():
        for b in _anim_blocks(_load(os.path.join(SRC, "topics", t + ".json"))): out.update(claims(b))
    for card in _load(os.path.join(SRC, "config.json")).get("emergency") or []:
        if card.get("anim"): out.update(claims({"anim": card["anim"]}))
    return out


def steps_offline(name, em=None):
    """"precache" (inside the APK, precached from the first open) or "on-demand" (downloaded when its page opens)."""
    return "precache" if name in (emergency_anims() if em is None else em) else "on-demand"


def steps_files(name):
    """(json, [pictures]) of a picture-step set, as paths from the app root with the ?v= the player asks for
    (the JSON's own hash; each picture's "v")."""
    import hashlib
    p = steps_path(name)
    raw = open(p, "rb").read()
    d = json.loads(raw)
    folder = (d.get("dir") or f"img/steps/{name}/").rstrip("/")
    pics = []
    for fr in (d.get("frames") or {}).values():
        for L in (fr.get("layers") if isinstance(fr, dict) else fr) or []:
            f = f"{folder}/{L['src']}" + (f"?v={L['v']}" if L.get("v") else "")
            if f not in pics: pics.append(f)
    return f"anim/steps/{name}.json?v={hashlib.sha1(raw).hexdigest()[:8]}", pics, folder


def has_fallback(name):
    """An SVG version (anim/<name>.js) that plays while an on-demand set is not on the phone."""
    return os.path.exists(os.path.join(ROOT, "anim", name + ".js"))


def apk_steps_keep(steps):
    """From book.steps: (set names, picture folders) that go inside the APK: the "precache" sets only."""
    keep = {n for n, e in (steps or {}).items() if e.get("offline") == "precache"}
    return keep, {os.path.normpath((steps[n].get("dir") or f"img/steps/{n}").rstrip("/")) for n in keep}


def prune_apk(out, steps):
    """Remove from an APK folder (android/sync-web.sh) every picture-step folder and JSON that is not a precache set
    (on-demand sets, sets not live yet, leftovers), and inside a precache set's folder every file its JSON does not
    name (a held or unused picture). Returns (kept names, removed paths, removed bytes)."""
    import shutil
    keep, keep_dirs = apk_steps_keep(steps)
    named = {os.path.normpath(f.split("?")[0]) for n in keep for f in (steps[n].get("files") or [])[1:]}
    gone, size = [], 0
    for d in sorted(glob.glob(os.path.join(out, "img/steps/*"))):
        rel = os.path.normpath(os.path.relpath(d, out))
        if rel in keep_dirs:
            for a, _, fs in os.walk(d):
                for f in fs:
                    r = os.path.normpath(os.path.relpath(os.path.join(a, f), out))
                    if r not in named: size += os.path.getsize(os.path.join(a, f)); os.remove(os.path.join(a, f)); gone.append(r)
            continue
        if os.path.isdir(d):
            size += sum(os.path.getsize(os.path.join(a, f)) for a, _, fs in os.walk(d) for f in fs); shutil.rmtree(d)
        else:
            size += os.path.getsize(d); os.remove(d)
        gone.append(rel)
    for f in sorted(glob.glob(os.path.join(out, "anim/steps/*"))):
        if f.endswith(".json") and os.path.basename(f)[:-5] in keep: continue
        if os.path.isdir(f): shutil.rmtree(f)
        else: size += os.path.getsize(f); os.remove(f)
        gone.append(os.path.relpath(f, out))
    return sorted(keep), gone, size


def steps_book(names, em=None):
    """book.steps for these live set names, as tools/build.py writes it (tools/validate.py compares)."""
    em = emergency_anims() if em is None else em
    out = {}
    for name in names:
        if not os.path.exists(steps_path(name)): continue
        js, pics, folder = steps_files(name)
        missing = [f for f in pics if not os.path.exists(os.path.join(ROOT, f.split("?")[0]))]
        if missing: raise FileNotFoundError(f"anim/steps/{name}.json names pictures that are missing: {', '.join(missing)}")
        out[name] = {"offline": steps_offline(name, em), "dir": folder + "/", "files": [js] + pics,
                     "bytes": sum(os.path.getsize(os.path.join(ROOT, f.split("?")[0])) for f in [js] + pics),
                     "fallback": has_fallback(name)}
    return out

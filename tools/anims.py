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


def scene_ids(name):
    """The narration ids of an animation's scenes, in order (anim.<name>.s1, ...). A live picture-step version
    (anim/steps/<name>.json) is what plays, so its scenes count."""
    if name in steps_live() and os.path.exists(steps_path(name)):
        try:
            return [sc["id"] for sc in json.load(open(steps_path(name), encoding="utf-8")).get("scenes") or [] if sc.get("id")]
        except (OSError, ValueError, TypeError):
            return []
    p = os.path.join(ROOT, "anim", name + ".js")
    if not os.path.exists(p): return []
    src = open(p, encoding="utf-8").read()
    seen = []
    for i in re.findall(r"['\"](anim\." + re.escape(name) + r"\.s\d+)['\"]", src):
        if i not in seen: seen.append(i)
    return seen


def needed_ids(name):
    """Every narration id an animation (or a group) needs: its title and scenes; a group also its question,
    each variant's label and everything each variant needs."""
    g = groups().get(name)
    if g is not None:
        ids = [f"anim.{name}.title", f"anim.{name}.ask"] + [f"anim.{v}.label" for v in g]
        for v in g: ids += needed_ids(v)
        return ids
    return [f"anim.{name}.title"] + scene_ids(name)


def claims(block):
    """The animation names an "anim" block can play: the animation itself, the chosen variant, a group's variants."""
    out = [block.get("anim")]
    if block.get("pick"): out.append(block["pick"])
    out += groups().get(block.get("anim"), [])
    return [x for i, x in enumerate(out) if x and x not in out[:i]]


def block_ids(block):
    """The narration ids an "anim" block brings to its page, in recording order. With pick: the group's picker
    lines and that one variant (the other variants come with their own pages); otherwise everything it can play."""
    a, pick = block.get("anim"), block.get("pick")
    g = groups().get(a)
    if pick and g is not None:
        return [f"anim.{a}.title", f"anim.{a}.ask"] + [f"anim.{v}.label" for v in g] + needed_ids(pick)
    return needed_ids(a)


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
    (config.json "emergency"), and every CPR, choking and newborn topic."""
    sections, config = _load(os.path.join(SRC, "sections.json")), _load(os.path.join(SRC, "config.json"))
    out = set(sections.get("emergency") or [])
    for card in config.get("emergency") or []:
        out.update(card.get("topics") or [])
        if card.get("cpr"): out.add(card["cpr"])
    every = {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(SRC, "topics", "*.json"))}
    out.update(t for t in every if re.search(r"^(cpr|choking)\b|newborn", t))
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

"""Explainer animations (anim/<name>.js, played by js/anim.js), as tools/build.py and tools/validate.py see them.
Only reads the files: anim/*.js and js/anim.js belong to the animation player and are never changed here."""
import glob, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NARRATION = os.path.join(ROOT, "content/src/anims.json")


def names():
    """Animation files: anim/<name>.js (anim/demo.html is a preview page, not an animation).
    anim/*-3d.js are 3D versions that js/anim.js may load itself later; they are not animations of their own."""
    return sorted(os.path.basename(p)[:-3] for p in glob.glob(os.path.join(ROOT, "anim/*.js")) if not p.endswith("-3d.js"))


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
    """The narration ids of an animation's scenes, in order (anim.<name>.s1, ...)."""
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

"""The skills graph (P25a, C4.1): one reviewed prerequisite graph per subject, as content.

`content/graph/<subject>.json`:

    {"subject": "maths", "version": "2027.07.01",
     "nodes": [{"id": "frac-add", "needs": ["frac-what"], "lessons": ["maths-7-fractions-add"],
                "title": {"prs": "...", "ps": "...", "en": "Add fractions"}}],
     "pathways": [{"id": "s1-fractions", "goal": ["frac-add"], "bands": ["s1"], "final": "maths-7-fractions-add",
                   "certificate": true, "title": {...}}],
     "review": {"status": "draft", "needs": ["maths teacher"], "signoffs": [...]}}

The graph, not the lesson, holds the mapping (`nodes[].lessons`), so a lesson's content hash and signatures do not move
when the graph does and Pack 1 is not signed again (C4.1). A lesson in no node is allowed: its plans fall back to pack
order, as P22's do. The graph is signed like `links.json`: its content hash (everything but `review`), by a subject
teacher, and by an adult educator too where a pathway lists `ad`. In release mode an unsigned graph is not served.

Checks (here, at the hub's start, and in tools/validate_pack.py): ids unique and lower case; every `needs` exists;
no cycles; every listed lesson exists and is listed once; every pathway's goal has a lesson for each of its bands;
`final` is a lesson with a sheet; no certificate for a Quran or seerah pathway (a religious certificate is a
scholar's to give, C4.2). Nothing about a learner is in a graph: it is content only.
"""
import json
import re
from pathlib import Path

from . import licences

GRAPH_KEYS = {"subject", "version", "nodes", "pathways", "review"}
NODE_KEYS = {"id", "needs", "lessons", "title"}
PATH_KEYS = {"id", "goal", "bands", "final", "certificate", "title"}
BANDS = ("ey", "p1", "p2", "s1", "s2", "ad")
NO_CERTIFICATE = ("quran", "seerah")
_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")
_SUBJECT = re.compile(r"^[a-z][a-z0-9-]{1,23}$")


def graph_hash(g: dict) -> str:
    """What reviewers sign: the graph without its review block."""
    body = {k: v for k, v in g.items() if k != "review"}
    return licences.sha256_text(json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def cycle(nodes: dict) -> list[str] | None:
    """A cycle among the nodes' `needs`, as a list of ids, or None."""
    state: dict[str, int] = {}
    path: list[str] = []

    def visit(n):
        state[n] = 1
        path.append(n)
        for m in nodes.get(n, {}).get("needs", []):
            if m not in nodes:
                continue
            if state.get(m) == 1:
                return path[path.index(m):] + [m]
            if not state.get(m):
                found = visit(m)
                if found:
                    return found
        path.pop()
        state[n] = 2
        return None

    for n in nodes:
        if not state.get(n):
            found = visit(n)
            if found:
                return found
    return None


def check(g, known: dict, where: str) -> list[str]:
    """Every problem with one graph file. `known`: lesson id -> {"band", "sheet"} for every lesson that loaded."""
    from .packs import _check_text, check_review      # packs imports this module lazily
    if not isinstance(g, dict):
        return [f"{where}: a graph is one JSON object"]
    p = []
    if set(g) - GRAPH_KEYS:
        p.append(f"{where}: unknown fields {sorted(set(g) - GRAPH_KEYS)}")
    if not isinstance(g.get("subject"), str) or not _SUBJECT.match(g["subject"]):
        p.append(f"{where}: subject must be lower case, like maths")
    if not isinstance(g.get("version"), str) or not g["version"].strip():
        p.append(f"{where}: version missing")
    nodes = g.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return p + [f"{where}: needs at least one node"]
    by_id, listed = {}, {}
    for i, n in enumerate(nodes, 1):
        w = f"{where} node {i}"
        if not isinstance(n, dict) or set(n) - NODE_KEYS:
            p.append(f"{w}: a node is {{id, needs, lessons, title}}")
            continue
        nid = n.get("id")
        if not isinstance(nid, str) or not _ID.match(nid):
            p.append(f"{w}: id must be lower-case letters, digits and dashes")
            continue
        if nid in by_id:
            p.append(f"{where}: two nodes have the id {nid}")
        by_id[nid] = n
        _check_text(n.get("title"), f"{w} ({nid}) title", p)
        for key in ("needs", "lessons"):
            v = n.get(key, [])
            if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
                p.append(f"{w} ({nid}): {key} must be a list of ids")
        for lid in n.get("lessons", []) if isinstance(n.get("lessons", []), list) else []:
            if lid not in known:
                p.append(f"{w} ({nid}): no lesson {lid}")
            elif lid in listed:
                p.append(f"{where}: lesson {lid} is in two nodes ({listed[lid]} and {nid})")
            else:
                listed[lid] = nid
    for nid, n in by_id.items():
        for m in n.get("needs", []) if isinstance(n.get("needs", []), list) else []:
            if m not in by_id:
                p.append(f"{where} node {nid}: needs {m}, which is not a node")
            elif m == nid:
                p.append(f"{where} node {nid}: needs itself")
    loop = cycle({k: {"needs": [x for x in (v.get("needs") or []) if isinstance(x, str)]} for k, v in by_id.items()})
    if loop:
        p.append(f"{where}: the needs go round in a circle: {' -> '.join(loop)}")
    seen = set()
    for i, pw in enumerate(g.get("pathways") or [], 1):
        w = f"{where} pathway {i}"
        if not isinstance(pw, dict) or set(pw) - PATH_KEYS:
            p.append(f"{w}: a pathway is {{id, goal, bands, final, certificate, title}}")
            continue
        pid = pw.get("id")
        if not isinstance(pid, str) or not _ID.match(pid) or pid in seen:
            p.append(f"{w}: id must be lower case, and once only")
            continue
        seen.add(pid)
        _check_text(pw.get("title"), f"{w} ({pid}) title", p)
        goal = pw.get("goal")
        if not isinstance(goal, list) or not goal or any(x not in by_id for x in goal):
            p.append(f"{w} ({pid}): goal must list nodes of this graph")
            goal = []
        bands = pw.get("bands")
        if not isinstance(bands, list) or not bands or any(b not in BANDS for b in bands):
            p.append(f"{w} ({pid}): bands must list bands, like [\"ad\"]")
            bands = []
        have = {known[lid]["band"] for x in goal for lid in by_id[x].get("lessons", []) if lid in known}
        for b in bands:
            if b not in have:
                p.append(f"{w} ({pid}): its goal has no lesson for band {b}")
        if "final" in pw:
            f = pw["final"]
            if f not in known or not known[f]["sheet"]:
                p.append(f"{w} ({pid}): final must be a lesson with a sheet")
        if "certificate" in pw and not isinstance(pw["certificate"], bool):
            p.append(f"{w} ({pid}): certificate must be true or false")
        if pw.get("certificate") and g.get("subject") in NO_CERTIFICATE:
            p.append(f"{w} ({pid}): no certificate for a Quran or seerah pathway (a scholar's to give)")
    p += check_review(g.get("review"), where)
    return p


def release_problems(g: dict, state: str, where: str) -> list[str]:
    """Why a graph may not reach learners yet: unsigned, or its reviewers missing a subject teacher, or an adult
    educator where a pathway lists `ad`."""
    p = []
    if state != "signed":
        p.append(f"{where}: not signed by its reviewers yet" + (" (changed since it was signed)" if state == "changed" else ""))
    needs = (g.get("review") or {}).get("needs") or []
    if not any("teacher" in r for r in needs):
        p.append(f"{where}: the review must include a subject teacher")
    if any("ad" in (pw.get("bands") or []) for pw in g.get("pathways") or []) and "adult educator" not in needs:
        p.append(f"{where}: a pathway for adults, so the review must include an adult educator")
    return p


def load(folder: Path, known: dict, *, release: bool) -> tuple[dict, list[str], list[str]]:
    """(graphs by subject, problems, hidden): each graph with `_hash`, `_state` and `_file`."""
    from .packs import review_state
    graphs, problems, hidden = {}, [], []
    for f in sorted(Path(folder).glob("*.json")) if Path(folder).is_dir() else []:
        where = f"graph/{f.name}"
        try:
            g = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            problems.append(f"{where}: {e}")
            continue
        probs = check(g, known, where)
        if not probs and g["subject"] != f.stem:
            probs.append(f"{where}: the file name and the subject inside differ")
        if probs:
            problems += probs
            continue
        h = graph_hash(g)
        state = review_state(g, h)
        if release:
            why = release_problems(g, state, where)
            if why:
                hidden += why
                continue
        graphs[g["subject"]] = {**g, "_hash": h, "_state": state, "_file": f}
    return graphs, problems, hidden


def for_app(graphs: dict, served) -> list[dict]:
    """The graphs as the phone needs them: nodes with the lessons this server serves, pathways whose goal still has
    one, and whether the graph is a draft. No review block."""
    out = []
    for subject, g in graphs.items():
        nodes = [{"id": n["id"], "needs": list(n.get("needs") or []), "title": n["title"],
                  "lessons": [x for x in n.get("lessons") or [] if x in served]} for n in g["nodes"]]
        has = {n["id"]: bool(n["lessons"]) for n in nodes}
        paths = [{"id": pw["id"], "goal": list(pw["goal"]), "bands": list(pw["bands"]), "title": pw["title"],
                  "final": pw.get("final") if pw.get("final") in served else None,
                  "certificate": bool(pw.get("certificate"))}
                 for pw in g.get("pathways") or [] if any(has.get(x) for x in pw["goal"])]
        out.append({"subject": subject, "version": g["version"], "draft": g["_state"] != "signed",
                    "nodes": nodes, "pathways": paths})
    return out


def _title_words(n: dict) -> set[str]:
    from .packs import text as pick_text
    from .textnorm import tokens
    return set(tokens(" ".join(pick_text(n.get("title"), c) for c in ("prs", "ps", "en"))))


def band_nodes(graphs: dict, lessons) -> list[tuple[dict, list[str]]]:
    """Every node with a lesson among `lessons` (her band's, in pack order): (node, those lessons)."""
    order = {lid: i for i, lid in enumerate(lessons)}
    out = []
    for g in graphs.values():
        for n in g["nodes"]:
            ls = sorted((x for x in n.get("lessons") or [] if x in order), key=order.get)
            if ls:
                out.append((n, ls))
    return out


def match(graphs: dict, goal: str, lessons) -> tuple[dict, list[str]] | None:
    """The node whose title holds half her words or more (the most, then the first), with her band's lessons of it;
    None when no node's title does. Words as P22's search compares them (search._same)."""
    from .search import _same
    from .textnorm import tokens
    want = set(tokens(goal))
    if not want:
        return None
    best, share = None, 0.0
    for n, ls in band_nodes(graphs, lessons):
        have = _title_words(n)
        s = sum(1 for w in want if any(_same(w, x) for x in have)) / len(want)
        if s >= 0.5 and s > share:
            best, share = (n, ls), s
    return best


def find_pathway(graphs: dict, pid: str) -> tuple[dict, dict] | None:
    """(graph, pathway) for a pathway id, or None."""
    for g in graphs.values():
        for p in g.get("pathways") or []:
            if p["id"] == pid:
                return g, p
    return None


def closure(g: dict, goal) -> list[dict]:
    """Every node the goal nodes need, deepest first, then the goal nodes themselves, each once (graph.js closure)."""
    by_id = {n["id"]: n for n in g["nodes"]}
    seen, out = set(), []

    def visit(n):
        if not n or n["id"] in seen:
            return
        seen.add(n["id"])
        for m in n.get("needs") or []:
            visit(by_id.get(m))
        out.append(n)
    for x in goal:
        visit(by_id.get(x))
    return out


def pathway_lessons(g: dict, p: dict, lessons) -> list[str]:
    """The pathway's lessons in her audience (`lessons`, her band's in pack order): the lessons of every node its goal
    needs and of the goal's own nodes, node by node, each node's in pack order."""
    order = {lid: i for i, lid in enumerate(lessons)}
    out = []
    for n in closure(g, p.get("goal") or []):
        for lid in sorted((x for x in n.get("lessons") or [] if x in order), key=order.get):
            if lid not in out:
                out.append(lid)
    return out

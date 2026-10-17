"""Copy reviewers' signatures from the hub or staging into the lesson packs (P17), the skills graphs (P25a) and the
Quran set (P29: `quran:set`, into content/quran/index.json, whose hash is the set's).

The review screens write each signature to the `signoffs` table: a role, initials, a date and the lesson's content
hash. Release mode reads only the pack's own review blocks, so before a release the content lead pulls them in:

  python3 tools/pull_signoffs.py --json signoffs.json [packs folder]    # saved from /api/m/review/signoffs
  python3 tools/pull_signoffs.py --db data/hub.db [packs folder]        # a hub's own database

Only a signature for the lesson's current content hash is copied; one for an older hash is reported as "changed
since it was signed" and left out, so one changed word voids it. A role the lesson does not need is skipped. The
lesson file keeps its own layout: only its `review` value is rewritten. Then `validate_pack.py --release` says what
is still missing. Initials only, never a name.
"""
import argparse
import json
import sqlite3
import sys
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TUTOR / "hub"))

from tutor_hub.packs import Library, review_state  # noqa: E402


def read_json(path: Path) -> list[dict]:
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    return d["signoffs"] if isinstance(d, dict) else d


def read_db(path: Path) -> list[dict]:
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        rows = db.execute("SELECT lesson, content_hash, role, initials, signed_on FROM signoffs ORDER BY id").fetchall()
    finally:
        db.close()
    return [{"lesson": a, "hash": b, "role": c, "initials": d, "date": e} for a, b, c, d, e in rows]


def value_span(text: str, key: str) -> tuple[int, int] | None:
    """Where the top-level `key`'s value sits in a JSON object's text: (start, end), or None."""
    depth, i, n = 0, 0, len(text)
    while i < n:
        c = text[i]
        if c == '"':
            j = i + 1
            while text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            if depth == 1 and text[i + 1:j] == key:
                k = j + 1
                while text[k] in " \t\r\n:":
                    k += 1
                _, end = json.JSONDecoder().raw_decode(text, k)
                return k, end
            i = j + 1
            continue
        if c in "{[":
            depth += 1
        elif c in "}]":
            depth -= 1
        i += 1
    return None


def put_review(text: str, review: dict) -> str:
    """The lesson file's text with its `review` value replaced (or added at the end), all else as it was."""
    new = json.dumps(review, ensure_ascii=False)
    span = value_span(text, "review")
    if span:
        out = text[:span[0]] + new + text[span[1]:]
    else:
        end = text.rstrip().rindex("}")
        body = text[:end].rstrip()
        out = body + ',\n  "review": ' + new + "\n" + text[end:]
    json.loads(out)
    return out


def lesson_file(pack_dir: Path, lid: str) -> Path:
    f = pack_dir / "lessons" / f"{lid}.json"
    if f.is_file():
        return f
    for g in sorted((pack_dir / "lessons").glob("*.json")):
        if json.loads(g.read_text(encoding="utf-8")).get("id") == lid:
            return g
    raise FileNotFoundError(lid)


def pull_graph(lib, sub: str, signs: list[dict], report: dict):
    """A skills graph's signatures (P25a), kept as `graph:<subject>`, into content/graph/<subject>.json."""
    g = lib.graphs.get(sub)
    if g is None:
        report["unknown"].append("graph:" + sub)
        return
    pull_page("graph:" + sub, g, signs, report)


def pull_page(key: str, g: dict, signs: list[dict], report: dict):
    """A page other than a lesson ({review, _hash, _file}): its signatures for its current hash into its file."""
    review = dict(g.get("review") or {"status": "draft", "needs": []})
    needs = review.get("needs") or []
    offs = [dict(so) for so in review.get("signoffs") or []]
    changed = False
    for s in signs:
        if s["hash"] != g["_hash"]:
            report["stale"].append(f"{key} ({s['role']}, {s['date']}): changed since it was signed")
        elif s["role"] not in needs:
            report["not_needed"].append(f"{key}: {s['role']}")
        elif any(o.get("role") == s["role"] and o.get("hash") == g["_hash"] for o in offs):
            report["already"].append(f"{key}: {s['role']}")
        else:
            offs = [o for o in offs if o.get("role") != s["role"]]
            offs.append({"role": s["role"], "initials": s["initials"], "date": s["date"], "hash": g["_hash"]})
            report["copied"].append(f"{key}: {s['role']} {s['initials']} {s['date']}")
            changed = True
    if changed:
        review["signoffs"] = sorted(offs, key=lambda o: needs.index(o["role"]) if o["role"] in needs else 99)
        review["status"] = "checked" if review_state({"review": review}, g["_hash"]) == "signed" else "draft"
        f = g["_file"]
        f.write_text(put_review(f.read_text(encoding="utf-8"), review), encoding="utf-8")


def pull(rows: list[dict], packs_dir: Path) -> dict:
    lib = Library(packs_dir)
    report = {"copied": [], "already": [], "stale": [], "unknown": [], "not_needed": []}
    by_lesson: dict[str, list] = {}
    for r in rows:
        by_lesson.setdefault(r["lesson"], []).append(r)
    for lid, signs in sorted(by_lesson.items()):
        if lid.startswith("graph:"):
            pull_graph(lib, lid.split(":", 1)[1], signs, report)
            continue
        if lid == "quran:set":
            q = lib.quran
            if q is None or not q.ok or q.light is not None:
                report["unknown"].append(lid)
            else:
                pull_page(lid, {"review": q.index.get("review"), "_hash": q.hash, "_file": q.dir / "index.json"},
                          signs, report)
            continue
        if lid not in lib.lessons:
            report["unknown"].append(lid)
            continue
        raw = lib.lessons[lid]
        chash = lib.hashes[lid]
        review = dict(raw.get("review") or {"status": "draft", "needs": []})
        needs = review.get("needs") or []
        offs = [dict(so) for so in review.get("signoffs") or []]
        changed = False
        for s in signs:
            if s["hash"] != chash:
                report["stale"].append(f"{lid} ({s['role']}, {s['date']}): changed since it was signed")
                continue
            if s["role"] not in needs:
                report["not_needed"].append(f"{lid}: {s['role']}")
                continue
            if any(o.get("role") == s["role"] and o.get("hash") == chash for o in offs):
                report["already"].append(f"{lid}: {s['role']}")
                continue
            offs = [o for o in offs if o.get("role") != s["role"]]        # an older signature for this role goes
            offs.append({"role": s["role"], "initials": s["initials"], "date": s["date"], "hash": chash})
            report["copied"].append(f"{lid}: {s['role']} {s['initials']} {s['date']}")
            changed = True
        if changed:
            review["signoffs"] = sorted(offs, key=lambda o: needs.index(o["role"]) if o["role"] in needs else 99)
            review["status"] = "checked" if review_state({"review": review}, chash) == "signed" else "draft"
            f = lesson_file(lib.packs[lib.lesson_pack[lid]]["_dir"], lid)
            f.write_text(put_review(f.read_text(encoding="utf-8"), review), encoding="utf-8")
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("packs", nargs="?", default=str(TUTOR / "content" / "packs"))
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--json", help="signoffs saved from /api/m/review/signoffs")
    src.add_argument("--db", help="a hub's SQLite database")
    a = ap.parse_args(argv)
    rows = read_json(Path(a.json)) if a.json else read_db(Path(a.db))
    report = pull(rows, Path(a.packs))
    for k, items in report.items():
        for x in items:
            print(f"{k:10} {x}")
    print(f"{len(report['copied'])} signature(s) copied, {len(report['stale'])} for an older version left out")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Finding the checked answer or lesson passage closest to a child's question (BM25, no AI needed).

Every lesson's question bank, every answer a teacher approved and every lesson step go into one index.
"coverage" says how much of the question a match explains (0 to 1); the hub trusts a checked answer only
when coverage is high, and otherwise passes the best passages to the AI, or to the teacher.
"""
import math
from collections import Counter

from .packs import text as pick_text
from .textnorm import norm, tokens

K1, B = 1.2, 0.75


class Index:
    def __init__(self):
        self.docs: list[dict] = []
        self.df: Counter = Counter()
        self.avgdl = 1.0

    def add(self, doc: dict, keys_text: str):
        toks = tokens(keys_text)
        if not toks:
            return
        doc = dict(doc, _toks=Counter(toks), _len=len(toks), _norm=norm(keys_text))
        self.docs.append(doc)
        self.df.update(set(toks))

    def finish(self):
        self.avgdl = (sum(d["_len"] for d in self.docs) / len(self.docs)) if self.docs else 1.0

    def idf(self, t: str) -> float:
        n, df = len(self.docs), self.df.get(t, 0)
        return math.log(1 + (n - df + 0.5) / (df + 0.5))

    def search(self, query: str, *, kinds=None, subject=None, lesson=None, limit=5):
        """[(score, coverage, doc)], best first."""
        q = tokens(query)
        if not q:
            return []
        qn = norm(query)
        weights = {t: self.idf(t) for t in set(q)}
        total = sum(weights.values()) or 1.0
        hits = []
        for d in self.docs:
            if kinds and d["kind"] not in kinds:
                continue
            if subject and d.get("subject") and d["subject"] != subject:
                continue
            tf, dl, score, covered = d["_toks"], d["_len"], 0.0, 0.0
            for t, w in weights.items():
                f = tf.get(t, 0)
                if f:
                    covered += w
                    score += w * f * (K1 + 1) / (f + K1 * (1 - B + B * dl / self.avgdl))
            if score <= 0:
                continue
            cov = 1.0 if d.get("q") is not None and d["_norm"] == qn else covered / total
            if lesson and d.get("lesson") == lesson:
                score *= 1.3   # the lesson on screen is the likeliest context
            hits.append((score, cov, d))
        hits.sort(key=lambda h: (h[1] >= 0.6, h[0]), reverse=True)
        return [(s, c, {k: v for k, v in d.items() if not k.startswith("_")}) for s, c, d in hits[:limit]]


def build(library, approved_rows=()) -> Index:
    """One index over the packs and the teacher's approved answers."""
    ix = Index()
    for lid, l in library.lessons.items():
        meta = {"lesson": lid, "subject": l["subject"], "year": l["year"]}
        for i, b in enumerate(l.get("bank") or []):
            q, a = b["q"], b["a"]
            keys = " ".join(pick_text(q, c) for c in ("prs", "ps", "en"))
            ix.add(dict(meta, kind="bank", id=f"{lid}#bank{i}", q=q, a=a), keys)
        for i, s in enumerate(l["steps"]):
            t = s.get("text") if s.get("kind") == "read" else None
            if t:
                keys = " ".join(pick_text(t, c) for c in ("prs", "ps", "en"))
                ix.add(dict(meta, kind="step", id=f"{lid}#step{i}", q=None, a=t), keys)
    for r in approved_rows:
        ix.add({"kind": "approved", "id": f"approved#{r['id']}", "lesson": r.get("lesson_id"),
                "subject": r.get("subject"), "year": r.get("year"),
                "q": {r["lang"]: r["question"]}, "a": {r["lang"]: r["answer"]}}, r["question"])
    ix.finish()
    return ix


# --- "I want to learn this" (P22, C3.5): her typed goal against the lessons the hub serves, no AI ---------------

# where a word of her goal is found counts for more in a lesson's title or unit than in its subject or its steps
FIELD_WEIGHT = {"title": 3.0, "unit": 3.0, "subject": 2.0, "step": 1.0}
STRONG = ("title", "unit", "subject")
PLAN_COVER = 0.5          # this share of her words in a lesson's title, unit or subject: a plan
CLOSE_COVER = 0.34        # this share anywhere in a lesson: one of the closest lessons
PLAN_MAX = 12
CLOSE_MAX = 3


def _same(a: str, b: str) -> bool:
    """One word, give or take an ending: "fraction" and "fractions", کسر and کسرها (three letters at least)."""
    if a == b:
        return True
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    return len(short) >= 3 and long_.startswith(short) and len(long_) - len(short) <= 3


def lesson_fields(lesson: dict, subject_names: dict) -> dict[str, set[str]]:
    """The search words of a lesson, by field, in every language it has."""
    def words(v):
        return set(tokens(" ".join(pick_text(v, c) for c in ("prs", "ps", "en")))) if v else set()
    steps = " ".join(pick_text(s.get("text"), c) for s in lesson.get("steps", []) if s.get("kind") == "read"
                     for c in ("prs", "ps", "en"))
    return {"title": words(lesson.get("title")), "unit": words(lesson.get("unit")),
            "subject": set(tokens(" ".join([lesson.get("subject", "")] +
                                           list((subject_names.get(lesson.get("subject")) or {}).values())))),
            "step": set(tokens(steps))}


def match_lessons(goal: str, lessons: list[tuple[str, dict]], subject_names: dict) -> list[dict]:
    """[{id, score, strong, cover}] for every lesson that holds a word of the goal, best first.

    `lessons` is [(id, lesson)] in pack order; `strong` is the share of her words found in the title, unit or subject,
    `cover` the share found anywhere."""
    want = list(dict.fromkeys(tokens(goal)))
    if not want:
        return []
    out = []
    for i, (lid, l) in enumerate(lessons):
        fields = lesson_fields(l, subject_names)
        score, strong, cover = 0.0, 0, 0
        for w in want:
            best = max((FIELD_WEIGHT[f] for f, ws in fields.items() if any(_same(w, x) for x in ws)), default=0.0)
            if best:
                score += best
                cover += 1
                strong += any(any(_same(w, x) for x in fields[f]) for f in STRONG)
        if score:
            out.append({"id": lid, "score": score, "strong": strong / len(want), "cover": cover / len(want),
                        "order": i})
    out.sort(key=lambda m: (-m["strong"], -m["score"], m["order"]))
    return out


def plan_for(goal: str, lessons: list[tuple[str, dict]], subject_names: dict) -> dict:
    """{kind: "plan", lessons, unit} (a plan in pack order), {kind: "closest", lessons} (three at most) or
    {kind: "miss"}.

    A plan is every lesson whose title, unit or subject holds at least half her words, with the other lessons of the
    best one's unit, in pack order; without one, the closest lessons are those holding a third of her words anywhere."""
    found = match_lessons(goal, lessons, subject_names)
    if not found:
        return {"kind": "miss"}
    by_id = dict(lessons)
    order = {lid: i for i, (lid, _) in enumerate(lessons)}
    best = found[0]
    if best["strong"] >= PLAN_COVER:
        top = by_id[best["id"]]
        unit = (top["subject"], pick_text(top.get("unit"), "prs") or pick_text(top.get("unit"), "en"))
        ids = {m["id"] for m in found if m["strong"] >= PLAN_COVER}
        if unit[1]:
            ids |= {lid for lid, l in lessons
                    if (l["subject"], pick_text(l.get("unit"), "prs") or pick_text(l.get("unit"), "en")) == unit}
        return {"kind": "plan", "lessons": sorted(ids, key=order.get)[:PLAN_MAX], "unit": top.get("unit"),
                "title": top.get("title")}
    close = [m["id"] for m in found if m["cover"] >= CLOSE_COVER][:CLOSE_MAX]
    return {"kind": "closest", "lessons": close} if close else {"kind": "miss"}

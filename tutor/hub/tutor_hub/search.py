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

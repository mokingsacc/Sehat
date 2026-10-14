"""How the hub answers a child's question, safest source first.

1. rules     words of distress, health questions, or topics the hub does not answer (rules.py)
2. maths     a plain sum is worked out exactly (mathcheck.solve)
3. checked   an answer from a lesson's question bank or one the teacher approved, if it clearly fits
4. AI        the local model, given the closest lesson passages; every sum it writes is recomputed and
             an answer with a wrong sum is never shown. Languages the AI is not trusted in yet (Pashto at
             first) skip this step.
5. lesson    the closest passage of a lesson, said to be "from the lesson", if it fits well enough
6. teacher   nothing fits: the question waits for the teacher, and the answer appears on the phone later

Every answer says where it came from, so the app can show a badge (checked, worked out, AI, from the lesson).
"""
from dataclasses import asdict, dataclass

from . import llm as llm_mod
from . import mathcheck, rules
from .packs import text as pick_text

WAITING = {
    "prs": "سوالت به معلم رفت. وقتی جواب بدهد، همین‌جا می‌بینی.",
    "ps": "ستا پوښتنه ښوونکي ته ولاړه. کله چې ځواب ورکړي، همدلته به یې ووینې.",
    "en": "Your question went to the teacher. Their answer will appear right here.",
}
CONFIDENT = 0.6      # share of the question a checked answer must explain
PASSAGE_OK = 0.45    # share of the question a lesson passage must explain to be shown on its own


@dataclass
class Answer:
    text: str
    lang: str
    source: str              # rules, maths, bank, approved, ai, lesson, none
    checked: bool = False    # worked out exactly, or written or approved by a teacher
    maths_checked: int = 0   # for AI answers: how many sums were recomputed and found right
    waiting: bool = False    # the question is with the teacher
    urgent: bool = False
    lesson: str | None = None

    def dict(self):
        return asdict(self)


class Brain:
    def __init__(self, index, model: "llm_mod.LLM", ai_langs=("prs", "en")):
        self.index = index
        self.model = model
        self.ai_langs = tuple(ai_langs)

    def answer(self, question: str, *, lang="prs", subject=None, year=None, lesson=None) -> Answer:
        lang = lang if lang in ("prs", "ps", "en") else "prs"
        q = (question or "").strip()

        r = rules.screen(q)
        if r:
            reason, urgent = r
            return Answer(rules.MESSAGES[reason][lang], lang, "rules", urgent=urgent,
                          waiting=urgent or reason == "health")

        solved = mathcheck.solve(q)
        if solved:
            shown, value = solved
            return Answer(f"${shown} = {mathcheck.fmt(value, fa=False)}$", lang, "maths", checked=True)

        hits = self.index.search(q, kinds={"bank", "approved"}, subject=subject, lesson=lesson, limit=3)
        if hits and hits[0][1] >= CONFIDENT:
            d = hits[0][2]
            return Answer(pick_text(d["a"], lang), lang, d["kind"], checked=True, lesson=d.get("lesson"))

        passages = self.index.search(q, subject=subject, lesson=lesson, limit=4)
        if lang in self.ai_langs and self.model.available():
            notes = [pick_text(d["a"], lang) for _, cov, d in passages if cov > 0.2]
            reply = self.model.chat(llm_mod.prompt(q, lang=lang, year=year, subject=subject, notes=notes))
            if reply:
                c = mathcheck.check(reply)
                if c.ok:
                    return Answer(mathcheck.mark(reply), lang, "ai", maths_checked=c.checked,
                                  lesson=passages[0][2].get("lesson") if passages else None)
                # a wrong sum: the child never sees this answer; the teacher answers instead

        if passages and passages[0][1] >= PASSAGE_OK:
            d = passages[0][2]
            return Answer(pick_text(d["a"], lang), lang, "lesson", lesson=d.get("lesson"))

        return Answer(WAITING[lang], lang, "none", waiting=True)

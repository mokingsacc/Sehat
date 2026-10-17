"""How the hub answers a child's question, safest source first.

1. rules     words of distress, health questions, or topics the hub does not answer (rules.py)
2. exercise  hints, never answers (C2.3, BUILD-PLAN 5.3): a sum, "solve", "find", "how many" with numbers, a
             textbook exercise. A sum code can work out gets the code's three-rung ladder (hints.py) and never its
             value. Any other exercise gets a ladder from the model only in Homework help (the `homework` module):
             the model solves it privately twice, then writes three hints, each checked against both answers in
             every written form; the answer stays on the hub for "Check my answer". Otherwise it waits for the
             teacher. When in doubt, the ladder.
3. checked   an answer from a lesson's question bank or one the teacher approved, if it clearly fits
4. AI        through the AI gateway (ai/), given the closest lesson passages. The gateway decides whether a call
             may happen (provider policy, trusted languages, the cohort's daily budget), takes identifiers out
             of the question, recomputes every sum (an answer with a wrong sum is never shown) and counts the
             call. No AI this time, for any reason, simply means the next step.
5. lesson    the closest passage of a lesson, said to be "from the lesson", if it fits well enough
6. teacher   nothing fits: the question waits for the teacher, and the answer appears on the phone later

Every answer says where it came from, so the app can show a badge (checked, worked out, AI, from the lesson).
Pashto is not a language the AI is trusted in yet, so a Pashto ladder only ever comes from code or a teacher.
"""
import json
import re
from dataclasses import asdict, dataclass, field

from . import hints, mathcheck, rules
from . import llm as llm_mod
from .ai import Gateway
from .packs import text as pick_text
from .textnorm import digits_to_latin

WAITING = {
    "prs": "سوالت به معلم رفت. وقتی جواب بدهد، همین‌جا می‌بینی.",
    "ps": "ستا پوښتنه ښوونکي ته ولاړه. کله چې ځواب ورکړي، همدلته به یې ووینې.",
    "en": "Your question went to the teacher. Their answer will appear right here.",
}
# the line above a hint ladder (drafts, like every Dari and Pashto string the hub writes)
LADDER = {
    "prs": "بیا با هم حلش کنیم. راهنمایی‌ها یکی‌یکی این‌جاست.",
    "ps": "راځه چې یوځای یې حل کړو. لارښوونې یوه یوه دلته دي.",
    "en": "Let's work it out together. Here are hints, one at a time.",
}
CONFIDENT = 0.6      # share of the question a checked answer must explain
PASSAGE_OK = 0.45    # share of the question a lesson passage must explain to be shown on its own

_DIGIT = re.compile(r"\d")
_BETWEEN = re.compile(r"\d\s*[+\-−–×÷*/=^<>]\s*[\d(a-zA-Z]|[a-zA-Z]\s*[+\-−–×÷*/=^]\s*\d")
_SOLVE = re.compile(r"(?i)\b(solve|find|calculate|work out|simplify|exercise|evaluate)\b|حل کن|پیدا کن|حساب کن"
                    r"|ساده کن|تمرین|حل کړه|پیدا کړه|حساب کړه|ساده کړه|تمرین")
_COUNT = re.compile(r"(?i)\b(how many|how much)\b|چند|چقدر|چه قدر|څو|څومره")
_GEN = {"fraction_add": "frac", "add_sub": None, "times": "times"}


def is_exercise(q: str) -> bool:
    """Something to work out rather than something to understand: a sum, an equation, "solve", "find", "simplify",
    a textbook exercise, or "how many" with numbers in it. Concept questions ("what is", "why") are not."""
    q = q or ""
    if mathcheck.solve(q) or _SOLVE.search(q):
        return True
    digits = _DIGIT.search(q)
    return bool(digits and (_BETWEEN.search(digits_to_latin(q)) or _COUNT.search(q)))


def same_answer(a, b) -> bool:
    """Her answer against the private one: equal values (3/4, ۰٫۷۵, 6/8), else the same words and symbols."""
    def norm(x):
        t = digits_to_latin(str(x or "")).replace("٫", ".").strip().lower()
        t = t.split("=")[-1].strip() if "=" in t else t
        return t
    x, y = norm(a), norm(b)
    vx, vy = mathcheck.plain(x), mathcheck.plain(y)
    if vx is not None and vy is not None:
        return vx == vy
    squash = lambda t: re.sub(r"[\s.,،]+", "", t)   # noqa: E731
    return bool(x) and squash(x) == squash(y)


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
    ladder: list | None = None   # three hint rungs instead of an answer (C2.3): [{rung, text, step?, lesson?}]
    checkable: bool = False      # "Check my answer" is offered (Homework help, and the answer is sure)
    unsure: bool = False         # the model's two runs disagreed: "Ask your teacher"
    held: bool = False           # the AI's answer or ladder waits for the teacher (the cohort's hold, P20)
    solution: str | None = field(default=None, repr=False)    # the private answer: never in dict()

    def dict(self):
        d = asdict(self)
        d.pop("solution")
        return d

    def shown(self) -> str:
        """What the teacher sees as "what she was shown": the line and each hint."""
        if not self.ladder:
            return self.text
        return "\n".join([self.text] + [f"{r['rung']}. {r['text']}" for r in self.ladder])


SOLVE_SYSTEM = """You solve one school exercise for a teacher's answer key. Work privately. Reply with exactly one line:
ANSWER: <the final answer only, as short as possible: a number, a fraction like 3/4, or a few words>"""
HINT_SYSTEM = """You write three hints for a learner in year {year} doing this exercise, in {language}. Never give the answer, any part of the final answer, or the value of any step that is the answer.
Hint 1 says what to look at or remember. Hint 2 is a worked example of the same kind with different numbers. Hint 3 is only the first step for this exercise.
Reply with a JSON list of three strings, nothing else."""
LANGUAGE = {"prs": "Dari", "ps": "Pashto", "en": "English"}


def _parse_answer(text: str | None) -> str | None:
    m = re.search(r"ANSWER:\s*(.+)", text or "")
    a = m.group(1).replace("$", "").strip() if m else ""
    return a[:80] or None


def _parse_hints(text: str | None) -> list[str] | None:
    try:
        body = json.loads(text or "")
    except ValueError:
        m = re.search(r"\[.*\]", text or "", re.S)
        try:
            body = json.loads(m.group(0)) if m else None
        except ValueError:
            body = None
    if isinstance(body, list) and len(body) == 3 and all(isinstance(x, str) and x.strip() for x in body):
        return [x.strip()[:400] for x in body]
    return None


class Brain:
    def __init__(self, index, gateway: Gateway, library=None):
        self.index = index
        self.gateway = gateway
        self.library = library           # for rung 1: the lesson step that teaches a kind of sum
        self._teaches = None

    def teaches(self, kind: str, prefer: str | None = None):
        """(lesson, step) of a sheet item of this kind of sum ("frac", "add", "sub", "times"), the asked-about
        lesson first; (None, None) when no lesson has one."""
        if self.library is None:
            return None, None
        if self._teaches is None:
            found: dict[str, list] = {}
            for lid, l in self.library.lessons.items():
                for it in (l.get("sheet") or {}).get("items", []):
                    if not it.get("step"):
                        continue
                    if it.get("kind") == "generate":
                        ks = ["add", "sub"] if it.get("type") == "add_sub" else [_GEN.get(it.get("type"))]
                    elif it.get("kind") == "sum" and (k := hints.kind_of(str(it.get("q", "")))):
                        ks = [k[0]]
                    else:
                        continue
                    for k in ks:
                        found.setdefault(k, []).append((lid, it["step"]))
                    if it.get("step_same"):      # fraction sums whose bottom numbers already match
                        found.setdefault("frac=", []).append((lid, it["step_same"]))
            self._teaches = found
        options = self._teaches.get(kind) or []
        best = next((o for o in options if o[0] == prefer), options[0] if options else None)
        return (self.library.lessons[best[0]], best[1]) if best else (None, None)

    async def answer(self, question: str, *, lang="prs", subject=None, year=None, lesson=None,
                     cohort: str | None = None, homework: bool = False, hold: bool = False) -> Answer:
        """`hold`: the cohort holds AI answers for the teacher (P20): an answer or ladder the model wrote comes back
        with `held`, and the route keeps it for the teacher instead of showing it."""
        lang = lang if lang in ("prs", "ps", "en") else "prs"
        q = (question or "").strip()

        r = rules.screen(q)
        if r:
            reason, urgent = r
            return Answer(rules.MESSAGES[reason][lang], lang, "rules", urgent=urgent,
                          waiting=urgent or reason == "health")

        if is_exercise(q):
            return await self.exercise(q, lang=lang, subject=subject, year=year, lesson=lesson, cohort=cohort,
                                       homework=homework, hold=hold)

        hits = self.index.search(q, kinds={"bank", "approved"}, subject=subject, lesson=lesson, limit=3)
        if hits and hits[0][1] >= CONFIDENT:
            d = hits[0][2]
            return Answer(pick_text(d["a"], lang), lang, d["kind"], checked=True, lesson=d.get("lesson"))

        passages = self.index.search(q, subject=subject, lesson=lesson, limit=4)
        notes = [pick_text(d["a"], lang) for _, cov, d in passages if cov > 0.2]
        r = await self.gateway.call("explain", llm_mod.prompt(q, lang=lang, year=year, subject=subject, notes=notes),
                                    module="ask", lang=lang, cohort=cohort, held=hold)
        if r.text:
            return Answer(r.text, lang, "ai", maths_checked=r.maths_checked, held=r.held,
                          lesson=passages[0][2].get("lesson") if passages else None)
        # no AI this time (off, untrusted language, budget, a wrong sum...): the lesson, else the teacher

        if passages and passages[0][1] >= PASSAGE_OK:
            d = passages[0][2]
            return Answer(pick_text(d["a"], lang), lang, "lesson", lesson=d.get("lesson"))

        return Answer(WAITING[lang], lang, "none", waiting=True)

    async def exercise(self, q: str, *, lang, subject, year, lesson, cohort, homework, hold=False) -> Answer:
        """Hints, never answers: the code's ladder for a sum it can work out, else Homework help's, else the teacher."""
        solved = mathcheck.solve(q)
        if solved:
            shown, value = solved
            answer = mathcheck.fmt(value, fa=False)
            kind = hints.kind_of(shown)
            same = kind and kind[0] == "frac" and kind[2] == kind[4] and self.teaches("frac=", prefer=lesson)[0]
            l, step = self.teaches("frac=" if same else kind[0], prefer=lesson) if kind else (None, None)
            rungs = hints.ladder(q=shown, answer=answer, lang=lang, lesson=l, step=step, seed_text="ask")
            if rungs:
                return Answer(LADDER[lang], lang, "maths", checked=True, ladder=rungs, checkable=homework,
                              solution=answer, lesson=l["id"] if l else None)
        if homework:
            a = await self.homework_ladder(q, lang=lang, subject=subject, year=year, lesson=lesson, cohort=cohort,
                                           hold=hold)
            if a:
                return a
        return Answer(WAITING[lang], lang, "none", waiting=True)

    async def homework_ladder(self, q, *, lang, subject, year, lesson, cohort, hold=False) -> Answer | None:
        """The model solves it privately, twice; then three hints, checked against both answers in every form. None
        when there is no AI this time, no answer, or no hints that keep the answer back."""
        ask = [{"role": "system", "content": SOLVE_SYSTEM}, {"role": "user", "content": q}]
        first = await self.gateway.call("hint", ask, module="homework", lang=lang, cohort=cohort, max_tokens=60,
                                        temperature=0.0)
        a1 = _parse_answer(first.text)
        if not a1:
            return None
        second = await self.gateway.call("hint", ask, module="homework", lang=lang, cohort=cohort, max_tokens=60,
                                         temperature=0.7)
        a2 = _parse_answer(second.text)
        sure = bool(a2) and same_answer(a1, a2)
        answers = [a for a in (a1, a2) if a]
        system = HINT_SYSTEM.format(year=year or "", language=LANGUAGE[lang])
        msg = [{"role": "system", "content": system}, {"role": "user", "content": q}]
        h = await self.gateway.call("hint", msg, module="homework", lang=lang, cohort=cohort, answers=answers,
                                    max_tokens=400, held=hold)
        texts = _parse_hints(h.text)
        if not texts or any(hints_leak(t, answers) for t in texts):
            return None
        rungs = [{"rung": k, "text": t} for k, t in enumerate(texts, 1)]
        passages = self.index.search(q, subject=subject, lesson=lesson, limit=1) if self.index else []
        lid = passages[0][2].get("lesson") if passages and passages[0][1] > 0.2 else None
        if lid and self.library is not None and lid in self.library.lessons:
            r1 = hints.rung_one(self.library.lessons[lid], None, lang, answers)
            if not hints_leak(r1["text"], answers):
                rungs[0] = r1
        return Answer(LADDER[lang], lang, "ai", maths_checked=h.maths_checked, ladder=rungs, checkable=sure,
                      unsure=not sure, solution=a1, lesson=lid, held=h.held)


def hints_leak(text: str, answers) -> bool:
    from .ai import filters
    return filters.leaks(text, answers) or any(
        len(a) > 3 and mathcheck.plain(a) is None and a.lower() in (text or "").lower() for a in answers)

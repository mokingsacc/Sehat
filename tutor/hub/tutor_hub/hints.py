"""The hint ladder for Qalam sheets and for sums asked in Ask (C2.3, BUILD-PLAN 5.3): three rungs, never the answer.

1. The lesson step that teaches it: "Look at step 4 of the lesson: 'When the bottom numbers differ'".
2. A worked example with other numbers, made by the same generators as the sheet's sums (never by a model).
3. The first move for this item: "Both bottom numbers are 4, so the answer's bottom number is 4 too. Now add the
   top numbers."

Every rung is checked against the item's answer in every written form (`ai.filters.leaks`: digits in any script,
decimals, mixed numbers and number words) when it is made. A rung that would give the answer away becomes "Listen
to this step of the lesson again" (rung 1 just loses its quote). The ladder is made with the sheet's key
(`sheets.answer_key`), so the phone keeps it with the key and the hints work offline.

What code reads: a sum of two fractions, two whole numbers added or taken away, and two whole numbers multiplied,
whether generated or written in the pack. A fixed pack item it cannot read (a count, any other sum) carries its own
rungs 2 and 3 as `hints`, each a text in the pack's languages; the validator requires them and leak-checks them.

The words below are drafts: a native Dari speaker and a native Pashto speaker check them before learners see them.
"""
import math
import random
import re
from fractions import Fraction

from . import mathcheck
from .ai import filters
from .packs import text as pick_text
from .textnorm import digits_to_latin

RUNGS = 3

TEXT = {
    "en": {
        "r1": "Look at step {n} of the lesson: “{title}”",
        "r1_bare": "Look at step {n} of the lesson again.",
        "r1_this": "Look at this step of the lesson: “{title}”",
        "r1_lesson": "Look at the lesson “{title}” again.",
        "r1_any": "Read the question again slowly. What does it ask you to find?",
        "listen": "Listen to this step of the lesson again.",
        "r2": "Here is a sum like it, with other numbers: {ex}",
        "ex_add": "{s}: start at {a} and count on {b}: {seq}. So {r}.",
        "ex_sub": "{s}: start at {a} and count back {b}: {seq}. So {r}.",
        "r3_same": "Both bottom numbers are {d}, so the answer's bottom number is {d} too. Now add the top numbers.",
        "r3_diff": "Make the bottom numbers the same first: {l} works for {d1} and {d2}. {conv}",
        "write_as": "Write {f} as {g}.",
        "write_as2": "Write {f} as {g} and {f2} as {g2}.",
        "r3_add": "Start at {a} and count on {b} more.",
        "r3_sub": "Start at {a} and count back {b}.",
        "r3_times": "Add {a} again and again, {b} times: {sum}",
        "r2_any": "Do one part at a time. Brackets come first, then × and ÷, then + and −.",
        "r3_any": "Write each part on paper, and check each part before the next.",
    },
    "prs": {
        "r1": "به قدم {n} درس نگاه کن: «{title}»",
        "r1_bare": "قدم {n} درس را دوباره ببین.",
        "r1_this": "به این قدم درس نگاه کن: «{title}»",
        "r1_lesson": "درس «{title}» را دوباره ببین.",
        "r1_any": "سوال را آهسته دوباره بخوان. چه چیزی را باید پیدا کنی؟",
        "listen": "این قدم درس را دوباره گوش کن.",
        "r2": "یک جمع مثل این، با عددهای دیگر: {ex}",
        "ex_add": "{s}: از {a} شروع کن و {b} تا جلو بشمار: {seq}. پس {r}.",
        "ex_sub": "{s}: از {a} شروع کن و {b} تا عقب بشمار: {seq}. پس {r}.",
        "r3_same": "مخرج‌ها هر کدام {d} است، پس مخرج جواب هم {d} است. حالا صورت‌ها را جمع کن.",
        "r3_diff": "اول مخرج‌ها را برابر کن: {l} برای {d1} و {d2} خوب است. {conv}",
        "write_as": "{f} را {g} بنویس.",
        "write_as2": "{f} را {g} بنویس و {f2} را {g2}.",
        "r3_add": "از {a} شروع کن و {b} تا جلو بشمار.",
        "r3_sub": "از {a} شروع کن و {b} تا عقب بشمار.",
        "r3_times": "{a} را {b} بار جمع کن: {sum}",
        "r2_any": "هر بار یک قسمت را حل کن. اول قوس‌ها، بعد × و ÷، بعد + و −.",
        "r3_any": "هر قسمت را روی کاغذ بنویس و پیش از قسمت بعدی چک کن.",
    },
    "ps": {
        "r1": "د لوست ګام {n} ته وګوره: «{title}»",
        "r1_bare": "د لوست ګام {n} بیا وګوره.",
        "r1_this": "د لوست دې ګام ته وګوره: «{title}»",
        "r1_lesson": "د «{title}» لوست بیا وګوره.",
        "r1_any": "پوښتنه ورو ورو بیا ولوله. څه باید پیدا کړې؟",
        "listen": "د لوست دا ګام بیا واوره.",
        "r2": "یوه ورته جمع، په نورو عددونو: {ex}",
        "ex_add": "{s}: له {a} نه پیل کړه او {b} مخکې وشمېره: {seq}. نو {r}.",
        "ex_sub": "{s}: له {a} نه پیل کړه او {b} شاته وشمېره: {seq}. نو {r}.",
        "r3_same": "د هر کسر مخرج {d} دی، نو د ځواب مخرج هم {d} دی. اوس صورتونه سره جمع کړه.",
        "r3_diff": "لومړی مخرجونه برابر کړه: {l} د {d1} او {d2} لپاره ښه دی. {conv}",
        "write_as": "{f} د {g} په توګه ولیکه.",
        "write_as2": "{f} د {g} او {f2} د {g2} په توګه ولیکه.",
        "r3_add": "له {a} نه پیل کړه او {b} نور مخکې وشمېره.",
        "r3_sub": "له {a} نه پیل کړه او {b} شاته وشمېره.",
        "r3_times": "{a} {b} ځله سره جمع کړه: {sum}",
        "r2_any": "هر ځل یوه برخه حل کړه. لومړی قوسونه، بیا × او ÷، بیا + او −.",
        "r3_any": "هره برخه په کاغذ ولیکه او د بلې برخې نه مخکې یې وګوره.",
    },
}

_FRAC = re.compile(r"^(\d+)/(\d+) \+ (\d+)/(\d+)$")
_ADDSUB = re.compile(r"^(\d+) ([+\-]) (\d+)$")
_TIMES = re.compile(r"^(\d+) [×x*] (\d+)$")


def _t(lang: str, key: str, **kw) -> str:
    return (TEXT.get(lang) or TEXT["prs"])[key].format(**kw)


def m(x) -> str:
    """Maths kept left to right inside Dari or Pashto text (the app's `rich()` shows it in her digits)."""
    return f"${x}$"


def normal(q: str) -> str:
    """A sum as the generators write it: Latin digits, single spaces round + − ×, no spaces round /."""
    q = digits_to_latin(str(q)).replace("−", "-").replace("–", "-").replace("*", "×")
    q = re.sub(r"\s*([+\-×x])\s*", r" \1 ", q)
    q = re.sub(r"\s*/\s*", "/", q)
    return re.sub(r"\s+", " ", q).strip()


def kind_of(q: str):
    """What code knows how to hint at: ("frac", a, b, c, d), ("add"|"sub", a, b), ("times", a, b), or None."""
    q = normal(q)
    if f := _FRAC.match(q):
        a, b, c, d = map(int, f.groups())
        return ("frac", a, b, c, d) if b and d else None
    if f := _ADDSUB.match(q):
        return ("add" if f[2] == "+" else "sub", int(f[1]), int(f[3]))
    if f := _TIMES.match(q):
        return ("times", int(f[1]), int(f[2]))
    return None


def _chain_frac(a, b, c, d) -> str:
    """1/2 + 1/4 = 2/4 + 1/4 = 3/4, with the sum made simpler at the end when it can be."""
    parts = [f"{a}/{b} + {c}/{d}"]
    if b != d:
        l = math.lcm(b, d)
        parts.append(f"{a * l // b}/{l} + {c * l // d}/{l}")
        top, bottom = a * l // b + c * l // d, l
    else:
        top, bottom = a + c, b
    parts.append(f"{top}/{bottom}")
    v = Fraction(top, bottom)
    if v.denominator != bottom:
        parts.append(mathcheck.fmt(v, fa=False))
    return " = ".join(parts)


def _example(kind, lang: str, rng: random.Random):
    """One worked example of the same kind, with numbers from the sheet's generators."""
    from . import sheets
    k = kind[0]
    if k == "frac":
        same = kind[2] == kind[4]
        for _ in range(50):
            s = sheets.gen_fraction_add(rng, 1, max_den=12, same_first=1 if same else 0)[0]
            if (f := kind_of(s["q"])) and (f[2] == f[4]) == same:
                return m(_chain_frac(*f[1:])), s["q"]
        return None, None
    if k in ("add", "sub"):
        op = "+" if k == "add" else "-"
        s = sheets.gen_add_sub(rng, 1, max_total=max(10, kind[1] + kind[2]), ops=op)[0]
        _, a, b = kind_of(s["q"])
        r = a + b if k == "add" else a - b
        seq = list(range(a + 1, a + b + 1)) if k == "add" else list(range(a - 1, a - b - 1, -1))
        if not seq or len(seq) > 10:
            return m(f"{s['q']} = {r}"), s["q"]
        return _t(lang, "ex_" + k, s=m(s["q"]), a=m(a), b=m(b), seq="، ".join(m(x) for x in seq) if lang != "en"
                  else ", ".join(m(x) for x in seq), r=m(f"{s['q']} = {r}")), s["q"]
    if k == "times":
        s = sheets.gen_times(rng, 1, tables=range(2, 11))[0]
        _, a, b = kind_of(s["q"])
        return m(f"{a} × {b} = {' + '.join([str(a)] * b)} = {a * b}"), s["q"]
    return None, None


def _first_move(kind, lang: str) -> str | None:
    k = kind[0]
    if k == "frac":
        _, a, b, c, d = kind
        if b == d:
            return _t(lang, "r3_same", d=m(b))
        l = math.lcm(b, d)
        if b == l:
            conv = _t(lang, "write_as", f=m(f"{c}/{d}"), g=m(f"{c * l // d}/{l}"))
        elif d == l:
            conv = _t(lang, "write_as", f=m(f"{a}/{b}"), g=m(f"{a * l // b}/{l}"))
        else:
            conv = _t(lang, "write_as2", f=m(f"{a}/{b}"), g=m(f"{a * l // b}/{l}"), f2=m(f"{c}/{d}"),
                      g2=m(f"{c * l // d}/{l}"))
        return _t(lang, "r3_diff", l=m(l), d1=m(b), d2=m(d), conv=conv)
    if k in ("add", "sub"):
        return _t(lang, "r3_" + k, a=m(kind[1]), b=m(kind[2]))
    if k == "times":
        _, a, b = kind
        if b > 10:
            return None
        return _t(lang, "r3_times", a=m(a), b=m(b), sum=m(" + ".join([str(a)] * b)))
    return None


def step_title(lesson: dict, n: int, lang: str, limit: int = 60) -> str:
    """The first sentence of a lesson step, plain, as rung 1 quotes it."""
    steps = lesson.get("steps") or []
    if not 1 <= n <= len(steps):
        return ""
    st = steps[n - 1]
    t = pick_text(st.get("prompt") or st.get("text") or st.get("word") or "", lang).replace("$", "")
    t = re.split(r"(?<=[.!?؟:،,])\s", t.strip())[0].rstrip(".:،,") if t else ""
    return t if len(t) <= limit else t[: limit - 1].rstrip() + "…"


def rung_one(lesson: dict | None, step: int | None, lang: str, answers) -> dict:
    """Rung 1: the lesson step that teaches it, quoted when the quote gives nothing away."""
    if lesson and step:
        title = step_title(lesson, step, lang)
        safe = bool(title) and not filters.leaks(title, answers)
        if filters.leaks(str(step), answers):      # "step 2" when the answer is 2: the step goes unnumbered
            text = _t(lang, "r1_this", title=title) if safe else _t(lang, "listen")
        else:
            text = _t(lang, "r1", n=step, title=title) if safe else _t(lang, "r1_bare", n=step)
        return {"rung": 1, "text": text, "step": step, "lesson": lesson["id"]}
    if lesson:
        title = pick_text(lesson.get("title"), lang)
        return {"rung": 1, "text": _t(lang, "r1_lesson", title=title), "lesson": lesson["id"]}
    return {"rung": 1, "text": _t(lang, "r1_any")}


def _safe(rung: dict, answers, fallback: dict) -> dict:
    return fallback if filters.leaks(rung["text"], answers) else rung


def ladder(*, q: str | None, answer, lang: str, lesson: dict | None = None, step: int | None = None,
           own: list | None = None, seed_text: str = "") -> list[dict] | None:
    """The three rungs for one item: [{rung, text, step?, lesson?}], every one leak-checked against `answer`.

    `q`: the sum, when there is one; `own`: the pack's own rungs 2 and 3 (text objects), which win. None when code
    cannot make rungs 2 and 3 for it (a count with no `hints`)."""
    answers = [answer]
    lang = lang if lang in TEXT else "prs"
    r1 = rung_one(lesson, step, lang, answers)
    base = {"step": r1["step"], "lesson": r1["lesson"]} if "step" in r1 else {k: r1[k] for k in ("lesson",) if k in r1}
    listen = dict(base, text=_t(lang, "listen")) if "step" in r1 else dict(base, text=_t(lang, "r1_any"))
    if own:
        texts = [pick_text(t, lang) for t in own]
    else:
        kind = kind_of(q) if q else None
        if kind is None:
            if q is None or mathcheck.evaluate(normal(q)) is None:
                return None
            texts = [_t(lang, "r2_any"), _t(lang, "r3_any")]
        else:
            rng = random.Random(f"hint:{normal(q)}:{seed_text}")
            ex = None
            for _ in range(40):          # an example that is not this sum and holds none of its answer
                text, eq = _example(kind, lang, rng)
                if text and normal(eq) != normal(q) and not filters.leaks(text, answers):
                    ex = text
                    break
            first = _first_move(kind, lang)
            texts = [_t(lang, "r2", ex=ex) if ex else _t(lang, "listen"), first or _t(lang, "listen")]
    out = [r1]
    for k, text in enumerate(texts[:2], 2):
        out.append(_safe({"rung": k, "text": text}, answers, dict(listen, rung=k)))
    return out


def for_item(lesson: dict, item: dict, lang: str, seed: int) -> list[dict] | None:
    """The ladder for one numbered sheet item (`sheets.expand`), or None for an item with nothing to hint at."""
    if item.get("kind") == "sum":
        return ladder(q=item["q"], answer=item["a"], lang=lang, lesson=lesson, step=item.get("step"),
                      own=item.get("hints"), seed_text=f"{lesson['id']}:{seed}:{item['n']}")
    if item.get("kind") == "count":
        return ladder(q=None, answer=item["how_many"], lang=lang, lesson=lesson, step=item.get("step"),
                      own=item.get("hints"))
    return None


def check_own(item: dict, langs=("prs", "ps")) -> list[str]:
    """The validator's word on a fixed value item's hints: present where code cannot make them, two of them, and
    none giving the answer away."""
    k = item.get("kind")
    if k not in ("sum", "count"):
        return []
    own = item.get("hints")
    answer = item.get("how_many") if k == "count" else (item.get("a") or (
        mathcheck.fmt(v, fa=False) if (v := mathcheck.evaluate(str(item.get("q", "")))) is not None else None))
    if own is None:
        if k == "sum" and kind_of(str(item.get("q", ""))):
            return []
        return ["needs its own hints: rungs 2 and 3, a worked example with other numbers and the first move "
                "(code makes them only for sums of two fractions or two whole numbers)"]
    if not isinstance(own, list) or len(own) != 2:
        return ["hints must be two texts: rung 2 (a worked example with other numbers) and rung 3 (the first move)"]
    p = []
    for i, t in enumerate(own, 2):
        for lang in langs:
            if not pick_text(t, lang).strip():
                p.append(f"hint {i} has no {lang} text")
            elif answer is not None and filters.leaks(pick_text(t, lang), [answer]):
                p.append(f"hint {i} ({lang}) gives the answer away")
    return p

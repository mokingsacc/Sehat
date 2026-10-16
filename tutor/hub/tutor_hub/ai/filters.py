"""Filters on the way out and on the way back (BUILD-PLAN 3.7, 5.3).

Out: `scrub` takes identifiers out of a learner's words before any provider sees them: names she gave by mistake
("my name is ...", "اسم من ...", "زما نوم ..."), names the caller knows (`names`), phone numbers and other runs of
seven digits or more (in any script, with spaces or dashes between), and email addresses. Each becomes a marker,
so the question still reads. `find` says which kinds are still there (the recorder's scan in the tests).

Back: `leaks` says whether a hint gives away an answer: the same value as any answer, written as a fraction, a
decimal or a whole number, in Latin or Persian digits (`3/4`, `۳/۴`, `0.75`, `۰٫۷۵`). Words ("three quarters") come
with the hint ladder (P15).
"""
import re
from fractions import Fraction

MARK = {"name": "[name]", "number": "[number]", "email": "[email]"}
DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٫⁄", "01234567890123456789./")
# seven digits or more, with at most two spaces, dashes, dots or brackets between any two (\d is any script's digit)
DIGIT_RUN = re.compile(r"(?:\+|00)?\d(?:[\s\-.()]{0,2}\d){6,}")
EMAIL = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
# "my name is X": the word after these is a name (English, Dari, Pashto)
NAME_INTRO = re.compile(r"(?i)(\bmy name is|\bmy name's|\bi am called|\bi'm called|اسم من|اسمم|نام من|نامم"
                        r"|زما نوم|نوم مې)\s+(?:است\s+|دی\s+)?(?!\[name\])([^\s،,.!?؟]+)")


def _known(names) -> list[re.Pattern]:
    out = []
    for n in names or ():
        n = (n or "").strip()
        if len(n) >= 2:
            out.append(re.compile(r"(?<!\w)" + re.escape(n) + r"(?!\w)", re.IGNORECASE))
    return out


def scrub(text: str, names=()) -> tuple[str, list[str]]:
    """(the text with identifiers replaced by markers, the kinds that were found, each once, in order)."""
    found: list[str] = []

    def hit(kind):
        if kind not in found:
            found.append(kind)
        return MARK[kind]

    text = EMAIL.sub(lambda m: hit("email"), text or "")
    text = NAME_INTRO.sub(lambda m: m.group(1) + " " + hit("name"), text)
    for p in _known(names):
        text = p.sub(lambda m: hit("name"), text)
    text = DIGIT_RUN.sub(lambda m: hit("number"), text)
    return text, found


def find(text: str, names=()) -> list[str]:
    """The kinds of identifier in `text`; empty when it is clean."""
    return scrub(text, names)[1]


NUMBER = re.compile(r"(?<!\d)(?<!\d\.)(\d+(?:\s*/\s*\d+|\.\d+)?)(?!\d)(?!\.\d)")


def _value(s: str) -> Fraction | None:
    try:
        if "/" in s:
            a, b = (x.strip() for x in s.split("/"))
            return Fraction(int(a), int(b)) if int(b) else None
        return Fraction(s)
    except (ValueError, ZeroDivisionError):
        return None


def leaks(text: str, answers) -> bool:
    """True if `text` holds any of `answers` (strings or numbers) in any written form."""
    wanted = {v for v in (_value(str(a).translate(DIGITS).replace(" ", "")) for a in answers or ()) if v is not None}
    if not wanted:
        return False
    plain = (text or "").translate(DIGITS)
    return any(_value(m.group(1)) in wanted for m in NUMBER.finditer(plain))

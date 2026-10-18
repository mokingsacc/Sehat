"""Filters on the way out and on the way back (BUILD-PLAN 3.7, 5.3).

Out: `scrub` takes identifiers out of a learner's words before any provider sees them: names she gave by mistake
("my name is ...", "اسم من ...", "زما نوم ..."), names the caller knows (`names`), phone numbers and other runs of
seven digits or more (in any script, with spaces or dashes between), and email addresses. Each becomes a marker,
so the question still reads. `find` says which kinds are still there (the recorder's scan in the tests).

Back: `leaks` says whether a hint gives away an answer: the same value as any answer, written as a fraction, a
decimal, a mixed number or a whole number, in Latin or Persian digits (`3/4`, `۳/۴`, `0.75`, `۰٫۷۵`, `1 1/4`), or in
words (P15): "three quarters", "six eighths", "a half", "twenty-four", and the Dari and Pashto forms ("سه چهارم",
"درې څلورمې", "نیم"). The Dari and Pashto word lists are drafts for the reviewers (January): words that also mean
something else are left out ("نه" is "no" as well as nine, "ده" also "village"), so a hint naming those numbers in
words is not caught; teachers see held ladders in the pilot.
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


MIXED = re.compile(r"(?<![\d./])(\d+)\s+(\d+)\s*/\s*(\d+)(?![\d/])")
# 75% or 75 percent: the answer 3/4 as a percentage (Dari درصد, Pashto سلنه)
PERCENT = re.compile(r"(?<![\d.])(\d+(?:\.\d+)?)\s*(?:%|٪|percent\b|per cent\b|درصد|فیصد|سلنه)", re.IGNORECASE)

# number words (lower case, Arabic-script letters folded as textnorm does). Cardinals 0 to 20 and the tens; ordinals
# as fraction bottoms ("three quarters", "سه چهارم", "درې څلورمې"); a half on its own. English, then Dari, then
# Pashto (drafts: the reviewers' lists replace these in January).
_EN_UNITS = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
             "seventeen eighteen nineteen twenty").split()
_EN_TENS = {"thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
            "hundred": 100}
_EN_ORD = {"half": 2, "halves": 2, "third": 3, "quarter": 4, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7,
           "eighth": 8, "ninth": 9, "tenth": 10, "eleventh": 11, "twelfth": 12, "twentieth": 20}
_PRS = {"صفر": 0, "یک": 1, "دو": 2, "سه": 3, "چهار": 4, "چار": 4, "پنج": 5, "شش": 6, "هفت": 7, "هشت": 8,
        "ده": 10, "یازده": 11, "دوازده": 12, "سیزده": 13, "چهارده": 14, "چارده": 14, "پانزده": 15, "پونزده": 15,
        "شانزده": 16, "هفده": 17, "هجده": 18, "هژده": 18, "نزده": 19, "نوزده": 19, "بیست": 20, "سی": 30,
        "چهل": 40, "پنجاه": 50, "شصت": 60, "هفتاد": 70, "هشتاد": 80, "نود": 90, "صد": 100}
_PRS_ORD = {"دوم": 2, "سوم": 3, "چهارم": 4, "چارم": 4, "پنجم": 5, "ششم": 6, "هفتم": 7, "هشتم": 8, "نهم": 9,
            "دهم": 10, "یازدهم": 11, "دوازدهم": 12, "بیستم": 20}
_PS = {"صفر": 0, "یو": 1, "یوه": 1, "دوه": 2, "درې": 3, "دری": 3, "څلور": 4, "پنځه": 5, "شپږ": 6, "اووه": 7,
       "اوه": 7, "اته": 8, "نهه": 9, "لس": 10, "یوولس": 11, "دولس": 12, "دیارلس": 13, "څوارلس": 14, "پنځلس": 15,
       "شپاړس": 16, "اوولس": 17, "اتلس": 18, "نولس": 19, "شل": 20, "دېرش": 30, "څلوېښت": 40, "پنځوس": 50,
       "سل": 100}
_PS_ORD = {"دویم": 2, "دوهم": 2, "دریم": 3, "څلورم": 4, "پنځم": 5, "شپږم": 6, "اووم": 7, "اتم": 8, "نهم": 9,
           "لسم": 10, "یوولسم": 11, "دولسم": 12, "شلم": 20}
_HALF = {"half": 1, "نیم": 1, "نیمه": 1, "نیمی": 1, "نیمې": 1}
_FOLD = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ۍ": "ی", "ة": "ه", "ۀ": "ه"})
_WORD = re.compile(r"[^\W\d_]+", re.UNICODE)


def _cardinal(w: str) -> int | None:
    if w in _EN_TENS:
        return _EN_TENS[w]
    if w in _EN_UNITS:
        return _EN_UNITS.index(w)
    return _PRS.get(w, _PS.get(w))


def _ordinal(w: str) -> int | None:
    """A word as a fraction's bottom: quarters, fifths, چهارم, څلورمې (plural and Pashto endings folded)."""
    if w in _EN_ORD:
        return _EN_ORD[w]
    if w.endswith("s") and w[:-1] in _EN_ORD:
        return _EN_ORD[w[:-1]]
    for table in (_PRS_ORD, _PS_ORD):
        for end in ("", "ین", "ه", "ې", "ی"):
            if end and not w.endswith(end):
                continue
            base = w[: len(w) - len(end)] if end else w
            if base in table:
                return table[base]
    return None


def word_values(text: str) -> set[Fraction]:
    """Every value the text names in words: cardinals (with tens: "twenty-four", "بیست و چهار"), fractions
    ("three quarters", "a half", "سه چهارم") and a half alone."""
    words = [w.lower().translate(_FOLD) for w in _WORD.findall(text or "")]
    out: set[Fraction] = set()
    i = 0
    while i < len(words):
        w = words[i]
        n = _cardinal(w)
        if n is not None:
            # tens and a unit: "twenty four", "بیست و چهار", "شل او څلور"
            j = i + 1
            if n in (20, 30, 40, 50, 60, 70, 80, 90) and j < len(words):
                k = j + 1 if words[j] in ("و", "او", "and") else j
                u = _cardinal(words[k]) if k < len(words) else None
                if u is not None and 0 < u < 10:
                    n, j = n + u, k + 1
            den = _ordinal(words[j]) if j < len(words) else None
            if den:
                out.add(Fraction(n, den))
                i = j + 1
                continue
            out.add(Fraction(n))
            i = j
            continue
        if w in ("a", "an") and i + 1 < len(words) and _ordinal(words[i + 1]):
            out.add(Fraction(1, _ordinal(words[i + 1])))
            i += 2
            continue
        if w in _HALF:
            out.add(Fraction(1, 2))
        elif w in ("quarter",):
            out.add(Fraction(1, 4))
        i += 1
    return out


def leaks(text: str, answers) -> bool:
    """True if `text` holds any of `answers` (strings or numbers) in any written form, digits or words."""
    wanted = set()
    for a in answers or ():
        t = " ".join(str(a).translate(DIGITS).split())
        m = MIXED.fullmatch(t)
        v = Fraction(int(m[1])) + Fraction(int(m[2]), int(m[3])) if m and int(m[3]) else _value(t.replace(" ", ""))
        if v is not None:
            wanted.add(v)
    if not wanted:
        return False
    plain = (text or "").translate(DIGITS)
    if any(Fraction(int(m[1])) + Fraction(int(m[2]), int(m[3])) in wanted for m in MIXED.finditer(plain) if int(m[3])):
        return True
    if any(_value(m.group(1)) in wanted for m in NUMBER.finditer(plain)):
        return True
    if any((v := _value(m.group(1))) is not None and v / 100 in wanted for m in PERCENT.finditer(plain)):
        return True
    return bool(word_values(plain) & wanted)

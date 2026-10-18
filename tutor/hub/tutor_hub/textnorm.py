"""Text clean-up for Dari, Pashto and English, so a question typed on any keyboard finds the same answer.

Two levels:
- norm(text): the spelling everyone agrees on (Arabic letters to Persian ones, no vowel marks, Latin digits).
- key(text): looser, for search only. Pashto letters fold into their nearest Dari letter, because many people
  type Pashto on a Dari keyboard (ګ as گ, ې as ی, ښ as ش). Never show key() text to a child.
"""
import re
import unicodedata

# Arabic-script variants that look the same to a reader
_LETTERS = str.maketrans({
    "ي": "ی", "ى": "ی", "ئ": "ی", "ك": "ک", "ة": "ه", "ۀ": "ه", "ؤ": "و",
    "أ": "ا", "إ": "ا", "ٱ": "ا", "آ": "ا",
    "ـ": None,   # tatweel (kashida)
})
# Persian (۰–۹) and Arabic (٠–٩) digits to 0–9; Persian decimal and thousands marks
_DIGITS = str.maketrans({**{chr(0x06F0 + i): str(i) for i in range(10)},
                         **{chr(0x0660 + i): str(i) for i in range(10)},
                         "٫": ".", "٬": ","})
# looser folding for search keys: each Pashto letter to the Dari letter people type instead
_LOOSE = str.maketrans({"ګ": "گ", "ې": "ی", "ۍ": "ی", "ښ": "ش", "ږ": "ژ", "ټ": "ت", "ډ": "د",
                        "ړ": "ر", "ڼ": "ن", "ځ": "ز", "څ": "س"})
_MARKS = re.compile("[ً-ٰٟۖ-ۭ]")   # vowel marks and Quranic marks
_PUNCT = re.compile(r"[^\w\s/+\-×÷=*().]", re.UNICODE)
_SPACE = re.compile(r"\s+")


def digits_to_latin(text: str) -> str:
    return str(text).translate(_DIGITS)


def digits_to_fa(text: str) -> str:
    """0–9 to ۰–۹ (Dari and Pashto both use the Persian digit shapes)."""
    return "".join(chr(0x06F0 + int(c)) if "0" <= c <= "9" else c for c in str(text))


def norm(text: str) -> str:
    if not text:
        return ""
    t = unicodedata.normalize("NFC", str(text))
    t = _MARKS.sub("", t).translate(_LETTERS).translate(_DIGITS)
    t = t.replace("‌", " ").replace("‏", "").replace("‎", "")
    t = t.replace("−", "-").replace("–", "-")
    t = _PUNCT.sub(" ", t.lower())
    return _SPACE.sub(" ", t).strip()


def key(text: str) -> str:
    return norm(text).translate(_LOOSE)


# Small words that carry no meaning for search (Dari, Pashto, English), stored in key() form.
_STOP_WORDS = """
و در به از که این آن را با برای هم یک است هست بود شود می شد کرد کن کنید کردن باشد چه چی چیست کدام یا تا اگر ولی
من تو او ما شما آنها ای ها های اند ام
د په کې کی ته چې دا هغه او یو څه شي ده دي وي نه زه موږ تاسو دوی سره لپاره
the a an is are was were be to of and or in on at for with what which who do does did can i you it this that
"""
STOP = {key(w) for w in _STOP_WORDS.split()}


def tokens(text: str, drop_stop: bool = True) -> list[str]:
    out = []
    for w in key(text).split():
        w = w.strip("/+-×÷=*().")
        if not w or (drop_stop and w in STOP):
            continue
        out.append(w)
    return out

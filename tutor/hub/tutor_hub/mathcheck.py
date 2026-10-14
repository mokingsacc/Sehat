"""Exact arithmetic for the Ask tab, with no AI involved.

- solve(question): a sum like "۱/۲ + ۱/۴ چند می‌شود؟" is worked out exactly (fractions stay fractions).
- check(text): every "a + b = c" written in an answer (by the AI or a teacher) is recomputed, so a wrong sum is
  caught before a child sees it. Small AI models are weak at arithmetic; the hub never trusts their sums.

Only plain arithmetic is checked. A sum that is part of algebra ("x + ۱/۲ = ۳/۴") is left alone, never "corrected".
"""
import ast
import re
from dataclasses import dataclass, field
from fractions import Fraction

from .textnorm import digits_to_fa, digits_to_latin

_OPS = str.maketrans({"×": "*", "÷": "/", "−": "-", "–": "-", "٫": ".", "＝": "="})
_D = "0-9۰-۹٠-٩"
# a run of maths characters: digits (any script), operators, brackets, spaces, '=' and question marks
_SPAN = re.compile(rf"[{_D}(][{_D}.٫/+\-−–×÷*()\s=＝?؟]*[{_D})=?؟]")
_OP_CHARS = set("+-−–×÷*/=^")
_LIST_MARK = re.compile(r"^\s*\d+\s*[).]\s*")
MAX_LEN = 80


def _num(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
        if abs(node.value) > 10**12:
            raise ValueError("too big")
        return Fraction(str(node.value)) if isinstance(node.value, float) else Fraction(node.value)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _num(node.operand)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
        a, b = _num(node.left), _num(node.right)
        if isinstance(node.op, ast.Add):
            return a + b
        if isinstance(node.op, ast.Sub):
            return a - b
        if isinstance(node.op, ast.Mult):
            return a * b
        if b == 0:
            raise ZeroDivisionError
        return a / b
    raise ValueError("not arithmetic")


def evaluate(expr: str):
    """The exact value of a plain sum ("3/4 + 0.5", "۲ × (۳ + ۱)"), or None if it is not plain arithmetic."""
    e = digits_to_latin(str(expr)).translate(_OPS).strip()
    if not e or len(e) > MAX_LEN:
        return None
    try:
        return _num(ast.parse(e, mode="eval").body)
    except (SyntaxError, ValueError, ZeroDivisionError, TypeError, RecursionError, MemoryError):
        return None


def fmt(v: Fraction, fa: bool = True) -> str:
    """3/4, 2 or -1/2 (in Persian digits unless fa=False)."""
    s = str(v.numerator) if v.denominator == 1 else f"{v.numerator}/{v.denominator}"
    return digits_to_fa(s) if fa else s


def _works_something_out(expr: str) -> bool:
    """True if the expression does an operation; one fraction (۳/۴) or a date (۱۴۰۵/۷/۲۲) does not."""
    e = re.sub(r"\s+", " ", digits_to_latin(expr)).strip()
    if re.search(r"[\d)]\s*[+\-−–×÷*]\s*[(\d]", e):
        return True
    return bool(re.search(r"\)\s*/|/\s*\(", e))   # only fraction bars left: "(۱/۲)/(۱/۴)" still works something out


def _in_algebra(text: str, start: int, end: int) -> bool:
    """True if the maths run is glued to letters or more operators (x + ۱/۲ = ۳/۴), i.e. part of algebra."""
    i = start - 1
    if i >= 0 and text[i].isalpha():
        return True
    while i >= 0 and text[i] == " ":
        i -= 1
    if i >= 0 and text[i] in _OP_CHARS:
        return True
    j = end
    if j < len(text) and text[j].isalpha():
        return True
    while j < len(text) and text[j] == " ":
        j += 1
    return j < len(text) and text[j] in _OP_CHARS


@dataclass
class Check:
    checked: int = 0
    wrong: list = field(default_factory=list)   # the sums that do not add up, as written

    @property
    def ok(self) -> bool:
        return not self.wrong


def check(text: str) -> Check:
    """Recompute every equality chain (a = b = c) in the text that works something out."""
    text = str(text or "")
    out = Check()
    for m in _SPAN.finditer(text):
        span = m.group(0).translate(_OPS).replace("?", "").replace("؟", "")
        if "=" not in span or _in_algebra(text, m.start(), m.end()):
            continue
        parts = [p.strip() for p in span.split("=")]
        parts[0] = _LIST_MARK.sub("", parts[0]) if evaluate(parts[0]) is None else parts[0]
        if len(parts) < 2 or any(not p for p in parts):
            continue
        vals = [evaluate(p) for p in parts]
        if any(v is None for v in vals):
            continue
        out.checked += 1
        if len(set(vals)) > 1:
            out.wrong.append(m.group(0).strip())
    return out


def solve(question: str):
    """If the question is just a sum, return (the sum written neatly with Latin digits, exact value); else None."""
    q = str(question or "")
    found = [m for m in _SPAN.finditer(q) if _works_something_out(m.group(0).replace("=", " ").replace("?", " ")
                                                                    .replace("؟", " "))]
    if len(found) != 1 or _in_algebra(q, found[0].start(), found[0].end()):
        return None
    raw = found[0].group(0).replace("?", "").replace("؟", "").replace("＝", "=").strip()
    if raw.count("=") > 1 or (raw.count("=") == 1 and not raw.endswith("=")):
        return None   # "a + b = c" is a claim to check, not a sum to work out
    expr = raw.rstrip("=").strip()
    v = evaluate(expr)
    if v is None:
        return None
    # the sum must hold all the question's numbers, so a word problem is never cut down to part of it
    if sum(ch.isdigit() for ch in digits_to_latin(q)) > sum(ch.isdigit() for ch in digits_to_latin(expr)):
        return None
    shown = digits_to_latin(expr).replace("*", "×").replace("−", "-").replace("–", "-")
    shown = re.sub(r"\s*([+\-×÷])\s*", r" \1 ", shown)
    shown = re.sub(r"\s*/\s*", "/", shown)
    return re.sub(r"\s+", " ", shown).strip(), v


def mark(text: str) -> str:
    """Wrap each sum in $...$ so the app and the printed sheet show it left to right inside Dari or Pashto text.

    A lone number or fraction needs no wrapping; "۱/۲ + ۱/۴ = ۳/۴" does, or right-to-left text reorders it.
    """
    text = str(text or "")
    if "$" in text:
        return text   # already marked by a person
    out, last = [], 0
    for m in _SPAN.finditer(text):
        span = m.group(0).rstrip("?؟ ")
        if not any(c in span for c in "+-−–×÷*=＝"):
            continue
        out.append(text[last:m.start()])
        out.append(f"${span}$")
        last = m.start() + len(span)
    out.append(text[last:])
    return "".join(out)

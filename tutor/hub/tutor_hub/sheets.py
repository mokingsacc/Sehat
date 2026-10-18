"""Printable worksheets: a lesson's "sheet" as one A4 page (HTML), a PDF for the hub's printer, and an answer key.

Paper is the point: children practise with a pencil, then check their sheet in the app ("Check my sheet"), by typing
their answers or, online, by a photo (P14). Sheets are black line work on white, cheap on ink and fine on any printer.
A sheet with a generator gets new numbers on every print; the code printed at its foot brings back its answers.

The page is laid out for the phone's camera (C2.1, DESIGN-C2C3-SPECS.md item 1), everything placed in millimetres:
- four 12 mm corner squares, the top-right one a ring with a 6 mm hole, so the phone finds the page and knows which
  way is up; nothing else on the sheet has a solid black area wider than 6 mm;
- a header with the title and tag at the start and the Name and Date boxes at the end, away from every answer cell;
- a fixed grid of item slots (two columns of 87 mm, 4 mm apart): every answer cell's place is a function of the
  item list alone (`layout`), never of how the text flows, so the hub's PDF, any browser's print and the phone agree;
- a foot with a QR code holding text, never a URL (`Q1 <code> <LANG>`), and the code in Latin letters, which carries a
  Damm check digit after the seed (`M7-03-48217`), so a mistyped code is refused rather than marked against another
  sheet. No app name, URL or cohort on a learner's sheet.
`layout()` is the one place positions come from: the HTML, the key's cells (in mm from the top-left square's centre,
already mirrored for the language) and the layout tests all read it.
"""
import html
import math
import random
import re
from fractions import Fraction

from . import hints, mathcheck, qr
from .packs import picture_file
from .packs import text as pick_text
from .textnorm import digits_to_fa

SUBJECT_NAMES = {
    "maths": {"prs": "ریاضی", "ps": "ریاضي", "en": "Maths"},
    "science": {"prs": "ساینس", "ps": "ساینس", "en": "Science"},
    "english": {"prs": "انگلیسی", "ps": "انګلیسي", "en": "English"},
    "dari": {"prs": "دری", "ps": "دري", "en": "Dari"},
    "pashto": {"prs": "پښتو", "ps": "پښتو", "en": "Pashto"},
    "chinese": {"prs": "چینایی", "ps": "چینايي", "en": "Chinese"},
}
WORDS = {
    "name": {"prs": "نام", "ps": "نوم", "en": "Name"},
    "date": {"prs": "تاریخ", "ps": "نېټه", "en": "Date"},
    "year": {"prs": "صنف", "ps": "ټولګی", "en": "Year"},
    "starting": {"prs": "آغاز", "ps": "پیل", "en": "Starting"},
    "answers": {"prs": "جواب‌ها", "ps": "ځوابونه", "en": "Answers"},
    "for_teacher": {"prs": "برای معلم یا پدر و مادر", "ps": "د ښوونکي یا مور او پلار لپاره", "en": "For the teacher or parent"},
    "working": {"prs": "کار", "ps": "کار", "en": "Working"},
    "self": {"prs": "خودت ببین", "ps": "پخپله یې وګوره", "en": "Check it yourself"},
}

# ---- the page's geometry, in mm from the paper's top-left corner (DESIGN-C2C3-SPECS.md item 1) ----
PAGE_W, PAGE_H = 210, 297
MARK = 12                               # the corner squares
MARK_HOLE = 6                           # the top-right ring's hole
MARK_CENTRES = {"tl": (16, 16), "tr": (194, 16), "bl": (16, 281), "br": (194, 281)}
ORIGIN = MARK_CENTRES["tl"]             # the key's positions are from here, x to the right, y down
FRAME = (178, 265)                      # from the top-left centre to the bottom-right centre
HEADER = (26, 10, 184, 30)              # x0, y0, x1, y1
NAME_BOX, DATE_BOX = (60, 9), (36, 9)
LABEL_W = 13                            # "Name" and "Date" sit outside their boxes, at the start side
BODY = (16, 34, 194, 264)
COL, GUTTER, ROW_GAP = 87, 4, 4
QR_MM = 18
QR_BOX = (96, 269, 114, 287)            # centred in the foot (y 268 to 288)
CODE_GAP = 5                            # the printed code, beside the QR at its end side
WORK_MIN = 20                           # one "Working" box takes what is left of the body, if at least this
CROP = 2.5                              # the phone cuts each cell out with this much around it
CELL_CLEAR = 4                          # a cell keeps at least this far from anything else
NUM = {False: 8, True: 10}              # the item number's circle, clean and bold

# answer cells (C2.1): one box per answer, never a row of digit boxes; w x h in mm, clean and bold
CELLS = {
    "int": {False: (30, 22), True: (30, 22)},
    "frac": {False: (24, 13), True: (26, 14)},       # each of the two boxes, 4 mm apart, a bar between
    "mixed": {False: (14, 13), True: (15, 14)},      # the whole number's box, 3 mm before a frac
}
FRAC_GAP, MIXED_GAP = 4, 3

# item heights in mm (clean, bold): the final table, also in DESIGN.md ("Sheet heights")
HEIGHTS = {
    "sum_int": (28, 34),
    "sum_frac": (34, 40),               # the draft's 38 / 44, less the 4 mm P13 may take, to give M7-03 room
    "count_few": (40, 44),              # up to 6 objects, 12 mm pictures in rows of 3: half width
    "count_many": (34, 40),             # more than 6: full width
    "trace": (34, 38),
    "circle": (40, 44),
    "sort": (60, 60),
    "draw": (64, 64),
}
WRITE_TOP, WRITE_LINE = 12, 10          # write: 12 + 10 per line
PROMPT_ROW = (7, 8)                     # a generated group's own prompt, full width
INTRO_LINE = (6, 7.5)                   # the intro, per line
EXAMPLE_ROW = (16, 18)                  # the intro beside the example box


def esc(s) -> str:
    return html.escape(str(s), quote=True)


def is_latin(s: str) -> bool:
    return bool(re.search(r"[A-Za-z]", s)) and not re.search(r"[؀-ۿ]", s)


def is_han(s: str) -> bool:
    """Chinese characters (P27a): traced in the Chinese font subset, app/fonts/noto-sc.woff2."""
    return bool(re.search(r"[\u3400-\u9fff]", s))


def digits(s, lang: str) -> str:
    return digits_to_fa(str(s)) if lang in ("prs", "ps") else str(s)


def rich(t, lang: str) -> str:
    """Lesson text to HTML: $sums$ shown left to right, digits in the reader's script, English kept left to right."""
    s = pick_text(t, lang)
    if is_latin(s):
        return f'<span class="en">{esc(s)}</span>'
    parts = s.split("$")
    out = []
    for i, part in enumerate(parts):
        if i % 2:
            out.append(f'<span class="m">{esc(digits(part, lang))}</span>')
        else:
            out.append(esc(digits(part, lang)))
    return "".join(out)


def _ops(s: str) -> str:
    return s.replace("*", "×").replace(" - ", " − ")


def stacked(expr: str, lang: str, eq: bool = False) -> str:
    """"1/2 + 1/4" with each fraction drawn as a number over a number, the way school books print them.

    eq=True ends the sum with "=", the answer going in the cell beside it."""
    out, last = [], 0
    for m in re.finditer(r"(\d+)\s*/\s*(\d+)", expr):
        out.append(esc(_ops(digits(expr[last:m.start()], lang))))
        out.append(f'<span class="fr"><span class="n">{esc(digits(m.group(1), lang))}</span>'
                   f'<span class="d">{esc(digits(m.group(2), lang))}</span></span>')
        last = m.end()
    out.append(esc(_ops(digits(expr[last:], lang))))
    if eq:
        out.append(" =")
    return f'<span class="m sum">{"".join(out)}</span>'


# ---- the code: lesson code, seed and a Damm check digit (C2.1) ----

DAMM = ("0317598642", "7092154863", "4206871359", "1750983426", "6123045978",
        "3674209581", "5869720134", "8945362017", "9438617205", "2581436790")


def damm(digits_: str) -> int:
    """The Damm check digit of a string of digits: any one wrong digit or two swapped neighbours change it."""
    i = 0
    for d in digits_:
        i = int(DAMM[i][int(d)])
    return i


def sheet_code(lesson: dict, seed: int) -> str:
    """`M7-03-48217`: the lesson's code, the 4-digit seed and its check digit; a sheet without a seed keeps the bare
    lesson code, and so does seed 0 (as app/js/sheetcode.js makes it: the bare code reads back as seed 0)."""
    code = lesson["sheet"]["code"]
    if not needs_seed(lesson) or not seed:
        return code
    s = f"{seed:04d}"
    return f"{code}-{s}{damm(s)}"


def parse_code(text: str):
    """(lesson code, seed) from a typed or printed code, or None when the check digit is wrong or the code is not one.

    Persian or Latin digits and any separators: `m7 03 48217`, `M7-03-۴۸۲۱۷`. A code without a seed part gives seed 0."""
    t = digits_to_latin_upper(text)
    m = re.match(r"^(.+?)-(\d{5})$", t)
    if m:
        s = m.group(2)
        return (m.group(1), int(s[:4])) if damm(s) == 0 else None
    return (t, 0) if re.match(r"^[A-Z0-9-]{2,12}$", t) else None


def digits_to_latin_upper(text: str) -> str:
    from .textnorm import digits_to_latin
    t = digits_to_latin(str(text or "")).upper().strip()
    return re.sub(r"-+", "-", re.sub(r"[\s·._–—]+", "-", t)).strip("-")


def qr_text(code: str, lang: str) -> str:
    """What the QR code holds: the format version, the code and the language, never a URL."""
    return f"Q1 {code} {lang.upper()}"


# ---- generators: new numbers on every print, the same numbers again for the same seed ----

def gen_fraction_add(rng: random.Random, count: int, max_den: int = 12, same_first: int = 2):
    out, seen, tries = [], set(), 0
    while len(out) < count and tries < 5000:
        tries += 1
        if len(out) < same_first:
            d = rng.randint(3, max_den)
            d1 = d2 = d
        else:
            d1, d2 = rng.sample(range(2, max_den + 1), 2)
            if math.lcm(d1, d2) > max_den * 2:
                continue
        a, b = rng.randint(1, d1 - 1), rng.randint(1, d2 - 1)
        if math.gcd(a, d1) != 1 or math.gcd(b, d2) != 1:
            continue
        total = Fraction(a, d1) + Fraction(b, d2)
        if total > 1 or (a, d1, b, d2) in seen or (b, d2, a, d1) in seen:
            continue
        seen.add((a, d1, b, d2))
        out.append({"q": f"{a}/{d1} + {b}/{d2}", "a": mathcheck.fmt(total, fa=False)})
    return out


def gen_add_sub(rng: random.Random, count: int, max_total: int = 10, ops: str = "+-"):
    out, seen, tries = [], set(), 0
    while len(out) < count and tries < 5000:
        tries += 1
        op = rng.choice(ops)
        a, b = rng.randint(0, max_total), rng.randint(0, max_total)
        if op == "+" and a + b > max_total:
            continue
        if op == "-" and a < b:
            continue
        if (a, op, b) in seen:
            continue
        seen.add((a, op, b))
        out.append({"q": f"{a} {op} {b}", "a": str(a + b if op == "+" else a - b)})
    return out


def gen_times(rng: random.Random, count: int, tables=(2, 3, 4, 5)):
    out, seen, tries = [], set(), 0
    while len(out) < count and tries < 5000:
        tries += 1
        a, b = rng.choice(list(tables)), rng.randint(1, 10)
        if (a, b) in seen:
            continue
        seen.add((a, b))
        out.append({"q": f"{a} × {b}", "a": str(a * b)})
    return out


GENERATORS = {"fraction_add": gen_fraction_add, "add_sub": gen_add_sub, "times": gen_times}
# the cell a generator's answers are written in: decided by the generator, never by one answer, so the box's shape
# says nothing about the answer
GENERATOR_CELL = {"fraction_add": "frac", "add_sub": "int", "times": "int"}
ITEM_OPTS = ("kind", "type", "count", "prompt", "work", "step", "step_same")


def _step_for(it: dict, q: str):
    """The lesson step a generated sum's first hint points to: `step_same` for a fraction sum whose bottom numbers
    already match (when the lesson teaches that in its own step), else `step`."""
    if it.get("step_same"):
        k = hints.kind_of(q)
        if k and k[0] == "frac" and k[2] == k[4]:
            return it["step_same"]
    return it.get("step")


def needs_seed(lesson: dict) -> bool:
    return any(it.get("kind") == "generate" for it in (lesson.get("sheet") or {}).get("items", []))


def expand(lesson: dict, seed: int):
    """The sheet's items with generated sums filled in, each with its number on the page."""
    rng = random.Random(f"{lesson['id']}:{seed}")
    out, n = [], 0
    for it in lesson["sheet"]["items"]:
        if it["kind"] == "generate":
            opts = {k: v for k, v in it.items() if k not in ITEM_OPTS}
            sums = GENERATORS[it["type"]](rng, it["count"], **opts)
            group = []
            for s in sums:
                n += 1
                group.append({"kind": "sum", "n": n, "q": s["q"], "a": s["a"], "cell": GENERATOR_CELL[it["type"]],
                              "step": _step_for(it, s["q"])})
            out.append({"kind": "sums", "prompt": it.get("prompt"), "items": group, "work": it.get("work", True)})
        else:
            n += 1
            x = dict(it, n=n)
            if x["kind"] == "sum":
                if "a" not in x:
                    x["a"] = mathcheck.fmt(mathcheck.evaluate(x["q"]), fa=False)
                whole = mathcheck.evaluate(str(x["a"])).denominator == 1
                x["cell"] = "int" if whole else ("mixed" if x.get("mixed") else "frac")
            elif x["kind"] == "count":
                x["cell"] = "int"
            out.append(x)
    return out


def items_of(expanded) -> list[dict]:
    """Every numbered item, in order, with generated groups opened up."""
    return [it for x in expanded for it in (x["items"] if x["kind"] == "sums" else [x])]


# ---- layout: every box's place on the paper ----

def cell_size(kind: str, bold: bool) -> tuple[float, float]:
    w, h = CELLS["frac"][bold]
    frac = (w, 2 * h + FRAC_GAP)
    if kind == "int":
        return CELLS["int"][bold]
    if kind == "frac":
        return frac
    mw, _ = CELLS["mixed"][bold]
    return (mw + MIXED_GAP + frac[0], frac[1])


def _slot(it: dict, bold: bool) -> tuple[str, float]:
    """(width "half" or "full", height in mm) of one item's slot."""
    k, b = it["kind"], int(bold)
    if k == "sum":
        return "half", HEIGHTS["sum_int" if it["cell"] == "int" else "sum_frac"][b]
    if k == "count":
        few = it["how_many"] <= 6
        return ("half" if few else "full"), HEIGHTS["count_few" if few else "count_many"][b]
    if k == "write":
        return "full", WRITE_TOP + WRITE_LINE * int(it.get("lines", 2))
    return "full", HEIGHTS[k][b]


def _intro_lines(text: str, width_mm: float, bold: bool) -> int:
    per_line = width_mm / (2.6 if bold else 2.1)          # characters a line holds, roughly, in Vazirmatn
    return max(1, math.ceil(len(text) / per_line))


def layout(lesson: dict, seed: int, lang: str) -> dict:
    """Where everything on the sheet goes, in mm from the paper's top-left corner, already mirrored for the language.

    Returns {bold, rtl, marks, header, title, name, date, name_label, date_label, intro, example, prompts, items,
    work, qr, code, height, fits}; each item is {n, kind, x, y, w, h, cell} with cell {kind, x, y, w, h} or None."""
    # years 1 to 6 print bold, and adult packs the literacy track sees (P26: packs.Library marks them `_bold`)
    bold = lesson.get("_bold", lesson["year"] <= 6)
    rtl = lang != "en"
    x0, y0, x1, y1 = BODY

    def mirror(x, w):                               # a box laid out from the start side, placed on the paper
        return (x1 - (x - x0) - w) if rtl else x

    out = {"bold": bold, "rtl": rtl}
    out["marks"] = {k: (cx - MARK / 2, cy - MARK / 2, MARK, MARK) for k, (cx, cy) in MARK_CENTRES.items()}
    hx0, hy0, hx1, hy1 = HEADER
    out["header"] = HEADER
    nw, nh = NAME_BOX
    dw, dh = DATE_BOX
    # the boxes at the header's end side, their labels outside them at the start side
    if rtl:
        out["name"] = (hx0, hy0 + 0.5, nw, nh)
        out["date"] = (hx0, hy0 + 1.5 + nh, dw, dh)
        out["name_label"] = (hx0 + nw + 1, hy0 + 0.5, LABEL_W, nh)
        out["date_label"] = (hx0 + dw + 1, hy0 + 1.5 + nh, LABEL_W, dh)
        tx0 = hx0 + nw + 1 + LABEL_W + 3
        out["title"] = (tx0, hy0, hx1 - tx0, hy1 - hy0)
    else:
        out["name"] = (hx1 - nw, hy0 + 0.5, nw, nh)
        out["date"] = (hx1 - dw, hy0 + 1.5 + nh, dw, dh)
        out["name_label"] = (hx1 - nw - 1 - LABEL_W, hy0 + 0.5, LABEL_W, nh)
        out["date_label"] = (hx1 - dw - 1 - LABEL_W, hy0 + 1.5 + nh, LABEL_W, dh)
        out["title"] = (hx0, hy0, hx1 - nw - 1 - LABEL_W - 3 - hx0, hy1 - hy0)

    sheet = lesson["sheet"]
    y = y0
    rows_started = False

    def gap():
        nonlocal y, rows_started
        if rows_started:
            y += ROW_GAP
        rows_started = True

    out["intro"] = out["example"] = None
    intro = pick_text(sheet.get("intro"), lang) if sheet.get("intro") else ""
    if sheet.get("example"):
        gap()
        h = EXAMPLE_ROW[bold]
        lines = _intro_lines(intro, COL, bold) if intro else 0
        h = max(h, lines * INTRO_LINE[bold])
        if intro:
            out["intro"] = (mirror(x0, COL), y, COL, h)
        out["example"] = (mirror(x0 + COL + GUTTER, COL), y, COL, h)
        y += h
    elif intro:
        gap()
        h = _intro_lines(intro, x1 - x0, bold) * INTRO_LINE[bold]
        out["intro"] = (x0, y, x1 - x0, h)
        y += h

    expanded = expand(lesson, seed)
    out["prompts"] = []
    items: list[dict] = []
    pending = None                                  # a half-width item waiting for its partner

    def place(it, x, w, h):
        cell = None
        if it.get("cell"):
            cw, ch = cell_size(it["cell"], bold)
            cy = y + (h - ch) / 2
            cx = x if rtl else x + w - cw           # the item's end side
            cell = {"kind": it["cell"], "x": cx, "y": cy, "w": cw, "h": ch}
        items.append({"n": it["n"], "kind": it["kind"], "x": x, "y": y, "w": w, "h": h, "cell": cell, "src": it})

    def flush():
        nonlocal y, pending
        if pending is not None:
            it, h = pending
            place(it, mirror(x0, COL), COL, h)
            y += h
            pending = None

    for x in expanded:
        group = x["items"] if x["kind"] == "sums" else [x]
        if x["kind"] == "sums" and x.get("prompt"):
            flush()
            gap()
            ph = PROMPT_ROW[bold]
            out["prompts"].append({"text": x["prompt"], "box": (x0, y, x1 - x0, ph)})
            y += ph
        for it in group:
            width, h = _slot(it, bold)
            if width == "full":
                flush()
                gap()
                place(it, x0, x1 - x0, h)
                y += h
            elif pending is None:
                gap()
                pending = (it, h)
            else:
                first, fh = pending
                rh = max(fh, h)
                place(first, mirror(x0, COL), COL, rh)
                place(it, mirror(x0 + COL + GUTTER, COL), COL, rh)
                y += rh
                pending = None
    flush()
    out["items"] = items
    out["height"] = y - y0
    out["fits"] = y <= y1
    left = y1 - (y + ROW_GAP)
    out["work"] = (x0, y + ROW_GAP, x1 - x0, left) if left >= WORK_MIN else None
    out["qr"] = (QR_BOX[0], QR_BOX[1], QR_MM, QR_MM)
    code_w = 46
    cx = QR_BOX[0] - CODE_GAP - code_w if rtl else QR_BOX[2] + CODE_GAP
    out["code"] = (cx, QR_BOX[1], code_w, QR_MM)
    return out


def too_tall(lesson: dict) -> str | None:
    """Why the sheet fails the validator (its rows need more than the body's 230 mm), or None."""
    if not lesson.get("sheet"):
        return None
    lay = layout(lesson, 1234, "prs")
    if not lay["fits"]:
        return f"the sheet's rows need {lay['height']:.0f} mm, more than the {BODY[3] - BODY[1]} mm a page has: split it"
    return None


def frame_box(x, y, w, h) -> dict:
    """A box on the paper as the key gives it: mm from the top-left square's centre."""
    return {"x": round(x - ORIGIN[0], 2), "y": round(y - ORIGIN[1], 2), "w": round(w, 2), "h": round(h, 2)}


def answer_key(lesson: dict, seed: int, lang: str, picture_url) -> dict:
    """What the app needs for "Check my sheet": every numbered item, how to check it and, for a value item, where its
    answer cell is (C2.1) and its three hints (C2.3, `hints.py`, leak-checked here, so they are cached on the phone
    with the key); the sheet's code, language and frame; and the intro and example for "Do it on screen"."""
    lay = layout(lesson, seed, lang)
    rows = []
    for li in lay["items"]:
        it = li["src"]
        k = it["kind"]
        row = {"n": it["n"], "kind": k, "step": it.get("step")}
        if k == "sum":
            row.update(q=it["q"], a=it["a"], check="value", prompt=pick_text(it.get("prompt"), lang) or None,
                       hints=hints.for_item(lesson, it, lang, seed))
        elif k == "count":
            row.update(a=str(it["how_many"]), check="value", prompt=pick_text(it.get("prompt"), lang) or None,
                       picture=picture_url(it["picture"]),          # "Do it on screen" draws the objects to count
                       hints=hints.for_item(lesson, it, lang, seed))
        elif k == "write":
            row.update(a=pick_text(it.get("a"), lang) if it.get("a") else "", check="self",
                       prompt=pick_text(it.get("prompt"), lang))
        elif k == "circle":
            row.update(a=[picture_url(p) for p in it.get("answer", [])], check="self",
                       prompt=pick_text(it.get("prompt"), lang))
        elif k == "sort":
            groups = [pick_text(g, lang) for g in it.get("groups", [])]
            row.update(a=[[pick_text(w, lang), groups[g]] for w, g in zip(it.get("words", []), it.get("answer", []))],
                       check="self", prompt=pick_text(it.get("prompt"), lang))
        else:
            row.update(check="none", prompt=pick_text(it.get("prompt"), lang) or None)
        if li["cell"]:
            c = li["cell"]
            row["cell"] = dict(kind=c["kind"], **frame_box(c["x"], c["y"], c["w"], c["h"]))
        rows.append(row)
    sheet = lesson["sheet"]
    ex = sheet.get("example")
    return {"lesson": lesson["id"], "code": sheet_code(lesson, seed), "lesson_code": sheet["code"], "seed": seed,
            "lang": lang, "frame": {"w": FRAME[0], "h": FRAME[1]},
            "intro": pick_text(sheet.get("intro"), lang) or None,
            "example": {"text": pick_text(ex.get("text"), lang), "math": ex.get("math")} if ex else None,
            "items": rows}


# ---- the HTML ----

CSS = """
@font-face{font-family:'Vazirmatn';font-weight:500;src:url(FONTS/vazirmatn-500.woff2) format('woff2')}
@font-face{font-family:'Vazirmatn';font-weight:800;src:url(FONTS/vazirmatn-800.woff2) format('woff2')}
@font-face{font-family:'Naskh';font-weight:500;src:url(FONTS/naskh-500.woff2) format('woff2')}
@font-face{font-family:'Naskh';font-weight:700;src:url(FONTS/naskh-700.woff2) format('woff2')}
@font-face{font-family:'NotoSC';font-weight:500;src:url(FONTS/noto-sc.woff2) format('woff2')}
*{box-sizing:border-box}
html{color:#000;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Vazirmatn,'Noto Naskh Arabic','NotoSC',sans-serif;font-weight:500;line-height:1.5}
.m{direction:ltr;unicode-bidi:isolate;display:inline-block;font-family:Vazirmatn,sans-serif}
.en{direction:ltr;unicode-bidi:isolate}
.fr{display:inline-block;vertical-align:middle;text-align:center;margin:0 .6mm;line-height:1.15}
.fr .n{display:block;border-bottom:1.1pt solid #000;padding:0 1mm}
.fr .d{display:block;padding:0 1mm}
"""

SHEET_CSS = """
@page{size:A4;margin:0}
.sheet{position:relative;width:210mm;height:297mm;overflow:hidden;break-after:page;page-break-after:always;font-size:12pt}
.sheet:last-child{break-after:auto;page-break-after:auto}
.sheet.bold{font-size:15pt}
.sheet>*{position:absolute;margin:0}
.mk svg{display:block;width:100%;height:100%}
.title h1{font-weight:800;font-size:16pt;line-height:1.25;margin:0;text-align:start}
.title .tag{display:inline-block;border:1pt solid #000;border-radius:9pt;padding:0 2.5mm;font-size:10pt;font-weight:800;margin-top:1mm}
.lbl{font-size:10.5pt;line-height:9mm;text-align:end;white-space:nowrap}
.wbox{border:1pt solid #000;border-radius:1.5mm}
.intro{font-size:11.5pt;line-height:6mm;text-align:start}
.bold .intro{font-size:13.5pt;line-height:7.5mm}
.example{border:1.2pt dashed #000;border-radius:3mm;padding:1.5mm 3mm;font-size:11pt;display:flex;align-items:center;gap:2mm;flex-wrap:wrap}
.gprompt{font-weight:800;line-height:7mm}
.title h1,.intro,.gprompt,.prompt,.example>span{unicode-bidi:plaintext}
.item .num{position:absolute;top:0;width:8mm;height:8mm;border:1.4pt solid #000;border-radius:50%;text-align:center;font-weight:800;font-size:11pt;line-height:7.4mm}
.bold .item .num{width:10mm;height:10mm;font-size:13pt;line-height:9.2mm}
[dir=rtl] .item .num{right:0}[dir=ltr] .item .num{left:0}
.item .body{position:absolute;top:0;bottom:0;overflow:visible}
[dir=rtl] .item .body{right:10mm}[dir=ltr] .item .body{left:10mm}
[dir=rtl] .bold .item .body{right:12mm}[dir=ltr] .bold .item .body{left:12mm}
.item.mid .body{display:flex;flex-direction:column;justify-content:center;align-items:flex-start}
.prompt{font-weight:800;margin:0 0 1.5mm;line-height:1.35}
.sum{font-size:15pt;white-space:nowrap}
.bold .sum{font-size:18pt}
.cell{border:1.4pt solid #000;border-radius:2mm}
.cell.frac,.cell.mixed{border:0;border-radius:0}
.cell i{position:absolute;display:block;border:1.4pt solid #000;border-radius:2mm}
.cell i.bar{border:0;border-top:1.2pt solid #000;border-radius:0;height:0}
.trace{font-family:Naskh,serif;font-weight:700;color:#999;font-size:34pt;line-height:1.25;white-space:nowrap;display:flex;justify-content:space-around;border-bottom:1pt dashed #777}
.bold .trace{font-size:38pt}
.trace.word{font-size:28pt}.bold .trace.word{font-size:31pt}
.trace.latin{font-family:Vazirmatn,sans-serif;font-weight:500;direction:ltr;font-size:24pt}.bold .trace.latin{font-size:26pt}
.trace.han{font-family:'NotoSC',sans-serif;font-weight:500;direction:ltr;font-size:30pt}
.write-row{display:flex;gap:2.5mm;margin-top:2mm}
.write-row span{flex:1;height:12mm;border:1.2pt solid #000;border-radius:2.5mm}
.bold .write-row span{height:13mm}
.pics{line-height:0;display:flex;gap:4mm}
.pics img{width:26mm;height:26mm;border:1.2pt solid #000;border-radius:4mm;padding:2mm;background:#fff}
.bold .pics img{width:28mm;height:28mm}
.objs{line-height:0;display:flex;flex-wrap:wrap;gap:2mm;align-content:center}
.objs img{width:12mm;height:12mm}
.objs.many img{width:10mm;height:10mm}
.drawbox{border:1.4pt solid #000;border-radius:4mm;position:absolute;left:0;right:0;bottom:0}
.lines div{height:10mm;border-bottom:1pt solid #000}
.wordbank{line-height:2;margin-bottom:1mm}
.wordbank span{display:inline-block;border:1pt solid #000;border-radius:8pt;padding:0 2.5mm;margin:0 0 0 2mm;line-height:1.5}
table.sort{width:100%;border-collapse:collapse}
table.sort th,table.sort td{border:1.2pt solid #000;padding:1mm 2mm;text-align:center}
table.sort td{height:26mm}
.work{border:1pt dashed #999;border-radius:2mm;font-size:8.5pt;color:#777;padding:.5mm 2mm}
.code{font-family:Vazirmatn,sans-serif;font-weight:800;font-size:14pt;direction:ltr;display:flex;align-items:center;white-space:nowrap}
[dir=rtl] .code{justify-content:flex-end}
@media screen{body{background:#fff}}
"""

FLOW_CSS = """
@page{size:A4;margin:12mm 13mm 16mm}
body{font-size:12.5pt;line-height:1.55}
.page{max-width:184mm;margin:0 auto}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:6mm;border-bottom:1.6pt solid #000;padding-bottom:3mm;margin-bottom:4mm}
h1{font-weight:800;font-size:21pt;line-height:1.25;margin:0}
.tag{display:inline-block;border:1.2pt solid #000;border-radius:9pt;padding:0 3mm;font-size:10.5pt;font-weight:800;margin-top:1mm}
.intro{font-size:12pt;margin:0 0 3mm}
.sum{font-size:15pt;white-space:nowrap}
.pics{line-height:1}
.pics img{width:16mm;height:16mm;margin:0 0 0 2mm}
.key li{margin-bottom:2mm}
[dir=rtl] .key{list-style-type:persian}
"""


# the corner squares as SVG, which every browser prints (a CSS background is left out unless the printer is told)
SQUARE = '<svg viewBox="0 0 12 12"><rect width="12" height="12" fill="#000"/></svg>'
RING = '<svg viewBox="0 0 12 12"><path d="M0 0h12v12H0zM3 3v6h6V3z" fill="#000" fill-rule="evenodd"/></svg>'


def _box(b) -> str:
    x, y, w, h = b
    return f"left:{x:.2f}mm;top:{y:.2f}mm;width:{w:.2f}mm;height:{h:.2f}mm"


def _cell_html(c: dict, bold: bool) -> str:
    style = _box((c["x"], c["y"], c["w"], c["h"]))
    if c["kind"] == "int":
        return f'<div class="cell int" style="{style}"></div>'
    fw, fh = CELLS["frac"][bold]
    fx = c["w"] - fw                                  # the fraction sits at the cell's right; a mixed number's whole
    parts = [f'<i style="{_box((fx, 0, fw, fh))}"></i>',  # box goes before it, left to right as maths is written
             f'<i class="bar" style="left:{fx + 1:.2f}mm;top:{fh + FRAC_GAP / 2:.2f}mm;width:{fw - 2:.2f}mm"></i>',
             f'<i style="{_box((fx, fh + FRAC_GAP, fw, fh))}"></i>']
    if c["kind"] == "mixed":
        mw, mh = CELLS["mixed"][bold]
        parts.insert(0, f'<i style="{_box((0, (c["h"] - mh) / 2, mw, mh))}"></i>')
    return f'<div class="cell {c["kind"]}" style="{style}">{"".join(parts)}</div>'


def _item_body(it: dict, li: dict, lang: str, pic, bold: bool) -> str:
    k = it["kind"]
    prompt = f'<p class="prompt">{rich(it["prompt"], lang)}</p>' if it.get("prompt") else ""
    if k == "sum":
        return f'{prompt}{stacked(it["q"], lang, eq=True)}'
    if k == "count":
        many = it["how_many"] > 6
        objs = "".join(f'<img src="{esc(pic(it["picture"]))}" alt="">' for _ in range(it["how_many"]))
        width = (3 * 12 + 2 * 2) if not many else (math.ceil(it["how_many"] / 2) * 10 + (math.ceil(it["how_many"] / 2) - 1) * 2)
        return f'<div class="objs{" many" if many else ""}" style="width:{width}mm">{objs}</div>'
    if k == "trace":
        t = str(it["text"])
        word = len(t) > 1
        count = it.get("count", 6 if not word else 3)
        cls = "trace" + (" word" if word else "") + (" latin" if is_latin(t) else " han" if is_han(t) else "")
        body = f'<div class="{cls}">' + "".join(f"<span>{esc(t)}</span>" for _ in range(count)) + "</div>"
        boxes = it.get("boxes", min(count, 6) if not word else 3)
        if boxes:
            body += '<div class="write-row">' + "<span></span>" * boxes + "</div>"
        return body
    if k == "circle":
        figs = "".join(f'<img src="{esc(pic(p))}" alt="">' for p in it.get("pictures", []))
        return f'{prompt}<div class="pics">{figs}</div>'
    if k == "draw":
        top = (PROMPT_ROW[bold] + 1) if prompt else 0
        return f'{prompt}<div class="drawbox" style="top:{top}mm"></div>'
    if k == "write":
        return prompt + '<div class="lines">' + "<div></div>" * it.get("lines", 2) + "</div>"
    if k == "sort":
        words = "".join(f"<span>{rich(w, lang)}</span>" for w in it.get("words", []))
        heads = "".join(f"<th>{rich(g, lang)}</th>" for g in it.get("groups", []))
        cells = "".join("<td></td>" for _ in it.get("groups", []))
        return f'{prompt}<div class="wordbank">{words}</div><table class="sort"><tr>{heads}</tr><tr>{cells}</tr></table>'
    return prompt


def _item_html(li: dict, lang: str, pic, bold: bool) -> str:
    it = li["src"]
    style = _box((li["x"], li["y"], li["w"], li["h"]))
    inner = _item_body(it, li, lang, pic, bold)
    # the body runs from beside the number to the cell, keeping CELL_CLEAR from it
    end = (li["cell"]["w"] + CELL_CLEAR) if li["cell"] else 0
    side = "left" if lang != "en" else "right"
    mid = " mid" if it["kind"] in ("sum", "count") else ""
    return (f'<section class="item k-{it["kind"]}{mid}" style="{style}">'
            f'<div class="num">{esc(digits(it["n"], lang))}</div>'
            f'<div class="body" style="{side}:{end:.2f}mm">{inner}</div></section>')


def sheet_section(lesson: dict, *, lang: str, seed: int, picture_url=lambda name_: name_) -> str:
    """One sheet as a `<section class="sheet">`, 210 by 297 mm, everything placed absolutely (see `layout`)."""
    lang = lang if lang in ("prs", "ps", "en") else "prs"
    lay = layout(lesson, seed, lang)
    bold = lay["bold"]
    pic = picture_url
    sheet = lesson["sheet"]
    parts = []
    for key, b in lay["marks"].items():
        parts.append(f'<div class="mk{" ring" if key == "tr" else ""}" style="{_box(b)}">{RING if key == "tr" else SQUARE}</div>')
    title = rich(sheet.get("title") or lesson["title"], lang)
    year = (pick_text(WORDS["year"], lang) + " " + digits(lesson["year"], lang)) if lesson["year"] else pick_text(WORDS["starting"], lang)
    tag = f'{esc(pick_text(SUBJECT_NAMES[lesson["subject"]], lang))} · {esc(year)}'
    parts.append(f'<div class="title" style="{_box(lay["title"])}"><h1>{title}</h1><span class="tag">{tag}</span></div>')
    for which in ("name", "date"):
        parts.append(f'<div class="lbl" style="{_box(lay[which + "_label"])}">{esc(pick_text(WORDS[which], lang))}</div>')
        parts.append(f'<div class="wbox {which}" style="{_box(lay[which])}"></div>')
    if lay["intro"]:
        parts.append(f'<p class="intro" style="{_box(lay["intro"])}">{rich(sheet["intro"], lang)}</p>')
    if lay["example"]:
        ex = sheet["example"]
        exm = stacked(ex["math"], lang) if ex.get("math") else ""
        parts.append(f'<div class="example" style="{_box(lay["example"])}"><span>{rich(ex.get("text", ""), lang)}</span>{exm}</div>')
    for p in lay["prompts"]:
        parts.append(f'<p class="gprompt" style="{_box(p["box"])}">{rich(p["text"], lang)}</p>')
    for li in lay["items"]:
        parts.append(_item_html(li, lang, pic, bold))
        if li["cell"]:
            parts.append(_cell_html(li["cell"], bold).replace('class="cell', f'data-n="{li["n"]}" class="cell', 1))
    if lay["work"]:
        parts.append(f'<div class="work" style="{_box(lay["work"])}">{esc(pick_text(WORDS["working"], lang))}</div>')
    code = sheet_code(lesson, seed)
    qx, qy, qw, qh = lay["qr"]
    parts.append(f'<div class="qrbox" style="{_box(lay["qr"])}">{qr.svg(qr_text(code, lang), QR_MM)}</div>')
    parts.append(f'<div class="code" style="{_box(lay["code"])}">{esc(code)}</div>')
    return f'<section class="sheet {"bold" if bold else "clean"}">{"".join(parts)}</section>'


AUTO_PRINT = "<script>addEventListener('load',function(){setTimeout(function(){print()},300)})</script>"


def document(sections: list[str], *, lang: str, title: str, fonts: str = "/fonts", print_on_load: bool = False) -> str:
    """Sheets as one HTML document: one A4 page each. The document's title is the code alone, so a PDF saved from a
    browser is named after it (C2.1); print_on_load opens the browser's print dialog ("Print or save as PDF")."""
    lang = lang if lang in ("prs", "ps", "en") else "prs"
    d = "ltr" if lang == "en" else "rtl"
    htmllang = {"prs": "fa-AF", "ps": "ps-AF", "en": "en"}[lang]
    css = CSS.replace("FONTS", fonts.rstrip("/")) + SHEET_CSS
    return (f'<!doctype html><html lang="{htmllang}" dir="{d}"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(title)}</title>'
            f'<style>{css}</style>{AUTO_PRINT if print_on_load else ""}</head><body>{"".join(sections)}</body></html>')


def answers_page(lesson: dict, *, lang: str, seed: int, fonts: str = "/fonts", picture_url=lambda name_: name_) -> str:
    """The answer page, for the teacher or a parent (behind the teacher's PIN on the hub; never on a learner route)."""
    lang = lang if lang in ("prs", "ps", "en") else "prs"
    key = answer_key(lesson, seed, lang, picture_url)
    lis = []
    for r in key["items"]:
        if r["check"] == "value":
            lis.append(f"<li>{stacked(r['q'] + ' = ' + r['a'] if r.get('q') else r['a'], lang)}</li>")
        elif r["kind"] == "circle":
            lis.append('<li><div class="pics">' + "".join(f'<img src="{esc(u)}" alt="">' for u in r["a"]) + "</div></li>")
        elif r["kind"] == "sort":
            lis.append("<li>" + "، ".join(f"{esc(w)}: {esc(g)}" for w, g in r["a"]) + "</li>")
        elif r["check"] == "self" and r.get("a"):
            lis.append(f"<li>{rich(r['a'], lang)}</li>")
        else:
            lis.append(f"<li>{esc(pick_text(WORDS['self'], lang))}</li>")
    title = rich(lesson["sheet"].get("title") or lesson["title"], lang)
    d = "ltr" if lang == "en" else "rtl"
    htmllang = {"prs": "fa-AF", "ps": "ps-AF", "en": "en"}[lang]
    css = CSS.replace("FONTS", fonts.rstrip("/")) + FLOW_CSS
    return (f'<!doctype html><html lang="{htmllang}" dir="{d}"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(key["code"])}</title>'
            f'<style>{css}</style></head><body><div class="page">'
            f'<header><div><h1>{esc(pick_text(WORDS["answers"], lang))} · {title}</h1>'
            f'<span class="tag" dir="ltr">{esc(key["code"])}</span></div></header>'
            f'<p class="intro">{esc(pick_text(WORDS["for_teacher"], lang))}</p>'
            f'<ol class="key">{"".join(lis)}</ol></div></body></html>')


def page(lesson: dict, *, lang: str, seed: int, kind: str = "worksheet", fonts: str = "/fonts",
         picture_url=lambda name_: name_, print_on_load: bool = False) -> str:
    """The sheet (or, kind="answers", its answer page) as one HTML page.

    fonts is a URL or file:// folder; picture_url(name) gives each picture's URL (web) or file:// path (PDF)."""
    if kind == "answers":
        return answers_page(lesson, lang=lang, seed=seed, fonts=fonts, picture_url=picture_url)
    section = sheet_section(lesson, lang=lang, seed=seed, picture_url=picture_url)
    return document([section], lang=lang, title=sheet_code(lesson, seed), fonts=fonts, print_on_load=print_on_load)


def render_pdf(html_text: str, base_url: str):
    """(PDF bytes, number of pages). Needs WeasyPrint; raises RuntimeError with a plain message without it."""
    try:
        from weasyprint import HTML
    except Exception as e:   # ImportError, or OSError when the Pango library is missing
        raise RuntimeError("the PDF maker (WeasyPrint) is not installed on this hub: see docs/HUB-SETUP.md") from e
    doc = HTML(string=html_text, base_url=base_url).render()
    return doc.write_pdf(), len(doc.pages)


def hub_card(*, name: str, url: str, ssid: str | None, password: str | None, fonts: str = "/fonts") -> str:
    """A card to pin up at the hub: scan one code to join the Wi-Fi, another to open the app."""
    def qr(data):
        try:
            import segno
        except ImportError:
            return ""
        return segno.make_qr(data, error="m").svg_inline(scale=7, dark="#000", light="#fff")

    def wifi_escape(s):
        return re.sub(r'([\\;,:"])', r"\\\1", s)

    blocks = []
    if ssid:
        wifi = f"WIFI:T:{'WPA' if password else 'nopass'};S:{wifi_escape(ssid)};" + (f"P:{wifi_escape(password)};" if password else "") + ";"
        blocks.append(f'<section class="card"><h2><span class="m">1</span> وای‌فای · وای فای · Wi-Fi</h2>{qr(wifi)}'
                      f'<p class="m big">{esc(ssid)}</p>' + (f'<p class="m">{esc(password)}</p>' if password else "") + "</section>")
    blocks.append(f'<section class="card"><h2><span class="m">2</span> برنامه · پروګرام · App</h2>{qr(url)}'
                  f'<p class="m big">{esc(url)}</p></section>')
    css = CSS.replace("FONTS", fonts.rstrip("/")) + FLOW_CSS + """
.cards{display:flex;gap:10mm;justify-content:center;margin-top:8mm}
.card{border:1.6pt solid #000;border-radius:5mm;padding:6mm;text-align:center;width:80mm}
.card h2{font-size:15pt;margin:0 0 3mm}.card svg{width:56mm;height:56mm}.big{font-size:16pt;font-weight:800}
"""
    return (f'<!doctype html><html lang="fa-AF" dir="rtl"><head><meta charset="utf-8"><title>{esc(name)}</title>'
            f'<style>{css}</style></head><body><div class="page"><header><div><h1>{esc(name)}</h1>'
            f'<span class="tag">مرکز درسی · د زده کړې مرکز · Learning hub</span></div></header>'
            f'<p class="intro">با کمره‌ی تلفن کد را اسکن کن. · د ټیلیفون په کمره کوډ سکن کړه. · Scan with the phone camera.</p>'
            f'<div class="cards">{"".join(blocks)}</div></div></body></html>')


__all__ = ["page", "document", "sheet_section", "answer_key", "layout", "sheet_code", "parse_code", "damm", "render_pdf",
           "hub_card", "needs_seed", "expand", "picture_file"]

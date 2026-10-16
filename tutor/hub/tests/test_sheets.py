"""Sheets (C2.1, DESIGN-C2C3-SPECS.md item 1): generators, the code and its check digit, the QR code, the slot grid's
layout, the key's cells, and the same cell positions from WeasyPrint as from the key."""
import copy
import random
import re
from fractions import Fraction

import pytest

from tutor_hub import mathcheck, qr, sheets

LANGS = ("prs", "ps", "en")


def test_generators_repeat_for_the_same_seed():
    a = sheets.gen_fraction_add(random.Random("x:42"), 6)
    b = sheets.gen_fraction_add(random.Random("x:42"), 6)
    c = sheets.gen_fraction_add(random.Random("x:43"), 6)
    assert a == b and a != c and len(a) == 6


@pytest.mark.parametrize("gen", ["fraction_add", "add_sub", "times"])
def test_every_generated_answer_is_right(gen):
    for seed in range(50):
        for s in sheets.GENERATORS[gen](random.Random(seed), 8):
            assert mathcheck.evaluate(s["q"]) == mathcheck.evaluate(s["a"]), s


def test_fraction_sums_stay_child_sized():
    for seed in range(50):
        for s in sheets.gen_fraction_add(random.Random(seed), 6, max_den=12):
            assert 0 < mathcheck.evaluate(s["q"]) <= 1


# the code and its Damm check digit

def test_the_code_carries_a_damm_check_digit(library):
    l = library.lessons["maths-7-fractions-add"]
    assert sheets.sheet_code(l, 4821) == "M7-03-48217"             # the spec's own example
    assert sheets.sheet_code(l, 7) == "M7-03-0007" + str(sheets.damm("0007"))
    assert sheets.sheet_code(library.lessons["dari-1-sheen"], 0) == "DR1-01"     # no seed, no check digit
    assert sheets.sheet_code(l, 0) == "M7-03"                       # seed 0 is the bare code, as on the phone
    assert sheets.parse_code("M7-03") == ("M7-03", 0)


def test_the_check_digit_refuses_one_wrong_digit_and_two_swapped():
    for seed in range(0, 10000, 7):
        s = f"{seed:04d}"
        good = s + str(sheets.damm(s))
        assert sheets.damm(good) == 0
        for i in range(5):
            for d in "0123456789":
                if d != good[i]:
                    assert sheets.damm(good[:i] + d + good[i + 1:]) != 0
        for i in range(4):
            if good[i] != good[i + 1]:
                assert sheets.damm(good[:i] + good[i + 1] + good[i] + good[i + 2:]) != 0


def test_a_typed_code_is_read_any_way_and_a_wrong_one_refused():
    assert sheets.parse_code("M7-03-48217") == ("M7-03", 4821)
    assert sheets.parse_code("m7 03 ۴۸۲۱۷") == ("M7-03", 4821)
    assert sheets.parse_code("M7·03·48217") == ("M7-03", 4821)
    assert sheets.parse_code("M7-03-48271") is None                  # two digits swapped
    assert sheets.parse_code("M7-03-48218") is None                  # one digit wrong
    assert sheets.parse_code("dr1-01") == ("DR1-01", 0)


# the QR code: text, never a URL, from a maker the Worker can run

def test_the_qr_maker_matches_segno_mask_by_mask():
    segno = pytest.importorskip("segno")
    for text in ("Q1 M7-03-48217 PRS", "Q1 DR1-01 PS", "Q1 ABCDEFGHIJKL-12345 EN", "Q1 M1-01 EN"):
        for k in range(8):
            ref = segno.make_qr(text, error="m", mask=k, mode="alphanumeric", boost_error=False)
            assert [list(r) for r in ref.matrix] == qr.matrix(text, mask=k), (text, k)


def test_the_qr_maker_picks_the_mask_with_the_lowest_penalty():
    text = "Q1 M7-03-48217 PRS"
    best = qr.matrix(text)
    assert best in [qr.matrix(text, mask=k) for k in range(8)] and len(best) == 21     # version 1
    assert len(qr.matrix("Q1 ABCDEFGHIJKL-12345 PRS")) == 25                         # a long code: version 2
    with pytest.raises(ValueError):
        qr.matrix("https://example.org")                                               # lower case: never a URL


def test_the_qr_holds_the_code_and_language_only(library):
    l = library.lessons["maths-7-fractions-add"]
    assert sheets.qr_text(sheets.sheet_code(l, 4821), "prs") == "Q1 M7-03-48217 PRS"
    for lid, lesson in library.lessons.items():
        if lesson.get("sheet"):
            t = sheets.qr_text(sheets.sheet_code(lesson, 9999), "prs")
            assert qr.fits(t) and "/" not in t.split(" ", 1)[1] and "HTTP" not in t


def _largest_dark_square(m) -> int:
    n, best = len(m), 0
    run = [[0] * (n + 1) for _ in range(n + 1)]
    for y in range(n):
        for x in range(n):
            if m[y][x]:
                run[y + 1][x + 1] = 1 + min(run[y][x], run[y][x + 1], run[y + 1][x])
                best = max(best, run[y + 1][x + 1])
    return best


def test_nothing_on_a_sheet_but_the_corner_squares_is_solid_black_wider_than_6_mm(library):
    # the QR's darkest square must stay under 6 mm, so the phone never takes it for a corner square
    for lid, lesson in library.lessons.items():
        if not lesson.get("sheet"):
            continue
        for lang in LANGS:
            for seed in (0, 1234, 9999):
                m = qr.matrix(sheets.qr_text(sheets.sheet_code(lesson, seed), lang))
                assert _largest_dark_square(m) * sheets.QR_MM / len(m) < 6
        html = sheets.page(lesson, lang="prs", seed=1234)
        # black fills: the corner squares' SVG and the QR's path only; CSS draws lines, never areas
        assert len(re.findall(r'fill="#000"', html)) == 5
        assert "background:#000" not in html and "background-color" not in html


# the layout (C2.1): markers, the header, the slot grid, cells and their clearances

def _sheet_lessons(library):
    return [l for l in library.lessons.values() if l.get("sheet")]


def _grow(box, by):
    x, y, w, h = box
    return (x - by, y - by, w + 2 * by, h + 2 * by)


def _overlap(a, b) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah


def _gap(a, b) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    dx = max(bx - (ax + aw), ax - (bx + bw), 0)
    dy = max(by - (ay + ah), ay - (by + bh), 0)
    return (dx * dx + dy * dy) ** 0.5


def _cell_box(c):
    return (c["x"], c["y"], c["w"], c["h"])


def test_the_corner_squares_sit_where_the_spec_says(library):
    lay = sheets.layout(library.lessons["maths-7-fractions-add"], 4821, "prs")
    centres = {k: (x + w / 2, y + h / 2) for k, (x, y, w, h) in lay["marks"].items()}
    assert centres == {"tl": (16, 16), "tr": (194, 16), "bl": (16, 281), "br": (194, 281)}
    assert all(w == h == 12 for (_, _, w, h) in lay["marks"].values())
    html = sheets.page(library.lessons["maths-7-fractions-add"], lang="prs", seed=4821)
    rings = re.findall(r'<div class="mk( ring)?" style="left:([\d.]+)mm;top:([\d.]+)mm', html)
    assert [(r, float(x), float(y)) for r, x, y in rings] == [("", 10, 10), (" ring", 188, 10), ("", 10, 275),
                                                              ("", 188, 275)]
    assert "@page{size:A4;margin:0}" in html


@pytest.mark.parametrize("lang", LANGS)
def test_every_cell_keeps_clear_of_names_codes_text_and_edges(library, lang):
    for lesson in _sheet_lessons(library):
        for seed in (0, 1234, 4821, 9999):
            lay = sheets.layout(lesson, seed, lang)
            assert lay["fits"], (lesson["id"], lay["height"])
            keep_off = [lay["name"], lay["date"], lay["name_label"], lay["date_label"], lay["title"], lay["qr"],
                        lay["code"], *lay["marks"].values()]
            if lay["intro"]:
                keep_off.append(lay["intro"])
            if lay["example"]:
                keep_off.append(lay["example"])
            if lay["work"]:
                keep_off.append(lay["work"])
            keep_off += [p["box"] for p in lay["prompts"]]
            for it in lay["items"]:
                c = it["cell"]
                if not c:
                    continue
                crop = _grow(_cell_box(c), sheets.CROP)
                where = (lesson["id"], lang, seed, it["n"])
                # the page edge, and every other box on the sheet
                assert crop[0] >= 0 and crop[1] >= 0 and crop[0] + crop[2] <= 210 and crop[1] + crop[3] <= 297, where
                for b in keep_off:
                    assert not _overlap(crop, b), (where, b)
                for other in lay["items"]:
                    if other is not it:
                        assert not _overlap(crop, (other["x"], other["y"], other["w"], other["h"])), (where, other["n"])
                # the name box is at least 15 mm from any cell
                assert _gap(_cell_box(c), lay["name"]) >= 15, where
                # inside its own item, at the end side, clear of the item's number and words
                assert it["x"] <= c["x"] and c["x"] + c["w"] <= it["x"] + it["w"] + 1e-9, where
                assert it["y"] <= c["y"] and c["y"] + c["h"] <= it["y"] + it["h"] + 1e-9, where
                end_side = c["x"] == it["x"] if lang != "en" else abs(c["x"] + c["w"] - it["x"] - it["w"]) < 1e-9
                assert end_side, where
                words_end = it["w"] - c["w"] - sheets.CELL_CLEAR       # the item's body stops 4 mm before the cell
                assert words_end >= sheets.NUM[lay["bold"]] + 10, where


@pytest.mark.parametrize("lang", ["prs", "en"])
def test_item_one_sits_at_the_reading_start(library, lang):
    lay = sheets.layout(library.lessons["maths-7-fractions-add"], 4821, lang)
    one, two = lay["items"][0], lay["items"][1]
    assert one["y"] == two["y"] and one["w"] == two["w"] == sheets.COL
    assert (one["x"] > two["x"]) == (lang != "en")                  # right to left: item 1 at the top right
    assert all(sheets.BODY[0] <= i["x"] and i["x"] + i["w"] <= sheets.BODY[2] for i in lay["items"])


def test_cells_are_one_box_per_answer_and_their_shape_says_nothing(library):
    l = library.lessons["maths-7-fractions-add"]
    for seed in range(1000, 1100):
        cells = [i["cell"]["kind"] for i in sheets.layout(l, seed, "prs")["items"] if i["cell"]]
        assert cells == ["frac"] * 7                                   # by generator, never by one answer
    m1 = sheets.layout(library.lessons["maths-1-count-5"], 0, "prs")
    assert [i["cell"]["kind"] for i in m1["items"] if i["cell"]] == ["int"] * 4 and m1["bold"]
    assert sheets.cell_size("int", False) == (30, 22)
    assert sheets.cell_size("frac", False) == (24, 30) and sheets.cell_size("frac", True) == (26, 32)
    assert sheets.cell_size("mixed", False) == (41, 30)


def test_a_sheet_too_tall_for_one_page_fails_the_validator(library, tmp_path):
    from tutor_hub.packs import validate_lesson
    l = copy.deepcopy(library.lessons["maths-7-fractions-add"])
    pdir = library.pack_dir(l["id"])
    assert validate_lesson(l, pdir) == []
    l["sheet"]["items"].append({"kind": "draw", "prompt": {"prs": "بکش"}})
    problems = validate_lesson(l, pdir)
    assert any("more than the 230 mm" in p for p in problems), problems
    l = copy.deepcopy(library.lessons["maths-7-fractions-add"])
    l["sheet"]["items"][0]["step"] = 99
    assert any("step must be" in p for p in validate_lesson(l, pdir))


# the key (C2.1): cells in mm from the top-left square's centre, the code, language and frame

def test_answer_key_matches_the_printed_sheet(library):
    l = library.lessons["maths-7-fractions-add"]
    key = sheets.answer_key(l, 4821, "prs", lambda p: p)
    sums = [r for r in key["items"] if r["kind"] == "sum"]
    assert [r["n"] for r in key["items"]] == list(range(1, len(key["items"]) + 1))
    assert len(sums) == 7 and sums[-1]["a"] == "13/20"
    assert key["code"] == "M7-03-48217" and key["lang"] == "prs" and key["frame"] == {"w": 178, "h": 265}
    assert key["intro"] and key["example"]["math"].startswith("1/2 + 1/4")
    lay = sheets.layout(l, 4821, "prs")
    for r, it in zip(key["items"], lay["items"]):
        if r["check"] == "value":
            c = it["cell"]
            assert r["cell"] == {"kind": c["kind"], "x": round(c["x"] - 16, 2), "y": round(c["y"] - 16, 2),
                                 "w": c["w"], "h": c["h"]}
        else:
            assert "cell" not in r
    html = sheets.page(l, lang="prs", seed=4821, fonts="/fonts", picture_url=lambda p: p)
    first = sums[0]["q"].split(" + ")[0].split("/")[0]
    assert "M7-03-48217" in html and mathcheck.fmt(Fraction(int(first)), fa=True) in html
    assert html.count('class="cell') == 7


def test_a_learner_sheet_has_no_app_name_url_or_answers(library):
    for lesson in _sheet_lessons(library):
        for lang in LANGS:
            html = sheets.page(lesson, lang=lang, seed=1234, fonts="/fonts", picture_url=lambda p: "/p/" + p)
            assert "Qalam" not in html and "قلم" not in html and "http" not in html, lesson["id"]
            assert f"<title>{sheets.sheet_code(lesson, 1234)}</title>" in html
    l = library.lessons["maths-7-fractions-add"]
    html = sheets.page(l, lang="en", seed=4821)
    assert ">13<" not in html.replace(" ", "")                         # the challenge's answer, 13/20


def test_answers_page_shows_answers(library):
    l = library.lessons["maths-1-count-5"]
    html = sheets.page(l, lang="ps", seed=0, kind="answers", fonts="/fonts", picture_url=lambda p: p)
    assert "۳" in html and "M1-01" in html


def test_work_false_is_still_accepted(library):
    l = copy.deepcopy(library.lessons["maths-7-fractions-add"])
    l["sheet"]["items"][0]["work"] = False
    sums = sheets.expand(l, 1234)[0]
    assert sums["kind"] == "sums" and sums["work"] is False and len(sums["items"]) == 6


# WeasyPrint (the hub's PDF) places every cell where the key says

def _weasy_boxes(html_text, base_url):
    weasyprint = pytest.importorskip("weasyprint")
    doc = weasyprint.HTML(string=html_text, base_url=base_url).render()
    found = {}

    def walk(box):
        el = getattr(box, "element", None)
        if el is not None and getattr(box, "element_tag", None) == "div":
            cls = el.get("class") or ""
            if cls.startswith("cell ") and el.get("data-n") and el.get("data-n") not in found:
                px = 25.4 / 96
                found[int(el.get("data-n"))] = (box.position_x * px, box.position_y * px,
                                                box.border_width() * px, box.border_height() * px)
        for child in getattr(box, "children", []) or []:
            walk(child)
    walk(doc.pages[0]._page_box)
    return found, len(doc.pages)


@pytest.mark.parametrize("lid,lang", [("maths-7-fractions-add", "prs"), ("maths-7-fractions-add", "en"),
                                      ("maths-1-count-5", "ps")])
def test_weasyprint_places_every_cell_within_half_a_millimetre_of_the_key(library, lid, lang):
    l = library.lessons[lid]
    app = library.dir.parent.parent / "app"
    pdir = library.pack_dir(lid)
    pic = lambda name: (pdir / "pictures" / f"{name}.svg").resolve().as_uri()   # noqa: E731
    html = sheets.page(l, lang=lang, seed=4821, fonts=(app / "fonts").resolve().as_uri(), picture_url=pic)
    boxes, pages = _weasy_boxes(html, str(app))
    key = sheets.answer_key(l, 4821, lang, pic)
    cells = {r["n"]: r["cell"] for r in key["items"] if "cell" in r}
    assert pages == 1 and set(boxes) == set(cells)
    for n, c in cells.items():
        x, y, w, h = boxes[n]
        assert abs(x - 16 - c["x"]) < 0.5 and abs(y - 16 - c["y"]) < 0.5, (n, boxes[n], c)
        assert abs(w - c["w"]) < 0.5 and abs(h - c["h"]) < 0.5, (n, boxes[n], c)


@pytest.mark.parametrize("lang", ["prs", "ps"])
def test_every_starter_sheet_prints_on_one_a4_page(library, lang):
    app = library.dir.parent.parent / "app"
    for lid, l in library.lessons.items():
        pdir = library.pack_dir(lid)
        pic = lambda name: (pdir / "pictures" / f"{name}.svg").resolve().as_uri()   # noqa: E731
        for kind in ("worksheet", "answers"):
            html = sheets.page(l, lang=lang, seed=1234, kind=kind, fonts=(app / "fonts").resolve().as_uri(),
                               picture_url=pic)
            pdf, pages = sheets.render_pdf(html, base_url=str(app))
            assert pdf.startswith(b"%PDF") and pages == 1, (lid, lang, kind, pages)


def test_a_batch_is_one_document_with_a_page_per_sheet(library):
    l = library.lessons["maths-7-fractions-add"]
    app = library.dir.parent.parent / "app"
    sections = [sheets.sheet_section(l, lang="prs", seed=s) for s in (1111, 2222, 3333)]
    html = sheets.document(sections, lang="prs", title="M7-03", fonts=(app / "fonts").resolve().as_uri())
    _, pages = sheets.render_pdf(html, base_url=str(app))
    assert pages == 3

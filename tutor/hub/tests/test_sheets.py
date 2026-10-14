import random
from fractions import Fraction

import pytest

from tutor_hub import mathcheck, sheets


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


def test_answer_key_matches_the_printed_sheet(library):
    l = library.lessons["maths-7-fractions-add"]
    key = sheets.answer_key(l, 4821, "prs", lambda p: p)
    sums = [r for r in key["items"] if r["kind"] == "sum"]
    assert [r["n"] for r in key["items"]] == list(range(1, len(key["items"]) + 1))
    assert len(sums) == 7 and sums[-1]["a"] == "13/20"
    html = sheets.page(l, lang="prs", seed=4821, fonts="/fonts", picture_url=lambda p: p, hub_name="Qalam")
    first = sums[0]["q"].split(" + ")[0].split("/")[0]
    assert "M7-03-4821" in html and mathcheck.fmt(Fraction(int(first)), fa=True) in html


def test_answers_page_shows_answers(library):
    l = library.lessons["maths-1-count-5"]
    html = sheets.page(l, lang="ps", seed=0, kind="answers", fonts="/fonts", picture_url=lambda p: p, hub_name="Qalam")
    assert "۳" in html and "M1-01" in html


@pytest.mark.parametrize("lang", ["prs", "ps"])
def test_every_starter_sheet_prints_on_one_a4_page(library, lang):
    app = library.dir.parent.parent / "app"
    for lid, l in library.lessons.items():
        pdir = library.pack_dir(lid)
        pic = lambda name: (pdir / "pictures" / f"{name}.svg").resolve().as_uri()   # noqa: E731
        for kind in ("worksheet", "answers"):
            html = sheets.page(l, lang=lang, seed=1234, kind=kind, name="Maryam" if kind == "worksheet" else None,
                               fonts=(app / "fonts").resolve().as_uri(), picture_url=pic, hub_name="Qalam")
            pdf, pages = sheets.render_pdf(html, base_url=str(app))
            assert pdf.startswith(b"%PDF") and pages == 1, (lid, lang, kind, pages)

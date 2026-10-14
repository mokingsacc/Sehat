import copy
import json

from tutor_hub.packs import validate_lesson

from conftest import PACKS


def lesson(name):
    return json.loads((PACKS / "starter" / "lessons" / f"{name}.json").read_text(encoding="utf-8"))


def test_starter_pack_loads_clean(library):
    assert len(library.lessons) == 6
    assert set(library.packs) == {"starter"}


def test_summary_has_what_the_app_lists(library):
    rows = {l["id"]: l for p in library.summary() for l in p["lessons"]}
    assert rows["dari-1-sheen"]["glyph"] == "ش"
    assert rows["maths-7-fractions-add"]["code"] == "M7-03"
    assert rows["maths-7-fractions-add"]["seeded"] is True
    assert rows["maths-1-count-5"]["seeded"] is False
    assert all("steps" not in p or isinstance(p["steps"], int) for p in rows.values())


def test_app_lesson_has_picture_urls_and_no_sheet(library):
    l = library.lesson_for_app("dari-1-sheen")
    assert "sheet" not in l
    assert l["steps"][0]["picture"] == "/packs/starter/pictures/milk.svg"
    assert l["steps"][2]["options"][1]["picture"] == "/packs/starter/pictures/comb.svg"
    assert library.lessons["dari-1-sheen"]["steps"][0]["picture"] == "milk"   # the pack itself is untouched


def test_validation_catches_mistakes():
    pdir = PACKS / "starter"
    bad = copy.deepcopy(lesson("maths-7-fractions-add"))
    bad["steps"][2]["answer"] = 5
    bad["steps"][1]["text"]["prs"] = "$1/5 + 2/5 = 4/5$"
    bad["sheet"]["items"][2]["a"] = "3/9"
    bad["steps"][0]["picture"] = "no-such-picture"
    problems = "\n".join(validate_lesson(bad, pdir))
    assert "answer must be the number of the right option" in problems
    assert "sum does not add up" in problems
    assert "the answer 3/9 is wrong" in problems
    assert "picture 'no-such-picture'" in problems


def test_every_starter_lesson_is_still_a_draft():
    # drafts until a Dari reader, a Pashto reader and a subject teacher have checked them (docs/CONTENT.md)
    for f in (PACKS / "starter" / "lessons").glob("*.json"):
        assert json.loads(f.read_text(encoding="utf-8"))["review"]["status"] == "draft"

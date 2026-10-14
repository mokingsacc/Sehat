import copy
import json
import shutil

from tutor_hub.packs import Library, validate_lesson

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


def test_answers_the_phone_cannot_read_and_unknown_options_are_caught():
    pdir = PACKS / "starter"
    bad = copy.deepcopy(lesson("maths-7-fractions-add"))
    bad["steps"][4]["answer"] = "1/4 + 1/4"         # the phone reads one number or fraction, never a sum
    bad["sheet"]["items"][0]["max_denom"] = 10       # a typo
    bad["sheet"]["items"][0]["work"] = "no"
    problems = "\n".join(validate_lesson(bad, pdir))
    assert "not a sum" in problems
    assert "no option 'max_denom'" in problems
    assert "work must be true or false" in problems
    good = copy.deepcopy(lesson("maths-7-fractions-add"))
    good["steps"][4]["answer"] = "۰٫۵"
    good["sheet"]["items"][0].update(work=False, max_den=8)
    assert validate_lesson(good, pdir) == []


def test_a_broken_lesson_is_left_out_and_the_rest_still_load(tmp_path):
    shutil.copytree(PACKS / "starter", tmp_path / "starter")
    f = tmp_path / "starter" / "lessons" / "dari-1-sheen.json"
    broken = json.loads(f.read_text(encoding="utf-8"))
    broken["steps"] = [None]
    f.write_text(json.dumps(broken), encoding="utf-8")
    lib = Library(tmp_path)
    assert "dari-1-sheen" not in lib.lessons and len(lib.lessons) == 5
    assert any("dari-1-sheen" in p and "could not be checked" in p for p in lib.problems)


def test_every_starter_lesson_is_still_a_draft():
    # drafts until a Dari reader, a Pashto reader and a subject teacher have checked them (docs/CONTENT.md)
    for f in (PACKS / "starter" / "lessons").glob("*.json"):
        assert json.loads(f.read_text(encoding="utf-8"))["review"]["status"] == "draft"

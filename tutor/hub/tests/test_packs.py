import copy
import json
import shutil

from tutor_hub.packs import Library, validate_lesson

from conftest import PACKS


def lesson(name):
    return json.loads((PACKS / "starter" / "lessons" / f"{name}.json").read_text(encoding="utf-8"))


def test_starter_pack_loads_clean(library):
    assert len(library.lessons) == 12
    assert set(library.packs) == {"starter", "adult-literacy-1", "adult-maths-1"}         # the adult packs since P26


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


# P26 (C4.3): adult packs say which tracks see them; the literacy track's packs print bold and need every clip

def test_adult_packs_carry_their_tracks_and_the_literacy_ones_print_bold(library):
    packs = {p["id"]: p for p in library.summary()}
    assert packs["adult-literacy-1"]["tracks"] == ["literacy", "reader"] and "tracks" not in packs["starter"]
    from tutor_hub import sheets
    assert sheets.layout(library.lessons["adult-maths-2-change"], 1, "prs")["bold"] is True
    assert sheets.layout(library.lessons["maths-7-fractions-add"], 1, "prs")["bold"] is False
    assert "_bold" not in library.lesson_for_app("adult-maths-2-change")


def test_tracks_are_checked_and_a_literacy_pack_needs_a_clip_for_every_step(tmp_path):
    from tutor_hub.packs import release_problems, tracks_of
    shutil.copytree(PACKS, tmp_path / "packs")
    shutil.copy(PACKS.parent / "sources.json", tmp_path / "sources.json")
    f = tmp_path / "packs" / "adult-maths-1" / "pack.json"
    pack = json.loads(f.read_text(encoding="utf-8"))
    for bad in (["writer"], [], "reader"):
        f.write_text(json.dumps(dict(pack, tracks=bad)), encoding="utf-8")
        assert any("tracks must list" in p for p in Library(tmp_path / "packs").problems), bad
    s = tmp_path / "packs" / "starter" / "pack.json"
    s.write_text(json.dumps(dict(json.loads(s.read_text(encoding="utf-8")), tracks=["reader"])), encoding="utf-8")
    assert any("tracks are for adult packs only" in p for p in Library(tmp_path / "packs").problems)
    assert tracks_of({"audience": "adult"}) == ["reader"] and tracks_of({}) == []
    lesson = json.loads((PACKS / "adult-maths-1" / "lessons" / "adult-maths-2-change.json").read_text(encoding="utf-8"))
    lit = release_problems(lesson, "signed", dict(pack), {})
    assert sum("needs a recorded prs clip" in p for p in lit) == len(lesson["steps"])     # every step, not just letters
    reader = release_problems(lesson, "signed", dict(pack, tracks=["reader"]), {})
    assert not any("clip" in p for p in reader)

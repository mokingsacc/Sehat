import copy
import json
import shutil

from tutor_hub.packs import Library, validate_lesson

from conftest import PACKS


def lesson(name):
    return json.loads((PACKS / "starter" / "lessons" / f"{name}.json").read_text(encoding="utf-8"))


def test_starter_pack_loads_clean(library):
    assert len(library.lessons) == 18
    assert set(library.packs) == {"starter", "adult-literacy-1", "adult-maths-1",         # the adult packs since P26
                                  "english-adult-1", "chinese-1",                       # and P27a's
                                  "quran-1", "seerah-1",                                # and P29's, with no lessons yet
                                  "university-1"}                                       # and P28's cards


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
    assert any("tracks are for adult packs" in p for p in Library(tmp_path / "packs").problems)
    assert tracks_of({"audience": "adult"}) == ["reader"] and tracks_of({}) == []
    lesson = json.loads((PACKS / "adult-maths-1" / "lessons" / "adult-maths-2-change.json").read_text(encoding="utf-8"))
    lit = release_problems(lesson, "signed", dict(pack), {})
    assert sum("needs a recorded prs clip" in p for p in lit) == len(lesson["steps"])     # every step, not just letters
    reader = release_problems(lesson, "signed", dict(pack, tracks=["reader"]), {})
    assert not any("clip" in p for p in reader)


# P27a (C4.4): English and Chinese lessons

def _en(name):
    return json.loads((PACKS / "english-adult-1" / "lessons" / f"{name}.json").read_text(encoding="utf-8"))


def test_english_and_chinese_words_are_in_their_own_script_and_say_answers_have_no_slot():
    pdir = PACKS / "english-adult-1"
    bad = copy.deepcopy(_en("english-adult-1-hello"))
    bad["steps"][0]["english"] = "هلو"                              # English spelt in Dari letters
    bad["steps"][1]["hide"] = True                                  # hide is for a choice that plays its word
    bad["steps"][3]["answers"] = ["my name is ..."]                 # a blank she would fill with her name
    bad["steps"][4]["answers"] = ["i am from kabul"]                # a place
    bad["steps"][2]["zh"] = "你好"                                   # zh without pinyin, and beside english
    problems = "\n".join(validate_lesson(bad, pdir))
    assert "written in English letters" in problems
    assert "hide is true, on a choice" in problems
    assert problems.count("personal slot") == 2
    assert "zh and pinyin go together" in problems and "English or Chinese, not both" in problems
    letters = copy.deepcopy(_en("english-adult-2-letters"))
    del letters["steps"][0]["english"]
    letters["steps"][1]["script"] = "cyrl"
    problems = "\n".join(validate_lesson(letters, pdir))
    assert "needs its picture word in english" in problems and 'script is "latn"' in problems
    zh = json.loads((PACKS / "chinese-1" / "lessons" / "chinese-1-hello.json").read_text(encoding="utf-8"))
    zh["steps"][0]["pinyin"] = "ni3 hao3"                           # tone marks, not numbers
    zh["steps"][1]["zh"] = "xiexie"
    problems = "\n".join(validate_lesson(zh, PACKS / "chinese-1"))
    assert "pinyin is Latin letters with tone marks" in problems and "zh must be Chinese characters" in problems
    assert validate_lesson(_en("english-adult-1-hello"), pdir) == []


def test_every_taught_word_needs_a_human_recording_before_release(library):
    from tutor_hub.packs import clips_needed, release_problems, studied_clip_steps
    l = library.lessons["english-adult-1-hello"]
    pack = library.packs["english-adult-1"]
    assert [i for i, _ in studied_clip_steps(l)] == [1, 2, 3, 4, 5]          # every english field and every say step
    why = release_problems(l, "signed", pack, {})
    assert sum("recorded by a human English speaker (en)" in p for p in why) == 5
    clips = {"en": {"hello": {"file": "hello.opus", "speaker": "en-01", "placeholder": True, "sha256": "sha256:" + "0" * 64}}}
    one = copy.deepcopy(l)
    one["steps"][0]["audio"] = {"en": "hello"}
    assert any(p.startswith("english-adult-1-hello step 1: needs its words recorded") for p in release_problems(one, "signed", pack, clips))
    zh = library.lessons["chinese-1-hello"]
    assert sum("native Mandarin speaker (zh)" in p for p in release_problems(zh, "signed", library.packs["chinese-1"], {})) == 5
    jobs = [c for c in clips_needed(library) if c["lesson"] == "chinese-1-hello"]
    assert [c["words"] for c in jobs][:2] == ["你好", "谢谢"] and {c["lang"] for c in jobs} == {"zh"}


def test_a_pack_with_bands_is_for_those_bands_whatever_the_year(library):
    from tutor_hub.mods.plan import lessons_for
    from tutor_hub.packs import lesson_bands, reads_every_step, tracks_of
    pack = library.packs["chinese-1"]
    assert lesson_bands(library.lessons["chinese-1-hello"], pack) == ["s2", "ad"] and tracks_of(pack) == ["reader"]
    assert not reads_every_step(library.lessons["chinese-1-hello"], pack) and pack.get("share_alike") is True
    rows = {p["id"]: p for p in library.summary()}
    assert rows["chinese-1"]["bands"] == ["s2", "ad"] and rows["chinese-1"]["tracks"] == ["reader"]
    assert "chinese-1-hello" in dict(lessons_for(library, "s2")) and "chinese-1-hello" in dict(lessons_for(library, "ad"))
    assert "chinese-1-hello" not in dict(lessons_for(library, "s1"))
    p = []
    for bad in ({"bands": ["s3"]}, {"bands": ["s2", "s2"]}, {"bands": ["s2"], "audience": "adult"}):
        p += [x for x in library._check_pack(dict(pack, **bad), "x") if "tracks" not in x]
    assert len(p) == 3


def test_the_chinese_font_subset_holds_every_character_the_packs_write():
    """app/fonts/noto-sc.woff2 (tools/make_fonts.py): remake it when a pack's Chinese changes."""
    import sys
    from fontTools.ttLib import TTFont
    sys.path.insert(0, str(PACKS.parents[1] / "tools"))
    import make_fonts
    cmap = TTFont(PACKS.parents[1] / "app" / "fonts" / "noto-sc.woff2").getBestCmap()
    assert {"你", "好", "水", "ǎ"} <= make_fonts.needed()
    assert not [c for c in make_fonts.needed() if ord(c) not in cmap]

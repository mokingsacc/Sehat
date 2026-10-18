"""Hints, never answers (C2.3, P15): the code's three-rung ladder for Qalam sheets and sums in Ask, the leak check
in every form, Homework help's model ladder, "Check my answer" and the new events."""
import copy
import json

import pytest
from fastapi.testclient import TestClient

from tutor_hub import events, hints, sheets
from tutor_hub.ai.fake import FakeProvider
from tutor_hub.ai.filters import leaks
from tutor_hub.packs import validate_lesson
from tutor_hub.server import create_app

from conftest import PACKS

STAGING = "qg1j2918yx"                       # cohorts/staging.json: homework on
SEEDS = range(1000, 1060)


def keys(library):
    for lid, l in library.lessons.items():
        if not l.get("sheet"):
            continue
        for seed in (SEEDS if sheets.needs_seed(l) else [0]):
            for lang in ("prs", "ps", "en"):
                yield l, seed, lang, sheets.answer_key(l, seed, lang, lambda n: n)


def test_every_value_item_on_every_pack_1_sheet_has_three_hints_and_none_gives_the_answer(library):
    seen = 0
    for l, seed, lang, key in keys(library):
        for r in key["items"]:
            if r["check"] != "value":
                continue
            assert r["hints"] and [x["rung"] for x in r["hints"]] == [1, 2, 3], (l["id"], seed, r)
            for x in r["hints"]:
                assert not leaks(x["text"], [r["a"]]), (l["id"], seed, lang, r["n"], x["text"])
            one = r["hints"][0]
            if one.get("step"):
                assert one["lesson"] == l["id"] and 1 <= one["step"] <= len(l["steps"])
            seen += 1
    assert seen > 1000


def test_rung_one_points_to_the_step_that_teaches_that_kind_of_sum(library):
    l = library.lessons["maths-7-fractions-add"]
    assert hints.ladder(q="1/5 + 2/5", answer="3/5", lang="prs", lesson=l, step=2)[0]["step"] == 2
    for seed in SEEDS:
        for it in sheets.items_of(sheets.expand(l, seed)):
            if it.get("q") and "/" in it["q"]:
                k = hints.kind_of(it["q"])
                assert it["step"] == (2 if k[2] == k[4] else 4), it


def test_a_rung_that_would_leak_becomes_listen_to_the_step_again(library):
    l = library.lessons["maths-7-fractions-add"]
    own = [{"prs": "جواب ۳/۴ است", "ps": "ځواب ۳/۴ دی", "en": "it is three quarters"},
           {"prs": "سه چهارم", "ps": "درې څلورمې", "en": "0.75"}]
    rungs = hints.ladder(q="1/2 + 1/4", answer="3/4", lang="en", lesson=l, step=4, own=own)
    assert [r["rung"] for r in rungs] == [1, 2, 3]
    for r in rungs[1:]:
        assert not leaks(r["text"], ["3/4"]) and r.get("step") == 4


@pytest.mark.parametrize("text", ["3/4", "۳/۴", "0.75", "three quarters", "سه چهارم", "3 / 4", "75%"])
def test_the_leak_check_catches_the_answer_in_every_form(text):
    assert leaks(f"So it is {text}.", ["3/4"])


def test_validator_wants_steps_and_hints_that_keep_the_answer_back():
    pdir = PACKS / "starter"
    base = json.loads((pdir / "lessons" / "maths-7-fractions-add.json").read_text(encoding="utf-8"))
    bad = copy.deepcopy(base)
    del bad["sheet"]["items"][0]["step"]
    bad["sheet"]["items"][2]["q"] = "2/5 + 1/4 + 1/4"                  # code cannot hint at three parts
    bad["sheet"]["items"][2]["a"] = "9/10"
    problems = "\n".join(validate_lesson(bad, pdir))
    assert "step must name the lesson step" in problems and "needs its own hints" in problems
    bad = copy.deepcopy(base)
    bad["sheet"]["items"][2]["hints"] = [{"prs": "مثل ۱/۴ + ۱/۴", "ps": "لکه ۱/۴ + ۱/۴"},
                                         {"prs": "جواب ۱۳/۲۰ است", "ps": "ځواب ۱۳/۲۰ دی"}]
    bad["sheet"]["items"][0]["step_same"] = 99
    problems = "\n".join(validate_lesson(bad, pdir))
    assert "13/20" in problems or "answer" in problems
    assert "step_same" in problems
    assert validate_lesson(copy.deepcopy(base), pdir) == []


def test_sheet_keys_carry_hints_and_the_answer_page_stays_with_the_teacher(hub_client):
    key = hub_client.get("/api/sheets/maths-7-fractions-add/key?seed=1234&lang=prs").json()
    assert all(len(r["hints"]) == 3 for r in key["items"] if r["check"] == "value")
    assert hub_client.get("/api/sheets/maths-7-fractions-add.html?lang=prs&kind=answers").status_code in (401, 403)


# Homework help on the online home, with the fake provider; no network
@pytest.fixture
def online(cfg):
    cfg.home = "online"
    cfg.lacks = ("printer", "pin")
    cfg.cohort = STAGING
    cfg.ai_provider = "fake"
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.fake = c.hub.gateway.provider = FakeProvider()
        c.hub.brain.gateway.provider = c.fake
        yield c


def join(c, band="s1", lang="prs"):
    r = c.post("/api/join", json={"band": band, "lang": lang, "picture": "key",
                                  "consent": {"kind": "self", "version": c.hub.consent_version}})
    assert r.status_code == 200, r.text
    return {"X-Learner-Token": r.json()["token"]}


WORD = {"en": "Ali ate 1/4 of a cake and Sara ate 2/4 of it. How much of the cake did they eat together?",
        "prs": "علی ۱/۴ کیک را خورد و سارا ۲/۴ آن را. روی هم چقدر از کیک را خوردند؟"}
LEAKY = [["Think of 3/4.", "Like ۳/۴.", "It is 0.75."],
         ["It is three quarters.", "Count the parts.", "Add the tops."],
         ["سه چهارم", "Count the parts.", "Add the tops."]]


def ask(c, h, text, lang="en", **kw):
    return c.post("/api/ask", json={"text": text, "lang": lang, "year": 7, **kw}, headers=h).json()


def test_a_sum_in_ask_gets_the_codes_ladder_and_check_my_answer(online):
    h = join(online, lang="en")
    a = ask(online, h, "What is 1/5 + 2/5?")
    assert a["source"] == "maths" and a["checkable"] and online.fake.sent == []       # code, no AI call
    assert not leaks(json.dumps(a), ["3/5"]) and "solution" not in a
    check = lambda v: online.post("/api/m/homework/check", json={"id": a["id"], "answer": v}, headers=h).json()
    assert check("2/5") == {"result": "not_yet", "left": 2}
    assert check("۳/۵") == {"result": "right", "left": 1}
    assert check("6/10") == {"result": "right", "left": 0}
    assert check("3/5")["result"] == "used_up"


def test_the_models_ladder_is_solved_twice_and_never_shows_its_answer(online):
    online.fake.replies["hint"] = ["ANSWER: 3/4", "ANSWER: 3/4",
                                   json.dumps(["Look at what each person ate.", "1/5 + 1/5 = 2/5",
                                               "Both bottom numbers are 4."])]
    h = join(online, lang="en")
    a = ask(online, h, WORD["en"])
    assert a["source"] == "ai" and [r["rung"] for r in a["ladder"]] == [1, 2, 3] and a["checkable"]
    assert len(online.fake.sent) == 3 and not leaks(json.dumps(a), ["3/4"])
    r = online.post("/api/m/homework/check", json={"id": a["id"], "answer": "0.75"}, headers=h).json()
    assert r == {"result": "right", "left": 2}


@pytest.mark.parametrize("leaky", LEAKY)
def test_a_leaking_model_never_reaches_the_learner(online, leaky):
    online.fake.replies["hint"] = ["ANSWER: 3/4", "ANSWER: 3/4", json.dumps(leaky)]
    h = join(online, lang="en")
    a = ask(online, h, WORD["en"])
    assert not a.get("ladder") and a["waiting"]
    for t in ("3/4", "۳/۴", "0.75", "three quarters", "سه چهارم"):
        assert t not in json.dumps(a, ensure_ascii=False)


def test_when_the_two_runs_disagree_check_my_answer_says_it_is_not_sure(online):
    online.fake.replies["hint"] = ["ANSWER: 3/4", "ANSWER: 1/2",
                                   json.dumps(["Look at each part.", "1/5 + 1/5 = 2/5", "Add the tops."])]
    h = join(online, lang="en")
    a = ask(online, h, WORD["en"])
    assert a["unsure"] and not a["checkable"]
    r = online.post("/api/m/homework/check", json={"id": a["id"], "answer": "3/4"}, headers=h).json()
    assert r["result"] == "unsure"


def test_a_pashto_exercise_makes_no_ai_call_and_goes_to_the_teacher(online):
    h = join(online, lang="ps")
    a = ask(online, h, "علي د کېک ۱/۴ وخوړ او سارا ۲/۴. ټول یې څومره وخوړل؟", lang="ps")
    assert online.fake.sent == [] and a["waiting"] and not a.get("ladder")


def test_ask_my_teacher_goes_straight_to_the_teacher(online):
    h = join(online, lang="en")
    a = ask(online, h, "M7-03-01234 item 2: I wrote 5/8", teacher=True)
    assert a["waiting"] and a["source"] == "none" and online.fake.sent == []


def test_check_my_answer_needs_a_ladder_and_a_learner_who_agreed(online):
    h = join(online, lang="en")
    assert online.post("/api/m/homework/check", json={"id": "x" * 16, "answer": "1"}, headers=h).status_code == 404
    assert online.post("/api/m/homework/check", json={"id": "x" * 16, "answer": "1"}).status_code in (401, 403)


def test_the_village_hub_has_homework_off_so_no_check_route_and_no_ai_for_exercises(hub_client):
    assert hub_client.post("/api/m/homework/check", json={"id": "x" * 16, "answer": "1"}).status_code == 404
    a = hub_client.post("/api/ask", json={"text": WORD["prs"], "lang": "prs", "year": 7}).json()
    assert a["waiting"] and not a.get("ladder")


def test_the_new_events_carry_an_item_and_never_a_name():
    ok = {"at": "2026-10-16T10:00", "verb": "check.item", "object": "maths-7-fractions-add:3", "value": 2}
    assert events.check(ok, phone=True) == []
    assert events.check(dict(ok, verb="hint.rung", value=3), phone=True) == []
    assert events.check(dict(ok, verb="check.dispute", value=None), phone=True) == []
    assert events.check(dict(ok, value=3), phone=True)                             # 0, 1 or 2
    assert events.check(dict(ok, verb="hint.rung", value=4), phone=True)
    assert events.check(dict(ok, object="Ahmad"), phone=True)
    assert events.check(dict(ok, object="maths-7-fractions-add:0"), phone=True)

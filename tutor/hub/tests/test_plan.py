""""I want to learn this" and the wishlist (P22, C3.5, DESIGN-C2C3-SPECS item 14): a goal matched against the lessons
the hub serves to her band, a plan in pack order or the closest lessons, and a miss kept screened, counted and
without the token. No AI, no network."""
import pytest
from fastapi.testclient import TestClient

from tutor_hub import learners, search, sheets
from tutor_hub.mods import plan
from tutor_hub.server import create_app, teacher_pin

OPEN = "3w2lco2s8f"


@pytest.fixture
def hub(cfg):
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.pin = {"X-Teacher-Pin": teacher_pin(cfg.data)}
        yield c


def goal(c, text, band="s1", lang="prs", **kw):
    return c.post("/api/m/plan" + (f"?cohort={kw['cohort']}" if "cohort" in kw else ""),
                  json={"goal": text, "lang": lang, "band": band}, headers=kw.get("headers"))


def wishes(c):
    return c.hub.store.sync.wishes()


def test_a_matching_goal_gives_a_plan_in_pack_order(hub):
    r = goal(hub, "کسرها").json()
    assert r == {"kind": "plan", "label": "کسرها", "lessons": ["maths-7-fractions-add"]}
    assert goal(hub, "ماده", lang="ps").json()["label"] == "ماده"
    assert goal(hub, "یخ و بخار").json() == {"kind": "closest", "lessons": ["science-7-states-of-matter"]}
    assert wishes(hub) == []                                     # a match is not a wish


def test_only_her_bands_lessons_and_only_for_readers(hub):
    assert goal(hub, "کسرها", band="s2").json()["kind"] == "wish"       # no year 10 to 12 fractions yet
    assert goal(hub, "کسرها", band="ad").json()["kind"] == "wish"       # adults learn from adult packs
    for band in ("ey", "p1", "p2", "x"):
        assert goal(hub, "کسرها", band=band).status_code == 404
    hub.hub.store.sync.set_flag(hub.hub.cohort_id, "plan", enabled=False, changed_by="admin")
    assert goal(hub, "کسرها").status_code == 404                        # the module off: as if never there


def test_a_miss_reaches_the_wishlist_screened_counted_and_without_the_token(hub):
    tok = hub.post("/api/join", json={"band": "s1", "lang": "prs", "picture": "key",
                                      "consent": {"kind": "self", "version": hub.hub.consent_version}}).json()["token"]
    r = goal(hub, "My name is Karim, call 0799123456. I want chemistry", lang="en", headers={"X-Learner-Token": tok})
    assert r.json() == {"kind": "wish", "saved": True}
    goal(hub, "my  name is karim, call 0799123456. i want CHEMISTRY", lang="en")
    [w] = wishes(hub)
    assert w["count"] == 2 and "Karim" not in w["wish"] and "0799123456" not in w["wish"] and "chemistry" in w["wish"]
    assert (w["cohort"], w["band"], w["lang"]) == (hub.hub.cohort_id, "s1", "en")
    assert tok not in str(w) and set(w) == {"cohort", "band", "lang", "wish", "wkey", "count", "first_day", "last_day", "status"}
    assert len(w["first_day"]) == 10                              # a day, never a time
    assert goal(hub, "the of and").json() == {"kind": "wish", "saved": False}   # nothing to keep
    assert goal(hub, "x" * 201).status_code == 422


def test_distress_health_and_off_limits_get_the_kind_message_and_nothing_is_kept(hub):
    d = goal(hub, "پدرم مرا می‌زند").json()
    assert d["kind"] == "rules" and d["reason"] == "distress" and "بزرگسال" in d["text"]
    h = goal(hub, "I want to learn about medicine for my fever", lang="en").json()
    assert h["reason"] == "health" and "teacher" not in h["text"]          # nothing goes to a teacher from here
    assert goal(hub, "politics", lang="en").json()["reason"] == "off_limits"
    assert wishes(hub) == [] and hub.hub.store.sync.queue() == []


def test_the_open_cohort_has_it_and_the_teacher_reads_the_wishes(hub):
    tok = learners.new_token()                          # a learner of open: her token says her class (C5 H1)
    hub.hub.store.sync.add_learner(token_hash=learners.token_hash(tok), cohort=OPEN, picture="key", band="s1")
    assert goal(hub, "astronomy", lang="en", headers={"X-Learner-Token": tok}).json()["kind"] == "wish"
    assert [w["cohort"] for w in wishes(hub)] == [OPEN]
    goal(hub, "astronomy", lang="en")
    goal(hub, "astronomy", lang="en")
    goal(hub, "robots", lang="en", band="s2")
    goal(hub, "Astronomy", lang="en", band="s2")
    rows = hub.get("/api/m/teacher/wishes", headers=hub.pin).json()["wishes"]
    assert [(w["text"], w["count"], w["bands"]) for w in rows] == [("astronomy", 3, ["s1", "s2"]), ("robots", 1, ["s2"])]
    assert set(rows[0]) == {"text", "count", "bands", "langs", "first_day", "last_day"}     # her own class's only
    assert hub.get("/api/m/teacher/wishes").status_code == 401


def test_plans_take_the_rest_of_the_unit_and_three_closest_at_most():
    def lesson(lid, title, unit, subject="maths", steps=()):
        return lid, {"title": {"en": title}, "unit": {"en": unit}, "subject": subject, "year": 7,
                     "steps": [{"kind": "read", "text": {"en": t}} for t in steps]}
    ls = [lesson("f1", "What fractions are", "Fractions"), lesson("w1", "Whole numbers", "Numbers"),
          lesson("f2", "Adding them", "Fractions"), lesson("f3", "Fractions in the market", "Fractions"),
          lesson("s1", "Light", "Light", "science", ["A fraction of the light passes"]),
          lesson("s2", "Shadows", "Light", "science", ["fraction"]), lesson("s3", "Lenses", "Light", "science", ["fraction"]),
          lesson("s4", "Mirrors", "Light", "science", ["fraction"])]
    assert search.plan_for("fraction", ls, sheets.SUBJECT_NAMES) == {
        "kind": "plan", "lessons": ["f1", "f2", "f3"], "unit": {"en": "Fractions"}, "title": {"en": "What fractions are"}}
    assert search.plan_for("adding them", ls, sheets.SUBJECT_NAMES)["lessons"] == ["f1", "f2", "f3"]   # its unit
    assert search.plan_for("fraction", ls[4:], sheets.SUBJECT_NAMES) == {"kind": "closest",
                                                                       "lessons": ["s1", "s2", "s3"]}
    assert search.plan_for("cooking", ls, sheets.SUBJECT_NAMES) == {"kind": "miss"}
    assert search.plan_for("", ls, sheets.SUBJECT_NAMES) == {"kind": "miss"}
    assert plan.wish_key("I want CHEMISTRY!") == plan.wish_key("i want chemistry")

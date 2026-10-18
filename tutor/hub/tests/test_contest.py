"""Contests (P31, DESIGN-C6-SPECS.md C6.5): the content file's checks and the contest list of words; the questions
without their answers (a leak test with sentinels); marking by code; one entry a token; the 10 minutes after the
close; the key after the close only; the event's shape, which a phone cannot send; the teacher's list in alias order
whatever the scores; releases per class and to all classes; the certificate branch; the gate on a release host; and
`held()`. The hub on SQLite; the Worker's D1 store passes the same store contract (test_store_contract.py)."""
import asyncio
import json
import random
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from tutor_hub import cert, contests, events, learners
from tutor_hub.mods import contest as contest_mod
from tutor_hub.packs import Library
from tutor_hub.server import admin_pin, create_app, teacher_pin

from conftest import PACKS, TUTOR

STAGING = "qg1j2918yx"              # cohorts/staging.json: bands ey to ad; contest off (no seed turns it on)
ROLES = ["maths teacher", "Dari reader", "Pashto reader"]
ITEMS = [{"lesson": "adult-maths-1-numbers", "step": 2}, {"lesson": "adult-maths-1-numbers", "step": 3},
         {"lesson": "adult-maths-1-numbers", "step": 4}, {"lesson": "adult-maths-2-change", "step": 2},
         {"lesson": "adult-maths-2-change", "step": 3}]


def at(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime(contests.AT)


def contest(**kw) -> dict:
    now = datetime.now(timezone.utc)
    c = {"id": "maths-week-3", "title": {"prs": "مسابقهٔ ریاضی، هفتهٔ سوم", "ps": "د ریاضي سیالي، درېیمه اونۍ",
                                         "en": "Maths week 3"},
         "subject": "maths", "bands": ["ad"], "langs": ["prs", "ps"], "opens_at": at(now - timedelta(hours=1)),
         "closes_at": at(now + timedelta(hours=2)), "minutes": 20, "items": ITEMS, "certificate": True,
         "scope": "class", "review": {"status": "draft", "needs": ROLES, "signoffs": []}}
    c.update(kw)
    return c


@pytest.fixture(scope="module")
def lib():
    return Library(PACKS)


def write(folder, *cs):
    folder.mkdir(parents=True, exist_ok=True)
    for c in cs:
        (folder / f"{c['id']}.json").write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")


@pytest.fixture
def hub(cfg, tmp_path):
    cfg.cohort = STAGING
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.admin = {"X-Admin-Pin": admin_pin(cfg.data)}
        c.teacher = {"X-Teacher-Pin": teacher_pin(cfg.data)}
        c.dir = tmp_path / "contests"

        def put(*cs):
            write(c.dir, *cs)
            c.hub.library.contest_dir = c.dir
            c.hub.library.load()
            assert not [p for p in c.hub.library.problems if p.startswith("contests/")], c.hub.library.problems
        c.put = put
        c.hub.store.sync.set_flag(STAGING, "contest", enabled=True, settings={}, changed_by="admin")
        yield c


def sign(c, cid="maths-week-3", roles=ROLES):
    h = c.hub.library.contests[cid]["_hash"]
    for role in roles:
        c.hub.store.sync.add_signoff(lesson="contest:" + cid, content_hash=h, role=role, initials="AB",
                                     signed_on="2027-01-01", via="pin")


def release(c, cid="maths-week-3", cohort=STAGING, status=200):
    r = c.post(f"/api/m/admin/content/contests/{cid}/open", json={"cohort": cohort}, headers=c.admin)
    assert r.status_code == status, r.text
    return r.json()


def her(c, band="ad", consent=True):
    tok = learners.new_token()
    extra = {"consent_kind": "self", "consent_version": c.hub.consent_version, "consent_at": learners.minute()} \
        if consent else {}
    c.hub.store.sync.add_learner(token_hash=learners.token_hash(tok), cohort=STAGING, picture="key", band=band, **extra)
    return {"X-Learner-Token": tok}


def ready(c, **kw):
    """A contest open now, signed and released to the staging class."""
    c.put(contest(**kw))
    sign(c, kw.get("id", "maths-week-3"))
    release(c, kw.get("id", "maths-week-3"))


RIGHT = [1, 0, "15", 1, "60"]          # the five steps' answers, as the lessons hold them


# the file's checks

def test_a_good_contest_passes_and_its_hash_covers_its_lessons(lib):
    c = contest()
    assert contests.check(c, lib, c["id"]) == []
    h = contests.content_hash(c, lib)
    assert h.startswith("sha256:") and h == contests.content_hash(dict(c, review={"needs": ROLES, "signoffs": []}), lib)
    assert h != contests.content_hash(dict(c, minutes=21), lib)
    moved = dict(lib.hashes, **{"adult-maths-2-change": "sha256:" + "0" * 64})

    class Moved:                                                  # a lesson changed: the contest's hash moves too
        hashes = moved
    assert contests.content_hash(c, Moved) != h
    assert len(contests.item_hashes(c, lib)) == 1 + len(ITEMS)


@pytest.mark.parametrize("change, says", [
    ({"items": ITEMS[:4]}, "5 to 30"),
    ({"items": ITEMS * 7}, "5 to 30"),
    ({"items": ITEMS[:4] + [ITEMS[0]]}, "asked twice"),
    ({"items": ITEMS[:4] + [{"lesson": "adult-maths-1-numbers", "step": 1}]}, "not a choice or number"),
    ({"items": ITEMS[:4] + [{"lesson": "adult-maths-1-numbers", "step": 99}]}, "has no step 99"),
    ({"items": ITEMS[:4] + [{"lesson": "no-such-lesson", "step": 1}]}, "not a lesson here"),
    ({"items": ITEMS[:4] + [{"lesson": "adult-dari-1-alef-beh", "step": 3}]}, "not maths"),
    ({"items": ITEMS[:4] + [{"lesson": "adult-maths-1-numbers", "step": "2"}]}, "exactly {lesson, step}"),
    ({"bands": ["s1"]}, "is not for s1"),
    ({"bands": ["ey"]}, "never early years"),
    ({"langs": ["prs", "en"]}, "is not in en"),
    ({"minutes": 4}, "minutes is a whole number"),
    ({"minutes": 61}, "minutes is a whole number"),
    ({"opens_at": "2027-01-01T08:00", "closes_at": "2027-01-01T08:30"}, "one hour to 14 days"),
    ({"opens_at": "2027-01-01T08:00", "closes_at": "2027-01-16T08:00"}, "one hour to 14 days"),
    ({"opens_at": "2027-01-01 08:00"}, "UTC minutes"),
    ({"subject": "quran"}, "subject is one of"),
    ({"certificate": "yes"}, "true or false"),
    ({"scope": "school"}, "scope is"),
    ({"id": "Maths-Week"}, "id is lower-case"),
    ({"prize": 1}, "unknown field"),
    ({"title": {"prs": "x", "en": "y"}}, "all three"),
    ({"title": {"prs": "x", "ps": "y", "en": "z" * 81}}, "at most 80"),
    ({"review": {"needs": ["Dari reader", "Pashto reader"], "signoffs": []}}, "a subject teacher"),
    ({"review": {"needs": ["maths teacher", "Dari reader"], "signoffs": []}}, "Dari and Pashto readers"),
])
def test_the_checks_refuse_a_bad_contest(lib, change, says):
    c = contest(**change)
    probs = contests.check(c, lib, c["id"] if isinstance(c.get("id"), str) and c["id"].islower() else None)
    assert any(says in p for p in probs), probs


def test_the_file_name_must_be_the_id(lib):
    assert any("file name" in p for p in contests.check(contest(), lib, "maths-week-4"))


@pytest.mark.parametrize("lang, title, word", [
    ("en", "Maths week 3: win a prize", "prize"),
    ("en", "The Winner of maths", "winner"),
    ("en", "Who comes first?", "first"),
    ("en", "Maths award week", "award"),
    ("en", "Money maths", "money"),
    ("prs", "مسابقه با جایزه", "جایزه"),
    ("prs", "برنده‌ی ریاضی", "برنده"),
    ("prs", "مقام اول", "اول"),
    ("ps", "د سیالۍ انعام", "انعام"),
    ("ps", "ګټونکی څوک دی", "ګټونکی"),
    ("ps", "لومړی ځای", "لومړی"),
])
def test_the_title_goes_through_the_contest_list_in_three_languages(lib, lang, title, word):
    t = dict(contest()["title"], **{lang: title})
    probs = contests.check(contest(title=t), lib, "maths-week-3")
    assert any("promises a prize or a place" in p and word in p for p in probs), probs


def test_the_contest_list_matches_whole_words_only(lib):
    assert contests.prize_words("Firstly, the winnings of a wink") == []        # not "first", "win"
    assert contests.prize_words("WIN") == ["win"]


def test_release_mode_serves_a_signed_contest_only_and_holds_one_whose_lesson_moved(tmp_path, lib):
    folder = tmp_path / "contests"
    write(folder, contest())
    found, probs, hidden = contests.load(folder, lib, release=False)
    assert not probs and found["maths-week-3"]["_state"] == "draft"
    found, probs, hidden = contests.load(folder, lib, release=True)
    assert not found and not probs and "not signed by its reviewers yet" in hidden[0]
    h = contests.content_hash(contest(), lib)
    signed = contest(review={"status": "signed", "needs": ROLES, "signoffs": [
        {"role": r, "initials": "AB", "date": "2027-01-01", "hash": h} for r in ROLES]})
    write(folder, signed)
    found, _, hidden = contests.load(folder, lib, release=True)
    assert found["maths-week-3"]["_state"] == "signed" and not hidden
    write(folder, dict(signed, minutes=25))
    found, _, hidden = contests.load(folder, lib, release=True)
    assert not found and "changed since it was signed: sign again" in hidden[0]


def test_release_mode_holds_a_contest_that_asks_an_unsigned_lesson(tmp_path):
    rel = Library(PACKS, release=True)
    folder = tmp_path / "contests"
    write(folder, contest())
    found, probs, hidden = contests.load(folder, rel, release=True)
    assert not found and not probs and "a lesson it asks is not signed yet" in hidden[0]


# the questions, the marking, the key

def test_strip_key_leaves_nothing_of_the_answers_in_the_questions(hub):
    ready(hub)
    sentinels = {}
    real = hub.hub.library.lessons                    # this hub's own library: changed in place after the release
    for i, it in enumerate(ITEMS):
        st = real[it["lesson"]]["steps"][it["step"] - 1]
        st_ = dict(st, why=f"SENTINEL-WHY-{i}", hints=[f"SENTINEL-HINT-{i}"], recall=True)
        if st["kind"] == "number":
            st_["answer"] = f"7{i}{i}{i}9"                       # no number of this shape appears in the steps
            sentinels[i] = st_["answer"]
        real[it["lesson"]]["steps"][it["step"] - 1] = st_
    r = hub.get("/api/m/contest/maths-week-3", headers=her(hub))
    assert r.status_code == 200, r.text
    text = r.text
    assert "SENTINEL" not in text and "recall" not in text
    for v in sentinels.values():
        assert v not in text
    for q in r.json()["questions"]:
        assert not {"answer", "why", "hints", "recall"} & set(q)
        assert q["kind"] in ("choice", "number") and q["prompt"]
    assert contests.strip_key({"kind": "choice", "answer": 1, "why": "w", "hints": [], "recall": True, "prompt": "p"}) \
        == {"kind": "choice", "prompt": "p"}


@pytest.mark.parametrize("step, answer, ok", [
    ({"kind": "choice", "answer": 1}, 1, True),
    ({"kind": "choice", "answer": 1}, 0, False),
    ({"kind": "choice", "answer": 1}, "1", False),
    ({"kind": "choice", "answer": 1}, True, False),
    ({"kind": "number", "answer": "1/2"}, "2/4", True),                # an unsimplified fraction counts
    ({"kind": "number", "answer": "1/2"}, "۱/۲", True),                # Persian digits
    ({"kind": "number", "answer": "1/2"}, "0.5", True),
    ({"kind": "number", "answer": "1 1/2"}, "3/2", True),
    ({"kind": "number", "answer": "15"}, "١٥", True),                  # Arabic-Indic digits
    ({"kind": "number", "answer": "15"}, 15, True),
    ({"kind": "number", "answer": "15"}, "16", False),
    ({"kind": "number", "answer": "15"}, "10+5", False),               # a sum is not an answer
    ({"kind": "number", "answer": "15"}, None, False),
    ({"kind": "number", "answer": "15"}, "1" * 41, False),
    ({"kind": "read"}, 0, False),
])
def test_marking_by_code(step, answer, ok):
    assert contests.right(step, answer) is ok


def test_she_sends_once_and_only_the_percent_is_kept(hub):
    ready(hub)
    me = her(hub)
    assert hub.get("/api/m/contest/maths-week-3", headers=me).status_code == 200
    r = hub.post("/api/m/contest/maths-week-3/answers", json={"answers": [1, 0, "۱۵", 0, None],
                                                               "started": "2027-01-01T08:00"}, headers=me)
    assert r.status_code == 200, r.text
    assert r.json() == {"right": 3, "n": 5, "percent": 60}
    again = hub.post("/api/m/contest/maths-week-3/answers", json={"answers": RIGHT}, headers=me)
    assert again.status_code == 409 and again.json()["code"] == "contest_sent"
    assert hub.get("/api/m/contest/maths-week-3", headers=me).json()["code"] == "contest_sent"
    s = hub.hub.store.sync
    with s.lock:
        rows = [dict(r) for r in s.db.execute("SELECT * FROM events WHERE verb='contest.done'")]
    assert len(rows) == 1
    e = rows[0]
    assert (e["module"], e["object"], e["value"], e["cohort"]) == ("contest", "maths-week-3", 60, STAGING)
    assert e["token_hash"] == learners.token_hash(me["X-Learner-Token"])
    with s.lock:                                             # no answer kept anywhere: not "15" in Persian, not "60"
        dump = "\n".join(s.db.iterdump())
    assert "۱۵" not in dump and "2027-01-01T08:00" not in dump
    listed = hub.get("/api/m/contest", headers=me).json()["contests"]
    assert listed[0]["mine"] == {"percent": 60}


def test_the_answers_body_is_bounded(hub):
    ready(hub)
    me = her(hub)
    for body in ({"answers": RIGHT + [1]}, {"answers": [1] * 31}, {"answers": ["1" * 41]}, {"answers": RIGHT, "x": 1},
                 {"answers": RIGHT, "started": "yesterday"}, {"answers": [[1]]}):
        r = hub.post("/api/m/contest/maths-week-3/answers", json=body, headers=me)
        assert r.status_code == 422, (body, r.text)


def test_a_phone_cannot_send_contest_done_and_the_hubs_event_has_its_shape():
    e = {"at": "2027-01-01T08:00", "verb": "contest.done", "object": "maths-week-3", "value": 60}
    assert events.check(e, phone=False) == []
    assert events.check(e, phone=True)                                      # a phone cannot send it
    assert events.check(dict(e, value=101), phone=False)
    assert events.check(dict(e, object="Maths Week"), phone=False)
    assert events.check(dict(e, object="maths-12345"), phone=False)         # no long digit run in an object
    assert events.VERBS["contest.done"].module == "contest"


def test_the_window_404_before_410_after_and_answers_10_minutes_late(hub, monkeypatch):
    ready(hub)
    c = hub.hub.library.contests["maths-week-3"]
    a, b = contests.when(c["opens_at"]), contests.when(c["closes_at"])
    me, other = her(hub), her(hub)
    monkeypatch.setattr(contest_mod, "now", lambda: a - timedelta(minutes=1))
    assert hub.get("/api/m/contest", headers=me).json()["contests"][0]["phase"] == "soon"
    assert hub.get("/api/m/contest/maths-week-3", headers=me).status_code == 404
    assert hub.post("/api/m/contest/maths-week-3/answers", json={"answers": RIGHT}, headers=me).status_code == 404
    monkeypatch.setattr(contest_mod, "now", lambda: b + timedelta(minutes=5))
    assert hub.get("/api/m/contest/maths-week-3", headers=me).status_code == 410
    r = hub.post("/api/m/contest/maths-week-3/answers", json={"answers": RIGHT}, headers=me)
    assert r.status_code == 200 and r.json()["percent"] == 100
    monkeypatch.setattr(contest_mod, "now", lambda: b + timedelta(minutes=11))
    assert hub.post("/api/m/contest/maths-week-3/answers", json={"answers": RIGHT}, headers=other).status_code == 410
    assert hub.get("/api/m/contest", headers=me).json()["contests"] == []
    monkeypatch.setattr(contest_mod, "now", lambda: a - timedelta(days=8))
    assert hub.get("/api/m/contest", headers=me).json()["contests"] == []          # more than a week away


def test_the_key_is_404_before_the_close_and_200_after(hub, monkeypatch):
    ready(hub)
    c = hub.hub.library.contests["maths-week-3"]
    me = her(hub)
    assert hub.get("/api/m/contest/maths-week-3/key", headers=me).status_code == 404
    monkeypatch.setattr(contest_mod, "now", lambda: contests.when(c["closes_at"]))
    r = hub.get("/api/m/contest/maths-week-3/key", headers=me)
    assert r.status_code == 200
    assert [k["answer"] for k in r.json()["key"]] == RIGHT and all(k["why"] for k in r.json()["key"])


def test_her_class_her_band_her_consent_and_her_token_only(hub):
    ready(hub)
    assert hub.get("/api/m/contest").status_code == 401
    assert hub.get("/api/m/contest", headers=her(hub, band="s1")).json()["contests"] == []
    assert hub.get("/api/m/contest/maths-week-3", headers=her(hub, band="s1")).status_code == 404
    shy = her(hub, consent=False)
    assert hub.get("/api/m/contest", headers=shy).json()["contests"][0]["id"] == "maths-week-3"
    assert hub.get("/api/m/contest/maths-week-3", headers=shy).status_code == 403
    assert hub.post("/api/m/contest/maths-week-3/answers", json={"answers": RIGHT}, headers=shy).status_code == 403
    assert hub.get("/api/m/contest?cohort=d6co6etep6", headers=her(hub)).json()["contests"][0]["id"] == "maths-week-3"
    assert hub.get("/api/m/contest?lang=en", headers=her(hub)).json()["contests"] == []      # no English version
    hub.hub.store.sync.set_flag(STAGING, "contest", enabled=False, settings={}, changed_by="admin")
    assert hub.get("/api/m/contest", headers=her(hub)).status_code == 404


def test_the_day_counts_the_questions_against_per_day(hub):
    ready(hub)
    me = her(hub)
    for _ in range(3):
        assert hub.get("/api/m/contest/maths-week-3", headers=me).status_code == 200
    r = hub.get("/api/m/contest/maths-week-3", headers=me)
    assert r.status_code == 429 and r.json()["code"] == "budget"


# releases

def test_a_release_opens_it_per_class_and_a_close_shuts_it_again(hub):
    hub.put(contest())
    me = her(hub)
    assert hub.get("/api/m/contest", headers=me).json()["contests"] == []           # not released
    r = release(hub, status=409)
    assert r["code"] == "not_signed"
    sign(hub, roles=ROLES[:2])
    assert release(hub, status=409)["code"] == "not_signed"
    sign(hub)
    release(hub)
    assert [x["id"] for x in hub.get("/api/m/contest", headers=me).json()["contests"]] == ["maths-week-3"]
    view = hub.get("/api/m/admin/content", headers=hub.admin).json()["contests"][0]
    assert view["signed"] and view["releases"][STAGING]["open"] and view["took_part"] == 0
    r = hub.post("/api/m/admin/content/contests/maths-week-3/close", json={"cohort": STAGING}, headers=hub.admin)
    assert r.status_code == 200
    assert hub.get("/api/m/contest", headers=me).json()["contests"] == []
    assert hub.get("/api/m/admin/content", headers=hub.admin).json()["contests"][0]["releases"][STAGING]["open"] is False
    log = hub.hub.store.sync._all("SELECT what, detail, cohort FROM admin_log WHERE what='release'", ())
    assert [x["detail"].split(" (")[0] for x in log] == ["contest:maths-week-3 open", "contest:maths-week-3 closed"]


def test_all_classes_opens_it_in_every_cohort(hub):
    hub.put(contest())
    sign(hub)
    r = hub.post("/api/m/admin/content/contests/maths-week-3/open-all", headers=hub.admin)
    assert r.status_code == 200, r.text
    cohorts = [c["id"] for c in asyncio.run(hub.hub.store.cohorts())]
    assert sorted(r.json()["cohorts"]) == sorted(cohorts) and len(cohorts) > 1
    for cid in cohorts:
        assert "maths-week-3" in asyncio.run(contest_mod.released(hub.hub, cid))


def test_a_release_counts_only_at_the_contests_current_hash(hub):
    ready(hub)
    me = her(hub)
    hub.put(contest(minutes=25))                         # edited after its release: closed until signed and opened again
    assert hub.get("/api/m/contest", headers=me).json()["contests"] == []
    view = hub.get("/api/m/admin/content", headers=hub.admin).json()["contests"][0]
    assert view["releases"][STAGING] == dict(view["releases"][STAGING], open=False, earlier=True)


# the teacher

def test_the_teacher_sees_who_took_part_in_alias_order_whatever_the_scores(hub):
    ready(hub)
    s = hub.hub.store.sync
    people = []
    for i in range(6):
        tok = learners.new_token()
        s.add_learner(token_hash=learners.token_hash(tok), cohort=STAGING, picture=["key", "cup", "sun"][i % 3],
                      band="ad", consent_kind="self", consent_version=hub.hub.consent_version,
                      consent_at=learners.minute())
        people.append({"X-Learner-Token": tok})
    order = None
    for seed in range(3):
        rows = []
        for p in people:
            th = learners.token_hash(p["X-Learner-Token"])
            rows.append({"at": events.minute(), "token_hash": th, "cohort": STAGING, "module": "contest",
                         "verb": "contest.done", "object": "maths-week-3", "value": random.Random(seed).randint(0, 100)})
        random.Random(seed).shuffle(rows)
        with s.lock:
            s.db.execute("DELETE FROM events WHERE verb='contest.done'")
        asyncio.run(hub.hub.store.add_events(rows[:5]))
        got = hub.get("/api/m/teacher/contests", headers=hub.teacher).json()["contests"][0]
        listed = [(x["picture"], x["number"]) for x in got["learners"]]
        assert listed == sorted(listed) and got["took_part"] == 5 and got["of"] == 6
        assert set(got["learners"][0]) == {"picture", "number", "band", "percent"}
        order = order or listed
    assert "token_hash" not in json.dumps(got)


def test_the_teacher_route_is_her_own_class_only(hub):
    ready(hub)
    hub.hub.store.sync.set_flag("d6co6etep6", "contest", enabled=True, settings={}, changed_by="admin")
    r = hub.get("/api/m/teacher/contests?cohort=d6co6etep6", headers=hub.teacher)
    assert r.status_code == 403 and r.json()["code"] == "not_your_class"
    assert hub.get("/api/m/teacher/contests").status_code in (401, 403)


# the certificate

def test_the_certificate_needs_true_a_release_and_her_event_and_has_no_score(hub):
    ready(hub)
    me = her(hub)
    body = {"path": "contest:maths-week-3", "lang": "en"}
    r = hub.post("/api/m/cert", json=body, headers=me)
    assert r.status_code == 409 and r.json()["missing"] == ["maths-week-3"]
    hub.post("/api/m/contest/maths-week-3/answers", json={"answers": [1, 0, "15", 1, None]}, headers=me)
    r = hub.post("/api/m/cert", json=body, headers=me)
    assert r.status_code == 200, r.text
    got = r.json()
    paper = got["paper"]["body"]
    assert "took part in" in paper and "Maths week 3" in paper
    assert "80" not in paper.replace(got["url"], "") and "lessons" not in paper and "4 of 5" not in paper
    row = hub.hub.store.sync.certificate(got["id"])
    assert row["course"] == "contest:maths-week-3" and row["version"] == hub.hub.library.contests["maths-week-3"]["_hash"]
    check = hub.get(f"/api/cert/{got['id']}").json()
    assert check["course"]["en"] == "Maths week 3" and check["did"] == "took_part"
    # no certificate where the contest has none, or where it is not released to her class
    hub.put(contest(id="maths-week-4", certificate=False))
    sign(hub, "maths-week-4")
    release(hub, "maths-week-4")
    hub.post("/api/m/contest/maths-week-4/answers", json={"answers": RIGHT}, headers=me)
    assert hub.post("/api/m/cert", json={"path": "contest:maths-week-4"}, headers=me).status_code == 404
    hub.post("/api/m/admin/content/contests/maths-week-3/close", json={"cohort": STAGING}, headers=hub.admin)
    assert hub.post("/api/m/cert", json=body, headers=me).status_code == 404
    assert cert.can_certify({"certificate": True, "subject": "maths"})
    assert not cert.can_certify({"certificate": False, "subject": "maths"})


# held and locked

def test_held_on_a_release_host_until_a_contest_is_signed(hub, tmp_path):
    h = hub.hub
    assert "contest" not in h.held()
    h.cfg.release = True
    assert "contest" in h.held()
    h.library.contests["x"] = {"_state": "signed"}
    assert "contest" not in h.held()


def test_the_gate_locks_the_switch_on_a_release_host(hub, tmp_path):
    h = hub.hub
    h.store.sync.set_flag(STAGING, "contest", enabled=False, settings={}, changed_by="admin")

    def turn_on():
        return hub.post(f"/api/m/admin/cohorts/{STAGING}/flags/contest", headers=hub.admin,
                        json={"enabled": True, "confirm": True, "both": True})
    assert turn_on().status_code == 200
    h.store.sync.set_flag(STAGING, "contest", enabled=False, settings={}, changed_by="admin")
    h.cfg.release = True
    (tmp_path / "cohorts" / "gates").mkdir(parents=True)
    for f in (TUTOR / "cohorts").glob("*.json"):
        (tmp_path / "cohorts" / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
    h.cfg.cohorts = tmp_path / "cohorts"
    r = turn_on()
    assert r.status_code == 409 and r.json()["code"] == "locked" and "legal opinion" in r.json()["error"]
    mods = hub.get(f"/api/m/admin/cohorts/{STAGING}", headers=hub.admin).json()["modules"]
    assert [m["lock"] for m in mods if m["id"] == "contest"] == ["gate"]
    (tmp_path / "cohorts" / "gates" / "contest.json").write_text('{"opinion": "2027-03-15"}', encoding="utf-8")
    assert turn_on().status_code == 200


# the review page, the signatures into the file, the validator

def test_a_contest_is_reviewed_question_by_question_signed_and_pulled_into_its_file(hub, tmp_path):
    import importlib.util
    import shutil
    import subprocess
    import sys
    spec = importlib.util.spec_from_file_location("pull_signoffs", TUTOR / "tools" / "pull_signoffs.py")
    pull = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pull)
    hub.put(contest())
    h = hub.teacher
    q = hub.get("/api/m/review/queue", params={"role": "maths teacher"}, headers=h).json()
    assert q["contests"] == [{"id": "maths-week-3", "title": contest()["title"], "subject": "maths", "items": 5,
                              "status": "not_started"}]
    assert hub.get("/api/m/review/queue", params={"role": "science teacher"}, headers=h).json()["contests"] == []
    assert hub.get("/api/m/review/contests/maths-week-3", params={"role": "science teacher"}, headers=h).status_code == 403
    d = hub.get("/api/m/review/contests/maths-week-3", params={"role": "Dari reader"}, headers=h).json()
    assert len(d["steps"]) == 6 and "review" not in d["contest"] and "items" not in d["contest"]
    third = d["steps"][3]["item"]
    assert third["answer"] == "15" and third["why"] and "answer" not in third["question"]   # beside it, for her only
    sign = lambda r: hub.post("/api/m/review/contests/maths-week-3/sign", headers=h,
                              json={"hash": d["hash"], "role": r, "initials": "AB"})
    assert sign("Dari reader").status_code == 409
    assert hub.post("/api/m/review/contests/maths-week-3/steps/1", headers=h,
                    json={"verdict": "ok", "step_hash": "sha256:old0000", "role": "Dari reader"}).status_code == 409
    for r in ROLES:
        for st in d["steps"]:
            assert hub.post(f"/api/m/review/contests/maths-week-3/steps/{st['n']}", headers=h,
                            json={"verdict": "ok", "step_hash": st["hash"], "role": r}).status_code == 200
        assert sign(r).status_code == 200
    assert hub.get("/api/m/review/queue", params={"role": "maths teacher"}, headers=h).json()["contests"][0]["status"] \
        == "signed"
    assert hub.get("/api/m/admin/content", headers=hub.admin).json()["contests"][0]["signed"] is True
    release(hub)                                              # signed on the page: the admin may open it now
    offs = [o for o in hub.get("/api/m/review/signoffs", headers=h).json()["signoffs"] if o["lesson"].startswith("contest:")]
    assert len(offs) == 3
    shutil.copytree(PACKS, tmp_path / "content" / "packs")
    shutil.copy(PACKS.parent / "sources.json", tmp_path / "content" / "sources.json")
    write(tmp_path / "content" / "contests", contest())
    assert Library(tmp_path / "content" / "packs").contests["maths-week-3"]["_state"] == "draft"
    report = pull.pull(offs, tmp_path / "content" / "packs", hub_ok="the content lead")
    assert len(report["copied"]) == 3 and not report["stale"]
    f = json.loads((tmp_path / "content" / "contests" / "maths-week-3.json").read_text(encoding="utf-8"))
    assert f["review"]["status"] == "checked" and [o["role"] for o in f["review"]["signoffs"]] == ROLES
    c = Library(tmp_path / "content" / "packs").contests["maths-week-3"]
    assert c["_state"] == "signed" and c["_hash"] == d["hash"]
    out = subprocess.run([sys.executable, str(TUTOR / "tools" / "validate_pack.py"), str(tmp_path / "content" / "packs"),
                          "--contests"], capture_output=True, text=True)
    assert out.returncode == 0, out.stdout
    assert f"contest:maths-week-3\t{d['hash']}\tsigned" in out.stdout
    write(tmp_path / "content" / "contests", contest(id="bad-one", minutes=99))
    out = subprocess.run([sys.executable, str(TUTOR / "tools" / "validate_pack.py"), str(tmp_path / "content" / "packs")],
                         capture_output=True, text=True)
    assert out.returncode == 1 and "contests/bad-one: minutes is a whole number" in out.stdout


def test_the_teachers_page_learns_whether_contests_are_on(hub):
    assert hub.get("/api/m/teacher/me", headers=hub.teacher).json()["contest"] is True
    hub.hub.store.sync.set_flag(STAGING, "contest", enabled=False, settings={}, changed_by="admin")
    assert hub.get("/api/m/teacher/me", headers=hub.teacher).json()["contest"] is False

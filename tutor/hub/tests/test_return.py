"""The teacher's return code (W9, WEBSITE.md 3.12): a lost phone, no card, in a class. The teacher makes six digits for
one learner (15 minutes, once, five tries); her new phone sends the class code and the digits with no token, and gets
a new token for the same learner (the lost phone's dies), then her lessons and marks from GET /api/me/progress. The
store's half on SQLite and on the D1 fake (the same contract), then the routes on the hub and online."""
import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from fakes.d1 import FakeD1, ffi as fake_ffi
from tutor_hub import events, learners
from tutor_hub.mods import teacher
from tutor_hub.server import create_app, teacher_pin
from tutor_hub.stores import D1Store, SqliteStore
from tutor_hub.stores.sqlite import MIGRATIONS

from test_review import PEPPER, STAGING, online, rsa, token  # noqa: F401  (fixtures and helpers)

CLASS = "d6co6etep6"


def later(minutes=15):
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat(timespec="seconds")


def minute(**ago):
    return events.minute(datetime.now(timezone.utc) - timedelta(**ago))


# the store's contract, on both stores

@pytest.fixture(params=["sqlite", "d1"])
async def store(request, tmp_path):
    s = SqliteStore(tmp_path / "hub.db") if request.param == "sqlite" else \
        D1Store(FakeD1(tmp_path / "d1.db"), ffi=fake_ffi, migrations=MIGRATIONS)
    await s.open()
    for cid in (CLASS, "otherclass"):
        await s.add_cohort(id=cid, label="Class", langs=["prs"], bands=["s1"], settings={})
    yield s
    await s.close()
    if isinstance(s, D1Store):
        s.db.sqlite.close()


async def learner(store, th, cohort=CLASS):
    await store.add_learner(token_hash=th, cohort=cohort, picture="key", band="s1")
    return th


@pytest.mark.anyio
async def test_a_return_code_names_her_once(store):
    a, b = await learner(store, "a" * 64), await learner(store, "b" * 64)
    ra, rb = teacher.return_hash(CLASS, "123456"), teacher.return_hash(CLASS, "654321")
    assert ra.startswith("r:") and ra != teacher.return_hash("otherclass", "123456")
    assert await store.return_code_free(CLASS, ra)
    await store.set_reset_code(a, ra, later())
    await store.set_reset_code(b, rb, later())
    assert not await store.return_code_free(CLASS, ra) and await store.return_code_free("otherclass", ra)
    assert await store.use_return_code("otherclass", ra) == "none"         # another class has none
    assert await store.use_return_code(CLASS, ra) == a
    assert await store.use_return_code(CLASS, ra) == "wrong"               # used up; b's still counts the try
    assert await store.return_code_free(CLASS, ra)
    assert await store.use_return_code(CLASS, rb) == b
    assert await store.use_return_code(CLASS, rb) == "none"                # no live return code in the class


@pytest.mark.anyio
async def test_five_wrong_tries_end_every_return_code_of_the_class(store):
    a = await learner(store, "a" * 64)
    o = await learner(store, "o" * 64, "otherclass")
    right = teacher.return_hash(CLASS, "123456")
    await store.set_reset_code(a, right, later())
    await store.set_reset_code(o, teacher.return_hash("otherclass", "111111"), later())
    for _ in range(teacher.CODE_TRIES):
        assert await store.use_return_code(CLASS, teacher.return_hash(CLASS, "000000"), teacher.CODE_TRIES) == "wrong"
    assert await store.use_return_code(CLASS, right, teacher.CODE_TRIES) == "none"
    assert await store.use_return_code("otherclass", teacher.return_hash("otherclass", "111111")) == o


@pytest.mark.anyio
async def test_a_return_code_past_its_time_is_none(store):
    a = await learner(store, "a" * 64)
    await store.set_reset_code(a, teacher.return_hash(CLASS, "123456"), later(-1))
    assert await store.use_return_code(CLASS, teacher.return_hash(CLASS, "123456")) == "none"
    assert await store.return_code_free(CLASS, teacher.return_hash(CLASS, "123456"))


@pytest.mark.anyio
async def test_lock_codes_and_return_codes_never_touch(store):
    a, b = await learner(store, "a" * 64), await learner(store, "b" * 64)
    lock = teacher.code_hash(a, "222222")
    await store.set_reset_code(a, lock, later())                          # a lock code is not a return code
    await store.set_reset_code(b, teacher.return_hash(CLASS, "333333"), later())
    for _ in range(teacher.CODE_TRIES):
        await store.use_return_code(CLASS, teacher.return_hash(CLASS, "000000"))
    assert await store.use_reset_code(a, lock) == "ok"                    # wrong return guesses spent none of it
    await store.set_reset_code(a, teacher.return_hash(CLASS, "444444"), later())
    assert await store.use_reset_code(a, teacher.code_hash(a, "444444")) == "none"   # nor the other way
    assert await store.use_reset_code(a, teacher.code_hash(a, "000000")) == "none"
    assert await store.use_return_code(CLASS, teacher.return_hash(CLASS, "444444")) == a


@pytest.mark.anyio
async def test_progress_events_are_her_lessons_and_marks(store):
    a, b = await learner(store, "a" * 64), await learner(store, "b" * 64)
    lid = "maths-7-fractions-add"
    ev = lambda th, at, verb, obj, v: {"at": at, "token_hash": th, "cohort": CLASS,  # noqa: E731
                                       "module": events.VERBS[verb].module, "verb": verb, "object": obj, "value": v}
    await store.add_events([ev(a, minute(hours=3), "lesson.done", lid, 3), ev(a, minute(hours=2), "check.done", lid, 40),
                            ev(a, minute(hours=1), "hint.rung", f"{lid}:1", 1),
                            ev(a, minute(days=400), "lesson.done", "old", 2),        # older than events are kept
                            ev(b, minute(hours=1), "lesson.done", "x", 1)])
    got = await store.progress_events(a, minute(days=events.KEEP_DAYS))
    assert [(e["verb"], e["object"], e["value"]) for e in got] == [("lesson.done", lid, 3), ("check.done", lid, 40)]


# the routes on the village hub

@pytest.fixture
def hub(cfg):
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.pin = {"X-Teacher-Pin": teacher_pin(cfg.data)}
        yield c


def join(c, picture="key", **more):
    r = c.post("/api/join", json={"band": "s1", "lang": "en", "picture": picture,
                                  "consent": {"kind": "self", "version": c.hub.consent_version}, **more})
    assert r.status_code == 200, r.text
    return r.json()


def send_events(c, tok, evs):
    r = c.post("/api/events", headers={"X-Learner-Token": tok}, json={"events": evs})
    assert r.status_code == 200, r.text


def back(c, code, **more):
    return c.post("/api/me/return", json={"code": code, **more})


def test_her_new_phone_comes_back_with_the_teachers_code(hub):
    me, other = join(hub, picture="key"), join(hub, picture="cup")
    lid = "maths-7-fractions-add"
    send_events(hub, me["token"], [{"at": minute(hours=3), "verb": "lesson.done", "object": lid, "value": 2},
                                   {"at": minute(hours=2), "verb": "lesson.done", "object": lid, "value": 3},
                                   {"at": minute(hours=1), "verb": "lesson.done", "object": lid, "value": 1},
                                   {"at": minute(hours=2), "verb": "check.done", "object": lid, "value": 40},
                                   {"at": minute(hours=1), "verb": "check.done", "object": lid, "value": 85}])
    send_events(hub, other["token"], [{"at": minute(hours=1), "verb": "lesson.done", "object": "other-lesson", "value": 3}])
    before = hub.get("/api/m/teacher/class", headers=hub.pin).json()["learners"]
    r = hub.post(f"/api/m/teacher/class/key-{me['number']}/return-code", headers=hub.pin).json()
    assert len(r["code"]) == 6 and r["code"].isdigit() and r["minutes"] == 15
    persian = r["code"].translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
    got = back(hub, persian)
    assert got.status_code == 200, got.text
    new = got.json()
    assert new["token"] != me["token"] and (new["picture"], new["number"]) == ("key", me["number"])
    assert new["cohort"]["id"] == hub.hub.cohort_id and new["band"] == "s1" and new["consent"]["kind"] == "self"
    assert hub.get("/api/me", headers={"X-Learner-Token": me["token"]}).status_code == 401   # the lost phone's
    assert hub.get("/api/me", headers={"X-Learner-Token": other["token"]}).status_code == 200
    p = hub.get("/api/me/progress", headers={"X-Learner-Token": new["token"]}).json()
    assert p["done"] == {lid: {"stars": 3, "at": minute(hours=1)}} and p["marks"] == {lid: 85}
    assert hub.get("/api/m/teacher/class", headers=hub.pin).json()["learners"] == before   # one learner, not two
    assert back(hub, r["code"]).status_code == 410                           # once
    assert hub.get("/api/me/progress").status_code == 401


def test_a_wrong_or_missing_return_code(hub):
    me = join(hub)
    assert back(hub, "123456").status_code == 410                            # the teacher made none
    r = hub.post(f"/api/m/teacher/class/key-{me['number']}/return-code", headers=hub.pin).json()
    wrong = "000000" if r["code"] != "000000" else "111111"
    assert back(hub, wrong).status_code == 403
    assert back(hub, "12ab56").status_code == 422 and back(hub, "1234567").status_code == 422
    assert back(hub, r["code"], cohort_code="NOPE-NOPE").status_code == 404
    assert hub.post("/api/me/return", json={"code": r["code"], "token": "x"}).status_code == 422
    assert back(hub, r["code"]).status_code == 200
    assert hub.post(f"/api/m/teacher/class/key-999/return-code", headers=hub.pin).status_code == 404
    assert hub.post(f"/api/m/teacher/class/key-{me['number']}/return-code").status_code == 401


def test_a_return_code_replaces_her_lock_code_and_the_log_never_holds_it(hub):
    me = join(hub)
    lock = hub.post(f"/api/m/teacher/class/key-{me['number']}/reset-code", headers=hub.pin).json()["code"]
    r = hub.post(f"/api/m/teacher/class/key-{me['number']}/return-code", headers=hub.pin).json()
    assert hub.post("/api/me/pin-reset", headers={"X-Learner-Token": me["token"]}, json={"code": lock}).status_code == 404
    log = hub.hub.store.sync.admin_log(hub.hub.cohort_id)
    assert [x["what"] for x in log][:2] == ["teacher.return_code", "teacher.lock_code"]
    assert r["code"] not in json.dumps(log) and me["token"] not in json.dumps(log)
    assert log[0]["detail"] == f"a return code for key-{me['number']}"
    assert back(hub, r["code"]).status_code == 200


def test_the_class_code_names_the_class(hub):
    code = learners.new_class_code()
    hub.hub.store.sync.set_class_code(hub.hub.cohort_id, learners.code_hash(learners.normal_code(code)))
    me = join(hub, cohort_code=code)
    r = hub.post(f"/api/m/teacher/class/key-{me['number']}/return-code", headers=hub.pin).json()
    got = back(hub, r["code"], cohort_code=code.lower())
    assert got.status_code == 200 and got.json()["number"] == me["number"]


def test_return_tries_are_limited_per_phone(hub):
    join(hub)
    for _ in range(10):
        assert back(hub, "000000").status_code in (403, 410)
    assert back(hub, "000000").status_code == 429


# online: the teacher signs in with Access; the phone has no token, so the limit counts its address

def test_online_a_teacher_makes_a_return_code_for_her_class(online, rsa):
    from tutor_hub import staff
    asyncio.run(online.hub.store.add_staff(id_hash=staff.id_hash(PEPPER, "teacher@example.org"), label="Teacher A",
                                           role="teacher", cohorts=[STAGING], initials=""))
    me = join(online)
    assert me["cohort"]["id"] == STAGING
    access = {"Cf-Access-Jwt-Assertion": token(rsa, email="teacher@example.org"), "X-Qalam": "1"}
    r = online.post(f"/api/m/teacher/class/key-{me['number']}/return-code?cohort={STAGING}", headers=access)
    assert r.status_code == 200, r.text
    new = back(online, r.json()["code"]).json()
    assert new["number"] == me["number"] and online.get("/api/me", headers={"X-Learner-Token": me["token"]}).status_code == 401
    assert online.get("/api/me/progress", headers={"X-Learner-Token": new["token"]}).json() == {"done": {}, "marks": {}}

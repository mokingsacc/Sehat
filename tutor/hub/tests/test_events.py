"""Events without names (P4): the phones' queue, the hub's own events, and no table that could hold a person."""
import re
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from tutor_hub import events
from tutor_hub.stores import SqliteStore


def minute(**ago) -> str:
    return events.minute(datetime.now(timezone.utc) - timedelta(**ago))


def post(client, *evs, **params):
    return client.post("/api/events", params=params, json={"events": list(evs)})


def kept(client, limit=100):
    return client.portal.call(client.hub.store.events, client.hub.cohort_id, limit)


# the phone's queue

def test_a_lesson_done_offline_arrives_as_two_events(hub_client):
    start = {"at": minute(hours=26), "verb": "lesson.start", "object": "maths-1-count-5"}
    done = {"at": minute(hours=25), "verb": "lesson.done", "object": "maths-1-count-5", "value": 3}
    r = post(hub_client, start, done)
    assert r.status_code == 200 and r.json() == {"saved": 2, "expired": 0}
    rows = kept(hub_client)
    assert [(e["verb"], e["module"], e["object"], e["value"]) for e in rows] == [
        ("lesson.done", "lessons", "maths-1-count-5", 3), ("lesson.start", "lessons", "maths-1-count-5", None)]
    assert rows[0]["at"] == done["at"] and rows[0]["token_hash"] is None
    assert rows[0]["cohort"] == hub_client.hub.cohort_id


@pytest.mark.parametrize("bad", [
    {"at": minute(), "verb": "lesson.done", "object": "dari-1-sheen", "value": 2, "note": "my name is Maryam"},
    {"at": minute(), "verb": "lesson.start", "object": "Maryam from the third house"},
    {"at": minute(), "verb": "lesson.start", "object": "call-0799123456"},
    {"at": minute(), "verb": "lesson.start", "object": "dari-1-sheen", "value": 1},
    {"at": minute(), "verb": "lesson.done", "object": "dari-1-sheen", "value": 9},
    {"at": minute(), "verb": "lesson.done", "object": "dari-1-sheen", "value": "3"},
    {"at": minute(), "verb": "lesson.done", "object": "dari-1-sheen", "value": True},
    {"at": minute(), "verb": "chat.message", "object": "dari-1-sheen"},
    {"at": minute(), "verb": "print.queued", "object": "dari-1-sheen", "value": 1},       # the hub's own verb
    {"at": "yesterday", "verb": "lesson.start", "object": "dari-1-sheen"},
    {"at": "2026-02-30T10:00", "verb": "lesson.start", "object": "dari-1-sheen"},
])
def test_free_text_unknown_verbs_and_odd_shapes_are_refused(hub_client, bad):
    good = {"at": minute(), "verb": "lesson.start", "object": "dari-1-sheen"}
    r = post(hub_client, good, bad)
    assert r.status_code == 422
    assert kept(hub_client) == []            # the whole batch, the good event too


def test_batches_are_one_to_a_hundred(hub_client):
    e = {"at": minute(), "verb": "lesson.start", "object": "dari-1-sheen"}
    assert hub_client.post("/api/events", json={"events": []}).status_code == 422
    assert hub_client.post("/api/events", json={"events": [e] * 101}).status_code == 422
    assert hub_client.post("/api/events", json={"events": [e], "who": "x"}).status_code == 422
    assert post(hub_client, *[e] * 100).json()["saved"] == 100


def test_clocks_running_fast_or_far_behind(hub_client):
    future = {"at": minute(days=-3), "verb": "lesson.start", "object": "dari-1-sheen"}
    ancient = {"at": minute(days=events.KEEP_DAYS + 1), "verb": "lesson.start", "object": "dari-1-sheen"}
    assert post(hub_client, future, ancient).json() == {"saved": 1, "expired": 1}
    assert kept(hub_client)[0]["at"] <= events.minute()


def test_events_go_to_the_cohort_named(hub_client):
    e = {"at": minute(), "verb": "lesson.start", "object": "dari-1-sheen"}
    assert post(hub_client, e, cohort="nosuchcohort").status_code == 404
    other = hub_client.hub.seeds["open"]["id"]
    assert post(hub_client, e, cohort=other).status_code == 200
    assert kept(hub_client) == []
    assert len(hub_client.portal.call(hub_client.hub.store.events, other)) == 1


def test_one_phone_cannot_flood_events(hub_client):
    e = {"at": minute(), "verb": "lesson.start", "object": "dari-1-sheen"}
    for _ in range(30):
        assert post(hub_client, e).status_code == 200
    assert post(hub_client, e).status_code == 429


# the hub's own events

def test_ask_print_check_and_review_write_events(hub_client):
    a = hub_client.post("/api/ask", json={"text": "۱/۲ + ۱/۴ چند می‌شود؟", "lang": "prs"}).json()
    w = hub_client.post("/api/ask", json={"text": "زلزله چرا می‌آید؟", "lang": "prs",
                                          "lesson": "maths-7-fractions-add"}).json()
    hub_client.post(f"/api/ask/{a['id']}/teacher")
    hub_client.post("/api/print", json={"lesson": "maths-1-count-5", "copies": 2, "name": "Maryam"})
    hub_client.get("/api/sheets/maths-7-fractions-add/key?seed=4821")
    pin = {"X-Teacher-Pin": hub_client.pin}
    q = {x["question"]: x["id"] for x in hub_client.get("/api/teacher/queue", headers=pin).json()["questions"]}
    hub_client.post(f"/api/teacher/answer/{q['زلزله چرا می‌آید؟']}", headers=pin, json={"answer": "...", "approve": True})
    hub_client.hub.prints.wait()
    rows = list(reversed(kept(hub_client)))
    assert [(e["module"], e["verb"], e["object"], e["value"]) for e in rows] == [
        ("ask", "ask.answered", "maths", None), ("ask", "ask.answered", "none", None),
        ("ask", "ask.to_teacher", None, None), ("print", "print.queued", "maths-1-count-5", 2),
        ("check", "check.key", "maths-7-fractions-add", None),
        ("teacher", "review.approved", "maths-7-fractions-add", None)]
    flat = str(rows)
    assert "Maryam" not in flat and "زلزله" not in flat and a["id"] not in flat and w["id"] not in flat


def test_an_event_that_fails_never_breaks_the_route(hub_client, monkeypatch):
    async def broken(rows):
        raise RuntimeError("disk full")
    monkeypatch.setattr(hub_client.hub.store, "add_events", broken)
    assert hub_client.post("/api/ask", json={"text": "۱ + ۱", "lang": "prs"}).status_code == 200


def test_every_verb_names_a_real_module(hub_client):
    assert {v.module for v in events.VERBS.values()} <= set(hub_client.hub.modules)


# no table can hold a person

FORBIDDEN = {"name", "names", "nickname", "firstname", "surname", "fullname", "sex", "gender", "girl", "boy",
             "birth", "birthday", "birthdate", "dob", "born", "age", "phone", "mobile", "msisdn", "tel", "telephone",
             "address", "addr", "street", "house", "village", "location", "gps", "lat", "lon", "email", "photo",
             "image", "audio", "school"}


def words(column: str) -> list[str]:
    return [w for w in re.split(r"[^a-z]+", re.sub(r"([a-z])([A-Z])", r"\1_\2", column).lower()) if w]


async def _columns(tmp_path):
    s = SqliteStore(tmp_path / "hub.db")
    await s.open()
    await s.close()
    db = sqlite3.connect(tmp_path / "hub.db")
    try:
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' "
                                           "AND name NOT LIKE 'sqlite_%'")]
        return {t: [r[1] for r in db.execute(f"PRAGMA table_info({t})")] for t in tables}
    finally:
        db.close()


@pytest.mark.anyio
async def test_no_column_could_hold_a_name_sex_birth_date_phone_or_address(tmp_path):
    cols = await _columns(tmp_path)
    assert "events" in cols
    bad = [f"{t}.{c}" for t, cs in cols.items() for c in cs if set(words(c)) & FORBIDDEN]
    assert bad == []


@pytest.mark.anyio
async def test_events_have_exactly_their_columns(tmp_path):
    cols = await _columns(tmp_path)
    assert cols["events"] == ["id", "at", "token_hash", "cohort", "module", "verb", "object", "value"]


def test_the_scan_would_catch_one():
    assert set(words("learner_name")) & FORBIDDEN and set(words("dateOfBirth")) & FORBIDDEN
    assert set(words("phone_no")) & FORBIDDEN and set(words("home_address")) & FORBIDDEN
    assert not set(words("changed_at")) & FORBIDDEN and not set(words("pages")) & FORBIDDEN

"""The privacy suite (P24, BUILD-PLAN 8, the pilot gate): every table has a retention rule and the daily retention job
keeps it; the wishlist keeps no trace of who typed a wish; a lock reset code is kept only as a hash, for 15 minutes,
and goes with her. The rest of the suite lives beside what it guards: the schema scan for name-like columns and the
event shapes (test_events.py), photo writes (test_photo.py, test_worker.py), names in logs (test_api.py), the gateway's
recorder scans (test_gateway.py). The Worker's cron runs the same prune on D1 (test_worker.py). No network."""
import asyncio
import logging
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from tutor_hub import learners
from tutor_hub.mods import teacher
from tutor_hub.server import create_app, teacher_pin

# every table, and how long its rows live (BUILD-PLAN 3.4). A new table must be added here, with its rule.
RETENTION = {
    "questions": "TUTOR_KEEP_DAYS (60 days); an approved answer is copied to `approved` without the learner",
    "ladders": "with its question (TUTOR_KEEP_DAYS)",
    "prints": "TUTOR_KEEP_DAYS",
    "reset_codes": "until used, five wrong tries or 15 minutes; then the next prune; with the learner",
    "wishlist": "90 days after it was last asked for",
    "events": "12 months; with the learner",
    "learners": "12 months unseen, or when she deletes herself",
    "ai_usage": "2 years (counts only)",
    "flag_log": "2 years",
    "admin_log": "2 years",
    "approved": "for good: reviewed answers, no learner in them",
    "cohorts": "for good: classes, no learner in them",
    "flags": "for good: one row per module and cohort",
    "signoffs": "for good: initials and roles",
    "releases": "for good: pack versions and roles",
    "staff": "until the admin removes them: a peppered hash, a neutral label",
    "review_notes": "for good: comments on content, not on people",
    "schema_migrations": "for good: migration ids",
    "certificates": "for good: a pathway, its version, a month and a cohort; no learner in them (C4.2)",
    "daily_counts": "two days (today and yesterday); with the learner (C4.9)",
    "made": "60 days after it was sent or decided, whichever is later; with the learner (C4.8)",
    "ai_prices": "until the admin changes it: a provider, a model and two prices; no learner in them (C5)",
    "live_sessions": "12 months: a class held, its subject, its host's staff label and counts; its state is blanked when "
                     "it ends, and it ends once its teacher is quiet for 10 minutes (C6.1)",
    "live_present": "while the class runs: deleted when it ends, when she leaves, with her, and after 6 hours (C6.1)",
    "meta": "for good: the server's own id (W4); no learner in it",
}

OLD, OLD_DAY = "2020-01-01T00:00:00+00:00", "2020-01-01"


@pytest.fixture
def hub(cfg):
    with TestClient(create_app(cfg)) as c:
        c.hub = c.app.state.hub
        c.pin = {"X-Teacher-Pin": teacher_pin(cfg.data)}
        yield c


def sql(c, query, args=()):
    s = c.hub.store.sync
    with s.lock:
        return [tuple(r) for r in s.db.execute(query, args)]


def join(c, picture="key", lang="en"):
    r = c.post("/api/join", json={"band": "s1", "lang": lang, "picture": picture,
                                  "consent": {"kind": "self", "version": c.hub.consent_version}})
    assert r.status_code == 200, r.text
    return r.json()


def test_every_table_has_a_retention_rule(hub):
    tables = {r[0] for r in sql(hub, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    assert tables == set(RETENTION), (tables - set(RETENTION), set(RETENTION) - tables)


def test_the_retention_job_deletes_what_is_past_its_time_and_keeps_the_rest(hub):
    now = datetime.now(timezone.utc)
    recent, day = now.isoformat(timespec="seconds"), now.strftime("%Y-%m-%d")
    later = (now + timedelta(minutes=10)).isoformat(timespec="seconds")
    cid = hub.hub.cohort_id
    rows = {   # table: (insert, the old row's values, the recent row's values)
        "questions": ("INSERT INTO questions(token, created, question, status) VALUES(?,?,'q','answered')",
                      ("q-old", OLD), ("q-new", recent)),
        "ladders": ("INSERT INTO ladders(token, solution, sure, created) VALUES(?,'1/2',1,?)",
                    ("q-old", OLD), ("q-new", recent)),
        "prints": ("INSERT INTO prints(device, created, status) VALUES(?,?,'done')", ("p-old", OLD), ("p-new", recent)),
        "reset_codes": ("INSERT INTO reset_codes(token_hash, code_hash, expires) VALUES(?,'h',?)",
                        ("r-old", OLD), ("r-new", later)),
        "wishlist": ("INSERT INTO wishlist(cohort, band, lang, wish, wkey, first_day, last_day) "
                     "VALUES(?,'s1','en','w',?,?,?)", (cid, "w-old", OLD_DAY, OLD_DAY), (cid, "w-new", day, day)),
        "events": ("INSERT INTO events(token_hash, at, cohort, module, verb) VALUES(?,?,?,'lessons','lesson.done')",
                   ("e-old", OLD[:16], cid), ("e-new", recent[:16], cid)),
        "learners": ("INSERT INTO learners(token_hash, cohort, picture, number, band, joined, last_seen) "
                     "VALUES(?,?,'key',?,'s1',?,?)", ("l-old", cid, 901, OLD_DAY, OLD_DAY),
                     ("l-new", cid, 902, day, day)),
        "ai_usage": ("INSERT INTO ai_usage(day, cohort, module, purpose, provider, model) "
                     "VALUES(?,?,'ask','explain','fake',?)", (OLD_DAY, cid, "m-old"), (day, cid, "m-new")),
        "flag_log": ("INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at) "
                     "VALUES(?,?,1,'{}','admin',?)", ("f-old", cid, OLD), ("f-new", cid, recent)),
        "admin_log": ("INSERT INTO admin_log(what, at, changed_by) VALUES(?,?,'admin:a')",
                      ("a-old", OLD), ("a-new", recent)),
        "daily_counts": ("INSERT INTO daily_counts(token_hash, day, module, n) VALUES(?,?,'photo',1)",
                         ("d-old", (now - timedelta(days=2)).strftime("%Y-%m-%d")), ("d-new", day)),
        "made": ("INSERT INTO made(cohort, token_hash, kind, body, lang, at) VALUES(?,?,'question','{}','en',?)",
                 (cid, "m-old", OLD), (cid, "m-new", recent)),
    }
    for insert, old, new in rows.values():
        sql(hub, insert, old)
        sql(hub, insert, new)
    sql(hub, "INSERT INTO events(token_hash, at, cohort, module, verb) VALUES('l-old',?,?,'lessons','lesson.done')",
        (recent[:16], cid))                             # a recent event of an idle learner goes with her
    sql(hub, "INSERT INTO reset_codes(token_hash, code_hash, expires) VALUES('l-old','h',?)", (later,))
    sql(hub, "INSERT INTO daily_counts(token_hash, day, module, n) VALUES('l-old',?,'cert',1)", (day,))
    sql(hub, "INSERT INTO made(cohort, token_hash, kind, body, lang, at) VALUES(?,'l-old','question','{}','en',?)",
        (cid, recent))                                  # what an idle learner made goes with her too
    hub.portal.call(hub.hub.prune)
    key = {"questions": "token", "ladders": "token", "prints": "device", "reset_codes": "token_hash", "wishlist": "wkey",
           "events": "token_hash", "learners": "token_hash", "ai_usage": "model", "flag_log": "module",
           "admin_log": "what", "daily_counts": "token_hash", "made": "token_hash"}
    for table, (_, old, new) in rows.items():
        left = {r[0] for r in sql(hub, f"SELECT {key[table]} FROM {table}")}
        i = {"wishlist": 1, "ai_usage": 2, "made": 1}.get(table, 0)              # where the row's marker is in its values
        assert old[i] not in left and new[i] in left, table
    assert sql(hub, "SELECT COUNT(*) FROM events WHERE token_hash='l-old'") == [(0,)]
    assert sql(hub, "SELECT COUNT(*) FROM reset_codes WHERE token_hash='l-old'") == [(0,)]
    assert sql(hub, "SELECT COUNT(*) FROM daily_counts WHERE token_hash='l-old'") == [(0,)]
    assert sql(hub, "SELECT COUNT(*) FROM made WHERE token_hash='l-old'") == [(0,)]


@pytest.mark.anyio
async def test_the_retention_loop_prunes_each_day_and_a_failure_never_stops_it(cfg):
    app = create_app(cfg)
    hub = app.state.hub
    runs = []

    async def prune():
        runs.append(1)
        if len(runs) == 1:
            raise sqlite3.OperationalError("database is locked")

    hub.prune = prune
    task = asyncio.create_task(hub.retention_loop(every_s=0.01))
    for _ in range(200):
        await asyncio.sleep(0.01)
        if len(runs) >= 3:
            break
    task.cancel()
    assert len(runs) >= 3                                # the locked day was logged and the next days ran


def test_a_wish_keeps_no_trace_of_who_typed_it(hub, caplog):
    caplog.set_level(logging.DEBUG)
    me = join(hub)
    text = "My name is Karim, karim.n@example.com, 0799123456, and I want chemistry"
    r = hub.post("/api/m/plan", json={"goal": text, "lang": "en", "band": "s1"},
                 headers={"X-Learner-Token": me["token"]})
    assert r.json() == {"kind": "wish", "saved": True}
    [w] = hub.hub.store.sync.wishes()
    assert "chemistry" in w["wish"]
    for bit in ("Karim", "karim", "example.com", "0799123456"):
        assert bit not in w["wish"] and bit not in w["wkey"]
    th = learners.token_hash(me["token"])
    dump = repr(sql(hub, "SELECT * FROM wishlist"))
    assert me["token"] not in dump and th not in dump and "testclient" not in dump
    assert [c[1] for c in sql(hub, "PRAGMA table_info(wishlist)")] == [
        "cohort", "band", "lang", "wish", "wkey", "count", "first_day", "last_day", "status"]
    assert not any("chemistry" in repr(r) for r in sql(hub, "SELECT * FROM events"))      # no event holds the text
    assert "chemistry" not in caplog.text and "0799123456" not in caplog.text            # nor does the log
    seen = hub.get("/api/m/teacher/wishes", headers=hub.pin).json()["wishes"]
    assert seen and th not in repr(seen) and me["token"] not in repr(seen)


def test_a_reset_code_is_kept_as_a_hash_for_15_minutes_and_goes_with_her(hub, caplog):
    caplog.set_level(logging.DEBUG)
    me, other = join(hub, "key"), join(hub, "cup")
    th = learners.token_hash(me["token"])
    code = hub.post(f"/api/m/teacher/class/key-{me['number']}/reset-code", headers=hub.pin).json()["code"]
    [(row_hash, code_hash, expires, tries)] = sql(hub, "SELECT * FROM reset_codes")
    assert row_hash == th and code_hash == teacher.code_hash(th, code) and code not in (row_hash, code_hash)
    left = datetime.fromisoformat(expires) - datetime.now(timezone.utc)
    assert timedelta(minutes=14) < left <= timedelta(minutes=15) and tries == 0
    assert code not in caplog.text
    assert hub.delete("/api/me", headers={"X-Learner-Token": me["token"]}).json() == {"deleted": True}
    assert sql(hub, "SELECT * FROM reset_codes") == []                        # deleted with her
    hub.post(f"/api/m/teacher/class/cup-{other['number']}/reset-code", headers=hub.pin)
    sql(hub, "UPDATE reset_codes SET expires=?", (OLD,))
    hub.portal.call(hub.hub.prune)
    assert sql(hub, "SELECT * FROM reset_codes") == []                        # an expired code goes at the next prune

"""Seats and clocks, the server's half (W4, WEBSITE.md 3.3 to 3.5): `hello.id`, the same for every hostname of one
database and made once; `hello.now`; `/api/me/merge` folding a learner's second record on one server into her
first, which re-keys every table with a `token_hash` column (the list is read from the migrations here, so a later
table cannot be forgotten); and `/api/me/token`, a new token for the same learner."""
import re
import sqlite3
import time

import pytest
from fastapi.testclient import TestClient

from fakes.d1 import FakeD1, ffi as fake_ffi
from tutor_hub import learners
from tutor_hub.server import create_app
from tutor_hub.stores import D1Store, SqliteStore
from tutor_hub.stores.base import TOKEN_TABLES
from tutor_hub.stores.sqlite import MIGRATIONS

AGREED = {"kind": "guardian-on-phone", "version": "hub-2026-10b", "at": "2026-10-16T09:41"}


def token_columns() -> set[str]:
    """Every table the migrations make with a token_hash column, read from a database they built."""
    db = sqlite3.connect(":memory:")
    from tutor_hub.stores.migrations import migration_files, statements
    for f in migration_files(MIGRATIONS):
        for st in statements(f.read_text(encoding="utf-8")):
            db.execute(st)
    tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    return {t for t in tables if any(c[1] == "token_hash" for c in db.execute(f"PRAGMA table_info({t})"))}


def test_every_table_with_a_token_hash_is_moved_by_a_merge_and_a_new_token():
    assert set(TOKEN_TABLES) == token_columns()
    assert TOKEN_TABLES["learners"] == "row" and TOKEN_TABLES["daily_counts"] == "sum"


# the stores: SQLite and D1 (the fake), each filled through raw SQL so a new table is filled without a test change

def raw(store):
    """The database underneath, through a connection of the test's own (the D1 fake refuses PRAGMA, as D1 does)."""
    return sqlite3.connect(store.path_for_test)


def fill(db, table, th, n=1):
    """One row of `table` for the token hash `th`, every other column made up from its type."""
    cols = list(db.execute(f"PRAGMA table_info({table})"))
    names, vals = [], []
    for _, name, typ, notnull, default, pk in cols:
        if name == "token_hash":
            v = th
        elif name == "n":
            v = n
        elif name == "id" and "INT" in (typ or "").upper():
            continue
        elif name == "cohort":
            v = "d6co6etep6"
        elif "INT" in (typ or "").upper():
            v = 1
        else:
            v = f"{name}-x" if name not in ("day", "joined", "last_seen") else "2026-10-17"
        names.append(name)
        vals.append(v)
    db.execute(f"INSERT INTO {table}({', '.join(names)}) VALUES({', '.join('?' * len(vals))})", vals)
    db.commit()


def rows(db, table, th):
    return list(db.execute(f"SELECT * FROM {table} WHERE token_hash=?", (th,)))


@pytest.fixture(params=["sqlite", "d1"])
async def store(request, tmp_path):
    s = SqliteStore(tmp_path / "hub.db") if request.param == "sqlite" else \
        D1Store(FakeD1(tmp_path / "d1.db"), ffi=fake_ffi, migrations=MIGRATIONS)
    s.path_for_test = tmp_path / ("hub.db" if request.param == "sqlite" else "d1.db")
    await s.open()
    await s.add_cohort(id="d6co6etep6", label="Class", langs=["prs"], bands=["s1"], settings={})
    yield s
    await s.close()
    if isinstance(s, D1Store):
        s.db.sqlite.close()


@pytest.mark.anyio
async def test_a_merge_moves_every_row_of_every_token_table_to_the_older_learner(store):
    keep, drop = "a" * 64, "b" * 64
    for th, joined in ((keep, "2026-09-01"), (drop, "2026-10-01")):
        await store.add_learner(token_hash=th, cohort="d6co6etep6", picture="key", band="s1")
    db = raw(store)
    for table in TOKEN_TABLES:
        if table == "learners":
            continue
        fill(db, table, drop, n=3)
        if TOKEN_TABLES[table] != "move":
            fill(db, table, keep, n=4)                     # the same key on both: summed, or the kept one stays
    before = {t: len(rows(db, t, keep)) + len(rows(db, t, drop)) for t in TOKEN_TABLES if TOKEN_TABLES[t] == "move"}
    assert await store.merge_learners(keep, drop, consent_kind="self", consent_version="hub-2026-10b",
                                      consent_at="2026-10-16T09:41")
    for table, rule in TOKEN_TABLES.items():
        assert rows(db, table, drop) == [], table
        if rule == "move":
            assert len(rows(db, table, keep)) == before[table], table
        elif rule == "sum":
            assert [r[-1] for r in db.execute(f"SELECT n FROM {table} WHERE token_hash=?", (keep,))] == [7]
        else:
            assert len(rows(db, table, keep)) == 1, table
    assert (await store.learner(keep))["consent_kind"] == "self" and await store.learner(drop) is None
    assert not await store.merge_learners(keep, drop)              # done already: nothing to fold
    assert not await store.merge_learners(keep, keep)


@pytest.mark.anyio
async def test_a_new_token_moves_every_row_and_the_old_hash_finds_nothing(store):
    old, new = "c" * 64, "d" * 64
    await store.add_learner(token_hash=old, cohort="d6co6etep6", picture="key", band="s1")
    db = raw(store)
    for table in TOKEN_TABLES:
        if table != "learners":
            fill(db, table, old)
    assert await store.rekey_learner(old, new)
    for table in TOKEN_TABLES:
        assert rows(db, table, old) == [] and len(rows(db, table, new)) == 1, table
    assert not await store.rekey_learner(old, "e" * 64)


@pytest.mark.anyio
async def test_the_server_id_is_made_once_and_kept(store):
    first = await store.server_id()
    assert re.fullmatch(r"[0-9a-f]{20}", first)
    assert await store.server_id() == first


# the API

def hub_at(cfg):
    return TestClient(create_app(cfg))


def test_hello_names_this_database_and_its_time(cfg, tmp_path):
    with hub_at(cfg) as c:
        h = c.get("/api/hello").json()
        assert re.fullmatch(r"[0-9a-f]{20}", h["id"]) and abs(h["now"] - time.time() * 1000) < 5000
        # another hostname of the same database answers with the same id
        assert c.get("/api/hello", headers={"host": "qalam.example"}).json()["id"] == h["id"]
    with hub_at(cfg) as c:                                         # a restart keeps it
        assert c.get("/api/hello").json()["id"] == h["id"]
    cfg.data = tmp_path / "another"
    with hub_at(cfg) as c:                                         # another database has its own
        assert c.get("/api/hello").json()["id"] != h["id"]


def join(c, **body):
    j = c.post("/api/join", json={"band": "s1", "lang": "prs", "picture": "book", "consent": AGREED, **body}).json()
    return j["token"], {"X-Learner-Token": j["token"]}


def counts(c, token):
    th = learners.token_hash(token)
    db = c.hub.store.sync
    with db.lock:
        return (db.db.execute("SELECT COUNT(*) FROM events WHERE token_hash=?", (th,)).fetchone()[0],
                db.db.execute("SELECT COALESCE(SUM(n), 0) FROM daily_counts WHERE token_hash=?", (th,)).fetchone()[0])


def test_two_records_of_one_learner_fold_into_the_older(hub_client):
    c = hub_client
    first, h1 = join(c)
    with c.hub.store.sync.lock:                                    # she joined here a month before her second phone
        c.hub.store.sync.db.execute("UPDATE learners SET joined='2026-09-01' WHERE token_hash=?",
                                    (learners.token_hash(first),))
    second, h2 = join(c)
    ev = {"events": [{"at": time.strftime("%Y-%m-%dT%H:%M", time.gmtime()), "verb": "lesson.start",
                      "object": "maths-7-fractions-add"}]}
    assert c.post("/api/events", json=ev, headers=h1).status_code == 200
    assert c.post("/api/events", json=ev, headers=h2).status_code == 200
    for th in (first, second):
        c.hub.store.sync.count_today(learners.token_hash(th), "ask")
    kept = c.post("/api/me/merge", json={"other": first}, headers=h2)   # asked from the newer phone
    assert kept.status_code == 200 and kept.json()["kept"] == "other"
    assert kept.json()["number"] == c.get("/api/me", headers=h1).json()["number"]
    assert counts(c, first) == (2, 2) and counts(c, second) == (0, 0)  # the day's budget is summed, never reset
    assert c.get("/api/me", headers=h2).status_code == 401           # the folded token is gone
    # asked again from either side: done already
    assert c.post("/api/me/merge", json={"other": second}, headers=h1).json()["kept"] == "this"
    assert c.post("/api/me/merge", json={"other": first}, headers=h2).status_code == 401


def test_learners_in_different_classes_are_not_merged(hub_client):
    c = hub_client
    other = c.hub.seeds["open"]["id"]
    code = learners.new_class_code()
    c.portal.call(c.hub.store.set_class_code, other, learners.code_hash(learners.normal_code(code)))
    a, ha = join(c)
    b, hb = join(c, cohort_code=code)
    assert c.post("/api/me/merge", json={"other": b}, headers=ha).status_code == 409
    assert c.get("/api/me", headers=hb).status_code == 200 and c.get("/api/me", headers=ha).status_code == 200


def test_merges_and_new_tokens_are_five_a_day(hub_client):
    c = hub_client
    a, ha = join(c)
    for _ in range(5):
        assert c.post("/api/me/merge", json={"other": a}, headers=ha).status_code == 200
    assert c.post("/api/me/merge", json={"other": a}, headers=ha).status_code == 429


def test_a_new_token_keeps_her_record_and_the_old_one_dies(hub_client):
    c = hub_client
    old, h = join(c)
    ev = {"events": [{"at": time.strftime("%Y-%m-%dT%H:%M", time.gmtime()), "verb": "lesson.start",
                      "object": "maths-7-fractions-add"}]}
    c.post("/api/events", json=ev, headers=h)
    number = c.get("/api/me", headers=h).json()["number"]
    new = c.post("/api/me/token", headers=h).json()["token"]
    assert learners.TOKEN.match(new) and new != old
    assert c.get("/api/me", headers=h).status_code == 401
    assert c.get("/api/me", headers={"X-Learner-Token": new}).json()["number"] == number
    assert counts(c, new)[0] == 1 and counts(c, old)[0] == 0
    assert c.post("/api/me/token").status_code == 401

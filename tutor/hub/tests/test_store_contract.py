"""The store contract (stores/base.py), run against every store: the hub's SQLite and D1 (through the fake in
tests/fakes/d1.py, SQLite behind D1's call shape).

Also the migrations, the same files through the same mechanism (stores/migrations.py) on both: a fresh database and
one made by the hub's code before migrations end with the same tables, SQLite and D1 end with the same tables, and
running them again changes nothing. And the fake itself, which must be as strict as D1.
"""
import asyncio
import re
import sqlite3
import pytest

from fakes.d1 import JS_NULL, FakeD1, JsArray, JsException, ffi as fake_ffi
from tutor_hub.stores import D1Store, SqliteStore
from tutor_hub.stores.migrations import statements
from tutor_hub.stores.sqlite import MIGRATIONS, migrate, migration_files

pytestmark = pytest.mark.anyio

# the schema exactly as the hub's code wrote it before migrations (store.py, October 2026)
LEGACY_SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS questions(
  id INTEGER PRIMARY KEY, token TEXT UNIQUE NOT NULL, created TEXT NOT NULL,
  lang TEXT, subject TEXT, year INTEGER, lesson_id TEXT, question TEXT NOT NULL, answer TEXT, source TEXT,
  urgent INTEGER DEFAULT 0, to_teacher INTEGER DEFAULT 0, status TEXT NOT NULL, teacher_answer TEXT, reviewed TEXT
);
CREATE INDEX IF NOT EXISTS questions_status ON questions(status, to_teacher);
CREATE TABLE IF NOT EXISTS approved(
  id INTEGER PRIMARY KEY, created TEXT NOT NULL, lang TEXT NOT NULL, subject TEXT, year INTEGER, lesson_id TEXT,
  question TEXT NOT NULL, answer TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prints(
  id INTEGER PRIMARY KEY, created TEXT NOT NULL, lesson_id TEXT, kind TEXT, copies INTEGER, lang TEXT, seed INTEGER,
  pages INTEGER, status TEXT NOT NULL, detail TEXT, device TEXT
);
"""


def shape(path) -> dict:
    """Every table and index with its columns: what "the same tables" means."""
    db = sqlite3.connect(path)
    try:
        out = {}
        for kind, name in db.execute("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' "
                                     "ORDER BY name"):
            if kind == "table":
                cols = [tuple(r[1:]) for r in db.execute(f"PRAGMA table_info({name})")]
            else:
                cols = [r[2] for r in db.execute(f"PRAGMA index_info({name})")]
            out[name] = (kind, cols)
        return out
    finally:
        db.close()


def make_sqlite(tmp_path):
    return SqliteStore(tmp_path / "hub.db")


def make_d1(tmp_path, folder=MIGRATIONS, db=None):
    return D1Store(db or FakeD1(tmp_path / "d1.db"), ffi=fake_ffi, migrations=folder)


STORES = {"sqlite": make_sqlite, "d1": make_d1}


@pytest.fixture(params=sorted(STORES))
async def store(request, tmp_path):
    s = STORES[request.param](tmp_path)
    await s.open()
    yield s
    await s.close()
    if isinstance(s, D1Store):
        s.db.sqlite.close()


async def ask(store, text="?", *, waiting=False, urgent=False, source="bank", answer="an answer"):
    return await store.add_question(lang="prs", subject="maths", year=7, lesson_id="maths-7-fractions-add",
                                    question=text, answer=answer, source=source, urgent=urgent, waiting=waiting)


# migrations

def test_migration_files_are_plain_sql_that_d1_runs_too():
    files = migration_files()
    assert files and files[0].name == "0001_init.sql"
    for f in files:
        sql = re.sub(r"--[^\n]*", "", f.read_text(encoding="utf-8")).upper()     # comments may say anything
        assert "PRAGMA" not in sql and "BEGIN" not in sql and "COMMIT" not in sql, f.name
        assert sql.count("CREATE TABLE ") == sql.count("CREATE TABLE IF NOT EXISTS "), f.name
        assert sql.count("CREATE INDEX ") == sql.count("CREATE INDEX IF NOT EXISTS "), f.name


async def test_fresh_and_old_databases_end_the_same(tmp_path):
    (tmp_path / "old").mkdir()
    old = tmp_path / "old" / "hub.db"
    db = sqlite3.connect(old)
    db.executescript(LEGACY_SCHEMA)
    db.execute("INSERT INTO approved(created, lang, question, answer) VALUES('2026-10-01T00:00:00+00:00', 'prs', "
               "'q', 'a')")
    db.commit()
    db.close()
    for path in (old, tmp_path / "fresh.db"):
        s = SqliteStore(path)
        await s.open()
        await s.close()
    assert shape(old) == shape(tmp_path / "fresh.db")
    s = SqliteStore(old)                    # what the old hub kept is still there
    await s.open()
    assert [r["answer"] for r in await s.approved()] == ["a"]
    await s.close()


async def test_running_the_migrations_again_changes_nothing(tmp_path):
    path = tmp_path / "hub.db"
    s = SqliteStore(path)
    await s.open()
    await s.close()
    before = shape(path)
    db = sqlite3.connect(path)
    first = db.execute("SELECT id, applied_at FROM schema_migrations ORDER BY id").fetchall()
    assert [r[0] for r in first] == [f.stem for f in migration_files()]
    assert migrate(db, MIGRATIONS) == []
    db.close()
    s = SqliteStore(path)
    await s.open()
    await s.close()
    assert shape(path) == before
    db = sqlite3.connect(path)
    assert db.execute("SELECT id, applied_at FROM schema_migrations ORDER BY id").fetchall() == first
    db.close()


def test_a_failed_migration_leaves_no_trace(tmp_path):
    folder = tmp_path / "migrations"
    folder.mkdir()
    (folder / "0001_init.sql").write_text("CREATE TABLE IF NOT EXISTS a(x);", encoding="utf-8")
    (folder / "0002_broken.sql").write_text("CREATE TABLE IF NOT EXISTS b(x);\nNOT SQL AT ALL;", encoding="utf-8")
    db = sqlite3.connect(tmp_path / "hub.db", isolation_level=None)
    with pytest.raises(sqlite3.Error):
        migrate(db, folder)
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "a" in tables and "b" not in tables
    assert [r[0] for r in db.execute("SELECT id FROM schema_migrations")] == ["0001_init"]
    db.close()


def test_badly_named_migrations_are_refused(tmp_path):
    (tmp_path / "init.sql").write_text("SELECT 1;", encoding="utf-8")
    with pytest.raises(ValueError):
        migration_files(tmp_path)


def test_a_migration_splits_into_statements_without_comments():
    sql = """-- a comment; with a semicolon
    CREATE TABLE IF NOT EXISTS a(x TEXT DEFAULT 'one; -- two', "y;z" INTEGER); /* also; a comment */
    INSERT INTO a(x) VALUES('it''s; fine');
    """
    assert statements(sql) == ["CREATE TABLE IF NOT EXISTS a(x TEXT DEFAULT 'one; -- two', \"y;z\" INTEGER)",
                               "INSERT INTO a(x) VALUES('it''s; fine')"]
    for bad in ("PRAGMA foreign_keys=OFF;", "BEGIN; CREATE TABLE a(x); COMMIT;", "SELECT 'open",
                "CREATE TRIGGER t AFTER INSERT ON a BEGIN SELECT 1; END;"):
        with pytest.raises(ValueError):
            statements(bad)
    for f in migration_files():                     # every real file splits into complete statements
        assert all(sqlite3.complete_statement(x + ";") for x in statements(f.read_text(encoding="utf-8"))), f.name


async def test_sqlite_and_d1_end_with_the_same_tables(tmp_path):
    hub, d1 = make_sqlite(tmp_path), make_d1(tmp_path)
    for s in (hub, d1):
        await s.open()
        await s.close()
    d1.db.sqlite.close()
    assert shape(tmp_path / "hub.db") == shape(tmp_path / "d1.db")
    ids = [f.stem for f in migration_files()]
    for path in ("hub.db", "d1.db"):
        db = sqlite3.connect(tmp_path / path)
        assert [r[0] for r in db.execute("SELECT id FROM schema_migrations ORDER BY id")] == ids
        db.close()


async def test_d1_migrations_run_from_empty_and_again_without_harm(tmp_path):
    db = FakeD1(tmp_path / "d1.db")
    await make_d1(tmp_path, db=db).open()
    before = shape(tmp_path / "d1.db")
    first = db.sqlite.execute("SELECT id, applied_at FROM schema_migrations ORDER BY id").fetchall()
    assert [r[0] for r in first] == [f.stem for f in migration_files()]
    queries = db.queries
    again = make_d1(tmp_path, db=db)                 # a new Worker isolate on the same database
    await again.open()
    await again.open()                               # and opening twice is once
    assert db.queries - queries == 2                 # the ledger's CREATE IF NOT EXISTS and one read: nothing applied
    assert shape(tmp_path / "d1.db") == before
    assert db.sqlite.execute("SELECT id, applied_at FROM schema_migrations ORDER BY id").fetchall() == first
    db.sqlite.close()


async def test_d1_a_failed_migration_leaves_no_trace(tmp_path):
    folder = tmp_path / "migrations"
    folder.mkdir()
    (folder / "0001_init.sql").write_text("CREATE TABLE IF NOT EXISTS a(x);", encoding="utf-8")
    (folder / "0002_broken.sql").write_text("CREATE TABLE IF NOT EXISTS b(x);\nNOT SQL AT ALL;", encoding="utf-8")
    db = FakeD1(tmp_path / "d1.db")
    with pytest.raises(JsException):
        await make_d1(tmp_path, folder, db).open()
    tables = {r[0] for r in db.sqlite.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "a" in tables and "b" not in tables
    assert [r[0] for r in db.sqlite.execute("SELECT id FROM schema_migrations")] == ["0001_init"]
    db.sqlite.close()


async def test_two_workers_opening_at_once_apply_each_migration_once(tmp_path):
    db = FakeD1(tmp_path / "d1.db")
    await asyncio.gather(*(make_d1(tmp_path, db=db).open() for _ in range(3)))
    ids = [r[0] for r in db.sqlite.execute("SELECT id FROM schema_migrations ORDER BY id")]
    assert ids == [f.stem for f in migration_files()]
    db.sqlite.close()


async def test_d1_exec_splits_at_newlines_so_migrations_go_in_batches(tmp_path):
    db = FakeD1()
    with pytest.raises(JsException):                 # a CREATE TABLE over several lines is cut at the first newline
        await db.exec(migration_files()[0].read_text(encoding="utf-8"))
    r = await db.exec("CREATE TABLE IF NOT EXISTS a(x)\nINSERT INTO a VALUES(1)\n\nINSERT INTO a VALUES(2)")
    assert r.count == 3 and db.sqlite.execute("SELECT COUNT(*) FROM a").fetchone()[0] == 2


# questions

async def test_a_question_is_kept_by_token_without_a_name(store):
    token = await ask(store, "مخرج مشترک چیست؟")
    assert len(token) == 16 and token != await ask(store)
    q = await store.question(token)
    assert q["question"] == "مخرج مشترک چیست؟" and q["status"] == "answered" and q["to_teacher"] == 0
    assert not any("name" in k for k in q)
    assert await store.question("0" * 16) is None


async def test_waiting_and_urgent_questions_reach_the_teacher_in_order(store):
    sent = await ask(store, "sent")
    waiting = await ask(store, "waiting", waiting=True, answer=None, source="none")
    urgent = await ask(store, "urgent", urgent=True, source="rules")
    assert (await store.question(waiting))["status"] == "waiting"
    assert await store.send_to_teacher(sent) is True
    assert await store.send_to_teacher("nope") is False
    assert [q["question"] for q in await store.queue()] == ["urgent", "waiting", "sent"]
    assert len(await store.queue(limit=1)) == 1
    assert urgent


async def test_review_approves_or_rejects(store):
    t = await ask(store, "why?", waiting=True, answer=None, source="none")
    qid = (await store.question(t))["id"]
    r = await store.review(qid, answer="because", approve=True)
    assert r["status"] == "reviewed" and r["teacher_answer"] == "because" and r["reviewed"]
    assert [(a["question"], a["answer"]) for a in await store.approved()] == [("why?", "because")]
    assert await store.queue() == []
    t2 = await ask(store, "no", waiting=True, answer=None, source="none")
    r2 = await store.review((await store.question(t2))["id"], approve=False)
    assert r2["status"] == "rejected" and len(await store.approved()) == 1
    assert await store.review(99999) is None


async def test_safety_messages_never_become_answers(store):
    t = await ask(store, "health", waiting=True, source="rules", answer="see a health worker")
    await store.review((await store.question(t))["id"], approve=True)
    t = await ask(store, "distress", urgent=True, source="rules", answer="tell an adult")
    await store.review((await store.question(t))["id"], answer="I am here", approve=True)
    assert await store.approved() == []


async def test_counts(store):
    await ask(store, source="maths")
    await ask(store, source="ai")
    await ask(store, waiting=True, answer=None, source="none")
    pid = await store.add_print(lesson_id="x", kind="worksheet", copies=2, lang="prs", seed=0, device="a")
    await store.set_print(pid, "saved", pages=1)
    c = await store.counts()
    assert c == {"asked_today": 3, "checked_today": 1, "ai_today": 1, "for_teacher": 1, "pages_today": 2,
                 "approved_answers": 0}


# print jobs

async def test_print_jobs(store):
    a = await store.add_print(lesson_id="x", kind="worksheet", copies=3, lang="prs", seed=4821, device="10.42.0.5")
    b = await store.add_print(lesson_id=None, kind="card", copies=1, lang="prs", seed=0, device="teacher")
    assert (await store.print_job(a))["status"] == "queued"
    await store.set_print(a, "failed", detail="no paper", pages=1)
    await store.set_print(a, "failed")                     # nothing new: the detail and pages stay
    j = await store.print_job(a)
    assert (j["status"], j["detail"], j["pages"], j["seed"]) == ("failed", "no paper", 1, 4821)
    assert [p["id"] for p in await store.prints()] == [b, a]
    assert await store.print_job(99999) is None


async def test_copies_last_hour_skips_failed_jobs_and_other_phones(store):
    await store.add_print(lesson_id="x", kind="worksheet", copies=3, lang="prs", seed=0, device="p1")
    failed = await store.add_print(lesson_id="x", kind="worksheet", copies=5, lang="prs", seed=0, device="p1")
    await store.set_print(failed, "failed")
    await store.add_print(lesson_id="x", kind="worksheet", copies=4, lang="prs", seed=0, device="p2")
    assert await store.copies_last_hour("p1") == 3 and await store.copies_last_hour("nobody") == 0


async def test_a_restart_fails_unfinished_prints(store):
    a = await store.add_print(lesson_id="x", kind="worksheet", copies=1, lang="prs", seed=0, device="p")
    b = await store.add_print(lesson_id="x", kind="worksheet", copies=1, lang="prs", seed=0, device="p")
    await store.set_print(b, "saved")
    await store.fail_unfinished_prints()
    assert (await store.print_job(a))["status"] == "failed" and "restarted" in (await store.print_job(a))["detail"]
    assert (await store.print_job(b))["status"] == "saved"


async def test_prune_keeps_approved_answers(store):
    t = await ask(store, "asked", waiting=True, answer=None, source="none")
    await store.review((await store.question(t))["id"], answer="kept", approve=True)
    await store.add_print(lesson_id="x", kind="worksheet", copies=1, lang="prs", seed=0, device="p")
    await store.prune(60)                          # nothing is 60 days old yet
    assert await store.question(t) and len(await store.prints()) == 1
    await store.prune(-1)                          # a cut-off in the future: everything is "old"
    assert await store.question(t) is None and await store.prints() == []
    assert [a["answer"] for a in await store.approved()] == ["kept"]


# cohorts and flags

COHORTS = [{"id": "abcd1234ef", "label": "One", "langs": ["prs"], "bands": ["p1", "p2"],
            "settings": {"maturity": ["pilot", "stable"]},
            "flags": {"lessons": {"enabled": True, "settings": {}}, "ask": {"enabled": False, "settings": {}}}},
           {"id": "zz99yy88xx", "label": "Two", "langs": ["prs", "ps"], "bands": ["ad"], "settings": {}, "flags": {}}]


async def test_seeds_fill_only_empty_tables(store):
    assert await store.seed_cohorts(COHORTS) is True
    assert await store.seed_cohorts([dict(COHORTS[1], id="other00000")]) is False
    assert [c["id"] for c in await store.cohorts()] == ["abcd1234ef", "zz99yy88xx"]
    c = await store.cohort("abcd1234ef")
    assert (c["label"], c["langs"], c["bands"], c["settings"]) == ("One", ["prs"], ["p1", "p2"],
                                                                    {"maturity": ["pilot", "stable"]})
    assert "code_hash" not in c and await store.cohort("nope") is None
    f = await store.flags("abcd1234ef")
    assert {k: v["enabled"] for k, v in f.items()} == {"lessons": True, "ask": False}
    assert f["lessons"]["changed_by"] == "seed" and await store.flags("zz99yy88xx") == {}
    assert len(await store.flag_log("abcd1234ef")) == 2


async def test_every_flag_change_is_logged(store):
    await store.seed_cohorts(COHORTS)
    await store.set_flag("zz99yy88xx", "print", enabled=True, settings={"copies": 2}, changed_by="admin")
    await store.set_flag("zz99yy88xx", "print", enabled=False, changed_by="admin")
    f = await store.flags("zz99yy88xx")
    assert f["print"]["enabled"] is False and f["print"]["settings"] == {} and f["print"]["changed_by"] == "admin"
    log = await store.flag_log("zz99yy88xx")
    assert [(r["module"], r["enabled"], r["settings"]) for r in log] == [("print", False, {}),
                                                                         ("print", True, {"copies": 2})]
    assert len(await store.flag_log("zz99yy88xx", limit=1)) == 1
    assert len(await store.flag_log("abcd1234ef")) == 2          # another cohort's log is untouched


# events

def ev(verb="lesson.start", at="2026-10-16T09:41", cohort="abcd1234ef", **kw):
    return dict({"at": at, "token_hash": None, "cohort": cohort, "module": "lessons", "verb": verb,
                 "object": "dari-1-sheen", "value": None}, **kw)


async def test_events_are_appended_and_read_newest_first(store):
    assert await store.add_events([]) == 0
    assert await store.add_events([ev(at="2026-10-16T09:41"), ev("lesson.done", at="2026-10-16T09:50", value=3),
                                   ev(at="2026-10-15T08:00"), ev(cohort="zz99yy88xx")]) == 4
    rows = await store.events("abcd1234ef")
    assert [(r["verb"], r["at"], r["value"]) for r in rows] == [("lesson.done", "2026-10-16T09:50", 3),
                                                                ("lesson.start", "2026-10-16T09:41", None),
                                                                ("lesson.start", "2026-10-15T08:00", None)]
    assert set(rows[0]) == {"id", "at", "token_hash", "cohort", "module", "verb", "object", "value"}
    assert len(await store.events("abcd1234ef", limit=1)) == 1 and len(await store.events("zz99yy88xx")) == 1


@pytest.mark.parametrize("bad", [dict(ev(), name="Maryam"), dict(ev(), note="free text"),
                                 {k: v for k, v in ev().items() if k != "verb"}, "lesson.start"])
async def test_an_event_row_with_a_stray_field_writes_nothing(store, bad):
    with pytest.raises(ValueError):
        await store.add_events([ev(), bad])
    assert await store.events("abcd1234ef") == []


async def test_prune_events_keeps_the_recent_ones(store):
    from datetime import datetime, timedelta, timezone
    old = (datetime.now(timezone.utc) - timedelta(days=400)).strftime("%Y-%m-%dT%H:%M")
    new = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
    await store.add_events([ev(at=old), ev(at=new)])
    await store.prune_events(365)
    assert [r["at"] for r in await store.events("abcd1234ef")] == [new]


# AI usage

def use(day="2026-10-16", cohort="abcd1234ef", module="ask", purpose="explain", tokens=100, **kw):
    return dict({"day": day, "cohort": cohort, "module": module, "purpose": purpose, "provider": "fake",
                 "model": "fake", "tokens": tokens}, **kw)


async def test_ai_usage_counts_calls_per_day_and_purpose(store):
    assert await store.ai_spent("abcd1234ef", "2026-10-16") == {"calls": 0, "tokens": 0, "cost_micro": 0}
    await store.add_ai_usage(**use())
    await store.add_ai_usage(**use(tokens=50, cost_micro=7, held=True))
    await store.add_ai_usage(**use(purpose="hint", tokens=10))
    await store.add_ai_usage(**use(day="2026-10-15", tokens=1000))
    await store.add_ai_usage(**use(cohort="zz99yy88xx", tokens=999))
    assert await store.ai_spent("abcd1234ef", "2026-10-16") == {"calls": 3, "tokens": 160, "cost_micro": 7}
    rows = await store.ai_usage("abcd1234ef")
    assert [(r["day"], r["purpose"], r["calls"], r["tokens"], r["held"]) for r in rows] == [
        ("2026-10-15", "explain", 1, 1000, 0), ("2026-10-16", "explain", 2, 150, 1), ("2026-10-16", "hint", 1, 10, 0)]
    assert set(rows[0]) == {"day", "cohort", "module", "purpose", "provider", "model", "calls", "tokens", "cost_micro",
                            "held"}
    assert len(await store.ai_usage("abcd1234ef", since="2026-10-16")) == 2


async def test_prune_ai_usage_keeps_two_years(store):
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    old, new = ((now - timedelta(days=d)).strftime("%Y-%m-%d") for d in (800, 1))
    await store.add_ai_usage(**use(day=old))
    await store.add_ai_usage(**use(day=new))
    await store.prune_ai_usage(730)
    assert [r["day"] for r in await store.ai_usage("abcd1234ef")] == [new]


# content: signoffs and releases (P8)

H1, H2 = "sha256:" + "a" * 64, "sha256:" + "b" * 64


async def test_signoffs_are_kept_per_hash_and_role(store):
    so = dict(lesson="maths-7-fractions-add", content_hash=H1, role="Dari reader", initials="AB", signed_on="2027-02-14")
    assert await store.add_signoff(**so) is True
    assert await store.add_signoff(**so) is False                      # the same signature twice changes nothing
    assert await store.add_signoff(**dict(so, role="maths teacher", initials="CD")) is True
    assert await store.add_signoff(**dict(so, content_hash=H2)) is True    # a changed lesson is signed afresh
    rows = await store.signoffs("maths-7-fractions-add")
    assert [(r["content_hash"], r["role"], r["initials"]) for r in rows] == [
        (H1, "Dari reader", "AB"), (H1, "maths teacher", "CD"), (H2, "Dari reader", "AB")]
    assert set(rows[0]) == {"lesson", "content_hash", "role", "initials", "signed_on", "added_at"}
    assert await store.signoffs("no-such-lesson") == []


@pytest.mark.parametrize("bad", ["Ahmad Shah", "ab", "ABCDE", "", None])
async def test_a_signoff_takes_initials_never_a_name(store, bad):
    with pytest.raises(ValueError):
        await store.add_signoff(lesson="x-1", content_hash=H1, role="Dari reader", initials=bad, signed_on="2027-02-14")
    assert await store.signoffs("x-1") == []


async def test_releases_newest_first_per_cohort(store):
    a = await store.add_release(pack="starter", version="1", content_hash=H1, cohort="abcd1234ef", released_by="admin")
    b = await store.add_release(pack="starter", version="2", content_hash=H2, cohort="abcd1234ef", released_by="admin")
    await store.add_release(pack="starter", version="2", content_hash=H2, cohort="zz99yy88xx", released_by="admin")
    assert isinstance(a, int) and b > a
    rows = await store.releases("abcd1234ef")
    assert [(r["version"], r["content_hash"], r["released_by"]) for r in rows] == [("2", H2, "admin"), ("1", H1, "admin")]


# every store, at its edges

async def test_rows_are_plain_python(store):
    t = await ask(store, waiting=True, answer=None, source="none")
    q = await store.question(t)
    assert type(q) is dict and q["answer"] is None and q["teacher_answer"] is None
    assert all(v is None or type(v) in (str, int, float) for v in q.values())
    assert type(await store.queue()) is list and type((await store.queue())[0]) is dict


async def test_a_batch_of_events_lands_whole_or_not_at_all(store):
    rows = [ev(at=f"2026-10-16T09:{i % 60:02d}") for i in range(100)]
    assert await store.add_events(rows) == 100          # more than one insert's worth on D1 (100 bound values)
    assert len(await store.events("abcd1234ef", limit=200)) == 100
    rows[60] = ev(cohort=None)                           # the database refuses this one (cohort NOT NULL)
    with pytest.raises(Exception):
        await store.add_events(rows)
    assert len(await store.events("abcd1234ef", limit=200)) == 100


# the D1 fake is as strict as D1, so a mistake fails here and not on Cloudflare

async def test_the_fake_refuses_pragmas_and_transactions_outside_batch():
    db = FakeD1()
    await db.prepare("CREATE TABLE t(x INTEGER)").run()
    for sql in ("PRAGMA foreign_keys=OFF", "PRAGMA table_info(t)", "BEGIN", "BEGIN TRANSACTION", "COMMIT",
                "SAVEPOINT s", "ATTACH DATABASE ':memory:' AS other"):
        with pytest.raises(JsException):
            await db.prepare(sql).run()
        with pytest.raises(JsException):
            await db.exec(sql)
    with pytest.raises(JsException):                     # one statement per prepare
        await db.prepare("INSERT INTO t VALUES(1); INSERT INTO t VALUES(2)").run()
    assert db.sqlite.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 0


async def test_the_fake_binds_values_as_d1_does():
    db = FakeD1()
    await db.prepare("CREATE TABLE t(a, b, c)").run()
    with pytest.raises(JsException, match="D1_TYPE_ERROR"):  # Python None arrives as undefined: refused
        db.prepare("INSERT INTO t VALUES(?, ?, ?)").bind(1, None, 2)
    with pytest.raises(JsException, match="D1_TYPE_ERROR"):  # no BigInt
        db.prepare("INSERT INTO t VALUES(?, ?, ?)").bind(2 ** 60, 1, 1)
    with pytest.raises(JsException):                         # at most 100 values
        await db.prepare(f"SELECT {', '.join('?' * 101)}").bind(*range(101)).all()
    with pytest.raises(JsException):                         # no named parameters
        await db.prepare("SELECT :a").all()
    r = await db.prepare("INSERT INTO t VALUES(?, ?, ?)").bind(True, JS_NULL, 2.0).run()
    assert r.success and r.meta.changes == 1 and r.meta.last_row_id == 1
    row = await db.prepare("SELECT a, b, c FROM t").first()
    with pytest.raises(TypeError):                           # a JS object has attributes, not keys
        row["a"]
    assert row.to_py() == {"a": 1, "b": JS_NULL, "c": 2}     # JS null stays jsnull; a whole REAL comes back an int
    assert await db.prepare("SELECT a FROM t WHERE a=99").first() is JS_NULL
    assert await db.prepare("SELECT a FROM t").first("a") == 1
    with pytest.raises(JsException):
        await db.prepare("SELECT a FROM t").first("nope")


async def test_the_fake_batch_is_one_transaction():
    db = FakeD1()
    await db.prepare("CREATE TABLE t(x INTEGER PRIMARY KEY)").run()
    insert = db.prepare("INSERT INTO t VALUES(?)")
    with pytest.raises(JsException):                         # a Python list is not a JS array: use to_js
        await db.batch([insert.bind(1)])
    with pytest.raises(JsException):
        await db.batch(fake_ffi.to_js([insert.bind(1), insert.bind(2), insert.bind(1)]))
    assert db.sqlite.execute("SELECT COUNT(*) FROM t").fetchone()[0] == 0
    out = await db.batch(fake_ffi.to_js([insert.bind(1), insert.bind(2), db.prepare("SELECT x FROM t ORDER BY x")]))
    assert isinstance(out, JsArray) and out[2].results.to_py() == [{"x": 1}, {"x": 2}]


async def test_the_fake_enforces_foreign_keys_as_d1_does():
    db = FakeD1()
    await db.prepare("CREATE TABLE p(id TEXT PRIMARY KEY)").run()
    await db.prepare("CREATE TABLE c(p TEXT REFERENCES p(id))").run()
    with pytest.raises(JsException, match="FOREIGN KEY"):
        await db.prepare("INSERT INTO c VALUES('nobody')").run()

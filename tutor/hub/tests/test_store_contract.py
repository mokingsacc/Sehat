"""The store contract (stores/base.py), run against every store: SQLite now, the D1 fake from P6.

Also the migrations: a fresh database and one made by the hub's code before migrations end with the same tables, and
running them again changes nothing.
"""
import re
import sqlite3
import pytest

from tutor_hub.stores import SqliteStore
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


STORES = {"sqlite": make_sqlite}


@pytest.fixture(params=sorted(STORES))
async def store(request, tmp_path):
    s = STORES[request.param](tmp_path)
    await s.open()
    yield s
    await s.close()


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

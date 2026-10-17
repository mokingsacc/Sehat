"""The village hub's store: one SQLite file, reached from async routes through one worker thread.

Every call runs on a single-thread executor, so calls reach the database one at a time and in order, and the event
loop never waits on the disk. The print worker is a thread of its own and keeps calling the inner store directly
(`sync`); the inner store's lock keeps the two apart.

The tables come from the shared migrations (stores/migrations.py, the same files and runner rules as D1). At
`open()` the files not yet listed in `schema_migrations` are applied in order, each in one transaction with its
row in that table, so a cut in the middle leaves the database as it was. The PRAGMAs (WAL, full sync) are the
hub's own and stay in the inner store, never in a migration.
"""
import asyncio
import functools
import logging
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import _sqlite_sync
from .base import Store, check_changes
from .migrations import APPLIED, LEDGER, MIGRATIONS, NAME, RECORD, applied_at, migration_files, plan

__all__ = ["SqliteStore", "migrate", "migration_files", "MIGRATIONS", "NAME"]
log = logging.getLogger("tutor.store")


def migrate(db: sqlite3.Connection, folder: Path = MIGRATIONS) -> list[str]:
    """Apply the migrations `db` has not had yet, in order; return the ids applied. Safe to run any number of times."""
    db.execute(LEDGER)
    done = {r[0] for r in db.execute(APPLIED)}
    applied = []
    for m in plan(done, folder):
        if db.in_transaction:           # as executescript did: what the caller left open is committed first
            db.commit()
        try:
            db.execute("BEGIN")
            db.execute(RECORD, (m.id, applied_at()))
            for sql in m.statements:
                db.execute(sql)
            db.execute("COMMIT")
        except sqlite3.Error:
            if db.in_transaction:
                db.execute("ROLLBACK")
            raise
        log.info("applied migration %s", m.id)
        applied.append(m.id)
    return applied


class SqliteStore(Store):
    def __init__(self, path: Path | str, migrations: Path = MIGRATIONS):
        self.path = Path(path)
        self.migrations = Path(migrations)
        self._inner: _sqlite_sync.Store | None = None
        self._pool: ThreadPoolExecutor | None = None

    @property
    def sync(self) -> _sqlite_sync.Store:
        """The inner, blocking store, for the print worker thread only."""
        if self._inner is None:
            raise RuntimeError("the store is not open")
        return self._inner

    async def _run(self, name, *args, **kw):
        if self._pool is None:
            raise RuntimeError("the store is not open")
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._pool, functools.partial(getattr(self._inner, name), *args, **kw))

    async def open(self) -> None:
        if self._pool is not None:
            return
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="store")
        loop = asyncio.get_running_loop()
        self._inner = await loop.run_in_executor(self._pool, _sqlite_sync.Store, self.path)
        await loop.run_in_executor(self._pool, self._migrate)

    def _migrate(self):
        with self._inner.lock:
            migrate(self._inner.db, self.migrations)

    async def close(self) -> None:
        pool, inner = self._pool, self._inner
        if pool is None:
            return
        self._pool = None
        pool.shutdown(wait=True)            # every call already sent finishes first
        with inner.lock:                    # and the print worker is not halfway through a write
            inner.db.close()

    # questions
    async def add_question(self, **kw) -> str:
        return await self._run("add_question", **kw)

    async def question(self, token):
        return await self._run("question", token)

    async def send_to_teacher(self, token) -> bool:
        return await self._run("send_to_teacher", token)

    async def question_row(self, qid):
        return await self._run("question_row", qid)

    async def question_count(self, cid, since, own=False) -> int:
        return await self._run("question_count", cid, since, own)

    async def queue(self, limit=50, cohort=None, own=False):
        return await self._run("queue", limit, cohort, own)

    async def ladder(self, token):
        return await self._run("ladder", token)

    async def add_ladder(self, token, *, solution, sure) -> None:
        return await self._run("add_ladder", token, solution=solution, sure=sure)

    async def use_check(self, token, limit=3):
        return await self._run("use_check", token, limit)

    async def review(self, qid, *, answer=None, approve=True, hints=None, reuse=True):
        return await self._run("review", qid, answer=answer, approve=approve, hints=hints, reuse=reuse)

    async def approved(self):
        return await self._run("approved")

    async def counts(self):
        return await self._run("counts")

    async def prune(self, keep_days: int):
        return await self._run("prune", keep_days)

    # print jobs
    async def add_print(self, **kw) -> int:
        return await self._run("add_print", **kw)

    async def set_print(self, pid, status, detail=None, pages=None):
        return await self._run("set_print", pid, status, detail=detail, pages=pages)

    async def print_job(self, pid):
        return await self._run("print_job", pid)

    async def prints(self, limit=20):
        return await self._run("prints", limit)

    async def copies_last_hour(self, device) -> int:
        return await self._run("copies_last_hour", device)

    async def fail_unfinished_prints(self):
        return await self._run("fail_unfinished_prints")

    # cohorts and flags
    async def seed_cohorts(self, cohorts) -> bool:
        return await self._run("seed_cohorts", cohorts)

    async def cohort(self, cid):
        return await self._run("cohort", cid)

    async def cohorts(self):
        return await self._run("cohorts")

    async def flags(self, cid):
        return await self._run("flags", cid)

    async def set_flag(self, cid, module, *, enabled, settings=None, changed_by):
        return await self._run("set_flag", cid, module, enabled=enabled, settings=settings, changed_by=changed_by)

    async def add_cohort(self, **kw) -> bool:
        return await self._run("add_cohort", **kw)

    async def set_cohort_settings(self, cid, settings) -> bool:
        return await self._run("set_cohort_settings", cid, settings)

    async def learner_counts(self):
        return await self._run("learner_counts")

    async def add_admin_log(self, **kw) -> int:
        return await self._run("add_admin_log", **kw)

    async def admin_log(self, cohort=None, limit=100):
        return await self._run("admin_log", cohort, limit)

    async def flag_log(self, cid, limit=50):
        return await self._run("flag_log", cid, limit)

    # events
    async def add_events(self, rows) -> int:
        return await self._run("add_events", rows)

    async def events(self, cid, limit=100):
        return await self._run("events", cid, limit)

    async def events_since(self, cid, since):
        return await self._run("events_since", cid, since)

    async def prune_events(self, keep_days: int):
        return await self._run("prune_events", keep_days)

    # AI usage
    async def add_ai_usage(self, **kw):
        return await self._run("add_ai_usage", **kw)

    async def ai_usage(self, cid, since=None):
        return await self._run("ai_usage", cid, since)

    async def ai_spent(self, cid, day):
        return await self._run("ai_spent", cid, day)

    async def prune_ai_usage(self, keep_days: int):
        return await self._run("prune_ai_usage", keep_days)

    async def ai_prices(self):
        return await self._run("ai_prices")

    async def set_ai_price(self, **kw):
        return await self._run("set_ai_price", **kw)

    # content
    async def add_signoff(self, **kw) -> bool:
        return await self._run("add_signoff", **kw)

    async def signoffs(self, lesson):
        return await self._run("signoffs", lesson)

    async def all_signoffs(self):
        return await self._run("all_signoffs")

    # staff and review notes
    async def add_staff(self, **kw) -> None:
        return await self._run("add_staff", **kw)

    async def staff_member(self, id_hash):
        return await self._run("staff_member", id_hash)

    async def staff_list(self):
        return await self._run("staff_list")

    async def remove_staff(self, id_hash) -> bool:
        return await self._run("remove_staff", id_hash)

    async def add_review_note(self, **kw) -> int:
        return await self._run("add_review_note", **kw)

    async def review_notes(self, lesson, role=None):
        return await self._run("review_notes", lesson, role)

    async def add_release(self, **kw) -> int:
        return await self._run("add_release", **kw)

    async def releases(self, cohort):
        return await self._run("releases", cohort)

    # learners
    async def set_class_code(self, cid, code_hash) -> bool:
        return await self._run("set_class_code", cid, code_hash)

    async def cohort_by_code(self, code_hash):
        return await self._run("cohort_by_code", code_hash)

    async def add_learner(self, **kw) -> int:
        return await self._run("add_learner", **kw)

    async def learner(self, token_hash):
        return await self._run("learner", token_hash)

    async def update_learner(self, token_hash, **changes) -> bool:
        check_changes(changes)                   # here too, so a stray key never reaches _run's own arguments
        return await self._run("update_learner", token_hash, **changes)

    async def learners_in(self, cid):
        return await self._run("learners_in", cid)

    async def set_reset_code(self, token_hash, code_hash, expires) -> None:
        return await self._run("set_reset_code", token_hash, code_hash, expires)

    async def use_reset_code(self, token_hash, code_hash, tries=5) -> str:
        return await self._run("use_reset_code", token_hash, code_hash, tries)

    async def delete_learner(self, token_hash) -> bool:
        return await self._run("delete_learner", token_hash)

    async def prune_learners(self, idle_days: int):
        return await self._run("prune_learners", idle_days)

    async def merge_learners(self, keep, drop, **changes) -> bool:
        return await self._run("merge_learners", keep, drop, **changes)

    async def rekey_learner(self, old, new) -> bool:
        return await self._run("rekey_learner", old, new)

    async def server_id(self) -> str:
        return await self._run("server_id")

    async def add_wish(self, *, cohort, band, lang, wish, wkey) -> int:
        return await self._run("add_wish", cohort=cohort, band=band, lang=lang, wish=wish, wkey=wkey)

    async def wishes(self, cohort=None, limit=100):
        return await self._run("wishes", cohort, limit)

    async def set_wish_status(self, wkey, status) -> int:
        return await self._run("set_wish_status", wkey, status)

    async def add_certificate(self, *, course, version, month, cohort) -> str:
        return await self._run("add_certificate", course=course, version=version, month=month, cohort=cohort)

    async def certificate(self, cid):
        return await self._run("certificate", cid)

    async def results(self, token_hash, lessons):
        return await self._run("results", token_hash, list(lessons))

    async def contests_done(self, token_hash):
        return await self._run("contests_done", token_hash)

    async def contest_takers(self, cohort, contest, since):
        return await self._run("contest_takers", cohort, contest, since)

    async def count_today(self, token_hash, module) -> int:
        return await self._run("count_today", token_hash, module)

    async def add_made(self, *, cohort, token_hash, kind, body, lang) -> int:
        return await self._run("add_made", cohort=cohort, token_hash=token_hash, kind=kind, body=body, lang=lang)

    async def made_mine(self, token_hash):
        return await self._run("made_mine", token_hash)

    async def made_waiting(self, cohort, limit=100):
        return await self._run("made_waiting", cohort, limit)

    async def made_row(self, mid):
        return await self._run("made_row", mid)

    async def decide_made(self, mid, *, status, chips, reply) -> bool:
        return await self._run("decide_made", mid, status=status, chips=chips, reply=reply)

    # live classes (P30a, C6.1)
    async def live_start(self, *, id, cohort, subject, host, state) -> bool:
        return await self._run("live_start", id=id, cohort=cohort, subject=subject, host=host, state=state)

    async def live_session(self, sid):
        return await self._run("live_session", sid)

    async def live_open(self, cohort):
        return await self._run("live_open", cohort)

    async def live_sessions_since(self, since, cohort=None):
        return await self._run("live_sessions_since", since, cohort)

    async def live_update(self, sid, *, state=None, bump=False, seen=False, peak=None, add_min=0):
        return await self._run("live_update", sid, state=state, bump=bump, seen=seen, peak=peak, add_min=add_min)

    async def live_end(self, sid, *, add_min=0) -> bool:
        return await self._run("live_end", sid, add_min=add_min)

    async def live_join(self, session, token_hash, ticket):
        return await self._run("live_join", session, token_hash, ticket)

    async def live_ticket(self, session, token_hash, ticket, since) -> bool:
        return await self._run("live_ticket", session, token_hash, ticket, since)

    async def live_here(self, session):
        return await self._run("live_here", session)

    async def live_present(self, session, token_hash):
        return await self._run("live_present", session, token_hash)

    async def live_seen(self, session, token_hash) -> bool:
        return await self._run("live_seen", session, token_hash)

    async def live_set_sfu(self, session, token_hash, sfu) -> bool:
        return await self._run("live_set_sfu", session, token_hash, sfu)

    async def live_hand(self, session, token_hash, reason) -> bool:
        return await self._run("live_hand", session, token_hash, reason)

    async def live_lower_all(self, session) -> int:
        return await self._run("live_lower_all", session)

    async def live_leave(self, session, token_hash):
        return await self._run("live_leave", session, token_hash)

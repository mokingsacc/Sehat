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
from .base import Store
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

    async def queue(self, limit=50):
        return await self._run("queue", limit)

    async def review(self, qid, *, answer=None, approve=True):
        return await self._run("review", qid, answer=answer, approve=approve)

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

    async def flag_log(self, cid, limit=50):
        return await self._run("flag_log", cid, limit)

    # events
    async def add_events(self, rows) -> int:
        return await self._run("add_events", rows)

    async def events(self, cid, limit=100):
        return await self._run("events", cid, limit)

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

    # content
    async def add_signoff(self, **kw) -> bool:
        return await self._run("add_signoff", **kw)

    async def signoffs(self, lesson):
        return await self._run("signoffs", lesson)

    async def add_release(self, **kw) -> int:
        return await self._run("add_release", **kw)

    async def releases(self, cohort):
        return await self._run("releases", cohort)

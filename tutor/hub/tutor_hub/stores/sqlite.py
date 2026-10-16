"""The village hub's store: one SQLite file, reached from async routes through one worker thread.

Every call runs on a single-thread executor, so calls reach the database one at a time and in order, and the event
loop never waits on the disk. The print worker is a thread of its own and keeps calling the inner store directly
(`sync`); the inner store's lock keeps the two apart.

The tables come from the shared migrations in tutor/migrations (`NNNN_name.sql`, plain SQL that D1 also runs). At
`open()` the files not yet listed in `schema_migrations` are applied in order, each in one transaction with its
row in that table, so a cut in the middle leaves the database as it was. The PRAGMAs (WAL, full sync) are the
hub's own and stay in the inner store, never in a migration.
"""
import asyncio
import functools
import logging
import re
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from ..config import TUTOR
from . import _sqlite_sync
from .base import Store

log = logging.getLogger("tutor.store")
MIGRATIONS = TUTOR / "migrations"
NAME = re.compile(r"^[0-9]{4}_[a-z0-9_]+$")


def migration_files(folder: Path = MIGRATIONS) -> list[Path]:
    files = sorted(folder.glob("*.sql"))
    bad = [f.name for f in files if not NAME.match(f.stem)]
    if bad:
        raise ValueError(f"migration files must be named like 0001_init.sql: {', '.join(bad)}")
    return files


def migrate(db: sqlite3.Connection, folder: Path = MIGRATIONS) -> list[str]:
    """Apply the migrations `db` has not had yet, in order; return the ids applied. Safe to run any number of times."""
    db.execute("CREATE TABLE IF NOT EXISTS schema_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
    done = {r[0] for r in db.execute("SELECT id FROM schema_migrations")}
    applied = []
    for f in migration_files(folder):
        if f.stem in done:
            continue
        at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            # the id and time are safe to write in place: the id matched NAME and the time is ours
            db.executescript(f"BEGIN;\n{f.read_text(encoding='utf-8')}\n;"
                             f"INSERT INTO schema_migrations(id, applied_at) VALUES('{f.stem}', '{at}');\nCOMMIT;")
        except sqlite3.Error:
            if db.in_transaction:
                db.execute("ROLLBACK")
            raise
        log.info("applied migration %s", f.stem)
        applied.append(f.stem)
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

"""The village hub's store: one SQLite file, reached from async routes through one worker thread.

Every call runs on a single-thread executor, so calls reach the database one at a time and in order, and the event
loop never waits on the disk. The print worker is a thread of its own and keeps calling the inner store directly
(`sync`); the inner store's lock keeps the two apart.
"""
import asyncio
import functools
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import _sqlite_sync
from .base import Store


class SqliteStore(Store):
    def __init__(self, path: Path | str):
        self.path = Path(path)
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

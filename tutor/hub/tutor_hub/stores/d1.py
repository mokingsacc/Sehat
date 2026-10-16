"""The online store: Cloudflare D1, reached from a Python Worker through its binding (`self.env.DB`).

The same contract as the hub's SQLite store (base.py) and the same tables, from the same migrations. What differs
is only how a Python Worker talks to D1:

- Every call is a JavaScript promise: `await db.prepare(sql).bind(...).all()`, `.first()` or `.run()`.
- There are no transactions through `prepare()` (BEGIN and COMMIT are refused). Writes that must land together go in
  one `db.batch([...])`, which D1 runs as one transaction; a migration is one batch with its schema_migrations row.
- Values cross between Python and JavaScript (Pyodide): Python None would arrive as `undefined`, which D1 refuses,
  so SQL NULL is sent as `pyodide.ffi.jsnull`; a Python list of statements is turned into a JavaScript array with
  `to_js`; results are JavaScript proxies, turned into dicts and lists with `.to_py()`, and the JavaScript nulls in
  them (`jsnull`, not None) into None. Booleans are stored as 1 and 0.
- D1 takes at most 100 bound values in one statement, so events go in as several multi-row inserts in one batch.

tests/fakes/d1.py is SQLite behind this same call shape, as strict as D1, and tests/test_store_contract.py runs the
whole contract against both stores. No sqlite3 and no threads here.
"""
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .base import EVENT_FIELDS, Store, check_changes, check_initials, draw_number
from .migrations import APPLIED, LEDGER, MIGRATIONS, RECORD, applied_at, plan

log = logging.getLogger("tutor.store")
EVENTS_PER_INSERT = 100 // len(EVENT_FIELDS)            # D1: at most 100 bound values in one statement


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _ago(**delta) -> datetime:
    return datetime.now(timezone.utc) - timedelta(**delta)


class D1Store(Store):
    def __init__(self, db, *, ffi=None, migrations: Path = MIGRATIONS):
        """`db` is the D1 binding; `ffi` is `pyodide.ffi` (its `jsnull` and `to_js`), or the test fake's stand-in."""
        self.db = db
        self.migrations = Path(migrations)
        self._ffi = ffi
        self._open = False

    @property
    def ffi(self):
        if self._ffi is None:
            import pyodide.ffi                      # only inside a Python Worker
            self._ffi = pyodide.ffi
        return self._ffi

    # talking to D1

    def _null(self, v):
        return v is None or v is self.ffi.jsnull

    def _py(self, v):
        """A value from `.to_py()`, with JavaScript's null as None, all the way down."""
        if isinstance(v, dict):
            return {k: self._py(x) for k, x in v.items()}
        if isinstance(v, list):
            return [self._py(x) for x in v]
        return None if self._null(v) else v

    def _stmt(self, sql, *args):
        s = self.db.prepare(sql)
        return s.bind(*(self.ffi.jsnull if a is None else a for a in args)) if args else s

    async def _all(self, sql, *args) -> list[dict]:
        r = await self._stmt(sql, *args).all()
        return self._py(r.results.to_py()) if not self._null(r.results) else []

    async def _one(self, sql, *args) -> dict | None:
        r = await self._stmt(sql, *args).first()
        return None if self._null(r) else self._py(r.to_py())

    async def _run(self, sql, *args):
        """A write; returns D1's `meta` (`changes`, `last_row_id`)."""
        return (await self._stmt(sql, *args).run()).meta

    async def _batch(self, statements) -> list:
        """Several statements as one transaction: all of them, or none if any fails."""
        return list(await self.db.batch(self.ffi.to_js(statements)))

    async def _batch_rows(self, statements) -> list[list[dict]]:
        return [self._py(r.results.to_py()) for r in await self._batch(statements)]

    # opening

    async def open(self) -> None:
        if self._open:
            return
        await self._run(LEDGER)
        done = {r["id"] for r in await self._all(APPLIED)}
        for m in plan(done, self.migrations):
            group = [self._stmt(RECORD, m.id, applied_at())] + [self._stmt(sql) for sql in m.statements]
            try:
                await self._batch(group)
            except Exception:
                # another Worker applied it first: its row is there and this batch, failing on that row, changed nothing
                if await self._one("SELECT id FROM schema_migrations WHERE id=?", m.id):
                    continue
                raise
            log.info("applied migration %s", m.id)
        self._open = True

    async def close(self) -> None:
        self._open = False                     # the binding belongs to the Worker: nothing to let go of

    # questions

    async def add_question(self, *, lang, subject, year, lesson_id, question, answer, source, urgent,
                           waiting) -> str:
        token = secrets.token_hex(8)
        await self._run("""INSERT INTO questions(token, created, lang, subject, year, lesson_id, question, answer,
                           source, urgent, to_teacher, status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                        token, now(), lang, subject, year, lesson_id, question, answer, source, int(bool(urgent)),
                        int(bool(waiting or urgent)), "waiting" if waiting else "answered")
        return token

    async def question(self, token):
        return await self._one("SELECT * FROM questions WHERE token=?", token)

    async def send_to_teacher(self, token) -> bool:
        meta = await self._run("UPDATE questions SET to_teacher=1 WHERE token=? AND status IN ('answered','waiting')",
                               token)
        return (meta.changes or 0) > 0

    async def queue(self, limit=50):
        return await self._all("""SELECT * FROM questions WHERE to_teacher=1 AND status IN ('answered','waiting')
                                  ORDER BY urgent DESC, status='waiting' DESC, id LIMIT ?""", int(limit))

    async def review(self, qid, *, answer=None, approve=True):
        q = await self._one("SELECT * FROM questions WHERE id=?", qid)
        if not q:
            return None
        final = (answer or "").strip() or q["answer"]
        if approve and final:
            at = now()
            group = [self._stmt("UPDATE questions SET status='reviewed', teacher_answer=?, reviewed=? WHERE id=?",
                                final, at, qid)]
            if not q["urgent"] and q["source"] != "rules":     # safety messages are never reused as answers
                group.append(self._stmt("""INSERT INTO approved(created, lang, subject, year, lesson_id, question,
                                           answer) VALUES(?,?,?,?,?,?,?)""",
                                        at, q["lang"] or "prs", q["subject"], q["year"], q["lesson_id"],
                                        q["question"], final))
            await self._batch(group)
        else:
            await self._run("UPDATE questions SET status='rejected', reviewed=? WHERE id=?", now(), qid)
        return await self._one("SELECT * FROM questions WHERE id=?", qid)

    async def approved(self):
        return await self._all("SELECT * FROM approved ORDER BY id")

    async def counts(self):
        day = _ago(days=1).isoformat(timespec="seconds")
        q, p, a = await self._batch_rows([       # three reads, one round trip
            self._stmt("""SELECT COUNT(*) AS asked, SUM(source IN ('maths','bank','approved')) AS checked,
                                 SUM(source='ai') AS ai,
                                 SUM(to_teacher=1 AND status IN ('answered','waiting')) AS for_teacher
                          FROM questions WHERE created>=?""", day),
            self._stmt("""SELECT COALESCE(SUM(pages*copies),0) AS pages FROM prints
                          WHERE created>=? AND status IN ('done','saved')""", day),
            self._stmt("SELECT COUNT(*) AS n FROM approved")])
        r, p, a = (q or [{}])[0], (p or [{}])[0], (a or [{}])[0]
        return {"asked_today": r.get("asked") or 0, "checked_today": r.get("checked") or 0,
                "ai_today": r.get("ai") or 0, "for_teacher": r.get("for_teacher") or 0,
                "pages_today": p.get("pages") or 0, "approved_answers": a.get("n") or 0}

    async def prune(self, keep_days: int):
        cut = _ago(days=keep_days).isoformat(timespec="seconds")
        await self._batch([self._stmt("DELETE FROM questions WHERE created<?", cut),
                           self._stmt("DELETE FROM prints WHERE created<?", cut)])

    # print jobs (the hub prints; online there is no printer, but the contract is the same)

    async def add_print(self, *, lesson_id, kind, copies, lang, seed, device) -> int:
        meta = await self._run("""INSERT INTO prints(created, lesson_id, kind, copies, lang, seed, status, device)
                                  VALUES(?,?,?,?,?,?, 'queued', ?)""", now(), lesson_id, kind, copies, lang, seed,
                               device)
        return int(meta.last_row_id)

    async def set_print(self, pid, status, detail=None, pages=None):
        await self._run("UPDATE prints SET status=?, detail=COALESCE(?, detail), pages=COALESCE(?, pages) WHERE id=?",
                        status, detail, pages, pid)

    async def print_job(self, pid):
        return await self._one("SELECT * FROM prints WHERE id=?", pid)

    async def prints(self, limit=20):
        return await self._all("SELECT * FROM prints ORDER BY id DESC LIMIT ?", int(limit))

    async def copies_last_hour(self, device) -> int:
        r = await self._one("""SELECT COALESCE(SUM(copies),0) AS n FROM prints
                               WHERE device=? AND created>=? AND status!='failed'""",
                            device, _ago(hours=1).isoformat(timespec="seconds"))
        return r["n"] if r else 0

    async def fail_unfinished_prints(self):
        await self._run("UPDATE prints SET status='failed', detail='the hub restarted: print again' "
                        "WHERE status IN ('queued','printing')")

    # cohorts and flags

    @staticmethod
    def _cohort(r):
        if not r:
            return None
        return dict(r, langs=json.loads(r["langs"]), bands=json.loads(r["bands"]), settings=json.loads(r["settings"]))

    async def seed_cohorts(self, cohorts) -> bool:
        if await self._one("SELECT 1 AS x FROM cohorts LIMIT 1"):
            return False
        at, group = now(), []
        for c in cohorts:
            group.append(self._stmt("INSERT INTO cohorts(id, label, langs, bands, settings, created) VALUES(?,?,?,?,?,?)",
                                    c["id"], c["label"], json.dumps(c["langs"]), json.dumps(c["bands"]),
                                    json.dumps(c.get("settings") or {}), at))
            for module, f in (c.get("flags") or {}).items():
                row = (module, c["id"], int(bool(f["enabled"])), json.dumps(f.get("settings") or {}), "seed", at)
                group.append(self._stmt("INSERT INTO flags(module, cohort, enabled, settings, changed_by, changed_at) "
                                        "VALUES(?,?,?,?,?,?)", *row))
                group.append(self._stmt("INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, "
                                        "changed_at) VALUES(?,?,?,?,?,?)", *row))
        try:
            if group:
                await self._batch(group)
        except Exception:
            # another Worker seeded first: its cohorts are there and this batch changed nothing
            if await self._one("SELECT 1 AS x FROM cohorts LIMIT 1"):
                return False
            raise
        return True

    async def cohort(self, cid):
        return self._cohort(await self._one("SELECT id, label, langs, bands, settings, created FROM cohorts WHERE id=?",
                                            cid))

    async def cohorts(self):
        return [self._cohort(r) for r in await self._all("SELECT id, label, langs, bands, settings, created "
                                                         "FROM cohorts ORDER BY created, id")]

    async def flags(self, cid):
        return {r["module"]: {"enabled": bool(r["enabled"]), "settings": json.loads(r["settings"]),
                              "changed_by": r["changed_by"], "changed_at": r["changed_at"]}
                for r in await self._all("SELECT * FROM flags WHERE cohort=?", cid)}

    async def set_flag(self, cid, module, *, enabled, settings=None, changed_by):
        row = (module, cid, int(bool(enabled)), json.dumps(settings or {}), changed_by, now())
        await self._batch([
            self._stmt("""INSERT INTO flags(module, cohort, enabled, settings, changed_by, changed_at)
                          VALUES(?,?,?,?,?,?) ON CONFLICT(cohort, module) DO UPDATE SET
                          enabled=excluded.enabled, settings=excluded.settings,
                          changed_by=excluded.changed_by, changed_at=excluded.changed_at""", *row),
            self._stmt("INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at) "
                       "VALUES(?,?,?,?,?,?)", *row)])

    async def flag_log(self, cid, limit=50):
        return [dict(r, enabled=bool(r["enabled"]), settings=json.loads(r["settings"]))
                for r in await self._all("SELECT * FROM flag_log WHERE cohort=? ORDER BY id DESC LIMIT ?",
                                         cid, int(limit))]

    # events

    async def add_events(self, rows) -> int:
        """Append the rows, all or none (one batch); a row with a field outside EVENT_FIELDS is refused first."""
        rows = list(rows)
        for r in rows:
            if not isinstance(r, dict) or set(r) != set(EVENT_FIELDS):
                raise ValueError(f"an event row has exactly these fields: {', '.join(EVENT_FIELDS)}")
        if not rows:
            return 0
        one = f"({', '.join('?' * len(EVENT_FIELDS))})"
        group = []
        for i in range(0, len(rows), EVENTS_PER_INSERT):
            part = rows[i:i + EVENTS_PER_INSERT]
            group.append(self._stmt(f"INSERT INTO events({', '.join(EVENT_FIELDS)}) VALUES "
                                    + ", ".join([one] * len(part)), *(r[k] for r in part for k in EVENT_FIELDS)))
        await self._batch(group)
        return len(rows)

    async def events(self, cid, limit=100):
        return await self._all(f"SELECT id, {', '.join(EVENT_FIELDS)} FROM events WHERE cohort=? "
                               "ORDER BY at DESC, id DESC LIMIT ?", cid, int(limit))

    async def prune_events(self, keep_days: int):
        await self._run("DELETE FROM events WHERE at<?", _ago(days=keep_days).strftime("%Y-%m-%dT%H:%M"))

    # AI usage

    async def add_ai_usage(self, *, day, cohort, module, purpose, provider, model, tokens, cost_micro=0,
                           held=False):
        await self._run("""INSERT INTO ai_usage(day, cohort, module, purpose, provider, model, calls, tokens, cost_micro,
                           held) VALUES(?,?,?,?,?,?,1,?,?,?) ON CONFLICT(day, cohort, module, purpose, provider, model)
                           DO UPDATE SET calls=calls+1, tokens=tokens+excluded.tokens,
                           cost_micro=cost_micro+excluded.cost_micro, held=held+excluded.held""",
                        day, cohort, module, purpose, provider, model, int(tokens), int(cost_micro), int(bool(held)))

    async def ai_usage(self, cid, since=None):
        return await self._all("SELECT * FROM ai_usage WHERE cohort=? AND day>=? "
                               "ORDER BY day, module, purpose, provider, model", cid, since or "")

    async def ai_spent(self, cid, day):
        r = await self._one("""SELECT COALESCE(SUM(calls),0) AS calls, COALESCE(SUM(tokens),0) AS tokens,
                                      COALESCE(SUM(cost_micro),0) AS cost_micro FROM ai_usage WHERE cohort=? AND day=?""",
                            cid, day)
        return {k: int(r[k]) for k in ("calls", "tokens", "cost_micro")}

    async def prune_ai_usage(self, keep_days: int):
        await self._run("DELETE FROM ai_usage WHERE day<?", _ago(days=keep_days).strftime("%Y-%m-%d"))

    # content

    async def add_signoff(self, *, lesson, content_hash, role, initials, signed_on) -> bool:
        check_initials(initials)
        meta = await self._run("INSERT OR IGNORE INTO signoffs(lesson, content_hash, role, initials, signed_on, "
                               "added_at) VALUES(?,?,?,?,?,?)", lesson, content_hash, role, initials, signed_on, now())
        return (meta.changes or 0) == 1

    async def signoffs(self, lesson):
        return await self._all("SELECT lesson, content_hash, role, initials, signed_on, added_at FROM signoffs "
                               "WHERE lesson=? ORDER BY id", lesson)

    async def add_release(self, *, pack, version, content_hash, cohort, released_by) -> int:
        meta = await self._run("INSERT INTO releases(pack, version, content_hash, cohort, released_by, released_at) "
                               "VALUES(?,?,?,?,?,?)", pack, version, content_hash, cohort, released_by, now())
        return int(meta.last_row_id)

    async def releases(self, cohort):
        return await self._all("SELECT * FROM releases WHERE cohort=? ORDER BY id DESC", cohort)

    # learners

    async def set_class_code(self, cid, code_hash) -> bool:
        return ((await self._run("UPDATE cohorts SET code_hash=? WHERE id=?", code_hash, cid)).changes or 0) > 0

    async def cohort_by_code(self, code_hash):
        return self._cohort(await self._one("SELECT id, label, langs, bands, settings, created FROM cohorts "
                                            "WHERE code_hash=?", code_hash))

    async def add_learner(self, *, token_hash, cohort, picture, band, consent_kind=None, consent_version=None,
                          consent_at=None) -> int:
        today = now()[:10]
        for _ in range(8):                   # another isolate may take the same number at the same moment
            used = [r["number"] for r in await self._all("SELECT number FROM learners WHERE cohort=? AND picture=?",
                                                         cohort, picture)]
            n = draw_number(used)
            try:
                await self._run("""INSERT INTO learners(token_hash, cohort, picture, number, band, consent_kind,
                                   consent_version, consent_at, joined, last_seen) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                                token_hash, cohort, picture, n, band, consent_kind, consent_version, consent_at, today,
                                today)
                return n
            except Exception:
                if await self.learner(token_hash):
                    raise
        raise RuntimeError("no free number for this picture")

    async def learner(self, token_hash):
        return await self._one("SELECT * FROM learners WHERE token_hash=?", token_hash)

    async def update_learner(self, token_hash, **changes) -> bool:
        check_changes(changes)
        if not changes:
            return await self.learner(token_hash) is not None
        cols = ", ".join(f"{k}=?" for k in changes)
        meta = await self._run(f"UPDATE learners SET {cols} WHERE token_hash=?", *changes.values(), token_hash)
        return (meta.changes or 0) > 0

    async def delete_learner(self, token_hash) -> bool:
        res = await self._batch([self._stmt("DELETE FROM events WHERE token_hash=?", token_hash),
                                 self._stmt("DELETE FROM learners WHERE token_hash=?", token_hash)])
        return (res[1].meta.changes or 0) > 0

    async def prune_learners(self, idle_days: int):
        cut = _ago(days=idle_days).strftime("%Y-%m-%d")
        await self._batch([self._stmt("DELETE FROM events WHERE token_hash IN "
                                      "(SELECT token_hash FROM learners WHERE last_seen<?)", cut),
                           self._stmt("DELETE FROM learners WHERE last_seen<?", cut)])

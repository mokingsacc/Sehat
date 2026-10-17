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

from .base import (COUNT_DAYS, EVENT_FIELDS, LOG_DAYS, QUEUE, QUEUE_ORDER, Store, check_changes, check_initials, check_log, check_price, check_via,
                   check_note, check_staff, check_wish_status, WISH_DAYS, WISH_MAX, draw_number, hints_json,
                   new_cert_id, question_status, MADE_DAYS, check_made, check_verdict, made_out, check_live_state,
                   check_reason, live_out, live_prune_sql, live_prune_times)
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
                           waiting, cohort=None, held=False, hints=None) -> str:
        token = secrets.token_hex(8)
        await self._run("""INSERT INTO questions(token, created, lang, subject, year, lesson_id, question, answer,
                           source, urgent, to_teacher, status, cohort, hints) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        token, now(), lang, subject, year, lesson_id, question, answer, source, int(bool(urgent)),
                        int(bool(waiting or urgent or held)), question_status(waiting, held), cohort,
                        hints_json(hints))
        return token

    async def question_row(self, qid):
        return await self._one("SELECT * FROM questions WHERE id=?", int(qid))

    async def question_count(self, cid, since, own=False) -> int:
        r = await self._one("SELECT COUNT(*) AS n FROM questions WHERE (cohort=? OR (? AND cohort IS NULL)) "
                            "AND created>=?", cid, int(bool(own)), since)
        return (r or {}).get("n") or 0

    async def ladder(self, token):
        r = await self._one("SELECT solution, sure FROM ladders WHERE token=?", token)
        return {"solution": r["solution"], "sure": bool(r["sure"])} if r else None

    async def question(self, token):
        return await self._one("SELECT * FROM questions WHERE token=?", token)

    async def send_to_teacher(self, token) -> bool:
        meta = await self._run("UPDATE questions SET to_teacher=1 WHERE token=? AND status IN ('answered','waiting')",
                               token)
        return (meta.changes or 0) > 0

    async def add_ladder(self, token, *, solution, sure) -> None:
        await self._run("INSERT OR REPLACE INTO ladders(token, solution, sure, checks, created) VALUES(?,?,?,0,?)",
                        token, str(solution), int(bool(sure)), now())

    async def use_check(self, token, limit=3):
        rows = await self._batch_rows([
            self._stmt("UPDATE ladders SET checks=checks+1 WHERE token=? AND checks<? RETURNING checks", token,
                       int(limit)),
            self._stmt("SELECT solution, sure, checks FROM ladders WHERE token=?", token)])
        if not rows[1]:
            return None
        r = rows[1][0]
        return {"solution": r["solution"], "sure": bool(r["sure"]), "checks": r["checks"], "used": bool(rows[0])}

    async def queue(self, limit=50, cohort=None, own=False):
        if cohort is None:
            return await self._all(f"SELECT * FROM questions WHERE {QUEUE} ORDER BY {QUEUE_ORDER} LIMIT ?",
                                   int(limit))
        return await self._all(f"SELECT * FROM questions WHERE ({QUEUE}) AND (cohort=? OR (? AND cohort IS NULL)) "
                               f"ORDER BY {QUEUE_ORDER} LIMIT ?", cohort, int(bool(own)), int(limit))

    async def review(self, qid, *, answer=None, approve=True, hints=None, reuse=True):
        q = await self._one("SELECT * FROM questions WHERE id=?", qid)
        if not q:
            return None
        final = (answer or "").strip() or q["answer"]
        if approve and final:
            at = now()
            group = [self._stmt("UPDATE questions SET status='reviewed', teacher_answer=?, reviewed=?, "
                                "hints=COALESCE(?, hints) WHERE id=?", final, at, hints_json(hints), qid)]
            if reuse and not q["urgent"] and q["source"] != "rules":     # safety messages are never reused
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
        logs = _ago(days=LOG_DAYS).isoformat(timespec="seconds")
        await self._batch([self._stmt("DELETE FROM questions WHERE created<?", cut),
                           self._stmt("DELETE FROM ladders WHERE created<?", cut),
                           self._stmt("DELETE FROM prints WHERE created<?", cut),
                           self._stmt("DELETE FROM reset_codes WHERE expires<?", now()),
                           self._stmt("DELETE FROM wishlist WHERE last_day<?",
                                      _ago(days=WISH_DAYS).strftime("%Y-%m-%d")),
                           self._stmt("DELETE FROM flag_log WHERE changed_at<?", logs),
                           self._stmt("DELETE FROM admin_log WHERE at<?", logs),
                           self._stmt("DELETE FROM daily_counts WHERE day<?",
                                      _ago(days=COUNT_DAYS - 1).strftime("%Y-%m-%d")),
                           self._stmt("DELETE FROM made WHERE COALESCE(decided_at, at)<?",
                                      _ago(days=MADE_DAYS).isoformat(timespec="seconds"))]
                          + [self._stmt(sql, *args) for sql, args in live_prune_sql(*live_prune_times())])

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

    async def add_cohort(self, *, id, label, langs, bands, settings) -> bool:
        if await self._one("SELECT id FROM cohorts WHERE id=?", id):
            return False
        try:
            await self._run("INSERT INTO cohorts(id, label, langs, bands, settings, created) VALUES(?,?,?,?,?,?)",
                            id, label, json.dumps(list(langs)), json.dumps(list(bands)), json.dumps(settings or {}),
                            now())
        except Exception:
            if await self._one("SELECT id FROM cohorts WHERE id=?", id):
                return False
            raise
        return True

    async def set_cohort_settings(self, cid, settings) -> bool:
        meta = await self._run("UPDATE cohorts SET settings=? WHERE id=?", json.dumps(settings or {}), cid)
        return (meta.changes or 0) > 0

    async def learner_counts(self):
        return {r["cohort"]: r["n"] for r in await self._all("SELECT cohort, COUNT(*) AS n FROM learners "
                                                             "GROUP BY cohort")}

    async def add_admin_log(self, *, cohort, what, detail, changed_by) -> int:
        check_log(what=what, detail=detail, changed_by=changed_by)
        meta = await self._run("INSERT INTO admin_log(at, cohort, what, detail, changed_by) VALUES(?,?,?,?,?)",
                               now(), cohort, what, detail, changed_by)
        return int(meta.last_row_id)

    async def admin_log(self, cohort=None, limit=100):
        if cohort is None:
            return await self._all("SELECT * FROM admin_log ORDER BY id DESC LIMIT ?", int(limit))
        return await self._all("SELECT * FROM admin_log WHERE cohort=? ORDER BY id DESC LIMIT ?", cohort, int(limit))

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

    async def events_since(self, cid, since):
        return await self._all("SELECT token_hash, at, verb, object, value FROM events WHERE cohort=? AND at>=? "
                               "ORDER BY at, id", cid, since)

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

    async def ai_prices(self):
        return await self._all("SELECT provider, model, usd_in, usd_out, changed_at FROM ai_prices "
                               "ORDER BY provider, model")

    async def set_ai_price(self, *, provider, model, usd_in, usd_out):
        if usd_in is None and usd_out is None:
            await self._run("DELETE FROM ai_prices WHERE provider=? AND model=?", provider, model or "")
            return
        row = check_price(provider=provider, model=model, usd_in=usd_in, usd_out=usd_out)
        await self._run("INSERT OR REPLACE INTO ai_prices(provider, model, usd_in, usd_out, changed_at) "
                        "VALUES(?,?,?,?,?)", *row, now())

    # content

    async def add_signoff(self, *, lesson, content_hash, role, initials, signed_on, via="") -> bool:
        check_initials(initials)
        meta = await self._run("INSERT OR IGNORE INTO signoffs(lesson, content_hash, role, initials, signed_on, "
                               "added_at, via) VALUES(?,?,?,?,?,?,?)", lesson, content_hash, role, initials, signed_on,
                               now(), check_via(via))
        return (meta.changes or 0) == 1

    async def signoffs(self, lesson):
        return await self._all("SELECT lesson, content_hash, role, initials, signed_on, added_at, via FROM signoffs "
                               "WHERE lesson=? ORDER BY id", lesson)

    async def all_signoffs(self):
        return await self._all("SELECT lesson, content_hash, role, initials, signed_on, added_at, via FROM signoffs "
                               "ORDER BY id")

    # staff and review notes

    async def add_staff(self, *, id_hash, label, role, cohorts, initials) -> None:
        cs = check_staff(id_hash=id_hash, label=label, role=role, cohorts=cohorts, initials=initials)
        await self._run("INSERT OR REPLACE INTO staff(id_hash, label, role, cohorts, initials, added_at) "
                        "VALUES(?,?,?,?,?,?)", id_hash, label.strip(), role.strip(), cs, initials, now())

    async def staff_member(self, id_hash):
        r = await self._one("SELECT label, role, cohorts, initials FROM staff WHERE id_hash=?", id_hash)
        return dict(r, cohorts=json.loads(r["cohorts"])) if r else None

    async def remove_staff(self, id_hash) -> bool:
        meta = await self._run("DELETE FROM staff WHERE id_hash=?", id_hash)
        return (meta.changes or 0) > 0

    async def staff_list(self):
        return [dict(r, cohorts=json.loads(r["cohorts"])) for r in
                await self._all("SELECT id_hash, label, role, cohorts, initials, added_at FROM staff "
                                "ORDER BY label, id_hash")]

    async def add_review_note(self, *, lesson, step, role, step_hash, status, chips, text) -> int:
        cj = check_note(step=step, status=status, chips=chips, text=text)
        meta = await self._run("INSERT INTO review_notes(lesson, step, role, step_hash, status, chips, text, at) "
                               "VALUES(?,?,?,?,?,?,?,?)", lesson, step, role, step_hash, status, cj, text, now())
        return int(meta.last_row_id)

    async def review_notes(self, lesson, role=None):
        if lesson is None:                   # every lesson's, for the admin's Content page
            rows = await self._all("SELECT * FROM review_notes ORDER BY id")
            return [dict(r, chips=json.loads(r["chips"])) for r in rows if role is None or r["role"] == role]
        if role is None:
            rows = await self._all("SELECT * FROM review_notes WHERE lesson=? ORDER BY id", lesson)
        else:
            rows = await self._all("SELECT * FROM review_notes WHERE lesson=? AND role=? ORDER BY id", lesson, role)
        return [dict(r, chips=json.loads(r["chips"])) for r in rows]

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

    async def learners_in(self, cid):
        return await self._all("SELECT token_hash, picture, number, band, joined, last_seen FROM learners "
                               "WHERE cohort=? ORDER BY picture, number", cid)

    async def set_reset_code(self, token_hash, code_hash, expires) -> None:
        await self._run("INSERT OR REPLACE INTO reset_codes(token_hash, code_hash, expires, tries) VALUES(?,?,?,0)",
                        token_hash, code_hash, expires)

    async def use_reset_code(self, token_hash, code_hash, tries=5) -> str:
        t = now()
        ok, wrong = await self._batch_rows([      # one round trip: a right code is used up, a wrong one counted
            self._stmt("DELETE FROM reset_codes WHERE token_hash=? AND code_hash=? AND expires>=? AND tries<? "
                       "RETURNING token_hash", token_hash, code_hash, t, int(tries)),
            self._stmt("UPDATE reset_codes SET tries=tries+1 WHERE token_hash=? AND code_hash!=? AND expires>=? "
                       "AND tries<? RETURNING tries", token_hash, code_hash, t, int(tries))])
        return "ok" if ok else "wrong" if wrong else "none"

    async def delete_learner(self, token_hash) -> bool:
        res = await self._batch([self._stmt("DELETE FROM events WHERE token_hash=?", token_hash),
                                 self._stmt("DELETE FROM reset_codes WHERE token_hash=?", token_hash),
                                 self._stmt("DELETE FROM daily_counts WHERE token_hash=?", token_hash),
                                 self._stmt("DELETE FROM made WHERE token_hash=?", token_hash),
                                 self._stmt("DELETE FROM live_present WHERE token_hash=?", token_hash),
                                 self._stmt("DELETE FROM learners WHERE token_hash=?", token_hash)])
        return (res[5].meta.changes or 0) > 0

    async def prune_learners(self, idle_days: int):
        cut = _ago(days=idle_days).strftime("%Y-%m-%d")
        await self._batch([self._stmt("DELETE FROM events WHERE token_hash IN "
                                      "(SELECT token_hash FROM learners WHERE last_seen<?)", cut),
                           self._stmt("DELETE FROM reset_codes WHERE token_hash IN "
                                      "(SELECT token_hash FROM learners WHERE last_seen<?)", cut),
                           self._stmt("DELETE FROM daily_counts WHERE token_hash IN "
                                      "(SELECT token_hash FROM learners WHERE last_seen<?)", cut),
                           self._stmt("DELETE FROM made WHERE token_hash IN "
                                      "(SELECT token_hash FROM learners WHERE last_seen<?)", cut),
                           self._stmt("DELETE FROM live_present WHERE token_hash IN "
                                      "(SELECT token_hash FROM learners WHERE last_seen<?)", cut),
                           self._stmt("DELETE FROM learners WHERE last_seen<?", cut)])

    # the wishlist (P22): no token, days only

    async def add_wish(self, *, cohort, band, lang, wish, wkey) -> int:
        day = _ago().strftime("%Y-%m-%d")
        r = await self._one("""INSERT INTO wishlist(cohort, band, lang, wish, wkey, count, first_day, last_day)
                       VALUES(?,?,?,?,?,1,?,?) ON CONFLICT(cohort, band, lang, wkey)
                       DO UPDATE SET count=count+1, last_day=excluded.last_day RETURNING count""",
                            cohort, band, lang, wish[:WISH_MAX], wkey[:WISH_MAX], day, day)
        return int(r["count"])

    async def wishes(self, cohort=None, limit=100):
        where, args = ("WHERE cohort=?", (cohort,)) if cohort else ("", ())
        return await self._all(f"""SELECT cohort, band, lang, wish, wkey, count, first_day, last_day, status
                                   FROM wishlist {where} ORDER BY count DESC, last_day DESC, wish LIMIT ?""",
                               *args, int(limit))

    async def set_wish_status(self, wkey, status) -> int:
        meta = await self._run("UPDATE wishlist SET status=? WHERE wkey=?", check_wish_status(status), wkey)
        return int(meta.changes or 0)

    # certificates (P25b): no token hash, band, day or name

    async def add_certificate(self, *, course, version, month, cohort) -> str:
        for _ in range(5):
            cid = new_cert_id()
            meta = await self._run("INSERT OR IGNORE INTO certificates(id, course, version, month, cohort) "
                                   "VALUES(?,?,?,?,?)", cid, course, version, month, cohort)
            if (meta.changes or 0) == 1:
                return cid
        raise RuntimeError("no free certificate id")

    async def certificate(self, cid):
        return await self._one("SELECT id, course, version, month, cohort FROM certificates WHERE id=?", cid)

    async def results(self, token_hash, lessons):
        lessons = list(lessons)[:90]                     # D1: at most 100 bound values in one statement
        if not lessons:
            return {}
        marks = ",".join("?" * len(lessons))
        rows = await self._all(f"""SELECT object, MAX(verb='lesson.done') AS done,
                                          MAX(CASE WHEN verb='check.done' THEN value END) AS best
                                   FROM events WHERE token_hash=? AND verb IN ('lesson.done','check.done')
                                   AND object IN ({marks}) GROUP BY object""", token_hash, *lessons)
        return {r["object"]: {"done": bool(r["done"]), "best": r["best"]} for r in rows}

    # her own questions (P32): for her teacher's check, kept 60 days

    async def add_made(self, *, cohort, token_hash, kind, body, lang) -> int:
        b = check_made(kind=kind, body=body, lang=lang)
        r = await self._one("INSERT INTO made(cohort, token_hash, kind, body, lang, status, chips, at) "
                            "VALUES(?,?,?,?,?, 'waiting', '[]', ?) RETURNING id", cohort, token_hash, kind, b, lang, now())
        return int(r["id"])

    async def made_mine(self, token_hash):
        return [made_out(r) for r in await self._all("SELECT id, status, chips, reply, at, decided_at FROM made "
                                                     "WHERE token_hash=? ORDER BY id", token_hash)]

    async def made_waiting(self, cohort, limit=100):
        return [made_out(r) for r in await self._all("SELECT id, kind, body, lang, at FROM made WHERE cohort IS ? "
                                                     "AND status='waiting' ORDER BY id LIMIT ?", cohort, int(limit))]

    async def made_row(self, mid):
        return made_out(await self._one("SELECT id, cohort, kind, body, lang, status, chips, reply, at, decided_at "
                                        "FROM made WHERE id=?", int(mid)))

    async def decide_made(self, mid, *, status, chips, reply) -> bool:
        c = check_verdict(status=status, chips=chips, reply=reply)
        meta = await self._run("UPDATE made SET status=?, chips=?, reply=?, decided_at=? WHERE id=? AND status='waiting'",
                               status, c, reply or None, now(), int(mid))
        return (meta.changes or 0) > 0

    # daily counts (7a): today's, per token and module, kept two days

    async def count_today(self, token_hash, module) -> int:
        r = await self._one("""INSERT INTO daily_counts(token_hash, day, module, n) VALUES(?,?,?,1)
                               ON CONFLICT(token_hash, day, module) DO UPDATE SET n=n+1 RETURNING n""",
                            token_hash, _ago().strftime("%Y-%m-%d"), module)
        return int(r["n"])

    # live classes (P30a, C6.1): counts and the room, never the sound

    LIVE_COLS = "id, cohort, subject, host, started_at, ended_at, seen_at, peak, listener_min, v, state"
    LIVE_HERE = """SELECT p.token_hash, l.picture, l.number, l.band, p.sfu, p.joined_at, p.seen_at, p.hand_at, p.reason
                   FROM live_present p LEFT JOIN learners l ON l.token_hash=p.token_hash WHERE p.session=?
                   ORDER BY p.hand_at IS NULL, p.hand_at, l.picture, l.number"""

    async def live_start(self, *, id, cohort, subject, host, state) -> bool:
        t = now()
        meta = await self._run("""INSERT INTO live_sessions(id, cohort, subject, host, started_at, seen_at, state)
                                  SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS
                                  (SELECT 1 FROM live_sessions WHERE cohort=? AND ended_at IS NULL)""",
                               id, cohort, subject, host, t, t, check_live_state(state), cohort)
        return (meta.changes or 0) == 1

    async def live_session(self, sid):
        return live_out(await self._one(f"SELECT {self.LIVE_COLS} FROM live_sessions WHERE id=?", sid))

    async def live_open(self, cohort):
        return live_out(await self._one(f"SELECT {self.LIVE_COLS} FROM live_sessions WHERE cohort=? AND ended_at IS NULL "
                                        "ORDER BY started_at DESC LIMIT 1", cohort))

    async def live_sessions_since(self, since, cohort=None):
        where, args = ("AND cohort=?", (cohort,)) if cohort else ("", ())
        return await self._all(f"""SELECT id, cohort, subject, host, started_at, ended_at, peak, listener_min
                                   FROM live_sessions WHERE started_at>=? {where} ORDER BY started_at, id""",
                               since, *args)

    async def live_update(self, sid, *, state=None, bump=False, seen=False, peak=None, add_min=0):
        sets, args = ["v=v+?"], [1 if bump else 0]
        if state is not None:
            sets.append("state=?")
            args.append(check_live_state(state))
        if seen:
            sets.append("seen_at=?")
            args.append(now())
        if peak is not None:
            sets.append("peak=MAX(peak, ?)")
            args.append(int(peak))
        if add_min:
            sets.append("listener_min=listener_min+?")
            args.append(int(add_min))
        r = await self._one(f"UPDATE live_sessions SET {', '.join(sets)} WHERE id=? AND ended_at IS NULL RETURNING v",
                            *args, sid)
        return int(r["v"]) if r else None

    async def live_end(self, sid, *, add_min=0) -> bool:
        res = await self._batch([
            self._stmt("""UPDATE live_sessions SET ended_at=?, listener_min=listener_min+?, state='{}', v=v+1
                          WHERE id=? AND ended_at IS NULL""", now(), int(add_min), sid),
            self._stmt("DELETE FROM live_present WHERE session=?", sid)])
        return (res[0].meta.changes or 0) == 1

    async def live_join(self, session, token_hash, ticket):
        t = now()
        await self._run("""INSERT INTO live_present(session, token_hash, ticket, ticket_at, joined_at, seen_at)
                           VALUES(?,?,?,?,?,?) ON CONFLICT(session, token_hash)
                           DO UPDATE SET ticket=excluded.ticket, ticket_at=excluded.ticket_at, seen_at=excluded.seen_at""",
                        session, token_hash, ticket, t, t, t)

    async def live_ticket(self, session, token_hash, ticket, since) -> bool:
        return await self._one("""UPDATE live_present SET ticket=NULL WHERE session=? AND token_hash=? AND ticket=?
                                  AND ticket_at>=? RETURNING session""", session, token_hash, ticket, since) is not None

    async def live_here(self, session):
        return await self._all(self.LIVE_HERE, session)

    async def live_present(self, session, token_hash):
        return await self._one("SELECT * FROM live_present WHERE session=? AND token_hash=?", session, token_hash)

    async def live_seen(self, session, token_hash) -> bool:
        meta = await self._run("UPDATE live_present SET seen_at=? WHERE session=? AND token_hash=?",
                               now(), session, token_hash)
        return (meta.changes or 0) == 1

    async def live_set_sfu(self, session, token_hash, sfu) -> bool:
        meta = await self._run("UPDATE live_present SET sfu=? WHERE session=? AND token_hash=?", sfu, session, token_hash)
        return (meta.changes or 0) == 1

    async def live_hand(self, session, token_hash, reason) -> bool:
        reason = check_reason(reason)
        meta = await self._run("UPDATE live_present SET hand_at=?, reason=?, seen_at=? WHERE session=? AND token_hash=?",
                               datetime.now(timezone.utc).isoformat(timespec="milliseconds") if reason else None, reason, now(), session, token_hash)
        return (meta.changes or 0) == 1

    async def live_lower_all(self, session) -> int:
        meta = await self._run("UPDATE live_present SET hand_at=NULL, reason=NULL WHERE session=? AND hand_at IS NOT NULL",
                               session)
        return int(meta.changes or 0)

    async def live_leave(self, session, token_hash):
        return await self._one("DELETE FROM live_present WHERE session=? AND token_hash=? RETURNING joined_at, seen_at",
                               session, token_hash)

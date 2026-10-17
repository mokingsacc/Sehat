"""The hub's own records in one SQLite file: questions, the teacher's approved answers, print jobs, cohorts and
flags, nameless events, and the AI gateway's daily usage.
This is the blocking half of stores/sqlite.py; routes reach it only through SqliteStore.

Privacy rule: the hub never stores a child's name. Questions are anonymous (a random token lets the asking phone
fetch the teacher's answer later), names printed on sheets are used once and not written down, and old
questions are deleted after keep_days. Progress stays on each phone.
"""
import json
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

from .base import (COUNT_DAYS, EVENT_FIELDS, LOG_DAYS, QUEUE, QUEUE_ORDER, check_changes, check_initials, check_log, check_price, check_via, check_note,
                   check_staff, check_wish_status, WISH_DAYS, WISH_MAX, draw_number, hints_json, new_cert_id,
                   question_status, MADE_DAYS, check_made, check_verdict, made_out, check_live_state,
                   check_reason, live_out, live_prune_sql, live_prune_times, merge_statements, new_server_id,
                   rekey_statements, SERVER_ID, BAG_TOMB, bag_cuts, bag_put_statements, today)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path):
        self.path = str(path)
        self.lock = threading.Lock()
        self.db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")   # power cuts are normal: never lose a committed row
        # the tables come from tutor/migrations, applied by stores/sqlite.py when the store opens

    def _x(self, sql, args=()):
        with self.lock:
            return self.db.execute(sql, args)

    def _all(self, sql, args=()):
        with self.lock:
            return [dict(r) for r in self.db.execute(sql, args).fetchall()]

    def _one(self, sql, args=()):
        with self.lock:
            r = self.db.execute(sql, args).fetchone()
            return dict(r) if r else None

    # questions
    def add_question(self, *, lang, subject, year, lesson_id, question, answer, source, urgent, waiting,
                     cohort=None, held=False, hints=None) -> str:
        token = secrets.token_hex(8)
        self._x("""INSERT INTO questions(token, created, lang, subject, year, lesson_id, question, answer, source,
                   urgent, to_teacher, status, cohort, hints) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (token, now(), lang, subject, year, lesson_id, question, answer, source, int(urgent),
                 int(waiting or urgent or held), question_status(waiting, held), cohort, hints_json(hints)))
        return token

    def question_row(self, qid):
        return self._one("SELECT * FROM questions WHERE id=?", (qid,))

    def question_count(self, cid, since, own=False) -> int:
        r = self._one("SELECT COUNT(*) AS n FROM questions WHERE (cohort=? OR (? AND cohort IS NULL)) AND created>=?",
                      (cid, int(bool(own)), since))
        return (r or {}).get("n") or 0

    def question(self, token):
        return self._one("SELECT * FROM questions WHERE token=?", (token,))

    def send_to_teacher(self, token) -> bool:
        return self._x("UPDATE questions SET to_teacher=1 WHERE token=? AND status IN ('answered','waiting')",
                       (token,)).rowcount > 0

    def queue(self, limit=50, cohort=None, own=False):
        """What the teacher should look at: urgent first, then questions with no answer, then ones sent to them."""
        where, args = QUEUE, ()
        if cohort is not None:
            where, args = f"({QUEUE}) AND (cohort=? OR (? AND cohort IS NULL))", (cohort, int(bool(own)))
        return self._all(f"SELECT * FROM questions WHERE {where} ORDER BY {QUEUE_ORDER} LIMIT ?", (*args, limit))

    def review(self, qid, *, answer=None, approve=True, hints=None, reuse=True):
        q = self._one("SELECT * FROM questions WHERE id=?", (qid,))
        if not q:
            return None
        final = (answer or "").strip() or q["answer"]
        if approve and final:
            self._x("UPDATE questions SET status='reviewed', teacher_answer=?, reviewed=?, hints=COALESCE(?, hints) "
                    "WHERE id=?", (final, now(), hints_json(hints), qid))
            if reuse and not q["urgent"] and q["source"] != "rules":   # safety messages are never reused
                self._x("""INSERT INTO approved(created, lang, subject, year, lesson_id, question, answer)
                           VALUES(?,?,?,?,?,?,?)""",
                        (now(), q["lang"] or "prs", q["subject"], q["year"], q["lesson_id"], q["question"], final))
        else:
            self._x("UPDATE questions SET status='rejected', reviewed=? WHERE id=?", (now(), qid))
        return self._one("SELECT * FROM questions WHERE id=?", (qid,))

    def approved(self):
        return self._all("SELECT * FROM approved ORDER BY id")

    def counts(self):
        day = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(timespec="seconds")
        r = self._one("""SELECT COUNT(*) AS asked,
                                SUM(source IN ('maths','bank','approved')) AS checked,
                                SUM(source='ai') AS ai,
                                SUM(to_teacher=1 AND status IN ('answered','waiting')) AS for_teacher
                         FROM questions WHERE created>=?""", (day,)) or {}
        p = self._one("SELECT COALESCE(SUM(pages*copies),0) AS pages FROM prints WHERE created>=? AND status IN ('done','saved')",
                      (day,)) or {}
        a = self._one("SELECT COUNT(*) AS n FROM approved") or {}
        return {"asked_today": r.get("asked") or 0, "checked_today": r.get("checked") or 0,
                "ai_today": r.get("ai") or 0, "for_teacher": r.get("for_teacher") or 0,
                "pages_today": p.get("pages") or 0, "approved_answers": a.get("n") or 0}

    def add_ladder(self, token, *, solution, sure) -> None:
        self._x("INSERT OR REPLACE INTO ladders(token, solution, sure, checks, created) VALUES(?,?,?,0,?)",
                (token, str(solution), int(bool(sure)), now()))

    def ladder(self, token):
        r = self._one("SELECT solution, sure FROM ladders WHERE token=?", (token,))
        return {"solution": r["solution"], "sure": bool(r["sure"])} if r else None

    def use_check(self, token, limit=3):
        with self.lock:
            cur = self.db.execute("UPDATE ladders SET checks=checks+1 WHERE token=? AND checks<?", (token, limit))
            r = self.db.execute("SELECT solution, sure, checks FROM ladders WHERE token=?", (token,)).fetchone()
        if not r:
            return None
        return {"solution": r["solution"], "sure": bool(r["sure"]), "checks": r["checks"], "used": cur.rowcount > 0}

    def prune(self, keep_days: int):
        cut = (datetime.now(timezone.utc) - timedelta(days=keep_days)).isoformat(timespec="seconds")
        self._x("DELETE FROM questions WHERE created<?", (cut,))
        self._x("DELETE FROM ladders WHERE created<?", (cut,))
        self._x("DELETE FROM prints WHERE created<?", (cut,))
        self._x("DELETE FROM reset_codes WHERE expires<?", (now(),))
        self._x("DELETE FROM wishlist WHERE last_day<?",
                ((datetime.now(timezone.utc) - timedelta(days=WISH_DAYS)).strftime("%Y-%m-%d"),))
        logs = (datetime.now(timezone.utc) - timedelta(days=LOG_DAYS)).isoformat(timespec="seconds")
        self._x("DELETE FROM flag_log WHERE changed_at<?", (logs,))
        self._x("DELETE FROM admin_log WHERE at<?", (logs,))
        self._x("DELETE FROM daily_counts WHERE day<?",
                ((datetime.now(timezone.utc) - timedelta(days=COUNT_DAYS - 1)).strftime("%Y-%m-%d"),))
        self._x("DELETE FROM made WHERE COALESCE(decided_at, at)<?",
                ((datetime.now(timezone.utc) - timedelta(days=MADE_DAYS)).isoformat(timespec="seconds"),))
        for sql, args in live_prune_sql(*live_prune_times()):
            self._x(sql, args)

    # print jobs
    def add_print(self, *, lesson_id, kind, copies, lang, seed, device) -> int:
        return self._x("""INSERT INTO prints(created, lesson_id, kind, copies, lang, seed, status, device)
                          VALUES(?,?,?,?,?,?, 'queued', ?)""",
                       (now(), lesson_id, kind, copies, lang, seed, device)).lastrowid

    def set_print(self, pid, status, detail=None, pages=None):
        self._x("UPDATE prints SET status=?, detail=COALESCE(?, detail), pages=COALESCE(?, pages) WHERE id=?",
                (status, detail, pages, pid))

    def print_job(self, pid):
        return self._one("SELECT * FROM prints WHERE id=?", (pid,))

    def prints(self, limit=20):
        return self._all("SELECT * FROM prints ORDER BY id DESC LIMIT ?", (limit,))

    def copies_last_hour(self, device) -> int:
        since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(timespec="seconds")
        r = self._one("""SELECT COALESCE(SUM(copies),0) AS n FROM prints
                         WHERE device=? AND created>=? AND status!='failed'""", (device, since))
        return r["n"] if r else 0

    def fail_unfinished_prints(self):
        """After a restart (or a power cut) nothing is printing any more."""
        self._x("UPDATE prints SET status='failed', detail='the hub restarted: print again' "
                "WHERE status IN ('queued','printing')")

    # cohorts and flags
    @staticmethod
    def _cohort(r):
        if not r:
            return None
        return dict(r, langs=json.loads(r["langs"]), bands=json.loads(r["bands"]), settings=json.loads(r["settings"]))

    def seed_cohorts(self, cohorts) -> bool:
        """Fill the cohort tables from the seed files, only when no cohort exists yet."""
        with self.lock:
            if self.db.execute("SELECT 1 FROM cohorts LIMIT 1").fetchone():
                return False
            at = now()
            self.db.execute("BEGIN")
            try:
                for c in cohorts:
                    self.db.execute("INSERT INTO cohorts(id, label, langs, bands, settings, created) VALUES(?,?,?,?,?,?)",
                                    (c["id"], c["label"], json.dumps(c["langs"]), json.dumps(c["bands"]),
                                     json.dumps(c.get("settings") or {}), at))
                    for module, f in (c.get("flags") or {}).items():
                        row = (module, c["id"], int(bool(f["enabled"])), json.dumps(f.get("settings") or {}), "seed", at)
                        self.db.execute("INSERT INTO flags(module, cohort, enabled, settings, changed_by, changed_at) "
                                        "VALUES(?,?,?,?,?,?)", row)
                        self.db.execute("INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, "
                                        "changed_at) VALUES(?,?,?,?,?,?)", row)
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise
            return True

    def cohort(self, cid):
        return self._cohort(self._one("SELECT id, label, langs, bands, settings, created FROM cohorts WHERE id=?",
                                      (cid,)))

    def cohorts(self):
        return [self._cohort(r) for r in self._all("SELECT id, label, langs, bands, settings, created FROM cohorts "
                                                   "ORDER BY created, id")]

    def flags(self, cid):
        return {r["module"]: {"enabled": bool(r["enabled"]), "settings": json.loads(r["settings"]),
                              "changed_by": r["changed_by"], "changed_at": r["changed_at"]}
                for r in self._all("SELECT * FROM flags WHERE cohort=?", (cid,))}

    def set_flag(self, cid, module, *, enabled, settings=None, changed_by):
        row = (module, cid, int(bool(enabled)), json.dumps(settings or {}), changed_by, now())
        with self.lock:
            self.db.execute("BEGIN")
            try:
                self.db.execute("""INSERT INTO flags(module, cohort, enabled, settings, changed_by, changed_at)
                                   VALUES(?,?,?,?,?,?) ON CONFLICT(cohort, module) DO UPDATE SET
                                   enabled=excluded.enabled, settings=excluded.settings,
                                   changed_by=excluded.changed_by, changed_at=excluded.changed_at""", row)
                self.db.execute("INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at) "
                                "VALUES(?,?,?,?,?,?)", row)
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise

    def flag_log(self, cid, limit=50):
        return [dict(r, enabled=bool(r["enabled"]), settings=json.loads(r["settings"]))
                for r in self._all("SELECT * FROM flag_log WHERE cohort=? ORDER BY id DESC LIMIT ?", (cid, limit))]

    def add_cohort(self, *, id, label, langs, bands, settings) -> bool:
        try:
            self._x("INSERT INTO cohorts(id, label, langs, bands, settings, created) VALUES(?,?,?,?,?,?)",
                    (id, label, json.dumps(list(langs)), json.dumps(list(bands)), json.dumps(settings or {}), now()))
            return True
        except sqlite3.IntegrityError:
            return False

    def set_cohort_settings(self, cid, settings) -> bool:
        return self._x("UPDATE cohorts SET settings=? WHERE id=?", (json.dumps(settings or {}), cid)).rowcount > 0

    def learner_counts(self):
        return {r["cohort"]: r["n"] for r in self._all("SELECT cohort, COUNT(*) AS n FROM learners GROUP BY cohort")}

    def add_admin_log(self, *, cohort, what, detail, changed_by) -> int:
        check_log(what=what, detail=detail, changed_by=changed_by)
        return self._x("INSERT INTO admin_log(at, cohort, what, detail, changed_by) VALUES(?,?,?,?,?)",
                       (now(), cohort, what, detail, changed_by)).lastrowid

    def admin_log(self, cohort=None, limit=100):
        if cohort is None:
            return self._all("SELECT * FROM admin_log ORDER BY id DESC LIMIT ?", (int(limit),))
        return self._all("SELECT * FROM admin_log WHERE cohort=? ORDER BY id DESC LIMIT ?", (cohort, int(limit)))

    # events
    def add_events(self, rows) -> int:
        """Append the rows, all or none; a row with a field outside EVENT_FIELDS is refused before anything is written."""
        rows = list(rows)
        for r in rows:
            if not isinstance(r, dict) or set(r) != set(EVENT_FIELDS):
                raise ValueError(f"an event row has exactly these fields: {', '.join(EVENT_FIELDS)}")
        if not rows:
            return 0
        with self.lock:
            self.db.execute("BEGIN")
            try:
                self.db.executemany(f"INSERT INTO events({', '.join(EVENT_FIELDS)}) "
                                    f"VALUES({', '.join('?' * len(EVENT_FIELDS))})",
                                    [tuple(r[k] for k in EVENT_FIELDS) for r in rows])
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise
        return len(rows)

    def events(self, cid, limit=100):
        return self._all(f"SELECT id, {', '.join(EVENT_FIELDS)} FROM events WHERE cohort=? "
                         "ORDER BY at DESC, id DESC LIMIT ?", (cid, limit))

    def events_since(self, cid, since):
        return self._all("SELECT token_hash, at, verb, object, value FROM events WHERE cohort=? AND at>=? "
                         "ORDER BY at, id", (cid, since))

    def prune_events(self, keep_days: int):
        cut = (datetime.now(timezone.utc) - timedelta(days=keep_days)).strftime("%Y-%m-%dT%H:%M")
        self._x("DELETE FROM events WHERE at<?", (cut,))

    # AI usage
    def add_ai_usage(self, *, day, cohort, module, purpose, provider, model, tokens, cost_micro=0, held=False):
        self._x("""INSERT INTO ai_usage(day, cohort, module, purpose, provider, model, calls, tokens, cost_micro, held)
                   VALUES(?,?,?,?,?,?,1,?,?,?) ON CONFLICT(day, cohort, module, purpose, provider, model) DO UPDATE SET
                   calls=calls+1, tokens=tokens+excluded.tokens, cost_micro=cost_micro+excluded.cost_micro,
                   held=held+excluded.held""",
                (day, cohort, module, purpose, provider, model, int(tokens), int(cost_micro), int(bool(held))))

    def ai_usage(self, cid, since=None):
        return self._all("SELECT * FROM ai_usage WHERE cohort=? AND day>=? ORDER BY day, module, purpose, provider, model",
                         (cid, since or ""))

    def ai_spent(self, cid, day):
        r = self._one("""SELECT COALESCE(SUM(calls),0) AS calls, COALESCE(SUM(tokens),0) AS tokens,
                                COALESCE(SUM(cost_micro),0) AS cost_micro FROM ai_usage WHERE cohort=? AND day=?""",
                      (cid, day))
        return {k: int(r[k]) for k in ("calls", "tokens", "cost_micro")}

    def prune_ai_usage(self, keep_days: int):
        cut = (datetime.now(timezone.utc) - timedelta(days=keep_days)).strftime("%Y-%m-%d")
        self._x("DELETE FROM ai_usage WHERE day<?", (cut,))

    def ai_prices(self):
        return self._all("SELECT provider, model, usd_in, usd_out, changed_at FROM ai_prices ORDER BY provider, model")

    def set_ai_price(self, *, provider, model, usd_in, usd_out):
        if usd_in is None and usd_out is None:
            self._x("DELETE FROM ai_prices WHERE provider=? AND model=?", (provider, model or ""))
            return
        row = check_price(provider=provider, model=model, usd_in=usd_in, usd_out=usd_out)
        self._x("INSERT OR REPLACE INTO ai_prices(provider, model, usd_in, usd_out, changed_at) VALUES(?,?,?,?,?)",
                row + (now(),))

    # content
    def add_signoff(self, *, lesson, content_hash, role, initials, signed_on, via="") -> bool:
        check_initials(initials)
        cur = self._x("INSERT OR IGNORE INTO signoffs(lesson, content_hash, role, initials, signed_on, added_at, via) "
                      "VALUES(?,?,?,?,?,?,?)", (lesson, content_hash, role, initials, signed_on, now(), check_via(via)))
        return cur.rowcount == 1

    def signoffs(self, lesson):
        return self._all("SELECT lesson, content_hash, role, initials, signed_on, added_at, via FROM signoffs "
                         "WHERE lesson=? ORDER BY id", (lesson,))

    def all_signoffs(self):
        return self._all("SELECT lesson, content_hash, role, initials, signed_on, added_at, via FROM signoffs "
                         "ORDER BY id")

    # staff and review notes
    def add_staff(self, *, id_hash, label, role, cohorts, initials) -> None:
        cs = check_staff(id_hash=id_hash, label=label, role=role, cohorts=cohorts, initials=initials)
        self._x("INSERT OR REPLACE INTO staff(id_hash, label, role, cohorts, initials, added_at) VALUES(?,?,?,?,?,?)",
                (id_hash, label.strip(), role.strip(), cs, initials, now()))

    def staff_member(self, id_hash):
        r = self._one("SELECT label, role, cohorts, initials FROM staff WHERE id_hash=?", (id_hash,))
        return dict(r, cohorts=json.loads(r["cohorts"])) if r else None

    def remove_staff(self, id_hash) -> bool:
        return self._x("DELETE FROM staff WHERE id_hash=?", (id_hash,)).rowcount > 0

    def staff_list(self):
        return [dict(r, cohorts=json.loads(r["cohorts"])) for r in
                self._all("SELECT id_hash, label, role, cohorts, initials, added_at FROM staff ORDER BY label, id_hash")]

    def add_review_note(self, *, lesson, step, role, step_hash, status, chips, text) -> int:
        cj = check_note(step=step, status=status, chips=chips, text=text)
        return self._x("INSERT INTO review_notes(lesson, step, role, step_hash, status, chips, text, at) "
                       "VALUES(?,?,?,?,?,?,?,?)", (lesson, step, role, step_hash, status, cj, text, now())).lastrowid

    def review_notes(self, lesson, role=None):
        if lesson is None:                   # every lesson's, for the admin's Content page
            rows = self._all("SELECT * FROM review_notes WHERE (? IS NULL OR role=?) ORDER BY id", (role, role))
        else:
            rows = self._all("SELECT * FROM review_notes WHERE lesson=? AND (? IS NULL OR role=?) ORDER BY id",
                             (lesson, role, role))
        return [dict(r, chips=json.loads(r["chips"])) for r in rows]

    def add_release(self, *, pack, version, content_hash, cohort, released_by) -> int:
        return self._x("INSERT INTO releases(pack, version, content_hash, cohort, released_by, released_at) "
                       "VALUES(?,?,?,?,?,?)", (pack, version, content_hash, cohort, released_by, now())).lastrowid

    def releases(self, cohort):
        return self._all("SELECT * FROM releases WHERE cohort=? ORDER BY id DESC", (cohort,))

    # learners
    def set_class_code(self, cid, code_hash) -> bool:
        return self._x("UPDATE cohorts SET code_hash=? WHERE id=?", (code_hash, cid)).rowcount > 0

    def cohort_by_code(self, code_hash):
        return self._cohort(self._one("SELECT id, label, langs, bands, settings, created FROM cohorts WHERE code_hash=?",
                                      (code_hash,)))

    def add_learner(self, *, token_hash, cohort, picture, band, consent_kind=None, consent_version=None,
                    consent_at=None) -> int:
        today = now()[:10]
        for _ in range(8):                   # another phone may take the same number at the same moment
            used = [r["number"] for r in self._all("SELECT number FROM learners WHERE cohort=? AND picture=?",
                                                   (cohort, picture))]
            n = draw_number(used)
            try:
                self._x("""INSERT INTO learners(token_hash, cohort, picture, number, band, consent_kind, consent_version,
                           consent_at, joined, last_seen) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                        (token_hash, cohort, picture, n, band, consent_kind, consent_version, consent_at, today, today))
                return n
            except sqlite3.IntegrityError:
                if self.learner(token_hash):
                    raise
        raise RuntimeError("no free number for this picture")

    def learner(self, token_hash):
        return self._one("SELECT * FROM learners WHERE token_hash=?", (token_hash,))

    def update_learner(self, token_hash, **changes) -> bool:
        check_changes(changes)
        if not changes:
            return self.learner(token_hash) is not None
        cols = ", ".join(f"{k}=?" for k in changes)
        return self._x(f"UPDATE learners SET {cols} WHERE token_hash=?", (*changes.values(), token_hash)).rowcount > 0

    def learners_in(self, cid):
        return self._all("SELECT token_hash, picture, number, band, joined, last_seen FROM learners WHERE cohort=? "
                         "ORDER BY picture, number", (cid,))

    def set_reset_code(self, token_hash, code_hash, expires) -> None:
        self._x("INSERT OR REPLACE INTO reset_codes(token_hash, code_hash, expires, tries) VALUES(?,?,?,0)",
                (token_hash, code_hash, expires))

    def use_reset_code(self, token_hash, code_hash, tries=5) -> str:
        with self.lock:
            r = self.db.execute("SELECT code_hash, expires, tries FROM reset_codes WHERE token_hash=?",
                                (token_hash,)).fetchone()
            if not r or r["expires"] < now() or r["tries"] >= tries:
                return "none"
            if r["code_hash"] != code_hash:
                self.db.execute("UPDATE reset_codes SET tries=tries+1 WHERE token_hash=?", (token_hash,))
                return "wrong"
            self.db.execute("DELETE FROM reset_codes WHERE token_hash=?", (token_hash,))
            return "ok"

    def delete_learner(self, token_hash) -> bool:
        with self.lock:
            self.db.execute("BEGIN")
            try:
                self.db.execute("DELETE FROM events WHERE token_hash=?", (token_hash,))
                self.db.execute("DELETE FROM reset_codes WHERE token_hash=?", (token_hash,))
                self.db.execute("DELETE FROM daily_counts WHERE token_hash=?", (token_hash,))
                self.db.execute("DELETE FROM made WHERE token_hash=?", (token_hash,))
                self.db.execute("DELETE FROM live_present WHERE token_hash=?", (token_hash,))
                self.db.execute(f"UPDATE bags SET {BAG_TOMB} WHERE token_hash=?", (today(), token_hash))
                n = self.db.execute("DELETE FROM learners WHERE token_hash=?", (token_hash,)).rowcount
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise
        return n > 0

    def _together(self, statements, check=None):
        """Statements as one transaction; `check(db)` runs first inside it and returning False changes nothing."""
        with self.lock:
            self.db.execute("BEGIN")
            try:
                if check is not None and not check(self.db):
                    self.db.execute("ROLLBACK")
                    return False
                for sql, args in statements:
                    self.db.execute(sql, args)
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise
        return True

    def merge_learners(self, keep, drop, **changes) -> bool:
        both = lambda db: keep != drop and db.execute(
            "SELECT COUNT(*) FROM learners WHERE token_hash IN (?, ?)", (keep, drop)).fetchone()[0] == 2
        return self._together(merge_statements(keep, drop, changes), both)

    def rekey_learner(self, old, new) -> bool:
        there = lambda db: db.execute("SELECT 1 FROM learners WHERE token_hash=?", (old,)).fetchone() is not None
        return self._together(rekey_statements(old, new), there)

    def server_id(self) -> str:
        return self._one(SERVER_ID, (new_server_id(),))["v"]

    # the school bag's relay (W6): sealed bags by peppered id
    def bag(self, id):
        return self._one("SELECT * FROM bags WHERE id=?", (id,))

    def put_bag(self, *, id, w, token_hash, etag, size, blob, want) -> bool:
        write, others = bag_put_statements(id=id, w=w, token_hash=token_hash, etag=etag, size=size, blob=blob,
                                           want=want, day=today())
        with self.lock:
            self.db.execute("BEGIN")
            try:
                done = bool(self.db.execute(*write).fetchall())
                if done:
                    self.db.execute(*others)
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise
        return done

    def delete_bag(self, id, w) -> str:
        with self.lock:
            if self.db.execute(f"UPDATE bags SET {BAG_TOMB} WHERE id=? AND w=? AND gone IS NULL",
                               (today(), id, w)).rowcount:
                return "done"
            r = self.db.execute("SELECT w FROM bags WHERE id=?", (id,)).fetchone()
        return "none" if r is None else "done" if r["w"] == w else "wrong"


    def prune_learners(self, idle_days: int):
        cut = (datetime.now(timezone.utc) - timedelta(days=idle_days)).strftime("%Y-%m-%d")
        with self.lock:
            self.db.execute("BEGIN")
            try:
                self.db.execute("DELETE FROM events WHERE token_hash IN "
                                "(SELECT token_hash FROM learners WHERE last_seen<?)", (cut,))
                self.db.execute("DELETE FROM reset_codes WHERE token_hash IN "
                                "(SELECT token_hash FROM learners WHERE last_seen<?)", (cut,))
                self.db.execute("DELETE FROM daily_counts WHERE token_hash IN "
                                "(SELECT token_hash FROM learners WHERE last_seen<?)", (cut,))
                self.db.execute("DELETE FROM made WHERE token_hash IN "
                                "(SELECT token_hash FROM learners WHERE last_seen<?)", (cut,))
                self.db.execute("DELETE FROM live_present WHERE token_hash IN "
                                "(SELECT token_hash FROM learners WHERE last_seen<?)", (cut,))
                self.db.execute(f"UPDATE bags SET {BAG_TOMB} WHERE token_hash IN "
                                "(SELECT token_hash FROM learners WHERE last_seen<?)", (today(), cut))
                self.db.execute("DELETE FROM learners WHERE last_seen<?", (cut,))
                live, gone = bag_cuts()           # the relay's own retention (W6), in the same transaction
                self.db.execute("DELETE FROM bags WHERE gone IS NULL AND day<?", (live,))
                self.db.execute("DELETE FROM bags WHERE gone IS NOT NULL AND gone<?", (gone,))
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise

    # the wishlist (P22): no token, days only
    def add_wish(self, *, cohort, band, lang, wish, wkey) -> int:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with self.lock:
            r = self.db.execute("""INSERT INTO wishlist(cohort, band, lang, wish, wkey, count, first_day, last_day)
                       VALUES(?,?,?,?,?,1,?,?) ON CONFLICT(cohort, band, lang, wkey)
                       DO UPDATE SET count=count+1, last_day=excluded.last_day RETURNING count""",
                                (cohort, band, lang, wish[:WISH_MAX], wkey[:WISH_MAX], day, day)).fetchone()
        return int(r[0])

    def wishes(self, cohort=None, limit=100):
        where, args = ("WHERE cohort=?", (cohort,)) if cohort else ("", ())
        return self._all(f"""SELECT cohort, band, lang, wish, wkey, count, first_day, last_day, status FROM wishlist
                             {where} ORDER BY count DESC, last_day DESC, wish LIMIT ?""", (*args, int(limit)))

    def set_wish_status(self, wkey, status) -> int:
        return self._x("UPDATE wishlist SET status=? WHERE wkey=?", (check_wish_status(status), wkey)).rowcount

    # certificates (P25b): no token hash, band, day or name
    def add_certificate(self, *, course, version, month, cohort) -> str:
        for _ in range(5):
            cid = new_cert_id()
            if self._x("INSERT OR IGNORE INTO certificates(id, course, version, month, cohort) VALUES(?,?,?,?,?)",
                       (cid, course, version, month, cohort)).rowcount == 1:
                return cid
        raise RuntimeError("no free certificate id")

    def certificate(self, cid):
        return self._one("SELECT id, course, version, month, cohort FROM certificates WHERE id=?", (cid,))

    def results(self, token_hash, lessons):
        lessons = list(lessons)
        if not lessons:
            return {}
        marks = ",".join("?" * len(lessons))
        rows = self._all(f"""SELECT object, MAX(verb='lesson.done') AS done,
                                    MAX(CASE WHEN verb='check.done' THEN value END) AS best
                             FROM events WHERE token_hash=? AND verb IN ('lesson.done','check.done')
                             AND object IN ({marks}) GROUP BY object""", (token_hash, *lessons))
        return {r["object"]: {"done": bool(r["done"]), "best": r["best"]} for r in rows}

    def contests_done(self, token_hash):
        rows = self._all("SELECT object, MAX(value) AS percent FROM events WHERE token_hash=? AND verb='contest.done' "
                         "GROUP BY object", (token_hash,))
        return {r["object"]: r["percent"] for r in rows}

    def contest_takers(self, cohort, contest, since):
        rows = self._all("SELECT token_hash, MAX(value) AS percent FROM events WHERE cohort=? AND at>=? "
                         "AND verb='contest.done' AND object=? AND token_hash IS NOT NULL GROUP BY token_hash",
                         (cohort, since, contest))
        return {r["token_hash"]: r["percent"] for r in rows}

    # her own questions (P32): for her teacher's check, kept 60 days
    def add_made(self, *, cohort, token_hash, kind, body, lang) -> int:
        b = check_made(kind=kind, body=body, lang=lang)
        return self._x("INSERT INTO made(cohort, token_hash, kind, body, lang, status, chips, at) "
                       "VALUES(?,?,?,?,?, 'waiting', '[]', ?)", (cohort, token_hash, kind, b, lang, now())).lastrowid

    def made_mine(self, token_hash):
        return [made_out(r) for r in self._all("SELECT id, status, chips, reply, at, decided_at FROM made "
                                               "WHERE token_hash=? ORDER BY id", (token_hash,))]

    def made_waiting(self, cohort, limit=100):
        return [made_out(r) for r in self._all("SELECT id, kind, body, lang, at FROM made WHERE cohort IS ? "
                                               "AND status='waiting' ORDER BY id LIMIT ?", (cohort, int(limit)))]

    def made_row(self, mid):
        return made_out(self._one("SELECT id, cohort, kind, body, lang, status, chips, reply, at, decided_at "
                                  "FROM made WHERE id=?", (int(mid),)))

    def decide_made(self, mid, *, status, chips, reply) -> bool:
        c = check_verdict(status=status, chips=chips, reply=reply)
        return self._x("UPDATE made SET status=?, chips=?, reply=?, decided_at=? WHERE id=? AND status='waiting'",
                       (status, c, reply or None, now(), int(mid))).rowcount > 0

    # daily counts (7a): today's, per token and module, kept two days
    def count_today(self, token_hash, module) -> int:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        r = self._one("""INSERT INTO daily_counts(token_hash, day, module, n) VALUES(?,?,?,1)
                         ON CONFLICT(token_hash, day, module) DO UPDATE SET n=n+1 RETURNING n""",
                      (token_hash, day, module))
        return int(r["n"])

    # live classes (P30a, C6.1): counts and the room, never the sound
    LIVE_COLS = "id, cohort, subject, host, started_at, ended_at, seen_at, peak, listener_min, v, state"
    LIVE_HERE = """SELECT p.token_hash, l.picture, l.number, l.band, p.sfu, p.joined_at, p.seen_at, p.hand_at, p.reason
                   FROM live_present p LEFT JOIN learners l ON l.token_hash=p.token_hash WHERE p.session=?
                   ORDER BY p.hand_at IS NULL, p.hand_at, l.picture, l.number"""

    def live_start(self, *, id, cohort, subject, host, state) -> bool:
        t = now()
        return self._x("""INSERT INTO live_sessions(id, cohort, subject, host, started_at, seen_at, state)
                          SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS
                          (SELECT 1 FROM live_sessions WHERE cohort=? AND ended_at IS NULL)""",
                       (id, cohort, subject, host, t, t, check_live_state(state), cohort)).rowcount == 1

    def live_session(self, sid):
        return live_out(self._one(f"SELECT {self.LIVE_COLS} FROM live_sessions WHERE id=?", (sid,)))

    def live_open(self, cohort):
        return live_out(self._one(f"SELECT {self.LIVE_COLS} FROM live_sessions WHERE cohort=? AND ended_at IS NULL "
                                  "ORDER BY started_at DESC LIMIT 1", (cohort,)))

    def live_sessions_since(self, since, cohort=None):
        where, args = ("AND cohort=?", (cohort,)) if cohort else ("", ())
        return self._all(f"""SELECT id, cohort, subject, host, started_at, ended_at, peak, listener_min FROM live_sessions
                             WHERE started_at>=? {where} ORDER BY started_at, id""", (since, *args))

    def live_update(self, sid, *, state=None, bump=False, seen=False, peak=None, add_min=0):
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
        r = self._one(f"UPDATE live_sessions SET {', '.join(sets)} WHERE id=? AND ended_at IS NULL RETURNING v",
                      (*args, sid))
        return int(r["v"]) if r else None

    def live_end(self, sid, *, add_min=0) -> bool:
        with self.lock:
            self.db.execute("BEGIN")
            try:
                n = self.db.execute("""UPDATE live_sessions SET ended_at=?, listener_min=listener_min+?, state='{}',
                                       v=v+1 WHERE id=? AND ended_at IS NULL""", (now(), int(add_min), sid)).rowcount
                self.db.execute("DELETE FROM live_present WHERE session=?", (sid,))
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise
        return n == 1

    def live_join(self, session, token_hash, ticket):
        t = now()
        self._x("""INSERT INTO live_present(session, token_hash, ticket, ticket_at, joined_at, seen_at)
                   VALUES(?,?,?,?,?,?) ON CONFLICT(session, token_hash)
                   DO UPDATE SET ticket=excluded.ticket, ticket_at=excluded.ticket_at, seen_at=excluded.seen_at""",
                (session, token_hash, ticket, t, t, t))

    def live_ticket(self, session, token_hash, ticket, since) -> bool:
        return self._one("""UPDATE live_present SET ticket=NULL WHERE session=? AND token_hash=? AND ticket=?
                            AND ticket_at>=? RETURNING session""", (session, token_hash, ticket, since)) is not None

    def live_here(self, session):
        return self._all(self.LIVE_HERE, (session,))

    def live_present(self, session, token_hash):
        return self._one("SELECT * FROM live_present WHERE session=? AND token_hash=?", (session, token_hash))

    def live_seen(self, session, token_hash) -> bool:
        return self._x("UPDATE live_present SET seen_at=? WHERE session=? AND token_hash=?",
                       (now(), session, token_hash)).rowcount == 1

    def live_set_sfu(self, session, token_hash, sfu) -> bool:
        return self._x("UPDATE live_present SET sfu=? WHERE session=? AND token_hash=?",
                       (sfu, session, token_hash)).rowcount == 1

    def live_hand(self, session, token_hash, reason) -> bool:
        reason = check_reason(reason)
        return self._x("UPDATE live_present SET hand_at=?, reason=?, seen_at=? WHERE session=? AND token_hash=?",
                       (datetime.now(timezone.utc).isoformat(timespec="milliseconds") if reason else None, reason, now(), session, token_hash)).rowcount == 1

    def live_lower_all(self, session) -> int:
        return self._x("UPDATE live_present SET hand_at=NULL, reason=NULL WHERE session=? AND hand_at IS NOT NULL",
                       (session,)).rowcount

    def live_leave(self, session, token_hash):
        return self._one("DELETE FROM live_present WHERE session=? AND token_hash=? RETURNING joined_at, seen_at",
                         (session, token_hash))

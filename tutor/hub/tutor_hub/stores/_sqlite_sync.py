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

from .base import EVENT_FIELDS, check_changes, check_initials, check_note, check_staff, draw_number


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
    def add_question(self, *, lang, subject, year, lesson_id, question, answer, source, urgent, waiting) -> str:
        token = secrets.token_hex(8)
        self._x("""INSERT INTO questions(token, created, lang, subject, year, lesson_id, question, answer, source,
                   urgent, to_teacher, status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (token, now(), lang, subject, year, lesson_id, question, answer, source, int(urgent),
                 int(waiting or urgent), "waiting" if waiting else "answered"))
        return token

    def question(self, token):
        return self._one("SELECT * FROM questions WHERE token=?", (token,))

    def send_to_teacher(self, token) -> bool:
        return self._x("UPDATE questions SET to_teacher=1 WHERE token=? AND status IN ('answered','waiting')",
                       (token,)).rowcount > 0

    def queue(self, limit=50):
        """What the teacher should look at: urgent first, then questions with no answer, then ones sent to them."""
        return self._all("""SELECT * FROM questions WHERE to_teacher=1 AND status IN ('answered','waiting')
                            ORDER BY urgent DESC, status='waiting' DESC, id LIMIT ?""", (limit,))

    def review(self, qid, *, answer=None, approve=True):
        q = self._one("SELECT * FROM questions WHERE id=?", (qid,))
        if not q:
            return None
        final = (answer or "").strip() or q["answer"]
        if approve and final:
            self._x("UPDATE questions SET status='reviewed', teacher_answer=?, reviewed=? WHERE id=?",
                    (final, now(), qid))
            if not q["urgent"] and q["source"] != "rules":   # safety messages are never reused as answers
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

    # content
    def add_signoff(self, *, lesson, content_hash, role, initials, signed_on) -> bool:
        check_initials(initials)
        cur = self._x("INSERT OR IGNORE INTO signoffs(lesson, content_hash, role, initials, signed_on, added_at) "
                      "VALUES(?,?,?,?,?,?)", (lesson, content_hash, role, initials, signed_on, now()))
        return cur.rowcount == 1

    def signoffs(self, lesson):
        return self._all("SELECT lesson, content_hash, role, initials, signed_on, added_at FROM signoffs "
                         "WHERE lesson=? ORDER BY id", (lesson,))

    def all_signoffs(self):
        return self._all("SELECT lesson, content_hash, role, initials, signed_on, added_at FROM signoffs ORDER BY id")

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

    def add_review_note(self, *, lesson, step, role, step_hash, status, chips, text) -> int:
        cj = check_note(step=step, status=status, chips=chips, text=text)
        return self._x("INSERT INTO review_notes(lesson, step, role, step_hash, status, chips, text, at) "
                       "VALUES(?,?,?,?,?,?,?,?)", (lesson, step, role, step_hash, status, cj, text, now())).lastrowid

    def review_notes(self, lesson, role=None):
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

    def delete_learner(self, token_hash) -> bool:
        with self.lock:
            self.db.execute("BEGIN")
            try:
                self.db.execute("DELETE FROM events WHERE token_hash=?", (token_hash,))
                n = self.db.execute("DELETE FROM learners WHERE token_hash=?", (token_hash,)).rowcount
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise
        return n > 0

    def prune_learners(self, idle_days: int):
        cut = (datetime.now(timezone.utc) - timedelta(days=idle_days)).strftime("%Y-%m-%d")
        with self.lock:
            self.db.execute("BEGIN")
            try:
                self.db.execute("DELETE FROM events WHERE token_hash IN "
                                "(SELECT token_hash FROM learners WHERE last_seen<?)", (cut,))
                self.db.execute("DELETE FROM learners WHERE last_seen<?", (cut,))
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise

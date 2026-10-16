"""The hub's own records in one SQLite file: questions, the teacher's approved answers, and print jobs.
This is the blocking half of stores/sqlite.py; routes reach it only through SqliteStore.

Privacy rule: the hub never stores a child's name. Questions are anonymous (a random token lets the asking phone
fetch the teacher's answer later), names printed on sheets are used once and not written down, and old
questions are deleted after keep_days. Progress stays on each phone.
"""
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta, timezone


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

    def prune(self, keep_days: int):
        cut = (datetime.now(timezone.utc) - timedelta(days=keep_days)).isoformat(timespec="seconds")
        self._x("DELETE FROM questions WHERE created<?", (cut,))
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

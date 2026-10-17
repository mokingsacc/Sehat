"""The store contract: every place the hub keeps records (SQLite on the village hub, D1 online) offers these methods.

Every method is a coroutine, because D1 answers with promises and Python Workers have no threads; on the hub the
SQLite store runs the same calls on one worker thread. A route never touches a database any other way.

The contract, which tests/test_store_contract.py checks on every store:

- `open()` makes the store ready: it connects and applies, in order, the migrations in tutor/migrations it has not
  applied before, recording each in `schema_migrations(id, applied_at)`; opening again changes nothing. `close()`
  lets go of the store. Neither loses a committed row.
- Rows come back as plain dicts with the column names as keys; nothing returned is tied to the database.
- No method stores a name. Questions are anonymous: `add_question` returns a random 16-character token, which is
  how the asking phone finds its question again; the teacher's views never need it.
- Times are UTC ISO strings to the second, made by the store.

Questions
- `add_question(*, lang, subject, year, lesson_id, question, answer, source, urgent, waiting, cohort=None,
  held=False, hints=None) -> token`: a question that is `waiting`, `urgent` or `held` goes to the teacher's list;
  status is "held" when `held` (an AI answer kept for the teacher, P20), else "waiting" when `waiting`, else
  "answered". `hints` is a held ladder's rungs, kept as JSON; `cohort` is the asking learner's (or the hub's).
- `question(token) -> dict | None`; `question_row(qid) -> dict | None`, by the row's id, for the teacher's pages.
- `question_count(cid, since, own=False) -> int`: the cohort's questions since `since` (an ISO time); `own` also
  counts questions with no cohort (asked before P20), which are the hub's own.
- `send_to_teacher(token) -> bool`: puts an answered or waiting question on the teacher's list; False if there is
  no such open question.
- `queue(limit=50, cohort=None, own=False) -> list`: the teacher's list (held answers, and answered or waiting
  questions sent to the teacher): urgent first, then unanswered, then oldest first; with `cohort`, that cohort's
  only (and with `own`, those with no cohort too).
- `review(qid, *, answer=None, approve=True, hints=None, reuse=True) -> dict | None`: approving with an answer (or
  the shown answer) marks it reviewed, keeps `hints` when given (a held ladder, edited), and, when `reuse` and
  unless it was urgent or a rules message, adds it to the approved answers; otherwise it is rejected. None if there
  is no such question.
- `approved() -> list`: every approved answer, oldest first.
- `counts() -> dict`: the last day's `asked_today`, `checked_today`, `ai_today`, `for_teacher`, `pages_today`,
  and all `approved_answers`.
- `add_ladder(token, *, solution, sure)`: the private answer behind a question's hint ladder (P15), never sent to a
  phone; `sure` is False when the model's two runs disagreed.
- `ladder(token) -> dict | None`: `{solution, sure}` behind a question's ladder, for the teacher's eyes only.
- `use_check(token, limit=3) -> dict | None`: one "Check my answer" try: `{solution, sure, checks, used}`, with
  `used` False (and nothing counted) once `limit` tries are spent; None when the question has no ladder.
- `prune(keep_days)`: deletes questions, their ladders and print jobs older than `keep_days`, lock reset codes
  past their time, wishes not asked for in `WISH_DAYS` (90) days, and `flag_log` and `admin_log` rows older than
  `LOG_DAYS` (2 years); approved answers stay. The hub runs it at start, the Worker also once a day (its cron).

Print jobs
- `add_print(*, lesson_id, kind, copies, lang, seed, device) -> id`: a queued job.
- `set_print(pid, status, detail=None, pages=None)`: a missing detail or page count keeps the old one.
- `print_job(pid) -> dict | None`; `prints(limit=20) -> list`, newest first.
- `copies_last_hour(device) -> int`: copies this device asked for in the last hour, failed jobs not counted.
- `fail_unfinished_prints()`: after a restart nothing is printing, so queued and printing jobs become failed.

Cohorts and flags (flags.py decides what they mean)
- `seed_cohorts(cohorts) -> bool`: only when there is no cohort yet, adds each `{id, label, langs, bands, settings,
  flags: {module: {enabled, settings}}}` with its flags, all logged as changed by "seed"; True if it added them.
- `cohort(cid) -> dict | None` and `cohorts() -> list`: `{id, label, langs, bands, settings, created}`, with langs and
  bands as lists and settings as a dict. Never the hashed class code.
- `flags(cid) -> {module: {enabled, settings, changed_by, changed_at}}`; a module with no row is off.
- `set_flag(cid, module, *, enabled, settings=None, changed_by)`: sets the switch and adds the same row to the log,
  together. `changed_by` is a role, never a name.
- `flag_log(cid, limit=50) -> list`: the cohort's changes, newest first.
- `add_cohort(*, id, label, langs, bands, settings) -> bool`: a new cohort with no flags (every module off) and no
  class code; False when the id is taken. Made by the admin panel (P21).
- `set_cohort_settings(cid, settings) -> bool`: replaces the cohort's settings (a dict, checked by flags.py first);
  False if there is no such cohort.
- `learner_counts() -> {cid: n}`: how many learners each cohort has; a cohort with none is left out.

The admin's log (P21; never a learner, never an email)
- `add_admin_log(*, cohort, what, detail, changed_by) -> id`: one change that is not a module switch; `what` from
  `ADMIN_WHAT`, `detail` at most 300 characters written by the hub, `changed_by` the admin's label.
- `admin_log(cohort=None, limit=100) -> list`: `{id, at, cohort, what, detail, changed_by}`, newest first; with
  `cohort`, that cohort's only.

Events (events.py decides what may be in them)
- `add_events(rows) -> int`: appends every row, all or none, and returns how many. A row has exactly the keys
  `at, token_hash, cohort, module, verb, object, value` (`EVENT_FIELDS`); a row with any other key, or without one
  of these, raises ValueError and nothing is written, so no stray field (a name, free text) can reach the table.
  `at` is the caller's UTC minute, kept as given.
- `events(cid, limit=100) -> list`: the cohort's events, newest first (by `at`, then the order they were added).
- `events_since(cid, since) -> list`: the cohort's events from the minute `since` on, oldest first, each
  `{token_hash, at, verb, object, value}`: what the teacher's counts are made from.
- `prune_events(keep_days)`: deletes events whose `at` is more than `keep_days` days old.

AI usage (the gateway's spending, ai/gateway.py)
- `add_ai_usage(*, day, cohort, module, purpose, provider, model, tokens, cost_micro=0, held=False)`: counts one call
  on the row for that day, cohort, module, purpose, provider and model, making the row if it is the first: one
  more call, `tokens` and `cost_micro` added, and one more held answer when `held`. Never a learner or any text.
- `ai_usage(cid, since=None) -> list`: the cohort's rows `{day, cohort, module, purpose, provider, model, calls,
  tokens, cost_micro, held}` from day `since` on (all when None), by day, module, purpose, provider, model.
- `ai_spent(cid, day) -> {calls, tokens, cost_micro}`: the cohort's totals for one day; zeros when nothing was spent.
- `prune_ai_usage(keep_days)`: deletes rows whose day is more than `keep_days` days ago.

Content (signoffs and releases, packs.py decides what they mean; kept for good)
- `add_signoff(*, lesson, content_hash, role, initials, signed_on) -> bool`: one reviewer role signing one content
  hash; initials only (1 to 4 capital letters, else ValueError), never a name. Signing the same hash in the same
  role again changes nothing and returns False.
- `signoffs(lesson) -> list`: `{lesson, content_hash, role, initials, signed_on, added_at}`, oldest first.
- `all_signoffs() -> list`: every signoff, oldest first (tools/pull_signoffs.py copies them into the packs).
- `add_release(*, pack, version, content_hash, cohort, released_by) -> id`: a pack version published to a cohort;
  `released_by` is a role.
- `releases(cohort) -> list`: the cohort's releases, newest first.

Staff and review notes (P17, C3.2 and C3.4; never an email, never a name)
- `add_staff(*, id_hash, label, role, cohorts, initials) -> None`: a staff member by the peppered hash of the email
  Access vouches for (64 hex characters); adding the same hash again replaces the row. `initials` are '' or 1 to 4
  capital letters (ValueError otherwise).
- `staff_member(id_hash) -> dict | None`: `{label, role, cohorts: [ids], initials}`.
- `remove_staff(id_hash) -> bool`.
- `staff_list() -> list`: `{id_hash, label, role, cohorts: [ids], initials, added_at}` by label: what the admin's
  Staff page shows (the hash is the row's key for removing it, and says nothing without the pepper).
- `add_review_note(*, lesson, step, role, step_hash, status, chips, text) -> id`: a reviewer role's verdict on one
  step (0: the lesson as a whole): status `ok`, `change` or `done`; chips from REVIEW_CHIPS; text at most 500
  characters.
- `review_notes(lesson, role=None) -> list`: `{id, lesson, step, role, step_hash, status, chips, text, at}`, oldest
  first; the latest per step and role is the one that counts. `lesson` None: every lesson's (the admin's Content).

Learners (learners.py decides what they mean; never a name)
- `set_class_code(cid, code_hash) -> bool`: the cohort's class code, hashed; False if there is no such cohort.
- `cohort_by_code(code_hash) -> dict | None`: the cohort with that code, as `cohort()` gives it.
- `add_learner(*, token_hash, cohort, picture, band, consent_kind=None, consent_version=None, consent_at=None) -> int`:
  a new learner with a number drawn for her picture in her cohort, one no other learner there has (1 to 99 while
  any is free, then larger); returns the number. `joined` and `last_seen` are today (UTC).
- `learner(token_hash) -> dict | None`: `{token_hash, cohort, picture, number, band, consent_kind, consent_version,
  consent_at, joined, last_seen}`.
- `update_learner(token_hash, **changes) -> bool`: changes only `band`, `consent_kind`, `consent_version`,
  `consent_at` and `last_seen` (any other key raises ValueError); False if there is no such learner.
- `learners_in(cid) -> list`: the cohort's learners by picture and number, each `{token_hash, picture, number,
  band, joined, last_seen}`, for the teacher's class list (which never shows the hash).
- `set_reset_code(token_hash, code_hash, expires)`: a lock reset code the teacher made for her (P20, C1.6), hashed,
  replacing any earlier one, with no tries used; `expires` is an ISO time.
- `use_reset_code(token_hash, code_hash, tries=5) -> str`: "ok" (the code is right: it is used up), "wrong" (one
  more try counted) or "none" (no code, past its time, or `tries` wrong tries spent).
- `delete_learner(token_hash) -> bool`: deletes the learner, every event carrying her token's hash and her reset
  code, together.
- `prune_learners(idle_days)`: deletes learners not seen for `idle_days` days, with their events and reset codes.

The wishlist (P22): what learners wanted to learn and no lesson matched, never with a token
- `add_wish(*, cohort, band, lang, wish, wkey) -> int`: one more ask for the wish `wkey` (its search form) in that
  cohort, band and language; the first keeps its text and day, each one moves the last day. Returns the count.
- `wishes(cohort=None, limit=100) -> list[dict]`: `{cohort, band, lang, wish, wkey, count, first_day, last_day,
  status}`, the most asked for first, then the latest; every cohort's when `cohort` is None.
- `set_wish_status(wkey, status) -> int`: the admin's mark (`WISH_STATUS`: new, planned, not_for_qalam) on every row
  of that wish, in every cohort, band and language; returns how many rows.

Certificates (P25b, C4.2): a pathway finished in a month, never who finished it
- `add_certificate(*, course, version, month, cohort) -> id`: a new row under a fresh random id (`new_cert_id`).
- `certificate(cid) -> dict | None`: `{id, course, version, month, cohort}`.
- `results(token_hash, lessons) -> {lesson: {done, best}}`: from her own events, for each of `lessons` she has any:
  `done` when a `lesson.done` exists, `best` the highest `check.done` (None without one).

Daily counts (7a, C4.9): what a learner's token did today against a module's limit
- `count_today(token_hash, module) -> int`: one more for today (UTC) and the new count. Rows older than yesterday
  go at the next prune (`COUNT_DAYS`, two days), and with the learner.
"""

import json
import random
import re
import secrets

WISH_DAYS = 90             # a wish not asked for again in 90 days is deleted (BUILD-PLAN 3.4)
WISH_MAX = 200            # characters of a wish kept
WISH_STATUS = ("new", "planned", "not_for_qalam")
COUNT_DAYS = 2            # daily_counts: today and yesterday (C4.9)
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
CERT_ID = re.compile(r"^QC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$")
LOG_DAYS = 730            # flag_log and admin_log are kept 2 years (BUILD-PLAN 3.4)
ADMIN_WHAT = ("cohort.new", "cohort.settings", "cohort.kill", "cohort.code", "release", "rollback", "wish",
              "staff.add", "staff.remove")
EVENT_FIELDS = ("at", "token_hash", "cohort", "module", "verb", "object", "value")
# the teacher's list: held answers, and answered or waiting questions sent to the teacher; urgent first
QUEUE = "status='held' OR (to_teacher=1 AND status IN ('answered','waiting'))"
QUEUE_ORDER = "urgent DESC, status='held' DESC, status='waiting' DESC, id"


def question_status(waiting, held) -> str:
    return "held" if held else "waiting" if waiting else "answered"


def hints_json(hints) -> str | None:
    """A held ladder's rungs as JSON: a list of {rung, text, ...}, at most three."""
    if hints is None:
        return None
    if not isinstance(hints, list) or len(hints) > 3 or not all(isinstance(r, dict) and isinstance(r.get("text"), str)
                                                                 for r in hints):
        raise ValueError("hints are a list of at most three rungs, each {rung, text}")
    return json.dumps(hints, ensure_ascii=False)
LEARNER_CHANGES = ("band", "consent_kind", "consent_version", "consent_at", "last_seen")


def new_cert_id() -> str:
    """`QC-` and ten Crockford base32 characters (50 random bits) in two groups: QC-7K3M9-TQX2A."""
    x = "".join(secrets.choice(CROCKFORD) for _ in range(10))
    return f"QC-{x[:5]}-{x[5:]}"


def draw_number(used) -> int:
    """A number for an alias picture that no learner with that picture in the cohort has: 1 to 99 while one is free."""
    used = set(used)
    for lo, hi in ((1, 99), (100, 999)):
        free = [n for n in range(lo, hi + 1) if n not in used]
        if free:
            return random.choice(free)
    return max(used) + 1


def check_changes(changes: dict) -> dict:
    bad = set(changes) - set(LEARNER_CHANGES)
    if bad:
        raise ValueError(f"a learner's {', '.join(sorted(bad))} cannot be changed")
    return changes



class Store:
    async def open(self) -> None:
        raise NotImplementedError

    async def close(self) -> None:
        raise NotImplementedError

    # questions
    async def add_question(self, *, lang, subject, year, lesson_id, question, answer, source, urgent,
                           waiting, cohort=None, held=False, hints=None) -> str:
        raise NotImplementedError

    async def question_row(self, qid) -> dict | None:
        raise NotImplementedError

    async def question_count(self, cid, since, own=False) -> int:
        raise NotImplementedError

    async def ladder(self, token) -> dict | None:
        raise NotImplementedError

    async def add_ladder(self, token, *, solution, sure) -> None:
        raise NotImplementedError

    async def use_check(self, token, limit=3) -> dict | None:
        raise NotImplementedError

    async def question(self, token) -> dict | None:
        raise NotImplementedError

    async def send_to_teacher(self, token) -> bool:
        raise NotImplementedError

    async def queue(self, limit=50, cohort=None, own=False) -> list[dict]:
        raise NotImplementedError

    async def review(self, qid, *, answer=None, approve=True, hints=None, reuse=True) -> dict | None:
        raise NotImplementedError

    async def approved(self) -> list[dict]:
        raise NotImplementedError

    async def counts(self) -> dict:
        raise NotImplementedError

    async def prune(self, keep_days: int) -> None:
        raise NotImplementedError

    # print jobs
    async def add_print(self, *, lesson_id, kind, copies, lang, seed, device) -> int:
        raise NotImplementedError

    async def set_print(self, pid, status, detail=None, pages=None) -> None:
        raise NotImplementedError

    async def print_job(self, pid) -> dict | None:
        raise NotImplementedError

    async def prints(self, limit=20) -> list[dict]:
        raise NotImplementedError

    async def copies_last_hour(self, device) -> int:
        raise NotImplementedError

    async def fail_unfinished_prints(self) -> None:
        raise NotImplementedError

    # cohorts and flags
    async def seed_cohorts(self, cohorts: list[dict]) -> bool:
        raise NotImplementedError

    async def cohort(self, cid) -> dict | None:
        raise NotImplementedError

    async def cohorts(self) -> list[dict]:
        raise NotImplementedError

    async def flags(self, cid) -> dict[str, dict]:
        raise NotImplementedError

    async def set_flag(self, cid, module, *, enabled, settings=None, changed_by) -> None:
        raise NotImplementedError

    async def flag_log(self, cid, limit=50) -> list[dict]:
        raise NotImplementedError

    async def add_cohort(self, *, id, label, langs, bands, settings) -> bool:
        raise NotImplementedError

    async def set_cohort_settings(self, cid, settings) -> bool:
        raise NotImplementedError

    async def learner_counts(self) -> dict[str, int]:
        raise NotImplementedError

    async def add_admin_log(self, *, cohort, what, detail, changed_by) -> int:
        raise NotImplementedError

    async def admin_log(self, cohort=None, limit=100) -> list[dict]:
        raise NotImplementedError

    # events
    async def add_events(self, rows: list[dict]) -> int:
        raise NotImplementedError

    async def events(self, cid, limit=100) -> list[dict]:
        raise NotImplementedError

    async def events_since(self, cid, since) -> list[dict]:
        raise NotImplementedError

    async def prune_events(self, keep_days: int) -> None:
        raise NotImplementedError

    # AI usage
    async def add_ai_usage(self, *, day, cohort, module, purpose, provider, model, tokens, cost_micro=0,
                           held=False) -> None:
        raise NotImplementedError

    async def ai_usage(self, cid, since=None) -> list[dict]:
        raise NotImplementedError

    async def ai_spent(self, cid, day) -> dict:
        raise NotImplementedError

    async def prune_ai_usage(self, keep_days: int) -> None:
        raise NotImplementedError

    # content
    async def add_signoff(self, *, lesson, content_hash, role, initials, signed_on) -> bool:
        raise NotImplementedError

    async def signoffs(self, lesson) -> list[dict]:
        raise NotImplementedError

    async def all_signoffs(self) -> list[dict]:
        raise NotImplementedError

    async def add_release(self, *, pack, version, content_hash, cohort, released_by) -> int:
        raise NotImplementedError

    # staff and review notes
    async def add_staff(self, *, id_hash, label, role, cohorts, initials) -> None:
        raise NotImplementedError

    async def staff_member(self, id_hash) -> dict | None:
        raise NotImplementedError

    async def remove_staff(self, id_hash) -> bool:
        raise NotImplementedError

    async def staff_list(self) -> list[dict]:
        raise NotImplementedError

    async def add_review_note(self, *, lesson, step, role, step_hash, status, chips, text) -> int:
        raise NotImplementedError

    async def review_notes(self, lesson, role=None) -> list[dict]:
        raise NotImplementedError

    async def releases(self, cohort) -> list[dict]:
        raise NotImplementedError

    # learners
    async def set_class_code(self, cid, code_hash) -> bool:
        raise NotImplementedError

    async def cohort_by_code(self, code_hash) -> dict | None:
        raise NotImplementedError

    async def add_learner(self, *, token_hash, cohort, picture, band, consent_kind=None, consent_version=None,
                          consent_at=None) -> int:
        raise NotImplementedError

    async def learner(self, token_hash) -> dict | None:
        raise NotImplementedError

    async def update_learner(self, token_hash, **changes) -> bool:
        raise NotImplementedError

    async def learners_in(self, cid) -> list[dict]:
        raise NotImplementedError

    async def set_reset_code(self, token_hash, code_hash, expires) -> None:
        raise NotImplementedError

    async def use_reset_code(self, token_hash, code_hash, tries=5) -> str:
        raise NotImplementedError

    async def delete_learner(self, token_hash) -> bool:
        raise NotImplementedError

    async def prune_learners(self, idle_days: int) -> None:
        raise NotImplementedError

    async def add_wish(self, *, cohort, band, lang, wish, wkey) -> int:
        raise NotImplementedError

    async def wishes(self, cohort=None, limit=100) -> list[dict]:
        raise NotImplementedError

    async def set_wish_status(self, wkey, status) -> int:
        raise NotImplementedError


def check_log(*, what, detail, changed_by) -> str:
    """An admin_log row: a known change, a short line the hub wrote, and who by as a label (never an email)."""
    if what not in ADMIN_WHAT:
        raise ValueError(f"what is one of {', '.join(ADMIN_WHAT)}")
    if not isinstance(detail, str) or len(detail) > 300:
        raise ValueError("detail is a line of at most 300 characters")
    if not isinstance(changed_by, str) or not 1 <= len(changed_by) <= 60 or "@" in changed_by:
        raise ValueError("changed_by is a label, never an email")
    return detail


def check_wish_status(status) -> str:
    if status not in WISH_STATUS:
        raise ValueError(f"a wish is {', '.join(WISH_STATUS)}")
    return status


def check_initials(initials) -> str:
    """Initials only, 1 to 4 capital letters: a reviewer's name is never stored."""
    if not isinstance(initials, str) or not re.fullmatch(r"[A-Z]{1,4}", initials):
        raise ValueError("initials are 1 to 4 capital letters, never a name")
    return initials


REVIEW_CHIPS = ("spelling", "word", "maths", "picture", "audio", "too_hard", "unsafe")
REVIEW_STATUS = ("ok", "change", "done")


def check_staff(*, id_hash, label, role, cohorts, initials):
    """A staff row holds a hash, a neutral label, a role, cohort ids and initials: nothing that names a person."""
    if not isinstance(id_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", id_hash):
        raise ValueError("id_hash is the 64-character SHA-256 of the pepper and the email, never the email")
    if not isinstance(label, str) or not 1 <= len(label.strip()) <= 40 or "@" in label:
        raise ValueError("label is a neutral name of 1 to 40 characters, like 'Dari reviewer 2'")
    if not isinstance(role, str) or not 1 <= len(role.strip()) <= 40:
        raise ValueError("role is a reviewer role, teacher or admin")
    if not isinstance(cohorts, (list, tuple)) or not all(isinstance(c, str) for c in cohorts):
        raise ValueError("cohorts is a list of cohort ids")
    if initials != "":
        check_initials(initials)
    return json.dumps(list(cohorts))


def check_note(*, step, status, chips, text):
    if type(step) is not int or not 0 <= step <= 200:
        raise ValueError("step is the step's number, or 0 for the lesson as a whole")
    if status not in REVIEW_STATUS:
        raise ValueError(f"status is one of {', '.join(REVIEW_STATUS)}")
    if not isinstance(chips, (list, tuple)) or not all(c in REVIEW_CHIPS for c in chips):
        raise ValueError(f"chips come from {', '.join(REVIEW_CHIPS)}")
    if not isinstance(text, str) or len(text) > 500:
        raise ValueError("a comment is at most 500 characters")
    return json.dumps(sorted(set(chips)))

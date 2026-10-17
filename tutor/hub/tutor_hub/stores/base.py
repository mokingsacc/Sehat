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
  `LOG_DAYS` (2 years); and the live classes' rows past their time (below); approved answers stay. The hub runs it at start, the Worker also once a day (its cron).

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
- `ai_prices() -> list`: the admin's price table `{provider, model, usd_in, usd_out, changed_at}` (US dollars per
  million tokens; `model` '' for any model of the provider), by provider and model.
- `set_ai_price(*, provider, model, usd_in, usd_out)`: sets one row; with `usd_in` and `usd_out` both None, deletes it.

Content (signoffs and releases, packs.py decides what they mean; kept for good)
- `add_signoff(*, lesson, content_hash, role, initials, signed_on, via="") -> bool`: one reviewer role signing one
  content hash; initials only (1 to 4 capital letters, else ValueError), never a name; `via` is how she signed in,
  `pin` or `access` (C5 M4). Signing the same hash in the same role again changes nothing and returns False.
- `signoffs(lesson) -> list`: `{lesson, content_hash, role, initials, signed_on, added_at, via}`, oldest first.
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
- `contests_done(token_hash) -> {contest: percent}`: from her own `contest.done` events (P31: one a contest, the
  hub writes it), the percent of each contest she sent.
- `contest_takers(cohort, contest, since) -> {token_hash: percent}`: the class's learners who sent a contest's answers
  at or after `since` (its opening minute; her teacher's view and the admin's counts; never sorted by percent).

Her own questions (P32, C4.8): sent for her teacher's check, kept 60 days after sending or deciding, and with her
- `add_made(*, cohort, token_hash, kind, body, lang) -> int`: a waiting row (`body` a dict {q, a, why}).
- `made_mine(token_hash) -> list[dict]`: `{id, status, chips, reply, at, decided_at}`, hers only.
- `made_waiting(cohort, limit=100) -> list[dict]`: `{id, kind, body, lang, at}` waiting in that cohort, oldest first.
- `made_row(mid) -> dict | None`, `decide_made(mid, *, status, chips, reply) -> bool` (only while waiting).

Daily counts (7a, C4.9): what a learner's token did today against a module's limit
- `count_today(token_hash, module) -> int`: one more for today (UTC) and the new count. Rows older than yesterday
  go at the next prune (`COUNT_DAYS`, two days), and with the learner.

Live classes (P30a, C6.1): a class held, with counts only, and who is in the room while it runs; nothing of the sound
- `live_start(*, id, cohort, subject, host, state) -> bool`: a new open session, unless the cohort already has one
  (False). `state` is a dict, kept as JSON; `started_at` and `seen_at` are now, `v` 1.
- `live_session(sid) -> dict | None` and `live_open(cohort) -> dict | None` (the cohort's open session): `{id, cohort,
  subject, host, started_at, ended_at, seen_at, peak, listener_min, v, state}`, `state` as a dict.
- `live_sessions_since(since, cohort=None) -> list`: the sessions started from `since` on (every cohort's when None),
  oldest first, without `state`: the day's budget, the month's estimate and the admin's line are made from them.
- `live_update(sid, *, state=None, bump=False, seen=False, peak=None, add_min=0) -> int | None`: on an open
  session, replaces `state` (a dict), adds one to `v` when `bump`, sets `seen_at` to now when `seen` (the teacher's
  poll), raises `peak` to `peak` when higher, adds `add_min` listened minutes (a learner who left); returns the new
  `v`, or None when the session is not open.
- `live_end(sid, *, add_min=0) -> bool`: ends an open session: `ended_at` now, `listener_min` grows by `add_min`,
  `state` blanked to {}, `v` grows, and every `live_present` row of it deleted, together. False if it was not open.
- `live_join(session, token_hash, ticket)`: her row, made or refreshed: a new ticket at now, `seen_at` now, `joined_at`
  kept from an earlier join.
- `live_ticket(session, token_hash, ticket, since) -> bool`: uses up her ticket if it is this one and was made at
  `since` or later; a ticket works once.
- `live_here(session) -> list`: the room: `{token_hash, picture, number, band, sfu, joined_at, seen_at, hand_at,
  reason}` with her alias from `learners`, by when the hand went up, then by picture and number.
- `live_present(session, token_hash) -> dict | None`: her row.
- `live_seen(session, token_hash) -> bool`; `live_set_sfu(session, token_hash, sfu) -> bool`;
  `live_hand(session, token_hash, reason) -> bool` (a reason 1 to 3 raises it at now, to the millisecond so hands
  keep the order they went up in; None lowers it);
  `live_lower_all(session) -> int`.
- `live_leave(session, token_hash) -> dict | None`: deletes her row and returns its `{joined_at, seen_at}`.
- The retention job's part is in `prune()`: it ends every open session whose teacher has not polled for
  `LIVE_IDLE_MIN` (10) minutes or that began more than `LIVE_LONGEST_MIN` (105) minutes ago, adding its room's minutes
  and deleting its room; deletes `live_present` rows of learners who joined more than `LIVE_PRESENT_HOURS` (6) ago,
  and sessions that ended more than `LIVE_DAYS` (365) days ago.
"""

import json
import random
import re
import secrets

WISH_DAYS = 90             # a wish not asked for again in 90 days is deleted (BUILD-PLAN 3.4)
WISH_MAX = 200            # characters of a wish kept
WISH_STATUS = ("new", "planned", "not_for_qalam")
COUNT_DAYS = 2            # daily_counts: today and yesterday (C4.9)
MADE_DAYS = 60            # made: 60 days after it was sent or decided (C4.8)
MADE_KINDS = ("question",)
MADE_STATUS = ("waiting", "ok", "change")
MADE_CHIPS = ("spelling", "answer_wrong", "unclear", "unsafe", "not_school")
MADE_MAX = 300            # characters of a question, its answer or its why
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
CERT_ID = re.compile(r"^QC-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$")
LIVE_DAYS = 365           # live_sessions: 12 months (C6.1)
LIVE_PRESENT_HOURS = 6    # live_present: deleted when the class ends, and after 6 hours at most
LIVE_IDLE_MIN = 10        # a class whose teacher has not polled for 10 minutes is ended
LIVE_LONGEST_MIN = 105    # nor does any class outlive the longest max_minutes (90) and 15 minutes
LIVE_REASONS = (1, 2, 3)  # a raised hand's reason: a chip code, never text
LOG_DAYS = 730            # flag_log and admin_log are kept 2 years (BUILD-PLAN 3.4)
ADMIN_WHAT = ("cohort.new", "cohort.settings", "cohort.kill", "cohort.code", "release", "rollback", "wish",
              "staff.add", "staff.remove", "teacher.lock_code", "prices")   # C5: a teacher's lock code; AI prices
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

    async def ai_prices(self) -> list[dict]:
        raise NotImplementedError

    async def set_ai_price(self, *, provider, model, usd_in, usd_out) -> None:
        raise NotImplementedError

    # content
    async def add_signoff(self, *, lesson, content_hash, role, initials, signed_on, via="") -> bool:
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

    async def contests_done(self, token_hash) -> dict:
        raise NotImplementedError

    async def contest_takers(self, cohort, contest, since) -> dict:
        raise NotImplementedError

    async def add_made(self, *, cohort, token_hash, kind, body, lang) -> int:
        raise NotImplementedError

    async def made_mine(self, token_hash) -> list[dict]:
        raise NotImplementedError

    async def made_waiting(self, cohort, limit=100) -> list[dict]:
        raise NotImplementedError

    async def made_row(self, mid) -> dict | None:
        raise NotImplementedError

    async def decide_made(self, mid, *, status, chips, reply) -> bool:
        raise NotImplementedError
    async def live_start(self, *, id, cohort, subject, host, state) -> bool:
        raise NotImplementedError
    async def live_session(self, sid) -> dict | None:
        raise NotImplementedError
    async def live_open(self, cohort) -> dict | None:
        raise NotImplementedError
    async def live_sessions_since(self, since, cohort=None) -> list[dict]:
        raise NotImplementedError
    async def live_update(self, sid, *, state=None, bump=False, seen=False, peak=None, add_min=0) -> int | None:
        raise NotImplementedError
    async def live_end(self, sid, *, add_min=0) -> bool:
        raise NotImplementedError
    async def live_join(self, session, token_hash, ticket) -> None:
        raise NotImplementedError
    async def live_ticket(self, session, token_hash, ticket, since) -> bool:
        raise NotImplementedError
    async def live_here(self, session) -> list[dict]:
        raise NotImplementedError
    async def live_present(self, session, token_hash) -> dict | None:
        raise NotImplementedError
    async def live_seen(self, session, token_hash) -> bool:
        raise NotImplementedError
    async def live_set_sfu(self, session, token_hash, sfu) -> bool:
        raise NotImplementedError
    async def live_hand(self, session, token_hash, reason) -> bool:
        raise NotImplementedError
    async def live_lower_all(self, session) -> int:
        raise NotImplementedError
    async def live_leave(self, session, token_hash) -> dict | None:
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


SIGNED_VIA = ("", "pin", "access")
PRICE_MAX = 10_000.0                       # US dollars per million tokens: anything above is a typing slip


def check_via(via) -> str:
    """How a signature was made (C5 M4): the hub's shared PIN, a named Access sign-in, or '' (not known)."""
    if via not in SIGNED_VIA:
        raise ValueError("via is pin or access")
    return via


def check_price(*, provider, model, usd_in, usd_out) -> tuple:
    """One row of the admin's AI price table: a known provider, a model name (or '' for any), two prices."""
    from ..ai.policy import PROVIDERS
    if provider not in PROVIDERS:
        raise ValueError(f"provider is one of {', '.join(PROVIDERS)}")
    model = model or ""
    if not isinstance(model, str) or len(model) > 80 or not re.fullmatch(r"[A-Za-z0-9._:/@-]*", model):
        raise ValueError("a model name is letters, digits and . _ : / @ -, at most 80")
    out = []
    for v in (usd_in, usd_out):
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not 0 <= v <= PRICE_MAX:
            raise ValueError(f"a price is US dollars per million tokens, 0 to {PRICE_MAX:g}")
        out.append(float(v))
    return (provider, model, out[0], out[1])


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


def check_made(*, kind, body, lang) -> str:
    """A learner's own question: {q, a, why} of at most 300 characters each, q and a not empty; JSON for the row."""
    if kind not in MADE_KINDS:
        raise ValueError(f"kind is one of {', '.join(MADE_KINDS)}")
    if lang not in ("prs", "ps", "en"):
        raise ValueError("lang is prs, ps or en")
    if not isinstance(body, dict) or set(body) - {"q", "a", "why"}:
        raise ValueError("body is {q, a, why}")
    if not all(isinstance(body.get(k, ""), str) and len(body.get(k, "")) <= MADE_MAX for k in ("q", "a", "why")):
        raise ValueError(f"each part is at most {MADE_MAX} characters")
    if not (body.get("q") or "").strip() or not (body.get("a") or "").strip():
        raise ValueError("a question and its answer")
    return json.dumps({k: body.get(k, "") for k in ("q", "a", "why")}, ensure_ascii=False)


def check_verdict(*, status, chips, reply) -> str:
    if status not in ("ok", "change"):
        raise ValueError("status is ok or change")
    if not isinstance(chips, (list, tuple)) or not all(c in MADE_CHIPS for c in chips):
        raise ValueError(f"chips come from {', '.join(MADE_CHIPS)}")
    if reply is not None and (not isinstance(reply, str) or len(reply) > MADE_MAX):
        raise ValueError(f"a reply is at most {MADE_MAX} characters")
    return json.dumps(sorted(set(chips)))


def live_out(r: dict | None) -> dict | None:
    """A `live_sessions` row with its `state` as a dict."""
    if r is None:
        return None
    out = dict(r)
    if isinstance(out.get("state"), str):
        out["state"] = json.loads(out["state"] or "{}")
    return out


def check_live_state(state) -> str:
    """A session's state as JSON: a dict of at most 2,000 characters (the audio, the board, the floor, the relay's
    session id), never a name."""
    if not isinstance(state, dict):
        raise ValueError("a live session's state is a dict")
    s = json.dumps(state, ensure_ascii=False, sort_keys=True)
    if len(s) > 2000:
        raise ValueError("a live session's state is at most 2,000 characters")
    return s


def check_reason(reason):
    if reason is not None and reason not in LIVE_REASONS:
        raise ValueError("a hand's reason is 1, 2 or 3")
    return reason


def made_out(r: dict | None) -> dict | None:
    if r is None:
        return None
    out = dict(r)
    if "body" in out and isinstance(out["body"], str):
        out["body"] = json.loads(out["body"])
    if "chips" in out and isinstance(out["chips"], str):
        out["chips"] = json.loads(out["chips"])
    return out


def live_prune_sql(now_iso: str, idle_iso: str, longest_iso: str, present_iso: str, old_iso: str) -> list[tuple]:
    """The retention job's statements for the live tables, in order, with their arguments: the same SQL on SQLite
    and D1. A stale session's room minutes are added before its room is deleted."""
    stale = "ended_at IS NULL AND (seen_at<? OR started_at<?)"
    minutes = ("COALESCE((SELECT SUM(MAX(0, CAST(ROUND((julianday(p.seen_at)-julianday(p.joined_at))*1440) AS INTEGER))) "
               "FROM live_present p WHERE p.session=live_sessions.id), 0)")
    return [(f"UPDATE live_sessions SET listener_min=listener_min+{minutes}, ended_at=?, state='{{}}', v=v+1 WHERE {stale}",
             (now_iso, idle_iso, longest_iso)),
            ("DELETE FROM live_present WHERE joined_at<? OR session NOT IN "
             "(SELECT id FROM live_sessions WHERE ended_at IS NULL)", (present_iso,)),
            ("DELETE FROM live_sessions WHERE ended_at IS NOT NULL AND ended_at<?", (old_iso,))]


def live_prune_times() -> tuple:
    from datetime import datetime, timedelta, timezone
    t = datetime.now(timezone.utc)
    iso = lambda x: x.isoformat(timespec="seconds")      # noqa: E731
    return (iso(t), iso(t - timedelta(minutes=LIVE_IDLE_MIN)), iso(t - timedelta(minutes=LIVE_LONGEST_MIN)),
            iso(t - timedelta(hours=LIVE_PRESENT_HOURS)), iso(t - timedelta(days=LIVE_DAYS)))

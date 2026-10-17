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
- `add_question(*, lang, subject, year, lesson_id, question, answer, source, urgent, waiting) -> token`: a question
  that is `waiting` or `urgent` goes to the teacher's list; status is "waiting" when `waiting`, else "answered".
- `question(token) -> dict | None`.
- `send_to_teacher(token) -> bool`: puts an answered or waiting question on the teacher's list; False if there is
  no such open question.
- `queue(limit=50) -> list`: the teacher's list: urgent first, then unanswered, then oldest first.
- `review(qid, *, answer=None, approve=True) -> dict | None`: approving with an answer (or the shown answer) marks
  it reviewed and, unless it was urgent or a rules message, adds it to the approved answers; otherwise it is
  rejected. None if there is no such question.
- `approved() -> list`: every approved answer, oldest first.
- `counts() -> dict`: the last day's `asked_today`, `checked_today`, `ai_today`, `for_teacher`, `pages_today`,
  and all `approved_answers`.
- `add_ladder(token, *, solution, sure)`: the private answer behind a question's hint ladder (P15), never sent to a
  phone; `sure` is False when the model's two runs disagreed.
- `use_check(token, limit=3) -> dict | None`: one "Check my answer" try: `{solution, sure, checks, used}`, with
  `used` False (and nothing counted) once `limit` tries are spent; None when the question has no ladder.
- `prune(keep_days)`: deletes questions, their ladders and print jobs older than `keep_days`; approved answers
  stay.

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

Events (events.py decides what may be in them)
- `add_events(rows) -> int`: appends every row, all or none, and returns how many. A row has exactly the keys
  `at, token_hash, cohort, module, verb, object, value` (`EVENT_FIELDS`); a row with any other key, or without one
  of these, raises ValueError and nothing is written, so no stray field (a name, free text) can reach the table.
  `at` is the caller's UTC minute, kept as given.
- `events(cid, limit=100) -> list`: the cohort's events, newest first (by `at`, then the order they were added).
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
- `add_release(*, pack, version, content_hash, cohort, released_by) -> id`: a pack version published to a cohort;
  `released_by` is a role.
- `releases(cohort) -> list`: the cohort's releases, newest first.

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
- `delete_learner(token_hash) -> bool`: deletes the learner and every event carrying her token's hash, together.
- `prune_learners(idle_days)`: deletes learners not seen for `idle_days` days, with their events.
"""

import random
import re

EVENT_FIELDS = ("at", "token_hash", "cohort", "module", "verb", "object", "value")
LEARNER_CHANGES = ("band", "consent_kind", "consent_version", "consent_at", "last_seen")


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
                           waiting) -> str:
        raise NotImplementedError

    async def add_ladder(self, token, *, solution, sure) -> None:
        raise NotImplementedError

    async def use_check(self, token, limit=3) -> dict | None:
        raise NotImplementedError

    async def question(self, token) -> dict | None:
        raise NotImplementedError

    async def send_to_teacher(self, token) -> bool:
        raise NotImplementedError

    async def queue(self, limit=50) -> list[dict]:
        raise NotImplementedError

    async def review(self, qid, *, answer=None, approve=True) -> dict | None:
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

    # events
    async def add_events(self, rows: list[dict]) -> int:
        raise NotImplementedError

    async def events(self, cid, limit=100) -> list[dict]:
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

    async def add_release(self, *, pack, version, content_hash, cohort, released_by) -> int:
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

    async def delete_learner(self, token_hash) -> bool:
        raise NotImplementedError

    async def prune_learners(self, idle_days: int) -> None:
        raise NotImplementedError


def check_initials(initials) -> str:
    """Initials only, 1 to 4 capital letters: a reviewer's name is never stored."""
    if not isinstance(initials, str) or not re.fullmatch(r"[A-Z]{1,4}", initials):
        raise ValueError("initials are 1 to 4 capital letters, never a name")
    return initials

-- 0003_events: what learners did, without names (BUILD-PLAN 3.4, P4).
-- Append-only. A row holds a verb from events.py's fixed list and ids only: never a name, sex, birth date, phone
-- number, address or free text (tests/test_events.py scans every table for such columns). Kept 12 months.

CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,                    -- UTC to the minute, like 2026-10-16T09:41
  token_hash TEXT,                     -- the learner's token, hashed (P10); empty until learners have tokens
  cohort TEXT NOT NULL,
  module TEXT NOT NULL,
  verb TEXT NOT NULL,                  -- from events.py's list, like lesson.done
  object TEXT,                         -- an id (a lesson, an answer source), never free text
  value INTEGER                        -- a count or a score, when the verb has one
);
CREATE INDEX IF NOT EXISTS events_cohort_at ON events(cohort, at);

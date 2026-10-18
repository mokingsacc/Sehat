-- 0002_cohorts: cohorts and their module switches (BUILD-PLAN 3.3, P1).
-- A cohort's id is random and its label neutral: no field may say who is in it (F4). Seed files fill these tables
-- once, when they are empty; after that only the admin panel changes flags, and every change is also in flag_log.

CREATE TABLE IF NOT EXISTS cohorts(
  id TEXT PRIMARY KEY,                 -- random lower-case letters and digits
  label TEXT NOT NULL,                 -- neutral words only
  code_hash TEXT UNIQUE,               -- the class code, hashed (P10); empty for cohorts joined without one
  langs TEXT NOT NULL,                 -- JSON list: prs, ps, en
  bands TEXT NOT NULL,                 -- JSON list: ey, p1, p2, s1, s2, ad
  settings TEXT NOT NULL DEFAULT '{}', -- JSON object, checked by flags.py
  created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS flags(
  module TEXT NOT NULL,
  cohort TEXT NOT NULL REFERENCES cohorts(id),
  enabled INTEGER NOT NULL DEFAULT 0,  -- no row means off
  settings TEXT NOT NULL DEFAULT '{}', -- JSON object of the module's settings for this cohort
  changed_by TEXT NOT NULL,            -- a role (seed, admin, teacher), never a person's name
  changed_at TEXT NOT NULL,
  PRIMARY KEY(cohort, module)
);
CREATE TABLE IF NOT EXISTS flag_log(
  id INTEGER PRIMARY KEY,
  module TEXT NOT NULL,
  cohort TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  settings TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL             -- kept 2 years
);
CREATE INDEX IF NOT EXISTS flag_log_cohort ON flag_log(cohort, id);

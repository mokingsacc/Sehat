-- 0006_learners: learners known to the server, without names (BUILD-PLAN 3.4, P10).
-- A learner is a random token (only its SHA-256 is kept), her cohort, her band and her alias: a picture her phone
-- picked from content/aliases.json and a number the server drew ("Book 27"), so a teacher can tell learners apart.
-- Never a name, a nickname, sex, birth date, school status, phone number or place. The consent record keeps its
-- kind, the text version and the minute, never who gave it. Deleted on her request (DELETE /api/me) or after 12
-- months without being seen.

CREATE TABLE IF NOT EXISTS learners(
  token_hash TEXT PRIMARY KEY,         -- sha256 of the learner's token; the token itself stays on her phone
  cohort TEXT NOT NULL REFERENCES cohorts(id),
  picture TEXT NOT NULL,               -- an id from content/aliases.json
  number INTEGER NOT NULL,             -- drawn by the server, unique for the picture in the cohort
  band TEXT NOT NULL,                  -- ey, p1, p2, s1, s2, ad
  consent_kind TEXT,                   -- guardian-on-phone, self or partner-paper; empty until given
  consent_version TEXT,                -- the consent text's version, as content/consent names it
  consent_at TEXT,                     -- UTC minute
  joined TEXT NOT NULL,                -- UTC day
  last_seen TEXT NOT NULL,             -- UTC day
  UNIQUE(cohort, picture, number)
);
CREATE INDEX IF NOT EXISTS learners_seen ON learners(last_seen);
CREATE INDEX IF NOT EXISTS events_token ON events(token_hash);

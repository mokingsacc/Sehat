-- 0010_review: the review screens (P17, C3.4) and who may use the staff pages (C3.2).
-- `staff` keeps no email: `id_hash` is SHA-256 over a server-side pepper (TUTOR_STAFF_PEPPER, never in D1) and the
-- lower-cased email that Cloudflare Access vouches for (C3.2 calls it email_hash). Cloudflare Access alone holds the
-- emails. `label` is neutral and chosen by the admin ("Dari reviewer 2"), `role` a reviewer role a lesson's
-- review.needs names ("Dari reader", "maths teacher"), or teacher or admin; `initials` are what a signoff carries.
-- `review_notes` keeps each reviewer role's verdict on each lesson step: OK, or a change asked for with chips and a
-- comment, against the step's own hash, so a step changed since shows "changed". Kept for good, like signoffs.
-- The `review` module is switched on for the staging seed cohort (the reviewers' cohort) in a database seeded
-- before this file, as 0008 did for photo.

CREATE TABLE IF NOT EXISTS staff(
  id_hash TEXT PRIMARY KEY,            -- sha256 hex of pepper + lower-cased email
  label TEXT NOT NULL,                 -- neutral: "Dari reviewer 2"
  role TEXT NOT NULL,                  -- a reviewer role, teacher or admin
  cohorts TEXT NOT NULL DEFAULT '[]',  -- JSON list of cohort ids
  initials TEXT NOT NULL DEFAULT '',   -- 1 to 4 capital letters
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_notes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson TEXT NOT NULL,
  step INTEGER NOT NULL,               -- 1-based; 0 is the lesson as a whole (the sheet, cards, sources)
  role TEXT NOT NULL,
  step_hash TEXT NOT NULL,             -- sha256:... of the step as it was reviewed
  status TEXT NOT NULL,                -- ok, change (asked, open) or done (dealt with)
  chips TEXT NOT NULL DEFAULT '[]',    -- spelling, word, maths, picture, audio, too_hard, unsafe
  text TEXT NOT NULL DEFAULT '',       -- the reviewer's comment on the content, at most 500 characters
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS review_notes_lesson ON review_notes(lesson, role, step, id);

INSERT OR IGNORE INTO flags(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT 'review', id, 1, '{}', 'seed', strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
  FROM cohorts WHERE id = 'qg1j2918yx';

INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT f.module, f.cohort, f.enabled, f.settings, f.changed_by, f.changed_at FROM flags f
  WHERE f.module = 'review'
    AND NOT EXISTS (SELECT 1 FROM flag_log l WHERE l.module = 'review' AND l.cohort = f.cohort);

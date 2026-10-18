-- 0009_homework: hints, never answers, in Ask (P15, C2.3). An exercise asked in Ask gets a hint ladder; the answer
-- behind it (worked out exactly by code, or by the model twice in Homework help) is kept here beside the question's
-- token for "Check my answer" and is never sent to a phone. Three checks per question. Deleted with the question
-- (TUTOR_KEEP_DAYS). No name, no learner: the token is the question's, as in `questions`.
-- The `homework` module is switched on for the staging seed cohort in a database seeded before this file, as 0008
-- did for photo; every other cohort keeps it off until the admin turns it on.

CREATE TABLE IF NOT EXISTS ladders(
  token TEXT PRIMARY KEY,              -- the question's token (questions.token)
  solution TEXT NOT NULL,              -- the private answer: never in a reply
  sure INTEGER NOT NULL,               -- 1: worked out by code, or both runs agreed; 0: the runs disagreed
  checks INTEGER NOT NULL DEFAULT 0,   -- "Check my answer" tries used, at most 3
  created TEXT NOT NULL
);

INSERT OR IGNORE INTO flags(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT 'homework', id, 1, '{}', 'seed', strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
  FROM cohorts WHERE id = 'qg1j2918yx';

INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT f.module, f.cohort, f.enabled, f.settings, f.changed_by, f.changed_at FROM flags f
  WHERE f.module = 'homework'
    AND NOT EXISTS (SELECT 1 FROM flag_log l WHERE l.module = 'homework' AND l.cohort = f.cohort);

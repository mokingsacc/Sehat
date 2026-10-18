-- 0013_plan: "I want to learn this" and the wishlist (P22, C3.5 and DESIGN-C2C3-SPECS item 14).
-- A goal that matches no lesson is kept here, screened by the rules and the identifier filter, without the token or
-- anything else about who typed it: the cohort, the band, the language, the text and how many asked for it, with
-- the first and last day only. Kept 90 days after it was last asked for (BUILD-PLAN 3.4); the teacher's Wishes tab
-- and the admin read it. A database seeded before this file gets the `plan` module for the three seed cohorts (C2.8:
-- `open` too), logged as changed by "seed", as the seed files' rows are.

CREATE TABLE IF NOT EXISTS wishlist(
  cohort TEXT NOT NULL,
  band TEXT NOT NULL,
  lang TEXT NOT NULL,
  wish TEXT NOT NULL,                  -- the screened text, as first typed
  wkey TEXT NOT NULL,                  -- its search form, so the same wish counts once
  count INTEGER NOT NULL DEFAULT 1,
  first_day TEXT NOT NULL,             -- YYYY-MM-DD
  last_day TEXT NOT NULL,
  PRIMARY KEY(cohort, band, lang, wkey)
);

INSERT OR IGNORE INTO flags(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT 'plan', id, 1, '{}', 'seed', strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
  FROM cohorts WHERE id IN ('d6co6etep6', 'qg1j2918yx', '3w2lco2s8f');

INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT f.module, f.cohort, f.enabled, f.settings, f.changed_by, f.changed_at FROM flags f
  WHERE f.module = 'plan'
    AND NOT EXISTS (SELECT 1 FROM flag_log l WHERE l.module = 'plan' AND l.cohort = f.cohort);

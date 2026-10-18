-- 0016_cert: certificates (P25b, C4.2) and the daily counts per learner (7a, C4.9).
-- A certificate row says that someone finished a pathway in a month, and nothing about who: no token hash, alias,
-- band, day, name or name hash (a hash of a name is reversed with a list of names in seconds). Kept for good, so
-- /v/<id> can answer. The id is `QC-` and ten Crockford base32 characters (50 random bits), made by the store.
-- `daily_counts` counts what a learner's token did today (photos read, certificates asked for) against a module's
-- daily limit; kept two days, and deleted with her.
-- A database seeded before this file gets the `cert` module for the three seed cohorts (C4.2: on wherever a
-- pathway with a certificate is served, `open` included) and the open cohort's photo limit of five a day (C4.9),
-- logged as changed by "seed", as the seed files' rows are.

CREATE TABLE IF NOT EXISTS certificates(
  id TEXT PRIMARY KEY,                 -- QC-7K3M9-TQX2A
  course TEXT NOT NULL,                -- the pathway's id
  version TEXT NOT NULL,               -- its skills graph's version
  month TEXT NOT NULL,                 -- YYYY-MM (UTC), never the day
  cohort TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_counts(
  token_hash TEXT NOT NULL,
  day TEXT NOT NULL,                   -- YYYY-MM-DD (UTC)
  module TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(token_hash, day, module)
);

INSERT OR IGNORE INTO flags(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT 'cert', id, 1, '{}', 'seed', strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
  FROM cohorts WHERE id IN ('d6co6etep6', 'qg1j2918yx', '3w2lco2s8f');

UPDATE flags SET settings = '{"per_day": 5}', changed_by = 'seed',
  changed_at = strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
  WHERE module = 'photo' AND cohort = '3w2lco2s8f' AND settings = '{}';

INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT f.module, f.cohort, f.enabled, f.settings, f.changed_by, f.changed_at FROM flags f
  WHERE (f.module = 'cert' AND NOT EXISTS (SELECT 1 FROM flag_log l WHERE l.module = 'cert' AND l.cohort = f.cohort))
     OR (f.module = 'photo' AND f.cohort = '3w2lco2s8f' AND f.settings = '{"per_day": 5}'
         AND NOT EXISTS (SELECT 1 FROM flag_log l WHERE l.module = 'photo' AND l.cohort = f.cohort
                         AND l.settings = '{"per_day": 5}'));

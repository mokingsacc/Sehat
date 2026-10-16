-- 0008_photo_flag: photo marking of Qalam sheets (P14, C2.2). A new database has no cohorts yet when this runs, so
-- nothing happens here and the seed files set `photo` (on for staging, off for the hub and open). A database seeded
-- before this file gets the staging seed cohort's row, so staging can try photos; every other cohort keeps photo off
-- (no row is off). Rows only, no schema change; the row is logged as changed by "seed", as the seed files' are.

INSERT OR IGNORE INTO flags(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT 'photo', id, 1, '{}', 'seed', strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
  FROM cohorts WHERE id = 'qg1j2918yx';

INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT f.module, f.cohort, f.enabled, f.settings, f.changed_by, f.changed_at FROM flags f
  WHERE f.module = 'photo'
    AND NOT EXISTS (SELECT 1 FROM flag_log l WHERE l.module = 'photo' AND l.cohort = f.cohort);

-- 0007_sheets_flag: the `sheets` module splits from `print` (C2, change 6). Sheets, keys, "Get the sheet" and the
-- lesson-end card now belong to `sheets`, on which `print` (the hub's queue) and `check` depend. A cohort made before
-- this file keeps what it had: `sheets` is switched on wherever `print` or `check` was. A new database has no flags
-- yet when this runs, so nothing happens here and the seed files switch `sheets` on. Rows only, no schema change;
-- each row is logged as changed by "seed", as the seed files' are.

INSERT OR IGNORE INTO flags(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT 'sheets', cohort, MAX(enabled), '{}', 'seed', strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
  FROM flags WHERE module IN ('print', 'check') GROUP BY cohort;

INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT f.module, f.cohort, f.enabled, f.settings, f.changed_by, f.changed_at FROM flags f
  WHERE f.module = 'sheets'
    AND NOT EXISTS (SELECT 1 FROM flag_log l WHERE l.module = 'sheets' AND l.cohort = f.cohort);

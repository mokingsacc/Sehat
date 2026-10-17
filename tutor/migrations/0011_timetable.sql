-- 0011_timetable: the virtual school day (P19; C2.4 and C3.1). The school day comes from the cohort's `timetable`
-- setting, a template per band ("default" names the core's own, hub/tutor_hub/timetable.py), and the `timetable`
-- module serves it to phones without a token. A new database has no cohorts yet when this runs, so nothing happens
-- here and the seed files set both. A database seeded before this file gets them for the three seed cohorts (the
-- hub's, staging and open: C2.8 puts the school day in `open`), the module logged as changed by "seed", as the seed
-- files' rows are. Every other cohort keeps no school day until the admin gives it one. Rows only, no schema change.
-- Switching `timetable` off for a cohort is the kill switch "school day and bells off" (BUILD-PLAN 3.3).

UPDATE cohorts SET settings = json_set(settings, '$.timetable', 'default')
  WHERE id IN ('d6co6etep6', 'qg1j2918yx', '3w2lco2s8f') AND json_extract(settings, '$.timetable') IS NULL;

INSERT OR IGNORE INTO flags(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT 'timetable', id, 1, '{}', 'seed', strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
  FROM cohorts WHERE id IN ('d6co6etep6', 'qg1j2918yx', '3w2lco2s8f');

INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT f.module, f.cohort, f.enabled, f.settings, f.changed_by, f.changed_at FROM flags f
  WHERE f.module = 'timetable'
    AND NOT EXISTS (SELECT 1 FROM flag_log l WHERE l.module = 'timetable' AND l.cohort = f.cohort);

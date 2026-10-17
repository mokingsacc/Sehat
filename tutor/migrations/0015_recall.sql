-- 0015_recall: spaced review (P25a, C4.1). Nothing is kept on the server: her items, boxes and due days live on the
-- phone, and only the event `recall.item` (lesson:n, 0 or 1) leaves it, with consent. A database seeded before this
-- file gets the `recall` module for `open` and staging, logged as changed by "seed", as the seed files' rows are; the
-- pilot cohort (`hub`) gets it after its report (C4.1), by the admin.

INSERT OR IGNORE INTO flags(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT 'recall', id, 1, '{}', 'seed', strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')
  FROM cohorts WHERE id IN ('qg1j2918yx', '3w2lco2s8f');

INSERT INTO flag_log(module, cohort, enabled, settings, changed_by, changed_at)
  SELECT f.module, f.cohort, f.enabled, f.settings, f.changed_by, f.changed_at FROM flags f
  WHERE f.module = 'recall'
    AND NOT EXISTS (SELECT 1 FROM flag_log l WHERE l.module = 'recall' AND l.cohort = f.cohort);

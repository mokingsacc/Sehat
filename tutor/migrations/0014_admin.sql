-- 0014_admin: the admin panel (P21, C3.3 and DESIGN-C2C3-SPECS item 12).
-- `admin_log` keeps every change the admin makes that is not a module switch (those are in flag_log already): a new
-- cohort, its settings and kill switches, a new class code, a release or a rollback, a wish marked, a staff row added
-- or removed. `what` is a fixed word, `detail` a line the hub writes itself (a setting's old and new value, a pack
-- and version, a staff label and role), never a learner and never an email; `changed_by` is the admin's neutral
-- label, as flag_log's is. Kept 2 years, like flag_log (store.prune).
-- `wishlist.status` is the admin's mark on a wish, across cohorts: new, planned or not_for_qalam.
-- Columns and a table only; no row changes.

CREATE TABLE IF NOT EXISTS admin_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,                    -- UTC ISO time, to the second
  cohort TEXT,                         -- the cohort it concerns; empty for staff and other changes to no cohort
  what TEXT NOT NULL,                  -- cohort.new, cohort.settings, cohort.kill, cohort.code, release, rollback,
                                       -- wish, staff.add, staff.remove
  detail TEXT NOT NULL DEFAULT '',     -- written by the hub: "daily budget 300000 -> 500000", never typed free text
  changed_by TEXT NOT NULL             -- the admin's label (admin:<label>), never a name or an email
);
CREATE INDEX IF NOT EXISTS admin_log_cohort ON admin_log(cohort, id);

ALTER TABLE wishlist ADD COLUMN status TEXT NOT NULL DEFAULT 'new';

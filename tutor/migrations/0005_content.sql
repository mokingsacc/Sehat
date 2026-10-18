-- 0005_content: who signed which content, and which pack version each cohort was given (BUILD-PLAN 3.4 and 4.2, P8).
-- A signoff is one reviewer role signing one lesson's content hash: any later change to the lesson gives it a new
-- hash, so the old signoffs no longer count. Initials only, never a name. Signoffs are mirrored into the pack (the
-- lesson's review block), which is what the hub checks before it serves a lesson in release mode.
-- A release is a pack version, by its content hash, published to a cohort by a role (never a person's name).
-- Both kept for good.

CREATE TABLE IF NOT EXISTS signoffs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson TEXT NOT NULL,                -- a lesson id, or links:<card id>
  content_hash TEXT NOT NULL,          -- sha256:... of the content signed
  role TEXT NOT NULL,                  -- Dari reader, Pashto reader, maths teacher, Hanafi scholar, adult educator
  initials TEXT NOT NULL,              -- 1 to 4 capital letters
  signed_on TEXT NOT NULL,             -- YYYY-MM-DD
  added_at TEXT NOT NULL,
  UNIQUE(lesson, content_hash, role)
);
CREATE INDEX IF NOT EXISTS signoffs_lesson ON signoffs(lesson, content_hash);

CREATE TABLE IF NOT EXISTS releases(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack TEXT NOT NULL,
  version TEXT NOT NULL,
  content_hash TEXT NOT NULL,          -- the pack's hash (packs.Library.pack_hash)
  cohort TEXT NOT NULL,
  released_by TEXT NOT NULL,           -- a role: admin
  released_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS releases_cohort ON releases(cohort, pack, id);

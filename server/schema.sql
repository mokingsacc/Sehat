-- Cloudflare D1 schema for Family Health Book usage counts (anonymous).
CREATE TABLE IF NOT EXISTS installs (
  iid TEXT PRIMARY KEY,          -- random id made on the phone, no personal data
  first_ts INTEGER, last_ts INTEGER,
  lang TEXT, plat TEXT, standalone INTEGER, version TEXT
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iid TEXT, t TEXT, p TEXT, l TEXT, ms INTEGER, ts INTEGER, day TEXT
);
CREATE INDEX IF NOT EXISTS ev_day ON events(day);
CREATE INDEX IF NOT EXISTS ev_t ON events(t, day);
CREATE INDEX IF NOT EXISTS ev_iid ON events(iid, ts);
CREATE INDEX IF NOT EXISTS ev_ts ON events(ts);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iid TEXT, ts INTEGER, lang TEXT, version TEXT, page TEXT,
  text TEXT, audio BLOB, type TEXT, status TEXT DEFAULT 'new'
);
-- Book content published from /admin: the row 'overlay' is what phones download (the editor's changes, js/overlay.js).
-- Rows 'draft', 'base' and 'published' hold whole books from before 8 October 2026 (read once to move an old draft over).
-- A big text is kept in pieces: rows '<name>#<id>#<n>' (server/worker.js writeDoc).
CREATE TABLE IF NOT EXISTS content (
  name TEXT PRIMARY KEY,         -- 'overlay', or an old 'draft', 'base' or 'published'
  body TEXT NOT NULL,            -- JSON
  version TEXT, built TEXT, updated_ts INTEGER
);
-- The editor's changes, one row per changed part ("unit") of the book: the editor page lays them over the app's own
-- newest book, and Publish sends them to phones as the overlay. The server never reads or writes the whole book.
-- Keys starting with # are the editor's own notes: #retired (ids never to be used again), #rev (time of the last change),
-- #legacy (an old draft was moved over).
CREATE TABLE IF NOT EXISTS edit_unit (
  k TEXT PRIMARY KEY,            -- topic:<id>, list:<name>, home, ui:<key>, say:<key>, facilities, search:<id>
  v TEXT NOT NULL,               -- the editor's version as JSON ('null' = removed)
  base TEXT NOT NULL DEFAULT '', -- fingerprint of the app's version it was edited from
  ts INTEGER NOT NULL,           -- when it was last saved
  say TEXT,                      -- topics: their spoken lines as JSON, made from the topic when it is saved
  err TEXT                       -- the check of this part when it was saved: {"errors":[...],"warnings":[...]}
);
-- Narration clips uploaded in the editor, served at /a/<slot>/<id>?v=<hash>.
-- "lang" holds the slot: language and voice, e.g. fa-f (Dari, woman) or ps-m (Pashto, man). Older rows with just "fa" count as fa-f.
CREATE TABLE IF NOT EXISTS audio (
  lang TEXT NOT NULL, id TEXT NOT NULL,
  type TEXT, hash TEXT, data BLOB, size INTEGER, ts INTEGER,
  PRIMARY KEY (lang, id)
);
-- People Mo has given their own link to (/people). The owner's DASH_KEY is not in here and always works.
-- Only a SHA-256 hash of each personal key is kept, never the key itself.
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,            -- 'editor' (can change and publish the book) or 'viewer' (can only look)
  key_hash TEXT NOT NULL UNIQUE, -- hex SHA-256 of the personal key
  created INTEGER, last_used INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0
);
-- Who changed the book, and when (shown to the owner on /people). Only names and actions, no content.
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER, who TEXT, role TEXT, action TEXT, detail TEXT
);
-- ===== Disease watch (server/surveillance.js). Append-only: the code only INSERTs; the triggers refuse UPDATE and DELETE. =====
-- One row per report from a phone: "someone in my home has this now". No names, no GPS, no free text.
CREATE TABLE IF NOT EXISTS surv_reports (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  rid TEXT NOT NULL UNIQUE,      -- random report id made on the phone (the same report sent twice is ignored)
  iid TEXT NOT NULL,             -- the app's random install id
  syndrome TEXT NOT NULL,        -- id from content/src/syndromes.json
  def_version INTEGER NOT NULL,  -- version of that syndrome's case definition on the phone
  place TEXT NOT NULL,           -- district or province id from content/src/districts.json
  age TEXT NOT NULL,             -- 'u5', '5-14' or '15+'
  day TEXT NOT NULL,             -- YYYY-MM-DD on the phone (no time)
  week TEXT NOT NULL,            -- ISO week of day, e.g. 2026-W41
  app_version TEXT,
  received_ts INTEGER NOT NULL,  -- when the server stored it (ms)
  dup_of TEXT                    -- rid of an earlier counted report, same install and syndrome within 14 days (then not counted)
);
CREATE INDEX IF NOT EXISTS surv_rep_week ON surv_reports(week, syndrome, place);
CREATE INDEX IF NOT EXISTS surv_rep_iid ON surv_reports(iid, syndrome, day);
CREATE INDEX IF NOT EXISTS surv_rep_recv ON surv_reports(received_ts, place);
-- Symptom-finder searches that match a syndrome: a weaker signal, at most one per install, syndrome and day.
CREATE TABLE IF NOT EXISTS surv_signals (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  iid TEXT NOT NULL, syndrome TEXT NOT NULL, def_version INTEGER, place TEXT,
  day TEXT NOT NULL, week TEXT NOT NULL, app_version TEXT, received_ts INTEGER NOT NULL,
  UNIQUE (iid, syndrome, day)
);
CREATE INDEX IF NOT EXISTS surv_sig_week ON surv_signals(week, syndrome);
-- Corrections are new rows, never edits: void or restore one report ('report:<rid>') or every report of an install ('install:<iid>').
CREATE TABLE IF NOT EXISTS surv_corrections (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL, who TEXT NOT NULL, role TEXT,
  target TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS surv_cor_target ON surv_corrections(target, seq);
-- Every export downloaded: who, when, what, how many rows and the SHA-256 printed in the file.
CREATE TABLE IF NOT EXISTS surv_exports (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL, who TEXT, role TEXT, kind TEXT, level TEXT, params TEXT, row_count INTEGER, sha256 TEXT
);
CREATE TRIGGER IF NOT EXISTS surv_reports_no_update BEFORE UPDATE ON surv_reports BEGIN SELECT RAISE(ABORT, 'surv_reports is append-only'); END;
CREATE TRIGGER IF NOT EXISTS surv_reports_no_delete BEFORE DELETE ON surv_reports BEGIN SELECT RAISE(ABORT, 'surv_reports is append-only'); END;
CREATE TRIGGER IF NOT EXISTS surv_signals_no_update BEFORE UPDATE ON surv_signals BEGIN SELECT RAISE(ABORT, 'surv_signals is append-only'); END;
CREATE TRIGGER IF NOT EXISTS surv_signals_no_delete BEFORE DELETE ON surv_signals BEGIN SELECT RAISE(ABORT, 'surv_signals is append-only'); END;
CREATE TRIGGER IF NOT EXISTS surv_corrections_no_update BEFORE UPDATE ON surv_corrections BEGIN SELECT RAISE(ABORT, 'surv_corrections is append-only'); END;
CREATE TRIGGER IF NOT EXISTS surv_corrections_no_delete BEFORE DELETE ON surv_corrections BEGIN SELECT RAISE(ABORT, 'surv_corrections is append-only'); END;
CREATE TRIGGER IF NOT EXISTS surv_exports_no_update BEFORE UPDATE ON surv_exports BEGIN SELECT RAISE(ABORT, 'surv_exports is append-only'); END;
CREATE TRIGGER IF NOT EXISTS surv_exports_no_delete BEFORE DELETE ON surv_exports BEGIN SELECT RAISE(ABORT, 'surv_exports is append-only'); END;
-- ===== Usage counts v2 (server/usage.js). No install id: each phone adds up its own day and sends the totals once. =====
-- One row per day x district x language x phone type x app version x consent wording x page. "devices" = phone-days
-- (each phone sends a day once, so this counts phones on that day); "standalone" = of those, opened from the home screen.
-- page: 'topic/<id>', 'home', 'ask', 'tool/...', 'act/<action>' (share, add child...), or '_day' = the whole app that day.
CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL, district TEXT NOT NULL, lang TEXT NOT NULL, platform TEXT NOT NULL, version TEXT NOT NULL,
  cv TEXT NOT NULL,              -- version of the consent wording the phone agreed to ('legacy' = folded from an old app's /e)
  page TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0, opens INTEGER NOT NULL DEFAULT 0, plays INTEGER NOT NULL DEFAULT 0,
  search_opens INTEGER NOT NULL DEFAULT 0, -- opened from the symptom search (the typed words are never sent)
  devices INTEGER NOT NULL DEFAULT 0, standalone INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, district, lang, platform, version, cv, page)
);
CREATE INDEX IF NOT EXISTS usage_day_page ON usage_daily(page, day);
-- Installs: one message on first use, with no id.
CREATE TABLE IF NOT EXISTS installs_daily (
  day TEXT NOT NULL, lang TEXT NOT NULL, platform TEXT NOT NULL, version TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0, standalone INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, lang, platform, version)
);
-- Random ids of single uploads, so a day sent twice (lost answer) counts once. Not stored with the counts; deleted after 7 days.
CREATE TABLE IF NOT EXISTS usage_seen (nonce TEXT PRIMARY KEY, ts INTEGER NOT NULL);
-- Flood protection: posts per minute to /u, /i and /e (old minutes deleted by the daily cron).
CREATE TABLE IF NOT EXISTS usage_rate (bucket INTEGER PRIMARY KEY, n INTEGER NOT NULL);
-- Flood protection: rows (or bytes) written per UTC day by each anonymous endpoint, e.g. 'r:2026-10-07' (server/usage.js spend).
-- Keeps a flood from filling the database or using up the free plan's daily writes. No id or address is kept. Old days deleted by the cron.
CREATE TABLE IF NOT EXISTS limits_daily (k TEXT PRIMARY KEY, n INTEGER NOT NULL);
-- Feedback list: newest first.
CREATE INDEX IF NOT EXISTS fb_ts ON feedback(ts);

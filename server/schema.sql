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
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  iid TEXT, ts INTEGER, lang TEXT, version TEXT, page TEXT,
  text TEXT, audio BLOB, type TEXT, status TEXT DEFAULT 'new'
);
-- Book content edited at /admin: one row 'draft' (being edited) and one row 'published' (what phones download).
CREATE TABLE IF NOT EXISTS content (
  name TEXT PRIMARY KEY,         -- 'draft' or 'published'
  body TEXT NOT NULL,            -- the whole book as JSON (same shape as content/book.json)
  version TEXT, built TEXT, updated_ts INTEGER
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

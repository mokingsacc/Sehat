-- 0001_init: the hub's tables as they were before migrations (October 2026).
-- Shared by the hub's SQLite and D1 online: plain SQLite, no PRAGMA, every CREATE with IF NOT EXISTS, so a database
-- made by the hub's code before migrations existed takes this file without harm.
-- Privacy: no table holds a name. Questions carry a random token, not a person.

CREATE TABLE IF NOT EXISTS questions(
  id INTEGER PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,          -- what the phone holds, so ids cannot be guessed
  created TEXT NOT NULL,
  lang TEXT, subject TEXT, year INTEGER, lesson_id TEXT,
  question TEXT NOT NULL,
  answer TEXT,                         -- what the child was shown (empty if it went straight to the teacher)
  source TEXT,                         -- rules, maths, bank, approved, lesson, ai, none
  urgent INTEGER DEFAULT 0,            -- words of distress: the teacher sees it first
  to_teacher INTEGER DEFAULT 0,        -- the hub or the child asked the teacher to look
  status TEXT NOT NULL,                -- answered, waiting, reviewed, rejected
  teacher_answer TEXT,
  reviewed TEXT
);
CREATE INDEX IF NOT EXISTS questions_status ON questions(status, to_teacher);
CREATE TABLE IF NOT EXISTS approved(
  id INTEGER PRIMARY KEY,
  created TEXT NOT NULL,
  lang TEXT NOT NULL, subject TEXT, year INTEGER, lesson_id TEXT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prints(
  id INTEGER PRIMARY KEY,
  created TEXT NOT NULL,
  lesson_id TEXT, kind TEXT, copies INTEGER, lang TEXT, seed INTEGER,
  pages INTEGER, status TEXT NOT NULL,  -- queued, printing, done, saved, failed
  detail TEXT,
  device TEXT                          -- a random id from the phone, for the hourly limit only
);

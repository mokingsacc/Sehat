-- 0019_live: live audio classes (P30a, C6.1). Two tables, no row changes, and no flag: `live` is off in every cohort.
-- `live_sessions`: one row per class held, with counts only. `host` is the staff label as the Log writes it
-- ("teacher:Teacher A"), never a name; `v` grows on every change the phones must see (their polls send it back);
-- `state` is JSON {audio: on|off, board: {lesson, step} | null, floor: null, rtc: {sfu, published}, low_since}
-- while the class runs, blanked to {} when it ends. `seen_at` is the teacher's last roster poll. Kept 12 months.
-- `live_present`: one row per learner in the room, by her token's hash: her relay session id, a one-time ticket
-- (16 random bytes, 60 seconds, consumed by the next call), when she joined and was last seen, and her raised hand
-- with its reason (1 to 3, a chip code). Deleted when the class ends, when she leaves, and after 6 hours at most.
-- Nothing here records sound: the media goes through Cloudflare's relay, never through the server.

CREATE TABLE IF NOT EXISTS live_sessions(
  id TEXT PRIMARY KEY,                 -- random, 16 lower-case letters and digits
  cohort TEXT NOT NULL,
  subject TEXT NOT NULL,               -- timetable.SUBJECTS without auto, or "class"
  host TEXT NOT NULL,                  -- the staff label ("teacher:Teacher A"), never a name or an email
  started_at TEXT NOT NULL,            -- UTC ISO time
  ended_at TEXT,                       -- null while the class runs
  seen_at TEXT NOT NULL,               -- the teacher's last roster poll
  peak INTEGER NOT NULL DEFAULT 0,     -- the most learners present at once
  listener_min INTEGER NOT NULL DEFAULT 0,   -- minutes listened, all learners together
  v INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS live_sessions_open ON live_sessions(cohort, ended_at);
CREATE INDEX IF NOT EXISTS live_sessions_started ON live_sessions(started_at);

CREATE TABLE IF NOT EXISTS live_present(
  session TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  sfu TEXT,                            -- her relay session id, while she listens
  ticket TEXT,                         -- the one-time ticket, hex; null once used
  ticket_at TEXT,
  joined_at TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  hand_at TEXT,                        -- null: her hand is down
  reason INTEGER,                      -- 1 I don't understand, 2 please say it again, 3 I have a question
  PRIMARY KEY(session, token_hash)
);
CREATE INDEX IF NOT EXISTS live_present_by_token ON live_present(token_hash);

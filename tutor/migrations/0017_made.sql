-- 0017_made: her own questions sent for her teacher's check (P32, C4.8, layer 2).
-- A row is what she wrote, as `body` (JSON {q, a, why}, each at most 300 characters, after the identifier filter),
-- in her language, waiting for her class's teacher, then the teacher's verdict: `ok` ("Looks right") or `change`
-- ("Needs a change") with chips and an optional short reply (through the leak and identifier filters). The token
-- hash is kept only so her verdicts find her phone and `DELETE /api/me` removes her rows; no name, alias or band.
-- Kept 60 days after it was sent or decided, whichever is later; learner items never become pack content. The
-- module is off everywhere until an admin turns it on (no seed row).

CREATE TABLE IF NOT EXISTS made(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cohort TEXT,
  token_hash TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- 'question' (lessons and class sharing wait for 2028, C4.8)
  body TEXT NOT NULL,                  -- {"q": ..., "a": ..., "why": ...}
  lang TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',   -- waiting, ok, change
  chips TEXT NOT NULL DEFAULT '[]',
  reply TEXT,
  at TEXT NOT NULL,
  decided_at TEXT
);

CREATE INDEX IF NOT EXISTS made_by_token ON made(token_hash);
CREATE INDEX IF NOT EXISTS made_by_cohort ON made(cohort, status);

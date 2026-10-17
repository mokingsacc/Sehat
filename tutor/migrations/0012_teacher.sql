-- 0012_teacher: the teacher dashboard (P20, C3.2 and DESIGN-C2C3-SPECS item 11).
-- `questions` gains the asking learner's cohort (so each teacher sees her own class; older rows have none and are
-- the hub's own) and `hints`, a held ladder's three rungs as JSON. A question whose AI answer the cohort holds for
-- the teacher has status "held" until she sends it (status "reviewed"), edits and sends it, or does not send it
-- ("rejected"). The learner sees only that her question went to the teacher.
-- `reset_codes` keeps a lock reset code the teacher made for one learner (C1.6): its hash with the learner's token
-- hash, valid 15 minutes, used once, ended by five wrong tries; deleted with the learner. Never the code itself.
-- Columns and a table only; no row changes.

ALTER TABLE questions ADD COLUMN cohort TEXT;
ALTER TABLE questions ADD COLUMN hints TEXT;
CREATE INDEX IF NOT EXISTS questions_cohort ON questions(cohort, status);

CREATE TABLE IF NOT EXISTS reset_codes(
  token_hash TEXT PRIMARY KEY,         -- the learner's (learners.token_hash)
  code_hash TEXT NOT NULL,             -- sha256 hex of the token hash and the six digits
  expires TEXT NOT NULL,               -- UTC ISO time, 15 minutes after it was made
  tries INTEGER NOT NULL DEFAULT 0     -- wrong tries; five end the code
);

-- 0004_ai_usage: what the AI gateway spent, per day (BUILD-PLAN 3.4 and 3.7, P5).
-- One row per day, cohort, module, purpose, provider and model, counting calls: never a learner, a question or an
-- answer. The gateway reads today's tokens for the cohort's budget. Kept 2 years.

CREATE TABLE IF NOT EXISTS ai_usage(
  day TEXT NOT NULL,                   -- UTC, like 2026-10-16
  cohort TEXT NOT NULL,
  module TEXT NOT NULL,
  purpose TEXT NOT NULL,               -- explain, hint, read_sheet, plan, screen
  provider TEXT NOT NULL,              -- openai, local, fake
  model TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,   -- in and out together
  cost_micro INTEGER NOT NULL DEFAULT 0, -- millionths of a US dollar
  held INTEGER NOT NULL DEFAULT 0,     -- answers held for the teacher
  PRIMARY KEY(day, cohort, module, purpose, provider, model)
);

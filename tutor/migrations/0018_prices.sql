-- 0018_prices: the C5 security review and the owner's AI price table.
-- `ai_prices`: what each provider's model costs, in US dollars per million input and output tokens, as the admin
-- types it on the AI spend page (empty by default, so the estimate is $0 until a price is set). The gateway prices a
-- call by provider and model, else by the provider's row with model '' (any model). Never a key.
-- `signoffs.via`: how a signature was made, `pin` (the hub's shared teacher PIN: anyone who knows it) or `access`
-- (a named staff row online); empty for signatures made before this file. tools/pull_signoffs.py copies a `pin`
-- signature into the packs only with --hub-ok (C5 M4).
-- A table and a column only; no row changes.

CREATE TABLE IF NOT EXISTS ai_prices(
  provider TEXT NOT NULL,              -- ai/policy.py PROVIDERS
  model TEXT NOT NULL DEFAULT '',      -- the model name as the gateway reports it; '' for any model of the provider
  usd_in REAL NOT NULL,                -- US dollars per million input tokens
  usd_out REAL NOT NULL,               -- US dollars per million output tokens
  changed_at TEXT NOT NULL,
  PRIMARY KEY(provider, model)
);

ALTER TABLE signoffs ADD COLUMN via TEXT NOT NULL DEFAULT '';

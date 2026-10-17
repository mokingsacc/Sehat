-- 0021_bags: the school bag's relay (WEBSITE.md 3.6 and 3.7, W6). One row per bag this server relays: her whole
-- record, sealed on her phone under a key only her 16-digit bag code gives (bag.js), so the server holds nothing it
-- can read. `id` is HMAC-SHA256(pepper, F_r) and `w` SHA-256(W_r), both hex, where F_r and W_r are the find and write
-- values her phone works out for this server alone (bag.forRelay); the pepper is a Worker secret online
-- (TUTOR_BAG_PEPPER) and a file beside the database on a hub, so a copy of this table alone cannot be tested against
-- guessed codes. `token_hash` is the seat that last wrote it (for her consent, and so the bag goes with her);
-- `etag` changes with every write (a stale write is refused, 412); `blob` is the sealed bag in base64, as it travels
-- (at most 64 KB sealed); `day` the date it was last written, never a time. A bag that is stopped (her consent
-- withdrawn, "Make a new code", or she was deleted) becomes a tombstone: the blob and token hash go, `gone` is the
-- date, and other phones still holding the old code are told "stopped" (410) for 30 days. Kept 12 months after its
-- last write. One bag per seat: a write under a new id tombstones the seat's other bags.

CREATE TABLE IF NOT EXISTS bags(
  id TEXT PRIMARY KEY,                 -- HMAC(pepper, F_r), 64 hex
  w TEXT NOT NULL,                     -- SHA-256(W_r), 64 hex
  token_hash TEXT,                     -- the seat that last wrote it; null in a tombstone
  etag TEXT NOT NULL,                  -- 16 random hex digits, new at every write
  size INTEGER NOT NULL,               -- bytes sealed; 0 in a tombstone
  blob TEXT,                           -- the sealed bag, base64; null in a tombstone
  day TEXT NOT NULL,                   -- YYYY-MM-DD of the last write
  gone TEXT                            -- YYYY-MM-DD it was stopped; null while it lives
);
CREATE INDEX IF NOT EXISTS bags_by_token ON bags(token_hash);
CREATE INDEX IF NOT EXISTS bags_by_day ON bags(day);

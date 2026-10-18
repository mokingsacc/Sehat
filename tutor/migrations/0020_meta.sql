-- 0020_meta: what a server knows about itself (WEBSITE.md 3.3 and 3.7, W4). One row so far: `server_id`, random,
-- made once by the store the first time it is asked for (stores: `server_id()`) and then never changed, so every
-- hostname of one database (the custom domain and workers.dev, say) answers `hello.id` with the same id, and a phone
-- can tell which server issued each of a learner's tokens. Nothing about a learner is kept here. The school bag's
-- table (`bags`) comes with the relay, in the next migration.

CREATE TABLE IF NOT EXISTS meta(
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

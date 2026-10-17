# How the tutor fits together

Working name **Qalam** (قلم, pen). The plan behind it: [Tutor Build Plan](https://claude.ai/artifact/CyzJJLpoB2bDe4fizEgcUx).
The looks: [Home Tutor App Looks](https://claude.ai/artifact/HPUjNESWe3WBYe6iLVi3aT).

```
 phones (years 0-6: bold look C, years 7-12: clean look B)          paper worksheet
        |  Wi-Fi, no internet                                             ^
        v                                                                 |
 +------------------------- village or school hub ----------------------------+
 |  hub server (hub/tutor_hub, FastAPI)                                        |
 |   lessons  <- content/packs (JSON lessons, pictures)                        |
 |   Ask      -> rules -> exact maths -> checked answers -> AI* -> lesson -> teacher
 |   sheets   -> HTML -> PDF (WeasyPrint) -> print queue -> CUPS -> printer ----+
 |   teacher page (PIN): review answers, see printing, print the hub card      |
 |   SQLite: questions (no names), approved answers, print jobs                |
 |   * any local model server with the OpenAI chat API, e.g. llama.cpp         |
 +------------------------------------------------------------------------------+
```

## The parts

| Folder | What it is |
|---|---|
| `app/` | The phone app: plain HTML, CSS and JavaScript modules, no build step. The hub serves it at `/`. |
| `hub/tutor_hub/` | The hub server (Python 3.10+): `server.py` routes, `events.py` nameless events, `brain.py` answers, `rules.py` safety, `mathcheck.py` exact sums, `search.py` finding answers, `sheets.py` worksheets, `printing.py` the queue, `stores/` the database (SQLite on the hub, D1 online), `ai/` the AI gateway, `llm.py` the model client. |
| `content/packs/` | Lessons as data. One folder per pack (format in [CONTENT.md](CONTENT.md)). |
| `content/sources.json` | Every outside source with its licence class and flags: the only record of what may be copied ([FREE-RESOURCES.md](FREE-RESOURCES.md)); `content/permissions/` holds written permissions for ASK sources. |
| `setup/` | Installing a hub: services, Wi-Fi hotspot, printer ([HUB-SETUP.md](HUB-SETUP.md)). |
| `tools/` | `validate_pack.py` checks packs and licences (`--release`, `--hashes`); `make_sheets.py` prints every sheet to PDF for reviewers, or a batch of one for facilitators; `sheet_check.mjs` checks the sheets in Chromium's print; `import_bloom.py` imports a Bloom book as a draft lesson; `validate_modules.py` checks manifests; `pull_signoffs.py` copies reviewers' signatures into the packs; `blindtest/blindtest.py` runs the blind test (P16): questions and sheet strips through the gateway, blind grader sheets, a score against the nine-in-ten rule ([content/blindtest/README.md](../content/blindtest/README.md)). |

## The async seam (stores/, October 2026)

The same hub code is to run on the village hub (uvicorn) and online as a Cloudflare Python Worker, which has no
threads and whose database (D1) answers with promises. So the request path is async: every route is `async def`;
the store sits behind one async interface (`stores/base.py`, whose docstring is the contract); the model client uses
one `httpx.AsyncClient`; `brain.answer()` awaits the model while rules, maths and search stay plain functions. On the
hub, `stores/sqlite.py` (`SqliteStore`) runs every database call on a single worker thread, so calls reach SQLite one
at a time and the event loop never waits on the disk; the print worker keeps its own thread and calls the inner,
blocking store (`store.sync`). WeasyPrint runs in the thread pool. Nothing touches the database until the app's
lifespan starts: it opens the store, deletes expired questions, fails jobs a restart interrupted, builds the search
index and starts the print queue, and closes the store on shutdown. `tests/test_async.py` checks that 20 phones
asking a slow model at once take about as long as one.

**Migrations.** The tables are made by shared SQL files, `tutor/migrations/NNNN_name.sql`, written so D1 runs them
too: no PRAGMA, no BEGIN or COMMIT, no trigger, every `CREATE` with `IF NOT EXISTS`. `0001_init.sql` is the schema as
it was before migrations, so a hub database made by older code takes it without harm. One mechanism serves both
stores (`stores/migrations.py`): the files in order, each split into its statements, each applied once as one atomic
group whose first statement is its row in `schema_migrations(id, applied_at)`. SQLite makes the group atomic with
BEGIN and COMMIT, D1 by sending it as one `batch()`. Because the row comes first, a second caller racing to apply the
same file fails on that row before touching a table, finds the row, and moves on. The PRAGMAs (WAL, full sync) stay
in the SQLite store. `tests/test_store_contract.py` runs one set of tests against both stores and checks that fresh
and old hub databases end the same, that SQLite and D1 end with the same tables, that a second run changes nothing,
that a failed file leaves no trace, and that three Workers opening at once apply each file once. A new table is a new
numbered file, never an edit to an old one, and a migration only adds (tables, columns, indexes), so code still
running from the last release keeps working beside it.

## The D1 store (stores/d1.py)

Online, the same contract runs on Cloudflare D1 through the Worker's binding: `D1Store(env.DB)`. A Python Worker
reaches D1 through JavaScript, so the store does what the binding needs: `await db.prepare(sql).bind(...)` with
`.all()`, `.first()` or `.run()`; writes that belong together (a review and its approved answer, a flag and its log
row, a batch of events, a migration with its row) in one `db.batch(...)`, D1's only transaction; SQL NULL sent as
`pyodide.ffi.jsnull`, because Python None arrives as `undefined`, which D1 refuses; the list of statements turned
into a JavaScript array with `to_js`; results turned into dicts with `.to_py()`, and JavaScript nulls in them (which
Pyodide shows as `jsnull`, not None) into None. D1 takes at most 100 bound values in a statement, so events go in as
inserts of 14 rows, all in one batch. `close()` lets go of nothing: the binding belongs to the Worker. Neither the D1
store nor the migration code imports sqlite3 or uses a thread, and `stores/__init__.py` loads each store on first use.

The tests reach D1 through `tests/fakes/d1.py`: SQLite behind D1's call shape, as strict as D1 so a mistake fails in
CI rather than on Cloudflare. It refuses PRAGMA (all of them, stricter than D1) and BEGIN, COMMIT, ROLLBACK, SAVEPOINT,
ATTACH and DETACH outside its own `batch()`; one statement per `prepare()`; positional values only, at most 100; no
Python None, no integer beyond JavaScript's safe range; a batch only as a JavaScript array, all or nothing; `exec()`
split at every newline, as D1 does (so a migration cannot go through `exec()`); foreign keys enforced, as D1 does by
default. What it returns behaves like a JS proxy: attributes and `.to_py()`, no `row["key"]`, `jsnull` for null,
`first()` giving `jsnull` when there is no row, and a whole number stored as REAL coming back as an int. Every call
awaits once before it runs, so concurrent callers interleave as separate Worker isolates would.

**Migrations on the real D1 (P7).** `schema_migrations` is the only record of what was applied, on the hub and
online. The deploy must never run `wrangler d1 migrations apply` (it keeps its own `d1_migrations` table, a second,
competing record) so `wrangler.toml` sets no `migrations_dir` and no `migrations/` folder sits beside it. The migrations reach D1 through `D1Store.open()`, the
same runner as the hub, from inside the Worker: the Worker opens its store once per isolate, before the first request
it serves, and an open with nothing to do costs two queries (the ledger's `CREATE TABLE IF NOT EXISTS` and one read).
The deploy job makes this happen at once rather than on a learner's first request: after `wrangler deploy` it
requests `/api/hello` on the new version, which opens the store, and fails if that does not answer 200. To look at
the record by hand: `wrangler d1 execute qalam-staging --remote --command "SELECT * FROM schema_migrations"`. The
migration files must ship inside the Worker bundle, at the path `stores/migrations.py` reads (`tutor/migrations`),
or be passed as `D1Store(env.DB, migrations=...)`.

## Online: the Worker (tutor/worker, P7)

The same app runs online as a Cloudflare Python Worker, `qalam-staging` for now ([HOSTING.md](HOSTING.md) has the
measurements and what it costs). Nothing of the hub is forked:

- `worker/build.py` copies the hub's code, the migrations, manifests, seed cohorts and packs into `worker/build/src`
  in the hub's own layout (so `config.TUTOR` and `stores/migrations.py` find everything without a setting), and the
  app and the lesson pictures into `worker/build/public`, the Worker's static assets. Pictures go in both: the hub
  checks they exist as files, and phones fetch them as assets. `build/` is never committed.
- `worker/entry.py` is the Worker: the ASGI adapter from the Workers SDK around the hub's `create_app()`. The app
  is built when the module is imported, with the settings from wrangler.toml's `[vars]` (build.py copies them next
  to it as `vars.json`): Cloudflare runs that import once at deploy time and keeps a memory snapshot, so a new
  isolate starts with the app, lessons and manifests in memory. On the first request an isolate serves, the store
  gets the D1 binding and `Hub.start()` runs (store opened and migrated, cohorts seeded, old rows pruned, search
  index built). The adapter would run the ASGI lifespan around every request, so the entry does not acknowledge
  it. The store gets the plain JavaScript binding (from `cloudflare:workers`): the SDK's `self.env` wraps bindings
  in its own Python converters, and D1Store does its own (jsnull, to_js, to_py), as its contract and the fake
  expect.
- Static assets are served before the Worker; only `/api/*` and, since P25b, a certificate's check page `/v/*`
  reach Python (`run_worker_first`, which `guard.py` holds to exactly those two). So the hub's
  picture route and its `StaticFiles` mounts are not used online, and `create_app` mounts the app folder only
  where it exists.
- **What a host lacks** (`TUTOR_LACKS`, empty on the hub): online it is `printer,pin`. A module whose manifest
  `needs` something the host lacks is off for every cohort there, whatever its flag says, and so is any module that
  depends on it. `print` needs `printer`, and `teacher` now needs `pin` (the teacher's PIN, which only the hub has),
  so online the staging cohort's modules resolve to Lessons, Ask, Sheets and Check my sheet. Without a printer the
  hub makes no print queue (its thread cannot run in a Worker) and `/api/hello` reports the printer as off; without
  a PIN no PIN file is made. Online, sheets are HTML that the browser prints or saves as a PDF ("Get the sheet",
  P13): WeasyPrint is on neither the Worker nor the fallback kit, so the `.pdf` route belongs to `print`, and the
  answer page, which needs the PIN, does not exist there.
- Settings online: `TUTOR_COHORT` (the staging seed cohort), `TUTOR_AI_PROVIDER=fake`, `TUTOR_LACKS`. The Worker
  has no secrets at all.
- `.github/workflows/tutor-worker.yml` deploys on every push of `tutor/**` to the working branch: a guard (the
  Worker and its database must be `qalam-staging`), find or create D1 in the `eu` jurisdiction, `pywrangler deploy`,
  `/api/hello` (which applies the migrations), `hub/tests/smoke_http.py` (any base URL: the hub, `pywrangler dev`
  or the Worker) and `worker/measure.py`. Without the Cloudflare secrets, or when the Free plan blocks the Worker,
  it runs the same smoke test under `pywrangler dev` and stays green (D6).
- `tests/test_worker.py` loads `entry.py` with stand-ins for the runtime (the D1 fake, wrangler.toml's vars),
  serves the app through it, counts D1 calls per request (the first, which starts the hub, makes 16; the Free
  plan documents 50), checks the bundle layout and the deploy's guards.
- **What changes with `TUTOR_HOME=online` (P11):** the per-phone limits (Ask, events) count a learner's token (the
  first 32 characters of its hash), since many phones reach the Worker from one address and it may not see the
  address at all; a request without a known token is counted by address, as on the hub. `POST /api/ask` needs her
  token and her consent online (401, 403), since a question may go to the AI provider there; the hub still answers
  without one. CORS allows only the sites in `TUTOR_ORIGINS` (comma separated, none by default: the app is served by
  the Worker itself, so it needs none); the hub allows any origin, for the Android app later. `/api/hello` says
  which home it is (`home`). `tests/test_online.py` checks all four. Workers Logs
  stay off (no `[observability]`), as the hub keeps no access log; the deploy job reads CPU times live with
  `wrangler tail` and keeps only the numbers.
- **The retention job (P24):** `Hub.prune()` deletes what is past its time (questions, ladders and prints after
  `TUTOR_KEEP_DAYS`, expired reset codes, 90-day wishes, 12-month events and idle learners, AI usage and two-year
  logs). Both run it at start; the hub then daily from a task in the app's lifespan (`retention_loop`, which logs a
  failure and tries the next day), the Worker from its cron trigger: `entry.py`'s `Default` subclasses the SDK's ASGI
  entrypoint with `scheduled`, which starts the hub if the isolate has not (start prunes) and otherwise prunes.
- **Production (P24, not deployed):** `worker/wrangler.production.toml` (`qalam`, release mode, the open cohort, AI
  off until P18), checked by `worker/guard.py`, deployed only by `.github/workflows/tutor-production.yml` by hand from
  `main` through the GitHub environment `production`, which copies it over `wrangler.toml` on the runner first, so
  `build.py` and `pywrangler` run as for staging. The same workflow's `export` makes the weekly encrypted D1 export.
  `tests/test_production.py` checks the file, the guard, the workflow, the production Worker on the D1 fake, and a
  restore of an export into the hub's SQLite store. `docs/RELEASE.md` is the release checklist and restore drill.

## Modules and cohort flags (modules.py, flags.py)

Each part of Qalam is a module with a manifest, `tutor/modules/<id>/module.json`, in the shape the design committee
settled (BUILD-PLAN 3.2): `id`, `version`, `maturity`, `depends`, `bands`, `slots`, `capabilities`, `ai` (only when it
calls a model), `settings`, `needs`, `offline`. The first six are today's features: `lessons`, `ask`, `sheets`
(the sheet document, the keys, "Get the sheet" and the lesson-end card, C2 change 6), `print` (only the hub's print
queue; it depends on `sheets` and needs `printer`), `check` (Check my sheet, which depends on `sheets`) and
`teacher` (the teacher dashboard at `/teacher/` since P20; no `needs` since a staff gate guards it on every host,
C3.2; settings `hold`, off by default, and `lock_codes`, on by default). `photo` (P14, photo marking of Qalam sheets) depends on `sheets` and `check`, serves p2 to adult, needs
the internet and is on only in staging so far. `homework` (P15, Homework help: "Check my answer" under Ask's hint
ladder) depends on `ask`, serves p2, s1 and s2, calls the model for `hint`, needs the internet and is on only in
staging (`migrations/0009`). `review` (P17, the review screens at `/review/`) depends on `lessons`, has no slot in
the learner app and is on only in staging (`migrations/0010`). `timetable` (P19, the virtual school day) depends on
`lessons`, serves p1 to s2, has the slots `home.action` and `settings.row`, and is on in all three seed cohorts
(`migrations/0011`, which also sets their `timetable` setting to `"default"`). `plan` (P22, "I want to learn this")
depends on `lessons`, serves s1, s2 and adults (the phone shows it only to adult readers), carries `free.text` and is
on in all three seed cohorts (`migrations/0013`, C2.8); since P25a it also carries `ai.call` for the purpose `plan`,
used only when its setting `plan_ai` is on (off by default and everywhere so far). `recall` (P25a, spaced review)
depends on `lessons`, serves p1 to adults, has no slot, capability or setting (its code is `app/js/modules/recall.js`,
which the lesson player imports) and is on in `open` and staging (`migrations/0015`) and in every cohort the admin
makes; the pilot cohort gets it after its report (C4.1). `migrations/0007` switches `sheets` on in every cohort made before it
wherever `print` or `check` was; `migrations/0008` switches `photo` on for the staging seed cohort in a database
seeded before it. `modules.py` checks every manifest at start and leaves out a broken one, and
any module depending on it, with the reason in the log; `tools/validate_modules.py` runs the same checks in CI. The
risk a module carries comes from the core's table of capabilities, never from the module.

A cohort is a group with the same settings, with a random id and a neutral label. The seed files
`tutor/cohorts/{hub,staging,open}.json` fill the empty `cohorts` and `flags` tables once (`migrations/0002`); after
that flags change only through the store's `set_flag`, which also writes `flag_log` (the admin panel, P21). A module
is on when its flag is on, its `depends` are on, the cohort takes its maturity, a blocked capability has the cohort's
`paid-human` moderation, and, when the band is known, both the module and the cohort serve that band. A cohort's
settings (`flags.SETTINGS`, checked by `flags.settings_problems`) are `maturity`, `timetable` (P19), `ai` (false is the
kill switch "AI off": the gateway answers "off" for that cohort and `hello.ai_on` is false), `ai_budget` (its own daily
tokens instead of the hub's `TUTOR_AI_BUDGET`) and `moderation` (`none`, `teacher` or `paid-human`). A label must
not say who is in the class (`flags.label_problem`, F4: English words and their Dari and Pashto drafts). The hub's own cohort is `TUTOR_COHORT`, by default the id in `cohorts/hub.json`;
a request may name another with `?cohort=`. Flags are read on every request, so a switch reaches the next one, and a
switched-off module's routes answer 404 as if they were never there.

## Events without names (events.py)

An event says what happened, never who: `{at, verb, object, value}`, the UTC minute, a verb from the fixed list in
`events.py`, an id (a lesson, or where an answer came from) and a number when the verb has one (stars, copies). The
hub derives the module from the verb and takes the cohort and `token_hash` from the learner token the phone sends
(P10): `POST /api/events` needs `X-Learner-Token` (401 without a token the server knows) and her consent record
(403 without it).
The table is `migrations/0003_events.sql`, append-only, kept 12 months (deleted at start-up after that).

- **From the phone** (`app/js/events.js`): `lesson.start` and `lesson.done`, recorded by `state.js`, and `check.done`
  (the lesson and the percent right, 0 to 100), recorded by the Check my sheet screen each time a sheet is marked (the
  Check button, or every row judged on a sheet with nothing to type), whether its key came from printing or from the
  hub. Only a learner whose grown-up agreed (or an adult who agreed) has events: `state.record` checks her consent.
  All are kept in a queue on the phone (`qalam.events.v1`, at most 500), each marked with the learner on this phone
  it belongs to (never sent), until the hub is in reach, then sent with her token, at most 100 at a time. A batch
  that did not arrive stays queued; one the hub refuses is dropped; a 401 or 403 keeps them while `account.js` joins
  her again or resends the consent.
- **Hints (P15, C2.3):** `check.item` (object `lesson:n`, the sheet's item; value 0 wrong, 1 right first time, 2
  right after hints or another try), `hint.rung` (`lesson:n`, the rung opened, 1 to 3) and `check.dispute`
  (`lesson:n`, no value: "Something looks wrong?"). They carry no text. A ladder in Ask sends none (its object would
  not be a sheet's item).
- **From the hub's own routes:** `ask.answered` (with the answer's source), `ask.to_teacher`, `print.queued` (lesson,
  copies), `review.approved` and `review.rejected` (the question's lesson). Fetching a sheet's key writes nothing.
  A phone cannot send these. Writing one never breaks the route that made it.
- **Refused:** any field besides the four (so no free text), an unknown verb, an object that is not a plain id or
  has a run of five digits or more, a value out of range; the whole batch is refused (422). A time in the future
  becomes now; one older than 12 months is not kept. The store itself refuses a row with any column it does not
  know. `tests/test_events.py` also scans every table for a column that could hold a name, sex, birth date, phone
  number or address.

## Content, licences and signatures (licences.py, packs.py)

Outside material reaches a pack only as its licence allows, and nothing reaches learners unsigned.

- **Licence classes** come from `content/sources.json` alone (`licences.Sources`, which checks the file itself):
  BUNDLE may be copied with credit, BUNDLE-NC only into packs marked `"licence": "NC"`, LINK and ASK only as link
  cards (ASK until `content/permissions/<id>.md` records a written permission), AVOID never. Flags: `verbatim`
  (no changes, text matched by hash), `exact_attribution` (the owner's credit line), `no_ai` (OpenStax: never in a
  pack or an AI context), `per_item_licence` (the item's own licence decides). Languages use the app's codes
  (`prs`, `ps`, `en`, two letters otherwise) and `bands` replace the old age groups.
- **Sources blocks:** a lesson (or a picture or clip, through pack.json `media`) names each outside item it uses:
  `{id, item, title, url, licence, changes, checked}`, nothing else, so no copied text hides there. The pack
  loader refuses AVOID, LINK, unpermitted ASK and no_ai sources, NC outside an NC pack, BY-SA with NC-SA in one
  lesson, SA without `share_alike` on the pack, ND with changes, verbatim text whose hash differs, and a credit
  line it cannot fill. A refused lesson is left out with the reason, as any broken lesson is.
- **Link cards** (`links.json`): a title, our own description of at most 140 characters, an https address, and
  where the card belongs. Any other field fails. `GET /api/links` serves them with `needs: ["internet"]`; the app
  shows them on the subject page only while online.
- **Content hashes and signoffs:** a lesson's hash covers the lesson without its review block, every picture's
  bytes and every clip's recorded hash, speaker and placeholder mark. Each reviewer role signs that hash with
  initials only; a lesson is signed when every role it needs has signed its current hash, so any change voids
  it. `signoffs` and `releases` (`migrations/0005_content.sql`) keep the signatures and the pack versions given to
  each cohort, on both stores (contract-tested); the pack mirrors the signoffs, which is what the loader checks.
- **Release mode** (`TUTOR_RELEASE=1`, production): only signed lessons and cards are served, and lessons for years
  0 to 3 and every letter step need recorded clips (never placeholders, never synthetic). Without it (staging, a
  laptop), drafts are served marked `draft`, and the app shows the draft band on Home and in the lesson. The
  Worker on staging is not in release mode, so reviewers see the starter drafts there.
- **Credits:** `GET /api/credits` lists every source the served lessons, pictures, clips and cards use, with each
  item's credit line, the links, and the fonts; each lesson from the hub carries its own `credits` lines for the
  source note at its end. The Credits screen (Settings → Credits, P10) is C2.6's: the sources grouped and opening
  to their items, the linked sites ("all rights are theirs"), the voices as their recorders choose (only languages
  with real recordings; `app/credits.json` names a recorder only on her written request), and the fonts, sounds and
  code from `app/credits.json`. Link cards and the source note are still P8's plain cards.
- **Recorded clips** in a pack (`audio/<lang>/manifest.json`: file, speaker code, placeholder, sha256) are known to
  the hub by their manifest; the files are served at `/packs/<pack>/audio/<lang>/<file>` (online, as static
  assets). `tools/validate_pack.py` checks every file against its hash and refuses an unlisted or synthetic clip.
- **Import:** `tools/import_bloom.py` turns a Bloom book into a draft reading lesson with its sources block, after
  the same licence check; pictures stay out unless asked for (the picture rule), and SVG line art it copies has
  black strokes turned to `currentColor`.

## Answering a question (brain.py)

The safest source answers first, and every answer says where it came from, so the app can label it.

1. **Rules** (`rules.py`). Distress words: a kind "tell a trusted adult now" message, and the question goes to the
   top of the teacher's list. Health: points to a health worker or the Sehat app, and the teacher sees it.
   Politics, religious rulings, weapons: "I only help with lessons". Words match whole words only.
2. **Exercises get hints, never answers (C2.3, P15).** A question that looks like an exercise (a sum, "solve",
   "find", "how many", digits with an operator) goes to the hint ladder, from either door of Ask. A sum code can
   hint at (two fractions, two whole numbers added, taken away or multiplied; `hints.py`) gets the code's three
   rungs: the lesson step that teaches that kind of sum, a worked example with other numbers, and the first move.
   Badge: worked out. The sum's value is kept on the hub (`ladders`, `migrations/0009`) for "Check my answer" and
   never sent. Where `homework` is on and the AI speaks her language, any other exercise is solved by the model
   privately, twice (`hint` purpose, module `homework`), then three hints are asked for and checked against both
   answers in every form (digits in any script, fractions, decimals, percentages, mixed numbers, number words in
   English, Dari and Pashto: `ai/filters.leaks`); one leak and the whole ladder is dropped. Rung 1 points to a
   lesson when the search finds one. Otherwise the exercise waits for the teacher; an exercise never gets an
   explanation that might hold its answer.
3. **Checked answers.** A lesson's question bank, or an answer the teacher approved, when it explains at least
   60% of the question (BM25 search, `search.py`). Badge: checked.
4. **AI**, through the AI gateway (below), only in the languages trusted so far (`TUTOR_AI_LANGS`, Dari and English
   at first) and while the cohort's daily budget lasts. The model gets the
   closest lesson passages. Every sum it writes is recomputed; an answer with a wrong sum is never shown. Badge: AI,
   or "AI, sums checked". Where the cohort's teacher holds AI answers (the `teacher` setting `hold`, P20), the
   answer, or a Homework help ladder, is kept as a held question (status `held`, the ladder in `hints`) and she sees
   only that her question went to the teacher; the teacher sends, edits (the ladder's leak check again) or does not
   send it. A sent answer is not added to the checked answers; the AI usage row is marked `held`.
5. **Lesson passage**, if it explains at least 45% of the question. Badge: from the lesson.
6. **Teacher.** Nothing fits: the child sees "your question went to the teacher", and the answer appears on the
   phone when the teacher writes it.

The child can send any AI or lesson answer to the teacher. Each answer the teacher approves becomes a checked
answer for the next child who asks; approved Pashto answers are also the Pashto data the AI does not have yet.

## The AI gateway (ai/)

Nothing calls a model except through `ai/gateway.py`; `brain.py` asks it for the `explain` purpose on behalf of the
`ask` module.

- **Policy** (`ai/policy.py`, code, not configuration): learner purposes (`explain`, `hint`, `read_sheet`, `plan`,
  `screen`) may go to `local` (a model server on the hub's own network only), `openai` (only
  `https://api.openai.com`), `anthropic` (only `https://api.anthropic.com`), `gemini` (only
  `https://generativelanguage.googleapis.com`), `openai_compat` (`TUTOR_COMPAT_URL`, https or the hub's network) or
  `fake`. Any other provider, or a provider sent to a host not its own, raises `PolicyError`: at start-up the hub
  refuses to start, and each provider checks again before a call. A module may use only the purposes its manifest
  lists.
- **Choosing:** `TUTOR_AI_PROVIDER` is the hub's default (`local` when `TUTOR_LLM_URL` is set, else `off`; a list
  such as staging's `anthropic,fake` takes the first whose key is set). A cohort may pick its own provider and model
  in the admin panel (settings `ai_provider`, `ai_model`), read at each call. An online provider without its key is
  simply off and is never pinged. Keys are Worker secrets or environment variables (HOSTING.md).
- **Pictures.** `call(..., images=[jpeg bytes])` passes pictures to the provider. The OpenAI provider puts them in
  the last user message as `image_url` parts (data URIs, never an uploaded file) and asks the provider not to keep
  the request (`store: false`); the fake reads them by hash. `read_sheet` skips the rules screen (its text is our own
  prompt, not the learner's words).
- **Before a call:** a language not trusted yet, the rules screen, or a cohort past its daily budget
  (`TUTOR_AI_BUDGET` tokens per UTC day, default 300 000; 0 means no AI) means no call, quietly: the brain goes on
  to lesson passages and the teacher, so an over-budget cohort still gets checked answers. The learner's words lose
  identifiers first (`ai/filters.py`): "my name is ..." in English, Dari and Pashto, names the caller knows, runs of
  seven digits or more in any script, email addresses.
- **After a call:** sums are recomputed (a wrong sum drops the answer); a hint holding the answer (`3/4`, `۳/۴`,
  `0.75`, `۰٫۷۵`) is asked for once more, then dropped; errors and timeouts are logged and dropped; every reply is
  counted in `ai_usage` (`migrations/0004`): per day, cohort, module, purpose, provider and model, the calls,
  tokens and cost, never a learner or any text. Kept 2 years.
- **The fake** (`ai/fake.py`): scripted replies per purpose, latency, errors and timeouts, a vision fake that "reads"
  fixture pictures by their hash from JSON, and a recorder of exactly what would be sent. `tests/test_gateway.py`
  checks the policy, budgets and the recorder; no test reaches the network (a fixture in `conftest.py` fails any
  real connection).

## Printing (sheets.py, printing.py)

The phone sends lesson, copies, language and the seed; never a name. The hub renders the sheet as HTML, turns it
into an A4 PDF with WeasyPrint and queues it. Online the same HTML goes to the browser, which prints it or saves it
as a PDF (`?print=1` opens the print dialog once it loads; the document's title is the code alone). One worker prints one job at a time through CUPS
(`lp`), or saves PDFs in `data/outbox/` when there is no printer (`TUTOR_PRINT=outbox`).

- **Seeds and the code.** Sheets with generated sums (fractions, adding, times tables) get new numbers on each
  print. The code at the foot is the lesson code, the 4-digit seed and a Damm check digit (`M7-03-48217`), so a
  mistyped or swapped digit is refused; a sheet without a seed (or seed 0) keeps the bare lesson code.
  `sheets.sheet_code` and `app/js/sheetcode.js` make the same codes (`app/tests/sheetcode.test.js`). The same seed
  always gives the same sums, so "Check my sheet" knows the answers, and the phone keeps the key it fetched when
  printing or getting the sheet, to check at home.
- **Layout (C2.1, photo-ready).** Every box is placed absolutely in mm (`sheets.layout`): four corner squares (the
  top right one a ring), the header with name and date boxes, a two-column slot grid for the items (heights in
  DESIGN.md, "Sheet heights"; a sheet that needs more than 230 mm fails `validate_pack`), one answer cell per value
  item at its end side, a "Working" box if 20 mm are left, and the foot: an 18 mm QR code holding text only
  (`Q1 M7-03-48217 PRS`, made by `qr.py`, no dependency) and the code. No app name, URL or cohort. The key gives
  each cell `{kind, x, y, w, h}` in mm from the top-left square's centre, the frame the camera finds (P14).
  `test_sheets.py` checks the clearances, the squares and WeasyPrint's positions; `tools/sheet_check.mjs` checks
  Chromium's print positions (within 0.5 mm of the key) and that no solid black wider than 6 mm is printed except
  the squares.
- **Batches.** `tools/make_sheets.py --batch N --lesson ID` writes N pages in one file for a facilitator: one seed
  for the class, or `--different` for one each, with the answer pages in a separate file; `--html` where WeasyPrint
  is missing.
- **Limits.** Answer sheets and more than `TUTOR_FREE_COPIES` copies need the teacher's PIN; each phone may print
  `TUTOR_COPIES_PER_HOUR` copies an hour (prints the teacher allowed with the PIN don't count). The hub knows a phone
  by its address on the hub's Wi-Fi, which the phone can't choose. Five wrong PINs lock that phone out for a minute,
  the next five for 15 minutes, then an hour each time. Ask and PDF downloads take at most 10 a minute per phone.
- **Names** go on the paper only: not in the database and not in the logs (the hub keeps no access log, because the
  sheet preview's address once could carry a name), and `printer.sh` tells CUPS not to keep printed files. Since P9
  the app sends no name at all, and since P13 the hub takes none either (`name` left `PrintIn` and the sheet routes):
  the learner writes hers in the sheet's name box by hand.

## Photo marking (mods/photo.py, app/js/scan.js, P14)

C2.2: the phone takes a photo of a Qalam sheet, cuts out the answer cells, and the AI reads them; the phone marks.

- **On the phone** (`app/js/scan.js`, pure functions, `app/tests/scan.test.js`): greyscale, an adaptive threshold,
  dark blobs that are square and solid, or a ring with one hole (the sheet's top right); the best one in each quarter
  of the picture; the corners turned so the ring is top right, whatever way the phone was held. A homography from
  the key's mm (the frame between the squares' centres, 178 x 265 mm) to the picture's pixels cuts out each answer
  cell with 2.5 mm round it, and nothing else: never the name box, the header or the QR code. The tiles go into one
  greyscale JPEG strip (0.7): 280 x 200 px tiles under a 24 px black band with the item's number, two to a row, 13 px
  gutters, 600 px wide and 13 + rows x 237 high. Before sending, the photo is checked for blur (the variance of the
  Laplacian), glare and darkness, and "Is this clear?" offers Retake or Use it anyway.
- **The camera** (`app/js/modules/photo.js`, lazy-loaded at `#/photo/{id}/{seed}`): a dark full-screen view with
  the four brackets; it takes the photo itself once four squares have held still for a moment, with coaching lines
  in between ("Fit the four squares", "Move back", "Hold still"), the flash where the phone has one, and a shutter.
  Where the camera is missing or refused it falls back to `<input type="file" accept="image/*"
  capture="environment">`. The phone reads the QR code (`BarcodeDetector`, where there is one) to catch another
  sheet. While the strip is read, a ring fills over 15 s, "Still reading" shows at 10 s, and at 30 s "Keep waiting" or "Type my answers".
- **The route** `POST /api/m/photo/mark` (`mods/photo.py`, behind `needs("photo")`): `{code, seed, lang, strip}`
  with her token and consent; 6 a minute per learner. It checks the code's check digit and seed, finds the sheet's
  key, and checks the strip is a JPEG of exactly the size that sheet's cells make (at most 150 KB). It calls the
  gateway's `read_sheet` with each tile's number, cell kind and expected digits, never an answer, and returns
  `{code, readings: [{n, read}]}` in Latin digits (`?` for what could not be read, `""` for an empty box). It never
  marks: the server does not learn right or wrong on this route. No AI, an error or a timeout answers 503
  `{"error": why}`, and the phone offers "Type my answers".
- **"What I read"**: each row shows her own tile beside the reading, with Fix (`app/js/keypad.js`: digits in her
  script, `/`, a space, delete). "Yes, mark it" hands the readings to Check my sheet in memory
  (`check.handoff`), which types them in and marks them with the key on the phone, as for typed answers.
- **Nothing kept.** The photo, the canvases and the strip live in the page's memory and are dropped when the
  screen closes; the strip is in the hub's memory for one request. Neither is written to a file, the database, D1,
  R2, a log or the phone's storage; the provider gets `store: false`. `tests/test_photo.py` patches every writer
  (files, the store, logs) and the Worker test dumps D1 after a read.
- **Fixtures.** `tools/make_test_photos.mjs` renders sheets with handwritten answers, warps them into 1080 x 1440
  photos (tilted, turned, upside down; noise and uneven light), cuts them with `scan.js` in Chromium and writes the
  strips and `tests/fixtures/photos/vision.json` (the fake's readings by hash, and what was written).
  `tools/photo_check.mjs` walks the flow in Chromium with a photo as the fake camera, then the file input, then
  offline; it checks the strip's size and that nothing was kept. Both are manual, not in CI.

## The fallback container (tutor/deploy, P12)

The same app as one container, for Render in Frankfurt if D6 goes that way ([HOSTING.md](HOSTING.md)): the hub's
code, migrations, manifests, cohorts, content and app, run by `python -m tutor_hub serve` with the Worker's online
settings and SQLite on `/data`. Not deployed; CI builds it and runs the smoke test against it.

## Learners without names (learners.py, P10)

A learner is a token's hash, a class, a band and an alias, never a name (DESIGN.md 6 to 8). The table is
`migrations/0006_learners.sql`: `token_hash`, `cohort`, `picture`, `number`, `band`, the consent record
(`consent_kind`, `consent_version`, `consent_at`) and two days (`joined`, `last_seen`); the store contract adds
`set_class_code`, `cohort_by_code`, `add_learner` (it draws the number: 1 to 99 free for that picture in that class,
then 100 to 999), `learner`, `update_learner`, `delete_learner` (her events go with her) and `prune_learners`
(12 months unseen, at start-up).

- **Joining** (`POST /api/join {band, lang, picture, cohort_code?, consent?}`, at most 20 an hour per address): a
  class code (8 letters and digits with no 0, O, 1, I or L, shown `K7QM-4PRT`; kept as `sha256("qalam-class:" +
  code)`) joins that class, otherwise the server's own cohort (`TUTOR_COHORT`). The band and language must be the
  class's and the picture one of `content/aliases.json`. The answer is a random token (the server keeps its
  SHA-256 only), the number and the class. The phone sends the token as `X-Learner-Token`.
- **Her record:** `GET /api/me`, `POST /api/me {band?, consent?}`, `DELETE /api/me` ("Stop sharing", or a learner
  removed from a phone). A token the server does not know is 401, "join again".
- **Consent:** `hello.consent` names the text to show: `hub-2026-10` on a hub, `online-2026-10` online
  (`TUTOR_HOME=online`, set in `wrangler.toml`); `GET /api/consent?lang=&version=` serves
  `content/consent/<lang>/<version>.json` (four rows and the full text; drafts). The record is the kind
  (`guardian-on-phone`, `self` or `partner-paper`), the version and the minute; a minute in the future becomes now.
- **Class codes** come from the admin panel (P21): a new cohort's code, or "New code", is shown once there (only its
  hash is kept, so it cannot be shown again), and "Class cards" prints eight cards of the QR for
  `{public_url}/?join=CODE` and the code. The command line's `class-code` is gone.
- **On the phone** (`app/js/account.js`): a learner with a class code joins once the consent screen is answered
  (agreed or "Not now"); without one she joins only when her grown-up agrees. A consent given later and a new band
  go to `/api/me`; "Stop sharing" and removing a learner queue her token for `DELETE /api/me` until the server is in
  reach. Each runs whenever the server is in reach (`account.sync()`, on every screen change and reconnection).

## Privacy

- The hub stores no names. A question is kept with a random token (so the asking phone can fetch the teacher's
  answer), the year, subject, lesson and class (cohort id); questions are deleted after `TUTOR_KEEP_DAYS` (60).
- Progress and the asked-questions list stay on the phone (`localStorage`, key `qalam.v2`). `qalam.v2` holds no name:
  a learner is a band, a year or adult track, a language, an alias picture, an optional nickname (never sent) and her
  own settings; once she joins, the server's token, number and class, and her consent record. The PIN lock is a
  salted hash on the phone (10,000 rounds of SHA-256 in `app/js/sha256.js`, since `crypto.subtle` needs HTTPS) and
  is never sent. The older `qalam.v1`, which could hold a child's name, is migrated once with the name dropped and removed.
- Events (above) are verbs and ids with no name and no free text, sent only with consent and kept against her
  token's hash; they stay on the hub.
- "I want to learn this" (P22) sends her typed goal without her token. A goal no lesson matches joins the cohort's
  `wishlist` after the rules and the identifier filter: the band, the language, the screened text, a count and the
  first and last day, never who typed it; kept 90 days after it was last asked for (`migrations/0013`). Her plan
  stays on the phone. Since P25a the plan is built over the skills graph on the phone (`app/js/graph.js`), from
  her own marks and finished lessons, which never leave it; where `plan_ai` is on, a goal nothing matched goes to
  the AI with the ids and titles of her band's nodes and never her token, and at most three existing ids come back.
- Spaced review (P25a) keeps her items, boxes and due days on the phone only (at most 300); only the event
  `recall.item` (lesson:n, 0 or 1) leaves it, with consent, as the other events do. No table was added.
- Certificates (P25b, C4.2): the row is `certificates (id, course, version, month, cohort)`, with no token hash,
  band, day, name or name hash, kept for good so its check page answers. The name she types is drawn into the paper
  as it prints and is never stored, sent, logged or put in a title or address (`tools/cert_check.mjs` types a
  sentinel and looks for it everywhere). The phone keeps `certs: [{path, id, month}]` and the paper without a name.
- `daily_counts (token_hash, day, module, n)` (7a, C4.9): a learner's photos read and certificates asked for today,
  against each module's `per_day`; kept two days and deleted with her (`migrations/0016`).
- Her own questions (P32, C4.8): on the phone as `made` (at most 50; question, answer and why, each at most 300
  characters), never sent unless she taps "Ask my teacher to check". Then the row `made (id, cohort, token_hash, kind,
  body, lang, status, chips, reply, at, decided_at)` holds what she wrote and the teacher's verdict, with no alias,
  band or number; kept 60 days after it was sent or decided and deleted with her (`migrations/0017`). No learner
  item becomes pack content, and nothing passes between learners (`share.cohort` is registered and blocked).
- A lock reset code (P20) is kept only as a hash with her token's hash, for 15 minutes, used once, ended by five
  wrong tries, and deleted with her record (`reset_codes`, `migrations/0012`).
- Nothing leaves the hub: there is no internet connection and no analytics.
- Sheet photos (online, P14): only a strip of the answer cells leaves the phone, never the name box; it is read in
  memory and never stored or logged, on the phone or the server (above, "Photo marking").
- Every table has a retention rule (`hub/tests/test_privacy.py`, the privacy suite of the pilot gate), which the
  daily retention job keeps (above, "Online: the Worker"); a new table without a rule fails CI.

## Routes

| Route | What |
|---|---|
| `GET /api/hello` | Hub name, version and `core`, `home` (`hub` or `online`), lesson count, AI on and its languages, printer state, free copies; `apk {latest, min}` for the Android app (or null); the `cohort` (id, label) and the `modules` on for it, each with version, slots, bands, needs, offline, risk and settings (`?cohort=`, `?band=`) |
| `POST /api/events` | `{events: [{at, verb, object, value}]}`, 1 to 100 from the phone's queue -> `{saved, expired}`; header `X-Learner-Token`, her consent needed |
| `GET /api/consent` | The consent text (`?lang=`, `?version=`, default `hello.consent`) |
| `POST /api/join` | `{band, lang, picture, cohort_code?, consent?}` -> `{token, number, picture, cohort}` |
| `GET`, `POST`, `DELETE /api/me` | Her own record (`{band?, consent?}` to change it); header `X-Learner-Token` |
| `GET /api/packs` | Every pack and its lesson list (no lesson content; an adult pack with its `tracks`, P26), and since P25a `graphs`: each skills graph's nodes (with the lessons this server serves), pathways and whether it is a draft, never its review block |
| `GET /api/lessons/{id}` | One lesson, picture and clip names turned into URLs, with `draft` and its `credits`, without the sheet, review or sources |
| `GET /packs/{pack}/pictures/{file}` | A lesson picture |
| `GET /packs/{pack}/audio/{lang}/{file}` | A recorded clip named in the pack's audio manifest |
| `GET /api/links` | Link cards (`?subject=`, `?year=`, `?lesson=`): title, owner, our description, address, `needs: ["internet"]` |
| `GET /api/credits` | Every outside source in use, with credit lines and licences, the linked sources, and the fonts |
| `POST /api/ask` | `{text, lang, year, subject, lesson, teacher?}` -> answer, badge source, token; an exercise gets `ladder` (three rungs), `checkable` and `unsure` instead of an answer; `teacher: true` sends it straight to the teacher ("Ask my teacher"); header `X-Learner-Token` (online: needed, with her consent) |
| `GET /api/ask/{token}` | Status and the teacher's answer |
| `POST /api/ask/{token}/teacher` | The child asks the teacher to look |
| `GET /api/sheets/{id}.html` | The sheet (`seed`, `lang`, `print=1` to open the print dialog); `kind=answers` needs `X-Teacher-Pin` and is 404 where there is no PIN; header `X-Sheet-Seed` |
| `GET /api/sheets/{id}.pdf` | The same as a PDF, on the hub only (`print`); the file is named by the code |
| `GET /api/sheets/{id}/key` | The answers for "Check my sheet" (`seed`, `lang`), with each cell's place in mm and each value item's three hints |
| `POST /api/m/homework/check` | `{id, answer}` -> `{result: right, not_yet, unsure or used_up, left}`; three checks a question; online her token and consent |
| `POST /api/print` | `{lesson, kind, copies, lang, seed}`; PIN header for answer sheets or many copies |
| `GET /api/print/{job}` | queued, printing, done, saved or failed |
| `POST /api/m/photo/mark` | `{code, seed, lang, strip}` (a JPEG of the answer cells, base64) -> `{code, readings: [{n, read}]}`; header `X-Learner-Token`, her consent needed; 6 a minute |
| `GET /api/m/teacher/me`, `todo`, `class`, `class/{alias}`, `lessons`, `lessons/{id}`, `answers/{id}.html`, `wishes`; `POST /api/m/teacher/todo/{id}`, `class/{alias}/reset-code`, `class-card`, `hub-card` | The teacher dashboard (P20); the staff gate (`X-Teacher-Pin` on the hub, Cloudflare Access online, role teacher or admin), `?cohort=` one of hers |
| `POST /api/m/plan` | `{goal, lang, band}` (s1, s2, ad) -> `{kind: plan, label, lessons}`, `{kind: closest, lessons}` (three at most), `{kind: wish, saved}` (the screened text joins the wishlist) or `{kind: rules, reason, text}` (nothing kept); her token, when sent, only picks her class (C5 H1) and is never kept with the wish; 30 a minute a phone |
| `POST /api/me/pin-reset` | `{code}`, six digits in any script -> `{ok}`; 403 a wrong code, 404 none waiting; header `X-Learner-Token`; 10 tries in 10 minutes an address |
| `POST /api/m/cert` | `{path, version, lang}` -> `{id, month, months, url, lessons, paper: {css, body}}` when her own events show every lesson of the pathway (409 `{missing}` when not); header `X-Learner-Token`, her consent needed; `per_day` (5) a token |
| `POST /api/m/cert/print` | `{id, lang, lessons}` -> the hub's print queue, the paper with an empty name line; the hub only (`print`) |
| `POST /api/m/made` | `{kind: "question", body: {q, a, why}, lang}` (each part at most 300 characters) -> `{id}`; header `X-Learner-Token`; only where `teacher` is on too; `rules.py` first (distress -> `{id: null, care: true, message}` and Needs care; anything else it stops, 422 with its message), then the identifier filter (a name she gave, seven digits, an email or a web address: 422, "take it out"); `per_day` (10) a token (P32) |
| `GET /api/m/made/mine` | her items' verdicts, `{items: [{id, status, chips, reply}]}`; header `X-Learner-Token` (P32) |
| `POST /api/m/teacher/made/{id}` | `{verdict: ok\|change, chips, reply?}`: the teacher's check of a learner's question; the reply passes the identifier filter (scrubbed) and may not hold her answer (422); the staff gate (P32) |
| `GET /api/cert/{id}` | `{id, course: {prs, ps, en}, month, months}` or 404; the core's, always on; no token; 30 a minute an address |
| `GET /v/{id}` | The check page a certificate's QR code opens (`app/js/certcheck.js`), served by Python on the hub and online |
| `GET /api/m/timetable` | `?band=` (and `?cohort=`) -> `{cohort, band, timetable: {days, holidays, ramadan, start, blocks}}`, the cohort's school day for that band; 404 where it has none; no token |
| `GET /api/m/admin/me`, `cohorts`, `cohorts/{id}`, `content`, `wishes`, `spend`, `safety`, `staff`, `log`; `POST /api/m/admin/cohorts`, `cohorts/{id}/kill`, `cohorts/{id}/flags/{module}`, `cohorts/{id}/settings`, `cohorts/{id}/code`, `cohorts/{id}/cards`, `content/{pack}/publish`, `content/{pack}/rollback`, `wishes`, `staff`; `DELETE /api/m/admin/staff/{id}` | The admin panel (P21); `X-Admin-Pin` on the hub, Cloudflare Access and an admin staff row online, 404 in the fallback container |
| `GET /api/m/review/me`, `queue`, `lessons/{id}`, `signoffs`; `POST /api/m/review/lessons/{id}/steps/{n}`, `lessons/{id}/sign` | The review screens; the staff gate (`X-Teacher-Pin` on the hub, Cloudflare Access online) |

Each route belongs to a module and answers 404 while that module is off for the cohort: `lessons` (packs, lessons,
pictures, clips, link cards), `ask` (the three Ask routes), `sheets` (the sheet page and the key), `print` (PDFs and
print jobs), `teacher` (`/api/m/teacher/*`, behind the staff gate too; the hub card also needs `print`, the answer sheet `sheets`), `photo` (`/api/m/photo/mark`), `homework` (`/api/m/homework/check`), `timetable` (`/api/m/timetable`), `plan` (`/api/m/plan`), `cert` (`/api/m/cert`; its print route also needs `print`), `made` (`/api/m/made`, `/api/m/made/mine`; the teacher's `/api/m/teacher/made/{id}` needs `teacher` and `made`), `review` (`/api/m/review/*`, behind the staff gate too). `check` has no route of its own. `/api/hello`, `/api/events`, `/api/credits`, the
learner routes, the admin panel's (behind its gate) and the app's files are always there.

## The app (app/js)

- `main.js` starts up and routes by the address after `#` (`#/home`, `#/subjects`, `#/lesson/{id}`, `#/print/{id}`,
  `#/check/{id}/{seed}`, `#/photo/{id}/{seed}`, `#/ask`, `#/teacher`, `#/who`, `#/welcome`, `#/signup/code`, `#/consent/{then}`,
  `#/cert/{pathway}` (P25b), `#/lock`, `#/settings`, `#/credits`). It takes `?join=CODE` off the address into Welcome, and shows a locked
  learner's lock on start, on switching to her and after 5 minutes away (Welcome, Who is learning, the class code
  and the teacher's page stay open).
- Sign-up (DESIGN.md 6 to 8): `screens/welcome.js` (the doors, no name field), `screens/signup.js` (the ordered
  `STEPS` after Welcome, consent then the lock offer, and the class-code screen), `screens/consent.js` (four rows read
  on open, "Read all", "Hold to agree" with `ui.holdable`, the ring the grown-up's corner also uses), `lock.js` (the
  rules: pure functions, `app/tests/lock.test.js`) and `screens/lock.js` (the keypad, the waits, the visible 24-hour
  reset), `screens/settings.js`, `aliases.js` (the pictures, kept equal to `content/aliases.json` by
  `app/tests/aliases.test.js`) and `account.js` (the server side, `app/tests/account.test.js`). Ask opens the consent
  screen before the first question it would send. `tools/signup_check.mjs` walks sign-up in Chromium.
- `bands.js` turns the learner's year or adult track into five attributes on `<html>`: `data-band` (`ey`, `p1`, `p2`,
  `s1`, `s2`, `ad`), `data-look` (`bold` or `clean`; it replaced `data-mode`), `data-tone` (`child` or `adult`),
  `data-text` (`large` for Bigger text) and `data-theme` (`light`, `dark`, or absent to follow the phone). The CSS
  tokens do the rest ([DESIGN.md](DESIGN.md)); `i18n.js` picks `{child, adult}` wordings by tone. The band also
  decides what is read aloud on open, whether the tabs show (not in early years, which has the grown-up's corner
  instead) and whether a lesson ends in stars or a check mark. English is an interface language beside Dari and
  Pashto and turns the page left to right; pack text keeps its own direction (`unicode-bidi: plaintext`).
- Speakers (the P9 look-over, DESIGN.md): every header has the page speaker (`ui.pageSpeaker`, which reads the
  screen with `readText`, skipping anything marked `data-silent`: the draft band and the connection chip). In years
  1 to 3 and adult literacy (`bands.speakerPerButton`) `ui.said()` puts a 44 px speaker after every worded button
  and row, subject tiles go one per row, and a tab says its label once the new screen is drawn.
- `speech.js` plays a recorded clip first: the pack's clip for a lesson step, or an interface clip
  `app/audio/<lang>/<key>.opus` listed in that folder's `manifest.json` (with the speaker's code, never a name, and
  the file's SHA-256). Then the phone's own voice, then the "voice not ready" toast. There is no generated speech.
  Clips marked `placeholder` (today's chimes) play only on a tester's phone (`localStorage['qalam.clips'] =
  'placeholders'`); a release needs real ones.
- `state.js` keeps the learners (above, under Privacy). `app/tests/state.test.js` checks the v1 migration,
  `speech.test.js` the clip rules and manifests, `bands.test.js` the bands and every token pair's contrast.
- `tools/browser_check.mjs` renders a screen per band in light, dark and Bigger text at any widths with Playwright
  (not an app dependency) and checks contrast, clipped text, page width, direction and the speaker rule.
- `hub.js` finds the hub (the website the app came from first, then, on a plain http page only, the usual hotspot
  addresses), and caches the lesson list and opened lessons so they still show when the hub is out of reach. It
  knows which home it talks to (`home()`: `hello.home`, else what it said last, else `online` on an https page) and
  hears the browser's `offline` event and a refresh that gets no answer at once (`lost()`); the `online` event and
  the 20-second round look again.
- **Offline online (P11, DESIGN-C2C3-SPECS.md item 5):** `ui.netChip()` ends every header (`topbar`, Home) in place
  of the old hub chip: online it is hidden while all is well, "Offline" with "· 2 waiting" when the phone is cut off,
  "Sending…" while what waited goes; on the hub "Hub" or "No hub". Tapping it opens a small sheet (what offline
  means, and the list of what waits). In early years it stays off the child's screens. `outbox.js` counts and sends
  what she sent herself: questions and teacher requests made offline (in `qalam.v2`, 7 days, then "Not sent" and
  "Send again"; a 4xx reply is "Couldn't send" and "Try again"), the class join and the consent record (until sent);
  events are never counted or shown and keep 14 days at most. Ask offline with no cached answer offers "Send when
  I'm online"; the question then carries "Waiting to send", and a toast says when it went. Home with nothing on the
  phone online says "Connect to the internet once to get your lessons", a lesson not on the phone "This lesson isn't
  on your phone yet". `app/tests/outbox.test.js` checks the queue.
- **The service worker** (`app/sw.js`) is registered only on a secure page (the online home over HTTPS, or
  localhost when testing); the hub's plain http keeps the `localStorage` caches above. It keeps the app's files
  (`SHELL`, kept equal to the app folder by `app/tests/sw.test.js`) and serves them stale-while-revalidate, so a new
  version applies at the next start with no banner; lesson pictures and clips go in a second cache as they are
  opened; `/api/` is never cached by it. `tools/offline_check.mjs` cuts the network in Chromium against an
  online-mode server and checks the whole round: reopen offline, Home and a lesson, a marked sheet, a question that
  waits, the chip, a restart, and everything sent when the network comes back.
- `modules.js` is the shell: it takes the modules on from `hello.modules` (kept on the phone for offline use; the
  built-in six when nothing is known), imports `js/modules/<id>.js` only for modules that are on and have a slot,
  and lets them offer actions through slots (`home.action`, `lesson.end`, `settings.row`). The shell, not a module,
  keeps screens sparse: at most three tabs (Lessons, Ask, and Print on the hub or Sheets online: the third belongs to
  `sheets` and says Print where `print` is on; each while its module is on, each keeping its place), and on Home one
  primary action, one secondary and one list. The clean Home has Check my sheet but no Print button, since Print is
  a tab. `screens/print.js` is one screen for both: the hub's queue where `print` is on, else "Print or save as PDF"
  then "Do it on screen" (`#/check/{id}/{seed}/screen`: the typed check with the sheet's intro and example, and trace
  and draw items as "Do this one on paper"). No learner screen shows a value answer (C2.3, P15): on Check my sheet a
  wrong row says "Look again" with Hint and Try again, the hint ladder (`ladder()` in `screens/check.js`, shared
  with Ask) opens one rung at a time from the key's cached hints, so it works offline; after rung 3 and another
  wrong try the row offers "More like this" (a new sheet) and, where `teacher` is on, "Ask my teacher". A lesson's
  wrong choice is greyed out and she picks again; a wrong number says "Not yet". Homework help (`#/ask?hw=1`,
  `modules/homework.js`) is Home's secondary for p2, s1 and s2 when her day is not set to school, online and with
  the AI on for her language. Where `photo` is on, Check
  my sheet opens with "This sheet?" for the last sheet she got: "Take a photo", then "Type my answers"; offline it
  says "Photos need the internet" instead. A screen whose module is off sends the phone Home. While connected, the app
  re-reads `/api/hello` every minute, so a module switched off leaves the phones within a minute.
  `app/tests/modules.test.js` (`node --test`) checks the shell.
- `events.js` queues the phone's events (lesson started, lesson done, sheet marked) and sends them when the hub is in reach;
  `app/tests/events.test.js` checks the queue, `app/tests/check.test.js` the Check my sheet screen's events and
  marking.
- `library.js` decides what the big button starts: the lesson left half way, else the first not done in the
  child's year, one subject after another. Every lesson stays open from the subject pages.
- Text from lessons, the hub or the AI is always added as text, never as HTML.

## The virtual school day (timetable.py, mods/timetable.py, app/js/day.js, P19)

A cohort's settings may hold `timetable`: `"default"` (the core's template in `timetable.py`) or a template of its own,
checked by `timetable.check` when a seed file or the admin sets it. A template has the school days of the week,
holidays, Ramadan's dates with its start time and shorter periods, and per band (p1 to s2) a start time and the day's
blocks in order: `opening`, `period` (with a subject, or `auto`), `break`, `sheet`, `close`. The default follows
DESIGN-C2C3-SPECS item 10: p1 two periods of 25 minutes, p2 three of 30, s1 and s2 four of 40, Saturday to Thursday.

- **The hub** serves one band's part without a token (`GET /api/m/timetable`), so the request says nothing about who
  asks, and records nothing. Switching the `timetable` module off for a cohort is the kill switch (school day and
  bells off): the route answers 404 and the phones drop the day at their next `/api/hello`.
- **The phone** (`day.js`, pure functions tested in `app/tests/day.test.js`) keeps the band's timetable in its cache and
  works the day out offline: today's blocks, where the day is, the next bell, which lesson fills each period (her
  plan's next lesson first, P22, else the next lesson not done, the subjects taking turns), the clock in her digits.
  Per learner the phone keeps `day` (`on` or `off`; unset counts as on, C2.4), `bells` (`off` only when she switched
  them off) and `shift` (her start time moved by up to two hours, in steps of 30 minutes). Nothing about the day is
  sent and no event is recorded.
- **Home** (`modules/timetable.js`): the one-time card "Your school day" ("Yes, Qalam is my school" or "I go to
  school" / Homework help) until she answers; then the Now card (before school, a period with its lesson and play
  button, the break, sheet time, the close, no school today) and the Today list, with "All subjects" (`#/subjects`).
  A bell button in Home's header switches the bells. Homework help shows only while the school day is off.
- **Bells** ring only while Qalam is on screen: one timer to the next boundary, armed while the page is visible, no
  catch-up for bells missed while hidden. Audio is unlocked on her first tap. The bells are Qalam's own tones
  (`tools/make_bells.py`, CC0, `app/audio/bells/`). No web notification and no Web Push are used.
- **Closed-app alarms** belong to the Android app (P23), after "This phone is mine": `day.syncAlarms` hands a bridge
  the app will add, `globalThis.QalamAndroid.setAlarms(json)`, a seven-day plan of times only (a wake-up 30 minutes
  before the start and each period's bell) with the title "Qalam"; `cancelAlarms()` otherwise. A browser has no
  bridge, so nothing happens there.
- **An adult's study time** (7b, C4.10; the module's bands include `ad`, with no timetable from the hub): one time a
  day, Saturday to Thursday, off until she says yes. The phone keeps `study`, `{at: "19:00", min: 30}` (on the half
  hour from 5:00 to 22:30; 15, 30, 45 or 60 minutes) or `"off"`; unset means Home's card "A time to study" has not been
  answered. During it Home's primary is "Study time: 20 minutes left" over her next lesson; the bells ring at its start
  and end while Qalam is on screen; in the APK, once the phone is hers, one alarm at its start each day
  (`day.studyAlarms`). The module's switch takes it away with the school day. Nothing is sent.

## "I want to learn this" (search.py, mods/plan.py, app/js/modules/plan.js, app/js/screens/plan.js, P22)

C3.5 and DESIGN-C2C3-SPECS item 14; typed only in 2027 (browser speech input would send her voice to a third party).

- **Where:** Home's last row, "+ I want to learn something else", drawn by the shell (`modules.homeFooter()`, not a
  slot, nothing else may use it) where `plan` is on and the band is s1, s2 or adult reader. It opens `#/plan`: a box,
  up to eight unit chips of her band's lessons, and the answer.
- **The search** (`search.plan_for`, no AI): her words against each lesson's title, unit, subject and reading steps
  in every language, a word matching give or take an ending (three letters at least; Ask's spelling clean-up). At
  least half her words in a title, unit or subject: a plan of those lessons and the rest of the best one's unit, in
  pack order, twelve at most. Otherwise a third of her words anywhere: the closest lessons, three at most. Nothing:
  a miss. Only the lessons the hub serves to her band (children by year, adults from adult packs). The chips give
  a unit's lessons on the phone, sending nothing.
- **A miss** joins the cohort's wishlist screened: the rules first (distress, health and off-limits words get the
  kind message and nothing is kept; nothing goes to a teacher from here), then `ai/filters.scrub`; the same words
  count once (`add_wish`). Offline the phone matches titles and units itself and keeps a missed goal (five at most,
  7 days) for the outbox, which sends it without the token once she has agreed. The first goal she sends opens the
  consent screen (`free.text`); "Not now" keeps the search on the phone.
- **Her plan** (`qalam.v2`): a label and lesson ids, and lessons a marked sheet added again with when. It is Home's
  continue card ("Your plan · lesson 2 of 4", priority 30, under the school day's Now card) and fills the school
  day's `auto` periods first; the plan screen shows "Your plan: Fractions, 2 of 4" with "Stop this plan". One plan
  at a time. A marked sheet with wrong items adds its lesson ("Added to your plan"), which counts as done again only
  once she finishes it after that.

## Staff pages: review and the teacher dashboard (staff.py, mods/review.py, mods/teacher.py, P17, P20)

Staff pages live on their own paths, apart from the learner app, so Cloudflare Access can guard them online (C3.2):
`/review/` (`app/review/index.html`, `app/js/review/review.js`), `/teacher/` (`app/teacher/index.html`,
`app/js/teacher/teacher.js`, P20), `/admin/` (`app/admin/index.html`, `app/js/admin/admin.js`, P21). The learner
app's service worker leaves them alone, and they keep nothing in the browser.

- **The gate** (`staff.py`, one per host). On the hub, the teacher's PIN. Online, Cloudflare Access: the Worker
  checks the `Cf-Access-Jwt-Assertion` token itself (RS256 against the team's published keys, in plain Python;
  audience, issuer, expiry) and looks up SHA-256(pepper, lower-cased email) in `staff` (`migrations/0010`:
  `id_hash`, a neutral `label`, `role`, `cohorts`, `initials`; never the email). The pepper is a secret
  (`TUTOR_STAFF_PEPPER`), never in D1. Without the Access team, the audience and the pepper, or with
  `TUTOR_STAFF_GATE=off` (the fallback container), staff routes answer 404. `python -m tutor_hub staff-add` prints the
  SQL for a staff row after hashing an email it never keeps.
- **Review** (`/api/m/review/*`, module `review`): a queue of the lessons that need her role, each lesson step by step
  drawn by the learner app itself in a frame (`/?preview=<band>&lang=<lang>#/lesson/<id>/<n>`: `state.js` keeps that
  learner in memory only, with no consent, so nothing is stored or sent), then the worksheet with its key and hints,
  the link cards and the sources. Each verdict (OK, or a change with chips and a comment, identifiers scrubbed) is a
  `review_notes` row against that step's own hash, so a changed step shows "changed". On a step with a recording, OK
  waits until the clip has played (in the page); a step that needs a recording and has none blocks signing. Signing
  (a 3-second hold) writes a `signoffs` row for the current content hash, initials only, once every step is OK.
- **The teacher dashboard** (`/api/m/teacher/*`, module `teacher`, DESIGN-C2C3-SPECS item 11). On the hub the
  PIN gives the hub's own class; online the staff row's role must be teacher or admin, and `?cohort=` one of her
  cohorts. No names anywhere: a learner is her alias (picture and number), a question its year and time.
  - *To do*, one card at a time, oldest first in three groups: needs care (Reply, Seen), held answers and ladders
    (Send, Edit with the leak check, Don't send with a reason chip: wrong, gives the answer, unsafe, not school;
    counted as `held.sent`, `held.edited`, `held.dropped` events), and questions sent to the teacher (Reply with
    "Use it for others too", Dismiss). Replies and edits go through the identifier filter. Keys S, E, D, J and K.
  - *Class*: active this week, learners, lessons finished and sheets checked this week, questions; each alias by
    picture and number with band, last seen, lessons, sheets and average, and "needs help" when three or more items
    stayed wrong after the last hint. Her page: lessons with her latest score, hint steps used, and the lock reset
    code (six digits, 15 minutes, once, five tries; `POST /api/me/pin-reset` from her lock screen's "I have a code
    from my teacher"). "Print class card": the teacher types the class code (only its hash is kept) and gets a QR
    of `<address>/?join=CODE` (byte mode, `qr.py`) with the code in text; the hub card stays on the hub.
  - *Lessons*: did it, mastered (her latest sheet at 80% or more), the hardest item, disputes and hint steps, and
    per item right, wrong, disputes and hints, all counted from events over their retention; the answer sheet
    opens from here.
  - *Wishes*: read only: each wish of her class with its count, bands and days (P22).
  - Nothing is cached: the page keeps the PIN in memory only, and offline says "Connect to see your class".
- **Into the pack:** `tools/pull_signoffs.py` (from `/api/m/review/signoffs` or a hub's database) writes the
  signatures for each lesson's current hash into its `review` block, leaving the file's layout alone, and reports
  older ones as changed since signed; release mode then serves the lesson. One changed word gives a new hash and
  voids them.

## The admin panel (admin.py, app/js/admin/admin.js, P21)

The core's, not a module: it is what switches modules on and off, so it is always there behind its own gate
(`staff.Gate.admin`). On the hub the admin PIN (`X-Admin-Pin`; `python -m tutor_hub admin-pin`, `new-admin-pin`),
separate from the teacher's and locked out separately; online a `staff` row whose role is `admin`, behind Cloudflare
Access; 404 in the fallback container. Routes are `/api/m/admin/*` (the table under Routes). Laptop first: a menu on
the start side (Cohorts, Content, AI spend, Safety, Staff, Log), a select at the top on a phone; English by default
with Dari drafts; nothing kept in the browser.

- **Cohorts:** a table (label, learners counted, bands, languages, AI and school day), and "New cohort" (a neutral
  label, bands, languages; a random 10-character id, every module off, the maturities pilot and stable, the default
  timetable; the class code shown once). A cohort's page: the two kill switches at the top ("AI off" sets the
  setting `ai`; "School day off" switches the `timetable` module), each with a confirm and a tick for every cohort;
  New code and Class cards; the module table (risk tag and the core's risk sentence, maturity, bands, a switch, the
  settings form from the manifest's schema, what locks it). A medium- or high-risk module needs a confirm (409
  `need: confirm`), a missing dependency "Turn on both" (409 `need: both`, turned on deepest first), a blocked
  capability paid-human moderation and a draft module a cohort that takes drafts (403, 409). Settings, the module's
  or the cohort's, are saved only after a confirm that shows the diff. The school day's timetable: the default or
  the cohort's own, edited day by day and block by block (school days, holidays, Ramadan's shorter day, and per band
  a start and its blocks with the times worked out), checked by `timetable.check` on save; phones fetch it at their
  next `/api/m/timetable`.
- **Content:** each pack with its version, hash, lessons and their sign-offs per role, what blocks a release
  (`packs.release_problems`), and its release per cohort; Publish (only when nothing blocks it) writes a `releases`
  row and Roll back writes the previous one again (the files come from the repository). The open review notes (the
  latest per lesson, step and role, where it asks for a change). The wishlist across cohorts, merged by its text,
  with Planned, Not for Qalam and New (`wishlist.status`, `migrations/0014`).
- **AI spend:** per cohort, fourteen days of token bars, today against the cap (warm at 80%), the estimated cost from
  the provider's prices, calls by purpose and held answers.
- **Safety:** counts only, per cohort over fourteen days: the rules' hits (distress, health, off limits) and the
  gateway's drops (a hint that leaked the answer, a sum the checker refused; a teacher's edit refused for a leak
  counts too), from `safety.flag` events (`{object: safety, value: kind}`, no text); the oldest held answer in hours;
  disputes per sheet item.
- **Staff** (online only; on the hub the PINs are the staff list): labels, roles and cohorts. Adding someone takes
  the email once, hashes it with the pepper and drops it; the last admin cannot be removed.
- **Log:** `flag_log` and `admin_log` (`migrations/0014`: a fixed `what`, a line the hub writes, the admin's label,
  never an email) together, newest first, by cohort; both are kept two years (`store.prune`).

## Certificates (cert.py, mods/cert.py, app/js/modules/cert.js, app/js/screens/cert.js, P25b)

C4.2 and DESIGN-C4-SPECS item 1. The module `cert` is on wherever a pathway with `certificate: true` is served,
`open` included (the seeds, new cohorts and `migrations/0016`); bands p1 to ad; never for Quran or seerah.

- **Earning** (`POST /api/m/cert`): with her token and consent, the server reads her token hash's events for the
  pathway's lessons in her audience (`graph.pathway_lessons`: every node the goal needs, then the goal's own): each
  counts with a `lesson.done` or a `check.done` of 80 or more, and the `final` lesson needs its `check.done` of 80
  or more (`cert.missing`). Lessons done before consent left no events, so the phone says to do their sheets again.
  Then a `certificates` row under `QC-` and ten Crockford base32 characters (50 random bits), and the paper.
- **The paper** (`cert.paper_body`): A4 landscape, black on white, its own CSS under `.cert-paper`: "Qalam ·
  certificate", the name line (empty), "has finished the lessons and practice sheets of", the course in her language
  then English, the number of lessons, the month in Solar Hijri (the month holding the 10th, Afghan names) then
  Gregorian, the QR of `<home>/v/<id>` (`qr.svg`, byte mode) and "Qalam keeps no names". The phone keeps it in its
  cache and prints it in the page (`cert.printPaper`): the typed name goes into the line, the page's print CSS shows
  only the paper, the title is "Qalam certificate QC-…", and the paper leaves the page after printing. In the APK the
  bridge's `print(title)` opens the phone's print dialog for the same page. On the hub with `print` on, the queue
  prints it (`render_pdf`, the id and course only), so the line stays empty for a name written by hand.
- **Checking**: `/v/<id>` is a plain page in the clean look, with a language switch and a speaker per line; it asks
  `GET /api/cert/<id>`. The service worker leaves `/v/` to the server. Hub certificates are checked on the hub;
  online ones online (P33 may carry hub rows).

## The pilot's gates for `open` (gates.py, 7a)

C4.9. The admin panel refuses `ask` and `homework` in the `open` cohort in 2027 (lock "open"), and `photo` there
(lock "gate") until `cohorts/gates/photo-open.json` holds the pilot report's four numbers and they pass: per language
at least 200 photographed sheets with Fix on fewer than 1 cell in 10, no leaked answer, the tokens a mark costs, and
D7's decision. The cohort page then shows the budget rule (marks a day × tokens a mark × 1.2) for `ai_budget`.
`photo` has a `per_day` setting (10; 5 in `open`, from its seed and `migrations/0016`), counted per token hash in
`daily_counts`; over it the route answers 503 "budget" and the phone says photo checking is resting today.

## The Android app (tutor/android, app/js/android.js, app/get, P23)

One WebView around the phone app, built as Sehat's is (the same Gradle wrapper, Android plugin, `androidx.webkit` and
`androidx.core`), in a project of its own: package `org.qalam.app`, launcher "Qalam" with today's icon (vector
drawables, no bitmaps), minimum Android 5. `sync-web.sh` copies `tutor/app` into the APK without its tests, the staff
pages and `/get`. The release APK is about 0.5 MB.

- **The page** is the APK's own, `https://appassets.androidplatform.net/` (`WebViewAssetLoader`, `AppPathHandler`
  serving the whole origin; anything not in the APK is a 404, never the network). It is a secure origin, so the
  service worker, localStorage and the camera work as on a website. `hub.js` then skips "this website" and asks the
  hub's plain-http addresses (`network_security_config.xml` allows cleartext only to those; mixed content is allowed
  for them) and, last, the online home baked in at build time (`QALAM_ONLINE_URL`, `QalamAndroid.online()`). The
  online Worker allows the page's origin (`TUTOR_ORIGINS`). The service worker also keeps lesson pictures and clips
  that come from the hub or the online home (`/packs/`), so a lesson opened once plays offline.
- **The bridge** `window.QalamAndroid`: `setAlarms(json)` and `cancelAlarms()` (day.js `syncAlarms`, unchanged),
  `notifyState()`, `askNotify()`, `exactAlarms()`, `openSettings()`, `version()`, `online()`. `android.js` wraps it and
  answers as a browser where it is absent.
- **Alarms** (`Alarms.java`, `AlarmPlan.java`, `AlarmReceiver.java`): the page's seven-day plan, times only, kept in
  the app's preferences; one alarm at a time, exact (`USE_EXACT_ALARM` on Android 13+, `SCHEDULE_EXACT_ALARM` up to
  12) or, when not allowed, `setWindow` within 5 minutes; set again after a restart, a clock or time zone change or an
  update. The notification says only "Qalam" and opens the app; none while the app is on screen (the page rings its
  own bell); a bell more than 10 minutes late is not rung.
- **Asked at first need:** "Is this phone yours?" right after "Yes, Qalam is my school" (APK only; the learner's
  `mine`); Yes leads to the notification explainer, then Android 13+'s own question; No says bells ring only while
  Qalam is open. Settings → School day: "This phone is mine", "Bells when Qalam is closed" (`alarms`) and, when
  notifications are off, "Allow notifications to ring bells". The camera is asked by the page's photo explainer
  (P14) and granted only to the APK's own page; after a refusal Check my sheet offers "Open Settings".
- **Updates:** `hello.apk {latest, min}` (`TUTOR_APK_LATEST`, `TUTOR_APK_MIN`; null when unset). Newer: Settings'
  "Update Qalam". Below `min`: one full-screen "Please update Qalam" (`screens/update.js`); Download opens `/get` in
  the phone's browser. The app never installs updates itself.
- **`/get`** (`app/get/`): three pictured steps, a speaker on every line, the reader's language; the APK and
  `apk.json` sit beside it once released (`tools/apk_record.py`), else it says the app is not ready. Settings → About
  links it in an Android phone's browser only.
- **CI:** `.github/workflows/tutor-android.yml`: the alarm plan's plain-Java test, then the debug APK and the
  unsigned release APK as an artifact, with the permission list and the name checked. No secrets.

## Not built yet

See [ROADMAP.md](ROADMAP.md): speech input, recorded voices for lessons, updates by USB stick, the release key and
Google's developer verification (D11).

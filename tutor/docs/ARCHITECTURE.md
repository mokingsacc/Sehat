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
| `setup/` | Installing a hub: services, Wi-Fi hotspot, printer ([HUB-SETUP.md](HUB-SETUP.md)). |
| `tools/` | `validate_pack.py` checks packs; `make_sheets.py` prints every sheet to PDF for reviewers. |

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
- `worker/entry.py` is the Worker: the ASGI adapter from the Workers SDK around the hub's `create_app()`. On the
  first request an isolate serves it reads the settings from the Worker's vars, builds the app with
  `D1Store(env.DB)` and runs `Hub.start()` (store opened and migrated, cohorts seeded, old rows pruned, search index
  built). The adapter would run the ASGI lifespan around every request, so the entry does not acknowledge it. The
  store gets the plain JavaScript binding (from `cloudflare:workers`): the SDK's `self.env` wraps bindings in its
  own Python converters, and D1Store does its own (jsnull, to_js, to_py), as its contract and the fake expect.
- Static assets are served before the Worker; only `/api/*` reaches Python (`run_worker_first`). So the hub's
  picture route and its `StaticFiles` mounts are not used online, and `create_app` mounts the app folder only
  where it exists.
- **What a host lacks** (`TUTOR_LACKS`, empty on the hub): online it is `printer,pin`. A module whose manifest
  `needs` something the host lacks is off for every cohort there, whatever its flag says, and so is any module that
  depends on it. `print` needs `printer`, and `teacher` now needs `pin` (the teacher's PIN, which only the hub has),
  so online the staging cohort's five modules resolve to Lessons, Ask and Check my sheet. Without a printer the
  hub makes no print queue (its thread cannot run in a Worker) and `/api/hello` reports the printer as off; without
  a PIN no PIN file is made. No other print or teacher path exists online yet (BUILD-PLAN 3.6 has "Get the sheet"
  and Cloudflare Access for later).
- Settings online: `TUTOR_COHORT` (the staging seed cohort), `TUTOR_AI_PROVIDER=fake`, `TUTOR_LACKS`. The Worker
  has no secrets at all.
- `.github/workflows/tutor-worker.yml` deploys on every push of `tutor/**` to the working branch: a guard (the
  Worker and its database must be `qalam-staging`), find or create D1 in the `eu` jurisdiction, `pywrangler deploy`,
  `/api/hello` (which applies the migrations), `hub/tests/smoke_http.py` (any base URL: the hub, `pywrangler dev`
  or the Worker) and `worker/measure.py`. Without the Cloudflare secrets, or when the Free plan blocks the Worker,
  it runs the same smoke test under `pywrangler dev` and stays green (D6).
- `tests/test_worker.py` loads `entry.py` with stand-ins for the runtime (the D1 fake, wrangler.toml's vars),
  serves the app through it, counts D1 calls per request (the first, which starts the hub, makes 16; the Free
  plan allows 50), checks the bundle layout and the deploy's guards.
- Limits that remain online: the per-phone limits (Ask, events) know a phone by its address, which a Worker does
  not see, so all phones reaching one isolate share them; learner tokens (P10) will replace this. Workers Logs
  stay off (no `[observability]`), as the hub keeps no access log; the deploy job reads CPU times live with
  `wrangler tail` and keeps only the numbers.

## Modules and cohort flags (modules.py, flags.py)

Each part of Qalam is a module with a manifest, `tutor/modules/<id>/module.json`, in the shape the design committee
settled (BUILD-PLAN 3.2): `id`, `version`, `maturity`, `depends`, `bands`, `slots`, `capabilities`, `ai` (only when it
calls a model), `settings`, `needs`, `offline`. The first five are today's features: `lessons`, `ask`, `print`,
`check` (Check my sheet) and `teacher`. `modules.py` checks every manifest at start and leaves out a broken one, and
any module depending on it, with the reason in the log; `tools/validate_modules.py` runs the same checks in CI. The
risk a module carries comes from the core's table of capabilities, never from the module.

A cohort is a group with the same settings, with a random id and a neutral label. The seed files
`tutor/cohorts/{hub,staging,open}.json` fill the empty `cohorts` and `flags` tables once (`migrations/0002`); after
that flags change only through the store's `set_flag`, which also writes `flag_log` (the admin panel, P21). A module
is on when its flag is on, its `depends` are on, the cohort takes its maturity, and, when the band is known, both the
module and the cohort serve that band. The hub's own cohort is `TUTOR_COHORT`, by default the id in `cohorts/hub.json`;
a request may name another with `?cohort=`. Flags are read on every request, so a switch reaches the next one, and a
switched-off module's routes answer 404 as if they were never there.

## Events without names (events.py)

An event says what happened, never who: `{at, verb, object, value}`, the UTC minute, a verb from the fixed list in
`events.py`, an id (a lesson, or where an answer came from) and a number when the verb has one (stars, copies). The
hub derives the module from the verb and adds the cohort; `token_hash` stays empty until learners have tokens (P10).
The table is `migrations/0003_events.sql`, append-only, kept 12 months (deleted at start-up after that).

- **From the phone** (`app/js/events.js`): `lesson.start` and `lesson.done`, recorded by `state.js`, and `check.done`
  (the lesson and the percent right, 0 to 100), recorded by the Check my sheet screen each time a sheet is marked (the
  Check button, or every row judged on a sheet with nothing to type), whether its key came from printing or from the
  hub. All are kept in a queue on the phone (`qalam.events.v1`, at most 500) until the hub is in reach, then sent
  with `POST /api/events`, at most 100 at a time. A batch that did not arrive stays queued; one the hub refuses is dropped.
- **From the hub's own routes:** `ask.answered` (with the answer's source), `ask.to_teacher`, `print.queued` (lesson,
  copies), `review.approved` and `review.rejected` (the question's lesson). Fetching a sheet's key writes nothing.
  A phone cannot send these. Writing one never breaks the route that made it.
- **Refused:** any field besides the four (so no free text), an unknown verb, an object that is not a plain id or
  has a run of five digits or more, a value out of range; the whole batch is refused (422). A time in the future
  becomes now; one older than 12 months is not kept. The store itself refuses a row with any column it does not
  know. `tests/test_events.py` also scans every table for a column that could hold a name, sex, birth date, phone
  number or address.

## Answering a question (brain.py)

The safest source answers first, and every answer says where it came from, so the app can label it.

1. **Rules** (`rules.py`). Distress words: a kind "tell a trusted adult now" message, and the question goes to the
   top of the teacher's list. Health: points to a health worker or the Sehat app, and the teacher sees it.
   Politics, religious rulings, weapons: "I only help with lessons". Words match whole words only.
2. **Maths.** A plain sum (`۱/۲ + ۱/۴ چند می‌شود؟`) is worked out exactly with fractions. Badge: worked out.
3. **Checked answers.** A lesson's question bank, or an answer the teacher approved, when it explains at least
   60% of the question (BM25 search, `search.py`). Badge: checked.
4. **AI**, through the AI gateway (below), only in the languages trusted so far (`TUTOR_AI_LANGS`, Dari and English
   at first) and while the cohort's daily budget lasts. The model gets the
   closest lesson passages. Every sum it writes is recomputed; an answer with a wrong sum is never shown. Badge: AI,
   or "AI, sums checked".
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
  `https://api.openai.com`) or `fake`. Any other provider, and any Anthropic or Google host whatever the provider is
  called, raises `PolicyError`: at start-up the hub refuses to start, and each provider checks again before a call.
  A module may use only the purposes its manifest lists.
- **Choosing:** `TUTOR_AI_PROVIDER` (`local` when `TUTOR_LLM_URL` is set, else `off`; `openai`; `fake` for tests and
  for staging until a key exists). `openai` without a key is simply off and is never pinged.
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

The phone sends lesson, copies, language, the seed and (optionally) the child's name. The hub renders the sheet as
HTML, turns it into an A4 PDF with WeasyPrint and queues it. One worker prints one job at a time through CUPS
(`lp`), or saves PDFs in `data/outbox/` when there is no printer (`TUTOR_PRINT=outbox`).

- **Seeds.** Sheets with generated sums (fractions, adding, times tables) get new numbers on each print. The seed
  is printed in the corner (`M7-03-4821`). The same seed always gives the same sums, so "Check my sheet" knows
  the answers, and the phone keeps the answer key it fetched when printing, to check at home.
- **Limits.** Answer sheets and more than `TUTOR_FREE_COPIES` copies need the teacher's PIN; each phone may print
  `TUTOR_COPIES_PER_HOUR` copies an hour (prints the teacher allowed with the PIN don't count). The hub knows a phone
  by its address on the hub's Wi-Fi, which the phone can't choose. Five wrong PINs lock that phone out for a minute,
  the next five for 15 minutes, then an hour each time. Ask and PDF downloads take at most 10 a minute per phone.
- **Names** go on the paper only: not in the database and not in the logs (the hub keeps no access log, because the
  sheet preview's address carries the name), and `printer.sh` tells CUPS not to keep printed files. In outbox mode
  the saved PDFs carry the name until the teacher prints and deletes them.

## Privacy

- The hub stores no names. A question is kept with a random token (so the asking phone can fetch the teacher's
  answer), the year, subject and lesson; questions are deleted after `TUTOR_KEEP_DAYS` (60).
- Progress, names and the asked-questions list stay on the phone (`localStorage`, key `qalam.v1`).
- Events (above) are verbs and ids with no name, no free text and, for now, no learner token; they stay on the hub.
- Nothing leaves the hub: there is no internet connection and no analytics.

## Routes

| Route | What |
|---|---|
| `GET /api/hello` | Hub name, version and `core`, lesson count, AI on and its languages, printer state, free copies; the `cohort` (id, label) and the `modules` on for it, each with version, slots, bands, needs, offline, risk and settings (`?cohort=`, `?band=`) |
| `POST /api/events` | `{events: [{at, verb, object, value}]}`, 1 to 100 from the phone's queue -> `{saved, expired}` (`?cohort=`) |
| `GET /api/packs` | Every pack and its lesson list (no lesson content) |
| `GET /api/lessons/{id}` | One lesson, picture names turned into URLs, without the sheet |
| `GET /packs/{pack}/pictures/{file}` | A lesson picture |
| `POST /api/ask` | `{text, lang, year, subject, lesson}` -> answer, badge source, token |
| `GET /api/ask/{token}` | Status and the teacher's answer |
| `POST /api/ask/{token}/teacher` | The child asks the teacher to look |
| `GET /api/sheets/{id}.html` / `.pdf` | The sheet (`seed`, `lang`, `kind=worksheet or answers`, `name`); header `X-Sheet-Seed` |
| `GET /api/sheets/{id}/key` | The answers for "Check my sheet" (`seed`, `lang`) |
| `POST /api/print` | `{lesson, kind, copies, lang, seed, name}`; PIN header for answer sheets or many copies |
| `GET /api/print/{job}` | queued, printing, done, saved or failed |
| `GET /api/teacher/summary`, `queue`, `prints`; `POST /api/teacher/answer/{id}`, `hub-card` | Teacher page; header `X-Teacher-Pin` |

Each route belongs to a module and answers 404 while that module is off for the cohort: `lessons` (packs, lessons,
pictures), `ask` (the three Ask routes), `print` (sheet pages and PDFs, print jobs), `check` (the sheet key),
`teacher` (the teacher routes; the hub card also needs `print`). `/api/hello`, `/api/events` and the app's files are
always there.

## The app (app/js)

- `main.js` starts up and routes by the address after `#` (`#/home`, `#/lesson/{id}`, `#/print/{id}`,
  `#/check/{id}/{seed}`, `#/ask`, `#/teacher`, `#/who`, `#/welcome`).
- The year a child picks sets `<html data-mode>`: `small` (years 0-6, look C) or `big` (years 7-12, look B). The
  CSS tokens do the rest ([DESIGN.md](DESIGN.md)).
- `hub.js` finds the hub (the website the app came from first, then the usual hotspot addresses), and caches the
  lesson list and opened lessons so they still show when the hub is out of reach.
- `modules.js` is the shell: it takes the modules on from `hello.modules` (kept on the phone for offline use; the
  built-in five when nothing is known), imports `js/modules/<id>.js` only for modules that are on and have a slot,
  and lets them offer actions through slots (`home.action`, `lesson.end`, `settings.row`). The shell, not a module,
  keeps screens sparse: at most three tabs (Lessons, Ask, Print, each while its module is on, each keeping its
  place), and on Home one primary action, one secondary and one list. The clean Home has Check my sheet but no
  Print button, since Print is a tab. A screen whose module is off sends the phone Home. While connected, the app
  re-reads `/api/hello` every minute, so a module switched off leaves the phones within a minute.
  `app/tests/modules.test.js` (`node --test`) checks the shell.
- `events.js` queues the phone's events (lesson started, lesson done, sheet marked) and sends them when the hub is in reach;
  `app/tests/events.test.js` checks the queue, `app/tests/check.test.js` the Check my sheet screen's events.
- `library.js` decides what the big button starts: the lesson left half way, else the first not done in the
  child's year, one subject after another. Every lesson stays open from the subject pages.
- Text from lessons, the hub or the AI is always added as text, never as HTML.

## Not built yet

See [ROADMAP.md](ROADMAP.md): the Android app (lessons kept on the phone, recording yourself over plain http,
finding the hub), speech input, recorded voices for lessons, progress counts for the teacher, updates by USB stick.

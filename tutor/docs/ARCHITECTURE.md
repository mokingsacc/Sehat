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
| `hub/tutor_hub/` | The hub server (Python 3.10+): `server.py` routes, `events.py` nameless events, `brain.py` answers, `rules.py` safety, `mathcheck.py` exact sums, `search.py` finding answers, `sheets.py` worksheets, `printing.py` the queue, `stores/` the database, `llm.py` the AI slot. |
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
too: no PRAGMA, every `CREATE` with `IF NOT EXISTS`. `0001_init.sql` is the schema as it was before migrations, so a
hub database made by older code takes it without harm. When the store opens, `stores/sqlite.py` applies the files not
yet in `schema_migrations(id, applied_at)`, in order, each in one transaction with its row; the PRAGMAs (WAL, full
sync) stay in the SQLite store. `tests/test_store_contract.py` runs one set of tests against every store (SQLite
now, a D1 fake later) and checks that fresh and old databases end the same and that a second run changes nothing.
A new table is a new numbered file, never an edit to an old one.

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

- **From the phone** (`app/js/events.js`): `lesson.start` and `lesson.done`, recorded by `state.js` and kept in a
  queue on the phone (`qalam.events.v1`, at most 500) until the hub is in reach, then sent with
  `POST /api/events`, at most 100 at a time. A batch that did not arrive stays queued; one the hub refuses is dropped.
- **From the hub's own routes:** `ask.answered` (with the answer's source), `ask.to_teacher`, `print.queued` (lesson,
  copies), `check.key` (a sheet's key was fetched), `review.approved` and `review.rejected` (the question's lesson).
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
4. **AI**, only in the languages trusted so far (`TUTOR_AI_LANGS`, Dari and English at first). The model gets the
   closest lesson passages. Every sum it writes is recomputed; an answer with a wrong sum is never shown. Badge: AI,
   or "AI, sums checked".
5. **Lesson passage**, if it explains at least 45% of the question. Badge: from the lesson.
6. **Teacher.** Nothing fits: the child sees "your question went to the teacher", and the answer appears on the
   phone when the teacher writes it.

The child can send any AI or lesson answer to the teacher. Each answer the teacher approves becomes a checked
answer for the next child who asks; approved Pashto answers are also the Pashto data the AI does not have yet.

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
- `events.js` queues the phone's events (lesson started, lesson done) and sends them when the hub is in reach;
  `app/tests/events.test.js` checks the queue.
- `library.js` decides what the big button starts: the lesson left half way, else the first not done in the
  child's year, one subject after another. Every lesson stays open from the subject pages.
- Text from lessons, the hub or the AI is always added as text, never as HTML.

## Not built yet

See [ROADMAP.md](ROADMAP.md): the Android app (lessons kept on the phone, recording yourself over plain http,
finding the hub), speech input, recorded voices for lessons, progress counts for the teacher, updates by USB stick.

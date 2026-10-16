# Roadmap

The full plan, with costs and the reasons: [Tutor Build Plan](https://claude.ai/artifact/CyzJJLpoB2bDe4fizEgcUx).
Nothing here needs Mo before his exam on 22 December 2026.

## Now: the foundations (October 2026, this folder)

Built and tested on a laptop:

- The app with both looks (bold for years 0-6, clean for 7-12), chosen by the year; lessons with five kinds of
  step; Ask with labelled answers; Print with a live preview; Check my sheet; the teacher page.
- The hub: lessons from packs, the answer pipeline (rules, exact maths, checked answers, an AI slot, lesson
  passages, the teacher), worksheets as one-page A4 PDFs with fresh sums per print, a print queue for CUPS, the
  teacher's review loop, privacy by design (no names on the hub).
- A starter pack: 6 draft lessons (Dari and Pashto letters, counting, English hello, fractions, states of matter)
  with placeholder pictures. **Drafts: a Dari reader, a Pashto reader and subject teachers must check every word.**
- Tests (`hub/tests`, 50+), a pack validator, sheet export for reviewers, hub install scripts.

## Stage A: the modular, async core (October to November 2026)

From the build plan (`docs/BUILD-PLAN.md`, section 6), in the order the design committee set:

- **P3a, done:** the async seam: async routes, one async store interface with SQLite behind a worker thread, an
  async model client, WeasyPrint in the thread pool, start-up in the app's lifespan.
- **P3b, done:** schema migrations (`tutor/migrations`) and the store contract tests.
- **P1, done:** module manifests for the five built features, cohorts and flags (seeded, logged), `/api/hello`
  listing the modules on, and a switched-off module's routes answering 404.
- **P2, done:** the app loads only the modules that are on: a slot registry, tabs and Home actions from
  `hello.modules`, one primary, one secondary and one list on Home, the cached list offline.
- **P4, done:** events without names: `events` (migration 0003), `POST /api/events` from a queue on the phone
  (lesson started and done, kept offline), the hub's own events for Ask, printing, Check my sheet (only a key the
  check screen fetches, not the one kept when printing) and the teacher's review; free text and unknown verbs
  refused; a scan that fails on any column that could hold a name, sex, birth date, phone number or address.
- **P5, done:** the AI gateway (`hub/tutor_hub/ai/`): provider policy in code (OpenAI, the hub's own model or the
  fake; Anthropic and Google hosts raise), a daily token budget per cohort (`ai_usage`, migration 0004) that falls
  back to checked answers and the teacher, the identifier filter, sums re-checked, hints that give the answer away
  dropped, and the fake provider with a recorder. Ask runs through it end to end on the fake.
- **P6, done:** the D1 store (`stores/d1.py`) with every method of the contract, a D1 fake as strict as D1
  (`tests/fakes/d1.py`: no PRAGMA, transactions only through `batch()`, `jsnull` not None, at most 100 values a
  statement, JS proxies out), and one contract suite and one migration mechanism for both stores; the record of
  applied migrations is `schema_migrations` alone, online as on the hub.
- **Check my sheet's event:** `check.done` (the lesson and the percent right), sent from the phone's queue each time
  a sheet is marked, replaces the hub-side `check.key`, which missed every sheet checked with the key kept from
  printing.
- **P7, done:** the Worker on staging (`tutor/worker`): the hub's own app as a Cloudflare Python Worker on
  `qalam-staging` (workers.dev), D1 `qalam-staging` in the `eu` jurisdiction, migrations applied by the D1 store from
  inside the Worker, the app and pictures as static assets, deployed by `tutor-worker.yml` on every push of
  `tutor/` with a smoke test and measurements ([HOSTING.md](HOSTING.md)). Print and teacher are off online because
  the Worker lacks a printer and the teacher's PIN (`TUTOR_LACKS`). Stage A is complete.

## Stage B: learners of all ages, and content (November to December 2026)

- **P8, done:** the content pipeline. `content/sources.json` (41 sources) now uses the app's language codes and age
  bands, with the committee's flags; the pack loader and `validate_pack.py` enforce the licence classes (AVOID
  never; LINK, unpermitted ASK and no_ai only as link cards; NC only in NC packs; share-alike carried; verbatim
  by hash), every lesson has a content hash that reviewers sign with initials (`signoffs`, `releases`, migration
  0005), production (`TUTOR_RELEASE=1`) serves only signed lessons and cards with recorded clips for the youngest,
  staging shows drafts under the draft band; link cards, a source note at each lesson's end and a Credits page
  (plain until C2); `tools/import_bloom.py` for Afghan Children Read and other Bloom books.
- **P9, done:** age bands. `app/js/bands.js` sets `data-band`, `data-look` (replacing `data-mode`), `data-tone`,
  `data-text` and `data-theme` from the learner's year or adult track; every colour and size in `app.css` is a token
  (four palettes, one `--scale` for Bigger text, dark by the phone or by choice); Home per band (early years with the
  grown-up's corner and no tabs, "lessons for adults are coming" until an adult pack is signed); English interface
  strings; `qalam.v2` with no name (v1 migrated, names dropped; Welcome and Print lost their name fields);
  `speech.js` plays recorded clips before the phone's voice, with labelled placeholder chimes until native speakers
  record; `tools/browser_check.mjs` checks every band in light, dark and Bigger text. Bigger text and the theme get
  their switches in P10's Settings.
- **C2 and C3 held** with C0 and C1 on 16 October: the sheets, the camera, results and hints, Home in and out of
  school, the offline chip, link cards and Credits, early years' modules, the `open` cohort, the school day, the
  staff pages, Learn this and the Android app are specified (DESIGN.md, "C2 and C3 decisions", and
  DESIGN-C2C3-SPECS.md). D11, Google's developer verification, is Mo's, from 23 December.

## January 2027: buy and test

- One hub computer, one ink-tank printer, two cheap Android phones.
- **The question set:** 200 test questions (maths, science, English; in Dari, Pashto and English), run through two
  or three open models with the hub's own pipeline; two paid reviewers grade them. The computer and the model are
  chosen on these scores. A model is trusted in a language (`TUTOR_AI_LANGS`) only when at least 9 in 10 of its
  reviewed answers are right and none is unsafe.
- Add a setting to hold every AI answer for the teacher before a child sees it, for the pilot's first weeks.

## February-March 2027: first packs

Years 1-2 letters and numbers, year 7 maths and science, ten lessons each (Mo's call on the set), narrated, with
worksheets and question banks. Real pictures as line art. Reviewers sign every lesson (`validate_pack.py --release`).

## April 2027: the hub complete

- **Android app** (reusing Sehat's): lessons, pictures and voices kept on the phone for home; finds the hub;
  recording yourself works (browsers allow the microphone only on secure pages, which a hub without internet
  cannot offer).
- **Speech input** for Dari and English questions (a Whisper-class model on the hub).
- **Recorded voices** for lessons (the pack's `audio` per step), as in Sehat.
- **Progress counts for the teacher** without names: how many sheets and lessons per year and subject.
- **Updates by USB stick:** packs and approved answers between hubs; backups.
- A solar test. Done when 30 phones share one hub, 30 sheets print in ten minutes, and answers arrive in under
  ten seconds.

## May-July 2027: pilot

One place the elders agree to, ideally a home-based class so girls can come. 30-60 children for eight weeks, a short
test before and after.

## After: grow

More years and subjects; Pashto answers from teachers become the training data Pashto lacks; more hubs with a partner
organisation.

## How the app grows into the village AI without changes on the phone

- **One door for questions** (`POST /api/ask`). A better model, a new language or speech input changes the hub only.
- **The hub says what it can do** (`/api/hello`: AI on and its languages, printer); the app shows what works there.
- **The model is a file** behind any OpenAI-compatible local server (llama.cpp, vLLM, Ollama).
- **Teachers in the loop:** approved answers become checked answers; Pashto stays teacher-written until it tests well.
- **Content is data:** new subjects and years are new packs, not new code.

My estimates, to be replaced by the January measurements: an AI that answers school questions well in Dari and
English with the arithmetic check during 2027; in Pashto in 2028 or later, and only if teachers keep writing Pashto
answers. A tutor that teaches every subject by itself, the original aim, later still (Dari about 2028-29, Pashto 2030
or later).

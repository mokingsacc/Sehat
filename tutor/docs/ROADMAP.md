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
  (lesson started and done, kept offline), the hub's own events for Ask, printing, sheet keys and the teacher's
  review; free text and unknown verbs refused; a scan that fails on any column that could hold a name, sex, birth
  date, phone number or address.
- Then P5 to P7: the AI gateway, the D1 store, the Worker on staging.

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

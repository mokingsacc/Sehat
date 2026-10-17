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
  their switches in P10's Settings. After the chair's look-over: a speaker beside every worded button and row in
  years 1 to 3 and adult literacy, a page speaker in every header, the draft band and the chip never read aloud, the
  Who chip off the warm colour, adult literacy's lead line in Naskh; new shots at 360 px.
- **C2 and C3 held** with C0 and C1 on 16 October: the sheets, the camera, results and hints, Home in and out of
  school, the offline chip, link cards and Credits, early years' modules, the `open` cohort, the school day, the
  staff pages, Learn this and the Android app are specified (DESIGN.md, "C2 and C3 decisions", and
  DESIGN-C2C3-SPECS.md). D11, Google's developer verification, is Mo's, from 23 December.
- **P10, done:** sign-up, consent and the PIN lock. Welcome has the doors (early years, the adults' two) and no
  name field; a tap gives the learner an alias picture of her own; a class card's `?join=CODE` (or the typed code)
  leads to the consent screen (read aloud, hold 3 seconds to agree, or "Not now") and the lock offer. The server
  keeps a token's hash, the class, band, picture and number, and the consent record (`/api/join`, `/api/me`,
  migration 0006); events need her token and her consent. The lock: four digits on the phone only, waits after five
  wrong tries, a visible 24-hour reset that deletes nothing, never for early years. Settings (Bigger text, theme,
  lock, nickname, consent and "Stop sharing", Credits as C2.6, About, remove a learner behind her PIN); the Teacher
  link only while the teacher module is on; the grown-up's corner fills a ring as it is held.
  `tools/signup_check.mjs` walks it in Chromium.
- **P11, done:** the online app shell. A service worker on HTTPS (never on the hub's plain http) keeps the app's
  files and the lessons and pictures she opened, so the online app opens and works with the network cut; the net
  chip replaces the hub chip (hidden online while all is well, "Offline · 2 waiting" when cut off); questions and
  teacher requests made offline, her join and her consent wait on the phone and go when the network is back
  ("Waiting to send", 7 days for a question, then "Send again"), events wait silently for 14 days. Online, Ask needs
  her token and consent, the limits count tokens rather than addresses, and CORS allows only `TUTOR_ORIGINS`.
  `tools/offline_check.mjs` cuts the network in Chromium and checks the round.
- **P12, done (minimal):** the fallback kit in `tutor/deploy` (a Dockerfile in online mode without WeasyPrint, and a
  Render Blueprint for Frankfurt with a disk), not deployed. Kept because D6 is still open: the Worker port works,
  but the Free plan's CPU limit does not fit, so Render stays one of Mo's three answers. CI builds the image and
  runs the smoke test against it ([HOSTING.md](HOSTING.md)). Stage B's build work is complete.

## Stage C: the pilot features (built early, from October 2026)

- **P13, done:** sheets online and a photo-ready layout (C2.1). Every sheet is laid out in mm: four corner squares
  (one a ring), name and date boxes to fill by hand, a two-column slot grid, one answer cell per sum or count, and a
  text-only QR code with the sheet's code, `M7-03-48217`, whose last digit is a Damm check digit. No app name, URL or
  cohort on paper. A `sheets` module now holds the sheet, the keys, "Get the sheet" and the lesson-end card; `print`
  only adds the hub's queue. Online the third tab is Sheets: "Print or save as PDF" through the browser, then "Do it
  on screen". Check my sheet no longer shows a sum's answer. `name` left the server's sheet and print routes.
  `make_sheets.py --batch` prints a stack for a class; `tools/sheet_check.mjs` checks the print in Chromium.
- **P14, done:** photo marking of Qalam sheets (C2.2), on in staging only. Check my sheet asks "This sheet?" and
  offers "Take a photo" first; the in-page camera takes the photo itself once the four squares hold still (or the
  phone's own camera through a file input), the phone cuts out the answer cells only and sends one small greyscale
  strip, `read_sheet` reads it through the AI gateway (on the fake until the provider key comes in January), and
  "What I read" shows her own writing beside each reading to fix before the phone marks it. The server returns
  readings only and never learns right or wrong; photos and strips are never stored or logged.
- **P15, done:** hints, never answers (C2.3). Check my sheet marks each item with "Look again", three hint rungs
  made by code with the sheet's key (the lesson step, a worked example with other numbers, the first move; checked
  for leaks in every form and cached for offline), "You're close" with "More like this" and "Ask my teacher", and
  "Something looks wrong?". No learner screen shows a value answer, lessons included. Ask sends exercises to the
  ladder; Homework help (module `homework`, on in staging) adds the model's private solve, twice, and "Check my
  answer", three tries. New events `check.item`, `hint.rung`, `check.dispute`, with no names.
- **P16, done:** the blind-test kit (`tools/blindtest/`, `content/blindtest/`). It runs a question set and sheet
  strips through the hub's own gateway and prompts, mixes the AI's answers with teachers' reference answers on
  shuffled grader sheets under random codes (the key stays with the organiser), and scores each provider, language
  and purpose against the nine-in-ten rule, the references as the control. Dry-run on the fake in the tests; the real
  run waits for the key in January.
- **P17, done:** the review screens (C3.4) at `/review/`, on in staging. Reviewers see each lesson step drawn by the
  learner app in the lesson's own look, play its recording, mark it OK or ask for a change with chips and a comment,
  then see the worksheet with its key and hints, the link cards and the sources, and sign the content hash with a
  3-second hold. `staff` keeps a peppered hash of the email, a neutral label, the role and initials (C3.2); online the
  Worker checks Cloudflare Access's token itself, and the staff pages stay off until Mo sets up Access and its three
  secrets (HOSTING.md). `tools/pull_signoffs.py` copies signatures into the packs for release.
- **P19, done:** the virtual school day (C2.4, C3.1). Each cohort's timetable gives every school band an opening,
  periods, a break, sheet time and a close; Home asks once whether Qalam is her school, then shows the Now card and
  Today's timetable, each period filled with a lesson. Bells ring while Qalam is on screen; no web notifications.
  On in all three seed cohorts; switching `timetable` off is the kill switch. Closed-app alarms wait for the Android
  app (P23), through a hook already in place.
- **P20, done:** the teacher dashboard (C3.2) at `/teacher/`, behind the PIN on the hub and Cloudflare Access
  online. To do, one card at a time: needs care first, then held answers and ladders (Send, Edit with the leak check,
  Don't send with a counted reason), then questions sent to the teacher. Class: who was active, each alias with
  "needs help", her page with a six-digit lock reset code. Lessons: did it, mastered, the hardest item, disputes and
  hint steps, from nameless events. Print class card: a QR for `?join=CODE`. Hold-for-teacher is the `teacher`
  setting `hold`, off until the admin panel (P21) or a flag change turns it on. Online it stays off until Mo sets up
  Access and adds the teachers' staff rows.
- **P21, done:** the admin panel (C3.3) at `/admin/`, behind its own PIN on the hub and Cloudflare Access with an
  admin staff row online. Cohorts with neutral labels (the label filter) and class codes shown once; a page per
  cohort with the two kill switches (AI off, school day off) at the top, the module table with the core's risk
  sentence, confirms for risky modules and missing dependencies, blocked capabilities only with paid human
  moderation, settings saved through a diff, and the school day's timetable editor; Class cards, eight to an A4 page.
  Content (sign-offs, Publish and Roll back into `releases`, review notes, the wishlist across cohorts with Planned and
  Not for Qalam), AI spend against the cap, Safety counts, Staff (online only, emails hashed and dropped) and the Log
  of every change. The command line's `class-code` is gone. Online it stays closed until Mo sets up Access and adds
  the first admin's staff row.
- **P22, done:** "I want to learn this" (C3.5), typed only. Home's last row in s1, s2 and for adult readers opens a
  box and unit chips; a goal that matches gives a plan of lessons in pack order, which becomes Home's continue card
  and fills the school day's periods; a partial match gives the closest lessons; a miss joins the class's wishlist,
  screened, without the token, kept 90 days, and shows in the teacher's Wishes tab. A marked sheet with wrong items
  adds its lesson to her plan. On in all three seed cohorts, `open` included (C2.8).
- **P23, done (built; the phone trials wait for devices):** the Android app (C3.6) in `tutor/android`, Sehat's way of
  building but its own project: the phone app in one WebView, the hub first and then the online home, bells when
  Qalam is closed on a phone she says is hers (exact alarms, a notification that says only "Qalam"), the camera for
  photo marking, "Update Qalam" and the "Please update Qalam" card from hello's `apk`, and `/get` with three pictured
  steps. CI builds a debug APK and an unsigned release APK (about 0.5 MB) as an artifact, with no secrets. Pilot
  phones are installed over USB; release signing and Google's developer verification (D11) are Mo's, in HOSTING.md.
- **P24, done (built; production waits for Mo's steps and the dress rehearsal for people):** the daily retention job
  on the hub and as the Worker's cron; the privacy suite (a retention rule for every table, the wishlist and reset
  codes); a 60-learner load test (`tools/load_test.py`, in every CI run: no request failed, about 44 D1 queries a
  learner); production ready but not deployed (`wrangler.production.toml`, its guard, and a hand-started workflow from
  `main` behind an approved environment, with a weekly encrypted D1 export); `docs/RELEASE.md` with the checklist,
  rollback and the restore drill. What Mo does to go live is in HOSTING.md, "Going live".
- **P25a, done:** the skills graph (C4.1): `content/graph/<subject>.json` maps nodes to lessons, checked at start
  and by `validate_pack.py`, signed on a graph page in `/review/` and hidden in release mode until signed. Plans
  follow it on the phone: what the goal needs and she has not mastered (latest sheet at 80%, or a finished lesson
  without a sheet) comes first, tagged "Learn first"; a node's title is matched too, and `plan_ai` (off everywhere)
  may pick at most three node ids. Pathways are cards at the top of their subject and the first chips of "I want to
  learn..."; one plan at a time with a stop question; a finished plan says "Done" once. Spaced review (`recall`) is a
  warm-up of up to three due items inside the next lesson, on in `open`, staging and new cohorts.
- **P26 with 7c, done (the content is a start):** adult tracks (C4.3): adult packs say which tracks see them; Home's
  list for adults is "What to learn", the track rows (reading in her language, everyday maths, English, Chinese,
  University), one per row with a speaker for adult literacy; the literacy track's packs print bold and need every
  clip; four more badge colours; adult wording for "All correct" and the day's end; after the literacy pathway, one
  card offers the reader look. `adult-literacy-1` and `adult-maths-1` are drafts of three lessons each, with their
  pathways. 7c (C4.11): adult literacy gets "I want to learn..." as goal chips read aloud, each a pathway, with
  "Someone can type it for you"; no microphone.
- **7b, done:** an adult's study time (C4.10): "A time to study" once on adult Home, off until she says yes; a sheet
  that asks only the time (from 7:00 in the evening, 30 minutes); "Study time: 20 minutes left" on Home during it, with
  a bell at its start and end while Qalam is open, and the APK's alarm once the phone is hers; Settings → Study time
  for on or off, the time and the length. Nothing is sent.
- **P25b with 7a, done:** certificates (C4.2): a finished pathway with a certificate offers "Get my certificate" on
  its card and on the Done card; the server reads her own events (with consent) and writes a row with no learner in
  it; she may type a name that is printed and forgotten, never sent; the paper is A4 landscape with a QR code to
  `/v/<id>`, which says whether a certificate is real. On the hub the printer prints it with an empty line. 7a
  (C4.9): photo marking for `open` waits for the pilot's four numbers in the admin's hands, with five reads a day a
  learner there (ten elsewhere); Ask and Homework help stay off in `open` in 2027.

## January 2027: buy and test

- One hub computer, one ink-tank printer, two cheap Android phones.
- **The question set:** 200 test questions (maths, science, English; in Dari, Pashto and English), run through two
  or three open models with the hub's own pipeline; two paid reviewers grade them. The computer and the model are
  chosen on these scores. A model is trusted in a language (`TUTOR_AI_LANGS`) only when at least 9 in 10 of its
  reviewed answers are right and none is unsafe.
- Turn on the `hold` setting (built in P20) for the pilot cohorts' first weeks, so every AI answer waits for the
  teacher before a child sees it.

## February-March 2027: first packs

Years 1-2 letters and numbers, year 7 maths and science, ten lessons each (Mo's call on the set), narrated, with
worksheets and question banks. Real pictures as line art. Reviewers sign every lesson (`validate_pack.py --release`).

## April 2027: the hub complete

- **Android app** (reusing Sehat's): lessons, pictures and voices kept on the phone for home; finds the hub;
  recording yourself works (browsers allow the microphone only on secure pages, which a hub without internet
  cannot offer).
- **Speech input** for Dari and English questions (a Whisper-class model on the hub).
- **Recorded voices** for lessons (the pack's `audio` per step), as in Sehat.
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

# Qalam build plan

Draft for the design committee, 16 October 2026. Built on the code in this folder (branch `claude/project-thread-sbgfoh`,
draft PR #1), the committee plan of 16 October and its two reviews, and Mo's instruction that day: start the build,
builders on Opus 5.5 high, every design element settled by a committee of Opus 5.5 max and Fable 5.1 max,
usage-efficient, methodical, for all ages, using the free resources out there.

Sections 1 to 5 say what is built and why it is shaped this way; section 6 is the work, phase by phase; sections 7 to 9
are the calendar, the tests and the decisions. Every Dari and Pashto line any phase produces is a draft until native
speakers check it. Nothing here needs Mo before 22 December 2026.

---

## 1. Goal, scope and "done"

### 1.1 Goal

One free app that a learner of any age in Afghanistan can open on a cheap phone, a tablet or a laptop: a small child
with a parent beside her, a girl kept out of school after year 6, a boy doing homework, an adult learning to read, a
school-leaver preparing for university or learning English or Chinese. Ease of use comes first: few options on any
front page, a big speaker button on every text, simple and calm, never busy. No advertising, ever.

The same core runs **online** (Cloudflare, EU region, OpenAI behind the AI slot) for city learners from 2027, and
**offline** on the village hub that already exists in `hub/` (local model, printer, no internet), which returns as a
pilot in spring 2028.

### 1.2 Scope for 2027

- **Core:** module manifests, per-cohort switches, nameless events, an AI gateway, one async store interface with
  SQLite (hub) and D1 (online).
- **Learners:** sign-up with age band, guardian consent and PIN lock; looks and voice per age band; lessons,
  worksheets, Check my sheet and Ask (all built).
- **Photo help:** printed Qalam sheets photographed and marked against the sheet's own answer key, with hints, never
  answers. Other homework photos later, behind the blind test.
- **School day** for out-of-school learners: timetable, bells, breaks, wake-up alarm, on by default.
- **Goals:** "I want to learn this" over signed lessons, then over a reviewed skills graph.
- **Teachers and admins:** dashboard, admin panel, held-answer queue, content sign-off.
- **Content:** a pipeline that imports free resources by licence class, with attribution, review and signature.
- **Year 1, after the pilot:** adult tracks, English, Chinese, university preparation, Quran and seerah from verified
  text; live audio classes and competitions only if funded and approved.

Out of scope in 2027: learner-to-learner contact, leaderboards with names or places, money prizes, any dealing with the
ministry, Claude or Gemini in learner-facing calls, stored homework photos, stored names, a quick-wipe button,
advertising or tracking code.

### 1.3 "Done" for the pilot (go-live 26 April 2027)

| # | Done when | Checked by |
|---|---|---|
| 1 | A guardian and child finish sign-up on a $60 Android phone in under 3 minutes, every screen read aloud | browser check, then a timed run by a reviewer |
| 2 | Pack 1 is signed by a Dari reader, a Pashto reader and a subject teacher; `validate_pack.py --release` passes | CI |
| 3 | A photographed Pack 1 sheet comes back marked in under 20 seconds on throttled 3G, with "what I read" shown | browser check |
| 4 | No hint contains the answer: 100% on a test set of every Pack 1 sheet item | automated test |
| 5 | Held-answer mode is on for the pilot cohort and the teacher clears the queue from the dashboard | test, dress rehearsal |
| 6 | The school day runs with bells on by default, off in one tap; the APK's alarm fires | two real phones |
| 7 | The admin switches a module off for the cohort and phones see it within a minute | test, dress rehearsal |
| 8 | No table holds a name, sex (unless Mo decides), or free text in events; no photo is written anywhere | privacy test suite |
| 9 | AI spend is capped per cohort per day; requests to OpenAI carry nothing identifying | gateway tests |
| 10 | Production runs on the Worker (or Render if the 31 January gate failed); a restore has been rehearsed | release checklist |
| 11 | DPIA, safeguarding policy and partner data agreement signed (Mo's, not builders') | decision log |

### 1.4 "Done" for all ages (end of 2027)

Every age band in section 2 has a Home that suits it, at least one signed starter pack, a speaker on every text and
privacy suited to its age. Adults learn without childish pictures. English (beginner) and a Chinese starter exist for
Dari and Pashto speakers; university preparation links to free, verified resources. The same core passes the same tests
on the hub's SQLite and on D1.

---

## 2. Age bands and how the app adapts

Today the school year picks one of two looks: `small` (years 0 to 6, look C, bold) and `big` (years 7 to 12, look B,
clean), Mo's choice of 14 October. The plan keeps both looks and adds a **band** and a **tone** (child or adult), so
adults get big, simple screens without childish pictures. The learner never picks a look; the band does, and one
setting, "bigger text", overrides size for anyone.

| Band | Who | Look | Navigation | Voice | Reading | Privacy |
|---|---|---|---|---|---|---|
| EY | about 3 to 5, year 0 | C, child | one huge play button; no tabs; grown-up's corner behind a long press | everything read on open | none needed: pictures and sound | guardian holds the phone; no AI |
| P1 | years 1 to 3 | C, child | play button, subject tiles, Lessons / Ask / Print | read on open | short sentences, Naskh 22 px | guardian consent; AI answers held in the pilot; no photo upload |
| P2 | years 4 to 6 | C, child | as P1, plus Check my sheet | lesson steps read on open; speaker elsewhere | two-clause sentences | guardian consent; photo help on Qalam sheets |
| S1 | years 7 to 9 | B | continue card, subject list, three tabs | speaker to tap | textbook level, Vazirmatn 18 px | guardian consent; photo help; goals |
| S2 | years 10 to 12 | B | as S1, plus Goals | speaker to tap | textbook level | guardian consent under 18; university links |
| AD | 18 and over | B for readers; C size, adult tone, for adults learning to read | tracks instead of years: Literacy, Maths, English, Chinese, University | speaker; read on open in Literacy | first letters to university | own consent |

Rules across bands:

- **Band, not birth date.** "Who is learning?" shows a picture per band; inside a school band she picks her year, as now.
- **Fewest options.** Every Home shows at most one big action, one secondary action and one list.
- **Speaker on every text,** including buttons, answers, hints and teacher messages; the browser check fails otherwise.
- **Pictures:** line art of objects, no faces (CONTENT.md); adult packs use adult objects (market, clinic, bus).
- **School day or Homework help:** out-of-school learners get the school day, in-school learners get Homework help on
  Home. Whether she is in school stays on the phone and is never sent.
- **Privacy rises with youth:** under 13, typed text reaches an AI only through the rules screen and identifier
  filter, and cohorts can hold AI answers for the teacher. Nothing relies on OpenAI's clause on minors, which nobody has
  yet read live.

The number of bands, the adult-literacy look and the band pictures are the committee's first questions (sitting C1).

---

## 3. Architecture

### 3.1 Core and modules

The hub is already modular in spirit: one door for questions (`POST /api/ask`), the hub saying what it can do
(`/api/hello`), content as data. The plan makes it explicit.

| Core part | Today | Becomes |
|---|---|---|
| Identity | one teacher PIN; anonymous question tokens | learner token (random, stored hashed), cohort, band, consent record; PIN lock on the phone; teacher and admin roles |
| Cohorts and flags | none | `cohorts`, `flags`, `flag_log`; flags resolved per request |
| Content | packs, validator, BM25 search | plus licence enforcement from `sources.json`, sign-offs, releases per cohort, skills graph later |
| Events | none | append-only, nameless, no free text |
| AI | `llm.py` behind `brain.py` | `ai/` gateway: provider policy, purposes, budgets, identifier filter, moderation, fake provider |
| Store | `store.py`, sqlite3 with a thread lock | `stores/`: one async interface, SQLite and D1, shared SQL migrations |
| App shell | plain JS modules, two looks, i18n, speech | plus a slot registry loading only enabled modules; band and tone tokens |

**Modules**, switchable per cohort. Built: Ask, Lessons, Print, Check my sheet, Teacher page. Pilot: Photo help,
Homework mode, School day, Teacher dashboard, Admin panel, Learn this, Review. Later: Adult tracks, English, Chinese,
University, Quran and seerah, Certificates, Live audio, Competitions, Learner-made content, Box sync.

### 3.2 The module manifest

One file per module, `tutor/modules/<id>/module.json`, checked by `tools/validate_modules.py` in CI and by the hub at
start (a failing module is left out, as packs are). Hub code in `hub/tutor_hub/mods/<id>.py` (a router at
`/api/m/<id>/`); app code in `app/js/modules/<id>.js`. Built-in modules point at their existing files.

```jsonc
{
  "id": "photo",                          // lower case, the folder name
  "name": {"en": "Photo help"},           // Dari and Pashto in app/js/i18n.js, drafts until checked
  "version": "0.1.0",                     // semver; a patch changes no behaviour
  "core": ">=0.3",                        // the core API it needs
  "depends": ["lessons", "sheets"],       // declared now, checked simply (one repo)
  "maturity": "draft",                    // draft, pilot or stable; pilot cohorts take pilot and stable only
  "slots": ["home.tile", "lesson.end"],
  "scopes": ["content", "self", "events.write"],
  "capabilities": {"photo.upload": "high", "ai.call": "medium"},
  "ai": {"purposes": ["read_sheet", "hint"], "langs": ["prs", "en"],
         "max_calls_per_learner_day": 30, "hold_for_teacher": false, "sources_only": true},
  "bands": ["P2", "S1", "S2", "AD"],
  "settings": {"max_photos_per_day": {"type": "int", "min": 1, "max": 50, "default": 10}},
  "offline": {"works": "no", "bundle": false},   // yes, partly or no; bundle for APK and USB
  "needs": ["internet"],                  // hidden while the phone is offline
  "review": {"by": [], "date": null}      // who signed its learner-facing text
}
```

- **Slots:** `tab`, `home.tile`, `home.banner`, `subject.section`, `lesson.step`, `lesson.end`, `timetable.block`,
  `ask.source`, `teacher.panel`, `admin.panel`, `settings`.
- **Scopes:** `content` (read), `self` (this learner, on the phone where possible), `cohort.summary` (counts only),
  `events.write`. JS modules in one page cannot be walled off, so scopes are a review checklist plus hub route guards,
  not a sandbox.
- **Capabilities with risk shown to the admin:** `photo.upload`, `audio.record`, `ai.call`, `free.text`,
  `share.public`, `child.contact`. The hub refuses to switch on the last two unless the cohort's moderation is
  `paid-human`.

### 3.3 Cohort flags

A cohort is a group with the same settings: the Mazar class, an open online group, a village hub. A learner joins with
a code from her teacher or a printed card; without one she joins `open`.

- `flags(module, cohort, enabled, settings, changed_by, changed_at)`; every change also goes to `flag_log`.
- A module is on for her when its flag is on (default off), its `depends` are on, its maturity is allowed in the
  cohort, her band is listed and the core version fits. The app hides `needs: internet` modules while offline.
- Cohort settings (validated JSON): languages, bands, AI on, AI languages, daily AI budget, hold AI answers, photo
  help, timetable template and bells, live classes, retention days, moderation level.
- Seed files `tutor/cohorts/{hub,staging,open}.json` fill empty tables; after that only the admin panel changes flags.
- `/api/hello` (with her token or `?cohort=`) returns enabled modules and settings; the app re-reads it on start and
  every few minutes.
- Two one-tap kill switches per cohort: AI off; school day and bells off (the committee's answer if the authorities'
  tolerance changes).

### 3.4 Data model

Shared SQL migrations in `tutor/migrations/NNNN_name.sql`, run by the hub at start and by the deploy workflow on D1.

| Table | Main columns | Kept |
|---|---|---|
| `cohorts` | id, join code (hashed), langs, bands, settings | while active |
| `flags`, `flag_log` | as 3.3 | log 2 years |
| `learners` | token hash, alias, cohort, band, consent kind, text version and time, last seen | until deleted or 12 months idle |
| `events` | time (minute), token hash, cohort, module, verb, object id, value | 12 months, then counts |
| `questions` | as today, plus cohort and token hash | 60 days |
| `approved` | as today, plus cohort scope | permanent |
| `prints` | as today (hub only) | 60 days |
| `ai_usage` | day, cohort, module, purpose, provider, model, tokens, cost, held | 2 years |
| `wishlist` | cohort, band, language, screened text, count | 90 days |
| `releases` | pack, version, content hash, cohort, by, when | permanent |
| `signoffs` | lesson, content hash, role, initials, date | permanent; mirrored in the pack |
| `certificates` (Year 1) | id, course, band, date, cohort; never a name | permanent |

Never on the server: names, sex (unless Mo decides live classes need it, then as a routing flag only), date of birth,
school status, phone number, location, photos, audio. The **alias** (an object and a number from a reviewed word list)
is made by the server so a teacher can tell learners apart; the nickname she types stays on her phone. Teachers and
admins sign in through Cloudflare Access online and the PIN on the hub.

On the phone (`localStorage`, `qalam.v1` migrated to `qalam.v2`): learners, nicknames, band and year, PIN-lock hash,
progress, private notes, school-day settings, the upload queue, cached lessons; a service worker caches the app.

### 3.5 API

Existing routes stay (ARCHITECTURE.md). New:

| Route | What |
|---|---|
| `GET /api/hello` | adds `core`, `cohort`, `modules` |
| `POST /api/join` | `{cohort_code?, band, year?, lang, consent}` → `{token, alias, cohort}` |
| `GET` / `DELETE /api/me` | her cohort, band, alias; deletion of her server records (deliberate, behind her PIN) |
| `POST /api/events` | up to 100 queued events |
| `POST /api/m/photo/mark` | sheet code, seed, cropped image → items read, right or wrong, hints |
| `POST /api/m/homework/hint` | the next hint rung; never the answer |
| `GET /api/m/plan?goal=` | signed lessons in order; a miss joins the wishlist |
| `GET /api/m/timetable` | the cohort's timetable |
| `/api/m/teacher/*`, `/api/m/admin/*`, `/api/m/review/*` | dashboards and review; Access online, PIN on the hub |

Online, learner routes need the token, and rate limits key on it, because carrier NAT puts thousands of phones behind
one address. The hub keeps its address-based limits.

### 3.6 One core, two homes

```
                     app/ (same files) + service worker + APK shell (Sehat's)
                                      |
             +------------------------+-------------------------+
   online: Cloudflare Python Worker              village hub: uvicorn on Linux
   the same FastAPI app (ASGI entry)             the same FastAPI app
   D1Store (eu); AI: OpenAI                      SqliteStore; AI: local model
   sheets: HTML and answer key, no PDF           sheets: PDF (WeasyPrint), CUPS queue
   teacher and admin: Cloudflare Access          teacher and admin: PIN
```

- **Async first, on the hub.** Python Workers need async database and network calls and nothing in the hub is async,
  so the port happens on the hub while the code is small (P3); both homes then run the same code. SQLite runs in a
  thread on the hub; printing keeps its thread there and is absent online.
- **Store interface** (`stores/base.py`): one contract suite runs every store test against SQLite and a D1 fake.
- **HTTP adapter:** `httpx.AsyncClient` on the hub; whatever the Worker supports (the spike decides) behind it.
- **Printing** is a module with `needs: ["printer"]`; online, Print becomes "Get the sheet" (HTML plus the key).
- **Gate:** tests pass on a staging Worker by 31 January 2027, or the same code runs under uvicorn on Render Starter in
  Frankfurt behind Cloudflare. D1 and R2 are created with jurisdiction `eu` (it cannot be added later); the DPIA
  records "EU, not UK".

### 3.7 The AI gateway

`hub/tutor_hub/ai/` replaces direct use of `llm.py`.

- **Provider policy:** learner purposes may use `openai` (online), `local` (hub) or `fake` (tests, and staging until a
  key exists). Any other host, Anthropic and Google included, is refused by code and by a test. Claude may serve only
  UK-side drafting and evaluation tools in `tools/`, which carry no learner data.
- **Purposes:** `explain`, `hint`, `read_sheet` (vision against a known key), `plan` (Year 1), `screen`. Manifests say
  which a module may use.
- **Before a call:** rules screen, identifier filter (nicknames sent by mistake, phone numbers, long digit runs, email
  shapes), cohort budget, language check (Pashto off until nine in ten reviewed answers are right and none unsafe).
- **After a call:** maths re-check (as now), answer-leak check for hints (5.3), source badge, hold-for-teacher, an
  `ai_usage` row.
- **Fake provider:** scripted replies per purpose, latency, errors and timeouts, a vision fake that "reads" fixture
  images from JSON, and a recorder so tests assert exactly what would be sent. Everything is built and tested on it;
  OpenAI is a configuration change after 20 January 2027.

---

## 4. The content pipeline

### 4.1 Sources and licence classes

`tutor/content/sources.json` (being written now, with `docs/FREE-RESOURCES.md`) gives every outside source an id, owner,
URL, licence and one class. The pipeline reads it and enforces the class; this plan does not pre-judge any source.

| Class | Meaning | The pipeline allows | Where research so far points (sources.json decides) |
|---|---|---|---|
| BUNDLE | copying and changes allowed (CC BY, CC BY-SA, CC0, public domain, OFL) | import into any pack with attribution; share-alike carried to the pack | Darakht-e Danesh items marked CC BY, Global Digital Library storybooks, PhET |
| BUNDLE-NC | non-commercial licences (CC BY-NC, BY-NC-SA) | import only into packs marked `licence: NC`, kept apart | Khan Academy Farsi (Iranian vocabulary needs Afghan review) |
| LINK | may be pointed to, not copied | a link card (title, owner, our one-line description, link), no copied text, no embedding unless allowed, `needs: internet` | Begum Academy, Right to Learn |
| ASK | needs written permission | treated as LINK, or hidden, until a record in `content/permissions/` says otherwise | anything a partner may license |
| AVOID | never used | the validator refuses any reference | 1980s jihad-era textbooks; Iranian religious school material |

A source may add flags the validator also enforces: `verbatim` (no edits; Quran translations), `attribution` (exact
wording), `no_ai_training`, `needs_internet`.

### 4.2 From source to learner

1. **Register** the source in sources.json. No class, no import.
2. **Import or draft** with `tools/import_<kind>.py`; every lesson, picture and audio file carries
   `sources: [{id, item, changes}]`. AI drafting is allowed on the UK side (Claude included, since no learner touches
   it); the lesson records `drafted_by` and stays a draft.
3. **Validate** in CI: today's checks plus no unknown or AVOID ids, NC only in NC packs, no copied text in LINK or
   unpermitted ASK items, `verbatim` text matching its source by hash, attribution present.
4. **Review:** a Dari reader, a Pashto reader and a subject teacher; a Hanafi scholar for religious content; an adult
   educator for adult packs. On phones in the Review module (P17) or on printed review sheets.
5. **Sign** the lesson's content hash; any later change voids it. Signatures live in `signoffs` and are written back
   to the pack by `tools/pull_signoffs.py`.
6. **Release:** `--release` passes and the admin publishes the pack version to a cohort.

**Nothing reaches learners unsigned**, enforced three times: CI refuses a production deploy with an unsigned lesson in
a released pack; production (`TUTOR_RELEASE=1`) never serves an unsigned lesson or one whose hash does not match; drafts
show only in the staging cohort, under a "draft" band, to reviewers.

A Credits page (from Settings) and a one-line source note at the end of each lesson that uses outside material, with a
speaker like everything else.

### 4.3 Languages

Dari (`prs`): interface, lessons, AI answers once trusted, with an Afghan glossary in the prompt. Pashto (`ps`):
interface and lessons, reviewer-written; AI off until it passes; teacher-approved answers grow the bank. English (`en`):
a subject, and the interface for adults who choose it. Chinese (`zh`): a subject taught through Dari or Pashto (Year 1).
Arabic (`ar`): Quran text, verbatim only. Persian digits in Dari and Pashto, sums left to right. Machine translation
never ships unsigned.

### 4.4 Packs per age band

| Band | By the pilot | By end of 2027 |
|---|---|---|
| EY | none | letters by sound, counting, picture stories |
| P1 | Pack 1a: years 1 to 2 letters and numbers, 10 lessons, if Mo picks it | years 1 to 3 literacy and numeracy |
| P2 | none | years 4 to 6 maths and reading starter |
| S1 | Pack 1b: year 7 maths and science, 10 lessons each, if Mo picks it | years 7 to 9 maths and science; Begum link cards per unit |
| S2 | none | maths practice sheets and links; university preparation |
| AD | none | adult literacy starter, English beginner, Chinese starter, university and scholarship links |
| all | | Quran and seerah, retrieval only |

Mo chooses Pack 1 (D2); the tools are the same either way.

---

## 5. Learner extension, safety, privacy and consent

### 5.1 How learners extend the app

| Stage | When | What she can do | What is shared |
|---|---|---|---|
| v1 | pilot | "I want to learn this", typed or spoken, searched against signed lessons; a plan in pack order; misses go to the wishlist. Private notes and "my own questions" on the phone. A marked sheet adds the lessons behind wrong items to her plan | nothing; the admin sees screened wishlist text with counts, no token |
| v2 | autumn 2027 | plans over a reviewed skills graph; the AI may choose and order nodes, never invent them; spaced review on the phone | nothing |
| v3 | 2028, behind flags | her own questions and short lessons, private by default; "ask my teacher to check"; rules and moderation pre-screen; teacher approval before classmates see it; labelled "written by a learner", "checked by a teacher" | approved items, inside her cohort only |

Nothing passes between learners before paid human moderators exist.

### 5.2 Safety in every module

- All learner free text passes `rules.py` first: distress to the top of the teacher's list with a kind message; health
  to a health worker or Sehat; politics, religious rulings and weapons declined. Dari and Pashto reviewers check the
  word lists in January.
- OpenAI's moderation is a second screen for English and images only; it makes no claim for Dari or Pashto, so the
  rules and teachers stay the real safeguard. The blind test measures it on Dari.
- Hold-for-teacher per cohort, on for the pilot's first weeks. Every answer keeps its source badge.
- Religious content only as verified text through retrieval, AI off.

### 5.3 Hints, never answers

The committee's evidence: answer-giving chatbots lowered exam scores; scheduled, supervised practice with answers
withheld raised them.

- **Qalam sheets:** code and seed give the key, so the hub knows every answer. A hint containing the answer in any
  form (`3/4`, `۳/۴`, `0.75`, `۰٫۷۵`, or in words) is rejected, regenerated once, then replaced by "listen to this
  step again".
- **The ladder:** rung 1 points to the lesson step; rung 2 is a worked example with other numbers, from the existing
  generators, not the model; rung 3 names the first step for this item. "More like this" gives fresh generated items.
- **Other homework** (after the blind test): the model solves privately, the hint is checked against that solution,
  and two disagreeing runs send it to the teacher.

### 5.4 Privacy

- Names are typed on the phone for a sheet or certificate, used once, never stored or logged. Sheets have a "Name" line
  (`sheets.py`), so the phone crops the name box before any upload.
- Photos are processed in memory and discarded: not written to R2, the database or logs. If a queue is ever needed:
  R2 `eu`, deleted after marking, a one-day lifecycle rule.
- Events hold verbs and ids only. OpenAI zero data retention is requested in January; images are cropped to the answer
  cells. A daily job deletes what has expired (3.4).
- Threat model from the research: any phone or server may be seized, so neither may say "girl, 14, not in school".
- The PIN lock stays; there is no quick wipe. Removing a learner is a deliberate Settings action behind her PIN, with
  a spoken confirmation.

### 5.5 Consent and moderation

- **Under 18:** a guardian consents before AI, photo help or events switch on. The screen is short, read aloud, and the
  guardian holds a button for three seconds. The record keeps the kind (`guardian-on-phone` or `partner-paper`), the
  text version and the time, not the guardian's name. The pilot partner also collects paper consent.
- **Without consent:** lessons, worksheets and checked answers still work; AI and photo help are off.
- **Adults** consent for themselves. **Withdrawal:** `DELETE /api/me`, or the admin on request.
- The lawful basis for under-13s and the final wording are for the solicitor in March (Mo); consent text is versioned
  data, so it changes without code.
- **Moderation:** until paid human moderators exist, the only learner-originated content anyone else sees is a question
  a teacher has rewritten or approved, as today.

---

## 6. Phases

Rules for every phase:

- **One builder session each**, Opus 5.5 high. Read only the files listed and the sections named; quick checks after
  each edit, the batch test at the end; update ARCHITECTURE.md and ROADMAP.md; commit on `claude/project-thread-sbgfoh`
  with the attribution lines. PR #1 stays a draft.
- **Design phases** ("Committee: yes") start from a decision note. To save usage the committee meets in batched
  sittings (C0 to C4, end of section 6). A builder never designs a look, layout or interaction alone: an unanswered
  design question goes to the next sitting and the builder builds the rest.
- **Size:** S fits easily in a session, M fills one; anything bigger is split.

### Stage A: the modular, async core (17 October to 22 November 2026)

**P1. Module manifests and cohort flags; `/api/hello` lists enabled modules** (S)
- Goal: the smallest useful step. Manifests for `ask`, `lessons`, `print`, `check`, `teacher`; `cohorts`, `flags`,
  `flag_log`; seed cohorts; flag resolution; `modules` in `/api/hello`; a switched-off module's routes return 404.
  No behaviour change for cohort `hub`.
- Files: `tutor/modules/*/module.json`, `hub/tutor_hub/{modules,flags}.py` (new), `store.py`, `server.py`,
  `config.py` (`TUTOR_COHORT`), `tutor/cohorts/*.json`, `tools/validate_modules.py`, `tutor.yml`.
- Done when: `/api/hello` lists five modules for `hub`; `print` off makes `/api/print` 404 for that cohort; a broken
  manifest is left out with a logged reason; all existing tests pass.
- Tests: `tests/test_modules.py` (validation; resolution with depends, maturity, bands); `test_api.py` additions.
- Committee: settled by C0 (sections 3.2, 3.3).

**P2. The app loads only enabled modules** (S)
- Goal: a slot registry; tabs and Home tiles from `hello.modules`; off modules not loaded; cached list used offline.
- Files: `app/js/modules.js` (new), `main.js`, `ui.js`, `screens/home.js`, `hub.js`.
- Done when: with `print` off, the Print tab and "print today's sheet" vanish and nothing else moves.
- Tests: `node --check`; first `node --test` file, `app/tests/modules.test.js`.
- Committee: no (no new look).

**P3. The async core on the hub** (M)
- Goal: async routes and store calls; `stores/base.py` and `stores/sqlite.py`; `httpx.AsyncClient`; printing keeps its
  thread; `tutor/migrations/0001_init.sql`.
- Files: `server.py`, `store.py` (to `stores/`), `brain.py`, `llm.py`, `printing.py`, `tests/conftest.py`.
- Done when: the whole suite passes unchanged in meaning; a laptop hub serves the app as before.
- Tests: full suite; 20 concurrent asks complete.
- Committee: settled by C0 (3.6).

**P4. Events without names** (S)
- Goal: `events`, `POST /api/events`, server-side events for ask, print, check and review; a phone queue.
- Files: `events.py` (new), `migrations/0002_events.sql`, `server.py`, `app/js/events.js` (new), `state.js`.
- Done when: a lesson done offline shows as two events after reconnecting; free text or an unknown verb is refused.
- Tests: `tests/test_events.py`; a schema scan that fails on any name-, sex-, birth-, phone- or address-like column.
- Committee: no.

**P5. The AI gateway and fake provider** (M)
- Goal: section 3.7; `brain.py` calls the gateway.
- Files: `ai/{gateway,providers,policy,fake,filters}.py` (new), `brain.py`, `config.py` (`TUTOR_AI_PROVIDER`,
  `TUTOR_AI_BUDGET`), `migrations/0003_ai_usage.sql`.
- Done when: Ask works end to end on the fake; an Anthropic or Google host for a learner purpose raises; an
  over-budget cohort gets checked answers and the teacher, never an error; the recorder finds no nickname or digit run.
- Tests: `tests/test_gateway.py`; brain tests through the gateway.
- Committee: no.

**P6. The D1 store and contract tests** (M)
- Goal: `stores/d1.py`, a D1 fake (SQLite behind D1's call shape), one contract suite for both.
- Files: `stores/d1.py`, `tests/fakes/d1.py`, `tests/test_store_contract.py`.
- Done when: the suite passes on both; migrations run from empty and again without harm.
- Committee: no.

**P7. The Worker on staging** (M)
- Goal: `tutor/worker/` (entry point, `wrangler.toml`, `pyproject.toml`); app and packs as static assets; D1
  `qalam-staging` in `eu`; migrations; deploy on push to the working branch (workflow_dispatch needs the file on the
  default branch). Measure memory, cold start and CPU.
- Files: `tutor/worker/*`, `.github/workflows/tutor-worker.yml` (pinned wrangler, secrets check, find-or-create, as
  `server.yml`), `docs/HOSTING.md` (new).
- Done when: staging serves the app; `tests/smoke_http.py` (any base URL) passes against it; measurements recorded. If
  the Workers Paid plan is needed and absent, the job says so and the spike runs under `pywrangler dev` in CI (D6).
- Committee: no.

### Stage B: learners of all ages, and content (23 November to 22 December 2026)

**P8. Content pipeline and licence classes** (M)
- Goal: section 4: sources.json enforcement, `sources` blocks, content hashes, `signoffs`, `TUTOR_RELEASE`, link cards,
  Credits data, one importer for a BUNDLE source.
- Files: `tools/validate_pack.py`, `packs.py`, `docs/CONTENT.md`, `migrations/0004_content.sql`,
  `content/permissions/README.md`, `tools/import_<kind>.py`.
- Done when: fixtures citing AVOID, NC in a non-NC pack, or copied text in a LINK card fail CI; production hides the
  starter drafts, staging shows them under the draft band.
- Tests: `tests/test_licences.py`; a fixture `sources.json` if the real one is not ready.
- Committee: no; link card and Credits looks go to C2.

**P9. Age bands, tone, bigger text** (M)
- Goal: section 2: `data-band` and `data-tone`, tokens in `app.css`, bigger text, the speaker rule as a check.
- Files: `app/css/app.css`, `state.js` (v2 migration), `ui.js`, `speech.js`, `docs/DESIGN.md`.
- Done when: six bands render Home at phone, tablet and laptop sizes; every worded element has a speaker; v1 data
  migrates.
- Tests: `node --test` for the migration; browser screenshots per band.
- Committee: **yes, C1**.

**P10. Sign-up, consent, PIN lock** (M)
- Goal: band, year, language, guardian consent, optional nickname (phone only), optional cohort code, PIN lock
  (4 digits, salted hash, locks after 5 idle minutes and on switching learner); `/api/join`, `/api/me`; draft alias
  list.
- Files: `screens/welcome.js`, `who.js`, new `consent.js` and `lock.js`, `state.js`, `mods/join.py`,
  `migrations/0005_learners.sql`, `content/aliases.json`.
- Done when: sign-up takes under 3 minutes in the browser check with every screen spoken; without consent AI and photo
  modules are off; a forgotten PIN is reset without wiping (method from C1).
- Tests: `tests/test_join.py`; JS tests for the lock.
- Committee: **yes, C1**.

**P11. The online app shell** (M)
- Goal: a configured HTTPS origin besides the hub; service worker cache; an upload queue that survives restarts;
  token-keyed limits; CORS narrowed online.
- Files: `hub.js`, `app/sw.js` (new), `index.html`, `server.py`, `config.py`.
- Done when: staging opened once survives a simulated two-day outage (lessons, Check my sheet, queued events); limits
  hold per token behind one address.
- Tests: browser check with the network cut; limit tests in both modes.
- Committee: yes, light, C2 (offline and "waiting to send" signs).

**P12. The fallback kit** (S)
- Goal: `tutor/deploy/render.yaml` and a Dockerfile (online mode, no WeasyPrint), not deployed, so the 31 January gate
  costs Mo one account and an hour.
- Done when: the image builds and the smoke suite passes against it in CI (batch only).
- Committee: no.

### Stage C: the pilot features (23 December 2026 to 25 April 2027)

**P13. Sheets online, photo-ready layout** (M)
- Goal: keys from code and seed online; "Get the sheet" as HTML; corner markers, a QR with code and seed, fixed answer
  cells and a fixed name box; `make_sheets.py --batch` for facilitators.
- Files: `sheets.py`, `screens/print.js`, `check.js`, `tools/make_sheets.py`.
- Done when: every Pack 1 sheet fits one A4 page; online and hub keys match for a seed.
- Tests: `test_sheets.py`; a layout test for marker and box positions.
- Committee: **yes, C2**.

**P14. Photo marking of Qalam sheets** (M)
- Goal: camera capture (no gallery save where possible), find markers, crop the name box away, shrink to about
  100 KB, upload; `read_sheet` reads the cells; the hub compares with the key; "what I read" for her to correct; right
  or wrong per item and the hint ladder. "I can't read this" is valid; drawings are out.
- Files: `modules/photo/`, `mods/photo.py`, `app/js/modules/photo.js`, `tests/fixtures/photos/`.
- Done when: fixtures mark correctly on the fake; no image byte is written to disk, D1, R2 or logs (every writer
  patched in the test); the uploaded name box is blank.
- Tests: `tests/test_photo.py`; browser check with a fixture camera.
- Committee: **yes, C2**.

**P15. Homework mode and the hint ladder** (M)
- Goal: section 5.3 for Ask and photos; Homework help on Home for in-school learners; "more like this".
- Files: `ai/filters.py`, `brain.py`, `mods/homework.py`, `app/js/modules/homework.js`, `screens/ask.js`.
- Done when: the hint set passes at 100% against a fake that tries to leak; Pashto hints come only from checked answers.
- Tests: `tests/test_hints.py`.
- Committee: **yes, C2**.

**P16. The blind-test kit** (S)
- Goal: run questions and sheet photos through any provider via the gateway; anonymised grader sheets; scores against
  the nine-in-ten rule per language and purpose. Claude and Gemini only for information, never learner-facing.
- Files: `tools/blindtest/`, `content/blindtest/README.md`.
- Done when: a dry run on the fake yields grader sheets and a score report.
- Committee: no.

**P17. The Review module** (M)
- Goal: reviewers read each step aloud, comment and sign on a phone; `tools/pull_signoffs.py`; a reviewer cohort.
- Files: `modules/review/`, `mods/review.py`, `app/js/modules/review.js`, `tools/pull_signoffs.py`.
- Done when: a lesson signed on staging passes `--release` after the pull; one changed word voids it.
- Committee: **yes, C3**.

**P18. OpenAI live on staging** (S, after Mo's key, from 20 January 2027)
- Goal: the `openai` provider, key as an Actions secret, budget caps, moderation, zero retention requested; the real
  blind-test run.
- Done when: staging answers Ask and marks a fixture photo through OpenAI within budget; removing the key falls back
  cleanly.
- Tests: request shape against the recorder; live checks in a manual job only.
- Committee: no.

**P19. The virtual school day** (M)
- Goal: a cohort timetable (wake-up, opening, periods, breaks, worksheet time, close), bells on by default, off in one
  tap, today's lessons from her plan; web notifications while open, real alarms in the APK (P23).
- Files: `modules/timetable/`, `mods/timetable.py`, `app/js/modules/timetable.js`, bell sounds cleared in sources.json.
- Done when: an out-of-school learner gets the day by default and can silence it; the kill switch removes it within a
  minute.
- Committee: **yes, C3**.

**P20. The teacher dashboard** (M)
- Goal: held answers, waiting questions, counts, progress per alias, mastery per lesson, wishlist.
- Done when: 30 held answers cleared in under 10 minutes in rehearsal; no name anywhere.
- Committee: **yes, C3**.

**P21. The admin panel** (M)
- Goal: cohorts and codes, flags with risk, releases, AI spend, safety flags, kill switches; Access online, PIN on hub.
- Done when: every change is logged; `child.contact` cannot be switched on without paid-human moderation.
- Committee: **yes, C3** (light).

**P22. "I want to learn this" and the wishlist** (S)
- Goal: section 5.1 v1. Files: `modules/plan/`, `mods/plan.py`, `app/js/modules/plan.js`, `search.py`.
- Done when: a matching goal gives an ordered plan; a miss reaches the wishlist screened and without the token.
- Committee: **yes, C3** (where the entry sits without cluttering Home).

**P23. The Android app** (M)
- Goal: Sehat's shell wraps the app: lessons and audio on the phone, alarms, camera, a signed APK on GitHub Releases.
- Files: `tutor/android/` (from Sehat's, kept separate), `.github/workflows/tutor-android.yml`.
- Done when: it installs on two cheap phones, runs a lesson offline, fires the alarm, marks a photo on staging.
- Committee: yes, light, C3 (download screen, permission prompts).

**P24. Pilot hardening and production** (M)
- Goal: production Worker and D1 `qalam` (eu); retention cron; backups (Time Travel plus a weekly export); a 60-learner
  load test; the privacy suite; `docs/RELEASE.md`; a week's dress rehearsal on staging with reviewers and the
  facilitator.
- Done when: every row of 1.3 is ticked except Mo's documents; production needs environment approval.
- Committee: no.

### Stage D: Year 1 (July to December 2027)

During the pilot the pilot cohort's modules are frozen: weekly safety and bug fixes only. New modules ship behind flags
that are off for the pilot cohort, so any gain can be attributed.

| Phase | Goal | Committee |
|---|---|---|
| P25 Skills graph, spaced review, pathways, certificates (M) | reviewed prerequisite graph; plans over it; review dates on the phone; pathways; certificates with a typed name, verifiable by id with no name stored | yes, C4 |
| P26 Adult tracks (M) | literacy in C size with adult tone; everyday maths; tracks on Home | yes, C4 |
| P27 English and Chinese (M) | English beginner through Dari and Pashto with recorded voices; Chinese starter from sources.json; speech input only for short known answers | yes, C4 |
| P28 University preparation (S) | link cards to verified free courses and scholarships; a checklist pathway; no promises | yes, C4, light |
| P29 Quran and seerah (M) | verified text and translations (`verbatim`), per-verse audio, retrieval only, AI off, scholar sign-off | yes, C4 |
| P30 Live audio classes (M; only if Mo approves in July and six months are funded) | audio only, listen by default, hand-raising, unique links, no one-to-one, no recording by default, women teachers | yes, C4 |
| P31 Competitions and Olympiads (M; only after the sanctions and safeguarding opinions) | opt-in, avatars, no places for girls, no money prizes | yes, C4 |
| P32 Learner-made content v1 (M) | section 5.1 v3 | yes, C4 |
| P33 Box parity and USB sync (M) | every offline module on the hub; USB export and import of packs, approved answers, flags, counts; ready for spring 2028 | yes, light |

### Committee sittings

| Sitting | When | Settles | Builders bring |
|---|---|---|---|
| C0 | now | this plan's design choices: manifest, slots, flags, async first, store, photo handling, aliases, bands | this file |
| C1 | late October 2026 | bands, adult tone, visual identity and icon, bigger text, dark mode, sign-up order, consent screen, alias versus nickname, PIN lock and reset | a one-page note and an artifact of mock screens per band |
| C2 | early December 2026 | sheet layout for photos, camera and "what I read", results and hints, Home for in-school versus out-of-school, offline signs, link cards and Credits | note, mock screens, mock sheet |
| C3 | early January 2027 | school day and bells, teacher dashboard, admin panel, review screens, "learn this" entry, APK screens | note, mock screens |
| C4 | July 2027 | Year 1 modules | note, mock screens |

Each sitting returns a short decision note for DESIGN.md and the decision log.

---

## 7. Timeline

Mo's limits: optional work only, at most an hour a week, until 30 November; nothing from 1 to 22 December (his exam);
MSRA fortnights 6 to 19 January and 11 to 25 February kept clear until he knows his sitting; ERAS in July and September;
a UK post probably from early August. Ramadan about 8 February to 9 March 2027; Nowruz 21 March; Eid al-Adha about
16 May.

| When | Builders | Committee | Gates and events | Mo |
|---|---|---|---|---|
| 17 to 31 Oct 2026 | P1, P2, P3 | C0, C1 | | optional: build card, 5 minutes |
| 1 to 22 Nov | P4 to P7 | | first staging deploy by 22 Nov | optional: read the verdict, 21 Nov |
| 23 Nov to 22 Dec | P8 to P12 | C2 | full suite green on staging by 22 Dec | optional: January plan by 28 Nov; nothing 1 to 22 Dec |
| 23 Dec to 19 Jan 2027 | P13 to P17 | C3 | | nothing (possible MSRA) |
| 20 to 31 Jan | P18; blind-test runs | | key from 20 Jan; **port gate 31 Jan** | key, second admin, reviewer emails, name, Mazar contact |
| February | P19 to P21; Pack 1 drafting | | blind test graded by 10 Feb; AI language decisions | scores; nothing 11 to 25 Feb |
| March | P22, P23; Pack 1 corrections | | Pack 1 signed; DPIA drafted; pilot class by 31 Mar | solicitor, Pack 1 sign-off, pilot class |
| 1 to 25 Apr | P24; dress rehearsal | | production approved about 19 Apr | sign DPIA and safeguarding policy |
| 26 Apr to 25 Jun | fixes only; Year 1 behind flags | | **pilot**, Mazar-i-Sharif; pause at Eid al-Adha | weekly 30-minute check-in |
| July | P25, P26 | C4 | results by 31 Jul; live-class decision | results, live classes |
| Aug to Sep | P27 to P29 | | scholar sign-off for P29 | monthly check-in |
| Oct to Dec 2027 | P30, P31 if approved; P32, P33 | | Kabul and Herat cohorts by flag; CIO application | cohorts, CIO |
| Spring 2028 | | | village-hub pilot | |

About 24 sessions before the pilot across 27 weeks leaves slack: a missed week slides a week, not a gate. If the port
slips past 22 December, P13 to P15 are built on the hub first; they do not need the Worker.

---

## 8. Testing and release

| Level | When | What |
|---|---|---|
| Quick check | after each change, under a minute | `pytest -q -x` on the touched test file; `node --check` on touched JS; `validate_pack.py` or `validate_modules.py` if content or manifests changed |
| Batch test | once at the end of each phase | full `pytest` on both stores; `node --test app/tests`; browser check; sheet export; HTTP smoke on staging |
| Pilot gate | P24 and each production release | batch plus the privacy suite, hint-leak set, load test, restore drill |

- **Unit and contract tests:** the existing 50-plus grow per phase. Fixed suites: store contract, gateway policy
  (refused providers, budgets, recorder scans), privacy (name-like columns, photo writes, free text in events, names in
  logs), licences, hint leaks, fake vision fixtures.
- **Browser checks:** Playwright with Chromium, in CI on batch and when `app/` changed: 360 by 740, 800 by 1280 and
  1366 by 768, right to left, every band's Home, timed sign-up, a lesson, Check my sheet, photo marking with a fixture
  camera, offline mode, and the speaker-on-every-text rule. Screenshots are attached to the run for the committee.
- **CI:** `tutor.yml` adds manifest validation, the contract suite and JS tests on every push; browser checks and the
  fallback image on batch (`[batch]` in the commit message, or manual). `tutor-worker.yml` deploys staging on push to
  the working branch. Production deploys only from `main` (or Qalam's own repository, D3) through a GitHub environment
  that needs Mo's or the second admin's approval.
- **Staging:** the `staging` cohort on the staging Worker and D1 (eu); the fake provider until 20 January, then OpenAI
  on a small budget; drafts under the draft band. Reviewers, the facilitator and the committee use it; no learner does.
- **Release approval:** (1) CI green with the batch test; (2) each phase's "done when" ticked in the commit or PR
  comment; (3) design changes carry their committee note; (4) released packs signed; (5) `docs/RELEASE.md` checklist
  complete (privacy suite, kill switches, backups, budget caps); (6) Mo or the second admin approves the environment.
  During the pilot, one release a week on a fixed day after a day on staging; a safety fix may go the same day.
  Rollback: the previous Worker version and D1 Time Travel.

---

## 9. Risks, open decisions, decision log

### 9.1 Risks

| Risk | What the plan does |
|---|---|
| The Python Worker cannot run the hub (memory, packages, cold starts) | async port first (P3), staging by 22 November, gate 31 January, Render kit ready (P12) |
| Workers Paid plan needed before Mo can act | spike under `pywrangler dev` until January (D6) |
| OpenAI's clause on minors is stricter than summaries say | nothing identifying sent; consent before AI; AI per cohort and band; a person reads the live text before the pilot |
| No API key until about 20 January | everything built on the fake; P18 is small |
| Poor Dari or Pashto in the blind test | the core works without AI; Pashto off by default |
| Hints leak answers | leak check against known keys; 100% test set; held answers in the pilot |
| Poor reading of Arabic-script handwriting | boxed cells, digits first, "what I read", "I can't read this" |
| Reviewers slow or missing | Pack 1 kept to 10 to 20 lessons; review on phones; drafting from January |
| Licence mistakes | classes enforced in CI; LINK by default when unclear |
| A phone or server is seized | no names, sex or school status on the server; aliases; no stored photos; per-cohort kill switches |
| Too many modules for one maintainer; "all ages" scope creep | fixed phase sizes; pilot freeze; Year 1 modules gated on funding and decisions; P9 builds the frame only |
| Connectivity cuts | offline cache and queues; the pilot pauses rather than fails |
| Build usage | quick checks per change, one batch per phase, batched sittings, builders read only listed files |

### 9.2 Open decisions for Mo (none before 22 December)

| # | Decision | Earliest | Needed by | Default |
|---|---|---|---|---|
| D1 | Girl or boy asked at sign-up, or only when live classes launch | 23 Dec | 15 Mar | only with live classes |
| D2 | Pack 1: years 1 to 2 letters and numbers, year 7 maths and science, or both | 20 Jan | 31 Jan | year 7 maths, plus years 1 to 2 letters if reviewers allow |
| D3 | Merge the tutor into Sehat's `main`, or move it to its own repository | 23 Dec | 31 Mar | own repository |
| D4 | The second admin | 20 Jan | 28 Feb | production approval waits |
| D5 | The app's name | 20 Jan | 31 Mar | Qalam |
| D6 | Workers Paid plan; a Render account only if the gate fails | 20 Jan | 31 Jan | Render |
| D7 | Online sign-up open to all, or invite-only during the pilot | 20 Jan | 31 Mar | invite-only |
| D8 | Partner class or home-based class | as the committee plan | 31 Mar | home-based, through the Mazar contact |
| D9 | Live audio classes | July 2027 | 31 Jul | no until funded |
| D10 | Ministry recognition | after 22 Dec | none | not in 2027 |

### 9.3 Decision log

| Date | Decision | By | Source |
|---|---|---|---|
| 14 Oct 2026 | Look B for older learners, look C's boldness for younger, chosen by the year | Mo | DESIGN.md |
| 16 Oct 2026 | OpenAI only for learner-facing AI; never Claude or Gemini there | committee | AI tutor report |
| 16 Oct 2026 | Cloudflare Workers, D1, R2 in `eu` via Actions; Render Frankfurt if the port fails by 31 Jan | committee; Mo's fallback | committee plan |
| 16 Oct 2026 | One pilot: Mazar-i-Sharif, 26 Apr to 25 Jun 2027, 30 to 60 learners; village hub in spring 2028 | committee | committee plan |
| 16 Oct 2026 | Names only for certificates and sheets, never stored; PIN lock kept; no quick wipe; no advertising | Mo | working plan |
| 16 Oct 2026 | Learner additions private first; "learn this" searches lessons first; sharing needs a teacher | committee | committee plan |
| 16 Oct 2026 | Start the build: builders Opus 5.5 high; design by Opus 5.5 max and Fable 5.1 max; usage-efficient; all ages; free resources | Mo | Mo's message |
| 16 Oct 2026 | Proposed, for C0: async port before features; photos in memory, no R2 in v1; server-made aliases; six bands with a tone; licence classes enforced in CI and at serve time; batched sittings | builder draft | this file |

New decisions are added with date and source; a row is never edited, only superseded.

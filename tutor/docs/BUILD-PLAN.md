# Qalam build plan

Draft of 16 October 2026, revised the same day to the design committee's C0 and C1 decisions
(`build-committee/decisions_fable.md`), and again to its C2 and C3 decisions (DESIGN.md, "C2 and C3 decisions"). Built on the code in this folder (branch `claude/project-thread-sbgfoh`,
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
- **School day** for out-of-school learners: timetable, bells, breaks, wake-up alarm; on by default while the app is
  open, alarms with the app closed only on a phone she has said is hers (C3 settles the screens).
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
| 6 | The school day runs with bells on by default, off in one tap; the APK's alarm fires once she has said the phone is hers | two real phones |
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
clean), Mo's choice of 14 October. The committee (C0.5 and C1, 16 October) keeps both looks and adds a **band** and a
**tone**, as two switches on `<html>`: `data-look` (bold or clean: sizes, fonts, read-on-open) and `data-tone` (child
or adult: palette, words, pictures). Adults learning to read get bold sizes in the adult tone. The learner never picks
a look; the band does, and one setting, "Bigger text", scales every size for anyone. The spec is in DESIGN.md.

| Band | Who | Look, tone | Home | Voice | Reading | Privacy |
|---|---|---|---|---|---|---|
| `ey` | about 3 to 5, year 0 | bold, child | one huge play button and a listen button; no tabs; the grown-up's corner behind a long press | everything read on open, from recorded clips | none needed: pictures and sound | guardian holds the phone; no AI; no lock |
| `p1` | years 1 to 3 | bold, child | play, "print today's sheet", subject tiles; tabs Lessons, Ask, Print | Home and lesson steps read on open | short sentences, Naskh 22 px | guardian consent; AI answers held in the pilot; no photo upload |
| `p2` | years 4 to 6 | bold, child | as `p1`; Check my sheet from Print and the lesson's end | lesson steps read on open; speaker elsewhere | two-clause sentences | guardian consent; photo help on Qalam sheets |
| `s1` | years 7 to 9 | clean, adult | continue card, Check my sheet, subject list; three tabs | speaker to tap | textbook level, Vazirmatn 18 px | guardian consent; photo help; goals |
| `s2` | years 10 to 12 | clean, adult | as `s1` | speaker to tap | textbook level | guardian consent under 18; university links |
| `ad` | 18 and over | track `literacy`: bold, adult; track `reader`: clean, adult | tracks instead of years: Literacy, Maths, English, Chinese, University | speaker; read on open in Literacy | first letters to university | own consent |

Rules across bands:

- **Band, not birth date.** She taps a year, "not in school yet" or an adult door; the band follows. No band pictures:
  the alias picture (C0.4) is the only avatar, on the Who chip and in "Who is learning".
- **Fewest options.** Every Home shows at most one big action, one secondary action and one list; the shell, not a
  module, enforces it (C0.1). Settings lives behind "Who is learning", never on Home.
- **Speaker on every text,** including buttons, answers, hints and teacher messages; the browser check fails otherwise.
- **Pictures:** line art of objects, no faces (CONTENT.md); adult packs use adult objects (market, clinic, bus).
- **School day or Homework help:** the school day is on by default wherever the cohort has a timetable; one card on
  Home switches to Homework help; `day: on|off` stays on the phone (C2.4).
- **Learn this** is Home's last row for `s1`, `s2` and `ad` reader, the shell's `homeFooter()` (C3.5).
- **Privacy rises with youth:** under 13, typed text reaches an AI only through the rules screen and identifier
  filter, and cohorts can hold AI answers for the teacher. Nothing relies on OpenAI's clause on minors, which nobody has
  yet read live.

Bands, tone, the adult-literacy look and the sign-up order were settled by C1 on 16 October (DESIGN.md, decision log);
Home per band, early years' modules and the `open` cohort by C2.

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
  "id": "photo",                          // lower case, the folder name; its name is i18n `mod.photo.*`
  "version": "0.1.0",                     // semver; a patch changes no behaviour
  "maturity": "draft",                    // draft, pilot or stable; pilot cohorts take pilot and stable only
  "depends": ["lessons", "sheets"],       // checked simply (one repo)
  "bands": ["p2", "s1", "s2", "ad"],
  "slots": ["home.action", "lesson.end"],
  "capabilities": ["photo.upload", "ai.call"],   // the core maps each to a risk level (below)
  "ai": {"purposes": ["read_sheet", "hint"], "max_calls_per_learner_day": 30},
  "settings": {"max_photos_per_day": {"type": "int", "min": 1, "max": 50, "default": 10}},
  "needs": ["internet", "camera"],        // internet: hidden while the phone is offline; also printer, camera
  "offline": "no"                         // yes, partly or no
}
```

The committee trimmed the draft (C0.1): no `core`, `scopes`, `review` or `name` fields, since nothing would read them
before the pilot, and the shell rather than the modules keeps Home sparse.

- **Slots:** `home.action`, `lesson.end`, `settings.row`, `teacher.panel`, `admin.panel`; `timetable.block` arrives
  with P19. No tab, tile, banner, subject or ask slots: the shell owns at most three tabs per band, and the answer
  order in `brain.py` is safety code. A `home.action` offer is `{id, role, priority, when(state)}`; the shell shows one
  primary, one secondary and one list; `lesson.end` takes two actions at most. `app/js/modules/<id>.js` exports
  `register(shell)` and is loaded by `import()` only when the module is on, never from another origin.
- **Since C2 and C3:** slots unchanged; `homeFooter()` is the shell's, not a slot, and only `plan` uses it. A `sheets`
  module (the sheet document, the keys, "Get the sheet", the lesson-end card) splits from `print`; `print` depends on
  it and adds only the hub's print queue (`needs: printer`); `photo` depends on it too. `teacher` drops `needs: pin`:
  its gate is per host (Cloudflare Access online, the PIN on the hub). `ey` leaves the bands of `photo`, `homework`,
  `timetable` and `plan`.
- **Capabilities and risk:** the core's table, not the manifest, sets the risk the admin sees: `photo.upload` and
  `audio.record` high; `free.text` and `ai.call` medium; `share.public` and `child.contact` blocked unless the cohort's
  moderation is `paid-human`. A module with any risk loads only after consent. Hub route guards and a review checklist
  replace the dropped `scopes` field; JS modules in one page cannot be walled off.

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
| `learners` | token hash, alias picture and number, cohort, band, consent kind, text version and time, last seen | until deleted or 12 months idle |
| `events` | time (minute), token hash, cohort, module, verb, object id, value | 12 months, then counts |
| `questions` | as today, plus cohort and token hash | 60 days |
| `approved` | as today, plus cohort scope | permanent |
| `prints` | as today (hub only) | 60 days |
| `ai_usage` | day, cohort, module, purpose, provider, model, tokens, cost, held | 2 years |
| `wishlist` | cohort, band, language, screened text, count | 90 days |
| `releases` | pack, version, content hash, cohort, by, when | permanent |
| `signoffs` | lesson, content hash, role, initials, date | permanent; mirrored in the pack |
| `staff` | email_hash (SHA-256 over a server-side pepper and the lower-cased email), neutral label, role, cohorts, initials (C3.2) | while active |
| `review_notes` | lesson, step, role, chips, text, status, at (C3.4) | until resolved |
| `certificates` (Year 1) | id, course, band, date, cohort; never a name | permanent |

Never on the server: names, sex (unless Mo decides live classes need it, then as a routing flag only), date of birth,
school status, phone number, location, photos, audio. The **alias** is a picture the phone picks from a reviewed list
plus a number the server draws ("Book ۲۷", C0.4), so a teacher can tell learners apart; the nickname she may type in
Settings stays on her phone. Teachers and admins sign in through Cloudflare Access online and the PIN on the hub.

On the phone (`localStorage`, `qalam.v1` migrated to `qalam.v2`): learners (alias picture, optional nickname, never a
name), band and year, consent record, PIN-lock hash, text size and theme, progress, private notes, school-day settings,
the upload queue, cached lessons; a service worker caches the app on HTTPS origins only (the hub is plain http).

### 3.5 API

Existing routes stay (ARCHITECTURE.md). New:

| Route | What |
|---|---|
| `GET /api/hello` | adds `core`, `cohort`, `modules`, `consent` (the consent text version to show) |
| `POST /api/join` | `{cohort_code?, band, lang, picture, consent}` → `{token, number, cohort}`; queued while offline |
| `GET` / `DELETE /api/me` | her cohort, band, alias; deletion of her server records (deliberate, behind her PIN) |
| `POST /api/me/pin-reset` | (P20) a teacher's 6-digit code shortens a lock reset in cohorts that allow it |
| `POST /api/events` | up to 100 queued events |
| `POST /api/m/photo/mark` | code, seed, lang, the strip → a reading per cell; no marks, no hints; the phone marks against the cached key (C2.2, change 4) |
| `POST /api/m/homework/hint` | the next hint rung; never the answer |
| `GET /api/m/plan?goal=` | signed lessons in order; a miss joins the wishlist |
| `GET /api/m/timetable?cohort=&band=` | the cohort's timetable for a band, without a token |
| `/api/m/teacher/*`, `/api/m/admin/*`, `/api/m/review/*` | dashboards and review; Access online, PIN on the hub |
| `/teacher/`, `/admin/`, `/review/` | the staff pages, behind Cloudflare Access online and the PIN on the hub (C3.2 to C3.4) |
| `/get` | the Android download page, and the APK as a Worker static asset (C3.6) |

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
  so the port happens on the hub while the code is small (P3a, P3b); both homes then run the same code. SQLite runs in a
  thread on the hub; printing keeps its thread there and is absent online.
- **Store interface** (`stores/base.py`): one contract suite runs every store test against SQLite and a D1 fake.
- **HTTP adapter:** `httpx.AsyncClient` on the hub; whatever the Worker supports (the spike decides) behind it.
- **Printing** is a module with `needs: ["printer"]`; online, Print becomes "Get the sheet" (HTML plus the key).
- **Gate:** tests pass on a staging Worker by 31 January 2027, or the same code runs under uvicorn on Render Starter in
  Frankfurt behind Cloudflare. D1 is created with jurisdiction `eu` (it cannot be added later); R2 only when something
  needs it, also `eu` (nothing does in v1: photos are never stored and audio ships as static assets); the DPIA records
  "EU, not UK".

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

`tutor/content/sources.json` (41 sources, checked 16 October, with `docs/FREE-RESOURCES.md`) gives every outside
source an id, owner, URL, licence and one class. The pipeline reads it and enforces the class. Where this table and
sources.json ever differ, sources.json wins and this table is wrong (the committee corrected two rows on 16 October).

| Class | Meaning | The pipeline allows | In sources.json today |
|---|---|---|---|
| BUNDLE | copying and changes allowed (CC BY, CC BY-SA, CC0, public domain, OFL, "verbatim with credit") | import into any pack with attribution; share-alike carried to the pack; `verbatim` items unchanged | Afghan Children Read (CC0), StoryWeaver, Global Digital Library, Bloom (per book), African Storybook, Feed the Monster code, PhET (before 29 March 2026), Illustrative Mathematics first edition, VOA, Wikipedia, Wiktionary, Wikibooks, Tatoeba, CC-CEDICT, hadith-api, Tanzil and QuranEnc (verbatim), Kolibri (per item), Piper voices, Common Voice |
| BUNDLE-NC | non-commercial licences (CC BY-NC, BY-NC-SA, CK-12's licence, the reciters' NC grant) | import only into packs marked `licence: NC`, kept apart; never with BY-SA in one lesson | Khan Academy (Iranian vocabulary needs Afghan review), CK-12, OpenStax (`no_ai`: link cards only in 2027), MIT OpenCourseWare, Islamic Network recitations, Meta MMS, Dari Literature Corpus |
| LINK | free to view, all rights reserved | a link card (title, owner, our description of at most 140 characters, URL), no copied text, no embeds, `needs: internet` | Ministry of Education textbooks (syllabus map only), BBC Learning English, BBC Dars |
| ASK | needs written permission | treated as LINK until `content/permissions/<id>.md` says otherwise | Begum Academy, SOLAx, LEARN Afghanistan, Darakht-e Danesh (Right to Learn), Hesperian, King Fahd Complex recitations |
| AVOID | never used | the validator refuses any reference | QuranicAudio and EveryAyah, Transparent Language, KP Board Pashto books, 1980s UNO textbooks |

Flags the validator also enforces (C0.6): `verbatim` (no edits, hash-checked: Tanzil, QuranEnc), `exact_attribution`
(the owner's wording: Tanzil, QuranEnc, PhET, Illustrative Mathematics, VOA), `no_ai` (never imported into a pack or an
AI context: OpenStax), `per_item_licence` (each item's own page decides: Bloom, Afghan Children Read, Global Digital
Library, StoryWeaver, Kolibri, Darakht-e Danesh). `offline: false` means `needs: internet`. Language codes become the
app's (`prs`, `ps`, `en`; two-letter ISO elsewhere) and `ages` map to bands (`early` ey; `g1-6` p1 and p2; `g7-9` s1;
`g10-12` s2; `adult` and `beyond` ad); P8 makes both changes in sources.json.

### 4.2 From source to learner

1. **Register** the source in sources.json. No class, no import.
2. **Import or draft** with `tools/import_<kind>.py`; every lesson, picture and audio file carries
   `sources: [{id, item, title, url, licence, changes, checked}]`. AI drafting is allowed on the UK side (Claude
   included, since no learner touches it), never from a `no_ai` source; the lesson records `drafted_by` and stays a
   draft.
3. **Validate** in CI: today's checks plus no unknown or AVOID ids, NC only in NC packs, SA and NC-SA never in one
   lesson, no copied text in LINK or unpermitted ASK items, `no_ai` sources in no pack and no AI context, `verbatim`
   text matching its source by hash, attribution present, and recorded audio for every `ey` and `p1` step and every
   `letter` step before release (F1: no synthetic Dari or Pashto voice, ever).
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
| v1 | pilot | "I want to learn this", typed only in 2027 (C3.5), searched against signed lessons; a plan in pack order; misses go to the wishlist. Private notes and "my own questions" on the phone. A marked sheet adds the lessons behind wrong items to her plan | nothing; the admin sees screened wishlist text with counts, no token |
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
- **No learner route shows a value answer;** "Check my answer" allows three tries. The answer page is the teacher's:
  behind the PIN on the hub, inside `/teacher/` online (C2.3).
- **Other homework** (after the blind test): the model solves privately, the hint is checked against that solution,
  and two disagreeing runs send it to the teacher.

### 5.4 Privacy

- Names are typed on the phone only for a certificate (Year 1), used once, never stored or logged. Sheets keep a blank
  "Name" line to write on by hand; the `name` parameter leaves `/api/print` and the sheet URL in P13, and `qalam.v2`
  holds no name (F3).
- Photos never exist on the server: the phone cuts out the answer cells (never the name box) and sends one strip of
  about 30 KB, held in memory for the call and dropped; no R2, no queue, no log of image bytes (C0.3).
- Events hold verbs and ids only. OpenAI zero data retention is requested in January; images are cropped to the answer
  cells. A daily job deletes what has expired (3.4).
- Threat model from the research: any phone or server may be seized, so neither may say "girl, 14, not in school".
- Staff emails live only in Cloudflare Access; D1 holds a peppered hash (C3.2).
- The PIN lock stays; there is no quick wipe. Removing a learner is a deliberate Settings action behind her PIN, with
  a spoken confirmation.

### 5.5 Consent and moderation

- **Under 18:** a guardian consents before AI, photo help or events switch on. The screen is short, read aloud, and the
  guardian holds a button for three seconds (the screen is specified in DESIGN.md). The record keeps the kind
  (`guardian-on-phone`, `self` or `partner-paper`), the text version and the time, not the guardian's name. The server
  names the version to show (`hello.consent`), so the hub's text says nothing leaves the village. The pilot partner
  also collects paper consent.
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

Order, set by C0.2: **P3a, P3b, P1, P2**, then P4 to P7. The async seam comes before any new table, and migrations
before the first new tables, so nothing is written twice. P3a needs no design input and starts today.

**P3a. The async seam** (S, first)
- Goal: the hub's request path becomes async without changing what any route returns or any table: routes
  `async def`, the store behind an async interface, the model client async. No new table, no migration, no new
  behaviour, no new dependency (anyio ships with FastAPI).
- Files and exactly what changes in each:
  - `hub/tutor_hub/stores/__init__.py`, `stores/base.py` (new): `class Store` with `async` methods named exactly as
    today's (`add_question`, `question`, `send_to_teacher`, `queue`, `review`, `approved`, `counts`, `prune`,
    `add_print`, `set_print`, `print_job`, `prints`, `copies_last_hour`, `fail_unfinished_prints`) plus `open()` and
    `close()`; the docstring is the contract.
  - `stores/_sqlite_sync.py`: today's `store.py` class moved unchanged (lock, PRAGMAs, schema). `stores/sqlite.py`:
    `SqliteStore(Store)` runs each inner call with `loop.run_in_executor(self._pool, ...)` on a
    `ThreadPoolExecutor(max_workers=1)`; a `sync` property exposes the inner store for the print worker thread, which
    keeps calling `set_print` synchronously, so the inner lock stays. `store.py` becomes a one-line re-export of
    `SqliteStore as Store` for this phase and is deleted in P3b.
  - `llm.py`: one lazily created `httpx.AsyncClient`; `async def available()` and `async def chat()`, same signatures,
    same return values, same 30-second availability cache.
  - `brain.py`: `async def answer()`, awaiting `available()` and `chat()`; rules, maths and search stay sync.
  - `server.py`: every route `async def`; `await hub.store.*` and `await hub.brain.answer(...)`; `Hub.reindex()` and
    the index build become async (`await self.store.approved()`); `Hub.__init__` no longer touches the database. A
    lifespan handler (`@asynccontextmanager`, passed as `FastAPI(lifespan=...)`) does `await store.open()`,
    `await store.prune(cfg.keep_days)`, `await store.fail_unfinished_prints()`, builds the search index, starts the
    print queue, and closes the store on shutdown. `sheet_pdf` and the teacher card call `render_pdf` through
    `await run_in_threadpool(...)` (WeasyPrint is CPU-bound). `Limit` and `check_pin` keep their locks, held across
    no `await`. `StaticFiles` mounts stay on the hub.
  - `printing.py`: `PrintQueue(store.sync, ...)`; otherwise unchanged.
  - `tests/conftest.py`: `FakeModel.available` and `chat` become `async def`; `hub_client` is unchanged, because
    `with TestClient(app)` runs the lifespan. `tests/test_brain.py`: `@pytest.mark.anyio` and `await brain.answer(...)`.
    `tests/test_api.py`: the two lines that read `hub.store` directly use `hub.store.sync`.
  - `tests/test_async.py` (new): `httpx.AsyncClient(transport=httpx.ASGITransport(app=app))`, a fake model whose
    `chat` sleeps 0.2 s, 20 asks under `asyncio.gather` finishing in under 1 s (sync code would take 4 s).
  - `docs/ARCHITECTURE.md`: one paragraph on the seam and `stores/`.
- Done when: the whole suite passes with no test's meaning changed; `test_async.py` passes; `python -m tutor_hub serve`
  on a laptop serves the app and prints to the outbox as before; `python -m tutor_hub check` still works.
- Tests: full suite; the concurrency test.
- Committee: settled by C0.2.

**P3b. Migrations and the store contract** (S)
- Goal: today's schema as `tutor/migrations/0001_init.sql`, in SQL that D1 also runs (no PRAGMAs, `IF NOT EXISTS`); a
  `schema_migrations(id, applied_at)` table; a runner in `stores/sqlite.py` that applies pending files in order at
  `open()`; PRAGMAs stay in `SqliteStore`; the first contract test file, which every later store runs.
- Files: `tutor/migrations/0001_init.sql`, `stores/sqlite.py`, `stores/base.py`, `tests/test_store_contract.py`
  (parametrised over stores: SQLite now, the D1 fake in P6), `docs/ARCHITECTURE.md`; `store.py` deleted.
- Done when: a fresh database and a database made by today's code both end with the same tables; running the
  migrations twice changes nothing; the contract suite passes on SQLite.
- Committee: settled by C0.2.

**P1. Module manifests and cohort flags; `/api/hello` lists enabled modules** (S)
- Goal: the smallest useful step. Manifests for `ask`, `lessons`, `print`, `check`, `teacher` in the trimmed shape of
  3.2; `cohorts`, `flags`, `flag_log` as `migrations/0002_cohorts.sql`; seed cohorts with random ids and neutral
  labels (F4); flag resolution; `modules` in `/api/hello`; a switched-off module's routes return 404. No behaviour
  change for cohort `hub`.
- Files: `tutor/modules/*/module.json`, `hub/tutor_hub/{modules,flags}.py` (new), `migrations/0002_cohorts.sql`,
  `stores/sqlite.py`, `server.py`, `config.py` (`TUTOR_COHORT`), `tutor/cohorts/*.json`, `tools/validate_modules.py`,
  `tutor.yml`.
- Done when: `/api/hello` lists five modules for `hub`; `print` off makes `/api/print` 404 for that cohort; a broken
  manifest is left out with a logged reason; all existing tests pass.
- Tests: `tests/test_modules.py` (validation; resolution with depends, maturity, bands); `test_api.py` additions.
- Since C2: the `open` seed as C2.8 (lessons, sheets, check, timetable and plan on; ask, homework, photo, teacher,
  review and print off; AI off); staging keeps everything on.
- Committee: settled by C0.1 and C0.2 (sections 3.2, 3.3).

**P2. The app loads only enabled modules** (S)
- Goal: a slot registry (`home.action`, `lesson.end`, `settings.row`); tabs and Home actions from `hello.modules`;
  the shell shows one primary, one secondary and one list; off modules not loaded; cached list used offline. The clean
  Home keeps Check my sheet and drops its Print button, since Print is a tab (F6).
- Files: `app/js/modules.js` (new), `main.js`, `ui.js`, `screens/home.js`, `hub.js`.
- Done when: with `print` off, the Print tab and "print today's sheet" vanish and nothing else moves.
- Tests: `node --check`; first `node --test` file, `app/tests/modules.test.js`.
- Since C2 and C3: the third tab is Print on the hub and Sheets online; the `homeFooter()` row; `netChip()` (P11).
- Committee: settled by C0.1 (no new look).

**P4. Events without names** (S)
- Goal: `events`, `POST /api/events`, server-side events for ask, print, check and review; a phone queue.
- Files: `events.py` (new), `migrations/0003_events.sql`, `server.py`, `app/js/events.js` (new), `state.js`.
- Done when: a lesson done offline shows as two events after reconnecting; free text or an unknown verb is refused.
- Tests: `tests/test_events.py`; a schema scan that fails on any name-, sex-, birth-, phone- or address-like column.
- Committee: no.

**P5. The AI gateway and fake provider** (M)
- Goal: section 3.7; `brain.py` calls the gateway.
- Files: `ai/{gateway,providers,policy,fake,filters}.py` (new), `brain.py`, `config.py` (`TUTOR_AI_PROVIDER`,
  `TUTOR_AI_BUDGET`), `migrations/0004_ai_usage.sql`.
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
- Files: `tools/validate_pack.py`, `packs.py`, `docs/CONTENT.md`, `migrations/0005_content.sql`,
  `content/permissions/README.md`, `tools/import_<kind>.py`.
- Done when: fixtures citing AVOID, NC in a non-NC pack, or copied text in a LINK card fail CI; production hides the
  starter drafts, staging shows them under the draft band.
- Tests: `tests/test_licences.py`; a fixture `sources.json` if the real one is not ready.
- Committee: no; link card and Credits looks go to C2.

**P9. Age bands, tone, bigger text, dark mode, recorded clips** (M)
- Goal: section 2 and DESIGN.md's C1 spec: `app/js/bands.js`; `data-band`, `data-look` (replaces `data-mode`),
  `data-tone`, `data-text`, `data-theme`; the token sweep (about 40 hard-coded colours and sizes in `app.css`) and the
  token tables; "Bigger text"; dark mode; `speech.js` plays a recorded clip from `app/audio/<lang>/<key>.opus` before
  any phone voice, with `app/audio/<lang>/manifest.json` naming who recorded each clip (F1); English interface strings;
  the speaker rule as a check.
- Files: `app/css/app.css`, `app/js/bands.js` (new), `state.js` (v2 migration: no `name`; picture, lock, consent,
  text, theme), `ui.js`, `speech.js`, `i18n.js`, `docs/DESIGN.md`.
- Done when: six bands render Home at phone, tablet and laptop sizes in light and dark; a contrast check in the browser
  test passes per band; every worded element has a speaker; v1 data migrates with names dropped.
- Tests: `node --test` for the migration; browser screenshots per band and theme.
- Deliverable (C2.9): `build-committee/p9-screens/index.html`, the contact sheet with the 13-point checklist and the
  contrast numbers beside each shot; the chair looks it over by thread, and failures are fixed before P10.
- Committee: settled by C1 (DESIGN.md). If the phase runs long, dark mode ships as tokens only.

**P10. Sign-up, consent, PIN lock** (M)
- Goal: DESIGN.md's first-run spec: the Welcome doors with no name field; `?join=CODE` and "I have a class code";
  the guardian consent screen and `content/consent/<lang>/<version>.json`; the alias picture (phone) and number
  (server); the PIN lock with the visible 24-hour reset; Settings behind "Who is learning" (Bigger text, theme, lock,
  nickname, remove learner, Credits); `/api/join`, `/api/me`. The Credits screen as C2.6 (grouped by source, voices
  as the recorders choose, `app/credits.json`).
- Files: `screens/welcome.js`, `who.js`, new `signup.js`, `consent.js`, `lock.js`, `settings.js`, `sha256.js`,
  `state.js`, `mods/join.py`, `migrations/0006_learners.sql`, `content/aliases.json`, `content/consent/`.
- Done when: sign-up takes under 3 minutes in the browser check with every screen spoken; without consent AI and photo
  modules are off and no event is sent; a forgotten PIN resets after the 24-hour countdown without wiping; `qalam.v2`
  holds no name.
- Tests: `tests/test_join.py`; JS tests for the lock and the countdown.
- Committee: settled by C1 (DESIGN.md).

**P11. The online app shell** (M)
- Goal: a configured HTTPS origin besides the hub; service worker cache on HTTPS origins only (the hub keeps its
  `localStorage` caching, F2); an upload queue that survives restarts; token-keyed limits; CORS narrowed online.
- Files: `hub.js`, `app/sw.js` (new), `index.html`, `server.py`, `config.py`.
- Done when: staging opened once survives a simulated two-day outage (lessons, Check my sheet, queued events); limits
  hold per token behind one address.
- Since C2: `netChip()` replaces `hubChip()`; "waiting to send" only on what she sent (questions, teacher requests,
  the join and the consent record), never events; the queue rules and empty states of C2.5; no offline banner.
- Tests: browser check with the network cut; limit tests in both modes.
- Committee: settled by C2 (C2.5).

**P12. The fallback kit** (S)
- Goal: `tutor/deploy/render.yaml` and a Dockerfile (online mode, no WeasyPrint), not deployed, so the 31 January gate
  costs Mo one account and an hour.
- Done when: the image builds and the smoke suite passes against it in CI (batch only).
- Committee: no.

### Stage C: the pilot features (23 December 2026 to 25 April 2027)

**P13. Sheets online, photo-ready layout** (M)
- Goal: keys from code and seed online; "Get the sheet" as HTML; corner markers, a QR with code and seed, fixed answer
  cells and a fixed name box; `make_sheets.py --batch` for facilitators; `name` dropped from `PrintIn` and the sheet
  routes (F3: the name line is written by hand).
- Files: `sheets.py`, `screens/print.js`, `check.js`, `tools/make_sheets.py`.
- Done when: every Pack 1 sheet fits one A4 page; online and hub keys match for a seed.
- Since C2: C2.1 (four corner squares, a slot grid, the QR holding text, never a URL); the `sheets` module; the Damm
  check digit; "Do it on screen" only where there is no printer, after "Print or save as PDF"; the layout tests; the
  final height table into DESIGN.md.
- Tests: `test_sheets.py`; a layout test for marker and box positions.
- Committee: settled by C2 (C2.1).

**P14. Photo marking of Qalam sheets** (M)
- Goal: in-page camera, or `<input type="file" accept="image/*" capture="environment">` where that is missing or
  refused (C0.3); find markers; cut out the answer cells only, never the name box; greyscale, at most 600 px wide,
  JPEG about 0.7, about 30 KB; upload; `read_sheet` reads the cells (`store: false`, no Files API); the hub compares
  with the key; "what I read" for her to correct; right or wrong per item and the hint ladder. "Type my answers
  instead" always shows; "I can't read this" is valid; drawings are out.
- Files: `modules/photo/`, `mods/photo.py`, `app/js/modules/photo.js`, `tests/fixtures/photos/`.
- Done when: fixtures mark correctly on the fake; no image byte is written to disk, D1, R2 or logs (every writer
  patched in the test); the upload holds answer cells only.
- Since C2: C2.2; the route returns readings and the phone marks; the `read_sheet` prompt never carries the key.
- Tests: `tests/test_photo.py`; browser check with a fixture camera.
- Committee: settled by C2 (C2.2).

**P15. Homework mode and the hint ladder** (M)
- Goal: section 5.3 for Ask and photos; Homework help on Home for in-school learners; "more like this".
- Files: `ai/filters.py`, `brain.py`, `mods/homework.py`, `app/js/modules/homework.js`, `screens/ask.js`.
- Done when: the hint set passes at 100% against a fake that tries to leak; Pashto hints come only from checked answers.
- Since C2: C2.3; `show_answer` removed; Homework help as `#/ask?hw=1`; events `check.item`, `hint.rung`,
  `check.dispute`; cached hints leak-checked when the key is made.
- Tests: `tests/test_hints.py`.
- Committee: settled by C2 (C2.3).

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
- Since C3: C3.4, `/review/`, `review_notes` and `signoffs` as drafted.
- Committee: settled by C3 (C3.4).

**P18. OpenAI live on staging** (S, after Mo's key, from 20 January 2027)
- Goal: the `openai` provider, key as an Actions secret, budget caps, moderation, zero retention requested; the real
  blind-test run.
- Done when: staging answers Ask and marks a fixture photo through OpenAI within budget; removing the key falls back
  cleanly.
- Tests: request shape against the recorder; live checks in a manual job only.
- Committee: no.

**P19. The virtual school day** (M)
- Goal: a cohort timetable (wake-up, opening, periods, breaks, worksheet time, close), bells on by default while the
  app is open, off in one tap, today's lessons from her plan; real alarms in the APK
  (P23) only after she answers "this phone is mine" once; notifications say only "Qalam"; timetable requests carry
  no token and no school-day event is sent (F5).
- Files: `modules/timetable/`, `mods/timetable.py`, `app/js/modules/timetable.js`, bell sounds cleared in sources.json.
- Done when: an out-of-school learner gets the day by default and can silence it; the kill switch removes it within a
  minute.
- Since C2 and C3: no web notifications, bells only while the page is on screen; C2.4's default and Home card; C3.1's
  audio unlock on the first tap; `app/audio/bells/*` in sources.json.
- Committee: settled by C2 and C3 (C2.4, C3.1).

**P20. The teacher dashboard** (M)
- Goal: held answers, waiting questions, counts, progress per alias, mastery per lesson, wishlist; the 6-digit
  PIN-reset code (`POST /api/me/pin-reset`, C1.6).
- Done when: 30 held answers cleared in under 10 minutes in rehearsal; no name anywhere.
- Since C3: C3.2, `/teacher/`; the `staff` table without emails.
- Committee: settled by C3 (C3.2).

**P21. The admin panel** (M)
- Goal: cohorts and codes, flags with risk, releases, AI spend, safety flags, kill switches; Access online, PIN on hub.
- Done when: every change is logged; `child.contact` cannot be switched on without paid-human moderation.
- Since C3: C3.3, `/admin/`; the label filter; a Staff page without emails.
- Committee: settled by C3 (C3.3).

**P22. "I want to learn this" and the wishlist** (S)
- Goal: section 5.1 v1. Files: `modules/plan/`, `mods/plan.py`, `app/js/modules/plan.js`, `search.py`.
- Done when: a matching goal gives an ordered plan; a miss reaches the wishlist screened and without the token.
- Since C3: C3.5, typed only; `homeFooter()` in the shell.
- Committee: settled by C3 (C3.5).

**P23. The Android app** (M)
- Goal: Sehat's shell wraps the app: lessons and audio on the phone, alarms, camera, a signed APK on GitHub Releases.
- Files: `tutor/android/` (from Sehat's, kept separate), `.github/workflows/tutor-android.yml`.
- Done when: it installs on two cheap phones, runs a lesson offline, fires the alarm, marks a photo on staging.
- Since C3: C3.6; `/get`; the permissions table; pilot phones installed by facilitators over USB.
- Committee: settled by C3 (C3.6).

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
| C0 | 16 Oct 2026, held | this plan's design choices: manifest, slots, flags, async first, store, photo handling, aliases, bands, licences | this file; decisions in `build-committee/decisions_fable.md` |
| C1 | 16 Oct 2026, held with C0 | bands, adult tone, visual identity and icon, bigger text, dark mode, sign-up order, consent screen, alias versus nickname, PIN lock and reset | settled without mock screens; the spec is in DESIGN.md; P9's screenshots go to C2 for a look-over |
| C2 | 16 Oct 2026, held with C0 and C1 | sheet layout for photos, camera and "what I read", results and hints, Home for in-school versus out-of-school, offline signs, link cards and Credits; which modules `ey` gets (P1 left it out of Ask and Check my sheet) and which modules the `open` cohort switches on (the seed has all five, and Ask's last step is a teacher) | note, mock screens, mock sheet |
| C3 | 16 Oct 2026, held with C0 and C1 | school day and bells, teacher dashboard, admin panel, review screens, "learn this" entry, APK screens | decisions and specs in DESIGN.md and DESIGN-C2C3-SPECS.md; P9's look-over is a thread review, not a sitting |
| C4 | July 2027 | Year 1 modules; also photo and homework for `open` with budgets, an adult study time, spoken goals | note, mock screens |

Each sitting returns a short decision note for DESIGN.md and the decision log.

---

## 7. Timeline

Mo's limits: optional work only, at most an hour a week, until 30 November; nothing from 1 to 22 December (his exam);
MSRA fortnights 6 to 19 January and 11 to 25 February kept clear until he knows his sitting; ERAS in July and September;
a UK post probably from early August. Ramadan about 8 February to 9 March 2027; Nowruz 21 March; Eid al-Adha about
16 May.

| When | Builders | Committee | Gates and events | Mo |
|---|---|---|---|---|
| 17 to 31 Oct 2026 | P3a, P3b, P1, P2 | C0 and C1 held 16 Oct | | optional: build card, 5 minutes |
| 1 to 22 Nov | P4 to P7 | | first staging deploy by 22 Nov | optional: read the verdict, 21 Nov |
| 23 Nov to 22 Dec | P8 to P12 | C2 held 16 Oct | full suite green on staging by 22 Dec | optional: January plan by 28 Nov; nothing 1 to 22 Dec |
| 23 Dec to 19 Jan 2027 | P13 to P17 | C3 held 16 Oct | | nothing (possible MSRA) |
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
  1366 by 768, right to left, every band's Home in light and dark with an ink-on-background contrast check, timed
  sign-up, a lesson, Check my sheet, photo marking with a fixture camera, offline mode, and the speaker-on-every-text
  rule. Screenshots are attached to the run for the committee.
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
| The Python Worker cannot run the hub (memory, packages, cold starts) | async port first (P3a, P3b), staging by 22 November, gate 31 January, Render kit ready (P12) |
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
| D11 | Google's Android developer verification: register Qalam's package and signing key under Mo's own identity or the organisation's (an organisation account needs a D-U-N-S number; a personal one ties Mo's name to the app in Google's records) | 23 Dec | 31 Jul 2027, before any install beyond the pilot | no registration during the pilot: facilitators install pilot phones over USB, everyone else uses the web app |

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
| 16 Oct 2026 | C0 (design committee): manifest trimmed to `id`, `version`, `maturity`, `depends`, `bands`, `slots`, `capabilities`, `ai`, `settings`, `needs`, `offline`; five slots, the shell enforces one primary, one secondary, one list; risk set by the core; Stage A order P3a, P3b, P1, P2; photos as an in-memory answer-cell strip with a file-input fallback, no R2; alias is a phone-picked picture plus a server number; six bands (`ey`, `p1`, `p2`, `s1`, `s2`, `ad`) with `data-look` and `data-tone`; sources.json the only licence truth, OpenStax link-only in 2027, section 4.1 corrected | design committee: Fable 5.1 (chair), Opus 5.5 | decisions_fable.md |
| 16 Oct 2026 | C1 (design committee): one identity, accent by tone (green on mint for children, teal on white otherwise), `--warm` #c2540a; tokens times one `--scale`, Bigger text ×1.25, dark follows the phone with Phone, Light or Dark per learner; adult literacy is the bold look in the adult tone; Welcome doors with no name field, consent at first need, `?join=CODE`; four-line spoken consent with hold-to-agree and Not now; optional 4-digit lock, never for `ey`, with a visible 24-hour reset that deletes nothing; girl or boy not built (D1 stays Mo's) | design committee | decisions_fable.md; DESIGN.md |
| 16 Oct 2026 | Flags (design committee): interface and lesson audio recorded by native speakers, no synthetic Dari or Pashto voice; the hub stays plain http and the APK is its secure context; names leave the phone and the sheet routes, certificates only; random cohort ids with neutral labels; bells on while the app is open, closed-app alarms only on a phone she says is hers; no R2 until needed; the clean Home keeps Check my sheet, not Print | design committee | decisions_fable.md |
| 16 Oct 2026 | Stage A part 1 built (P3a, P3b, P1, P2). Migrations after `0002_cohorts` move up by one. Provisional until C2: `ey` left out of Ask and Check my sheet; all five modules on for the `open` and `staging` seed cohorts. The lesson's end card now comes from the print module's `lesson.end` slot | builder; thread | commits 10b51e6a to b1f04507 |
| 16 Oct 2026 | P4 and P5 built. Lesson events stay anonymous until P10's consent gate; a bad batch is refused whole and the phone drops it; events are kept 12 months. The AI budget is tokens per cohort per UTC day, set in config (default 300,000). Before any AI call the question loses runs of 7 or more digits, emails and "my name is" phrases; the Dari and Pashto phrases need a native speaker's check. `check.key` will count only real checks, not the key the phone fetches when printing (fixed with P6) | builder; thread | commits c6cb1bce, 8231b17d |
| 16 Oct 2026 | Check my sheet's event is `check.done` (the lesson, the percent right), sent from the phone's queue each time a sheet is marked; it replaces the hub-side `check.key`, and the key route has no `for=check`. P7 built: the hub's own app as the Python Worker `qalam-staging` on workers.dev, D1 `qalam-staging` in `eu`, migrations applied by `D1Store.open()`, no secrets, `fake` AI. What a host lacks is a setting (`TUTOR_LACKS`, online `printer,pin`) matched against manifest `needs`; `teacher` needs `pin`, so print and teacher are off online. The Worker builds the app at import (deploy snapshot) and gives the store the plain JavaScript D1 binding; Workers Logs stay off. The Free plan served the spike, but most requests use more than its 10 ms of CPU (median 14 ms): D6 stays Mo's (HOSTING.md) | builder; thread | P7 commits, HOSTING.md |
| 16 Oct 2026 | P8 built. sources.json takes the app's language codes, `bands` for ages and the C0.6 flags; the pack loader enforces the classes (a lesson that breaks them is left out). Builder's choices, to confirm: drafts are served wherever `TUTOR_RELEASE` is off (staging and laptops, any cohort), and production serves signed content only; link cards live in a pack's `links.json` and are signed like lessons; signoffs carry initials only and clip manifests a speaker code, never a name; release needs recorded clips for years 0 to 3 and every letter step in Dari and Pashto; Credits sits in Who is learning until Settings (P10); credit lines are sources.json's English wording | builder; thread | P8 commit |
| 16 Oct 2026 | P9 built. Builder's choices, to confirm: the speaker rule is met by one page speaker in the header (early years: the listen button), not a speaker on every tile and button; Bigger text and the theme are stored per learner but have no switch until P10's Settings; Welcome lost its name field now and offers English, while early years and the adult doors arrive with P10's Welcome; an adult's Home says lessons are coming until an adult pack exists; interface clips are two-note placeholder chimes, labelled in each manifest, that play only on a tester's phone; text in the accent colour uses `--accent-ink` (the active tab was 4.3:1); English pages turn arrows round and keep pack text in its own direction; CI parses app scripts as modules (`node --check` alone missed a module's early errors) | builder | this thread |
| 16 Oct 2026 | C2 and C3 (design committee): sheets with four corner squares, a slot grid, a text-only QR and a Damm check digit, no app name on paper; the camera takes the photo itself and the server returns readings only; three hint rungs, no value answer on any learner route; the school day on by default, one Home card switches to Homework help, `day: on\|off` on the phone; offline is a header chip, "waiting to send" only on what she sent; link cards with no embeds, voices anonymous by default; `ey` gets lessons and Print or Sheets only (final); `open` runs lessons, sheets, check, timetable and plan with AI off; bells only while the page is on screen, no web notifications; staff pages at `/teacher/`, `/admin/`, `/review/` behind Access, `staff` holds a peppered email hash; a `sheets` module splits from `print`; Learn this typed only, as Home's footer row; the APK installed over USB in the pilot; D11 added | design committee | DESIGN.md (C2 and C3 decisions); DESIGN-C2C3-SPECS.md |
| 16 Oct 2026 | P9 look-over (design committee, by thread): one page speaker suffices where learners read (s1, s2, adult reader, p2); in p1 and adult literacy a 44 px speaker follows every worded button, tile and row, and a tab says its label; every header keeps the page speaker; the draft band and the chip are never read; the Who chip off `--warm`; credit lines in the learner's language; the 2-second press shows a ring; only line art takes the dark filter (until the importer marks `line: true`, the packs' SVG pictures); subject colours the same in dark. Fixes built; shots at 360 px in `p9-screens/360` | design committee; builder | DESIGN.md (P9 look-over) |
| 16 Oct 2026 | P10 built. Builder's choices, to confirm: the learner routes live in `learners.py` and `server.py`, not a `mods/join.py` module (they are the core's, always on); a learner with a class code joins once the consent screen is answered, even with "Not now" (no consent kept, no event sent), and one without a code joins only when her grown-up agrees; joining without a code puts her in the server's own cohort (online that is `TUTOR_COHORT`, while D7 stays Mo's); `POST /api/events` needs her token and her consent (401, 403); the consent text is chosen by `TUTOR_HOME` (`hub` or `online`); "Not now" is remembered for the visit, so Ask asks again next time; setting a PIN asks for it twice; removing the lock, "Stop sharing" and removing a learner each ask for her PIN first; class codes come from the hub's command line until the admin panel (P21); the alias pictures are line drawings on the Who chip's circle; a middle dot right after Persian digits reads as a zero ("۶ ·" looks like ۶۰), so the year notes and the new strings use a colon or comma there | builder | this thread |
| 16 Oct 2026 | P11 built. Builder's choices, to confirm: online (`TUTOR_HOME=online`) `POST /api/ask` needs a learner token and her consent (401, 403), since a question may reach the AI provider there, while the hub still answers without one; the per-phone limits count the token's hash online and the address on the hub; CORS online allows only `TUTOR_ORIGINS` (none by default, the app being same-origin); `/api/hello` names its `home`; the service worker registers on any secure page (HTTPS, and localhost for tests), serves its files stale-while-revalidate and updates at the next start; "Send when I'm online" is also the hub's wording for now; queued events keep 14 days; the chip moves under a long header at 360 px; the simulated outage is a cut network and a restart in Chromium, the day counts are checked by unit tests | builder | this thread |

New decisions are added with date and source; a row is never edited, only superseded.

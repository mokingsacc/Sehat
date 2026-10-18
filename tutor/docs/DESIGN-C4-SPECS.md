# C4 specs: the member's draft, accepted by the chair with amendments

Filed by the builder on 17 October 2026 from the design committee's folder, unchanged but for this heading and the
member's model name. It is the builder's detail for every C4 item the chair accepted. Where the chair's decisions
differ (DESIGN.md, "C4 decisions": the replacement specs C4.1, C4.2, C4.5, C4.7, C4.8 and C4.10, the trimmed and
amended items, look questions 3 and 12, and the notes), the decisions win. In particular: lessons gain no `skill`
field (the graph's `nodes[].lessons` holds the mapping, so Pack 1's signatures stay whole); the certificate row has no
band and no day; the keypad stays as built; "Print for review" waits for a scholar to ask; P32 is her own questions
only; the study-time sheet asks the time only.

The first member's draft, 17 October 2026, ahead of sitting C4 (BUILD-PLAN section 6; July 2027 in the calendar,
or earlier if the chair batches it as C2 and C3 were). Read: BUILD-PLAN sections 1 to 6 and the decision log,
DESIGN.md (every ruling and every open look question), DESIGN-C2C3-SPECS.md, FREE-RESOURCES.md, `content/sources.json`
and the app where a spec touches it. Five web checks, all for licences (sources at the end). Every string here is an
English draft; Dari and Pashto lines are written and recorded by native speakers. Where a decision turns on the pilot
(26 April to 25 June 2027), it is written as a gate with numbers, so the chair can settle it now and the pilot report
only opens the gate or keeps it shut. P30 (live audio) and P31 (competitions) are out of scope: section 9 lists the
hooks they need. Each item has a Decision, Why, Options where they were close, Spec and Risks.

## Rules every spec below assumes

- C1 tokens and sizes only; start and end, never left and right; sums, codes, pinyin and English in LTR islands;
  Persian digits in Dari and Pashto.
- Speakers as the P9 look-over's ruling 1: a page speaker in every header; in p1 and adult literacy a 44 px speaker
  after every worded button, tile and row, and a tab says its label (`[spk]` in the mock-ups). Bands that read on
  open hear new screens and state changes.
- No synthetic Dari or Pashto voice. Scripture and its translations take no phone voice at all (item 5).
- Learner AI only through the gateway: `openai` online, `local` on the hub, `fake` in tests; never Claude or Gemini.
  The one new purpose is `listen` (item 3); P25 uses the existing `plan`.
- No name, nickname, alias number or band on any new server row unless the row says so. A name is typed only on the
  certificate screen, kept in one variable, and gone when the screen closes.
- New modules are off in every cohort unless the item says otherwise; staging has everything on. The pilot cohort
  takes Year 1 modules only after the pilot report (Stage D).
- "Strings" counts new interface keys; each needs Dari and Pashto drafts from native speakers and a recorded clip.
- P25 and P27 are each more than one session; I propose splits (P25a and P25b, P27a and P27b).

## Summary

| # | Item | Recommendation | On by default | New on the server |
|---|---|---|---|---|
| 1 | P25 | Skill nodes per subject, lessons name one; plans ordered by code, AI may only pick nodes; spaced review as a warm-up inside the next lesson; pathways run as plans; certificates earned from her own events, typed name never sent | review and certificates yes; AI planning no | `certificates` without band; `/v/<id>` |
| 2 | P26 | Adult literacy and everyday-maths packs; Home's list for adults is track rows; the literacy track sees two rows, the reader track five | with the packs | nothing |
| 3 | P27 | English (adults first) and a Chinese starter (BY-SA pack), every word in a human voice; hear-yourself for all; speech checking for adults' English phrases only, behind a gate | packs yes; `speak` no | `/api/m/speak`, audio in memory only |
| 4 | P28 | `university`: a checklist on the phone, expiring link cards, no promises, a scam warning, no events | no | nothing |
| 5 | P29 | Verbatim Tanzil and QuranEnc, one reciter per verse, a scholar's signature gating release and the admin switch, no AI anywhere | no | nothing |
| 6 | P32 | `made`: private first; teacher check; class sharing only with paid-human moderation | no | `made` (60 days) |
| 7a | Photo and homework for `open` | Photo on after a pilot gate, with budgets; Homework help off in 2027 | no | `daily_counts` (2 days) |
| 7b | Adult study time | One time a day, off until she says yes, no events | no | nothing |
| 7c | Spoken goals | Heard and tapped goal chips for adult literacy now; speech-to-text later, Dari and adults only | chips yes | nothing |
| 8 | Open look questions | 36 one-line answers | | |

---

## 1. P25: skills graph, spaced review, pathways, certificates

**Decision.** One reviewed prerequisite graph per subject, as content, and every lesson names one skill. Plans follow
the graph in an order code computes; where AI is on, it may only pick skills from a list. Spaced review lives on the
phone and plays as a short warm-up at the start of the next lesson, so Home gains nothing. A pathway is a reviewed,
named goal that runs as a plan. A certificate is earned when the server finds her own lesson and sheet events for the
pathway; it carries a typed name the server never sees, and anyone can check its id. Split: P25a (graph, plans,
review, pathways) and P25b (certificates and the check page).

**Why.** Only a graph lets a plan say "learn this first" without a model inventing the order; a warm-up puts spaced
practice where she already taps, under the one-primary rule; reading her events makes a certificate mean "did it",
not "asked for it", while the server still holds no name.

**Options.** Graph: (A) skill nodes with `needs`, each lesson naming one (rec); (B) lesson-to-lesson `needs` (a child's
and an adult's lesson on one skill could not share it); (C) a standards framework (too big; the MoE syllabus is LINK,
structure only). Review: (A) a warm-up inside the next lesson (rec); (B) a "Practise" card on Home (a fourth thing on
Home, against C0.1); (C) a tab (against three tabs). Certificate: (A) checked against her events (rec); (B) made on
request (says nothing); (C) a teacher signs each (no teacher in `open`).

### The graph

- `content/graph/<subject>.json`, one file per subject, signed like `links.json` (its content hash, a subject
  teacher; an adult educator too when a pathway lists `ad`):

```jsonc
{"subject": "maths", "version": "2027.07.01",
 "nodes": [{"id": "frac-same", "needs": ["frac-what"],
            "title": {"prs": "...", "ps": "...", "en": "Add fractions with the same bottom number"}}],
 "pathways": [{"id": "ad-money", "goal": ["money-change"], "bands": ["ad"], "final": "adult-maths-money-5",
               "certificate": true, "title": {"prs": "...", "ps": "...", "en": "Everyday maths: money"}}],
 "review": {"status": "draft", "needs": ["subject teacher", "adult educator"]}}
```

- A lesson gains `"skill": "<node id>"` (one; required in packs released after P25a). Which of a node's lessons she
  gets follows today's library rules (her year, or adult packs for adults).
- Validator: ids unique and lower case; every `needs` exists; no cycles; every lesson's skill exists; every pathway's
  goal has a lesson for each of its bands; `final` is a lesson with a sheet. In `/review/` a graph is one more page
  type: each node with its needs and lessons, OK or Change, then "Hold to sign".
- Data: content only; nothing about a learner on the server.

### Plans over the graph (BUILD-PLAN 5.1 v2)

- When P22's search names a lesson or a node's title matches, the phone builds the plan: the goal's node, then every
  `needs` node she has not mastered, prerequisites first (code), then pack order, twelve lessons at most. Mastered, on
  the phone: her latest sheet for that skill's lesson at 80% or more (P20's rule); for a lesson without a sheet,
  finished with every question right and its first warm-up right.
- Rows that come from `needs` carry the tag "Learn first" (`--accent-soft`, `--accent-ink`), so a plan for adding
  fractions that opens with "What fractions are" explains itself.
- AI (purpose `plan`) only when the search misses, the cohort setting `plan_ai` is on (default off; `open` has AI off)
  and her language is trusted. The gateway sends the screened goal and the ids and titles of her band's nodes, never
  her token, and accepts at most three ids that exist; anything else is a miss. The model never writes a word she sees.

### Spaced review (module `recall`; the id `review` is the reviewers' module)

- A finished lesson adds up to three items: its steps marked `"recall": true`, else its last two `choice` or `number`
  steps. Quran and seerah lessons add none.
- Leitner boxes on the phone: due after 1, 3, 7, 21 and 60 days; right moves the item up a box, wrong sends it back
  to box 1, right in box 5 retires it.
- When the big button, the Now card or a plan starts a lesson and items are due, up to three play first as its
  warm-up (lowest box, then oldest), each exactly as in its own lesson: a wrong pick is greyed out, `why` shows only
  once she is right, Next opens after her first try. No warm-up in ey, in a lesson opened from a hint ("Open that
  step"), or for an item whose lesson is not on the phone.

```
+----------------------------------------+
| [x]  ###|=======------           [spk] |  three warm-up segments in --warm, then the lesson's
| Do you remember? 1 of 3          [spk] |  kicker --fs-sm bold --accent-ink; adult: "Quick practice"
| (the step, drawn as in its lesson)     |
| [ Next > ]                       [spk] |
+----------------------------------------+
```

- Phone: `recall: {"<lesson>:<step>": [box, due day]}`, at most 300 items, retired ones dropped first. Event
  `recall.item {object: lesson:n, value: 0 or 1}` from the phone's queue, only with consent, shaped like `check.item`.
- Default: on in `open` and in new cohorts (no AI, no free text, only the event leaves the phone); the pilot cohort
  after its report. No setting for the learner.
- Says: "Do you remember?" (child tone), "Quick practice" (adult tone), then the step's own clip.

### Pathways

- Starting a pathway starts a plan: `plan {label, lessons, again, path: "<id>"}`, the lessons being the goal's closure
  in her audience less what she has mastered. One plan at a time: starting a pathway while another plan runs asks
  once, "Stop 'Fractions' and start 'Money'?" (one dialog, confirm first).
- Where they show: at the top of their subject's page, as cards, before the lesson list; first among the chips of
  "I want to learn..."; adults reach them through Home's track rows (item 2). Never a new Home element.

```
+- Everyday maths: money ------------ [spk] -+
| 8 lessons, 3 done, a certificate           |  --fs-sm --muted
| ===-------                                 |
| [ Continue ]                         [spk] |  "Start" before the first lesson
+--------------------------------------------+
```

- A finished plan (P22's open question): Home's plan card says once "Done: Everyday maths: money" with a check and,
  where the pathway has a certificate, "Get my certificate"; then the plan clears.
- Strings: about 12 keys (Learn first, Do you remember, Quick practice, Start, Continue, Done, the stop question).

### Certificates (module `cert`, P25b)

- Bands p1 to ad (a grown-up types for a young child); not ey. Never for Quran or seerah pathways: a religious
  certificate (an ijazah) is a scholar's to give. Needs consent, since the check reads her events.

```
+----------------------------------------+
| <  Your certificate              [spk] |
| Everyday maths: money            [spk] |
| Name to print. You can leave it  [spk] |
| empty and write it by hand.            |
| [________________________________]     |  one variable; autocomplete off, no name attribute
| Qalam does not keep this name.   [spk] |  --fs-sm --muted
| It is printed, then forgotten.         |
| [ (print) Print or save ]        [spk] |  warm, full width
+----------------------------------------+
```

- `POST /api/m/cert {path, version}` with her token. The server reads her token hash's events: each lesson of the
  pathway in her audience counts when it has `lesson.done` or a `check.done` of 80 or more; every lesson must count,
  and where the pathway names a `final` lesson its `check.done` must be 80 or more. Then it writes (or finds)
  `certificates (id, course, version, month, cohort)` and answers `{id, month}`. Missing events: "Qalam can't see all
  of this pathway's lessons yet. Connect and try again." (lessons done before consent left no events).
- The id: `QC-` and ten Crockford base32 characters (50 bits) in two groups, `QC-7K3M9-TQX2A`. The row holds no token
  hash, alias, band, name or name hash: a hash of a name is reversed with a list of Afghan names in seconds. I propose
  BUILD-PLAN 3.4's `certificates` row drops `band` and keeps the month, not the day.
- The paper: A4 landscape, black on white like sheets, its own fixed CSS; `document.title` is "Qalam certificate
  QC-7K3M9-TQX2A", so a saved PDF is never named after her:

```
+------------------------------------------------------------------+
|                        Qalam  ·  certificate                     |
|                 ________________________________                 |  the typed name, or a blank line
|          has finished the lessons and practice sheets of         |
|                      Everyday maths: money                       |  her language, then English
|              8 lessons  ·  Mizan 1406  ·  October 2027           |  Solar Hijri, then Gregorian
|  [QR]  Check it: <home>/v/QC-7K3M9-TQX2A                         |
|        Qalam keeps no names. Compare this name with an ID card.  |
+------------------------------------------------------------------+
```

  It says "finished the lessons and practice sheets", never "passed" or a level: nothing was invigilated.
- Printing: online, "Print or save" prints in her browser; in the APK through the Android print bridge sheets use (if
  P23 has none, P25b adds `QalamAndroid.print()`). On the hub the job goes to the print queue with the course and id
  only, so a hub certificate always has the blank line. The name never enters storage, a URL, the title, an event, a
  log or the queue; a browser test types a sentinel name, prints, and finds it in no request and no storage.
- Checking: `/v/<id>`, a plain page in the clean look with a language switch (Dari, Pashto, English) and a speaker per
  line, backed by `GET /api/cert/<id>` (a core route, always on even where `cert` is off; no token; 30 an address a
  minute) answering the course title in three languages and the month, or 404. Found: "This is a real Qalam
  certificate: Everyday maths: money, October 2027. Qalam keeps no names: check the name on the paper against the
  person's ID." Not found: "We can't find this number. Check it and try again."
- Phone: `certs: [{path, id, month}]` per learner, no name; the pathway card shows "My certificate" to print again.
- Default: on wherever a pathway with `certificate: true` is served, `open` included (no AI, no free text, no name
  sent); the consent screen comes first where she has none.
- Hub ids are checked on the hub itself, and online only after P33 carries their rows (a hook for P33).
- Strings: about 15 keys; months in Solar Hijri for Dari and Pashto (`fa-AF`, `ps-AF`; a native speaker checks the
  month names the phone produces), Gregorian for English.

**Risks**
- No consent, no certificate (the check needs events); a new phone is a new token, so old work does not count.
- A real id under a forged name: the page says to compare with an ID; nothing better exists without storing names.
- A warm-up repeats the same item, which can be learnt by heart; fresh numbers wait for generators on the phone.

---

## 2. P26: adult tracks

**Decision.** P9 built the adult-literacy look (bold sizes, adult tone); P26 fills it with an adult literacy pathway
and an everyday-maths pack (`audience: adult`), and makes Home's list for adults the track rows. Adult packs gain
`tracks`: the literacy track sees Reading and writing and Everyday maths only; the reader track sees all five.
When the literacy pathway ends, one card offers the reader look.

**Why.** An adult who cannot yet read should see two doors, not five; the rest open when she can read them.

### Spec

- DESIGN 5's "enabled tracks" are subject rows (the `track` attribute stays `literacy` or `reader`). Order: reading
  in her language, maths, English, Chinese, University. A row shows when the cohort serves an adult pack of that
  subject to her track (University: also the module on, item 4). A pack field `tracks` (default `["reader"]`) says
  which adult tracks see it; a pack the literacy track sees prints bold sheets (today `sheets.py` picks bold from
  `year <= 6`, which adult lessons lack) and needs a recorded clip for every step, since that track reads on open.

```
Adult literacy (bold, adult tone)
+------------------------------------------+
| (book 27)                    [spk] (net) |
| +- Continue --------------------- [spk] -+
| |                 ب                      |  84 px, Naskh
| |      [listen]   [ > ]                  |
| |      Letter beh · Reading              |
| +----------------------------------------+
| [ (print) Print today's sheet ]    [spk] |  warm, full width
| What to learn                      [spk] |
| [dari] Reading and writing  3 of 30 [spk]|  one per row, speaker at the end
| [maths] Everyday maths      0 of 20 [spk]|
| + I want to learn something else   [spk] |  the goal chips (7c)
| [Lessons]      [Ask]      [Print]        |
+------------------------------------------+

Adult reader (clean): the continue card, "Check my sheet", then
| What to learn                      [spk] |
| [dari] Reading and writing ===--- 12/30 >|
| [maths] Everyday maths     =----- 3/20  >|
| [en] English               ------ 0/10  >|
| [zh] Chinese                            >|
| [cap] University                        >|
| + I want to learn something else         |
```

- A row opens its subject page (pathway cards first, item 1); University opens `#/university`.
- Content, drafted on the UK side and signed by a Dari reader, a Pashto reader and an adult educator:
  - `adult-literacy-1`, the pathway "Read and write: first steps", about 30 lessons per language: letters in small
    groups, then words and short sentences from adult life (market, clinic, bus, money, family), adapted from Afghan
    Children Read texts (CC0) and our own. UNESCO's ELA programme had Dari and Pashto adult primers (2008 to 2013),
    but I found no licence for them: ASK if wanted.
  - `adult-maths-1`: Numbers (Persian and Latin digits side by side, since prices and phones show Latin digits),
    Money (line drawings of notes with a number on them, never a copy of a real banknote), Time and the calendar (the
    clock, the Solar Hijri months, the week), Market measures (kilo, metre, and the local seer and pau if the adult
    educator wants them). Sums in money on the sheets ("You pay 100 for 35. How much comes back?").
- Words: every string an adult sees with child wording gains its `{child, adult}` form (no stars, no "Well done!";
  "Done", "Correct: 8 of 10"); P26 sweeps `i18n.js` for child-only strings shown to `ad`.
- The switch: after the literacy pathway's last lesson, Home's secondary shows once "You can read now. Use the reader
  look?" with "Yes, switch" (primary) and "No, keep this" (outline); Yes sets `track: reader`, and "Change year or
  language" in Who is learning switches back.
- Data: nothing new; the phone keeps `track` as today. Default: adult packs are released per cohort, like every pack.
- Badges (proposed; white on each 5.9 to 6.4:1, my check; the bands test confirms): `--s-chinese` #9a3b7a,
  `--s-university` #4a5a6a, `--s-quran` #8a5a00, `--s-seerah` #5d6b1e, the same in dark.
- Strings: about 12 keys (What to learn, five track names, the switch card); unit and lesson names are pack text.

**Risks**
- Texts adapted from children's readers can still sound childish: the adult educator's signature is the gate (it is
  already in `release_problems`).
- Recording every step of two adult packs in two languages is the largest recording job in Year 1: plan the sessions
  with Pack 1's recorders in the spring.

---

## 3. P27: English and a Chinese starter

**Decision.** English beginner for adults first (`english-adult-1`, 10 lessons), then children's English for MoE
years 4 to 9; a Chinese starter for s2 and adult readers (10 lessons, about 150 words), its pack CC BY-SA because
CC-CEDICT is. Instructions are recorded in Dari and Pashto, every English word by a human English speaker, every
Chinese word by a native Mandarin speaker, and release needs all of them. "Say it" stays hear-yourself, on the phone,
for everyone. Speech checking (module `speak`, purpose `listen`) is built but off: adults only, English only, fixed
short phrases only, and the request never carries the expected phrase. Split: P27a (step kinds, release rules, packs,
fonts) and P27b (`speak`).

**Why.** She hears a real voice for every word she copies. A recogniser told the answer "hears" it in a mumble, as a
reader told the key reads it into a blur (C2.2). A child's or a Pashto speaker's voice never leaves the phone in 2027.
A recogniser writes Chinese characters from context and hides a beginner's tones, so its "yes" would mislead.

**Options (speech).** (A) hear-yourself for all, plus `listen` for adults' English phrases through the gateway (rec);
(B) hear-yourself only (no risk, but an adult studying alone hears no check); (C) recognition on the phone (no audio
leaves it, but tens of MB a language, no Dari or Pashto model, slow on a $60 phone). Chrome's own speech input stays
barred: it sends audio to Google (C3.5).

### Lessons (P27a)

- Three small additions to the step kinds (CONTENT.md):
  - `letter` with `"script": "latn"`: "Aa", its sound and its name as clips, a picture word; drawn LTR.
  - `choice` with `"english": "bus"` plays the word's clip as the question; `"hide": true` hides its text for
    listening; the options are pictures.
  - `say` gains `"answers": ["good morning"]`: one to five fixed phrases of at most four words. The validator refuses
    an answer with a blank ("...") or a personal slot (name, age, city, phone number), so "My name is ..." stays
    hear-yourself and nobody sends her name in her own voice.
- Release rules (`release_problems`): in `english` lessons every `english` field and every `say` step needs a human
  `en` clip; in `chinese` lessons every `zh` field needs a `zh` clip; placeholders never count.
- No Dari-script spelling of English words: the recording is the model.
- Chinese: subject `chinese`; pinyin with tone marks in LTR spans (`lang="zh-Latn-pinyin"`), characters in
  `lang="zh-Hans"`; each tone drawn as a small line (level, rising, dipping, falling). A pack field
  `bands: ["s2", "ad"]` lets a pack outside the school years show to those bands (today `library.js` matches by year
  or adult audience); `tracks: ["reader"]` keeps it off the literacy track.
- Fonts: a subset of Noto Sans SC (SIL OFL 1.1, known, not re-checked) holding only the packs' characters, made at
  release with fontTools; check that Vazirmatn draws ǎ ǐ ǒ ǔ ǚ, else add a Noto Sans Latin subset. Sheets embed the
  same subset, so trace items can hold characters.
- Sources (sources.json, 16 October): English from VOA Learning English (public domain; skip AP, Reuters and AFP),
  Tatoeba (CC BY 2.0 FR; each recording's own licence), African Storybook and StoryWeaver English (CC BY 4.0), and
  BBC Learning English as link cards only. Chinese from CC-CEDICT (CC BY-SA 4.0: our word list and every lesson using
  it are BY-SA, so the pack sets `share_alike: true` and holds no NC item), Wikibooks Mandarin (CC BY-SA 4.0) as the
  skeleton for pinyin and tones, StoryWeaver Chinese (CC BY 4.0) for two or three readers; MIT OpenCourseWare's
  Chinese (NC) as link cards only.

```
A "say" step for an adult reader (clean look), speech check on
+------------------------------------------+
| [x]  =====-----                    [spk] |  page speaker
| Good morning!                      [spk] |  English --fs-h1, LTR; plays the recording
| Say it, then check.                [spk] |  recorded Dari or Pashto
| ( mic )  Tap and say it                  |  72 px warm round; stops at 4 s or 1 s of quiet
| I heard: "good morning"  (check)   [spk] |  --good-soft, --good-ink: "That's it!"
| [ Hear myself ]                          |  her recording, from memory
| [ Next > ]                               |
+------------------------------------------+
```

- No match: "I heard: 'god mornin'. Listen and try again." on `--warm-soft`; three checks a step, then "Let's go
  on."; Next is never blocked. Without `speak`, the step is today's: hear it, record yourself, hear it back.

### `speak` (P27b)

- Manifest: bands `ad`; depends `lessons`; capabilities `audio.record` (high: audio leaves the phone) and `ai.call`;
  purposes `listen`; setting `per_day` (default 20); `needs: internet` online. On the hub the `local` provider (the
  Whisper-class model ROADMAP plans for the hub) and only in the APK, since a plain-http page gets no microphone (F2).
- `POST /api/m/speak` (multipart: audio as webm/opus, mono, at most 4 s; `lang: en`) with her token, through the
  gateway's `listen`, answers `{heard}`. The provider receives the audio and the language only: never the expected
  phrase, the step or her token. The audio is held in memory for the call and dropped, never written to disk, D1, a
  log or a queue (P14's test pattern, every writer patched). The phone compares `heard` with `answers` (lower case,
  no punctuation, each word within one letter).
- First use, at her first tap of the mic, one explainer: "Qalam can check your speaking. A short recording of your
  voice goes to OpenAI to be written as text, then it is thrown away." with "Yes, check my speaking" and "No, just let
  me hear myself". Settings gets the switch "Check my speaking". The online consent text gains that sentence
  (versioned data; the solicitor sees it).
- Gate before any cohort turns it on: P16's kit run on 100 phrase clips recorded by consenting adult reviewers, never
  learners: right phrases accepted 9 in 10 times or more, wrong phrases accepted 1 in 10 times or fewer.
- Budget: the cohort's AI budget (transcription cost in `ai_usage`) and `per_day` per token (`daily_counts`, 7a).
- Data: on the phone `speak: yes | no`; nothing kept on the server but the usage row.
- Strings (P27a and P27b): about 20 keys (Hear it, Hear myself, Tap and say it, I heard, That's it, Listen and try
  again, Let's go on, the explainer, four tone names); the tone names need a teacher who knows Chinese and Dari or
  Pashto.

**Risks**
- A recogniser's language model "corrects" a weak accent to the phrase, so the check says less than a teacher's ear;
  hence "I heard", never "Correct".
- A native Mandarin recorder may be hard to find; Common Voice zh-CN (CC0) and StoryWeaver's audio can serve for
  sentences, never for the tone lessons.

---

## 4. P28: university preparation

**Decision.** A small `university` module for s2 and adult readers: one screen with a checklist pathway kept on the
phone, then link cards to free courses and scholarships, each card checked by a reviewer on a date and hidden six
months later. No promises, a scam warning on every screen, no events.

**Why.** The need is real; the dangers are scams and false hope. A checklist she ticks alone, cards that expire and
words that promise nothing are the honest minimum.

### Spec

- Manifest: bands `s2`, `ad`; depends `lessons`; no capability; offline partly (the checklist works offline, cards
  need the internet). Off by default; the admin turns it on once the first card set is signed.
- The `university` pack (`subject: university`, `bands: ["s2", "ad"]`, `tracks: ["reader"]`) puts the row last in
  s2's subject list and in the adult reader's track rows; the row opens `#/university`.

```
+------------------------------------------+
| <  Getting ready for university    [spk] |
| Steps you can take. Qalam can't    [spk] |  --muted
| promise a place or a scholarship.        |
| Your steps: 3 of 8                 [spk] |
| [v] Finish school maths            [spk] |  32 px tick boxes; ticks stay on this phone
| [v] English to level A2         >  [spk] |  > opens the English pathway
| [ ] Know what the tests ask for    [spk] |
| ...                                      |
| Free courses                       [spk] |
|   (link card)                            |
| Scholarships                       [spk] |
|   (link card)                            |
| Never pay anyone to apply. Apply   [spk] |  --warm-ink on --warm-soft, on every screen here
| only on the official site.               |
+------------------------------------------+
```

- The checklist (8 steps, pack text): finish school maths and science (Qalam pathways); English to A2 (the English
  pathway); know what entrance and English tests ask for; gather your school results; courses you can take now
  (cards); scholarships (cards); write about yourself, on paper; ask a teacher for a letter. Ticks stay on the phone
  (`uni: [step numbers]`), never sent, no events: what she is preparing for says more about her than her year does.
- Link card: C2.6's card plus two lines, the cost ("Free", "Free to watch; certificates cost money", "Fees for exams;
  ask about help") and "Checked: March 2027". A card past its `review_by` date is not drawn (by the phone's date,
  offline too). This module sends no `link.open` event.
- Card fields in the pack's `links.json`: `kind` (course, scholarship, test, guide), `cost`, `who` (who may apply, at
  most 140 characters), `checked`, `review_by` (at most six months after `checked`), and a source registered in
  sources.json (LINK or better). Signed by a new staff role, `adviser` (or the content lead), besides the Dari and
  Pashto readers.
- A no-promise lint in the validator refuses "guarantee", "you will get", "100%", "everyone gets", "free scholarship"
  and their Dari and Pashto drafts.
- Candidates for the adviser to verify (none verified here; LINK cards copy nothing, so no licence check is needed):
  free courses at MIT OpenCourseWare, OpenStax (link only), Khan Academy, edX and Coursera (free to audit), University
  of the People (no tuition, assessment fees, scholarships), Kiron and Saylor Academy; scholarships at the Asian
  University for Women, DAAD, Erasmus Mundus, Türkiye Bursları, the Chinese Government Scholarship (beside the
  Chinese track), Stipendium Hungaricum, Chevening and Fulbright, each only in a year Afghan applicants are eligible.
- Strings: about 30 keys (the 8 steps, heads, cost lines, the warning).

**Risks**
- Women have been barred from Afghan universities and the Kankor since December 2022: the module calls no route safe
  or open, and the cards say who may apply and nothing about travel.
- A scam page in a card: every card needs a signature and expires; the warning stays on screen.

---

## 5. P29: Quran and seerah

**Decision.** Quran lessons (listen and repeat, short surahs first) for p1 to ad, and a Quran reader for s1, s2 and
adult readers: the Tanzil text and the QuranEnc Dari and Pashto translations kept verbatim and hash-checked, one Hafs
reciter per verse with the files exactly as published. Seerah as short lessons written with a Hanafi scholar: our own
text, recorded. No AI anywhere near either, drafting included. Nothing reaches a learner without the scholar's
signature, and the admin's switch for `quran` stays locked until the scholar has signed the reader's text.

**Why.** Verbatim text from one verified source, a human voice and a scholar's signature is the only way religious
content is right every time; finding a verse needs code, not a model.

### Sources and licences

| Use | Source | Licence | Status |
|---|---|---|---|
| Arabic text | Tanzil (Uthmani or Simple) | CC BY 3.0, verbatim only; name Tanzil and link tanzil.net; its notice travels with every copy | confirmed (sources.json, 16 Oct; mirrors of the notice, 17 Oct) |
| Translations | QuranEnc: Dari (Badakhshani); Pashto (Rowwad, Abu Zakaria or Sarfaraz, the scholar's pick) | QuranEnc's seven conditions: no change, credit translator and QuranEnc, state the version, keep it updated | confirmed 16 Oct; re-read at import |
| Recitation per verse | King Fahd Complex | "free general use in computer apps, broadcasting channels, internet websites" | **not confirmed**: a search snippet of its page (17 Oct); the page itself still unread, so ASK |
| Recitation per verse | Islamic Network (alquran.cloud) | the reciters' grant, "for free, non-commercial redistribution"; removal on request | confirmed 16 Oct; makes the pack `licence: NC` |
| Translation audio | King Fahd Complex audio translations | the same grant, per the snippet | **not confirmed**: English ones found, no Dari or Pashto |
| Recitation | QuranicAudio, EveryAyah | personal use only; none stated | AVOID |
| Uthmani font | Amiri Quran | SIL OFL 1.1 | known, not re-checked: confirm at import |
| Uthmani font | KFGQPC Uthmanic Hafs | unknown | **not confirmed**: not used |
| Seerah text | IslamHouse Dari and Pashto books | unknown | **not confirmed** (no terms found): ASK |
| Seerah source | Ibn Hisham's Sirah (Arabic) | the work is public domain; a modern edition's notes may not be | cite by reference; copy no edition |
| Hadith | hadith-api | Unlicense (the repository) | confirmed 16 Oct; its editions unchecked: Arabic only, the scholar's choice, our own translation |

### Spec

- Packs: `quran-1` (`subject: quran`; `licence: NC` if the audio is Islamic Network's; Al-Fatiha and Juz 'Amma
  first) and `seerah-1` (`subject: seerah`). The reader's whole text is a third set, `content/quran/`: the Tanzil
  file with its notice, the chosen translations with their versions, and the audio list with each file's SHA-256.
- A new step kind, `ayah`: `{surah, ayah, text: {ar}, translation: {prs, ps}, audio: {ar}, translation_audio:
  {prs, ps}}`. The text, the translations and the recitation file are `verbatim`, each with a `sources` entry
  (`field`, `sha256`) as P8 already checks; the translation's recording is our own, checked by the scholar. "Repeat
  after" plays the verse, leaves a pause as long as the verse for her to say it, three times; nothing is recorded.
- No verse is typed by hand anywhere, docs and tests included: mock-ups use placeholders and fixtures come from the
  Tanzil file.
- Audio: the files as published (MP3; no re-encoding, no trimming; hash-checked); on the phone per surah, on demand,
  then cached (Juz 'Amma is tens of MB; never the whole Quran by default); on the hub from disk.
- The voice rule, a proposed exception to "a speaker on every text": scripture and its translation never take a phone
  voice. The Arabic's play button is the recitation; a translation gets a speaker only where a native speaker's
  recording exists, which the scholar has checked against the verbatim text. Quran lessons need both for every verse
  before release; the reader shows an unrecorded translation without a speaker.

```
Quran lesson step (bold look)
+------------------------------------------+
| [x]  ====------                    [spk] |
| Al-Ikhlas, verse 1                       |  --fs-sm --muted
|        (verse text, Tanzil, verbatim)    |  Amiri Quran, 34 px bold, 28 px clean, centred
| [ > ]  Listen                      [spk] |  the recitation
| [ (repeat) Repeat after: 3 times ] [spk] |  outline
| (Dari translation, verbatim)       [spk] |  --fs-read; the speaker plays its recording
| Translation of the meanings: Badakhshani,|  --fs-sm --muted, the exact credit
| QuranEnc, version n                      |
| [ Next > ]                         [spk] |
+------------------------------------------+

Reader (clean look): the surah list, then a surah
+------------------------------------------+
| <  Quran                           [spk] |
| [ Surah name or number, or 2:255 ]  [>]  |  search, code only
| Last read: Al-Mulk, verse 5     >  [spk] |
| 1   (Arabic name)   Al-Fatiha, 7   [spk] |
| ...                                      |
+------------------------------------------+
| <  Al-Mulk                    [>]  [spk] |  [>] plays from the top, verse by verse
| 5  (verse text, verbatim)           [>]  |  the playing verse on --soft
|    (translation, verbatim)         [spk] |  speaker only where recorded
|    Notes (2)  v                          |  the translation's footnotes, verbatim, folded
| Quran text: Tanzil Project (tanzil.net), |
| unchanged. Translation: ...              |
+------------------------------------------+
```

- Retrieval only: search by surah number, by its Arabic, Dari or Pashto name, by "surah:verse" in either digit set,
  or by an exact word of the chosen translation (normalised as `plan.js` does); results are verse references.
- AI off: the module has no `ai` field; Quran and seerah packs never enter Ask's index or any prompt (a gateway test
  with the recorder fails on any Tanzil line); `rules.py` keeps religious rulings declined, with "Please ask a scholar
  you trust."
- The gate: `release_problems` requires a "Hanafi scholar" in `needs` for subjects `quran` and `seerah`, besides the
  Dari and Pashto readers; the scholar plays every recitation and translation clip (OK waits for it, as built);
  `drafted_by` must name a person, never a tool or a model, in those subjects; a new QuranEnc version is a new hash and
  needs a new signature. The admin panel refuses to switch `quran` on until `content/quran/` carries a scholar's
  signature at its current hash.
- Seerah: 8 to 10 lessons (his birth and youth, "the trustworthy", the revelation, the Hijra, Madinah, his kindness
  and teaching), drafted by or with the scholar, each citing its classical source by reference; no pictures but a line
  map; narration recorded by native speakers; no question steps, so no warm-ups and no certificates.
- Bands: lessons p1 to ad; the reader s1, s2 and adult readers; not ey in 2027 (a question for the chair). Off until
  signed, then the admin's choice per cohort.
- Data: the reader's last place on the phone (`quran: [surah, ayah]`); the reader sends no events; Quran lessons send
  lesson events like any lesson.
- Strings: about 20 keys; "Translation of the meanings" and every sentence about the Quran worded by the scholar; the
  114 surah names from Tanzil's list (its terms) with Dari and Pashto forms from the scholar, recorded once.

**Risks**
- Script: many Afghan readers learnt from South Asian mushafs; Tanzil has Uthmani and Simple text, not that script.
  The scholar chooses; an Indo-Pak text stays a gap.
- A reciter asks for removal (Islamic Network's terms): one audio list per reciter, swapped by a pack update.
- A translation's footnotes may hold commentary the scholar rejects: then that translation is not used, since nothing
  may be deleted from it.

---

## 6. P32: learner-made content v1 (BUILD-PLAN 5.1 v3)

**Decision.** Three layers, each behind the one before: (1) her own questions and short lessons, private on her phone,
joining her warm-ups; (2) "Ask my teacher to check", where `teacher` is on; (3) "Share with my class", only where the
cohort's moderation is `paid-human` and the teacher approved, labelled and anonymous, with no replies. Module `made`,
off by default; layer 3 is blocked in code as `child.contact` is.

**Why.** Writing her own questions is strong practice and needs nobody; a check needs a person; sharing between
learners needs paid moderators (5.1: nothing passes between learners before they exist).

### Spec

- Manifest: bands `s1`, `s2`, `ad` (the phone shows it to the reader track only, as `canPlan` does today); depends
  `lessons`; slots `lesson.end`; capabilities `free.text`
  (medium) and a new `share.cohort` (blocked unless moderation is `paid-human`, like `share.public`).
- Entry: the lesson's end offers "Make a question about this lesson" (its second action, after the sheet card); each
  subject page ends with the row "My questions and lessons" (`#/made`). Nothing on Home.

```
+------------------------------------------+
| <  My questions and lessons        [spk] |
| [ + New question ]  [ + New lesson ]     |
| What is a common denominator?      [spk] |
|   (check) Checked by your teacher        |  --good-ink badge
| Fractions in the market (lesson)   [spk] |
|   (clock) Waiting for your teacher       |  --muted badge
| From your class                    [spk] |  only with paid-human moderation
|   Why don't we add the bottoms?    [spk] |
|   Written by a learner · Checked by a    |  two source badges
|   teacher                                |
+------------------------------------------+
```

- A question: the question, its answer and an optional "why", each at most 300 characters, in her language. A lesson:
  a title and up to five `read`, `choice` (2 to 4 options) or `number` steps; text only; pictures only from Qalam's
  reviewed line art; no camera, no recording, no links (a URL, an email shape or a run of 7 digits is refused as she
  types, by the identifier filter's rules).
- Layer 1: kept in `qalam.v2` (`made: [...]`, at most 50 items). Her questions join her warm-ups, where she marks
  herself ("I knew it" or "Not yet"), since no code knows her answer.
- Layer 2: "Ask my teacher to check" sends `{kind, body, lang}` with her token after `rules.py` and the identifier
  filter (distress goes to Needs care, as today). The teacher's To do gains the kind "Made by a learner": the item as
  she wrote it, "Looks right" or "Needs a change" with chips (spelling, answer wrong, unclear, unsafe, not school) and
  an optional short reply through the leak and identifier filters. The verdict reaches her when she opens `#/made`.
- Layer 3: after "Looks right", where allowed, the teacher may tick "Share with the class"; classmates see the item
  under "From your class" with both labels and no alias, number, count, reply or rating; the teacher or a moderator
  can withdraw it.
- Server: `made (id, cohort, token_hash, kind, body, lang, status, chips, reply, shared, at, decided_at)`; the token
  hash only so `DELETE /api/me` removes her items and her verdicts find her. Kept 60 days after sending or deciding;
  a shared item 12 months. Learner items never become pack content.
- Default: `made` off everywhere; layers 2 and 3 follow `teacher` and moderation as above.
- Strings: about 25 keys.

**Risks**
- Names and unkindness in free text: the filters catch phone numbers and "my name is", not names; a teacher reads
  every item before anyone else, and a paid moderator before classmates do.
- Teachers' time: "Made by a learner" comes last in To do (section 8, line 22).

---

## 7. The C4 agenda extras

### 7a. Photo and homework help for `open`, with budgets

**Decision.** Photo marking for `open` turns on once the pilot shows the reading works, with a daily budget for the
cohort and a daily count per learner. Homework help stays off in `open` in 2027.

**Why.** Photo marking is code against a known key: the model only reads digits and she confirms every reading, so no
AI text reaches her. Homework help needs `ask`, whose explanations are AI text and whose distress path promises a
teacher, and its hints for outside exercises are seen by no person in `open` (C2.8's reasons still hold).

- The gate, from the pilot report (results by 31 July): (1) Fix used on fewer than 1 cell in 10 in "what I read",
  over at least 200 photographed sheets, per language; (2) no leaked answer in any rung a teacher saw; (3) the tokens
  a mark costs, measured; (4) D7 decided. Pashto sheets only once Pashto is trusted for `read_sheet` (as built).
- Then for `open`: `photo` and `ai` on, `ai_budget` set by the admin from (3) (marks a day × tokens a mark × 1.2); a
  new `photo` setting `per_day` (5 in `open`, 10 elsewhere), counted per token hash in
  `daily_counts (token_hash, day, module, n)`, deleted after two days. Over either limit: "Photo checking is resting
  today. Type your answers instead." (built).
- Homework: back to the sitting after the pilot report, with the held answers' numbers (how many of at least 300 the
  teacher dropped as wrong or unsafe).
- Data: `daily_counts` only. Strings: none new (the resting line is built).

### 7b. An adult study time

**Decision.** The timetable module gains band `ad`: one study time a day, Saturday to Thursday, off until she says
yes, asked once on adult Home; bells only while Qalam is open; APK alarms only once the phone is hers; no events, no
token.

**Why.** An adult plans her own day; a default bell in a household that may not approve is not ours to set (the
children's day is on by Mo's default, C2.4).

```
+- A time to study -------------------- [spk] -+
| Qalam can ring a bell at the same      [spk] |
| time each day.                               |
| [ (bell) Yes, choose a time ]          [spk] |  primary: opens the time sheet
| [ No, thank you ]                      [spk] |  outline; never asked again
+----------------------------------------------+
```

- The card is the timetable module's offer, secondary role, top priority, shown until answered (C2.4's pattern).
- The time sheet (the offline sheet's shape): a stepper in 30-minute steps from "7:00 in the evening" (P19's morning
  and evening words), the length (15, 30, 45 or 60 minutes; 30), Save.
- During the time: Home's primary becomes "Study time: 20 minutes left" over the next lesson, in the Now card's shape;
  a bell at the start and at the end while Qalam is on screen; in the APK the alarm at the start, after "This phone is
  mine".
- Settings → Study time: on or off, the time, the length; in the APK, "This phone is mine" and closed-app bells.
- Phone: `study: {at: "19:00", min: 30}` or `"off"`; nothing sent. The cohort's "School day off" switch removes it.
- Strings: about 10 keys.

### 7c. Spoken goals

**Decision.** Spoken goals in 2027 are goals she hears and taps: the "I want to learn" row comes to adult literacy as
a chips-only screen with every chip read aloud. Speech-to-text goals wait for the `listen` gate in Dari, adults only,
under P27b's audio rules; Pashto waits longer, because without a Pashto voice nothing can read her words back to her.

**Why.** Typed-only (C3.5) shuts out exactly the learners with most to gain; reviewed goal chips with pictures need no
recogniser and cannot mishear.

```
+------------------------------------------+
| <  What do you want to learn?      [spk] |
| [ (coins)  Count money           ] [spk] |  one per row, bold, a picture each
| [ (sign)   Read signs and labels ] [spk] |
| [ (clock)  Read the time         ] [spk] |
| [ (pencil) Write numbers         ] [spk] |
| Someone can type it for you        [spk] |  --muted link: opens P22's box
+------------------------------------------+
```

- `homeFooter()` also shows for the literacy track where `plan` is on (P22's open question); `canPlan` admits it.
  `#/plan` there draws up to six pathway chips and no box; a chip starts its pathway (item 1). Default: on wherever
  `plan` is on; data: nothing new (a chip is a pathway, and the box sends what P22 sends).
- Later, if the gate passes: a mic beside the box (Dari, adults), up to 8 s; "I heard: ..." shown and read back by
  the phone's Dari voice (AI text, the one place a phone voice may speak); "Yes" or "Try again".
- Strings: about 8 keys plus the chips' titles (pathway text).

---

## 8. Open look questions in DESIGN.md: one proposed answer each

What P10 built
1. Speakers on Welcome's heads and worded doors, not beside each year digit: accept; the head says the range, and a
   digit needs no reading.
2. "Remove this learner" on `--bad-soft` with `--ink` text: accept; red stays for removal and the kill switches.
3. The keypad, 1 2 3 on top, LTR in every language, Erase bottom left: keep the digits; put Erase at the bottom end
   (left in Dari and Pashto, right in English), by the start-and-end rule.

What P11 built
4. The chip on its own line under a long header at 360 px: accept, with the 6rem minimum for the title.
5. A hub wording: "Send when the hub is near", picked by `hello.home`.

What P13 built
6. M7-03 at 214 mm with no Working box: accept; only the 230 mm limit matters.

What P14 built
7. Strips of 45 to 50 KB from noisy fixtures: accept; if real pilot phones give a median above 40 KB, JPEG 0.6 first.
8. The "This sheet?" card in the clean look: the link card's edge (`--line` at `--bw`), since `--card` on the adult
   `--bg` is white on white.

What P15 built
9. "Hints are resting for today" when the budget is spent: build it as specs item 3 says, with the lessons search;
   "Your teacher will look at this" only where `teacher` is on.
10. The homework placeholder cut in bold English at 390 px: "Type the question" in bold English; no placeholder is
    ever cut.
11. The leak check's Dari and Pashto number words: content, not a look; the reviewers' January list, as planned.

What P17 built
12. "Print for review" and "signed on paper": build with P29, since a scholar may prefer paper.
13. Speakers on the staff pages: none (staff read), on `/review/`, `/teacher/` and `/admin/`; "Play the recording"
    stays.
14. The admin's view of review notes: built in P21 (Content → Review notes); close it.
15. The fixed 640 px frame: 740 px, the browser checks' phone height, scrolling inside.

What P19 built
16. The tick on a past period that had no lesson: no tick; a past block without a lesson goes `--muted`.
17. The Now card at the close: as built, plus one line on school days, "Tomorrow: Maths at 8:00".
18. The bells' sound: Qalam's CC0 tones for 2027; a musician's set replaces them through sources.json.
19. A wake-up line in the app: no; the APK's alarm and the opening's greeting are enough.

What P20 built
20. Speakers on the teacher page: none (as 13).
21. The class card: A6, without the class label, since the card goes home with a girl (C3.3: QR and code only).
22. To do with many held answers: Needs care always first, then held answers oldest first, then questions, then
    "Made by a learner" (P32); each group's count in the header.
23. "Needs help" for a teacher: the tag "Stuck on 3", and on her page "3 items still wrong after the third hint this
    week".

What P22 built
24. The row for adult literacy: yes, now, as the goal-chips screen (7c), not a "coming" row.
25. "Closest lessons": add one button, "Make these my plan".
26. A finished plan: "Done: Fractions" once on Home's card, then it clears (item 1).
27. Chips at 360 px: six at most in bold sizes, eight in clean, wrapping, never cut.

What P21 built
28. Three rules kinds where the spec had five: accept; the rules screen has one off-limits kind.
29. The Log's `what`: shown in words from `i18n`, stored as the fixed word.
30. Kill switches while the module table scrolls on a laptop: yes, a sticky cohort line holding both.
31. Safety as bars or totals: totals, with today's number beside each; bars only if a pilot week shows the need.
32. The Dari menu at 200 px: 240 px on pages wider than 1200 px, labels wrapping to two lines.

What P23 built
33. `/get` on the class card: no; C3.3's "QR and code, nothing else" stands, and the facilitator says where.
34. Drawings, not screenshots, on `/get`: keep the drawings (no faces, no brand screens to go out of date).
35. The mine card when the day has no lessons yet: the secondary place, under whatever primary Home shows.
36. A launcher icon for small sizes: a 48 px drawing (the nib alone) for mdpi and hdpi.

The many "builder's choices, to confirm" in BUILD-PLAN's decision log (P8 to P24) are not look questions and are not
answered here; none of them blocks a C4 item.

---

## 9. Hooks for P30 and P31 (out of scope, gated on Mo and the legal opinions)

- P30, live audio: reserve the timetable block kind `live` and a Now card state "Live class at 10:00 · Join" (not
  built); the adult study time can hold a session later; join links made per token and per session, single use, no
  names; the live paragraph of the consent text as versioned data; `child.contact` stays blocked unless `paid-human`;
  D1 only as a routing flag. `listen` is not live audio, and none of its code records anything.
- P31, competitions: question sets drawn from P25's review items (code-checkable steps only); opt-in kept on the
  phone; alias pictures as avatars; results as "took part" and personal bests, never places; a participation
  certificate as a `cert` course `contest:<id>` without ranks or prizes.

## 10. Changes this draft makes to settled text

1. BUILD-PLAN 3.4: `certificates (id, course, version, month, cohort)`: no band, the month not the day.
2. BUILD-PLAN 3.2: `audio.record` (high) means audio leaving the phone; recording to hear yourself on the phone (the
   `say` step today) is no capability; new `share.cohort`, blocked unless moderation is `paid-human`.
3. BUILD-PLAN 3.7: learner purposes gain `listen`.
4. C2.4's "`ey` and `ad` have no school day" becomes "adults have a study time, off until they say yes"; the
   timetable module's bands gain `ad`.
5. C3.5 and specs item 14: Learn this shows for adult literacy as the chips screen; `canPlan` admits that track.
6. DESIGN 5's "enabled tracks": the literacy track lists Reading and writing and Everyday maths only.
7. DESIGN 9 and the speaker rule: scripture and its translations take no phone voice; an unrecorded translation shows
   without a speaker.
8. C2.6: the university module sends no `link.open` event.
9. CONTENT.md: steps `ayah`, `letter.script`, `choice.english` and `hide`, `say.answers`, `recall`; lessons `skill`;
   packs `bands` and `tracks`; graph files; release rules for English, Chinese, adult literacy and religious subjects;
   no AI drafting in `quran` and `seerah`.
10. BUILD-PLAN 6: P25 and P27 split (P25a, P25b; P27a, P27b).

## 11. What needs Mo

- The consent text's voice sentence and a DPIA line (audio to OpenAI, adults only) before any cohort turns `speak` on;
  the solicitor sees it with the rest.
- A Hanafi scholar, and a second one, for P29 by August 2027 (the timeline already plans the sign-off).
- Whether a certificate may carry Qalam's name and check address on paper, given the seized-paper threat that took
  the app name off sheets (C2.1). My view: yes; she chooses to print it, and it is useless without them.
- Nothing else; the rest is the chair's.

---

## Questions the chair must settle

1. Speech: build P27b `speak` (adults, English phrases, OpenAI or the hub's model, off until the gate), or ship
   hear-yourself only in 2027?
2. Certificates: earned from her own events (needs consent; my recommendation) or made on request? And drop `band`
   from the row?
3. May certificates carry Qalam's name and the check address (with Mo)?
4. Spaced review as a warm-up inside the next lesson (my recommendation), or a card on Home?
5. Recitation: wait to read the King Fahd Complex's page (ASK), or use Islamic Network now and mark the Quran pack NC?
6. The voice rule for scripture (no phone voice; an unrecorded translation without a speaker): accept this exception
   to "a speaker on every text"?
7. Quran lessons in early years (listening to short surahs): not in 2027 (my recommendation), or with the scholar's
   and Mo's yes?
8. Who picks the script and the translations, the scholar alone or the scholar with the Dari and Pashto readers?
9. Adult literacy's Home with two track rows until she switches to the reader look: accept?
10. The adult study time off until asked (my recommendation), or on by default like the children's day?
11. Homework help for `open`: off in 2027 (my recommendation), or for adults first once the held-answer numbers are in?
12. The photo gate's numbers for `open`: Fix on fewer than 1 cell in 10, at least 200 sheets, no leaks seen?
13. University cards: a new staff role `adviser`, or the content lead; six months before a card hides?
14. P32: build layer 3 (sharing with the class) in 2027 at all, while no paid moderation exists?
15. Chinese for s2 as well as adults (the pack field `bands`), and CC BY-SA for the whole Chinese pack?
16. No Dari-script spelling of English words: accept?
17. The splits P25a and P25b, P27a and P27b?

## Sources (web checks, 17 October 2026, licences only)

- King Fahd Complex, recitations licence page (a snippet only; the page was not read):
  [qurancomplex.gov.sa/en/?p=3979](https://qurancomplex.gov.sa/en/?p=3979); audio translations:
  [qurancomplex.gov.sa/en/?p=4973](https://qurancomplex.gov.sa/en/?p=4973).
- Tanzil's notice as mirrored: [OpenITI copy](https://raw.githubusercontent.com/OpenITI/0025AH/master/data/0001Quran/0001Quran.Mushaf/0001Quran.Mushaf.Tanzil001-ara1.mARkdown),
  [tanzil-downloader](https://npmjs.com/package/tanzil-downloader); Tanzil's translations (non-commercial, not used):
  [OPUS](https://opus.nlpl.eu/Tanzil/corpus/version/Tanzil); Islamic Network's terms:
  [alquran.cloud](https://alquran.cloud/terms-and-conditions).
- Searches that found no licence: IslamHouse's terms; UNESCO's ELA adult literacy primers
  ([UNAMA on the ELA programme](https://unama.unmissions.org/node/59875)).

# Writing lessons

Lessons are data, not code. A pack is a folder:

```
content/packs/starter/
  pack.json             id, version, title, languages, the lessons in order; licence, share_alike, audience, tracks,
                        media
  lessons/<id>.json     one file per lesson
  pictures/<name>.svg   line art (svg, webp, png or jpg); named without the extension in lessons
  audio/<lang>/         recorded clips (.opus) and manifest.json, saying who recorded each (optional)
  links.json            link cards: pages elsewhere, described in our own words (optional)
```

Next to the packs, `content/graph/<subject>.json` holds that subject's skills graph (P25a, below).

Check a pack with `python tools/validate_pack.py` (the hub runs the same checks at start and leaves out any lesson
that fails). Print every sheet for the reviewers with `python tools/make_sheets.py --out review-sheets`.

## Rules for every lesson

- **Text in two languages:** `{"prs": "Dari", "ps": "Pashto"}`. Add `"en"` only where English helps. Use Persian
  digits in running text if you like; the app and sheets show digits in the reader's script either way.
- **Sums between dollar signs:** `$1/2 + 1/4 = 3/4$`. They are shown left to right inside Dari or Pashto text,
  and the validator recomputes every sum: a wrong one is refused.
- **Pictures:** objects and line art, no people's faces or living beings (the 2025 textbooks removed them), black
  lines that print well. The starter pictures are placeholders.
- **Follow the current Afghan textbooks** for each year, and use only open-licence material or material with
  written permission.
- **Every lesson starts as a draft** and needs a Dari reader, a Pashto reader and a subject teacher to sign it
  (adult packs also an adult educator; religious content a Hanafi scholar). `tools/validate_pack.py --release`
  refuses unsigned lessons, and a hub in release mode (`TUTOR_RELEASE=1`, production) never serves one.
- **Outside material only by its licence class** in `content/sources.json` (below).

## A lesson file

```jsonc
{
  "id": "maths-7-fractions-add",          // lower case, digits and dashes; the file name too
  "subject": "maths",                      // maths, science, english, dari, pashto or chinese
  "year": 7,                               // 0 (not in school yet) to 12
  "order": 3,                              // its place in the year
  "unit": {"prs": "کسرها", "ps": "کسرونه"},
  "title": {"prs": "جمع کسرها", "ps": "د کسرونو جمع"},
  "minutes": 15,
  "steps": [ ... ],
  "sheet": { ... },                        // the printed worksheet (optional but expected)
  "bank": [ ... ],                         // checked answers for Ask
  "sources": [ ... ],                      // outside material it uses (below); none: written for Qalam
  "review": {"status": "draft", "needs": ["Dari reader", "Pashto reader", "maths teacher"]}
}
```

### Signing a lesson

Reviewers sign the lesson's **content hash**: the lesson without its `review` block, plus the bytes of every picture
it shows and the recorded hash of every clip it plays. `python tools/validate_pack.py --hashes` prints it. Each role
in `needs` adds one signoff, with initials only (one to four capital letters, never a name):

```json
"review": {"status": "checked", "needs": ["Dari reader", "Pashto reader", "maths teacher"],
           "signoffs": [{"role": "Dari reader", "initials": "AB", "date": "2027-02-14", "hash": "sha256:..."},
                        {"role": "Pashto reader", "initials": "CD", "date": "2027-02-15", "hash": "sha256:..."},
                        {"role": "maths teacher", "initials": "EF", "date": "2027-02-15", "hash": "sha256:..."}]}
```

A lesson is signed when every role it needs has signed its current hash; changing a word, a picture or a clip
gives it a new hash and it is a draft again ("changed since it was signed"). The hub keeps signoffs in its
`signoffs` table too: the review screens (`/review/`, P17) write them, and `tools/pull_signoffs.py` copies those for
the current hash into the pack (from `/api/m/review/signoffs` saved as JSON, or a hub's database).
Until a lesson is signed it is served only by a hub that is not in release mode (staging and laptops), marked
`draft`, and the app shows the draft band on Home and in the lesson.

Before release, lessons for years 0 to 3 need a **recorded clip** for every step, and every `letter` step in any
year needs one, in each of the pack's languages: `"audio": {"prs": "clip-name", "ps": "clip-name"}` on the step,
naming a clip in `audio/<lang>/manifest.json`. No synthetic voice, ever: clips are recordings by native speakers.

```json
{"clips": {"dari-1-sheen-1": {"file": "dari-1-sheen-1.opus", "speaker": "prs-01", "recorded": "2027-02-10",
                              "placeholder": false, "sha256": "sha256:..."}}}
```

`speaker` is a code, never a name (who the code stands for is kept off the repository, with their consent).
`placeholder: true` marks a stand-in recording made to test the plumbing: it never counts for release.

### Steps (one screen each)

| kind | fields | the child |
|---|---|---|
| `read` | `text`, optional `picture`, `picture_count` (1-10), `english`, or `zh` with `pinyin` | reads or listens |
| `letter` | `letter`, `forms` (the joined shapes), `word`, `picture`, `text`; an English letter: `"script": "latn"`, `letter` like `Aa`, `english` (its picture word) | sees a big letter, hears it |
| `choice` | `prompt`, `options` (2-4: text, `{"prs","ps"}`, or `{"picture","text"}`), `answer` (from 0), `why`; optional `english` or `zh` (the word plays as the question) and `"hide": true` (its text hidden: listening) | taps one; sees why |
| `number` | `prompt`, `answer` (one number or fraction such as `1/2`, `0.5` or `1 1/2`, never a sum), `why` | types it; 2/4 is right but "make it simpler" |
| `say` | `text` (the words to say) or `english` (or `zh` with `pinyin`) plus `text` as the instruction; `answers` (below) | hears it, records themself where the phone can, hears it back |
| `ayah` | `surah`, `ayah` (numbers) and `audio` only: a Quran lesson's verse, its text, translation and recitation all from the Quran set | reads the verse, hears its recitation, "Repeat after" |

### English and Chinese lessons (P27a, C4.4)

- **The words she learns are written in their own script and played only from a recording.** `english` is Latin
  letters; `zh` is Chinese characters with `pinyin` in Latin letters and tone marks (`nǐ hǎo`), and the app draws a
  small line over each tone (level, rising, dipping, falling). No Dari-script spelling of an English word: the
  recording is the model. An English or Chinese lesson takes no phone voice at all.
- **Release:** every `english` field and every `say` step of an `english` lesson needs a clip recorded by a human
  English speaker (`"audio": {"en": "clip-name"}`, in `audio/en/manifest.json`); every `zh` field of a `chinese`
  lesson one by a native Mandarin speaker (`audio/zh/`). Placeholders never count. `validate_pack.py --clips` prints
  the recording job with the words to say. Tatoeba items only under CC0 or CC BY, never SA.
- **`say.answers`:** one to five fixed phrases of one to four English words, kept for P27b's speech check (which waits
  for D12). Never a blank ("My name is ...") or a personal slot (name, age, city, phone number): those stay
  hear-yourself, so no name leaves a phone in her own voice.
- **A pack outside the school years** names who it is for: `"bands": ["s2", "ad"]` (the Chinese starter), with
  `tracks` for its adults. Its lessons show to those bands whatever their year (use year 0), and never to the
  literacy track unless `tracks` says so. CC-CEDICT makes the Chinese pack `"share_alike": true`, so it holds no NC
  item. "Say it" records only in a browser with a microphone: the APK (no microphone permission) and the hub's plain
  http draw no mic, and the step is "hear it, say it".
- **The font:** Chinese is drawn in a subset of Noto Sans SC holding only the packs' characters and pinyin
  (`app/fonts/noto-sc.woff2`), which the sheets embed too. Run `python3 tools/make_fonts.py --source
  NotoSansSC-Regular.otf` whenever a pack's Chinese changes; a hub test fails while a character is missing.

### Quran and seerah lessons (P29, C4.7)

- **Drafted by a person with a Hanafi scholar, never by a tool or a model.** A Quran or seerah lesson carries
  `"drafted_by": "<initials>"` and lists `Hanafi scholar` in `review.needs` (in place of a subject teacher); AI is
  off for both subjects (they never enter Ask's search index or a prompt, and the Ask screen answers a question about
  a ruling with "please ask a scholar you trust"). No lessons for the early years (year 0 is refused).
- **Read steps only, no question steps.** A seerah lesson is `read` steps (8 to 10 lessons, a line map as its
  picture, narration recorded); a Quran lesson is `read` and `ayah` steps. Every step needs a native speaker's
  recording in each of the pack's languages before release, as the youngest learners' do; an `ayah` step's clip is
  its translation read aloud, while the verse itself is only ever the reciter's recording. No phone voice ever reads
  a verse or its translation.
- **No verse is typed by hand anywhere**, lessons, docs and tests included: an `ayah` step names `surah` and `ayah`
  and nothing else, and the hub fills in the text, the translation and the recitation from the set. A hub test
  scans the repository for any line of the Tanzil text outside `content/quran/`.
- **Release:** an `ayah` lesson needs the set signed at its current hash and every verse it names in the set's
  recitation list. The recitation is NC, so an `ayah` lesson goes only in an NC pack (`quran-1`).

### The Quran set

`content/quran/` holds the Quran as published, each file byte for byte from its source:

| file | from | licence |
|---|---|---|
| `tanzil-uthmani.txt`, `tanzil-data.xml` | Tanzil text (Uthmani, 1.1) and metadata | Tanzil's terms (verbatim, with its notice; a link to tanzil.net) |
| `translations/<key>.json` | one QuranEnc translation per language (Dari, Pashto), rows as published, footnotes kept | QuranEnc's terms (unchanged, credited) |
| `audio/<edition>.json` and `audio/<edition>/<s>_<a>.mp3` | one Hafs reciter per verse from Islamic Network's CDN | NC |
| `index.json` | each file's source, version, date checked and SHA-256, and the scholar's review | ours |

- The hub checks the set at start (hashes, Tanzil's notice, 6,236 verses in every file, one translation per
  language, every listed recording on disk matching its hash) and holds the `quran` module off while anything fails.
- **The scholar signs the whole set** (its hash: everything in `index.json` but `review`) on the `quran:set` page in
  `/review/`, one step per surah after the set itself; `tools/pull_signoffs.py` copies the signature in. Any new file
  (a new Tanzil version, another translation or reciter) changes the hash, so it needs a new signature. A release
  hub serves nothing of the set and keeps the `quran` switch locked until it is signed; a staging hub serves it as a
  draft.
- `tools/quran_set.py` makes and refreshes it: `text`, `translation`, `audio-list`, `fetch-audio` and `check` (its
  docstring has the commands). Git keeps only Al-Fatiha's recordings; `fetch-audio` brings the rest of the list
  (about 40 MB for Al-Fatiha and Juz 'Amma) and checks each against the list.
- Never in the set: King Fahd Complex files, IslamHouse, any hadith text, or the KFGQPC font. The verse font is
  Amiri Quran (OFL, `app/fonts/amiri-quran.woff2`).

### The worksheet

```jsonc
"sheet": {
  "code": "M7-03",                         // short capitals, printed in the corner
  "intro": {"prs": "...", "ps": "..."},
  "example": {"text": {"prs": "مثال:"}, "math": "1/2 + 1/4 = 2/4 + 1/4 = 3/4"},
  "items": [ ... ]
}
```

| kind | fields | on paper | "Check my sheet" |
|---|---|---|---|
| `trace` | `text`, `count` (1-8), `boxes` | grey letters to write over, then empty boxes | a grown-up looks |
| `circle` | `prompt`, `pictures`, `answer` (the pictures to circle) | pictures in a row | shows the answer |
| `count` | `picture`, `how_many` (1-20) | the objects and an answer box | checked by value |
| `sum` | `q`, optional `a` (computed and checked if missing) | a stacked sum with a box | checked by value |
| `write` | `prompt`, `a` (the model answer), `lines` | writing lines | shows the answer |
| `sort` | `prompt`, `groups`, `words`, `answer` (a group for each word) | a table to sort into | shows the answer |
| `draw` | `prompt` | a box to draw in | a grown-up looks |
| `generate` | `type` (`fraction_add`, `add_sub`, `times`), `count` (1-30), options | new sums on every print | checked by value |

Generator options: `fraction_add` takes `max_den` (largest denominator, 4-24, default 12) and `same_first` (how
many sums share one denominator before they mix, default 2); `add_sub` takes `max_total` (2-1000, default 10) and
`ops` (`"+-"`, `"+"` or `"-"`); `times` takes `tables` (numbers 1-12, default `[2, 3, 4, 5]`). The validator refuses
any other option. Results stay child-sized (fraction sums at most 1). (`"work"` is still accepted but no longer adds a
box: one "Working" box fills what is left of the page.)

Any item may name its lesson step, `"step": 3` (from 1), which the hint ladder points back to. A `sum` whose answer is
more than 1 may say `"mixed": true` to get a box for the whole number before the fraction (`1 1/4`); otherwise the
answer is written as one fraction (`5/4`).

Keep a sheet to **one A4 page**: the validator refuses a sheet whose rows need more than the 230 mm a page has (the
heights are in DESIGN.md, "Sheet heights"), and `make_sheets.py` warns if one still spills over. Facilitators print a
stack with `make_sheets.py --batch 30 --lesson <id>` (one seed for the class; `--different` for one each; `--html`
where WeasyPrint is missing).

### The question bank

Questions children are likely to ask about the lesson, with checked answers. They answer Ask instantly and offline,
and the first three appear as ready-made questions on the Ask screen.

```json
"bank": [{"q": {"prs": "مخرج مشترک چیست؟", "ps": "ګډ مخرج څه شی دی؟"},
          "a": {"prs": "...", "ps": "..."}}]
```

Answers that teachers approve on the hub join these automatically on that hub. To share them with every hub,
copy good ones into the pack's bank (a later tool will export them).

## Outside material and licences

`content/sources.json` is the only record of what Qalam may do with an outside source; every source has one class
(BUNDLE, BUNDLE-NC, LINK, ASK, AVOID) and flags (`verbatim`, `exact_attribution`, `no_ai`, `per_item_licence`).
[FREE-RESOURCES.md](FREE-RESOURCES.md) explains them. Free to watch is not free to copy.

A lesson that copies, translates or adapts anything from outside names it in `sources`:

```json
"sources": [{"id": "afghan-children-read-bloom", "item": "the book's id there", "title": "The book's title",
             "url": "https://bloomlibrary.org/...", "licence": "CC0", "author": "Creative Associates International",
             "changes": "Pictures left out; text unchanged.", "checked": "2027-01-20"}]
```

- `id` is the source's id in sources.json; `licence` is the item's own licence line, as its page says on the day
  in `checked`. `changes` (text or `{"prs", "ps", "en"}`) says what we did. `author` and `fields` fill the source's
  credit line (`{title}`, `{author}`, `{licence}` and any other `{...}` in its `attribution`).
- **AVOID** sources are refused anywhere. **LINK** sources, **ASK** sources without a written permission in
  `content/permissions/<id>.md` (its README), and **no_ai** sources (OpenStax) are never copied: link cards only.
- **NC** material (a BUNDLE-NC source, or an item licensed NC) goes only into a pack with `"licence": "NC"`, and
  BY-SA and NC-SA items never share a lesson. A pack with any share-alike (SA) item says `"share_alike": true`.
- **per_item_licence** sources: the item's own licence decides (CC0, CC BY, CC BY-SA, public domain; NC only in an
  NC pack); anything else is refused. **ND** items take no changes.
- **verbatim** sources (Tanzil, QuranEnc): no changes, and `field` (where the text is, like `steps.0.text.prs`) and
  `sha256` (of the source's text) must match. **exact_attribution** sources use the owner's credit line as written.
- Outside pictures and clips are listed in pack.json: `"media": {"pictures/x.svg": [sources...]}`.

The app shows a one-line source note at the end of each lesson that uses outside material, and a Credits page
lists every source in use with its licence (`GET /api/credits`). Their look is C2.6 (DESIGN-C2C3-SPECS.md, item 6).

### Link cards

`links.json` holds pages we point to rather than copy (Begum Academy, BBC Dars, OpenStax):

```json
[{"id": "begum-academy-maths", "source": "begum-academy", "title": "Begum Academy",
  "about": {"en": "Free video lessons in Dari and Pashto for years 7 to 12, made by Begum Academy.", "prs": "...", "ps": "..."},
  "url": "https://begum-academy.org/en/", "subject": "maths", "years": [7, 8, 9],
  "review": {"status": "draft", "needs": ["Dari reader", "Pashto reader"]}}]
```

A card holds only these fields: a title, our own description (at most 140 characters a language), the address
(https), and where it belongs (`subject`, `years`, `lessons`, `unit`). Any other field (copied text, a transcript,
an embed) fails the validator. Cards need the internet, so the app shows them only while online, and they are
signed like lessons.

### University cards and the checklist (P28, C4.6)

The `university-1` pack (`bands: ["s2", "ad"]`, `tracks: ["reader"]`, no lessons) holds the university screen:

- **`checklist.json`**: `{"steps": [{"id", "text": {"prs", "ps", "en"}, "open": "subject:maths"}], "review": ...}`, 1
  to 12 steps of our own words (at most 140 characters each); `open` sends a step to a subject's page. She ticks the
  steps on her phone; the ticks are never sent.
- **A university card** (`"subject": "university"`) is a link card with five more fields: `kind` (`course`,
  `scholarship`, `test` or `guide`), `cost` (`free`: "Free", or "Free to apply" on a scholarship; `audit`: "Free to
  watch; certificates cost money"; `fees`: "Fees for exams; ask about help"), `who` (who may apply, our words, at most
  140 characters a language, nothing about travel), `checked` (the day a person opened the page and found it says what
  the card says) and `review_by` (at most six months later). After `review_by` the card is not served, and the phone
  hides it by its own date too, until someone checks the page again and moves both dates. Its source is in
  sources.json as LINK or better (never ASK or AVOID), and its review needs an `adviser` besides the Dari and Pashto
  readers.
- **The no-promise lint** refuses, on any card and in the checklist, words that promise a place, a scholarship or a
  result: "guarantee", "you will get", "100%", "everyone gets", "free scholarship", "sure to", "certain to", and their
  Dari and Pashto drafts (`licences.PROMISES`). Say what the page offers, never what she will get.
- **Signing:** a pack's checklist and cards are one page in `/review/`, `cards:<pack>`: each item OK (a card's OK waits
  until its page was opened from the review), then "Hold to sign". `tools/pull_signoffs.py` writes each signature
  into every item that needs that role, at the item's own hash. The `university` module stays locked in the admin,
  and held off on a release hub, until a checklist and at least one university card are signed.

### Adult packs and tracks

An adult pack says `"audience": "adult"` and, since P26 (C4.3), which adult tracks see it: `"tracks": ["literacy",
"reader"]` (left out: the reader track only). The literacy track sees reading and everyday maths, the reader track
every adult pack. A pack the literacy track sees prints bold sheets and is read aloud on open, so every step needs a
recorded clip in each of its languages before release, and its reviewers include an adult educator. An adult lesson's
`year` says nothing about who reads it (use 0). `adult-literacy-1` and `adult-maths-1` are the first drafts: three
lessons each, for the content team to grow (about 30 a language and 20). Money is drawn as plain line drawings with a
number, never a copy of a real banknote.

### The skills graph

`content/graph/<subject>.json` (P25a, C4.1) is one reviewed prerequisite graph per subject. Its nodes are skills;
each lists the skills it `needs` and the `lessons` that teach it. The graph, not the lesson, holds the mapping, so a
lesson's content hash and signatures do not move when the graph changes, and no lesson gains a `skill` field:

```json
{"subject": "maths", "version": "2026.10.17",
 "nodes": [{"id": "frac-what", "needs": [], "lessons": [], "title": {"prs": "...", "ps": "...", "en": "What a fraction is"}},
           {"id": "frac-add", "needs": ["frac-what"], "lessons": ["maths-7-fractions-add"], "title": {...}}],
 "pathways": [{"id": "s1-fractions", "goal": ["frac-add"], "bands": ["s1"], "final": "maths-7-fractions-add",
               "certificate": true, "title": {...}}],
 "review": {"status": "draft", "needs": ["maths teacher"]}}
```

- Node ids are lower case with dashes, each once; every `needs` names a node; no circles; every listed lesson exists
  and is listed in one node only. A lesson in no node is allowed: its plans follow pack order.
- A pathway is a named goal that runs as a plan: its goal must have a lesson for each of its `bands`, `final` (the
  lesson whose sheet ends it) must have a sheet, and a Quran or seerah pathway never has a certificate (a scholar's
  to give, C4.2).
- The graph is signed like `links.json`: its content hash (everything but `review`), by a subject teacher, and by an
  adult educator too where a pathway lists `ad`. Reviewers sign it on the graph page in `/review/` (each node OK or
  Change, then "Hold to sign"); `tools/pull_signoffs.py` copies the signatures in. In release mode an unsigned graph
  is not served, and `tools/validate_pack.py --hashes` prints its hash as `graph:<subject>`.
- A step a reviewer wants in spaced review can say `"recall": true` (only on a `choice` or `number` step); without
  any, a lesson's last two such steps are used (C4.1).

### Contests (P31, C6.5)

A contest is `content/contests/<id>.json`: a short set of questions taken from signed lessons, which the admin opens
to a class for a while. Its only words of its own are its title; every question is a lesson step that the lesson's
reviewers already read.

```json
{"id": "maths-week-3", "title": {"prs": "...", "ps": "...", "en": "Maths week 3"}, "subject": "maths",
 "bands": ["s1"], "langs": ["prs", "ps", "en"], "opens_at": "2027-10-25T08:00", "closes_at": "2027-10-26T08:00",
 "minutes": 20, "items": [{"lesson": "maths-7-fractions-add", "step": 3}, ...], "certificate": true,
 "scope": "class", "review": {"status": "draft", "needs": ["Dari reader", "Pashto reader", "maths teacher"]}}
```

- The id is lower case with dashes and is the file's name. Times are UTC minutes. The window runs from one hour to
  14 days, and `minutes` (her own time once she starts) from 5 to 60.
- There are 5 to 30 items, each used once. Each one names a `choice` or `number` step of a lesson of the contest's
  subject, counted from 1, and that lesson must be served to every listed band and language.
- The title is in Dari, Pashto and English, at most 80 characters each. It passes the no-promise lint and the contest
  list: no prize, money, winner, first place or award, in any of the three languages. A contest gives no prize and
  shows no ranking. `"certificate": true` gives a "took part in" paper, never a score.
- `scope` (`class` or `all`) is advice to the admin. A contest reaches a class only when the admin opens it there
  on the Content screen, and only once all its reviewers signed it at its current hash.
- The hash is the file without its review, plus each item's lesson hash, so a changed lesson voids the contest's
  signatures. Reviewers sign on the contest page in `/review/`: item 0 is the contest itself, and each question
  shows with its answer and why. `tools/pull_signoffs.py` copies the signatures in. In release mode, a contest
  that is unsigned, or that asks a lesson that is unsigned or not served, is held. `tools/validate_pack.py
  --contests` (or `--hashes`) prints each contest's hash as `contest:<id>`.
- No contest file ships with the content yet. The `contest` module is off in every seed cohort, and under
  `TUTOR_RELEASE` it stays locked until `cohorts/gates/contest.json` is filled (RELEASE.md 3c).

### Importing

`tools/import_bloom.py` turns a Bloom book (Afghan Children Read, or another Bloom Library book whose own licence
allows it) into a draft reading lesson with its `sources` block filled in; it refuses a book whose licence does
not allow copying into the pack. Pictures stay out unless `--pictures` is given, because many storybook pictures
break our picture rule; SVG line art it does copy has black strokes turned to `currentColor`, so it follows the
theme. Run `tools/validate_pack.py` afterwards.

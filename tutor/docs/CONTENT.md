# Writing lessons

Lessons are data, not code. A pack is a folder:

```
content/packs/starter/
  pack.json             id, version, title, languages, the lessons in order; licence, share_alike, audience, media
  lessons/<id>.json     one file per lesson
  pictures/<name>.svg   line art (svg, webp, png or jpg); named without the extension in lessons
  audio/<lang>/         recorded clips (.opus) and manifest.json, saying who recorded each (optional)
  links.json            link cards: pages elsewhere, described in our own words (optional)
```

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
  "subject": "maths",                      // maths, science, english, dari or pashto
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
`signoffs` table too (the Review module, P17, writes them; `tools/pull_signoffs.py` will copy them into the pack).
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
| `read` | `text`, optional `picture`, `picture_count` (1-10), `english` | reads or listens |
| `letter` | `letter`, `forms` (the joined shapes), `word`, `picture`, `text` | sees a big letter, hears it |
| `choice` | `prompt`, `options` (2-4: text, `{"prs","ps"}`, or `{"picture","text"}`), `answer` (from 0), `why` | taps one; sees why |
| `number` | `prompt`, `answer` (one number or fraction such as `1/2`, `0.5` or `1 1/2`, never a sum), `why` | types it; 2/4 is right but "make it simpler" |
| `say` | `text` (the words to say) or `english` plus `text` as the instruction | hears it, records themself, hears it back |

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
`ops` (`"+-"`, `"+"` or `"-"`); `times` takes `tables` (numbers 1-12, default `[2, 3, 4, 5]`). `"work": false`
drops the box for working. The validator refuses any other option. Results stay child-sized (fraction sums at most 1).

Keep a sheet to **one A4 page**: `make_sheets.py` warns when one spills over.

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

### Importing

`tools/import_bloom.py` turns a Bloom book (Afghan Children Read, or another Bloom Library book whose own licence
allows it) into a draft reading lesson with its `sources` block filled in; it refuses a book whose licence does
not allow copying into the pack. Pictures stay out unless `--pictures` is given, because many storybook pictures
break our picture rule; SVG line art it does copy has black strokes turned to `currentColor`, so it follows the
theme. Run `tools/validate_pack.py` afterwards.

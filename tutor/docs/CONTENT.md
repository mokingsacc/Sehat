# Writing lessons

Lessons are data, not code. A pack is a folder:

```
content/packs/starter/
  pack.json             id, version, title, languages, and the lessons in order
  lessons/<id>.json     one file per lesson
  pictures/<name>.svg   line art (svg, webp, png or jpg); named without the extension in lessons
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
- **Every lesson starts as a draft** and needs a Dari reader, a Pashto reader and a subject teacher to sign it.
  `tools/validate_pack.py --release` refuses unsigned lessons.

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
  "review": {"status": "draft", "needs": ["Dari reader", "Pashto reader", "maths teacher"]}
}
```

When it is signed: `"review": {"status": "checked", "by": ["role, name or initials", ...], "date": "2027-02-14"}`.

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

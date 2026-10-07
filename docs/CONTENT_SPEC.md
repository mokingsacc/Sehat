# Family Health Book (Samangan red book): content spec

Read this whole file before writing any content. It is the contract between the content writers, the illustrator and the app.

## What the app is
A free, offline, narrated family health book for villages in Samangan province, northern Afghanistan. Like the UK "red book" plus a family health guide. Users: mothers, fathers and grandparents, many with little or no reading, on cheap Android phones. Every piece of text is read aloud in Dari or Pashto, in a woman's or a man's voice that the user chooses (computer voices first, human recordings later), so write for the ear first: short, warm, spoken sentences that make sense when heard once.

Two sections: children (اطفال / ماشومان) and adults (بزرگسالان / لویان: women's health, and red flags and common conditions for everyone).

## Golden rules
1. Action first. Tell people what to DO and WHEN TO GO. Not physiology.
2. Short. Lead: max 2 sentences. Step title: max 6 words. Step text: max 2 short sentences (about 25 words). Alert item: max 12 words. A topic's whole narration should be under about 2.5 minutes.
3. Two urgency levels only, always with the same words (see glossary):
   - urgent (red): go to hospital NOW, day or night.
   - soon (amber): go to the clinic TODAY (or "this week" where clinically right, say so in the item).
4. Base everything on WHO guidance (IMCI chart booklet and its caregiver counselling, WHO Pregnancy, Childbirth, Postpartum and Newborn Care (PCPNC), WHO ANC recommendations 2016, WHO/UNICEF Facts for Life, WHO Caring for the newborn at home, WHO Doing What Matters in Times of Stress, IFRC first aid guidelines for public first aid, WHO fact sheets). Put the sources in "sources".
5. No medicine doses except these caregiver messages that WHO itself gives to families: ORS amounts, zinc for diarrhoea (10 mg/day under 6 months, 20 mg/day 6 months and over, for 10 to 14 days), iron and folic acid in pregnancy "as given by the clinic". Otherwise say "medicine from the clinic" or "ask the health worker".
6. Culturally right for rural northern Afghanistan: families, mothers-in-law and fathers decide together; say "tell the family" where helpful; respectful, never blaming; Islamic-neutral (no religious claims either way); transport is hard, so encourage planning ahead (money, car, a phone number) for pregnancy and emergencies.
7. Don't invent statistics. If unsure of a fact, leave it out or put a note in "review".

## Languages
Every text field is an object with three keys: "fa" (Afghan Dari), "ps" (Afghan Pashto), "en" (plain English so the project owner, a UK doctor, can check meaning).
- Dari must be Afghan Dari, not Iranian Persian: شفاخانه not بیمارستان, داکتر not پزشک, طفل/اطفال, ولادت not زایمان, پیچکاری not آمپول/تزریق, تابلیت not قرص, سینه‌بغل, سرخکان, مرض شکر.
- Pashto: standard Afghan Pashto with proper Pashto letters (ټ ډ ړ ږ ښ ګ ڼ ې ۍ ئ).
- Use Persian digits ۰۱۲۳۴۵۶۷۸۹ in fa and ps text. Use the zero-width non-joiner (U+200C) correctly in Dari (e.g. می‌شود, علایم‌ها is wrong, use علایم).
- Simple everyday words. No English words in fa/ps text except ORS written as «او آر اس».

### Glossary (use these so all topics match)
| English | fa (Dari) | ps (Pashto) |
|---|---|---|
| Go to hospital now, day or night (urgent alert title ending) | همین حالا به شفاخانه بروید، شب باشد یا روز | همدا اوس روغتون ته ولاړ شئ، که شپه وي که ورځ |
| Go to the clinic today (soon alert title ending) | امروز به کلینیک بروید | نن کلینیک ته ولاړ شئ |
| clinic / hospital | کلینیک / شفاخانه | کلینیک / روغتون |
| doctor / health worker / midwife | داکتر / کارمند صحی / قابله | ډاکټر / روغتیايي کارکوونکی / قابله |
| child, children / newborn | طفل، اطفال / نوزاد | ماشوم، ماشومان / نوی زېږېدلی ماشوم |
| mother / pregnancy / birth | مادر / حاملگی / ولادت | مور / امیندواري / زېږون |
| breastfeeding / breast milk | شیردهی / شیر مادر | تي ورکول / د مور شیدې |
| vaccine / injection / tablet / syrup | واکسین / پیچکاری / تابلیت / شربت | واکسین / پیچکاري / ګولۍ / شربت |
| fever / cough / diarrhoea / vomiting | تب / سرفه / اسهال / استفراغ | تبه / ټوخی / نس ناستی / کانګې |
| pneumonia / measles / convulsions (fits) | سینه‌بغل / سرخکان / تشنج | سینه بغل / شری / اختلاج |
| bleeding / danger signs | خونریزی / علایم خطر | وینه بهېدل / د خطر نښې |
| blood pressure / diabetes / TB / anaemia | فشار خون / مرض شکر / توبرکلوز (سل) / کم‌خونی | د وینې فشار / د شکرې ناروغي / نری رنځ / د وینې کمښت |

## File format
One file per topic: content/src/topics/<topic-id>.json, UTF-8, valid JSON, 2-space indent.

```json
{
  "id": "diarrhoea",
  "section": "children",
  "title":   {"fa": "اسهال و او آر اس", "ps": "...", "en": "Diarrhoea and ORS"},
  "summary": {"fa": "...", "ps": "...", "en": "One short line for the topic card"},
  "image": "diarrhoea",
  "blocks": [
    {"id": "diarrhoea.lead", "type": "lead", "text": {"fa": "...", "ps": "...", "en": "..."}},
    {"id": "diarrhoea.ors", "type": "step", "icon": "ors",
     "title": {"fa": "...", "ps": "...", "en": "Give ORS"},
     "text":  {"fa": "...", "ps": "...", "en": "..."}},
    {"id": "diarrhoea.urgent", "type": "alert", "level": "urgent",
     "title": {"fa": "...", "ps": "...", "en": "Go to hospital now, day or night, if the child:"},
     "items": [
       {"id": "diarrhoea.urgent.drink", "icon": "no-drink", "text": {"fa": "...", "ps": "...", "en": "cannot drink or breastfeed"}}
     ]},
    {"id": "diarrhoea.soon", "type": "alert", "level": "soon", "title": {...}, "items": [...]},
    {"id": "diarrhoea.dont", "type": "dont", "title": {"en": "Do not:"...}, "items": [{"id": "...", "icon": "...", "text": {...}}]},
    {"id": "diarrhoea.tip", "type": "tip", "icon": "handwash", "text": {...}}
  ],
  "sources": ["WHO IMCI Chart Booklet (2014): counsel the mother", "WHO/UNICEF Facts for Life (2010): diarrhoea"],
  "review": ["anything the doctor should double-check, in English"]
}
```

Block types the app renders (use only these):
- "lead": the opening 1 to 2 sentences. Exactly one, first.
- "step": a numbered key action with an icon, a short title and a short text. 3 to 7 per topic.
- "alert": a coloured box of danger signs. "level": "urgent" (red) or "soon" (amber). Title says what to do; items are the signs, each with an icon. Most topics have one urgent alert; add a soon alert if useful. 3 to 8 items each.
- "dont": things NOT to do (harmful customs, e.g. toothpaste on burns, stopping breastfeeding in diarrhoea). Optional, 2 to 5 items.
- "tip": one extra helpful sentence. Optional, at most 2.

Ids: lowercase, a-z, 0-9 and hyphens, dot-separated: "<topic-id>.<block>" and "<topic-id>.<block>.<item>". Unique across the whole book. Never reuse or rename an id once written (audio files are named after ids: `audio/<lang>-<voice>/<id>.mp3`, voice `f` for a woman, `m` for a man).

Narration: the app reads each block aloud on its own and has a speaker button next to every block and every alert item. The title of a step is read before its text, so the two must read naturally together. The alert title is read first, then each item on its own, so each item must make sense alone (e.g. "cannot drink or breastfeed", not "or vomits").

## Icons (use only these names in "icon")
General: clinic, hospital, car, phone, calendar, clock, moon, family, talk, card, check, no, warning, money, house
Children: baby, newborn-warm, cord, breastfeed, bowl-food, cup-spoon, ors, zinc, water, handwash, thermometer, fever, cough, breathing-fast, chest-indrawing, no-drink, vomit, convulsion, sleepy, stool-blood, eye-sunken, skin-pinch, growth, muac, swollen-feet, milestones, jaundice, syringe, drops, pill, rash, toys-play
Women: pregnant, bleeding, headache, eye-blurred, belly-pain, swelling, baby-movement, waters, iron-pill, birth-plan, midwife, rest, food-iron, sad
Everyone: heart, stroke-face, bp, sugar, foot, lungs, mask, window, weight-loss, lump, urine-blood, stiff-neck, wound, burn, cool-water, dog, poison, choking, stove, smoke, salt, walk, sleep, breathe, people, eye, tooth, animals, milk, insect
If you truly need another icon, use the closest one and add a "review" note naming the icon you wanted.

## Images
"image" is the topic id (the illustrator draws img/topics/<topic-id>.svg). Don't change it.

## Topic list and sections
children: vaccines (special page, see below), danger-child, newborn, breastfeeding, diarrhoea, cough, fever, growth, first-aid (shared)
women: pregnancy-danger, pregnancy-care, after-birth, anaemia
everyone: red-flags, first-aid, tb, blood-pressure, diabetes, stress, hygiene
Extra topics may be added later from research on the commonest illnesses in Samangan and Afghanistan.

## Vaccines file (content/src/vaccines.json)
```json
{
  "id": "vaccines",
  "title": {...}, "summary": {...}, "image": "vaccines",
  "lead": {"id": "vaccines.lead", "text": {...}},
  "visits": [
    {"id": "vaccines.birth", "ageDays": 0, "age": {"fa": "هنگام تولد", "ps": "...", "en": "At birth"},
     "doses": [{"id": "bcg", "name": {...}, "protects": {...}}]}
  ],
  "notes": [{"id": "vaccines.free", "icon": "clinic", "text": {...}}],
  "women": {"id": "vaccines.td", "title": {...}, "text": {...},
            "doses": [{"id": "td1", "when": {...}}]}
}
```
Each visit is narrated as one clip: the age, then each vaccine and what it protects against.

## Addendum: link blocks, step pictures and the home kit (2026-10-07)
- "link": a tappable card that opens a tool or another page: `{"id": "cough.counter", "type": "link", "to": "tool/breaths", "icon": "breathing-fast", "title": {...}, "text": {...}}`. "to" is one of `tool/breaths`, `tool/reading`, `tool/reading/temp`, `tool/reading/bp`, `tool/reading/sugar`, `tool/reading/spo2`, `tool/reading/muac`, `topic/<topic-id>`, `kit`, `family`, `near`. Title at most 7 words, text at most 32. It is read aloud like a step (title, then text). Optional, at most 2 per topic.
- "picture" (optional) on a "step" or "link": the name of a wide no-face picture in `img/pics/<name>.svg` (360 x 200), shown under the step. Use it only where a picture explains the action better than words.
- Section "kit" in `content/src/sections.json`: the home health kit topics (`kit-*`). They show only on the kit page (`#/kit`), not in the children or adults lists. Their "section" is "children" or "everyone" for the colour and audio pack. See docs/HOME_KIT.md.

## Addendum: animations and the Emergency screen (2026-10-07)
- "anim": a short narrated picture story (see docs/ANIMATIONS.md): `{"id": "<topic-id>.anim", "type": "anim", "anim": "<name>", "pick": "<variant>"}`.
  - "anim" is a file in `anim/` (`vaccines`, `herd`, ...) or a group (`cpr`, which first asks who needs help).
  - "pick" (optional, groups only) goes straight to one variant, e.g. `"anim": "cpr", "pick": "cpr-baby"` on the baby CPR page.
  - "title" (optional, max 7 words) is shown and read by the block's speaker. Without it the block uses the animation's own title (`anim.<name>.title`), so nothing new needs recording.
  - The page shows one still scene with a big play button; tapping opens the full-screen player, which reads each scene aloud and moves on by itself.
  - The scene lines live in `content/src/anims.json` (`anim.<name>.title`, `anim.<name>.s1` ...; groups also `anim.<group>.ask` and `anim.<variant>.label`). They are narrated, recorded in the studio right after the first page that shows the animation, and go in that page's audio pack. The validator checks that every scene of an animation used in a topic has its line.
  - At most 2 per topic; put it after the lead. The vaccines page has its own list: `"anims": [ ... ]` in `content/src/vaccines.json`, shown after the lead.
- Section "emergency" in `content/src/sections.json`: every first-aid and emergency topic, most urgent first. The topics keep their own section ("children" or "everyone", and also listed there); the children and adults lists show them in an "Emergency" group at the end, and the Emergency screen lists them under "All emergencies".
- `config.emergency` (content/src/config.json): the Emergency screen, opened by the big red home button (home module `"emergency"`, first in `config.home`). One row per age: `{"id", "label" (a ui.text key), "icon", "cpr" (the "not breathing" page, shown first in red), "anim" (the CPR variant its "Watch how" button plays), "topics" (the "Other emergencies" for that age, in order)}`. See docs/EMERGENCIES.md section 4.
- `config.urgentTopics` includes all emergency topics, so their narration is in the "urgent" audio pack that downloads first.

## Addendum: search words for the symptom finder (2026-10-07)

The "What is wrong?" screen ranks pages with `js/search.js` (fully offline, no advice: it only chooses which existing
page, section, tool or screen to open). Its word list is `content/src/search-phrases.json`; `tools/build.py` copies it
into `book.json` as `search`, keeping only keys that open something, and `tools/validate.py` checks it.

```json
{ "version": 1, "pages": {
  "diarrhoea":       { "fa": ["اسهال", "شکم روش"], "ps": ["نس ناستی"], "lat": ["ishal"], "en": ["diarrhoea", "loose stools"] },
  "diarrhoea.zinc":  { "fa": ["زنک"], "en": ["zinc"] },
  "pregnancy-danger":{ "urgent": true, "fa": ["…"], "danger": ["خونریزی در حاملگی", "په امیندوارۍ کې وینه", "bleeding in pregnancy"] },
  "tool/breaths":    { "fa": ["نفس طفل را بشمارید"], "en": ["count breaths"] },
  "near":            { "fa": ["نزدیک ترین کلینیک"], "en": ["nearest clinic"] } } }
```

- **Keys**: a topic id; a block id of a topic (`"<topic>.<block>"`: the result opens the topic at that block); a tool
  (`tool/breaths`, `tool/reading`, `tool/reading/temp|bp|sugar|spo2|muac`); or a screen (`emergency`, `kit`, `near`,
  `family`, `children`, `adults`).
- **fa / ps / lat / en**: lists of short phrases (1–6 words) the way people really say or type them: everyday words,
  local disease names (sulfa, zukam, garmi, salak…), body part + complaint ("کمرم درد می‌کند"), mothers' descriptions,
  polite women's-health words, common misspellings. `lat` = Dari or Pashto in English letters. All lists are searched
  whatever the app language. Do not put numbers in reading-tool phrases: typed readings ("140/90", "تب ۳۹") are
  recognised by `NUM_HINTS` in `js/search.js`.
- Start a phrase with **?** when a native speaker should check it (it still works). New Dari and Pashto phrases go to
  `docs/REVIEW.md` ("Smart search phrases").
- **danger**: phrases that put this page first with a red Emergency badge (not breathing, fits, heavy bleeding, snake
  bite…). Each word must be typed as listed (Dari/Pashto endings allowed), so write the common forms. Only for urgent
  pages: the Emergency section, the Emergency screen, or a topic with an `urgent` alert block (`validate.py` refuses
  others).
- **urgent: true**: the page gets the red badge whenever it is the best match (the Emergency section topics have this
  automatically). Same pages only. Use it for pages that are all danger signs (pregnancy-danger, danger-child).
- Pages without phrases are still found by their own title, summary, step titles and red-box lines (weaker), so a new
  topic is findable at once; add phrases to make it findable by everyday words.
- The editor (server/worker.js, a topic's "Search words" box) edits a topic's lists in the draft book. Section, tool
  and screen keys are edited in this file.
- Test: `node tools/search_eval.mjs` runs the queries in `tools/search-tests.json` (fa, ps, Latin, English, typos,
  danger) and prints top-1 / top-3. Run it after changing phrases; add a query for every miss you fix.
- Later, a downloaded meaning model can be plugged in with `addRanker({ weight, rank(query, lang) → [{ id, score }] })`;
  `rankAsync()` blends it in, and danger results from the word list always stay first.
- Where words point (2026-10-07): symptoms and danger words go to Health pages only (Home pages carry no medical
  advice), e.g. carbon monoxide to `fumes-poisoning`, not `winter-home`. "What does my reading mean" words go to the
  Health reading pages (`reading-bp`, `reading-sugar`, `reading-spo2`, `reading-temp`, `reading-muac`); typed numbers
  open the reading checker first and that reading page second. Kit pages keep only buying and using words. Adult pages
  (`diarrhoea-adult`, `pneumonia-adult`) need adult words in each phrase ("کلان", "پدرم", "adult"), so a child's
  symptoms still open the children's page.

## Addendum: content merge 2 (2026-10-07)
- "clinic": what the clinic or hospital actually does for this problem. `{"id", "type": "clinic", "icon" (optional; default "hospital" when the English title starts "At the hospital", else "clinic"), "title" (starts "At the clinic: ..." or "At the hospital: ...", at most 7 words), "text" (at most 32 words)}`. Shown with a green building icon and no number; read aloud like a step (title, then text). Not allowed on Home tab pages.
- Link targets added: `ask` (What is wrong?) and `emergency` (the Emergency screen). `"urgent": true` on a link draws it as a red row: use it for a way from a Home page to a Health emergency page. Red links and the closing `ask` link do not count towards the 2-links-per-topic aim.
- Lists with their own page: `config.lists` (`kit`, `safety`, `hospital`, `food`, `wellbeing`) and the same names in `sections.json`. A topic only in such a list is not added to the children or adults lists by `tools/build.py`. `"tab"`: `health` or `house`.
- **Mo's rule for the Home tab** (lists with `"tab": "house"`): no medical advice. No `alert` or `clinic` blocks; urgent signs live on Health pages and the Home page links there with a red link. Well-being pages end with a link to `ask`. Kit pages link to their device's Health reading page (`reading-*`).
- The Children and Adults screens are built from `config.listGroups` (groups of topics, tool rows, and one `rest` group); the Health tab from `config.home`, the Home tab from `config.house`, CPR and first aid from `config.firstAid`. See docs/HOME_LAYOUT.md.
- Topics with a general picture (`img/topics/children-generic.svg`, `adults-generic.svg`) show their first step picture in lists and at the top of the page.
- No religious content anywhere (Mo, 2026-10-07): prayer was removed from the calm activities on the stress and evening-routine pages.

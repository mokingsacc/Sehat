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

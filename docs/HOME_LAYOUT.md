# Screens and navigation: Health, Home, Family

This is how the app is laid out since content merge 2 (2026-10-07), after Mo's redesign. Ease of use comes first: few words, big targets, a picture first, and a big speaker beside every button and every row. Everything mirrors for Dari and Pashto (right to left) and fits a 320 px wide phone with no sideways scrolling.

## Bottom bar: three tabs

| Tab | Address | What it is |
| --- | --- | --- |
| **Health** (صحت / روغتیا) | `#/home` | The screen the app opens on. Emergencies, illnesses, the clinic. All medical advice is on this side. |
| **Home** (خانه / کور) | `#/house` | The house and everyday life: home safety, food and garden, well-being, the home health kit. No medical advice (see "Mo's rule" below). |
| **Family** (خانواده / کورنۍ) | `#/family` | The family record (vaccines, weights). Another worker is rebuilding this screen; its route and tab stay. |

Each tab is a picture icon (`heart`, `house`, `family`) with its name under it. Tapping a tab also says its name aloud (`ui.tab.health`, `ui.tab.house`, `ui.tab.family`), once the screen has opened. The current tab has a soft coloured pill behind its icon.

## The header (every screen)

- Tab screens: the app's name, a small dark **Listen to this page** button (plays every narrated line of the screen in order; it turns into a stop button while playing), the red **Emergency** button and the **settings gear**.
- Other screens: a back button, the title, the Listen button and the red Emergency button.
- Topic pages keep their big picture at the top: the back button sits on one corner of the picture and the red Emergency button on the other.
- **The red Emergency button** (warning icon and the word) is on every screen except the emergency flow itself (`#/emergency`, `#/emergency/<age>` and the pages opened from them) and the first-run screens (language, voice, the usage question). `render()` in `js/app.js` adds it to the first `.top` or `.topic-hero` of the screen, so screens written by other modules (tools, growth, share) get it too. At 320 px it shrinks its padding but keeps the word.
- Language: chosen at first run and changed in Settings (the header has no room for the language pill next to the Emergency button at 320 px).

## Health (`#/home`)

Top to bottom (`config.home`; remove a name to hide it):

1. `nextVaccine`: a slim strip only when a child's next vaccine is due within 7 days or is late ("Name · Next vaccine: 6 weeks · in 3 days"), with a speaker. It opens Family, where the full card is.
2. `emergency`: the biggest thing on the screen. Red, a warning icon, one word, a big speaker. It opens the Emergency screen and reads it aloud.
3. `firstAid`: **CPR and first aid** (`#/firstaid`, `config.firstAid`): "Not breathing? Choose the age" with four big age pictures (each opens that age's CPR page), then every first-aid page as a picture tile.
4. `ask`: **What is wrong?** (the symptom search, `#/ask`).
5. `children`: a picture card that opens `#/children`.
6. `adults`: a picture card that opens `#/adults`.
7. `hospital`: **Going to the clinic or hospital** (the list page `#/s/hospital`; its first row is **Nearest clinic**).
8. `share`: **Share Sehat** (`config.shareCard`). It opens `#/share` with the Share Sehat screen's own words (`shareApp`, `shareAppSub` or `shareWebSub`, `ui.share-app` or `ui.share-web`) once this version of the app has them; until then it opens the phone's share sheet with the older words.
9. `feedback`: **Give feedback** (`#/feedback`).

Also available for `config.home`: `install`, `sendApp`, `near`, `disclaimer`, `sections` (children and adults together) and the name of any list in `config.lists`.

Sizes: every button is one column, at least 100 px tall (the Emergency button 132 px), with a 72 px picture or icon tile, a 21 px bold title, and a 56 px speaker. At 320 px the tiles shrink to 60 px and the title to about 20 px.

## Children (`#/children`) and Adults (`#/adults`)

A title with a big speaker, then groups in order (`config.listGroups`). Each group has a heading with its own speaker; each topic is a big row with its picture, its title, its one-line summary and a 52 px speaker. Tool rows have a tinted background and an icon tile.

- **Children**: Danger signs (danger-child); the growth chart (once this version has it) and the breathing counter; Common illnesses (fever, cough, diarrhoea, measles, worms, malnutrition); Home readings (temperature, arm tape and weight); Everyday care (every other children's topic: vaccines, newborn care, breastfeeding, food for young children, growth and development).
- **Adults**: Danger signs (adults, pregnancy); the "check a reading" tool; Home readings (blood pressure, sugar, oxygen, temperature); Common illnesses; Women's health (pregnancy care, birth plan, after birth, anaemia, urine infection); Mind and stress (stress and worry, what stress does to us, thoughts feelings and actions, slow breathing, solving problems, low mood: sleep and routine; content pass 3); Everyday care (every other adults' topic: hygiene, illness from animals).
- A group with `rest: true` shows every topic of the section that no other group shows, that is not on the Emergency or first-aid screens, and that is not on a list page of its own, so a new topic always appears somewhere.
- The emergency and first-aid pages are not repeated here: they are one tap away through the red header button and CPR and first aid.

## Home (`#/house`)

A title with its speaker, then one big picture row per list (`config.house`): **Home safety**, **Food and garden**, **Well-being**, **Home health kit**. Each opens its list page.

**Mo's rule: no medical advice on the Home side.** Medical advice is reached only through Health, where people describe symptoms.
- Home pages have no danger-sign boxes (`alert`) and no "at the clinic" boxes (`clinic`). `tools/validate.py` refuses them on any topic of a list with `"tab": "house"`, and the dashboard editor warns.
- Where a page needs a way out in an emergency, it has a **red link row** (`"urgent": true` on a link block) to the Health page: for example "Someone feels ill from fumes?" opens the Emergency screen; "Burned by fire or gas?" opens Burns.
- Well-being pages are lifestyle tips only; each ends with "If you feel unwell, go to Health and tap What is wrong?" (a link to `#/ask`).
- Home health kit pages keep what to buy and how to use the device. Right after "how to use", a link row **"What does my reading mean?"** opens that device's own Health page (`reading-bp`, `reading-temp`, `reading-sugar`, `reading-spo2`, `reading-muac`), which has what the numbers mean, when to go, and the checker opened with that device chosen (`#/tool/reading/bp` and so on).

## List pages (`#/s/<name>`)

Lists from `config.lists` and `content/src/sections.json`: `kit`, `safety`, `hospital`, `food`, `wellbeing`. The page has a header (back, Listen, Emergency), a wide picture, the title with its speaker, any tool rows, the Nearest clinic row for `hospital` (`"near": true`), a big row per topic, and the safety note. `"tab"` says which tab is lit (`health` or `house`). Back returns to the screen the list was opened from. Old addresses still work: `#/kit`, `#/safety`, `#/hospital`, `#/food` go to `#/s/<name>`.

## Emergency (`#/emergency`, `#/emergency/<age>`)

- Opened by a tap on any Emergency button, it reads itself aloud ("Emergency. First, send someone for a car..." then "Who needs help?"); the Listen button in the header replays it. No full-width listen bar.
- One short line with a car icon: "Send someone for a car now", with its speaker; under it **Nearest clinic**.
- "Who needs help?" with its speaker, then four big picture cards: Newborn, Baby, Child, Adult (1 to 3 words; the age range is only in the narration, `ui.ageNewborn` and so on). Each card has a 52 px speaker on the picture.
- "All emergencies" (every emergency page) folds open at the bottom.
- An age page: first the red **Not breathing** card with **Watch how** (plays that age's CPR animation), then a slim car line, then that age's emergencies as a two-column grid of pictures, each with its title and a speaker on the picture. A page's picture is its own, or, for pages that share a general picture, the first step picture.

## Settings (gear)

Language, voice speed, voices and downloads, updates, usage counts, privacy, the disease watch, **Give feedback**, Share, the Android "send the app" row, **Add to home screen** (when the phone offers it), the recording studio, then the safety note and the About line.

## Look

Warm cream background, white rounded cards with a soft shadow, red only for urgent things (Emergency, CPR, danger signs, red link rows), teal for tools and the clinic, amber for notes. People in pictures have no faces. Old Android phones: the new styles set left and right per direction instead of `inset-inline-*`.

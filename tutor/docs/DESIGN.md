# The looks, and the rules every screen and sheet follows

Mo's choice (14 Oct 2026): look **B** (clean, modern) as the base for older children, with look **C**'s big lesson
button and boldness for younger ones. The year the child picks decides, with no setting to find. The design committee
(sittings C0 and C1, 16 Oct 2026, `build-committee/decisions_fable.md`) kept both looks and specified the rest below:
the tokens, the sizes per age band, dark mode, the early-years and adult-literacy looks, first run, the guardian
consent screen and the PIN lock. Builders code from this file; a question it does not answer goes to the next sitting.

| | Years 0-6 and adults learning to read (`data-look="bold"`, look C) | Years 7-12 and adult readers (`data-look="clean"`, look B) |
|---|---|---|
| Feel | bold, friendly; green and orange on mint for children, teal on white for adults | calm, clean, teal on white |
| Home | one huge play button for the next lesson, a listen button, a big orange "print today's sheet", subject tiles | a "continue" card with a play button and progress, Check my sheet, a subject list |
| Reading | school-book Naskh letters, 22 px | Vazirmatn, 18 px |
| Buttons | 60 px tall (72 px in early years) | 48 px tall |
| Voice | each page is read aloud when it opens | the speaker is there to tap |

The renderings are in [Home Tutor App Looks](https://claude.ai/artifact/HPUjNESWe3WBYe6iLVi3aT). The tokens are at the
top of `app/css/app.css`; screens use only tokens, so a look is changed in one place.

## Ease of use first

- **Tapping a year starts the app.** No sign-up, no password, no "next" button. No name is ever typed: an alias
  picture stands for her, and names appear only on certificates (Year 1).
- **One big button** on Home starts the right lesson: the one left half way, else the next one not done.
  Every lesson is still open from the subject pages; nothing is locked.
- **A speaker on every text,** buttons included. The language's one voice plays first; the phone's own voice is the
  fallback (C5, change 13).
- **Three tabs only:** Lessons, Ask, and Print (hub) or Sheets (online). The teacher page is behind "Who is learning" and a PIN; so is Settings.
- **Plain words, the child's language,** Persian digits, right to left; sums and English left to right.
- **Wrong answers teach:** three hints (the lesson step, a worked example with other numbers, the first move), read
  aloud for young children, never the answer. The answer page is the teacher's. No scores to lose, no timers. Stars
  for children; "Correct, 8 of 10" for adults.
- **Nothing breaks without the hub:** lessons already opened still work; Ask gives the closest checked answer
  from those lessons, marked as such; Print says to come to the hub.
- **Every answer is labelled:** checked, worked out, from the lesson, from the teacher, or AI (not checked).

## Paper first

Mo's view, and the plan's: worksheets with pen and paper beat a screen for practice. So:

- Every lesson ends with its worksheet and a big Print button ("Get the sheet" online). The bold look has "print
  today's sheet" ("get today's sheet") on Home.
- **A4, black and white, one page,** big margins, line art with no faces, name and date boxes at the top, written by
  hand; the phone never asks for the name.
- **Grey letters to write over** (tracing), then empty boxes to write alone; stacked fractions with an answer box.
- The **code in the corner** (`M7-03-48217`, its last digit a check digit) brings the sheet back in "Check my
  sheet". The answer sheet prints separately and needs the teacher's PIN.
- No app name, URL or cohort on a learner sheet.
- Sums are made fresh for each print, so a child can practise the same skill twice.
- Sheets always print black on white, whatever the phone's theme.

## Right to left, done properly

- `<html dir="rtl">`; layout uses start and end, never left and right.
- Sums sit in a left-to-right island (`<span class="m">`, `unicode-bidi: isolate`) so `۱/۲ + ۱/۴ = ۳/۴` never
  reorders. Lesson text marks sums with `$...$`.
- Digits follow the reader: Persian digits in Dari and Pashto, on screen and on paper; answers are read in any
  digits (`۳/۴`, `3/4`, `۰٫۷۵`, `1 1/2`).
- Fonts are bundled (Vazirmatn, Noto Naskh Arabic; SIL Open Font Licence in `app/fonts/OFL.txt`), so phones
  without Persian fonts still show every letter, and sheets print the same everywhere.
- Long Pashto words at 360 px wrap; nothing is ever cut with an ellipsis.

---

# The C1 spec (design committee, 16 Oct 2026)

## 1. One Qalam, two switches

One app for every age: today's icon (teal tile, white nib, saffron line), one warm action colour, one icon set
(`ui.js` ICONS), one speaker. Ages differ only through five attributes on `<html>`, set by `main.js` from the
learner's record (`app/js/bands.js`), never chosen by the learner:

| Attribute | Values | What it changes |
|---|---|---|
| `data-band` | `ey` (year 0), `p1` (1-3), `p2` (4-6), `s1` (7-9), `s2` (10-12), `ad` (adults; track `literacy` or `reader`) | which Home, which content, which privacy rules |
| `data-look` | `bold`, `clean` (replaces today's `data-mode` small and big) | sizes, radii, borders, the reading font, read-on-open |
| `data-tone` | `child`, `adult` | the palette, the words (stars or check marks), the pictures the packs use |
| `data-text` | absent, `large` | "Bigger text": `--scale` 1 or 1.25 |
| `data-theme` | absent (follows the phone), `light`, `dark` | the colour tokens |

| Band | look | tone | Read on open |
|---|---|---|---|
| `ey` | bold | child | everything, from recorded clips |
| `p1` | bold | child | Home and lesson steps |
| `p2` | bold | child | lesson steps; a speaker elsewhere |
| `s1`, `s2` | clean | adult | a speaker to tap |
| `ad` literacy | bold | adult | Home and lesson steps |
| `ad` reader | clean | adult | a speaker to tap |

The server only ever learns the band. Strings in `i18n.js` may be `{child, adult}` objects where the tone changes the
wording; `s()` picks by `data-tone`. English joins Dari and Pashto as an interface language (adults choose it).

Rules per screen: one accent colour, at most three text sizes, banners only for "draft" (offline is a chip, never a
banner: C2.5), motion only the press-down of a button, the consent ring and the reading ring (`prefers-reduced-motion`
removes all three). Nothing hard-coded: the roughly
40 colours and sizes written into `app.css` selectors today move into the tokens below first (P9).

## 2. Colour tokens

Four palettes: tone × theme. Every text pair below was checked on 16 Oct 2026 at 4.5:1 or better in light and 6.3:1
or better in dark (except `bad` on `bad-soft` in dark, 6.7:1 after the fix, and the decorative `line`, which is a
border, not text). The browser test recomputes ink-on-background per band.

| Token | Light, child | Light, adult | Dark, child | Dark, adult | Used for |
|---|---|---|---|---|---|
| `--bg` | #eef7f4 | #ffffff | #0f1a16 | #0f1517 | page |
| `--card` | #ffffff | #ffffff | #16241f | #172125 | cards, tabs, keypad |
| `--soft` | #e1f2ea | #eef6f6 | #1b2e27 | #1c2b30 | soft cards, printer row |
| `--line` | #cfe3dc | #e3e8ec | #2c4038 | #2c3c42 | decorative borders |
| `--line-strong` | #7d8996 | #7d8996 | #6b8a7c | #6b7f8a | inputs, outlines (3:1 or better) |
| `--ink` | #15302b | #14213d | #e5f3ec | #e7eef0 | text |
| `--muted` | #4a6660 | #5a6478 | #a3bdb2 | #a7b4b9 | secondary text |
| `--accent` | #0b6e4f | #0d7c7e | #4cc795 | #4fbdb8 | primary buttons, play, speaker, tabs |
| `--on-accent` | #ffffff | #ffffff | #04231a | #062322 | text on accent |
| `--accent-shadow` | #08553d | #095c5e | #2f9a6f | #2a7a76 | the press shadow only |
| `--accent-ink` | #08553d | #095c5e | #4cc795 | #4fbdb8 | tag, link and kicker text |
| `--accent-soft` | #e1f2ea | #e3f2f2 | #1b3a2e | #1c3a3a | tags, the active tab |
| `--warm` | #c2540a | #c2540a | #f0904a | #f0904a | the one warm action (print, mic) |
| `--on-warm` | #ffffff | #ffffff | #2a1300 | #2a1300 | text on warm |
| `--warm-shadow` | #8f3d07 | #8f3d07 | #a85a24 | #a85a24 | press shadow |
| `--warm-soft` | #fde9d9 | #fde9d9 | #3a2416 | #3a2416 | hint rows |
| `--warm-ink` | #7a3a06 | #7a3a06 | #f6b989 | #f6b989 | text on warm-soft |
| `--good` | #2f9e63 | #2f9e63 | #57c792 | #57c792 | right marks, borders, bars; never under white text |
| `--good-soft` | #e6f6ec | #e6f6ec | #16302a | #16302a | right feedback, a "good" button |
| `--good-ink` | #1f5a35 | #1f5a35 | #9fe0bf | #9fe0bf | text on good-soft |
| `--bad` | #b42318 | #b42318 | #ff7a6e | #ff7a6e | wrong marks and text |
| `--bad-soft` | #fdecea | #fdecea | #2a1715 | #2a1715 | wrong feedback |
| `--ai-ink` | #8a4a06 | #8a4a06 | #f0b36b | #f0b36b | the AI badge and the draft banner |
| `--draft-bg` | #fdf1e1 | #fdf1e1 | #2e2416 | #2e2416 | the draft banner |
| `--s-maths`, `--s-science`, `--s-english`, `--s-dari`, `--s-pashto` | #1f4fa3, #c2410c, #7a4a9e, #0b6e4f, #b23a48 | same | the same in dark; white on each is 4.5:1 or better | same | subject badges |

`--warm` changed from #d9600b (white text 3.7:1) to #c2540a (4.6:1). A "good" button is `--good-soft` with
`--good-ink` text and a `--good` border, because white on `--good` is 3.4:1. `color: var(--accent-shadow)` on any
text becomes `var(--accent-ink)`. `theme-color` follows `--accent`; `color-scheme` follows the theme.

## 3. Type and size tokens

Every size is a token times one scale: `--scale: 1`, or 1.25 under `data-text="large"` ("Bigger text" in Settings,
per learner, one switch). Tap heights do not scale; they add 8 px when text is large.

| Token | clean | bold | Note |
|---|---|---|---|
| `--fs-sm` | 14 | 16 | the smallest text anywhere; nothing under 14 px, nothing under 16 in bold |
| `--fs` | 16 | 18 | interface text, line height 1.4 |
| `--fs-read` | 18 | 22 | reading text, line height 1.8; Vazirmatn in clean, Naskh in bold |
| `--fs-h1` | 23 | 27 | titles, line height 1.35 |
| `--fs-btn` | 17 | 19 | button labels; `.big` buttons 21 / 23 |
| `--tap` | 48 | 60 (72 in `ey`) | buttons, rows, keys; +8 px when large |
| `--r`, `--r-lg`, `--bw` | 16, 24, 2 | 20, 28, 3 | radii and border width |
| lesson letter, word, glyph | 150, 50, 84 | same | fixed, already huge; not scaled |

Per band, the reader sees:

| Band | Reading | Interface | Titles | Tap | Praise |
|---|---|---|---|---|---|
| `ey` | pictures and sound; Naskh 22 px where words appear | 18 | 27 | 72 | stars |
| `p1`, `p2` | Naskh 22 px, short sentences | 18 | 27 | 60 | stars |
| `s1`, `s2` | Vazirmatn 18 px | 16 | 23 | 48 | "Correct", "8 of 10" |
| `ad` literacy | Naskh 22 px | 18 | 27 | 60 | "Correct", a check mark |
| `ad` reader | Vazirmatn 18 px | 16 | 23 | 48 | "Correct", a check mark |

The app stays 480 px wide at most on tablets and laptops, so lines never grow long. Text wraps, never truncates.

## 4. Dark mode

- `data-theme` absent: the tokens follow `@media (prefers-color-scheme: dark)`. Settings offers Phone, Light or Dark,
  per learner, kept on the phone. Dark is less conspicuous at night on a borrowed phone, which is why it exists.
- Pictures: in dark only line art takes `--picture-filter` (invert and hue-rotate): the importer marks it
  (`line: true` on the picture); a photograph, a coloured picture or an alias picture is never filtered and keeps its
  colours (P9 look-over, ruling 7). The subject badges keep their colours too.
- The draft banner, toasts and the hub chip use the tokens too; no element keeps a fixed colour.
- Sheets, previews and PDFs never take the theme: the sheet document has its own fixed black-on-white CSS.

## 5. Home per band, the early-years look, the adult-literacy look

Every Home shows at most **one primary action, one secondary action and one list**; the shell (`app/js/modules.js`)
picks them from the modules' `home.action` offers, and no module can add a tile or banner.

| Band | Primary | Secondary | List | Tabs |
|---|---|---|---|---|
| `ey` | a 120 px play button for the next activity, its picture above it | a 72 px listen button | none | none |
| `p1`, `p2` | the 100 px play button with the next lesson's glyph and title | "Print today's sheet" (warm, full width) | subject tiles with stars | Lessons, Ask, Print |
| `s1`, `s2` | the continue card with progress | "Check my sheet" | subject list with progress bars | Lessons, Ask, Print |
| `ad` literacy | "Continue" with the next letter or word at 84 px, play and listen | "Print today's sheet" | track rows: Reading and writing, Everyday maths | Lessons, Ask, Print |
| `ad` reader | the continue card | "Check my sheet" | track rows: up to five, where their packs and modules are on | Lessons, Ask, Print |

**Early years (`ey`):** `data-look="bold" data-tone="child"`, `--tap` 72 px. No tabs, no Ask, no text the child must
read: everything is read on open from recorded clips. The alias picture sits at the top start; the grown-up's corner
is a 44 px lock icon at the top end that opens Who is learning, Settings and Print after a 2-second long press (a
short tap says, aloud, "hold it"). The press shows it is working: pressed down from the first touch, the consent
ring's component filling round the lock over the 2 seconds (a plain pressed state under reduced motion), a short
vibration as Who opens, a cancel when the finger lifts or leaves early (ruling 6). The draft band shows on staging
phones but is never spoken (ruling 8). Lesson steps advance with one 72 px "next"; stars at the end. No PIN lock.

**Adult literacy (`ad`, track `literacy`):** `data-look="bold" data-tone="adult"`: Naskh 22 px, 60 px buttons, read
on open, on the adult palette (white, teal). Home as in the table; the track rows are subject rows (C4, change 6): the
literacy track lists Reading and writing and Everyday maths only, the reader track up to five (reading in her
language, Everyday maths, English, Chinese, University), each where the cohort serves an adult pack of that subject to
her track. Lessons end with a check mark and "Correct, 8 of 10", never
stars. Packs for adults carry `audience: adult` and use adult objects (market, clinic, bus, money). Until an adult
pack is signed, an adult's Home says, with a speaker, "Lessons for adults are coming" and offers "Pick another year".

**Who is learning:** one row per learner on this phone: alias picture (48 px), year or track, a check on the active
one; then "New learner", "Change year or language", "Settings", and the "Teacher" link. Settings, phone only and per
learner: Bigger text, Theme (Phone, Light, Dark), Lock (set, change, remove), Nickname (hint: "a nickname, not your
name"), Consent (what was agreed, "Stop sharing"), "Remove this learner from this phone" (behind the PIN, spoken
confirmation), Credits, About.

## 6. First run and the sign-up order

Mo's rule: tap a year and learn. Everything else is asked when first needed. The steps are an ordered `STEPS` array in
`app/js/screens/signup.js`, so a step can be added or dropped without touching the others.

**Welcome** (one scrolling screen, read on open: the title; a speaker on every head and button):

1. Language: دری | پښتو | English.
2. "Primary school · years 1 to 6": six coloured year buttons, then the dashed "Not in school yet · about 3 to 5"
   (year 0, band `ey`; an older beginner takes year 1 or an adult door).
3. "Secondary · years 7 to 12": six buttons.
4. "Adults · 18 and over": "Learn to read and write" (track `literacy`), "I can read" (track `reader`).
5. At the foot, two links: "I have a class code" and "Teacher".

No name field. One tap on a year or a door creates the learner on the phone, assigns an alias picture no other learner
on this phone uses (`content/aliases.json`: book, key, cup, teapot, clock, apple, grapes, pomegranate, mountain, boat,
umbrella, bell; drafts until reviewers strike any gendered, religious or name-like item), and goes to Home.

**With a class card:** the card's QR opens the app with `?join=CODE` (or she types the code under "I have a class
code"); the Welcome kicker then says "Class code found" and the order is year → consent (section 7) → lock offer
(section 8; skipped for `ey`) → Home. `/api/join {cohort_code, band, lang, picture, consent}` is sent, or queued
while offline, and returns the alias number ("Book ۲۷") shown from then on in Who is learning and to her teacher.

**Without a card:** she learns at once. The consent screen appears the first time she sends a question or opens a
module with any risk; "Not now" keeps Ask on the phone (cached banks, nothing sent) and no event leaves the phone.
Adults see the same screen with "Before you start" and record `kind: self`.

**Girl or boy:** nothing is built. If Mo decides yes (D1, by 15 March 2027), it is one step after consent and before
the lock, with "prefer not to say", kept on the phone and sent only as a live-class routing flag. Interface text must
not need gender agreement, so the decision stays policy, not code.

## 7. The guardian consent screen

One screen, route `#/consent`, in the learner's look. Title: "Before you start · for the grown-up" in school bands,
"Before you start" for adults. Four rows, each an icon, one sentence and a speaker, read aloud in order on open:

1. (book) What Qalam does: lessons, worksheets and answers to school questions.
2. (lock) What it keeps: no names, no photos; questions for 60 days and lessons done for 12 months, without a name.
3. (users) Who sees it: her teacher; online, OpenAI in the United States reads questions and sheet answers and may
   keep them up to 30 days. The village hub's version says only this centre's computer sees them and nothing leaves
   the village. The server names the version to show (`hello.consent`); the texts live in
   `content/consent/<lang>/<version>.json` and are drafts until the reviewers and, in March, the solicitor sign them.
4. (stop) Stop any time in Settings.

Then "Read all" (the full text, a speaker per paragraph) and two buttons of equal width: **"Hold to agree"**
(primary; press and hold 3 seconds; a ring around the button fills; the phone vibrates 30 ms at the end; letting go
early cancels; `user-select: none` and `-webkit-touch-callout: none` so no copy menu appears) and **"Not now"**
(outline). The phone records `consent {kind: guardian-on-phone | self | partner-paper, version, at}` and sends it in
`/api/join` or `/api/me`; the guardian's name is never asked. Withdrawal is "Stop sharing" in Settings, which calls
`DELETE /api/me` behind the PIN.

## 8. The PIN lock and reset on a shared phone

The lock is a privacy curtain on a shared phone, not security: it stops a sibling or cousin opening her learner.

- Optional, 4 digits, per learner; offered once after consent (one screen: "Lock with a number?", a one-line reason,
  the keypad, "Not now") and always in Settings. Never for `ey`.
- Locks on app start, on switching to a locked learner, and when the app returns after 5 minutes in the background
  (`visibilitychange` timestamp), not on idle, because she may be writing on paper.
- The lock screen: her alias picture, four dots, a 3×4 keypad with 64 px keys in Persian digits (Latin digits from a
  keyboard are accepted too), "I forgot" and "Someone else" (to Who is learning). Keys make no sound, since spoken
  digits would reveal the PIN; the title is spoken.
- Five wrong tries: wait 1 minute, then 15, then 60 (the hub's teacher-PIN rule), kept in `lock.until`.
- **Reset without wiping:** "I forgot" starts a 24-hour countdown. From then on the lock screen shows "a reset is
  waiting · 17 hours left" to whoever opens it; her correct PIN cancels it; after 24 hours the next opener sets a new
  PIN. Nothing is deleted: progress, notes and questions stay. A teacher's 6-digit code (`POST /api/me/pin-reset`,
  P20) can end the wait in cohorts that turn that on.
- Storage on the phone: `lock {salt, hash, tries, until, resetAt}`; the hash is 10,000 rounds of SHA-256 over salt
  and PIN in bundled JavaScript (`app/js/sha256.js`), because `crypto.subtle` needs HTTPS and the hub is plain http.
  The PIN never leaves the phone, and no reset is reported to any server.

## 9. Voice

Rewritten at C5 (change 2, replacement spec C5.6; Mo's decision of 17 October). `speech.js` plays, in order: the
language's clip from the pack or from `app/audio/<lang>/<key>.opus`, then the phone's own voice if it has one for the
language, then the "voice not ready yet" toast. Every text Qalam writes (interface strings, the staff strings, and the
lesson texts, phrases and letter sounds a pack marks for voice) is voiced at build time by `tools/voice.py` with one
fixed woman's voice per language (`prs`, `ps`, `en`, `zh`); the voice id is recorded in
`app/audio/<lang>/manifest.json` and in each pack's audio manifest, and a changed voice re-renders every clip of that
language, so one language is always one voice. Only Qalam's own strings and pack text go to the voice service, never
anything a learner typed, a name, an event or anything from D1 or a hub. Before any clip of a language ships, a native
listener passes a sample of 30 clips; a language with no voice good enough waits, and there the phone's voice or the
toast stands. The release rules that asked for a recorded clip (every `ey`, `p1` and `letter` step, every step the
adult literacy track sees, every word of the English and Chinese packs) are met by a generated clip, each still played
by the reviewer before OK (P17). Scripture is not a text Qalam writes: the Quran keeps its human reciter, and its
translations take no phone voice at all (C4, change 7): an unvoiced translation shows without a speaker, marked
`data-voice="none"`, which the browser check allows on those elements only. Until P36 renders the clips, the recorded
clips and the phone's voice stand as before.

## What P9 built, and where it differs

- The tables in sections 2 and 3 are the tokens at the top of `app/css/app.css`, as written; no rule below them holds
  a colour or a size except the fixed lesson glyphs and the always-white sheet preview. `app/tests/bands.test.js`
  checks every text pair in all four palettes and fails on a stray colour or size; `tools/browser_check.mjs`
  measures every visible piece of text per band in the browser (4.5:1, 3:1 for large text), clipped text, page
  width, direction and the speaker rule. The screenshots for C2 are in the committee's `p9-screens` folder.
- Text in the accent colour uses `--accent-ink`, not `--accent`: the active tab's teal on `--accent-soft` was 4.3:1.
- The subject colours stay the same in dark: white on each is already 4.5:1 or better.
- The speaker rule (P9 look-over, ruling 1): one page speaker in each header, the subject page's included, reads the
  screen in order, skipping the draft band and the connection chip (ruling 8). That is enough where learners read
  (s1, s2, adult reader, p2). Where Home is read on open (p1 and adult literacy) every worded button also has a
  44 px speaker after it, subject tiles and lesson rows go one per row with a speaker at the end, and a tab says
  its label as it switches. Early years: the listen button; nothing there is worded for the child.
- The Who chip shows the alias picture (P10); never an initial, a nickname or a photo. Its circle is
  `--accent-soft` with `--accent-ink`, never `--warm`, which is the one action's (ruling 4).
- Credit lines are in the learner's language for every word Qalam writes (heads, "all rights are theirs", voices,
  "shared with permission", the `changes` text); owners' names, titles and licence names stay as the owner wrote
  them; a row's speaker reads in the interface language (ruling 3).
- Interface clips: `app/audio/<lang>/manifest.json` names each recording's speaker by a code, never a name. Until
  native speakers record, the three clips there are two-note chimes marked `placeholder`, which play only on a
  tester's phone; everyone else hears the phone's voice or the "voice not ready" toast.
- English pages run left to right: the back, next and row arrows turn round, and Dari or Pashto pack text keeps its
  own direction inside them.
- Bigger text and the theme are kept per learner but get their switches with Settings (P10); Welcome lost its name
  field and gained English, and gets the early-years and adult doors in P10.

## What P10 built, and where it differs

- Welcome, consent, the lock and Settings are built as sections 5 to 8 say. Open for the next sitting: on Welcome the
  speakers sit on each head ("Primary school · years 1 to 6") and on each worded door, not beside each year digit;
  "Remove this learner" and its confirmation use `--bad` (a `--bad-soft` button with `--ink` text), the only new use
  of a colour; the lock's keypad keeps 1 2 3 on top, left to right, in every language, with Erase bottom left. C4
  settled all three as built (look questions 1 to 3; change 12: the keypad is a left-to-right island like a sum).
- The alias pictures are line drawings in the icon style, `--accent-ink` on the Who chip's `--accent-soft` circle;
  Who is learning shows "Book ۲۷" once she has joined, "Book · waiting to connect" while a join waits.
- The hold ring (consent, and the grown-up's corner) is drawn round the button's own shape; under reduced motion it
  is not drawn and the pressed button has a 3 px accent outline instead.
- A middle dot right after Persian digits reads as a zero ("۶ ·" looks like ۶۰): Dari and Pashto strings put a
  colon or comma there instead.

## What P11 built, and where it differs

- The net chip, the badges, "Send when I'm online" and the empty states are built as C2.5 says. Open for the next
  sitting: at 360 px a header with a long title or a kicker ("Ask", "Check my sheet") has no room for "Offline · 1
  waiting" beside it, so the chip then takes a line of its own under the header, at the end (left in Dari and
  Pashto); a short title keeps it beside. The title is given at least 6rem before the chip moves down. Since C5
  (changes 7 and 8, C5.3): the chip is hidden on both hosts while all is well (online with the network up, or on the
  hub with the hub in reach, nothing sending or waiting), and it moves down whenever the title would wrap beside it,
  measured after the screen is drawn; a sentence under the title is a `lead`, the kicker keeps a few words.
- On the hub, a question asked while the hub is out of reach gets the same "Send when I'm online" button; "online"
  there means "the hub in reach". Open: a hub wording ("Send when the hub is near").
- In early years the chip is off every screen the child uses (Home, lessons, subject pages) and on the grown-up's
  screens behind the corner (Who is learning, Settings, Print, Credits).
- The chip says "Offline" as soon as the browser says the network went, not only at the next round.
- Dari and Pashto put a comma, not a middle dot, between "Offline" and the count, by the P10 rule.

## What P13 built, and where it differs

- The sheet is laid out as C2.1 says: four solid corner squares (the top right one a ring with a 6 mm hole), a header
  with the title and the name and date boxes, a two-column slot grid, and the foot with the QR code (text only,
  `Q1 M7-03-48217 PRS`) and the code beside it at its end side. Every cell is a function of the item list, so the hub's
  PDF, the browser's print and the phone's key agree; the layout test holds Chromium and WeasyPrint within 0.5 mm
  of the key. Squares and cells are drawn as SVG and borders, so they print with "background graphics" off.
- The intro sits beside the example box in one row (16 mm clean, 18 mm bold), not above it; the code sits at the
  QR's end side; a `mixed` cell's whole-number box is on the left in every language, as sums are written left to
  right.
- Online, the third tab is "Sheets" (a page icon) and the sheet screen offers "Print or save as PDF" (a new tab that
  prints itself) and then "Do it on screen"; on the hub it is "Print" with the hub's queue, as before. The answer page
  needs the teacher's PIN everywhere and does not exist online, which has no PIN; the preview is always the
  worksheet.
- Check my sheet shows no answer for a sum or a count, only "No, look again" (C2.3); written, circled and sorted items
  keep "Done it on paper? Compare". The hint ladder comes with P15.
- Open for the next sitting: M7-03 needs 214 mm, not the draft's 200 (its intro, example and the challenge prompt
  take rows the draft did not count), so it has no "Working" box; the other Pack 1 sheets range from 190 to
  213.5 mm, and two (E4-01, S7-01) get one.

## What P14 built, and where it differs

- "Check my sheet" opens, where `photo` is on, with "This sheet?" for the last sheet she got (its title and code):
  "Take a photo" first, then "Type my answers" (always there); offline, "Photos need the internet" takes the photo
  button's place. A camera the phone refused adds a line on allowing it in Settings.
- The first time, a short explainer ("Put your sheet flat, in good light. Show all four black squares.") with Start; then the camera, dark
  whatever her theme, with the four corner brackets, a coaching line and the shutter. The phone takes the photo
  itself once the four squares have held still; the shutter and the flash are there too. Without a camera, the
  file input; after a photo from it, one line says the phone may keep it in its gallery and she can delete it there.
- "Is this clear?" shows only when the photo is blurred, dark or shiny, with Retake and Use it anyway. While it
  reads, the flattened sheet sits dimmed under a ring.
- "What I read": one row per answer box with her own writing (the tile), the reading in her digits ("I can't read
  it" or "Empty" where so), Fix (a keypad) and, in adult literacy (P9 ruling 1), a speaker. "Yes, mark it" then marks on
  the phone, the same as typed answers; "Retake" goes back to the camera.
- Open for the look-over: the noisy test photos make strips of 45 to 50 KB, not the spec's about 30 KB (a real
  phone's cleaner photo should come out smaller; JPEG 0.7 is kept as specified); the "This sheet?" card sits on
  the page's own background in the clean look and could use a stronger edge.

### Sheet heights

The final table (C2.1 allowed each height to move by up to 4 mm). Item rows are in mm, clean / bold; the body is 230
mm (y 34 to 264), with 4 mm between rows; a sheet whose rows need more fails the validator.

| Kind | Width | Height clean / bold | Cell |
|---|---|---|---|
| sum, whole-number answer | half | 28 / 34 | int, 30 × 22 |
| sum, fraction answer | half | 34 / 40 | frac, two 24 × 13 boxes 4 mm apart (26 × 14 bold); mixed adds a 14 × 13 box (15 × 14) 3 mm before |
| count, up to 6 objects | half | 40 / 44 | int |
| count, more than 6 | full | 34 / 40 | int |
| trace | full | 34 / 38 | none |
| circle | full | 40 / 44 | none |
| write | full | 12 + 10 per line | none |
| sort | full | 60 / 60 | none |
| draw | full | 64 / 64 | none |
| a generated group's prompt | full | 7 / 8 | none |
| intro, per line | full | 6 / 7.5 | none |
| intro beside the example | full | 16 / 18 | none |
| Working (what is left) | full | at least 20 | never photographed |

## What P15 built, and where it differs

- Check my sheet: one row per item. Right is a plain ✓. Wrong says "Look again" with Hint and Try again; an empty row
  "Not done" with "Type it". The score counts right answers ("Correct: 5 of 6"), with stars in the child tone and a
  check in the adult tone for those right first time. Hints open one rung at a time in a warm card ("Hint 1 of 3",
  with its speaker; p2 and adult literacy hear each rung as it opens). Rung 1 has "Open that step", and Back returns
  to the same results. Rungs for Qalam sheets come with the key, so they work offline.
- Rung 1 says the step's number and first sentence, or only "this step" when the step's number is the answer.
  Fraction sheets point same-bottom sums to the step that teaches them (`step_same` on a generator).
- After rung 3 and another wrong try: "You're close. Try it again on paper." with "More like this" and, where
  `teacher` is on, "Ask my teacher". The first time she ever opens a third hint, the one spoken line about hints,
  not answers.
- "Something looks wrong?" under the results: she taps an item number, and the screen says "Thank you. A teacher
  will look at this item."
- Lessons: a wrong choice is greyed out and she picks again; the right one is never revealed. "Why" shows only once
  she is right. A wrong number says "Not yet". "Make it simpler" no longer shows the simpler form.
- Ask: an exercise gets "Let's work it out together. Here are hints, one at a time." and the ladder instead of an
  answer, from either door. Homework help (`#/ask?hw=1`) has its title, the placeholder "Type the question from your
  book", subject chips, and "Check my answer" under the ladder ("Yes, that's right", "Not yet: try the next hint.
  2 more tries.", "I'm not sure about this one. Ask your teacher."). On Home it is the secondary action for p2, s1 and
  s2 while her day is not set to school (P19 adds the question). Offline, Home keeps the usual secondary and
  Homework help says it needs the internet.
- The answer box's placeholder lost its example ("like 3/4"), which could have been the answer.
- Fixed from P11: an English header with a Dari title now starts at the reading side under its kicker. The browser
  check had also counted the hidden network chip as the header's last item.
- Not built (open look questions): "Hints are resting for today" when the AI budget is spent (the exercise goes to the
  teacher instead); hold-for-teacher (P20); in bold English the homework placeholder is cut at 390 px; the leak
  check's Dari and Pashto number words need a native speaker's list.

## What P17 built, and where it differs

- `/review/` is its own page in the clean look and adult tone, English or Dari (a switch in the header; the Dari
  strings are drafts). Since C5 (change 9, C5.1): English, Dari or Pashto, the same three-way picker on every staff
  page, remembered per device; dates in Solar Hijri for Dari and Pashto (change 12). Online it opens through Cloudflare Access; on the hub, through the teacher's PIN, then "I
  review as" (the roles lessons need) and "My initials".
- "Lessons for you", grouped by pack, with a tag per lesson: Not started, Step n of N, Changes asked, Signed,
  Changed since you signed.
- Each step is the learner app itself in a 360 px frame, in the lesson's band look and the reviewer's language
  (Dari readers see Dari, Pashto readers Pashto; others switch). Under it: "Play the recording" where there is one
  (OK waits until it has played), "No recording yet" where one is needed, OK and Change; Change shows the chips
  (spelling, Afghan word, maths, picture, audio, too hard, unsafe) and a comment box. Tags "changed" and "OK last
  time"; "Next changed step" skips the rest.
- After the last step, one page for the worksheet ("Open the sheet", and its key with each item's hints), the link
  cards and the sources. It needs its own OK, since its hash is part of what is signed.
- "Sign this lesson" shows the short hash, the role, the initials and the date; "Hold to sign" fills over 3 seconds.
  If any step asked for a change, the button is "Send my changes" (the notes are already saved).
- Not built (open look questions): "Print for review" (the paper list) and "signed on paper"; speakers on the staff
  page; the admin's view of review notes (P21); the frame is a fixed 640 px tall.

## What P19 built, and where it differs

- The school day is on wherever her cohort's timetable lists her band (p1 to s2) and she has not switched it off;
  unset counts as on (C2.4). Home's first offer is the one-time card "Your school day": "Yes, Qalam is my school"
  (primary, bell icon) and "I go to school" (outline, bag icon; "I go to school: Homework help" where Homework help
  is on). In p2 the card's lines are read on open; p1 has a speaker per button.
- The Now card replaces the continue card while the day is on. Before school: "School starts at 8:00" over the first
  period's lesson. In a period: "Period 2 · 8:45–9:25", the subject and lesson, the play button, "Lesson, then
  practise on paper" and the day's progress bar ("3 of 8 today"). The opening says its times; the break shows a cup and "Break
  until 9:40", no play button; sheet time shows today's sheet button; after the close, or on a day with no school,
  the next lesson as the continue card would show it. In bold bands the play button sits under the kicker, as on
  the continue card.
- Today's timetable lists every block with its time at the row's start, a subject badge or the block's icon (bell,
  cup, sheet), the title, a tick once the block is over or its lesson done, and "now". A period whose subjects have
  no lesson left says "Lesson". "All subjects" opens a new screen, `#/subjects`, with the band's usual subject list or
  tiles. In bold bands the rows are tiles, one per row, each with its speaker in p1.
- A bell button sits in Home's header between the page speaker and the hub chip while the day is on (bell or bell
  with a stroke); Settings has School day, Bells and Start time (earlier or later by 30 minutes, up to two hours).
- At each bell: the sound, a toast ("Period 2: Maths"), and Home moves on. The clock is in her digits, with "in the
  morning" or "in the afternoon" only when the day crosses noon.
- Open look questions: the Today list's tick on a past period that had no lesson; whether the Now card should say
  more at the close than the next lesson; the bells' sound (Qalam's own tones, placeholders a musician may replace);
  a wake-up line in the app (the wake-up is only the Android app's alarm, 30 minutes before the start).

## What P20 built, and where it differs

- `/teacher/` is its own page in the clean adult look, English or Dari (the Dari strings are drafts for a native
  speaker's check; since C5, English, Dari or Pashto through the staff picker, remembered per device), with four tabs: To do (with a count), Class, Lessons, Wishes. On the hub it opens with the
  teacher's PIN, kept in the page's memory only; online Cloudflare Access signs her in and "Sign out" ends the Access
  session. Offline it says "Connect to see your class" and keeps nothing.
- To do shows one card at a time, "1 of 3" at its top right, Previous and Next under it, and the keys hint below
  (S send, E edit, D don't send, J and K move). A card shows its kind as a tag (Needs care, Held answer, Held hints,
  Question) and how long ago it came, never who asked: questions stay anonymous on the hub, so the card cannot show
  an alias. A needs-care card has a red border and shows what Qalam told her. A held card shows the answer or the
  three hints, then "For you only": the worked answer, maths checked or not, and whether the hints pass the leak
  check. Edit opens the text (or three hint boxes) in place; Don't send opens the four reason chips.
- Class: four tiles (active this week "3 of 12", lessons finished, sheets checked, questions), then the aliases
  sorted by picture and number, each with band, last seen, lessons this week, sheets and average, and an amber
  "needs help" tag. Her page adds her lessons, the hint steps she used and the lock reset code, shown large twice
  (Persian and Latin digits) with "Valid for 15 minutes, once." The band is shown where the spec said year, since
  the hub keeps her band, not her year.
- Print class card asks for the class code (the hub keeps only its hash), then prints an A6 card with the QR and the
  code in text through the browser. The hub card (Wi-Fi) stays, on the hub only.
- Lessons: one row per lesson in the library's order with its counts; a lesson's page draws a bar per item (right
  against wrong, with disputes and hint steps) and opens the answer sheet.
- Open look questions: whether the staff page needs speakers (it has none; staff read); the class card's size and
  whether it carries the class label; the order of the To do groups when a class has many held answers; how the
  "needs help" rule (three items still wrong after the last hint) should read to a teacher.

## What P22 built, and where it differs

- Home's last row, after the list: "+ I want to learn something else" in the accent ink at the body size, 48 px,
  with a speaker at the row's end. It also shows under "Lessons for adults are coming" for an adult reader, since
  the wishlist is most use where there are no lessons yet.
- `#/plan`, titled "I want to learn...": while a plan runs, a soft card at the top, "Your plan: Fractions, 2 of 4"
  (a Persian comma in Dari and Pashto, since a middle dot before a digit reads as a zero) with its speaker and
  "Stop this plan"; then Ask's own box (56 px, round send button), "Or pick one:" with its speaker and the unit chips
  (wrapping), then the answer. A plan: "Here's your plan: 4 lessons" and numbered rows (subject badge, title, a tick
  when done, "next" on the first not done), then "Start my plan", which goes Home with a toast. "Closest lessons":
  the same rows, with no button. A miss or a rules message: one card with its speaker (the rules'
  message on the warm fill).
- Home's continue card for a plan: "Your plan · lesson 2 of 4", the lesson's title, "Fractions · Maths" and the
  plan's progress bar, under the school day's Now card while the day is on.
- Check my sheet: with wrong items, a line under the score, "Added to your plan: Adding fractions", with a book icon
  and a speaker.
- Open look questions: whether the row should show for adult literacy as a "coming" row until spoken input exists;
  whether "Closest lessons" should also offer "Add these to my plan"; how a finished plan should say so (it stays
  until stopped and leaves Home's card); the number of chips at 360 px in bold text sizes.

## What P21 built, and where it differs

- `/admin/` as item 12 draws it: the header (title, a language chip, Sign out), a 200 px menu on the start side at
  1366 × 768 and a select at the top under 760 px; tables scroll inside their own box. Dari mirrors the page; codes,
  times and hashes sit in `.m`. English by default; the Dari strings are drafts (the rest fall back to English).
  Since C5 (change 9, C5.1): English, Dari or Pashto through the staff picker, remembered per device.
- A cohort's page: "Cohorts › Mazar class" with the two kill switches as outline `--bad` buttons at the end of the
  line; learners, bands, languages and "join code ****" with New code and Class cards. **No Show button:** the code is
  stored hashed (C3.3, P10), so it is shown once, when the cohort is made or a new code drawn, and Class cards asks
  for it to be typed. Then the module table (risk tag: none and low on the good fill, medium on the warm fill, high
  and blocked on the bad fill; the switch from Settings; a Settings chip only where the manifest has settings), one
  Settings line with Edit, one School day line with "Edit the timetable", and AI today as a bar (warm from 80%).
- Every confirm is one dialog: the question, any lines (the risk sentence, the diff, the dependencies), the confirm
  button first and Cancel. Since C5 (change 11): for a change that cannot be taken back (a new code, removing staff,
  a rollback) focus lands on Cancel; Escape cancels every dialog.
- Since C5 (change 10, C5.2): the module table speaks in words (the module's name and what it does, risk as a word,
  bands as years; the id under Details), and under 760 px each module is a card; the kill switches are a state line
  with its action ("AI is on · Switch AI off"); the class line says what Qalam can do and the class code has its own
  row with "Print class cards" and "Make a new code".
- The timetable editor is a page of its own: school-day ticks, holidays one date a line, Ramadan's shorter day (a
  tick, then from, to, start and minutes a period), then per band "has a school day", the start time and a table of
  blocks (the time each starts, worked out; kind; subject for a period; minutes; ↑ and Remove), "Add a block", and
  Save, Use the default, Cancel. Save shows the change band by band before it is sent.
- Class cards: eight to an A4 page, two columns, the QR at 34 mm and the code; the menu and buttons do not print.
- AI spend: fourteen bars a cohort in `--accent`, a warm tag at 80% of the cap. Safety: four tiles a cohort
  (distress, health, off limits, hints and sums held back), the oldest held answer and disputes.
- Open look questions: the spec's five rules kinds (distress, health, politics, religious rulings, weapons) are three
  here, since the rules screen has one "off limits" kind for the last three; whether the Log should say `what` in
  words rather than its fixed word; whether the kill switches should stay visible while the module table scrolls on a
  laptop; whether Safety needs bars like AI spend rather than fourteen-day totals; the Dari menu's width at 200 px.

## AI provider switch (17 Oct 2026)

- A cohort's page has one more card under Settings: "AI provider: <provider> · Model: <model>" with Edit, and a
  small line "OpenAI key set · Claude (Anthropic) key not set · ..." for the four online providers. Edit opens the
  usual dialog: a Provider select (first "the hub's (<default>)", then each provider by its plain name), a Model
  field (empty: the provider's default, shown as its placeholder), the line "Takes effect on the next question, no
  redeploy." and the key line; Save shows the diff for a confirm, as every setting does. Keys are never shown, only
  "key set" or "key not set". The Dari strings are drafts for a native speaker; the provider names stay in English.

## What P23 built, and where it differs

- "Is this phone yours?" is a Home card under the Now card (secondary, after "Your school day"), in the APK only:
  the question with its speaker, "Yes, it's mine" (bell icon, primary) and "No, I share it" (outline). No shows a
  toast, "Bells will ring only while Qalam is open."; Yes opens the notification explainer as a bottom sheet (the
  offline sheet's shape): a bell, "Bells when Qalam is closed" with its speaker, the line from item 15, Continue and
  Not now. Only Android 13+ asks; elsewhere nothing is shown.
- Settings → School day, in the APK: two more switches, "This phone is mine" and "Bells when Qalam is closed", and
  when notifications are off one button, "Allow notifications to ring bells" (the explainer first, or the phone's
  settings after a refusal). "Update Qalam" is its own Settings card above Credits with a primary Download; About
  shows "Android app 0.1.0" and, in an Android phone's browser only, "Get the Android app".
- "Please update Qalam" is a whole screen: a download picture, the title with its speaker, one line and Download.
  Credits stay open.
- `/get` follows item 15's drawing, a 480 px column in the clean look and the reader's language, a speaker on every
  line; the three pictures are line drawings of a phone (the file, the switch, the Install button). "For teachers"
  folds open to the file's SHA-256 and the certificate's. Before a release it says the app is not ready and offers
  "Open Qalam". The size reads in MB with one decimal.
- After a camera refusal, Check my sheet adds a text link "Open Settings" under the existing line in the APK.
- Open look questions: whether the class card should carry `/get` (item 15 says so; C3.3's card is "QR and code,
  nothing else", so it does not yet); the pictures on `/get` are drawings, not screenshots of a real phone; where the
  mine card sits when the day has no lessons yet; a launcher icon drawn for small sizes.

## What P25a built, and where it differs

- The warm-up (C4.1): a lesson opened from the big button, the Now card or the plan's card plays up to three due
  items first. The segments bar holds the warm-up's segments first (in `--warm` once reached), then the lesson's; a
  row under the header says "Do you remember? 1 of 3" (child tone) or "Quick practice 1 of 3" (adult tone, which
  bands.js gives s1 and s2 too) in `--fs-sm` bold `--accent-ink` with its speaker; the step is drawn as in its own
  lesson, Next opens after her first try, and Back is hidden until the lesson's own steps. Nothing on Home.
- Pathway cards at the top of a subject's page, before "This year": the title with its speaker, "1 lesson, 0 done, a
  certificate" (a Persian comma in Dari and Pashto) in `--muted`, the bar, and "Start" (before the first lesson) or
  "Continue" as the primary button, which opens the next lesson with its warm-up. A finished pathway says "You
  finished this pathway" in place of the button.
- "I want to learn...": the pathways come first among the chips, outlined in the accent; they and the unit chips
  share the eight (six in bold). A plan built over the graph tags each row its goal needs first with "Learn first"
  (`--accent-soft`, `--accent-ink`, the "next" tag's shape).
- One plan at a time: starting another while a plan has a lesson left asks in a bottom sheet (the offline sheet's
  shape), "Stop “Fractions” and start “Money”?", with "Stop and start" (primary) above Cancel.
- A finished plan: Home's plan card turns into "Done: Fractions" with a check on `--good-soft` and its speaker, on the
  first Home visit after; the plan clears, and leaving Home ends the line (C4 look question 26, P22's open question).
- The graph page in `/review/`: every node as a card (title and id, "Needs", "Lessons" with each lesson's band), OK
  or Change with a comment saved at once, the pathways as one more card, then the hash, role and initials and "Hold
  to sign".
- Open look questions: the warm-up's kicker sits in a row under the header, not inside the step, so the step keeps
  its centred place; "Start" on a pathway card opens the first lesson at once rather than going Home; the "Done" line
  lasts one Home visit; pathway chips are outlined in the accent to tell them from unit chips; an s1 or s2 learner
  hears the adult "Quick practice", since bands.js gives those bands the adult tone.

## What P26 and 7c built, and where they differ

- Adult Home's list is "What to learn" with its speaker, then the track rows: reading and writing in her language
  (Dari, or Pashto for a Pashto reader), everyday maths, English, Chinese and University, each shown only when she
  has lessons in it (University when its module is on). Adult literacy: one row each, 64 px, badge, name, "0 of 2",
  and a speaker at the row's end. Adult reader: badge, name, a bar, "0/2" and a chevron. A row opens its subject
  page, where the pathway cards come first.
- The switch card (secondary, once): "You can read now. Use the reader look?" with "Yes, switch" (primary) and "No,
  keep this" (outline), after the last lesson of an adult pathway in her reading subject. Either answer ends it.
- Badges: Chinese 中, University U, Quran ق and seerah س (Naskh) on the four new colours.
- 7c: adult literacy's "I want to learn..." row opens "What do you want to learn?": up to six pathway chips, one per
  row, 64 px, each with its subject's badge and a speaker; a chip starts its pathway at its next lesson (with the
  warm-up); "Someone can type it for you" in the accent ink with its speaker opens the box.
- Open look questions: the chips use the subject's badge as their picture (pathways have no picture of their own);
  the chips list every adult pathway, so a Dari reader also sees the Pashto one; the adult subject page still lists
  children's lessons under "Other years' lessons", as every subject page does; the switch card names no pathway.

## What 7b built, and where it differs

- Adult Home: "A time to study" in the school-day card's shape (title, speaker, the line, "Yes, choose a time" with
  the bell, "No, thank you" in outline), secondary, until answered. "No, thank you" stores `"off"` and it never
  returns; Settings can still switch the study time on.
- The time sheet in the net sheet's shape: "What time will you study?" with its speaker, a stepper (minus, the time,
  plus) from "7:00 in the evening" in half hours, and Save. Tapping outside closes it and the card stays. Save says
  "Study time: 7:00 in the evening" in the toast.
- During the time, Home's primary is the Now card's shape: "Study time: 20 minutes left" as the kicker over her next
  lesson with its play button (and the warm-up); the minutes move each minute while Qalam is on screen. At its start
  the start bell and the toast "Study time"; at its end the end bell and "Study time is over for today" said aloud.
- Settings → Study time: the title and "One time each day, Saturday to Thursday." with a speaker, the switch, "Start
  time" with the stepper, "Length" as four chips (15, 30, 45, 60 minutes); in the APK, the school day's "This phone is
  mine" and closed-app bell rows. In the APK, "Is this phone yours?" follows a saved study time as it follows "Yes,
  Qalam is my school".
- Open look questions: the evening words ("7:00 in the evening", new key `day_eve`) start at 17:00, since P19's two
  words would say "in the afternoon" at 19:00, and the school day's clock is unchanged; the stepper runs from 5:00 to
  22:30, so the time never crosses midnight; the study card has no picture; switching it on in Settings starts at 7:00
  in the evening for 30 minutes rather than remembering an earlier time.

## What P25b and 7a built, and where they differ

- "Your certificate" (`#/cert/<pathway>`): the back arrow to the pathway's subject, the title with the page's speaker,
  a card with the pathway's title and speaker, "2 lessons · October 2027" (the month in her language's calendar), the
  name line and its speaker, the box (autocomplete off, no `name`, in no form), "Qalam does not keep this name. It is
  printed, then forgotten." in `--muted`, then "Print or save" (warm, full width, printer icon) and the number in
  small muted text. On the hub with its printer: "The hub prints it with an empty line. Write the name by hand." in
  place of the box, and the button says "Print"; a toast says it went to the printer.
- "Get my certificate" (outline, printer icon) on a finished pathway's card under "You finished this pathway", and on
  Home's Done card under "Done: ..."; "My certificate" once she has it.
- The paper as drafted, with a double frame; on the hub's PDF the inner line is missing (the PDF maker has no outline).
- `/v/<id>`: "Check a certificate" with its speaker, the three language chips, "Number QC-…", then the found line in
  bold and the names line, each with a speaker; or "We can't find this number. Check it and try again."
- 7a: the admin's module table says "waits for the pilot's four numbers" or "off in open in 2027" beside a locked
  switch, and under the table for `open` what the gate still waits for, or the budget rule once it is passed.
- Open look questions: the Solar Hijri month printed is the one holding the 10th of the Gregorian month, since the row
  keeps no day (October is always Mizan); the Pashto word for certificate (`تصدیق‌لیک`) and the Afghan month names are
  drafts; the paper has no Qalam mark or picture; the certificate screen shows no preview of the paper; the hub's
  print sends one copy and asks no PIN (it counts against the phone's copies an hour).

## What P27a built, and where it differs

- A taught word sits under the picture in its own row: English left to right in `--fs-xl` × 1.25 bold; Chinese as
  characters (Noto Sans SC subset, `--fs-xl` × 1.9) over the pinyin, with a 24 by 15 px line in `--accent-ink` above
  each marked syllable (level, rising, dipping, falling; the tone's name as the syllable's title). Its speaker plays
  the recording only; without one, the toast "This word is not recorded yet".
- An English letter (`script: "latn"`) is the 150 px letter in Vazirmatn bold, left to right, then the picture, then its
  English picture word with the speaker, then the instruction with its speaker.
- A listening `choice` (`hide`) shows one large speaker in place of the word, above the question; without `hide` the
  word row shows.
- "Say it" draws the mic only where the phone can record and keep it in memory (a secure browser page); in the APK and on
  the hub's plain http the step is the word, the speaker and "Your turn", with no mic.
- Chinese for s2 joins the subject list after the school subjects, only for a learner with lessons in it; adults reach
  English and Chinese from the track rows as P26 built them.
- Open look questions: the big button never starts a Chinese (or, later, Quran or seerah) lesson on its own, since a
  chosen subject waits for her tap; the tone line sits between the characters and the pinyin rather than over the
  characters; the Chinese and English lesson's instruction (Dari or Pashto) also plays only its recording, so an
  unrecorded draft is silent there too; Chinese lessons carry year 0, as adult lessons do, and their sheet's corner tag
  says "Starting".

## What P29 built, and where it differs

- **The reader** (`#/quran`, module `quran`, for s1, s2 and adult readers; reached from a "Read the Quran" row at the
  end of the subject list): a search box ("Surah name or number, or 2:255": a number, `surah:verse` in either digit set, a
  surah's name as Tanzil writes it, or one word of the translation), her last place as a soft card, then the 114
  surahs as subject rows (number badge, Tanzil's Arabic name in Amiri Quran, the transliterated name and the verse
  count). The draft banner sits under the top bar until the scholar signs.
- **A surah** (`#/quran/<n>`, or `/<n>/<a>` at a verse): the name in the top bar, "Play from the top" (outline), then
  each verse: its number (left to right, muted) and its round play button, the verse centred in Amiri Quran (34 px
  bold look, 28 px clean, times Bigger text, line height 2.1), the translation in the reading font, and its notes
  folded under "Notes (n)". The playing verse sits on `--soft`; a verse opened from the search has a `--line` edge.
  The credit lines and Tanzil's notice (folded) end every surah, in English, left to right.
- **The voice rule (C4.7, question 6):** a verse and its translation never take the phone's voice. They carry class
  `scripture` and `data-voice="none"`; the page speaker skips them, and the browser check fails any phone speaker
  inside them (a translation's speaker is allowed only when it plays a native speaker's recording, `data-recorded`).
  A verse without a recording here says "This verse's recitation is not here yet" in place of its button.
- **An `ayah` step** in a lesson: the surah's name and verse number, the verse (big), its translation with the
  recorded speaker where the lesson has a clip, then "Listen" (primary) and "Repeat after" (outline, repeat icon:
  the verse, then a pause as long as it, three times, the button counting "Repeat after: 1 of 3"; nothing is recorded).
- Search runs in the phone's code only, over the surahs she has opened; "Search every surah" downloads the rest
  first (about 4 MB). The service worker keeps each surah and recitation once fetched (`quran-v1`), never the whole set by default.
- The admin's module table shows the `quran` switch locked with "locked until a Hanafi scholar signs the Quran set" until the
  set is signed; a release hub serves nothing of it till then.
- Open look questions: the reader's entry is a row at the end of the subject list, not a Home card; the verse number is
  Latin `s:a` rather than an ornamented end-of-verse mark (the font's marks would be the scholar's call); the
  translation shows under every verse rather than behind a tap; the playing verse is shown by `--soft` only, with no
  word-by-word highlight; "Repeat after" pauses as long as the verse, with no setting; the credit block is English
  only (the publishers' own wording); Husary (64 kbps) stands in as the reciter until the scholar names one; the draft
  banner's words are drafts for native speakers like every new Dari and Pashto string.

## What P28 built, and where it differs

- **The row:** "University" with the U badge (`--s-university`), the last row of s2's subject list before the Quran
  reader, and among the adult reader track's rows; it opens `#/university`.
- **The screen** (`#/university`): "Getting ready for university" in the top bar, the draft band while anything is
  unsigned, then "Steps you can take. Qalam can't promise a place or a scholarship." (`--muted`) with its speaker;
  "Your steps: 3 of 8" in bold; the eight steps as rows with a 32 px tick box (`accent-color: --accent`), the step's
  words, a 44 px round chevron where the step opens a subject (maths, English), and a speaker; under them "Your ticks
  stay on this phone." Then the cards under section heads with speakers: Courses, Tests, Scholarships, Advice (a head
  only where it has cards). A card is C2.6's card plus "Who: ..." and one line of facts: the cost in bold and
  "Checked: October 2026" muted. The screen ends with the warning "Never pay anyone to apply. Apply only on the
  official site." in bold `--warm-ink` on `--warm-soft` with a 4 px `--warm` edge and its speaker. Offline the
  checklist works from the phone's copy and the cards say "The cards need the internet."
- No event for a tick, a card opened or the screen visited.
- **The review page** for a card set: the checklist as one item, then each card with its facts and "Open the page";
  OK stays grey until the page was opened from there.
- Open look questions: the cards' first head says "Courses", not "Free courses", since University of the People
  charges fees; the warning closes the screen rather than staying fixed on it; "Checked" gives the Gregorian month
  with its Afghan name (Mizan is not used, as the card's date is the site's own); a step's chevron opens the subject
  page, not one pathway; no card of kind `test` yet (no free test page was verified), so step 3 has no cards; the
  checklist's count has its own speaker on top of the page speaker.

## What P32 built, and where it differs

- **Off everywhere.** Module `made` has no seed row; an admin turns it on per cohort (`free.text`, medium: the
  admin confirms). `share.cohort` is in the core's table as blocked, with no route or screen, and is **not** in
  `made`'s manifest: listed there it would make the whole module blocked without paid-human moderation, so layers 1
  and 2 could never be turned on. It belongs to the 2028 module (or `made`'s next version) that shares.
- **Entry:** the lesson's end offers "Make a question about this lesson" (`lesson.end`, priority 5, an outline button,
  none for Quran or seerah, none once she has 50); each subject page ends with the row "My questions" (accent badge
  with a pencil, "3 questions"). Nothing on Home.
- **`#/made`:** "My questions" in the top bar; "Your own questions stay on this phone. They come back in your
  warm-ups." with its speaker; "+ New question" (primary); her questions newest first, each a lined card: the
  question in bold with a speaker, "Answer: ..." and "Why: ..." small, the lesson's title muted, then her status
  line: nothing before she sends it, "Waiting for your teacher" (clock, muted), "Your teacher checked it and it is
  right" (check, `--good-ink`) or "Your teacher asks for a change" (pencil, `--warm-ink`) with the chips in small text
  and the teacher's note; "Ask my teacher to check" (outline, send icon) where she can send; "Delete", which asks
  "Delete? Tap again" on the first tap. Verdicts are fetched when she opens the list and something is waiting.
- **`#/made/new[/lesson]`:** three labelled boxes with speakers (question, its answer, "why (if you like)"), 300
  characters each, "Words only. No names, phone numbers, emails or web addresses.", and Save, grey until both the
  question and the answer have words. A name, seven digits, an email or a web address shows the warning in
  `--warm-ink` on `--warm-soft` and keeps Save grey.
- **Warm-ups:** her due questions fill what spaced review leaves of the warm-up (at most `recall.WARM` in all), never
  one from the lesson being opened: "Your own question", the question with its speaker, "Show the answer", then the
  answer (and why) in an `--accent-soft` box with "I knew it" and "Not yet", which enables Next. "I knew it" brings it
  back in a week, "Not yet" tomorrow; nothing is recorded or sent.
- **Teacher's To do:** "Made by a learner" last, with the header "... · Made 2"; her question, answer and why as she
  wrote them; "Looks right" or "Needs a change", which opens the five chips and "A short note for her (optional)"
  with the placeholder "Don't give the answer". A note holding her answer is refused (the hub's leak check), and a
  name or number in it is scrubbed.
- Strings: Dari and Pashto are drafts for native speakers (app i18n and the teacher page's Dari).
- Open look questions: the status lines are words with an icon, not the spec's badges; the card shows "Ask my
  teacher to check" only before she sends it, and nothing lets her send a changed question again (she makes a new
  one); the warm-up's self-marking uses plain buttons, not the sheet's tick and cross; "My questions" shows on every
  subject page but Quran and seerah, even with none made; the teacher's keyboard hint still names S, E and D, which
  do nothing on this card; "my name is ..." is caught in English, Dari and Pashto only by a few fixed phrases.

---

# C2 and C3 decisions

The design committee's note on sittings C2 and C3, as the chair wrote it (model names left out). Builders code from it
and from the accepted specs in [DESIGN-C2C3-SPECS.md](DESIGN-C2C3-SPECS.md); where they differ, this note wins. The
changes it makes to the C1 text above (2, 3, 5 and 6, and C2.5's banner rule) are already applied there. Real
pictures (Mo's images, redrawn as line art for printing) still arrive with Pack 1.

The chair and one member (the member's draft, the specs below, is filed as `DESIGN-C2C3-SPECS.md`). 16 October
2026, held with C0 and C1. No web checks: the draft's one check (Android developer verification) agrees with what the chair knows, and
no other item turns on a contested fact. "Accept" means the draft's spec for that item is the builder's spec, with
the notes here applied; the draft's opening "Rules every spec below assumes" stand. The builder copies the draft into
`tutor/docs/DESIGN-C2C3-SPECS.md` so the repository holds it. English strings are drafts until native speakers check
them. Nothing here needs Mo before 22 December 2026; one decision, D11, is added for after it.

## C2

| # | Item | Decision | Why | The builder must |
|---|---|---|---|---|
| C2.1 | Sheet layout (P13) | **Accept** (draft item 1). | Four squares and a slot grid make every cell a function of the item list, so hub PDF, browser print and phone agree; a check digit refuses a mistyped code instead of marking it against another sheet; no app name, URL or cohort on paper fits the seized-paper threat. | P13 as drafted. The QR holds text, never a URL. Write the final height table into DESIGN.md. "Do it on screen" is offered only where there is no printer, after "Print or save as PDF". |
| C2.2 | Camera and "what I read" (P14) | **Accept** (draft item 2), two notes. | A phone that says "closer" and "hold still", then takes the photo itself, gets a usable strip first time; a model that never sees the key cannot "read" the answer into a blur; the frame and strip live in variables only. | P14 as drafted. Note 1: "the server never learns right or wrong" is true of the photo route only; `check.item` events still carry results, as `check.done` does today. Note 2: in bold, each "What I read" row wraps to two lines (number, tile, reading; then the question) so 360 px stays readable. |
| C2.3 | Results and the hint ladder (P15) | **Accept** (draft item 3), two clarifications. | She corrects misreads before anything is judged; three free rungs, the last one move from the answer, keep "hints, never answers" without a wall; "Check my answer" marks, it does not tell. | P15 as drafted. A value answer appears on no learner route: the answer page is on the hub behind the teacher PIN and online inside `/teacher/`. DESIGN.md's "Wrong answers teach: the right one is shown" bullet is superseded (change 3). The pilot report reads rung-3 and dispute rates from `hint.rung` and `check.dispute`, so a stalled self-learner is seen. |
| C2.4 | Home for in-school and out-of-school learners | **Amend:** the day is on by default; the card confirms or switches. Spec below. | Mo's default is "on"; a default everyone in the cohort gets says nothing about her on a seized phone, while a chosen `day: on` said more; one tap still switches. | Build the replacement spec in P19 (the card is the timetable module's offer). |
| C2.5 | Offline and "waiting to send" signs (P11) | **Accept** (draft item 5). | Hidden when all is well is the least busy sign; badges only on what she sent keeps events invisible. | P11 as drafted; `netChip()` replaces `hubChip()`. The C1 rule becomes "banners only for draft": offline is a chip, never a banner. |
| C2.6 | Link cards and Credits | **Accept** (draft item 6), one line. | One card says whose it is, that it leaves Qalam and what it costs in data; no embeds means no third-party player inside a girls' app; voices are anonymous by default. | A named voice credit needs the recorder's written request and goes in `app/credits.json`; clip manifests keep a speaker code, never a name (P8). The card look lands with P9's tokens; the Credits screen with P10's Settings. |
| C2.7 | Early years modules | **Accept** (draft item 7). | One play button and a voice; the grown-up looks at the paper. | `ey` leaves the `bands` of `photo`, `homework`, `timetable` and `plan`; the provisional decision-log row becomes final. |
| C2.8 | The `open` cohort | **Accept** (draft item 8). | Every module left on is safe with no person behind it; Ask's maths path gives answers and its distress path promises a person, so it waits for a teacher or a budget. | `cohorts/open.json` as drafted; staging keeps everything on. `plan` carries `free.text`, so the consent screen comes before the first Learn this (C1.4). D7 stays Mo's. Revisit at C4. |
| C2.9 | P9 screenshots | **Accept the checklist** as P9's deliverable. | Nothing exists to look at yet; a contact sheet with the contrast numbers beside each shot is what a look-over needs. | `build-committee/p9-screens/index.html` as drafted. The chair looks it over by thread when P9 lands; no sitting. Failures return to P9 before P10. |

## C3

| # | Item | Decision | Why | The builder must |
|---|---|---|---|---|
| C3.1 | The school day and bells (P19) | **Accept** (draft item 10), with C2.4's default. | Mo's "alarms on by default" is met as far as a web page can: bells ring by default whenever Qalam is on screen; closed-app alarms belong to the APK, on by default once "This phone is mine" is yes (F5). Web Push is refused: it needs a per-phone subscription on the server and Google's relay, and could ring in the family's hands. | P19 as drafted. Unlock audio on the first tap, as `speech.js` does, or the first bell is blocked. `subject: "auto"` takes the plan first. The kill switch stays silent. |
| C3.2 | The teacher dashboard (P20) | **Amend:** `staff` holds no email. Spec below. Everything else as drafted. | The facilitator's and reviewers' emails would be the only real identities in D1 and its weekly export; Cloudflare Access already holds them. | `/teacher/` as drafted: one card at a time, no names, nothing cached on the teacher's phone, the 6-digit code; `teacher` loses `needs: pin` for a gate per host. |
| C3.3 | The admin panel (P21) | **Accept** (draft item 12), with C3.2. | Kill switches at the top, a risk sentence on every toggle, every change logged with who; the hub's admin PIN is separate from the teacher's. | `/admin/` as drafted. The Staff page shows labels, roles and cohorts; an email is typed only to add someone, then discarded. |
| C3.4 | The review screens (P17) | **Accept** (draft item 13). | A step seen in the learner's look with its recording, OK only after the clip has played, catches what a table would miss; the signature voids itself on one changed word. | `/review/` as drafted; `review_notes` and `signoffs` as drafted. |
| C3.5 | "I want to learn this" (P22) | **Accept** (draft item 14). | The row sits exactly where the list ran out; typed only, because Chrome's speech input sends audio to Google (OpenAI-only). | `homeFooter()` in the shell, not a slot. BUILD-PLAN 5.1's "typed or spoken" is typed only in 2027. |
| C3.6 | The Android app (P23) | **Accept** (draft item 15); D11 framed below. | Three pictured steps and prompts at first need, each after an explainer, are the least a sideload can be; no storage, microphone, contacts or location; the launcher stays "Qalam", because a disguised app found is worse. | P23 as drafted. Pilot phones are installed by facilitators over USB. The web app in Chrome does everything but closed-app alarms, so no learner depends on the APK. |

## Replacement specs

### C2.4 Home for in-school and out-of-school learners (replaces the spec of draft item 4)

- `day` is on by default for bands `p1` to `s2` wherever the cohort's timetable template lists her band; unset counts
  as on. `ey` has no school day; adults have a study time, off until they say yes (C4, change 4: C4.10). The phone stores `day: 'on' | 'off'` per learner and nothing
  about school; nothing is sent and no event is recorded.
- The first time Home shows the Now card, the timetable module offers one card (`home.action`, role secondary, top
  priority) and keeps offering it until it is answered:

```
+- Your school day --------------------- [spk] -+
| Qalam is your school: lessons at set    [spk] |
| times, with bells.                            |
| [ (bell) Yes, Qalam is my school ]      [spk] |  full width, primary
| [ (bag)  I go to school: help me with   [spk] |  full width, outline
|          homework ]                           |
+-----------------------------------------------+
```

- Primary: the card goes and the day stays on. Outline: `day: off`; Home becomes the band's default with Homework
  help as secondary. When Homework help is unavailable (`homework` off, offline, or no AI for her language) the outline
  reads "I go to school already" and Home becomes the band's default. There is no "Not now": a card she ignores leaves
  the day on.
- Home per band: the draft's table and mock-up stand, with two rules. In bold bands the Now card keeps the 100 px play
  button under its kicker, so a six-year-old still sees one big button; the tiles stay subject tiles, in today's order,
  with the time on each.
- The bell toggle, Settings → School day and right-to-left: as drafted. The header toggle is P19's "off in one tap".
- Says: the card's lines, read on open in bold bands; "Bells on" and "Bells off".

### C3.2 The `staff` table (replaces the `staff` lines of draft items 11, 12 and 13)

- `staff (email_hash, label, role, cohorts, initials)`. `email_hash` is SHA-256 over a server-side pepper (config,
  never D1) and the lower-cased email. `label` is neutral and chosen by the admin ("Teacher A", "Dari reviewer 2").
  `initials` are the reviewer's, as P8's signoffs already carry.
- The Worker hashes the Access JWT's email and looks it up; no row means "Ask the admin to add you". On the hub the
  PIN gate gives the role, and no row is needed.
- The admin's Staff page lists labels, roles and cohorts. "Add" takes an email, hashes it and discards it. The Access
  policy at Cloudflare, kept by the admin, is the only place the emails live.

## The ten changes to settled text

| # | Change | Decision | Note |
|---|---|---|---|
| 1 | P19: no web notifications; bells only while the page is on screen | **Accept** | F5. Mo's default is met on screen and in the APK (C3.1). |
| 2 | C1's motion rule gains the reading ring | **Accept** | The consent ring's component; `prefers-reduced-motion` removes all three. |
| 3 | `check.js` loses "Show answer" for value items | **Accept** | DESIGN.md's bullet becomes: "Wrong answers teach: three hints (the lesson step, a worked example with other numbers, the first move), read aloud for young children, never the answer. The answer page is the teacher's. No scores to lose, no timers. Stars for children; 'Correct, 8 of 10' for adults." |
| 4 | `/api/m/photo/mark` returns readings only; the phone marks | **Accept** | BUILD-PLAN 3.5's row becomes "code, seed, lang, the strip → a reading per cell; no marks, no hints; the phone marks against the cached key". |
| 5 | The sheet code gains a Damm check digit; no app name; no per-item working boxes | **Accept** | DESIGN.md "Paper first": the example becomes `M7-03-48217`; add "no app name, URL or cohort on a learner sheet". |
| 6 | A `sheets` module splits from `print`; the third tab is Print on the hub, Sheets online | **Accept, shaped** | `sheets` holds the sheet document, the keys, "Get the sheet" and the lesson-end card; `print` depends on `sheets` and adds only the hub's print queue (`needs: printer`); `photo` depends on `sheets`. One set of screens, two manifests. DESIGN.md's "Three tabs only" reads "Lessons, Ask, and Print (hub) or Sheets (online)". |
| 7 | The shell gains one fixed footer row on Home for `plan` | **Accept** | `homeFooter()`; not a slot; nothing else may use it. |
| 8 | Staff pages at `/teacher/`, `/admin/`, `/review/`; `teacher` loses `needs: pin`; a `staff` table | **Accept, amended** | `staff` as C3.2. `TUTOR_LACKS` keeps `pin` online, but no manifest names it: the gate is per host. |
| 9 | The `open` seed; `ey` final | **Accept** | Supersedes the provisional row of 16 October ("all five modules on for `open` and `staging`"): staging keeps all; `open` as C2.8. |
| 10 | The learner record stores `day: on\|off`, never whether she is in school | **Accept, amended** | Unset counts as on where the template lists her band (C2.4). |

## What needs Mo, and when

- **D11 (new): Google's Android developer verification.** Register Qalam's package and signing key, and under whose
  identity: Mo's own, or the organisation's once it exists (an organisation account needs a D-U-N-S number; a personal
  one ties Mo's name to the app in Google's records). Earliest 23 December 2026; needed by 31 July 2027, before any
  install beyond the pilot. Default: no registration during the pilot. Facilitators install pilot phones over USB,
  which the verification does not block, and everyone else uses the web app, which lacks only closed-app alarms.
- Nothing else. The school day on by default is Mo's own plan, not a new decision. D7 (open sign-up) keeps its date;
  until it is decided, `open` runs with AI off, so "open to all" costs nothing it cannot afford.

## For the build plan

- **Sittings:** C2 and C3 held 16 October 2026 with C0 and C1; this note. P9's look-over is a thread review, not a
  sitting. C4 (July 2027) adds: photo and homework for `open` with budgets; an adult study time; spoken goals.
- **Section 2:** the `s2` row's "plus Learn this" becomes Home's last row for `s1`, `s2` and `ad` reader; the
  "School day or Homework help" rule reads "the school day is on by default wherever the cohort has a timetable; one
  card on Home switches to Homework help; `day: on|off` stays on the phone".
- **3.2:** slots unchanged; `homeFooter()` is the shell's. Manifests: `sheets` new; `print` and `photo` depend on it;
  `teacher` drops `needs: pin`; `ey` leaves `photo`, `homework`, `timetable`, `plan`.
- **3.4:** add `staff` (C3.2) and `review_notes`. **3.5:** the photo row (change 4); `GET /api/m/timetable?cohort=&band=`
  without a token; `/teacher/`, `/admin/`, `/review/` pages behind Access, PIN on the hub; `/get` and the APK asset.
- **5.1:** typed only in 2027. **5.3:** add "no learner route shows a value answer; 'Check my answer' three tries".
  **5.4:** add "staff emails live only in Cloudflare Access; D1 holds a peppered hash".
- **P1 seeds:** `open.json` as C2.8. **P2 shell:** the third tab per host; the footer row; `netChip()`.
- **P9:** deliverable `p9-screens/index.html` with the 13-point checklist; failures fixed before P10.
- **P10:** the Credits screen as C2.6. **P11:** `netChip()`, the queue rules and empty states; no offline banner.
- **P13:** C2.1; the `sheets` module; the Damm code; "Do it on screen"; the layout tests; final heights into DESIGN.md.
- **P14:** C2.2; the route returns readings; the `read_sheet` prompt never carries the key.
- **P15:** C2.3; `show_answer` removed; Homework help as `#/ask?hw=1`; `check.item`, `hint.rung`, `check.dispute`;
  cached hints leak-checked when the key is made.
- **P17:** C3.4. **P19:** goal text loses "web notifications while open"; C2.4's default and card; C3.1's audio
  unlock; `app/audio/bells/*` in sources.json.
- **P20:** C3.2; `/teacher/`. **P21:** C3.3; `/admin/`; the label filter; a Staff page without emails.
- **P22:** C3.5. **P23:** C3.6; `/get`; the permissions table; USB installs for the pilot.
- **9.2:** add D11. **9.3:** one row for C2 and C3, source this note.
- **DESIGN.md:** replace "Still to design" with this note as "C2 and C3 decisions"; apply changes 2, 3, 5 and 6 to
  the C1 and "Ease of use first" text; the draft's specs are the builder's detail, filed as
  `docs/DESIGN-C2C3-SPECS.md`.

## P9 look-over

Thread review, 16 October 2026, as C2.9 set it: 13 of the 65 shots against the 13-point checklist (ey light and dark;
p1 light and dark; s1 in Pashto and in English; s2 with Bigger text; adult literacy light; adult reader dark, and
light at 1280; p2 dark at 768; the subject page for p1, and for s1 with Bigger text), and the three reports read for
all 65. The reports stand in for the contact sheet: no shot has a problem, and the lowest text contrast is 4.6:1 in
light and 5.42:1 in dark. Items 1, 2, 4, 8, 10, 12 and 13 pass on what was shot; 3, 5, 6 and 7 fail somewhere; 9
could not be checked; 11 is interim. The fixes are listed at the end, and P9 is not done until they land.

- Item 3 fails on p1 and p2: the Who chip's placeholder circle is `--warm`, so Home shows a second warm thing beside
  the one warm action. Item 5 fails everywhere: one page speaker per header, and the subject page has none at all
  (its header is a plain `topbar`). Item 6 fails in ey: `readPage` speaks the whole of `#app`, so the listen button
  reads the draft band and "Connected" to a four-year-old. Item 7: adult literacy's "Lessons for adults are coming"
  is Vazirmatn, not Naskh (`.lead` has no `--read-font`). Item 9: there is no Pashto with Bigger text, and nothing at
  360 px (the shots are 390, 768 and 1280). Item 11: the chip shows the year digit, or a book, until P10's alias
  pictures; neither is an initial or a name, so it passes for now (ruling 4).

**Rulings on the nine questions**

1. **Speakers.** One page speaker is enough where learners read: s1, s2, adult reader, and p2 by C1's "a speaker
   elsewhere". It is not enough where Home is read on open. In p1 and adult literacy the owner's rule stands as
   DESIGN writes it: a 44 px speaker beside every worded button, as C2.4 draws it, and at the end of every subject
   tile and track row, which go one per row so it fits; a tab says its label as it switches. The page speaker stays
   in every header, the subject page's included. ey is right as it is: nothing there is worded for the child.
2. **Link card, source note, Credits.** C2.6 settles all three: the card, the lesson-end note and the Credits screen
   as drawn there, in P9's tokens. P9's plain `.linkcard` and `.credit` cards are the base; the tag, the data line
   and the offline state come with the phase that builds `link` steps, and the Credits screen with P10, as C2.6 says.
3. **Credit lines in the learner's language: yes,** for every word Qalam writes: the heads, "all rights are theirs",
   "a native Dari speaker", "shared with permission" and the `changes` text, through `i18n.js` or a per-language
   field. An owner's name, a title and a licence name stay exactly as the owner wrote them (`exact_attribution`).
   The row's speaker reads it all in `getLang()`, not `'en'`.
4. **The Who chip until the alias picture:** the year digit, or the book for adults, as now, but on `--accent-soft`
   in `--accent-ink`, never `--warm`: warm is the one action's. Never an initial, a nickname or a photo. P10's alias
   picture replaces it.
5. **Bigger text and Theme before P10:** two rows in Who is learning, under the learner rows and above the Teacher
   and Credits links: "Bigger text" as a switch, "Theme" as three chips (Phone, Light, Dark), each row with a
   speaker. Nothing in any header. P10 moves them into Settings unchanged.
6. **The 2-second press** should show that it is working: pressed-down from the first touch, the lock's ring filling
   over the 2 s with the consent ring's component (a plain pressed state under reduced motion), a short vibration
   where the phone has one as Who opens, and a cancel when the finger lifts or leaves early. It is a mis-tap guard,
   not a lock: "hold it" may teach a child to hold, and nothing behind it harms; removing a learner stays behind the
   PIN.
7. **Invert and hue-rotate in dark: yes, for line art only.** The P8 importer's line art comes out as light lines
   with any accent colour near its own, which is what we want; a photograph, a coloured picture or an alias picture
   is never filtered and keeps its colours on the dark page. The importer marks line art (`line: true` on the
   picture) and only that takes `--picture-filter`.
8. **The draft band in early years: shown, not spoken.** It tells the grown-up or tester holding a staging phone
   what the phone is, and they can read it; it is never on a pilot phone. `readPage` skips the draft band and the
   net chip in every band.
9. **Subject colours in dark: accept.** White on each of the five is 4.5:1 or better (5.2 to 7.8), which is all the
   lightening was for, and one colour per subject in both themes keeps a badge recognisable; against the dark page
   the badges sit at 2.3 to 3.4:1, enough for a badge that always has its label beside it. DESIGN's cell becomes
   "the same in dark; white on each is 4.5:1 or better".

**P9 fixes before P10** (C2.9: failures return to P9)

- Speakers as ruling 1, and a page speaker on the subject page.
- `readPage` skips the draft band and the net chip (ruling 8).
- The Who chip's placeholder circle on `--accent-soft` in `--accent-ink` (ruling 4).
- `.lead` takes `--read-font`, so adult literacy reads in Naskh at 22 px.
- Shots at 360 px, not 390: Home in Pashto with Bigger text for every band, and a lesson step, Ask, Print and Check
  for one band per look and tone; the reports' JSON is the contact sheet, and no `index.html` is needed. Welcome,
  consent and lock wait for P10, which rebuilds them. The chair looks at the new shots in this thread.

---

# C4 decisions

The design committee's note on sitting C4, as the chair wrote it (model names left out). Builders code from it and
from the accepted specs in [DESIGN-C4-SPECS.md](DESIGN-C4-SPECS.md); where they differ, this note wins. The changes it
makes to the C1 text above (4, 6, 7 and 12) are already applied there, and the look-question answers that change a
built screen are built (the BUILD-PLAN decision log says which, and where).

The chair and one member (the member's draft, filed as `DESIGN-C4-SPECS.md`). 17 October 2026, held early and
batched as C2 and C3 were (the calendar put C4 in July 2027). Whatever turns on the pilot is written here as a gate
with its numbers, so the pilot report opens a gate or keeps it shut and nothing comes back to a sitting. No web
checks: every licence this sitting turns on is already recorded in `content/sources.json` (16 October), and the two
the draft could not confirm (the King Fahd Complex's grant, IslamHouse's terms) are ruled not bundled, which needs no
check. "Accept" means the draft's spec for that item is the builder's spec with the notes here applied; the draft's
"Rules every spec below assumes" stand. Where the two differ, this note wins. English strings are drafts; every Dari
and Pashto line is written and recorded by native speakers. P30 (live audio) and P31 (competitions) are out of scope,
gated on D9 and the legal opinions; the draft's section 9 hooks are noted for the record and nothing of them is built.

The rules this sitting applied to every item, beyond C0 to C3:

- Hints, never answers: no new screen shows a value answer, and "I heard" is never "Correct".
- No name, nickname, alias number or band on any new server row; a name is typed only on the certificate screen,
  kept in one variable, and gone when the screen closes.
- Learner AI only through the gateway: `openai` online, `local` on the hub, `fake` in tests; never Claude or Gemini.
- No child's voice leaves a phone: anything that sends audio is for adults only, enforced in code, not policy.
- No synthetic Dari or Pashto voice; scripture takes no phone voice at all.
- Ease of use above all: the fewest options on the path, the rest in Settings; content copied only where its licence
  allows copying, and an unconfirmed licence is no licence.

## C4

| # | Item | Decision | Why | The builder must |
|---|---|---|---|---|
| C4.1 | P25a: skills graph, plans, spaced review, pathways | **Accept, amended:** the graph maps nodes to lessons; mastery simplified. | Only a reviewed graph lets a plan say "learn this first" without a model inventing the order; a warm-up puts review where she already taps and adds nothing to Home; a mapping kept in the graph leaves Pack 1's signatures whole. | Replacement spec C4.1. `recall` on in `open` and in new cohorts, the pilot cohort after its report; no learner setting; `recall.item` only with consent; none in `ey`, none from Quran or seerah lessons. `plan_ai` off everywhere; the model picks node ids from a list and writes nothing she sees. |
| C4.2 | P25b: certificates | **Accept, amended:** earned from her own events; `band` dropped and the day becomes the month; the paper carries Qalam's name and the check address. | Reading her events makes the paper mean "did it"; a row with no token hash, name, band or day cannot be tied to a learner on a seized server; a certificate exists to be shown, so it must say what it is, and she chooses whether to print it, which a daily sheet never does (C2.1). | Replacement spec C4.2. On wherever a pathway with `certificate: true` is served, `open` included; the consent screen first; never for Quran or seerah pathways; not `ey`. |
| C4.3 | P26: adult tracks | **Accept** (draft item 2). | Two doors for an adult who cannot read yet, five once she can; the bold adult look P9 built, filled. | P26 as drafted. The UNESCO ELA primers are not used (no licence found: ASK, nothing copied); the money drawings never copy a banknote; the four badge colours stand (chair's check: white on each 5.85 to 7.09:1); every step of a literacy-track pack needs a recorded clip; the switch card shows once. Adult packs are released per cohort like any pack. |
| C4.4 | P27a: English and Chinese lessons | **Accept** (draft item 3, the lessons), one note on recording. | A real voice for every word she copies; no Dari-script spelling, because the recording is the model; CC-CEDICT makes the Chinese pack BY-SA and keeps NC out of it. | P27a as drafted. Hear-yourself stays as today in a browser (in memory, 8 s at most, never stored or sent) and is not a capability. The APK has no microphone (C3.6) and gains none in 2027, and the hub's plain http has none, so there the `say` step is "hear it, say it": `canRecord()` is false in the APK (the bridge says so) and no mic is drawn. Tatoeba recordings in the English pack only CC0 or CC BY, never SA. The Chinese pack stays a draft until a native Mandarin speaker records the tones. |
| C4.5 | P27b: `speak` | **Accept as a gated phase**, built last and only once its consent sentence exists. | Mo's plan says "speech input only for short known answers"; adults, English, fixed phrases and a request that never carries the phrase keep it inside the rules. But audio leaving a phone needs the consent text, a DPIA line and a measured gate, none of which exists, so built earlier it would be a dormant risk. | Replacement spec C4.5. Off everywhere and blocked in code until three conditions are met; bands `ad` only, refused by a gateway test for any other band; the online web app in a browser only. |
| C4.6 | P28: university preparation | **Accept** (draft item 4), the role settled. | Scams and false hope are the dangers; a checklist on the phone, cards that expire and words that promise nothing are the honest minimum. | No new permission: `adviser` is a reviewer role in `signoffs` like `adult educator`, held by a person Mo names; six months before a card hides; the no-promise lint; the warning on every screen; no events, no `link.open`; LINK cards only, nothing copied. Off until the first card set is signed. |
| C4.7 | P29: Quran and seerah | **Accept, with the licence gate:** confirmed sources bundled, unconfirmed ones not; the mechanism built either way and locked until a scholar signs. | Verbatim text from one verified source, a human voice and a scholar's signature are the only way religious content is right every time; an unconfirmed grant is no grant. | Replacement spec C4.7. `quran-1` is `licence: NC` (Islamic Network's audio); the King Fahd Complex stays ASK until its page is read at import; IslamHouse stays ASK and nothing of it is copied; no hadith text in 2027; the scholar picks the script and the translations; no phone voice on scripture, with a browser-check exemption. Off and locked until signed. |
| C4.8 | P32: learner-made content v1 | **Accept, trimmed:** her own questions, private and checked by a teacher; no lesson authoring and no class sharing in 2027. | Writing her own questions is strong practice that needs nobody; a lesson editor is a second product; nothing passes between learners before paid moderators exist (5.1). | Replacement spec C4.8. `made` off everywhere; `share.cohort` registered and blocked like `child.contact`, with no screen behind it. |
| C4.9 | Photo and homework help for `open` | **Accept** (draft 7a): photo after the gate, with budgets; Homework help off in 2027. | Photo marking is code against a known key and she confirms every reading, so no AI text reaches her; Homework help's hints are AI text seen by no person in `open`, and its distress path promises a teacher who is not there (C2.8). | The gate's four numbers as drafted; `daily_counts (token_hash, day, module, n)` kept two days; `per_day` 5 in `open`, 10 elsewhere; `ai_budget` from the measured cost × 1.2; Pashto sheets only once Pashto is trusted for `read_sheet`; `ask` stays off in `open`. Homework returns to a sitting with the held-answer numbers (at least 300). D7 decides whether `open` holds anyone. |
| C4.10 | An adult study time | **Accept, trimmed:** the offer asks only the time. | An adult plans her own day, and a bell in a household that may not approve is not ours to set; one choice on the path, the rest in Settings. | Replacement spec C4.10. Off until she says yes; asked once; bells only while Qalam is on screen; APK alarms only after "This phone is mine"; no events, no token; "School day off" removes it. |
| C4.11 | Spoken goals | **Accept** the chips; speech-to-text goals not in 2027. | Reviewed chips with pictures, read aloud, need no recogniser and cannot mishear; a Dari recogniser has no gate run, and Pashto has no voice to read her words back. | 7c as drafted: `homeFooter()` for the literacy track where `plan` is on; `#/plan` there is up to six pathway chips and no box, with "Someone can type it for you" opening P22's box; the mic beside the box is not built. |
| C4.12 | The 36 open look questions | **Accept 34; two differ** (3 and 12). | Each one line, below. | The list below; the fixes land with the phase that next touches each screen, none as a phase of its own. |

## The seventeen questions

1. **Speech.** Build P27b `speak` (adults, English phrases, OpenAI online), off and blocked until its gate, last in
   the order and only once the consent sentence is signed (C4.5). Hear-yourself for everyone in a browser; nothing
   records in the APK or on the hub.
2. **Certificates** are earned from her own events, so consent comes first; `band` is dropped; the month, not the day.
3. **Qalam's name and the check address on the paper: yes.** The committee's call, not Mo's: C2.1 took the name off
   sheets because practice paper lies about; a certificate is printed once, by her choice, to be shown, and is
   useless without them. Recorded in the decision log; Mo may overrule there.
4. **Spaced review** is a warm-up inside the next lesson; nothing new on Home.
5. **Recitation:** Islamic Network now, the pack marked NC. The King Fahd Complex stays ASK until the P29 builder has
   read its page at import; a reciter swap is a pack update.
6. **The voice rule for scripture: accepted.** Scripture and its translations take no phone voice; an unrecorded
   translation shows without a speaker; the browser check learns `data-voice="none"`, allowed on those elements only.
7. **Quran lessons in early years:** not in 2027.
8. **Script and translations:** the scholar picks; the Dari and Pashto readers are consulted on readability only,
   since nothing in a verbatim text can be edited; a second scholar reads what the first signed, if Mo finds one.
9. **Adult literacy's Home with two track rows until she switches:** yes.
10. **The adult study time:** off until she says yes.
11. **Homework help for `open`:** off in 2027; back with the held-answer numbers.
12. **The photo gate for `open`:** Fix used on fewer than 1 cell in 10 over at least 200 photographed sheets per
    language; no leaked answer in any rung a teacher saw; the cost of a mark measured; D7 decided. All four.
13. **University cards:** `adviser` as a reviewer role, no new permission; six months before a card hides.
14. **P32 layer 3:** no. Layers 1 and 2 only, and layer 1 is questions only (C4.8).
15. **Chinese for `s2` as well as adults, and CC BY-SA for the whole pack:** yes to both.
16. **No Dari-script spelling of English words:** yes.
17. **The splits:** yes, P25a, P25b, P27a, P27b.

## The thirty-six open look questions

1. Speakers on Welcome's heads and worded doors, not beside each digit: accept.
2. "Remove this learner" on `--bad-soft` with `--ink` text: accept.
3. The keypad: **keep as built**, 1 2 3 on top and Erase bottom left in every language. The keypad is a left-to-right
   island like a sum, and Android's own lock pad puts delete there; a learner who knows any phone finds it.
4. The chip on its own line under a long header at 360 px, the title given 6rem first: accept.
5. "Send when the hub is near", chosen by `hello.home`: accept.
6. M7-03 at 214 mm with no Working box: accept.
7. Strips of 45 to 50 KB from noisy fixtures: accept; JPEG 0.6 if real pilot phones give a median above 40 KB.
8. "This sheet?" in the clean look takes the link card's edge (`--line` at `--bw`): accept.
9. "Hints are resting for today" as specs item 3, with the lessons search; "Your teacher will look at this" only where
   `teacher` is on: accept.
10. The homework placeholder is "Type the question" in bold English; no placeholder is ever cut: accept.
11. The leak check's Dari and Pashto number words are content, the reviewers' January list: accept.
12. "Print for review" and "signed on paper": **narrower.** Print for review (the text only) is built in P29 only if
    the scholar asks for it; no signature is ever on paper, because OK waits for the clip to play.
13. No speakers on the staff pages; "Play the recording" stays: accept.
14. The admin's view of review notes is built (P21): closed.
15. The review frame at 740 px, scrolling inside: accept.
16. No tick on a past period that had no lesson; it goes `--muted`: accept.
17. The Now card at the close adds one line on school days, "Tomorrow: Maths at 8:00": accept.
18. Qalam's CC0 tones for 2027; a musician's set replaces them through sources.json: accept.
19. No wake-up line in the app: accept.
20. No speakers on the teacher page: accept.
21. The class card is A6 without the class label: accept.
22. To do: Needs care first, then held answers oldest first, then questions, then "Made by a learner"; each group's
    count in the header: accept.
23. "Stuck on 3" as the tag; "3 items still wrong after the third hint this week" on her page: accept.
24. The row for adult literacy, now, as the goal-chips screen: accept (C4.11).
25. "Closest lessons" gains "Make these my plan": accept.
26. A finished plan says "Done: Fractions" once on Home's card, then clears: accept.
27. Chips at 360 px: six at most in bold, eight in clean, wrapping, never cut: accept.
28. Three rules kinds, one "off limits": accept.
29. The Log shows `what` in words from `i18n`, stored as the fixed word: accept.
30. A sticky cohort line holding both kill switches while the module table scrolls: accept.
31. Safety as totals with today's number beside each; bars only if a pilot week shows the need: accept.
32. The Dari menu at 240 px above 1200 px, labels wrapping: accept.
33. No `/get` on the class card: accept; C3.3 stands.
34. Drawings, not screenshots, on `/get`: accept.
35. The mine card in the secondary place when the day has no lessons yet: accept.
36. A 48 px launcher drawing (the nib alone) for mdpi and hdpi: accept.

## Replacement specs

### C4.1 The graph's mapping, mastery and review (replaces those lines of draft item 1)

- `content/graph/<subject>.json` as drafted, with `nodes[].lessons: [lesson ids]` in place of a `skill` field in each
  lesson. One place holds the mapping, so a lesson's content hash and signatures do not move when the graph does, and
  Pack 1 is not re-signed. Validator: ids unique and lower case; every `needs` exists; no cycles; every listed lesson
  exists and is listed once; a lesson in no node is allowed (its plans fall back to pack order, as P22); every
  pathway's goal has a lesson for each of its bands; `final` is a lesson with a sheet. The graph is signed like
  `links.json` (its hash; a subject teacher; an adult educator where a pathway lists `ad`); `/review/` gains the graph
  page as drafted.
- Mastered, on the phone: her latest sheet for a lesson of that node at 80% or more (P20's rule); a lesson without a
  sheet, finished (`lesson.done`). Nothing else.
- Plans over the graph, the "Learn first" tag, pathways, one plan at a time with the stop dialog, the pathway card,
  the finished plan's line: as drafted. AI (`plan`) only when the search missed, `plan_ai` is on (default off; never
  in `open`, whose AI is off) and her language is trusted; the request carries the screened goal and her band's node
  ids and titles, never her token; at most three existing ids come back and anything else is a miss.
- `recall` as drafted: the items (steps marked `recall: true`, else the last two `choice` or `number` steps; three at
  most a lesson), the five boxes (1, 3, 7, 21 and 60 days), the warm-up of up to three before a lesson the big button,
  the Now card or a plan starts, drawn as the mock-up, `recall` on the phone at 300 items, `recall.item` events. P32's
  questions join it, marked by her ("I knew it", "Not yet"). No warm-up in `ey`, in a lesson opened from a hint, or
  for an item whose lesson is not on the phone.

### C4.2 Certificates (replaces the row, the request and the name lines of draft item 1)

- `certificates (id, course, version, month, cohort)`: no band, no day, no token hash, no name or name hash.
  Permanent. BUILD-PLAN 3.4's row becomes this.
- `POST /api/m/cert {path, version}` with her token, five a day a token. The server reads her token hash's events:
  each lesson of the pathway in her audience counts with a `lesson.done` or a `check.done` of 80 or more; every lesson
  must count; where the pathway names a `final` lesson its `check.done` must be 80 or more. It writes the row and
  answers `{id, month}`. There is no "find": the phone keeps `certs: [{path, id, month}]` per learner and never asks
  twice for one pathway ("My certificate" on the pathway card prints again with no request); a lost phone is a new
  token and a new id. Missing events: "Qalam can't see all of this pathway's lessons yet. Do their practice sheets
  again with sharing on, then try again."
- The screen, the id (`QC-` and ten Crockford base32 characters in two groups), the paper and its wording ("has
  finished the lessons and practice sheets of", never "passed" or a level), the hub's blank line (the print queue
  holds the course and the id only), `/v/<id>` and `GET /api/cert/<id>` (a core route, always on, no token, 30 an
  address a minute, the three languages and a speaker per line): as drafted. The QR holds the check URL; C2.1's
  text-only rule is for sheets.
- The name: a plain input (`autocomplete="off"`, no `name` attribute, in no form that submits), one variable, drawn
  into the print document, gone when the screen closes; never in storage, a URL, the title, an event, a log, a request
  or the hub's queue. `document.title` is "Qalam certificate QC-…". The browser test types a sentinel, prints, and
  finds it in no request, storage, log or title.
- Months in Solar Hijri for Dari and Pashto and Gregorian for English, both on the paper; a native speaker checks
  the month names the phone produces.

### C4.5 `speak` (replaces the manifest, host and default lines of draft item 3)

- Manifest: bands `ad` (the reader track, by the phone's rule); depends `lessons`; capabilities `audio.record` (high)
  and `ai.call`; purposes `listen`; setting `per_day` (default 20); `needs: internet`; `offline: no`.
- Where it runs: the online web app in a browser over HTTPS. Not the APK, which has no microphone permission (C3.6
  stands), and not the hub, whose plain http has none; the hub's `local` Whisper-class provider waits for a hub with a
  secure context.
- The call: `POST /api/m/speak` (multipart: webm/opus, mono, at most 4 s; `lang: en`) with her token; the gateway's
  `listen` gives the provider the audio and the language only, never the phrase, the step or her token, and answers
  `{heard}`. The audio is held in memory for the call and dropped: never disk, D1, a log or a queue, every writer
  patched in the test (P14's pattern). The phone compares `heard` with the step's `answers` (lower case, no
  punctuation, each word within one letter) and shows "That's it!" or "I heard: '…'. Listen and try again." The
  transcript is shown once and never stored or sent in an event; three checks a step, then "Let's go on."; Next is
  never blocked.
- Code, not policy: a gateway test refuses `listen` for any token whose band is not `ad`; the validator refuses a
  `say.answers` entry with a blank ("...") or a personal slot (name, age, city, phone number), so "My name is ..."
  stays hear-yourself and no name leaves a phone in her own voice.
- Her choice: the first tap of the mic shows the explainer as drafted ("…A short recording of your voice goes to
  OpenAI to be written as text, then it is thrown away."), "Yes, check my speaking" and "No, just let me hear
  myself"; Settings gets "Check my speaking"; `speak: yes | no` on the phone.
- Blocked, not merely off: the admin panel refuses the switch for a cohort unless (1) the cohort's consent version
  carries the voice paragraph (`voice: true` in its JSON, seen by the solicitor), (2) a passed gate report is filed in
  `content/blindtest/speak/` (P16's kit on 100 phrase clips recorded by consenting adult reviewers, never learners:
  right phrases accepted 9 in 10 times or more, wrong ones 1 in 10 or fewer) and (3) Mo's yes is in the decision log.
  Budget: the cohort's `ai_budget` (transcription cost in `ai_usage`) and `per_day` in `daily_counts`.
- Built only if (1) is in hand when Builder 2 reaches it; otherwise the phase slides to 2028 and `say.answers` waits
  in the content for it.

### C4.7 What P29 may bundle (replaces the sources table of draft item 5)

| Source | sources.json | Ruling |
|---|---|---|
| Tanzil text (Uthmani or Simple) | BUNDLE, verbatim, checked 16 Oct | Bundle. Its notice travels with every copy; the only Quran text anywhere in the repository, fixtures and docs included. |
| QuranEnc: Dari (Badakhshani); Pashto (Rowwad, Abu Zakaria or Sarfaraz) | BUNDLE, verbatim, checked 16 Oct | Bundle. Version stated, credit exact, footnotes kept and folded, nothing deleted; a translation whose footnotes the scholar rejects is not used; a new version is a new hash and a new signature. |
| Islamic Network per-verse recitation | BUNDLE-NC, checked 16 Oct | Bundle into `quran-1` marked `licence: NC` (Tanzil and QuranEnc carry no share-alike, so the pack is clean). Files as published, no re-encoding or trimming, hash-checked; one Hafs reciter the scholar picks; one audio list per reciter, so removal on request is a pack update. |
| King Fahd Complex recitations and translation audio | ASK, page unreachable | Not bundled. The P29 builder reads the page at import and records the date and the exact words in sources.json; only a recorded grant moves it to BUNDLE (unchanged files, `exact_attribution`), and then a reciter swap is a pack update. |
| IslamHouse Dari and Pashto books | not registered; no terms found | Not bundled, nothing copied; registered as ASK. Seerah is our own text, drafted with the scholar. |
| Ibn Hisham's Sirah | the work is public domain | Cited by reference; no edition's text or notes copied. |
| hadith-api | BUNDLE (the repository), editions unchecked | Not used in 2027: no hadith text in any pack; seerah lessons cite by reference. |
| Amiri Quran font | SIL OFL 1.1, known | Bundle with its OFL file, confirmed at import as Vazirmatn's was. |
| KFGQPC Uthmanic Hafs font | unknown | Not used. |
| QuranicAudio, EveryAyah | AVOID | Never. |

The mechanism is built whatever the content's state, as drafted: `content/quran/` (the Tanzil file with its notice,
the chosen translations with their versions, the audio list with each file's SHA-256), the `ayah` step, "Repeat
after" with a pause as long as the verse and nothing recorded, the reader with code-only search (number, name in
three scripts, "surah:verse" in either digit set, an exact word of the translation), the exact credit lines, audio per
surah on demand and never the whole Quran by default, no AI anywhere (the packs never enter Ask's index or a prompt;
a recorder test fails on any Tanzil line in a request; `rules.py` keeps religious rulings declined), the "Hanafi
scholar" role required by `release_problems` for subjects `quran` and `seerah` beside the Dari and Pashto readers,
`drafted_by` a person in those subjects, the scholar playing every clip before OK, and the admin's `quran` switch
refused until `content/quran/` carries a scholar's signature at its current hash. Quran lessons p1 to ad, the reader
s1, s2 and adult readers, no `ey`. Seerah: 8 to 10 lessons, no question steps, a line map and no other picture,
narration recorded by native speakers. The browser check's speaker rule exempts elements marked `data-voice="none"`,
used only for scripture and its translations.

### C4.8 P32 trimmed (replaces the spec of draft item 6)

- `made`: bands `s1`, `s2`, `ad` (the reader track, by the phone's rule); depends `lessons`; slots `lesson.end`;
  capabilities `free.text` (medium) and `share.cohort` (blocked unless moderation is `paid-human`; no screen behind it
  in 2027).
- Layer 1: a question, its answer and an optional why, each at most 300 characters, in her language, text only; the
  identifier filter's rules refuse a URL, an email shape or a run of 7 digits as she types. Kept on the phone (`made`,
  at most 50 items); joins her warm-ups, self-marked. Entry: the lesson's end as its second action ("Make a question
  about this lesson"); each subject page's last row, "My questions" (`#/made`). Nothing on Home.
- Layer 2, where `teacher` is on: "Ask my teacher to check" sends `{kind, body, lang}` with her token after `rules.py`
  and the identifier filter (distress goes to Needs care, as today). To do gains the kind "Made by a learner", last
  in the order: the item as she wrote it, "Looks right" or "Needs a change" with chips (spelling, answer wrong,
  unclear, unsafe, not school) and an optional short reply through the leak and identifier filters; the verdict
  reaches her at `#/made`. Server: `made (id, cohort, token_hash, kind, body, lang, status, chips, reply, at,
  decided_at)`, kept 60 days after sending or deciding; `DELETE /api/me` removes hers. Learner items never become
  pack content.
- Not built: "New lesson", "Share with the class", "From your class".

### C4.10 The study-time offer (replaces the sheet lines of draft item 7b)

- The card as drafted: the timetable module's offer for band `ad`, secondary role, top priority, until answered;
  "Yes, choose a time" opens the sheet, "No, thank you" ends it for good.
- The sheet asks the time only: a stepper in 30-minute steps from "7:00 in the evening" (P19's words), Save. The
  length is 30 minutes. Settings → Study time holds on or off, the time, the length (15, 30, 45 or 60) and, in the
  APK, "This phone is mine" and closed-app bells.
- During the time: "Study time: 20 minutes left" as Home's primary in the Now card's shape over the next lesson; a
  bell at the start and the end while Qalam is on screen; the APK's alarm at the start, after "This phone is mine".
  Phone: `study: {at: "19:00", min: 30}` or `"off"`; nothing sent, no event.

## The phases, and what is on by default

| Phase | Builds | On by default | New on the server |
|---|---|---|---|
| P25a (M) | graph files and validator, the graph page in `/review/`, plans over the graph, module `recall`, pathways and their cards, `plan_ai` setting | `recall`: `open` and new cohorts yes, the pilot cohort after its report; `plan_ai`: no; pathways: with their packs | nothing |
| P25b (S) | module `cert`, the certificate screen and print document, `POST /api/m/cert`, `GET /api/cert/<id>`, `/v/<id>` | yes wherever a pathway with `certificate: true` is served, `open` included | `certificates (id, course, version, month, cohort)` |
| P26 (M) | pack fields `tracks` and `bands`, the track rows, bold sheets for the literacy track, the `{child, adult}` sweep, the switch card, four badges, `adult-literacy-1` and `adult-maths-1` as drafts | packs released per cohort by the admin | nothing |
| P27a (M) | `letter.script`, `choice.english` and `hide`, `say.answers`, the release rules, the fonts, `english-adult-1` and `chinese-1` as drafts, `canRecord()` false in the APK | packs released per cohort (reader track) | nothing |
| P27b (S, gated) | module `speak` | no; blocked until C4.5's three conditions | `POST /api/m/speak` (audio in memory only); `ai_usage` and `daily_counts` rows |
| P28 (S) | module `university`, the pack and its `links.json` fields, the `adviser` role, the lint, the checklist screen | no; the admin's choice once the first card set is signed | nothing |
| P29 (M) | `content/quran/`, the `ayah` step, module `quran` (the reader), the scholar gate and the locked switch, `quran-1` and `seerah-1` as drafts | no; locked until the scholar signs, then the admin's choice per cohort | nothing |
| P32 (S) | module `made`, layers 1 and 2, the To do kind | no | `made (…)`, 60 days |
| 7a (S) | `daily_counts`, `photo.per_day`, the `open` recipe in the admin's hands | `photo` in `open` no, until the gate | `daily_counts (token_hash, day, module, n)`, two days |
| 7b (S) | `timetable` gains band `ad`, the offer, the sheet, Settings → Study time | off until she says yes | nothing |
| 7c (S) | the chips screen for the literacy track, `canPlan` admits it | on wherever `plan` is on | nothing |

## The changes to settled text

| # | Change | Decision | Note |
|---|---|---|---|
| 1 | BUILD-PLAN 3.4: `certificates (id, course, version, month, cohort)`, no band, the month not the day | **Accept** | C4.2. |
| 2 | BUILD-PLAN 3.2: `audio.record` (high) means audio leaving the phone; hear-yourself on the phone is no capability; `share.cohort` blocked unless `paid-human` | **Accept** | The APK and the hub have no microphone at all (change 11). |
| 3 | BUILD-PLAN 3.7: learner purposes gain `listen` | **Accept** | Adults only, refused by a gateway test for any other band. |
| 4 | C2.4: "`ey` and `ad` have no school day" becomes "adults have a study time, off until they say yes"; `timetable` gains `ad` | **Accept, as C4.10** | The offer asks the time only. |
| 5 | C3.5 and specs item 14: Learn this shows for adult literacy as the chips screen; `canPlan` admits that track | **Accept** | Typed goals stay typed; the box is reached through "Someone can type it for you". |
| 6 | DESIGN 5's "enabled tracks": the literacy track lists Reading and writing and Everyday maths only | **Accept** | The reader track lists five where their packs and modules are on. |
| 7 | DESIGN 9: scripture and its translations take no phone voice; an unrecorded translation shows without a speaker | **Accept** | `data-voice="none"`, allowed on those elements only; the browser check fails on it anywhere else. |
| 8 | C2.6: the university module sends no `link.open` event | **Accept** | What she prepares for says more about her than her year does. |
| 9 | CONTENT.md: steps `ayah`, `letter.script`, `choice.english` and `hide`, `say.answers`, `recall`; packs `bands` and `tracks`; graph files; release rules for English, Chinese, adult literacy and religious subjects; no AI drafting in `quran` and `seerah` | **Accept, amended** | The graph's `nodes[].lessons`, not a lesson `skill` field; no learner-written lessons (C4.8). |
| 10 | BUILD-PLAN 6: P25 and P27 split | **Accept** | P25a, P25b, P27a, P27b. |
| 11 | New: C3.6 stands, the APK gains no microphone in 2027; `speak` runs in a browser online only | **Accept** | The `say` step in the APK and on the hub is "hear it, say it", with no mic drawn. |
| 12 | New: P10's keypad stays as built, Erase bottom left in every language | **Accept** | Look question 3. |
| 13 | New: BUILD-PLAN 5.1 v3 in 2027 is questions only; lessons and class sharing wait for 2028 and paid moderation | **Accept** | C4.8. |

## What needs Mo, and when

- **D12 (new): `speak`'s consent sentence and DPIA line.** A short recording of an adult's voice goes to OpenAI to be
  written as text and is thrown away; adults only, English only. To the solicitor with the rest in March, or not in
  2027. Default: not in 2027; P27b slides to 2028 and nothing records.
- The rest is people, listed at the end. The certificate paper (question 3) is the committee's decision and is in the
  log for him to overrule, not a question.

## For the build plan

- **Sittings:** C4 held 17 October 2026 with C0 to C3; this note. The July 2027 slot becomes a thread review of the
  pilot report against the gates here (photo for `open`, `recall` for the pilot cohort, homework's numbers), not a
  sitting.
- **Section 2:** the `ad` row's Home list becomes "track rows: two for the literacy track, five for the reader track
  where their packs are on"; adults gain "a study time, off until she says yes".
- **3.2:** modules `recall`, `cert`, `speak`, `university`, `quran`, `made` as the table above; `timetable` gains
  `ad`; `plan` gains the setting `plan_ai`; `photo` gains `per_day`; capabilities as change 2.
- **3.4:** `certificates` as change 1; add `made` (60 days) and `daily_counts` (two days). **3.5:** `POST /api/m/cert`,
  `GET /api/cert/<id>` and `/v/<id>` (core), `POST /api/m/speak`, `/api/m/made/*`.
- **3.7:** purposes gain `listen` (adults only). **4.1:** the King Fahd Complex stays ASK; IslamHouse registered as
  ASK; sources.json stays the only truth. **4.4:** the AD row gains "a certificate per pathway".
- **5.1:** v2 as C4.1; v3 in 2027 is questions only. **5.4:** add "a certificate row holds no token hash, name, band
  or day; the typed name exists in one variable on the phone". **5.5:** add "audio leaves a phone only for adults who
  said yes on the explainer, under a consent version that names it".
- **P25a, P25b, P26, P27a, P27b, P28, P29, P32** and the three extras: the table above, with each phase's "Since C4"
  line pointing at its row here. **9.2:** add D12. **9.3:** one row for C4, source this note, and one for the
  certificate paper (question 3).
- **DESIGN.md:** append this note as "C4 decisions"; apply changes 4, 6, 7 and 12 to the C1 text; the draft's specs
  are the builder's detail, filed as `docs/DESIGN-C4-SPECS.md`.

## Builder order

Two builders, one after the other, each session reading only its phase's files and this note's rows.

**Builder 1 (July to mid-August 2027, once the pilot report is in hand)**
1. P25a: the graph, plans over it, `recall`, pathways.
2. P26 with 7c: the adult tracks, the literacy Home's rows and goal chips, the pack fields and release rules; content
   drafting runs beside it.
3. 7b: the adult study time.
4. P25b with 7a: certificates and `/v/<id>`; `daily_counts`, `per_day`, the `open` recipe.

**Builder 2 (mid-August to December 2027)**
5. P27a: the step kinds, release rules, fonts and the English and Chinese pack skeletons.
6. P29: the Quran set, `ayah`, the reader and the scholar gate; content lands when the scholar does.
7. P28: university preparation.
8. P32: her own questions, layers 1 and 2.
9. P27b: `speak`, only if D12's sentence is signed by then; otherwise 2028.

## Questions for Mo after 22 Dec

1. **D12:** the voice sentence and DPIA line for `speak`: to the solicitor in March, or not in 2027? Default: not in
   2027.
2. **A Hanafi scholar, and a second,** for P29 by August 2027, who will sign on a phone or laptop (no paper
   signatures). Default: no scholar, no Quran or seerah in 2027; the mechanism waits.
3. **A person for the `adviser` role** (university cards: who may apply, and what is a scam) by October 2027. Default:
   the module stays off.
4. **Recorders:** a native English speaker and a native Mandarin speaker, besides Pack 1's Dari and Pashto recorders,
   who face the year's largest recording job in the two adult packs. Default: those packs stay drafts.

# C5 decisions

The design committee's note on sitting C5, as the chair wrote it (model names left out). Builders code from it and
from the accepted specs in [DESIGN-C5-SPECS.md](DESIGN-C5-SPECS.md); where they differ, this note wins. The changes it
makes to the earlier text above (2, 7, 8, 10, 12 and 13) are applied there, and section 9 (Voice) is rewritten as
C5.6. What P33, P34 and P35 built is recorded at the end of this note.

The chair and one member (the draft, filed as `DESIGN-C5-SPECS.md`, with its screenshots in the committee's `c5-shots/`).
17 October 2026, held early with C0 to C4, on the day Mo set the goal this sitting serves: "a very beautiful, high
quality app usable for its intended purpose, and a very user-friendly administration interface in English, Dari and
Pashto, interchangeable, swap languages easily; think about security and methods of logging in." Mo was not available,
so every open point is decided here with a sensible default and recorded for him to overrule in the decision log. No
web checks: the draft's two Cloudflare look-ups are taken as read, and nothing else turns on a contested fact. Part A
(security) is being built by a separate builder exactly as the draft proposes; this note rules only on the six
security questions the draft asks (questions 1 to 6) and settles the login set-up Mo will configure. "Accept" means
the draft's spec for that item is the builder's spec with the notes here applied. The builder copies the draft into
`tutor/docs/DESIGN-C5-SPECS.md`; where the two differ, this note wins. English strings are drafts; every Dari and
Pashto line is checked by native speakers before a learner or a teacher sees it as final. The chair looked at a02, a03,
a04, a07, a10, a11, a12, a13, a14, t02, t08 and r04, and at nine learner shots (Home for p1, for s1 in English and for
adult literacy with Bigger text; Welcome, Ask, Check, Subjects, Settings; the adult lesson with Bigger text), and read
the code the draft cites where a ruling turns on it.

## Mo's decisions of 17 October, recorded

Four decisions Mo made on 17 October supersede committee text. They are recorded here, as the draft asks (A3.4), and
none is reopened.

1. **Any AI provider for any class** (Claude, OpenAI, Gemini, open or Chinese models), picked per cohort in the admin
   panel, each only to its own host, through the gateway as before. This supersedes C4's rule "never Claude or Gemini"
   and BUILD-PLAN 3.7's provider policy (already marked superseded there). What a class may actually use is bounded
   by what its learners' guardians agreed to: the draft's H3 fix (providers limited to those the class's consent
   version names, refused at save and at call time) is the code form of that, and a consent version naming each
   provider, its country and its retention is the content it needs (What needs Mo).
2. **Every text Qalam writes is voiced with Gemini in one woman's voice per language** (Dari, Pashto, English,
   Mandarin), replacing the human-recordings rule (F1, DESIGN 9, C4's rule 5). The clips are rendered at build time
   from strings and pack text, never from anything a learner typed, and ship as files as the recorded clips did; the
   voice is one fixed voice id per language, so no learner hears two voices in one language. Scripture is not a text
   Qalam writes: the Quran keeps its human reciter and its translations keep `data-voice="none"` (C4.7).
   Replacement spec C5.6.
3. **Speech practice uses no AI:** she records, plays herself back beside the voice, and marks herself. Nothing
   leaves the phone. This supersedes C4.5 (`speak` through OpenAI) and withdraws D12. Replacement spec C5.5.
4. **Speech practice, live audio classes (P30) and competitions (P31) are built, switched off by default.** C4 had
   P30 and P31 out of scope. Speech practice is specified here (C5.5), since it is small; P30 and P31 need a member's
   draft and a sitting of their own (C6), and this note fixes only their default (off) and what gates switching
   them on (change 4).

## The rules this sitting applied, beyond C0 to C4

- Ease of use above all: words, never ids, on a staff page; one language control, the same in both apps; the fewest
  things on a phone screen; a state and its action, never a button that reads as a state.
- Nothing new on the server describes a person: a staff member's language lives in her browser, not on her row; no
  staff setting row is added.
- Drafts are marked as drafts until a native speaker signs, in both apps; a missing string falls back to English,
  never to a key name.
- Hints never answers; no name on any row; no child's voice leaves a phone (anything that sends audio is for adults
  only, enforced in code): unchanged, and nothing here touches them. Speech practice sends nothing, so it serves
  every band its pack serves.
- Calendars and digits follow the reader: Solar Hijri and Persian digits in Dari and Pashto, Gregorian and Latin in
  English; codes, PINs, versions and hashes never convert.

## A. Security: the six rulings the draft asked for

| # | Item | Decision | Why | The builder must |
|---|---|---|---|---|
| C5.A1 | H1: the class comes from her token | **Accept.** A learner route takes her class from her token only; a tokenless call uses the hub's own cohort; `?cohort=` survives only on `/api/hello` and the timetable read. | There is no case where a phone acts in a class other than its token's: a shared phone carries one token per learner, a learner who changes class joins again, and staff act through staff routes. | As the draft: `her_cohort()` in `needs()`, `needs_any()`, ask, photo, cert, plan and the three `record()` calls; the three tests. |
| C5.A2 | H2: the online limiter | **Accept the numbers:** `CF-Connecting-IP` online, the socket on the hub; 20 wrong class codes an hour per address; 300 successful joins an hour per address. | 20 wrong tries keep an 8-of-31 code unguessable; 300 lets a whole school join behind one carrier address on its first morning. | As the draft, with its three tests. |
| C5.A3 | H3: consent names the providers | **Accept.** A class with learners may use only the providers its consent version names: `openai` and `fake` under `online-2026-10`; `local`, `fake` and `openai_compat` on the hub's own network under `hub-2026-10`; staging keeps a version of its own that names all six. Refused at save ("Learners in this class agreed to OpenAI only. A new consent text is needed first.") and again at call time. | Mo's decision widens what Qalam may use; it cannot widen what a guardian agreed to. The gate makes the two meet in the consent text, which is where they belong. | As the draft: the table in `ai/policy.py`, the 422, the gateway refusal, the two tests, the key-leak test (A3.3). The new consent version is content (What needs Mo). |
| C5.A4 | Login: one Access application | **One application, independent MFA for every staff member.** The second application is not built. | A second list and a fourth secret are the drift M3 describes, kept twice; an admin's extra protection is the last-admin guard, the Log, and two registered factors each. | Nothing beyond A2; `TUTOR_ACCESS_ADMIN_AUD` is not built. |
| C5.A5 | Cookie, session, hostname | **Accept:** SameSite Lax with the binding cookie, HttpOnly, 24-hour sessions, `workers_dev = false` in production once the custom domain serves. | Lax stops the forged form (M1) without breaking the sign-in redirect; a day is one sign-in a working day; one hostname is one door. | `workers_dev = false` lands with Mo's Access step (login list, item 1). |
| C5.A6 | Hub sign-offs by PIN | **(a), with one exclusion:** a signature made with the shared PIN is stored `via: pin`, never copied by `pull_signoffs.py` without `--hub-ok "<who vouches>"`, and listed by `validate_pack.py --release`; the scholar's and the adviser's signatures count only from a named online row, whatever the voucher says. | Village readers may well sit at a hub, and a named voucher is accountability enough for a reading; a religious or a university gate is met by a person the server can name, not by whoever knows a PIN. | `via` on `signoffs`; the pull tool's flag; `release_problems` and the admin's locked switches (admin.py:187-189) refuse a `pin` row for the roles `scholar` and `adviser`. |

## B. Staff pages in English, Dari and Pashto

| # | Item | Decision | Why | The builder must |
|---|---|---|---|---|
| C5.B1 | B2: one string file per language, a three-way switch on every staff page | **Accept, amended** (replacement spec C5.1). | Today the admin panel is 58% Dari and 0% Pashto, the teacher page starts in whatever the browser says, the review page writes Latin digits in Dari, and nothing is remembered; three pages keeping three private dictionaries is how it got that way. One file per language, one `lang.js`, the picker the learner app already taught, remembered in the browser, is the least that makes "interchangeable" true. | C5.1. Phase P33. |
| C5.B2 | B3: the draft strings and the register | **Accept the drafts; the polite plural** ("کنید", "کړئ") on every staff page in both languages. | Staff are adults addressed by an institution; the polite plural is what Afghan software and letters use for them. The learner app keeps the singular for children; its adult tone's register is the native reader's call in January, not this sitting's. | Rewrite the existing informal Dari staff strings as drafts in the plural; the native speakers check the register with the rest (question 8). |
| C5.B3 | B4: the ten usability changes | **Accept all ten,** amendments on 2, 3, 4, 5 and 10 below. | Each one takes a thing an admin must know (what "ask 0.1.0 medium pilot" means; that the code cannot be shown again; that a grey Publish button is a missing check) and puts it in a sentence where she is looking. | The list below; replacement spec C5.2 for the cohort page's head. Phase P34. |

**The ten changes (B4)**

1. Words, not ids, in the module table: accept (C5.1 item 5).
2. Modules as cards under 760 px: accept; a card is the name and its line, the switch on the same row, the risk tag
   and the years as small text under the name, Settings under that. The 390 px table that cuts the switches in half
   (a14) is not shipped again.
3. Kill buttons say what they do: accept, shaped as C5.2: a state line with its action beside it; `--bad` only while
   the thing is off.
4. The class line and the code: accept, worded as C5.2: the row says what Qalam can do, not what it once did.
5. Content page: accept. "0 of 8 packs ready" at the top; one line per pack, "Not ready: 31 checks missing", opening
   the list; the Publish rows only for a pack that can be published; a published pack says where and when
   ("Published to Village hub, 25 Mizan").
6. Staff page: accept; "No class yet" for a teacher without one, nothing for other roles; roles in words; the Access
   reminder under "Add someone".
7. Empty states that say what comes next: accept, one sentence each, in the string files so the native speakers see
   them.
8. Teacher page on a phone: accept; the keys line hidden under `(hover: none)`; "، " after numbers in Dari and
   Pashto through `join()`.
9. Finish Dari and add Pashto: accept (C5.B1).
10. Confirm dialogs: accept. For a change that cannot be taken back (new code, remove staff, rollback) focus lands on
    Cancel; Escape cancels every dialog; the button order stays as P21 built it (confirm first, Cancel last), since
    an order that changes per dialog is its own trap; the kill switches keep the quick path and their "All cohorts"
    box.

**Two more from the chair's look** (fixed in P34, no phase of their own): the cohorts table's heads go to sentence
case and plain words ("Learners", "Years", "Languages", "AI", "School day"; "every band" becomes "all years"); the
Log's detail line is written through `t()` and `num()` ("AI budget: not set → ۲۰۰٬۰۰۰"; "the hub's admin" and "the
seed" for `admin:hub` and `seed`), as C4 q29 already asks of `what`.

## C. The learner app: the nine polish items

The draft is right that the app is already clean (26 of 26 screens pass the browser check; the chair saw nothing the
nine miss). Each in one line; the fixes land as phase P35 with screenshots at 360 px in all three languages, light,
dark and Bigger text.

1. Hide the hub chip while the hub is in reach: **accept** (question 10). One rule on both hosts: the chip shows only
   for "No hub" or "Offline", for "Sending…", and while items wait. Replacement spec C5.3.
2. One-line titles at 360 px: **accept** (question 11): the header gains a `lead` slot under the title for a sentence,
   the kicker keeps a few words; the chip moves down whenever the title would wrap; Subjects loses its second head.
   C5.3.
3. An error screen with a way forward: **accept, extended:** "Try again" re-runs the screen; in a band with no tab
   bar a second button, "Home". C5.4.
4. Check my sheet: **accept:** a line drawing of the sheet's bottom corner with the code circled, marked `line: true`
   so dark inverts it; no placeholder once the drawing is there (the drawing carries the example `M7-03-48217`).
5. One Dari "yes": **"بلی"** everywhere (question 12): the five "بله" at i18n.js 52, 133, 261, 300 and 307 become
   "بلی" now; the native reader may overrule in January and sweeps the other doublets. Chair's check: the Pashto
   "بله" (i18n.js 641, "بله لارښوونه", "another hint") is a different word and is not touched.
6. Subject rows share one layout: **accept:** one row shape (the name, then "۰ از ۱" and the bar under the name
   column, the chevron at the end); where her year has no lessons, the muted "No lessons for your year yet" in place
   of the count, at the same height.
7. Settings, the nickname card: **accept:** the caption stays, the field is empty with no placeholder (an example
   nickname would be copied, and some would read as a name).
8. The draft banner on one line: **accept:** "Draft: not checked yet" with its Dari and Pashto drafts
   ("پیش‌نویس: هنوز بررسی نشده", "مسوده: لا نه ده کتل شوې"), one line at 360 px with Bigger text in all three; the
   browser check gains that rule for `.draft`.
9. Mixed scripts in English titles: **accept:** each lesson title in a `bdi` with its own `lang`; the pack validator
   lists (warns, never refuses) lessons offered in English without an English title.

## The twelve questions

1. **H1:** accept; no such case exists, so `?cohort=` is ignored on every learner route and kept only for
   `/api/hello` and the timetable read.
2. **H2:** accept the numbers: `CF-Connecting-IP`, 20 wrong codes an hour per address, 300 successful joins an hour
   per address.
3. **H3:** accept; Mo's 17 October decision is recorded above as a supersession of C4's rule, and the new consent
   version naming each provider, its country and its retention is content for Mo, the reviewers and the solicitor in
   March (default until signed: OpenAI online, `local` on the hub, anything on staging).
4. **Login:** one Access application with independent MFA for every staff member; the second application is not
   built.
5. **Cookie, session, hostname:** accept all three (C5.A5).
6. **Hub sign-offs:** (a), and the scholar's and adviser's signatures count only from a named online row (C5.A6).
7. **Staff languages:** accept B2 as C5.1; the learner app's `i18n.js` moves to one file per language as its own
   small phase after the native speakers' January check, keys and behaviour unchanged, `bands.test.js` and the
   browser check green before and after; not in this run.
8. **Register:** the polite plural on every staff page; the native Dari and Pashto speakers who check the learner
   strings check the staff drafts, by the end of January 2027, the teacher page first because the facilitator uses
   it from the pilot's first day.
9. **Staff dates:** Solar Hijri with the certificate's month names in Dari and Pashto, Gregorian in English; the
   day-level `hijri()` and its test table as C5.1 item 8.
10. **The hub chip:** accept; P11's hub chip follows C2.5's reason on both hosts.
11. **Ruling 4 refined:** accept; the chip moves down whenever the title would wrap, and a sentence kicker goes
    under the title as a `lead`.
12. **"بلی":** yes, everywhere in Dari now, pending the native reader; the Pashto "بله" is a different word and stays.

## Replacement specs

### C5.1 The staff language layer (B2, amended)

- Files and helpers as the draft's items 1 to 4, 9 and 10, with these notes. `en.js` is imported statically (it is
  the fallback and always present); `prs.js` and `ps.js` by dynamic import; a failed import keeps English and says
  nothing.
- **The picker:** the learner app's segmented control, in the staff tokens: `English`, `دری`, `پښتو`, the current
  cell filled with `aria-pressed="true"`. In the header at 760 px and above; under 760 px (the one breakpoint the
  staff pages already use) on its own row under the title. The teacher page at 390 px: title and Sign out on the
  first row, the cohort chip and the picker on the second, the tabs on the third, so its header stays three rows.
  The PIN screen and the "sign in through Access" message carry the same picker above their one line, since a
  teacher's first screen must be in her language. No speakers (rulings 13 and 20).
- **Remembered:** `localStorage` `qalam.staff.lang`, read and written in try/catch; first visit from
  `navigator.languages` (`fa` or `prs`: Dari; `ps`: Pashto; else English); never on a staff row.
- **`<html lang dir>`:** the values the learner app's `htmlLang()` gives for the same languages (`fa-AF` for Dari,
  `ps-AF` for Pashto, `en` for English); the admin's menu, the teacher's tabs and the review frame mirror; `m()`
  keeps codes, emails, ids, model names, versions, hashes and URLs left to right.
- **Words, not ids** (item 5): `module.<id>`, `module.<id>.what`, `band.<id>`, `risk.<level>`, `maturity.<level>`,
  `role.<name>`, `log.<what>` and `error.<code>` in the string files, never in a manifest; the id in small `m()`
  text under Details. `check_staff_strings.mjs` fails when a module id in `app/modules/*/manifest.json` has no
  `module.<id>` in `en.js`, or a `code` the server emits has no `error.<code>` in `en.js`. A module or a code with
  no string shows its id, so a new module never breaks the page.
- **Refusals** (item 6): the ten codes as the draft lists them, `code` beside `detail`; the page shows
  `error.<code>`, else the server's sentence.
- **Numbers** (item 7): as the draft, Persian digits for Dari and Pashto alike (the learner app's `fa()` already
  converts for both); the PIN field and the class-code field accept either digit set and convert before sending, as
  the learner app reads answers in any digits.
- **Dates** (item 8): as the draft. `hijri()` in `cert.py` is month-level today (`hijri(month) -> (year, month)`);
  it grows to the day in Python, with a JavaScript copy in `lang.js`, and one table in `tests/` of 25 known dates
  (the first and the fifteenth of each month of 1405, and Nowruz 1406) feeds both; the builder checks the table
  against a printed Afghan calendar, and a native speaker reads the month names on the page. Chair's check:
  17 October 2026 is 25 Mizan 1405 (six months of 31 days from 21 March, then Mizan), as the draft writes. Times in
  the viewer's zone; the server keeps ISO.
- **Drafts** (item 9): `meta.checked` per file; "Draft translation" in the footer while false; the native speaker's
  initials set it, as a sign-off.

### C5.2 The cohort page's head (B4 items 3 and 4)

- The two kill switches become two state lines at the top of the cohort page, each with its action beside it:
  "AI is on · Switch AI off" and "School day is on · Switch the school day off" (through `join()` in Dari and
  Pashto), plain outline buttons, the confirm dialog as built, "All cohorts" kept. While a thing is off, its line is
  a `--bad-soft` band with `--ink` text, "AI is off for this class since 14:30 (Teacher A)", and the one button
  "Switch AI on". The sticky line (C4 q30) holds the same two lines while the module table scrolls. The cohorts list
  keeps its "AI on" and "School day off" tags, which are states and read as states.
- The class line: "8 learners, all years, Dari, Pashto and English" (words from the strings, through `join()`).
  Under it one row, "Class code", with a sentence: "Qalam keeps only a scrambled copy of the code, so it cannot be
  shown again. Printing the class cards asks you to type it. Lost it? Make a new code; the old one stops working."
  Two buttons: "Print class cards" and "Make a new code". The code is shown once, large, in `m()`, when the cohort is
  made or a new code is drawn, with "Write it down now".

### C5.3 The learner header and the chip (Part C items 1 and 2)

- `netChip()` returns the hidden chip on both hosts while all is well: online when the network is up and nothing is
  sending or waiting (as today); on the hub when the hub answers and nothing is sending or waiting. It shows for
  "No hub" or "Offline", for "Sending…", and while items wait, with the sheet behind it as P11 built. Early years
  keeps its rule (no chip on the child's screens).
- The header takes `kicker` (a few words above the title: "New learner", a subject name) and `lead` (a sentence
  under the title in the small size, which the page speaker reads after the title). Ask's and Check's sentences
  become leads; Welcome keeps its kicker. The title gets the whole row first: the chip and anything else after the
  speaker move to their own row at the end whenever the title would wrap on one line (measured after render, not at
  6rem), and the title never wraps beside them. Subjects: one head, the title.

### C5.4 The error screen (Part C item 3)

- `main.js` draws the error as a screen: "Something did not work." with the page speaker, a primary "Try again"
  (60 px in bold bands, 72 px in early years, read on open where Home is read on open) that runs the same screen
  with the same arguments, and, in a band with no tab bar, an outline "Home". The tab bar stays where the band has
  one. Nothing is sent, no event.

### C5.5 Speech practice without AI (replaces C4.5)

- Module `speak`: bands as the pack's `say` steps serve (English, Chinese, the literacy track's letters); depends
  `lessons`; no capability (hear-yourself on the phone is none, C4 change 2); no setting; `offline: yes`. Off by
  default in every cohort, the admin's switch per cohort, logged like any switch.
- Where it runs: the web app over HTTPS. Not the APK, which has no microphone (C3.6 stands for 2027), and not the
  hub's plain http (F2): there the `say` step is "hear it, say it" with no mic drawn, as C4.4 built it.
- The step, where `speak` is on: "Play the voice", "Record" (8 s at most, in memory only; the first tap shows one
  line, "Qalam uses the microphone for 8 seconds. Nothing is kept or sent.", before the browser asks), then
  "Play mine" beside "Play the voice", then "I said it" or "Not yet"; three goes, then "Let's go on."; Next is never
  blocked. The recording is dropped when the step closes: never storage, a request, an event or a log, every writer
  patched in the test (P14's pattern). No transcript, no mark from a machine, no "Correct": she marks herself, as
  `recall` lets her.
- D12 is withdrawn; `say.answers` stays in the content as the model phrase only; `listen` leaves the purposes.

### C5.6 The one voice per language (replaces DESIGN 9's recording rule)

- `tools/voice.py` (UK side, never on a phone or a hub) renders every interface string in `i18n.js` and the staff
  string files, and every lesson text, phrase and letter sound a pack marks for voice, to clips with Gemini's
  text-to-speech, one fixed woman's voice per language (`prs`, `ps`, `en`, `zh`); the voice id is recorded in
  `app/audio/<lang>/manifest.json` and in each pack's audio manifest in place of the speaker code. A changed voice
  re-renders every clip of that language, so one language is always one voice.
- What goes to Gemini: Qalam's own strings and pack text, at build time. Never a learner's text, a name, an event or
  anything from D1 or a hub: the tool reads only `app/js/`, `app/js/staff/strings/` and `content/`, and a test
  asserts it opens nothing under `data/`.
- Before any clip of a language ships, a native listener passes a sample of 30 clips (letters, numbers, the four
  consent lines) in that language; a language with no voice good enough waits, and there the phone's voice or the
  toast stands as today.
- The release rules that asked for "a recorded clip" (every `ey`, `p1` and `letter` step; every step of the literacy
  track; every word of the English and Chinese packs) are met by a generated clip. Each clip is still played by the
  reviewer before OK (P17), so a mispronounced letter is caught by a native ear; the Chinese teacher reviewer listens
  for the tones before the pack leaves draft. The January recording job becomes a listening job.
- `speech.js` keeps its order (clip, then the phone's voice, then the toast); with clips for every string, the
  phone's voice is reached only for a string no build has voiced yet. Scripture: C4.7 unchanged.

## The login set-up

What Mo configures (after 22 December, staging first, then production), and what the code enforces around it:

1. **Online staff:** one Cloudflare Access self-hosted application on the production custom domain covering
   `/admin/*`, `/api/m/admin/*`, `/teacher/*`, `/api/m/teacher/*`, `/review/*`, `/api/m/review/*`;
   `workers_dev = false` once it serves.
2. **Ways in:** one-time PIN by email, and Google; nothing else.
3. **Second factor:** independent MFA required on the application for every staff member: the phone's fingerprint or
   face unlock, a security key, or an authenticator app. Mo and each admin register two (one spare).
4. **Who:** one Access list "Qalam staff" of emails, one Allow policy; the panel's Staff page adds the role row, the
   list adds the door (the reminder of B4 item 6).
5. **Session:** 24 hours; Sign out ends it at once, on every staff page, the review page included (L8).
6. **Cookie:** SameSite Lax, HttpOnly, binding cookie on.
7. **Secrets:** `TUTOR_ACCESS_TEAM`, `TUTOR_ACCESS_AUD`, `TUTOR_STAFF_PEPPER` per environment, in the password manager.
8. **Weekly:** the Access log of denied sign-ins.
9. **The hub:** the 6-digit teacher PIN and the separate admin PIN, read on the hub's screen; changed each term with
   the Wi-Fi password; no email or internet sign-in on the hub; the hub-wide slow-down after 30 wrong PINs an hour
   (L2).
10. **Learners:** no login. Tapping a year starts the app; a class code from the card joins a class; the optional
    4-digit lock is a curtain, not a credential. Nothing here changes.

## The phases, and what is on by default

| Phase | Builds | On by default | New on the server |
|---|---|---|---|
| A (separate builder) | H1 to H3, M1 to M4, L1 to L8 as the draft orders them | the fixes | `via` on `signoffs`; `code` beside `detail`; nothing stored about anyone |
| P33 (M) | the staff string files, `lang.js`, the picker, remembered language, RTL for Pashto, drafts marked, `check_staff_strings.mjs` | three languages on every staff page | nothing |
| P34 (M) | words not ids, numbers, money, dates, refusal codes, the ten usability changes, C5.2, the chair's two items | yes | nothing |
| P35 (S) | the nine learner items, C5.3, C5.4 | yes | nothing |
| P36 (M) | `tools/voice.py`, the clips for four languages, the manifests, the release rules met | clips ship with the app and the packs | nothing |
| P27b (S, rewritten) | module `speak` as C5.5 | no; the admin's switch per cohort | nothing |
| P30, P31 | to C6 | no | to C6 |

## The changes to settled text

| # | Change | Decision | Note |
|---|---|---|---|
| 1 | C4 rule 3 ("never Claude or Gemini"): any provider, through the gateway, bounded by the class's consent version | **Accept** (Mo, 17 Oct) | C5.A3. |
| 2 | F1, DESIGN 9, C4 rule 5 ("no synthetic Dari or Pashto voice"): one Gemini woman's voice per language for every text Qalam writes; scripture keeps its reciter | **Accept** (Mo, 17 Oct) | C5.6. |
| 3 | C4.5 and D12: `speak` sends nothing; no AI in speech practice | **Accept** (Mo, 17 Oct) | C5.5. D12 withdrawn. |
| 4 | C4's "P30 and P31 out of scope": built, off by default; specified at C6 | **Accept** (Mo, 17 Oct) | The code rule "anything that sends audio is for adults only" stands until C6 and the legal opinions say otherwise for children; D9 and the opinions gate switching P30 on for children, not building it. |
| 5 | C4.4: "the Chinese pack stays a draft until a native Mandarin speaker records the tones" becomes "until a native Mandarin speaker has listened to its clips" | **Accept** | Change 2. |
| 6 | C4's question 4 to Mo (four recorders) withdrawn; a native listener per language instead | **Accept** | Change 2. |
| 7 | P11: the hub chip hidden while the hub is in reach | **Accept** | C5.3; C2.5's reason on both hosts. |
| 8 | P11's ruling 4 (6rem): the chip moves down whenever the title would wrap; `lead` under the title | **Accept** | C5.3. |
| 9 | P17, P20, P21: three languages on every staff page, remembered per device; `/review/` and `/teacher/` lose their own first-visit rules | **Accept** | C5.1. |
| 10 | P21: the module table in words, cards under 760 px, the kill switches as state and action, the class-code row | **Accept** | C5.2. |
| 11 | P21: confirm dialogs focus Cancel for irreversible changes; Escape cancels | **Accept** | B4 item 10. |
| 12 | Staff dates in Solar Hijri (Dari, Pashto) and Gregorian (English); `hijri()` to the day | **Accept** | C5.1. |
| 13 | DESIGN "Ease of use first": "A recorded clip plays first" reads "The language's one voice plays first; the phone's own voice is the fallback" | **Accept** | Change 2. |
| 14 | The learner's `i18n.js` to one file per language, later, unchanged in behaviour | **Accept, deferred** | Question 7. |
| 15 | BUILD-PLAN 3.5: `signoffs` gains `via`; the ten refusal codes; `her_cohort()` | **Accept** | C5.A6, C5.A1, C5.1. |

## What needs Mo, and when

- **The consent text naming the providers.** A new consent version (online and hub) that names each provider a
  class may use, its country and its retention, in the four spoken lines and the full text, in the three languages;
  to the reviewers in January and the solicitor in March with the rest. Until it is signed, a class with learners
  uses OpenAI online and `local` on the hub; staging uses anything. Default: the pilot runs on OpenAI.
- **The Access set-up** as the login list, after 22 December, staging first.
- **A Gemini key** for `tools/voice.py` (UK side only), and a native listener per language (Dari, Pashto, English,
  Mandarin) to pass the sample before the first clips ship, in January.
- **C6:** a member's draft for P30 (live audio classes) and P31 (competitions), built off by default. Default: both
  built in 2027 if the year allows, both off.
- D12 is withdrawn. Nothing else is new.

## For the build plan

- **Sittings:** C5 held 17 October 2026 with C0 to C4; this note. C6 (P30, P31) when a draft exists.
- **Section 2:** staff pages "in English, Dari and Pashto, a picker on every page, remembered per device".
- **3.2:** `speak` as C5.5 (no capability, bands by the pack); `audio.record` stays defined and unused in 2027.
- **3.5:** `via` on `signoffs`; the ten refusal codes; `her_cohort()`.
- **3.7:** the provider policy as C5.A3 (consent-named providers); `listen` leaves the purposes.
- **4 (voice):** `tools/voice.py`, one voice id per language in the manifests, the release rules met by generated
  clips, the 30-clip sample per language.
- **5.4:** add "a staff member's language is kept in her browser, never on her row". **5.5:** add "nothing a learner
  says or records leaves the phone in 2027".
- **6:** P33, P34, P35, P36; P27b as C5.5; P30 and P31 as C6's.
- **9.2:** D12 withdrawn; the consent-providers item added. **9.3:** one row for C5, source this note; one for each
  of Mo's four decisions of 17 October.
- **DESIGN.md:** append this note as "C5 decisions"; apply changes 2, 7, 8, 10, 12 and 13 to the earlier text;
  section 9 (Voice) rewritten as C5.6; the draft's specs are the builder's detail, filed as
  `docs/DESIGN-C5-SPECS.md`.
- **HOSTING.md:** the login list, verbatim, in "Going live".

## Builder order

The security builder runs first and alone on Part A in the draft's order (H1, H2; H3; M1, M2; M4, L1, L3, L4, L8;
L2, L5, L6, L7 when the hub is next touched). The C5 builder starts P33 once M1 (the `X-Qalam` header in the three
`api()` helpers) and L8 (Sign out on review) have landed, since P33 rewrites the same headers and helpers.

1. P33: the string files, `lang.js`, the picker, remembered language, RTL for Pashto, the drafts marked, the CI
   check.
2. P34: words, numbers, money, dates, refusal codes, the ten usability changes, C5.2, the chair's two items;
   screenshots at 390 and 1366 px in all three languages; the browser check extended to the staff pages (contrast,
   clipping, width, direction; no speaker rule).
3. P35: the nine learner items, C5.3, C5.4; screenshots at 360 px, three languages, light, dark, Bigger text.
4. P36: the one voice, as soon as the Gemini key is set; it can run beside 1 to 3 in a second session, since it
   touches `tools/` and the audio folders only.
5. P27b as C5.5, after P35.
6. P30 and P31 after C6.

## Questions for Mo after 22 Dec

1. **The provider consent text:** commission it for January, to the solicitor in March? Default: yes; until signed,
   the pilot runs on OpenAI online.
2. **The Access set-up** as listed, and the custom domain: when? Default: with the staging deploy in January,
   production before the dress rehearsal.
3. **Native listeners** for the four voices and the staff drafts, by the end of January. Default: the January
   reviewers.
4. **C6's date** for P30 and P31. Default: when a member's draft exists; both stay off.

## What P33 and P34 built (builder notes)

- **P33:** as C5.1. The Solar Hijri day is computed (the 33-year rules with their break years), not looked up; one
  table of 25 known days (`hub/tests/hijri_dates.json`) tests the page's copy and `cert.py`'s.
- **P34:** as C5.B3 and C5.2. The hub adds `code` beside the sentence on ten refusals (`wrong_pin`, `wait`,
  `access`, `no_cohort`, `not_your_class`, `locked`, `photo_gate`, `confirm_first`, `last_admin`, `budget`); a plain
  refusal keeps its old shape. The cohort page's `since` (when and by whom a kill switch went off) is read from the
  Log, so nothing new is stored. A risky module's confirm reads each capability's sentence from the string files
  (`cap.<capability>`), the module's own English line where it has none.

### Open look questions (the builder's choice, for the chair)

1. The "since" line shows the Log's last switch-off for the class; a switch thrown with "All cohorts" logs each
   class, so each says its own time. A class switched off before the Log existed says only "AI is off for this
   class".
2. The kill-switch buttons are plain outline buttons in every state; the red is the band, not the button's border
   (a red border on a "Switch AI on" button would read as danger).
3. The class code's row is a card of its own under the class line, with the two buttons at full size, since it is
   the one thing on the page an admin cannot undo by herself.
4. On Content a pack that is not ready keeps its rows for classes that already have a release (for Roll back), with
   no Publish button; a pack with no release and nothing publishable has no rows at all.
5. Versions and short hashes stay in Latin digits, left to right, as codes do, in all three languages.
6. `band.all` is lowercase ("all years") because it sits inside a sentence; as a table cell it reads the same.
7. The chair's text names `app/modules/*/manifest.json`; the modules are `modules/<id>/module.json`, which the
   strings check reads.
8. The 25 Solar Hijri days were computed and cross-checked between two copies of the rules (Nowruz 1405 = 21 March
   2026), not yet against a printed Afghan calendar: the January reviewers should check three of them.
9. The staff browser check needs a freshly started hub: each page opening asks `/me` before the PIN is typed, which
   the hub counts as a wrong try (L2 is kept as built).

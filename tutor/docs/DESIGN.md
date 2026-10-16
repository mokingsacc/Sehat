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
- **A speaker on every text,** buttons included. A recorded clip plays first; the phone's own voice is the fallback.
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

- Every lesson ends with its worksheet and a big Print button. The bold look has "print today's sheet" on Home.
- **A4, black and white, one page,** big margins, line art with no faces, a name line and date at the top, written by
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
| `--s-maths`, `--s-science`, `--s-english`, `--s-dari`, `--s-pashto` | #1f4fa3, #c2410c, #7a4a9e, #0b6e4f, #b23a48 | same | lightened in dark so white text stays 4.5:1 (builder checks) | same | subject badges |

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
- Pictures: pack line art is SVG drawn in `currentColor` (the importer in P8 rewrites black strokes); any raster
  picture gets `filter: invert(1)` in dark. The subject badges and the alias pictures keep their colours.
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
| `ad` literacy | "Continue" with the next letter or word at 84 px, play and listen | "Print today's sheet" | enabled tracks | Lessons, Ask, Print |
| `ad` reader | the continue card | "Check my sheet" | enabled tracks | Lessons, Ask, Print |

**Early years (`ey`):** `data-look="bold" data-tone="child"`, `--tap` 72 px. No tabs, no Ask, no text the child must
read: everything is read on open from recorded clips. The alias picture sits at the top start; the grown-up's corner
is a 44 px lock icon at the top end that opens Who is learning, Settings and Print after a 2-second long press (a
short tap says, aloud, "hold it"). Lesson steps advance with one 72 px "next"; stars at the end. No PIN lock.

**Adult literacy (`ad`, track `literacy`):** `data-look="bold" data-tone="adult"`: Naskh 22 px, 60 px buttons, read
on open, on the adult palette (white, teal). Home as in the table; the tracks list shows only tracks the cohort has
enabled (Literacy, Maths, English, Chinese, University). Lessons end with a check mark and "Correct, 8 of 10", never
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

`speech.js` plays, in order: a recorded clip from the pack or from `app/audio/<lang>/<key>.opus` (interface clips,
about 300 per language, recorded by a native speaker; `manifest.json` names who recorded each), then the phone's own
voice if it has one for the language (Dari and English on most Android phones; Pashto on none), then today's "voice
not ready yet" toast. No synthetic Dari or Pashto voice is ever shipped: a learner of letter sounds must hear a real
speaker. Release of a pack needs clips for every `ey` and `p1` step and every `letter` step.

## What P9 built, and where it differs

- The tables in sections 2 and 3 are the tokens at the top of `app/css/app.css`, as written; no rule below them holds
  a colour or a size except the fixed lesson glyphs and the always-white sheet preview. `app/tests/bands.test.js`
  checks every text pair in all four palettes and fails on a stray colour or size; `tools/browser_check.mjs`
  measures every visible piece of text per band in the browser (4.5:1, 3:1 for large text), clipped text, page
  width, direction and the speaker rule. The screenshots for C2 are in the committee's `p9-screens` folder.
- Text in the accent colour uses `--accent-ink`, not `--accent`: the active tab's teal on `--accent-soft` was 4.3:1.
- The subject colours stay the same in dark: white on each is already 4.5:1 or better.
- The speaker rule is met by one page speaker in each header that reads the screen in order (early years: the
  listen button), not a speaker on every tile, tab and button. C2 to confirm.
- Interface clips: `app/audio/<lang>/manifest.json` names each recording's speaker by a code, never a name. Until
  native speakers record, the three clips there are two-note chimes marked `placeholder`, which play only on a
  tester's phone; everyone else hears the phone's voice or the "voice not ready" toast.
- English pages run left to right: the back, next and row arrows turn round, and Dari or Pashto pack text keeps its
  own direction inside them.
- Bigger text and the theme are kept per learner but get their switches with Settings (P10); Welcome lost its name
  field and gained English, and gets the early-years and adult doors in P10.

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
  as on. `ey` and `ad` have no school day (adults: C4). The phone stores `day: 'on' | 'off'` per learner and nothing
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

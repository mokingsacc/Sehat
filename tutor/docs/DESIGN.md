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
- **Three tabs only:** Lessons, Ask, Print. The teacher page is behind "Who is learning" and a PIN; so is Settings.
- **Plain words, the child's language,** Persian digits, right to left; sums and English left to right.
- **Wrong answers teach:** the right one is shown with the reason, read aloud for young children. No scores to
  lose, no timers. Stars at the end for children; "Correct, 8 of 10" and a check mark for adults.
- **Nothing breaks without the hub:** lessons already opened still work; Ask gives the closest checked answer
  from those lessons, marked as such; Print says to come to the hub.
- **Every answer is labelled:** checked, worked out, from the lesson, from the teacher, or AI (not checked).

## Paper first

Mo's view, and the plan's: worksheets with pen and paper beat a screen for practice. So:

- Every lesson ends with its worksheet and a big Print button. The bold look has "print today's sheet" on Home.
- **A4, black and white, one page,** big margins, line art with no faces, a name line and date at the top, written by
  hand; the phone never asks for the name.
- **Grey letters to write over** (tracing), then empty boxes to write alone; stacked fractions with an answer box.
- The **code in the corner** (`M7-03-4821`) brings the sheet back in "Check my sheet". The answer sheet prints
  separately and needs the teacher's PIN.
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

Rules per screen: one accent colour, at most three text sizes, banners only for "offline" and "draft", motion only the
press-down of a button and the consent ring (`prefers-reduced-motion` removes both). Nothing hard-coded: the roughly
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

## Still to design

C2 (early December): sheet geometry for photos (four 12 mm corner squares, fixed answer cells, the hand-written name
box), the camera screen and "what I read", results and hints, Home for in-school versus out-of-school learners,
offline and "waiting to send" signs, link cards and Credits. C3 (early January): the school day and bells, the teacher
dashboard, the admin panel, review screens, where "Learn this" sits, the Android download screen and permission
prompts. Real pictures (from Mo's ChatGPT images, as line art for printing) arrive with Pack 1.

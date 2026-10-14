# The two looks, and the rules every screen and sheet follows

Mo's choice (14 Oct 2026): look **B** (clean, modern) as the base for older children, with look **C**'s big lesson
button and boldness for younger ones. The year the child picks decides, with no setting to find.

| | Years 0-6 (`data-mode="small"`, look C) | Years 7-12 (`data-mode="big"`, look B) |
|---|---|---|
| Feel | bold, friendly, green and orange on mint | calm, clean, teal on white |
| Home | one huge play button for the next lesson, a listen button, a big orange "print today's sheet", five subject tiles | a "continue" card with a play button and progress, print and check buttons, a subject list |
| Reading | school-book Naskh letters, 22 px | Vazirmatn, 18 px |
| Buttons | 60 px tall | 48 px tall |
| Voice | each page is read aloud when it opens, if the phone has a voice | the speaker is there to tap |

The renderings are in [Home Tutor App Looks](https://claude.ai/artifact/HPUjNESWe3WBYe6iLVi3aT). The tokens are at the
top of `app/css/app.css`; screens use only tokens, so a look is changed in one place.

## Ease of use first

- **Tapping a year starts the app.** No sign-up, no password, no "next" button. The name is optional and stays on
  the phone.
- **One big button** on Home starts the right lesson: the one left half way, else the next one not done.
  Every lesson is still open from the subject pages; nothing is locked.
- **A speaker on every text.** The phone's own voice for now; recorded voices from the packs later.
- **Three tabs only:** Lessons, Ask, Print. The teacher page is behind "who is learning" and a PIN.
- **Plain words, the child's language,** Persian digits, right to left; sums and English left to right.
- **Wrong answers teach:** the right one is shown with the reason, read aloud for young children. No scores to
  lose, no timers. Stars at the end.
- **Nothing breaks without the hub:** lessons already opened still work; Ask gives the closest checked answer
  from those lessons, marked as such; Print says to come to the hub.
- **Every answer is labelled:** checked, worked out, from the lesson, from the teacher, or AI (not checked).

## Paper first

Mo's view, and the plan's: worksheets with pen and paper beat a screen for practice. So:

- Every lesson ends with its worksheet and a big Print button. The small look has "print today's sheet" on Home.
- **A4, black and white, one page,** big margins, line art with no faces, name and date at the top.
- **Grey letters to write over** (tracing), then empty boxes to write alone; stacked fractions with an answer box.
- The **code in the corner** (`M7-03-4821`) brings the sheet back in "Check my sheet". The answer sheet prints
  separately and needs the teacher's PIN.
- Sums are made fresh for each print, so a child can practise the same skill twice.

## Right to left, done properly

- `<html dir="rtl">`; layout uses start and end, never left and right.
- Sums sit in a left-to-right island (`<span class="m">`, `unicode-bidi: isolate`) so `۱/۲ + ۱/۴ = ۳/۴` never
  reorders. Lesson text marks sums with `$...$`.
- Digits follow the reader: Persian digits in Dari and Pashto, on screen and on paper; answers are read in any
  digits (`۳/۴`, `3/4`, `۰٫۷۵`, `1 1/2`).
- Fonts are bundled (Vazirmatn, Noto Naskh Arabic; SIL Open Font Licence in `app/fonts/OFL.txt`), so phones
  without Persian fonts still show every letter, and sheets print the same everywhere.

## Still to design

Dark mode, a bigger-text setting, recorded voices, real pictures (from Mo's ChatGPT images, as line art for
printing), and the Android app's offline download screen.

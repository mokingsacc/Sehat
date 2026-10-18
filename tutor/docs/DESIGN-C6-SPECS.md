# C6 specs: live audio classes and contests

Filed by the builder on 17 October 2026 from the design committee's C6 note. The chair wrote these specs directly (no
member's draft), so this file is the chair's text, unchanged but for this heading. The decisions they serve are in
DESIGN.md, "C6 decisions"; where the two differ, the decisions win. English strings are drafts; every Dari and Pashto
line is checked by native speakers before a learner or a teacher sees it as final.

## C6.1 Module `live`: the audio path, the routes, the data (P30a)

- **Manifest** `modules/live/module.json`: `id: live`, `version: 0.1.0`, `maturity: pilot`, `depends: ["lessons",
  "timetable"]` (the Now card is the timetable's), `bands: p1, p2, s1, s2, ad`, `slots: ["home.action"]`,
  `capabilities: []` (a child sends a chip code, never audio; the teacher is staff), no `ai`, `settings: max_minutes
  {int, 45, 10..90}, per_day {int, 2, 1..6}`, `needs: ["internet"]`, `offline: no`. Off in every seed; no migration
  seeds it. `server.held()` adds `live` while `cfg.rtc_app` or `cfg.rtc_secret` is empty, so a hub never serves it and
  staging serves it only once its secrets exist. Config: `TUTOR_RTC_APP`, `TUTOR_RTC_SECRET`, `TUTOR_RTC_TURN_KEY`,
  `TUTOR_RTC_TURN_SECRET`, `TUTOR_RTC_GB_MONTH` (900); `worker/entry.py` reads the four secrets from the env as it reads
  the AI keys (`KEY_SETTINGS`), never from D1 or `[vars]`; the admin's `/me` says which are set, never a value.
- **The relay.** One Realtime SFU app and one TURN key for the account (Mo makes them in the dashboard, HOSTING.md),
  the same for staging and production, each environment holding its own copy of the secrets. The Worker speaks to
  `rtc.live.cloudflare.com` with `httpx` (as `ai/providers.py` does): a session per participant, the teacher's
  microphone published as the track `mic` of her session, each listener's session pulling that one remote track; the
  TURN credentials endpoint gives ICE servers with a 2-hour life, fetched per join and handed to the phone. The phone
  uses the browser's `RTCPeerConnection` only: no script from any other origin, so the staff CSP and the learner
  headers stay exactly as C5 M2 wrote them. Opus, mono, about 32 kbps (`maxaveragebitrate` 32000 in the answer SDP),
  no video transceiver ever. The Worker never sees media: the live routes accept bodies of at most 16 KB (SDP text),
  and a test asserts no route under `/api/m/live` or `/api/m/teacher/live` reads more.
- **Tables** (`migrations/0019_live.sql`): `live_sessions (id, cohort, subject, host, started_at, ended_at, peak,
  listener_min, v, state)` where `host` is the staff label as the Log writes it ("teacher:Teacher A"), `v` a counter
  that grows on every change (the polls' `since`), `state` JSON `{audio: on|off, board: {lesson, step} | null, floor:
  null | {sfu, track, until}, rtc: {sfu: <the teacher's relay session id>}}`; kept 12 months, `state` blanked at
  the end (counts survive). `live_present (session, token_hash, sfu, ticket, ticket_at, joined_at, seen_at, hand_at, reason)`: one row
  per learner in the room, deleted when the session ends; the retention job deletes any row older than 6 hours and ends
  any session with no teacher poll for 10 minutes or older than `max_minutes` plus 15. The privacy suite gains both
  tables' retention rules and the schema scan sees no name-like column. No event verb is added for live classes.
- **Learner routes** (her token, `her_cohort()`, `needs("live")`, consent required as for events):
  - `GET /api/m/live`: the open session of her class, `{id, subject, since, here}` or `{}`; 30 a minute a token.
  - `POST /api/m/live/{id}/join`: refuses a closed session (410), a learner of another class (404), more than 10 joins a
    minute a token (429); writes or refreshes her `live_present` row; answers `{ticket, ice, state, v}`; the ticket is
    16 random bytes, 60 seconds, bound to her token hash and the session, in the `ticket` and `ticket_at` columns of her
    `live_present` row (one at a time), consumed by the next route.
  - `POST /api/m/live/{id}/sdp {ticket, sdp}`: makes her relay session, pulls the teacher's track while `audio` is
    `on` (else makes the session and pulls nothing), answers `{sdp}` (the relay's answer) and `{renegotiate}` when the
    relay asks for one, as its documentation shows; later calls with a fresh ticket repeat the pull (the phone calls
    again when `audio` turns `on`, or after a dropped connection).
  - `GET /api/m/live/{id}/state?v=`: 204 while `v` is unchanged, else `{v, audio, board, floor, over}`; refreshes
    `seen_at`; 20 a minute a token (the phone asks every 5 seconds).
  - `POST /api/m/live/{id}/hand {reason: 1|2|3 | null}`: sets or clears `hand_at` and `reason`; 30 a minute a token.
  - `POST /api/m/live/{id}/leave`: deletes her row.
  - `?cohort=` is never read; a token of another cohort gets 404 as for a session that was never there.
- **Teacher routes** (`/api/m/teacher/live/*`, `hub.staff.who()`, role `teacher` or `admin`, the cohort one of hers else
  403 `not_your_class`, `X-Qalam: 1` on every write):
  - `POST /api/m/teacher/live/start {cohort, subject}`: refuses while a session of that cohort is open (409), when
    today's `per_day` is used (429 `budget`), when the month's estimate reaches the cap (409 `cap`: listener-minutes
    so far this month × 0.24 MB, from `live_sessions`), and the subject must be one of `timetable.SUBJECTS` without
    `auto`, or `class`; writes the row with `audio: off`; answers `{id, ice}`.
  - `POST .../{id}/sdp {sdp}`: makes her relay session and publishes her track `mic`; stores `rtc.sfu`; answers `{sdp}`.
  - `GET .../{id}/roster`: `{v, here, hands: [{alias picture and number, reason, since}], audio, board, floor,
    minutes}`, in hand order; refreshes the teacher's own `seen_at` on the session row. Every 2 seconds; 60 a minute.
  - `POST .../{id}/board {lesson, step} | {}`: a lesson of the class's packs and a step index; `v` grows.
  - `POST .../{id}/lower {alias} | {all: true}`.
  - `POST .../{id}/end`: `ended_at`, `peak` and `listener_min` computed from `live_present`, the rows deleted, `state`
    blanked, the relay sessions left to expire (they close with the connections).
  - The two-learner rule lives in the roster: `audio` is `on` while at least two `live_present` rows were seen in the
    last 30 seconds and the teacher has published; `off` otherwise, after a two-minute grace once it was on; the
    change bumps `v`, so phones pull or stop within 5 seconds.
- **`/api/hello`** gains `live: {id, subject, since} | null` for the asking cohort while `live` is on there (one query);
  the phone re-reads hello as today.
- **Timetable:** `KINDS` gains `live`, allowed fields `{kind, min, subject}`; the admin's editor lists it with its
  subject; `day.js` treats a `live` block as a period whose lesson is the live screen (the Now card's primary is "Live
  class at 10:00" before the start and "Live class: Maths · Join" while a session is open; with no session open
  during the block, "Your teacher is coming" with the bell as for any period). Inside a `live` block the phone polls
  `GET /api/m/live` every 20 seconds; outside one, hello's field is the only source.
- **Admin:** the module row as any other, with the three lock codes (`rtc`, `consent`, `gate`) and their strings;
  under the row, while on, the class's sessions this month ("3 classes, 41 listeners at most, 2.1 hours listened") and
  the month's estimate against the cap; the cap itself is config, shown read-only with "Ask Mo to raise it". The Log
  gains `live.cap` only if a later phase makes the cap a setting; nothing else is logged (the sessions table is the
  record).

## C6.2 The learner's live screen (P30a)

- **Entry:** the Now card's "Join" (primary, the band's big button), or the `home.action` offer "Live class: Maths" at
  priority 25 (under the school day's Now card, above the plan's card) when a session is open outside a block. Early
  years never see it. The tab bar stays where the band has one.
- **The screen** (`#/live/<id>`): header "Live class: Maths" with the page speaker and a `lead` "Listening to your
  teacher" (C5.3), the teacher's sound through one `<audio autoplay>` whose `srcObject` is the pulled track (created on
  the Join tap, a user gesture, so it plays); a large sound drawing (line art, `line: true`) that pulses while audio
  flows and stands still with "Your teacher is coming" while `audio` is `off`; the board below it when set (the step
  drawn by the lesson screen's own renderer in read-only form, picture and text, no answer field; a step her phone
  has not cached is fetched by `GET /api/lessons/{id}` as a lesson is); **one button "Raise my hand"**, 60 px in bold
  bands, 72 px in early-years sizes (not served), with its speaker in `p1` and adult literacy (the P9 look-over rule).
  Tapping it opens three chips, each voiced: "I don't understand", "Please say it again", "I have a question"; her
  choice sends the hand with its reason, the button becomes "Your hand is up · Lower my hand" (a state and its action,
  C5). "Leave the class" is an outline button at the end. When `over` arrives: "The class is over" with "Home".
- **Reconnect:** a dropped connection (ICE `failed` or `disconnected` for 10 seconds) joins again with a fresh ticket,
  silently, up to five times, then "Try again" (C5.4's error screen). Nothing is stored for the live screen on the
  phone except `liveSeen: <id>` so an ended session is not offered again from a stale hello.
- **Never:** no `getUserMedia` on this screen in P30a (a grep test on `app/js/modules/live.js` fails on the name, as the
  `say` step's no-mic rule is checked in the APK); no `MediaRecorder`; no event; no free text; no names. The data line
  "A class uses about 10 MB of data in 40 minutes" shows once, under Join, the first time.
- **Browser check:** 360 px, three languages, light, dark and Bigger text, with a stub `RTCPeerConnection` that
  "connects" and a fake state feed; the speaker rule on every text; the hand's three chips wrap and are never cut.

## C6.3 The teacher's Live tab (P30a)

- The teacher page (`/teacher/`, Access online; never the hub) gains a tab **Live** after Wishes, shown while `live`
  is on for the chosen class. Off the tab: "Live classes are off for this class" (the admin's switch, in words).
- **Before a class:** one row, "Start a class", with a subject chip row (the class's subjects from the timetable's
  list, and "Class"), the day's remaining sessions ("1 of 2 today") and the month's minutes; "Start" asks the browser
  for the microphone (the one permission; the explainer line "Your voice goes live to the class. Nothing is
  recorded." above it) and publishes.
- **In a class:** the top line is the state and its action (C5.2): "Waiting for the class: 1 here" or "Live: 14 here ·
  12 minutes" with "End the class"; "Mute me" (local, the track's `enabled`, drawn as a state: "Muted · Unmute");
  the hands as a list in the order raised, each the alias picture and number, the reason in words and "Lower", with
  "Lower all hands" above the list once two are up; the board: "Show a lesson step" opens the class's lessons (the
  Lessons tab's list) and a step picker (the step titles), "Clear" removes it; no chat, no text to learners.
- **End:** "End the class" confirms as the kill switches do (one tap, one confirm; Escape cancels; focus on
  Cancel, since it cannot be undone); then the summary line "Maths · 38 minutes · 14 at most" and nothing else.
- **Limits in her view:** the `max_minutes` clock ("12 minutes" counts up; at 5 minutes from the end the line says
  "5 minutes left"; the server ends the session at the limit plus a minute's grace and the page says so).
- Polite plural throughout (C5.B2); Persian digits and the class's counts through `num()`; the Live tab at 390 px
  keeps the three-row header of C5.1 and puts the hands under the state line.

## C6.4 The floor for adult-only classes (P30b, off by default)

- **Manifest:** `live` 0.2.0 adds the capability `audio.record` (high) and the setting `floor {bool, false}`;
  `modules.RISK_SENTENCE["audio.record"]` becomes "A learner's voice leaves her phone: live to her class when given
  the floor (adults only, never recorded), or to be written as text (not built).". The admin's confirm shows it.
- **Code, not policy:** `POST /api/m/teacher/live/{id}/floor {alias} | {}` is refused (409 `locked`) unless the
  cohort's every band is `ad`, `floor` is on, and the learner's consent version carries `live: true`; `POST
  /api/m/live/{id}/speak {ticket, sdp}` is refused for any token whose band is not `ad` (403) and for any learner who
  does not hold the floor; the gateway is not involved (no AI). The floor lasts at most 90 seconds, then falls; the
  teacher's "Take back the floor" ends it sooner; one floor at a time; the two-learner rule applies to it too.
- **The phone:** only in the web app over HTTPS (`canRecord()` is false in the APK and on plain http, P27a); the first
  time, the explainer "Your voice goes live to your teacher and the class. Nothing is recorded." with "Speak" and
  "Not now"; while she holds the floor, "You have the floor · 1:30" counting down and "Done"; her track is published
  as `voice` and pulled by the teacher and every listener (the state's `floor` names it; the phones renegotiate as
  for the teacher's track and drop it when `floor` returns to null). Her microphone track is stopped (`track.stop()`)
  the moment the floor ends; a browser test asserts it.
- **Nothing recorded, nothing kept:** no table or event gains anything; `live_present` holds the floor-holder only as
  the state's `sfu` id while it lasts.
- Mixed cohorts (any child band) never get the floor; "Give the floor" is not drawn there. A question for Mo.

## C6.5 Module `contest`: content, routes, data (P31)

- **Manifest** `modules/contest/module.json`: `id: contest`, `version: 0.1.0`, `maturity: pilot`, `depends:
  ["lessons"]`, `bands: p1, p2, s1, s2, ad`, `slots: ["home.action"]`, `capabilities: []`, no `ai`, `settings: per_day
  {int, 3, 1..10}`, `needs: []`, `offline: partly`. Off in every seed. `held()` adds `contest` while no signed contest
  exists on a release host (as `university` waits for its first signed set).
- **Content** `content/contests/<id>.json`: `{id, title: {prs, ps, en}, subject, bands, langs, opens_at, closes_at,
  minutes, items: [{lesson, step}], certificate: bool, scope: "class" | "all"}` (`scope` is advice to the admin, not
  code). `validate_pack.py --contests`: ids unique and lower case; 5 to 30 items; every item a `choice` or `number`
  step of a lesson served to each listed band and language (signed where drafts are not served); the window from one
  hour to 14 days, `minutes` 5 to 60; the title and nothing else in three languages, through the no-promise lint's
  contest list ("prize", "money", "win", "winner", "first", "award"; Dari and Pashto drafts: "جایزه", "پول", "برنده",
  "اول", "مقام"; "انعام", "پیسې", "ګټونکی", "لومړی", "مقام"); the hash printed as `contest:<id>`. Signing: a review
  page `contest:<id>` in `/review/` showing each item as the learner sees it with its answer beside it for the
  reviewer, OK per item at its lesson's current hash, then "Hold to sign" by a subject teacher and the Dari and
  Pashto readers; `pull_signoffs.py` writes the `review` block into the file; in release mode an unsigned contest is
  not served and a signed one whose lesson hashes moved is held with "a lesson changed: sign again".
- **Release per cohort:** the admin's Content page lists signed contests with "Open to this class" per cohort and
  "All classes"; a `releases` row `(pack: "contest:<id>", version: the file's hash, cohort, by, when)` as packs
  write; "Close for this class" writes a release with `version: ""`. Logged as `release` with the contest's id.
- **Learner routes** (her token, `her_cohort()`, `needs("contest")`):
  - `GET /api/m/contest`: contests released to her class for her band and language whose window opens within 7 days
    or is open, `{id, title, subject, opens_at, closes_at, minutes, n, certificate, mine: {percent} | null}` (`mine`
    from her own `contest.done` event); 30 a minute a token.
  - `GET /api/m/contest/{id}`: inside the window only (404 before, 410 after): the items as the lesson route serves
    a step, without `answer` and `why` (`lesson_for_app`'s rule, applied by a `strip_key()` with its own test);
    marked `started` for her in `daily_counts` (module `contest`, counted against `per_day`).
  - `POST /api/m/contest/{id}/answers {answers: [index | string], started}`: once a token (409 after); within the
    window plus 10 minutes (410 after); consent required (the event carries her hash); marks by code: a `choice` by
    index, a `number` by `mathcheck.plain()` and `textnorm.digits_to_latin()` with the sheet rule that an unsimplified
    fraction counts; writes `contest.done` (object the contest id, value the percent; a new entry in `events.VERBS`,
    hub-written, object kind `contest` with its own regex `^[a-z][a-z0-9-]{1,47}$`); answers `{right, n, percent}`;
    keeps no per-item answer anywhere.
  - `GET /api/m/contest/{id}/key`: from `closes_at` only (404 before): `[{answer, why}]` in item order, for the phone
    to mark her kept answers.
- **Teacher:** `GET /api/m/teacher/contests?cohort=`: each released contest with "took part" counts and, per alias in
  alias-number order, `{picture, number, band, percent}`; never sorted by `percent` (a test shuffles scores and asserts
  the order is unchanged). **Admin:** counts per class and in all on the Content row; nothing per learner.
- **Certificate:** `mods/cert.py` accepts `path = "contest:<id>"`: the contest must say `certificate: true` and be
  released to her class; her events must hold `contest.done` for it; the row's `course` is `contest:<id>`,
  `version` the file's hash; the paper reads "took part in <title>" with the month, never a score; `GET
  /api/cert/<id>` and `/v/<id>` show the contest's title from the file. `cert.can_certify` learns the branch.
- **Data kept:** the `contest.done` event (12 months with events), the `releases` rows (permanent), `daily_counts`
  (two days), certificates as C4.2. On the phone: `contests: [{id, joined, answers, percent, n, at}]`, at most 50,
  checked by `state.js`, and the best per subject derived from it.

## C6.6 The contest screens (P31)

- **Entry:** a `home.action` offer "Contest: Maths week 3" at priority 20 (a list row, not the primary) while a
  released contest is open or opens within 7 days; the subject page's rows gain "Contests" when any exists; nothing
  for `ey`.
- **The card** (`#/contest/<id>`): title, "10 questions in 20 minutes", "Opens 3 Aqrab" or "Until 5 Aqrab" in her
  calendar and digits, the alias picture and number beside "You", and one button: "Join the contest" (before the
  window: "Remind me" is not built; the row simply stays), then "Start" inside the window. Below, her best in that
  subject if any ("Your best in Maths: 8 of 10"). Away from the hub and the internet: "Contests need the hub or the
  internet" in place of the button.
- **The run:** one question a screen, the lesson screen's own `choice` and `number` renderers in contest form (no
  "Why?", no hint, no "Check my answer": she answers and goes on; Back changes an earlier answer until she sends);
  "{m} minutes left" in the header's chip place, never read aloud; at zero the phone sends what she has. "Send" asks
  once ("Send your answers? You cannot change them after.") with focus on Cancel.
- **The result:** "Sent. You took part!" (adult tone: "Sent. You took part.") with "7 of 10 right" on `--good-soft`;
  "The answers show when the contest closes" until `closes_at`, then "See the answers", which marks her kept answers
  against the key and shows each question with hers and the right one, as Check my sheet's review does; "My
  certificate" where the contest has one (the `cert` screen with its consent check, printed as C4.2). No class list,
  no place, no comparison with anyone.
- **Browser check:** 360 px, three languages, light, dark, Bigger text; no hint button anywhere on the run; the
  countdown is one line; the result screen's speaker reads the score in her digits.

## C6.7 The strings (drafts)

Learner strings go in `i18n.js` as `{child, adult}` where the tone changes; teacher strings in the three staff files,
the polite plural; every one voiced by P36. Dari and Pashto are drafts for the native speakers.

| key | English | Dari (draft) | Pashto (draft) |
|---|---|---|---|
| live_title | Live class | صنف زنده | ژوندی ټولګی |
| live_at | Live class at {t} | صنف زنده ساعت {t} | ژوندی ټولګی په {t} بجو |
| live_join | Join | شامل شو | ګډون وکړه |
| live_coming | Your teacher is coming | معلمت می‌آید | ښوونکی دې راځي |
| live_listening | Listening to your teacher | به معلمت گوش می‌دهی | خپل ښوونکي ته غوږ نیسې |
| live_hand | Raise my hand | دستم را بلند می‌کنم | لاس پورته کوم |
| live_hand_up | Your hand is up | دستت بلند است | لاس دې پورته دی |
| live_lower | Lower my hand | دستم را پایین می‌کنم | لاس ښکته کوم |
| live_r1 | I don't understand | نفهمیدم | نه پوهېږم |
| live_r2 | Please say it again | لطفاً دوباره بگو | مهرباني وکړه بیا یې ووایه |
| live_r3 | I have a question | یک سوال دارم | یوه پوښتنه لرم |
| live_board | Your teacher is showing this | معلمت این را نشان می‌دهد | ښوونکی دې دا ښيي |
| live_leave | Leave the class | از صنف بیرون شو | له ټولګي ووځه |
| live_over | The class is over | صنف تمام شد | ټولګی پای ته ورسېد |
| live_data | A class uses about 10 MB of data in 40 minutes. | یک صنف در ۴۰ دقیقه حدود ۱۰ مگابایت انترنت مصرف می‌کند. | یو ټولګی په ۴۰ دقیقو کې شاوخوا ۱۰ مېګابایټ انټرنېټ لګوي. |
| live_speak (adults) | Speak | صحبت کنید | خبرې وکړئ |
| live_explain (adults) | Your voice goes live to your teacher and the class. Nothing is recorded. | صدای شما زنده به معلم و صنف می‌رسد. چیزی ثبت نمی‌شود. | ستاسو غږ ژوندی ښوونکي او ټولګي ته رسېږي. هېڅ شی نه ثبتېږي. |
| live_floor | You have the floor | نوبت صحبت شماست | د خبرو وار ستاسو دی |
| contest | Contest | مسابقه | سیالي |
| contest_join | Join the contest | در مسابقه شامل شو | په سیالۍ کې ګډون وکړه |
| contest_opens | Opens {d} | {d} شروع می‌شود | {d} پیلېږي |
| contest_until | Until {d} | تا {d} | تر {d} پورې |
| contest_shape | {n} questions in {m} minutes | {n} سوال در {m} دقیقه | {n} پوښتنې په {m} دقیقو کې |
| contest_start | Start | شروع کن | پیل کړه |
| contest_left | {m} minutes left | {m} دقیقه مانده | {m} دقیقې پاتې دي |
| contest_send | Send | بفرست | ولېږه |
| contest_send_q | Send your answers? You cannot change them after. | جواب‌هایت را بفرستم؟ بعد از آن نمی‌توانی عوضشان کنی. | ځوابونه دې ولېږم؟ وروسته یې نه شې بدلولی. |
| contest_sent | {child: Sent. You took part!, adult: Sent. You took part.} | فرستاده شد. تو شرکت کردی! / فرستاده شد. شما شرکت کردید. | ولېږل شو. تا ګډون وکړ! / ولېږل شو. تاسو ګډون وکړ. |
| contest_result | {a} of {b} right | {a} از {b} درست | {a} له {b} سم |
| contest_best | Your best in {s}: {a} of {b} | بهترینت در {s}: {a} از {b} | ستا غوره په {s} کې: {a} له {b} |
| contest_after | The answers show when the contest closes | جواب‌ها بعد از ختم مسابقه نشان داده می‌شوند | ځوابونه د سیالۍ له پای ته رسېدو وروسته ښکاري |
| contest_answers | See the answers | جواب‌ها را ببین | ځوابونه وګوره |
| contest_offline | Contests need the hub or the internet | مسابقه به هب یا انترنت ضرورت دارد | سیالۍ هب یا انټرنېټ ته اړتیا لري |
| cert_took_part (paper) | took part in | شرکت کرد در | ګډون یې وکړ په |
| teacher: live | Live | زنده | ژوندی |
| teacher: start_class | Start a class | صنف را شروع کنید | ټولګی پیل کړئ |
| teacher: live_explain | Your voice goes live to the class. Nothing is recorded. | صدای شما زنده به صنف می‌رسد. چیزی ثبت نمی‌شود. | ستاسو غږ ژوندی ټولګي ته رسېږي. هېڅ شی نه ثبتېږي. |
| teacher: waiting | Waiting for the class: {n} here | در انتظار صنف: {n} نفر حاضر | د ټولګي انتظار: {n} حاضر دي |
| teacher: live_here | Live: {n} here · {m} minutes | زنده: {n} نفر حاضر · {m} دقیقه | ژوندی: {n} حاضر · {m} دقیقې |
| teacher: mute | Mute me | صدای خود را قطع کنید | خپل غږ بند کړئ |
| teacher: muted | Muted · Unmute | قطع است · وصل کنید | بند دی · خلاص کړئ |
| teacher: hands | Hands | دست‌ها | لاسونه |
| teacher: lower | Lower | پایین کنید | ښکته کړئ |
| teacher: lower_all | Lower all hands | همه دست‌ها را پایین کنید | ټول لاسونه ښکته کړئ |
| teacher: show_step | Show a lesson step | یک مرحلهٔ درس را نشان دهید | د درس یو ګام وښایاست |
| teacher: clear_board | Clear | پاک کنید | پاک کړئ |
| teacher: end_class | End the class | صنف را ختم کنید | ټولګی پای ته ورسوئ |
| teacher: end_q | End the class for everyone? | صنف را برای همه ختم کنید؟ | ټولګی د ټولو لپاره پای ته ورسوئ؟ |
| teacher: give_floor | Give the floor | اجازهٔ صحبت بدهید | د خبرو اجازه ورکړئ |
| teacher: take_floor | Take back the floor | اجازهٔ صحبت را پس بگیرید | د خبرو اجازه بېرته واخلئ |
| teacher: live_off | Live classes are off for this class | صنف‌های زنده برای این صنف خاموش است | د دې ټولګي لپاره ژوندي ټولګي بند دي |
| teacher: contests | Contests | مسابقه‌ها | سیالۍ |
| teacher: took_part | {a} of {b} took part | {a} از {b} شرکت کردند | {a} له {b} ګډون وکړ |
| admin: locked_rtc | locked until the audio service is set up | تا تنظیم سرویس صوتی قفل است | تر هغه قفل دی چې د غږ خدمت تنظیم شي |
| admin: locked_consent | locked until this class's consent text names live classes | تا وقتی متن رضایت این صنف صنف‌های زنده را نام نبرد، قفل است | تر هغه قفل دی چې د دې ټولګي د رضایت متن ژوندي ټولګي ونوموي |
| admin: locked_gate_live | waits for D9 and the legal opinion | منتظر تصمیم D9 و نظر حقوقی | د D9 پرېکړې او حقوقي نظر په تمه |
| admin: locked_gate_contest | waits for the legal opinion | منتظر نظر حقوقی | د حقوقي نظر په تمه |
| admin: live_month | {n} classes this month, {m} hours listened, {g} GB of {cap} | {n} صنف در این ماه، {m} ساعت شنیده شد، {g} از {cap} گیگابایت | په دې میاشت کې {n} ټولګي، {m} ساعته اورېدل شوي، {g} له {cap} ګیګابایټ |
| admin: open_to_class | Open to this class | برای این صنف باز کنید | دې ټولګي ته یې پرانیزئ |
| admin: all_classes | All classes | همهٔ صنف‌ها | ټول ټولګي |

## The phases, and what is on by default

| Phase | Builds | On by default | Admin switches and locks | New on the server |
|---|---|---|---|---|
| P30a (M) | module `live`: the relay plumbing (sessions, tracks, TURN credentials), the learner routes, the teacher routes, `hello.live`, the timetable kind `live`, the learner's live screen, the teacher's Live tab, the admin's row, locks and month line, the retention rules | no, in every cohort; never on a hub (`held`) | per cohort, locked by `rtc`, `consent` and `gate`; settings `max_minutes` 45, `per_day` 2; the cap `TUTOR_RTC_GB_MONTH` 900 in config | `live_sessions` (12 months, counts), `live_present` (deleted at the end, 6 hours at most); four secrets; nothing about anyone |
| P30b (S) | the floor for adult-only cohorts: `audio.record` on the manifest, the setting `floor`, the floor and speak routes, the explainer, "Give the floor" | no; `floor` off even where `live` is on | `floor` per cohort, refused unless every band is `ad` and the consent version carries `live: true` | nothing |
| P31 (M) | module `contest`: the content files, the validator and lint, the review page and signing, releases per class, the learner and teacher routes, the certificate branch, the screens | no, in every cohort | per cohort, locked by `gate` where `TUTOR_RELEASE` is on; `per_day` 3; releases per class on Content | the verb `contest.done` (12 months); `releases` rows; `daily_counts` use |

The pilot cohort takes none of the three (the Stage D freeze); staging takes all three for the committee's look.

## Tests

- **P30a, hub tests on both stores:** join needs her token and consent; a session of another class is 404 and
  `?cohort=` is ignored (C5.A1's pattern); a ticket works once and dies at 60 seconds; the teacher's routes need
  `X-Qalam: 1` and her own class (`not_your_class`); `start` refuses a second open session, the day's third, the
  month's cap and an unknown subject; `audio` is `off` with one learner and `on` with two, off again after the grace;
  `end` deletes every `live_present` row and blanks `state`; the retention job ends a session with no teacher poll for
  10 minutes and deletes stale rows; `held()` holds `live` without the secrets and the hub never lists it; the three
  locks refuse the switch with their codes; `hello.live` is null off and set on; no live route reads a body over 16
  KB; the floor route is absent in P30a; the privacy suite's retention and schema rules cover the two tables; the
  Worker test's query bound for a fresh database rises by one migration batch only. The relay is a fake in tests (a
  `FakeRTC` that answers the session and track calls and records what was sent: never audio, never a token).
- **P30a, browser:** the live screen's state machine with a stub `RTCPeerConnection` (Join, listening, hand with a
  reason, lowered, the board, over); `getUserMedia` and `MediaRecorder` never referenced on the learner's screen;
  the APK stub (`QalamAndroid` present) shows the same screen; the teacher's Live tab at 390 and 1366 px in three
  languages; the speaker rule; the contrast and clipping rules; Bigger text.
- **P30b:** the floor refused for a non-`ad` token, for a mixed cohort, without `floor`, without `live: true`; it
  falls at 90 seconds; "Take back" ends it; the browser test asserts the microphone track is stopped when it ends and
  that no "Speak" button exists in the APK stub.
- **P31, hub:** the validator (items, window, lint words in three languages); `strip_key()` leaves no `answer` or
  `why` in the questions response (a leak test with every key value as a sentinel); marking by code for `choice` and
  `number` (fractions, Persian digits, an unsimplified fraction right); one entry a token; late within 10 minutes;
  the key route 404 before `closes_at` and 200 after; the event's shape and that a phone cannot send `contest.done`;
  the teacher's order unchanged under shuffled scores; releases per class and "All classes"; the certificate branch
  (needs `certificate: true`, a release and her event; the paper has no score); the lock `gate` on a release host;
  the hub marks offline on SQLite as the Worker does on D1.
- **P31, browser:** the card, the run (no hint, no why, the countdown), send with focus on Cancel, the result, the
  answers after closing, the certificate; three languages, light, dark, Bigger text at 360 px.
- **Both:** `validate_modules.py` passes the two manifests; `check_staff_strings.mjs` finds `module.live`,
  `module.contest`, the four lock strings and the error codes; the string files' drafts are marked.

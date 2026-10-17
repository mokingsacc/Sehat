# C5 specs: the member's draft, accepted by the chair with amendments

Filed by the builder on 17 October 2026 from the design committee's folder, unchanged but for this heading and the
member's model name. It is the builder's detail for every C5 item the chair accepted. Where the chair's decisions
differ (DESIGN.md, "C5 decisions": the replacement specs C5.1 to C5.6, the amendments to B4 items 2, 3, 4, 5 and 10,
the chair's two further items, and the twelve answers), the decisions win. In particular: the staff picker moves to
its own row under 760 px (not 480 px); the polite plural on every staff page; the kill switches are a state line with
its action; one Access application with independent MFA for everyone (no second application, no
`TUTOR_ACCESS_ADMIN_AUD`); "بلی" everywhere in Dari; part A (security) was built separately at 8a13e9a9.

## The draft


Reviewer: the first member of the two-person C5 review. Date: 17 Oct 2026. For the chair, then the builder.

- **Code read:** `tutor/` at 12928322 ("the AI provider switch", committed during this review on top of 70d86bd2).
  Line numbers are at 12928322; they match 70d86bd2 for every file the switch did not touch. Nothing in the repository
  was changed by this review.
- **How each finding was checked:** "ran" means a script drove the committed hub (a scratch copy, online mode, fake AI)
  and saw the result, at 70d86bd2 and again at 12928322; "read" means the code says so plainly.
- **Screenshots:** 29 staff screens and 26 learner screens, Playwright with Chromium, the hub started from the
  committed code at 70d86bd2 the way `tools/browser_check.mjs` expects, seeded with made-up classes, then stopped
  (the provider switch adds one admin card, not in the shots). Learner shots
  are 360 px wide (light, dark, Bigger text; Dari, Pashto, English). Files: `c5-shots/` (index at the end).
- **Cloudflare Access facts** were checked against Cloudflare's own documentation (two look-ups): the Access cookie
  `CF_Authorization` is `SameSite=None` unless the admin picks Lax or Strict; HttpOnly is on by default; a binding
  cookie can be switched on; a session lasts 24 hours unless the application or policy sets another length;
  independent MFA (April 2026) asks for an authenticator app (TOTP), a security key or the device's biometrics, set
  for the whole account, one application or one policy; the one-time PIN by email is a way to sign in, not a second
  factor.

## The short version

1. **Three high findings, all verified.** (H1) A learner's phone decides which class's safety switches apply to her
   question by adding `?cohort=` to the request: with AI switched off for `open`, an `open` learner who names
   staging's id gets an AI answer, charged to staging (ran). The same door skips the teacher's hold, the budget,
   module switches and, since this morning, the provider choice. (H2) Online, every request without a learner token
   shares one rate-limit bucket, so the 21st new learner in an hour cannot join, with or without a class code (ran).
   (H3) The consent texts name OpenAI online and promise "nothing is sent over the internet" on the hub, while the
   new provider switch can send a class's questions and sheet photos to Anthropic, Google or any compatible server
   from the next question (read).
2. **Four medium, eight low.** The most useful medium fixes are small: a custom header on staff writes plus a Lax
   Access cookie (forged requests), a `_headers` file (framing and CSP), MFA for every staff member (no second list
   to keep), and marking hub sign-offs made with the shared PIN.
3. **Login set-up:** Cloudflare Access with the email code and Google as the ways in, independent MFA (the phone's
   fingerprint or face unlock, a security key, or an authenticator app) for every staff member, a Lax cookie with the
   binding cookie, 24-hour sessions, a custom domain with `workers.dev` off; on the hub, the two PINs as now, changed
   each term (A2).
4. **Staff languages:** the admin panel is 58% Dari and 0% Pashto; teacher and review are fully Dari, no Pashto;
   nothing is remembered. A three-way switch on every staff page, one string file per language, Persian digits,
   Solar Hijri dates and drafts marked as drafts (B2). Ten usability changes for a non-technical admin (B4).
5. **Learner app:** already clean (26 of 26 screens pass contrast, clipping, direction and speaker checks). Nine
   polish items, chiefly a quieter header at 360 px and an error screen with a way out (Part C).

---

## Part A. Security

### A1. Findings, ranked

| # | Rank | Finding | Where | Checked |
|---|---|---|---|---|
| H1 | High | `?cohort=` from the phone picks the class whose kill switch, hold, budget, provider and modules apply | server.py:397-404, 588; mods/photo.py:149, cert.py:52, plan.py:103 | ran |
| H2 | High | Online, every tokenless request shares one limiter key, "?" | server.py:387-388, 516 | ran |
| H3 | High | Consent texts name OpenAI (online) and "nothing leaves the village" (hub); the switch sends anywhere | content/consent/*; ai/policy.py:1-16 | read |
| M1 | Medium | Staff writes without a body can be forged from another site (CSRF) | admin.py:411-418; mods/teacher.py:389-399 | ran (part) |
| M2 | Medium | No security headers on any page: staff pages can be framed; no CSP | wrangler.production.toml:22-24; server.py:684 | read |
| M3 | Medium | The admin's second factor rests on an Access list kept apart from the panel's roles | staff.py:159-170; HOSTING.md:185-187 | read |
| M4 | Medium | On a hub, the shared teacher PIN can sign lessons for any role, and those signatures can reach a release | mods/review.py:169-176, 297; tools/pull_signoffs.py:9-10, 34-41 | read |
| L1 | Low | Lock reset codes and other teacher actions are in no log | mods/teacher.py:389-399 | read |
| L2 | Low | Hub PIN lock counts per address; a phone that reconnects gets fresh tries | server.py:229-252 | read |
| L3 | Low | Every unknown key id makes the Worker fetch Access's keys again | staff.py:125-130 | read |
| L4 | Low | Ask's `subject` and `lesson` have no length limit | server.py:52, 54 | read |
| L5 | Low | Hub backups to USB carry both PIN files and `hub.db` in the clear | HUB-SETUP.md:106 | read |
| L6 | Low | The APK sends her online token to whatever answers first at a hub address, over plain http | app/js/hub.js:11, 67-80, 116-127 | read |
| L7 | Low | Hub packages are pinned without hashes | hub/requirements.txt | read |
| L8 | Low | The review page has no Sign out | app/js/review/review.js | read |

#### H1. The phone's `?cohort=` decides which class's safety switches apply

- **What the code does.** The route guard `needs()` reads only the query (server.py:397-404; `needs_any` the same at
  463-468): with no `?cohort=` it checks the hub's default cohort (`open` online), not hers. `/api/ask` takes the
  query before her token's cohort (server.py:588) and passes it to the brain and gateway, which read that cohort's
  kill switch, budget, hold-for-teacher and, since 12928322, provider and model (ai/gateway.py:77-87, 133-141). Photo
  marking (mods/photo.py:149), certificates (mods/cert.py:52) and plans (mods/plan.py:103, tokenless) do the same, and
  three event counts go to the named cohort (server.py:610, 634, 756). `mods/made.py:64` already does it right: "her
  own class only ... never one a link names".
- **Ran.** Online mode, fake AI. A learner joined `open`; AI was switched off for `open` exactly as the admin's kill
  switch does (admin.py:309-322). The same question asked twice: in her own cohort, no AI answer; with
  `?cohort=qg1j2918yx` (staging's id, printed in `cohorts/staging.json`), an AI answer, and 228 tokens charged to
  staging's budget.
- **Attack path.** Any learner (or anyone who joins `open`, which needs no code) adds a query parameter with a
  browser's developer tools or any HTTP client. The ids of `open`, `staging` and `hub` are in the repository; a
  learner's own class id is on her phone. Results: the P21 kill switch for one class does not hold; C4.1's "open's AI
  is off" does not hold; the P20 hold is skipped, so an unchecked AI answer reaches a child in a class whose teacher
  holds answers; one class spends another's budget; the phone picks the provider; a module switched off for her
  class still answers; questions land in another class's teacher queue.
- **Smallest fix.** One helper in server.py, `her_cohort(request, who)`: with a learner token, her row's cohort,
  always (a different `?cohort=` is ignored, or refused with 403); without a token, the hub's own cohort
  (`hub.cohort_id`, which is `open` online). Use it in `needs()` and `needs_any()` (look the token up once with
  `hub.learner(request, required=False)`; homework's check is covered there), in ask, photo, cert and plan, and in
  the three `record()` calls. Keep `?cohort=` only for tokenless reads that spend and store nothing (`/api/hello`, the timetable). A
  shared phone is unaffected: each learner's request carries her own token, hence her own class.
- **Tests.** The run above gives no AI answer and charges nothing to staging. A learner of a class whose `ask` is off
  gets 404 with and without `?cohort=`. A class with hold on holds the answer whatever the query says.

#### H2. Online, all tokenless requests share one rate-limit bucket

- **What the code does.** `_who()` returns `request.client.host`, else "?" (server.py:387-388). The Workers Python
  ASGI adapter (workers-runtime-sdk `asgi.py`, the copy the Worker build bundles) builds the request scope with no
  `client` entry, so online `request.client` is always None and every tokenless caller is "?". The join limit is 20
  an hour (server.py:184, 516); certificate checks (673), PDFs (717) and tokenless plans (mods/plan.py:101) count
  the same way. Limits live in memory, so this is per isolate, which a pilot's traffic shares.
- **Ran.** The committed app with a scope that carries no client address: the 21st join within the hour got 429.
- **Attack path.** None needed: the 21st new learner of the hour, by class code or by the open door, is told to wait.
  On purpose, 20 requests an hour keep the door shut for everyone.
- **Smallest fix.** Online, `_who()` reads `CF-Connecting-IP` (Cloudflare sets it at the edge and overwrites any copy
  a client sends); the hub keeps the socket address. For `/api/join`, count only wrong class codes against an address
  (20 an hour still makes guessing an 8-of-31 code hopeless) and allow successful joins up to a high ceiling, say
  300 an hour, because a school's Wi-Fi or a mobile carrier puts a whole class behind one address.
- **Tests.** 25 joins with different `CF-Connecting-IP` values succeed; 21 wrong codes from one address get 429; 30
  right codes from one address succeed.

#### H3. Consent says OpenAI, or nothing leaves the village; the provider switch can send anywhere

- **What the texts say.** `content/consent/en/online-2026-10.json:10` and `:16` (the same in prs and ps): questions
  and sheet answers go to "OpenAI in the United States", kept up to 30 days. `content/consent/en/hub-2026-10.json`:
  "Everything stays on this centre's computer: nothing is sent over the internet."
- **What the code now allows.** Any cohort may pick `anthropic`, `openai`, `gemini`, `openai_compat`, `local` or `fake`
  in the admin panel, used from the next question (admin.py:389-410, ai/gateway.py:77-87). ai/policy.py:1-16 checks
  hosts and says "no code gate stands for" the providers' terms. Staging's default is now Claude. Nothing ties the
  choice to what the learner's guardian agreed to, and on a hub with a key in its environment the hub admin can send
  questions over the internet.
- **Why it matters.** A guardian agreed to one named company on stated terms. The panel can change the company for a
  whole class with one save, with no new consent and no sign to the family. These are children's words and photos
  of their work; the risk is to trust and to the law, and it can happen by a well-meant click.
- **Smallest fix.** In ai/policy.py, a table of the providers each consent version names (online-2026-10: `openai`,
  `fake`; hub-2026-10: `local`, `fake`, and `openai_compat` only on the hub's own network). The settings route refuses
  any other provider with a sentence ("Learners in this class agreed to OpenAI only. A new consent text is needed
  first."), and the gateway refuses it again at call time. A new consent version that names Anthropic or Google and
  their retention is content for the owner and the reviewers; the app already asks again when the version changes
  (`CONSENT_VERSIONS`). Test accounts on staging are not affected if staging keeps its own version.
- **Tests.** Online, saving `anthropic` for a cohort returns 422 while the consent version does not name it; on a hub,
  `openai` is refused.

#### M1. Staff writes without a body can be forged from another site

- **What.** Online, the staff gate trusts the Access cookie, which is `SameSite=None` by default, so a staff member's
  browser sends it on a form posted from any website. Routes that change something and take no JSON body accept such
  a form: a new class code (admin.py:411-418; the old code stops working at once) and a learner's lock reset code
  (mods/teacher.py:389-399). JSON routes are safe: a cross-site form can send only `text/plain`, which the app refuses
  (ran: 422). DELETE needs a preflight, which CORS refuses online (server.py:421-422). On the hub the PIN travels in a
  header, which a form cannot set.
- **Attack path.** A signed-in admin opens a page that posts a hidden form to `/api/m/admin/cohorts/<id>/code`. The
  class code changes; the printed class cards stop working mid-term; the Log shows the change under her own name.
- **Smallest fix.** Mo sets the Access application's cookie to `SameSite=Lax` (Lax, not Strict, which can break the
  sign-in redirect). In code, `Gate.who()` and `Gate.admin()` refuse a request that is not GET without the header
  `X-Qalam: 1` (403), and the three staff pages' `api()` helpers add it (one line each). A custom header cannot cross
  sites without a CORS preflight, which online is allowed only for the APK's origin. This also covers body-less routes
  added later.
- **Test.** Online, POST to the code route without the header: 403; with it: 200.

#### M2. No security headers on any page

- **What.** The app and the staff pages are static files served before the Worker (wrangler.production.toml:22-24)
  and there is no `_headers` file; the only security header anywhere is `Referrer-Policy` on `/v/` (server.py:684).
  The hub's static files carry none either.
- **Attack path.** Another site frames `/admin/` in an invisible frame (the cookie is sent, see M1) and lines up a
  decoy over "AI off" or a module switch; each confirm dialog is a second click the decoy can also stage. There is
  also no CSP to blunt a future `innerHTML` mistake (today's uses are safe, see "Checked and fine").
- **Smallest fix.** `worker/build.py` writes `build/public/_headers` (Workers static assets read it; confirm with
  `curl -I` on staging after the deploy):
  - for `/admin/*`, `/teacher/*`, `/review/*`: `Content-Security-Policy: default-src 'self'; img-src 'self' data:
    blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
    `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`;
  - for `/*`: `Content-Security-Policy: frame-ancestors 'none'` and `X-Content-Type-Options: nosniff` (a full CSP for
    the learner app later, once tested with the hub addresses and audio).
  - On the hub, a small middleware adds the same headers to the staff pages' HTML.
- **Tests.** The headers are present; the teacher's answer sheet (opened as a blob) and the admin's class cards still
  print.

#### M3. The admin's second factor depends on a list kept outside the panel

- **What.** There is one Access application and one audience tag (staff.py:66-95; HOSTING.md:185-187, "with a second
  factor for admins"). The admin role comes from the `staff` row in D1 (staff.py:159-170), which the panel's Staff
  page can set (admin.py:634). A teacher promoted to admin in the panel is an admin without a second factor until
  someone also moves her email into the Access policy that asks for one. Separately, `workers_dev = true`
  (wrangler.production.toml:10) keeps a second public hostname; harmless with one Access application (no token can be
  had there), but with two applications it would be a way around the stricter one.
- **Smallest fix.** Mo requires independent MFA for every staff member on the one application, so no list decides
  who gets a second factor (A2). Only if the chair wants admins under a stricter policy than teachers: two
  applications and a fourth secret, `TUTOR_ACCESS_ADMIN_AUD`; `Gate.admin()` accepts only a token with that audience
  (about 15 lines). Either way, `workers_dev = false` in production once the custom domain serves.

#### M4. Hub sign-offs made with the shared teacher PIN can become release signatures

- **What.** With a PIN there is no staff row, so the role is whatever the request names (mods/review.py:169-176) and
  the initials are typed (297). `tools/pull_signoffs.py --db data/hub.db` copies a hub's signatures into the packs
  (9-10, 34-41). Gates that rest on a role, such as the Hanafi scholar's signature that holds the Quran reader on a
  release hub (server.py:349), or the Dari and Pashto readers, can then be met by anyone who knows the one PIN.
- **Smallest fix.** Store how each signature was made (`via`: `pin` or `access`) in `signoffs`; `pull_signoffs.py`
  skips `via=pin` rows unless `--hub-ok "<who vouches>"` is given; `validate_pack.py --release` lists them. Or decide
  that release signatures are made online only, where each reviewer is a named row (question 6).

#### Low

- **L1. Teacher actions are not logged.** A lock reset code (mods/teacher.py:389-399) opens a learner's private
  curtain on her phone, yet no log records who made it. Log "lock code for #12" with the teacher's label, never the
  code; the admin's Log can show teacher lines too.
- **L2. Hub PIN lock per address** (server.py:229-252): five wrong tries lock that address for 1, 15, then 60 minutes.
  A learner whose phone rejoins the Wi-Fi with a new random address gets five fresh tries each time. Add a hub-wide
  count: after 30 wrong PINs in an hour, every PIN check waits 10 seconds; the admin's Safety page shows "wrong PINs
  today". PINs are six digits and `new-pin` / `new-admin-pin` already exist.
- **L3. Key refetch per unknown key id** (staff.py:125-130): a token with a made-up `kid` makes the Worker fetch the
  team's keys on every request. Remember a miss for 60 seconds.
- **L4. No length limit on Ask's `subject` and `lesson`** (server.py:52, 54): stored with every question and shown to
  the teacher. Add `max_length` (40 and 80). The prompt itself is safe: the subject is looked up, not pasted.
- **L5. Hub backups in the clear** (HUB-SETUP.md:106: copy `/var/lib/qalam` to a USB stick weekly): the stick holds
  both PIN files and the database. A `python -m tutor_hub backup` that leaves the PIN files out and encrypts to Mo's
  public key, as the online export does (HOSTING.md:307-309).
- **L6. Her online token can go to a stand-in hub.** The APK tries the hub addresses first, including
  `192.168.4.1:8080` (hub.js:11, 67-80), keeps the first that answers `/api/hello`, and sends her token to it over
  plain http (hub.js:124); a server that does not know it makes the phone forget it (account.js:105-107). A device at
  one of those addresses on any Wi-Fi could keep the token and read her private questions online. Keep each token
  with the server that issued it (hello's hub id) and send it nowhere else.
- **L7. Hub packages without hashes** (hub/requirements.txt pins versions only; the Worker's worker/pylock.toml is
  hashed). Generate a hashed lock for the hub install.
- **L8. No Sign out on the review page** (review.js has none; teacher.js:181 and admin.js:210 do). Reviewers on
  shared computers need it.

#### Checked and fine

- **Access tokens:** RS256 only, key by `kid`, signature, audience, issuer, expiry, not-before and an email are all
  checked in plain Python (staff.py:66-95); the email is looked up as a peppered hash on every request (staff.py:39,
  150-156), so removing someone in the panel shuts them out at their next click; the last admin cannot be removed
  (admin.py:668); a missing setting turns staff pages off (404), not open (staff.py:173-181).
- **Who sees what:** a teacher sees only her listed classes, and every action by number checks the item's class
  (mods/teacher.py:192-200, 283-291, 301-308); reviewers cannot open the teacher dashboard; admin routes check the
  admin role.
- **Learner text on staff pages** is written with `textContent` through `h()` on all three pages. Every `innerHTML`
  use is safe: the certificate paper is escaped on the server and the name is set as text (cert.py `paper_body`,
  modules/cert.js:57-59); the class-card QR is a matrix with no text (qr.py:287, admin.js:590); the rest are the app's
  own icons and drawings.
- **Codes and PINs:** class codes are 8 of 31 characters, stored hashed (learners.py:30, 44-55); learner tokens are
  `token_urlsafe(24)`, stored hashed; lock reset codes are 6 digits, 15 minutes, 5 tries, bound to her token
  (server.py:563-575); hub PINs come from `secrets`, file mode 600, with a separate admin PIN and count
  (server.py:134-145, 229-232). The phone's own lock is a curtain (4 digits, 10,000 hashing rounds on the phone,
  lock.js:14): it keeps a sibling out, not a thief, which is what its words promise.
- **CORS** online allows only the APK's origin and no credentials (server.py:421-422). **APK:** file and content
  access off, navigation kept to its own origin, camera only for its own page, plain http only to the three hub
  addresses (MainActivity.java:93-108, 183-218, 244-258; network_security_config.xml); the bridge's methods are
  alarms, notifications, print and settings only.
- **Secrets and supply chain:** provider keys only from Worker secrets or the environment (worker/entry.py:57-60),
  never returned (the panel gets set or not set, admin.py:299-307); GitHub Actions pinned by commit hash; the
  Worker's packages hashed. **Backups online:** weekly encrypted export and 30 days of D1 Time Travel.
- **Admin log:** module switches, kill switches, settings (now including the provider), codes, releases, rollbacks,
  wishes and staff changes are logged with the admin's label (admin.py:172-173, 675-692).

### A2. Login set-up: what Mo configures, what the code enforces

**Online staff (Cloudflare Access).** One self-hosted application covering `/admin/*`, `/api/m/admin/*`,
`/teacher/*`, `/api/m/teacher/*`, `/review/*`, `/api/m/review/*` on the production custom domain (HOSTING.md:185).

| Setting | Choose | Why |
|---|---|---|
| Ways to sign in | One-time PIN (a code by email) and Google; nothing else | The email code works for any address, no account needed; Google for those who have it |
| Second factor | Independent MFA required on this application: the device's fingerprint or face unlock, a security key, or an authenticator app | An email code alone is one factor: whoever reads the mailbox gets in. Same rule for all staff: no second list (M3) |
| Admins' factors | Mo and each admin register two: a security key or the phone's fingerprint, and a spare | A lost phone does not lock the project out |
| Who may sign in | An Access list "Qalam staff" (emails), one Allow policy | The panel's Staff page adds the row; the list adds the door (B4 item 6 reminds) |
| Session | 24 hours (the default) | One sign-in a working day; Sign out ends it at once |
| Cookie | SameSite Lax, HttpOnly on, binding cookie on | Stops forged writes (M1) and a copied cookie being used elsewhere |
| Hostname | Custom domain; `workers_dev = false` in production | No second door (M3) |
| Secrets | `TUTOR_ACCESS_TEAM`, `TUTOR_ACCESS_AUD`, a new `TUTOR_STAFF_PEPPER` per environment, kept in the password manager | As HOSTING.md says |
| Weekly look | Access logs: denied sign-ins | Sees a guessing attempt early |

**On the village hub.** The teacher PIN and the separate admin PIN (6 digits each), read on the hub's own screen
(`python -m tutor_hub pin`, `admin-pin`); the admin PIN only for the hub keeper; both changed each term with `new-pin`
and `new-admin-pin`; the Wi-Fi password changed at the same time. No email or internet sign-in on the hub.

**What the code enforces now:** the token checks, the per-request staff lookup, roles, class scoping, the last-admin
guard, the PIN locks and the Log (above). **What it should add:** the `X-Qalam` header on staff writes (M1), the
headers file (M2), the PIN/Access mark on sign-offs (M4), teacher action lines in the Log (L1), the key-miss cache
(L3), Sign out on the review page (L8), and, only if the chair wants two Access applications, the admin audience check
(M3).

### A3. The provider switch (12928322): what security still needs

Already right: keys only from secrets, shown as set or not set; each provider only to its own host; the compatible
server's address only from `TUTOR_COMPAT_URL`, never from the panel; the identifier filter, rules screen and budget
before every provider; changes in the Log. Still needed before a class with real learners uses anything but OpenAI:

1. H3: providers limited to those the class's consent version names, refused at save and at call time.
2. H1: the provider comes from her own class only, never from a link.
3. A test that calls every admin and teacher route and checks that no response contains any value of
   `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` or `TUTOR_COMPAT_API_KEY` (set to marker strings).
4. The committee's own record: decisions_c4_fable.md line 19 still says "never Claude or Gemini"; BUILD-PLAN.md:281-283
   records the 17 Oct supersession. The chair should note the change in the committee's file too (question 3).

---

## Part B. Staff pages in English, Dari and Pashto

### B1. What exists now

| Page | Strings en / prs / ps | Switch | Remembered | Starts in | Digits in Dari |
|---|---|---|---|---|---|
| Admin `/admin/` | 221 / 128 (58%) / 0 | a chip flipping English and Dari (admin.js:182) | no | English, always (admin.js:120) | Persian through `fa()`, except money (admin.js:124) and a Latin comma in "۲۰۰,۰۰۰" |
| Teacher `/teacher/` | 122 / 122 / 0 | the same chip (teacher.js:157) | no | the browser's language, fa or prs (teacher.js:97) | Persian through `fa()` |
| Review `/review/` | 92 / 92 / 0 | the same chip (review.js:117) | no | the browser's language, "fa" only (review.js:585) | Latin: its `t()` has no `fa()` (review.js:86) |
| Learner app | 567 / 567 / 567 | Welcome's three-way picker | yes, per learner | her choice | Persian (i18n.js `fa()`) |

Each staff page keeps its own inline `T = {en, prs}` and falls back to English per string, so a Dari admin page is a
mix (shot a12: risk words, "depends on lessons", "locked until a Hanafi scholar signs the Quran set", "AI tokens a
day", "join code", "about $۰.۰۰ · ۱ calls"). Module ids, band codes (p1 p2 s1 s2 ad) and version numbers show raw
in every language. Server refusals arrive as English sentences. Dates are ISO strings, in Persian digits in Dari. The
P10 rule ("a middle dot right after Persian digits reads as a zero") is broken on staff pages: teacher counts "۱ ·"
and "صنف ۷ ·" (shot t08), admin "$۰.۰۰ ·" and "۲۰۰,۰۰۰ ·" (shot a12).

### B2. The spec: a language switch on every staff page

1. **One string file per language,** shared by the three pages: `app/js/staff/strings/en.js`, `prs.js`, `ps.js`, each
   `export default { ... }` with flat keys prefixed `common.`, `admin.`, `teacher.`, `review.`, plus `module.<id>`,
   `module.<id>.what`, `band.<id>`, `risk.<level>`, `maturity.<level>`, `role.<name>`, `log.<what>` (C4 q29) and
   `error.<code>`. `app/js/staff/lang.js` holds `LANGS = ['en', 'prs', 'ps']`, loads the file for the chosen language
   (dynamic import), and gives `t()`, `num()`, `money()`, `date()`, `time()` and `join()`. Adding a language later is
   one file and one entry in `LANGS`. The inline `T` objects are removed (about 400 keys; shared ones such as Sign
   out, PIN, wrong PIN, wait, save failed are written once).
2. **The switch:** in the header of every staff page, also on the PIN screen and the "sign in through Access"
   message, three buttons, each name in its own script: `English`, `دری`, `پښتو`; the current one filled
   (`aria-pressed`). The same look as Welcome's picker, so staff and learners meet one control. Under 480 px the group
   takes its own row below the title. No speakers (rulings 13 and 20).
3. **Remembered per device:** `localStorage` key `qalam.staff.lang`, read and written inside try/catch, shared by the
   three pages (same origin). First visit: `navigator.languages`, `fa` or `prs` gives Dari, `ps` gives Pashto,
   anything else English.
4. **Right to left:** `<html lang="fa-AF" dir="rtl">` or `ps-AF`; layout already uses logical properties and
   `text-align: start`; arrows and chevrons mirror; codes, emails, ids, model names, versions, hashes and URLs sit in
   left-to-right islands through the existing `m()` helper (`<bdi dir="ltr">`).
5. **Words, not ids:** module names and a one-line "what it does", band names ("Years 1 to 3", "Adults"), risk and
   maturity words, role names and Log words all come from the string files by id; the id is shown small, left to
   right, under Details, for support calls.
6. **Server refusals:** the ten commonest staff refusals gain a stable `code` beside `detail` (last admin, not your
   class, confirm first, locked until signed, photo gate, budget, wrong PIN, wait, no such cohort, Access needed);
   the pages show `error.<code>` in the chosen language; anything else shows the server's sentence.
7. **Numbers:** in Dari and Pashto, Persian digits for counts, money, percentages, dates and times; thousands
   separator "٬", decimal "٫", percent "٪"; money as "۰٫۴۲ دالر" (Dari) and "۰٫۴۲ ډالر" (Pashto), "$0.42" in English.
   Never converted: class codes, PINs, sheet codes (M7-03-48217), versions, hashes. `join()` puts "، " between items
   in Dari and Pashto and " · " in English, which keeps the P10 rule without anyone remembering it.
8. **Dates:** English "17 Oct 2026, 14:30"; Dari "۲۵ میزان ۱۴۰۵، ۱۴:۳۰"; Pashto "۲۵ تله ۱۴۰۵، ۱۴:۳۰". The month names
   are the certificate's (cert.py:37-38), with a JavaScript copy of its `hijri()` (cert.py:52). The Log says
   "today" and "yesterday" in words for the last two days. The server keeps ISO dates.
9. **Drafts for native speakers:** `prs.js` and `ps.js` begin with `export const meta = { name, dir, checked: false,
   checked_by: '' }`. While `checked` is false, the staff footer says "Draft translation" in that language. A native
   speaker reads the pages in that language and sets `checked` and their initials, as with a sign-off. Missing keys
   fall back to English, never to a key name.
10. **A check in CI:** `tools/check_staff_strings.mjs` lists keys missing per language, any middle dot after a digit
    or a `{n}` in Dari or Pashto, and Latin digits inside Dari or Pashto strings; it fails on a key missing from
    English and reports the others.

### B3. Draft strings (for a native speaker; Pashto especially)

| Key | English | Dari (draft) | Pashto (draft) |
|---|---|---|---|
| common.lang_name | English | دری | پښتو |
| common.sign_out | Sign out | خروج | وتل |
| common.draft | Draft translation | ترجمه‌ی پیش‌نویس | د ژباړې مسوده |
| admin.ai_off_do | Switch AI off for this class | خاموش کردن هوش مصنوعی در این صنف | په دې ټولګي کې مصنوعي ځيرکتيا بنده کړئ |
| admin.ai_is_on | AI is on | هوش مصنوعی روشن است | مصنوعي ځيرکتيا چالانه ده |
| admin.no_class | No class yet | هنوز صنفی ندارد | تر اوسه ټولګی نه لري |
| admin.print_cards | Print class cards | چاپ کارت‌های صنف | د ټولګي کارتونه چاپ کړئ |
| admin.new_code | Make a new class code | ساختن کد تازه‌ی صنف | د ټولګي نوی کوډ جوړ کړئ |
| admin.also_access | Also add this email in Cloudflare Access, or they cannot sign in. | این ایمیل را در Cloudflare Access هم اضافه کن، ورنه نمی‌تواند وارد شود. | دا برېښنالیک په Cloudflare Access کې هم ورزیات کړئ، که نه نو نشي ننوتلی. |
| band.p1 | Years 1 to 3 | صنف ۱ تا ۳ | له ۱ تر ۳ ټولګي |
| band.ad | Adults | بزرگسالان | لویان |
| risk.high | High risk | خطر زیاد | لوړ خطر |
| module.ask | Ask a question | پرسیدن سوال | پوښتنه کول |

The existing Dari staff strings use the informal singular ("باز کن"); the Pashto drafts above use the polite plural
("کړئ"). One register should hold for all staff pages in both languages (question 8).

### B4. Usability: ten changes that most help a non-technical admin

1. **Words, not ids, in the module table** (shots a03, a12). Each row: the module's name and one line on what it does,
   the risk as a coloured word, bands as years; version and maturity under Details. Today the admin reads "ask 0.1.0,
   medium, pilot, p1 p2 s1 s2 ad".
2. **Phones: modules as cards** (shot a14). At 390 px the table runs off the right edge: the On switches are cut in
   half and the Settings buttons cannot be seen. Below 760 px, one card per module: name and line, the switch on the
   same row, Settings under it.
3. **Kill buttons say what they do** (shots a03, a14). "AI off" and "School day off" read as states. Show the state
   and the action: "AI is on" with a button "Switch AI off"; the red edge only while it is off. The sticky line
   (C4 q30) stays as built.
4. **The class line and the code** (shots a03, a14). "8 learners · bands every band · Dari, Pashto, English · join
   code ****" becomes "8 learners, all years, Dari, Pashto and English". Then one row: "Class code: shown once, when it
   was made", with "Print class cards" (asks for the code, says "Lost it? Make a new code; the old one stops working")
   and "Make a new code".
5. **Content page: a summary, not 32 grey buttons** (shot a07). Eight packs times four cohorts give 32 disabled
   Publish buttons. Instead: a top line "0 of 8 packs ready"; per pack one line, "Not ready: 31 checks missing"
   (opens the list); the Publish rows only for a pack that can be published.
6. **Staff page** (shot a10; admin.js:714). A teacher with no class shows "every cohort", but she sees no class at all.
   Show "No class yet" for teachers and nothing for other roles; roles in words; under "Add someone", the reminder
   "Also add this email in Cloudflare Access, or they cannot sign in", the step most likely to be missed.
7. **Empty states that say what comes next** (shots a07, a08, a09). "No AI used.", "No changes asked for.", "nothing
   held" become one sentence each on what will fill the page and when ("No AI used yet. Classes with AI on show their
   use here, by day.").
8. **Teacher page on a phone** (shots t02, t08). Hide the keyboard line ("Keys: S send, E edit...") on touch screens
   (teacher.js:34, 71; CSS `(hover: none)`), and use "، " after numbers in Dari (P10).
9. **Finish Dari and add Pashto** (B2): 93 admin strings are missing in Dari today.
10. **Confirm dialogs that undo nothing by accident** (shots a04, a05; admin.js:226-238). The dialog focuses its first
    button, which is the confirming one, so a stray Enter makes a new class code or removes a staff member, and Escape
    does nothing. For changes that cannot be taken back (new code, remove staff, rollback), focus Cancel; Escape
    cancels every dialog. The kill switches keep the quick path, since switching AI off is the safe direction.

Already good and to keep: a confirm dialog before kill switches, risky modules, a new code, removing staff and the
provider; the sticky cohort line; the Log in words; the Dari menu width (q32).

---

## Part C. A beautiful, high-quality learner app

Already good (shots under `c5-shots/learner/`): the browser check passed on all 26 screens (contrast at least 4.6:1,
the lowest on Welcome; no clipping; no sideways scroll at 360 px; Dari and Pashto right to left, English left to
right; a page speaker where words are). Dark mode inverts the line art, as ruling 7 asks. Bigger text keeps every
line whole. Motion honours reduced motion. The nine items below keep every ruling: speakers on worded buttons where
the band has them, fewest options, hints never answers, no faces beyond the picture rules.

1. **Hide the hub chip while the hub is in reach** (home-p1-light-prs, home-ad-literacy-light-prs, welcome-s1-light).
   On the hub, "مرکز" with a green dot sits on every screen; on Home for years 1 to 3 and adult literacy it takes a
   line of its own above everything else. Online the chip already hides when all is well (ui.js:225-241), for C2.5's
   reason: "hidden when all is well is the least busy sign". Do the same on the hub: show the chip only for "No
   hub", sending, or waiting items.
2. **One-line titles at 360 px** (ask-s1-light, check-s1-light, welcome-s1-light, subjects-s1-light). The shared header
   (ui.js:300) puts the kicker above the title. On Ask and Check the kicker is a whole sentence, so two grey lines come
   before the title; on Welcome and Subjects the title wraps beside the chip and the speaker. Keep kickers to a few
   words; a sentence goes under the title in the small size. Refine ruling 4: the chip moves down whenever the title
   would wrap, not only when it would get less than 6rem. Subjects drops its second "Subjects" head under the title.
3. **An error screen with a way forward** (main.js:97). Today: "Something did not work. Try again." with no button.
   Add a "Try again" button that runs the screen again (with its speaker in the bands that have them), above the tab
   bar that is already there.
4. **Check my sheet: show where the code is** (check-s1-light). Under the field, a small drawing of the sheet's bottom
   corner with the code circled (a drawing, as q34 rules for `/get`). It fills the empty page and teaches the first
   use. The placeholder "M7-03-48217" looks like a filled-in code; a lighter one, or none once the drawing is there.
5. **One Dari "yes"** (i18n.js, prs block). Five strings say "بله" (lines 52, 133, 261, 300, 307) and three say "بلی"
   (219, 232, 237); a child sees both on Home and in lessons. A native speaker picks one; "بلی" is the usual Afghan
   form. The same reader can sweep for other doublets.
6. **Subject rows share one layout** (subjects-s1-light). Rows with a count have a bar that starts under the name and
   runs to the chevron, and are taller than rows without one; Dari for Year 7 has no count at all. One row shape: name,
   then "۰ از ۱" and a bar under the name column; where her year has no lessons, a muted "No lessons for your year
   yet".
7. **Settings: the nickname card says the same thing twice** (settings-s1-light): the caption and the placeholder are
   both "یک لقب، نه نام خودت". Keep the caption; leave the field empty or show an example nickname.
8. **The draft banner on one line** (home-ad-literacy-bigger, lesson-adult-dari-1-alef-beh-ad-literacy-bigger). On a
   draft hub it sits on every lesson step (lesson.js:110), and in Bigger text it takes two lines in Dari. A shorter
   text that fits one line at 360 px in all three languages and in Bigger text ("Draft: not checked yet").
9. **Mixed scripts in English titles** (home-s1-light-en). An English-language learner sees "Maths · جمع کسرها":
   lessons without an English title show their Dari one. Wrap each title in a `bdi` with its own `lang` so the order
   holds, and let the pack validator list lessons offered in English without an English title.

---

## Order of work for the builder

1. H1 and H2 with their tests (both small, both in server.py and the modules).
2. H3: the consent-to-provider table and its two refusals.
3. M1 and M2 (the header on staff writes; the headers file and the hub middleware).
4. Mo's Access set-up as A2; then `workers_dev = false` in production.
5. M4, L1, L3, L4, L8; L2, L5, L6, L7 when the hub is next touched.
6. B2 (string files and switch), then B4, then Part C, each with screenshots at 360 and 1280 px in all three languages.

## Questions for the chair

1. H1: learner routes take the class from her token only and ignore `?cohort=` (tokenless calls use the hub's own
   cohort). Accept? Is there any case where a phone must act in a class other than its token's?
2. H2: the online limiter keys on `CF-Connecting-IP`; joins count only wrong codes (20 an hour per address) with a
   ceiling of 300 successful joins an hour per address. Accept these numbers?
3. H3: until a consent version names another provider, a class with learners may use only the providers its consent
   names (OpenAI online; local or fake on the hub). Accept, and will the owner commission a new consent text naming
   Anthropic and Google? Will the chair record the 17 Oct change in the committee's own decision file?
4. Login: one Access application with independent MFA for every staff member (A2), or two applications with a
   stricter admin one (about 15 lines of code)?
5. Access cookie Lax with the binding cookie, 24-hour sessions, `workers_dev = false` in production: accept?
6. Hub sign-offs made with the shared PIN: (a) not copied by `pull_signoffs.py` without a named voucher, (b) counted
   except for scholar and adviser roles, or (c) release signatures only online?
7. Staff languages: accept B2 (three-way switch on every staff page, remembered per device, one string file per
   language)? Should the learner app's `i18n.js` later move to the same one-file-per-language layout, with no change
   in behaviour?
8. One register for staff pages: the informal singular used now ("باز کن") or the polite plural ("باز کنید",
   "پرانیزئ")? And who checks the staff Dari and Pashto drafts, by when?
9. Staff dates in Solar Hijri with the certificate's month names for Dari and Pashto, Gregorian in English: accept?
10. Part C item 1 hides the hub chip while the hub is in reach, changing what P11 built for the hub. Accept?
11. Part C item 2 refines ruling 4: the chip moves down whenever the title would wrap, and long kickers move under the
    title. Accept?
12. Part C item 5: "بلی" everywhere in Dari, pending the native reader?

## Screenshots (`c5-shots/`)

Staff (seeded with made-up classes; no real person):

- Admin at 1366 px: a01-admin-pin, a02-admin-cohorts, a03-admin-cohort (a03b full page), a04-admin-kill-confirm,
  a05-admin-module-risk-confirm, a06-admin-cohort-settings, a06b-admin-module-settings, a07-admin-content,
  a08-admin-spend, a09-admin-safety, a10-admin-staff, a11-admin-log, a12-admin-cohort-1366-prs (Dari).
- Admin at 390 px: a13-admin-cohorts-390, a14-admin-cohort-390 (a14b full page).
- Teacher: t01-teacher-pin-390, t02-teacher-todo-390, t03-teacher-todo-care-390, t04-teacher-class-390,
  t06-teacher-lessons-390, t07-teacher-wishes-390, t08-teacher-todo-390-prs (Dari), t09-teacher-todo-1280.
- Review: r01-review-role-390, r02-review-queue-390, r03-review-step-1280, r04-review-1280-prs (Dari).

Learner, 360 px (`c5-shots/learner/`, with the browser check's JSON reports beside them):

- Home: home-p1, home-s1, home-ad-literacy in light Dari, Pashto and English (`-light-prs`, `-light-ps`,
  `-light-en`), and in Dari dark (`-dark`) and Bigger text (`-bigger`).
- Lessons: lesson-maths-7-fractions-add-s1 (light and dark), lesson-adult-dari-1-alef-beh-ad-literacy (light and
  Bigger text).
- Other screens (s1, Dari): welcome, subjects, ask, check, settings; settings also in English and Pashto.

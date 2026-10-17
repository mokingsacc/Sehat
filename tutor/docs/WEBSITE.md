# The Qalam website and the school bag

The website committee's ruling of 17 October 2026, filed here as it was written (the judge's `DECISION.md`; the
committee's papers, the three designs, the final mock-up `final/index.html` and the screenshots stay in the project's
`website-committee/` folder, outside the repository). It is binding for phases W1 to W10. Where this file and an
earlier spec differ, this file wins for the website, the move of the app to `/app/`, seats and the school bag; the
C5 security model stands unchanged (the class from her token only, `X-Qalam` on staff writes, the staff CSP).

The judge read `BRIEF.md`, the three designs (`design-a/`, `design-b/`, `design-c/`) and the real system in `tutor/`
at commit d313e7d9 without changing it, and rendered every mock-up with Playwright (Chromium) at 360 and 1280 px, in
Dari, Pashto and English, light and dark. The owner asked for the version that makes most sense, looks most
beautiful, and keeps a learner's work in step between her phones and online as smoothly as possible, with quality
over usage. He was not available, so the judge decided everything below; the decisions are in the decision log
(BUILD-PLAN.md 9.3) for him to overrule.

What each phase built, and where it differs, is at the end of this file.

## 0. The ruling in brief

1. **Design A wins** ("one front door, one school bag"), scoring 59 of 70 against 52 for B and 51 for C. Its home
   page is the most beautiful and the most useful to a child, because the year doors are the same tap she makes in the
   app. Its sync idea is the only one that survives a lost phone: one school bag, opened by one code, kept on a card.
2. **I grafted named parts from B and C** (section 1.3) and **fixed 22 gaps in A** that would have broken against the
   real code or hurt a child (section 3.14). Among them: A's relay sat in a second database that `guard.py` forbids;
   it keyed relays on a hub id that `hello` does not send; it put Latin letters in a child's code; and it printed a
   URL naming the site on paper kept at home.
3. **The site lives at `/`, and the app moves to `/app/`** before production goes live. Old class cards
   (`/?join=CODE`) and old bookmarks are forwarded. A phone that already has a learner goes straight to her lessons.
4. **Sync has two layers.** (a) *Seats*: one server identity per server, which fixes C5's L6, the token churn that
   stops certificates from completing today, and the consent loss when a phone moves between the hub and online.
   (b) *The school bag*: her whole record, sealed on the phone, relayed by the online Worker and each hub, merged by
   rules that never lose a lesson, a star, a question or a certificate. It opens with a 16-digit code or its text-only
   QR card.
5. **The final mock-up is `final/index.html`.** It passes every check at 360 and 1280 px in three languages, light and
   dark. The home page is one request; first paint takes 3.2 s on a cold throttled EDGE line, and the year tiles fall
   in the first phone screen.

## 1. Scores

### 1.1 The table (1 to 10; equal weights)

| Criterion | A | B | C |
|---|---|---|---|
| Makes sense | **9** | 7 | 7 |
| Looks beautiful | **9** | 8 | 7 |
| Works on 2G | 8 | **9** | 7 |
| Usable by a child | **9** | 7 | 8 |
| Safety and privacy | 8 | 8 | 8 |
| Sync smoothness | **9** | 7 | 6 |
| Fit with the existing code | 7 | 6 | **8** |
| **Total (of 70)** | **59** | 52 | 51 |

### 1.2 The evidence

**Makes sense.**
- **A (9).** One front door and one school bag. Every audience in the brief gets a door on the home page and a deeper
  page. A single code concept carries every move, including recovery after a loss.
- **B (7).** It has the same two ideas, but the home page offers a child one "Start learning" button and leaves the
  year to the app. Sync needs two codes, a 30-minute move code and a 24-digit paper key. The hub gets a different
  layout from the online site.
- **C (7).** Keeping the app at `/` is pragmatic. But the door is folded into `app/index.html`, which the APK ships
  too. C offers no recovery after a lost phone, which is the case the owner's "synched on their phones and online"
  most needs. Pages take up to 5 requests and load a 90 KB web font away from 2G.

**Looks beautiful** (judged from `*-fold.png` and the full pages).
- **A (9).**
  - The phone hero is a picture-book page: a sun in a mountain pass, a pen drawing a golden road out of an open
    book, and letters rising from it, over a kilim pattern.
  - On a desktop the scene becomes a framed plate, and in dark mode it turns to night. The year tiles copy Welcome's
    band colours.
  - At 1280 px the whole door (years 1 to 12, not in school yet, two adult doors) fits in the first screen
    (`a-1280-prs-light-fold.png`).
- **B (8).** The most restrained of the three: notebook paper, a worksheet with tracing letters, and a saffron
  underline. It is elegant on a desktop and sparse on a phone. Its font stack puts Noto Naskh before `system-ui`, so
  on machines that have that font, Latin text falls into a serif (`b-360-en-light-fold.png`).
- **C (7).** Tidy and app-like, but plain. On a phone the first screen has no picture. It has the same serif
  fallback. Its footer breaks two of Qalam's own rules: "نسخهٔ پیش‌نویس · ۲۵ میزان ۱۴۰۵ · 17 October 2026" puts a middle
  dot after Persian digits (the P10 rule says it reads as a zero) and leaves the Latin date without bidi isolation.

**Works on 2G** (measured; served gzipped from a local server under Chromium's network emulation; three round trips
added by hand for DNS, TCP and TLS on a cold line).

| | A | B | C |
|---|---|---|---|
| Mock, three languages: raw / gzip / brotli | 46.6 / 15.1 / 13.0 KB | 35.5 / 11.6 / 9.9 KB | 41.0 / 11.8 / 10.0 KB |
| One language, brotli (dictionaries removed) | 10.5 KB | 7.8 KB | 7.2 KB, HTML only (the real page adds `site.css`, `site.js`, the icon and 90 KB of fonts away from 2G) |
| Requests in the production design | 1 | 1 | up to 5 |
| EDGE (600 ms, 80 kbit/s): first paint, then with a cold connection | 1.38 s, 3.2 s | 1.22 s, 3.0 s | 1.08 s, 2.9 s |
| Poor 2G (900 ms, 35 kbit/s) | 2.42 s, 5.1 s | 2.08 s, 4.8 s | 1.73 s, 4.4 s |
| First action in a 360×740 screen | year tile at 632 px | Start at 304 px | year tile at 627 px |

B is the lightest. A costs about 3 KB more for a real picture and twelve doors, and still fits in the first TCP flight.

**Usable by a child.**
- **A (9).** The year doors are on the home page as 64 px tiles in Welcome's colours. There is a speaker on every
  heading and beside each adult door, and the Continue card shows her picture. Against it: 8 to 12 tap targets under
  44 px (40 px speakers, footer links of 35 to 39 px) and 2 pieces of text under 14 px.
- **B (7).** One 72 px "Start learning" with a speaker is simple, but she picks her year one screen later. It has 3
  price tags at 12 px.
- **C (8).** The door tiles are 60 px, and a returning learner goes straight into her lessons. It has 4 to 6 targets
  under 44 px (the language control is 40 px) and 4 pieces of text at 13 px.

**Safety and privacy** (each 8, for different reasons).
- **A.**
  - For it: no third party, a strict CSP, and codes kept out of everything a server sees. Each relay gets its own
    find and write values, so a stand-in hub learns nothing it can use elsewhere (C5 L6). There is a pepper, "Make a
    new code", and "Just for today" for a borrowed phone.
  - Against it: the bag card's QR is a URL naming the site, kept as paper in a girl's home, and C2 kept the app's name
    off sheets for that reason. The server never checks consent for a bag.
- **B.**
  - For it: the quiet profile (no "girls" in a title or URL, no place names), a QR that holds text and never a URL,
    and no questions in the bag.
  - Against it: a found paper key opens everything and never rotates. It also deletes a second token, and her events
    go with it.
- **C.**
  - For it: the deepest tie to the privacy suite (a retention rule, the column scan, a sentinel sealed and then
    searched for in database dumps), a case deleted with the learner, and consent versions checked by the server.
  - Against it: the QR on the screen carries long-lived tokens and the key, so a photo of the screen gives permanent
    access, and nothing can rotate it.

**Sync smoothness.**
- **A (9).** One code moves her to any phone, browser or hub and restores her after a loss. She syncs with every relay
  in reach without doing anything. There is a merge rule for every field of `state.js`, a hybrid clock, a seat merge
  and a file route. Against it: 12 Latin symbols are hard for a Dari or Pashto child to type.
- **B (7).** The best single idea for the APK is the handoff on one phone, from the browser to the app, through an
  Android intent. B also uses digits and a Lamport merge. But it has two codes, it is opt-in, and it deletes the
  duplicate token.
- **C (6).** A QR moves her from phone to phone without any server, and C keeps a token per home. But there is no
  recovery after a loss. The case syncs only for learners who have a token and the new consent. The move code is 8
  Latin characters, and the browser-to-app handoff is left for later.

**Fit with the existing code.**
- **A (7).** For it: its merge table maps field by field onto `state.js`.
  - Against it, the database: "kept in its own D1 database", but `worker/guard.py` allows exactly one, `qalam`.
    `0019_bags.sql` collides with C6's `migrations/0019_live.sql`.
  - Against it, the APK: an App Link verified through `assetlinks.json` cannot hold for pilot APKs, which are
    installed over USB with a debug key that changes every CI run (HOSTING.md).
  - Against it, the relay key: relays are keyed on "the hub's id", which `hello` does not send. It sends
    `cfg.name`, which is "Qalam" on every hub by default.
  - Against it, the move: it says nothing about `/teacher/`, `/admin/`, `/review/` and `/get/` (they load
    `../css/app.css` and `../js/…`). Nor does it handle `speech.js`, which mixes the absolute `/audio/` and the
    relative `audio/`.
- **B (6).** For it: it is right about the app shell (73 files and about 580 KB, from `sw.js`) and about trimming it.
  - Against it, the forward: `_redirects` cannot forward `/?join=`, because Workers static assets do not match query
    strings.
  - Against it, the hub: it keeps a second layout (the app at `/`, the site at `/site/`).
  - Against it, the duplicate token: `DELETE /api/me` on that token deletes her events, so her certificates count
    less.
- **C (8).** For it: it moves no URL, hooks into `account.sync()`, runs contract tests on both stores and checks
  consent versions.
  - Against it, the key: "tokens per home" are keyed by `hello.hub`, the display name, so every hub with the default
    name collides.
  - Against it, the door: 25 KB of door ends up in the APK's `index.html`.
  - Against it, the service worker: today's worker answers every navigation with the app shell, so site pages need
    that changed first.

### 1.3 Pick: design A, with these grafts

| From | Taken | Why |
|---|---|---|
| B | Digits only for the bag code, and a text QR (`Q1 BAG …`, never a URL), as C2 already decided for sheets | Latin letters are foreign to a young Dari or Pashto reader. A URL on paper names the site in the home |
| B | The same-phone handoff from browser to app: an `intent://` link pinned to `org.qalam.app`, plus `QalamAndroid.takeBag()` | One tap, no network, and works with a sideloaded APK |
| B | Price tags on every download, filled in from real file sizes at build time | Families buy data in small bundles |
| B | Trimming the app shell (Amiri, 62 KB, and Noto SC, 39 KB, load on first use; only the active language's audio manifest is precached) | The app's first open is the real cost (about 580 KB) |
| B | The quiet profile: nothing says "girls" in a title, heading or URL, and no village, school or hub is named | A shared phone's history reads "Qalam · lessons" |
| B | A bag that arrives is added as her own learner and never poured into another child's record | Siblings on one phone |
| C | Seats, one server identity per server, keyed on a real server id | Fixes L6, the token churn, certificates and consent |
| C | A returning learner goes straight from `/` to her lessons, with the site at `/?site` | Smoother than A's Continue card for a child |
| C | The server checks consent before it keeps a bag, and the bag is deleted with the learner and after 12 months | A server-enforced privacy rule, not a phone-side one |
| C | The privacy-suite additions (column scan, retention, a sentinel sealed and searched for in D1 and SQLite dumps), and the content lint in `make_site.py` | The rules are tested, not hoped for |
| C | "Remove from this phone only" or "Remove everywhere" | A moved learner exists in two places |
| C | `/lessons/`, the catalogue built from the packs | Parents and partners can see what is inside |

**Dropped:**
- From A: its second D1 database, the App Link, the Latin code and the QR that is a URL.
- From B: the pair of a paper key and a move code, the deletion of a duplicate token, `/learn/`, and the hub's
  `/site/` layout.
- From C: the door inside `app/index.html`, the web font, and having no recovery after a loss.

## 2. The final spec for the builders

### 2.1 Pages and URLs (one origin; the hub serves the same tree)

| URL | Page | Budget (brotli) |
|---|---|---|
| `/` (Dari), `/ps/`, `/en/` | home (the final mock-up) | at most 14 KB, 1 request |
| `/app/` | the learner app, moved from `/` | as today |
| `/families/`, `/teachers/`, `/partners/`, `/privacy/`, `/credits/` (each also under `/ps/` and `/en/`) | what is kept, what data costs, shared phones and the bag card, how to remove her; class codes, printing, the hub, return codes; what Qalam is and how to help (an email address, no form); the consent texts in force, retention in words, the bag explained; licences from `credits.json` | at most 20 KB, 1 request |
| `/lessons/` (in three languages) | catalogue from the packs: years, subjects, titles, and a draft tag; each title opens `/app/?year=…#/lesson/<id>` | at most 30 KB |
| `/get/` | the APK page that exists today, restyled, with price tags and "from a friend's phone" | |
| `/m` | the handoff landing from the APK to the browser: never printed, `noindex` | at most 4 KB |
| `/offline/`, 404 | fallbacks, three languages in one file | at most 4 KB |
| `/teacher/`, `/admin/`, `/review/`, `/v/<id>`, `/api/*`, `/packs/*`, `/quran/*`, `/audio/*` | unchanged URLs | |

Dari is at the root. A phone whose `navigator.language` starts with `ps` goes to `/ps/` on its first visit. A saved
choice (`qalam.site.lang`) always wins, and English is never chosen automatically.

### 2.2 Moving the app to `/app/` (phase W2: before production, which is not live)

- **`worker/build.py`** assembles `build/public/` as follows:
  - `app/` goes to `public/app/`.
  - `app/audio/` goes to `public/audio/`, staying at the root and shared with the site's speakers.
  - `app/{teacher,admin,review,get}/` go to `public/{…}/`, with every `../` rewritten to `/app/`: in their
    `index.html` files (the icon, `app.css` and the page script) and in `get/get.js`'s imports. Staff URLs, the Access
    applications and the `_headers` blocks therefore stay as they are.
  - The rendered site pages go to `public/`, from `tools/make_site.py` (Python, no dependencies) over
    `site/templates/` and `site/strings/{prs,ps,en}.json`.
  - The site's service worker goes to `public/sw.js`, and `manifest.webmanifest` gets scope `/` and `start_url`
    `/app/`.
- **The app** changes in a handful of lines:
  - `speech.js` reads the audio manifest from `/audio/…`.
  - The `SHELL` audio entries in `sw.js` become `/audio/…`, and its caches are renamed `app-shell-<VERSION>`.
  - `review.js` frames `/app/?preview=…`.
  - Welcome takes `?year=`, `?track=` and `?lang=`, the way it takes `?join=`.
  - `navigator.storage.persist()` is called after her first finished lesson.
- **Forwards** go in an inline script, the first thing in each home's head (about 300 bytes; the final mock-up carries
  it). `/?join=CODE` goes to `/app/?join=CODE`, and a phone whose `qalam.v2` holds a learner goes to `/app/` (the hash
  kept) unless the address has `?site`. Printed class cards keep pointing at `/?join=`. The site's own links to its
  home use `/?site`, so the site never throws a reader into the app.
- **Service workers:**
  - **The site worker** sits at `/sw.js` (scope `/`) and replaces today's app worker at that same URL.
    - It keeps only `site-*` caches. It precaches `/offline/` (3 KB) and keeps each other page as it is visited
      (stale-while-revalidate).
    - On activate it deletes the old `shell-*` cache and never touches `app-shell-*`, `media-v1` or `quran-v1`, so no
      picture or clip is downloaded twice.
    - It sends `/app/` navigations to the network. Offline, before the app is on the phone, it answers "Qalam is not
      on this phone yet: connect once (0.6 MB), or get it at the learning centre or from a friend's phone".
  - **The app worker** sits at `/app/sw.js` (scope `/app/`). `main.js` already registers it by the relative `sw.js`.
- **The hub** mounts the same assembled tree, where today `server.py` mounts `app/` at `/`. Its `StaffHeaders` and its
  `/fonts` mount stay.
- **The APK** moves nothing: `sync-web.sh` copies `app/` to its own origin, with `START_URL` at `/index.html`.
- **One-time cost:** a phone that already has the app downloads its shell once more (about 0.6 MB), because the URLs
  change. Only staging and pilot phones exist today.

### 2.3 The look

This is A's look, as the final mock-up shows it:
- **Palette and type.** Welcome's palette (teal `#0d7c7e`, saffron `#f2b134` and ink `#14213d`), plus four tokens for
  the drawing. System fonts only, with `system-ui` first so that Latin never falls into a serif. Dari and Pashto are
  17 px with a line height of 1.8, English 16 px with 1.55, and headings 28 to 54 px.
- **Pictures.** One inline SVG scene over a kilim pattern, a framed plate on a desktop and night in dark mode. There
  are no people, faces or photographs.
- **Motion.** Three moving things: the road draws itself, the letters rise, and a speaker pulses. All of it stops under
  reduced motion.
- **Sizes.** Every target is at least 44 px (the year tiles are 64 px) and every piece of text at least 14 px.
  Contrast is at least 4.5:1, or 3:1 for borders.
- **Layout.** One column at 360 px, two up from 600 px, the hero side by side from 760 px, grids of three and four
  from 1024 px, and a maximum width of 1120 px.

The words follow C5:
- The child is addressed in the singular and grown-ups in the polite plural, with no gendered forms.
- Every promise can be checked ("0.6 MB, once").
- A draft strip shows until native reviewers sign `site/strings` (the January reviewers of the app's strings).

### 2.4 Three languages
- **One language per page.** `lang` and `dir` are set, and every page carries `hreflang` alternates. The language
  switch is three plain links, which also remember the choice.
- **Direction.** Only logical properties are used. Arrows mirror, but the play triangle and clocks do not.
- **Numbers.**
  - Dari and Pashto use Persian digits, and English Latin ones.
  - Codes, sums and Latin runs sit in left-to-right isolates (`<bdi>`, or `unicode-bidi: isolate`).
  - A middle dot never touches a Persian digit; a comma or colon goes there instead (the P10 rule, checked by the lint).
- **Afghan forms.** Dari uses مکتب, صنف, شاگرد and انترنت; Pashto uses ښوونځی, ټولګی and انټرنټ.
- **Pashto runs about a tenth longer,** so every layout check runs in Pashto too.
- **Speakers** play clips recorded at build time by `tools/voice.py`, in the app's one voice per language. Each is
  about 5 to 15 KB, fetched on the first tap and kept by the site worker. Until a language has clips, the speaker
  falls back to the phone's own voice, then to "the voice is not ready yet", as the app does.

### 2.5 Performance budget (enforced by `tools/site_check.mjs` in CI)

| Item | Budget | Final mock-up |
|---|---|---|
| Home, one language | at most 14 KB brotli (the first TCP flight); aim for 11 KB | 11.1 KB brotli estimated, 13.7 KB with all three languages |
| Requests to show the home page | 1 (CSS, JS, SVG and icon inline) | 1 |
| Web fonts, images, third-party hosts | 0, 0, 0 | 0, 0, 0 |
| Script needed to use the page | none: the doors are links | none |
| First paint, cold, throttled EDGE | at most 3.5 s, tiles inside a 360×740 screen | 3.2 s, first tile at 612 px |
| First paint, cold, poor 2G | at most 5.5 s | 5.1 s |
| Other site pages | at most 20 KB brotli, 1 request | |
| Return visit | 0 bytes (site worker); a 304 is about 0.2 KB | |
| The app's first open | stated before the tap; at most 0.6 MB now, 0.45 MB after W3's trim | stated: 0.6 MB |

CI fails on any of the following:
- a request to another host, an `<img>`, `@font-face` or `@import`, or a page over budget;
- sideways scroll at 360 px, a target under 44 px or text under 14 px;
- a missing `data-t` key in any language, a wrong `lang`, `dir` or `hreflang`;
- a middle dot beside a Persian digit, or a price tag more than 15% off the real file size.

### 2.6 Offline

| Situation | What happens |
|---|---|
| First visit, online | The page shows. The site worker installs and keeps this page and `/offline/`. Nothing else is fetched until she taps |
| A door, the first time | `/app/` loads its shell once (0.6 MB, stated on the page). From then on the app works offline, as today |
| Return visit | Served at once from the cache, and refreshed in the background when there is signal. A phone with a learner opens her lessons |
| Offline, app on the phone | An "Offline" chip shows. The data line says the lessons on this phone still work, and the doors open the cached app |
| Offline, app never loaded | The site worker's page: "not on this phone yet", with the three ways to get it |
| On the hub's Wi-Fi | The same pages from the hub over plain http, with no service worker, as for the app today. The data line says "free, no internet", `/get/` serves the hub's APK, and links that need the internet are hidden |
| Internet shutdown | Everything above keeps working. Bag changes and events wait, and nothing is lost |

### 2.7 The Android app
- **No site in the APK** (it adds 0 bytes). The app stays at its own origin, `https://appassets.androidplatform.net/`.
- **New, in phase W7:**
  1. An intent filter for `qalam://bag` (category BROWSABLE) and the bridge call `takeBag()`, which returns a waiting
     code once and then clears it. A browser opens it with
     `intent://bag?c=<16 digits>#Intent;scheme=qalam;package=org.qalam.app;S.browser_fallback_url=<site>/get/;end`,
     so no other app can receive it.
  2. `SHARE_NAME` also accepts `qalam-bag-[0-9a-f]{8}\.qbag`. A bag file opens through the existing file chooser.
  3. "Use Qalam in this browser too" calls `openExternal("https://<site>/m#<digits>")`, which takes `http` and `https`
     today.
  4. The bag scanner uses `BarcodeDetector` where `getSupportedFormats()` includes `qr_code`, otherwise the keypad, the
     same fallback as Check my sheet. If the pilot shows many phones without it, a JS decoder can be loaded lazily
     (decided after W10).
- **No App Links.** Verification cannot be relied on for sideloaded builds signed with a key that changes each CI run,
  where Google's services are often blocked (D11).
- **`allowBackup` stays false.** The bag is the backup, and it is sealed.
- **The bag code itself** (noble ciphers and hashes, about 10 KB gzipped, and a QR encoder of about 4 KB) loads only on
  the bag screens and stays far under the 3 MB cap.

### 2.8 The village hub
- It serves the assembled tree (site, `/app/`, staff pages, `/get/` with its own APK) and runs the bag relay on SQLite
  with the same migration and routes as the Worker.
- `hello` adds `id` and `now`.
- Its pepper is a file it makes at first start in its data folder.
- Its daily task deletes bags unused for 12 months and tombstones older than 30 days.
- It never talks to the online server: phones carry bags between the two, and converge as soon as any one of her
  devices has visited both. Whether P37's USB carriage may carry sealed bag rows is decided at P37; the default is no.

### 2.9 The site's own privacy and security
- **Headers.** `_headers` gives site pages the following, while `/app/` keeps its own rules and the camera:
  - `Content-Security-Policy: default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; img-src data:;
    connect-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  - `Referrer-Policy: no-referrer`;
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
  - HSTS once the custom domain serves.
- **Nothing to track.** No cookies, analytics or third-party requests. `localStorage` holds only `qalam.site.lang`.
  Counts come from Cloudflare's server-side request totals.
- **`make_site.py` lints** for photos, faces, names, places below the province, phone numbers, maps, embeds, forms and
  share buttons, and for "girls" in a title or URL.
- **The domain** is the custom domain the C5 login list already needs (never `.af`), with a quiet name. The
  `workers.dev` address stays as a second door built into the APK and printed nowhere.

## 3. Sync, end to end

### 3.1 What the code does today
- **One token per learner** (`state.js` `clean()`: `token`, `number`, `cohort`, `code`). It goes to whichever server
  answers `hello` first (`hub.js`: the hub addresses, then the APK's online home). A server that does not know it
  answers 401, and `account.js` `unknown()` joins her again. An APK that goes hub, online, hub gets a new token, number
  and class each time. Her events split across tokens, and a certificate, which needs every lesson's event under one
  token hash (`mods/cert.py`), never completes.
- **One consent record per learner,** although the hub and online texts differ (`hub-2026-10b`, `online-2026-10b`).
  Joining the other server with it gets a 422, and `account.js` then clears her consent: her events stop.
- **Three separate stores on one phone:** the online browser origin, the hub origin (`http://10.42.0.1`) and the APK's
  `appassets` origin. Nothing passes between them, and a new phone starts from nothing.
- **Storage can vanish:** Safari's 7-day cap, Chrome evicting a full phone, or `adb uninstall` during the pilot
  (HOSTING.md).
- **Events take the phone's clock minute** (`events.js` `minute()`). The server drops minutes older than 365 days and
  clamps future ones to now (`events.py` `row()`). A phone whose clock fell back to 2010 after a dead battery loses
  those events for certificates.
- **`hello` has no stable server id and no time.**

### 3.2 What is stored where

| Place | Holds | Never holds | Protected by |
|---|---|---|---|
| Phone, one store per origin (online browser, hub browser, APK) | `qalam.v2`: each learner's settings, progress and questions; her `seats`; her `bag {code, keys, etags per relay, stamps}`. The device's `clock {dev, skew, hlc}`. `qalam.events.v1`, each event with `to`. Caches | a name (the nickname she may type never leaves the phone) | the phone's own lock; her PIN curtain |
| Phone, site storage | `qalam.site.lang`; cached site pages | anything about a learner | |
| Hub (SQLite, on its Wi-Fi only) | as today: learners (token hash, class, picture, number, band, consent), events, `made`, `daily_counts`, certificates. New: `bags` rows, `meta.server_id`. The pepper sits in a file | names, tokens (hashes only), readable bags | sealed blobs; no internet |
| Worker D1 `qalam` (EU), the one database | the same tables; the pepper is a Worker secret, `TUTOR_BAG_PEPPER` | the same | sealing, HTTPS, records in the EU |
| Paper | the bag card: her alias picture, 16 digits, a text QR, "keep it like a house key" | a name, the app's name, an address | the family |

### 3.3 Seats: one identity per server (phase W4)
- **Fields.** `seats: {<server id>: {token, number, cohort, code, consent, asked, sentBand, joined}}` replaces the
  per-learner `token`, `number`, `cohort`, `code`, `consent`, `asked` and `sentBand`. Consent belongs to the seat,
  because each server names its own text.
- **The server id** is `hello.id`: random, made once by the store and kept in a `meta` table. Every hostname of one
  database returns the same id (the custom domain and `workers.dev`, for example).
- **Where a token goes.** It goes only to the server whose id issued it (L6 closed). Before any call that carries a
  token, the phone compares the reachable server's `hello.id` with the seat's.
- **Joining.** She joins a server when she needs it, as today: with a class code, or once her grown-up has agreed to
  that server's text. A 401 removes only that seat, and the other seats stay. `useCohort()` uses the seat of the
  server in reach.
- **Two seats on one server.** This happens when two devices joined separately. `POST /api/me/merge` folds the newer
  seat into the older, re-keying every table that has a `token_hash` column: `events`, `made`, `daily_counts`
  (summed), `reset_codes`, `bags`, and any later table such as C6's (a test lists the columns from the migrations).
  It then deletes the newer row. Her teacher sees one learner with the older picture and number. Seats in different
  classes are not merged: the seat with the newer class is used, and the other ages out after 12 months, its events
  staying with that class.

### 3.4 Events, certificates, budgets and the token-only class rule
- **Events.**
  - Each queued event gets `to`, the server ids of her class seats (seats that joined with a class code); with none,
    her first seat.
  - It is sent with that seat's token when that server is in reach, and leaves the queue once every server in `to`
    has it.
  - Events waiting for an unreachable class server are kept for 60 days instead of 14 (the cap of 500 stays), so a
    week away from the hub costs nothing.
- **Certificates** are asked of her class server and earned from its events, as today, with `mods/cert.py`
  unchanged.
  - `certs` entries gain `server`, so `/v/<id>` points at the server that can check one.
  - The bag carries every certificate to every device she uses.
- **Budgets** are `daily_counts` per token per day. With one seat per server, all her devices share one budget per
  learner per server. A merge adds the two counts for the day, so it can never reset a budget.
- **The class rule** (C5 H1, `her_cohort`) is unchanged. The class comes only from the token's own row on that server.
  A seat's `cohort` is for display only, and a bag cannot move anyone into a class, because a seat is valid only on the
  server that issued it.

### 3.5 Clocks
- **Server time.** `hello.now` (UTC ms) gives each device a `skew`, refreshed at every contact.
- **Bag stamps** use a hybrid logical clock, `[ms, counter, device]`. The ms part is `max(Date.now() + skew, last ms
  made or seen)`, and the counter breaks ties. Comparison is ms, then counter, then device.
  - A phone that wakes in 2010 keeps stamping after the newest stamp it knows, so its changes still order correctly.
  - A phone running years ahead can only win concurrent changes to a setting until real time catches up.
  - Neither case can lose a lesson, a star, a question or a certificate, because those merge by union or maximum and
    not by stamp.
  - There is no cap at merge time, so every merge stays pure and converges.
- **Events** use `Date.now() + skew`. Each queued event also keeps the skew it was written under. When a later contact
  shows that the clock had jumped, the difference is added before sending, and the server still clamps any future
  minute to now. Events from a reset clock therefore land inside the 12-month window.

### 3.6 The school bag (phases W5 to W7)
- **One bag per learner, opened by one code.** The bag code has 16 digits: 15 random (`crypto.getRandomValues`) and a
  Damm check digit, using the table in `sheetcode.js`. That is about 50 bits.
  - It shows as 4 groups of 4 in a left-to-right isolate, in Persian digits in Dari and Pashto, and the speaker reads it
    group by group.
  - It is typed on the app's keypad in either set of digits. The check digit refuses one wrong digit or one swapped
    pair before any data is spent.
- **Keys.**
  - `M = PBKDF2-HMAC-SHA256(code, "qalam-bag/1", 100 000)`. W5 measures it, with a target of at most 1.5 s on the
    slowest pilot phone and a floor of 50 000 rounds.
  - `K`, `F` and `W` = HKDF-SHA256(M, "seal" | "find" | "write").
  - For each relay `r` (its `hello.id`): `F_r = HMAC(F, r)` and `W_r = HMAC(W, r)`.
  - All of this is worked out once per device and kept with her learner. The code itself is shown again in Settings,
    behind her PIN.
- **The seal.**
  - XChaCha20-Poly1305 with a random 24-byte nonce; the associated data is `"qalam-bag/1|" + F`, so a sealed bag
    cannot be swapped for another.
  - The plaintext is JSON, deflated where `CompressionStream` exists and padded to the next whole KB, at most 64 KB
    sealed.
  - The code is vendored `@noble/ciphers` 1.x (audited by Cure53 in 2024) and `@noble/hashes`, pinned with their hashes
    in CI. It is pure JS, because the hub serves plain http, where `crypto.subtle` does not exist.
- **What a relay keeps:**
  - `id = HMAC(pepper, F_r)` and `w = SHA-256(W_r)`;
  - the `token_hash` of the seat that last wrote it (for consent and for deletion with her);
  - `etag`, `size`, `blob` (sealed), `day` (a date only), and `gone` (a tombstone date).
  - One bag per seat: writing a new id from a seat that already has a bag replaces the old row.
- **Consent.**
  - A relay keeps a bag only from a seat whose consent version names it; otherwise it answers 403.
  - The line goes into the consent texts' next version and rides D13 (the reviewers in January, the solicitor in
    March). The pilot runs it under the draft text, like every other row.
  - The line reads: "Qalam keeps a locked copy of her progress so it can follow her to another phone. Nobody can open
    it without her code, not even us. It is deleted with her."
  - Without that consent, only the bag file works.
  - After agreement the bag is on by default. Existing learners see the new text once, and "Not now" changes nothing.
- **The card** is A6: her alias picture, the 16 digits, the text QR `Q1 BAG <16 digits>`, and "keep it like a house
  key". It has no name, no app name and no address, the C2 rule for paper.
  - It is offered when the bag is made and again after her fifth finished lesson, and never forced.
  - The family prints it on the hub's printer or writes the digits in her notebook.
  - Settings shows "Card: not printed yet" until then.

### 3.7 Relay routes and the table (one implementation for the Worker and the hub)

| Route | Body | Answers | Limits |
|---|---|---|---|
| `GET /api/hello` | | gains `id` and `now` | as today |
| `POST /api/bag/get` | `{f, etag?}` (no token, so a fresh phone can recover) | 200 `{etag, blob}`, 304, 404, or 410 `{gone}` (stopped elsewhere) | 60 an hour per caller; a 404 counts as a wrong code (20 an hour per address, C5 A2) |
| `POST /api/bag/put` | `{f, w, if: etag or "new", blob}`, with `X-Learner-Token` | 200 `{etag}`; 412 `{etag}` (pull, merge, retry); 403 (wrong `w`, or no consent for the bag); 413 (over 64 KB); 401 | 30 an hour per token; 1 every 10 s per bag |
| `POST /api/bag/delete` | `{f, w}`, with a token | 204; leaves a tombstone for 30 days | |
| `POST /api/me/merge` | `{other: token}`, with a token | 200, the kept seat `{number, picture, cohort}`; 409 if the classes differ; 401 | 5 a day per token |
| `POST /api/me/token` | with a token | 200 `{token}`: a new token for the same row, and the old one dies | 5 a day per token |

The routes take the following from the request body, so none of it reaches a URL or a log:
- `f`, the value that finds a bag;
- `w`, the proof that lets her write it;
- `blob`, the sealed bag.

Migration `0020_bags.sql` (after C6's `0019_live.sql`; renumber if another lands first) goes in the one `qalam`
database and in the hub's SQLite:

```
bags(id TEXT PRIMARY KEY, w TEXT NOT NULL, token_hash TEXT, etag TEXT NOT NULL, size INTEGER NOT NULL,
     blob BLOB, day TEXT NOT NULL, gone TEXT)          -- index on token_hash and on day
meta(k TEXT PRIMARY KEY, v TEXT NOT NULL)             -- server_id, made once
```

The privacy suite, `test_privacy.py`, gains the following:
- the column scan: no name, sex, date of birth, phone number or address;
- the retention rules: a bag unused for 12 months, a tombstone after 30 days, and a bag deleted with her
  (`DELETE /api/me`);
- a sentinel test: a bag is sealed holding a sentinel string, and dumps of D1 and SQLite must not contain it.

### 3.8 Merge rules (pure functions; commutative, associative and idempotent, tested as properties)

| Part of her record | Rule |
|---|---|
| `done[lesson] {stars, at}` | Union. Stars take the higher value. `at` takes the later time, because `library.js` sorts "recently done" by it |
| `step[lesson]` | Newest stamp. Dropped when it is older than the lesson's latest finish, so a lesson she is doing again keeps her place |
| `tries[lesson][n]` | The first try wins (the earliest stamp). Dropped with the step |
| `marks`, `recall`, `prints` (per key); `last`; `quran` | Newest stamp |
| `plan` | The whole plan, newest stamp |
| `uni` (university ticks) | Each tick, newest stamp, so an untick also travels |
| `certs` | Union by id; each carries its `server` |
| `asks` (at most 30), `made` (at most 50) | Union by key, each item newest stamp. A deleted item leaves a tombstone in `gone`, so it never comes back. A queued question is sent only by the device that queued it (it carries that device), and her other devices show it as waiting on her other phone. The caps apply after the merge |
| `band`, `year`, `track`, `lang`, `text`, `theme`, `day`, `bells`, `shift`, `study`, `readerAsked`, `told` | Each field, newest stamp |
| `lock` (the PIN's salt and hash) | Newest stamp. A restored learner arrives locked and is asked her PIN once. The teacher's reset code (P20) works as today, with her restored seat |
| `seats` | Union, one per server id. Two tokens for one server go to `/api/me/merge` at the next contact (idempotent: a 401 for a token already folded means done) |
| `consent` (per seat) | Newest stamp. "Stop sharing" also deletes the bag on every relay in reach, leaving a tombstone |
| `picture` | Carried as it is. On a phone where another learner already has that picture, she gets a stand-in picture there, and that local choice is never synced |
| never carried | `nickname`, `mine`, `alarms`, `forget`, the events queue, `wishes` (an outbox), the caches |
| unknown fields from a newer app | Kept as they are. A bag whose `v` is newer than this app is only read, never written: "update Qalam to keep in step" |

### 3.9 When it syncs, and what it costs
- **Pulls** happen at app start, when the server comes back (`hub.onChange`) and on "Sync now", using `If-None-Match`.
  A 304 costs 0.3 to 0.5 KB.
- **Pushes:**
  - 30 s after a finished lesson, a marked sheet, a certificate or a changed setting;
  - when the app goes to the background with something unsent;
  - at most every 30 minutes and 6 times a day on mobile data, or once a day under Save-Data;
  - without limits on the hub's Wi-Fi.
- **A 412** means pull, merge and push again, up to 3 times, then wait for the next trigger. All of this is silent.
  Only Settings → School bag shows it: "On this phone: saved. At the centre: saved. Online: waiting".
- **Cost.**
  - A push is 5 to 15 KB, which comes to 0.2 to 0.6 MB a month for a daily learner on mobile data.
  - In D1 a push is one row write, so events still dominate writes and requests.
  - At 10 KB a bag, 20,000 learners fill about 200 MB of the Free plan's 500 MB database. Beyond that comes D6's
    Paid plan, never a second database.

### 3.10 What the child and the grown-up do

| Flow | Steps |
|---|---|
| Make the bag | The grown-up holds "Agree" on the consent screen (with the new line). "Her school bag is ready" appears with the digits, the QR and "Print the card or write it down". The bag uploads at once, or when a server is next in reach |
| Every day | Nothing. It syncs on its own with every relay in reach |
| New phone | Welcome → "I already use Qalam" → scan the card (or the old phone's screen) inside Qalam, or type the 16 digits with the speaker. "Found: [her picture] ۲۷, year 3, 14 lessons. Is this you?" → her PIN once → Home. If no relay in reach has the bag yet, she starts at once, and her work joins when it is found |
| Browser and app on one phone | In the browser's Settings, "Open in the Qalam app" (the intent), or the reverse from the app (`/m`). After that, each keeps in step through the relays |
| The hub and online | She does nothing. The phone syncs with whichever is in reach, and the two converge when one device has visited both |
| No relay at all | "Save as a file" (about 10 KB, sealed) → Bluetooth, Nearby Share or Xender → "Open a bag file", then type the digits |
| Borrowed phone (W8) | "Just for today": the app's memory-only mode (the one `state.js` `preview` uses). Nothing is stored, and the bag is pushed on "Done". If the phone is offline, she is warned first |
| Code seen by someone | "Make a new code" (behind her PIN). The bag is sealed again under a new code, the old bag is deleted, and every seat gets a new token (a seat out of reach at its next contact). Her other devices then show "this phone needs your new bag code" and do not join again on their own |
| Removing her | "From this phone only" deletes the local record and sends nothing. "Everywhere" deletes the bag on each relay and sends `DELETE /api/me` on each seat |
| She started fresh before restoring | On the fresh learner, "This is also me" (behind both PINs) merges the two records by the same rules and folds the seats |

### 3.11 Today's learners (migration, in W4 and W5)
- **The move keeps them.** Moving to `/app/` keeps every learner, because `localStorage` belongs to the origin. The
  APK and the hub keep their origins.
- **On upgrade,** `state.js` moves the legacy `token`, `number`, `cohort`, `code`, `consent`, `asked` and `sentBand`
  into an "unplaced" seat.
  - That seat is tried only at the base address the phone last used (`cache('hub')`, or the page's own site). A 200 on
    `GET /api/me` places it under that server's `hello.id`. A 401 drops it, and she joins again, as she would today.
  - It is never sent to any other address (L6).
- **Old values.** Unstamped values count as the oldest stamp, and queued events without `to` go to the placed seat.
- **The bag** comes when her grown-up agrees to the new text, or, for the file route, when someone taps "Make a school
  bag" in Settings.

### 3.12 A lost or broken phone

| Case | Result |
|---|---|
| She has the card, or the digits in her notebook | Restored on any phone from any relay that has the bag: progress, questions, certificates and seats, so her events and certificates continue under the same tokens. Then "Make a new code" kills the lost phone's access: a new code, new tokens, the old bag deleted |
| No card, but she is in a class (W9) | Her teacher gives a return code: 6 digits, 15 minutes, once, five tries, the same rules as the PIN reset codes. On the new phone: the class code and the return code. The server gives her row a new token, so the lost phone's token dies, and her finished lessons and marks are rebuilt from her class's events (`GET /api/me/progress`) |
| No card and no class | Her work is gone, as it is today. Nobody, including the Qalam team, can open a bag without its code. `/families/` says so in one line, and the card is offered twice |
| The phone is found by someone else | Her PIN curtain, no names, and the code behind the PIN. "Make a new code" from another device ends the phone's seats |

### 3.13 Every failure case and what happens

| # | Case | Behaviour |
|---|---|---|
| 1 | No signal or a shutdown | Local first: she learns. Bag changes and events wait, and sync happens at the next contact |
| 2 | Power cut during an upload | The relay replaces a bag only after a complete, verified put (one statement or transaction). The phone tries again |
| 3 | Two devices push at once | `if` with an etag returns 412: pull, merge, push. Every order ends in the same bag |
| 4 | The clock reset to 2010 or set years ahead | Section 3.5: nothing earned is lost, and events land inside the window |
| 5 | A mistyped code | The check digit refuses it before any network. A valid code that is not on this relay gets "Not at this centre or online yet", the learner starts, and the work joins later. Wrong codes are limited to 20 an hour per address |
| 6 | The bag is on another relay only | Same as 5. She learns now, and the bag merges when a device reaches that relay |
| 7 | The bag is over 64 KB | The caps keep it small (30 questions, 50 of her own, 300 review items, 300 marks). Beyond that, the oldest retired items leave the bag copy, never the phone |
| 8 | A corrupt or forged bag (the seal fails) | Ignored. The local copy is kept, and this phone's copy replaces it on that relay |
| 9 | A stand-in "hub" on the Wi-Fi | It gets only `F_r` and `W_r`, useless anywhere else. It never gets a token from another server. A replayed old bag cannot remove anything, because merges only grow or take the newest |
| 10 | Two seats on one server | `/api/me/merge` makes one learner. Different classes are not merged |
| 11 | A seat the server forgot (401) | That seat only: she joins again with consent or her class code, and other seats are untouched. After a 410 from the bag she does not join again (case 13) |
| 12 | Consent withdrawn on one device | The bag is deleted (a tombstone) and the seat deleted. The other devices see 410: "Your school bag was stopped on another phone", and keep what they have |
| 13 | A new code made elsewhere | 410 with the old code: the device asks for the new code |
| 14 | A sibling on a shared phone | The code sits behind her PIN, a restored learner arrives locked, and the card says to keep it like a house key |
| 15 | A found card | It shows progress and questions, never a name. "Make a new code" rotates the code and the tokens |
| 16 | Storage evicted (iOS's 7 days, a full Android phone) | `navigator.storage.persist()` after the first lesson. The card restores her. `/families/` tells iPhone families to print the card |
| 17 | The APK uninstalled or reinstalled (the pilot's debug keys) | Restored from the card or the teacher's return code |
| 18 | The browser and the APK on one phone | Two stores, each in step through the relays. The handoff is one tap |
| 19 | A hub-only village for weeks | The hub is the relay. Events wait 60 days for her class server |
| 20 | The same lesson done on two devices | Union, with the higher stars. Her teacher may count it twice in the weekly numbers, as when she does it twice on one phone |
| 21 | Two different plans made apart | The newer stamp wins, and the other plan is lost. Lessons and stars are never lost |
| 22 | A question queued on one device | Only that device sends it, so it is never sent twice |
| 23 | Two learners with the same picture on a phone | A local stand-in picture, never synced |
| 24 | An older app on another device | Fields it does not know are kept. A newer bag version is read but not written |
| 25 | The Worker's in-memory limits reset per isolate | About 50 bits per code and the pepper carry the security, not the limits |
| 26 | The D1 database leaks without the pepper | Bag ids cannot be tested against guesses, and every blob is sealed |
| 27 | A seized hub (database and pepper) | 100 000 PBKDF2 rounds per guess. Finding any one bag among a village's hundred takes years of GPU time, and it holds no name |
| 28 | A typed code seen over a shoulder | Codes never appear in a URL a server sees, are shown only behind her PIN, and can be changed with "Make a new code" |
| 29 | The QR scanned by the phone's own camera app | It holds plain text, not a link, so nothing opens and nothing is left in the browser's history |
| 30 | The `/m` handoff from the APK | The page stores the code for the tab, replaces its address with `/app/#/move` before drawing, and is `noindex` |

### 3.14 Gaps in design A that this fixes
1. A second D1 database for bags becomes the one `qalam` database (`guard.py` allows exactly one).
2. `0019_bags.sql`, which collides with C6's `0019_live.sql`, becomes `0020_bags.sql`.
3. "The hub's id" for relays and seats, which does not exist, becomes `hello.id`. C's `hello.hub` was the display name.
4. The 12-symbol Latin code becomes 16 digits with the Damm check that the app already uses.
5. The QR, a URL naming the site printed on paper at home, becomes a text QR. `/m` is kept only for the APK's handoff.
6. The App Link verified by `assetlinks.json` becomes an `intent://` link pinned to the package, which works for
   sideloaded APKs signed with debug keys.
7. Bag writes the server could not tie to consent now need a seat token with a consent version that names the bag.
   The bag is deleted with her and after 12 months.
8. The seat merge, only sketched, is now specified to re-key every `token_hash` table, sum `daily_counts` and refuse
   different classes. It is not B's delete, which loses events.
9. Where events and certificates go when she has two servers is now defined: her class seat(s), `to` on each event,
   `server` on each certificate.
10. One consent per learner, which today is wiped on the other server's 422, becomes consent per seat.
11. "Capped at the relay's clock plus one day", which would break the merge laws, becomes an uncapped HLC plus the
    skew from `hello`, and events corrected by the skew.
12. The site worker replacing the app worker without a cache plan now has `app-shell-*`, `site-*` and the shared
    `media-v1` and `quran-v1`.
13. Staff pages, `/get/` and `audio/` were left unhandled by the move. They keep their root URLs through the build's
    rewrite, and the app changes in a handful of lines.
14. A returning learner had to tap Continue on `/`. Now she goes straight to the app, and Continue shows only at
    `/?site`.
15. `done.at` "the earlier date" becomes the later one, because the app sorts recent lessons by it.
16. `step` "the furthest" becomes the newest stamp, dropped when older than the lesson's latest finish.
17. A question could be sent twice by two devices. Now only the device that queued it sends it.
18. A delete on the relay left other devices pulling 404s. A 30-day tombstone now says "stopped" (410).
19. Several bags per seat could pile up. There is now one bag per seat on each relay.
20. PBKDF2 at 20 000 rounds becomes 100 000, measured, with a floor of 50 000.
21. A lost phone without a card, which had no path, now has the teacher's return code and a progress rebuild (W9).
22. In the mock-up, 8 to 12 targets under 44 px, 2 pieces of text under 14 px and a footer size that was really the raw
    size are all fixed (section 5).

## 4. Building it

### 4.1 Phases, in order

The site strand (W1 to W3) and the sync strand (W4 to W7) can run side by side. W7 needs `/m` from W3.

| Phase | Builds | Done when (tests) |
|---|---|---|
| W1 | `site/` (templates, strings in three languages as drafts), `tools/make_site.py` with the content lint, the three homes from the final mock-up, `/privacy/`, `_headers` for site pages, `tools/site_check.mjs` in CI | Every check in 2.5 passes in Dari, Pashto and English at 360 and 1280 px, light and dark. Native speakers have the strings |
| W2 | The move (2.2): the build's assembly, the app's few changed lines, the site worker, the forwards, the hub's mount, the manifest | An old class QR `/?join=…` joins. A phone with today's worker (`qalam-p36-1`) keeps its learners and opens `/app/` with no picture or clip downloaded again. No 404 under `/app/` (network log). Staff pages load with their CSP. `sync-web.sh` and the APK build are unchanged. Hub pytest covers `/`, `/app/` and `/teacher/` |
| W3 | `/families/`, `/teachers/`, `/partners/`, `/lessons/`, `/credits/`, `/get/` restyled, `/m`, `/offline/`, 404; heading clips; the shell trim | Each page is within budget. The clips pass the native listener (C5.6). The shell is 0.45 MB or less, measured before and after on the 2G profile |
| W4 | Seats and clocks: `hello.id` and `now`; `seats` and consent per seat in `state.js` and `account.js`; the token-to-issuer check; the legacy migration; events with `to`; skew; `/api/me/merge`; `/api/me/token` | Two fake servers: the APK goes hub, online, hub and keeps one token per server, sending neither to the other. A certificate completes after the move. Events from a 2010 clock land inside the window. The merge re-keys every `token_hash` column (the list is read from the migrations). The C5 H1 tests still pass |
| W5 | The bag core: `app/js/bag.js` (code, keys, seal, open, merge), HLC stamps on every `state.js` write, the vendored crypto | Property tests over random records (commutative, associative, idempotent). Clocks in 2010 and 2030. Unknown fields kept. A full record stays under 64 KB at the caps. Known-answer vectors for the crypto. PBKDF2 timed on the slowest pilot phone |
| W6 | The relay: `0020_bags.sql`, `meta`, the three routes, the pepper, the limits, retention in the cron and the hub's daily task, deletion with her | The same contract tests on the D1 fake and on SQLite. A 412 race. 413. A 403 without the new consent. The privacy suite: column scan, retention, sentinel |
| W7 | The bag screens: the consent line, making the bag, the card (A6, text QR), Settings → School bag, "I already use Qalam", scanning and typing, `/m`, the intent and `takeBag()`, the file route (APK `SHARE_NAME`), "Make a new code", "Remove … only or everywhere", the stand-in picture, "This is also me" | Playwright: APK origin, then Chrome origin, then hub origin, then a new phone, on throttled 2G. Nothing is lost, stars take the higher value, the newest plan stays, each question is sent once. `signup_check.mjs` walks it in three languages |
| W8 | "Just for today", `navigator.storage.persist()`, the iPhone advice | Nothing reaches storage in that mode. Push on "Done" |
| W9 | The teacher's return code and `GET /api/me/progress` | The old token dies. Lessons and marks are rebuilt. The teacher sees one learner |
| W10 | Field checks: an Android Go phone on 2G, an iPhone (Pashto glyphs in system fonts), a week offline on two phones then one sync, a shutdown drill, a hub-only week then online | Nothing lost, and the costs are as stated. If iOS lacks a Pashto letter, add a 9 KB subset of Naskh with `font-display: optional` |

### 4.2 Owner decisions, made

| # | Decision | Made, and why |
|---|---|---|
| 1 | Where the app lives | `/app/`, moved before production. The site at `/` costs a reader 11 KB instead of 0.6 MB |
| 2 | The domain | The custom domain the C5 login list already needs, never `.af`, with a quiet name. `workers.dev` stays as the APK's second address, printed nowhere |
| 3 | Sync model | Seats and the school bag (section 3). Relays never talk to each other in v1. P37's USB carriage of sealed bags is decided at P37, default no |
| 4 | Bag consent | One line in the next consent texts (rides D13). On by default after agreement. The file route needs no consent |
| 5 | Code and card | 16 digits with a Damm check. A text QR. No name, app name or URL on paper. The card is offered twice and never forced |
| 6 | Questions in the bag | Yes, they are her work. The lock travels, and she is asked her PIN once on a new phone |
| 7 | Retention | A bag goes 12 months after its last use and with her. A tombstone lasts 30 days |
| 8 | Crypto | Vendored `@noble/ciphers` 1.x and `@noble/hashes`, pinned. PBKDF2 at 100 000 rounds, with a floor of 50 000 |
| 9 | Events for a second server | They go to her class seat(s). An unreachable class server waits 60 days (was 14) |
| 10 | Lost phone without a card | The teacher's return code, for class learners (W9). An open learner relies on the card |
| 11 | Borrowed phones | "Just for today", after the core (W8) |
| 12 | Fonts on the site | System fonts only. The Naskh subset only if the iPhone check fails |
| 13 | Analytics | None. Cloudflare's server-side request counts are enough |
| 14 | Hosting plan | Unchanged, D6: the site costs no Worker request. The bag adds about 3 to 8 requests and 1 to 6 row writes per learner per day |
| 15 | The "girls" question (B's) | The quiet profile: not in titles, headings or URLs. Safety features are written for every child |

## 5. The final mock-up: `final/index.html`

This is design A's page with the following changes:
- **The forwards** go first in the head: an old class QR to the app, and a phone with a learner straight to her
  lessons, unless `?site`. They are inert when the mock-up is opened as a file.
- **The bag** shows its example code in digits (`۴۸۲۱ ۷۵۹۰ ۳۶۶۱ ۲۰۴۳`, with a valid Damm check digit), says "scan your
  card in Qalam or type its 16 digits", and adds one line on the lock.
- **Tap targets** are at least 44 px everywhere: the speakers, the brand, the language segments, the footer links,
  "I have a class code" and "I already use Qalam".
- **Text** is at least 14 px: the draft strip and the hero kicker.
- **The phone scene** is slightly shorter, so the first year tile sits at 612 px rather than 632.
- **Header links** go to `/?site`, the language links carry `data-switch`, and the page has `hreflang` alternates and
  `no-referrer`.
- **Links** go to `/families/` and the static `/credits/`.
- **The footer's size** is the compressed size even when the page is opened as a file.

Checked with the same Playwright script as the three designs (results in `judge-shots/report-final.json`, screenshots
`judge-shots/final-*.png`):

| | 360 px (Dari, Pashto, English; light and dark) | 1280 px (the same) |
|---|---|---|
| Sideways scroll | 0 in all 6 | 0 in all 6 |
| Targets under 44 px, text under 14 px, clipped text | 0, 0, 0 | 0, 0, 0 |
| External requests, script errors | 0, 0 | 0, 0 |
| Size | 48.9 KB raw; 15.9 KB gzip; 13.7 KB brotli (all three languages); about 11.1 KB brotli for one | |
| Throttled first paint | EDGE 1.37 s (3.2 s cold), poor 2G 2.42 s (5.1 s cold), 3G 0.40 s; first year tile at 612 px in a 740 px screen | |

To see the other states, use "Mock-up only: show other states" in the footer: a learner on this phone (as seen at
`/?site`), offline, on the village hub, and dark.

## Sources

- Cloudflare, Workers static assets redirects: query parameters cannot be matched in a source path
  (https://developers.cloudflare.com/workers/static-assets/redirects/).
- noble-ciphers, audited by Cure53 in July and August 2024 (https://cure53.de/audit-report_noble-crypto-libs.pdf;
  https://paulmillr.com/noble/).
- Chrome's Shape Detection API: barcode detection on Android needs Google Play services, so it must be detected at
  runtime (https://developer.chrome.com/docs/capabilities/shape-detection).
- The repository, all read and none changed:
  - `worker/guard.py` (one D1 database; `run_worker_first`), `worker/wrangler.toml`, `worker/build.py`;
  - `docs/HOSTING.md` (CPU, pilot installs over USB, debug keys), `docs/DESIGN-C5-SPECS.md` (H1, L6),
    `docs/DESIGN-C6-SPECS.md` (`0019_live.sql`), `docs/DESIGN.md` (the P10 rule), `docs/BUILD-PLAN.md` (D6, D11, D13,
    P37);
  - `app/js/state.js`, `account.js`, `hub.js`, `events.js`, `outbox.js`, `speech.js`, `sheetcode.js`, `library.js`,
    `main.js`, `review/review.js`, `app/sw.js`;
  - `hub/tutor_hub/server.py`, `learners.py`, `events.py`, `config.py`, `mods/cert.py`, `migrations/*.sql`;
  - `android/sync-web.sh`, `MainActivity.java`, `AndroidManifest.xml`, `build.gradle`.
- The designers' own sources are in each `design.md`.

## What the phases built, and where they differ

### W1: the site's first pages

Built: `site/` (the shell, the home and privacy bodies, the icons, the CSS, `forward.js`, `site.js`, the strings in
three languages), `tools/make_site.py` (render, lint, CSP hashes, `_headers`, `site-report.json`),
`tools/site_check.mjs` (CI job `site` in tutor.yml) and `hub/tests/test_site.py`. The homes are the final mock-up's
page with its mock-only parts taken out; measured: the Dari home 9.8 KB brotli, the Pashto 9.8, the English 9.4, the
privacy pages about 6; first paint on EDGE 1.37 s (3.2 s cold), on poor 2G 2.42 s (5.1 s cold); the first year
tile at 612 px in a 360x740 screen (670 in English).

Where it differs, the builder's choices to confirm:
- The pages are rendered and checked on their own in W1; they reach the Worker's build and the hub with the move
  (W2), since the Dari home needs `/`.
- The CSP adds `media-src 'self'` (the heading clips of W3 play through `Audio`) and `manifest-src 'self'` (the
  install prompt), and the site's rules add `X-Frame-Options: DENY` beside `frame-ancestors 'none'` for old
  browsers. Inline `style` attributes are gone (the mock's glyph delays and sprite are classes), so the CSP needs no
  `'unsafe-hashes'`.
- The words a script needs are a `<script type="application/json">` block in the page's language, which the CSP
  does not run; nothing is written with `innerHTML`.
- The price tag of the app is worked out at build time as gzip (Python has no brotli); the site check measures
  brotli and allows 15%. The Android app's tag is left out until a release puts `app/get/apk.json` beside `/get/`
  (the mock-up's "1 MB" had no file behind it).
- The Continue card (at `/?site` only) shows the active learner's own picture from all twelve, with her year or
  "Adults".
- Only the Dari home sends a reader on by language (a Pashto phone, or a saved choice); `/ps/` and `/en/` are a
  reader's explicit choice and stay.
- `/privacy/` explains the school bag with the tag "With the next consent text", because the bag's consent line
  rides D13 and the bag screens come in W7.
- The lint's list of places below the province is short (the pilot's city, Mazar-i-Sharif, and two districts near it);
  reviewers extend it in `make_site.py`.

### W2: the move

Built: the app at `/app/` and the website at `/`, on the Worker and on the hub, from one layout.
- `make_site.py` `site_root()` writes the pages, the site's worker (`site/js/sw.js`, its version a hash of the pages)
  and `manifest.webmanifest`; `assemble()` adds `app/` at `/app/` (without its tests, clips and the moved folders),
  `app/audio/` at `/audio/`, and `teacher`, `admin`, `review` and `get` at their old addresses with `../` read as
  `/app/`. `worker/build.py` calls `assemble()` and appends the site's `_headers` rules to its own.
- The hub (`tutor_hub/sitetree.py`) renders `site_root()` once per process into a folder of its own and serves the
  rest from `app/` as it is on disk (a voice pack or an APK written there is served at once): `/app/` refuses the
  tests, clips and moved folders; the moved folders get the same `../` rewrite as the build; the site's pages carry
  the site's CSP; `/app` and `/teacher` without their slash go to the address with it. `StaffHeaders` and `/fonts`
  stay.
- The app: `speech.js` reads `/audio/…`; `sw.js` is `app-shell-<VERSION>` with `/audio/…` entries, keeps voice
  clips in `media-v1` and leaves the site's pages to the site's worker; `review.js` frames `/app/?preview=`;
  `main.js` takes `?year=`, `?track=` and `?lang=` (`signup.js` `door()`); `state.js` asks for persistent storage
  after the first finished lesson; `index.html` links the manifest. `/v/<id>` names `/app/` for its icon, CSS and
  script. `sync-web.sh` still drops the shell's audio lines (`'/?audio/`).
- `site.js` registers the site's worker on a secure page (never on the hub's plain http), so a new phone keeps
  the pages it saw and is told "not on this phone yet" offline; a phone with today's app gets it as the update
  of its worker at `/sw.js`.
- `/offline/`: one file in three languages, the reader's own first, on a small shell of its own (`tiny.html`,
  `tiny.css`, `tiny.js`): 1.9 KB brotli. The site's worker sends it for `/app/` before the app is on the phone, marked
  `data-app="none"`, which shows "Qalam is not on this phone yet".
- `tools/move_check.mjs` serves the tree of the last commit before the move, then the new one, on one address, and
  checks the move as a phone sees it; `site_check.mjs` also checks a whole tree (`make_site.py --tree`).

Where it differs, the builder's choices to confirm:
- The hub renders the site itself rather than reading a built folder, so a hub updated by `install.sh` needs no
  build step; the fallback container copies `site/` and `tools/make_site.py` for this.
- A page of the old app still open at `/` when the site's worker takes over asks for its next files at their old
  addresses (`/js/…`, `/css/…`); the site's worker fetches them from `/app/…`, so that page keeps working until it is
  reloaded.
- A site door with a year or adult track opens the learner on this phone who has that year (or track) and language,
  if there is one, instead of making a second learner; a class code on the way always makes a new one, as Welcome
  does.
- On `/offline/` English comes first only for a reader who chose it, as on the homes.

### W3: the pages and the shell trim

Built:
- The pages, each in three languages (`make_site.py` `PAGES`, `site/templates`, 116 new strings a language; Dari and
  Pashto are drafts): `/families/` (cost, privacy, one phone for the family, the Android app, another phone, wiping),
  `/teachers/` (codes, sheets, the centre, a forgotten PIN), `/partners/`, `/lessons/` (the catalogue the server
  really serves, by year, then older learners, then adults; each lesson opens `/app/?year=…&lang=…#/lesson/<id>`
  through W2's door, and a draft says so; a release hub lists signed lessons only), `/credits/` (from
  `app/credits.json`), and `/get/` restyled (the APK with its size, version, SHA-256 and certificate fingerprint
  from `app/get/apk.json`, or, before a release, the browser). Each is 5 to 7 KB brotli.
- `/m` (`m.html`, no index): the Android app's "use Qalam in this browser too" opens `/m#<16 digits>`; `m.js` keeps
  the digits in `sessionStorage` `qalam.bag.handoff` and replaces the address with `/app/#/move` before anything is
  drawn, so the code is in no address bar or history. The `#/move` screen that reads it is W7's.
- The 404 page (`404.html`, three languages in one file, 1.6 KB): `not_found_handling = "404-page"` in both
  wrangler files (the guard checks only the binding and `run_worker_first`, unchanged), and on the hub any address
  no file answers. It is served at any address, where no `_headers` rule names it, so it carries its own policy in a
  `<meta>` (the same one without `frame-ancestors`, which the `/*` rule's `frame-ancestors 'self'` covers).
- `/get/` is the site's page: `app/get/index.html` and `get.js` are gone, and `app/get/` holds only what
  `tools/apk_record.py` puts there at release (the APK and `apk.json`), served beside the page at `/get/<file>`. The
  app's Settings link is `/get/?lang=<her language>`; `lang.js` opens the Pashto or English page from `?lang`, a
  saved choice or a Pashto phone.
- The shell trim (2.5): Amiri, Noto SC, the three voice manifests and the bells are kept on first use instead of
  at install (`sw.js` `LAZY`; the bells at the first tap of a school day, so they still ring offline), and Noto
  Naskh Arabic is cut to the Arabic block, Latin to Extended-A and the punctuation (`make_fonts.py --naskh`; 72 to
  42 KB a weight, every shaping feature kept). 1,237 Dari, Pashto and Arabic texts of the lessons, the app and the
  site draw pixel for pixel the same in both weights, and `test_packs.py` fails if a lesson writes a letter the
  subset lacks. The first open: 0.61 MB gzip before, 0.41 MB gzip and 0.38 MB brotli after (73 files). Measured on
  staging, with Cloudflare's own compression, every file the app's worker keeps at install: before, 82 files and
  687 KB on the wire with headers (68 s at EDGE's 80 kbit/s); after, 74 files, 417 KB of bodies and 478 KB with
  headers (47 s).
- `site_check.mjs` also checks `/m`, the `/get/` forwards and an unknown address; its server answers as Workers
  static assets do (`/m` is `m.html`, `404.html` with status 404).

Where it differs, the builder's choices to confirm:
- The heading clips are not made: `tools/voice.py` needs the voice key, which this build had not got. Until they
  are, each speaker falls back to the phone's voice as 2.4 says. Run `voice.py` for the site's headings at release,
  and have them heard by the native listener (C5.6).
- `/partners/` has no email address yet (`CONTACT = None`): it says one will be there once Qalam's own address is
  set up. Set `CONTACT` in `make_site.py` then.
- A price tag under 1 MB rounds to the nearest 0.05 ("0.4 MB" now).
- A lesson with no English title shows its Dari title on the English catalogue, marked as Dari.
- The examples in the page texts (a class code, the hub's address) are placeholders filled per language, so the
  Dari and Pashto strings hold no Latin digits.

### W4: seats and clocks

Built:
- The server: migration `0020_meta.sql` (`meta(k, v)`; the school bag's table comes with the relay in W6, so it
  is `0021_bags.sql`, not 0020); `server_id()` in both stores (one statement, `INSERT … ON CONFLICT … RETURNING`);
  `hello.id` and `hello.now`; `POST /api/me/merge` and `POST /api/me/token`, 5 a day per token, on
  `merge_learners` and `rekey_learner`, each one transaction (one D1 batch). `TOKEN_TABLES` in `stores/base.py`
  says how each table with a `token_hash` moves (events and her own questions move, daily counts are summed, a
  reset code or a live class's seat keeps the older learner's); `test_seats.py` reads the migrations and fails when
  a table with that column is missing from it, and fills every such table from its own columns, so W6's `bags`
  is checked the day it lands.
- The phone: `seats` per learner (`state.js`), the learner record still reading `token`, `consent` and the rest from
  the seat of the server in reach, so no screen changed; `setSeat`, `placeSeat`, `clearSeats`, `issuer`,
  `targets`, `stamp`. `hub.js` keeps the server's id, sets the skew from `hello.now` and refuses to send a token to
  any server but its issuer (`mayCarry`), the body's `other` token included. `account.js` places the unplaced seat,
  joins, sends consents and bands, merges and forgets per server. `events.js` keeps `to`, `got`, the stamp and its
  skew. Certificates keep the `server` that issued them.
- `app/tests/seats.test.js`: two stand-in servers. The Android app goes hub, online, hub and keeps one token per
  server, neither ever sent to the other, and her lessons done online reach her class's hub. A learner from before
  W4 keeps her token, and every finished lesson stays under it, which is what a certificate is earned from. A
  pre-W4 token is never sent anywhere but where it was used; a forgotten one means she joins again. Events from a
  clock in 2010 (still wrong at the next contact, or put right before it, or on a phone that never met a server)
  land inside the window. A 401 drops one seat only. "Stop sharing" tells each server with its own token.

Where it differs, the builder's choices to confirm:
- `meta` came a phase early (W4 needs `hello.id`), as its own migration; the bags' migration is renumbered to 0021,
  as 3.7 allows.
- A server from before W4 has no `hello.id`: the phone names it by its address (`b:<address>`), so its seat still
  never mixes with another server's.
- The time of an event: `max(phone clock + skew, the latest time the phone made or saw)`, as for the bag's stamps,
  and when the skew has changed by the next contact the difference is added, but never more than a day back. Without
  the floor, a clock put right before the next contact would date the events in 2010 and the server would drop
  them; without the day's limit, the same clock would be moved back by the whole jump. A phone that ran ahead is
  brought back by the server, which takes no future minute.
- Events go to her class seats with consent, else to her first seat with consent; with no consent anywhere nothing
  is kept, as before. "Stop sharing" ends every seat (each server deletes her record when next in reach), since the
  grown-up's "stop" is not about one server.
- `/api/me/merge` keeps the learner who joined first (the hash breaks a tie, so both devices asking at once agree),
  takes the newer consent when the kept one has none or an older one, and answers `kept: "this" | "other"` so the
  phone knows which token to keep. An `other` the server does not know is taken as folded already (200).
- The phone asks for a merge only when a seat holds a second token (`also`), which only W7's bag brings; W4 tests it
  with a stand-in.

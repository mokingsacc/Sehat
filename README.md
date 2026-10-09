# Sehat صحت (family health book · کتاب صحت خانواده · د کورنۍ روغتیا کتاب)

A narrated, offline family health book for villages in Samangan, Afghanistan. Dari and Pashto, a speaker next to every block of text, a children's section (vaccines, danger signs, common illnesses) and an adults' section (women's health, red flags, common conditions), a private child vaccine record, and anonymous usage counts.

It is a plain website (a "progressive web app"). People open the link once and add it to the home screen. The first visit downloads only the app itself (words, pictures, about 380 KB). The first run is one screen: people choose their language, and the app opens (the woman's voice to start; the man's voice is in Settings). The voice downloads quietly in packs (see below). Everything works without internet after that. When the phone is online it quietly checks for a newer book.

## Folder map
- `index.html`, `css/`, `js/` – the app. No build tools, no frameworks.
- `content/src/` – the words. One JSON file per topic in `topics/`, plus `vaccines.json`, `ui.json` (buttons and narrated interface lines), `sections.json` (order of topics), `config.json` (public address, stats address, editor address `contentUrl`).
- `img/` – pictures (`topics/`), icons (`icons/`) and app images (`app/`).
- `audio/fa-f/`, `audio/fa-m/`, `audio/ps-f/`, `audio/ps-m/` – narration clips: Dari and Pashto, `f` = a woman's voice, `m` = a man's voice. One clip per text block, named by the block id (`diarrhoea.lead.mp3`). Old folders `audio/fa/` and `audio/ps/` still work and count as the woman's voice.
- `tools/` – `build.py` (run after any change), `validate.py` (checks content), `import_recordings.py` (turns recordings into clips), `tts_gemini.py` (computer voices as placeholders).
- `server/` – the usage-count server, dashboard and book editor (Cloudflare Worker).
- `docs/` – content and art specs, and `REVIEW.md` (medical points for Mo to check).

## Change content
1. Edit a file in `content/src/` (keep ids unchanged: audio files are named after them).
2. `python3 tools/validate.py` then `python3 tools/build.py`.
3. Publish (push to GitHub). Phones pick up the new book the next time they are online.

## Host it (free, GitHub Pages)
Create an empty repository, push this folder, then Settings → Pages → Deploy from branch → `main`, folder `/`. The address will be `https://<user>.github.io/<repo>/`. Put it in `content/src/config.json` as `appUrl` and rebuild.

## Voices and downloads
- Each language has two voices: a woman's and a man's. The first run does not ask (it starts with the woman's voice, the one the Android app carries for Emergency and CPR); people change it in Settings (each choice has a speaker to hear a sample); each language remembers its own choice (a language not chosen yet starts with the woman's voice). If a voice has no clips yet it can still be chosen; a missing clip plays in the other voice of the same language, or with the phone's own speech.
- Only the chosen voice downloads, in packs: **urgent** first (interface lines, every topic title, every red "go to hospital now" box, and the danger-sign, red-flag and first-aid topics, set in `config.json` as `urgentTopics`), then **children**, **women**, **everyone**. Inside the urgent pack the Emergency screen, the four CPR pages and the CPR films come first (about 3 MB), then the other emergency pages (`urgentFirst()` in `js/app.js`). Two clips at a time; if the signal drops or the app closes it carries on later from where it stopped.
- Everything downloads by itself only on Wi-Fi or a cable with data saver off (`onWifi()` in `js/anim.js`; a phone or browser that does not say what connection it has, such as an iPhone or a computer, counts as not Wi-Fi). Otherwise only the Emergency and CPR part of the urgent pack downloads by itself (`book.packs.first`, about 3 MB); the rest waits for Wi-Fi or a tap on Download. Settings shows each pack with its size, progress and a Download button, free space on the phone, and **Delete voices**. Any clip not yet on the phone plays from the internet when tapped and is then kept.
- Size: clips are MP3, mono, 16 kHz, 24 kbps (plays on every iPhone and Android, old WebViews too; Opus would save only about a quarter and needs re-encoding). One voice of one language is about 65 MB for all 2,468 clips (urgent pack about 26 MB, of which Emergency and CPR about 3 MB); `tools/build.py` prints the sizes. The website holds all four voices (about 260 MB, well under the 1 GB Pages limit); `tts-manifest.json` and `tts-usage.json` are not published.
- The Android app carries only the Emergency and CPR clips in the woman's voice of Dari and Pashto (`book.bundle` from `tools/build.py`, copied by `android/sync-web.sh`, about 6 MB), so it speaks emergencies with no internet. Everything else it downloads from the website (`appUrl`) the same way as the website does.

## Pictures and the APK size
The APK should stay about **11 MB** (8.5 MB on 9 Oct 2026: about 6.7 MB of it is the bundled Emergency and CPR narration).
Where pictures live (Mo, 9 Oct 2026):
- **Inside the APK and precached on the website from the first open:** every picture in `img/` (icons, topic pictures,
  the symptom tiles `img/symptoms/*.webp` from `tools/symptom_pics.py`, about 25 KB each) and the picture-step sets of
  the **Emergency and CPR animations**: those used by the Emergency section, the Emergency cards in `config.json`, and
  the CPR, choking and newborn pages.
- **Downloaded when first needed (not in the APK, not precached):** every other picture-step set. It downloads the
  first time its page is opened online (by itself on Wi-Fi only, like the voice packs; on any other connection when the
  person opens the animation), whole and checked against its hashes or not at all, and is then kept on the phone. Until then the animation's SVG version
  plays. Inside the Android app it comes from the website (`appUrl`).
- Nobody chooses this by hand: `tools/build.py` decides from the animation's group (`tools/anims.py`), writes it to
  `book.steps` and the precache list, and `android/sync-web.sh` leaves the other sets out of the APK.
  `tools/build.py` prints a line with the APK picture total and the on-demand total; `tools/validate.py` warns when the
  APK's pictures pass 3 MB. Details: `docs/STEPS_PLAYER.md` ("Where the pictures live").

## Computer voices (placeholders)
```
export GEMINI_API_KEY=...
python3 tools/tts_gemini.py --sample      # a few clips per voice, to listen to first
python3 tools/tts_gemini.py               # all clips, all four voices (only changed texts are redone)
python3 tools/build.py
```
They go straight into `audio/<lang>-<voice>/`. A person's recording imported later replaces the computer voice and is never overwritten by it.

## Record the narration
In the app: Settings → Record the narration. The reader picks the language and their voice (woman or man), sees each text in big letters, taps the red button, reads, taps again, then moves on. Recordings stay on that phone until they tap "Send recordings", which makes one zip file to send on WhatsApp. Then:
```
python3 tools/import_recordings.py recordings-YYYY-MM-DD.zip     # older zips also need --voice f or --voice m
python3 tools/build.py
```
`content/scripts/narration-fa.tsv` and `narration-ps.tsv` list every clip with its text, for printing or for a studio.

## Usage counts (Cloudflare, free)
Phones send anonymous daily totals (language, phone type, app version, district if chosen, pages opened, clips played, minutes used) when they have internet: no install id, no names, no GPS, and the child record never leaves the phone. Counts are on by default with no question on first open; the switch in Settings and on the Privacy page turns them off. A day after the first open, one small question asks for the district ("Not now" asks once more 7 days later, then never again); until then the totals go without a district.
1. Make a free Cloudflare account. Install wrangler on a computer (`npm i -g wrangler`), then in `server/`:
```
wrangler login
wrangler d1 create fhb            # copy the database_id into wrangler.toml
wrangler d1 execute fhb --remote --file=schema.sql
wrangler secret put DASH_KEY      # type a long secret word: letters, digits, - and _ only (other signs work, but are easy to mistype in a link)
wrangler deploy
```
2. Put `https://family-health-book.<your-subdomain>.workers.dev/e` in `content/src/config.json` as `analyticsUrl`, rebuild and publish.
3. Your dashboard: open `https://family-health-book.<your-subdomain>.workers.dev/dashboard` and sign in with your secret word. Pages, sign-in, the audit log, exports and the codebook: `docs/DASHBOARD.md`.

## Disease watch (community surveillance)
On pages about illnesses that spread (measles, diarrhoea, cough, Congo fever, dog bites, TB, jaundice, meningitis, salak) and under matching symptom-finder results, the app asks "Does someone in your home have this now?" (spoken, with Yes / No). Yes asks the district if none is chosen yet (kept on the phone) and an age group, then queues a report: illness, definition version, district, age group, day, random ids. No names, GPS or free text. Settings has a "Help watch for outbreaks" switch: on for every phone (a phone whose family switched it off keeps it off), and nothing is sent when it or "Usage counts" is off. Matching symptom-finder searches also queue a weaker signal (illness, district if chosen, day). Reports go to the same server as the usage counts (`.../r`).
- Definitions, triggers and alert rules: `content/src/syndromes.json` (versioned); places: `content/src/districts.json`. `build.py` copies them to `server/surveillance-defs.js`.
- Dashboard: `/watch` (weekly counts by illness, district and age, baseline, alerts, auditable CSV/JSON exports), methods at `/watch/methods`. Server code: `server/surveillance.js`; wiring: `server/SURVEILLANCE_WIRING.md`.

## Edit the book from your phone (no programming)
The same Cloudflare server has an editor. You change words, steps, danger signs, the home screen, the clinic list and recordings, press **Publish**, and phones take the new book the next time they have internet (and keep it for offline use). The book built into the app stays as the fallback.

One-time setup, on a computer, in `server/`:
1. Open `wrangler.toml` and set `APP_URL` to the app's address (for example `https://<user>.github.io/<repo>`, no slash at the end).
2. Run `wrangler d1 execute fhb --remote --file=schema.sql` again (it only adds the new tables; your counts stay).
3. If not done yet: `wrangler secret put DASH_KEY` (your secret word). Optional, for the "Summarise feedback" button: `wrangler secret put ANTHROPIC_API_KEY` (a key from console.anthropic.com).
4. `wrangler deploy`.
5. In the app, put the server address (`https://family-health-book.<your-subdomain>.workers.dev`, without `/e`) in `content/src/config.json` as `contentUrl`, then `python3 tools/build.py` and publish the app once more. From then on, content changes need no rebuild.

Every time, on your phone:
1. Open `https://family-health-book.<your-subdomain>.workers.dev/admin` and sign in (bookmark it).
2. The editor opens the book that is in the app now, with your own changes on top. Nothing to import.
3. Edit. Each topic shows Dari, Pashto and English side by side; use ↑ ↓ to reorder, **Add block** / **Add item** / **Delete** to change blocks, **Recordings** under any text to upload an mp3/m4a/webm/ogg clip for each voice (Dari woman, Dari man, Pashto woman, Pashto man; up to 1.9 MB). Other tabs: Home screen (switch parts on and off), Words (buttons and spoken lines), Places (paste a Google Maps link or "36.26, 68.01" to add a clinic), Audio. Changes save by themselves.
4. Press **Publish**. If something is missing (for example an empty Pashto text) you see a list in plain words and nothing is sent; fix it and press Publish again.
5. **Revert draft** throws away unpublished changes; **Start again from the app** throws away all your changes. The dashboard has a **Summarise feedback** button (needs `ANTHROPIC_API_KEY`).

Good to know: ids of blocks never change when you edit text (recordings are linked to them). The editor keeps only what you changed. Phones, and the editor itself, lay those changes over the book built into the app, so a new app release and your published changes do not undo each other, and there is nothing to bring in after an app update: **Check for problems** and **Publish** always work on the app's newest book. How this works: `docs/EDITOR_AND_RELEASES.md`. If two people change the same page at once, a save made on an old copy is refused with a message to reload, so nothing is overwritten without warning.

### Give other people access
Your secret word (`DASH_KEY`) is the owner's key: it always works and can do everything. Other people get their own link instead of your word.
1. Once, on a computer in `server/`: `wrangler d1 execute fhb --remote --file=schema.sql` (safe to run again; it only adds the new tables), then `wrangler deploy`.
2. Sign in to the dashboard and tap **People**. Type their name, choose **Viewer** or **Editor**, tap **Make their link**.
3. Tap **Copy** and send the link to them privately. It is shown only once (only a scrambled copy is kept). Opening it signs them in on that device (for 14 days); after that they can sign in at `/signin` with the key in their link.

What each role can do:
- **Viewer**: overview, app use, disease watch, feedback and voice notes, the AI summary, shareable exports and the codebook, and can look at the book in the editor. Cannot change anything.
- **Editor**: everything a viewer can, plus edit, upload recordings, publish, revert and import. Cannot open People, the audit log or full exports.
- **Owner** (you): everything, including People, the audit log (`/audit`), full exports and disease-watch corrections.

On People you can change someone's role or tap **Remove access** (their link stops working and they are signed out everywhere at once). Every sign-in, edit, publish, correction, export and role change is written in the append-only audit log at `/audit`, with before and after. Lost link: remove access and add the person again.

## Licences
Content is adapted from WHO guidance (IMCI, PCPNC, WHO antenatal care, Facts for Life, Doing What Matters) for non-commercial health education; some WHO source books are "all rights reserved", so ask WHO for permission before wide release (see docs). Icons adapted from Health Icons (MIT, see img/CREDITS.md). Font Noto Naskh Arabic (SIL OFL, fonts/OFL.txt).

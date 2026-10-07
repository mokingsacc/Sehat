# Sehat صحت (family health book · کتاب صحت خانواده · د کورنۍ روغتیا کتاب)

A narrated, offline family health book for villages in Samangan, Afghanistan. Dari and Pashto, a speaker next to every block of text, a children's section (vaccines, danger signs, common illnesses) and an adults' section (women's health, red flags, common conditions), a private child vaccine record, and anonymous usage counts.

It is a plain website (a "progressive web app"). People open the link once and add it to the home screen. The first visit downloads only the app itself (words, pictures, about 380 KB). People then choose their language and a woman's or a man's voice, and the voice downloads quietly in packs (see below). Everything works without internet after that. When the phone is online it quietly checks for a newer book.

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
- Each language has two voices: a woman's and a man's. People choose on the first screen after the language (each choice has a speaker to hear a sample) and can change it in Settings. If a voice has no clips yet it can still be chosen; a missing clip plays in the other voice of the same language, or with the phone's own speech.
- Only the chosen voice downloads, in packs: **urgent** first (interface lines, every topic title, every red "go to hospital now" box, and the danger-sign, red-flag and first-aid topics, set in `config.json` as `urgentTopics`), then **children**, **women**, **everyone**. Two clips at a time; if the signal drops or the app closes it carries on later from where it stopped.
- On "data saver" or 2G only the urgent pack downloads by itself. Settings shows each pack with its size, progress and a Download button, free space on the phone, and **Delete voices**. Any clip not yet on the phone plays from the internet when tapped and is then kept.
- Size: clips are MP3, mono, 16 kHz, 24 kbps (plays on every iPhone and Android). One voice of one language is about 8.4 MB for all 507 clips (urgent pack about 2.7 MB).

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
Phones send anonymous counts (a random install id, language, phone type, pages opened, clips played, minutes used) when they have internet. Names and the child record never leave the phone.
1. Make a free Cloudflare account. Install wrangler on a computer (`npm i -g wrangler`), then in `server/`:
```
wrangler login
wrangler d1 create fhb            # copy the database_id into wrangler.toml
wrangler d1 execute fhb --remote --file=schema.sql
wrangler secret put DASH_KEY      # type a long secret word
wrangler deploy
```
2. Put `https://family-health-book.<your-subdomain>.workers.dev/e` in `content/src/config.json` as `analyticsUrl`, rebuild and publish.
3. Your dashboard: `https://family-health-book.<your-subdomain>.workers.dev/dashboard?key=<your secret word>`.

## Disease watch (community surveillance)
On pages about illnesses that spread (measles, diarrhoea, cough, Congo fever, dog bites, TB, jaundice, meningitis, salak) and under matching symptom-finder results, the app asks "Does someone in your home have this now?" (spoken, with Yes / No). Yes asks the district once (kept on the phone) and an age group, then queues a report: illness, definition version, district, age group, day, random ids. No names, GPS or free text. Settings has a "Help watch for outbreaks" switch (on by default; nothing is sent when it or "Usage counts" is off). Reports go to the same server as the usage counts (`.../r`).
- Definitions, triggers and alert rules: `content/src/syndromes.json` (versioned); places: `content/src/districts.json`. `build.py` copies them to `server/surveillance-defs.js`.
- Dashboard: `/watch?key=...` (weekly counts by illness, district and age, baseline, alerts, auditable CSV/JSON exports), methods at `/watch/methods`. Server code: `server/surveillance.js`; wiring: `server/SURVEILLANCE_WIRING.md`.

## Edit the book from your phone (no programming)
The same Cloudflare server has an editor. You change words, steps, danger signs, the home screen, the clinic list and recordings, press **Publish**, and phones take the new book the next time they have internet (and keep it for offline use). The book built into the app stays as the fallback.

One-time setup, on a computer, in `server/`:
1. Open `wrangler.toml` and set `APP_URL` to the app's address (for example `https://<user>.github.io/<repo>`, no slash at the end).
2. Run `wrangler d1 execute fhb --remote --file=schema.sql` again (it only adds the new tables; your counts stay).
3. If not done yet: `wrangler secret put DASH_KEY` (your secret word). Optional, for the "Summarise feedback" button: `wrangler secret put ANTHROPIC_API_KEY` (a key from console.anthropic.com).
4. `wrangler deploy`.
5. In the app, put the server address (`https://family-health-book.<your-subdomain>.workers.dev`, without `/e`) in `content/src/config.json` as `contentUrl`, then `python3 tools/build.py` and publish the app once more. From then on, content changes need no rebuild.

Every time, on your phone:
1. Open `https://family-health-book.<your-subdomain>.workers.dev/admin?key=<your secret word>` (bookmark it).
2. The first time only: press **Import from app** (copies the book that is in the app now).
3. Edit. Each topic shows Dari, Pashto and English side by side; use ↑ ↓ to reorder, **Add block** / **Add item** / **Delete** to change blocks, **Recordings** under any text to upload an mp3/m4a/webm/ogg clip for each voice (Dari woman, Dari man, Pashto woman, Pashto man; up to 1.9 MB). Other tabs: Home screen (switch parts on and off), Words (buttons and spoken lines), Places (paste a Google Maps link or "36.26, 68.01" to add a clinic), Audio. Changes save by themselves.
4. Press **Publish**. If something is missing (for example an empty Pashto text) you see a list in plain words and nothing is sent; fix it and press Publish again.
5. **Revert draft** throws away unpublished changes. The dashboard has a **Summarise feedback** button (needs `ANTHROPIC_API_KEY`).

Good to know: ids of blocks never change when you edit text (recordings are linked to them). A phone uses whichever book is newer: the one you published, or the one built into the app. If the app is rebuilt later with other changes, press **Import from app** and redo your edits, or the newer built-in book will win until you publish again.

### Give other people access
Your secret word (`DASH_KEY`) is the owner's key: it always works and can do everything. Other people get their own link instead of your word.
1. Once, on a computer in `server/`: `wrangler d1 execute fhb --remote --file=schema.sql` (safe to run again; it only adds the new tables), then `wrangler deploy`.
2. Open the dashboard with your own link and tap **People**. Type their name, choose **Viewer** or **Editor**, tap **Make their link**.
3. Tap **Copy** and send the link to them privately. It is shown only once (only a scrambled copy is kept). They can bookmark it on their phone.

What each role can do:
- **Viewer**: dashboard, About, feedback and voice notes, the AI summary, and can look at the book in the editor. Cannot change anything.
- **Editor**: everything a viewer can, plus edit, upload recordings, publish, revert and import. Cannot open People.
- **Owner** (you): everything, including People.

On People you can change someone's role or tap **Remove access** (their link stops working at once). People also shows who changed what in the book (the last 50 changes). Lost link: remove access and add the person again.

## Licences
Content is adapted from WHO guidance (IMCI, PCPNC, WHO antenatal care, Facts for Life, Doing What Matters) for non-commercial health education; some WHO source books are "all rights reserved", so ask WHO for permission before wide release (see docs). Icons adapted from Health Icons (MIT, see img/CREDITS.md). Font Noto Naskh Arabic (SIL OFL, fonts/OFL.txt).

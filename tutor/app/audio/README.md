# Interface clips: the one voice per language (C5.6)

`app/audio/<lang>/<h>.opus` are the app's own words in one fixed woman's voice per language, made at build time by
`tools/voice.py` with Gemini's text-to-speech (Batch API). `<h>` is the text's hash (`text_hash` in
`hub/tutor_hub/voicing.py`, `textHash` in `app/js/speech.js`), so the app finds the clip for whatever it is about to
say: an interface string, a consent line, or a page read aloud in pieces. A lesson's clips live in its pack
(`content/packs/<pack>/audio/<lang>/t-<h>.opus`) and come with the lesson.

- `manifest.json`: what the app loads: the voice and `{hash: seconds}` for the learner app's own texts.
- `record.json`: every clip's sha256, render hash and the keys it voices (the staff pages' strings too: they are
  voiced, though staff pages have no speakers). Not loaded by the app.
- Opus in Ogg, mono, 16 kbit/s. The clips stay out of the APK (`android/sync-web.sh`); the hub and the online
  Worker serve them as static files, and the Android app fetches them from there.
- The voice and the chair's native-listener gate are in `content/voice.json`. A release build leaves out a
  language's clips until its native listener has passed the 30-clip sample; staging and the hub play them.
- Scripture is never voiced: the Quran keeps its reciter, and its translations take no voice at all (C4.7).

`bells/` holds the school day's bells (P19): tones, not words. `app/tests/speech.test.js` checks the manifests.

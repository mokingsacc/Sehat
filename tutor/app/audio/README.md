# Interface clips

`app/audio/<lang>/<key>.opus` are recordings of the app's own words (the keys of `app/js/i18n.js`), one folder per
language. `speech.js` plays a clip first, then the phone's own voice, then the "voice not ready yet" note.

**No synthetic Dari or Pashto voice, ever** (F1), and no text-to-speech of any kind for these clips: each is a
recording by a native speaker. `manifest.json` names each clip's file, who recorded it (a speaker code such as
`prs-01`, never a name: who the code stands for is kept off the repository, with the speaker's consent), when, its
sha256, and whether it is a placeholder.

**Every clip here today is a placeholder**: a two-note chime, not speech, made only to test the plumbing, and
marked `"placeholder": true`. The app skips placeholders, so the phone's voice still speaks, unless the tester
turns them on in the browser console with `localStorage.setItem('qalam.clips', 'placeholders')`. About 300 clips
a language are to be recorded (DESIGN.md 9); `app/tests/speech.test.js` checks the manifests.

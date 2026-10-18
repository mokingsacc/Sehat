// Speech practice without AI (C5.5, module `speak`, off by default; the admin's switch per cohort). On a `say` step
// where it is on, in a browser over HTTPS (never the APK, which has no microphone, nor the hub's plain http): "Play
// the voice", "Record" (8 s at most), then "Play mine" beside "Play the voice", then "I said it" or "Not yet"; three
// goes, then "Let's go on."; Next is never blocked. She marks herself, as `recall` lets her: no transcript, no mark
// from a machine. The recording lives in memory only and is dropped when the step closes: it is never written to
// storage, sent in a request, an event or a log (app/tests/speak.test.js patches every writer and checks).

export const MAX_MS = 8000;
export const GOES = 3;

let told = false;
// the one line about the microphone, shown on the first tap of Record in this run of the app (nothing is kept)
export function firstTap() { const first = !told; told = true; return first; }

// one step's practice. media: navigator.mediaDevices; Recorder: MediaRecorder; urls: URL; onChange(state) with
// 'recording' or 'recorded'
export function session({ media = globalThis.navigator && globalThis.navigator.mediaDevices,
  Recorder = globalThis.MediaRecorder, urls = globalThis.URL, onChange = () => {} } = {}) {
  let rec = null, stream = null, chunks = [], url = null, timer = null, goes = 0, over = false, dropped = false;
  const release = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };

  async function record() {
    if (dropped || over || !media || !Recorder) return false;
    if (rec && rec.state === 'recording') { rec.stop(); return true; }
    stream = await media.getUserMedia({ audio: true });
    if (dropped) { release(); return false; }
    chunks = [];
    const r = rec = new Recorder(stream);
    r.ondataavailable = (e) => { if (!dropped && e.data && e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      clearTimeout(timer);
      release();
      if (dropped) { chunks = []; return; }
      if (url) urls.revokeObjectURL(url);
      url = urls.createObjectURL(new Blob(chunks, { type: r.mimeType || 'audio/webm' }));
      chunks = [];
      onChange('recorded');
    };
    r.start();
    onChange('recording');
    timer = setTimeout(() => { if (r.state === 'recording') r.stop(); }, MAX_MS);
    return true;
  }

  // her own mark: 'said', 'again' (another go), 'go_on' (three goes: on to the next step) or 'over'
  function mark(said) {
    if (over) return 'over';
    goes += 1;
    if (said) { over = true; return 'said'; }
    if (goes >= GOES) { over = true; return 'go_on'; }
    return 'again';
  }

  // the step closes: the recording and the microphone go, nothing kept
  function drop() {
    dropped = true;
    clearTimeout(timer);
    if (rec && rec.state === 'recording') rec.stop();
    release();
    if (url) urls.revokeObjectURL(url);
    url = null; chunks = []; rec = null;
  }

  return { record, mark, drop, mine: () => url, recording: () => !!rec && rec.state === 'recording', goes: () => goes };
}

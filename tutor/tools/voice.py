"""The one voice per language (C5.6): every text Qalam writes, voiced at build time with Gemini's text-to-speech.

One fixed woman's voice per language (prs, ps, en, zh; content/voice.json names it). What is voiced: the learner
app's strings (app/js/i18n.js), the staff pages' strings (app/js/staff/strings/), the consent texts
(content/consent/) and every lesson text, phrase, word and letter of the packs (content/packs/). Scripture is never
voiced: no Quran verse or translation (an `ayah` step, the Quran set) goes to the service. Nothing else is read:
this tool opens only app/js/, content/ and its own output folders, never data/ or anything from a hub or D1, so no
learner's text, name or event can reach the service (app/tests/voice.test.js and hub/tests/test_voice.py check it).

Where the clips go (outside the APK; the hub and the online Worker serve them as static files):
  app/audio/<lang>/<h>.opus             one clip per distinct text, <h> = the text's hash (text_hash below; the app
                                        computes the same hash to find a clip for what it is about to say)
  app/audio/<lang>/manifest.json        what the learner app loads: the voice and {h: seconds} for its own strings
  app/audio/<lang>/record.json          the full record: each clip's sha256, render hash and keys (staff texts too)
  content/packs/<pack>/audio/<lang>/    a pack's clips, t-<h>.opus, named in the pack's manifest.json with the
                                        voice in place of a speaker code; the hub attaches them to the steps

Like Sehat's narration tool (tools/tts_gemini_batch.py on main): the Batch API (no daily cap, half price), a
"DIRECTOR'S NOTES ... TRANSCRIPT" prompt so the notes are never read aloud, a render hash per clip so an unchanged
line is never voiced again (a changed voice or style re-renders that whole language), identical lines voiced once,
every clip's length and loudness checked, and a stopped run picked up where it left off.

  export GEMINI_API_KEY=...
  python3 tools/voice.py --estimate         # what would be voiced, minutes and rough cost; no requests
  python3 tools/voice.py --sample           # 30 clips per language (letters, numbers, consent lines) to listen to
  python3 tools/voice.py                    # everything not voiced yet
  python3 tools/voice.py --lang ps          # one language

On a payment or quota refusal (402, an exhausted quota) the run stops cleanly: what was made is kept and listed,
any clip file not in a manifest is deleted, and the next run carries on. Tokens and the estimated cost are added up
in content/voice-usage.json.
"""
import argparse, base64, hashlib, json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.request

TUTOR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = lambda *p: os.path.join(TUTOR, *p)
sys.path.insert(0, J("hub"))
from tutor_hub.voicing import field_texts as _texts, lesson_texts, norm, text_hash  # noqa: E402  the app's rules
API = "https://generativelanguage.googleapis.com"

# --- settings -------------------------------------------------------------------------------------------------------
MODEL = os.environ.get("QALAM_TTS_MODEL", "gemini-3.8-flash-lite-tts")
PRICE_IN = float(os.environ.get("QALAM_TTS_PRICE_IN", "0.5"))     # US$ per million tokens, standard price; batch is
PRICE_OUT = float(os.environ.get("QALAM_TTS_PRICE_OUT", "10"))    # half of it (estimate only: check Google's page)
AUDIO_TOKENS_PER_SEC = 25
from tutor_hub.voicing import LANGS  # noqa: E402
CHARS_PER_SEC = {"prs": 12, "ps": 12, "en": 14, "zh": 3}           # slow, clear speech; to spot a bad clip
# Opus in Ogg, mono, 12 kbit/s for speech (clear for one voice, and a language's pack stays a few MB to share by
# Bluetooth): about 90 KB a minute
OPUS = ["-ac", "1", "-c:a", "libopus", "-b:a", "12k", "-vbr", "on", "-application", "voip", "-map_metadata", "-1"]
_COMMON = ("Style: a warm, patient woman teacher, speaking slowly and very clearly to children and to adults who are "
           "learning to read. Say each word fully. A single letter is said as the letter's name or sound, as a teacher "
           "teaching the alphabet would say it.\nOnly speak the transcript below; never read these notes aloud.")
STYLE = {
    "prs": "### DIRECTOR'S NOTES\nLanguage: Dari, the Persian spoken in Afghanistan. Accent: Kabul, Afghan (not Iranian).\n"
           + _COMMON + "\n\n#### TRANSCRIPT",
    "ps": "### DIRECTOR'S NOTES\nLanguage: Pashto, as spoken in Afghanistan (standard Afghan Pashto).\n"
          + _COMMON + "\n\n#### TRANSCRIPT",
    "en": "### DIRECTOR'S NOTES\nLanguage: English, a clear neutral accent for learners of English in Afghanistan.\n"
          + _COMMON + "\n\n#### TRANSCRIPT",
    "zh": "### DIRECTOR'S NOTES\nLanguage: Mandarin Chinese (Putonghua), standard pronunciation, every tone clear.\n"
          + _COMMON + "\n\n#### TRANSCRIPT",
}
# --------------------------------------------------------------------------------------------------------------------

STATE = J(".voice-batch.json")           # a batch sent and not yet collected (git ignores it)
DONE = {"JOB_STATE_SUCCEEDED", "BATCH_STATE_SUCCEEDED"}
ENDED = DONE | {"JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED", "BATCH_STATE_FAILED",
                "BATCH_STATE_CANCELLED", "BATCH_STATE_EXPIRED"}
READS = ("app/js", "content")            # the only folders this tool reads text from


class Stop(Exception):
    """Payment or quota: stop sending, keep what was made."""


def voices() -> dict:
    return json.load(open(J("content", "voice.json"), encoding="utf-8"))


def render_hash(lang: str, voice: str, text: str) -> str:
    return hashlib.sha1(f"{MODEL}|{voice}|{STYLE[lang]}|{norm(text)}|{' '.join(OPUS)}".encode()).hexdigest()[:12]


# --- what to voice ---------------------------------------------------------------------------------------------------
NODE_DUMP = r"""
const [i18nPath, staffDir] = process.argv.slice(1);
const i = await import(i18nPath);
const out = { app: {}, staff: {} };
for (const l of i.LANGS) {
  i.setLang(l); const rows = out.app[l] = [];
  for (const tone of ['child', 'adult']) {
    i.setTone(tone);
    for (const k of i.keys(l)) {
      const t = i.s(k);
      if (!/\{\w*\}/.test(t)) { rows.push([k, t]); continue; }
      const vars = [...t.matchAll(/\{(\w*)\}/g)].map((m) => m[1]);
      if (vars.every((v) => v === 'n')) for (let n = 1; n <= 12; n++) rows.push([`${k}{n=${n}}`, i.s(k, { n })]);
    }
  }
}
for (const l of ['en', 'prs', 'ps']) {
  const m = await import(staffDir + '/' + l + '.js');
  out.staff[l] = Object.entries(m.default).filter(([, v]) => typeof v === 'string' && !/\{\w*\}/.test(v));
}
console.log(JSON.stringify(out));
"""


def app_strings() -> dict:
    from pathlib import Path
    r = subprocess.run(["node", "--input-type=module", "-e", NODE_DUMP, Path(J("app", "js", "i18n.js")).as_uri(),
                        Path(J("app", "js", "staff", "strings")).as_uri()], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def consent_texts() -> dict:
    out = {}
    for l in ("prs", "ps", "en"):
        d = J("content", "consent", l)
        for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            doc = json.load(open(os.path.join(d, f), encoding="utf-8"))
            rows = doc.get("rows") or {}
            out.setdefault(l, []).extend([(f"consent:{doc.get('version')}:{k}", v) for k, v in rows.items()] +
                                         [(f"consent:{doc.get('version')}:full{i}", v) for i, v in enumerate(doc.get("full") or [])])
    return out


def plan_all() -> dict:
    """{(lang, h): {"text", "dests": set of ("app"|"staff"|pack id), "keys": [...]}} for everything Qalam writes."""
    items = {}

    def add(lang, text, dest, key=None):
        if lang not in LANGS or not norm(text):
            return
        it = items.setdefault((lang, text_hash(text)), {"text": norm(text), "dests": set(), "keys": []})
        it["dests"].add(dest)
        if key and key not in it["keys"]:
            it["keys"].append(key)

    s = app_strings()
    for l, rows in s["app"].items():
        for k, t in rows:
            add(l, t, "app", k)
    for l, rows in consent_texts().items():
        for k, t in rows:
            add(l, t, "app", k)
    for l, rows in s["staff"].items():
        for k, t in rows:
            add(l, t, "staff", k)
    for pid in sorted(os.listdir(J("content", "packs"))):
        pf = J("content", "packs", pid, "pack.json")
        if not os.path.isfile(pf):
            continue
        pack = json.load(open(pf, encoding="utf-8"))
        langs = [l for l in pack.get("langs", ["prs", "ps"]) if l in LANGS]
        for l, t in _texts(pack.get("title"), langs):
            add(l, t, pid)
        for lid in pack.get("lessons", []):
            lf = J("content", "packs", pid, "lessons", lid + ".json")
            if os.path.isfile(lf):
                for l, t in lesson_texts(json.load(open(lf, encoding="utf-8")), langs):
                    add(l, t, pid)
    return items


def sample(items: dict, lang: str, n: int = 30) -> list:
    """The native listener's 30 (C5.6): letters, numbers, the four consent lines, then the shortest other lines."""
    mine = {k: v for k, v in items.items() if k[0] == lang and v["dests"] - {"staff"}}
    letter = lambda t: len(t) <= 2 and not re.search(r"[0-9۰-۹]", t)
    number = lambda t: bool(re.fullmatch(r"[0-9۰-۹٠-٩ ]+", t))
    consent = lambda v: any(re.match(r"consent:[^:]+:(does|keeps|sees|stop)$", k) for k in v["keys"])
    picked = []
    for test in (lambda k, v: letter(v["text"]), lambda k, v: number(v["text"]), lambda k, v: consent(v)):
        for k, v in sorted(mine.items(), key=lambda kv: kv[1]["text"]):
            if test(k, v) and k not in picked and len(picked) < n:
                picked.append(k)
    rest = sorted((k for k in mine if k not in picked), key=lambda k: (len(mine[k]["text"]) < 8, len(mine[k]["text"]), k))
    return picked + rest[:n - len(picked)]


# --- where clips live -----------------------------------------------------------------------------------------------
def app_dir(lang):
    return J("app", "audio", lang)


def pack_dir(pid, lang):
    return J("content", "packs", pid, "audio", lang)


def load_json(p, default):
    try:
        return json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        return default


class Store:
    """The record of every clip made, per language: the app's record.json and each pack's manifest.json."""

    def __init__(self, vmap):
        self.v = vmap
        self.app = {l: load_json(os.path.join(app_dir(l), "record.json"), {}).get("clips", {}) for l in LANGS}
        self.packs = {}
        for pid in sorted(os.listdir(J("content", "packs"))):
            for l in LANGS:
                m = load_json(os.path.join(pack_dir(pid, l), "manifest.json"), None)
                if m is not None:
                    self.packs[(pid, l)] = m.get("clips", {})

    def have(self, lang, h, dest, r):
        if dest in ("app", "staff"):
            c = self.app[lang].get(h)
            return bool(c and c.get("r") == r and os.path.exists(os.path.join(app_dir(lang), h + ".opus")))
        c = self.packs.get((dest, lang), {}).get("t-" + h)
        return bool(c and c.get("r") == r and os.path.exists(os.path.join(pack_dir(dest, lang), c["file"])))

    def source(self, lang, h, r):
        """A file already made for this text and voice, anywhere, to copy instead of voicing again."""
        c = self.app[lang].get(h)
        if c and c.get("r") == r and os.path.exists(os.path.join(app_dir(lang), h + ".opus")):
            return os.path.join(app_dir(lang), h + ".opus"), c.get("s")
        for (pid, l), clips in self.packs.items():
            c = clips.get("t-" + h)
            if l == lang and c and c.get("r") == r and os.path.exists(os.path.join(pack_dir(pid, l), c["file"])):
                return os.path.join(pack_dir(pid, l), c["file"]), c.get("s")
        return None, None

    def put(self, lang, h, item, src, secs, r):
        """Write a made clip (src) to every place the text is used."""
        sha = "sha256:" + hashlib.sha256(open(src, "rb").read()).hexdigest()
        for dest in sorted(item["dests"]):
            if dest in ("app", "staff"):
                d, name, rec = app_dir(lang), h + ".opus", self.app[lang]
                prev = rec.get(h, {})
                keys = sorted(set(prev.get("keys", [])) | set(item["keys"]))
                rec[h] = {"file": name, "sha256": sha, "s": secs, "r": r, "keys": keys,
                          "learner": bool(prev.get("learner")) or "app" in item["dests"]}
            else:
                d, name = pack_dir(dest, lang), "t-" + h + ".opus"
                self.packs.setdefault((dest, lang), {})["t-" + h] = {
                    "file": name, "voice": self.v[lang], "generated": True, "placeholder": False, "sha256": sha,
                    "s": secs, "r": r, "text": item["text"]}
            os.makedirs(d, exist_ok=True)
            out = os.path.join(d, name)
            if os.path.abspath(out) != os.path.abspath(src):
                shutil.copyfile(src, out)

    def save(self, wanted=None):
        """Write every manifest; with `wanted` ({(lang, h): item}), drop what no text asks for any more."""
        for l in LANGS:
            rec = self.app[l]
            if wanted is not None:
                for h in list(rec):
                    it = wanted.get((l, h))
                    if not it or not (it["dests"] & {"app", "staff"}):
                        del rec[h]
                    else:
                        rec[h]["learner"] = "app" in it["dests"]
                        rec[h]["keys"] = sorted(it["keys"])
            if not rec and not os.path.isdir(app_dir(l)):
                continue
            os.makedirs(app_dir(l), exist_ok=True)
            json.dump({"lang": l, "voice": self.v[l], "about": "Gemini text-to-speech, one voice per language (C5.6); "
                       "made by tools/voice.py. Not loaded by the app: manifest.json is.", "clips": rec},
                      open(os.path.join(app_dir(l), "record.json"), "w", encoding="utf-8"),
                      ensure_ascii=False, indent=0, sort_keys=True)
            learner = {h: c["s"] for h, c in sorted(rec.items()) if c.get("learner")}
            json.dump({"lang": l, "voice": self.v[l], "clips": learner},
                      open(os.path.join(app_dir(l), "manifest.json"), "w", encoding="utf-8"), separators=(",", ":"))
        for (pid, l), clips in list(self.packs.items()):
            if wanted is not None:
                for name in list(clips):
                    if name.startswith("t-") and pid not in (wanted.get((l, name[2:])) or {}).get("dests", ()):
                        del clips[name]
            d = pack_dir(pid, l)
            if not clips:
                if os.path.isdir(d):
                    shutil.rmtree(d)
                self.packs.pop((pid, l))
                continue
            os.makedirs(d, exist_ok=True)
            json.dump({"lang": l, "voice": self.v[l], "about": "Gemini text-to-speech, one voice per language "
                       "(C5.6); made by tools/voice.py, each clip played by the reviewer before OK (P17).",
                       "clips": clips}, open(os.path.join(d, "manifest.json"), "w", encoding="utf-8"),
                      ensure_ascii=False, indent=0, sort_keys=True)
        audio = J("content", "packs")
        for pid in os.listdir(audio):
            a = os.path.join(audio, pid, "audio")
            if os.path.isdir(a) and not os.listdir(a):
                os.rmdir(a)

    def sweep(self):
        """Delete every clip file no manifest names (a half-made clip, a line no longer used)."""
        gone = 0
        for l in LANGS:
            keep = {c["file"] for c in self.app[l].values()}
            d = app_dir(l)
            for f in os.listdir(d) if os.path.isdir(d) else []:
                if f.endswith((".opus", ".part", ".wav", ".mp3", ".ogg")) and f not in keep:
                    os.remove(os.path.join(d, f)); gone += 1
        for pid in os.listdir(J("content", "packs")):
            for l in LANGS:
                d = pack_dir(pid, l)
                keep = {c.get("file") for c in self.packs.get((pid, l), {}).values()}
                for f in os.listdir(d) if os.path.isdir(d) else []:
                    if f.endswith((".opus", ".part", ".wav", ".mp3", ".ogg")) and f not in keep:
                        os.remove(os.path.join(d, f)); gone += 1
        return gone


# --- Gemini's Batch API --------------------------------------------------------------------------------------------
def call(method, url, key, body=None, headers=None, raw=False, timeout=120):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    h = {"x-goog-api-key": key, **({"Content-Type": "application/json"} if data and not headers else {}), **(headers or {})}
    for attempt in range(6):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, data, h, method=method), timeout=timeout)
            return r if raw else json.load(r)
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:800]
            if e.code == 402 or re.search(r"billing|credit|prepay|payment", msg, re.I) and e.code in (400, 403, 429):
                raise Stop(f"{e.code}: {msg}")
            if e.code == 429 and re.search(r"quota|RESOURCE_EXHAUSTED", msg) and attempt >= 2:
                raise Stop(f"{e.code}: {msg}")
            if e.code in (429, 500, 502, 503) and attempt < 5:
                time.sleep(10 * (attempt + 1)); continue
            raise SystemExit(f"Gemini said {e.code} for {url.split('?')[0]}: {msg}")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 5:
                time.sleep(10); continue
            raise SystemExit(f"Request failed: {e}")


def upload(lines, key):
    data = "".join(json.dumps(l, ensure_ascii=False) + "\n" for l in lines).encode()
    start = call("POST", f"{API}/upload/v1beta/files", key, {"file": {"display_name": "qalam-voice"}}, raw=True, headers={
        "Content-Type": "application/json", "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(len(data)), "X-Goog-Upload-Header-Content-Type": "application/jsonl"})
    url = start.headers["x-goog-upload-url"]
    res = json.load(urllib.request.urlopen(urllib.request.Request(url, data, {
        "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "Content-Length": str(len(data))},
        method="POST"), timeout=600))
    return res["file"]["name"]


def submit(chunk, vmap, key):
    lines = [{"key": k, "request": {"contents": [{"parts": [{"text": f"{STYLE[lang]}\n\n{text}"}]}],
                                    "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {
                                        "prebuiltVoiceConfig": {"voiceName": vmap[lang]}}}}}}
             for k, (lang, text) in chunk.items()]
    f = upload(lines, key)
    job = call("POST", f"{API}/v1beta/models/{MODEL}:batchGenerateContent", key,
               {"batch": {"display_name": "qalam-voice", "input_config": {"file_name": f}}})
    print(f"sent {len(lines)} lines as {job['name']}", flush=True)
    return job["name"]


def wait(name, key):
    while True:
        b = call("GET", f"{API}/v1beta/{name}", key)
        md = b.get("metadata", b)
        state = md.get("state", "")
        if state in ENDED:
            if state not in DONE:
                raise SystemExit(f"The batch ended as {state}: {json.dumps(b)[:600]}")
            return b
        print(f"  {state.split('_')[-1].lower()}: {json.dumps(md.get('batchStats', {}))}", flush=True)
        time.sleep(30)


def results(b, key):
    resp = b.get("response", {}) or b.get("metadata", {}).get("output", {})
    f = resp.get("responsesFile") or resp.get("output", {}).get("responsesFile")
    if f:
        tmp = STATE + ".results.jsonl"
        for _ in range(5):
            try:
                with call("GET", f"{API}/download/v1beta/{f}:download?alt=media", key, raw=True, timeout=600) as r, \
                        open(tmp, "wb") as out:
                    shutil.copyfileobj(r, out, 1 << 20)
                with open(tmp, encoding="utf-8") as fh:
                    rows = [json.loads(line) for line in fh if line.strip()]
                break
            except (ValueError, OSError) as e:
                print(f"  results download incomplete ({type(e).__name__}), fetching again"); time.sleep(10)
        else:
            raise SystemExit("Could not download the batch results; run this again (the batch is kept, not paid twice).")
        os.remove(tmp)
        for d in rows:
            yield d.get("key"), d.get("response"), d.get("error")
    else:
        for d in (resp.get("inlinedResponses", {}) or {}).get("inlinedResponses", []):
            yield d.get("metadata", {}).get("key"), d.get("response"), d.get("error")


# --- the clip -------------------------------------------------------------------------------------------------------
def to_opus(data, mime, out):
    """Trim the silence at both ends, even the loudness, and write Opus; in two steps with a time limit, as Sehat's
    batch tool does (a one-step filter chain froze ffmpeg on some clips)."""
    src = ["-f", "s16le", "-ar", "24000", "-ac", "1"] if "l16" in mime.lower() or "pcm" in mime.lower() else []
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
            "silenceremove=start_periods=1:start_threshold=-45dB,areverse")
    a = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, "-i", "pipe:0", "-af", trim, "-f", "wav", "pipe:1"],
                       input=data, capture_output=True, timeout=120)
    tmp = out + ".part"
    b = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "pipe:0", "-af", "loudnorm=I=-18:TP=-2", "-ar", "24000",
                        *OPUS, "-f", "ogg", tmp], input=a.stdout, capture_output=True, timeout=120)
    if a.returncode or b.returncode:
        raise RuntimeError(f"ffmpeg failed for {out}")
    os.replace(tmp, out)


def seconds(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def loudness(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.search(r"mean_volume: (-?[\d.]+) dB", r.stderr)
    return float(m.group(1)) if m else -99.0


def check(lang, text, path):
    """None if the clip is speech of a sensible length for its text; else why not."""
    got, want = seconds(path), max(len(text) / CHARS_PER_SEC[lang], 0.3)
    if got < 0.15:
        return f"{got:.2f}s: silence"
    if loudness(path) < -40:
        return "too quiet: silence or noise"
    if not (0.3 * want <= got <= 2.5 * want + 2):
        return f"{got:.1f}s for {len(text)} letters (about {want:.1f}s expected)"
    return None


# --- the run --------------------------------------------------------------------------------------------------------
def log_usage(entry):
    p = J("content", "voice-usage.json")
    hist = load_json(p, [])
    hist.append(entry)
    json.dump(hist, open(p, "w", encoding="utf-8"), indent=1)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--lang", choices=LANGS, action="append")
    ap.add_argument("--sample", action="store_true", help="30 clips per language, for the native listener")
    ap.add_argument("--estimate", action="store_true", help="count what would be voiced; no requests")
    ap.add_argument("--size", type=int, default=int(os.environ.get("QALAM_BATCH_SIZE", "1500")))
    a = ap.parse_args(argv)
    vcfg = voices()
    vmap = vcfg["voices"]
    langs = a.lang or list(LANGS)
    items = plan_all()
    store = Store(vmap)
    pick = [k for l in langs for k in sample(items, l)] if a.sample else [k for k in items if k[0] in langs]
    todo, copies, unchanged = {}, [], 0
    for lang, h in pick:
        it = items[(lang, h)]
        r = render_hash(lang, vmap[lang], it["text"])
        if all(store.have(lang, h, d, r) for d in it["dests"]):
            unchanged += 1; continue
        src, _ = store.source(lang, h, r)
        if src:
            copies.append((lang, h)); continue
        todo[f"{lang}|{h}|{r}"] = (lang, it["text"])
    chars = sum(len(t) for _, t in todo.values())
    secs = sum(len(t) / CHARS_PER_SEC[l] + 0.4 for l, t in todo.values())
    est = (secs * AUDIO_TOKENS_PER_SEC * PRICE_OUT + (chars + 120 * len(todo)) * 0.6 * PRICE_IN) / 2 / 1e6
    per = {l: sum(1 for k in todo.values() if k[0] == l) for l in langs}
    print(f"{len(todo)} to voice {per}, {len(copies)} to copy, {unchanged} unchanged; about {secs / 60:.0f} minutes of "
          f"speech, roughly ${est:.2f} at batch price")
    if a.estimate:
        if a.sample:
            for k in pick:
                print(f"  {k[0]} {k[1]}  {items[k]['text'][:70]}")
        return 0
    store.save(items)                         # forget lines no text uses any more, and their files
    store.sweep()
    for l, h in copies:
        it = items[(l, h)]
        r = render_hash(l, vmap[l], it["text"])
        src, s = store.source(l, h, r)
        store.put(l, h, it, src, s, r)
    store.save(items)
    key = os.environ.get("GEMINI_API_KEY")
    if todo and not key:
        sys.exit("Set GEMINI_API_KEY first.")
    for tool in ("ffmpeg", "ffprobe"):
        if todo and not shutil.which(tool):
            sys.exit(f"{tool} is not installed (nothing was sent).")
    usage = {"in": 0, "out": 0}
    made, flags, stopped = 0, [], None
    tmpdir = J(".voice-tmp")
    os.makedirs(tmpdir, exist_ok=True)

    def run(chunk, last):
        nonlocal made
        st = load_json(STATE, {})
        name = st.get("job") if st.get("model") == MODEL and set(st.get("keys", [])) == set(chunk) else None
        if not name:
            name = submit(chunk, vmap, key)
            json.dump({"job": name, "model": MODEL, "keys": sorted(chunk)}, open(STATE, "w"), indent=1)
        b = wait(name, key)
        again, before, seen = {}, (usage["in"], usage["out"], made), set()
        try:
            for k, res, err in results(b, key):
                if k not in chunk:
                    continue
                seen.add(k)
                lang, text = chunk[k]
                _, h, r = k.split("|")
                try:
                    part = res["candidates"][0]["content"]["parts"][0]["inlineData"]
                except (TypeError, KeyError, IndexError):
                    again[k] = chunk[k]; print(f"  {lang} {h}: no audio ({json.dumps(err or res)[:200]})"); continue
                u = res.get("usageMetadata", {})
                usage["in"] += u.get("promptTokenCount", 0); usage["out"] += u.get("candidatesTokenCount", 0)
                out = os.path.join(tmpdir, h + "." + lang + ".opus")
                try:
                    to_opus(base64.b64decode(part["data"]), part.get("mimeType", ""), out)
                except (subprocess.TimeoutExpired, RuntimeError) as e:
                    again[k] = chunk[k]; print(f"  {lang} {h}: could not convert ({type(e).__name__})"); continue
                bad = check(lang, text, out)
                if bad and not last:
                    again[k] = chunk[k]; print(f"  {lang} {h}: {bad}; sending again"); os.remove(out); continue
                if bad:
                    flags.append(f"{lang} {h} \"{text[:40]}\": {bad}; listen to it")
                store.put(lang, h, items[(lang, h)], out, round(seconds(out), 2), r)
                os.remove(out)
                made += 1
        finally:
            store.save(items)
        again.update({k: v for k, v in chunk.items() if k not in seen})     # anything the results left out
        n_in, n_out = usage["in"] - before[0], usage["out"] - before[1]
        log_usage({"when": time.strftime("%Y-%m-%d %H:%M"), "model": MODEL + " (batch)", "batch": name,
                   "made": made - before[2], "input_tokens": n_in, "audio_tokens": n_out,
                   "estimated_usd": round((n_in * PRICE_IN + n_out * PRICE_OUT) / 2 / 1e6, 3)})
        os.remove(STATE)
        return again

    try:
        rest, first = dict(todo), None
        st = load_json(STATE, {})
        if st.get("model") == MODEL and st.get("keys") and all(k in rest for k in st["keys"]):
            first = st["keys"]                # a batch a stopped run sent: collect it first, never pay twice
        for round_ in range(3):
            if not rest:
                break
            keys, slices, again = list(rest), [], {}
            if first:
                slices.append(first); keys = [k for k in keys if k not in set(first)]; first = None
            slices += [keys[n:n + a.size] for n in range(0, len(keys), a.size)]
            for sl in slices:
                again.update(run({k: rest[k] for k in sl}, round_ == 2))
                print(f"round {round_ + 1}: {made} clips made so far", flush=True)
            rest = again
    except Stop as e:
        stopped = str(e)[:400]
    finally:
        store.save(items)
        gone = store.sweep()
        shutil.rmtree(tmpdir, ignore_errors=True)
    cost = (usage["in"] * PRICE_IN + usage["out"] * PRICE_OUT) / 2 / 1e6
    print(f"made {made}, copied {len(copies)}, {unchanged} unchanged; {usage['out']} audio tokens, about ${cost:.2f} "
          f"(batch price); {gone} stray file(s) deleted")
    for f in flags:
        print("  listen to:", f)
    if stopped:
        print(f"STOPPED: Gemini refused for payment or quota ({stopped}). Everything made is kept and in its manifest; "
              "run this again once the account allows it.")
        return 2
    if a.sample:
        return 0
    missing = len(todo) - made
    if missing > 0:
        print(f"{missing} line(s) still not voiced; run this again.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

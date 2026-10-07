"""Make placeholder narration with Google's Gemini text-to-speech.

Reads content/scripts/narration-<lang>.tsv (written by tools/build.py) and writes
audio/<lang>-<f|m>/<id>.mp3, one clip per text block, for a woman's voice (f) and a man's voice (m).
These are the app's audio slots: run python3 tools/build.py afterwards and the app uses them.
Clips whose text has not changed since the last run are skipped (audio/<lang>-<voice>/tts-manifest.json).
A clip that a person recorded (imported with tools/import_recordings.py) is never overwritten.

  export GEMINI_API_KEY=...
  python3 tools/tts_gemini.py --estimate        # how many clips, minutes and roughly what it costs; no requests
  python3 tools/tts_gemini.py --sample          # 6 clips per language and voice, to listen to first
  python3 tools/tts_gemini.py                   # everything: women's voices first, danger signs first
  python3 tools/tts_gemini.py --lang ps --voice f --only danger-child
  python3 tools/build.py                        # then rebuild so the app lists the new clips

To use as little of the Gemini allowance as possible:
- a line whose text is the same as another line's is made once and copied;
- lines that did not change since the last run are skipped, so re-running after an edit only pays for the edit;
- the order is the app's own (opening words, then the danger-sign pages, then the rest), women's voices first,
  so if a daily limit stops the run, what is already made is the most useful part; just run it again later;
- each clip's length is checked against its text, and a clip that came back cut short or garbled is made again;
- tokens used and the estimated cost are added up in audio/tts-usage.json.

Settings below (model, voice names, style, prices) can be changed without touching the rest.
"""
import argparse, base64, csv, hashlib, json, os, re, shutil, subprocess, sys, threading, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = lambda *p: os.path.join(ROOT, *p)

MODEL = os.environ.get("GEMINI_TTS_MODEL", "auto")  # "auto": the newest Flash text-to-speech model this key can use
# US dollars per million tokens, for the cost estimate only (check https://ai.google.dev/gemini-api/docs/pricing)
PRICE_IN = float(os.environ.get("GEMINI_PRICE_IN", "0.5"))
PRICE_OUT = float(os.environ.get("GEMINI_PRICE_OUT", "10"))
AUDIO_TOKENS_PER_SEC = 25  # how Gemini counts audio
CHARS_PER_SEC = 12  # slow, clear Dari or Pashto; used to spot clips that came back far too short or long
VOICES = {"f": os.environ.get("GEMINI_VOICE_F", "Kore"), "m": os.environ.get("GEMINI_VOICE_M", "Charon")}
STYLE = {
    "fa": "Read this aloud in Dari, the Persian spoken in Afghanistan, with a Kabul accent. Speak slowly, clearly and warmly, like a kind village health worker talking to a family:",
    "ps": "Read this aloud in Pashto, as spoken in northern Afghanistan. Speak slowly, clearly and warmly, like a kind village health worker talking to a family:",
}
SAMPLE = ["ui.welcome", "ui.home", "danger-child.lead", "diarrhoea.lead", "vaccines.title", "red-flags.lead"]


class DailyLimit(Exception):
    pass


def pick_model(key):
    if MODEL != "auto": return MODEL
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", headers={"x-goog-api-key": key})
    names = [m["name"].split("/")[-1] for m in json.load(urllib.request.urlopen(req, timeout=60)).get("models", [])]
    tts_ = [n for n in names if "tts" in n]
    if not tts_: raise SystemExit("This key cannot see any text-to-speech model. Set GEMINI_TTS_MODEL to one by hand.")
    ver = lambda n: [float(x) for x in re.findall(r"\d+(?:\.\d+)?", n)[:1]] or [0]
    # Flash before Pro (cheaper, and plenty for narration); newest version; a final release before a preview
    return sorted(tts_, key=lambda n: ("flash" in n, ver(n), "preview" not in n), reverse=True)[0]


USAGE = {"requests": 0, "in": 0, "out": 0}
LOCK = threading.Lock()


def tts(text, lang, voice, key):
    body = {"contents": [{"parts": [{"text": f"{STYLE[lang]}\n\n{text}"}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICES[voice]}}}}}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json", "x-goog-api-key": key})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                res = json.load(r)
                part = res["candidates"][0]["content"]["parts"][0]["inlineData"]
                u = res.get("usageMetadata", {})
                with LOCK:
                    USAGE["requests"] += 1; USAGE["in"] += u.get("promptTokenCount", 0); USAGE["out"] += u.get("candidatesTokenCount", 0)
                return base64.b64decode(part["data"]), part.get("mimeType", "")
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:1500]
            if e.code == 429 and re.search(r"per ?day|PerDay|daily", msg, re.I): raise DailyLimit(msg)
            if e.code in (429, 500, 503) and attempt < 5:
                m = re.search(r'"retryDelay":\s*"(\d+)', msg)
                wait = int(m.group(1)) + 1 if m else 2 ** attempt * 5; print(f"  busy ({e.code}), waiting {wait}s"); time.sleep(wait); continue
            raise SystemExit(f"Gemini said {e.code}: {msg}")
        except (urllib.error.URLError, TimeoutError, KeyError, IndexError) as e:
            if attempt < 5: time.sleep(5); continue
            raise SystemExit(f"Gemini request failed: {e}")


# Speech MP3 that plays on every phone (iPhone Safari, old Android Chrome): mono, 16 kHz, 24 kbps constant bit rate,
# no tags. About 180 KB per minute. Same settings as tools/import_recordings.py.
MP3 = ["-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "24k", "-map_metadata", "-1", "-id3v2_version", "0", "-write_id3v1", "0"]


def to_mp3(data, mime, out):
    # raw PCM (audio/L16) needs its format spelled out; WAV carries its own header
    src = ["-f", "s16le", "-ar", "24000", "-ac", "1"] if "l16" in mime.lower() or "pcm" in mime.lower() else []
    flt = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2"
    tmp = out + ".part.mp3"  # written next to the clip, then renamed, so a stopped run never leaves half a clip
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *src, "-i", "pipe:0", "-af", flt, *MP3, tmp], input=data)
    if r.returncode: raise SystemExit(f"ffmpeg failed for {out}")
    os.replace(tmp, out)


def seconds(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except ValueError: return 0.0


def make(text, lang, voice, key, out):
    """One clip, made again (up to twice) if its length is far from what the text needs."""
    want = len(text) / CHARS_PER_SEC
    for attempt in range(3):
        data, mime = tts(text, lang, voice, key); to_mp3(data, mime, out)
        got = seconds(out)
        if 0.4 * want <= got <= 2.5 * want + 2: return None
        print(f"  {os.path.basename(out)}: {got:.1f}s for {len(text)} letters (expected about {want:.0f}s), making it again")
    return f"{lang}-{voice}/{os.path.basename(out)}: {got:.1f}s, expected about {want:.0f}s; listen to it"


def order(rows):
    cfg = json.load(open(J("content", "src", "config.json"), encoding="utf-8"))
    urgent = cfg.get("urgentTopics", [])
    rank = lambda r: (0 if r["id"].startswith("ui.") else 1 if r["id"].split(".")[0] in urgent else 2)
    return sorted(rows, key=rank)  # sorted() keeps the book's own order inside each group


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", choices=["fa", "ps"], action="append")
    ap.add_argument("--voice", choices=["f", "m"], action="append")
    ap.add_argument("--only", help="only ids starting with this (e.g. a topic id)")
    ap.add_argument("--sample", action="store_true")
    ap.add_argument("--estimate", action="store_true", help="count what would be made and roughly what it costs; no requests")
    ap.add_argument("--jobs", type=int, default=int(os.environ.get("GEMINI_JOBS", "3")), help="requests at the same time (1 on the free tier)")
    a = ap.parse_args()
    key = os.environ.get("GEMINI_API_KEY") or (None if a.estimate else sys.exit("Set GEMINI_API_KEY first."))
    model = MODEL if a.estimate else pick_model(key)
    if not a.estimate: print(f"model {model}, {a.jobs} at a time")
    made = skipped = human = copied = 0; todo_chars = todo_clips = 0; flags = []
    stopped = None
    for voice in a.voice or ["f", "m"]:  # both women's voices first: most listeners are mothers
        for lang in a.lang or ["fa", "ps"]:
            if stopped: break
            rows = list(csv.DictReader(open(J("content", "scripts", f"narration-{lang}.tsv"), encoding="utf-8"), delimiter="\t"))
            if a.sample: rows = [r for r in rows if r["id"] in SAMPLE]
            if a.only: rows = [r for r in rows if r["id"].startswith(a.only)]
            rows = order(rows)
            # straight into the app's audio slot; the manifest beside the clips remembers which ones came from Gemini
            d = J("audio", f"{lang}-{voice}"); os.makedirs(d, exist_ok=True)
            man_p = os.path.join(d, "tts-manifest.json")
            man = json.load(open(man_p, encoding="utf-8")) if os.path.exists(man_p) else {}
            files = set(os.listdir(d))
            jobs, same = {}, []  # text hash -> [first id, out]; and lines that just copy another line's clip
            for r in rows:
                text = r["text"].strip()
                if not text: continue
                h = hashlib.sha1(f"{model}|{VOICES[voice]}|{STYLE[lang]}|{text}|{' '.join(MP3)}".encode()).hexdigest()[:12]
                out = os.path.join(d, r["id"] + ".mp3")
                others = [f for f in files if os.path.splitext(f)[0] == r["id"] and f != r["id"] + ".mp3"]
                if (r["id"] + ".mp3" in files and r["id"] not in man) or others: human += 1; continue  # a person's recording: keep it
                if man.get(r["id"]) == h and os.path.exists(out): skipped += 1; continue
                if h in jobs: same.append((r["id"], out, h)); continue
                done = next((i for i, v in man.items() if v == h and os.path.exists(os.path.join(d, i + ".mp3"))), None)
                if done: same.append((r["id"], out, h)); jobs.setdefault(h, (done, os.path.join(d, done + ".mp3"), text, True)); continue
                jobs[h] = (r["id"], out, text, False)
            new = [(h, j) for h, j in jobs.items() if not j[3]]
            todo_clips += len(new); todo_chars += sum(len(j[2]) for _, j in new)
            if a.estimate:
                print(f"{lang}-{voice}: {len(new)} to make, {len(same)} copies of identical lines, {skipped} unchanged so far"); continue

            def one(item):
                h, (i, out, text, _) = item
                flag = make(text, lang, voice, key, out)
                with LOCK:
                    man[i] = h; json.dump(man, open(man_p, "w", encoding="utf-8"), indent=0, sort_keys=True)
                print(f"{lang}-{voice} {i}")
                return flag
            with ThreadPoolExecutor(max(1, a.jobs)) as ex:
                futs = [ex.submit(one, it) for it in new]
                for f in futs:
                    try:
                        fl = f.result(); made += 1
                        if fl: flags.append(fl)
                    except DailyLimit as e:
                        stopped = str(e)[:300]
                        for g in futs: g.cancel()
            for i, out, h in same:  # identical wording: one request, many clips
                src = jobs[h][1]
                if man.get(jobs[h][0]) == h and os.path.exists(src):
                    shutil.copyfile(src, out); man[i] = h; copied += 1
            json.dump(man, open(man_p, "w", encoding="utf-8"), indent=0, sort_keys=True)

    secs = todo_chars / CHARS_PER_SEC
    est = (secs * AUDIO_TOKENS_PER_SEC * PRICE_OUT + todo_chars * 1.5 * PRICE_IN) / 1e6
    if a.estimate:
        print(f"total: {todo_clips} clips, about {secs/60:.0f} minutes of speech, roughly ${est:.2f} at ${PRICE_OUT}/M audio tokens (estimate)")
        return
    cost = (USAGE["in"] * PRICE_IN + USAGE["out"] * PRICE_OUT) / 1e6
    up = J("audio", "tts-usage.json")
    hist = json.load(open(up, encoding="utf-8")) if os.path.exists(up) else []
    hist.append({"when": time.strftime("%Y-%m-%d %H:%M"), "model": model, "made": made, "copied": copied, "requests": USAGE["requests"],
                 "input_tokens": USAGE["in"], "audio_tokens": USAGE["out"], "estimated_usd": round(cost, 2), "check": flags})
    json.dump(hist, open(up, "w", encoding="utf-8"), indent=1)
    print(f"made {made}, copied {copied} identical lines, skipped {skipped} unchanged, kept {human} human recordings.")
    print(f"{USAGE['requests']} requests, {USAGE['out']} audio tokens, about ${cost:.2f} (estimate; see audio/tts-usage.json).")
    for fl in flags: print("  listen to:", fl)
    if stopped: print("Stopped: the daily limit was reached. Everything made so far is kept; run the same command again tomorrow, or turn on billing for the key.")
    print("Now run: python3 tools/build.py")


if __name__ == "__main__":
    main()

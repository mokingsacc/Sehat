"""Make placeholder narration with Google's Gemini text-to-speech.

Reads content/scripts/narration-<lang>.tsv (written by tools/build.py) and writes
audio/<lang>-<f|m>/<id>.mp3, one clip per text block, for a woman's voice (f) and a man's voice (m).
These are the app's audio slots: run python3 tools/build.py afterwards and the app uses them.
Clips whose text has not changed since the last run are skipped (audio/<lang>-<voice>/tts-manifest.json).
A clip that a person recorded (imported with tools/import_recordings.py) is never overwritten.

  export GEMINI_API_KEY=...
  python3 tools/tts_gemini.py --sample          # 6 clips per language and voice, to listen to first
  python3 tools/tts_gemini.py                   # everything
  python3 tools/tts_gemini.py --lang ps --voice f --only danger-child
  python3 tools/build.py                        # then rebuild so the app lists the new clips

Settings below (model, voice names, style) can be changed without touching the rest.
"""
import argparse, base64, csv, hashlib, json, os, subprocess, sys, time, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = lambda *p: os.path.join(ROOT, *p)

MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
VOICES = {"f": os.environ.get("GEMINI_VOICE_F", "Kore"), "m": os.environ.get("GEMINI_VOICE_M", "Charon")}
STYLE = {
    "fa": "Read this aloud in Dari, the Persian spoken in Afghanistan, with a Kabul accent. Speak slowly, clearly and warmly, like a kind village health worker talking to a family:",
    "ps": "Read this aloud in Pashto, as spoken in northern Afghanistan. Speak slowly, clearly and warmly, like a kind village health worker talking to a family:",
}
SAMPLE = ["ui.welcome", "ui.home", "danger-child.lead", "diarrhoea.lead", "vaccines.title", "red-flags.lead"]


def tts(text, lang, voice, key):
    body = {"contents": [{"parts": [{"text": f"{STYLE[lang]}\n\n{text}"}]}],
            "generationConfig": {"responseModalities": ["AUDIO"],
                                 "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICES[voice]}}}}}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json", "x-goog-api-key": key})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                part = json.load(r)["candidates"][0]["content"]["parts"][0]["inlineData"]
                return base64.b64decode(part["data"]), part.get("mimeType", "")
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:300]
            if e.code in (429, 500, 503) and attempt < 5:
                wait = 2 ** attempt * 5; print(f"  busy ({e.code}), waiting {wait}s"); time.sleep(wait); continue
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", choices=["fa", "ps"], action="append")
    ap.add_argument("--voice", choices=["f", "m"], action="append")
    ap.add_argument("--only", help="only ids starting with this (e.g. a topic id)")
    ap.add_argument("--sample", action="store_true")
    a = ap.parse_args()
    key = os.environ.get("GEMINI_API_KEY") or sys.exit("Set GEMINI_API_KEY first.")
    made = skipped = human = 0
    for lang in a.lang or ["fa", "ps"]:
        rows = list(csv.DictReader(open(J("content", "scripts", f"narration-{lang}.tsv"), encoding="utf-8"), delimiter="\t"))
        if a.sample: rows = [r for r in rows if r["id"] in SAMPLE]
        if a.only: rows = [r for r in rows if r["id"].startswith(a.only)]
        for voice in a.voice or ["f", "m"]:
            # straight into the app's audio slot; the manifest beside the clips remembers which ones came from Gemini
            d = J("audio", f"{lang}-{voice}"); os.makedirs(d, exist_ok=True)
            man_p = os.path.join(d, "tts-manifest.json")
            man = json.load(open(man_p, encoding="utf-8")) if os.path.exists(man_p) else {}
            for i, r in enumerate(rows, 1):
                text = r["text"].strip()
                if not text: continue
                h = hashlib.sha1(f"{MODEL}|{VOICES[voice]}|{STYLE[lang]}|{text}|{' '.join(MP3)}".encode()).hexdigest()[:12]
                out = os.path.join(d, r["id"] + ".mp3")
                others = [f for f in os.listdir(d) if os.path.splitext(f)[0] == r["id"] and f != r["id"] + ".mp3"]
                if (os.path.exists(out) and r["id"] not in man) or others: human += 1; continue  # a person's recording: keep it
                if man.get(r["id"]) == h and os.path.exists(out): skipped += 1; continue
                print(f"{lang}-{voice} {i}/{len(rows)} {r['id']}")
                data, mime = tts(text, lang, voice, key); to_mp3(data, mime, out)
                man[r["id"]] = h; made += 1
                json.dump(man, open(man_p, "w", encoding="utf-8"), indent=0, sort_keys=True)
    print(f"made {made}, skipped {skipped} unchanged, kept {human} human recordings. Now run: python3 tools/build.py")


if __name__ == "__main__":
    main()

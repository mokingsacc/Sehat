#!/usr/bin/env python3
"""Import a recordings zip exported from the app's recording mode into audio/<lang>-<voice>/<id>.mp3.

Usage: python3 tools/import_recordings.py recordings-2026-10-20.zip [--voice f|m] [--overwrite]
  --voice f   the reader is a woman      --voice m   the reader is a man
Zips from the current app keep each clip in its slot folder (fa-f/, ps-m/ ...), so --voice is only needed
for zips from before voices existed (folders fa/ and ps/). If it is given, it must match the zip.

Each clip is trimmed of silence at both ends, evened out in loudness and saved as speech MP3 that plays on every
phone: mono, 16 kHz, 24 kbps (same settings as tools/tts_gemini.py). A clip imported here replaces the
Gemini placeholder for that voice, and tools/tts_gemini.py will not overwrite it later."""
import argparse, json, os, subprocess, sys, tempfile, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MP3 = ["-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "24k", "-map_metadata", "-1", "-id3v2_version", "0", "-write_id3v1", "0"]
FILTER = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3,areverse,loudnorm=I=-18:TP=-2")

ap = argparse.ArgumentParser(description="Import narration recordings from the app into audio/<lang>-<voice>/.")
ap.add_argument("zip")
ap.add_argument("--voice", choices=["f", "m"], help="f = a woman's voice, m = a man's voice (needed for old zips)")
ap.add_argument("--overwrite", action="store_true", help="replace clips that a person already recorded")
a = ap.parse_args()

book = json.load(open(os.path.join(ROOT, "content/book.json"), encoding="utf-8"))
with zipfile.ZipFile(a.zip) as z:
    clips = [n for n in z.namelist() if not n.endswith("/") and not n.endswith("manifest.json")]
    slots = {n.split("/")[0] for n in clips if "/" in n}
    old = sorted(s for s in slots if s in ("fa", "ps", "en"))
    new_voices = {s[3] for s in slots if len(s) == 4 and s[:2] in ("fa", "ps", "en") and s[2] == "-" and s[3] in "fm"}
    if old and not a.voice:
        sys.exit("Whose voice is this? These recordings do not say if the reader is a woman or a man.\n"
                 f"Run it again with --voice f (a woman) or --voice m (a man), for example:\n"
                 f"  python3 tools/import_recordings.py {a.zip} --voice f")
    if a.voice and new_voices - {a.voice}:
        sys.exit(f"This zip was recorded as voice {', '.join(sorted(new_voices))} in the app, but you said --voice {a.voice}. "
                 "Leave out --voice to use the voice chosen in the app.")

    done = skipped = unknown = 0
    with tempfile.TemporaryDirectory() as tmp:
        for name in clips:
            base = os.path.basename(name); folder = name.split("/")[0]; cid = os.path.splitext(base)[0]
            slot = f"{folder}-{a.voice}" if folder in ("fa", "ps", "en") else folder
            if slot[:2] not in ("fa", "ps", "en") or slot[2:] not in ("-f", "-m") or cid not in book["narration"]:
                unknown += 1; print("unknown clip", name); continue
            d = os.path.join(ROOT, "audio", slot); out = os.path.join(d, cid + ".mp3")
            man_p = os.path.join(d, "tts-manifest.json")
            man = json.load(open(man_p, encoding="utf-8")) if os.path.exists(man_p) else {}
            human = os.path.exists(out) and cid not in man  # an earlier person's recording (not a Gemini placeholder)
            if human and not a.overwrite: skipped += 1; continue
            src = os.path.join(tmp, "in" + os.path.splitext(base)[1]); open(src, "wb").write(z.read(name))
            os.makedirs(d, exist_ok=True)
            r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-af", FILTER, *MP3, out + ".part.mp3"])
            if r.returncode: print("ffmpeg failed for", name); continue
            os.replace(out + ".part.mp3", out); done += 1
            if cid in man:  # no longer a placeholder: tts_gemini.py must leave it alone
                del man[cid]; json.dump(man, open(man_p, "w", encoding="utf-8"), indent=0, sort_keys=True)
print(f"imported {done}, skipped {skipped} already recorded (use --overwrite to replace), {unknown} unknown. Now run: python3 tools/build.py")

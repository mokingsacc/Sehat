"""Make the school day's three bells (P19): python tools/make_bells.py

Qalam's own sounds, given to the public domain (CC0, sources.json `qalam-bells`): each bell is a few struck tones
(a fundamental with three bell-like partials, each dying away), made by ffmpeg's `aevalsrc` and saved as mono Opus
at 32 kb/s in app/audio/bells/. No recording and no voice: tones only. Short and calm, at most -5 dB at the peak.
start.opus rings at the opening, each period and sheet time; break.opus at the break; end.opus at the close.
The manifest beside them keeps each file's SHA-256 (app/tests/day.test.js checks it); run this again only to change
the sounds, then update the manifest's hashes.
"""
import hashlib
import json
import subprocess
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app" / "audio" / "bells"
PARTIALS = [(1.0, 1.0, 2.2), (2.0, 0.35, 3.5), (2.76, 0.18, 5.0), (5.4, 0.06, 8.0)]   # ratio, loudness, decay
BELLS = {"start": ([(523.25, 0), (783.99, 0.45)], 2.4),                   # C5 then G5
         "break": ([(440.0, 0)], 2.0),                                     # one soft A4
         "end": ([(783.99, 0), (659.25, 0.5), (523.25, 1.0)], 3.0)}        # G5, E5, C5


def strike(f, t0, amp=0.32):
    t = f"(t-{t0})"
    tones = "+".join(f"{a}*sin(2*PI*{f * r:.2f}*{t})*exp(-{d}*{t})" for r, a, d in PARTIALS)
    return f"if(gte(t,{t0}),{amp}*min(1,{t}/0.006)*({tones}),0)"      # a 6 ms attack: no click


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (strikes, dur) in BELLS.items():
        expr = f"({'+'.join(strike(f, t0) for f, t0 in strikes)})*min(1,({dur}-t)/0.3)"
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                        f"aevalsrc='{expr}':s=48000:d={dur}", "-ac", "1", "-c:a", "libopus", "-b:a", "32k",
                        "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", str(OUT / f"{name}.opus")],
                       check=True)
        print(name, "sha256:" + hashlib.sha256((OUT / f"{name}.opus").read_bytes()).hexdigest())


if __name__ == "__main__":
    main()

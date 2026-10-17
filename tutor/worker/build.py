"""Make build/ for the Worker from the hub's own files: nothing is forked, everything is copied fresh each time.

    build/src/entry.py                        the Worker's entry point (entry.py)
    build/src/vars.json                       wrangler.toml's [vars], so entry.py can build the app at import
    build/src/hub/tutor_hub/                  the hub's code, as it is
    build/src/{migrations,modules,cohorts}/   the shared SQL, the module manifests, the seed cohorts
    build/src/content/{packs,graph}/          the packs as on the hub, and the skills graphs (P25a) (the hub reads lessons and checks pictures as files;
                                              recorded clips stay out: the hub knows them by their manifest.json)
    build/src/content/contests/               the contests (P31), where any is written
    build/src/content/sources.json            the licence classes (licences.py), and permissions/ for ASK sources
    build/src/content/{aliases.json,consent/} the alias pictures and the consent texts (learners.py)
    build/src/content/voice.json              the one voice per language and its native listener's gate (C5.6)
    build/src/content/quran/light.json        the Quran set as checked here (P29): its hash and state, the surah list
                                              and credits, the hashes of the verses lessons name; never the text
    build/public/                             the phone app (app/, without its tests, with its voice clips: app/audio,
                                              C5.6; a release build only a language whose native listener passed),
                                              and the lesson pictures and clips
                                              at /packs/<pack>/pictures/<file> and /packs/<pack>/audio/<lang>/<file>,
                                              the addresses the hub gives them; and the Quran set as the hub serves it,
                                              /quran/index.json, /quran/surah/<n>.json and the recitation files fetched
                                              here (/quran/audio/<edition>/<s>_<a>.mp3), only where the build is not for
                                              release or a Hanafi scholar has signed the set (C4.7)
    build/public/audio/<lang>/voice.qvoice    each language's voice pack: every clip of it in one file (C5.6)
    build/public/_headers                     security headers for the static files (C5 M2; HEADERS below): Workers
                                              static assets read it and do not serve it

build/src mirrors tutor/, so the hub's defaults (config.TUTOR) find every folder without a setting. The pictures go
twice: in the bundle, where the hub checks they exist, and as static assets, which is how phones get them online.
Run: python3 build.py   (then pywrangler dev or deploy from tutor/worker)
"""
import json
import shutil
import sys
import tomllib
from pathlib import Path

WORKER = Path(__file__).resolve().parent
TUTOR = WORKER.parent
BUILD = WORKER / "build"
SKIP = shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache", ".DS_Store")
AUDIO = ("*.opus", "*.ogg", "*.mp3")
STAFF_CSP = ("default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; "
             "base-uri 'none'; form-action 'self'")
# C5 M2: no other site may frame a page (the review page frames the app itself, so 'self' everywhere but the staff
# pages); the staff pages also run only this site's scripts. Rules that match one path add up: the two CSP lines
# become two policies, both enforced; every other header is in one rule only. The Worker's own answers (/api/*,
# /v/*) are not static files and get none of these.
HEADERS = f"""/*
  X-Content-Type-Options: nosniff
  Content-Security-Policy: frame-ancestors 'self'
"""
for _staff in ("admin", "teacher", "review"):
    HEADERS += f"""/{_staff}/*
  Content-Security-Policy: {STAFF_CSP}
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
"""


def build(out: Path = BUILD, config: Path | None = None) -> dict:
    """`config` is the wrangler file whose [vars] go in vars.json: wrangler.toml unless a test names another (the
    production workflow copies wrangler.production.toml over wrangler.toml first, so wrangler deploys the same)."""
    if out.exists():
        shutil.rmtree(out)
    src, public = out / "src", out / "public"
    src.mkdir(parents=True)
    shutil.copy2(WORKER / "entry.py", src / "entry.py")
    settings = tomllib.loads((config or WORKER / "wrangler.toml").read_text(encoding="utf-8")).get("vars", {})
    (src / "vars.json").write_text(json.dumps(settings, indent=1), encoding="utf-8")
    shutil.copytree(TUTOR / "hub" / "tutor_hub", src / "hub" / "tutor_hub", ignore=SKIP)
    for folder in ("migrations", "modules", "cohorts", "content/packs", "content/graph", "content/permissions", "content/consent",
                   "content/contests"):
        if folder == "content/contests" and not (TUTOR / folder).is_dir():
            continue                                        # no contest written yet (P31)
        shutil.copytree(TUTOR / folder, src / folder,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache", ".DS_Store", *AUDIO))
    shutil.copy2(TUTOR / "content" / "sources.json", src / "content" / "sources.json")
    shutil.copy2(TUTOR / "content" / "aliases.json", src / "content" / "aliases.json")
    shutil.copy2(TUTOR / "content" / "voice.json", src / "content" / "voice.json")
    shutil.copytree(TUTOR / "app", public, ignore=shutil.ignore_patterns("tests", "__pycache__", ".DS_Store"))
    for pictures in sorted((TUTOR / "content" / "packs").glob("*/pictures")):
        shutil.copytree(pictures, public / "packs" / pictures.parent.name / "pictures", ignore=SKIP)
    for audio in sorted((TUTOR / "content" / "packs").glob("*/audio")):
        shutil.copytree(audio, public / "packs" / audio.parent.name / "audio", ignore=SKIP)
    release = str(settings.get("TUTOR_RELEASE", "")) == "1"
    if release:
        voice_gate(public)
    voice_packs(public)
    quran_set(src, public, release=release)
    (public / "_headers").write_text(HEADERS, encoding="utf-8")
    return {name: sum(f.stat().st_size for f in (out / name).rglob("*") if f.is_file()) for name in ("src", "public")}


def voice_gate(public: Path) -> None:
    """C5.6, the chair's gate: a release build serves a language's Gemini clips only once its native listener has
    passed the sample (content/voice.json). Until then that language's clips are left out, and the app reads with
    the phone's voice or shows the words, as before."""
    sys.path.insert(0, str(TUTOR / "hub"))
    from tutor_hub import voicing
    ok = voicing.passed(TUTOR / "content")
    for d in sorted((public / "audio").glob("*/record.json")):
        lang = d.parent.name
        if lang in ok:
            continue
        for f in d.parent.glob("*.opus"):
            f.unlink()
        m = json.loads((d.parent / "manifest.json").read_text(encoding="utf-8"))
        (d.parent / "manifest.json").write_text(json.dumps({**m, "clips": {}}), encoding="utf-8")
        d.unlink()
        print(f"voice: {lang} waits for its native listener (content/voice.json): its clips are left out")
    for m in sorted((public / "packs").glob("*/audio/*/manifest.json")):
        if m.parent.name in ok:
            continue
        clips = json.loads(m.read_text(encoding="utf-8")).get("clips", {})
        for c in clips.values():
            if voicing.generated(c):
                (m.parent / c["file"]).unlink(missing_ok=True)


def voice_packs(public: Path) -> None:
    """One file per language with every clip of it (C5.6, the owner's note of 17 Oct): what the Android app, which
    carries no audio, downloads for her language and can share; the hub makes the same file on request."""
    sys.path.insert(0, str(TUTOR / "hub"))
    from tutor_hub import voicing
    for lang in voicing.LANGS:
        d = public / "audio" / lang
        packs = []
        for m in sorted((public / "packs").glob(f"*/audio/{lang}/manifest.json")):
            packs.append((m.parent, json.loads(m.read_text(encoding="utf-8")).get("clips", {})))
        blob = voicing.voice_pack(lang, public / "audio", packs)
        if blob:
            d.mkdir(parents=True, exist_ok=True)
            (d / "voice.qvoice").write_bytes(blob)
            print(f"voice pack {lang}: {len(blob) / 1e6:.2f} MB")


def quran_set(src: Path, public: Path, *, release: bool) -> None:
    """The Quran set, checked here in full (the Worker cannot hold its text in the bundle): light.json for the hub,
    the reader's files as static assets. A set that fails its checks is left out, so the reader stays off."""
    sys.path.insert(0, str(TUTOR / "hub"))
    from tutor_hub import quran
    from tutor_hub.packs import Library
    lib = Library(TUTOR / "content" / "packs", release=release)
    q = lib.quran
    if q is None or not q.ok:
        print("the Quran set is missing or fails its checks: left out" + "".join(f"\n  {p}" for p in q.problems))
        return
    (src / "content" / "quran").mkdir(parents=True, exist_ok=True)
    light = q.light_doc(quran.lesson_refs(lib.lessons.values()))
    (src / "content" / "quran" / quran.LIGHT).write_text(json.dumps(light, ensure_ascii=False), encoding="utf-8")
    if release and not q.signed:
        print("the Quran set is not signed by a Hanafi scholar: its text stays out of this release build")
        return
    out = public / "quran"
    (out / "surah").mkdir(parents=True)
    (out / "index.json").write_text(json.dumps(q.summary(), ensure_ascii=False), encoding="utf-8")
    for s in q.surahs:
        (out / "surah" / f"{s['n']}.json").write_text(json.dumps(q.surah(s["n"]), ensure_ascii=False,
                                                                 separators=(",", ":")), encoding="utf-8")
    for ed in q.audio:
        for f in sorted((q.dir / "audio" / ed).glob("*.mp3")):
            if q.audio_path(ed, f.name):
                (out / "audio" / ed).mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, out / "audio" / ed / f.name)


if __name__ == "__main__":
    sizes = build(Path(sys.argv[1]) if len(sys.argv) > 1 else BUILD)
    print(f"build/src {sizes['src'] / 1024:.0f} KiB (Python and data), build/public {sizes['public'] / 1024:.0f} KiB "
          "(static assets)")

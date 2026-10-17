"""Make build/ for the Worker from the hub's own files: nothing is forked, everything is copied fresh each time.

    build/src/entry.py                        the Worker's entry point (entry.py)
    build/src/vars.json                       wrangler.toml's [vars], so entry.py can build the app at import
    build/src/hub/tutor_hub/                  the hub's code, as it is
    build/src/{migrations,modules,cohorts}/   the shared SQL, the module manifests, the seed cohorts
    build/src/content/{packs,graph}/          the packs as on the hub, and the skills graphs (P25a) (the hub reads lessons and checks pictures as files;
                                              recorded clips stay out: the hub knows them by their manifest.json)
    build/src/content/sources.json            the licence classes (licences.py), and permissions/ for ASK sources
    build/src/content/{aliases.json,consent/} the alias pictures and the consent texts (learners.py)
    build/src/content/quran/light.json        the Quran set as checked here (P29): its hash and state, the surah list
                                              and credits, the hashes of the verses lessons name; never the text
    build/public/                             the phone app (app/, without its tests), and the lesson pictures and clips
                                              at /packs/<pack>/pictures/<file> and /packs/<pack>/audio/<lang>/<file>,
                                              the addresses the hub gives them; and the Quran set as the hub serves it,
                                              /quran/index.json, /quran/surah/<n>.json and the recitation files fetched
                                              here (/quran/audio/<edition>/<s>_<a>.mp3), only where the build is not for
                                              release or a Hanafi scholar has signed the set (C4.7)

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
    for folder in ("migrations", "modules", "cohorts", "content/packs", "content/graph", "content/permissions", "content/consent"):
        shutil.copytree(TUTOR / folder, src / folder,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache", ".DS_Store", *AUDIO))
    shutil.copy2(TUTOR / "content" / "sources.json", src / "content" / "sources.json")
    shutil.copy2(TUTOR / "content" / "aliases.json", src / "content" / "aliases.json")
    shutil.copytree(TUTOR / "app", public, ignore=shutil.ignore_patterns("tests", "__pycache__", ".DS_Store"))
    for pictures in sorted((TUTOR / "content" / "packs").glob("*/pictures")):
        shutil.copytree(pictures, public / "packs" / pictures.parent.name / "pictures", ignore=SKIP)
    for audio in sorted((TUTOR / "content" / "packs").glob("*/audio")):
        shutil.copytree(audio, public / "packs" / audio.parent.name / "audio", ignore=SKIP)
    quran_set(src, public, release=str(settings.get("TUTOR_RELEASE", "")) == "1")
    return {name: sum(f.stat().st_size for f in (out / name).rglob("*") if f.is_file()) for name in ("src", "public")}


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

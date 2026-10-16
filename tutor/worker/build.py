"""Make build/ for the Worker from the hub's own files: nothing is forked, everything is copied fresh each time.

    build/src/entry.py                        the Worker's entry point (entry.py)
    build/src/vars.json                       wrangler.toml's [vars], so entry.py can build the app at import
    build/src/hub/tutor_hub/                  the hub's code, as it is
    build/src/{migrations,modules,cohorts}/   the shared SQL, the module manifests, the seed cohorts
    build/src/content/packs/                  the packs as on the hub (the hub reads lessons and checks pictures as files;
                                              recorded clips stay out: the hub knows them by their manifest.json)
    build/src/content/sources.json            the licence classes (licences.py), and permissions/ for ASK sources
    build/public/                             the phone app (app/, without its tests), and the lesson pictures and clips
                                              at /packs/<pack>/pictures/<file> and /packs/<pack>/audio/<lang>/<file>,
                                              the addresses the hub gives them

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


def build(out: Path = BUILD) -> dict:
    if out.exists():
        shutil.rmtree(out)
    src, public = out / "src", out / "public"
    src.mkdir(parents=True)
    shutil.copy2(WORKER / "entry.py", src / "entry.py")
    settings = tomllib.loads((WORKER / "wrangler.toml").read_text(encoding="utf-8")).get("vars", {})
    (src / "vars.json").write_text(json.dumps(settings, indent=1), encoding="utf-8")
    shutil.copytree(TUTOR / "hub" / "tutor_hub", src / "hub" / "tutor_hub", ignore=SKIP)
    for folder in ("migrations", "modules", "cohorts", "content/packs", "content/permissions"):
        shutil.copytree(TUTOR / folder, src / folder,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache", ".DS_Store", *AUDIO))
    shutil.copy2(TUTOR / "content" / "sources.json", src / "content" / "sources.json")
    shutil.copytree(TUTOR / "app", public, ignore=shutil.ignore_patterns("tests", "__pycache__", ".DS_Store"))
    for pictures in sorted((TUTOR / "content" / "packs").glob("*/pictures")):
        shutil.copytree(pictures, public / "packs" / pictures.parent.name / "pictures", ignore=SKIP)
    for audio in sorted((TUTOR / "content" / "packs").glob("*/audio")):
        shutil.copytree(audio, public / "packs" / audio.parent.name / "audio", ignore=SKIP)
    return {name: sum(f.stat().st_size for f in (out / name).rglob("*") if f.is_file()) for name in ("src", "public")}


if __name__ == "__main__":
    sizes = build(Path(sys.argv[1]) if len(sys.argv) > 1 else BUILD)
    print(f"build/src {sizes['src'] / 1024:.0f} KiB (Python and data), build/public {sizes['public'] / 1024:.0f} KiB "
          "(static assets)")

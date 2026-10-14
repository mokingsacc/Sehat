"""Check lesson packs before they go on a hub: python tools/validate_pack.py [packs folder] [--release]

Lists every problem in plain words and exits with 1 if there are any. The hub runs the same checks when it
starts and leaves out any lesson that fails, so a broken lesson is never half-shown to a child.
--release also refuses any lesson that its reviewers have not signed ("review": {"status": "checked", ...}).
"""
import argparse
import json
import sys
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TUTOR / "hub"))

from tutor_hub.packs import Library  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check lesson packs.")
    ap.add_argument("packs", nargs="?", type=Path, default=TUTOR / "content" / "packs")
    ap.add_argument("--release", action="store_true", help="also refuse lessons that are not signed by reviewers")
    a = ap.parse_args(argv)
    lib = Library(a.packs)
    problems = list(lib.problems)
    for pid, pack in lib.packs.items():
        listed = set(json.loads((pack["_dir"] / "pack.json").read_text(encoding="utf-8")).get("lessons", []))
        for f in sorted((pack["_dir"] / "lessons").glob("*.json")):
            if f.stem not in listed:
                problems.append(f"{pid}/{f.stem}: lesson file is not listed in pack.json")
    unsigned = sorted(lid for lid, l in lib.lessons.items() if (l.get("review") or {}).get("status") != "checked")
    if a.release:
        problems += [f"{lid}: not signed by its reviewers yet" for lid in unsigned]
    for p in problems:
        print("problem:", p)
    print(f"{len(lib.lessons)} lesson(s) in {len(lib.packs)} pack(s); {len(problems)} problem(s); "
          f"{len(unsigned)} still waiting for their native-speaker and teacher check")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

"""Check lesson packs before they go on a hub: python tools/validate_pack.py [packs folder] [--release] [--hashes]

Lists every problem in plain words and exits with 1 if there are any. The hub runs the same checks when it
starts and leaves out any lesson that fails, so a broken lesson is never half-shown to a child.

Licences come from content/sources.json (the only record of them): a lesson citing an AVOID source, a LINK or
unpermitted ASK source, a no_ai source, or non-commercial material outside a pack marked "licence": "NC" fails, and
so does a link card holding anything but our own short description.

--release also refuses any lesson or link card its reviewers have not signed (each role in review.needs signing
the current content hash), and lessons for the youngest learners without recorded clips (no synthetic voice).
--hashes prints each lesson's and link card's content hash, which is what a reviewer signs.
--clips prints the recording job (P27a): each clip release would want and the packs lack, with the words to say, as
tab-separated lines for the recorders (pack, lesson, step, language, words). Recordings only: no synthetic voice.

The skills graphs (content/graph/<subject>.json, P25a) are checked too, against the lessons that loaded (graph.py):
--release refuses one its reviewers have not signed, and --hashes prints each graph's hash as graph:<subject>.
"""
import argparse
import json
import sys
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TUTOR / "hub"))

from tutor_hub.licences import sha256_bytes  # noqa: E402
from tutor_hub.packs import AUDIO_EXT, Library, clips_needed  # noqa: E402


def audio_problems(pid: str, pdir: Path, clips: dict) -> list[str]:
    """Every clip in a manifest exists and matches its recorded hash; no clip sits in audio/ without a manifest
    line saying who recorded it."""
    p = []
    for lang_dir in sorted((pdir / "audio").glob("*")) if (pdir / "audio").is_dir() else []:
        listed = {c.get("file"): c for c in clips.get(lang_dir.name, {}).values() if isinstance(c, dict)}
        for f in sorted(lang_dir.iterdir()):
            if f.suffix in AUDIO_EXT and f.name not in listed:
                p.append(f"{pid}/audio/{lang_dir.name}/{f.name}: not in manifest.json (who recorded it?)")
        for name, c in listed.items():
            f = lang_dir / str(name)
            if not f.is_file():
                p.append(f"{pid}/audio/{lang_dir.name}/{name}: listed in manifest.json but missing")
            elif sha256_bytes(f.read_bytes()) != c.get("sha256"):
                p.append(f"{pid}/audio/{lang_dir.name}/{name}: does not match its sha256 in manifest.json")
    return p


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check lesson packs.")
    ap.add_argument("packs", nargs="?", type=Path, default=TUTOR / "content" / "packs")
    ap.add_argument("--release", action="store_true",
                    help="also refuse lessons and link cards that are not signed, and young learners' lessons without clips")
    ap.add_argument("--sources", type=Path, default=None, help="the sources file (default content/sources.json)")
    ap.add_argument("--hashes", action="store_true", help="print the content hash of every lesson and link card")
    ap.add_argument("--clips", action="store_true", help="print the clips still to record, with their words")
    a = ap.parse_args(argv)
    lib = Library(a.packs, release=a.release, sources=a.sources)
    problems = list(lib.sources.problems) + list(lib.problems)
    for pid, pack in lib.packs.items():
        listed = set(json.loads((pack["_dir"] / "pack.json").read_text(encoding="utf-8")).get("lessons", []))
        for f in sorted((pack["_dir"] / "lessons").glob("*.json")):
            if f.stem not in listed:
                problems.append(f"{pid}/{f.stem}: lesson file is not listed in pack.json")
        problems += audio_problems(pid, pack["_dir"], pack.get("_clips", {}))
    problems += lib.hidden                       # release mode: what would not be served
    unsigned = sorted(lid for lid, st in lib.states.items() if st != "signed")
    if a.hashes:
        for lid in sorted(lib.hashes):
            print(f"{lid}\t{lib.hashes[lid]}\t{lib.states[lid]}")
        for c in lib.links:
            print(f"links:{c['id']}\t{c['_hash']}\t{c['_state']}")
        for sub, g in sorted(lib.graphs.items()):
            print(f"graph:{sub}\t{g['_hash']}\t{g['_state']}")
    if a.clips:
        for c in clips_needed(lib):
            print("\t".join([c["pack"], c["lesson"], str(c["step"]), c["lang"], c["words"].replace("\t", " ")]
                            + (["(placeholder now)"] if c["placeholder"] else [])))
    for p in problems:
        print("problem:", p)
    if lib.graphs:
        print(f"{len(lib.graphs)} skills graph(s): " + ", ".join(
            f"{sub} ({len(g['nodes'])} nodes, {len(g.get('pathways') or [])} pathways, {g['_state']})"
            for sub, g in sorted(lib.graphs.items())))
    print(f"{len(lib.lessons)} lesson(s) and {len(lib.links)} link card(s) in {len(lib.packs)} pack(s); "
          f"{len(problems)} problem(s); {len(unsigned)} still waiting for their native-speaker and teacher check")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

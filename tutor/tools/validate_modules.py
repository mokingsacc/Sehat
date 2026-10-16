"""Check module manifests and seed cohorts before they reach a hub: python tools/validate_modules.py

Lists every problem in plain words and exits with 1 if there are any. The hub runs the same checks when it starts and
leaves out any module that fails (and any module that depends on it), so a broken manifest never half-loads.
"""
import argparse
import sys
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TUTOR / "hub"))

from tutor_hub import flags, modules  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check module manifests and seed cohorts.")
    ap.add_argument("modules", nargs="?", type=Path, default=TUTOR / "modules")
    ap.add_argument("--cohorts", type=Path, default=TUTOR / "cohorts")
    a = ap.parse_args(argv)
    found, problems = modules.load(a.modules)
    seeds, seed_problems = flags.load_seeds(a.cohorts)
    problems = list(problems) + [f"cohort {p}" for p in seed_problems]
    ids = [c["id"] for c in seeds.values()]
    if len(set(ids)) != len(ids):
        problems.append("two seed cohorts share an id")
    for name, c in seeds.items():
        problems += [f"cohort {name}: switches unknown module {m}" for m in c["modules"] if m not in found]
    for p in problems:
        print("problem:", p)
    print(f"{len(found)} module(s), {len(seeds)} seed cohort(s), {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

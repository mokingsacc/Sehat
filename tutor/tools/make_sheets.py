"""Print every worksheet (and answer sheet) of the packs to PDF files, for reviewers to check on paper.

    python tools/make_sheets.py --out review-sheets --lang prs --lang ps

Needs WeasyPrint (hub/requirements.txt). Sheets with made-up sums use seed 1234, so everyone sees the same numbers.
"""
import argparse
import sys
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TUTOR / "hub"))

from tutor_hub import sheets  # noqa: E402
from tutor_hub.packs import Library, picture_file  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--packs", type=Path, default=TUTOR / "content" / "packs")
    ap.add_argument("--out", type=Path, default=Path("review-sheets"))
    ap.add_argument("--lang", action="append", choices=["prs", "ps", "en"])
    ap.add_argument("--seed", type=int, default=1234)
    a = ap.parse_args(argv)
    langs = a.lang or ["prs", "ps"]
    app = TUTOR / "app"
    lib = Library(a.packs)
    for p in lib.problems:
        print("problem (lesson left out):", p)
    a.out.mkdir(parents=True, exist_ok=True)
    n = 0
    for lid, lesson in sorted(lib.lessons.items()):
        if not lesson.get("sheet"):
            continue
        pdir = lib.pack_dir(lid)

        def pic(name, pdir=pdir):
            f = picture_file(pdir, name)
            return f.resolve().as_uri() if f else ""
        seed = a.seed if sheets.needs_seed(lesson) else 0
        for lang in langs:
            for kind in ("worksheet", "answers"):
                html = sheets.page(lesson, lang=lang, seed=seed, kind=kind, fonts=(app / "fonts").resolve().as_uri(),
                                   picture_url=pic, hub_name="Qalam")
                pdf, pages = sheets.render_pdf(html, base_url=str(app))
                f = a.out / f"{lesson['sheet']['code']}-{lang}-{kind}.pdf"
                f.write_bytes(pdf)
                n += 1
                print(f"{f}  {pages} page(s)" + ("  <- more than one page" if pages > 1 else ""))
    print(f"{n} sheet(s) in {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

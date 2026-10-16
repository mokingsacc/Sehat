"""Print every worksheet (and answer sheet) of the packs to PDF files, for reviewers to check on paper.

    python tools/make_sheets.py --out review-sheets --lang prs --lang ps

Needs WeasyPrint (hub/requirements.txt). Sheets with made-up sums use seed 1234, so everyone sees the same numbers.

For facilitators, one lesson's sheet as a stack of pages in one file, one A4 page each (C2.1):

    python tools/make_sheets.py --batch 30 --lesson maths-7-fractions-add --lang prs
    python tools/make_sheets.py --batch 30 --lesson maths-7-fractions-add --different --html

A batch shares one seed by default, so a class can go over it together; `--different` gives each page its own seed.
Each sheet's code is printed at its foot, so Check my sheet finds its answers. The answer page(s) go to a separate
file, for the facilitator only. `--html` writes HTML for a browser to print or save as PDF, where WeasyPrint is
missing.
"""
import argparse
import random
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
    ap.add_argument("--batch", type=int, metavar="N", help="N pages of one lesson's sheet in one file (needs --lesson)")
    ap.add_argument("--lesson", help="the lesson id, for --batch")
    ap.add_argument("--different", action="store_true", help="with --batch: each page gets its own seed")
    ap.add_argument("--html", action="store_true", help="with --batch: write HTML for a browser to print, not a PDF")
    a = ap.parse_args(argv)
    seed_given = any(x == "--seed" or x.startswith("--seed=") for x in (argv if argv is not None else sys.argv[1:]))
    langs = a.lang or ["prs", "ps"]
    app = TUTOR / "app"
    lib = Library(a.packs)
    for p in lib.problems:
        print("problem (lesson left out):", p)
    a.out.mkdir(parents=True, exist_ok=True)
    if a.batch is not None:
        return batch(a, lib, app, langs, a.seed if seed_given else None)
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
                                   picture_url=pic)
                pdf, pages = sheets.render_pdf(html, base_url=str(app))
                f = a.out / f"{lesson['sheet']['code']}-{lang}-{kind}.pdf"
                f.write_bytes(pdf)
                n += 1
                print(f"{f}  {pages} page(s)" + ("  <- more than one page" if pages > 1 else ""))
    print(f"{n} sheet(s) in {a.out}")
    return 0


def batch(a, lib, app, langs, seed):
    """One lesson's sheet, a.batch pages in one file per language, and its answer page(s) in another."""
    lesson = lib.lessons.get(a.lesson or "")
    if not lesson or not lesson.get("sheet"):
        print(f"no sheet for lesson {a.lesson!r}: give --lesson with a lesson that has one")
        return 2
    if not 1 <= a.batch <= 200:
        print("--batch takes 1 to 200 pages")
        return 2
    pdir = lib.pack_dir(a.lesson)
    fonts = (app / "fonts").resolve().as_uri()

    def pic(name):
        f = picture_file(pdir, name)
        return f.resolve().as_uri() if f else ""
    if sheets.needs_seed(lesson):
        rng = random.SystemRandom()
        if a.different:
            seeds = rng.sample(range(1000, 10000), a.batch)
        else:
            seeds = [seed if seed is not None else rng.randint(1000, 9999)] * a.batch
    else:
        if a.different:
            print("this sheet has no made-up sums: every page is the same")
        seeds = [0] * a.batch
    code = lesson["sheet"]["code"]
    for lang in langs:
        pages = [sheets.sheet_section(lesson, lang=lang, seed=s, picture_url=pic) for s in seeds]
        title = sheets.sheet_code(lesson, seeds[0]) if len(set(seeds)) == 1 else code
        doc = sheets.document(pages, lang=lang, title=title, fonts=fonts)
        answers = [sheets.answers_page(lesson, lang=lang, seed=s, fonts=fonts, picture_url=pic)
                   for s in sorted(set(seeds))]
        stem = a.out / f"{code}-{lang}-batch{a.batch}"
        if a.html:
            stem.with_suffix(".html").write_text(doc, encoding="utf-8")
            for s, page_ in zip(sorted(set(seeds)), answers):
                (a.out / f"{sheets.sheet_code(lesson, s)}-{lang}-answers.html").write_text(page_, encoding="utf-8")
            print(f"{stem}.html  {len(seeds)} page(s), answers for {len(answers)} code(s)")
            continue
        pdf, n = sheets.render_pdf(doc, base_url=str(app))
        stem.with_suffix(".pdf").write_bytes(pdf)
        for s, page_ in zip(sorted(set(seeds)), answers):
            apdf, _ = sheets.render_pdf(page_, base_url=str(app))
            (a.out / f"{sheets.sheet_code(lesson, s)}-{lang}-answers.pdf").write_bytes(apdf)
        print(f"{stem}.pdf  {n} page(s)" + ("" if n == len(seeds) else f"  <- expected {len(seeds)}")
              + f", answers for {len(answers)} code(s)")
        if n != len(seeds):
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

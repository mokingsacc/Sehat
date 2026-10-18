"""Import a Bloom book (Afghan Children Read, or another Bloom Library book) as a draft reading lesson.

    python tools/import_bloom.py BOOK.bloompub --pack content/packs/readers --id dari-1-reader-01 \
        --subject dari --year 1 --url https://bloomlibrary.org/book/... --checked 2027-01-20 [--add] [--pictures]

BOOK is a .bloompub or .bloomd file (a zip) or an unzipped book folder: meta.json and the book's .htm.
Bloom books carry their own licence (sources.json flags both Bloom sources `per_item_licence`), so the book's
meta.json decides: CC0, CC BY and CC BY-SA may go into any pack, CC BY-NC only into a pack marked "licence": "NC",
and anything else (all rights reserved, "custom", "ask") is refused: link to it with a link card instead. The
licence check is the hub's own (tutor_hub/licences.py), the same one CI runs, so an import that passes here
validates there.

What comes in: the title and each content page's text, as `read` steps, in Dari (prs), Pashto (ps) and English (en)
where the book has them. Front and back matter are left out. Pictures are left out unless --pictures is given,
because many storybook pictures show people or animals, which our picture rule does not allow: with --pictures,
each page's first picture is copied (SVG line art with black strokes rewritten to currentColor, so it follows the
theme), and recorded in pack.json `media` with the book's credit. Audio is never imported: lesson audio is recorded
for Qalam by native speakers.

The lesson is a draft: `review.needs` lists a Dari reader, a Pashto reader and the year's teacher, and nothing
reaches learners in release mode until they sign. `checked` is the date you confirmed the licence on the book's own
page (FREE-RESOURCES.md: re-check before bundling).
"""
import argparse
import html.parser
import json
import re
import sys
import zipfile
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TUTOR / "hub"))

from tutor_hub.licences import Sources  # noqa: E402
from tutor_hub.packs import SUBJECTS, validate_lesson  # noqa: E402

# Bloom's licence codes -> the licence's own short name
LICENCES = {"cc0": "CC0", "cc-by": "CC BY 4.0", "cc-by-sa": "CC BY-SA 4.0", "cc-by-nd": "CC BY-ND 4.0",
            "cc-by-nc": "CC BY-NC 4.0", "cc-by-nc-sa": "CC BY-NC-SA 4.0", "cc-by-nc-nd": "CC BY-NC-ND 4.0",
            "publicdomain": "Public domain"}
# Bloom's language codes -> the app's
LANGS = {"prs": "prs", "fa-af": "prs", "ps": "ps", "pus": "ps", "pbt": "ps", "pbu": "ps", "pst": "ps",
         "en": "en", "eng": "en"}
SKIP_PAGES = ("bloom-frontMatter", "bloom-backMatter", "cover", "titlePage", "credits", "bloom-noreader")
BLACK = re.compile(r"""((?:stroke|fill)\s*[=:]\s*["']?)(#000000|#000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))(?=["';\s/>])""",
                   re.IGNORECASE)


def ink_svg(svg: str) -> str:
    """Black strokes and fills become currentColor, so line art takes the theme's ink (DESIGN.md 4)."""
    return BLACK.sub(lambda m: m.group(1) + "currentColor", svg)


class _BookParser(html.parser.HTMLParser):
    """Each content page's text per language, and its first picture."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []                 # one entry per open div: its class list and lang
        self.pages = []                 # [{"text": {lang: [lines]}, "picture": src}]
        self._page = None
        self._line = []

    def _in(self, cls):
        return next((d for d in reversed(self.stack) if cls in d["class"]), None)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "div":
            cls = (a.get("class") or "").split()
            d = {"class": cls, "lang": a.get("lang"), "page": False}
            if "bloom-page" in cls:
                d["page"] = True
                skip = any(c in cls for c in SKIP_PAGES)
                self._page = None if skip else {"text": {}, "picture": None}
                if self._page is not None:
                    self.pages.append(self._page)
            self.stack.append(d)
        elif tag == "br":
            self._newline()
        elif tag == "img" and self._page is not None and not self._page["picture"] and a.get("src"):
            self._page["picture"] = a["src"]

    def handle_endtag(self, tag):
        if tag == "p":
            self._newline()
        elif tag == "div" and self.stack:
            self._newline()
            d = self.stack.pop()
            if d["page"]:
                self._page = None

    def _editable_lang(self):
        ed = self._in("bloom-editable")
        if not ed or not ed["lang"]:
            return None
        return LANGS.get(ed["lang"].lower())

    def handle_data(self, data):
        if self._page is not None and self._editable_lang():
            self._line.append(data)

    def _newline(self):
        lang = self._editable_lang() if self._page is not None else None
        text = " ".join("".join(self._line).split())
        self._line = []
        if lang and text:
            self._page["text"].setdefault(lang, []).append(text)


def read_book(path: Path) -> tuple[dict, str, dict]:
    """(meta.json, the book's HTML, {file name: bytes} of its pictures)."""
    files = {}
    if path.is_dir():
        for f in path.rglob("*"):
            if f.is_file():
                files[f.relative_to(path).as_posix()] = f.read_bytes()
    else:
        with zipfile.ZipFile(path) as z:
            for n in z.namelist():
                if not n.endswith("/"):
                    files[n] = z.read(n)
    meta_name = next((n for n in files if n.split("/")[-1] == "meta.json"), None)
    page_name = next((n for n in sorted(files) if n.lower().endswith((".htm", ".html"))), None)
    if not meta_name or not page_name:
        raise SystemExit("not a Bloom book: meta.json and an .htm file are needed")
    meta = json.loads(files[meta_name].decode("utf-8-sig"))
    pictures = {n.split("/")[-1]: b for n, b in files.items() if n.lower().endswith((".svg", ".png", ".jpg", ".jpeg"))}
    return meta, files[page_name].decode("utf-8-sig"), pictures


def titles(meta: dict) -> dict:
    t = meta.get("allTitles") or {}
    if isinstance(t, str):
        try:
            t = json.loads(t)
        except ValueError:
            t = {}
    out = {LANGS[k.lower()]: " ".join(str(v).split()) for k, v in t.items() if k.lower() in LANGS and str(v).strip()}
    if not out and meta.get("title"):
        out = {"en": str(meta["title"]).strip()}
    return out


def owner(meta: dict) -> str:
    c = str(meta.get("copyright") or meta.get("originalCopyright") or "")
    c = re.sub(r"(?i)copyright|©|\(c\)|\b\d{4}\b", " ", c)
    return " ".join(c.replace(",", " ").split())


def build_lesson(meta, page_html, a, langs) -> tuple[dict, list[str]]:
    p = _BookParser()
    p.feed(page_html)
    p.close()
    steps, pics = [], []
    for page in p.pages:
        text = {l: "\n".join(lines) for l, lines in page["text"].items() if l in langs}
        if not text:
            continue
        steps.append({"kind": "read", "text": text})
        pics.append(page["picture"])
    licence = LICENCES.get(str(meta.get("license", "")).strip().lower(), str(meta.get("license") or "unknown"))
    t = titles(meta)
    changes = a.changes or ("Pictures left out (Qalam's picture rule); text unchanged." if not a.pictures
                            else "Text unchanged; pictures recoloured for the screen.")
    lesson = {
        "id": a.id, "subject": a.subject, "year": a.year, "order": a.order,
        "title": {l: v for l, v in t.items() if l in langs} or t,
        "minutes": max(5, min(30, 2 * len(steps))),
        "steps": steps,
        "review": {"status": "draft",
                   "needs": ["Dari reader", "Pashto reader", "year 0 teacher" if a.year == 0 else f"year {a.year} teacher"]},
        "sources": [{"id": a.source, "item": str(meta.get("bookInstanceId") or meta.get("id") or a.url),
                     "title": t.get("en") or next(iter(t.values()), a.id), "url": a.url, "licence": licence,
                     "author": a.author or owner(meta) or "Bloom Library authors", "changes": changes,
                     "checked": a.checked}],
        "drafted_by": "tools/import_bloom.py",
    }
    return lesson, pics


def main(argv=None):
    ap = argparse.ArgumentParser(description="Import a Bloom book as a draft reading lesson.")
    ap.add_argument("book", type=Path)
    ap.add_argument("--pack", type=Path, required=True, help="the pack folder (content/packs/<pack>)")
    ap.add_argument("--id", required=True, help="the new lesson's id, like dari-1-reader-01")
    ap.add_argument("--subject", required=True, choices=SUBJECTS)
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--order", type=int, default=50)
    ap.add_argument("--url", required=True, help="the book's own page (https://bloomlibrary.org/...)")
    ap.add_argument("--checked", required=True, help="the date you confirmed its licence on that page, YYYY-MM-DD")
    ap.add_argument("--source", default="afghan-children-read-bloom",
                    choices=["afghan-children-read-bloom", "bloom-library"])
    ap.add_argument("--author", help="the author or owner for the credit line (default: from the book's copyright)")
    ap.add_argument("--changes", help="what Qalam changed, for the credit line")
    ap.add_argument("--langs", default="prs,ps,en", help="languages to keep (default prs,ps,en)")
    ap.add_argument("--pictures", action="store_true",
                    help="also copy each page's first picture (check every one against the picture rule)")
    ap.add_argument("--add", action="store_true", help="add the lesson to pack.json's list")
    ap.add_argument("--sources-file", type=Path, default=TUTOR / "content" / "sources.json")
    a = ap.parse_args(argv)
    langs = [x.strip() for x in a.langs.split(",") if x.strip()]

    pack_json = a.pack / "pack.json"
    pack = json.loads(pack_json.read_text(encoding="utf-8"))
    meta, page_html, pictures = read_book(a.book)
    lesson, pics = build_lesson(meta, page_html, a, langs)
    if not lesson["steps"]:
        print("refused: no page of this book has text in", ", ".join(langs))
        return 1

    sources = Sources(a.sources_file)
    pack_nc = pack.get("licence") == "NC"
    problems, terms = sources.check_use(lesson["sources"][0], f"{a.id} sources 1", pack_nc=pack_nc, lesson=lesson)
    if terms["sa"] and not pack.get("share_alike"):
        problems.append(f"{a.id}: the book is share-alike (SA); mark the pack \"share_alike\": true first")
    if problems:
        print("refused:")
        for x in problems:
            print("  ", x)
        return 1

    media = {}
    if a.pictures:
        (a.pack / "pictures").mkdir(exist_ok=True)
        for i, (step, src) in enumerate(zip(lesson["steps"], pics), 1):
            name = (src or "").split("/")[-1].split("?")[0]
            if not name or name not in pictures:
                continue
            ext = Path(name).suffix.lower().replace(".jpeg", ".jpg")
            out = f"{a.id}-{i}{ext}"
            data = pictures[name]
            if ext == ".svg":
                data = ink_svg(data.decode("utf-8")).encode("utf-8")
            (a.pack / "pictures" / out).write_bytes(data)
            step["picture"] = Path(out).stem
            media[f"pictures/{out}"] = [dict(lesson["sources"][0], changes="Recoloured for the screen.")]
        print(f"copied {len(media)} picture(s): check each against the picture rule (no faces, no living beings)")

    problems = validate_lesson(lesson, a.pack)
    if problems:
        print("refused: the lesson would not validate:")
        for x in problems:
            print("  ", x)
        return 1
    out = a.pack / "lessons" / f"{a.id}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if a.add or media:
        if a.add and a.id not in pack.get("lessons", []):
            pack.setdefault("lessons", []).append(a.id)
        if media:
            pack.setdefault("media", {}).update(media)
        pack_json.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(lesson['steps'])} step(s), licence {lesson['sources'][0]['licence']}): a draft, "
          "until a Dari reader, a Pashto reader and a teacher sign it")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Make the font subsets the app and the sheets use:

    python3 tools/make_fonts.py --source X.otf      the Chinese subset (P27a, C4.4)
    python3 tools/make_fonts.py --naskh DIR         the Naskh subsets (W3's shell trim, docs/WEBSITE.md)

Noto Sans SC (SIL OFL 1.1) is about 8 MB, so Qalam carries only the characters its packs hold: every `zh` and
`pinyin` field and every sheet `trace` text of a Chinese lesson, plus the Latin letters and pinyin tone marks (Vazirmatn
has no ǎ ǐ ǒ ǔ ǚ, so pinyin is drawn in this font too). The subset is app/fonts/noto-sc.woff2, used by the app for
`lang="zh-Hans"` and `lang="zh-Latn-pinyin"` and embedded in the printed sheets. Run it at release, whenever a pack's
Chinese changes: hub/tests/test_packs.py fails while a pack holds a character the subset lacks.

--source is the full NotoSansSC-Regular.otf from https://github.com/notofonts/noto-cjk (Sans/SubsetOTF/SC); it is
not kept in the repository. Needs fontTools and brotli (the hub's requirements have both).

Noto Naskh Arabic (SIL OFL 1.1, no reserved name) came whole, 72 KB a weight: the Arabic script of every language
that writes it, and the Latin of Europe. Qalam reads Dari, Pashto and Arabic in it, so app/fonts/naskh-500.woff2 and
naskh-700.woff2 keep the Arabic block (U+0600 to U+06FF: Dari's and Pashto's letters, the harakat, the digits), Latin
up to Latin Extended-A, the punctuation, the dotted circle and the few Arabic ligature signs a text may write
(U+FD3E, U+FD3F, U+FDF2, U+FDFA to U+FDFD); every shaping feature stays, so each letter keeps its joined forms. That
is 42 KB a weight, and 60 KB off the app's first open. DIR holds the whole naskh-500 and naskh-700 (.woff2 or .ttf,
https://github.com/notofonts/arabic); the files here are subsets already, and running it on them keeps the same characters.
hub/tests/test_packs.py fails while a text read in Naskh holds a character the subset lacks.
"""
import argparse
import json
import sys
from pathlib import Path

TUTOR = Path(__file__).resolve().parents[1]
OUT = TUTOR / "app" / "fonts" / "noto-sc.woff2"
# the pinyin vowels with their tone marks, and plain Latin: every pinyin syllable can be drawn
PINYIN = "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ"
LATIN = "".join(chr(c) for c in range(0x20, 0x7f))
NASKH = ((0x20, 0x7e), (0xa0, 0x17f), (0x2b9, 0x2ff), (0x300, 0x36f), (0x600, 0x6ff), (0x2000, 0x206f), (0x25cc, 0x25cc),
         (0xfd3e, 0xfd3f), (0xfdf2, 0xfdf2), (0xfdfa, 0xfdfd))
NASKH_OUT = TUTOR / "app" / "fonts"


def pack_chars(packs: Path = TUTOR / "content" / "packs") -> set[str]:
    """Every character a Chinese lesson writes: its zh and pinyin fields and its sheet's traced text."""
    out = set()
    for f in sorted(packs.glob("*/lessons/*.json")):
        lesson = json.loads(f.read_text(encoding="utf-8"))
        if lesson.get("subject") != "chinese":
            continue
        for st in lesson.get("steps") or []:
            out |= set(st.get("zh", "")) | set(st.get("pinyin", ""))
        for it in (lesson.get("sheet") or {}).get("items") or []:
            if it.get("kind") == "trace":
                out |= set(str(it.get("text", "")))
    return {c for c in out if not c.isspace()}


def needed() -> set[str]:
    return pack_chars() | set(PINYIN) | set(LATIN)


def naskh_kept(c: int) -> bool:
    return any(a <= c <= b for a, b in NASKH)


def arabic_texts(packs: Path = TUTOR / "content" / "packs") -> set[str]:
    """Every Arabic-script character a lesson writes (Naskh draws them: the reading, the letters, the options)."""
    out = set()
    for f in sorted(packs.glob("*/lessons/*.json")):
        out |= set(f.read_text(encoding="utf-8"))
    return {c for c in out if 0x600 <= ord(c) <= 0x8ff or 0xfb50 <= ord(c) <= 0xfeff}


def _options():
    from fontTools import subset
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]                 # keep the copyright and licence lines in the file
    opts.notdef_outline = True
    return opts


def naskh(src: Path, out: Path = NASKH_OUT) -> int:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    for weight in (500, 700):
        f = next((p for p in (src / f"naskh-{weight}.woff2", src / f"naskh-{weight}.ttf") if p.is_file()), None)
        if f is None:
            print(f"{src} has no naskh-{weight}.woff2 or .ttf")
            return 1
        font = TTFont(f)
        cmap = font.getBestCmap()
        s = subset.Subsetter(_options())
        s.populate(unicodes=sorted(c for c in cmap if naskh_kept(c)))
        s.subset(font)
        font.flavor = "woff2"
        dest = out / f"naskh-{weight}.woff2"
        font.save(dest)
        print(f"{dest.relative_to(TUTOR) if dest.is_relative_to(TUTOR) else dest}: {len(font.getBestCmap())} characters, "
              f"{dest.stat().st_size / 1024:.1f} KiB")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--source", type=Path, help="NotoSansSC-Regular.otf (the whole font)")
    g.add_argument("--naskh", type=Path, help="a folder with the whole naskh-500 and naskh-700")
    ap.add_argument("--out", type=Path, default=None)
    a = ap.parse_args(argv)
    if a.naskh:
        return naskh(a.naskh, a.out or NASKH_OUT)
    a.out = a.out or OUT
    from fontTools import subset
    from fontTools.ttLib import TTFont
    chars = needed()
    font = TTFont(a.source)
    missing = sorted(c for c in chars if ord(c) not in font.getBestCmap())
    if missing:
        print("the font lacks:", " ".join(missing))
        return 1
    s = subset.Subsetter(_options())
    s.populate(unicodes=sorted(ord(c) for c in chars))
    s.subset(font)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(a.out)
    print(f"{a.out.relative_to(TUTOR) if a.out.is_relative_to(TUTOR) else a.out}: {len(chars)} characters, "
          f"{a.out.stat().st_size / 1024:.1f} KiB")
    return 0


if __name__ == "__main__":
    sys.exit(main())

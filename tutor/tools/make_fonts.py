"""Make the Chinese font subset the app and the sheets use (P27a, C4.4): python3 tools/make_fonts.py --source X.otf

Noto Sans SC (SIL OFL 1.1) is about 8 MB, so Qalam carries only the characters its packs hold: every `zh` and
`pinyin` field and every sheet `trace` text of a Chinese lesson, plus the Latin letters and pinyin tone marks (Vazirmatn
has no ǎ ǐ ǒ ǔ ǚ, so pinyin is drawn in this font too). The subset is app/fonts/noto-sc.woff2, used by the app for
`lang="zh-Hans"` and `lang="zh-Latn-pinyin"` and embedded in the printed sheets. Run it at release, whenever a pack's
Chinese changes: hub/tests/test_packs.py fails while a pack holds a character the subset lacks.

--source is the full NotoSansSC-Regular.otf from https://github.com/notofonts/noto-cjk (Sans/SubsetOTF/SC); it is
not kept in the repository. Needs fontTools and brotli (the hub's requirements have both).
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


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--source", required=True, type=Path, help="NotoSansSC-Regular.otf (the whole font)")
    ap.add_argument("--out", type=Path, default=OUT)
    a = ap.parse_args(argv)
    from fontTools import subset
    from fontTools.ttLib import TTFont
    chars = needed()
    font = TTFont(a.source)
    missing = sorted(c for c in chars if ord(c) not in font.getBestCmap())
    if missing:
        print("the font lacks:", " ".join(missing))
        return 1
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]                 # keep the copyright and licence lines in the file
    opts.notdef_outline = True
    s = subset.Subsetter(opts)
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

#!/usr/bin/env python3
"""Pictures for the "What is wrong?" tiles (#/ask): square PNGs in, small square WebPs out.

    python3 tools/symptom_pics.py <folder or .zip of PNGs> [--size 360] [--max-kb 28] [--sheet sheet.png] [--dry-run]

Each picture is named with its symptom id from content/src/symptoms.json, e.g. fever.png (the ChatGPT prompts are in
animation-briefs/symptom-pictures-prompts.md). Names like "02 fever.png", "fever (1).png" or "Fever.PNG" work too.
For every picture it:
  - crops it to a square from the centre (if it is not square already) and resizes it to --size (default 360 px);
  - encodes WebP at the best quality that keeps it under --max-kb (default 28 KB; most land at 20-30 KB);
  - writes img/symptoms/<id>.webp and sets "pic" on that symptom in content/src/symptoms.json.
It then lists the ids that still have no picture, writes a contact sheet of all 33 tiles from the WebP files (by
default next to the input: <folder>/symptom-pictures-sheet.png) and reminds you to run tools/build.py (which also
adds the pictures to the offline precache). Running it again with new pictures replaces the old ones.
Needs Pillow (python3 -m pip install pillow).
"""
import argparse, io, json, os, re, sys, zipfile

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("needs Pillow: python3 -m pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYMPTOMS = os.path.join(ROOT, "content/src/symptoms.json")
OUT_DIR = "img/symptoms"
EXT = (".png", ".webp", ".jpg", ".jpeg")


def id_of(name, ids):
    """The symptom id a file name stands for, or None: "02 Fever (1).png" -> "fever"."""
    base = os.path.splitext(os.path.basename(name))[0].strip().lower()
    base = re.sub(r"\s*\(\d+\)$", "", base)            # "fever (1)": a second download
    base = re.sub(r"^\d+\s*[-_.)\s]\s*", "", base)    # "02 fever", "2. fever", "02-fever"
    base = re.sub(r"[\s_]+", "-", base)
    return base if base in ids else None


def inputs(src):
    """(name, opener) for each picture in a folder or a zip (a zip is read in place, nothing is unpacked)."""
    if os.path.isdir(src):
        for f in sorted(os.listdir(src)):
            p = os.path.join(src, f)
            if f.lower().endswith(EXT) and os.path.isfile(p): yield f, (lambda p=p: open(p, "rb").read())
    elif zipfile.is_zipfile(src):
        z = zipfile.ZipFile(src)
        for n in sorted(z.namelist()):
            if n.endswith("/") or "__MACOSX" in n or os.path.basename(n).startswith("."): continue
            if n.lower().endswith(EXT): yield n, (lambda n=n: z.read(n))
    else:
        sys.exit(f"{src}: not a folder or a zip file")


def square(im, size):
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA"); bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg
    im = im.convert("RGB")
    w, h = im.size; s = min(w, h)
    if w != h: im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return im.resize((size, size), Image.LANCZOS)


def encode(im, max_bytes, qmin=30, qmax=92):
    """Best WebP quality under max_bytes (binary search, as tools/steps_images.py); returns (bytes, quality)."""
    def enc(q):
        buf = io.BytesIO(); im.save(buf, "WEBP", quality=q, method=6); return buf.getvalue()
    best, lo, hi = None, qmin, qmax
    while lo <= hi:
        q = (lo + hi) // 2; data = enc(q)
        if len(data) <= max_bytes: best = (data, q); lo = q + 1
        else: hi = q - 1
    return best or (enc(qmin), qmin)


def font(px):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/Library/Fonts/Arial.ttf", "C:/Windows/Fonts/arial.ttf"):
        if os.path.exists(f): return ImageFont.truetype(f, px)
    return ImageFont.load_default()


def contact_sheet(syms, path, cell=180, cols=6):
    rows = (len(syms) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 26)), (255, 255, 255))
    d = ImageDraw.Draw(sheet); f = font(14)
    for i, s in enumerate(syms):
        x, y = (i % cols) * cell, (i // cols) * (cell + 26)
        p = os.path.join(ROOT, s.get("pic") or "")
        if s.get("pic") and os.path.exists(p):
            sheet.paste(Image.open(p).convert("RGB").resize((cell - 8, cell - 8), Image.LANCZOS), (x + 4, y + 4))
        else:
            d.rectangle((x + 4, y + 4, x + cell - 5, y + cell - 5), fill=(240, 236, 230)); d.text((x + 14, y + cell // 2 - 8), "no picture yet", fill=(140, 130, 120), font=f)
        d.text((x + 6, y + cell), f"{i + 1}. {s['id']}", fill=(30, 30, 30), font=f)
    sheet.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("src", help="folder or .zip of PNGs named <id>.png")
    ap.add_argument("--size", type=int, default=360, help="square size in px (default 360)")
    ap.add_argument("--max-kb", type=float, default=28, help="largest WebP in KB (default 28)")
    ap.add_argument("--sheet", help="contact sheet path (default: next to the input)")
    ap.add_argument("--dry-run", action="store_true", help="only check names and sizes, write nothing")
    a = ap.parse_args()

    data = json.load(open(SYMPTOMS, encoding="utf-8"))
    syms = data["symptoms"]; ids = {s["id"]: s for s in syms}
    os.makedirs(os.path.join(ROOT, OUT_DIR), exist_ok=True)
    done, unknown = {}, []
    for name, read in inputs(a.src):
        sid = id_of(name, ids)
        if not sid: unknown.append(name); continue
        if sid in done: print(f"  {name}: a second picture for {sid}, skipped (kept {done[sid]})"); continue
        try: im = Image.open(io.BytesIO(read())); im.load()
        except Exception as e: print(f"  {name}: cannot read it ({e}), skipped"); continue
        w, h = im.size
        sq = square(im, a.size)
        webp, q = encode(sq, int(a.max_kb * 1024))
        rel = f"{OUT_DIR}/{sid}.webp"
        note = "" if w == h else f"  (was {w}x{h}: cropped to a square from the centre, check the sheet)"
        if len(webp) > a.max_kb * 1024: note += "  (over --max-kb at the lowest quality)"
        print(f"  {sid:14s} {w}x{h} -> {a.size}x{a.size}  q{q:<3d} {len(webp) / 1024:5.1f} KB{note}")
        done[sid] = name
        if a.dry_run: continue
        open(os.path.join(ROOT, rel), "wb").write(webp)
        ids[sid]["pic"] = rel
    for n in unknown: print(f"  {n}: no symptom has this id, skipped (ids: {', '.join(ids)})")
    if not a.dry_run and done:
        # keep "pic" right after "icon"/"say" so the file stays easy to read
        for k, s in enumerate(syms):
            if "pic" not in s: continue
            pic = s.pop("pic"); out = {}
            for key, v in s.items():
                out[key] = v
                if key == ("say" if "say" in s else "icon"): out["pic"] = pic
            out.setdefault("pic", pic); syms[k] = out
        with open(SYMPTOMS, "w", encoding="utf-8") as fh: fh.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    missing = [s["id"] for s in syms if not s.get("pic")]
    print(f"{len(done)} picture(s) {'checked' if a.dry_run else 'written to ' + OUT_DIR + '/'}; "
          + (f"still no picture: {', '.join(missing)}" if missing else "every symptom has a picture"))
    if a.dry_run: return
    sheet = a.sheet or os.path.join(a.src if os.path.isdir(a.src) else os.path.dirname(os.path.abspath(a.src)), "symptom-pictures-sheet.png")
    contact_sheet(syms, sheet); print("contact sheet:", sheet)
    if done: print("now run: python3 tools/validate.py && python3 tools/build.py")


if __name__ == "__main__":
    main()

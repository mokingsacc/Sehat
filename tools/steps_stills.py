#!/usr/bin/env python3
"""Still pictures for topic pages from the picture-step frames (docs/STEPS_PLAYER.md, "Still pictures on the pages").

A step card, a page's top picture or a first-aid tile can show a frame of a picture-step set (Mo's ChatGPT
pictures) instead of an old flat drawing. A frame that is one whole picture already in the APK (for example
img/steps/recovery-position/4-full.webp of an Emergency set) is used as it is. A frame made of layers (background,
body, arms; a -fix patch over a shared picture), or a frame of an on-demand set (its pictures are not in the APK),
gets a flattened still here: the layers put back together in the frame's own order, with the hands in place (the
"-up" version of a moving part, or "-down" when the spec says so), and no rings, arrows or counters.

    python3 tools/steps_stills.py            # writes img/stills/<name>.webp for every entry of STILLS below
    python3 tools/steps_stills.py --check    # only says which stills are missing or out of date
    python3 tools/steps_stills.py --sheet out.png [set ...]   # contact sheet of every frame (up and down) of the sets
    python3 tools/steps_stills.py --png <folder>   # whole pictures delivered on their own (PICTURES), not set frames

Emergency and CPR stills are 640x480, under 22 KB; stills of on-demand sets are 480x360, under 15 KB, so the APK carries only a small still and the full set still downloads when its page is opened.
"""
import argparse, hashlib, io, json, os, sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("needs Pillow: python3 -m pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
J = lambda *p: os.path.join(ROOT, *p)
OUT = "img/stills"

# name: (set, frame, pose, size). pose "up" = the hands in place (a moving part's -up version), "down" = its -down
# version (pushed, pressed). size "big" = 800x600, "small" = 480x360 (on-demand sets).
STILLS = {
    # layered frames, or a pushed "-down" patch, of Emergency and CPR sets (their whole-picture frames are used
    # straight from img/steps/<set>/)
    "cpr-baby-thumbs": ("cpr-baby", "thumbs", "up", "big"),
    "cpr-baby-breath": ("cpr-baby", "breath", "down", "big"),
    "cpr-baby-kneel": ("cpr-baby", "kneel", "up", "big"),  # page top of cpr-baby (audit P-04)
    "cpr-newborn-puff": ("cpr-newborn", "5", "down", "big"),
    "cpr-child-breath": ("cpr-child", "3", "down", "big"),
    "cpr-adult-check": ("cpr-adult", "check", "up", "big"),
    "cpr-adult-tilt": ("cpr-adult", "tilt", "up", "big"),
    "cpr-adult-push": ("cpr-adult", "push", "up", "big"),
    "cpr-adult-hand": ("cpr-adult", "hand", "up", "big"),  # step cpr-adult.push (the push frame is the film poster)
    "choking-baby-back": ("choking-baby", "1", "down", "big"),
    "choking-adult-back": ("choking-adult", "2", "up", "big"),
    "choking-adult-pregnant": ("choking-adult", "5", "up", "big"),
    "bleeding-keep": ("bleeding-press", "2", "up", "big"),
    "burns-pour": ("burns-cool", "1", "down", "big"),  # step burns.cool and the burns page: the jug tipped over the burn (12 Oct 2026)
    "burns-rings": ("burns-cool", "2", "up", "big"),
    "seizure-safe": ("seizure", "1", "up", "big"),
    "seizure-time": ("seizure", "3", "up", "big"),
    "fever-fit-safe": ("fever-fit", "1", "up", "big"),
    "fever-fit-side": ("fever-fit", "2", "up", "big"),
    "allergy-sting": ("allergy-position", "3", "down", "big"),
    "spine-hold": ("spine-hold", "1", "up", "big"),
    "low-sugar-drink": ("low-sugar-drink", "1", "up", "big"),
    "heat-cool": ("heat-cooling", "2", "down", "big"),
    "inhaler-spacer": ("inhaler-spacer", "2", "down", "big"),
    "splint-cold": ("splint-sling", "3", "up", "big"),
    "eye-wash": ("eye-wash", "2", "down", "big"),
    "eye-cover": ("eye-wash", "3", "up", "big"),
    "nosebleed-pinch": ("nosebleed", "2", "down", "big"),
    # on-demand sets (their pictures are not in the APK): small stills, the full set still downloads with its page
    "bp-rest": ("bp-measure", "1", "up", "small"),
    "bp-cuff": ("bp-measure", "2", "down", "small"),
    "bp-arm": ("bp-measure", "3", "up", "small"),  # page top of kit-bp (audit P-04)
    "breastfeed-hold": ("breastfeed-attach", "1", "up", "small"),
    "breastfeed-latch": ("breastfeed-attach", "2", "up", "small"),  # poster of the film until it is downloaded (N-07)
    "breath-watch": ("breath-count", "1", "up", "small"),
    "glucometer-drop": ("glucometer", "3", "up", "small"),
    "glucometer-wash": ("glucometer", "1", "up", "small"),  # page top of kit-glucometer (audit P-04, P-06)
    "muac-arm": ("muac", "1", "up", "small"),
    "muac-loose": ("muac", "2", "up", "small"),  # poster of the film until it is downloaded (N-07)
    "muac-read": ("muac", "4", "up", "small"),
    "muac-tape": ("muac", "3", "up", "small"),  # page top of kit-muac (audit P-04)
    "thermometer-armpit": ("thermometer", "2", "down", "small"),
    "thermometer-wait": ("thermometer", "3", "up", "small"),
    "thermometer-wipe": ("thermometer", "1", "up", "small"),  # page top of kit-thermometer (audit P-03, P-04)
    "weigh-hang": ("weigh-child", "1", "up", "small"),
    "weigh-hold": ("weigh-child", "3", "up", "small"),
    "weigh-stand": ("weigh-child", "2", "up", "small"),  # page top of kit-scale (audit P-04)
    # growth guide (js/growth.js): length-height has no page of its own, so its set is not live; its frames were
    # checked right in the 10 Oct frame review
    "length-lie": ("length-height", "1", "up", "small"),
    "length-book": ("length-height", "2", "down", "small"),
    "height-wall": ("length-height", "3", "up", "small"),
}
SIZES = {"big": ((640, 480), 22), "small": ((480, 360), 15),
         # whole pictures delivered on their own (PICTURES below): page tops and step cards, list-row thumbnails
         # (116x84 CSS px), the two wide Health-tab buttons (16:7) and a side-by-side pair
         "page": ((480, 360), 12), "row": ((320, 240), 8), "wide": ((800, 350), 16), "pair": ((640, 480), 20)}

# Whole pictures that are not frames of a set (Mo's ChatGPT batch of 12 Oct 2026, prompt
# animation-briefs/chatgpt-ONE-PROMPT-2026-10-11.md part 2): they replace old flat drawings on page tops, rows, step
# cards and the Children / Adults buttons. name: (delivered PNG(s), size, crop). Two PNGs make one picture: the two
# side by side (left: normal, right: the danger sign), each cropped to crop, with a thin green and red border. crop is
# x, y, w, h in the delivered 1600x1200 pixels (None: the whole picture).
#     python3 tools/steps_stills.py --png <folder of the delivered PNGs>    # writes img/stills/<name>.webp
PICTURES = {
    "food-help": ("topic-food-help.png", "page", None),
    "head-injury": ("topic-head-injury.png", "page", None),
    "first-aid": ("topic-first-aid.png", "page", None),
    "red-flags": ("topic-red-flags.png", "page", None),
    "pregnancy-danger": ("topic-pregnancy-danger.png", "page", None),
    "danger-child": ("topic-danger-child.png", "page", None),
    "women-signs": ("topic-women-signs.png", "page", None),
    "child-signs": ("topic-child-signs.png", "page", None),
    "checks-women-bp": ("step-checks-women-bp.png", "page", None),
    "chest-indrawing": (("danger-chest-normal.png", "danger-chest-indrawing.png"), "pair", (360, 100, 700, 1075)),
    "home-children": ("home-children.png", "wide", (0, 150, 1600, 700)),
    "home-adults": ("home-adults.png", "wide", (0, 120, 1600, 700)),
    "row-growth": ("row-growth.png", "row", None),
    "row-reading": ("row-reading.png", "row", None),
    "row-near": ("row-near.png", "row", None),
}


def picture(folder, files, size, crop):
    """One delivered picture (or a side-by-side pair) at its size."""
    (w, h), _ = SIZES[size]
    ims = [Image.open(os.path.join(folder, f)).convert("RGB") for f in ((files,) if isinstance(files, str) else files)]
    if crop: ims = [im.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3])) for im in ims]
    if len(ims) == 1: return ims[0].resize((w, h), Image.LANCZOS)
    gap, line = 8, 5
    out = Image.new("RGB", (w, h), (255, 250, 240))
    pw = (w - gap) // 2
    for k, (im, col) in enumerate(zip(ims, ((46, 125, 91), (192, 57, 43)))):
        x = k * (pw + gap)
        out.paste(col, (x, 0, x + pw, h))
        out.paste(im.resize((pw - 2 * line, h - 2 * line), Image.LANCZOS), (x + line, line))
    return out


def build_pictures(folder):
    total = 0
    for n, (files, size, crop) in PICTURES.items():
        need = (files,) if isinstance(files, str) else files
        if not all(os.path.exists(os.path.join(folder, f)) for f in need):
            print(f"  {n:24s} not in {folder}, kept"); continue
        data, q = encode(picture(folder, files, size, crop), SIZES[size][1])
        open(J(OUT, n + ".webp"), "wb").write(data); total += len(data)
        print(f"  {n:24s} {' + '.join(need)} {SIZES[size][0][0]}x{SIZES[size][0][1]} q{q} {len(data) / 1024:5.1f} KB")
    print(f"{total / 1e3:.0f} KB of delivered pictures in {OUT}/")
    return 0


def frame_layers(name, frame, pose):
    """The layers of one frame, bottom first, without the other pose of each moving part."""
    d = json.load(open(J("anim/steps", name + ".json"), encoding="utf-8"))
    W, H = d["w"], d["h"]
    layers = d["frames"][frame]["layers"]
    by = {L["id"]: L for L in layers}
    keep = []
    for L in layers:
        i = L["id"]
        if pose == "up" and i.endswith("-down") and i[:-5] + "-up" in by: continue   # the pushed version
        if pose == "down" and i.endswith("-up") and i[:-3] + "-down" in by:
            # the hands-in-place version, unless the pushed one is only a patch over it
            if by[i[:-3] + "-down"].get("patch") != i: continue
        keep.append(L)
    return W, H, keep


def flatten(name, frame, pose="up"):
    W, H, layers = frame_layers(name, frame, pose)
    base = None
    for L in layers:
        im = Image.open(J("img/steps", name, L["src"])).convert("RGBA")
        if base is None:
            k = im.width / (L["box"][2] if L.get("box") else W)
            base = Image.new("RGBA", (round(W * k), round(H * k)), (255, 255, 255, 255))
        x, y, w, h = L.get("box") or [0, 0, W, H]
        X, Y, Wd, Hd = round(x * k), round(y * k), round(w * k), round(h * k)
        if im.size != (Wd, Hd): im = im.resize((Wd, Hd), Image.LANCZOS)
        base.alpha_composite(im, (X, Y))
    return base.convert("RGB")


def encode(im, max_kb):
    lo, hi, best = 30, 90, None
    while lo <= hi:
        q = (lo + hi) // 2
        b = io.BytesIO(); im.save(b, "WEBP", quality=q, method=6); data = b.getvalue()
        if len(data) <= max_kb * 1024: best, lo = (data, q), q + 1
        else: hi = q - 1
    if best is None:
        b = io.BytesIO(); im.save(b, "WEBP", quality=30, method=6); best = (b.getvalue(), 30)
    return best


def build(check=False):
    os.makedirs(J(OUT), exist_ok=True)
    stale, total = [], 0
    for n, (s, fr, pose, size) in STILLS.items():
        (w, h), kb = SIZES[size]
        data, q = encode(flatten(s, fr, pose).resize((w, h), Image.LANCZOS), kb)
        path = J(OUT, n + ".webp")
        same = os.path.exists(path) and open(path, "rb").read() == data   # Pillow's WebP encoder is deterministic
        if check:
            if not same: stale.append(n)
            continue
        if not same: open(path, "wb").write(data)
        total += len(data)
        print(f"  {n:24s} {s} frame {fr} ({pose}) {w}x{h} q{q} {len(data) / 1024:5.1f} KB")
    extra = sorted(f[:-5] for f in os.listdir(J(OUT)) if f.endswith(".webp") and f[:-5] not in STILLS and f[:-5] not in PICTURES)
    if check:
        print("stills out of date or missing:", ", ".join(stale) or "none", "| not in STILLS:", ", ".join(extra) or "none")
        return 1 if stale or extra else 0
    if extra: print("not in STILLS (delete them if nothing uses them):", ", ".join(extra))
    print(f"{len(STILLS)} stills, {total / 1e3:.0f} KB in {OUT}/")
    return 0


def sheet(out, sets):
    tiles = []
    for s in sets:
        d = json.load(open(J("anim/steps", s + ".json"), encoding="utf-8"))
        for fr in d["frames"]:
            ids = [L["id"] for L in d["frames"][fr]["layers"]]
            poses = ["up", "down"] if any(i.endswith("-down") or "-down-" in i for i in ids) else ["up"]
            for p in poses: tiles.append((f"{s} {fr} {p}", flatten(s, fr, p).resize((400, 300))))
    cols = 3; rows = (len(tiles) + cols - 1) // cols
    sh = Image.new("RGB", (cols * 404, rows * 324), "white"); dr = ImageDraw.Draw(sh)
    for i, (t, im) in enumerate(tiles):
        x, y = (i % cols) * 404, (i // cols) * 324
        sh.paste(im, (x + 2, y + 22)); dr.text((x + 4, y + 4), t, fill="black")
    sh.save(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--sheet")
    ap.add_argument("--png", help="folder of delivered whole pictures (PICTURES)")
    ap.add_argument("sets", nargs="*")
    a = ap.parse_args()
    if a.png: sys.exit(build_pictures(a.png))
    if a.sheet: sheet(a.sheet, a.sets); sys.exit(0)
    sys.exit(build(a.check))

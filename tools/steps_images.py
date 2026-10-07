#!/usr/bin/env python3
"""Pictures for the picture-step player (js/steps.js, docs/STEPS_PLAYER.md): PNG layers in, small WebP layers out.

    python3 tools/steps_images.py <folder of PNGs> [--anim cpr-adult] [--width 960] [--max-kb 60] [--dry-run]

Input files are named <animation>-<frame>-<layer>.png as in the ChatGPT briefs, e.g. cpr-child-5-bg.png,
cpr-child-5-body.png, cpr-child-5-arms-up.png, cpr-child-5-arms-down.png, recovery-position-3-full.png. The frame
is a number (or a word without hyphens); the layer is bg, full, body, patient, arms, hand, chest, ... optionally
with -up / -down (the two versions of a moving part: the player's "swap" motion takes turns between them).
Layers 1/2/3 may also be called 1, 2, 3 (= bg, body, arms). ChatGPT's own export names work too, with --anim:
step-01-01-background-baby.png, step-01-02-rescuer-body.png, step-01-03-arms-hands.png (step 01, layers 1-3) become
frame "step01". --rename 1=thumbs,step01=thumbs gives frames names.
A frame with no background of its own (e.g. choking-baby-2-arms-down.png, which "uses choking-baby-1-bg.png") joins
the frame before it that has one, as an extra layer.
For every frame it:
  - checks that all its layers have the same size, that the background is opaque and the other layers really are
    transparent (a "transparent" PNG with a painted checkerboard is refused);
  - crops all layers alike (--crop x,y,w,h in the original pixels, or --trim to cut a plain border off the
    background) and fits every frame to the animation's aspect ratio (the first frame's, or --aspect 4:3);
  - resizes to --width (default 960) with premultiplied alpha (no dark fringes);
  - removes small detached bits from transparent layers (stray sleeve fragments and the like: pieces smaller
    than --islands percent of the layer's biggest piece, default 2; 0 keeps everything);
  - trims each transparent layer to what it shows, and remembers where it goes (its box);
  - encodes WebP (with alpha), choosing the best quality that keeps each layer under --max-kb (default 60 KB);
writes img/steps/<animation>/<frame>-<layer>.webp, updates the "frames" of anim/steps/<animation>.json (or
creates the file with one simple scene per frame to start from), and prints the sizes.
--sheet out.png also writes a contact sheet of every frame put back together from the WebP files (to check
alignment). Needs Pillow (python3 -m pip install pillow).
"""
import argparse, glob, hashlib, io, json, os, re, sys

try:
    from PIL import Image, ImageChops
except ImportError:
    sys.exit("needs Pillow: python3 -m pip install pillow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALIAS = {"1": "bg", "2": "body", "3": "arms", "background": "bg", "back": "bg", "rescuer": "body", "hands": "arms"}
# stacking order, bottom first: backgrounds, the helper's body, the patient, other parts, then hands and arms on top
ORDER = ["bg", "full", "up", "down", "body", "patient", "chest"]
TOP = ["hand", "arms"]


def opaque_name(ly):
    """Layers that are whole pictures (no transparency): bg, full, and their up/down versions, or plain up/down."""
    base = re.sub(r"-(up|down)$", "", ly)
    return base in ("bg", "full") or ly in ("up", "down")


def natural(k):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", k)]
EXT = (".png", ".webp", ".jpg", ".jpeg")


def parse(files, anim, rename=None):
    """{anim: {frame: {layer: path}}}"""
    out = {}
    rename = rename or {}
    for f in files:
        base = os.path.splitext(os.path.basename(f))[0].lower()
        m = re.match(r"^step-?(\d+)-(\d+)(?:-.*)?$", base)
        if m and anim:
            a, fr, ly = anim, "step" + m.group(1), str(int(m.group(2)))
        elif anim:
            if not base.startswith(anim + "-"): continue
            rest = base[len(anim) + 1:].split("-", 1)
            if len(rest) != 2: print("skip (name is not <anim>-<frame>-<layer>):", f); continue
            a, fr, ly = anim, rest[0], rest[1]
        else:
            # <animation>-<number>-<layer>: the first all-digit part is the frame
            p = base.split("-")
            k = next((i for i in range(1, len(p) - 1) if p[i].isdigit()), None)
            if k is None:
                ud = 1 if p[-1] in ("up", "down") else 0  # <layer>-up / <layer>-down
                if len(p) < 3 + ud: print("skip (name is not <anim>-<frame>-<layer>):", f); continue
                k = len(p) - 2 - ud
            a, fr, ly = "-".join(p[:k]), p[k], "-".join(p[k + 1:])
        if not re.match(r"^[a-z0-9-]+$", a) or not re.match(r"^[a-z0-9_]+$", fr) or not re.match(r"^[a-z0-9_]+(-(up|down))?$|^[a-z0-9_]+$", ly):
            print("skip (use a-z and 0-9; a frame without hyphens; a layer name, optionally -up or -down):", f); continue
        ly = ALIAS.get(ly, ly)
        fr = rename.get(fr, fr)
        if ly in out.setdefault(a, {}).setdefault(fr, {}): sys.exit(f"two files for {a} {fr} {ly}")
        out[a][fr][ly] = f
    return out


def layer_order(layers):
    def rank(k):
        b = re.sub(r"-(up|down)$", "", k)
        if k in ORDER: r = ORDER.index(k)
        elif b in ORDER: r = ORDER.index(b)
        elif b in TOP: r = 100 + TOP.index(b)
        else: r = 50
        return (r, b, 1 if k.endswith("-down") else 0)  # the down version above the up (or plain) one
    return sorted(layers, key=rank)


def is_checkerboard(im):
    """A layer that should be transparent but has a painted grey/white checkerboard (a common AI-export mistake)."""
    rgb = im.convert("RGB").resize((64, 48), Image.NEAREST)
    px = list(rgb.getdata())
    edge = px[:64] + px[-64:]
    greys = [p for p in edge if abs(p[0] - p[1]) < 6 and abs(p[1] - p[2]) < 6 and p[0] > 150]
    return len(greys) > 0.9 * len(edge) and len({p[0] // 12 for p in greys}) >= 2


def border_box(im, tol=18):
    """The box inside a plain border of the background (the border colour is the top-left pixel)."""
    rgb = im.convert("RGB")
    bgc = Image.new("RGB", rgb.size, rgb.getpixel((0, 0)))
    diff = ImageChops.difference(rgb, bgc).convert("L").point(lambda v: 255 if v > tol else 0)
    return diff.getbbox() or (0, 0) + rgb.size


def fit(box, aspect):
    """Shrink a crop box (x0, y0, x1, y1) around its centre to the given width / height ratio."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if w / h > aspect:
        nw = round(h * aspect); x0 += (w - nw) // 2; x1 = x0 + nw
    else:
        nh = round(w / aspect); y0 += (h - nh) // 2; y1 = y0 + nh
    return (x0, y0, x1, y1)


def resize(im, size):
    if im.mode == "RGBA":
        return im.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")
    return im.resize(size, Image.LANCZOS)


def clean_alpha(im):
    """Fully transparent pixels become transparent black, tiny alpha values become 0: smaller files, exact trimming."""
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < 6 else v)
    mask = a.point(lambda v: 255 if v else 0)
    black = Image.new("RGB", im.size, (0, 0, 0))
    rgb = Image.composite(Image.merge("RGB", (r, g, b)), black, mask)
    out = rgb.convert("RGBA"); out.putalpha(a)
    return out


def drop_islands(im, pct):
    """Remove pieces of a transparent layer that do not touch its biggest piece and are smaller than pct percent of
    it (found on a quarter-size mask, 8-connected). Returns (image, [(x, y, w, h) of what was removed])."""
    if pct <= 0: return im, []
    a = im.getchannel("A")
    k = 4
    sw, sh = max(1, im.width // k), max(1, im.height // k)
    small = a.resize((sw, sh), Image.BOX).point(lambda v: 1 if v > 16 else 0)
    px = small.load()
    label = [[0] * sw for _ in range(sh)]
    comps = []
    for y in range(sh):
        for x in range(sw):
            if px[x, y] and not label[y][x]:
                n = len(comps) + 1; stack = [(x, y)]; label[y][x] = n; area = 0; x0, y0, x1, y1 = x, y, x, y
                while stack:
                    cx, cy = stack.pop(); area += 1
                    x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
                    for dx in (-1, 0, 1):
                        for dy in (-1, 0, 1):
                            nx, ny = cx + dx, cy + dy
                            if 0 <= nx < sw and 0 <= ny < sh and px[nx, ny] and not label[ny][nx]:
                                label[ny][nx] = n; stack.append((nx, ny))
                comps.append((area, (x0, y0, x1, y1)))
    if len(comps) < 2: return im, []
    big = max(c[0] for c in comps)
    drop = [i + 1 for i, c in enumerate(comps) if c[0] < big * pct / 100]
    if not drop: return im, []
    kill = Image.new("L", (sw, sh), 0); kp = kill.load(); ds = set(drop)
    for y in range(sh):
        row = label[y]
        for x in range(sw):
            if row[x] in ds: kp[x, y] = 255
    # grow by one cell so the soft edges of a removed piece go too
    from PIL import ImageFilter
    kill = kill.filter(ImageFilter.MaxFilter(3)).resize(im.size, Image.NEAREST)
    keep = Image.eval(kill, lambda v: 0 if v else 255)
    # never cut into a kept piece: only clear pixels that the grown mask covers and the kept pieces do not
    keep_small = Image.new("L", (sw, sh), 0); ks = keep_small.load()
    for y in range(sh):
        row = label[y]
        for x in range(sw):
            if row[x] and row[x] not in ds: ks[x, y] = 255
    keep = ImageChops.lighter(keep, keep_small.filter(ImageFilter.MaxFilter(3)).resize(im.size, Image.NEAREST))
    out = im.copy(); out.putalpha(ImageChops.multiply(a, keep))
    boxes = [(comps[i - 1][1][0] * k, comps[i - 1][1][1] * k, (comps[i - 1][1][2] - comps[i - 1][1][0] + 1) * k, (comps[i - 1][1][3] - comps[i - 1][1][1] + 1) * k) for i in drop]
    return out, boxes


def encode(im, max_bytes, qmin, qmax):
    """Best WebP quality under max_bytes (binary search); returns (bytes, quality)."""
    def enc(q):
        buf = io.BytesIO()
        kw = dict(quality=q, method=6)
        if im.mode == "RGBA": kw["alpha_quality"] = min(100, q + 25)
        im.save(buf, "WEBP", **kw)
        return buf.getvalue()
    best = None
    lo, hi = qmin, qmax
    while lo <= hi:
        q = (lo + hi) // 2
        data = enc(q)
        if len(data) <= max_bytes: best = (data, q); lo = q + 1
        else: hi = q - 1
    return best or (enc(qmin), qmin)


def starter_scene(name, k, fr, layers, W, H):
    """A first scene for a frame: a slow zoom; each -up / -down pair takes turns 5 times with a counter."""
    sc = {"id": f"anim.{name}.s{k + 1}", "frame": fr, "cam": {"path": [[0, 0, W], [round(W * 0.1), round(H * 0.1), round(W * 0.8)]], "ms": [7000]},
          "motions": [], "overlays": []}
    ids = [L["id"] for L in layers]
    for ly in ids:
        if ly.endswith("-down") and ly[:-5] + "-up" in ids:
            mid = "swap" if not sc["motions"] else f"swap{len(sc['motions']) + 1}"
            sc["motions"].append({"id": mid, "type": "swap", "layer": ly, "under": ly[:-5] + "-up", "rate": 60, "count": 5, "at": 1500})
            if len(sc["motions"]) == 1: sc["overlays"].append({"type": "counter", "follow": mid, "of": 5, "pos": "top-end"})
    return sc


def dumps(d, ind=0, width=150):
    """JSON that is easy to read and edit by hand: an object or list goes on one line when it fits."""
    one = json.dumps(d, ensure_ascii=False, separators=(", ", ": "))
    if not isinstance(d, (dict, list)) or len(one) + ind <= width: return one
    pad = " " * (ind + 1)
    if isinstance(d, list):
        return "[\n" + ",\n".join(pad + dumps(x, ind + 1, width) for x in d) + "\n" + " " * ind + "]"
    return "{\n" + ",\n".join(pad + json.dumps(k, ensure_ascii=False) + ": " + dumps(v, ind + 1, width) for k, v in d.items()) + "\n" + " " * ind + "}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", help="folder with <animation>-<frame>-<layer>.png files")
    ap.add_argument("--anim", help="only this animation (needed when frame names contain hyphens)")
    ap.add_argument("--width", type=int, default=960)
    ap.add_argument("--max-kb", type=float, default=60, help="largest size of one layer (KB)")
    ap.add_argument("--qmin", type=int, default=30); ap.add_argument("--qmax", type=int, default=82)
    ap.add_argument("--crop", help="x,y,w,h in the original pixels, the same for every frame")
    ap.add_argument("--trim", action="store_true", help="cut a plain border off each background (same cut for its layers)")
    ap.add_argument("--aspect", help="width:height of the stage, e.g. 4:3 (default: the first frame's)")
    ap.add_argument("--out", default=os.path.join(ROOT, "img/steps"))
    ap.add_argument("--json", default=os.path.join(ROOT, "anim/steps"), help="folder of the animation JSON files")
    ap.add_argument("--islands", type=float, default=2, help="drop detached pieces smaller than this %% of the biggest (0 = keep all)")
    ap.add_argument("--rename", default="", help="frame names, e.g. step01=thumbs,step02=breath")
    ap.add_argument("--allow-opaque", action="store_true", help="accept layers 2 and up without transparency")
    ap.add_argument("--sheet", help="write a contact sheet PNG of the rebuilt frames")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    files = sorted(f for f in glob.glob(os.path.join(a.src, "*")) if f.lower().endswith(EXT))
    anims = parse(files, a.anim, dict(x.split("=", 1) for x in a.rename.split(",") if "=" in x))
    if not anims: sys.exit("no <animation>-<frame>-<layer>.png files in " + a.src)
    problems, sheet_rows, grand = [], [], 0
    for name, frames in sorted(anims.items()):
        print(f"\n{name}: {len(frames)} frame(s)")
        aspect = None
        if a.aspect:
            w, h = (float(x) for x in a.aspect.split(":")); aspect = w / h
        out_frames, W, H = {}, a.width, None
        merged, last = {}, None
        for fr in sorted(frames, key=natural):
            if any(opaque_name(ly) for ly in frames[fr]) or last is None:
                merged[fr] = dict(frames[fr]); last = fr
            else:
                for ly, pth in frames[fr].items():
                    key = ly if ly not in merged[last] else f"{fr}-{ly}"
                    merged[last][key] = pth
                print(f"  frame {fr} has no background of its own: its {', '.join(sorted(frames[fr]))} join frame {last}")
        frames = merged
        for fr in frames:  # in natural order (1, 2, ..., 10)
            layers = frames[fr]
            ims = {ly: Image.open(p) for ly, p in layers.items()}
            sizes = {ly: im.size for ly, im in ims.items()}
            if len(set(sizes.values())) != 1:
                problems.append(f"{name} {fr}: layers differ in size {sizes}"); continue
            size = next(iter(sizes.values()))
            order = layer_order(ims)
            base = order[0]
            for ly in order:
                im = ims[ly]
                im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P", "PA") or "transparency" in im.info else im.convert("RGB")
                ims[ly] = im
                if ly == base or opaque_name(ly):
                    if im.mode == "RGBA" and im.getchannel("A").getextrema()[0] < 250:
                        print(f"  note: {fr}-{ly} (the background) has transparent parts: they are filled with white")
                        flat = Image.new("RGB", im.size, (255, 255, 255)); flat.paste(im, mask=im.getchannel("A")); ims[ly] = flat
                    else: ims[ly] = im.convert("RGB")
                else:
                    if im.mode != "RGBA" or im.getchannel("A").getextrema()[0] > 250:
                        why = "painted checkerboard, not real transparency" if is_checkerboard(im) else "no transparency"
                        if not a.allow_opaque:
                            problems.append(f"{name} {fr}-{ly}: {why} (layers 2 and up must be transparent PNGs)"); del ims[ly]; continue
                        ims[ly] = im.convert("RGBA")
                    else:
                        im2, gone = drop_islands(im, a.islands)
                        for b in gone: print(f"  {fr}-{ly}: removed a detached bit at x {b[0]}-{b[0] + b[2]}, y {b[1]}-{b[1] + b[3]} (original pixels)")
                        ims[ly] = im2
            # crop: --crop, else --trim, else the whole picture; then fit to the stage's aspect ratio
            if a.crop:
                x, y, w, h = (int(v) for v in a.crop.split(",")); box = (x, y, x + w, y + h)
            elif a.trim: box = border_box(ims[base])
            else: box = (0, 0) + size
            if aspect is None: aspect = (box[2] - box[0]) / (box[3] - box[1])
            box = fit(box, aspect)
            if H is None: H = round(W / aspect)
            scale = W / (box[2] - box[0])
            out_frames[fr] = []
            for ly in order:
                if ly not in ims: continue
                im = resize(ims[ly].crop(box), (W, H))
                lbox = [0, 0, W, H]
                if im.mode == "RGBA":
                    im = clean_alpha(im)
                    bb = im.getchannel("A").getbbox()
                    if not bb: problems.append(f"{name} {fr}-{ly}: empty (fully transparent)"); continue
                    pad = 2
                    bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(W, bb[2] + pad), min(H, bb[3] + pad))
                    im = im.crop(bb); lbox = [bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]]
                data, q = encode(im, a.max_kb * 1024, a.qmin, a.qmax)
                over = len(data) > a.max_kb * 1024
                grand += len(data)
                fn = f"{fr}-{ly}.webp"
                print(f"  {fn:28s} {sizes[ly][0]}x{sizes[ly][1]} -> {lbox[2]}x{lbox[3]} at {lbox[0]},{lbox[1]}  q{q:<3d} {len(data) / 1024:5.1f} KB{'  (over --max-kb at the lowest quality)' if over else ''}")
                if not a.dry_run:
                    os.makedirs(os.path.join(a.out, name), exist_ok=True)
                    open(os.path.join(a.out, name, fn), "wb").write(data)
                L = {"id": ly, "src": fn, "v": hashlib.sha1(data).hexdigest()[:8], "kb": round(len(data) / 1024, 1)}
                if lbox != [0, 0, W, H]: L["box"] = lbox
                out_frames[fr].append(L)
            sheet_rows.append((name, fr))
        # anim/steps/<name>.json: replace the frames, keep the scenes (or start a simple one per frame)
        jp = os.path.join(a.json, name + ".json")
        d = json.load(open(jp, encoding="utf-8")) if os.path.exists(jp) else None
        fresh = d is None
        if fresh:
            d = {"v": 1, "id": f"anim.{name}", "w": W, "h": H, "adult": name.startswith("cpr"),
                 "_note": "Made by tools/steps_images.py. Write the scenes (docs/STEPS_PLAYER.md); scene ids are the narration ids.",
                 "frames": {}, "scenes": [starter_scene(name, k, fr, out_frames[fr], W, H) for k, fr in enumerate(out_frames)]}
        if (d.get("w"), d.get("h")) != (W, H) and not fresh:
            print(f"  note: the picture size changed from {d.get('w')}x{d.get('h')} to {W}x{H}: check the scenes' coordinates")
        d["w"], d["h"] = W, H
        d["frames"] = dict(d.get("frames") or {}, **{fr: {"layers": L} for fr, L in out_frames.items()})
        kb = sum(L["kb"] for fr in d["frames"].values() for L in fr["layers"])
        print(f"  {name}: {sum(len(v) for v in out_frames.values())} layers written, the animation's pictures now total {kb:.0f} KB")
        if not a.dry_run:
            os.makedirs(a.json, exist_ok=True)
            open(jp, "w", encoding="utf-8").write(dumps(d) + "\n")
            print(f"  {'wrote' if fresh else 'updated frames in'} {os.path.relpath(jp, ROOT)}")
        if a.sheet and not a.dry_run:
            tiles = []
            for fr, layers in out_frames.items():
                canvas = Image.new("RGBA", (W, H), (255, 255, 255, 255))
                for L in layers:
                    im = Image.open(os.path.join(a.out, name, L["src"])).convert("RGBA")
                    bx = L.get("box", [0, 0, W, H]); canvas.alpha_composite(im, (bx[0], bx[1]))
                tiles.append(canvas.convert("RGB").resize((W // 3, H // 3)))
            if tiles:
                sheet = Image.new("RGB", (W // 3 * min(3, len(tiles)), H // 3 * ((len(tiles) + 2) // 3)), "white")
                for k, t in enumerate(tiles): sheet.paste(t, (W // 3 * (k % 3), H // 3 * (k // 3)))
                sp = a.sheet if len(anims) == 1 else a.sheet.replace(".png", f"-{name}.png")
                sheet.save(sp); print(f"  contact sheet: {sp}")
    print(f"\ntotal written: {grand / 1024:.0f} KB")
    if problems:
        print("\nPROBLEMS:"); [print("  " + p) for p in problems]
        sys.exit(1)


if __name__ == "__main__":
    main()

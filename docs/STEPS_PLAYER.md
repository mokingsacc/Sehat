# Picture steps: approved still pictures, brought to life

The picture-step player turns **still illustrations** (Mo's ChatGPT pictures, delivered as layers) into short narrated
animations: gentle camera moves, drawn arrows and rings, counters, and the rescuer's hands moving on their own layer.
Only CSS transforms and opacity are animated (the Web Animations API, composited), so it stays smooth on old Android
phones. It uses no canvas, no video and no libraries, and it works offline.

- Player: `js/steps.js`, about 30 KB raw. It loads only when a picture-step animation opens.
- One animation: `anim/steps/<name>.json` (the scenes) and `img/steps/<name>/*.webp` (the pictures).
- Pictures in: `tools/steps_images.py` (PNG layers to small WebP layers, and the JSON's frames).
- Tests: `node tools/test_steps.mjs` (arithmetic) and `tools/test_steps_browser.mjs` (Playwright: fa / ps / en,
  320 and 412 px, RTL, digits, reduced motion, fps with the CPU slowed 4x).

**Nothing goes live until Mo approves the pictures.** A picture-step animation plays in the app only when its
name is in `STEPS` in `js/anim.js` **and** its JSON has an `"approved"` note (tools/validate.py refuses a live
animation without one). Until then the app keeps playing the SVG version.

**Live now:** `cpr-baby` (approved by Mo on 7 Oct 2026, demo version). All 7 narrated scenes come from Mo's one
frame: s3, s5 and s6 as he approved them; s1 (ring on the feet, tap and call lines), s2 (zoom out, the call for help,
car and hospital icons), s4 (face and chest, breath lines beside the head, 1–5 breath counter, the chest lighting up
with each breath) and s7 (a call for help, pushes with a 1-minute clock, then the way to the hospital) are made with
camera moves and overlays. Frame `kneel` is the rescuer's body layer without her arms. The newborn, child and adult
CPR keep their cine / SVG versions.

## How it plugs into the player

`js/anim.js` plays three kinds of animation behind one API (`openAnimation`, `mountAnimation`, `animPoster`,
groups such as the CPR age picker):

1. **picture steps** (`anim/steps/<name>.json`), when `<name>` is in `STEPS`;
2. **cine** (`anim/cine/<name>.js`), when `<name>` is in `CINE`;
3. **SVG** (`anim/<name>.js`).

If a picture-step JSON is missing or broken, the next kind plays. `opts.steps === false` skips picture steps.
`useSteps('cpr-baby')` adds a name at run time (previews and tests only). The player around the scene stays the same:
title and speaker, dots, the narration text with its speaker, Previous / Again / Next, swipe (in RTL, swipe right
for next), keys, and auto-advance when the narration ends. Picture steps add one rule: **a scene that is still
counting (for example 30 pushes) finishes before the player moves on**, even if the narration ended earlier.

Scene ids are the narration ids, `anim.<name>.s1` and so on, as for the SVG versions, so recordings and translations keep
working. A picture-step version may use some of the SVG version's ids. For example, a demo can use only
`anim.cpr-baby.s3`, `s5` and `s6`; the other lines then fall into the "everyone" audio pack until scenes use them.

## From Mo's PNGs to a live animation (the quick path)

1. **Put the PNGs in one folder**, named as in the ChatGPT briefs
   (`/mnt/project-files/samangan-red-book/animation-briefs/chatgpt-briefs.md`): `<animation>-<frame>-<layer>.png`.
   Examples: `cpr-child-5-bg.png`, `cpr-child-5-body.png`, `cpr-child-5-arms-up.png`, `cpr-child-5-arms-down.png`,
   `recovery-position-3-full.png`. The frame is a number. The layer is one of these, optionally with `-up` or
   `-down` (the two versions of a moving part):
   - `bg`: the background and whatever stays still. It is opaque.
   - `full`: a single picture with no layers. It is opaque.
   - `body`, `patient`, `arms`, `hand`, `chest`, `tape`, ...: transparent PNGs.

   A frame with no background of its own, such as `choking-baby-2-arms-down.png` ("uses `choking-baby-1-bg.png`"),
   joins the frame before it. ChatGPT's own export names also work with `--anim`: `step-01-01-background-baby.png`,
   `step-01-02-rescuer-body.png` and `step-01-03-arms-hands.png` are step 01 with layers 1–3 (bg, body, arms).
   Every picture of one animation has the same size; 1600x1200 and ChatGPT's 1536x1024 both work.
2. **Run the pipeline** from the repo:
   ```sh
   python3 tools/steps_images.py ~/pngs/baby --anim cpr-baby --rename step01=thumbs,step02=breath --sheet /tmp/sheet.png
   ```
   For every frame the pipeline:
   - checks that the layer sizes match;
   - refuses a "transparent" layer that is really a painted checkerboard;
   - removes small detached bits from layers 2 and 3. These are stray sleeve fragments; the threshold is
     `--islands 2`, meaning 2% of the layer's biggest piece. The pipeline prints where each removed bit was.
   - crops the frames alike (`--crop x,y,w,h`, or `--trim` for a plain border);
   - resizes to 960 px wide with premultiplied alpha;
   - trims each transparent layer to what it shows and records its `box`;
   - encodes WebP at the best quality under `--max-kb 60`.

   Layers are stacked bottom first: backgrounds, then `body`, `patient` and `chest`, then other parts, then `hand`
   and `arms`; a `-down` version goes above its `-up`. The pipeline writes `img/steps/<name>/<frame>-<layer>.webp`
   and either updates the `frames` of `anim/steps/<name>.json` (keeping your scenes) or creates the file with one
   simple scene per frame. Each `-up` / `-down` pair in a starter scene already takes turns 5 times, with a
   counter. It then prints
   every size and the total. Open `--sheet` to check the layers line up.
3. **Write the scenes** in `anim/steps/<name>.json` (format below). Coordinates are picture pixels of the 960-wide
   frame; read them off the contact sheet or any image viewer. Start from `anim/steps/cpr-baby.json` in the demo
   (`/home/claude/steps-demo/demo/`, see "Demo" below).
4. **Look at it.** Copy the folder's `anim/steps/<name>.json` and `img/steps/<name>/` into the demo folder (or any
   folder with `js/anim.js` and `js/steps.js`) and open `index.html` there. Then run the browser test with
   screenshots:
   ```sh
   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=$(npm root -g) node tools/test_steps_browser.mjs \
     --root /home/claude/steps-demo/demo --anim cpr-baby --shots /tmp/shots --times 0,2000,5000,9000
   ```
5. **Mo approves** the pictures and the motion (send him the strip `/tmp/shots/<name>-strip-fa.png`). Add
   `"approved": "2026-10-09, Mo (message ...)"` to the JSON.
6. **Go live:** add the name to `STEPS` in `js/anim.js`, then run `python3 tools/validate.py` (0 errors) and
   `python3 tools/build.py`. The JSON and its pictures are now precached and work offline. The topic's existing
   `anim` block (for example `cpr` with `pick: cpr-baby`) plays the new version; nothing else changes. Give every
   scene id narration in `content/src/anims.json`.

## Data format: `anim/steps/<name>.json`

```json
{
 "v": 1,
 "id": "anim.cpr-baby",
 "w": 960, "h": 720,
 "adult": true,
 "approved": "",
 "offline": "precache",
 "poster": 1,
 "frames": {
  "baby":   {"layers": [{"id": "bg", "src": "thumbs-bg.webp", "v": "2431f830"}]},
  "thumbs": {"layers": [
    {"id": "bg",   "src": "thumbs-bg.webp",   "v": "2431f830"},
    {"id": "body", "src": "thumbs-body.webp", "v": "54fa7665", "box": [428, 312, 506, 408]},
    {"id": "arms", "src": "thumbs-arms.webp", "v": "b02c85a9", "box": [143, 266, 523, 454]}]}
 },
 "scenes": [{"id": "anim.cpr-baby.s5", "frame": "baby", "cam": {}, "motions": [], "overlays": [], "key": {}, "ms": 12000}]
}
```

- `id`: the narration prefix (`anim.<name>.title` is the title). `w`, `h`: the picture size all coordinates refer to.
- `adult`: the teal look (all CPR). `approved`: Mo's approval note, needed to go live. `poster`: the scene used for
  posters and picker cards.
- `offline`: `precache` (default) or `pack` (pictures kept by the phone once shown; see "Sizes, offline and speed").
- **frames**: a frame is a stack of layers, bottom first. `box` = `[x, y, w, h]` where a trimmed layer sits (the
  pipeline writes it; without it the layer covers the whole picture). `v` is the picture's hash (cache-busting).
  Frames may share pictures; `baby` above is the background alone, so the hands can be faded in.
- **scene**: `id` (narration id), `frame` (shown first), `ms` (time on screen when there is no narration, default about
  6 s), `wait` (`false` = do not hold the scene for its counting; a number = hold this many ms).
- Times (`at`, `until`, `ms`) are milliseconds from the scene start. The clock starts when the scene's pictures are
  decoded, so the motion lines up with what is seen.

### Camera (Ken Burns)

```json
"cam": {"path": [[0, 0, 960], [230, 140, 380], [150, 70, 620]], "ms": [2600, 9000], "hold": [0, 4200], "ease": "in-out"}
```

Each stop is `[x, y, w]`, the top-left corner and width of the visible rectangle in picture pixels; its height
follows the aspect ratio, and it is kept inside the picture. `ms[k]` is the time to travel to stop k+1, and
`hold[k]` is a pause before that move. `{"cx": .., "cy": .., "w": ..}` centres a stop instead. With no `cam` there is
a slow 4% push-in; `"cam": false` keeps the picture still. Easing: `linear`, `in`, `out`, `in-out`, `sine`, `soft`,
or any CSS easing.

### Motions

| type | fields | what it does |
| --- | --- | --- |
| `loop` | `layer` or `layers`, `frame`, `dx` `dy` (px), `s` / `sx` `sy` (scale), `r` (deg), `origin` `[x, y]`, `rate` (per minute), `ease` (`push`, `sine`, `rub`, `breath`, `linear`), `count`, `at`, `slow: {count, rate}`, `id`, `follow` | moves a layer back and forth. `push` = 40% down, a short hold, 40% back up (full recoil) and a short rest. `rub` = both sides of the rest position. `slow` = the first `count` cycles at the slow rate, then `rate` ("slow, then full speed"). No `count` = until the scene ends. `follow: "<id>"` = same timing as another motion, with its own movement (e.g. the rescuer's body following the hands). |
| `swap` | `layer` (the `-down` version), `under` (the `-up` version), then as `loop`: `rate`, `count`, `slow`, `ease`, `at`, `follow`, `id`; also `blend` (ms, default 80), `hide` (default true: hide the up version while down shows) | the brief's "switches between the two arm layers": the down picture shows from half-way down to half-way back up in each cycle, and counters count at the bottom. A `-down` layer is hidden in every scene that does not use it. A small `loop` on both layers (for example `dy` 3) makes the switch smoother. |
| `fade` | `layer`, `from`, `to` (opacity), `at`, `ms` | a layer appears or goes |
| `move` | `layer`, `from` / `to` `{dx, dy, s, r}`, `at`, `ms`, `ease` | a layer slides or grows once |
| `xfade` | `to` (frame), `at`, `ms`; with `back: true` also `hold`, `gap`, `count`, `id` | cross-fade to another frame; with `back`, there and back `count` times (for example a chest rising, two breaths) |

A layer reference is `"arms"` (in the scene's frame, or in the motion's `frame`) or `"thumbs.arms"`. A loop and a
move or fade can act on the same layer: the loop moves the picture and the others move its holder.

**Top-down views:** pushing straight down does not read as depth. For the baby (view from above), use a small scale
with the origin at the bottom edge of the arms layer, so the arms never come away from the edge. For example, `sx`
0.98 and `sy` 0.99 with `origin` `[413, 720]` move the thumbs about 4 px toward the feet. Add `shade` overlays (a
press shadow under the thumbs and the chest darkening a little on each push). For side views, `dy` = one third of the
chest's height in the picture, with a `depth` bracket of the same size.

### Overlays

| type | fields | notes |
| --- | --- | --- |
| `ring` | `x`, `y`, `r` or `rx` `ry`, `dim` (darken everything else), `pulse` (default on), `width`, `color` | the spot to look at |
| `arrow` | `from`, `to`, `width`, `bend` (px; curved: positive bulges to the left of the way it points), `nudge` (px, default 10), `grow` | grows from its tail, then nudges toward its tip (turning and rolling arrows: use `bend`) |
| `dot` | `x`, `y`, `r` | a pulsing spot ("the lower half of the breastbone") |
| `guide` | `from`, `to`, `width`, `dash` (default dotted) | e.g. the nipple line, a straight arm |
| `depth` | `x`, `y1`, `y2`, `follow` (a push motion), `label` `{fa, ps, en}`, `side` | bracket from the chest at rest to fully pushed, with a marker that moves with the push |
| `shade` | `x`, `y`, `r` or `rx` `ry`, `max` (opacity), `color` (`"r,g,b"`), `follow`, `above` (layer id), `frame` | a soft dark patch that follows a push (`above: "bg"` puts it under the rescuer) |
| `tick`, `cross` | `x`, `y`, `r` | do / do not |
| `icon` | `name` (an icon in `img/icons/`, e.g. `hospital`, `car`, `clock`, `milk`), `x`, `y`, `r`, `crossed` | the app's own icons on a white disc; `crossed: true` = "do not" (red circle and line) |
| `waves` | `x`, `y`, `angle` (deg, 0 = to the right), `size`, `count`, `spread`, `ms` | sound lines ("shout for help"), breathing lines, warmth |
| `counter` | `follow` (a motion id) or `to` + `every` (ms), `of` (shows "/30"), `start`, `loop`, `icon` (`push`, `breath`), `pos` | counts each push at the bottom (each breath at its peak); appears just before the first one |
| `timer` | `from`, `to` (seconds; counts down when `to` < `from`), `pos`, `wait` | e.g. "look for up to 10 seconds"; `wait: true` holds the scene until it ends |

All overlays take `at` (appear) and `until` (go). Rings, arrows, guides, ticks and depth brackets are drawn in
picture coordinates and zoom with the camera. Counters and timers sit in a corner of the stage (`pos`: `top-end`
by default, or `top-start`, `bottom-start`, `bottom-end`) and do not zoom.

**RTL and digits:** in fa and ps, counters, timers and labels use Persian digits (۱–۳۰), and `start` and `end`
corners swap sides. **Pictures are never flipped.** An overlay tied to something in the picture stays where it is.
Add `"mirror": true` only to an overlay that is not tied to the picture (it is then mirrored around the centre).

### Reduced motion and posters

With reduced motion (the phone setting, or the player's `still` option), each scene shows its **key frame**: the
last frame it cross-fades to, the camera's last stop and every overlay. Counters show their final value (for
example ۳۰). `"key": {"frame": "thumbs", "cam": 1, "pose": "beat"}` overrides this: `cam` is a stop index or a
rectangle, and `pose: "beat"` shows a pushing layer fully pushed. Posters (topic blocks, picker cards) are the key
frame of scene `poster`, without counters and labels.

## Sizes, offline and speed

- **Mo's first frame** (baby, two thumbs; 3 layers, 1600x1200): 43 + 13 + 17 = **73 KB** at 960 px (the background
  is opaque WebP; the trimmed body and arms layers have alpha). Expect 60 to 110 KB a frame, so roughly 0.3 to 0.6 MB
  for each CPR age at 4 to 6 frames, and about 1.5 to 2 MB for all four ages. Today the precached app is about 4.2 MB.
- **Offline: precache CPR.** CPR must work the first time, without a network, in an emergency, so a live CPR
  animation's JSON and pictures are precached (`tools/build.py`, the default `"offline": "precache"`); this is the same
  as the SVG files today. Other, non-urgent picture-step animations can use `"offline": "pack"`. The service worker
  then keeps each picture in `fhb-steps-v1` the first time it is shown, and they could later join the matching audio
  pack's download (`startDownloads()` in `js/app.js`). Audio stays on demand because it is many megabytes per voice.
  The pictures are one set for every language and voice, and CPR's set is small, so precaching it is the better
  trade.
- **Speed:** the demo runs at 60 fps at 320 and 412 px with the CPU slowed 4 times (Playwright's Chromium,
  `tools/test_steps_browser.mjs`). Each moving layer and overlay is its own composited element. Counters change their
  text a few times a second, and nothing else touches the page while a scene plays.
- **Old phones (Chrome 69):** the player does not use `??`, `?.`, CSS `inset`, `aspect-ratio`, `Animation.finished` or
  `getAnimations()`. Web Animations with `startTime`, `pause` and `currentTime` have been in Chrome since version 39.

## Demo

`/home/claude/steps-demo/demo/` is a publish-ready folder: `index.html`, the player, Mo's first ChatGPT frame and a
grey-box test animation. It shows the live baby CPR (all 7 scenes, the same JSON as the app; s3, s5 and s6: look at
the chest for 10 s with a timer; where the thumbs go, with a dotted nipple line, a ring and an arrow, then the hands
fading in; 3 slow pushes, then 110 a minute to 30, with the press shadow and the chest darkening), the grey-box test
of every motion and overlay, and the picker. It is marked **"Approved by Mo 7 Oct (demo version)"**. `?lang=ps&a=cpr-baby&s=1&still=1&fps=1`
opens a language, animation, scene, still mode and the fps meter. In the console, `__demo.ctl` is the player.

## Testing

```sh
node tools/test_steps.mjs                                        # arithmetic: camera, timing, beats, digits
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=$(npm root -g) node tools/test_steps_browser.mjs   # grey boxes
```

Without `--root`, the browser test builds its own grey-box animation through `tools/steps_images.py` (no real pictures
needed). It checks, in fa, ps and en at 320 and 412 px:
- no console errors, RTL and Persian digits;
- the counter badge on the reading-direction side, and no flipped pictures;
- no sideways scrolling;
- Previous, Again, Next and the dots;
- auto-advance waiting for the count;
- reduced motion (nothing moving, every overlay shown);
- fps with the CPU slowed 4 times.

In a page, the mounted scene object has `seek(ms)` and `resume()` for screenshots of an exact moment.

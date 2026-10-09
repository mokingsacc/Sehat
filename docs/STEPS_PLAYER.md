# Picture steps: approved still pictures, brought to life

The picture-step player turns **still illustrations** (Mo's ChatGPT pictures, delivered as layers) into short narrated
animations: gentle camera moves, drawn arrows and rings, counters, and the rescuer's hands moving on their own layer.
Only CSS transforms and opacity are animated (the Web Animations API, composited), so it stays smooth on old Android
phones. It uses no canvas, no video and no libraries, and it works offline.

- Player: `js/steps.js`, about 30 KB raw. It loads only when a picture-step animation opens.
- One animation: `anim/steps/<name>.json` (the scenes) and `img/steps/<name>/*.webp` (the pictures).
- Pictures in: `tools/steps_images.py` (PNG layers to small WebP layers, and the JSON's frames).
- Tests: `node tools/test_steps.mjs` (arithmetic), `tools/test_steps_browser.mjs` (Playwright: fa / ps / en,
  320 and 412 px, RTL, digits, reduced motion, fps with the CPU slowed 4x) and `tools/test_ondemand.mjs` (where the
  pictures live: precache or on-demand, offline before the download, cut-off downloads).
- Where the pictures live (in the APK or downloaded when first needed) is chosen automatically from the animation's
  group: see "Where the pictures live" below.

**Nothing goes live until Mo approves the pictures.** A picture-step animation plays in the app only when its
name is in `STEPS` in `js/anim.js` **and** its JSON has an `"approved"` note (tools/validate.py refuses a live
animation without one). Until then the app keeps playing the SVG version.

**Live now:** `cpr-baby` (approved by Mo on 7 Oct 2026, demo version). All 7 narrated scenes come from Mo's one
frame: s3, s5 and s6 as he approved them; s1 (ring on the feet, tap and call lines), s2 (zoom out, the call for help,
car and hospital icons), s4 (face and chest, breath lines beside the head, 1–5 breath counter, the chest lighting up
with each breath) and s7 (a call for help, pushes with a 1-minute clock, then the way to the hospital) are made with
camera moves and overlays. Frame `kneel` is the rescuer's body layer without her arms. Since 9 Oct 2026, s4 uses
Mo's original CPR step 2 picture (frame `breath`: mouth over the baby's mouth and nose, chin lifted), with the
chest lighting up on each of the 5 breaths. The newborn, child and adult CPR keep their cine / SVG versions.

## Mo's illustration delivery (9 Oct 2026): 32 more sets, not live yet

Source: `/mnt/project-files/samangan-red-book/illustrations-2026-10-09/` (1200 px WebP layers: 31 sets in
`medical-illustrations/`, `original-cpr/` steps 1 to 7, `choking-01/`, symptom pictures 34 to 36). Every set has its
JSON and pictures in the repo, with scenes, and **none is in `STEPS`** (only `cpr-baby` plays in the app). The
demo gallery that plays them all is `/mnt/project-files/samangan-red-book/previews/animations-2026-10-09/index.html`.

- **Packed small:** `python3 tools/steps_images.py <folder> --anim <name> --px 800 --max-kb 30 --qmax 72 --patch`.
  Pictures are 800x600 (coordinates stay 960x720), a moving whole picture's `-down` version is a small patch over
  its `-up` version, frames that are mostly the same picture share it plus a `<layer>-fix` patch, and repeated files
  are written once. A delivery file `<name>-<n>-up` / `-down` (a whole picture) is staged as `<n>-full-up` /
  `-full-down`. A patch swap needs `"hide": false` (written for you in these sets).
- **Narration:** the scenes use the topic page's own narration ids (for example `choking-baby.back`), and `id` is the
  topic id, so the title is the page's title: nothing new to record or translate. The CPR sets use
  `anim.cpr-<age>.s1` to `s7`. Scene id per set: choking-baby (`choking-baby.*`), choking-adult (`choking.*`),
  recovery-position (`unconscious.*`), bleeding-press and bleeding-tourniquet (`bleeding.*`), burns-cool, drowning-rescue,
  seizure (`seizures.*`), fever-fit, spine-hold and splint-sling (`falls-fractures.*`), snake-bite
  (`snake-scorpion.*`), electric-stick (`electric-shock.*`), allergy-position (`allergy-severe.*`), breath-count
  (`cough.watch`, `cough.urgent.chest`), newborn-warm, breastfeed-attach, muac (`kit-muac.*`), inhaler-spacer
  (`asthma-attack.*`), nosebleed, eye-wash (`eye-chemical.*`), thermometer (`kit-thermometer.*`), heat-cooling
  (`heat-stroke.*`), cold-warming (`cold-hypothermia.*`), bp-measure (`kit-bp.*`), weigh-child (`ui.gr.m.hang`,
  `kit-scale.hold`), length-height (`ui.gr.m.length*`, `ui.gr.m.height`), glucometer (`kit-glucometer.*`),
  low-sugar-drink (`low-sugar.*`).
- **To go live** (after Mo's approval): add the name to `STEPS`, the `"approved"` note, and an `anim` block on the
  topic. The tools accept a set that reads its page's lines (nothing new to record): `tools/validate.py` takes a
  scene id that is `anim.<name>.s<n>` or a spoken line of the book (a topic block or ui `say` line), and an `id` that
  is `anim.<name>` or a topic id (the title is then `<topic>.title`, `title_id()` in `tools/anims.py`).
  `needed_ids()` lists those lines (they must exist), `block_ids()` brings only the animation's own `anim.*` lines to
  a page's recording order (the page lines stay with their page, never recorded twice), and the app's poster title
  is that same title id (`book.anims.ids`; "Listen to the page" does not read the page title twice). A live set's
  approved note must be Mo's: an empty one, or one starting with `PENDING`, is an error, as is a live set with a
  `held` note.
- **Ready to go live: branch `golive-emergency`** (not merged). It adds every Emergency and CPR set except the held
  bleeding-tourniquet to `STEPS` (23 sets with cpr-baby's 24), each with `"approved": "PENDING Mo's approval"` and,
  for the sets that read a page's lines, an `anim` block placed just above the first step it shows (block id
  `<topic>.anim-<name>`; spine-hold and splint-sling both on falls-fractures). After Mo approves the demo: replace each
  `PENDING ...` with Mo's note, run `tools/validate.py` (0 errors) and `tools/build.py`, and merge.
- **Notes in the JSON:** `_note` (where the pictures came from and what was left out), `_check` (points for Mo's
  medical check), `held` (bleeding-tourniquet: "held: Mo's tourniquet call pending").
- **Not used, they look medically wrong:** cpr-child frame 4 (hand too high, on the upper chest), muac frame 1 (the
  right arm; its picture stays only as the base of frame 2), drowning-rescue frame 4 (the whole body turned, the app
  says the head), breastfeed-attach frames 2 and 3 (hard-to-read mouth diagrams). Pictures the delivery uses
  twice: newborn-warm frame 2 is also cpr-newborn frame 6 and cold-warming frame 4, and recovery-position frame 4 is
  also low-sugar-drink frame 3 (each set keeps its own copy, about 30 kB); `choking-01` is choking-baby frame 1.
- **APK budget** (MB = 1,000,000 bytes). **Mo 9 Oct: all Emergency sets in the APK.** The APK of release
  v2026.10.09-9f5275 is 8.72 MB. The 23 new Emergency and CPR sets (all but the held bleeding-tourniquet) add
  2.82 MB of pictures and 0.09 MB of JSON, so the APK is about 11.6 MB once they are live; `img/` inside the APK is
  then about 3.9 MB. `tools/validate.py` warns above 4.5 MB of pictures (`APK_PICTURES_MB`: an APK of about 12.2 MB);
  15 MB is the hard limit. The 8 other sets (0.67 MB: bp-measure, breastfeed-attach, breath-count, glucometer,
  length-height, muac, thermometer, weigh-child) stay on demand, as their topics are not in the Emergency group.

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
working, or a topic page's own lines (`choking-baby.back`, `unconscious.roll`; the set's `id` is then the topic id). A picture-step version may use some of the SVG version's ids. For example, a demo can use only
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
   `python3 tools/build.py`. An Emergency or CPR animation's JSON and pictures are now precached and inside the APK;
   any other animation's set downloads the first time its page is opened ("Where the pictures live"). The topic's existing
   `anim` block (for example `cpr` with `pick: cpr-baby`) plays the new version; nothing else changes. Give every
   `anim.<name>.*` scene id narration in `content/src/anims.json`; a scene that reads a page line needs nothing new.

## Data format: `anim/steps/<name>.json`

```json
{
 "v": 1,
 "id": "anim.cpr-baby",
 "w": 960, "h": 720,
 "adult": true,
 "approved": "",
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

- `id`: the narration prefix (`anim.<name>.title` is the title), or the topic id of a set that reads its page's lines
  (`<topic>.title` is the title). `w`, `h`: the picture size all coordinates refer to.
- `adult`: the teal look (all CPR). `approved`: Mo's approval note, needed to go live. `poster`: the scene used for
  posters and picker cards.
- There is no `offline` field any more: where the pictures live is chosen by `tools/build.py` from the animation's
  group ("Where the pictures live"); `tools/validate.py` warns that a hand-set `offline` is ignored.
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
- **Where they live:** see the next section. In short, Emergency and CPR sets are in the APK and precached; every
  other set downloads the first time its page is opened.
- **Speed:** the demo runs at 60 fps at 320 and 412 px with the CPU slowed 4 times (Playwright's Chromium,
  `tools/test_steps_browser.mjs`). Each moving layer and overlay is its own composited element. Counters change their
  text a few times a second, and nothing else touches the page while a scene plays.
- **Old phones (Chrome 69):** the player does not use `??`, `?.`, CSS `inset`, `aspect-ratio`, `Animation.finished` or
  `getAnimations()`. Web Animations with `startTime`, `pause` and `currentTime` have been in Chrome since version 39.

## Where the pictures live (Mo, 9 Oct 2026)

Mo 9 Oct: all Emergency sets in the APK. The APK is 8.7 MB on 9 Oct 2026 and about 11.6 MB once they are live; it must
stay under 15 MB. So pictures are split by what they are for, automatically:

| | what | where |
| --- | --- | --- |
| **precache** | the symptom tiles (`img/symptoms/`), and the picture-step sets of the **Emergency and CPR animations** | inside the APK; precached by the website's service worker at the first open; work offline at once |
| **on-demand** | every other picture-step set | not in the APK, not precached: downloaded the first time its page is opened, then kept on the phone |

**Which animations are "Emergency and CPR"** (`emergency_anims()` in `tools/anims.py`): every animation an `anim`
block can play (a group such as `cpr` brings all its ages) on the topics of the Emergency section
(`sections.json` `emergency`), on the topics, CPR pages and films of the Emergency cards (`config.json` `emergency`),
and on every CPR, choking and newborn topic. A new animation on one of those pages is precached by itself; a new one
anywhere else is on-demand by itself. Nobody sets this by hand (a leftover `"offline"` in a JSON is ignored, with a
warning). Today: `cpr` and its four ages, and `nappies` (the newborn page) are precached; `cpr-baby` is the only live
picture-step set.

**How** (nothing to do by hand):
- `tools/build.py` writes `book.steps`: for each live set, `offline` (`precache` or `on-demand`), `files` (the JSON and
  pictures, each with `?v=` = its content hash), `bytes` and `fallback` (whether an SVG version `anim/<name>.js`
  exists). Only precache sets go into the service worker's precache list. It prints a line such as
  `pictures in the APK (and precached): 0.95 MB, of which symptom tiles ... ; on demand (not in the APK): ...`.
- `android/sync-web.sh` keeps only precache sets in the APK (`img/steps/<name>/`, `anim/steps/<name>.json`).
- `js/anim.js` (`stepsSetup(book.steps)` from `js/app.js`): an on-demand set is its JSON (the `?v=` in
  `book.steps`) **plus every picture that JSON names** (each with its own `?v=`). Every file is checked against its
  `?v=` (sha1, first 8 hex digits) before it is kept, so a website that is newer or older than the phone's book (or
  is half-way through a deploy) never mixes versions: the set is simply not complete, and the SVG version plays. A
  phone whose app is older than the website's set therefore waits for the app update to get the new pictures.
- It plays only when **every one of its files** is in the phone's `fhb-steps-v1` cache; its pictures then play from
  there as `blob:` URLs, so it needs neither the network nor the service worker. Otherwise the SVG version plays at
  once (poster and player): nothing waits for the network and no box is ever blank.
- **When it downloads:** the first time a page shows the animation's poster, by itself **only on Wi-Fi or a cable
  with data saver off** (`onWifi()` in `js/anim.js`; a phone that does not say, with no `navigator.connection` or no
  `type`, as iPhones and computers, counts as not Wi-Fi), checked again before each file; and on any connection when
  the person opens the animation (that first play is the SVG version; the pictures are there next time). The voice
  packs use the same `onWifi()` rule. One file at a time; a file is given up when **nothing arrives for 30 s** (each
  piece of it resets the clock, so a slow line still finishes; this works without `AbortController` too). Files that
  arrived stay and are not fetched again, so a cut-off download carries on quietly the next time the page opens; a
  half set never plays. A full phone (`QuotaExceededError`) stops the page-started downloads until the app is opened
  again.
- When a set is complete the posters on the screen cross-fade to the picture-step poster (decoded first). Posters
  sit in a box of fixed shape (3:2 on topic pages, 4:3 on the Emergency cards; the box's height comes from a
  `::before`, not `aspect-ratio`, for old phones) and a picture-step poster covers it like `object-fit: cover`
  (`coverPoster()` in `js/app.js`), so nothing moves.
- **Updates:** a new version (new `?v=`) downloads beside the old one; the old one keeps playing until the new one is
  complete, then its files are removed. A few seconds after the start, files of sets that are no longer on-demand
  leave the phone (every version of a current on-demand set stays until then).
- **Inside the Android app** the files come from the website (`config.appUrl`), as the narration does.
- An on-demand set with **no SVG version** is left off its page (an empty marker stays) until it is on the phone; then
  the block appears in place. `tools/validate.py` warns about such a set.
- `tools/build.py` stops when a set's JSON names a picture that is missing; `android/sync-web.sh` stops when `sw.js`
  precaches a file that is not in the APK. `tools/validate.py` checks that every picture's `v` is its sha1[:8],
  recomputes `book.steps` and compares it with `content/book.json`, checks that `sw.js` precaches every precache
  set and nothing of an on-demand one, runs the APK filter (`prune_apk()` in `tools/anims.py`, the one
  `android/sync-web.sh` uses; it also drops any file in a kept set's folder that its JSON does not name, so a held or
  unused picture never ships) on a copy of the picture-step folders, rejects CSS `inset`, and warns when the APK's
  pictures pass 4.5 MB (`APK_PICTURES_MB`).
- Test: `tools/test_ondemand.mjs`: a grey-box on-demand set on the hygiene page and a not-live folder. Not precached,
  not in the APK; SVG offline before the download; a cut-off download never plays and kept files are not fetched
  again; the poster cross-fades and fills its box; the picture steps play, offline too; an update keeps the old set
  playing until the new one is complete; a website JSON of another version is refused; a stalled file is given up
  (also with no `AbortController`) while a slow but steady one finishes; on mobile data, with no
  `navigator.connection` and with data saver the page alone downloads nothing; a set with no SVG version appears
  once downloaded.

Rough sizes: a symptom tile is about 25 KB (36 tiles: about 0.9 MB); a CPR age is 0.3 to 0.6 MB of picture steps.

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
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=$(npm root -g) node tools/test_ondemand.mjs        # where pictures live
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

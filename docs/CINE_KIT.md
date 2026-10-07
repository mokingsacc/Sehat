# Cine kit: professionally animated scenes in the app's own style

The cine kit (`js/cine/`) makes the CPR animations (and later others) move like a well-made animated film while
looking exactly like the rest of Sehat: the same flat pictures, palette, mud-brick rooms, red carpets and faceless
people as `img/` and the SVG animations. It is plain SVG driven by a small JavaScript rig: no libraries, no video,
no WebGL, fully offline. Mo's bar: the craft and polish of a professional animation, especially for the hands.

- Kit: `js/cine/*.js` (about 120 KB raw, 37 KB gzipped; loaded only when a cine version opens, never in the app shell).
- A version: `anim/cine/<name>.js`, e.g. `anim/cine/cpr-adult.js` (the pilot and reference).
- Preview: `anim/cine-demo.html?lang=fa&a=cpr-adult&s=5` (language, version, scene); add `&still=1` for reduced
  motion, `&cinefps` to show the frame rate, `&auto=0` to stop auto-advance.
- Test tool: `anim/cine/shots.cjs` (frames, strips, a contact sheet, fps under CPU throttling).

## 1. How it plugs into the player

`js/anim.js` has a small hook. `CINE` lists the names that may have a cine version (all four CPR versions are
already listed, so **you do not need to edit js/anim.js**). When the player opens `cpr-baby` it first tries
`anim/cine/cpr-baby.js`; if that file is missing or throws, the SVG version `anim/cpr-baby.js` plays as before.
`opts.cine === false` forces the SVG version.

A cine module's default export is made by `cine({...})` and has `cine: true`, `id`, `scenes: [{id, ms}]`,
`mount(stage, {lang, still})` returning `{show(i), destroy()}`, and `poster(i)`. The player keeps doing everything
else: title, narration text, speaker buttons, dots, Previous / Again / Next, swipe (RTL: swipe right for next),
keys, auto-advance when the narration ends. `animPoster('cpr-baby', 0)` (picker cards) returns the cine poster.

Scene ids **must stay** `anim.<name>.s1 ...` so recordings and translations keep working. You may add scenes at
the end (e.g. `anim.cpr-adult.s8`); add their lines in all three languages to
`content/drafts/anim-narration.json` and list them in `_review` as needing native and clinical review.

## 2. A version, step by step

```js
// anim/cine/cpr-child.js
import { cine, person, personEnd, kneelOver, sets, fx, seg, win, phase, EASE } from '../../js/cine/index.js';

const CHILD = { kind: 'child', top: '#C98B3A', trousers: '#7A6A58' };
const MOTHER = { kind: 'woman' };

export default cine({
  id: 'anim.cpr-child', adult: false,            // adult: true gives the teal player (all CPR uses teal)
  build(K) {                                      // once: plates (views), people, markers
    K.plate('yard', { bg: sets.courtyard(K, {}) });
    const child = K.add(person({ ...CHILD, view: 'side' }), 'yard', 'mid');
    const mum = K.add(person({ ...MOTHER, view: 'front', layers: { handR: 'front', handL: 'front' } }), 'yard', 'back');
    const spot = K.add(fx.target(K, { r: 2.6 }), 'yard', 'top');
    const count = K.hud(fx.counter(K));
    return { child, mum, spot, count };           // "A" in every scene
  },
  scenes: [
    { id: 'anim.cpr-child.s1', dur: 7, loop: [4, 7], still: 5,
      shots: [{ t: 0, plate: 'yard', cam: [0, -60, 1.0], to: [-10, -40, 1.6] },
              { t: 4, plate: 'yard', cam: [-30, -25, 3.5], dip: 0.3 }],
      play(t, A, K) {                             // every frame: a pure function of t
        A.child.set(['lie', { x: 0 }]);
        A.mum.track(MUM_S1, t);                   // keyframed poses
        A.spot.set({ x: -20, y: -16, o: win(t, 4.5, 99) });
        A.count.o = 0;
      } },
  ],
});
const MUM_S1 = [[0, 'stand'], [1.6, ['kneel', { head: 'f1' }], 'io'], [3, ['kneel', { uarmR: 30 }]]];
```

Checklist for a new version:
1. Copy `anim/cine/cpr-adult.js`, rename, keep the scene ids of `docs/ANIMATIONS.md` for your version.
2. Build the plates (views) you need, then the people, then markers.
3. Write each scene: a shot list and `play(t, A, K)`.
4. Run `shots.cjs`, look at every frame next to the SVG version and the topic pictures, fix, repeat.
5. Check reduced motion (`&still=1`): every scene's `still` time must tell the whole step on its own.
6. Check fps under 4x CPU throttling (below).

## 3. Concepts and units

- **World units are centimetres**, y points down, the floor where people kneel is y = 0 on most plates. An adult man
  is 172 cm, so a hand is 19 cm and a 5 to 6 cm compression is literally 5 to 6 units. This keeps anatomy honest.
- **Plates** are views of the world: the room from the side, the chest from above, the hands close up. Each has its
  own camera `[x, y, zoom]` (the world point at the picture centre, picture pixels per cm; the picture is 360 x 240).
  A cut can change plate; a cross-dissolve shows two plates for a moment.
- **Layers** inside a plate, back to front: `bg, back, mid, front, top`. A rig can spread its parts over layers
  (e.g. the rescuer's body behind the patient, his arms in front: `layers: {handR: 'front', ...}`).
- **The HUD** sits on the picture, not in the world (counters, gauge, stopwatch). It is not moved by the camera.
- **Everything is a pure function of time.** `play(t, A, K)` must set every pose and marker from `t` alone (no
  state carried between frames). That is what makes Again, stills, posters and seeking exact.
- **Scene timing.** `dur` = length of the action (aim for a bit shorter than the narration line); then the scene
  loops `loop: [a, b]` until the narration ends and the player moves on. Make the loop seamless (same pose and camera
  at a and b). `still` = the moment that best tells the step (reduced motion and posters). `ms` (optional) = the
  timer used when there is no narration (default `dur * 1000`).

## 4. API

### cine(def) — `js/cine/stage.js`
`def = { id, adult, css?, build(K) -> A, scenes: [scene] }`

`scene = { id, dur, loop: [a, b], still, poster?, ms?, vignette? (0..1, default 1), shots: [shot], play(t, A, K) }`

`shot = { t, plate, cam: [x, y, zoom], to?: [x, y, zoom], move?: [t0, t1], ease?, fade?: s, dip?: s, drift?: 0..1 }`
- A shot runs from its `t` to the next shot's `t`. `to` makes a slow camera move (push-in, pan) over the shot, or over
  `move` (seconds into the shot). `ease` default `'sine'`.
- `fade: 0.5` cross-dissolves from the previous shot (only between different plates). `dip: 0.3` fades through the
  warm white around the cut (use it for a cut within the same plate when a hard cut feels jumpy).
- `drift` is a tiny hand-held breathing of the camera (default 0.5; 0 for a locked-off shot).

### K, the stage (inside build and play)
| | |
| --- | --- |
| `K.plate(name, {bg, fg, fill, layers})` | a view; `bg`/`fg` static SVG strings (sets), `fill` a flat backdrop colour |
| `K.add(item, plate, layer)` | put a rig or sprite on a plate; returns it |
| `K.sprite(plate, layer, svg, {x,y,r,s,o})` | a static SVG thing you move (a prop, a cloth, a car) |
| `K.hud(sprite)`, `K.hudSprite(svg)` | picture-space overlay |
| `K.id('name')`, `K.addDefs(svg)` | unique ids for gradients (several stages can share a page) |
| `K.lang`, `K.rtl`, `K.digits(n)` | 'fa' / 'ps' / 'en'; RTL; Persian digits for fa and ps |
| `K.toScreen(plate, x, y)` | picture position of a world point (to pin a HUD item to something) |
| `K.t`, `K.T` | scene time (looped) and time since the scene began (for steady pulses) |
| `K.still`, `K.low` | reduced motion; low-power mode (set by the player when frames are slow; dust is off) |
| `K.shot` | the current shot (plate, cam) |

Sprites have `x, y, r (deg), s, sx, sy, o` and some have `value` (counter, gauge, dots, timer) or `text`.

### Rig — `js/cine/rig.js`
A rig is a set of parts on named joints. Positive angles turn clockwise on screen. A limb's bone runs down its
local +y axis, so **0 = hanging straight down**; for a person facing +x (right), a negative thigh or arm angle swings
it forward, a positive pelvis or chest angle leans the body forward, a positive head angle bows the head.

| | |
| --- | --- |
| `rig.set(pose)` | apply a pose: a name, an object, or an array merged left to right: `['kneel', {head: 10, handR: 'open'}]` |
| `rig.track(keys, t)` | keyframes `[[t, pose, ease], ...]`; ease belongs to the segment ending at that key (`'io'` default) |
| `rig.blend(a, b, k)` | mix two poses |
| `rig.add({part: dAngle})` | add on top (breathing, sway, taps) after `set`/`track` |
| `rig.reach(upper, lower, [x, y], {bend, hand: [handPart, worldAngle, [px, py]]})` | 2-bone IK; with `hand` the hand turns so its fingers point along worldAngle (0 = right, 90 = down, 180 = left) and its local point (px, py) lands on the target (the heel of the hand is about `[-3.2, 1.6]` in the side view) |
| `rig.aim(part, worldAngle)` | turn one part to a world direction |
| `rig.world(part, x, y)`, `rig.dir(part)` | world position of a local point; world direction of a part (call after `set`) |
| `rig.root` | `{x, y, r, s, flip, o}`: place, turn, scale, mirror (`flip: -1` faces left), fade the whole person |

Pose objects: `{ x, y, r, s, flip, o, <part>: angle | 'variant' | {r, x, y, sx, sy, o, v} }`. `v` picks a drawing
variant (hand shapes, head turns). `sx, sy` scale a part's drawing about its scale origin without scaling its
children (used to squash the chest in a compression). `o` fades a part.

### People — `js/cine/people.js`, `front.js`, `hands.js`, `hands2.js`
`person({ kind, view, name, layers, ...look })`
- `kind`: `man` (172 cm), `woman` (160), `child` (about 7 years, 122), `baby` (about 6 months, 67), `newborn` (50).
- `view`: `side` (profile, facing +x), `front` (facing the camera), `top` (lying on the back seen from above, head to
  the left; it is the front rig turned with `r: -90`).
- look: `skin, hair, beard, hat ('pakol' | 'cap' | 'turban' | 'chador' | null), top, vest, trousers, chador, feet
  ('bare' | 'shoes'), capColor, turbanColor`. Defaults per kind follow docs/ART_SPEC.md (men: perahan tunban,
  waistcoat, pakol, beard; women: long dress and a chador over hair and shoulders).
- `personEnd({...look})`: a person lying on their back **seen from the feet** (camera a little above): the view for
  side-on compression shots, with the rescuer in profile beside the chest. Parts `legs, pelvis, torso, chest, head,
  armR, armL`; `rig.spec.sternum` is the compression point; push the chest with `{chest: {y: depthCm * 0.87}}`.
  (Adult and child proportions; a baby side-on view still needs drawing.)
- `kneelOver(rig, {knee: [x, y], shoulder: [x, y], bend})`: puts a kneeling side-view person's shoulders on a point
  (straight above the hands) by hinging at the knees and hips: this is the CPR rock. Then `reach()` the arms.

Parts, side view: `pelvis` (root, the hip joint), `skF skB` (kameez skirt panels; they follow the thighs and hang by
themselves), `thighN thighF shinN shinF footN footF`, `chest`, `neck`, `head`, `uarmN farmN handN`, `uarmF farmF
handF`, `chadorB` (woman). N = near the camera, F = far.
Poses, side: `stand, kneel, kneelLean, sitHeels, lie` (on the back: use as is, head to the left), `callHelp`.

Parts, front/top view: `pelvis, skirt, thighR/L, shinR/L, footR/L, chest, neck, head, uarmR/L, farmR/L, handR/L,
chadorF` (R = the person's right = screen left in the front view). Head variants turn the head: `f-2` (profile,
looking to screen left), `f-1`, `f0` (front), `f1`, `f2`. Poses: `stand, kneel` (behind something; shins hidden),
`supine` (top view).

Hand variants (set as `handN: 'heel'` etc.):
- side view: `rest, flat, heel` (CPR lower hand: heel down, fingers straight and lifted), `stack` (CPR upper hand,
  fingers curled down between the lower hand's fingers), `chin` (two fingers), `pinch`, `open`, `point`, `grip`.
- front/top view: `rest, back` (back of the hand, fingers together), `spread`, `lock` (upper CPR hand from above,
  fingers between the lower hand's), `open, point, grip`.
- New shapes: describe a hand with `drawHand({palm, i, m, r, p, t, order}, k, colour, shade)`: each finger is
  `{x, y, a: [3 angles], f: [3 foreshortenings], L: [3 lengths]}`. Pass extra variants to `handSide(len, c, cD, side,
  {myShape})` or `handFront(...)`. Baby thumbs-around-the-chest, newborn rubbing etc. belong here.

`PAL` (palette) and `BODY` (proportions) are exported; override `body: {...}` per person if needed.

### Sets — `js/cine/sets.js` (`import { sets } from '../../js/cine/index.js'`)
`room(K, {wallY, window, door, niche, toshak, tray, carpet, beams})`, `courtyard(K, {wallY, gate, tree})`,
`floorTop(K, {carpet})` (the floor from above), and the pieces: `carpet(K, {x0, x1, y0, y1, top, guls})`,
`windowView`, `door(K, {x, w, h, floorY, open})`, `niche`, `toshak`, `teaTray`, `beam(K, {from, to, w0, w1, o})`
(a soft window light), `shadow(x, y, rx)`. Colours in `SET`. All return SVG strings in world units.

### Markers and effects — `js/cine/fx.js` (`fx.*`)
| | |
| --- | --- |
| `target(K, {r, color})` | the place to push: a glowing ring with a dot, pulsing |
| `glow(K, {r, color})` | a soft glow (heel of the hand, fingertips under the chin) |
| `arrow(K, {len, w, color})` | a chunky arrow along +y (turn with `r`) |
| `arcArrow(K, {rr, a0, a1})` | a curved arrow (head tilt, roll) |
| `dots(K, {n})` | breaths given; `.value` = how many filled (fractions animate) |
| `counter(K, {max})` | HUD count 1 ... 30 with a ring; `.value` |
| `gauge(K, {h, band: [5, 6]})` | HUD depth gauge in cm with the right band green; `.value` = depth now |
| `timer(K)` | stopwatch; `.value` 0..1 of a sweep (10 seconds, 2 minutes) |
| `shout(K)` | ripples at the mouth side of a head |
| `lookLine(K)` | dotted look line; `.ends = [x0, y0, x1, y1]` |
| `carBubble(K)`, `tick(K)`, `heart(K, {rate})`, `slow(K)` (tortoise: slow motion), `swap(K)` (take turns), `dust(K, {box, n})` | |

### Helpers — `js/cine/core.js`
`seg(t, t0, t1, ease)` eased 0..1; `win(t, t0, t1, fadeIn, fadeOut)` an on/off envelope; `wave(t, period)`;
`phase(t, period)`; `key(list, t)`; `mix(a, b, k)`; `EASE` (`lin in out io sine in2 out2 io2 back step hold push`;
`push` = a compression: down and back up in one cycle); `rnd(i)`; `shade(hex, k)`; `smooth(points)` (a smooth closed
path); `limb(len, w0, w1)`; `P C EL R G` (SVG strings); `digits(n, lang)`.

## 5. Art rules (non-negotiable)

- **The app's style, not a new one.** Flat vector shapes, 2 to 3 tones per object, flat shadows, no outlines (or
  thin dark ones), no painterly texture, no heavy glow. Compare every frame with `img/topics/*.svg`, `img/pics/*.svg`
  and the SVG animations; it must look like the same artist, only better drawn and moving.
- **Faces are blank.** No eyes, nose or mouth, ever, on anyone, in any view. Beards and hair are fine.
- **Palette** from docs/ART_SPEC.md (`PAL`, `SET`). Light comes from the left: shade on the right / back side.
- **Culture.** Rural Samangan: mud-brick room with a red carpet and toshak, or a courtyard with a tree and the hills.
  Men in perahan tunban with waistcoat and pakol (or turban/cap); women in a long dress with a chador covering hair
  and shoulders; modesty always (the chest is never bared; mark the place on the clothes).
- **Teaching markers**: red `#B6322D` for where and how hard to push (ring, arrows, count), teal `#1F6F7A` for
  instruments and looking (look line, stopwatch, dots, the arms-straight guide), green `#2E7D4F` for "good" (tick,
  depth band, normal breathing). No words or letters in pictures; numbers only in the counter and gauge.
- **Anatomy is the point.** Hands and arms must be right in every close-up: where the heel of the hand sits, which
  fingers touch, wrist angle, elbows locked, shoulders over the hands. Use the cm units: a newborn chest is about
  10 cm wide, an adult's about 35.
- **Calm and dignified**: never scary, no injury, a slow, steady pace.

## 6. What every CPR version must show (Mo)

"You should show the hand positioning and everything in the CPR videos." Every physical step gets a **dedicated
close-up**, first in **slow motion**, then at full speed, with markers that need no reading (a glow on the place, an
arrow, a count of 1 to 30, a depth gauge).

- **Adult** (the pilot, `anim/cine/cpr-adult.js`): finding the spot (centre of the chest, lower half of the
  breastbone, between the nipples, a glowing marker); heel of one hand on it; the other hand on top; fingers
  interlocked and lifted off the ribs; shoulders straight above the hands, arms straight, elbows locked, pushing from
  the hips (side-on); depth gauge 5 to 6 cm and full recoil (the chest comes back up); airway: one hand on the
  forehead tilting the head back, two fingers lifting the chin, then the look-listen-feel position for up to 10 s;
  breaths: pinch the nose, seal the mouth, watch the chest rise; recovery position if they start breathing normally.
- **Child** (1 year to puberty): one hand (heel of the hand on the lower half of the breastbone, the other hand on
  the forehead), about 5 cm (a third of the chest depth), 100 to 120 a minute; head tilt and chin lift; 5 rescue
  breaths first with the nose pinched and the mouth sealed; then 30 and 2.
- **Baby** (under 1 year): head in the **neutral** position (not tilted back, the face looking straight up; a small
  chin lift); mouth **and nose** sealed by the rescuer's mouth; 5 gentle breaths; compressions with **two thumbs**
  side by side on the lower half of the breastbone, the hands encircling the chest (this matches the narration line
  `anim.cpr-baby.s5`), about 4 cm (a third of the chest depth), 100 to 120 a minute; then 30 and 2 (lay rescuer).
- **Newborn**: dry and rub the whole body (and the back, the soles) with a cloth, keep warm; head in the neutral
  position (the face looking straight up, not tilted back); clear the mouth then the nose only if
  needed; breaths over the mouth and nose, small puffs about 40 a minute (one every 1 to 2 seconds), watching the chest
  rise; skin to skin on the mother afterwards.

Use the narration lines in `content/drafts/anim-narration.json` and the scene tables in `docs/ANIMATIONS.md`; each
scene's picture should show what its line says, at the moment it says it.

## 7. Performance checklist (cheap Android phones)

- Animate only transforms and opacity (the kit does this: it writes `transform`/`opacity` and only when changed).
- No SVG filters, no blur, no masks; gradients only for glows, the window light, the sky and the vignette.
- Hide what is off-shot: use plates (only the visible plate is drawn) and `o: 0` for people not in the shot.
- Keep part counts sensible: each person is about 25 parts; three people plus markers is fine.
- Particles: `fx.dust` at most about 16 motes; it switches itself off in low-power mode.
- The player drops to 30 fps and low power by itself if frames take more than 45 ms; aim never to trigger it.
- Size: keep a version under about 80 KB raw (draw with the kit's helpers; no embedded images).
- Measure: `node anim/cine/shots.cjs --anim <name> --fps --throttle 4` (target 30 to 60 fps at 4x CPU throttling).

## 8. Testing

```sh
cd <app> && python3 -m http.server 8123 &
NODE_PATH=$(npm root -g) node anim/cine/shots.cjs --anim cpr-adult --lang fa --out /tmp/shots --frames 6
NODE_PATH=$(npm root -g) node anim/cine/shots.cjs --anim cpr-adult --scene 5 --times 0,0.5,1,2.5 --out /tmp/shots
NODE_PATH=$(npm root -g) node anim/cine/shots.cjs --anim cpr-adult --fps --throttle 4 --frames 2
```
In the browser: `anim/cine-demo.html?lang=en&a=cpr-adult&s=4&auto=0`, then in the console `__cine.pause();
__cine.seek(2.5)` to look at one moment. Check: every scene in fa, ps and en (digits, RTL HUD), `&still=1`, swipe,
Again, Next on the last scene, the picker card (`animPoster`), and that `?cine=0`-style fallback still plays the SVG
version (`openAnimation('cpr', {cine: false, pick: 'cpr-adult'})`).

Look at your frames **next to** the SVG version and the topic pictures. Check hands at the largest close-up. Ask:
is it clearly the same family of pictures? Is every step understandable with the sound off?

## 9. Files and coordination

- Yours: `anim/cine/<name>.js`, new hand shapes or people drawings (add them to the kit in a backwards-compatible way:
  new variants, new options; never change what an existing name does), new narration lines in the draft JSON.
- Do not edit `js/anim.js` (the hook is in place for all four CPR versions) or `app.js`, `content/src`, `server`.
- Offline: `tools/build.py` must precache `js/cine/*.js` and `anim/cine/*.js` (its globs do not look into
  sub-folders); this is noted for the integration step.

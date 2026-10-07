# Explainer animations

Short narrated picture stories, made of hand-written SVG and CSS (transform and opacity keyframes) with a tiny player. No video, GIF, Lottie or libraries; everything works offline. Preview them in `anim/demo.html`, for example `anim/demo.html?lang=ps&a=cpr-baby&s=5` (language, animation, scene) or `anim/demo.html?a=cpr` (the CPR age picker).

| animation | id | scenes | style | file | size | gzip |
| --- | --- | --- | --- | --- | --- | --- |
| Why vaccines matter | `anim.vaccines` | 6 | v2 | `anim/vaccines.js` | 75.5 KB | 13.5 KB |
| Protecting everyone (herd immunity, measles) | `anim.herd` | 5 | v2 | `anim/herd.js` | 92.0 KB | 12.7 KB |
| Making water safe | `anim.water` | 6 | v2 | `anim/water.js` | 59.3 KB | 10.5 KB |
| Washing cloth nappies | `anim.nappies` | 5 | v2 | `anim/nappies.js` | 48.8 KB | 8.7 KB |
| Washing hands | `anim.handwashing` | 7 | v2 | `anim/handwashing.js` | 86.6 KB | 13.6 KB |
| Making ORS at home | `anim.ors` | 6 | v2 | `anim/ors.js` | 66.2 KB | 11.9 KB |
| How illness spreads | `anim.spread` | 7 | v2 | `anim/spread.js` | 80.9 KB | 13.9 KB |
| CPR: newborn not breathing at birth | `anim.cpr-newborn` | 7 | v1 | `anim/cpr-newborn.js` | 22.4 KB | 5.0 KB |
| CPR: baby under 1 year | `anim.cpr-baby` | 7 | v1 | `anim/cpr-baby.js` | 26.1 KB | 5.6 KB |
| CPR: child, 1 year to puberty | `anim.cpr-child` | 7 | v1 | `anim/cpr-child.js` | 25.3 KB | 5.1 KB |
| CPR: adult | `anim.cpr-adult` | 7 | v1 | `anim/cpr-adult.js` | 26.4 KB | 5.8 KB |
| Slow breathing (the breathing pacer on the mind-calm page; content pass 3) | `anim.breathe` | 6 | v1 | `anim/breathe.js` | 5.5 KB | 1.5 KB |
| player (all animations, with the age picker) | | | | `js/anim.js` | 25.6 KB | 8.4 KB |

Sizes are raw bytes / gzip -9. The v2 files are larger raw because of the shading, textures and hands, but every one is under 15 KB gzipped, which is what goes over the wire and into the cache. herd (92 KB) and handwashing (87 KB) are a little over the 60 to 80 KB raw guide; their gzip size is fine.

**CPR is being rebuilt in 3D** (a separate worker, three.js clay-style figures, `js/cine/`, `anim/cine/`, `docs/CINE_KIT.md`). The SVG `anim/cpr-*.js` files above are left exactly as they are (with the baby two-thumb picture and the "if you are alone" scenes): the player plays `anim/cine/<name>.js` when it exists and falls back to them otherwise.

**Picture steps** (2026-10-07): approved still pictures in layers (Mo's ChatGPT frames), animated with camera moves, drawn overlays, counters and moving hand layers: `js/steps.js`, `anim/steps/<name>.json`, `img/steps/<name>/`, `tools/steps_images.py`, `docs/STEPS_PLAYER.md`. The player plays them before the cine and SVG versions for names listed in `STEPS` in `js/anim.js`; that list stays empty until Mo approves the pictures.

CPR is one entry for the app, `cpr`, a *group*: opening it first shows an age picker (Newborn, Baby, Child, Adult: four big picture cards, each with its name and a speaker button; the question "Who needs help?" is read aloud), then plays the chosen variant.

Text for every scene, in Dari, Pashto and English: `content/drafts/anim-narration.json` (`{id: {fa, ps, en}}`). It is a draft until Mo and a Dari and a Pashto reader have checked it (see "Review" at the end).

## How it looks and works

- One scene = one picture (360 x 240) with a gentle animation loop + one short narration line.
- The player shows: the title with a speaker button, the picture, a row of progress dots (tap one to jump), the scene's text with a speaker button beside it, and three big buttons: Previous, Again (replay the scene and its narration), Next (on the last scene: Done, which closes).
- It reads each scene aloud when it appears and moves on by itself when the narration ends. Swipe also works: in Dari and Pashto a swipe to the right goes forward (like turning a page in an RTL book), in English a swipe to the left. Arrow keys and Escape work on a computer.
- RTL layout in fa and ps; Persian digits in the text.
- Children's animations use the red accent; CPR (all four variants and the picker) uses teal.
- Reduced motion (`prefers-reduced-motion`, or the `still` option): no movement. Every scene is built so that its plain, not-animated state is the key frame (for example the germs sit at the edge of the protective ring, the illness has already spread), so the still picture tells the same story.
- People have no faces (no eyes, mouths or features), as everywhere in the app; meaning comes from pose and props.

## Player API (`js/anim.js`, an ES module)

```js
import { mountAnimation, openAnimation, animPoster, loadAnimation } from './anim.js';

// full-screen player over the page; resolves to a controller
const ctl = await openAnimation('vaccines', {
  lang: 'fa',                       // 'fa' | 'ps' | 'en'
  text: (id) => '...',              // narration text for an id (or pass narration: {id: {fa, ps, en}})
  play: (ids) => promise,           // start narration of these ids; resolve when it has finished
  stop: () => {},                   // stop narration (called on Previous/Next/close)
  t: (key) => '...',                // optional: the app's T() for the labels previous/next/close/listen
  onClose: () => {},                // optional
  start: 0, still: false, autoplay: true, autoAdvance: true, adult: undefined, minMs: 3500,
});
ctl.next(); ctl.back(); ctl.go(2); ctl.replay(); ctl.narrationEnded(); ctl.stop(); ctl.close();

await mountAnimation(el, 'herd', opts);   // the same player inside an element of your own
await animPoster('herd', 0);              // SVG string of one scene, for a still poster

// groups (variants with a picker first): GROUPS.cpr = {title, ask, adult, items:[{anim, label}]}
await openAnimation('cpr', opts);                         // age picker, then the chosen variant
await openAnimation('cpr', { ...opts, pick: 'cpr-baby' }); // straight to one variant
await mountPicker(el, 'cpr', { ...opts, onPick: (name) => {} }); // the picker alone
animGroup('cpr');                                         // the group's data, or null
```

`opts.onPick(name)` (optional) is called when a variant is chosen in the full-screen player, e.g. to remember the last choice. A new group is one entry in `GROUPS` in `js/anim.js` plus the narration ids `anim.<group>.title`, `anim.<group>.ask` and `anim.<variant>.label`.

Auto-advance rule: `play(ids)` may return
- a promise: when it resolves the player waits 0.7 s (and at least `minMs` since the scene began) and goes to the next scene. If it resolves with `false` or `'stopped'` (the user cut the narration off) it stays.
- `true`: the app will call `ctl.narrationEnded()` itself when the clip ends.
- anything else (nothing to play: no clip and no phone voice): a timer of about 6 s per scene, longer for long lines (380 ms a word), so slow readers can finish.

The player never moves on from the last scene by itself.

## Wiring into the app

Done on 2026-10-07: the narration is in `content/src/anims.json` (built into the book, recordable, in the audio packs), `anim/*.js` are precached and shipped (Pages and the APK), the `anim` block type is in the validator, the dashboard editor and docs/CONTENT_SPEC.md, the vaccines page shows `vaccines` and `herd`, and each CPR page shows `cpr` with `pick` for its age. The app uses only the public API (`openAnimation`, `animPoster`). The notes below were the plan.

### The plan (as proposed)

1. **Narration text.** After review, move `content/drafts/anim-narration.json` to `content/src/anims.json`. In `tools/build.py`, after the `ui["say"]` loop:

   ```python
   anims = load(J("content/src/anims.json")) if exists("content/src/anims.json") else {}
   for k, L in anims.items(): say(k, L)
   ```

   Then the ids are in `book.narration`, so `play(ids)`, the recording studio, the narration scripts (`content/scripts/narration-*.tsv`) and the audio packs all work for them. Put them in the `children` pack (vaccines, herd) and the `urgent` pack (all `anim.cpr*` ids) or `everyone`; audio files are `audio/<lang>-<f|m>/anim.cpr-baby.s5.mp3` etc. as for every other id. The `_review` key at the top of the draft is a note, not narration: drop it when moving the file (or skip keys starting with `_` in the loop).

2. **Offline cache.** Add `js/anim.js`, `anim/vaccines.js`, `anim/herd.js`, `anim/cpr-newborn.js`, `anim/cpr-baby.js`, `anim/cpr-child.js`, `anim/cpr-adult.js` to `PRECACHE` (the list `tools/build.py` writes into `sw.js`). `anim/demo.html` does not need to ship.

3. **A new topic block type `"anim"`** (add this to CONTENT_SPEC.md, "Block types"):

   > - "anim": a short narrated picture story. `{"id": "<topic-id>.anim-<name>", "type": "anim", "anim": "<name>", "title": {fa, ps, en}}`. `"anim"` is the file name in `anim/` (`vaccines`, `herd`) or a group (`cpr`, which opens the age picker; `cpr-baby` etc. go straight to one variant). Shown as a still picture with a big play button and the title with a speaker; tapping opens the full-screen player. The scene texts live in `content/src/anims.json` with ids `anim.<name>.s1`, `anim.<name>.s2`, ... and `anim.<name>.title` (groups also `anim.<group>.ask` and `anim.<variant>.label`). At most one or two per topic; place it after the lead.

   Suggested placements: `anim: "vaccines"` and `anim: "herd"` on the vaccines page (add an optional `"anims": ["vaccines", "herd"]` field to `vaccines.json` and render them after the lead); `herd` also in `measles` after the lead; `cpr` in `first-aid` (after the lead, before the steps), in `red-flags`, and in the new emergencies topics if one covers "not breathing"; `cpr-newborn` also in the birth/newborn topic if there is one.

   build.py, in the topic block loop: `elif ty == "anim": say(b["id"], b["title"])` (the block's own speaker reads the title only; the listen bar of the page should not read all the scenes).

4. **js/app.js.**

   ```js
   import { openAnimation, animPoster } from './anim.js';

   // in blockHtml(b, n):
   if (b.type === 'anim') return `<div class="blk anim-block" data-block="${esc(b.id)}">
     <button class="poster" data-action="anim" data-anim="${esc(b.anim)}" aria-label="${esc(L(b.title))}"><span class="play">${I.play}</span></button>
     <div class="row"><span class="t">${esc(L(b.title))}</span>${spk(b.id)}</div></div>`;

   // after a topic page is rendered: fill the posters (still pictures)
   // (for a group, show a scene of one variant, e.g. cpr -> animPoster('cpr-adult', 4))
   const POSTER = { cpr: ['cpr-adult', 4] };
   $$('.anim-block .poster').forEach(async (el) => { try { el.insertAdjacentHTML('afterbegin', await animPoster(...(POSTER[el.dataset.anim] || [el.dataset.anim]))); } catch {} });

   // in the click handler, case 'anim':
   openAnimation(t.dataset.anim, {
     lang: S.lang, t: T, adult: undefined,
     text: (id) => L(S.book.narration[id]),
     play: (ids) => play(ids), stop: stopAudio,
     onClose: () => stopAudio(),
   });
   ```

   For auto-advance `play()` needs to tell when it has finished. Smallest change: make `play()` return a promise.

   ```js
   // play(): at the start
   if (P.resolve) P.resolve('stopped');
   const done = new Promise((r) => { P.resolve = r; });
   // ... and where it gives up because there is nothing to play: P.resolve = null; return null;
   // ... at the end of play(): return done;
   // stopAudio(): if (P.resolve) { P.resolve(P.i >= P.ids.length ? 'ended' : 'stopped'); P.resolve = null; }
   ```

   (`advance()` calls `stopAudio()` after the last clip with `P.i >= P.ids.length`, which resolves `'ended'`; a tap elsewhere resolves `'stopped'`.) With no clip and no phone voice `play()` must return `null` (not a resolved promise), so the player uses its timer instead of jumping on.

   The player's speaker buttons use `data-asay` (not `data-say`), so the app's global click handler does not also catch them.

5. **CSS for the poster block** (in `css/app.css`; the player's own CSS is inside `js/anim.js` and uses the app's tokens):

   ```css
   .anim-block{flex-direction:column;padding:0;overflow:hidden;gap:0}
   .anim-block .poster{position:relative;display:block;width:100%;background:var(--accent-t)}
   .anim-block .poster .anim-svg *{animation:none!important}
   .anim-block .poster .play{position:absolute;inset:0;margin:auto;width:72px;height:72px;border-radius:999px;background:var(--accent);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(34,32,29,.28)}
   .anim-block .poster .play svg{width:34px;height:34px;fill:#fff}
   [dir=rtl] .anim-block .poster .play svg{transform:scaleX(-1)}
   .anim-block .row{display:flex;align-items:center;gap:10px;padding:10px 12px;width:100%}
   .anim-block .t{flex:1 1 auto;font-weight:700;font-size:18px}
   ```

   (`anim/demo.html` has the same block, as `.anim-card`.)

## Data format (for the next animations)

Each `anim/<name>.js` is an ES module:

```js
export default {
  id: 'anim.<name>', w: 360, h: 240, adult: false,
  css: `/* keyframes and classes for this animation, prefixed (v-, h-, c-, ...) */`,
  defs: `<g id="..">reusable drawings (backgrounds, figures)</g>`,  // placed once in <defs>, used with <use href="#..">
  scenes: [{ id: 'anim.<name>.s1', svg: `<use href="#bg"/>...`, ms: 7000 /* optional minimum */ }, ...],
};
```

Rules that keep it small, smooth and still-safe:
- Animated elements are wrappers `<g class="a <cls>">` with no `transform` attribute of their own (CSS transforms replace the attribute); put the position on an inner `<g transform>`. `.a` sets `transform-box: fill-box; transform-origin: center`; add `ob` (bottom), `ot` (top) or `ol` (left) for other pivots.
- The plain state of every element must be the meaningful key frame (reduced motion shows only that). Animate *from* somewhere (`@keyframes x{from{opacity:0}}` with `both`) rather than towards a hidden state.
- Smooth easing only (`ease-in-out`, `cubic-bezier`); linear only for a clock hand.
- Shared keyframes in the player: `ak-in`, `ak-pop`, `ak-out`, `ak-bob`, `ak-float`, `ak-pulse`, `ak-glow`, `ak-blink`, `ak-shake`, `ak-up`, `ak-down`, `ak-left`, `ak-right`, `ak-spin`; idle classes `br` (gentle breathing of a standing figure, use with `ob`) and `sw` (slight sway).
- Ids in `defs` must be unique across all animations (`vb`, `hb`, `ka-`, `kb-`, ...): several posters can be on one page (the CPR picker shows four), and `<use href="#id">` takes the first match in the document.
- Budget (v1) 15 to 35 KB per animation, (v2) up to about 80 KB raw and under 15 KB gzip: draw each figure once in `defs` and reuse it with `<use>`.
- No text in pictures; people without faces; palette and culture rules from `docs/ART_SPEC.md`.

The v1 files were generated by `make_anims.py` (vaccines, herd: now replaced by v2) and `cpr_all.py` (the four CPR variants) (in the illustrator's scratchpad, next to the scene library `art-work/scene.py` that drew the topic pictures, so figures match exactly); the generated `anim/*.js` files are plain text and can also be edited by hand.

### v2: the picture-book style (2026-10-07)

Mo asked for a higher-quality look (picture book / UNICEF explainer). vaccines, herd and batch 2 (water, nappies, handwashing, ors, spread) use it; the CPR SVG files stay v1.

Format: the same module plus `v: 2`, and per scene optional `cam` and `light`:

```js
export default { id: 'anim.water', v: 2, w: 360, h: 240, css, defs,
  scenes: [{ id: 'anim.water.s2', ms: 8000,
             cam: { o: [50, 60], s: [1, 1.06], x: [0, -2], y: [0, 0], ms: 9000 }, // origin %, scale, shift %, ms; or cam: false
             light: true,                                                                          // false: no warm light (night scene)
             svg: '...' }] };
```

What the player adds for `v >= 2` (`js/anim.js`; the public API is unchanged):
- **Warm light and vignette**: two overlay rects (gradients `ak-wl`, `ak-vg`) on top of each scene unless `light: false`.
- **Gentle camera**: a slow push-in on the whole picture (CSS animation `ak-cam` on the svg, values from `cam`; default a 4.5 % push towards (50 %, 55 %) over the scene time plus 1.5 s). Off in reduced motion.
- **Cross-fade** between scenes (the old picture fades out over 0.55 s, `.anim-old`). Reduced motion and first open replace directly.
- Shared rig keyframes: `k-sh` (sway), `k-br` (breathe), `k-nod`, `k-cl` (cloth).

Drawing (generator library `pb.py` + `pbp.py` (props: germs, magnifier, clinic, syringe, card, inset) + `pbw.py` (water, fire, containers, hands close-ups, ORS, insects, bed net) in the illustrator scratchpad, `scratchpad/v2/`; one script per animation: `vaccines.py`, `herd.py`, `water.py`, `nappies.py`, `handwashing.py`, `ors.py`, `spread.py`; `mk.py` writes `anim/<name>.js`, prefixes ids and removes duplicates):
- Colour-independent shading overlays (gradients for light from the upper left, cylinder shading, ambient occlusion at contacts, ground and plaster textures, carpet patterns), so one drawing works in any cloth colour.
- Cloth with folds and embroidered hems, the chador drawn over the arms, hands with fingers (one shape, reused with `<use>` and a skin colour), round head forms with no faces, 3/4 heads for the walking figure.
- Depth layers: sky, far mountains, near hills, poplars, village, ground, figures, foreground tufts; indoor rooms with window light shafts, niches, toshaks and carpets.
- Arms are a two-bone IK (`arm()`), so hands land exactly on props.
- Close-up inserts (round `inset()` with a clip path) for details like "don't dip the cup" or the baby to wash before breastfeeding.

Motion rules (on top of the v1 rules):
- Every moving part is drawn with its pivot at the local origin, `<g transform="translate(px py)"><g class="r CLS">..</g></g>` (no fill-box guesses); `class="a"` only for things that really should turn around their own box.
- Eased curves only (`cubic-bezier`), anticipation before a big move, overlapping secondary motion (sleeve and hem follow the arm a little late), idle breathing and sway with random negative delays so figures never move in step.
- Transform and opacity only. Tested at 4x CPU throttling (Pixel 5 viewport, Playwright + CDP): 60 fps in every scene measured (see "Testing").
- The plain state is still the key frame for reduced motion.

### Testing (2026-10-07)

- Playwright, Pixel 5: every scene of vaccines, herd, water, nappies, handwashing, ors and spread stepped through in fa, ps and en, and in fa with reduced motion: no console errors, no horizontal overflow, the right scene index each time.
- 4x CPU throttling: vaccines s1/s3/s6, herd s2/s4, water s2/s4, nappies s3/s4, handwashing s1/s6, ors s3/s6, spread s4/s6/s7: 60 fps; at most one frame over 34 ms in 4 s (spread s6 and s7, 50 ms, once).
- Before/after contact sheets, frame sequences and phone screenshots: `scratchpad/test/shots/` (`before-*.png`, `after-*.png`, `compare-*.png`, `frames-*.png`, `after-phone-*.png`).

## Scenes and narration (English; Dari and Pashto in the JSON)

### anim.vaccines: Why vaccines matter

| id | picture | narration |
| --- | --- | --- |
| `anim.vaccines.title` | poster = scene 1 | Why vaccines matter |
| `anim.vaccines.s1` | a boy plays in the courtyard, tiny germs drift in the air, a magnifying glass shows one germ | Germs are too small to see. Some germs cause dangerous illnesses, like measles, polio and whooping cough. |
| `anim.vaccines.s2` | a health worker (white coat, headscarf) gives drops to the baby in the mother's arms; a thought bubble shows a pale, sleepy germ turning into a teal shield | A vaccine is like practice for the body. It shows the body a weak or harmless form of a germ, so the body learns how to fight it. |
| `anim.vaccines.s3` | the boy inside his teal ring; germs fly at him and fade at the ring | Later, if the real germ comes, the body knows it and fights it fast. The child usually stays well. |
| `anim.vaccines.s4` | split screen: right (read first in Dari/Pashto) the vaccinated boy plays outside in his ring, green tick; left, indoors, an unvaccinated child lies ill on a toshak with a rash, mother beside him, germs, red cross | A vaccinated child is well protected. A child without vaccines can become very sick, and some are harmed for life. |
| `anim.vaccines.s5` | the mother holds the red vaccine card; a big copy of it fills with green ticks one by one | Keep the vaccine card safe and bring it every time: it shows which vaccines your child has had. Vaccines are free at government clinics. |
| `anim.vaccines.s6` | the mother walks (side view, walk cycle) carrying the baby upright towards the clinic; 6 visit dots fill along the path | Your child needs 6 vaccine visits before 2 years of age. If a visit was missed, still go: the health worker will give the vaccines your child still needs. |

### anim.herd: Protecting everyone

| id | picture | narration |
| --- | --- | --- |
| `anim.herd.title` | poster = scene 1 | Protecting everyone |
| `anim.herd.s1` | a coughing child with measles rash; droplets spread through the air towards a man and a woman | Measles is one of the most catching illnesses. It spreads through the air when a sick person coughs, sneezes or breathes. |
| `anim.herd.s2` | a village of 11 people, 2 vaccinated (teal rings): red arcs jump from person to person, each one turns ill (red glow, rash) | When few people are vaccinated, measles passes from one person to the next. Soon many children are sick. |
| `anim.herd.s3` | the same village, 9 vaccinated: arcs from the ill child stop at the rings (teal crosses); the 2 unvaccinated people stay well | When most people are vaccinated, measles cannot find a way through, and it stops. |
| `anim.herd.s4` | a soft protective dome over a mother with a newborn and a frail grandfather with a stick, vaccinated people round them; germs bounce off the dome | This also protects people who cannot have the vaccine: babies who are too young, and some people who are very sick. |
| `anim.herd.s5` | a health worker vaccinates a toddler held by her mother; two syringe badges with ticks (two doses) | Every child needs two measles vaccines, at 9 months and at 18 months. Each vaccinated child helps protect the whole village. |

### anim.cpr: CPR for every age (a group with an age picker)

| id | where | narration |
| --- | --- | --- |
| `anim.cpr.title` | picker title | Helping someone who is not breathing |
| `anim.cpr.ask` | picker question, read aloud when it opens | Who needs help? A newborn, a baby, a child or an adult? |
| `anim.cpr-newborn.label` | picker card (picture = scene 1 of the variant) | Newborn (just born) |
| `anim.cpr-baby.label` | picker card (picture = scene 1 of the variant) | Baby (under 1 year) |
| `anim.cpr-child.label` | picker card (picture = scene 1 of the variant) | Child (1 year to puberty) |
| `anim.cpr-adult.label` | picker card (picture = scene 1 of the variant) | Adult |

#### anim.cpr-newborn: A newborn who is not breathing

Source: WHO/AAP Helping Babies Breathe, 2nd edition (2016), Action Plan and the Golden Minute (family-level steps: dry, keep warm, clear the airway if needed, stimulate, ventilate at about 40 a minute); WHO Guidelines on basic newborn resuscitation (2012); ERC Guidelines 2021 Newborn resuscitation and support of transition (Madar et al., Resuscitation 2021;161:291-326) and the ERC/ILCOR 2025 newborn update.

| id | picture | narration |
| --- | --- | --- |
| `anim.cpr-newborn.title` | poster = scene 1 | A newborn who is not breathing |
| `anim.cpr-newborn.s1` | indoors on the rug: a woman sits with the just-born baby in front of her and rubs it dry with a cloth | As soon as the baby is born, dry the whole body well with a clean, dry cloth, and rub the back gently. Most babies then cry and breathe. |
| `anim.cpr-newborn.s2` | she raises an arm and shouts; a man leaves through the door; a bubble with a car pops up; the baby lies in its cloth | If the baby is not crying or breathing, shout for help. Send someone to bring a car to go to hospital. Keep the baby warm. |
| `anim.cpr-newborn.s3` | close-up: the baby on its back, head a little back; her hand wipes the mouth with a cloth | Lay the baby on its back with the head tilted back a little. Gently wipe the mouth, then the nose, with a clean cloth. |
| `anim.cpr-newborn.s4` | she rubs the soles of the feet; a dotted look-line goes to the chest | Rub the back or the soles of the feet once more. Look at the chest: is the baby breathing? |
| `anim.cpr-newborn.s5` | close-up: she kneels and bends, her mouth over the baby's mouth and nose; small puffs go in and the chest rises, about 40 a minute | If not, cover the baby's mouth and nose with your mouth and give small, gentle puffs, about one every 1 to 2 seconds. Watch the chest rise with each puff. |
| `anim.cpr-newborn.s6` | alone: a stopwatch for 1 minute of puffs; she wraps the baby and carries it out to get help; shout marks | If you are alone, first shout loudly for help. Give puffs for 1 minute. Then wrap the baby warmly and carry it with you to get help. |
| `anim.cpr-newborn.s7` | the baby is on the mother's chest, held and wrapped; green cry marks and a green tick; the man comes back to the door | Keep giving puffs until the baby breathes or cries, or help arrives. Then lay the baby skin to skin on the mother's chest, covered and warm, and go to hospital. |

#### anim.cpr-baby: A baby who is not breathing

Source: ERC Guidelines 2021 Paediatric Life Support (Van de Voorde et al., Resuscitation 2021;161:327-387) and ERC Guidelines 2025 Paediatric Life Support (lay-rescuer sequence: 5 initial breaths, then 15:2 for health workers / 30:2 for lay rescuers); AHA 2020 Part 4 Pediatric BLS and ALS (Topjian et al., Circulation 2020;142:S469-S523) and AHA 2025 Pediatric BLS; ILCOR 2025 CoSTR.

| id | picture | narration |
| --- | --- | --- |
| `anim.cpr-baby.title` | poster = scene 1 | A baby who is not breathing |
| `anim.cpr-baby.s1` | indoors: a woman sits on the rug with the baby on its back in front of her; she taps the foot; shout marks | Gently tap the baby's foot and call loudly. Never shake a baby. |
| `anim.cpr-baby.s2` | she raises an arm and shouts; a man leaves through the door; a car bubble pops up | If the baby does not respond, shout for help. Send someone to bring a car to go to hospital. |
| `anim.cpr-baby.s3` | one hand on the forehead, fingers lifting the chin; a dotted look-line to the chest; a stopwatch hand sweeps 10 s | Lay the baby on its back. Keep the head level and lift the chin a little. Look at the chest for up to 10 seconds. |
| `anim.cpr-baby.s4` | close-up: mouth over mouth and nose; 5 counter dots fill one by one, the chest rises with each puff | If the baby is not breathing normally, give 5 gentle breaths: cover the baby's mouth and nose with your mouth and puff until the chest rises. |
| `anim.cpr-baby.s5` | from above: both hands round the baby's chest, two thumbs side by side on the lower half of the breastbone press at 110 a minute, a depth arrow and a heart beat | Put your hands around the baby's chest, with both thumbs side by side on the lower half of the breastbone. Push down with your thumbs 30 times: about 4 centimetres deep, 100 to 120 times a minute. |
| `anim.cpr-baby.s6` | compressions go on (the woman pushes, the chest gives); badge "heart, arrow, two dots" = 30 pushes then 2 breaths; the man is back at the door | Then give 2 breaths and 30 pushes again. Keep going until the baby breathes normally or help arrives. |
| `anim.cpr-baby.s7` | alone: a stopwatch for 1 minute; she carries the baby out, shouting | If you are alone, first shout loudly for help. Then give breaths and pushes for 1 minute. Then carry the baby with you to get help. |

#### anim.cpr-child: A child who is not breathing

Source: as for the baby (ERC 2021 and 2025 Paediatric Life Support; AHA 2020 and 2025 Pediatric BLS; ILCOR 2025).

| id | picture | narration |
| --- | --- | --- |
| `anim.cpr-child.title` | poster = scene 1 | A child who is not breathing |
| `anim.cpr-child.s1` | a child lies on the ground in a courtyard; a woman kneels behind and taps the shoulders; shout marks | Make sure it is safe. Tap the child and call their name loudly. |
| `anim.cpr-child.s2` | she raises an arm and shouts; a man runs off towards a car | If the child does not answer, shout for help. Send someone to bring a car to go to hospital. |
| `anim.cpr-child.s3` | head tilt and chin lift; a dotted look-line to the chest; a stopwatch | Gently tilt the head back and lift the chin. Look at the chest for up to 10 seconds. If the child is not breathing normally, start now. |
| `anim.cpr-child.s4` | close-up: she bends, pinches the nose, mouth over mouth; 5 counter dots fill, the chest rises | Give 5 breaths: pinch the nose, cover the child's mouth with your mouth, and blow gently until the chest rises. |
| `anim.cpr-child.s5` | one hand on the centre of the chest, other hand on the forehead; compressions at 110 a minute with a depth arrow and a beating heart | Push on the centre of the chest 30 times with one hand: about 5 centimetres deep, 100 to 120 times a minute. |
| `anim.cpr-child.s6` | compressions go on; a man kneels beside her to help; a car waits; badge "30 pushes then 2 breaths" | Then give 2 breaths and 30 pushes again. Keep going until the child breathes normally or help arrives. |
| `anim.cpr-child.s7` | alone: she keeps pushing while a stopwatch runs 1 minute, shouting for help | If you are alone, first shout loudly for help. Then give breaths and pushes for 1 minute, and only then go to get help. |

#### anim.cpr-adult: An adult who has collapsed

Source: ERC Guidelines 2021 Basic Life Support (Olasveengen et al., Resuscitation 2021;161:98-114) and ERC Guidelines 2025 BLS; AHA 2020 Part 3 Adult BLS and ALS (Panchal et al., Circulation 2020;142:S366-S468) and AHA 2025 Adult BLS; ILCOR 2025 CoSTR; IFRC International First Aid, Resuscitation and Education Guidelines 2020.

| id | picture | narration |
| --- | --- | --- |
| `anim.cpr-adult.title` | poster = scene 1 (the group poster on a topic page: adult scene 5) | An adult who has collapsed |
| `anim.cpr-adult.s1` | a man lies on the ground in a courtyard; the rescuer kneels behind, taps the shoulders; shout marks | First make sure it is safe to go near. Kneel beside the person, tap their shoulders and shout: Are you all right? |
| `anim.cpr-adult.s2` | the rescuer waves and shouts; a second man runs off towards a car | If there is no answer, shout for help. Send anyone who comes to bring a car to take the person to hospital. |
| `anim.cpr-adult.s3` | head tilt and chin lift; a dotted look-line to the chest; a stopwatch hand sweeps 10 s; the chest does not move | Tilt the head back and lift the chin. Look at the chest for up to 10 seconds. If they are not breathing normally, or only gasping, start pushing on the chest. |
| `anim.cpr-adult.s4` | from above, on a mat: a target ring on the centre of the chest; two straight arms come down, hands stacked on it | Put the heel of one hand in the centre of the chest and your other hand on top. Keep your arms straight. |
| `anim.cpr-adult.s5` | compressions at 110 a minute (one push every 0.545 s): straight arms push, the chest gives, a depth arrow and a heart beat in time | Push hard and fast 30 times: about 5 to 6 centimetres deep, 100 to 120 times a minute, about 2 pushes every second. Let the chest come back up each time. |
| `anim.cpr-adult.s6` | close-up: the rescuer bends, pinches the nose, mouth over mouth; 2 counter dots fill, the chest rises | If you are willing, give 2 breaths: tilt the head, pinch the nose and blow into the mouth until the chest rises. Pushing without breaths is also good. |
| `anim.cpr-adult.s7` | compressions go on; a second man kneels ready to take over; a car arrives; badge "30 pushes then 2 breaths" | Keep going, 30 pushes and 2 breaths, or pushes only, until the person breathes normally or help arrives. If nobody comes, keep going and keep shouting for help. If another person can help, take turns every 2 minutes. |

### Batch 2: daily hygiene and diarrhoea (v2 style)

Their narration is in `content/src/anims.json` and `tools/build.py` precaches `anim/*.js` by glob, so they ship offline.

Placed on pages (content merge 2, 2026-10-07), each right after the page's lead, with no title of its own (the block reads `anim.<name>.title`): `ors` and `water` on Diarrhoea (children) and Diarrhoea in adults; `handwashing` and `spread` on Clean hands, water and food (hygiene); `nappies` on Newborn care. At most 2 per page.

Medical defaults chosen for the narration (Mo to confirm): chlorine tablets "follow the dose on the packet" (no fixed tablet-to-litre example); ash only "if there is no soap"; packet ORS only, no home sugar-salt recipe (no packet: rice water or soup for now, and go to the clinic for packets). **The pictures were not changed** (`anim/*.js` belongs to the animation worker): water s3 still shows the badge "1 tablet -> 1 jerrycan" and ors s3 still shows the sugar and salt teaspoons. Both should be redrawn to match the new lines (a packet with a "read the dose" label; a rice-water bowl and a clinic).

Posters in `anim/demo.html`: water s2, nappies s4, handwashing s6, ors s3, spread s7 (indexes 1, 3, 5, 2, 6).

#### anim.water: Making water safe

Sources: WHO Guidelines for drinking-water quality, 4th edition incorporating the 1st and 2nd addenda (2022); WHO technical brief "Boil water" (2015); WHO "Results of round II of the WHO international scheme to evaluate household water treatment technologies" (2019) and WHO/UNICEF household water treatment and safe storage guidance; UNICEF WASH programme guidance; CDC Safe Water System (chlorine, 30 minutes contact time).

| id | picture | narration |
| --- | --- | --- |
| `anim.water.title` | poster = scene 2 | Making water safe |
| `anim.water.s1` | in the yard a woman holds a glass of clear-looking water; a magnifying glass slides over it and shows germs | Water can look clear and still carry germs that give children diarrhoea. Mothers have found a few easy ways to make it safe. |
| `anim.water.s2` | close-up: a pot on a hearth fire, big rolling bubbles and steam; a timer sweeps 1 minute; the lid drops on | Boil it: wait until big bubbles roll, then keep it boiling for 1 minute. Let it cool with the lid on. |
| `anim.water.s3` | a hand drops a tablet into the opening of a yellow jerrycan; the tablet packet; badge "1 tablet -> 1 jerrycan" | Short of firewood? Use the chlorine tablets the clinic or health worker gives out. Follow the dose on the packet; ask the health worker to read it to you. |
| `anim.water.s4` | a woman shakes the closed jerrycan; a timer fills half (30 minutes); a cup with a green tick | Close the lid, shake it, and wait 30 minutes before anyone drinks. A light chlorine smell is normal: it means the tablet is working. |
| `anim.water.s5` | indoors, a seated woman scrubs a container in a basin with soap; a clay water pot with a lid and tap stands on a stand off the floor | Keep drinking water covered, in a clean container up off the floor. Wash the container with soap every few days. |
| `anim.water.s6` | water pours from the pot's tap into a cup, green tick; inset: a cup dipped into the pot, red cross | Pour the water out from the tap or spout. Don't dip cups or hands into the pot: that brings the germs back in. |

#### anim.nappies: Washing cloth nappies

Sources: WHO/UNICEF JMP definition of safe disposal of child faeces (put or rinsed into a toilet or latrine); UNICEF/WSP "Management of child feces: current disposal practices" (2015); WHO Guidelines on sanitation and health (2018); WHO/UNICEF Facts for Life (2010), hygiene chapter.

| id | picture | narration |
| --- | --- | --- |
| `anim.nappies.title` | poster = scene 4 | Washing cloth nappies |
| `anim.nappies.s1` | a mother sits with her baby kicking on a cloth; a stack of folded nappies and a lidded bucket | Cloth nappies can be used again and again. A few simple habits keep the baby and the whole family safe from diarrhoea germs. |
| `anim.nappies.s2` | close-up: hands hold the nappy over the latrine slab, the poo drops in, a jug rinses it; inset: a nappy in a stream with a red cross | First tip the poo into the latrine and rinse the nappy there. Not on the ground, and never in the stream or the water channel. |
| `anim.nappies.s3` | a basin of steaming water; hands scrub the cloth with soap; lather | Then wash it with soap in hot water, scrub it well, and rinse it in clean water. |
| `anim.nappies.s4` | nappies on a clothesline in full sun, moving in the breeze | Hang it in the sun until it is completely dry. The sun helps kill germs too. |
| `anim.nappies.s5` | hands rubbing with soap; the bucket with its lid on | Last, wash your hands with soap. Keep dirty nappies in a bucket with a lid until wash time. |

#### anim.handwashing: Washing hands

Sources: WHO/UNICEF Facts for Life (2010), hygiene; UNICEF "Handwashing with soap" critical times; WHO Guidelines on hand hygiene in health care (2009) for the 20 seconds and the steps (also CDC "When and how to wash your hands"); WHO/UNICEF "Interim recommendations on obligatory hand hygiene" (2020) and the Cochrane review on ash for handwashing (Paludan-Müller et al., 2020) for ash.

| id | picture | narration |
| --- | --- | --- |
| `anim.handwashing.title` | poster = scene 6 | Washing hands |
| `anim.handwashing.s1` | in the yard a mother pours water from an ewer over a child's hands into a basin; soap and a bowl of ash beside it | Many illnesses travel on hands. Soap and running water wash the germs away. No soap? Clean ash works too. Someone can pour the water for you. |
| `anim.handwashing.s2` | a latrine, a dashed arrow, a tippy tap; a woman washes at it with soap; inset: a baby in a nappy (cleaning a child) | Wash after using the toilet, and after cleaning a child's bottom. |
| `anim.handwashing.s3` | indoors, a woman washes at the clay water pot's tap; food waits on a low board (bowl, fruit, naan) | Wash before you start preparing food. |
| `anim.handwashing.s4` | at the dastarkhan a seated mother pours water from an ewer over a child's hands into a basin; the grandmother waits by the food | Wash before eating and before feeding a child. Wash the children's hands too. |
| `anim.handwashing.s5` | a daughter pours water for her mother; the baby lies nearby waiting to be fed | Wash before breastfeeding your baby. |
| `anim.handwashing.s6` | close-up: two hands rub with lather (palms, backs, between the fingers, thumbs); a timer sweeps 20 seconds | Wet your hands, add soap, or ash if there is no soap, and rub for about 20 seconds: palms, backs, between the fingers, thumbs and nails. |
| `anim.handwashing.s7` | close-up: hands under a stream of poured water, drops fall; a clean cloth | Rinse under running water. Shake your hands dry or use a clean cloth. |

#### anim.ors: Making ORS at home

Sources: WHO "The treatment of diarrhoea: a manual for physicians and other senior health workers" (2005), Plan A; WHO/UNICEF Joint Statement "Clinical management of acute diarrhoea" (2004); WHO IMCI chart booklet (2014); WHO/UNICEF Facts for Life (2010), diarrhoea chapter (home sugar-salt solution).

| id | picture | narration |
| --- | --- | --- |
| `anim.ors.title` | poster = scene 3 | Making ORS at home |
| `anim.ors.s1` | a sick child lies on a toshak, the mother beside him; a glass on the shelf drains drop by drop; an ORS sachet with a tick | Diarrhoea drains water and salt out of a child's body. Start ORS as soon as the diarrhoea starts: it puts back what is lost. |
| `anim.ors.s2` | a 1-litre jug with a mark; a sachet tilts and powder pours in; a spoon stirs; inset: washing hands | Wash your hands. Fill a clean jug to 1 litre with boiled, cooled water. Pour in the whole packet and stir until it dissolves. |
| `anim.ors.s3` | the jug; a teaspoon makes trips from a sugar bowl (6 chips fill) and from a salt bowl (half a chip) | No packet? For now give rice water or soup, and go to the clinic for ORS packets. Always keep a few packets at home. |
| `anim.ors.s4` | a seated mother gives a toddler sips from a spoon; the jug and a cup beside her; a stopwatch for the 10-minute wait | Give small sips often, with a spoon or a cup. If the child vomits, wait 10 minutes, then give it more slowly. Make it fresh each day. |
| `anim.ors.s5` | the mother breastfeeds; a zinc blister pack; 14 day dots (10 filled, 4 more) | Keep breastfeeding and keep giving food. Zinc tablets from the clinic, once a day for 10 to 14 days, help the child get well, even after the diarrhoea stops. |
| `anim.ors.s6` | five danger-sign icons (cannot drink, very sleepy, blood, fever, getting worse); the mother walks to the clinic with the child | Go to the clinic quickly if the child cannot drink or breastfeed, is very sleepy, has blood in the poo, has a fever, or is not getting better. |

#### anim.spread: How illness spreads

Sources: WHO/UNICEF Facts for Life (2010), hygiene and malaria chapters; WHO fact sheets on diarrhoeal disease (2024), leishmaniasis (2023) and malaria (2024); WHO "Guidelines for malaria" (2023, insecticide-treated nets); WHO advice on respiratory hygiene (cover coughs, ventilation); WHO Guidelines on sanitation and health (2018) for flies and latrines.

| id | picture | narration |
| --- | --- | --- |
| `anim.spread.title` | poster = scene 7 | How illness spreads |
| `anim.spread.s1` | a family in the village; a magnifying glass over the house shows germs | Germs are too small to see. They travel from person to person along a few paths. Once you know the paths, you can block them. |
| `anim.spread.s2` | close-up: a hand with germs reaches towards naan; the germs are stopped; a soap icon with a tick | Hands: germs ride on our hands into food and mouths. Washing with soap blocks this path. |
| `anim.spread.s3` | indoors on the carpet: an open bucket and bowl with germs -> a covered water pot and covered bowl; icons for safe water, covered food, cooking | Water and food: dirty water and uncovered food carry germs. Make water safe, cover food, and cook it well. |
| `anim.spread.s4` | flies fly from poo on the ground to the food on a cloth; icons for a covered latrine and covered food | Flies: they sit on poo, then on our food. Use a latrine with a cover, and keep food covered. |
| `anim.spread.s5` | indoors, a man coughs, droplets spread towards a child; icons for coughing into the elbow, an open window, a vaccine | Coughs and air: a cough sprays tiny drops. Cough into your elbow, let fresh air into the room, and get the children vaccinated. |
| `anim.spread.s6` | night (no warm light), moon in the window: the family sleeps under a bed net; mosquitoes and sandflies bump against it; inset: a covered arm | Mosquitoes and sandflies bite in the evening and at night. They spread malaria and leishmaniasis, the sore that does not heal. Sleep under a treated net, and cover arms and legs in the evening. |
| `anim.spread.s7` | the family in a soft circle, six icons around them (soap, safe water, covered food, latrine, elbow, net) | Soap, safe water, covered food, a covered latrine, an elbow for coughs, and a bed net. Small habits that keep the whole family healthier. |

## Clinical statements for Mo to check

Vaccines (WHO "How do vaccines work?" 2020; WHO/UNICEF Facts for Life 2010, immunization; WHO fact sheets on measles, poliomyelitis, pertussis; Afghan EPI schedule as already in `content/src/vaccines.json`):
1. Some germs cause dangerous illnesses such as measles, polio and whooping cough.
2. A vaccine shows the body a weakened or harmless form (or part) of a germ, so the body learns to fight it ("like practice"). Picture shows oral drops (OPV/rotavirus style).
3. If the real germ comes later, the body recognises it and fights it fast; the child *usually* stays well (worded so as not to promise 100 %).
4. An unvaccinated child can become very sick and some are harmed for life (e.g. blindness or brain damage after measles, paralysis after polio). Death is deliberately not mentioned (calm tone); add it if you want it.
5. Keep the card and bring it every time; vaccines are free at government clinics (same as `vaccines.card`, `vaccines.free`).
6. 6 vaccine visits before age 2 (birth, 6, 10, 14 weeks, 9 and 18 months, as in `vaccines.json`); a missed visit: still go, the health worker gives what is still needed (catch-up; rotavirus has an upper age limit, hence "what is still needed").

Herd immunity (WHO measles fact sheet 2024; WHO Q&A "Herd immunity, lockdowns and COVID-19" 2020, which explains herd immunity and gives about 95 % coverage for measles; Afghan schedule from `measles.json`):
7. Measles is one of the most contagious illnesses; it spreads through the air when an infected person breathes, coughs or sneezes.
8. With low vaccine coverage measles passes from person to person; with high coverage chains of spread are broken and it stops. No percentage is said aloud (about 95 % with two doses for measles, if you want to add it).
9. High coverage protects people who cannot be vaccinated: babies too young for the vaccine (under 9 months on the Afghan schedule) and some very sick people (e.g. people with a weakened immune system cannot have the live measles vaccine).
10. Two measles doses, at 9 and 18 months (Afghan EPI; same as `measles.vaccine`; check MR vs measles-only as noted in `vaccines.json` review).

CPR for every age. Sources per variant are under each scene table above. Points marked **decide** need your choice; I followed your brief where the guidelines differ.

All four variants:
11. Shout for help and send someone to bring a car to go to hospital. There is no ambulance number in the village, so no number and no phone are shown or said (the old adult line with "phone" is gone). Defibrillators are not mentioned.
12. Keep going until the person (baby) breathes normally or help arrives (newborn: breathes or cries, or help arrives). "Until you are too exhausted" is not said.
13. Compression rate 100 to 120 a minute; every compression animation runs at 110 a minute (one push every 0.545 s). Adult text also says "about 2 pushes every second".
14. Lone rescuer (done, default from your brief): newborn, baby and child have an extra scene: shout first, then about 1 minute of CPR (newborn: puffs) before going for help, carrying a newborn or baby along (ERC 2021/2025 paediatric). Adult: "send anyone who comes"; s7 adds "if nobody comes, keep going and keep shouting for help" (no phone in the village, so the ERC/AHA "call first" for adults becomes "shout").

Adult (`anim.cpr-adult`):
15. Make sure it is safe; kneel, tap the shoulders, shout "Are you all right?".
16. Open the airway (head tilt, chin lift) and look for normal breathing for no more than 10 seconds; not breathing normally *or only gasping* means start CPR (ERC lay sequence; AHA lay rescuers just check breathing).
17. Heel of one hand in the centre of the chest (lower half of the breastbone), other hand on top, arms straight (picture: stacked hands from above).
18. 30 compressions, 5 to 6 cm deep, full recoil, 100 to 120 a minute.
19. Breaths are optional: "If you are willing, give 2 breaths (tilt the head, pinch the nose, blow until the chest rises). Pushing without breaths is also good" (ERC/AHA: lay rescuers who are trained and willing give 30:2; otherwise compression-only CPR). Note: drowning and sandali/charcoal-smoke poisoning, which are common here, are cases where breaths matter more.
20. Swap rescuers about every 2 minutes if someone else can help.

Child, 1 year to puberty (`anim.cpr-child`):
21. Check: tap and call the child's name; head tilt and chin lift; look at the chest for up to 10 seconds.
22. 5 rescue breaths first (pinch the nose, mouth over mouth, blow gently until the chest rises), then 30 compressions, then 2 breaths, 30:2 on. This is the ERC sequence. **Decide:** AHA (2020 and 2025) starts with compressions (C-A-B) and does not use 5 initial breaths; your brief asked for the ERC sequence, so that is what is shown.
23. One hand on the centre of the chest (lower half of the breastbone), depth about 5 cm (at least one third of the chest depth), 100 to 120 a minute. ERC allows one or two hands for a child; the text says one hand.

Baby under 1 year (`anim.cpr-baby`):
24. Check: gently tap the foot and call loudly; "Never shake a baby". Head kept level (neutral) with the chin lifted a little (not tilted back as in older children); look up to 10 seconds.
25. 5 gentle breaths with the rescuer's mouth over the baby's mouth *and* nose, until the chest rises; then 30 compressions, then 2 breaths, 30:2 on (ERC lay sequence; same AHA note as point 22).
26. Changed to **two thumbs** with the hands round the chest, thumbs side by side on the lower half of the breastbone, about 4 cm (one third of the chest depth), as in AHA 2025 Pediatric BLS (two-finger compressions removed; the heel of one hand is the alternative if the thumbs cannot reach depth) and the ERC/RCUK 2025 wording reported in `docs/EMERGENCIES.md`, so the animation and the emergencies pages say the same thing. Mo to confirm against the ERC 2025 text. The picture and text of s5 were redone (SVG version); the 3D rebuild should follow the same technique.

Newborn not breathing at birth (`anim.cpr-newborn`), based on Helping Babies Breathe for families:
27. Straight after birth: dry the whole body well with a clean dry cloth and rub the back gently; most babies then cry and breathe.
28. If not crying or breathing: shout for help, send for a car, keep the baby warm (dry cloth).
29. Lay the baby on its back with the head a little tilted back ("sniffing" position); gently wipe the mouth, then the nose, with a clean cloth (HBB: clear the airway only if needed; no suction device is assumed).
30. Stimulate once more (rub the back or the soles of the feet) and look for breathing.
31. If still not breathing: mouth over the baby's mouth and nose, small gentle puffs, about one every 1 to 2 seconds (HBB: 40 a minute; the animation runs at 40 a minute), watching the chest rise. **Decide (important): this is an adaptation.** HBB and the WHO 2012 guideline teach ventilation with a bag and mask, not mouth-to-mouth; mouth-to-mouth-and-nose is used here because families in the village will not have a bag and mask. Please confirm you want it, or change it to "if you have a bag and mask and know how to use it".
32. No chest compressions for the newborn. Newborn compressions (3:1 with breaths, only when the heart rate stays under 60 despite good ventilation) are for skilled birth attendants; HBB does not teach them to families. So the "depth" and "100 to 120 a minute" requirements do not apply to this variant; ventilation is the step that saves most non-breathing newborns.
33. Once breathing or crying: skin to skin on the mother's chest, covered and warm, and go to hospital.

Batch 2 (water, nappies, handwashing, ors, spread). Sources are under each scene table. Points marked **check** need your decision.

Water (`anim.water`):
34. Boil: a rolling boil, then keep boiling for 1 minute, cool with the lid on (WHO says a rolling boil is enough; 1 minute is the common public-health margin). **Check:** CDC says 3 minutes above about 2000 m. Most of Samangan is lower, but some mountain villages may be higher; add "in the high mountains, 3 minutes" if you want it.
35. Chlorine tablets: **check (important).** Tablet strengths differ (NaDCC tablets such as Aquatabs are made for 1, 5, 10, 20 litres and more). The narration says "ask how much water one tablet is for" and gives "one big tablet for a 20-litre jerrycan" only as an example. Please confirm which tablets the Samangan clinics and NGOs hand out, and the dose; then the example can be exact.
36. Wait 30 minutes after adding the tablet before drinking; a light chlorine smell is normal (WHO/CDC: 30 minutes contact time).
37. Cloudy water is not mentioned (to keep the scene short). WHO: let cloudy water settle or filter it through a clean cloth first, or use a double chlorine dose. **Check:** add a scene if river or channel water is common.
38. Safe storage: covered, clean container, off the floor; wash it with soap every few days; pour from a tap or spout, do not dip cups or hands (WHO household water treatment and safe storage).

Nappies (`anim.nappies`):
39. Faeces into the latrine, rinse the nappy there; never on the ground or into the stream or water channel (JMP: child faeces into a latrine counts as safe disposal).
40. Wash with soap in hot water, scrub, rinse in clean water; dry fully in the sun (sunlight helps, but washing is the main step; the text says "helps kill germs too").
41. Wash hands with soap afterwards; keep soiled nappies in a lidded bucket until washing.

Handwashing (`anim.handwashing`):
42. Five key times: after the toilet, after cleaning a child's bottom, before preparing food, before eating and feeding a child, before breastfeeding (UNICEF/Facts for Life critical times; the breastfeeding moment is added as its own scene for this audience).
43. Rub for about 20 seconds: palms, backs, between the fingers, thumbs and nails; rinse under running (poured) water; shake dry or use a clean cloth (WHO/CDC). A second person pouring from an ewer, or a tippy tap, gives running water without a tap.
44. **Check:** "No soap? Clean ash works too." WHO/UNICEF list ash as an alternative when there is no soap, but the evidence is weak (Cochrane 2020 found it uncertain). Keep, soften to "ash is better than water alone", or drop?

ORS (`anim.ors`):
45. Start ORS as soon as diarrhoea starts (WHO Plan A).
46. Packet: the whole sachet into 1 litre of boiled, cooled water (low-osmolarity ORS; Afghan sachets are for 1 litre; check the local packet size).
47. **Check (important):** the home recipe, 6 level teaspoons of sugar and half a level teaspoon of salt in 1 litre of clean water (Facts for Life), with "measure carefully: too much salt is harmful". WHO now prefers packets; mixing errors (heaped spoons, small cups) can give too much salt. Keep the recipe, or say only "if you have no packet, give other fluids and go to the clinic for packets"?
48. Small sips often by spoon or cup; if the child vomits, wait 10 minutes and give more slowly; make fresh each day (throw away after 24 hours).
49. Keep breastfeeding and feeding. Zinc once a day for 10 to 14 days (WHO: 10 mg a day under 6 months, 20 mg from 6 months). The narration gives no dose: "zinc tablets from the clinic". The day dots show 14 with 10 filled.
50. Danger signs, go quickly: cannot drink or breastfeed, very sleepy (lethargic), blood in the stool, fever, not getting better (IMCI "return immediately" signs, with "very sleepy" added from the general danger signs). Sunken eyes and slow skin pinch are left for the health worker.

How illness spreads (`anim.spread`):
51. Paths shown: hands, water and food, flies, coughs and air, mosquitoes and sandflies. Blocks: soap; safe water, covered food, cooking well; a latrine with a cover; cough into the elbow, fresh air, vaccines; a treated net, long sleeves in the evening.
52. Mosquitoes and sandflies bite mostly in the evening and at night; malaria and cutaneous leishmaniasis ("the sore that does not heal"). Insecticide-treated nets reduce sandfly bites too (WHO leishmaniasis fact sheet), but sandflies can pass a wide-mesh net; the treated net is what matters. **Check:** malaria risk in Samangan is low compared with the east; keep "malaria" or say "fevers"? And the local name for the sore (Dari سالک "salak" is common in Afghanistan; Pashto may differ).
53. "Get the children vaccinated" is listed as a block for illnesses spread through the air (measles, whooping cough), linking to the vaccine animations.

## Review still needed

- Dari and Pashto were written by me for meaning, not yet checked by native readers. Please have a Dari and a Pashto reader check especially: "practice" (تمرین), "harmed for life" (برای تمام عمر آسیب می‌بینند / د ټول عمر لپاره زیان ویني), "heel of the hand" (قسمت پایین کف دست / د ورغوي لاندې برخه), "gasp" (فقط گاه‌گاهی نفس سخت می‌کشد / یوازې کله کله سخته ساه اخلي), "are you all right?" (خوب هستی؟ / ښه یې؟), whooping cough (سیاه‌سرفه / توره ټوخي), and the titles.
- Picture review: in `anim.vaccines.s4` the vaccinated child is on the right because Dari and Pashto readers read right to left (the English text, read left to right, mentions the vaccinated child first too, so in English the order is reversed). The red and green badges carry the meaning either way.
- CPR pictures: a man helps the adult man (a woman doing CPR on a man may not be acceptable to some families); a woman helps the child, the baby and the newborn. In the baby and newborn scenes she sits on the floor of a room with the baby in front of her; the breath close-ups show her kneeling and bending down.
- CPR words to check with native readers: "push" (فشار دادن / کېکاږل), "breath / puff" (نفس دادن، پف کردن / ساه ورکول، پو کول), "never shake a baby" (هرگز شیرخوار را تکان ندهید / هېڅکله تي خوړونکی ماشوم مه ښوروئ), "puberty" (بلوغ / بلوغ), "skin to skin" (برهنه روی سینهٔ مادر / لوڅ د مور پر سینه), "respond" (واکنش نشان دادن / غبرګون ښودل), and the four picker labels.
- Batch 2 words to check with native readers: nappy cloth (کهنه in Pashto; Dari پوتک or کهنه?), chlorine tablet (تابلیت کلورین), ORS (او آر اس, the packet name used at the clinics), zinc (زینک), sandfly (پشه خاکی / شګلنه مچ?), leishmaniasis / "the sore that does not heal" (سالک / کال دانه?), tippy tap (no local word; the picture carries it), dastarkhan, ewer (آفتابه).
- Batch 2 pictures: women and girls in chadors pour and wash, a man coughs in the spread scene, the health worker is a woman in a white coat and headscarf. Nobody is shown eating with dirty hands in a way that blames a person; the germs carry the message.

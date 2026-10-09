// Sehat picture-step player: still illustrations (approved pictures, in layers) brought to life with
// CSS transforms and opacity only (Web Animations API, composited; no canvas, no video, no libraries).
//
// A picture-step animation is anim/steps/<name>.json plus its pictures in img/steps/<name>/ (made by
// tools/steps_images.py). js/anim.js plays it instead of anim/<name>.js when <name> is listed in STEPS there
// (or registered with useSteps(name)): it is a third kind of animation beside the SVG and cine versions, with
// the same player around it (title, narration, dots, Previous / Again / Next, swipe, RTL, auto-advance).
//
// What a scene can do (docs/STEPS_PLAYER.md has the full format):
//   cam       Ken Burns: the view moves between rectangles of the picture ([x, y, w], picture pixels)
//   motions   loop (a layer moves back and forth: compressions, rubbing; with "slow then full speed"),
//             swap (an "up" and a "down" version of a layer take turns, in time with the count),
//             fade (a layer appears or goes), move (a layer slides once), xfade (cross-fade to another frame,
//             once or back and forth, e.g. a chest rising)
//   overlays  ring, arrow (straight or curved), guide (dotted line), dot, depth (bracket with a marker that
//             follows the push), shade, tick, cross, icon (the app's icons, optionally crossed out), waves
//             (sound or breathing lines), counter (1-30, breaths), timer
// Reduced motion shows the scene's key frame with all its overlays. In fa / ps numbers use Persian digits;
// corner badges swap sides in RTL, and an overlay with "mirror": true is mirrored; pictures are never flipped.
//
// Old Android WebView (Chrome 69): no ?? or ?. (tools/validate.py rejects them), no CSS inset or aspect-ratio,
// no Animation.finished or getAnimations().

const ROOT = new URL('../', import.meta.url);
const DIG = '۰۱۲۳۴۵۶۷۸۹';
export const num = (n, lg) => (lg === 'en' ? String(n) : String(n).replace(/\d/g, (d) => DIG[d]));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r3 = (v) => Math.round(v * 1000) / 1000;
const pc = (v, of) => r3((v / of) * 100) + '%';
const has = (o, k) => o != null && o[k] != null;
const def = (v, d) => (v == null ? d : v);

export const EASE = {
  linear: 'linear', in: 'cubic-bezier(.5,0,.9,.6)', out: 'cubic-bezier(.15,.6,.35,1)', 'in-out': 'cubic-bezier(.45,0,.4,1)',
  sine: 'cubic-bezier(.37,0,.63,1)', ease: 'ease', soft: 'cubic-bezier(.3,.1,.3,1)',
};
const ease = (e, d) => EASE[e || d] || e || EASE[d] || 'linear';

// Loop shapes: amount of the movement (0 = rest, 1 = full) at offsets of one cycle; beat = when it counts.
// push: 40% down, a short hold at the bottom, 40% back up (full recoil), a short rest at the top.
export const SHAPES = {
  push: { o: [0, 0.4, 0.5, 0.9, 1], a: [0, 1, 1, 0, 0], e: ['sine', 'linear', 'sine', 'linear'], beat: 0.4 },
  sine: { o: [0, 0.5, 1], a: [0, 1, 0], e: ['sine', 'sine'], beat: 0.5 },
  rub: { o: [0, 0.25, 0.75, 1], a: [0, 1, -1, 0], e: ['out', 'sine', 'in'], beat: 0.25 },
  linear: { o: [0, 0.5, 1], a: [0, 1, 0], e: ['linear', 'linear'], beat: 0.5 },
  breath: { o: [0, 0.35, 0.55, 1], a: [0, 1, 1, 0], e: ['sine', 'linear', 'sine'], beat: 0.35 },
};
export function shape(name) {
  if (SHAPES[name]) return SHAPES[name];
  return { o: [0, 0.5, 1], a: [0, 1, 0], e: [name, name], beat: 0.5 }; // a custom easing string
}

// ---------- pure helpers (tested in Node by tools/test_steps.mjs) ----------

// a camera stop [x, y, w] (or {x, y, w}) in picture pixels -> a rectangle kept inside the picture, same aspect
export function camRect(stop, W, H) {
  const s = Array.isArray(stop) ? { x: stop[0], y: stop[1], w: stop[2] } : stop || {};
  let w = Math.min(W, Math.max(W / 6, def(s.w, W))), h = (w * H) / W;
  let x = def(s.x, 0), y = def(s.y, 0);
  if (has(s, 'cx')) x = s.cx - w / 2;
  if (has(s, 'cy')) y = s.cy - h / 2;
  x = Math.max(0, Math.min(W - w, x)); y = Math.max(0, Math.min(H - h, y));
  return { x: x, y: y, w: w, h: h };
}
// the transform of the camera element (transform-origin 0 0) that shows rectangle r of a W x H picture
export function camTransform(r, W, H) {
  return 'scale(' + r3(W / r.w) + ') translate(' + pc(-r.x, W) + ',' + pc(-r.y, H) + ')';
}

// the transform of a layer at amount a (0..1, or -1 for the far side of a rub) of motion m, for a layer box
export function poseTransform(m, a, box) {
  const t = [];
  const dx = def(m.dx, 0) * a, dy = def(m.dy, 0) * a;
  if (dx || dy) t.push('translate(' + pc(dx, box[2]) + ',' + pc(dy, box[3]) + ')');
  const s = has(m, 's') ? m.s : null;
  const sx = 1 + (def(m.sx, def(s, 1)) - 1) * a, sy = 1 + (def(m.sy, def(s, 1)) - 1) * a;
  if (sx !== 1 || sy !== 1) t.push('scale(' + r3(sx) + ',' + r3(sy) + ')');
  if (m.r) t.push('rotate(' + r3(m.r * a) + 'deg)');
  return t.length ? t.join(' ') : 'translate(0,0)';
}
// Web Animations keyframes for one cycle of a loop motion
export function loopKeyframes(m, box) {
  const sh = shape(m.ease || 'push');
  return sh.o.map((o, k) => {
    const f = { offset: o, transform: poseTransform(m, sh.a[k], box) };
    if (k < sh.o.length - 1) f.easing = ease(sh.e[k], 'sine');
    return f;
  });
}

// An up/down layer pair: opacity keyframes of the "down" layer for one cycle (it shows while the movement is more
// than half way, with a short blend of `blend` ms at each change); the "up" layer gets the opposite.
export function swapKeyframes(shapeName, period, blend) {
  const sh = shape(shapeName || 'push'), cut = [];
  for (let i = 1; i < sh.o.length; i++) {
    const a0 = Math.abs(sh.a[i - 1]), a1 = Math.abs(sh.a[i]);
    if ((a0 < 0.5) !== (a1 < 0.5)) cut.push(sh.o[i - 1] + ((0.5 - a0) / (a1 - a0)) * (sh.o[i] - sh.o[i - 1]));
  }
  if (cut.length < 2) return [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 0 }];
  const b = Math.min(0.12, def(blend, 80) / period / 2), on = cut[0], off = cut[1];
  const pts = [[0, 0], [on - b, 0], [on + b, 1], [off - b, 1], [off + b, 0], [1, 0]];
  return pts.map((p) => ({ offset: r3(Math.max(0, Math.min(1, p[0]))), opacity: p[1] }));
}

// When a repeating motion runs: segments [{at, period, n}] (n = Infinity for "until the scene ends"),
// its beats (times it counts, e.g. each push reaching the bottom; capped for endless loops) and its end.
export function schedule(m, beatAt) {
  const segs = [];
  let t = def(m.at, 0);
  const total = m.count == null ? Infinity : m.count;
  const slow = m.slow && m.slow.count ? Math.min(m.slow.count, total) : 0;
  if (m.type === 'xfade') {
    const ms = def(m.ms, 600), period = ms * 2 + def(m.hold, 600) + def(m.gap, 400);
    segs.push({ at: t, period: period, n: def(m.count, 1) });
    beatAt = (ms + def(m.hold, 600) / 2) / period;
  } else {
    if (slow) { const p = 60000 / m.slow.rate; segs.push({ at: t, period: p, n: slow }); t += p * slow; }
    if (total - slow > 0) segs.push({ at: t, period: 60000 / def(m.rate, 100), n: total - slow });
  }
  const beats = [];
  segs.forEach((s) => { for (let i = 0; i < Math.min(s.n, 400); i++) beats.push(Math.round(s.at + (i + beatAt) * s.period)); });
  const last = segs[segs.length - 1];
  const end = !last ? def(m.at, 0) : last.n === Infinity ? Infinity : last.at + last.period * last.n;
  return { segs: segs, beats: beats, end: end };
}

export function fmtTime(sec, lg) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return num(m + ':' + (s < 10 ? '0' : '') + s, lg);
}
export function label(L, lg) {
  if (L == null) return '';
  const s = typeof L === 'string' ? L : def(L[lg], def(L.en, ''));
  return num(s, lg);
}

// the scene's timeline: motions by id, beats for counters, the end of what must be seen
export function plan(data, sc) {
  const byId = {}, W = data.w, H = data.h;
  (sc.motions || []).forEach((m, k) => { byId[m.id || 'm' + k] = m; });
  const lead = (m) => {
    let x = m, guard = 0;
    while (x && x.follow && byId[x.follow] && guard++ < 5) x = byId[x.follow];
    return x || m;
  };
  const timing = (m) => {
    const L = lead(m);
    const t = { type: L.type, at: L.at, count: L.count, rate: L.rate, slow: L.slow, ms: L.ms, hold: L.hold, gap: L.gap };
    return schedule(t, shape(L.ease || (L.type === 'xfade' ? 'sine' : 'push')).beat);
  };
  let end = 0;
  const camStops = cams(sc, W, H);
  if (sc.cam && sc.cam.wait && camStops.length > 1) end = Math.max(end, camStops[camStops.length - 1].t);
  (sc.motions || []).forEach((m) => {
    if (m.type === 'loop' || m.type === 'swap' || m.type === 'xfade') {
      if (m.type === 'xfade' && !m.back) { end = Math.max(end, def(m.at, 0) + def(m.ms, 600)); return; }
      const e = timing(m).end; if (e !== Infinity) end = Math.max(end, e);
    } else if (m.type === 'fade' || m.type === 'move') end = Math.max(end, def(m.at, 0) + def(m.ms, 600));
  });
  (sc.overlays || []).forEach((o) => {
    if (o.type === 'counter') {
      const src = o.follow && byId[o.follow] ? timing(byId[o.follow]) : schedule({ type: 'loop', at: def(o.at, 0), count: def(o.to, 1), rate: 60000 / def(o.every, 1000) }, 1);
      if (src.end !== Infinity) end = Math.max(end, src.beats.length ? src.beats[src.beats.length - 1] : 0);
    } else if (o.type === 'timer') { if (o.wait) end = Math.max(end, def(o.at, 0) + Math.abs(def(o.to, 0) - def(o.from, 0)) * 1000); }
    else end = Math.max(end, def(o.at, 0) + 400);
  });
  if (typeof sc.wait === 'number') end = sc.wait;
  else if (sc.wait === false) end = 0;
  return { byId: byId, lead: lead, timing: timing, end: end, cams: camStops };
}

// camera stops with times: [{r, t, e}] (t = when the view arrives there)
export function cams(sc, W, H) {
  if (sc.cam === false) return [];
  let c = sc.cam;
  if (!c) c = { path: [[0, 0, W], [W * 0.02, H * 0.03, W * 0.96]], ms: [def(sc.ms, 9000)] };
  const path = c.path || [c.from || [0, 0, W], c.to || [0, 0, W]];
  const ms = Array.isArray(c.ms) ? c.ms : [def(c.ms, 6000)];
  const holds = Array.isArray(c.hold) ? c.hold : [];
  const out = [];
  let t = def(c.at, 0);
  path.forEach((p, k) => {
    if (k > 0) t += def(holds[k - 1], 0) + def(ms[Math.min(k - 1, ms.length - 1)], 6000);
    out.push({ r: camRect(p, W, H), t: t, e: ease(Array.isArray(c.ease) ? c.ease[k - 1] : c.ease, 'in-out') });
  });
  return out;
}

// ---------- loading ----------

const cache = new Map();
export function stepsUrl(name) { return new URL('anim/steps/' + name + '.json', ROOT).href; }

export async function loadSteps(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(stepsUrl(name)).then((r) => (r.ok ? r.json() : null)).then((d) => (d ? build(name, d) : null), () => null));
  }
  return cache.get(name);
}

// the object js/anim.js plays (the same shape as a cine version).
// srcs (optional): {"img/steps/<name>/<file>?v=<v>": url}, the pictures of an on-demand set that js/anim.js has
// on the phone (blob: URLs read from its cache), used instead of the files next to the app.
export function build(name, d, srcs) {
  const W = d.w, H = d.h;
  if (!W || !H || !d.frames || !d.scenes || !d.scenes.length) throw new Error('steps ' + name + ': needs w, h, frames and scenes');
  const rel = (d.dir || 'img/steps/' + name + '/').replace(/\/*$/, '/');
  const dir = new URL(rel, ROOT);
  const frames = {};
  Object.keys(d.frames).forEach((f) => {
    const fr = d.frames[f];
    frames[f] = (fr.layers || fr).map((L) => {
      const file = L.src + (L.v ? '?v=' + L.v : '');
      return { id: L.id, box: L.box || [0, 0, W, H], src: (srcs && srcs[rel + file]) || new URL(file, dir).href };
    });
  });
  const data = { name: name, w: W, h: H, frames: frames, scenes: d.scenes };
  injectCss();
  return {
    cine: true, steps: true, id: d.id || 'anim.' + name, adult: !!d.adult, data: data,
    scenes: d.scenes.map((s) => ({ id: s.id, ms: s.ms })),
    poster: (i) => poster(data, def(i, def(d.poster, 0))),
    mount: (stage, o) => mount(stage, data, o || {}),
  };
}

// ---------- HTML of one scene (start state for playing, key state for still pictures and posters) ----------

function boxStyle(b, W, H) { return 'left:' + pc(b[0], W) + ';top:' + pc(b[1], H) + ';width:' + pc(b[2], W) + ';height:' + pc(b[3], H); }
const WHITE = '#fff';

function keyOf(data, sc) {
  const k = sc.key || {};
  let frame = k.frame || sc.frame;
  if (!k.frame) (sc.motions || []).forEach((m) => { if (m.type === 'xfade' && !m.back) frame = m.to; });
  return { frame: frame, cam: k.cam, pose: k.pose || 'rest' };
}

// state for every layer: {transform, opacity} at the start or at the key frame
function layerStates(data, sc, P, still) {
  const st = {};
  const set = (ref, k, v) => { (st[ref] || (st[ref] = {}))[k] = v; };
  const key = keyOf(data, sc);
  // the "down" version of an up/down pair is hidden unless a motion of this scene shows it
  framesOf(sc).forEach((f) => (data.frames[f] || []).forEach((L) => { if (/-down$/.test(L.id)) set(f + '.' + L.id, 'wrapOpacity', 0); }));
  (sc.motions || []).forEach((m) => {
    const refs = targets(sc, m);
    refs.forEach((ref) => {
      const box = boxOf(data, sc, ref);
      if (!box) return;
      if (m.type === 'swap') {
        const down = still && key.pose === 'beat';
        set(ref, 'wrapOpacity', down ? 1 : 0);
        if (m.under && m.hide !== false) set(underRef(sc, m), 'wrapOpacity', down ? 0 : 1);
      } else if (m.type === 'fade') set(ref, 'wrapOpacity', still ? def(m.to, 1) : def(m.from, 0));
      else if (m.type === 'move') set(ref, 'wrapTransform', poseTransform(still ? m.to || {} : m.from || {}, 1, box));
      else if (m.type === 'loop' && still && key.pose === 'beat') {
        const sh = shape(P.lead(m).ease || m.ease || 'push');
        let a = 0; sh.o.forEach((o, i) => { if (o <= sh.beat) a = sh.a[i]; });
        set(ref, 'transform', poseTransform(m, a, box));
      }
    });
  });
  return st;
}
function targets(sc, m) {
  const list = m.layers || (m.layer ? [m.layer] : []);
  return list.map((x) => (x.indexOf('.') > 0 ? x : (m.frame || sc.frame) + '.' + x));
}
function underRef(sc, m) { return m.under.indexOf('.') > 0 ? m.under : (m.frame || sc.frame) + '.' + m.under; }
function boxOf(data, sc, ref) {
  const p = ref.split('.'), fr = data.frames[p[0]];
  if (!fr) return null;
  for (let i = 0; i < fr.length; i++) if (fr[i].id === p[1]) return fr[i].box;
  return null;
}
function framesOf(sc) {
  const out = [sc.frame];
  (sc.motions || []).forEach((m) => { if (m.type === 'xfade' && out.indexOf(m.to) < 0) out.push(m.to); targets(sc, m).forEach((r) => { const f = r.split('.')[0]; if (out.indexOf(f) < 0) out.push(f); }); });
  return out;
}

function sceneHtml(data, sc, o) {
  const W = data.w, H = data.h, still = o.still, P = plan(data, sc), key = keyOf(data, sc);
  const ls = layerStates(data, sc, P, still);
  let cam = '';
  if (P.cams.length) {
    let r = still ? P.cams[P.cams.length - 1].r : P.cams[0].r;
    if (still && key.cam != null) r = typeof key.cam === 'number' ? P.cams[Math.min(key.cam, P.cams.length - 1)].r : camRect(key.cam, W, H);
    cam = ' style="transform:' + camTransform(r, W, H) + '"';
  }
  const showFrame = still ? key.frame : sc.frame;
  let h = '<div class="st-cam"' + cam + '>';
  framesOf(sc).forEach((f) => {
    const fr = data.frames[f]; if (!fr) return;
    h += '<div class="st-f" data-f="' + esc(f) + '"' + (f === showFrame ? '' : ' style="opacity:0"') + '>';
    fr.forEach((L) => {
      const s = ls[f + '.' + L.id] || {};
      let ws = boxStyle(L.box, W, H);
      if (s.wrapOpacity != null) ws += ';opacity:' + s.wrapOpacity;
      if (s.wrapTransform) ws += ';transform:' + s.wrapTransform;
      h += '<div class="st-l" data-l="' + esc(f + '.' + L.id) + '" style="' + ws + '"><img src="' + esc(L.src) + '" alt="" draggable="false"' + (s.transform ? ' style="transform:' + s.transform + '"' : '') + '></div>';
      // overlays that belong between layers (e.g. a shadow under the hands): "above": "<layer id>"
      (sc.overlays || []).forEach((ov, k) => { if (ov.above === L.id && (ov.frame || sc.frame) === f) h += overlayHtml(data, ov, k, o); });
    });
    h += '</div>';
  });
  (sc.overlays || []).forEach((ov, k) => { if (!ov.above && ov.type !== 'counter' && ov.type !== 'timer') h += overlayHtml(data, ov, k, o); });
  h += '</div>';
  if (!o.poster) {
    h += '<div class="st-hud">';
    (sc.overlays || []).forEach((ov, k) => { if (ov.type === 'counter' || ov.type === 'timer') h += hudHtml(data, sc, P, ov, k, o); });
    h += '</div>';
  }
  return h;
}

function mx(data, ov, x) { return ov.mirror && ov.rtl ? data.w - x : x; }

function overlayHtml(data, ov0, k, o) {
  const W = data.w, H = data.h;
  const ov = ov0.mirror ? Object.assign({}, ov0, { rtl: o.rtl }) : ov0;
  const hidden = o.still ? '' : ';opacity:0';
  const col = ov.color || 'var(--accent,#0F7C79)';
  const sw = def(ov.width, 7);
  const wrap = (style, inner, cls) => '<div class="st-o ' + (cls || '') + '" data-o="' + k + '" style="' + style + hidden + '"><div class="st-oi">' + inner + '</div></div>';
  if (ov.type === 'ring') {
    const rx = def(ov.rx, def(ov.r, 50)), ry = def(ov.ry, def(ov.r, 50)), x = mx(data, ov, ov.x), y = ov.y, pad = sw * 2;
    const vb = '0 0 ' + r3(rx * 2 + pad * 2) + ' ' + r3(ry * 2 + pad * 2);
    const el = '<ellipse cx="' + r3(rx + pad) + '" cy="' + r3(ry + pad) + '" rx="' + rx + '" ry="' + ry + '"';
    let h = '';
    if (ov.dim) {
      const d = 'M0 0H' + W + 'V' + H + 'H0Z M' + r3(x - rx) + ' ' + y + 'a' + rx + ' ' + ry + ' 0 1 0 ' + rx * 2 + ' 0a' + rx + ' ' + ry + ' 0 1 0 ' + -rx * 2 + ' 0Z';
      h += '<div class="st-o st-dim" data-o="' + k + '" data-dim="1" style="left:0;top:0;width:100%;height:100%' + hidden + '"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><path d="' + d + '" fill-rule="evenodd" fill="rgba(25,15,8,.42)"/></svg></div>';
    }
    return h + wrap(boxStyle([x - rx - pad, y - ry - pad, rx * 2 + pad * 2, ry * 2 + pad * 2], W, H),
      '<svg viewBox="' + vb + '">' + el + ' fill="none" stroke="' + WHITE + '" stroke-width="' + (sw + 6) + '" opacity=".9"/>' + el + ' fill="none" stroke="' + col + '" stroke-width="' + sw + '"/></svg>', 'st-ring');
  }
  if (ov.type === 'arrow' || ov.type === 'guide') {
    const a = [mx(data, ov, ov.from[0]), ov.from[1]], b = [mx(data, ov, ov.to[0]), ov.to[1]];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy), ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const arrow = ov.type === 'arrow', th = arrow ? def(ov.width, 16) : def(ov.width, 6), bend = arrow ? def(ov.bend, 0) : 0;
    const hh = (arrow ? th * 3.2 : th * 3) + Math.abs(bend) * 2;
    const style = boxStyle([a[0], a[1] - hh / 2, len, hh], W, H) + ';transform-origin:0 50%;transform:rotate(' + r3(ang) + 'deg)';
    let svg;
    if (arrow && bend) {
      // a curved arrow: a quadratic curve bulging `bend` px to the left of the way it points, head along the curve
      const c = hh / 2, hl = Math.min(len * 0.45, th * 2.6), cy = c - bend * 2;
      const ta = Math.atan2(c - cy, len - len / 2), ex = len - Math.cos(ta) * hl * 0.8, ey = c - Math.sin(ta) * hl * 0.8;
      const hw = th * 1.6, nx = -Math.sin(ta), ny = Math.cos(ta);
      const head = 'M' + r3(len) + ' ' + r3(c) + 'L' + r3(ex + nx * hw) + ' ' + r3(ey + ny * hw) + 'L' + r3(ex - nx * hw) + ' ' + r3(ey - ny * hw) + 'Z';
      const shaft = 'M0 ' + r3(c) + 'Q' + r3(len / 2) + ' ' + r3(cy) + ' ' + r3(ex) + ' ' + r3(ey);
      svg = '<svg viewBox="0 0 ' + r3(len) + ' ' + r3(hh) + '"><path d="' + shaft + '" fill="none" stroke="' + WHITE + '" stroke-width="' + (th + 6) + '" stroke-linecap="round"/><path d="' + head + '" fill="' + col + '" stroke="' + WHITE + '" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/><path d="' + shaft + '" fill="none" stroke="' + col + '" stroke-width="' + th + '" stroke-linecap="round"/></svg>';
    } else if (arrow) {
      const hl = Math.min(len * 0.45, th * 2.6), c = hh / 2;
      const d = 'M0 ' + r3(c - th / 2) + 'H' + r3(len - hl) + 'V0L' + r3(len) + ' ' + r3(c) + 'L' + r3(len - hl) + ' ' + r3(hh) + 'V' + r3(c + th / 2) + 'H0Z';
      svg = '<svg viewBox="0 0 ' + r3(len) + ' ' + r3(hh) + '"><path d="' + d + '" fill="' + col + '" stroke="' + WHITE + '" stroke-width="5" stroke-linejoin="round" paint-order="stroke"/></svg>';
    } else {
      const c = r3(hh / 2), dash = ov.dash === false ? '' : ' stroke-dasharray="' + r3(th * 0.1) + ' ' + r3(th * 2.4) + '"';
      const line = '<path d="M' + r3(th / 2) + ' ' + c + 'H' + r3(len - th / 2) + '" fill="none" stroke-linecap="round"' + dash;
      svg = '<svg viewBox="0 0 ' + r3(len) + ' ' + r3(hh) + '">' + line + ' stroke="' + WHITE + '" stroke-width="' + (th + 4) + '" opacity=".85"/>' + line + ' stroke="' + col + '" stroke-width="' + th + '"/></svg>';
    }
    return '<div class="st-o st-' + ov.type + '" data-o="' + k + '" style="' + style + hidden + '"><div class="st-oi" style="transform-origin:0 50%">' + svg + '</div></div>';
  }
  if (ov.type === 'depth') {
    // a bracket from y1 (rest) to y2 (fully pushed) at x, with a marker that moves with the push
    const x = mx(data, ov, ov.x), y1 = ov.y1, y2 = ov.y2, tw = def(ov.tick, 22), pad = 10, hgt = y2 - y1;
    const st = boxStyle([x - tw / 2 - pad, y1 - pad, tw + pad * 2, hgt + pad * 2], W, H);
    const vb = '0 0 ' + (tw + pad * 2) + ' ' + (hgt + pad * 2);
    const brk = 'M' + pad + ' ' + pad + 'H' + (pad + tw) + 'M' + (pad + tw / 2) + ' ' + pad + 'V' + (pad + hgt) + 'M' + pad + ' ' + (pad + hgt) + 'H' + (pad + tw);
    let h = '<div class="st-o st-depth" data-o="' + k + '" style="' + st + hidden + '"><div class="st-oi"><svg viewBox="' + vb + '"><path d="' + brk + '" fill="none" stroke="' + WHITE + '" stroke-width="10" stroke-linecap="round"/><path d="' + brk + '" fill="none" stroke="' + col + '" stroke-width="5" stroke-linecap="round"/></svg>';
    const mk = '<div class="st-mk" style="top:' + pc(pad - 6, hgt + pad * 2) + ';height:' + pc(12, hgt + pad * 2) + (o.still ? ';transform:translateY(' + pc(hgt, 12) + ')' : '') + '"><svg viewBox="0 0 ' + (tw + pad * 2) + ' 12"><rect x="0" y="1" width="' + (tw + pad * 2) + '" height="10" rx="5" fill="' + col + '" stroke="' + WHITE + '" stroke-width="3" paint-order="stroke"/></svg></div>';
    h += mk + '</div>';
    if (ov.label && !o.poster) {
      const right = (ov.side || 'right') === 'right';
      const lx = right ? x + tw / 2 + pad + 8 : x - tw / 2 - pad - 8;
      h += '<span class="st-lbl" dir="' + (o.rtl ? 'rtl' : 'ltr') + '" style="top:' + pc(y1 + hgt / 2, H) + ';' + (right ? 'left:' + pc(lx, W) : 'right:' + pc(W - lx, W)) + '">' + esc(label(ov.label, o.lang)) + '</span>';
    }
    return h + '</div>';
  }
  if (ov.type === 'shade') {
    // a soft dark (or light) patch that follows a motion: the chest darkening as it is pressed, a press shadow
    const rx = def(ov.rx, def(ov.r, 60)), ry = def(ov.ry, def(ov.r, 60)), x = mx(data, ov, ov.x), y = ov.y;
    const c = ov.color || '70,25,10', mxo = def(ov.max, 0.3), v = o.still ? def(ov.key, mxo * 0.7) : 0;
    return '<div class="st-o st-shade" data-o="' + k + '" style="' + boxStyle([x - rx, y - ry, rx * 2, ry * 2], W, H) + ';opacity:' + v + ';background:radial-gradient(closest-side,rgba(' + c + ',1),rgba(' + c + ',.55) 45%,rgba(' + c + ',0))"></div>';
  }
  if (ov.type === 'dot') {
    const r = def(ov.r, 12), x = mx(data, ov, ov.x), y = ov.y;
    return wrap(boxStyle([x - r * 2, y - r * 2, r * 4, r * 4], W, H), '<svg viewBox="0 0 ' + r * 4 + ' ' + r * 4 + '"><circle cx="' + r * 2 + '" cy="' + r * 2 + '" r="' + r * 1.8 + '" fill="' + col + '" opacity=".28"/><circle cx="' + r * 2 + '" cy="' + r * 2 + '" r="' + r + '" fill="' + col + '" stroke="' + WHITE + '" stroke-width="4"/></svg>', 'st-pop st-dot');
  }
  if (ov.type === 'icon') {
    // one of the app's icons (img/icons/<name>.svg) on a white disc; crossed: true puts a red line through it
    const r = def(ov.r, 44), x = mx(data, ov, ov.x), y = ov.y, src = new URL('img/icons/' + ov.name + '.svg', ROOT).href;
    const cross = ov.crossed ? '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="#C0392B" stroke-width="9"/><path d="M19 81 81 19" stroke="#C0392B" stroke-width="9" stroke-linecap="round"/></svg>' : '';
    return wrap(boxStyle([x - r, y - r, r * 2, r * 2], W, H), '<span class="st-ico"><img src="' + esc(src) + '" alt="" draggable="false"></span>' + cross, 'st-pop');
  }
  if (ov.type === 'waves') {
    // three arcs going out from a point (sound, breath, warmth); angle = the way they go, in degrees (0 = right)
    const n = def(ov.count, 3), sz = def(ov.size, 70), x = mx(data, ov, ov.x), y = ov.y;
    const ang = ov.mirror && ov.rtl ? 180 - def(ov.angle, 0) : def(ov.angle, 0), sp = def(ov.spread, 70);
    let arcs = '';
    for (let i = 0; i < n; i++) {
      const rr = sz * (0.45 + (0.55 * (i + 1)) / n), a0 = ((-sp / 2) * Math.PI) / 180, a1 = ((sp / 2) * Math.PI) / 180;
      const d = 'M' + r3(sz + rr * Math.cos(a0)) + ' ' + r3(sz + rr * Math.sin(a0)) + 'A' + r3(rr) + ' ' + r3(rr) + ' 0 0 1 ' + r3(sz + rr * Math.cos(a1)) + ' ' + r3(sz + rr * Math.sin(a1));
      arcs += '<path class="st-wv" data-i="' + i + '" d="' + d + '" fill="none" stroke="' + WHITE + '" stroke-width="' + (sw + 5) + '" stroke-linecap="round"/><path class="st-wv" data-i="' + i + '" d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
    }
    return '<div class="st-o st-waves" data-o="' + k + '" style="' + boxStyle([x - sz, y - sz, sz * 2, sz * 2], W, H) + ';transform:rotate(' + r3(ang) + 'deg)' + hidden + '"><div class="st-oi"><svg viewBox="0 0 ' + sz * 2 + ' ' + sz * 2 + '">' + arcs + '</svg></div></div>';
  }
  if (ov.type === 'tick' || ov.type === 'cross') {
    const r = def(ov.r, 34), x = mx(data, ov, ov.x), y = ov.y, ok = ov.type === 'tick';
    const fill = ok ? '#2E8B57' : '#C0392B';
    const mark = ok ? 'M' + r3(r * 0.5) + ' ' + r3(r * 1.05) + 'L' + r3(r * 0.88) + ' ' + r3(r * 1.42) + 'L' + r3(r * 1.55) + ' ' + r3(r * 0.62) : 'M' + r3(r * 0.62) + ' ' + r3(r * 0.62) + 'L' + r3(r * 1.38) + ' ' + r3(r * 1.38) + 'M' + r3(r * 1.38) + ' ' + r3(r * 0.62) + 'L' + r3(r * 0.62) + ' ' + r3(r * 1.38);
    return wrap(boxStyle([x - r, y - r, r * 2, r * 2], W, H), '<svg viewBox="0 0 ' + r * 2 + ' ' + r * 2 + '"><circle cx="' + r + '" cy="' + r + '" r="' + (r - 3) + '" fill="' + fill + '" stroke="' + WHITE + '" stroke-width="5"/><path d="' + mark + '" fill="none" stroke="#fff" stroke-width="' + r3(r * 0.2) + '" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'st-pop');
  }
  return '';
}

const ICON = {
  push: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v10m-4.5-4.5L12 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 21c2.5-4.5 15.5-4.5 18 0" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>',
  breath: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h10a3 3 0 1 0-3-3M4 13h14a3 3 0 1 1-3 3M4 17h6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  time: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 9v4l3 2M9 2h6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
};

function hudPos(ov, rtl) {
  const p = (ov.pos || 'top-end').split('-'), v = p[0] === 'bottom' ? 'bottom' : 'top';
  let side = p[1] || 'end';
  if (side === 'start' || side === 'end') side = (side === 'end') !== rtl ? 'right' : 'left';
  return v + ':4%;' + side + ':3%';
}
function counterKey(P, ov) {
  if (ov.key != null) return ov.key;
  if (ov.of != null) return ov.of;
  if (ov.to != null) return ov.to;
  if (ov.follow && P.byId[ov.follow]) { const s = P.timing(P.byId[ov.follow]); return s.end === Infinity ? '' : s.beats.length; }
  return '';
}
function hudHtml(data, sc, P, ov, k, o) {
  const lg = o.lang, hide = o.still ? '' : ';opacity:0';
  if (ov.type === 'counter') {
    const v = o.still ? counterKey(P, ov) : '';
    const icon = ov.icon && ICON[ov.icon] ? '<i>' + ICON[ov.icon] + '</i>' : '';
    const of = ov.of != null && ov.showOf !== false && !(o.still && v === ov.of) ? '<small>/' + num(ov.of, lg) + '</small>' : '';
    return '<div class="st-badge" data-o="' + k + '" dir="' + (o.rtl ? 'rtl' : 'ltr') + '" style="' + hudPos(ov, o.rtl) + hide + '">' + icon + '<b>' + esc(v === '' ? '' : num(v, lg)) + '</b>' + of + '</div>';
  }
  const v = o.still ? def(ov.to, 0) : def(ov.from, 0);
  return '<div class="st-badge st-timer" data-o="' + k + '" dir="ltr" style="' + hudPos(ov, o.rtl) + hide + '"><i>' + ICON.time + '</i><b>' + fmtTime(v, lg) + '</b></div>';
}

export function poster(data, i) {
  const sc = data.scenes[Math.max(0, Math.min(data.scenes.length - 1, i))];
  // data-ar and --pr: the picture's shape, for a poster that covers a box of another shape (css/app.css [data-poster])
  return '<div class="st st-poster" data-ar="' + r3(data.w / data.h) + '" style="padding-bottom:' + pc(data.h, data.w) + ';--pr:' + pc(data.h, data.w) + '"><div class="st-view">' + sceneHtml(data, sc, { still: true, poster: true, lang: 'en', rtl: false }) + '</div></div>';
}

// ---------- playing ----------

const now = () => (document.timeline && document.timeline.currentTime != null ? document.timeline.currentTime : performance.now());

export function mount(stage, data, o) {
  const lg = o.lang || 'fa', rtl = lg !== 'en', still = !!o.still;
  const root = document.createElement('div');
  root.className = 'st'; root.style.paddingBottom = pc(data.h, data.w);
  stage.appendChild(root);
  const unit = () => { const w = root.clientWidth || stage.clientWidth || 360; root.style.setProperty('--u', r3(w / data.w) + 'px'); };
  unit();
  const onResize = () => unit();
  window.addEventListener('resize', onResize);

  // keep every picture of the animation loaded (decoded once, no flash between scenes)
  const keep = [];
  Object.keys(data.frames).forEach((f) => data.frames[f].forEach((L) => { const im = new Image(); im.src = L.src; keep.push(im); }));

  let cur = null, curI = -1, dead = false;

  function play(i) {
    const sc = data.scenes[i], P = plan(data, sc);
    const view = document.createElement('div');
    view.className = 'st-view';
    view.innerHTML = sceneHtml(data, sc, { still: still, lang: lg, rtl: rtl });
    const S = { view: view, anims: [], T0: 0, raf: 0, frozen: null, P: P, sc: sc, hud: [], end: P.end, started: false, timers: [] };
    if (still) return S;

    const q = (sel) => view.querySelector(sel);
    const A = (el, kf, t) => { if (!el || !el.animate) return null; const a = el.animate(kf, t); S.anims.push(a); return a; };
    const W = data.w, H = data.h;

    // camera
    if (P.cams.length > 1) {
      const c = P.cams, T = c[c.length - 1].t - c[0].t;
      if (T > 0) {
        A(q('.st-cam'), c.map((s, k) => {
          const f = { offset: r3((s.t - c[0].t) / T), transform: camTransform(s.r, W, H) };
          if (k < c.length - 1) f.easing = c[k + 1].e;
          return f;
        }), { duration: T, delay: c[0].t, fill: 'both' });
      }
    }
    // motions
    (sc.motions || []).forEach((m) => {
      if (m.type === 'xfade') {
        const el = q('.st-f[data-f="' + m.to + '"]'); if (!el) return;
        const ms = def(m.ms, 600);
        if (!m.back) { A(el, [{ opacity: 0 }, { opacity: 1 }], { duration: ms, delay: def(m.at, 0), easing: ease(m.ease, 'in-out'), fill: 'both' }); return; }
        const sch = schedule(m, 0.5), s0 = sch.segs[0], per = s0.period, h = def(m.hold, 600);
        A(el, [{ offset: 0, opacity: 0, easing: EASE.sine }, { offset: r3(ms / per), opacity: 1 }, { offset: r3((ms + h) / per), opacity: 1, easing: EASE.sine }, { offset: r3((ms * 2 + h) / per), opacity: 0 }, { offset: 1, opacity: 0 }],
          { duration: per, delay: s0.at, iterations: s0.n, fill: 'none' });
        return;
      }
      targets(sc, m).forEach((ref) => {
        const L = q('.st-l[data-l="' + ref + '"]'); if (!L) return;
        const box = boxOf(data, sc, ref);
        if (m.type === 'swap') {
          const U = m.under && m.hide !== false ? q('.st-l[data-l="' + underRef(sc, m) + '"]') : null;
          const shp = P.lead(m).ease || m.ease || 'push';
          P.timing(m).segs.forEach((sg) => {
            const kf = swapKeyframes(shp, sg.period, m.blend);
            A(L, kf, { duration: sg.period, delay: sg.at, iterations: sg.n, fill: 'none' });
            if (U) A(U, kf.map((f) => ({ offset: f.offset, opacity: 1 - f.opacity })), { duration: sg.period, delay: sg.at, iterations: sg.n, fill: 'none' });
          });
        } else if (m.type === 'fade') A(L, [{ opacity: def(m.from, 0) }, { opacity: def(m.to, 1) }], { duration: def(m.ms, 600), delay: def(m.at, 0), easing: ease(m.ease, 'in-out'), fill: 'forwards' }); // forwards only: until it starts, the inline start state holds (a swap may run first)
        else if (m.type === 'move') A(L, [{ transform: poseTransform(m.from || {}, 1, box) }, { transform: poseTransform(m.to || {}, 1, box) }], { duration: def(m.ms, 800), delay: def(m.at, 0), easing: ease(m.ease, 'in-out'), fill: 'forwards' });
        else if (m.type === 'loop') {
          const img = L.firstChild, lead = P.lead(m);
          if (m.origin) img.style.transformOrigin = pc(m.origin[0] - box[0], box[2]) + ' ' + pc(m.origin[1] - box[1], box[3]);
          const mm = Object.assign({}, m, { ease: m.ease || lead.ease });
          const kf = loopKeyframes(mm, box);
          P.timing(m).segs.forEach((s) => A(img, kf, { duration: s.period, delay: s.at, iterations: s.n, fill: 'none' }));
        }
      });
    });
    // overlays: appear (outer), then a gentle loop (inner)
    (sc.overlays || []).forEach((ov, k) => {
      const els = view.querySelectorAll('[data-o="' + k + '"]');
      let at = def(ov.at, 0);
      if (ov.type === 'counter' && ov.at == null && ov.follow && P.byId[ov.follow]) { const b = P.timing(P.byId[ov.follow]).beats; at = Math.max(0, (b.length ? b[0] : 0) - 300); }
      if (ov.type === 'shade') {
        const m = ov.follow && P.byId[ov.follow];
        if (m && els[0]) {
          const sh = shape(P.lead(m).ease || 'push'), mxo = def(ov.max, 0.3);
          const kf = sh.o.map((oo, i) => { const f = { offset: oo, opacity: r3(mxo * Math.abs(sh.a[i])) }; if (i < sh.o.length - 1) f.easing = ease(sh.e[i], 'sine'); return f; });
          P.timing(m).segs.forEach((sg) => A(els[0], kf, { duration: sg.period, delay: sg.at, iterations: sg.n, fill: 'none' }));
        } else if (els[0]) A(els[0], [{ opacity: 0 }, { opacity: def(ov.max, 0.3) }], { duration: 500, delay: at, fill: 'both' });
        return;
      }
      for (let n = 0; n < els.length; n++) {
        const el = els[n], inner = el.querySelector('.st-oi');
        const pop = ov.type === 'tick' || ov.type === 'cross' || ov.type === 'ring' || ov.type === 'counter' || ov.type === 'timer' || ov.type === 'dot' || ov.type === 'icon';
        const grow = (ov.type === 'arrow' || ov.type === 'guide') && ov.grow !== false;
        if (el.getAttribute('data-dim')) A(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: at, fill: 'both' });
        else A(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 350, delay: at, fill: 'both' });
        if (!inner && pop) A(el, [{ transform: 'scale(.3)' }, { transform: 'scale(1.12)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 450, delay: at, easing: 'ease-out', fill: 'both' });
        if (inner && pop && !el.getAttribute('data-dim')) A(inner, [{ transform: 'scale(.3)' }, { transform: 'scale(1.12)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 450, delay: at, easing: 'ease-out', fill: 'both' });
        if (inner && grow) A(inner, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: def(ov.ms, 600), delay: at, easing: EASE.out, fill: 'both' });
        // loops after appearing
        const la = at + (grow ? def(ov.ms, 600) : 450);
        const svg = inner && inner.firstElementChild;
        if (ov.type === 'dot' && ov.pulse !== false && svg) A(svg, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 1200, delay: la, iterations: Infinity, easing: EASE.sine });
        if (ov.type === 'waves') {
          const arcs = el.querySelectorAll('.st-wv'), per = def(ov.ms, 1500);
          for (let w = 0; w < arcs.length; w++) {
            const i = +arcs[w].getAttribute('data-i'), cnt = def(ov.count, 3);
            A(arcs[w], [{ opacity: 0.15 }, { opacity: 1, offset: 0.3 }, { opacity: 0.15 }], { duration: per, delay: la + (i * per) / cnt / 1.5, iterations: Infinity, easing: EASE.sine });
          }
        }
        if (ov.type === 'ring' && ov.pulse !== false && svg) A(svg, [{ transform: 'scale(1)' }, { transform: 'scale(1.09)' }, { transform: 'scale(1)' }], { duration: 1500, delay: la, iterations: Infinity, easing: EASE.sine });
        if (ov.type === 'arrow' && def(ov.nudge, 10) && svg) {
          const len = Math.sqrt(Math.pow(ov.to[0] - ov.from[0], 2) + Math.pow(ov.to[1] - ov.from[1], 2));
          const d = pc(def(ov.nudge, 10), len);
          A(svg, [{ transform: 'translateX(0)' }, { transform: 'translateX(' + d + ')' }, { transform: 'translateX(0)' }], { duration: 1100, delay: la, iterations: Infinity, easing: EASE.sine });
        }
        if (ov.type === 'depth' && ov.follow && P.byId[ov.follow]) {
          const mk = el.querySelector('.st-mk'), lead = P.lead(P.byId[ov.follow]);
          const sh = shape(lead.ease || 'push'), hgt = ov.y2 - ov.y1;
          const kf = sh.o.map((oo, i) => { const f = { offset: oo, transform: 'translateY(' + pc(hgt * Math.abs(sh.a[i]), 12) + ')' }; if (i < sh.o.length - 1) f.easing = ease(sh.e[i], 'sine'); return f; });
          if (mk) P.timing(P.byId[ov.follow]).segs.forEach((s) => A(mk, kf, { duration: s.period, delay: s.at, iterations: s.n, fill: 'none' }));
        }
        if (ov.until != null) A(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: ov.until, fill: 'forwards' });
      }
      if (ov.type === 'counter') {
        const src = ov.follow && P.byId[ov.follow] ? P.timing(P.byId[ov.follow]) : schedule({ type: 'loop', at: at, count: def(ov.to, 1), rate: 60000 / def(ov.every, 1000) }, 0);
        S.hud.push({ el: els[0], b: els[0] && els[0].querySelector('b'), beats: src.beats, start: def(ov.start, 1), loop: ov.loop, n: -1, kind: 'counter', of: ov.of });
      } else if (ov.type === 'timer') {
        S.hud.push({ el: els[0], b: els[0] && els[0].querySelector('b'), kind: 'timer', at: at, from: def(ov.from, 0), to: def(ov.to, 0), n: -1 });
      }
    });
    return S;
  }

  function hudTick(S, t) {
    let busy = false;
    S.hud.forEach((h) => {
      if (!h.b) return;
      if (h.kind === 'counter') {
        let n = 0;
        while (n < h.beats.length && h.beats[n] <= t) n++;
        if (n < h.beats.length) busy = true;
        if (n !== h.n) {
          h.n = n;
          let v = n ? h.start + n - 1 : '';
          if (n && h.loop && h.of) v = ((n - 1) % h.of) + h.start;
          h.b.textContent = v === '' ? '' : num(v, lg);
          if (n && S.frozen == null && h.b.animate) h.b.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'ease-out' });
        }
      } else {
        const dur = Math.abs(h.to - h.from), s = Math.min(dur, Math.max(0, Math.floor((t - h.at) / 1000)));
        if (s < dur) busy = true;
        if (s !== h.n) { h.n = s; h.b.textContent = fmtTime(h.to >= h.from ? h.from + s : h.from - s, lg); }
      }
    });
    return busy;
  }
  function loop(S) {
    cancelAnimationFrame(S.raf);
    const step = () => {
      if (dead || S !== cur) return;
      const t = S.frozen != null ? S.frozen : now() - S.T0;
      if (hudTick(S, t) && S.frozen == null) S.raf = requestAnimationFrame(step);
    };
    step();
  }
  function stopScene(S) {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    S.timers.forEach(clearTimeout);
    S.anims.forEach((a) => { try { a.cancel(); } catch (e) { /* already gone */ } });
    S.anims = [];
  }
  function ready(view) {
    const imgs = view.querySelectorAll('img');
    const one = (im) => (im.complete && im.naturalWidth ? Promise.resolve() : im.decode ? im.decode().catch(() => {}) : new Promise((r) => { im.onload = im.onerror = r; }));
    return Promise.race([Promise.all(Array.prototype.map.call(imgs, one)), new Promise((r) => setTimeout(r, 1200))]);
  }

  function show(i) {
    if (dead) return;
    const old = cur, same = i === curI;
    curI = i;
    const S = play(i);
    cur = S;
    if (old && old.view.parentNode) {
      if (!same && !still && old.view.animate) {
        root.insertBefore(S.view, old.view);
        stopScene(old);
        old.view.style.zIndex = 2;
        const a = old.view.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-in-out', fill: 'forwards' });
        const rm = () => { if (old.view.parentNode) old.view.parentNode.removeChild(old.view); };
        a.onfinish = rm; setTimeout(rm, 700);
      } else { stopScene(old); root.replaceChild(S.view, old.view); }
    } else root.appendChild(S.view);
    if (still) return;
    // the clock starts when the pictures are ready, so every motion lines up with what is seen
    S.anims.forEach((a) => a.pause());
    ready(S.view).then(() => {
      if (dead || S !== cur) return;
      S.T0 = now(); S.started = true;
      S.anims.forEach((a) => { a.play(); a.startTime = S.T0; });
      if (S.frozen != null) seek(S.frozen);
      loop(S);
    });
  }

  function seek(ms) {
    const S = cur; if (!S || still) return;
    S.frozen = ms;
    S.anims.forEach((a) => { a.pause(); a.currentTime = ms; });
    loop(S);
  }

  return {
    show: show,
    // ms still to wait before moving on (the counting and cross-fades the scene must finish)
    left: () => {
      const S = cur; if (!S || still || !S.end) return 0;
      if (!S.started) return S.end + 300;
      const t = S.frozen != null ? S.frozen : now() - S.T0;
      return Math.max(0, S.end - t);
    },
    seek: seek,
    resume: () => { const S = cur; if (!S || S.frozen == null) return; const t = S.frozen; S.frozen = null; S.T0 = now() - t; S.anims.forEach((a) => { a.startTime = S.T0; a.play(); }); loop(S); },
    get scene() { return curI; },
    destroy() { dead = true; stopScene(cur); window.removeEventListener('resize', onResize); keep.length = 0; if (root.parentNode) root.parentNode.removeChild(root); },
  };
}

// ---------- look ----------

const CSS = `
.st{position:relative;width:100%;height:0;overflow:hidden;direction:ltr;-webkit-user-select:none;user-select:none}
.st-view{position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;background:var(--accent-t,#E9F3F2)}
.st-cam{position:absolute;top:0;left:0;width:100%;height:100%;transform-origin:0 0;will-change:transform}
.st-f{position:absolute;top:0;left:0;width:100%;height:100%}
.st-l{position:absolute}
.st-l img{position:absolute;top:0;left:0;display:block;width:100%;height:100%;pointer-events:none;-webkit-user-drag:none}
.st-o{position:absolute;pointer-events:none}
.st-oi{position:absolute;top:0;left:0;width:100%;height:100%;transform-origin:50% 50%}
.st-o svg{position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;transform-origin:50% 50%}
.st-arrow svg,.st-guide svg{transform-origin:0 50%}
.st-mk{position:absolute;left:0;width:100%}
.st-mk svg{position:absolute;top:0;left:0;width:100%;height:100%}
.st-lbl{position:absolute;transform:translateY(-50%);white-space:nowrap;font-weight:800;font-size:calc(var(--u,.4px) * 30);line-height:1.3;padding:.1em .45em;border-radius:.6em;background:rgba(255,255,255,.92);color:var(--ink,#22201D);box-shadow:0 1px 4px rgba(0,0,0,.18)}
.st-hud{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none}
.st-badge{position:absolute;display:flex;align-items:center;gap:.2em;min-width:2.6em;height:2.2em;padding:0 .5em;justify-content:center;border-radius:1.2em;background:var(--accent,#0F7C79);color:#fff;font-size:calc(var(--u,.4px) * 58);font-weight:800;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.25),0 0 0 .08em #fff inset}
.st-badge b{display:inline-block;min-width:1.2em;text-align:center;font-variant-numeric:tabular-nums}
.st-badge small{font-size:.5em;opacity:.85;font-weight:700}
.st-badge i{display:inline-flex;width:.75em;height:.75em}
.st-badge i svg{width:100%;height:100%}
.st-timer{font-size:calc(var(--u,.4px) * 50)}
.st-ico{position:absolute;top:8%;left:8%;width:84%;height:84%;border-radius:50%;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.25)}
.st-ico img{position:absolute;top:18%;left:18%;width:64%;height:64%}
.st-poster{pointer-events:none}
.st-poster .st-view{background:transparent}
`;
function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('steps-css')) return;
  const s = document.createElement('style'); s.id = 'steps-css'; s.textContent = CSS; document.head.appendChild(s);
}

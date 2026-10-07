// Tests of the picture-step player's arithmetic (js/steps.js): camera, loop timing, beats, digits, scene plan.
//   node tools/test_steps.mjs
import assert from 'assert/strict';
import { camRect, camTransform, schedule, swapKeyframes, loopKeyframes, poseTransform, fmtTime, num, label, plan, cams, build } from '../js/steps.js';

let n = 0;
const t = (name, f) => { f(); n++; };
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

t('camera rectangle keeps the aspect ratio and stays inside the picture', () => {
  const r = camRect([900, 700, 300], 960, 720);
  near(r.w, 300); near(r.h, 225); near(r.x, 660); near(r.y, 495);
  const c = camRect({ cx: 480, cy: 360, w: 480 }, 960, 720);
  near(c.x, 240); near(c.y, 180);
  near(camRect([0, 0, 5000], 960, 720).w, 960);
});
t('camera transform: scale(W / w), then move the rectangle to the corner', () => {
  assert.equal(camTransform({ x: 240, y: 180, w: 480, h: 360 }, 960, 720), 'scale(2) translate(-25%,-25%)');
  assert.equal(camTransform({ x: 0, y: 0, w: 960, h: 720 }, 960, 720), 'scale(1) translate(0%,0%)');
});
t('110 a minute, 3 slow ones at 40 a minute first, 30 in all', () => {
  const s = schedule({ type: 'loop', at: 1000, count: 30, rate: 110, slow: { count: 3, rate: 40 } }, 0.4);
  assert.equal(s.segs.length, 2);
  assert.equal(s.segs[0].n, 3); near(s.segs[0].period, 1500);
  assert.equal(s.segs[1].n, 27); near(s.segs[1].period, 60000 / 110);
  assert.equal(s.beats.length, 30);
  assert.equal(s.beats[0], 1600); // the first push reaches the bottom 40% into its 1.5 s cycle
  near(s.end, 1000 + 4500 + 27 * 60000 / 110, 1e-6);
  const gaps = s.beats.slice(4).map((b, i) => b - s.beats[i + 3]);
  gaps.forEach((g) => assert.ok(Math.abs(g - 545.45) < 1.01, 'full speed is 110 a minute'));
});
t('an endless loop has no end', () => {
  const s = schedule({ type: 'loop', rate: 60 }, 0.5);
  assert.equal(s.end, Infinity);
  assert.ok(s.beats.length > 100);
});
t('back-and-forth cross-fade counts at its peak', () => {
  const s = schedule({ type: 'xfade', at: 0, ms: 500, hold: 600, gap: 400, count: 2 });
  near(s.segs[0].period, 2000); assert.deepEqual(s.beats, [800, 2800]);
});
t('loop keyframes: full recoil (ends where it starts), percent of the layer box', () => {
  const kf = loopKeyframes({ dy: 30, ease: 'push' }, [0, 0, 300, 600]);
  assert.equal(kf[0].transform, kf[kf.length - 1].transform);
  assert.equal(kf[1].transform, 'translate(0%,5%)');
  assert.equal(kf[0].offset, 0); assert.equal(kf[kf.length - 1].offset, 1);
  assert.equal(poseTransform({ sx: 0.98, sy: 0.99 }, 1, [0, 0, 10, 10]), 'scale(0.98,0.99)');
  assert.equal(poseTransform({ dx: 10, r: 4 }, -1, [0, 0, 100, 100]), 'translate(-10%,0%) rotate(-4deg)');
});
t('up/down swap: the down picture shows from half-way down to half-way back up, with short blends', () => {
  const kf = swapKeyframes('push', 1000, 80);
  assert.deepEqual(kf.map((f) => f.opacity), [0, 0, 1, 1, 0, 0]);
  near(kf[1].offset, 0.16); near(kf[2].offset, 0.24); near(kf[3].offset, 0.66); near(kf[4].offset, 0.74);
  const s = swapKeyframes('sine', 545, 80);
  assert.ok(s[2].offset <= 0.5 && s[3].offset >= 0.5, 'the count (beat at 0.5) falls while down shows');
  kf.forEach((f, i) => i && assert.ok(f.offset >= kf[i - 1].offset));
});
t('Persian digits in fa and ps, Latin in en', () => {
  assert.equal(num(30, 'fa'), '۳۰'); assert.equal(num(30, 'ps'), '۳۰'); assert.equal(num(30, 'en'), '30');
  assert.equal(fmtTime(65, 'fa'), '۱:۰۵'); assert.equal(fmtTime(9, 'en'), '0:09');
  assert.equal(label({ fa: '5 سانتی‌متر', en: '5 cm' }, 'fa'), '۵ سانتی‌متر');
  assert.equal(label({ en: '4 cm' }, 'ps'), '۴ cm');
});
const DATA = { w: 960, h: 720, frames: { a: [{ id: 'bg', box: [0, 0, 960, 720] }, { id: 'arms', box: [100, 100, 200, 300] }], b: [{ id: 'bg', box: [0, 0, 960, 720] }] }, scenes: [] };
t('scene plan: the counting must finish before the player moves on', () => {
  const sc = { frame: 'a', motions: [{ id: 'push', type: 'loop', layer: 'arms', dy: 10, rate: 110, count: 30, at: 500 }, { type: 'loop', layer: 'bg', s: 0.99, follow: 'push' }],
    overlays: [{ type: 'counter', follow: 'push' }, { type: 'ring', x: 1, y: 1, at: 200 }] };
  const P = plan(DATA, sc);
  near(P.end, 500 + 30 * 60000 / 110, 1); // the last push comes fully back up
  assert.equal(P.timing(sc.motions[1]).beats.length, 30, 'a follower moves with its leader');
  assert.equal(plan(DATA, Object.assign({}, sc, { wait: false })).end, 0);
});
t('endless loops, cameras and timers do not hold the scene (unless asked)', () => {
  const sc = { frame: 'a', cam: { path: [[0, 0, 960], [100, 100, 400]], ms: [20000] }, motions: [{ type: 'loop', layer: 'arms', dx: 5, rate: 60 }], overlays: [{ type: 'timer', to: 120 }] };
  assert.equal(plan(DATA, sc).end, 0);
  sc.overlays[0].wait = true; assert.equal(plan(DATA, sc).end, 120000);
});
t('default camera: a gentle push-in; cam false: none', () => {
  const c = cams({ ms: 9000 }, 960, 720);
  assert.equal(c.length, 2); near(c[1].t, 9000); assert.ok(c[1].r.w < 960);
  assert.equal(cams({ cam: false }, 960, 720).length, 0);
});
t('build: frames resolve to picture URLs with their version', () => {
  const d = build('x', { w: 960, h: 720, frames: { a: { layers: [{ id: 'bg', src: 'a-bg.webp', v: 'abc' }] } }, scenes: [{ id: 'anim.x.s1', frame: 'a' }] });
  assert.ok(d.cine && d.steps); assert.equal(d.id, 'anim.x');
  assert.match(d.data.frames.a[0].src, /img\/steps\/x\/a-bg\.webp\?v=abc$/);
  assert.throws(() => build('y', { w: 960, frames: {}, scenes: [] }));
});
console.log(`steps: ${n} tests passed`);

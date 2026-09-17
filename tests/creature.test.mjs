import test from 'node:test';
import assert from 'node:assert/strict';
import { Spec } from '../overlay/src/core/creature.js';
import { makeFrame, edgeStart, EDGE_BOTTOM, EDGE_RIGHT } from '../overlay/src/core/frames.js';
import { makeRng } from '../overlay/src/core/rng.js';

const BOUNDS = { x: 0, y: 0, w: 1600, h: 900 };
const screen = makeFrame('screen', BOUNDS, 'inner');

function walk(spec, { s, facing = 1, speed = 80, seconds = 4, look = null, posture = 'walk' }) {
  let cur = s;
  const dt = 1 / 60;
  for (let i = 0; i < seconds / dt; i++) {
    cur += speed * dt * facing;
    spec.update(dt, { mode: 'attached', frame: screen, s: cur, facing, speed, posture, look });
  }
  return spec.pose;
}

test('a walking body keeps its planted feet on the floor', () => {
  const spec = new Spec({ rng: makeRng(4), worldBounds: BOUNDS });
  const pose = walk(spec, { s: edgeStart(screen, EDGE_BOTTOM) + 300, facing: 1 });
  const planted = pose.limbs.filter((l) => l.planted);
  assert.ok(planted.length >= 2, 'at least two feet are on the ground at any time');
  for (const l of planted) {
    assert.ok(Math.abs(l.foot.y - 900) < 12, `foot at y=${l.foot.y.toFixed(1)} is off the floor`);
  }
});

test('feet are planted, not dragged', () => {
  const spec = new Spec({ rng: makeRng(5), worldBounds: BOUNDS });
  let s = edgeStart(screen, EDGE_BOTTOM) + 200;
  const dt = 1 / 60;
  let steps = 0;
  let prev = null;
  for (let i = 0; i < 240; i++) {
    s += 80 * dt;
    const pose = spec.update(dt, { mode: 'attached', frame: screen, s, facing: 1, speed: 80, posture: 'walk' });
    const stepping = pose.limbs.filter((l) => !l.planted).length;
    if (prev !== null && stepping > prev) steps++;
    prev = stepping;
  }
  assert.ok(steps >= 4, `expected a gait cycle, saw ${steps} steps`);
});

test('on a wall the body stands off the wall, not through it', () => {
  const spec = new Spec({ rng: makeRng(6), worldBounds: BOUNDS });
  const pose = walk(spec, { s: edgeStart(screen, EDGE_RIGHT) + 300, posture: 'cling' });
  for (const node of pose.spine) {
    assert.ok(node.x < 1600, 'body is inside the display');
    assert.ok(node.x < 1595, `body at x=${node.x.toFixed(1)} is inside the wall`);
  }
});

test('the head turns toward what SPEC is looking at', () => {
  const spec = new Spec({ rng: makeRng(7), worldBounds: BOUNDS });
  const s = edgeStart(screen, EDGE_BOTTOM) + 800;
  const target = { x: 500, y: 500 };
  const pose = walk(spec, { s, speed: 0, seconds: 2, look: target, posture: 'idle' });
  const want = Math.atan2(target.y - pose.head.y, target.x - pose.head.x);
  const diff = Math.abs(Math.atan2(Math.sin(want - pose.head.dir), Math.cos(want - pose.head.dir)));
  assert.ok(diff < 0.9, `head is ${diff.toFixed(2)}rad off its target`);
});

test('the tail stays on the desktop and out of the floor', () => {
  const spec = new Spec({ rng: makeRng(8), worldBounds: BOUNDS });
  const pose = walk(spec, { s: edgeStart(screen, EDGE_BOTTOM) + 120, seconds: 6 });
  for (const node of pose.tail) {
    assert.ok(node.y <= 901, `tail node at y=${node.y.toFixed(1)} went through the floor`);
    assert.ok(node.x >= -1 && node.x <= 1601, 'tail stayed on the desktop');
  }
});

test('the body survives a long frame without coming apart', () => {
  const spec = new Spec({ rng: makeRng(9), worldBounds: BOUNDS });
  let s = edgeStart(screen, EDGE_BOTTOM) + 400;
  for (let i = 0; i < 40; i++) {
    s += 90 * 0.25;
    spec.update(0.25, { mode: 'attached', frame: screen, s, facing: 1, speed: 90, posture: 'walk' });
  }
  for (const node of [...spec.pose.spine, ...spec.pose.tail]) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y));
  }
  const b = spec.bounds();
  assert.ok(b.w > 60 && b.w < 700, `body bounds look wrong: ${JSON.stringify(b)}`);
});

test('an airborne body has no feet on the ground', () => {
  const spec = new Spec({ rng: makeRng(10), worldBounds: BOUNDS });
  for (let i = 0; i < 60; i++) {
    spec.update(1 / 60, {
      mode: 'free',
      frame: null,
      speed: 400,
      posture: 'crouch',
      free: { x: 800, y: 300, vx: 200, vy: -100, angle: 0.4, spin: 0 },
    });
  }
  for (const l of spec.pose.limbs) {
    assert.ok(Number.isFinite(l.foot.x) && Number.isFinite(l.foot.y));
    assert.ok(Math.hypot(l.foot.x - 800, l.foot.y - 300) < 200, 'limbs stay with the body');
  }
});

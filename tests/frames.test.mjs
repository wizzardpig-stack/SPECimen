import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeFrame,
  pointAt,
  project,
  raycastFrames,
  nudgeOffCorner,
  edgeStart,
  wrapS,
  EDGE_BOTTOM,
  EDGE_LEFT,
} from '../overlay/src/core/frames.js';

const screen = makeFrame('screen', { x: 0, y: 0, w: 1920, h: 1080 }, 'inner');
const win = makeFrame('w1', { x: 400, y: 300, w: 600, h: 400 }, 'outer');

test('the inside of a display has its floor normal pointing up', () => {
  const floor = pointAt(screen, edgeStart(screen, EDGE_BOTTOM) + 400, 0);
  assert.equal(floor.y, 1080);
  assert.ok(floor.ny < -0.9, 'floor normal points up out of the floor');
});

test('the outside of a window has a walkable top and a hangable underside', () => {
  const top = pointAt(win, 300, 0);
  assert.deepEqual([top.x, top.y], [700, 300]);
  assert.ok(top.ny < -0.9);

  const under = pointAt(win, win.w + win.h + 300, 0);
  assert.equal(under.y, 700);
  assert.ok(under.ny > 0.9, 'underside normal points down');
});

test('arc positions wrap instead of running off the end of a surface', () => {
  assert.equal(wrapS(win, win.perimeter + 25), 25);
  assert.equal(wrapS(win, -25), win.perimeter - 25);
  const p = pointAt(win, win.perimeter * 3 + 10, 0);
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test('corner sampling turns the surface normal instead of snapping it', () => {
  const beforeCorner = pointAt(win, win.w - 2, 12);
  assert.ok(beforeCorner.nx > 0.1 && beforeCorner.ny < -0.1, 'normal is mid-turn at the corner');
});

test('projection finds the nearest point on the perimeter', () => {
  const p = project(win, 700, 100);
  assert.equal(p.x, 700);
  assert.equal(p.y, 300);
  assert.equal(p.dist, 200);
});

test('a falling body lands on the first surface it meets from the outside', () => {
  const hit = raycastFrames([screen, win], { x: 700, y: 100 }, { x: 700, y: 900 });
  assert.ok(hit);
  assert.equal(hit.frame.id, 'w1');
  assert.equal(hit.y, 300);
});

test('a surface being left behind is not a landing', () => {
  // Moving up away from the window top: the top face must not catch it.
  const hit = raycastFrames([win], { x: 700, y: 301 }, { x: 700, y: 120 });
  assert.equal(hit, null);
});

test('navigation targets are kept off the corners', () => {
  const cornerS = edgeStart(win, EDGE_LEFT) + 2;
  const nudged = nudgeOffCorner(win, cornerS, 25);
  assert.ok(nudged - edgeStart(win, EDGE_LEFT) >= 25);
});

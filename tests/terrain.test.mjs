import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../overlay/src/core/terrain.js';

const baseEnv = () => ({
  bounds: { x: 0, y: 0, w: 1600, h: 900 },
  displays: [{ id: 'primary', x: 0, y: 0, w: 1600, h: 900, scale: 1, primary: true }],
  taskbar: { x: 0, y: 856, w: 1600, h: 44 },
  windows: [
    { id: 1, app: 'chrome', title: 'Chrome', x: 150, y: 110, w: 760, h: 540, z: 0, focused: true },
    { id: 2, app: 'code', title: 'editor', x: 1000, y: 300, w: 540, h: 460, z: 1, focused: false },
  ],
});

test('the desktop becomes a small set of navigable surfaces', () => {
  const t = new Terrain();
  t.update(baseEnv());
  assert.deepEqual(
    t.frames.map((f) => f.id).sort(),
    ['screen:primary', 'taskbar', 'win:1', 'win:2'],
  );
  assert.equal(t.get('screen:primary').side, 'inner');
  assert.equal(t.get('win:1').side, 'outer');
});

test('slivers are not terrain', () => {
  const t = new Terrain();
  const env = baseEnv();
  env.windows.push({ id: 3, app: 'tip', title: 'tooltip', x: 10, y: 10, w: 90, h: 24, z: 2 });
  t.update(env);
  assert.equal(t.get('win:3'), null);
});

test('every surface is reachable from every other one', () => {
  const t = new Terrain();
  t.update(baseEnv());
  for (const f of t.frames) {
    assert.ok((t.links.get(f.id) || []).length > 0, `${f.id} has no links`);
  }
});

test('closing a window reports the surface as gone', () => {
  const t = new Terrain();
  t.update(baseEnv());
  const env = baseEnv();
  env.windows = env.windows.filter((w) => w.id !== 1);
  const events = t.update(env);
  assert.ok(events.some((e) => e.type === 'frame-removed' && e.id === 'win:1'));
});

test('moving a window reports the move, not a new surface', () => {
  const t = new Terrain();
  t.update(baseEnv());
  const env = baseEnv();
  env.windows[0].x += 120;
  const events = t.update(env);
  const moved = events.find((e) => e.type === 'frame-moved');
  assert.equal(moved.id, 'win:1');
  assert.equal(moved.to.x, 270);
  assert.ok(!events.some((e) => e.type === 'frame-added'));
});

test('hiding behind a window is occluded by it and by everything above it', () => {
  const t = new Terrain();
  t.update(baseEnv());
  const occ = t.occludersFor('win:2').map((f) => f.id);
  assert.deepEqual(occ.sort(), ['win:1', 'win:2']);
  assert.deepEqual(t.occludersFor('win:1').map((f) => f.id), ['win:1']);
});

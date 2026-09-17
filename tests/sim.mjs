// Headless simulation driver shared by the tests. No DOM, no canvas: the
// creature and behaviour modules are deliberately free of both.
import { Terrain } from '../overlay/src/core/terrain.js';
import { Behavior } from '../overlay/src/core/behavior.js';
import { Spec } from '../overlay/src/core/creature.js';
import { makeRng } from '../overlay/src/core/rng.js';

export function makeWorld({ seed = 7, bounds = { x: 0, y: 0, w: 1920, h: 1080 }, windows = null } = {}) {
  const rng = makeRng(seed);
  const terrain = new Terrain();
  const env = {
    bounds,
    displays: [{ id: 'primary', ...bounds, scale: 1, primary: true }],
    taskbar: { x: bounds.x, y: bounds.y + bounds.h - 48, w: bounds.w, h: 48 },
    windows: windows || [
      { id: 1, app: 'chrome', title: 'Chrome', x: 300, y: 180, w: 860, h: 620, z: 0, focused: true },
      { id: 2, app: 'code', title: 'Editor', x: 1180, y: 420, w: 620, h: 500, z: 1, focused: false },
    ],
    cursor: { x: 960, y: 540, down: false },
  };
  const events = terrain.update(env);
  const spec = new Spec({ rng, worldBounds: bounds });
  const behavior = new Behavior({ terrain, rng, spec });
  behavior.spawn();
  return { rng, terrain, spec, behavior, env, events };
}

export function step(world, dt, cursor) {
  const drive = world.behavior.update(dt, {
    cursor: cursor || world.env.cursor,
    events: world.pendingEvents || [],
  });
  world.pendingEvents = [];
  world.spec.update(dt, drive);
  return drive;
}

export function run(world, seconds, { dt = 1 / 60, cursor, onStep } = {}) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    const drive = step(world, dt, typeof cursor === 'function' ? cursor(i * dt) : cursor);
    if (onStep) onStep(i * dt, drive, world);
  }
}

export function applyEnv(world, env) {
  world.env = { ...world.env, ...env };
  world.pendingEvents = world.terrain.update(world.env);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, run, step, applyEnv } from './sim.mjs';
import { edgeAt } from '../overlay/src/core/frames.js';

const BOUNDS = { x: 0, y: 0, w: 1600, h: 900 };

function inBounds(p, slack = 60) {
  return (
    p.x > BOUNDS.x - slack &&
    p.x < BOUNDS.x + BOUNDS.w + slack &&
    p.y > BOUNDS.y - slack &&
    p.y < BOUNDS.y + BOUNDS.h + slack
  );
}

test('SPEC starts life attached to the ground', () => {
  const w = makeWorld({ bounds: BOUNDS });
  assert.ok(w.behavior.currentFrame);
  assert.equal(w.behavior.mode, 'attached');
});

for (const seed of [1, 17, 404]) {
  test(`ten minutes of unattended life stays on the desktop (seed ${seed})`, () => {
    const w = makeWorld({ seed, bounds: BOUNDS });
    const states = new Set();
    let worst = null;
    run(w, 600, {
      onStep: () => {
        states.add(w.behavior.state.name);
        const head = w.spec.headPoint();
        assert.ok(Number.isFinite(head.x) && Number.isFinite(head.y), 'pose stayed finite');
        if (!inBounds(head)) worst = head;
      },
    });
    assert.equal(worst, null, `SPEC left the desktop at ${JSON.stringify(worst)}`);
    // A creature that only ever idles is not alive.
    assert.ok(states.size >= 4, `only saw ${[...states]}`);
  });
}

test('the same seed lives the same life', () => {
  const trace = (seed) => {
    const w = makeWorld({ seed, bounds: BOUNDS });
    const out = [];
    run(w, 120, {
      onStep: (t) => {
        if (Math.round(t * 60) % 60 === 0) out.push(`${w.behavior.state.name}:${Math.round(w.behavior.s)}`);
      },
    });
    return out.join('|');
  };
  assert.equal(trace(99), trace(99));
  assert.notEqual(trace(99), trace(100));
});

test('SPEC falls when the surface under it disappears', () => {
  const w = makeWorld({ bounds: BOUNDS });
  const win = w.terrain.get('win:1');
  w.behavior.attach(win, win.w * 0.5, 1);
  w.behavior.setState('idle', { hold: 99 });
  step(w, 1 / 60);

  applyEnv(w, { windows: w.env.windows.filter((x) => x.id !== 1) });
  step(w, 1 / 60);
  assert.equal(w.behavior.state.name, 'fall');

  run(w, 6);
  assert.equal(w.behavior.mode, 'attached');
  assert.ok(inBounds(w.spec.headPoint()));
});

test('SPEC rides a window that moves under it', () => {
  const w = makeWorld({ bounds: BOUNDS });
  const win = w.terrain.get('win:1');
  w.behavior.attach(win, win.w * 0.5, 1);
  w.behavior.setState('idle', { hold: 99 });
  step(w, 1 / 60);
  const before = w.behavior.worldPoint();

  const moved = w.env.windows.map((x) => (x.id === 1 ? { ...x, x: x.x + 150, y: x.y - 40 } : x));
  applyEnv(w, { windows: moved });
  step(w, 1 / 60);

  assert.equal(w.behavior.currentFrame.id, 'win:1');
  const after = w.behavior.worldPoint();
  assert.ok(Math.abs(after.x - before.x - 150) < 6, 'kept its place on the surface');
  assert.ok(Math.abs(after.y - before.y + 40) < 6);
});

test('being thrown ends in a landing, not an escape', () => {
  const w = makeWorld({ bounds: BOUNDS });
  w.behavior.grab(800, 400);
  step(w, 1 / 60);
  assert.equal(w.behavior.state.name, 'held');
  w.behavior.release(2400, -1800);
  run(w, 8);
  assert.equal(w.behavior.mode, 'attached');
  assert.ok(inBounds(w.spec.headPoint()));
});

test('SPEC goes in one side of a window and comes out the other', () => {
  const w = makeWorld({ seed: 12, bounds: BOUNDS });
  const win = w.terrain.get('win:1');
  assert.ok(w.behavior.hideBehind(win));

  let entered = null;
  for (let i = 0; i < 60 * 60 && entered === null; i++) {
    step(w, 1 / 60);
    if (w.behavior.state.name === 'slip-in') entered = w.behavior.s;
  }
  assert.ok(entered !== null, 'never slipped in');
  const entryEdge = edgeAt(win, entered).edge;

  let emerged = null;
  for (let i = 0; i < 60 * 60 && emerged === null; i++) {
    step(w, 1 / 60);
    if (w.behavior.state.name === 'emerge') emerged = w.behavior.s;
  }
  assert.ok(emerged !== null, 'never came back out');
  assert.notEqual(edgeAt(win, emerged).edge, entryEdge, 'emerged on the side it went in');

  run(w, 4);
  assert.equal(w.behavior.behind, null, 'stopped being hidden');
});

test('SPEC does not walk off the visible desktop along a surface', () => {
  const w = makeWorld({ bounds: BOUNDS });
  const tb = w.terrain.get('taskbar');
  // Aim it at the underside of the taskbar, which is off-screen.
  w.behavior.attach(tb, tb.w + tb.h * 0.5, 1);
  w.behavior.setState('wander', { dir: 1, left: 4000 });
  run(w, 20);
  assert.ok(inBounds(w.spec.headPoint(), 40));
});

test('moving the window SPEC is hiding behind does not teleport it', async () => {
  const w = makeWorld({ seed: 21, bounds: BOUNDS });
  const win = w.terrain.get('win:1');
  w.behavior.hideBehind(win);
  for (let i = 0; i < 60 * 60 && w.behavior.behind === null; i++) step(w, 1 / 60);
  assert.equal(w.behavior.behind, 'win:1');

  const before = w.behavior.worldPoint();
  const moved = w.env.windows.map((x) => (x.id === 1 ? { ...x, x: x.x + 80 } : x));
  applyEnv(w, { windows: moved });
  step(w, 1 / 60);
  const after = w.behavior.worldPoint();
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < 90, 'stayed where it was');
  run(w, 3);
  assert.ok(inBounds(w.spec.headPoint()));
});

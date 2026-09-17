import { Terrain } from './core/terrain.js';
import { StableBehavior } from './core/stable-behavior.js';
import { StableSpec } from './core/stable-creature.js';
import { drawSpec } from './core/render.js';
import { makeRng, hashSeed } from './core/rng.js';
import { createHost } from './host/index.js';

const FPS_ACTIVE = 60;
const FPS_CALM = 30;

async function boot() {
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('spec');
  const ctx = canvas.getContext('2d');
  const host = await createHost(stage, {});

  const seedText = localStorage.getItem('specimen.seed') || String(Date.now());
  localStorage.setItem('specimen.seed', seedText);
  const rng = makeRng(hashSeed(seedText));

  const terrain = new Terrain();
  terrain.update(host.env);
  const spec = new StableSpec({ rng, scale: 1, worldBounds: terrain.bounds });
  const behavior = new StableBehavior({ terrain, rng, spec });
  behavior.spawn();

  const app = {
    host, terrain, spec, behavior, rng,
    stableRuntime: true,
    stats: { fps: 0, sim: 0, draw: 0 },
    paused: false,
    interactive: true,
  };
  globalThis.SPECIMEN = app;

  if (host.kind === 'tauri') {
    canvas.style.filter = 'brightness(1.16) contrast(0.84) saturate(1.06) drop-shadow(0 0 2px rgba(91,255,194,0.20))';
  }

  host.onEnv((env) => {
    terrain.update(env);
    spec.worldBounds = terrain.bounds;
    resize();
  });

  let dpr = 1;
  function resize() {
    const b = terrain.bounds;
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(b.w * dpr));
    const h = Math.max(1, Math.round(b.h * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${b.w}px`;
      canvas.style.height = `${b.h}px`;
    }
    setWorldTransform();
  }

  function setWorldTransform() {
    const b = terrain.bounds;
    ctx.setTransform(dpr, 0, 0, dpr, -b.x * dpr, -b.y * dpr);
  }
  resize();

  let holding = false;
  let lastPointer = null;
  let pointerVel = { x: 0, y: 0 };

  function localToWorld(x, y) {
    const b = terrain.bounds;
    return { x: x + b.x, y: y + b.y };
  }

  function overBody(x, y) {
    const p = localToWorld(x, y);
    const b = spec.bounds(8);
    if (p.x < b.x || p.y < b.y || p.x > b.x + b.w || p.y > b.y + b.h) return false;
    const head = spec.headPoint();
    const mid = spec.pose?.spine?.[5] || head;
    return Math.hypot(p.x - head.x, p.y - head.y) < 58 || Math.hypot(p.x - mid.x, p.y - mid.y) < 62;
  }

  window.addEventListener('pointerdown', (e) => {
    if (!overBody(e.clientX, e.clientY)) return;
    const p = localToWorld(e.clientX, e.clientY);
    holding = true;
    lastPointer = { ...p, t: performance.now() };
    behavior.grab(p.x, p.y);
    e.preventDefault();
  });

  window.addEventListener('pointermove', (e) => {
    if (!holding) return;
    const p = localToWorld(e.clientX, e.clientY);
    const now = performance.now();
    const dt = Math.max(1, now - lastPointer.t) / 1000;
    pointerVel = { x: (p.x - lastPointer.x) / dt, y: (p.y - lastPointer.y) / dt };
    lastPointer = { ...p, t: now };
    behavior.dragTo(p.x, p.y);
  });

  window.addEventListener('pointerup', () => {
    if (!holding) return;
    holding = false;
    behavior.release(pointerVel.x, pointerVel.y);
  });

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (app.paused) return;
    const elapsed = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    acc += elapsed;
    const active = holding || behavior.mode !== 'attached' || Math.abs(behavior.speed) > 3 || behavior.alert > 0.2;
    const interval = 1 / (active ? FPS_ACTIVE : FPS_CALM);
    if (acc < interval) return;
    const span = Math.min(0.08, acc);
    acc = 0;
    const steps = Math.max(1, Math.ceil(span / 0.025));
    const dt = span / steps;
    for (let i = 0; i < steps; i++) {
      const drive = behavior.update(dt, { cursor: host.cursor });
      spec.update(dt, drive);
    }
    draw();
  }

  function draw() {
    // Always clear in physical-canvas coordinates. This avoids WebView2's
    // transparent dirty-rectangle ghosts without prototype monkey patches.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setWorldTransform();

    drawSpec(ctx, spec.pose, { time: spec.t, shadows: true });

    if (host.kind === 'tauri') {
      const hit = spec.bounds(12);
      host.setHitRect(app.interactive ? hit : null);
    }
  }

  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error('SPECIMEN stable runtime failed to boot', err);
});

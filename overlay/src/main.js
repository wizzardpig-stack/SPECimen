// SPECIMEN overlay entry point.
//
// Owns the canvas, the frame budget and the pointer, and wires the host
// snapshots into terrain -> behaviour -> body -> pixels.

import { Terrain } from './core/terrain.js';
import { Behavior } from './core/behavior.js';
import { Spec } from './core/creature.js';
import { drawSpec, applyOccluders } from './core/render.js';
import { makeRng, hashSeed } from './core/rng.js';
import { createHost } from './host/index.js';
import { mountDevConsole } from './core/dev.js';
import { firstBuildDemo } from './core/demo.js';

const params = new URLSearchParams(location.search);

// Frame budget. SPEC is mostly still, and a still organism should not cost a
// desktop 60fps of compositing (PRD 30).
const FPS_ACTIVE = 60;
const FPS_CALM = 20;
const FPS_DORMANT = 7;

async function boot() {
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('spec');
  const ctx = canvas.getContext('2d');

  const host = await createHost(stage, {});
  const seedText = localStorage.getItem('specimen.seed') || String(Date.now());
  localStorage.setItem('specimen.seed', seedText);
  const rng = makeRng(hashSeed(seedText));

  const terrain = new Terrain();
  let pendingEvents = terrain.update(host.env);

  const spec = new Spec({ rng, scale: Number(params.get('scale')) || 1, worldBounds: terrain.bounds });
  const behavior = new Behavior({ terrain, rng, spec });
  behavior.spawn();

  const app = {
    host,
    terrain,
    spec,
    behavior,
    rng,
    debug: { frames: false, links: false, pose: false, stats: false },
    stats: { fps: 0, sim: 0, draw: 0, drawn: 0, skipped: 0 },
    paused: false,
    interactive: true,
    recorder: null,
    playback: null,
  };
  window.SPECIMEN = app;

  host.onEnv((env) => {
    const events = terrain.update(env);
    if (events.length) pendingEvents = pendingEvents.concat(events);
    spec.worldBounds = terrain.bounds;
    resize();
  });

  let dpr = 1;
  function resize() {
    const b = terrain.bounds;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(b.w * dpr);
    const h = Math.round(b.h * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${b.w}px`;
      canvas.style.height = `${b.h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, -b.x * dpr, -b.y * dpr);
  }
  resize();
  window.addEventListener('resize', () => {
    if (host.kind === 'mock') {
      host.env.bounds = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
      host.emit();
    }
    resize();
  });

  // ------------------------------------------------------------- pointer
  // Only SPEC's own body is interactive. In the real overlay the host has
  // already made everything else click-through; this is the second gate.
  let holding = false;
  let lastPointer = null;
  let pointerVel = { x: 0, y: 0 };

  const overBody = (x, y) => {
    const b = spec.bounds(6);
    if (x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) return false;
    const head = spec.headPoint();
    const mid = spec.pose ? spec.pose.spine[5] : head;
    return Math.hypot(x - head.x, y - head.y) < 52 || Math.hypot(x - mid.x, y - mid.y) < 52;
  };

  // The overlay itself is pointer-transparent, so this listens at the window:
  // in the real build the OS only delivers events here when the pointer is
  // inside the hit rect the host was given (PRD 32).
  window.addEventListener('pointerdown', (e) => {
    if (!app.interactive || app.devOpen === true && e.target.closest?.('.dev')) return;
    if (!overBody(e.clientX, e.clientY)) return;
    holding = true;
    lastPointer = { x: e.clientX, y: e.clientY, t: performance.now() };
    behavior.grab(e.clientX, e.clientY);
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => {
    if (!holding) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastPointer.t) / 1000;
    pointerVel = { x: (e.clientX - lastPointer.x) / dt, y: (e.clientY - lastPointer.y) / dt };
    lastPointer = { x: e.clientX, y: e.clientY, t: now };
    behavior.dragTo(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', () => {
    if (!holding) return;
    holding = false;
    behavior.release(pointerVel.x, pointerVel.y);
  });

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let acc = 0;
  let fpsAcc = 0;
  let fpsCount = 0;
  let prevDirty = null;

  function targetFps() {
    const st = behavior.state.name;
    if (holding || behavior.alert > 0.3 || Math.abs(behavior.speed) > 3 || behavior.mode === 'free') {
      return FPS_ACTIVE;
    }
    if (st === 'sleep' || (behavior.behind && !spec.visible)) return FPS_DORMANT;
    return FPS_CALM;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = (now - last) / 1000;
    last = now;
    if (app.paused) return;
    acc += elapsed;
    const interval = 1 / targetFps();
    if (acc < interval) return;
    // Simulated time must track wall-clock time even when the frame budget is
    // low, or a resting SPEC would live in slow motion. Long gaps are covered
    // by a few fixed sub-steps rather than one unstable large one.
    const span = Math.min(0.25, acc);
    acc = 0;
    const steps = Math.max(1, Math.min(5, Math.ceil(span / 0.05)));
    const dt = span / steps;

    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
      if (app.playback) {
        stepPlayback(app, dt);
      } else {
        const drive = behavior.update(dt, { cursor: host.cursor, events: pendingEvents });
        pendingEvents = [];
        spec.update(dt, drive);
        if (app.recorder) app.recorder.push({ dt, drive: serialiseDrive(drive) });
      }
    }
    const t1 = performance.now();

    draw();
    const t2 = performance.now();

    app.stats.sim = app.stats.sim * 0.9 + (t1 - t0) * 0.1;
    app.stats.draw = app.stats.draw * 0.9 + (t2 - t1) * 0.1;
    fpsAcc += elapsed;
    fpsCount++;
    if (fpsAcc > 0.5) {
      app.stats.fps = fpsCount / fpsAcc;
      fpsAcc = 0;
      fpsCount = 0;
    }
  }

  function draw() {
    const b = terrain.bounds;
    const dirty = spec.bounds(40);
    const clear = prevDirty ? union(prevDirty, dirty) : { x: b.x, y: b.y, w: b.w, h: b.h };
    ctx.clearRect(clear.x - 2, clear.y - 2, clear.w + 4, clear.h + 4);
    prevDirty = dirty;

    if (app.debug.frames || app.debug.links) drawDebugTerrain(ctx, terrain, app.debug);

    const occluders = behavior.behind ? terrain.occludersFor(behavior.behind) : [];
    spec.visible = !fullyCovered(dirty, occluders);

    if (spec.visible || occluders.length === 0) {
      drawSpec(ctx, spec.pose, { time: spec.t });
      app.stats.drawn++;
    } else {
      app.stats.skipped++;
    }
    if (occluders.length) applyOccluders(ctx, occluders);
    if (app.debug.pose) drawPoseDebug(ctx, spec.pose);

    if (!app.devOpen) host.setHitRect(app.interactive ? spec.bounds(10) : null);
  }

  requestAnimationFrame(frame);

  // ----------------------------------------------------------------- dev
  if (params.get('dev') === '1' || host.kind === 'mock') mountDevConsole(app);
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyD') mountDevConsole(app, true);
  });

  app.runFirstBuildDemo = () => behavior.playScript(firstBuildDemo(behavior, terrain));
  if (params.get('demo') === '1') app.runFirstBuildDemo();
}

function serialiseDrive(drive) {
  return {
    ...drive,
    frame: drive.frame ? drive.frame.id : null,
    free: { ...drive.free },
    look: drive.look ? { ...drive.look } : null,
  };
}

function stepPlayback(app, dt) {
  const pb = app.playback;
  const entry = pb.frames[pb.i++];
  if (!entry) {
    app.playback = null;
    return;
  }
  const drive = { ...entry.drive };
  drive.frame = drive.frame ? app.terrain.get(drive.frame) || app.behavior.frame : null;
  if (!drive.frame) drive.mode = 'free';
  app.spec.update(entry.dt, drive);
}

function union(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function fullyCovered(rect, occluders) {
  for (const r of occluders) {
    if (rect.x >= r.x && rect.y >= r.y && rect.x + rect.w <= r.x + r.w && rect.y + rect.h <= r.y + r.h) {
      return true;
    }
  }
  return false;
}

function drawDebugTerrain(ctx, terrain, debug) {
  ctx.save();
  if (debug.frames) {
    ctx.lineWidth = 1;
    for (const f of terrain.frames) {
      ctx.strokeStyle = f.meta.type === 'display' ? 'rgba(61,255,166,0.35)' : 'rgba(120,180,255,0.4)';
      ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
    }
  }
  if (debug.links) {
    ctx.strokeStyle = 'rgba(255,190,90,0.35)';
    ctx.setLineDash([4, 4]);
    for (const [, list] of terrain.links) {
      for (const link of list) {
        const a = terrain.get(link.from);
        const b = terrain.get(link.to);
        if (!a || !b) continue;
        const pa = pointOn(a, link.fromS);
        const pb = pointOn(b, link.toS);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function pointOn(frame, s) {
  const p = s % frame.perimeter;
  if (p < frame.w) return { x: frame.x + p, y: frame.y };
  if (p < frame.w + frame.h) return { x: frame.x + frame.w, y: frame.y + (p - frame.w) };
  if (p < frame.w * 2 + frame.h) return { x: frame.x + frame.w - (p - frame.w - frame.h), y: frame.y + frame.h };
  return { x: frame.x, y: frame.y + frame.h - (p - frame.w * 2 - frame.h) };
}

function drawPoseDebug(ctx, pose) {
  if (!pose) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,60,120,0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  pose.spine.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,170,255,0.85)';
  ctx.beginPath();
  pose.tail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,220,60,0.9)';
  for (const l of pose.limbs) ctx.fillRect(l.foot.x - 2, l.foot.y - 2, 4, 4);
  ctx.fillStyle = 'rgba(120,255,180,0.9)';
  for (const p of pose.spine) ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  ctx.restore();
}

boot();

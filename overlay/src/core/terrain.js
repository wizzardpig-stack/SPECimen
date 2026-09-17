// Terrain turns a host environment snapshot (displays, windows, taskbar) into
// the set of Frames SPEC can physically occupy, and keeps that set stable while
// the desktop moves underneath it.
//
// Nothing here touches the real desktop. Window rectangles are read-only
// observations; SPEC never moves, resizes or closes anything (PRD 4).

import { makeFrame, project, pointAt, containsPoint, rectOf, nudgeOffCorner } from './frames.js';

const MIN_WINDOW = 120; // ignore slivers and tooltips as terrain

export function surfaceKind(sample) {
  if (sample.ny < -0.55) return 'ground';
  if (sample.ny > 0.55) return 'ceiling';
  return 'wall';
}

export class Terrain {
  constructor() {
    this.frames = [];
    this.byId = new Map();
    /** Window records in z order, index 0 = topmost. */
    this.windows = [];
    this.bounds = { x: 0, y: 0, w: 1920, h: 1080 };
    this.links = new Map();
    this.revision = 0;
    this.lastEvents = [];
  }

  /**
   * Rebuild frames from a snapshot.
   * Returns the list of change events so behaviour can react to a surface
   * vanishing (PRD 9: "fall when a visual surface disappears").
   */
  update(env) {
    const prev = this.byId;
    const frames = [];
    const byId = new Map();
    const events = [];

    this.bounds = env.bounds || this.bounds;

    const displays = env.displays && env.displays.length
      ? env.displays
      : [{ id: 'primary', ...this.bounds, scale: 1, primary: true }];

    for (const d of displays) {
      const f = makeFrame(`screen:${d.id}`, d, 'inner', {
        type: 'display',
        scale: d.scale || 1,
        primary: !!d.primary,
      });
      frames.push(f);
      byId.set(f.id, f);
    }

    if (env.taskbar && env.taskbar.w > 0 && env.taskbar.h > 0) {
      const f = makeFrame('taskbar', env.taskbar, 'outer', { type: 'taskbar' });
      frames.push(f);
      byId.set(f.id, f);
    }

    this.windows = [];
    const wins = (env.windows || []).slice().sort((a, b) => a.z - b.z);
    for (const w of wins) {
      if (w.w < MIN_WINDOW || w.h < MIN_WINDOW) continue;
      const f = makeFrame(`win:${w.id}`, w, 'outer', {
        type: 'window',
        app: w.app || '',
        title: w.title || '',
        z: w.z,
        focused: !!w.focused,
      });
      frames.push(f);
      byId.set(f.id, f);
      this.windows.push(f);
    }

    for (const [id, old] of prev) {
      const now = byId.get(id);
      if (!now) {
        events.push({ type: 'frame-removed', id, frame: old });
      } else if (old.x !== now.x || old.y !== now.y || old.w !== now.w || old.h !== now.h) {
        events.push({ type: 'frame-moved', id, from: rectOf(old), to: rectOf(now), frame: now });
      }
    }
    for (const [id, f] of byId) {
      if (!prev.has(id)) events.push({ type: 'frame-added', id, frame: f });
    }

    this.frames = frames;
    this.byId = byId;
    this.buildLinks();
    this.revision++;
    this.lastEvents = events;
    return events;
  }

  /**
   * Connectivity between frames: which surfaces SPEC can step across to, leap
   * to, or drop onto. Rebuilt whenever the desktop changes; there are only ever
   * a handful of frames, so this stays cheap.
   */
  buildLinks() {
    const SAMPLES = 40;
    const STEP = 38;
    const JUMP = 230;
    const DROP = 820;
    const links = new Map();
    for (const f of this.frames) links.set(f.id, []);

    for (const a of this.frames) {
      for (const b of this.frames) {
        if (a === b) continue;
        let best = null;
        for (let i = 0; i < SAMPLES; i++) {
          const s = (i / SAMPLES) * a.perimeter;
          const pa = pointAt(a, s, 0);
          const pb = project(b, pa.x, pa.y);
          if (!best || pb.dist < best.dist) best = { dist: pb.dist, fromS: s, toS: pb.s, dy: pb.y - pa.y };
        }
        if (!best) continue;
        let kind = null;
        if (best.dist <= STEP) kind = 'step';
        else if (best.dist <= JUMP) kind = 'jump';
        else if (best.dy > 60 && best.dist <= DROP) kind = 'drop';
        if (!kind) continue;
        const cost =
          kind === 'step' ? best.dist + 4 : kind === 'jump' ? best.dist * 1.6 + 120 : best.dist * 0.6 + 60;
        links.get(a.id).push({
          from: a.id,
          to: b.id,
          fromS: nudgeOffCorner(a, best.fromS, 18),
          toS: nudgeOffCorner(b, best.toS, 28),
          dist: best.dist,
          kind,
          cost,
        });
      }
    }
    this.links = links;
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  displayAt(x, y) {
    for (const f of this.frames) {
      if (f.meta.type === 'display' && containsPoint(f, x, y)) return f;
    }
    return this.frames.find((f) => f.meta.type === 'display') || null;
  }

  /** The frame SPEC treats as the floor of the display it is standing in. */
  groundFrame(x, y) {
    const tb = this.get('taskbar');
    if (tb && x >= tb.x - 40 && x <= tb.x + tb.w + 40) return tb;
    return this.displayAt(x, y);
  }

  /**
   * Attachment points on *other* frames within reach of a world point.
   * This is how SPEC steps from the floor onto a window edge, or from a window
   * across to the screen wall, without any pathfinding graph.
   */
  transfersNear(x, y, reach, excludeId = null) {
    const out = [];
    for (const f of this.frames) {
      if (f.id === excludeId) continue;
      const p = project(f, x, y);
      if (p.dist > reach) continue;
      const sample = pointAt(f, p.s);
      out.push({ frame: f, s: p.s, dist: p.dist, sample, kind: surfaceKind(sample) });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  /** Windows that would visually cover SPEC while it is behind `windowFrame`. */
  occludersFor(windowFrameId) {
    if (!windowFrameId) return [];
    const target = this.get(windowFrameId);
    if (!target || target.meta.type !== 'window') return [];
    const z = target.meta.z;
    return this.windows.filter((f) => f.meta.z <= z);
  }

  /** A window SPEC could plausibly investigate, preferring nearby and large. */
  pickWindow(rng, x, y) {
    if (!this.windows.length) return null;
    const entries = this.windows.map((f) => {
      const p = project(f, x, y);
      const area = f.w * f.h;
      const weight = (1 / (1 + p.dist / 400)) * Math.min(2, area / 400000 + 0.4);
      return [f, weight];
    });
    return rng.weighted(entries);
  }
}

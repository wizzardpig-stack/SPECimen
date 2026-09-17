// What SPEC does, and why.
//
// This is deliberately not an AI. It is a small state machine over the terrain
// graph plus a handful of hidden drives. Phase 1/2 of the PRD: SPEC should
// already be interesting with zero intelligence (PRD 34), and most of its time
// should be spent doing nothing dramatic (PRD 3).
//
// Memory, habitat weighting, routine learning, prediction, molting and
// INCIDENTS are explicitly NOT here. They are later phases and are not faked.

import { makeFrame, pointAt, project, raycastFrames, wrapS, clamp } from './frames.js';
import { surfaceKind } from './terrain.js';
import { noise1 } from './rng.js';

const GRAVITY = 2400;
const STEP_REACH = 38;
const JUMP_REACH = 230;

const SPEEDS = {
  ground: 74,
  wall: 58,
  ceiling: 46,
  sneak: 26,
  travel: 128,
  dash: 190,
};

export class Behavior {
  constructor({ terrain, rng, spec, personality }) {
    this.terrain = terrain;
    this.rng = rng;
    this.spec = spec;

    // Hidden traits. Never surfaced in normal mode (PRD 27).
    this.personality = personality || {
      curiosity: rng.range(0.3, 0.9),
      boldness: rng.range(0.2, 0.8),
      caution: rng.range(0.2, 0.8),
      restlessness: rng.range(0.2, 0.9),
      territoriality: rng.range(0.1, 0.7),
    };

    this.mode = 'attached';
    this.frame = null;
    this.ghost = null; // synthetic frame used while behind a window
    this.behind = null; // window frame id SPEC is currently hidden behind
    this.s = 0;
    this.facing = 1;
    this.speed = 0;
    this.free = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 };

    this.state = { name: 'boot', t: 0 };
    this.stateTime = 0;
    this.plan = [];
    this.goal = null;
    this.goalAttempts = 0;

    this.observer = 0; // observer pressure (PRD 12)
    this.startle = 0;
    this.fear = 0;
    this.alert = 0;
    this.charge = 0.45;
    this.look = null;
    this.compress = 0;
    this.headPitch = 0;
    this.cursorHistory = [];
    this.lastCursor = null;
    this.scripted = null;
    this.log = [];
  }

  // ---------------------------------------------------------------- helpers

  get currentFrame() {
    return this.ghost && this.ghost.active ? this.ghost.frame : this.frame;
  }

  sample(sOffset = 0) {
    const f = this.currentFrame;
    if (!f) return null;
    return pointAt(f, this.s + sOffset, 12);
  }

  worldPoint() {
    if (this.mode === 'free') return { x: this.free.x, y: this.free.y };
    const p = this.sample();
    return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
  }

  setState(name, data = {}) {
    if (this.state.name !== name) {
      this.log.push({ t: Math.round(performance.now?.() || 0), from: this.state.name, to: name });
      if (this.log.length > 60) this.log.shift();
    }
    this.state = { name, t: 0, ...data };
    this.stateTime = 0;
  }

  attach(frame, s, facing = this.facing) {
    this.mode = 'attached';
    this.frame = frame;
    this.s = wrapS(frame, s);
    this.facing = facing >= 0 ? 1 : -1;
  }

  /** Drop the organism into the world at a sensible starting place. */
  spawn() {
    const t = this.terrain;
    const ground = t.groundFrame(t.bounds.x + t.bounds.w * 0.5, t.bounds.y + t.bounds.h - 10);
    if (!ground) return;
    if (ground.side === 'inner') {
      // Bottom edge of the display, a third of the way in.
      const s = ground.w + ground.h + ground.w * 0.55;
      this.attach(ground, s, 1);
    } else {
      this.attach(ground, ground.w * 0.5, 1);
    }
    this.setState('idle', { hold: 1.5 });
  }

  // ------------------------------------------------------------ navigation

  /** Shortest signed arc from the current position to `s` on the same frame. */
  deltaTo(s) {
    const f = this.currentFrame;
    const half = f.perimeter / 2;
    return wrapS(f, s - this.s + half) - half;
  }

  /**
   * Route to another frame, accounting for how far SPEC has to walk along each
   * surface as well as the gaps between them. Search nodes are arrival points
   * (frame + arc position), not frames, because entering a window at its top
   * left corner and at its bottom right corner are very different journeys.
   */
  route(toFrameId, toS = null) {
    const links = this.terrain.links;
    const from = this.currentFrame;
    if (!from || !links) return null;

    const arc = (frame, a, b) => {
      const half = frame.perimeter / 2;
      return Math.abs(wrapS(frame, b - a + half) - half);
    };

    const start = { key: 'start', frameId: from.id, s: this.s, cost: 0, prev: null, link: null };
    const best = new Map([[start.key, start]]);
    const open = [start];
    let goal = null;

    const consider = (node) => {
      if (node.frameId !== toFrameId) return;
      const frame = this.terrain.get(toFrameId);
      const extra = toS === null || !frame ? 0 : arc(frame, node.s, toS);
      const total = node.cost + extra;
      if (!goal || total < goal.total) goal = { node, total };
    };
    consider(start);

    while (open.length) {
      open.sort((a, b) => a.cost - b.cost);
      const node = open.shift();
      if (goal && node.cost >= goal.total) break;
      const frame = this.terrain.get(node.frameId);
      if (!frame) continue;
      for (const link of links.get(node.frameId) || []) {
        const cost = node.cost + arc(frame, node.s, link.fromS) + link.cost;
        const key = `${link.from}|${link.to}|${Math.round(link.fromS)}`;
        const existing = best.get(key);
        if (existing && existing.cost <= cost) continue;
        const next = { key, frameId: link.to, s: link.toS, cost, prev: node, link };
        best.set(key, next);
        open.push(next);
        consider(next);
      }
    }

    if (!goal) return null;
    const hops = [];
    for (let n = goal.node; n && n.link; n = n.prev) hops.unshift(n.link);
    return hops;
  }

  travelTo(frameId, s, purpose = 'explore') {
    const hops = this.route(frameId, s);
    if (hops === null) return false;
    if (!this.goal || this.goal.frameId !== frameId) this.goalAttempts = 0;
    this.plan = hops.slice();
    this.goal = { frameId, s, purpose };
    this.setState('travel');
    return true;
  }

  // ------------------------------------------------------------- reactions

  /** The surface SPEC was standing on vanished (window closed / minimised). */
  onSurfaceLost() {
    this.detach(this.facing * 40, -120, 6);
    this.setState('fall', { panic: 1 });
    this.fear = Math.min(1, this.fear + 0.5);
  }

  detach(vx = 0, vy = 0, clearance = 0) {
    const p = this.sample() || { x: 0, y: 0, tx: 1, ty: 0, nx: 0, ny: -1 };
    this.mode = 'free';
    // Push off the surface before going ballistic, or the very first collision
    // test lands SPEC straight back onto the surface it just left.
    this.free.x = p.x + (p.nx || 0) * clearance;
    this.free.y = p.y + (p.ny || 0) * clearance;
    this.free.vx = vx;
    this.free.vy = vy;
    this.free.angle = Math.atan2(p.ty * this.facing, p.tx * this.facing);
    this.free.spin = 0;
    this.ghost = null;
  }

  grab(x, y) {
    this.detach(0, 0);
    this.setState('held');
    this.free.x = x;
    this.free.y = y;
    this.behind = null;
    this.fear = Math.min(1, this.fear + 0.25);
  }

  dragTo(x, y) {
    if (this.state.name !== 'held') return;
    const dx = x - this.free.x;
    const dy = y - this.free.y;
    this.free.vx = dx * 30;
    this.free.vy = dy * 30;
    this.free.x = x;
    this.free.y = y;
    this.free.angle += clamp(dx * 0.004, -0.08, 0.08);
  }

  release(vx, vy) {
    if (this.state.name !== 'held') return;
    this.free.vx = clamp(vx, -2600, 2600);
    this.free.vy = clamp(vy, -2600, 2600);
    this.free.spin = clamp(vx * 0.004, -9, 9);
    this.setState('fall', { thrown: true });
  }

  // ----------------------------------------------------------------- tick

  update(dt, ctx) {
    this.dt = dt;
    this.stateTime += dt;
    this.state.t = this.stateTime;

    this.trackCursor(dt, ctx.cursor);
    this.handleTerrainEvents(ctx.events);

    if (this.scripted) this.runScript(dt);

    const fn = this[`state_${this.state.name.replace(/-/g, '_')}`];
    if (fn) fn.call(this, dt, ctx);
    else this.setState('idle', { hold: 2 });

    this.fear = Math.max(0, this.fear - dt * 0.25);
    this.startle = Math.max(0, this.startle - dt * 1.4);
    this.alert += ((this.observer > 0.45 || this.startle > 0.2 ? 1 : 0) - this.alert) * Math.min(1, dt * 4);

    return this.drive();
  }

  /** Assemble the per-frame drive for the body. */
  drive() {
    const f = this.currentFrame;
    const sample = this.mode === 'attached' && f ? pointAt(f, this.s, 12) : null;
    const kind = sample ? surfaceKind(sample) : 'ground';
    const moving = Math.abs(this.speed) > 4;

    let posture = 'idle';
    if (this.mode === 'free') posture = this.state.name === 'held' ? 'cling' : 'crouch';
    else if (this.state.name === 'sleep') posture = 'sleep';
    else if (this.state.name === 'recover') posture = 'crouch';
    else if (kind !== 'ground') posture = 'cling';
    else if (moving) posture = Math.abs(this.speed) < 40 ? 'crawl' : 'walk';

    const charge =
      this.state.name === 'sleep'
        ? 0.06
        : this.fear > 0.5
          ? 0.1
          : clamp(0.3 + this.alert * 0.45 + Math.abs(this.speed) / 400, 0, 1);
    this.charge += (charge - this.charge) * Math.min(1, 3 * (this.dt || 0.016));

    return {
      mode: this.mode,
      frame: f,
      s: this.s,
      facing: this.facing,
      speed: this.speed,
      free: this.free,
      posture,
      look: this.look,
      compress: this.compress,
      charge: this.charge,
      fear: this.fear,
      alert: this.alert,
      headPitch: this.headPitch,
    };
  }

  // -------------------------------------------------------------- senses

  trackCursor(dt, cursor) {
    if (!cursor) {
      this.look = null;
      return;
    }
    const here = this.spec && this.spec.pose ? this.spec.headPoint() : this.worldPoint();
    const d = Math.hypot(cursor.x - here.x, cursor.y - here.y);
    const prev = this.lastCursor;
    const moved = prev ? Math.hypot(cursor.x - prev.x, cursor.y - prev.y) : 0;
    this.lastCursor = { x: cursor.x, y: cursor.y };

    // Observer pressure: the cursor lingering near SPEC, or following it.
    const near = d < 260;
    const following = near && moved > 0.6;
    const delta = following ? dt * 0.55 : near ? dt * 0.22 : -dt * 0.4;
    this.observer = clamp(this.observer + delta, 0, 1);

    if (d < 130 && moved > 22) this.startle = Math.min(1, this.startle + 0.5);

    // Head tracking: SPEC watches the cursor when it is within its interest
    // radius, and goes back to scanning its surroundings when it is not.
    const interest = 120 + this.personality.curiosity * 420;
    if (d < interest || this.state.name === 'watch' || this.state.name === 'held') {
      this.look = { x: cursor.x, y: cursor.y };
    } else if (this.look) {
      this.look = null;
    }
  }

  handleTerrainEvents(events) {
    if (!events || !events.length) return;
    for (const ev of events) {
      const curId = this.frame ? this.frame.id : null;
      if (ev.type === 'frame-removed') {
        if (ev.id === curId) {
          this.frame = null;
          this.onSurfaceLost();
        }
        if (this.behind === ev.id) this.behind = null;
        if (this.ghost && this.ghost.ownerId === ev.id) this.ghost = null;
        this.plan = this.plan.filter((h) => h.to !== ev.id && h.from !== ev.id);
      } else if (ev.type === 'frame-moved') {
        if (this.ghost && this.ghost.ownerId === ev.id) {
          // The window SPEC is hidden behind moved. Keep it where it was in
          // world space rather than letting it pop out somewhere else.
          const here = this.worldPoint();
          this.ghost = null;
          this.frame = ev.frame;
          this.s = project(ev.frame, here.x, here.y).s;
        } else if (ev.id === curId) {
          // SPEC rides the surface: keep arc position, clamp to the new size.
          this.frame = ev.frame;
          this.s = wrapS(ev.frame, this.s);
        }
      }
    }
  }

  // --------------------------------------------------------------- motion

  /** Walk along the current frame. Returns distance actually moved. */
  advance(dt, speed, dir = this.facing) {
    const f = this.currentFrame;
    if (!f) return 0;
    const sample = pointAt(f, this.s, 12);
    const kind = surfaceKind(sample);
    const factor = kind === 'ground' ? 1 : kind === 'wall' ? 0.78 : 0.62;
    const step = speed * factor * dt * (dir >= 0 ? 1 : -1);
    const next = wrapS(f, this.s + step);

    // Surfaces can continue outside the visible desktop — the underside of the
    // taskbar, a window pushed past the screen edge. Those faces are not real
    // terrain, so SPEC stops at the boundary instead of crawling off-screen.
    // Test where the body would sit, not the contact point: standing on the
    // underside of the taskbar puts the contact point on-screen and the whole
    // organism off it.
    const p = pointAt(f, next, 12);
    const bx = p.x + p.nx * 26;
    const by = p.y + p.ny * 26;
    const b = this.terrain.bounds;
    const pad = 6;
    if (bx < b.x - pad || bx > b.x + b.w + pad || by < b.y - pad || by > b.y + b.h + pad) {
      this.blocked = true;
      this.speed = 0;
      return 0;
    }

    this.blocked = false;
    this.s = next;
    this.facing = dir >= 0 ? 1 : -1;
    this.speed = Math.abs(speed * factor);
    return Math.abs(step);
  }

  stop() {
    this.speed = 0;
  }

  /** Execute one hop of the current plan. */
  takeHop(hop) {
    const to = this.terrain.get(hop.to);
    if (!to) {
      this.plan = [];
      return;
    }
    if (hop.kind === 'step') {
      const from = this.sample();
      this.attach(to, hop.toS, this.facingForTransfer(to, hop.toS, from));
      this.compress = 0.35;
    } else {
      // Jump or drop: leave the surface and let physics decide where it lands.
      // The arc is solved so its apex clears the target, otherwise SPEC stalls
      // exactly at the lip of the surface it was aiming for.
      const target = pointAt(to, hop.toS, 12);
      const here = this.worldPoint();
      const from = this.sample() || { nx: 0, ny: -1 };
      const dx = target.x - here.x;
      const dy = target.y - here.y;
      // Drops are released, not launched; leaps are solved so the apex clears
      // the target, otherwise SPEC stalls at the lip of the surface it wants.
      const margin = hop.kind === 'drop' || dy > 0 ? 0 : 46;
      const rise = Math.max(0, -dy) + margin;
      const tUp = Math.sqrt((2 * rise) / GRAVITY);
      const tDown = Math.sqrt((2 * Math.max(6, rise + dy)) / GRAVITY);
      const tFlight = Math.max(0.16, tUp + tDown);
      const push = hop.kind === 'drop' ? 60 : 110;
      const vx = clamp(dx / tFlight, -1500, 1500) + from.nx * push;
      const vy = -GRAVITY * tUp + from.ny * push;
      this.detach(vx, vy, 9);
      this.setState('fall', { intent: hop.to });
    }
  }

  facingForTransfer(frame, s, from) {
    const p = pointAt(frame, s, 12);
    if (!from) return 1;
    const vx = from.tx * this.facing;
    const vy = from.ty * this.facing;
    return vx * p.tx + vy * p.ty >= 0 ? 1 : -1;
  }

  // --------------------------------------------------------------- states

  state_boot(dt) {
    this.spawn();
  }

  state_idle(dt, ctx) {
    this.stop();
    this.headPitch += ((this.observer > 0.5 ? 0.35 : noise1(this.stateTime * 0.3, 7) * 0.4 - 0.1) - this.headPitch) * dt * 2;
    const hold = this.state.hold ?? 2.5;
    if (this.observer > 0.72 && this.rng.chance(dt * 0.9)) {
      this.setState('watch', { hold: 1.5 + this.rng.next() * 3 });
      return;
    }
    if (this.stateTime > hold) this.chooseActivity();
  }

  state_watch(dt) {
    // Observer effect: SPEC has noticed it is being followed and holds still.
    this.stop();
    this.headPitch += (0.5 - this.headPitch) * dt * 3;
    if (this.stateTime > (this.state.hold ?? 2)) {
      if (this.observer > 0.8 && this.rng.chance(0.55)) this.retreat();
      else this.setState('idle', { hold: 1 + this.rng.next() * 2 });
    }
  }

  state_wander(dt, ctx) {
    const dir = this.state.dir ?? 1;
    const speed = this.state.sneak ? SPEEDS.sneak : SPEEDS.ground * (0.7 + this.personality.restlessness * 0.5);
    const moved = this.advance(dt, speed, dir);
    this.state.left = (this.state.left ?? 200) - moved;
    this.headPitch += (0 - this.headPitch) * dt * 2;
    if (this.blocked) {
      this.state.dir = -dir;
      this.state.bounces = (this.state.bounces || 0) + 1;
      if (this.state.bounces > 2) this.chooseActivity();
      return;
    }

    // Opportunistic transfer: something interesting is within stepping range.
    if (this.rng.chance(dt * 1.5)) {
      const here = this.worldPoint();
      const near = this.terrain.transfersNear(here.x, here.y, STEP_REACH, this.currentFrame.id);
      const pick = near.find((c) => c.frame.meta.type === 'window' || c.frame.meta.type === 'taskbar');
      if (pick && this.rng.chance(this.personality.curiosity)) {
        this.attach(pick.frame, pick.s, this.facingForTransfer(pick.frame, pick.s, this.sample()));
        this.compress = 0.3;
        this.setState('wander', { dir: this.facing, left: 160 + this.rng.next() * 220 });
        return;
      }
    }

    if (this.state.left <= 0) this.chooseActivity();
  }

  state_travel(dt, ctx) {
    if (!this.plan.length) {
      // On the goal frame: walk to the goal arc position.
      const goal = this.goal;
      if (!goal || !this.currentFrame || this.currentFrame.id !== goal.frameId) {
        this.chooseActivity();
        return;
      }
      const delta = this.deltaTo(goal.s);
      if (Math.abs(delta) < 8) {
        this.stop();
        this.onArrive(goal);
        return;
      }
      this.walkToward(dt, delta, SPEEDS.travel * 0.8);
      return;
    }

    const hop = this.plan[0];
    if (!this.currentFrame || this.currentFrame.id !== hop.from) {
      // Terrain shifted under the plan; re-route.
      if (this.goal && !this.travelTo(this.goal.frameId, this.goal.s, this.goal.purpose)) this.chooseActivity();
      return;
    }
    const delta = this.deltaTo(hop.fromS);
    if (Math.abs(delta) < 7) {
      this.plan.shift();
      this.takeHop(hop);
      return;
    }
    this.walkToward(dt, delta, SPEEDS.travel);
  }

  /**
   * Walk toward an arc target, going the other way round the frame if the
   * direct way is blocked by the edge of the visible desktop.
   */
  walkToward(dt, delta, speed) {
    const dir = this.state.dirOverride || Math.sign(delta) || 1;
    this.advance(dt, speed, dir);
    if (!this.blocked) return;
    if (this.state.dirOverride) {
      // Both ways out are blocked: give up on this route.
      this.goal = null;
      this.plan = [];
      this.chooseActivity();
    } else {
      this.state.dirOverride = -dir;
    }
  }

  onArrive(goal) {
    this.goal = null;
    this.goalAttempts = 0;
    switch (goal.purpose) {
      case 'hide':
        this.setState('slip-in', { win: goal.frameId });
        break;
      case 'perch':
        this.setState('idle', { hold: 4 + this.rng.next() * 8 });
        break;
      default:
        this.setState('idle', { hold: 1.5 + this.rng.next() * 3 });
    }
  }

  /** Slip behind a window: the body compresses into the gap at its edge. */
  state_slip_in(dt) {
    this.compress = Math.min(1, this.compress + dt * 3.4);
    this.stop();
    const winId = this.state.win || (this.frame && this.frame.id);
    if (this.compress >= 0.98) {
      const win = this.terrain.get(winId);
      if (!win) {
        this.setState('idle', { hold: 1 });
        return;
      }
      this.behind = win.id;
      const inset = Math.min(70, win.w * 0.25, win.h * 0.25);
      // The hidden path is clipped to the visible desktop: a window that runs
      // off the edge of the screen has no reachable surface out there.
      const b = this.terrain.bounds;
      const x0 = Math.max(win.x + inset, b.x + 30);
      const y0 = Math.max(win.y + inset, b.y + 30);
      const x1 = Math.min(win.x + win.w - inset, b.x + b.w - 30);
      const y1 = Math.min(win.y + win.h - inset, b.y + b.h - 30);
      const ghostFrame = makeFrame(`${win.id}:behind`, {
        x: x0,
        y: y0,
        w: Math.max(40, x1 - x0),
        h: Math.max(40, y1 - y0),
      }, 'outer', { type: 'behind', owner: win.id });
      const here = this.worldPoint();
      const p = project(ghostFrame, here.x, here.y);
      this.ghost = { active: true, frame: ghostFrame, ownerId: win.id };
      this.s = p.s;
      this.setState('behind', {
        // Cross to the far side of the window and come out there.
        exitS: wrapS(ghostFrame, p.s + ghostFrame.perimeter / 2),
        dwell: 1.2 + this.rng.next() * 6,
      });
    }
  }

  state_behind(dt) {
    this.compress = Math.max(0.25, this.compress - dt * 0.6);
    const delta = this.deltaTo(this.state.exitS);
    if (Math.abs(delta) > 10) {
      // Out of sight behind the window, SPEC moves quickly: the effect is that
      // it went in one side and came out the other.
      const dir = this.state.dirOverride || Math.sign(delta);
      this.advance(dt, SPEEDS.travel * 1.4, dir);
      if (this.blocked) {
        if (this.state.dirOverride) this.setState('emerge');
        else this.state.dirOverride = -dir;
      }
      return;
    }
    this.stop();
    if (this.stateTime < this.state.dwell) {
      // Occasionally put just its head back out into the visible world.
      if (this.observer < 0.5 && this.rng.chance(dt * 0.35)) this.setState('peek', { hold: 1.5 + this.rng.next() * 3 });
      return;
    }
    this.setState('emerge');
  }

  /** Head and shoulders out past the window edge, body still hidden. */
  state_peek(dt) {
    const win = this.terrain.get(this.behind);
    if (!win) {
      this.setState('emerge');
      return;
    }
    if (!this.state.placed) {
      const here = this.worldPoint();
      const p = project(win, here.x, here.y);
      this.ghost = null;
      this.attach(win, p.s, this.facing);
      this.state.placed = true;
      this.compress = 0.55;
    }
    this.stop();
    this.headPitch += (0.55 - this.headPitch) * dt * 3;
    if (this.stateTime > (this.state.hold ?? 2)) {
      if (this.observer > 0.6) {
        // Caught. Go back in.
        this.setState('slip-in', { win: win.id });
      } else {
        this.setState('emerge');
      }
    }
  }

  state_emerge(dt) {
    const win = this.terrain.get(this.behind);
    if (!win) {
      this.behind = null;
      this.ghost = null;
      this.setState('idle', { hold: 1 });
      return;
    }
    if (!this.state.placed) {
      const here = this.worldPoint();
      const p = project(win, here.x, here.y);
      this.ghost = null;
      this.attach(win, p.s, this.facing);
      this.state.placed = true;
    }
    this.compress = Math.max(0, this.compress - dt * 1.6);
    // Climb out along the edge until the body clears the window rectangle.
    this.advance(dt, SPEEDS.wall * 0.9, this.facing);
    if (this.stateTime > 1.1 && this.compress <= 0.02) {
      this.behind = null;
      this.setState('idle', { hold: 1 + this.rng.next() * 2 });
    }
  }

  state_fall(dt, ctx) {
    this.mode = 'free';
    const f = this.free;
    f.vy += GRAVITY * dt;
    f.vx *= 1 - 0.6 * dt;
    const p0 = { x: f.x, y: f.y };
    const p1 = { x: f.x + f.vx * dt, y: f.y + f.vy * dt };

    const hit = raycastFrames(this.terrain.frames, p0, p1);
    if (hit) {
      const speed = Math.hypot(f.vx, f.vy);
      this.attach(hit.frame, hit.s, this.facingForFall(hit));
      this.compress = Math.min(0.6, speed / 2600);
      this.setState('recover', { impact: speed });
      return;
    }

    f.x = p1.x;
    f.y = p1.y;
    f.angle += f.spin * dt;
    f.spin *= 1 - 1.2 * dt;
    // Airborne, SPEC orients nose-first into its own motion.
    const want = Math.atan2(f.vy, f.vx);
    f.angle += Math.atan2(Math.sin(want - f.angle), Math.cos(want - f.angle)) * Math.min(1, dt * 3);
    this.speed = Math.hypot(f.vx, f.vy);

    const b = this.terrain.bounds;
    if (f.x < b.x - 200 || f.x > b.x + b.w + 200 || f.y > b.y + b.h + 200) {
      // Should not happen: the display is a closed frame. Recover safely.
      this.spawn();
    }
  }

  facingForFall(hit) {
    const p = pointAt(hit.frame, hit.s, 12);
    return this.free.vx * p.tx + this.free.vy * p.ty >= 0 ? 1 : -1;
  }

  state_recover(dt) {
    this.stop();
    this.compress = Math.max(0, this.compress - dt * 1.2);
    const hard = (this.state.impact || 0) > 900;
    if (this.stateTime > (hard ? 0.85 : 0.35)) {
      if (hard) this.fear = Math.min(1, this.fear + 0.35);
      // A leap is part of a journey: pick the route back up where it broke.
      if (this.goal && this.goalAttempts < 3 && !hard) {
        this.goalAttempts++;
        const goal = this.goal;
        if (this.travelTo(goal.frameId, goal.s, goal.purpose)) return;
      }
      this.goal = null;
      this.setState('idle', { hold: 0.6 + this.rng.next() * 2 });
    }
  }

  state_held(dt, ctx) {
    this.stop();
    this.compress = 0.15;
    this.free.angle += (Math.PI / 2 - this.free.angle) * Math.min(1, dt * 2);
  }

  state_sleep(dt) {
    this.stop();
    this.headPitch += (-0.35 - this.headPitch) * dt * 2;
    if (this.observer > 0.55 || this.startle > 0.3 || this.stateTime > (this.state.hold ?? 30)) {
      this.setState('idle', { hold: 2 });
    }
  }

  state_flee(dt) {
    const dir = this.state.dir ?? 1;
    const moved = this.advance(dt, SPEEDS.dash, dir);
    this.state.left = (this.state.left ?? 400) - moved;
    if (this.state.left <= 0 || this.stateTime > 3) {
      this.setState('idle', { hold: 1 + this.rng.next() * 2 });
    }
  }

  // ---------------------------------------------------------- decisions

  retreat() {
    // Being watched too closely: leave, and prefer to leave by hiding.
    const here = this.worldPoint();
    const win = this.terrain.pickWindow(this.rng, here.x, here.y);
    if (win && this.rng.chance(0.6) && this.hideBehind(win)) return;
    this.setState('flee', { dir: this.rng.chance(0.5) ? 1 : -1, left: 260 + this.rng.next() * 300 });
  }

  hideBehind(win) {
    if (!win) return false;
    const here = this.worldPoint();
    const p = project(win, here.x, here.y);
    return this.travelTo(win.id, p.s, 'hide');
  }

  chooseActivity() {
    this.goal = null;
    this.plan = [];
    const p = this.personality;
    const here = this.worldPoint();
    const win = this.terrain.pickWindow(this.rng, here.x, here.y);

    const options = [
      ['idle', 1.6 + (1 - p.restlessness) * 2.4],
      ['wander', 2.2 + p.restlessness * 2.5],
      ['perch', 1.0 + p.territoriality * 1.4],
      ['investigate', win ? 1.2 + p.curiosity * 2.2 : 0],
      ['hide', win ? 0.5 + (1 - p.boldness) * 1.3 : 0],
      ['sleep', this.fear > 0.4 ? 0 : 0.45],
    ];
    const choice = this.rng.weighted(options);

    switch (choice) {
      case 'wander':
        this.setState('wander', {
          dir: this.rng.chance(0.5) ? 1 : -1,
          left: 140 + this.rng.next() * 420,
          sneak: this.observer > 0.4 && this.rng.chance(0.5),
        });
        break;
      case 'perch': {
        const ground = this.terrain.groundFrame(here.x, here.y);
        if (ground && this.travelTo(ground.id, project(ground, here.x, here.y).s, 'perch')) break;
        this.setState('idle', { hold: 3 + this.rng.next() * 6 });
        break;
      }
      case 'investigate': {
        const target = project(win, here.x, here.y);
        // Aim for the top edge of the window: SPEC prefers a vantage point.
        const topS = win.w * (0.25 + this.rng.next() * 0.5);
        const s = this.rng.chance(0.55) ? topS : target.s;
        if (!this.travelTo(win.id, s, 'explore')) this.setState('wander', { dir: 1, left: 200 });
        break;
      }
      case 'hide':
        if (!this.hideBehind(win)) this.setState('idle', { hold: 2 });
        break;
      case 'sleep':
        this.setState('sleep', { hold: 20 + this.rng.next() * 60 });
        break;
      default:
        this.setState('idle', { hold: 2 + this.rng.next() * 5 });
    }
  }

  // ------------------------------------------------------------- scripting

  /** DEV: run a fixed sequence of beats (used by the acceptance script). */
  playScript(steps) {
    this.scripted = { steps: steps.slice(), i: 0, waited: 0 };
  }

  runScript(dt) {
    const sc = this.scripted;
    if (!sc) return;
    const step = sc.steps[sc.i];
    if (!step) {
      this.scripted = null;
      return;
    }
    if (!step.started) {
      step.started = true;
      step.run && step.run(this);
    }
    sc.waited += dt;
    if (step.until ? step.until(this) : sc.waited > (step.wait ?? 1)) {
      sc.i++;
      sc.waited = 0;
    }
  }
}

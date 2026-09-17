// SPEC-01 anatomy and motion.
//
// No sprites, no skeleton asset: the body is generated every frame from the
// surface it is standing on. The torso is sampled directly off the frame arc,
// so it grips corners and wraps window edges by construction; the tail is a
// verlet chain so it lags, whips and settles; the limbs step with a real gait
// cycle and plant their feet on the surface rather than sliding along it.
//
// Nothing in this file knows what a window is, or why SPEC is moving. It only
// knows how a body behaves. Behaviour lives in behavior.js.

import { pointAt, project } from './frames.js';
import { noise1 } from './rng.js';

const TAU = Math.PI * 2;

/** Torso profile, measured in body units from the snout. */
const TORSO = [
  { d: 0, w: 8.0 }, // base of the skull
  { d: 9, w: 9.5 }, // neck
  { d: 20, w: 12.0 },
  { d: 32, w: 17.0 }, // shoulder girdle
  { d: 46, w: 18.5 },
  { d: 60, w: 17.0 },
  { d: 74, w: 16.0 },
  { d: 88, w: 17.5 }, // hips
  { d: 102, w: 13.0 },
  { d: 114, w: 8.5 }, // tail base
];

const HEAD_LEN = 30;
const HEAD_W = 11.5;
const TAIL_NODES = 10;
const TAIL_SEG = 11;

const LIMBS = [
  { id: 'fl', anchor: 32, far: true, bend: -1, phase: 0.0 },
  { id: 'fr', anchor: 32, far: false, bend: -1, phase: 0.5 },
  { id: 'rl', anchor: 88, far: true, bend: 1, phase: 0.5 },
  { id: 'rr', anchor: 88, far: false, bend: 1, phase: 0.0 },
];

const UPPER = 18;
const LOWER = 17;

function ik(sx, sy, fx, fy, l1, l2, bend) {
  let dx = fx - sx;
  let dy = fy - sy;
  let d = Math.hypot(dx, dy);
  if (d < 1e-4) {
    dx = 0;
    dy = 1;
    d = 1e-4;
  }
  const maxd = l1 + l2 - 0.01;
  const mind = Math.abs(l1 - l2) + 0.01;
  const cd = Math.min(maxd, Math.max(mind, d));
  const ux = dx / d;
  const uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + cd * cd) / (2 * cd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a)) * bend;
  return {
    x: sx + ux * a - uy * h,
    y: sy + uy * a + ux * h,
  };
}

export class Spec {
  constructor(opts = {}) {
    this.scale = opts.scale || 1;
    this.rng = opts.rng;
    this.t = 0;

    // Drive state, written by behaviour every tick.
    this.mode = 'attached';
    this.frame = null;
    this.s = 0;
    this.facing = 1;
    this.speed = 0;
    this.free = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0 };

    this.posture = 'idle';
    this.compress = 0;
    this.charge = 0.5;
    this.fear = 0;
    this.alert = 0;
    this.look = null;
    this.dissolve = 0;
    this.opacity = 1;
    this.worldBounds = opts.worldBounds || null;

    // Animation state.
    this.gaitPhase = 0;
    this.breath = 0;
    this.headYaw = 0;
    this.headPitch = 0;
    this.headFace = 0;
    this.blink = 0;
    this.blinkTimer = 2 + (this.rng ? this.rng.next() * 4 : 2);
    this.pupil = { x: 0, y: 0 };

    this.limbs = LIMBS.map((l) => ({
      ...l,
      foot: null,
      home: null,
      stepping: false,
      stepT: 0,
      stepDur: 0.18,
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      gripAngle: 0,
    }));

    this.tail = null;
    this.pulses = [];
    this.pose = null;
  }

  get bodyLength() {
    return TORSO[TORSO.length - 1].d * this.scale;
  }

  /** Where the creature is in world space right now (snout-ish). */
  headPoint() {
    if (this.pose) return { x: this.pose.head.x, y: this.pose.head.y };
    return { x: this.free.x, y: this.free.y };
  }

  /** Interactive bounds — the only region the overlay captures the pointer in. */
  bounds(pad = 14) {
    const p = this.pose;
    if (!p) return { x: this.free.x - 40, y: this.free.y - 40, w: 80, h: 80 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const eat = (pt) => {
      if (!pt) return;
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    };
    for (const n of p.spine) eat(n);
    for (const n of p.tail) eat(n);
    for (const l of p.limbs) {
      eat(l.foot);
      eat(l.knee);
    }
    eat(p.head);
    if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  /** Body-space sample: distance d from the snout along the current surface. */
  sampleAt(d) {
    const sc = this.scale;
    if (this.mode === 'attached' && this.frame) {
      const arc = this.s - d * sc * this.facing;
      const p = pointAt(this.frame, arc, 12);
      return { x: p.x, y: p.y, nx: p.nx, ny: p.ny, tx: p.tx * this.facing, ty: p.ty * this.facing, arc };
    }
    const a = this.free.angle;
    const fx = Math.cos(a);
    const fy = Math.sin(a);
    return {
      x: this.free.x - fx * d * sc,
      y: this.free.y - fy * d * sc,
      nx: fy,
      ny: -fx,
      tx: fx,
      ty: fy,
      arc: 0,
    };
  }

  update(dt, drive) {
    this.t += dt;
    Object.assign(this, drive);
    const sc = this.scale;

    // --- breathing / idle life -------------------------------------------
    const breathRate = this.posture === 'sleep' ? 0.35 : this.posture === 'idle' ? 0.9 : 1.6;
    this.breath += dt * breathRate;
    const breathAmp = this.posture === 'sleep' ? 1.5 : 1.0;
    const breathe = Math.sin(this.breath * TAU) * breathAmp;

    // --- gait -------------------------------------------------------------
    const stride = (this.posture === 'crawl' ? 15 : 19) * sc;
    this.gaitPhase += (Math.abs(this.speed) * dt) / Math.max(1, stride);

    // Belly height above the surface: lower when crawling, crouched or scared.
    let lift = 21;
    if (this.posture === 'crawl') lift = 15;
    if (this.posture === 'crouch' || this.fear > 0.5) lift = 12;
    if (this.posture === 'sleep') lift = 11;
    if (this.posture === 'cling') lift = 15;
    lift *= sc * (1 - this.compress * 0.45);
    lift += breathe * 0.5 * sc;

    // --- torso ------------------------------------------------------------
    const spine = [];
    const squeeze = 1 - this.compress * 0.28;
    for (let i = 0; i < TORSO.length; i++) {
      const seg = TORSO[i];
      const base = this.sampleAt(seg.d * squeeze);
      const wave = Math.sin(this.gaitPhase * TAU - i * 0.55) * (this.posture === 'crawl' ? 3.2 : 1.6);
      const drift = (noise1(this.t * 0.6 + i * 0.7, 11) - 0.5) * 1.6;
      const h = lift + (i === 0 ? this.headPitch * 12 * sc : 0) + (wave + drift) * sc * (0.3 + i * 0.05);
      const lateral = wave * sc * 0.55 * (this.posture === 'crawl' ? 1 : 0.5);
      spine.push({
        x: base.x + base.nx * h + base.tx * lateral,
        y: base.y + base.ny * h + base.ty * lateral,
        nx: base.nx,
        ny: base.ny,
        tx: base.tx,
        ty: base.ty,
        w: seg.w * sc * (1 + this.compress * 0.5) * (1 + breathe * 0.02),
        d: seg.d,
      });
    }

    // --- head -------------------------------------------------------------
    const neck = spine[1];
    const fwd = Math.atan2(spine[0].y - spine[2].y, spine[0].x - spine[2].x);
    let wantYaw = 0;
    if (this.look) {
      const toLook = Math.atan2(this.look.y - neck.y, this.look.x - neck.x);
      wantYaw = wrapAngle(toLook - fwd);
      wantYaw = Math.max(-2.0, Math.min(2.0, wantYaw));
    }
    const yawEase = this.alert > 0.5 ? 9 : 4;
    this.headYaw += wrapAngle(wantYaw - this.headYaw) * Math.min(1, dt * yawEase);
    const wantFace = this.look ? Math.max(0, Math.abs(this.headYaw) - 1.0) / 0.9 : 0;
    this.headFace += (wantFace - this.headFace) * Math.min(1, dt * 5);

    const headDir = fwd + this.headYaw;
    const headBase = {
      x: spine[0].x,
      y: spine[0].y,
    };
    const headLen = HEAD_LEN * sc * (1 - this.compress * 0.15);
    const head = {
      x: headBase.x + Math.cos(headDir) * headLen * 0.4,
      y: headBase.y + Math.sin(headDir) * headLen * 0.4,
      dir: headDir,
      len: headLen,
      w: HEAD_W * sc * (1 + this.headFace * 0.26),
      face: this.headFace,
      nx: spine[0].nx,
      ny: spine[0].ny,
    };

    // --- eyes -------------------------------------------------------------
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = 2.5 + (this.rng ? this.rng.next() * 5 : 3);
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const openness = this.posture === 'sleep' ? 0.06 : 1 - Math.min(1, this.blink) * 0.95;

    const ex = Math.cos(headDir);
    const ey = Math.sin(headDir);
    const px = -ey;
    const py = ex;
    const spread = head.w * (0.42 + this.headFace * 0.34);
    const eyeR = (4.3 + this.headFace * 0.5) * sc * (1 + this.alert * 0.1);
    const eyes = [
      { x: head.x + ex * headLen * 0.1 + px * spread, y: head.y + ey * headLen * 0.1 + py * spread, r: eyeR, open: openness, far: false },
      {
        x: head.x + ex * headLen * 0.1 - px * spread * (0.35 + this.headFace * 0.65),
        y: head.y + ey * headLen * 0.1 - py * spread * (0.35 + this.headFace * 0.65),
        r: eyeR * (0.52 + this.headFace * 0.4),
        open: openness,
        far: true,
        hidden: this.headFace < 0.45,
      },
    ];
    if (this.look) {
      const dx = this.look.x - head.x;
      const dy = this.look.y - head.y;
      const m = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, m / 260);
      this.pupil.x += ((dx / m) * reach - this.pupil.x) * Math.min(1, dt * 12);
      this.pupil.y += ((dy / m) * reach - this.pupil.y) * Math.min(1, dt * 12);
    } else {
      const wanderX = (noise1(this.t * 0.4, 3) - 0.5) * 0.8;
      const wanderY = (noise1(this.t * 0.4, 9) - 0.5) * 0.8;
      this.pupil.x += (wanderX - this.pupil.x) * Math.min(1, dt * 3);
      this.pupil.y += (wanderY - this.pupil.y) * Math.min(1, dt * 3);
    }

    // --- limbs ------------------------------------------------------------
    const moving = Math.abs(this.speed) > 3;
    const stepTrigger = (moving ? 15 : 26) * sc;
    for (const limb of this.limbs) {
      const anchorD = limb.anchor;
      const base = this.sampleAt(anchorD * squeeze);
      const shoulderH = lift + (limb.far ? 4.5 : -3.5) * sc;
      limb.shoulder = {
        x: base.x + base.nx * shoulderH,
        y: base.y + base.ny * shoulderH,
      };

      // Where this foot wants to be: on the surface, a stride ahead.
      const gaitOff = Math.sin((this.gaitPhase + limb.phase) * TAU);
      const ahead = (limb.anchor < 60 ? 14 : -8) * sc + gaitOff * 2 * sc;
      let home;
      if (this.mode === 'attached' && this.frame) {
        const arc = this.s - (anchorD * squeeze - ahead / sc) * sc * this.facing;
        const sp = pointAt(this.frame, arc, 12);
        const splay = (limb.far ? 7 : -8) * sc;
        home = {
          x: sp.x + sp.nx * (1.5 * sc) + sp.tx * this.facing * splay,
          y: sp.y + sp.ny * (1.5 * sc) + sp.ty * this.facing * splay,
          tx: sp.tx * this.facing,
          ty: sp.ty * this.facing,
          nx: sp.nx,
          ny: sp.ny,
        };
      } else {
        // Airborne: limbs splay and flail rather than seek a surface.
        const flail = noise1(this.t * 3 + limb.anchor, 5) * TAU;
        const r = 30 * sc;
        home = {
          x: limb.shoulder.x + Math.cos(flail) * r,
          y: limb.shoulder.y + Math.sin(flail) * r + 10 * sc,
          tx: base.tx,
          ty: base.ty,
          nx: base.nx,
          ny: base.ny,
        };
      }
      limb.home = home;

      if (!limb.foot) limb.foot = { x: home.x, y: home.y };

      if (limb.stepping) {
        limb.stepT += dt / limb.stepDur;
        const t = Math.min(1, limb.stepT);
        const e = t * t * (3 - 2 * t);
        const arcLift = Math.sin(Math.PI * t) * 9 * sc * (this.posture === 'crawl' ? 0.7 : 1);
        limb.foot.x = limb.from.x + (limb.to.x - limb.from.x) * e + home.nx * arcLift;
        limb.foot.y = limb.from.y + (limb.to.y - limb.from.y) * e + home.ny * arcLift;
        if (t >= 1) {
          limb.stepping = false;
          limb.foot.x = limb.to.x;
          limb.foot.y = limb.to.y;
        }
      } else {
        const drift = Math.hypot(limb.foot.x - home.x, limb.foot.y - home.y);
        const partner = this.limbs.find((l) => l.id === diagonalOf(limb.id));
        const partnerBusy = partner && partner.stepping;
        if (drift > stepTrigger && !partnerBusy) {
          limb.stepping = true;
          limb.stepT = 0;
          limb.stepDur = moving ? Math.max(0.09, Math.min(0.22, (stride / Math.abs(this.speed)) * 0.42)) : 0.26;
          limb.from = { x: limb.foot.x, y: limb.foot.y };
          const over = moving ? 0.55 : 0;
          limb.to = {
            x: home.x + home.tx * stride * over,
            y: home.y + home.ty * stride * over,
          };
        } else if (this.mode === 'free') {
          limb.foot.x += (home.x - limb.foot.x) * Math.min(1, dt * 6);
          limb.foot.y += (home.y - limb.foot.y) * Math.min(1, dt * 6);
        }
      }

      limb.gripAngle = Math.atan2(home.ty, home.tx);
      limb.knee = ik(
        limb.shoulder.x,
        limb.shoulder.y,
        limb.foot.x,
        limb.foot.y,
        UPPER * sc,
        LOWER * sc,
        limb.bend * (this.facing >= 0 ? 1 : -1) * (this.mode === 'attached' ? 1 : 1),
      );
    }

    // --- tail (verlet, anchored at the hip) -------------------------------
    const tailRoot = spine[spine.length - 1];
    if (!this.tail) {
      this.tail = [];
      for (let i = 0; i < TAIL_NODES; i++) {
        this.tail.push({
          x: tailRoot.x - tailRoot.tx * i * TAIL_SEG * sc,
          y: tailRoot.y - tailRoot.ty * i * TAIL_SEG * sc,
          px: tailRoot.x - tailRoot.tx * i * TAIL_SEG * sc,
          py: tailRoot.y - tailRoot.ty * i * TAIL_SEG * sc,
        });
      }
    }
    const curl = this.posture === 'sleep' ? 1 : this.fear > 0.5 ? 0.45 : 0;
    const sway = this.posture === 'sleep' ? 0.25 : 1;
    const g = 1400 * sc; // the tail has weight (PRD 7)
    for (let i = 1; i < this.tail.length; i++) {
      const n = this.tail[i];
      let vx = (n.x - n.px) * 0.9;
      let vy = (n.y - n.py) * 0.9;
      n.px = n.x;
      n.py = n.y;
      const swayAmp = Math.sin(this.t * 2.3 + i * 0.7) * 26 * sway * sc * (0.3 + Math.abs(this.speed) / 200);
      // Curl: each node is pulled toward the inside of the previous segment.
      const prev = this.tail[i - 1];
      const prev2 = this.tail[Math.max(0, i - 2)];
      const cx = -(prev.y - prev2.y);
      const cy = prev.x - prev2.x;
      const cl = Math.hypot(cx, cy) || 1;
      n.x += vx + (-tailRoot.ty * swayAmp + (cx / cl) * 260 * curl) * dt * dt * 60;
      n.y += vy + (g + tailRoot.tx * swayAmp + (cy / cl) * 260 * curl) * dt * dt;
    }
    this.tail[0].x = tailRoot.x;
    this.tail[0].y = tailRoot.y;
    this.tail[0].px = tailRoot.x;
    this.tail[0].py = tailRoot.y;
    const segLen = TAIL_SEG * sc * (1 - this.compress * 0.3);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < this.tail.length; i++) {
        const a = this.tail[i - 1];
        const b = this.tail[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const k = (d - segLen) / d;
        b.x -= dx * k;
        b.y -= dy * k;
      }
      this.constrainTail();
    }

    // --- internal code (PRD 8) -------------------------------------------
    this.updatePulses(dt);

    this.pose = {
      spine,
      head,
      eyes,
      pupil: { ...this.pupil },
      limbs: this.limbs.map((l) => ({
        id: l.id,
        far: l.far,
        shoulder: { ...l.shoulder },
        knee: { ...l.knee },
        foot: { ...l.foot },
        grip: l.gripAngle,
        planted: !l.stepping,
      })),
      tail: this.tail.map((n, i) => ({
        x: n.x,
        y: n.y,
        w: Math.max(0.8, 6.2 * sc * (1 - i / TAIL_NODES) + 0.8),
      })),
      pulses: this.pulses,
      charge: this.charge,
      fear: this.fear,
      dissolve: this.dissolve,
      opacity: this.opacity,
      scale: sc,
      posture: this.posture,
    };
    return this.pose;
  }

  /**
   * Keep the tail out of solid surfaces and inside the overlay. The tail is a
   * free chain, so without this it sinks through the floor it is resting on.
   */
  constrainTail() {
    const f = this.mode === 'attached' ? this.frame : null;
    const b = this.worldBounds;
    for (let i = 1; i < this.tail.length; i++) {
      const n = this.tail[i];
      if (f) {
        const inside =
          n.x > f.x && n.x < f.x + f.w && n.y > f.y && n.y < f.y + f.h;
        const solid = f.side === 'outer' ? inside : !inside;
        if (solid) {
          const p = project(f, n.x, n.y);
          n.x = p.x;
          n.y = p.y;
        }
      }
      if (b) {
        n.x = Math.min(Math.max(n.x, b.x + 1), b.x + b.w - 1);
        n.y = Math.min(Math.max(n.y, b.y + 1), b.y + b.h - 1);
      }
    }
  }

  updatePulses(dt) {
    const target = this.fear > 0.6 ? 0.05 : this.charge;
    const rate = 0.6 + target * 6;
    this._pulseAcc = (this._pulseAcc || 0) + dt * rate;
    while (this._pulseAcc > 1) {
      this._pulseAcc -= 1;
      const r = this.rng ? this.rng.next() : Math.random();
      this.pulses.push({
        u: 1.05,
        speed: 0.35 + r * 0.9 + target * 0.6,
        len: 0.05 + r * 0.1,
        bright: 0.25 + target * 0.75,
        seed: Math.floor(r * 9999),
      });
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.u -= p.speed * dt; // travels tail -> head, like something thinking
      if (p.u < -0.15) this.pulses.splice(i, 1);
    }
    if (this.pulses.length > 40) this.pulses.splice(0, this.pulses.length - 40);
  }
}

function diagonalOf(id) {
  return { fl: 'rr', fr: 'rl', rl: 'fr', rr: 'fl' }[id];
}

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

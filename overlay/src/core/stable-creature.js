import { noise1 } from './rng.js';

const TAU = Math.PI * 2;
const TORSO = [
  { d: 0, w: 8 }, { d: 10, w: 10 }, { d: 22, w: 13 }, { d: 36, w: 17 },
  { d: 51, w: 18 }, { d: 66, w: 17 }, { d: 81, w: 16 }, { d: 96, w: 17 },
  { d: 109, w: 13 }, { d: 120, w: 8 },
];
const LIMBS = [
  { id: 'fl', d: 36, far: true, phase: 0 },
  { id: 'fr', d: 36, far: false, phase: 0.5 },
  { id: 'rl', d: 94, far: true, phase: 0.5 },
  { id: 'rr', d: 94, far: false, phase: 0 },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function ik(sx, sy, fx, fy, l1, l2, bend) {
  let dx = fx - sx, dy = fy - sy;
  let d = Math.hypot(dx, dy) || 0.001;
  const cd = clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + cd * cd) / (2 * cd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a)) * bend;
  return { x: sx + ux * a - uy * h, y: sy + uy * a + ux * h };
}

export class StableSpec {
  constructor(opts = {}) {
    this.scale = opts.scale || 1;
    this.rng = opts.rng;
    this.t = 0;
    this.pose = null;
    this.visible = true;
    this.worldBounds = opts.worldBounds || null;
    this.gait = 0;
    this.breath = 0;
    this.headYaw = 0;
    this.blink = 0;
    this.blinkTimer = 2.5;
    this.pupil = { x: 0, y: 0 };
    this.pulses = [];
    this.mode = 'attached';
    this.anchor = { x: 0, y: 0 };
  }

  headPoint() {
    return this.pose ? { x: this.pose.head.x, y: this.pose.head.y } : { ...this.anchor };
  }

  bounds(pad = 14) {
    const p = this.pose;
    if (!p) return { x: this.anchor.x - 55, y: this.anchor.y - 80, w: 110, h: 100 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const eat = (q) => {
      if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) return;
      minX = Math.min(minX, q.x); minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x); maxY = Math.max(maxY, q.y);
    };
    p.spine.forEach(eat); p.tail.forEach(eat); p.eyes.forEach(eat); eat(p.head);
    p.limbs.forEach(l => { eat(l.shoulder); eat(l.knee); eat(l.foot); });
    if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }

  update(dt, drive = {}) {
    this.t += dt;
    this.mode = drive.mode || 'attached';
    this.anchor = drive.anchor ? { ...drive.anchor } : this.anchor;
    const sc = this.scale;
    const facing = drive.facing >= 0 ? 1 : -1;
    const speed = Number.isFinite(drive.speed) ? drive.speed : 0;
    const posture = drive.posture || 'idle';
    const look = drive.look || null;
    const alert = clamp(drive.alert || 0, 0, 1);
    const fear = clamp(drive.fear || 0, 0, 1);
    const charge = clamp(drive.charge ?? 0.45, 0, 1);

    // One anchor, one basis. No body node is allowed to sample a different edge.
    const surfaceAngle = Number.isFinite(drive.angle) ? drive.angle : 0;
    const tx = Math.cos(surfaceAngle) * facing;
    const ty = Math.sin(surfaceAngle) * facing;
    const nx = -Math.sin(surfaceAngle);
    const ny = Math.cos(surfaceAngle) * -1; // local up for a top surface

    this.breath += dt * (posture === 'sleep' ? 0.35 : 0.9);
    this.gait += dt * Math.abs(speed) / Math.max(18, 20 * sc);
    const breathe = Math.sin(this.breath * TAU) * 0.7 * sc;
    const moving = Math.abs(speed) > 4;
    let lift = posture === 'sleep' ? 12 : posture === 'crouch' ? 14 : posture === 'cling' ? 16 : 21;
    lift *= sc;

    const spine = TORSO.map((seg, i) => {
      const gaitWave = moving ? Math.sin(this.gait * TAU - i * 0.55) * 1.2 * sc : 0;
      const life = (noise1(this.t * 0.35 + i * 0.77, 19) - 0.5) * 0.7 * sc;
      const h = lift + breathe * (0.15 + i * 0.015) + gaitWave * 0.25 + life;
      return {
        x: this.anchor.x - tx * seg.d * sc + nx * h,
        y: this.anchor.y - ty * seg.d * sc + ny * h,
        tx, ty, nx, ny,
        w: seg.w * sc,
        d: seg.d,
      };
    });

    // Head tracking is intentionally anatomical, not owl-like. Maximum ~28°.
    const baseDir = Math.atan2(ty, tx);
    let desiredYaw = 0;
    if (look) desiredYaw = clamp(wrapAngle(Math.atan2(look.y - spine[0].y, look.x - spine[0].x) - baseDir), -0.48, 0.48);
    this.headYaw += wrapAngle(desiredYaw - this.headYaw) * Math.min(1, dt * (alert > 0.5 ? 9 : 5));
    const headDir = baseDir + this.headYaw;
    const hx = Math.cos(headDir), hy = Math.sin(headDir);
    const hpx = -hy, hpy = hx;
    const headLen = 29 * sc;
    const head = {
      x: spine[0].x + hx * headLen * 0.36,
      y: spine[0].y + hy * headLen * 0.36,
      dir: headDir,
      len: headLen,
      w: 11.5 * sc,
      face: Math.abs(this.headYaw) / 0.48,
      nx, ny,
    };

    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 1;
      this.blinkTimer = 2.6 + (this.rng ? this.rng.next() * 4.5 : 3);
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const open = posture === 'sleep' ? 0.08 : 1 - this.blink * 0.95;
    const spread = 4.8 * sc;
    const eyeR = 4.0 * sc;
    const eyes = [
      { x: head.x + hx * 3.0 * sc + hpx * spread, y: head.y + hy * 3.0 * sc + hpy * spread, r: eyeR, open, far: false },
      { x: head.x + hx * 2.6 * sc - hpx * spread * 0.5, y: head.y + hy * 2.6 * sc - hpy * spread * 0.5, r: eyeR * 0.62, open, far: true, hidden: Math.abs(this.headYaw) < 0.15 },
    ];

    if (look) {
      const dx = look.x - head.x, dy = look.y - head.y, m = Math.hypot(dx, dy) || 1;
      this.pupil.x += (clamp(dx / m, -1, 1) - this.pupil.x) * Math.min(1, dt * 10);
      this.pupil.y += (clamp(dy / m, -1, 1) - this.pupil.y) * Math.min(1, dt * 10);
    } else {
      this.pupil.x *= Math.max(0, 1 - dt * 3);
      this.pupil.y *= Math.max(0, 1 - dt * 3);
    }

    const limbs = LIMBS.map((def, idx) => {
      const center = this.anchor.x - tx * def.d * sc;
      const centerY = this.anchor.y - ty * def.d * sc;
      const shoulderLift = lift + (def.far ? 3 : -2) * sc;
      const shoulder = { x: center + nx * shoulderLift, y: centerY + ny * shoulderLift };
      const phase = Math.sin((this.gait + def.phase) * TAU);
      const stride = moving ? phase * 9 * sc : phase * 1.2 * sc;
      let foot;
      if (this.mode === 'attached') {
        const longitudinal = (def.d < 60 ? 10 : -7) * sc + stride;
        foot = {
          x: this.anchor.x - tx * (def.d * sc - longitudinal),
          y: this.anchor.y - ty * (def.d * sc - longitudinal),
        };
      } else {
        foot = {
          x: shoulder.x - tx * 8 * sc + nx * (24 + idx * 1.5) * sc,
          y: shoulder.y - ty * 8 * sc + ny * (24 + idx * 1.5) * sc,
        };
      }
      const knee = ik(shoulder.x, shoulder.y, foot.x, foot.y, 18 * sc, 17 * sc, (def.far ? -1 : 1) * facing);
      return {
        id: def.id, far: def.far, shoulder, knee, foot,
        grip: baseDir, planted: this.mode === 'attached',
      };
    });

    // Deterministic tail. It cannot accumulate physics error or detach.
    const root = spine[spine.length - 1];
    const tail = [];
    for (let i = 0; i < 10; i++) {
      const d = i * 10.5 * sc;
      const sway = Math.sin(this.t * 1.8 + i * 0.52) * (moving ? 2.5 : 1.4) * sc * (i / 9);
      const curl = posture === 'sleep' ? Math.sin(i / 9 * Math.PI) * 8 * sc : 0;
      tail.push({
        x: root.x - tx * d + nx * (sway + curl),
        y: root.y - ty * d + ny * (sway + curl),
        w: Math.max(1, (6.2 * (1 - i / 10) + 0.8) * sc),
      });
    }

    // Keep the entire anatomy in a sane radius from the anchor. If a future
    // change violates this invariant, collapse back to the anchored pose rather
    // than drawing detached organs across the desktop.
    const maxRadius = 260 * sc;
    const sane = q => Number.isFinite(q.x) && Number.isFinite(q.y) && Math.hypot(q.x - this.anchor.x, q.y - this.anchor.y) < maxRadius;
    if (![...spine, ...tail, head, ...eyes].every(sane)) {
      this.headYaw = 0;
      return this.update(0, { ...drive, look: null, alert: 0 });
    }

    this.updatePulses(dt, charge, fear);
    this.pose = {
      spine, head, eyes, pupil: { ...this.pupil }, limbs, tail,
      pulses: this.pulses, charge, fear, dissolve: 0, opacity: 1,
      scale: sc, posture,
    };
    return this.pose;
  }

  updatePulses(dt, charge, fear) {
    const target = fear > 0.6 ? 0.05 : charge;
    this._pulseAcc = (this._pulseAcc || 0) + dt * (0.45 + target * 4);
    while (this._pulseAcc > 1) {
      this._pulseAcc -= 1;
      const r = this.rng ? this.rng.next() : Math.random();
      this.pulses.push({ u: 1.04, speed: 0.45 + r * 0.6, len: 0.07 + r * 0.06, bright: 0.25 + target * 0.6, seed: Math.floor(r * 9999) });
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      this.pulses[i].u -= this.pulses[i].speed * dt;
      if (this.pulses[i].u < -0.15) this.pulses.splice(i, 1);
    }
    if (this.pulses.length > 18) this.pulses.splice(0, this.pulses.length - 18);
  }
}

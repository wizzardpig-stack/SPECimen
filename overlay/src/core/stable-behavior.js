const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class StableBehavior {
  constructor({ terrain, rng, spec, personality }) {
    this.terrain = terrain;
    this.rng = rng;
    this.spec = spec;
    this.personality = personality || {
      curiosity: rng.range(0.55, 0.9),
      boldness: rng.range(0.55, 0.9),
      caution: rng.range(0.2, 0.6),
      restlessness: rng.range(0.6, 0.9),
      territoriality: rng.range(0.1, 0.6),
    };
    this.anchor = { x: 0, y: 0 };
    this.surfaceId = 'floor';
    this.surface = null;
    this.facing = 1;
    this.speed = 0;
    this.mode = 'attached';
    this.state = { name: 'boot' };
    this.stateTime = 0;
    this.look = null;
    this.alert = 0;
    this.fear = 0;
    this.charge = 0.45;
    this.observer = 0;
    this.behind = null;
    this.lastCursor = null;
    this.throwVel = { x: 0, y: 0 };
    this.leap = null;
    this.scripted = null;
  }

  setState(name, data = {}) {
    this.state = { name, ...data };
    this.stateTime = 0;
  }

  safeSurfaces() {
    const b = this.terrain.bounds;
    const taskbar = this.terrain.get('taskbar');
    let floorY = b.y + b.h - 8;
    if (taskbar && taskbar.y > b.y + b.h * 0.55 && taskbar.y < b.y + b.h) floorY = taskbar.y - 1;
    const list = [{ id: 'floor', x1: b.x + 28, x2: b.x + b.w - 28, y: floorY, kind: 'floor' }];
    for (const w of this.terrain.windows || []) {
      const x1 = Math.max(b.x + 24, w.x + 28);
      const x2 = Math.min(b.x + b.w - 24, w.x + w.w - 28);
      const y = clamp(w.y, b.y + 58, floorY - 48);
      if (x2 - x1 < 110) continue;
      if (y >= floorY - 36) continue;
      list.push({ id: `window:${w.id}`, sourceId: w.id, x1, x2, y, kind: 'window' });
    }
    return list;
  }

  findSurface(id) {
    return this.safeSurfaces().find(s => s.id === id) || null;
  }

  floor() {
    return this.safeSurfaces()[0];
  }

  spawn() {
    const f = this.floor();
    this.surface = f;
    this.surfaceId = f.id;
    this.anchor.x = (f.x1 + f.x2) * 0.5;
    this.anchor.y = f.y;
    this.facing = this.rng.chance(0.5) ? 1 : -1;
    this.mode = 'attached';
    this.setState('idle', { hold: 0.8 + this.rng.next() * 1.2 });
  }

  grab(x, y) {
    this.mode = 'free';
    this.anchor = { x, y };
    this.speed = 0;
    this.setState('held');
    this.fear = Math.min(1, this.fear + 0.2);
  }

  dragTo(x, y) {
    if (this.state.name !== 'held') return;
    this.anchor.x = x;
    this.anchor.y = y;
  }

  release(vx = 0, vy = 0) {
    if (this.state.name !== 'held') return;
    this.throwVel.x = clamp(vx, -1100, 1100);
    this.throwVel.y = clamp(vy, -1100, 1100);
    this.mode = 'free';
    this.setState('drop');
  }

  trackCursor(dt, cursor) {
    if (!cursor) { this.look = null; return; }
    const d = Math.hypot(cursor.x - this.anchor.x, cursor.y - this.anchor.y);
    const prev = this.lastCursor;
    const moved = prev ? Math.hypot(cursor.x - prev.x, cursor.y - prev.y) : 0;
    this.lastCursor = { x: cursor.x, y: cursor.y };
    this.observer = clamp(this.observer + (d < 260 ? dt * 0.35 : -dt * 0.55), 0, 1);
    this.alert += ((d < 320 ? 1 : 0) - this.alert) * Math.min(1, dt * 4);
    this.look = d < 520 ? { x: cursor.x, y: cursor.y } : null;
    if (this.mode === 'attached' && d < 115 && moved > 18 && this.state.name !== 'leap') {
      this.facing = cursor.x < this.anchor.x ? 1 : -1;
      this.setState('wander', { left: 140 + this.rng.next() * 180 });
      this.fear = Math.min(1, this.fear + 0.25);
    }
  }

  refreshSurface() {
    if (this.mode !== 'attached') return;
    const s = this.findSurface(this.surfaceId);
    if (!s) {
      this.mode = 'free';
      this.throwVel = { x: this.facing * 55, y: 40 };
      this.setState('drop');
      return;
    }
    this.surface = s;
    this.anchor.y = s.y;
    this.anchor.x = clamp(this.anchor.x, s.x1 + 18, s.x2 - 18);
  }

  chooseActivity() {
    if (this.mode !== 'attached') return;
    const r = this.rng.next();
    if (r < 0.62) {
      this.facing = this.rng.chance(0.5) ? 1 : -1;
      this.setState('wander', { left: 160 + this.rng.next() * 360 });
      return;
    }
    if (r < 0.80) {
      this.setState('watch', { hold: 1.2 + this.rng.next() * 2.4 });
      return;
    }
    if (r < 0.93 && this.tryLeap()) return;
    this.setState('idle', { hold: 0.8 + this.rng.next() * 2.0 });
  }

  tryLeap() {
    if (!this.surface) return false;
    const surfaces = this.safeSurfaces().filter(s => s.id !== this.surfaceId);
    const candidates = surfaces.filter(s => {
      const cx = clamp(this.anchor.x, s.x1 + 25, s.x2 - 25);
      const dx = Math.abs(cx - this.anchor.x);
      const dy = Math.abs(s.y - this.anchor.y);
      return dx < 430 && dy < 310;
    });
    if (!candidates.length) return false;
    const target = candidates[Math.floor(this.rng.next() * candidates.length)];
    const tx = clamp(this.anchor.x + (this.rng.next() - 0.5) * 180, target.x1 + 30, target.x2 - 30);
    this.leap = {
      from: { ...this.anchor },
      to: { x: tx, y: target.y },
      target,
      t: 0,
      dur: clamp(0.42 + Math.hypot(tx - this.anchor.x, target.y - this.anchor.y) / 620, 0.42, 0.9),
      arc: 55 + Math.min(100, Math.abs(target.y - this.anchor.y) * 0.35),
    };
    this.mode = 'free';
    this.setState('leap');
    return true;
  }

  state_idle(dt) {
    this.speed = 0;
    if (this.stateTime > (this.state.hold ?? 1.5)) this.chooseActivity();
  }

  state_watch(dt) {
    this.speed = 0;
    if (this.stateTime > (this.state.hold ?? 1.8)) this.chooseActivity();
  }

  state_wander(dt) {
    const s = this.surface;
    if (!s) { this.spawn(); return; }
    const speed = 72 + this.personality.restlessness * 38;
    this.speed = speed;
    this.anchor.x += this.facing * speed * dt;
    this.state.left = (this.state.left ?? 220) - speed * dt;
    const min = s.x1 + 26, max = s.x2 - 26;
    if (this.anchor.x <= min) { this.anchor.x = min; this.facing = 1; this.state.left -= 30; }
    if (this.anchor.x >= max) { this.anchor.x = max; this.facing = -1; this.state.left -= 30; }
    if (this.state.left <= 0) {
      if (this.rng.chance(0.32) && this.tryLeap()) return;
      this.chooseActivity();
    }
  }

  state_leap(dt) {
    if (!this.leap) { this.spawn(); return; }
    const l = this.leap;
    l.t = clamp(l.t + dt / l.dur, 0, 1);
    const e = l.t * l.t * (3 - 2 * l.t);
    this.anchor.x = lerp(l.from.x, l.to.x, e);
    this.anchor.y = lerp(l.from.y, l.to.y, e) - Math.sin(Math.PI * l.t) * l.arc;
    this.speed = Math.abs(l.to.x - l.from.x) / l.dur;
    this.facing = l.to.x >= l.from.x ? 1 : -1;
    if (l.t >= 1) {
      this.surface = this.findSurface(l.target.id) || this.floor();
      this.surfaceId = this.surface.id;
      this.anchor.x = clamp(l.to.x, this.surface.x1 + 25, this.surface.x2 - 25);
      this.anchor.y = this.surface.y;
      this.mode = 'attached';
      this.leap = null;
      this.setState('idle', { hold: 0.45 + this.rng.next() * 1.1 });
    }
  }

  state_drop(dt) {
    const f = this.floor();
    this.throwVel.y += 1250 * dt;
    this.anchor.x += this.throwVel.x * dt;
    this.anchor.y += this.throwVel.y * dt;
    this.throwVel.x *= Math.max(0, 1 - dt * 1.4);
    this.speed = Math.abs(this.throwVel.x);
    this.anchor.x = clamp(this.anchor.x, f.x1 + 26, f.x2 - 26);
    if (this.anchor.y >= f.y) {
      this.anchor.y = f.y;
      this.surface = f;
      this.surfaceId = f.id;
      this.mode = 'attached';
      this.throwVel = { x: 0, y: 0 };
      this.setState('recover', { hold: 0.35 });
    }
  }

  state_recover(dt) {
    this.speed = 0;
    if (this.stateTime > (this.state.hold ?? 0.35)) this.setState('wander', { left: 130 + this.rng.next() * 180 });
  }

  state_held() { this.speed = 0; }

  update(dt, ctx = {}) {
    this.stateTime += dt;
    this.trackCursor(dt, ctx.cursor);
    this.refreshSurface();
    const fn = this[`state_${this.state.name}`];
    if (fn) fn.call(this, dt, ctx); else this.spawn();
    this.fear = Math.max(0, this.fear - dt * 0.28);
    this.charge += ((0.38 + this.alert * 0.36 + Math.min(0.25, this.speed / 500)) - this.charge) * Math.min(1, dt * 3);
    return this.drive();
  }

  drive() {
    let posture = 'idle';
    if (this.state.name === 'wander') posture = 'walk';
    if (this.state.name === 'drop' || this.state.name === 'leap') posture = 'crouch';
    if (this.state.name === 'recover') posture = 'crouch';
    if (this.state.name === 'held') posture = 'cling';
    return {
      mode: this.mode === 'attached' ? 'attached' : 'free',
      anchor: { ...this.anchor },
      facing: this.facing,
      speed: this.speed,
      angle: 0,
      posture,
      look: this.look,
      alert: this.alert,
      fear: this.fear,
      charge: this.charge,
    };
  }

  // Compatibility hooks for the existing dev console. No hidden-world behavior
  // is allowed back into the hardware build until the locomotion foundation is stable.
  retreat() { this.facing *= -1; this.setState('wander', { left: 180 }); }
  chooseGoal() { return false; }
  hideBehind() { return false; }
  playScript() { return false; }
}

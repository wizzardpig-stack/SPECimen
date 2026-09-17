// Real-hardware tuning for SPECIMEN.
//
// Browser simulation proved the organism model; real WebView2 hardware exposed
// compositor and habitat edge-cases. Keep these Windows-only corrections here
// so the deterministic browser acceptance model remains useful.

(() => {
  // ---------------------------------------------------------------- canvas
  const proto = globalThis.CanvasRenderingContext2D?.prototype;
  if (proto && !proto.__specimenFullClearPatched) {
    const nativeClearRect = proto.clearRect;
    proto.clearRect = function specimenClearRect(x, y, w, h) {
      if (this.canvas?.id === 'spec' && globalThis.SPECIMEN?.host?.kind === 'tauri') {
        this.save();
        this.setTransform(1, 0, 0, 1, 0, 0);
        nativeClearRect.call(this, 0, 0, this.canvas.width, this.canvas.height);
        this.restore();
        return;
      }
      nativeClearRect.call(this, x, y, w, h);
    };
    Object.defineProperty(proto, '__specimenFullClearPatched', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // A procedural body can self-intersect when several samples fold through a
  // hard rectangular corner in one frame. Round only pathological bends; normal
  // gait/tail motion is untouched.
  function softenPoseCorners(pose) {
    if (!pose?.spine?.length || !pose?.tail?.length) return pose;
    const spineN = pose.spine.length;
    const chain = [
      ...pose.spine.map((p) => ({ ...p })),
      ...pose.tail.slice(1).map((p) => ({ ...p })),
    ];
    if (chain.length < 4) return pose;

    let hard = false;
    let prevA = Math.atan2(chain[1].y - chain[0].y, chain[1].x - chain[0].x);
    for (let i = 2; i < chain.length; i++) {
      const a = Math.atan2(chain[i].y - chain[i - 1].y, chain[i].x - chain[i - 1].x);
      if (Math.abs(wrapAngle(a - prevA)) > 0.92) {
        hard = true;
        break;
      }
      prevA = a;
    }
    if (!hard) return pose;

    const maxTurn = 0.48;
    const out = [{ ...chain[0] }];
    let heading = Math.atan2(chain[1].y - chain[0].y, chain[1].x - chain[0].x);
    for (let i = 1; i < chain.length; i++) {
      const srcPrev = chain[i - 1];
      const src = chain[i];
      const desired = Math.atan2(src.y - srcPrev.y, src.x - srcPrev.x);
      heading += clamp(wrapAngle(desired - heading), -maxTurn, maxTurn);
      const rawLen = Math.hypot(src.x - srcPrev.x, src.y - srcPrev.y);
      const len = clamp(rawLen, 2, 28 * (pose.scale || 1));
      out.push({
        ...src,
        x: out[i - 1].x + Math.cos(heading) * len,
        y: out[i - 1].y + Math.sin(heading) * len,
      });
    }

    for (let i = 0; i < spineN; i++) {
      pose.spine[i].x = out[i].x;
      pose.spine[i].y = out[i].y;
    }
    pose.tail[0].x = pose.spine[spineN - 1].x;
    pose.tail[0].y = pose.spine[spineN - 1].y;
    for (let i = 1; i < pose.tail.length; i++) {
      const q = out[spineN + i - 1];
      if (!q) break;
      pose.tail[i].x = q.x;
      pose.tail[i].y = q.y;
    }
    return pose;
  }

  function tuneLiveOrganism() {
    const app = globalThis.SPECIMEN;
    const b = app?.behavior;
    const spec = app?.spec;
    if (!b || !spec) return false;
    if (app.host?.kind !== 'tauri') return true;
    if (app.__hardwareVisibilityTuned) return true;
    app.__hardwareVisibilityTuned = true;

    // ----------------------------------------------------------- visibility
    const canvas = document.getElementById('spec');
    if (canvas) {
      canvas.style.filter =
        'brightness(1.10) contrast(0.82) saturate(1.08) drop-shadow(0 0 2px rgba(91,255,194,0.20))';
    }

    b.personality.curiosity = Math.max(0.76, b.personality.curiosity);
    b.personality.boldness = Math.max(0.92, b.personality.boldness);
    b.personality.restlessness = Math.max(0.78, b.personality.restlessness);

    const rawSetState = b.setState.bind(b);
    b.setState = (name, data = {}) => {
      const next = { ...data };
      if (name === 'idle') next.hold = Math.min(next.hold ?? 2.2, 2.6);
      if (name === 'sleep') next.hold = Math.min(next.hold ?? 6, 6);
      rawSetState(name, next);
    };

    const rawTrackCursor = b.trackCursor.bind(b);
    b.trackCursor = (dt, cursor) => {
      rawTrackCursor(dt, cursor);
      b.observer = Math.min(b.observer, 0.76);
    };

    b.retreat = function hardwareRetreat() {
      this.behind = null;
      this.ghost = null;
      this.setState('flee', {
        dir: this.rng.chance(0.5) ? 1 : -1,
        left: 140 + this.rng.next() * 170,
      });
    };

    // -------------------------------------------------------------- hiding
    // Full hiding is disabled until the hardware locomotion pass is solid.
    b.hideBehind = () => false;
    b.state_slip_in = function hardwareNoSlip() {
      this.behind = null;
      this.ghost = null;
      this.compress = 0;
      this.setState('wander', {
        dir: this.rng.chance(0.5) ? 1 : -1,
        left: 180 + this.rng.next() * 280,
      });
    };
    b.state_behind = function hardwareNoBehind() {
      this.behind = null;
      this.ghost = null;
      this.compress = 0;
      this.setState('wander', {
        dir: this.rng.chance(0.5) ? 1 : -1,
        left: 180 + this.rng.next() * 280,
      });
    };

    const rawChooseActivity = b.chooseActivity.bind(b);
    b.chooseActivity = () => {
      rawChooseActivity();
      if (b.state.name === 'sleep' && b.rng.chance(0.78)) {
        b.setState('wander', {
          dir: b.rng.chance(0.5) ? 1 : -1,
          left: 180 + b.rng.next() * 320,
        });
      }
      if (b.goal?.purpose === 'hide') {
        b.goal = null;
        b.plan = [];
        b.behind = null;
        b.ghost = null;
        b.setState('wander', {
          dir: b.rng.chance(0.5) ? 1 : -1,
          left: 190 + b.rng.next() * 340,
        });
      }
    };

    // ---------------------------------------------------------- taskbar edge
    // A taskbar is too thin to be a four-sided habitat. On hardware it behaves
    // as a top ledge only, so SPEC cannot wrap onto its off-screen underside.
    const rawAdvance = b.advance.bind(b);
    b.advance = function hardwareAdvance(dt, speed, dir = this.facing) {
      const f = this.currentFrame;
      if (f?.meta?.type === 'taskbar') {
        const pad = Math.min(52, Math.max(24, f.w * 0.03));
        if (this.s < 0 || this.s > f.w) this.s = clamp(f.w * 0.5, pad, f.w - pad);
        const step = Math.abs(speed) * dt * (dir >= 0 ? 1 : -1);
        const next = this.s + step;
        if (next < pad || next > f.w - pad) {
          this.s = clamp(this.s, pad, f.w - pad);
          this.facing = next < pad ? 1 : -1;
          this.speed = 0;
          this.blocked = true;
          return 0;
        }
      }
      return rawAdvance(dt, speed, dir);
    };

    // ------------------------------------------------------------ body shape
    const rawSpecUpdate = spec.update.bind(spec);
    spec.update = (dt, drive) => softenPoseCorners(rawSpecUpdate(dt, drive));

    // -------------------------------------------------------------- watchdog
    let invisibleFor = 0;
    let stuckFor = 0;
    let lastHead = null;
    let lastTick = performance.now();
    const movingStates = new Set(['wander', 'travel', 'flee', 'emerge']);

    const rescue = () => {
      b.behind = null;
      b.ghost = null;
      b.plan = [];
      b.goal = null;
      spec.tail = null;
      b.spawn();
      invisibleFor = 0;
      stuckFor = 0;
      lastHead = null;
    };

    const timer = setInterval(() => {
      if (!globalThis.SPECIMEN || globalThis.SPECIMEN !== app) {
        clearInterval(timer);
        return;
      }
      const now = performance.now();
      const dt = Math.min(0.5, Math.max(0.05, (now - lastTick) / 1000));
      lastTick = now;

      const body = spec.bounds(0);
      const world = app.terrain.bounds;
      const ix = Math.max(0, Math.min(body.x + body.w, world.x + world.w) - Math.max(body.x, world.x));
      const iy = Math.max(0, Math.min(body.y + body.h, world.y + world.h) - Math.max(body.y, world.y));
      const visibleRatio = body.w > 0 && body.h > 0 ? (ix * iy) / (body.w * body.h) : 1;
      if (visibleRatio < 0.34 || spec.visible === false) invisibleFor += dt;
      else invisibleFor = Math.max(0, invisibleFor - dt * 2);

      const head = spec.headPoint();
      if (lastHead && movingStates.has(b.state.name)) {
        const moved = Math.hypot(head.x - lastHead.x, head.y - lastHead.y);
        if (moved < 1.5) stuckFor += dt;
        else stuckFor = Math.max(0, stuckFor - dt * 2);
      } else {
        stuckFor = 0;
      }
      lastHead = { ...head };

      if (invisibleFor > 0.85 || stuckFor > 1.15) rescue();
    }, 200);

    return true;
  }

  if (!tuneLiveOrganism()) {
    const timer = setInterval(() => {
      if (tuneLiveOrganism()) clearInterval(timer);
    }, 40);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();

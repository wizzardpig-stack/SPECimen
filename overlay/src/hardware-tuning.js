// Real-hardware tuning for SPECIMEN.
//
// The browser habitat was intentionally conservative. On an actual transparent
// Windows overlay two things became obvious immediately: dirty-rectangle canvas
// clearing can leave persistent body/eye ghosts on some WebView/GPU paths, and
// the observer-effect tuning makes a real mouse user drive SPEC out of sight far
// too often. Keep those hardware corrections here instead of smearing them into
// the creature anatomy or terrain model.

(() => {
  // ---------------------------------------------------------------- canvas
  // SPEC is a tiny drawing on a desktop-sized transparent canvas. A full clear
  // at 20-60fps is cheap on the target hardware and much safer than preserving
  // dirty rectangles through WebView2's transparent compositor. Only intercept
  // the SPEC canvas, and only when the real Tauri host is active.
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

  // -------------------------------------------------------------- behaviour
  function tuneLiveOrganism() {
    const app = globalThis.SPECIMEN;
    const b = app?.behavior;
    if (!b) return false;
    if (app.host?.kind !== 'tauri') return true;
    if (app.__hardwareVisibilityTuned) return true;
    app.__hardwareVisibilityTuned = true;

    // Lift the near-black renderer for a transparent real desktop without
    // turning SPEC into a glowing mascot. Contrast below 1 raises the deepest
    // blacks into graphite; the tiny green shadow preserves the wet rim read.
    const canvas = document.getElementById('spec');
    if (canvas) {
      canvas.style.filter =
        'brightness(1.08) contrast(0.84) saturate(1.08) drop-shadow(0 0 2px rgba(91,255,194,0.18))';
    }

    // First hardware build goal: SPEC should be easy to observe before we make
    // avoidance, hiding and long rests more nuanced. Preserve personality, but
    // put a floor under the traits that produce visible activity.
    b.personality.curiosity = Math.max(0.72, b.personality.curiosity);
    b.personality.boldness = Math.max(0.88, b.personality.boldness);
    b.personality.restlessness = Math.max(0.72, b.personality.restlessness);

    // Keep pauses biological without letting a fresh install look dead.
    const rawSetState = b.setState.bind(b);
    b.setState = (name, data = {}) => {
      const next = { ...data };
      if (name === 'idle') next.hold = Math.min(next.hold ?? 2.4, 2.8);
      if (name === 'sleep') next.hold = Math.min(next.hold ?? 8, 8);
      rawSetState(name, next);
    };

    // Cursor attention should produce eye/head behaviour, not a punishment for
    // watching the organism. Let observer pressure cross the 'watch' threshold
    // but keep it below the old repeated-retreat threshold.
    const rawTrackCursor = b.trackCursor.bind(b);
    b.trackCursor = (dt, cursor) => {
      rawTrackCursor(dt, cursor);
      b.observer = Math.min(b.observer, 0.78);
    };

    // On this build a retreat remains visible: a short dash along terrain. The
    // explicit hide behaviour still exists, it is simply no longer the default
    // response to somebody moving a mouse near SPEC.
    b.retreat = function hardwareRetreat() {
      this.behind = null;
      this.ghost = null;
      this.setState('flee', {
        dir: this.rng.chance(0.5) ? 1 : -1,
        left: 150 + this.rng.next() * 180,
      });
    };

    // Keep hiding as a rare organism beat rather than the dominant first-run
    // experience. Long sleep gets the same treatment until the user has had a
    // chance to actually see what SPEC does.
    const rawChooseActivity = b.chooseActivity.bind(b);
    b.chooseActivity = () => {
      rawChooseActivity();

      if (b.state.name === 'sleep' && b.rng.chance(0.72)) {
        b.setState('wander', {
          dir: b.rng.chance(0.5) ? 1 : -1,
          left: 180 + b.rng.next() * 300,
        });
        return;
      }

      if (b.goal?.purpose === 'hide' && b.rng.chance(0.75)) {
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

    // Even when SPEC does choose to go behind a window, hardware acceptance
    // should never leave the user staring at an empty desktop for a long time.
    const rawBehind = b.state_behind.bind(b);
    b.state_behind = (dt, ctx) => {
      rawBehind(dt, ctx);
      if (b.state.name === 'behind' && b.stateTime > 2.2) b.setState('emerge');
    };

    return true;
  }

  if (!tuneLiveOrganism()) {
    const timer = setInterval(() => {
      if (tuneLiveOrganism()) clearInterval(timer);
    }, 40);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();

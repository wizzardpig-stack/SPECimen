// Deterministic pseudo-randomness.
//
// Every stochastic choice SPEC makes runs through a seeded stream so a session
// can be replayed exactly (DEV console behaviour recorder, PRD 29) and so
// offline catch-up can be regenerated rather than simulated (PRD 26).

export function makeRng(seed = 0x5eed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    /** Uniform float in [lo, hi). */
    range: (lo, hi) => lo + next() * (hi - lo),
    /** Integer in [lo, hi]. */
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    /** True with probability p. */
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length) % list.length],
    /** Weighted pick. entries: [[value, weight], ...] */
    weighted(entries) {
      let total = 0;
      for (const [, w] of entries) total += Math.max(0, w);
      if (total <= 0) return entries.length ? entries[0][0] : undefined;
      let r = next() * total;
      for (const [value, w] of entries) {
        r -= Math.max(0, w);
        if (r <= 0) return value;
      }
      return entries[entries.length - 1][0];
    },
    /** Snapshot / restore so a scrubbed timeline can rewind (PRD 29). */
    getState: () => a,
    setState: (s) => {
      a = s >>> 0;
    },
  };
}

/** Stable 32-bit hash, used to derive per-organism seeds from a string. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Smooth, cheap 1-D value noise. Used for breathing, sway, micro-drift. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    let t = Math.imul(n ^ seed, 0x27d4eb2d);
    t ^= t >>> 15;
    return ((t >>> 0) % 10000) / 10000;
  };
  const a = h(i);
  const b = h(i + 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

// SPEC's world is not a bitmap: it is a small set of rectangles it can walk on.
//
// A Frame is one rectangle plus which side of it SPEC occupies:
//   side 'inner'  — SPEC is inside the rectangle (the display: floor, walls,
//                   ceiling seen from within)
//   side 'outer'  — SPEC is on the outside surface (a window or the taskbar:
//                   its top edge is a ledge, its sides are walls, its underside
//                   is a ceiling SPEC can hang from)
//
// Position on a frame is a single scalar `s`: arc length clockwise around the
// perimeter, starting at the top-left corner. That makes corners free — the
// body is sampled at s +/- offsets and wraps the corner by construction — and
// it makes it structurally impossible for SPEC to escape coordinate bounds
// (PRD 41), because every attached position is a point on a real edge.

export const EDGE_TOP = 0;
export const EDGE_RIGHT = 1;
export const EDGE_BOTTOM = 2;
export const EDGE_LEFT = 3;

export function makeFrame(id, rect, side = 'outer', meta = {}) {
  const w = Math.max(1, rect.w);
  const h = Math.max(1, rect.h);
  return {
    id,
    x: rect.x,
    y: rect.y,
    w,
    h,
    side,
    meta,
    perimeter: 2 * (w + h),
  };
}

export function rectOf(frame) {
  return { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
}

export function wrapS(frame, s) {
  const p = frame.perimeter;
  return ((s % p) + p) % p;
}

/** Which edge a given arc length falls on, and how far along that edge. */
export function edgeAt(frame, s) {
  const { w, h } = frame;
  let t = wrapS(frame, s);
  if (t < w) return { edge: EDGE_TOP, t };
  t -= w;
  if (t < h) return { edge: EDGE_RIGHT, t };
  t -= h;
  if (t < w) return { edge: EDGE_BOTTOM, t };
  t -= w;
  return { edge: EDGE_LEFT, t };
}

/** Arc length of the start of each edge. */
export function edgeStart(frame, edge) {
  const { w, h } = frame;
  return [0, w, w + h, w + h + w][edge];
}

const OUTWARD = [
  { nx: 0, ny: -1, tx: 1, ty: 0 }, // top
  { nx: 1, ny: 0, tx: 0, ty: 1 }, // right
  { nx: 0, ny: 1, tx: -1, ty: 0 }, // bottom
  { nx: -1, ny: 0, tx: 0, ty: -1 }, // left
];

function cornerPoint(frame, edge, t) {
  const { x, y, w, h } = frame;
  switch (edge) {
    case EDGE_TOP:
      return { x: x + t, y };
    case EDGE_RIGHT:
      return { x: x + w, y: y + t };
    case EDGE_BOTTOM:
      return { x: x + w - t, y: y + h };
    default:
      return { x, y: y + h - t };
  }
}

/**
 * Sample the frame surface at arc length `s`.
 *
 * Returns world position, unit tangent in the direction of increasing s, and
 * the surface normal — which is the direction SPEC's back faces, i.e. its
 * local "up". `round` blends the normal across corners so the creature turns
 * over an edge instead of snapping.
 */
export function pointAt(frame, s, round = 10) {
  const sw = wrapS(frame, s);
  const { edge, t } = edgeAt(frame, sw);
  const base = cornerPoint(frame, edge, t);
  const flip = frame.side === 'inner' ? -1 : 1;
  const here = OUTWARD[edge];

  let nx = here.nx * flip;
  let ny = here.ny * flip;
  let tx = here.tx;
  let ty = here.ty;

  if (round > 0) {
    const len = edge === EDGE_TOP || edge === EDGE_BOTTOM ? frame.w : frame.h;
    const distStart = t;
    const distEnd = len - t;
    let blend = 0;
    let other = null;
    if (distStart < round) {
      blend = (round - distStart) / (2 * round);
      other = OUTWARD[(edge + 3) % 4];
    } else if (distEnd < round) {
      blend = (round - distEnd) / (2 * round);
      other = OUTWARD[(edge + 1) % 4];
    }
    if (other) {
      nx = nx * (1 - blend) + other.nx * flip * blend;
      ny = ny * (1 - blend) + other.ny * flip * blend;
      tx = tx * (1 - blend) + other.tx * blend;
      ty = ty * (1 - blend) + other.ty * blend;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
    }
  }

  return { x: base.x, y: base.y, nx, ny, tx, ty, edge, s: sw };
}

/** Nearest point on the frame perimeter to an arbitrary world point. */
export function project(frame, px, py) {
  const { x, y, w, h } = frame;
  const cands = [
    { edge: EDGE_TOP, t: clamp(px - x, 0, w) },
    { edge: EDGE_RIGHT, t: clamp(py - y, 0, h) },
    { edge: EDGE_BOTTOM, t: clamp(x + w - px, 0, w) },
    { edge: EDGE_LEFT, t: clamp(y + h - py, 0, h) },
  ];
  let best = null;
  for (const c of cands) {
    const p = cornerPoint(frame, c.edge, c.t);
    const d = Math.hypot(p.x - px, p.y - py);
    if (!best || d < best.dist) {
      best = { dist: d, s: edgeStart(frame, c.edge) + c.t, edge: c.edge, x: p.x, y: p.y };
    }
  }
  return best;
}

/**
 * Move an arc position away from the corners of its edge. Landing targets that
 * sit exactly on a corner are missed by a few pixels and read as a failed leap,
 * so nav targets are kept a body-width inside the edge they belong to.
 */
export function nudgeOffCorner(frame, s, pad = 25) {
  const { edge, t } = edgeAt(frame, s);
  const len = edge === EDGE_TOP || edge === EDGE_BOTTOM ? frame.w : frame.h;
  const p = Math.min(pad, len / 2);
  return edgeStart(frame, edge) + clamp(t, p, len - p);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function containsPoint(frame, px, py, pad = 0) {
  return (
    px >= frame.x - pad &&
    px <= frame.x + frame.w + pad &&
    py >= frame.y - pad &&
    py <= frame.y + frame.h + pad
  );
}

function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const r1 = bx - ax;
  const r2 = by - ay;
  const s1 = dx - cx;
  const s2 = dy - cy;
  const denom = r1 * s2 - r2 * s1;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((cx - ax) * s2 - (cy - ay) * s1) / denom;
  const u = ((cx - ax) * r2 - (cy - ay) * r1) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/**
 * Cast the motion segment p0 -> p1 against every frame surface and return the
 * first landing. Only surfaces being approached from their own side count, so a
 * falling SPEC lands on the top of a window rather than teleporting to its
 * underside.
 */
export function raycastFrames(frames, p0, p1) {
  const vx = p1.x - p0.x;
  const vy = p1.y - p0.y;
  let best = null;

  for (const frame of frames) {
    const { x, y, w, h } = frame;
    const flip = frame.side === 'inner' ? -1 : 1;
    const edges = [
      [x, y, x + w, y, EDGE_TOP],
      [x + w, y, x + w, y + h, EDGE_RIGHT],
      [x + w, y + h, x, y + h, EDGE_BOTTOM],
      [x, y + h, x, y, EDGE_LEFT],
    ];
    for (const [ax, ay, bx, by, edge] of edges) {
      const n = OUTWARD[edge];
      const nx = n.nx * flip;
      const ny = n.ny * flip;
      if (vx * nx + vy * ny > -1e-6) continue; // moving away from this surface
      const hit = segHit(p0.x, p0.y, p1.x, p1.y, ax, ay, bx, by);
      if (!hit) continue;
      if (best && hit.t >= best.t) continue;
      const len = edge === EDGE_TOP || edge === EDGE_BOTTOM ? w : h;
      best = {
        t: hit.t,
        frame,
        edge,
        s: edgeStart(frame, edge) + hit.u * len,
        x: p0.x + vx * hit.t,
        y: p0.y + vy * hit.t,
      };
    }
  }
  return best;
}

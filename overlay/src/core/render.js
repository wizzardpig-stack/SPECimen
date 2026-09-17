// Rendering for SPEC-01.
//
// Matte obsidian body, no outline-cartoon look, no mascot colours. Everything
// is drawn from the pose produced by creature.js. The only colour in the
// organism is the green computational activity under its skin (PRD 6, PRD 8).

const SKIN_DARK = '#05060a';
const SKIN_MID = '#0c1014';
const SKIN_RIM = 'rgba(138,186,166,0.42)';
const CODE = '#3dffa6';

function centerline(pose) {
  const pts = [];
  for (const n of pose.spine) pts.push({ x: n.x, y: n.y, w: n.w });
  for (let i = 1; i < pose.tail.length; i++) {
    const t = pose.tail[i];
    pts.push({ x: t.x, y: t.y, w: t.w });
  }
  return pts;
}

function normalsFor(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    out.push({ nx: -dy, ny: dx, tx: dx, ty: dy });
  }
  return out;
}

function tracePath(ctx, pts, join = false) {
  if (pts.length < 2) return;
  if (join) ctx.lineTo(pts[0].x, pts[0].y);
  else ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function bodyPath(ctx, pts, norms) {
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const n = norms[i];
    left.push({ x: p.x + n.nx * p.w, y: p.y + n.ny * p.w });
    right.push({ x: p.x - n.nx * p.w, y: p.y - n.ny * p.w });
  }
  ctx.beginPath();
  tracePath(ctx, left);
  const tip = pts[pts.length - 1];
  ctx.lineTo(tip.x, tip.y);
  tracePath(ctx, right.slice().reverse(), true);
  ctx.closePath();
}

function limbPath(ctx, limb, scale, near) {
  const w = (near ? 4.0 : 3.3) * scale;
  ctx.beginPath();
  ctx.moveTo(limb.shoulder.x, limb.shoulder.y);
  ctx.quadraticCurveTo(limb.knee.x, limb.knee.y, limb.foot.x, limb.foot.y);
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  // Upper limb has a little mass on it.
  ctx.beginPath();
  ctx.moveTo(limb.shoulder.x, limb.shoulder.y);
  ctx.lineTo(limb.knee.x, limb.knee.y);
  ctx.lineWidth = w * 1.7;
  ctx.stroke();
}

function fingers(ctx, limb, scale, near) {
  const a = limb.grip;
  const n = 4;
  const len = (near ? 7.4 : 6.2) * scale;
  ctx.lineWidth = 1.5 * scale;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const spread = (-0.75 + (i / (n - 1)) * 1.5) * (0.85 + (i === 3 ? 0.5 : 0));
    const ang = a + spread;
    const curl = limb.planted ? 1 : 0.55;
    ctx.beginPath();
    ctx.moveTo(limb.foot.x, limb.foot.y);
    const mx = limb.foot.x + Math.cos(ang) * len * 0.6;
    const my = limb.foot.y + Math.sin(ang) * len * 0.6;
    ctx.quadraticCurveTo(
      mx,
      my,
      limb.foot.x + Math.cos(ang + 0.25 * curl) * len,
      limb.foot.y + Math.sin(ang + 0.25 * curl) * len,
    );
    ctx.stroke();
  }
}

function headPath(ctx, head, scale) {
  const c = Math.cos(head.dir);
  const s = Math.sin(head.dir);
  const px = -s;
  const py = c;
  const L = head.len;
  const W = head.w;
  const p = (along, across) => ({
    x: head.x + c * along + px * across,
    y: head.y + s * along + py * across,
  });
  const a = p(-L * 0.52, W * 0.76);
  const b = p(-L * 0.02, W * 1.0);
  const cc = p(L * 0.5, W * 0.24);
  const nose = p(L * 0.72, 0);
  const d = p(L * 0.5, -W * 0.26);
  const e = p(-L * 0.02, -W * 0.92);
  const f = p(-L * 0.52, -W * 0.6);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(b.x, b.y, cc.x, cc.y);
  ctx.quadraticCurveTo(nose.x, nose.y, d.x, d.y);
  ctx.quadraticCurveTo(e.x, e.y, f.x, f.y);
  ctx.quadraticCurveTo(p(-L * 0.66, 0).x, p(-L * 0.66, 0).y, a.x, a.y);
  ctx.closePath();
}

function drawShadow(ctx, pose) {
  const sc = pose.scale;
  ctx.save();
  for (const limb of pose.limbs) {
    if (!limb.planted || limb.far) continue;
    const g = ctx.createRadialGradient(limb.foot.x, limb.foot.y, 0, limb.foot.x, limb.foot.y, 16 * sc);
    g.addColorStop(0, 'rgba(0,0,0,0.30)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(limb.foot.x - 16 * sc, limb.foot.y - 16 * sc, 32 * sc, 32 * sc);
  }
  const mid = pose.spine[5];
  const g = ctx.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, 46 * sc);
  g.addColorStop(0, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(mid.x - 46 * sc, mid.y - 46 * sc, 92 * sc, 92 * sc);
  ctx.restore();
}

function drawInternalCode(ctx, pose, pts, norms, t) {
  if (pose.fear > 0.85) return;
  const sc = pose.scale;
  ctx.save();
  bodyPath(ctx, pts, norms);
  ctx.clip();

  const along = (u) => {
    const f = Math.max(0, Math.min(0.999, u)) * (pts.length - 1);
    const i = Math.floor(f);
    const k = f - i;
    const a = pts[i];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const n = norms[i];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, nx: n.nx, ny: n.ny, w: a.w };
  };

  // Resting substrate: a faint lattice that only reads up close.
  ctx.globalAlpha = 0.05 + pose.charge * 0.05;
  ctx.strokeStyle = CODE;
  ctx.lineWidth = 0.8 * sc;
  for (let i = 2; i < pts.length - 1; i += 2) {
    const p = pts[i];
    const n = norms[i];
    const inset = p.w * 0.55;
    ctx.beginPath();
    ctx.moveTo(p.x - n.nx * inset, p.y - n.ny * inset);
    ctx.lineTo(p.x + n.nx * inset, p.y + n.ny * inset);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const pulse of pose.pulses) {
    const head = along(pulse.u);
    const tail = along(pulse.u + pulse.len);
    const taper = 1 - Math.max(0, pulse.u - 0.55) * 1.6;
    const alpha =
      pulse.bright * 0.32 * Math.max(0, taper) * (1 - pose.fear * 0.8) *
      (pulse.u < 0 ? Math.max(0, 1 + pulse.u / 0.15) : 1);
    const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
    grad.addColorStop(0, 'rgba(61,255,166,0)');
    grad.addColorStop(1, `rgba(61,255,166,${(alpha * 0.9).toFixed(3)})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(1, head.w * 0.26);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();

    // Small ticks read as structure rather than a glow.
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = CODE;
    const ticks = 3;
    for (let i = 0; i < ticks; i++) {
      const u = pulse.u + (i / ticks) * pulse.len;
      const p = along(u);
      const off = ((pulse.seed + i * 37) % 7) / 7 - 0.5;
      ctx.fillRect(
        p.x + p.nx * off * p.w * 1.1 - 0.6 * sc,
        p.y + p.ny * off * p.w * 1.1 - 0.6 * sc,
        1.2 * sc,
        1.2 * sc,
      );
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawEyes(ctx, pose) {
  const sc = pose.scale;
  for (const eye of pose.eyes) {
    if (eye.hidden) continue;
    const r = eye.r;
    const open = eye.open;
    ctx.save();
    ctx.translate(eye.x, eye.y);
    ctx.rotate(pose.head.dir);
    ctx.scale(1, Math.max(0.06, open));

    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.12, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#01020a';
    ctx.fill();

    // Reflective iris: dark, wet, with a cold internal ring.
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(120,255,205,0.55)');
    g.addColorStop(0.45, 'rgba(24,86,66,0.65)');
    g.addColorStop(1, 'rgba(2,6,8,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(pose.pupil.x * r * 0.35, pose.pupil.y * r * 0.35, r * 0.92, r * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();

    // Slit pupil.
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.beginPath();
    ctx.ellipse(
      pose.pupil.x * r * 0.45,
      pose.pupil.y * r * 0.45,
      r * (0.16 + pose.fear * 0.2),
      r * 0.62,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.34, r * 0.17, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Brow ridge, drawn after so the eye sits under the skull.
    ctx.strokeStyle = 'rgba(4,6,9,0.9)';
    ctx.lineWidth = 1.6 * sc;
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, r * 1.18, pose.head.dir - 3.5, pose.head.dir - 1.1);
    ctx.stroke();
  }
}

export function drawSpec(ctx, pose, opts = {}) {
  if (!pose) return;
  const sc = pose.scale;
  const t = opts.time || 0;
  const pts = centerline(pose);
  const norms = normalsFor(pts);

  ctx.save();
  ctx.globalAlpha = pose.opacity;

  if (opts.shadows !== false) drawShadow(ctx, pose);

  // Far limbs sit behind the torso and read as depth.
  ctx.strokeStyle = '#030407';
  for (const limb of pose.limbs) {
    if (!limb.far) continue;
    limbPath(ctx, limb, sc, false);
    fingers(ctx, limb, sc, false);
  }

  // Torso + tail.
  bodyPath(ctx, pts, norms);
  const tailTip = pts[pts.length - 1];
  const mid = pts[Math.min(4, pts.length - 1)];
  const midN = norms[Math.min(4, norms.length - 1)];
  const span = Math.max(12, mid.w * 2.4);
  const grad = ctx.createLinearGradient(
    mid.x + midN.nx * span,
    mid.y + midN.ny * span,
    mid.x - midN.nx * span,
    mid.y - midN.ny * span,
  );
  grad.addColorStop(0, '#12171c');
  grad.addColorStop(0.42, SKIN_MID);
  grad.addColorStop(0.8, SKIN_DARK);
  grad.addColorStop(1, '#020305');
  ctx.fillStyle = grad;
  ctx.fill();

  drawInternalCode(ctx, pose, pts, norms, t);

  // Rim light along the back. Enough to separate an obsidian body from a dark
  // desktop, not so much that SPEC reads as an outlined drawing.
  ctx.save();
  bodyPath(ctx, pts, norms);
  ctx.clip();
  const rim = pts.map((p, i) => ({
    x: p.x + norms[i].nx * p.w,
    y: p.y + norms[i].ny * p.w,
  }));
  const rimGrad = ctx.createLinearGradient(rim[0].x, rim[0].y, tailTip.x, tailTip.y);
  rimGrad.addColorStop(0, SKIN_RIM);
  rimGrad.addColorStop(0.35, 'rgba(138,186,166,0.26)');
  rimGrad.addColorStop(0.75, 'rgba(138,186,166,0.13)');
  rimGrad.addColorStop(1, 'rgba(138,186,166,0.05)');
  ctx.strokeStyle = rimGrad;
  ctx.lineWidth = 2.0 * sc;
  ctx.beginPath();
  tracePath(ctx, rim);
  ctx.stroke();

  // Vertebral ridge: a row of faint plates just under the dorsal line.
  ctx.strokeStyle = 'rgba(150,200,178,0.04)';
  ctx.lineWidth = 1.1 * sc;
  for (let i = 2; i < Math.min(pts.length, 10); i++) {
    const p = pts[i];
    const n = norms[i];
    ctx.beginPath();
    ctx.moveTo(p.x + n.nx * p.w * 0.62, p.y + n.ny * p.w * 0.62);
    ctx.lineTo(p.x + n.nx * p.w * 0.34 + n.tx * 4 * sc, p.y + n.ny * p.w * 0.34 + n.ty * 4 * sc);
    ctx.stroke();
  }
  ctx.restore();

  // Near limbs in front of the body.
  ctx.strokeStyle = '#070a0e';
  for (const limb of pose.limbs) {
    if (limb.far) continue;
    limbPath(ctx, limb, sc, true);
    fingers(ctx, limb, sc, true);
  }

  // Head last: it overlaps the neck.
  headPath(ctx, pose.head, sc);
  const hg = ctx.createLinearGradient(
    pose.head.x - pose.head.nx * pose.head.w,
    pose.head.y - pose.head.ny * pose.head.w,
    pose.head.x + pose.head.nx * pose.head.w,
    pose.head.y + pose.head.ny * pose.head.w,
  );
  hg.addColorStop(0, '#04050a');
  hg.addColorStop(1, SKIN_MID);
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(126,168,150,0.18)';
  ctx.lineWidth = 1.2 * sc;
  ctx.stroke();

  drawEyes(ctx, pose);

  ctx.restore();
}

/**
 * Erase the parts of SPEC covered by windows it is currently behind.
 * This is how "hiding behind a window" is simulated: the overlay is always on
 * top, so occlusion is produced by removing pixels, never by touching the real
 * window (PRD 4, PRD 9).
 */
export function applyOccluders(ctx, occluders) {
  if (!occluders || !occluders.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (const r of occluders) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

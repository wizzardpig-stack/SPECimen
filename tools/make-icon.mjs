// Generates src-tauri/icons/icon.ico — the only art asset in the project, and
// it is generated rather than drawn: an obsidian tile with one reflective eye.
//
//   node tools/make-icon.mjs
//
// Multi-size ICO, 32-bit BGRA, BMP-encoded (universally supported).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src-tauri',
  'icons',
  'icon.ico',
);
const SIZES = [16, 32, 48, 64];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (edge, width, v) => clamp01((edge - v) / width + 0.5);

/** Signed distance to a rounded square, in units of the half-size. */
function roundedBox(x, y, half, radius) {
  const dx = Math.abs(x) - (half - radius);
  const dy = Math.abs(y) - (half - radius);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - radius;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const half = size * 0.46;
  const aa = Math.max(0.8, size / 32);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x - c;
      const fy = y - c;

      const body = smooth(0, aa, roundedBox(fx, fy, half, size * 0.17));
      // Obsidian, lit slightly from the top.
      const shade = 1 - clamp01((fy + half) / (half * 2));
      let r = 6 + shade * 14;
      let g = 8 + shade * 18;
      let b = 11 + shade * 20;

      // One eye: an almond with a vertical slit, offset up and left.
      const ex = (fx + size * 0.1) / (size * 0.2);
      const ey = (fy + size * 0.08) / (size * 0.13);
      const eye = smooth(1, 0.22, Math.hypot(ex, ey));
      const slit = smooth(1, 0.3, Math.hypot(ex / 0.3, ey / 0.86));
      const glint = smooth(1, 0.5, Math.hypot((ex + 0.35) / 0.3, (ey + 0.35) / 0.3));

      r = r + eye * (26 - r) + glint * 120;
      g = g + eye * (232 - g) + glint * 120;
      b = b + eye * (150 - b) + glint * 120;
      r -= slit * r * 0.92;
      g -= slit * g * 0.88;
      b -= slit * b * 0.9;

      // Two subdermal ticks, low and right, the way the body carries them.
      const tick =
        smooth(0, aa, Math.abs(fx - size * 0.16) - size * 0.015) *
        smooth(0, aa, Math.abs(fy - size * 0.2) - size * 0.09);
      r += tick * 20;
      g += tick * 150;
      b += tick * 95;

      const i = (y * size + x) * 4;
      px[i] = Math.min(255, Math.round(b));
      px[i + 1] = Math.min(255, Math.round(g));
      px[i + 2] = Math.min(255, Math.round(r));
      px[i + 3] = Math.round(body * 255);
    }
  }
  return px;
}

function dib(size, px) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND masks
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4, 20);

  const colour = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4; // BMP rows run bottom-up
    px.copy(colour, y * size * 4, src, src + size * 4);
  }
  const maskStride = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, colour, Buffer.alloc(maskStride * size)]);
}

const images = SIZES.map((size) => ({ size, data: dib(size, render(size)) }));

const dir = Buffer.alloc(6 + 16 * images.length);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(images.length, 4);
let offset = dir.length;
images.forEach((img, i) => {
  const e = 6 + i * 16;
  dir.writeUInt8(img.size === 256 ? 0 : img.size, e);
  dir.writeUInt8(img.size === 256 ? 0 : img.size, e + 1);
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(img.data.length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += img.data.length;
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([dir, ...images.map((i) => i.data)]));
console.log(`wrote ${out} (${SIZES.join(', ')}px)`);

// PRD 42 acceptance check, run against the real overlay in a real browser.
//
//   node tests/first-build.mjs [--shots <dir>]
//
// Needs Playwright (`npx playwright install chromium` once, or a global
// install). It serves overlay/ over HTTP, boots SPEC on the simulated desktop,
// runs the first-build sequence, and checks each beat actually happened:
//
//   3. idle animation      4. biological crawl     5. cursor tracking
//   6. walking the bottom screen edge               7. climbing a window edge
//   8. hiding behind that window                    9. emerging the other side
//  10. stable performance
//
// Items 1 and 2 — transparent overlay and click passthrough — belong to the
// Windows host and cannot be verified from inside the page; see README.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', 'overlay');
const shotsArg = process.argv.indexOf('--shots');
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : null;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

async function importPlaywright() {
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try {
      return await import(spec);
    } catch {
      /* try the next one */
    }
  }
  throw new Error('Playwright is not installed: npm i -D playwright && npx playwright install chromium');
}

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const file = path.join(root, rel || 'index.html');
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const { chromium } = await importPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.SPECIMEN?.spec?.pose, null, { timeout: 10000 });
await page.evaluate(() => document.querySelector('.dev')?.classList.add('hidden'));

const probe = () =>
  page.evaluate(() => {
    const a = window.SPECIMEN;
    const pose = a.spec.pose;
    return {
      state: a.behavior.state.name,
      surface: a.behavior.currentFrame?.id ?? null,
      behind: a.behavior.behind,
      s: a.behavior.s,
      head: a.spec.headPoint(),
      headDir: pose ? pose.head.dir : 0,
      feet: pose ? pose.limbs.map((l) => ({ x: l.foot.x, y: l.foot.y, planted: l.planted })) : [],
      speed: a.behavior.speed,
      fps: a.stats.fps,
      sim: a.stats.sim,
      draw: a.stats.draw,
    };
  });

// --- 3. idle animation: the body moves while the creature does not ---------
await page.evaluate(() => window.SPECIMEN.behavior.setState('idle', { hold: 99 }));
await page.waitForTimeout(300);
const idleA = await probe();
await page.waitForTimeout(900);
const idleB = await probe();
check(
  '3. idles without being frozen',
  Math.abs(idleB.head.x - idleA.head.x) < 6 && idleA.headDir !== idleB.headDir,
  `head drift ${(idleB.head.x - idleA.head.x).toFixed(2)}px`,
);

// --- 5. cursor tracking ---------------------------------------------------
await page.mouse.move(idleA.head.x + 40, Math.max(10, idleA.head.y - 220));
await page.waitForTimeout(700);
const looked = await probe();
const wantDir = Math.atan2(
  Math.max(10, idleA.head.y - 220) - looked.head.y,
  idleA.head.x + 40 - looked.head.x,
);
const off = Math.abs(Math.atan2(Math.sin(wantDir - looked.headDir), Math.cos(wantDir - looked.headDir)));
check('5. tracks the cursor with its head', off < 1.0, `${off.toFixed(2)} rad off`);
await page.mouse.move(60, 60);

// --- direct interaction: SPEC can be picked up and thrown (PRD 11) --------
const grabbed = await probe();
await page.mouse.move(grabbed.head.x, grabbed.head.y);
await page.mouse.down();
await page.mouse.move(grabbed.head.x + 60, grabbed.head.y - 200, { steps: 6 });
const held = await probe();
await page.mouse.move(grabbed.head.x + 260, grabbed.head.y - 320, { steps: 3 });
await page.mouse.up();
await page.waitForTimeout(150);
const thrown = await probe();
await page.waitForTimeout(4000);
const landed = await probe();
check(
  'picking SPEC up and throwing it lands it back on a surface',
  held.state === 'held' && ['fall', 'recover', 'idle', 'wander'].includes(thrown.state) && landed.surface !== null,
  `held -> ${thrown.state} -> ${landed.state}@${landed.surface}`,
);

// --- 4/6/7/8/9: the scripted sequence -------------------------------------
await page.evaluate(() => window.SPECIMEN.runFirstBuildDemo());
const stages = new Map();
const timeline = [];
const deadline = Date.now() + 90000;
let last = null;
let crawlFeet = 0;
let groundWalk = 0;

while (Date.now() < deadline && !(stages.has('emerge') && stages.get('emerge').done)) {
  const p = await probe();
  if (p.state !== last) {
    timeline.push(`${p.state}@${p.surface ?? 'air'}`);
    last = p.state;
  }
  if (p.state === 'wander' && (p.surface === 'taskbar' || p.surface?.startsWith('screen'))) {
    groundWalk++;
    if (p.feet.some((f) => !f.planted)) crawlFeet++;
  }
  for (const key of ['wander', 'travel', 'slip-in', 'behind', 'emerge']) {
    if (p.state === key && !stages.has(key)) {
      stages.set(key, { s: p.s, surface: p.surface, done: false });
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, `${key.replace('-', '')}.png`) });
      }
    }
  }
  if (stages.has('emerge') && p.behind === null) stages.get('emerge').done = true;
  await page.waitForTimeout(100);
}

check('4. crawls with a real gait', crawlFeet > 5 && groundWalk > 5, `${crawlFeet} stepping samples`);
check('6. walks the bottom screen edge', stages.has('wander'), stages.get('wander')?.surface ?? '');
check('7. climbs onto a window', (stages.get('travel')?.surface ?? '').startsWith('win:') || (stages.get('slip-in')?.surface ?? '').startsWith('win:'), stages.get('slip-in')?.surface ?? '');
check('8. hides behind that window', stages.has('behind'), stages.get('behind')?.surface ?? '');
check(
  '9. emerges from the opposite side',
  !!stages.get('emerge')?.done,
  stages.has('emerge') ? `entered s=${Math.round(stages.get('slip-in')?.s ?? -1)}, left s=${Math.round(stages.get('emerge').s)}` : 'never emerged',
);

// --- 10. stable performance ----------------------------------------------
await page.evaluate(() => window.SPECIMEN.behavior.setState('idle', { hold: 30 }));
await page.waitForTimeout(3000);
const perf = await probe();
check(
  '10. stays cheap while resting',
  perf.sim + perf.draw < 4,
  `sim ${perf.sim.toFixed(2)}ms + draw ${perf.draw.toFixed(2)}ms per frame at ${perf.fps.toFixed(0)}fps`,
);
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\ntimeline: ${timeline.join(' > ')}`);
await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

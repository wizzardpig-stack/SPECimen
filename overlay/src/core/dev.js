// SPECIMEN DEV console (PRD 29).
//
// Hidden by default, never present in a normal user build unless explicitly
// enabled (?dev=1, or Ctrl+Alt+Shift+D). It forces states that would otherwise
// take minutes to reach, and exposes the internal model that normal users must
// never see (PRD 28, PRD 35).
//
// Controls for systems that do not exist yet — phenotype weights, the day
// timeline, molting, INCIDENTS, prediction — are listed but disabled rather
// than faked, so the console never implies behaviour the build does not have.

import { edgeStart, EDGE_LEFT } from './frames.js';
import { firstBuildDemo } from './demo.js';

const PHASE_LATER = 'Phases 4–7 — not in this build';

export function mountDevConsole(app, toggle = false) {
  if (app.dev) {
    if (toggle) {
      const open = app.dev.el.classList.toggle('hidden');
      app.devOpen = !open;
      app.host.setInteractive?.(!open);
    }
    return app.dev;
  }

  const el = document.createElement('div');
  el.className = 'dev';
  el.innerHTML = `
    <header>
      <b>SPECIMEN</b><span class="sub">DEV</span>
      <button data-act="close" title="hide (Ctrl+Alt+Shift+D)">—</button>
    </header>
    <pre class="state"></pre>
    <div class="group"><h4>Force behaviour</h4><div class="row" data-row="behaviour"></div></div>
    <div class="group"><h4>Body</h4><div class="sliders"></div></div>
    <div class="group"><h4>Inspect</h4><div class="row" data-row="debug"></div></div>
    <div class="group"><h4>Sequences</h4><div class="row" data-row="seq"></div></div>
    <div class="group later"><h4>Adaptation</h4><div class="row" data-row="later"></div><p class="note">${PHASE_LATER}</p></div>
  `;
  document.body.appendChild(el);

  const b = app.behavior;
  const t = app.terrain;

  const behaviourButtons = [
    ['Idle', () => b.setState('idle', { hold: 6 })],
    ['Wander', () => b.setState('wander', { dir: b.facing, left: 500 })],
    ['Crawl slow', () => b.setState('wander', { dir: b.facing, left: 400, sneak: true })],
    ['Sleep', () => b.setState('sleep', { hold: 60 })],
    ['Fear', () => { b.fear = 1; b.startle = 1; }],
    ['Watched', () => { b.observer = 1; b.setState('watch', { hold: 4 }); }],
    ['Climb window', () => {
      const win = t.windows[0];
      if (win) b.travelTo(win.id, edgeStart(win, EDGE_LEFT) + win.h * 0.5, 'explore');
    }],
    ['Hide behind', () => { const win = t.windows[0]; if (win) b.hideBehind(win); }],
    ['Peek', () => { if (b.behind) b.setState('peek', { hold: 4 }); }],
    ['Emerge', () => { if (b.behind) b.setState('emerge'); }],
    ['Fall', () => { b.detach(b.facing * 60, -260, 8); b.setState('fall', {}); }],
    ['Throw', () => {
      b.grab(b.worldPoint().x, b.worldPoint().y);
      b.release(900 * (app.rng.chance(0.5) ? 1 : -1), -700);
    }],
    ['Surface lost', () => b.onSurfaceLost()],
    ['Taskbar', () => {
      const tb = t.get('taskbar');
      if (tb) b.travelTo(tb.id, tb.w * 0.5, 'perch');
    }],
  ];

  const sliders = [
    ['scale', 0.5, 2, 0.05, () => app.spec.scale, (v) => (app.spec.scale = v)],
    ['internal code', 0, 1, 0.01, () => b.charge, (v) => { b.charge = v; app.spec.charge = v; }],
    ['observer', 0, 1, 0.01, () => b.observer, (v) => (b.observer = v)],
    ['fear', 0, 1, 0.01, () => b.fear, (v) => (b.fear = v)],
    ['compress', 0, 1, 0.01, () => b.compress, (v) => (b.compress = v)],
  ];

  const debugToggles = [
    ['Frames', 'frames'],
    ['Links', 'links'],
    ['Pose', 'pose'],
  ];

  const seqButtons = [
    ['First-build sequence', () => b.playScript(firstBuildDemo(b, t))],
    ['Record', () => { app.recorder = []; }],
    ['Stop', () => { app.recorded = app.recorder; app.recorder = null; }],
    ['Replay', () => {
      const frames = app.recorded;
      if (frames && frames.length) app.playback = { frames, i: 0 };
    }],
    ['Pause', () => (app.paused = !app.paused)],
  ];

  const laterButtons = [
    'Phenotype weights', 'Nocturnal modifier', 'Routine stability', 'Organism age',
    'Day 1 → 7 → 30 → 100', 'Molt', 'INCIDENT', 'Prediction hit / miss', 'Hidden world portal',
  ];

  const mkRow = (name, items) => {
    const row = el.querySelector(`[data-row="${name}"]`);
    for (const [label, fn] of items) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.addEventListener('click', fn);
      row.appendChild(btn);
    }
    return row;
  };

  mkRow('behaviour', behaviourButtons);
  mkRow('seq', seqButtons);
  mkRow(
    'debug',
    debugToggles.map(([label, key]) => [
      label,
      (e) => {
        app.debug[key] = !app.debug[key];
        e.target.classList.toggle('on', app.debug[key]);
      },
    ]),
  );
  const laterRow = el.querySelector('[data-row="later"]');
  for (const label of laterButtons) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.disabled = true;
    btn.title = PHASE_LATER;
    laterRow.appendChild(btn);
  }

  const sliderHost = el.querySelector('.sliders');
  for (const [label, min, max, step, get, set] of sliders) {
    const wrap = document.createElement('label');
    wrap.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><i></i>`;
    const input = wrap.querySelector('input');
    const out = wrap.querySelector('i');
    input.value = get();
    out.textContent = Number(get()).toFixed(2);
    input.addEventListener('input', () => {
      set(Number(input.value));
      out.textContent = Number(input.value).toFixed(2);
    });
    sliderHost.appendChild(wrap);
  }

  el.querySelector('[data-act="close"]').addEventListener('click', () => {
    el.classList.add('hidden');
    app.devOpen = false;
    app.host.setInteractive?.(false);
  });

  const stateEl = el.querySelector('.state');
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : String(v));
  const tick = () => {
    const goal = b.goal ? `${b.goal.frameId} @${Math.round(b.goal.s)} (${b.goal.purpose})` : '—';
    const surf = b.currentFrame ? `${b.currentFrame.id} s=${Math.round(b.s)}` : 'airborne';
    stateEl.textContent = [
      `behaviour     ${b.state.name}  ${b.stateTime.toFixed(1)}s`,
      `target        ${goal}`,
      `surface       ${surf}${b.behind ? `  behind=${b.behind}` : ''}`,
      `speed         ${Math.round(b.speed)} px/s   facing ${b.facing > 0 ? '+' : '-'}`,
      `observer      ${fmt(b.observer)}   startle ${fmt(b.startle)}`,
      `mood          fear ${fmt(b.fear)}  alert ${fmt(b.alert)}  code ${fmt(b.charge)}`,
      `traits        ${Object.entries(b.personality).map(([k, v]) => `${k[0]}${fmt(v)}`).join(' ')}`,
      `cost          ${app.stats.fps.toFixed(0)}fps  sim ${app.stats.sim.toFixed(2)}ms  draw ${app.stats.draw.toFixed(2)}ms`,
      `frames        ${t.frames.length}  windows ${t.windows.length}  rev ${t.revision}`,
      `phenotype     —   routines —   incidents —`,
    ].join('\n');
    requestAnimationFrame(tick);
  };
  tick();

  app.dev = { el };
  app.devOpen = true;
  app.host.setInteractive?.(true);
  return app.dev;
}

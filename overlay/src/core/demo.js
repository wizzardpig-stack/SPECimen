// The PRD 42 first-build sequence, as a runnable script.
//
// Used by the DEV console and by the automated acceptance check: idle, crawl,
// walk the bottom screen edge, climb a detected window edge, hide behind it,
// come out the other side.

import { edgeStart, EDGE_LEFT } from './frames.js';

export function firstBuildDemo(behavior, terrain) {
  const pick = () => terrain.windows[0] || null;

  return [
    {
      run(b) {
        const ground = terrain.groundFrame(terrain.bounds.w * 0.75, terrain.bounds.h - 10);
        if (!ground) return;
        const s = ground.side === 'inner'
          ? ground.w + ground.h + ground.w * 0.25
          : ground.w * 0.75;
        b.attach(ground, s, 1);
        b.setState('idle', { hold: 99 });
      },
      wait: 1.6,
    },
    {
      // 6. walking along the bottom screen edge
      run(b) {
        b.setState('wander', { dir: 1, left: 520 });
      },
      until: (b) => b.state.name !== 'wander',
    },
    {
      // 7. climbing one detected window edge
      run(b) {
        const win = pick();
        if (!win) return;
        const s = edgeStart(win, EDGE_LEFT) + win.h * 0.45;
        if (!b.travelTo(win.id, s, 'explore')) b.setState('idle', { hold: 1 });
      },
      until: (b) => b.state.name === 'idle' || b.state.t > 26,
    },
    {
      // 8. hiding behind that window
      run(b) {
        const win = pick();
        if (win) b.hideBehind(win);
      },
      until: (b) => b.state.name === 'behind' || b.state.t > 26,
    },
    {
      // 9. emerging from the opposite side: wait for SPEC to cross behind the
      // window, then let it come out where it arrives.
      until: (b) => b.state.name === 'behind' && Math.abs(b.deltaTo(b.state.exitS)) < 14,
    },
    {
      run(b) {
        if (b.behind && b.state.name !== 'emerge') b.setState('emerge');
      },
      until: (b) => b.behind === null,
    },
    { wait: 2 },
  ];
}

// Bridge to the Windows host process.
//
// The host owns everything that requires the OS: the transparent always-on-top
// window, cursor position, display topology, the list of visible top-level
// windows, and click-through. It pushes structured snapshots; the overlay never
// captures the screen (PRD 5).

/**
 * The host reports physical pixels; the overlay draws in its own CSS pixels.
 * Convert once, on the way in, using the scale factor of the monitor the
 * overlay window lives on.
 */
function toCss(env) {
  if (!env) return env;
  const k = env.scale && env.scale > 0 ? env.scale : 1;
  if (k === 1) return env;
  const r = (v) => (v == null ? v : { x: v.x / k, y: v.y / k, w: v.w / k, h: v.h / k });
  return {
    ...env,
    bounds: r(env.bounds),
    taskbar: r(env.taskbar),
    displays: (env.displays || []).map((d) => ({ ...d, ...r(d) })),
    windows: (env.windows || []).map((w) => ({ ...w, ...r(w) })),
  };
}

export async function createTauriHost() {
  const tauri = globalThis.__TAURI__;
  if (!tauri) return null;
  const { event, core } = tauri;
  const invoke = core.invoke;

  const host = {
    kind: 'tauri',
    env: null,
    cursor: { x: 0, y: 0, down: false },
    listeners: new Set(),
    lastHit: null,

    onEnv(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },

    /**
     * Tell the host which rectangle of the overlay should capture the pointer.
     * Everything outside it stays click-through, so the desktop behaves
     * normally (PRD 32).
     */
    setHitRect(rect) {
      // Back to physical pixels for the host.
      const k = (this.env && this.env.scale) || 1;
      const r =
        rect && rect.w > 0
          ? { x: rect.x * k, y: rect.y * k, w: rect.w * k, h: rect.h * k }
          : null;
      const prev = this.lastHit;
      if (
        prev === r ||
        (prev && r && Math.abs(prev.x - r.x) < 3 && Math.abs(prev.y - r.y) < 3 &&
          Math.abs(prev.w - r.w) < 3 && Math.abs(prev.h - r.h) < 3)
      ) {
        return;
      }
      this.lastHit = r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) } : null;
      invoke('set_hit_rect', { rect: this.lastHit }).catch(() => {});
    },

    setInteractive(on) {
      invoke('set_interactive', { on: !!on }).catch(() => {});
    },
  };

  await event.listen('specimen://env', (e) => {
    host.env = toCss(e.payload);
    for (const fn of host.listeners) fn(host.env);
  });
  await event.listen('specimen://cursor', (e) => {
    const k = (host.env && host.env.scale) || 1;
    host.cursor = { x: e.payload.x / k, y: e.payload.y / k, down: !!e.payload.down };
  });

  host.env = toCss(await invoke('get_env'));
  return host;
}

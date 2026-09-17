// A simulated desktop, for developing SPEC away from Windows.
//
// It draws a fake wallpaper, fake application windows and a fake taskbar behind
// the overlay canvas and reports their geometry in exactly the shape the real
// host reports. Windows can be dragged and closed, which is how surface-motion
// and surface-loss behaviour gets exercised without a Windows machine.

const APPS = [
  { app: 'chrome', title: 'Chromium — Specimen field notes', x: 150, y: 110, w: 760, h: 540, chrome: true },
  { app: 'code', title: 'editor — behavior.js', x: 1000, y: 300, w: 540, h: 460 },
];

export function createMockHost(root, opts = {}) {
  const bounds = opts.bounds || { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  const taskbarH = 44;

  const desk = document.createElement('div');
  desk.className = 'mock-desktop';
  root.appendChild(desk);

  const windows = [];
  let nextId = 1;

  const host = {
    kind: 'mock',
    env: null,
    cursor: { x: bounds.w / 2, y: bounds.h / 2, down: false },
    listeners: new Set(),
    onEnv(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },
    setHitRect() {},
    setInteractive() {},
    emit() {
      this.env = snapshot();
      for (const fn of this.listeners) fn(this.env);
    },
    addWindow,
    closeWindow,
    windows,
  };

  function snapshot() {
    return {
      ts: Date.now(),
      bounds,
      displays: [{ id: 'primary', ...bounds, scale: 1, primary: true }],
      taskbar: { x: bounds.x, y: bounds.y + bounds.h - taskbarH, w: bounds.w, h: taskbarH },
      windows: windows.map((w, i) => ({
        id: w.id,
        app: w.app,
        title: w.title,
        x: Math.round(w.x),
        y: Math.round(w.y),
        w: Math.round(w.w),
        h: Math.round(w.h),
        z: i,
        focused: i === 0,
      })),
      cursor: host.cursor,
    };
  }

  function addWindow(spec) {
    const win = { id: nextId++, ...spec };
    const el = document.createElement('div');
    el.className = 'mock-window';
    el.innerHTML = `
      <div class="mock-titlebar"><span class="mock-dot"></span><span class="mock-title"></span><button class="mock-close" title="close">×</button></div>
      <div class="mock-body"></div>`;
    el.querySelector('.mock-title').textContent = win.title;
    win.el = el;
    desk.appendChild(el);
    windows.unshift(win);
    layout(win);
    restack();

    const bar = el.querySelector('.mock-titlebar');
    bar.addEventListener('pointerdown', (ev) => {
      if (ev.target.classList.contains('mock-close')) return;
      const ox = ev.clientX - win.x;
      const oy = ev.clientY - win.y;
      const move = (m) => {
        win.x = Math.max(-200, Math.min(bounds.w - 80, m.clientX - ox));
        win.y = Math.max(0, Math.min(bounds.h - 60, m.clientY - oy));
        layout(win);
        host.emit();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      const i = windows.indexOf(win);
      windows.splice(i, 1);
      windows.unshift(win);
      restack();
      host.emit();
    });
    el.querySelector('.mock-close').addEventListener('click', () => closeWindow(win.id));
    host.emit();
    return win;
  }

  function closeWindow(id) {
    const i = windows.findIndex((w) => w.id === id);
    if (i < 0) return;
    windows[i].el.remove();
    windows.splice(i, 1);
    host.emit();
  }

  function layout(win) {
    win.el.style.transform = `translate(${win.x}px, ${win.y}px)`;
    win.el.style.width = `${win.w}px`;
    win.el.style.height = `${win.h}px`;
  }

  function restack() {
    windows.forEach((w, i) => {
      w.el.style.zIndex = String(100 - i);
      w.el.classList.toggle('focused', i === 0);
    });
  }

  const taskbar = document.createElement('div');
  taskbar.className = 'mock-taskbar';
  taskbar.style.height = `${taskbarH}px`;
  desk.appendChild(taskbar);

  for (const a of (opts.apps || APPS)) addWindow({ ...a });

  window.addEventListener('pointermove', (e) => {
    host.cursor = { x: e.clientX, y: e.clientY, down: host.cursor.down };
  });
  window.addEventListener('pointerdown', () => {
    host.cursor.down = true;
  });
  window.addEventListener('pointerup', () => {
    host.cursor.down = false;
  });

  host.emit();
  setInterval(() => host.emit(), 500);
  return host;
}

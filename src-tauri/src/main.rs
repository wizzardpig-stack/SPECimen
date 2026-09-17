// SPECIMEN — desktop host for SPEC-01.
//
// The host owns everything that needs the operating system:
//   * a transparent, always-on-top, click-through overlay spanning the desktop
//   * cursor position and display topology
//   * read-only window geometry
//   * the hit rectangle that makes only SPEC's body interactive (PRD 32)
//
// It does not decide what SPEC does. Behaviour, memory and rendering all live
// in the overlay, so the organism can be developed and replayed without a
// Windows machine.
//
// The host has no filesystem, network, shell or clipboard access. That is not a
// policy, it is the dependency list: see Cargo.toml and capabilities/.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod model;
#[cfg(windows)]
mod win32;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use model::{CursorInfo, DisplayInfo, EnvSnapshot, Rect};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

/// How often the desktop is re-read. Window geometry changes are slow compared
/// to a frame, and polling it cheaply keeps the idle cost near zero (PRD 30).
const ENV_INTERVAL: Duration = Duration::from_millis(250);
/// The cursor is the one signal that needs to feel immediate.
const CURSOR_INTERVAL: Duration = Duration::from_millis(33);

#[derive(Default)]
struct Overlay {
    /// The only region of the overlay that captures the pointer.
    hit: Mutex<Option<Rect>>,
    interactive: AtomicBool,
    /// Whether the window is currently passing clicks through.
    ignoring: AtomicBool,
    last_env: Mutex<Option<EnvSnapshot>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn displays(app: &AppHandle) -> (Vec<DisplayInfo>, Rect) {
    let mut out = Vec::new();
    let monitors = app.available_monitors().unwrap_or_default();
    let primary = app.primary_monitor().ok().flatten();
    let primary_name = primary.as_ref().and_then(|m| m.name().cloned());

    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;

    for (i, m) in monitors.iter().enumerate() {
        let pos = m.position();
        let size = m.size();
        let name = m.name().cloned().unwrap_or_else(|| format!("display{i}"));
        min_x = min_x.min(pos.x);
        min_y = min_y.min(pos.y);
        max_x = max_x.max(pos.x + size.width as i32);
        max_y = max_y.max(pos.y + size.height as i32);
        out.push(DisplayInfo {
            primary: Some(&name) == primary_name.as_ref(),
            id: name,
            x: pos.x,
            y: pos.y,
            w: size.width as i32,
            h: size.height as i32,
            scale: m.scale_factor(),
        });
    }

    if out.is_empty() {
        let bounds = Rect {
            x: 0,
            y: 0,
            w: 1920,
            h: 1080,
        };
        out.push(DisplayInfo {
            id: "display0".into(),
            x: 0,
            y: 0,
            w: 1920,
            h: 1080,
            scale: 1.0,
            primary: true,
        });
        return (out, bounds);
    }

    let bounds = Rect {
        x: min_x,
        y: min_y,
        w: max_x - min_x,
        h: max_y - min_y,
    };
    (out, bounds)
}

fn snapshot(app: &AppHandle, window: &WebviewWindow) -> EnvSnapshot {
    let (displays, bounds) = displays(app);

    #[cfg(windows)]
    let (windows, taskbar) = (win32::visible_windows(), win32::taskbar());
    #[cfg(not(windows))]
    let (windows, taskbar) = (Vec::new(), None);

    EnvSnapshot {
        ts: now_ms(),
        bounds,
        scale: window.scale_factor().unwrap_or(1.0),
        displays,
        taskbar,
        windows,
    }
}

/// Stretch the overlay across every monitor and take it out of the way of
/// ordinary desktop use.
fn fit_overlay(window: &WebviewWindow, bounds: Rect) {
    let _ = window.set_position(PhysicalPosition::new(bounds.x, bounds.y));
    let _ = window.set_size(PhysicalSize::new(
        bounds.w.max(1) as u32,
        bounds.h.max(1) as u32,
    ));
    let _ = window.set_always_on_top(true);
    let _ = window.set_skip_taskbar(true);
    let _ = window.set_ignore_cursor_events(true);
}

#[tauri::command]
fn get_env(app: AppHandle) -> Option<EnvSnapshot> {
    let window = app.get_webview_window("main")?;
    Some(snapshot(&app, &window))
}

/// The overlay reports the rectangle SPEC's body occupies. Everything else
/// stays click-through, so the desktop never feels covered (PRD 32).
#[tauri::command]
fn set_hit_rect(app: AppHandle, rect: Option<Rect>) {
    if let Some(state) = app.try_state::<Overlay>() {
        *state.hit.lock().unwrap() = rect;
    }
}

/// Make the whole overlay interactive — used only while the DEV console is
/// open, never in the normal organism build.
#[tauri::command]
fn set_interactive(app: AppHandle, on: bool) {
    if let Some(state) = app.try_state::<Overlay>() {
        state.interactive.store(on, Ordering::Relaxed);
        if on {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(false);
                state.ignoring.store(false, Ordering::Relaxed);
            }
        }
    }
}

fn spawn_cursor_loop(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(CURSOR_INTERVAL);
        let Some(window) = app.get_webview_window("main") else {
            continue;
        };
        let Ok(pos) = app.cursor_position() else {
            continue;
        };
        let _ = app.emit(
            "specimen://cursor",
            CursorInfo {
                x: pos.x,
                y: pos.y,
                down: false,
            },
        );

        let Some(state) = app.try_state::<Overlay>() else {
            continue;
        };
        if state.interactive.load(Ordering::Relaxed) {
            continue; // DEV console open: the whole overlay stays interactive.
        }
        let over_body = state
            .hit
            .lock()
            .unwrap()
            .map(|r| r.contains(pos.x, pos.y))
            .unwrap_or(false);
        let ignoring = state.ignoring.load(Ordering::Relaxed);
        if over_body == ignoring {
            // Only touch the window when the answer actually changes.
            let _ = window.set_ignore_cursor_events(!over_body);
            state.ignoring.store(!over_body, Ordering::Relaxed);
        }
    });
}

fn spawn_env_loop(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(ENV_INTERVAL);
        let Some(window) = app.get_webview_window("main") else {
            continue;
        };
        let snap = snapshot(&app, &window);
        let Some(state) = app.try_state::<Overlay>() else {
            continue;
        };
        let mut last = state.last_env.lock().unwrap();
        let changed = last.as_ref().map(|prev| {
            prev.bounds != snap.bounds
                || prev.taskbar != snap.taskbar
                || prev.windows != snap.windows
                || prev.displays != snap.displays
        });
        match changed {
            Some(false) => continue,
            _ => {}
        }
        if last.as_ref().map(|p| p.bounds) != Some(snap.bounds) {
            fit_overlay(&window, snap.bounds);
        }
        *last = Some(snap.clone());
        drop(last);
        let _ = app.emit("specimen://env", &snap);
    });
}

fn main() {
    tauri::Builder::default()
        .manage(Overlay::default())
        .invoke_handler(tauri::generate_handler![
            get_env,
            set_hit_rect,
            set_interactive
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                let (_, bounds) = displays(&handle);
                fit_overlay(&window, bounds);
                let _ = window.set_shadow(false);
                let snap = snapshot(&handle, &window);
                if let Some(state) = handle.try_state::<Overlay>() {
                    *state.last_env.lock().unwrap() = Some(snap);
                }
            }
            spawn_cursor_loop(handle.clone());
            spawn_env_loop(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("SPECIMEN host failed to start");
}

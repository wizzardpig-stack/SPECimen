//! Windows window geometry.
//!
//! Read-only: this module enumerates visible top-level windows and the taskbar
//! and reports their rectangles. It never moves, resizes, closes, focuses or
//! sends input to any window — SPEC's apparent interference with the desktop is
//! drawn in the overlay, never performed on the real thing (PRD 4).

use crate::model::{Rect, WindowInfo};

use windows::core::{w, PWSTR};
use windows::Win32::Foundation::{CloseHandle, BOOL, FALSE, HWND, LPARAM, RECT, TRUE};
use windows::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowW, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect,
    GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    GWL_EXSTYLE, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};

/// Smallest rectangle treated as terrain. Tooltips and slivers are not places
/// an organism can stand.
const MIN_SIDE: i32 = 120;

struct Collector {
    out: Vec<WindowInfo>,
    focused: HWND,
    z: u32,
}

pub fn visible_windows() -> Vec<WindowInfo> {
    let mut collector = Collector {
        out: Vec::new(),
        focused: unsafe { GetForegroundWindow() },
        z: 0,
    };
    unsafe {
        // EnumWindows walks top-level windows in z order, topmost first.
        let _ = EnumWindows(
            Some(enum_proc),
            LPARAM(&mut collector as *mut Collector as isize),
        );
    }
    collector.out
}

unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let collector = &mut *(lparam.0 as *mut Collector);

    if !is_candidate(hwnd) {
        return TRUE;
    }
    let Some(rect) = frame_bounds(hwnd) else {
        return TRUE;
    };
    if rect.w < MIN_SIDE || rect.h < MIN_SIDE {
        return TRUE;
    }

    collector.out.push(WindowInfo {
        id: hwnd.0 as i64,
        app: process_name(hwnd),
        title: window_title(hwnd),
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        z: collector.z,
        focused: hwnd == collector.focused,
    });
    collector.z += 1;

    // Cap the terrain: a desktop with a hundred windows does not need a
    // hundred navigation surfaces, and the behaviour graph stays cheap.
    if collector.out.len() >= 24 {
        return FALSE;
    }
    TRUE
}

unsafe fn is_candidate(hwnd: HWND) -> bool {
    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
        return false;
    }
    if GetWindowTextLengthW(hwnd) == 0 {
        return false;
    }
    let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    if ex & WS_EX_TOOLWINDOW.0 != 0 || ex & WS_EX_NOACTIVATE.0 != 0 {
        return false;
    }
    // Windows keeps UWP windows alive but cloaked when they are not on screen.
    let mut cloaked: u32 = 0;
    let ok = DwmGetWindowAttribute(
        hwnd,
        DWMWA_CLOAKED,
        &mut cloaked as *mut u32 as *mut core::ffi::c_void,
        std::mem::size_of::<u32>() as u32,
    );
    if ok.is_ok() && cloaked != 0 {
        return false;
    }
    true
}

/// Prefer the DWM frame bounds: GetWindowRect includes the invisible resize
/// border, which would leave SPEC standing a few pixels off the visible edge.
unsafe fn frame_bounds(hwnd: HWND) -> Option<Rect> {
    let mut r = RECT::default();
    let dwm = DwmGetWindowAttribute(
        hwnd,
        DWMWA_EXTENDED_FRAME_BOUNDS,
        &mut r as *mut RECT as *mut core::ffi::c_void,
        std::mem::size_of::<RECT>() as u32,
    );
    if dwm.is_err() {
        r = RECT::default();
        GetWindowRect(hwnd, &mut r).ok()?;
    }
    let rect = Rect {
        x: r.left,
        y: r.top,
        w: r.right - r.left,
        h: r.bottom - r.top,
    };
    if rect.w <= 0 || rect.h <= 0 {
        None
    } else {
        Some(rect)
    }
}

unsafe fn window_title(hwnd: HWND) -> String {
    let len = GetWindowTextLengthW(hwnd);
    if len <= 0 {
        return String::new();
    }
    let mut buf = vec![0u16; len as usize + 1];
    let n = GetWindowTextW(hwnd, &mut buf);
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

unsafe fn process_name(hwnd: HWND) -> String {
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return String::new();
    }
    let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
        return String::new();
    };
    let mut buf = vec![0u16; 260];
    let mut len = buf.len() as u32;
    let name = if QueryFullProcessImageNameW(
        handle,
        PROCESS_NAME_WIN32,
        PWSTR(buf.as_mut_ptr()),
        &mut len,
    )
    .is_ok()
    {
        let full = String::from_utf16_lossy(&buf[..len as usize]);
        full.rsplit('\\').next().unwrap_or("").to_string()
    } else {
        String::new()
    };
    let _ = CloseHandle(handle);
    name
}

/// The taskbar is ground: SPEC sits on it (PRD 2, PRD 9).
pub fn taskbar() -> Option<Rect> {
    unsafe {
        let hwnd = FindWindowW(w!("Shell_TrayWnd"), None).ok()?;
        let mut r = RECT::default();
        GetWindowRect(hwnd, &mut r).ok()?;
        let rect = Rect {
            x: r.left,
            y: r.top,
            w: r.right - r.left,
            h: r.bottom - r.top,
        };
        if rect.w <= 0 || rect.h <= 0 {
            None
        } else {
            Some(rect)
        }
    }
}

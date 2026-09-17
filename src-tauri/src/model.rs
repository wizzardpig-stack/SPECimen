//! The structured view of the desktop that the overlay is allowed to see.
//!
//! This is the whole of SPEC's sensory input on the desktop side: geometry,
//! window titles and process names, the cursor, display topology. No pixels, no
//! screen capture, no input contents (PRD 4, PRD 5).

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug, Default)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x as f64
            && y >= self.y as f64
            && x <= (self.x + self.w) as f64
            && y <= (self.y + self.h) as f64
    }
}

#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct DisplayInfo {
    pub id: String,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub scale: f64,
    pub primary: bool,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct WindowInfo {
    pub id: i64,
    pub app: String,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    /// Z order, 0 = topmost.
    pub z: u32,
    pub focused: bool,
}

#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct EnvSnapshot {
    pub ts: u64,
    /// Bounding box of the whole virtual desktop, in physical pixels.
    pub bounds: Rect,
    /// Scale factor of the monitor the overlay window lives on. The overlay
    /// converts physical pixels to its own CSS pixels with this.
    pub scale: f64,
    pub displays: Vec<DisplayInfo>,
    pub taskbar: Option<Rect>,
    pub windows: Vec<WindowInfo>,
}

#[derive(Serialize, Clone, Copy, Debug)]
pub struct CursorInfo {
    pub x: f64,
    pub y: f64,
    pub down: bool,
}

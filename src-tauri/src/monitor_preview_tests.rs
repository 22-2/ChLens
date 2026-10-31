use super::{monitor_matches_bounds, ScreenRect};

fn rect(x: i32, y: i32, width: u32, height: u32) -> ScreenRect {
  ScreenRect {
    x,
    y,
    width,
    height,
  }
}

#[test]
fn 撮影対象の位置とサイズが実ディスプレイと完全一致する場合だけ許可する() {
  let monitor = rect(100, -20, 1920, 1080);
  assert!(monitor_matches_bounds(monitor, rect(100, -20, 1920, 1080)));
  assert!(!monitor_matches_bounds(monitor, rect(101, -20, 1920, 1080)));
  assert!(!monitor_matches_bounds(monitor, rect(100, -20, 1920, 1081)));
}

#[cfg(not(windows))]
#[test]
fn 非Windowsでは画面画像を撮影しない() {
  assert!(super::capture(0, 0, 1920, 1080).unwrap().is_empty());
}

/// 選択画面の縮小フレーム（幅・高さ付きの生RGBA）だけを返し、画面内容をファイルやログへ保存しない。
/// 撮影に対応しない環境では空のレスポンスを返す。
#[tauri::command]
pub async fn capture_comment_overlay_monitor_preview(
  app: tauri::AppHandle,
  x: i32,
  y: i32,
  width: u32,
  height: u32,
) -> Result<tauri::ipc::Response, String> {
  let result = async {
    let monitors = app
      .available_monitors()
      .map_err(|error| error.to_string())?;
    let requested = ScreenRect {
      x,
      y,
      width,
      height,
    };
    // フロントエンドの座標を任意領域の撮影へ流用せず、現在の実ディスプレイと照合する。
    if !monitors
      .iter()
      .any(|monitor| monitor_matches_bounds(ScreenRect::from_monitor(monitor), requested))
    {
      return Err("撮影対象のディスプレイが見つかりません。パネルを開き直してください。".into());
    }
    // GDIの撮影と変換をUIスレッドから外し、1回分の縮小フレームだけをIPCへ渡す。
    tauri::async_runtime::spawn_blocking(move || capture(x, y, width, height))
      .await
      .map_err(|error| error.to_string())?
  }
  .await;
  if let Err(error) = &result {
    log::error!("ディスプレイのプレビュー取得に失敗しました: {error}");
  }
  result.map(tauri::ipc::Response::new)
}

/// Overlay窓を画面の撮影から一時的に除外する（調整中の枠やコメントがプレビューに映り込まないようにする）。
///
/// 常時除外にすると、配信や録画でコメントOverlayを撮れなくなるため、調整中だけ有効にする。
#[tauri::command]
pub fn set_comment_overlay_capture_excluded(
  app: tauri::AppHandle,
  excluded: bool,
) -> Result<(), String> {
  let result = set_capture_excluded(&app, excluded);
  if let Err(error) = &result {
    log::error!("Overlay窓の撮影除外の切り替えに失敗しました: {error}");
  }
  result
}

#[cfg(not(windows))]
fn set_capture_excluded(_app: &tauri::AppHandle, _excluded: bool) -> Result<(), String> {
  Ok(())
}

#[cfg(windows)]
fn set_capture_excluded(app: &tauri::AppHandle, excluded: bool) -> Result<(), String> {
  use windows_sys::Win32::{Foundation::HWND, UI::WindowsAndMessaging::*};
  let hwnd = tauri::Manager::get_webview_window(app, "comment-overlay")
    .ok_or_else(|| "Overlayウィンドウが見つかりません。".to_string())?
    .hwnd()
    .map_err(|error| error.to_string())?
    .0 as HWND;
  let affinity = if excluded {
    WDA_EXCLUDEFROMCAPTURE
  } else {
    WDA_NONE
  };
  // SAFETY: HWNDは直前にTauriから取得したもので、無効になっていればWin32が失敗を返すだけでメモリは触らない。
  if unsafe { SetWindowDisplayAffinity(hwnd, affinity) } == 0 {
    return Err(std::io::Error::last_os_error().to_string());
  }
  Ok(())
}

#[cfg(not(windows))]
fn capture(_x: i32, _y: i32, _width: u32, _height: u32) -> Result<Vec<u8>, String> {
  Ok(Vec::new())
}

#[cfg(windows)]
fn capture(x: i32, y: i32, width: u32, height: u32) -> Result<Vec<u8>, String> {
  use crate::preview_image::{bgrx_to_rgba_frame, preview_dimensions};
  use std::{ffi::c_void, mem::size_of, ptr::null_mut};
  use windows_sys::Win32::Graphics::Gdi::*;

  struct CaptureResources {
    screen: HDC,
    memory: HDC,
    bitmap: HBITMAP,
    previous: HGDIOBJ,
  }
  impl Drop for CaptureResources {
    fn drop(&mut self) {
      // エラーによる早期returnでも選択を戻してGDIリソースを解放し、更新の繰り返しで枯渇させない。
      // SAFETY: 各ハンドルは取得に成功したものだけが入り、ヌルのものは解放しない。
      // ビットマップはメモリDCから外してから削除しないと解放できないため、順番を守る。
      unsafe {
        if !self.previous.is_null() {
          SelectObject(self.memory, self.previous);
        }
        if !self.bitmap.is_null() && DeleteObject(self.bitmap) == 0 {
          log::error!("プレビュー用bitmapの解放に失敗しました");
        }
        if !self.memory.is_null() && DeleteDC(self.memory) == 0 {
          log::error!("プレビュー用メモリDCの解放に失敗しました");
        }
        if !self.screen.is_null() && ReleaseDC(null_mut(), self.screen) == 0 {
          log::error!("プレビュー用画面DCの解放に失敗しました");
        }
      }
    }
  }

  let (preview_width, preview_height) = preview_dimensions(width, height)?;
  // 長辺512pxへ直接縮小し、4K画面のフルサイズ画像を保持・転送しない。
  // SAFETY: 画面DCとメモリDCは取得直後にCaptureResourcesが所有する。pixelsは幅・高さ・32bppで作った
  // DIBの先頭で、選択中のビットマップが解放されない間だけ有効。長さはその画素数×4バイトに一致する。
  let frame = unsafe {
    let mut resources = CaptureResources {
      screen: GetDC(null_mut()),
      memory: null_mut(),
      bitmap: null_mut(),
      previous: null_mut(),
    };
    if resources.screen.is_null() {
      return Err(format!(
        "画面DCの取得に失敗しました: {}",
        std::io::Error::last_os_error()
      ));
    }
    resources.memory = CreateCompatibleDC(resources.screen);
    if resources.memory.is_null() {
      return Err(format!(
        "メモリDCの作成に失敗しました: {}",
        std::io::Error::last_os_error()
      ));
    }
    let info = BITMAPINFO {
      bmiHeader: BITMAPINFOHEADER {
        biSize: size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: preview_width as i32,
        biHeight: -(preview_height as i32),
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB,
        ..Default::default()
      },
      ..Default::default()
    };
    let mut pixels: *mut c_void = null_mut();
    resources.bitmap = CreateDIBSection(
      resources.screen,
      &info,
      DIB_RGB_COLORS,
      &mut pixels,
      null_mut(),
      0,
    );
    if resources.bitmap.is_null() || pixels.is_null() {
      return Err(format!(
        "撮影用bitmapの作成に失敗しました: {}",
        std::io::Error::last_os_error()
      ));
    }
    let previous = SelectObject(resources.memory, resources.bitmap);
    if previous.is_null() || previous as isize == -1 {
      return Err("撮影用bitmapの選択に失敗しました".into());
    }
    resources.previous = previous;
    // 変更理由: 10〜20fpsで更新するため、重いHALFTONEではなく単純な間引きで縮小する。
    if SetStretchBltMode(resources.memory, COLORONCOLOR) == 0 {
      return Err("画面縮小モードの設定に失敗しました".into());
    }
    if StretchBlt(
      resources.memory,
      0,
      0,
      preview_width as i32,
      preview_height as i32,
      resources.screen,
      x,
      y,
      width as i32,
      height as i32,
      SRCCOPY | CAPTUREBLT,
    ) == 0
    {
      return Err(format!(
        "画面の撮影に失敗しました: {}",
        std::io::Error::last_os_error()
      ));
    }
    if GdiFlush() == 0 {
      return Err("画面の撮影結果の同期に失敗しました".into());
    }
    bgrx_to_rgba_frame(
      preview_width,
      preview_height,
      std::slice::from_raw_parts(
        pixels.cast::<u8>(),
        (preview_width * preview_height * 4) as usize,
      ),
    )?
  };
  Ok(frame)
}

/// 画面上の矩形（物理ピクセル）。実ディスプレイと要求された撮影範囲を同じ型で比べる。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ScreenRect {
  x: i32,
  y: i32,
  width: u32,
  height: u32,
}

impl ScreenRect {
  fn from_monitor(monitor: &tauri::Monitor) -> Self {
    let position = monitor.position();
    let size = monitor.size();
    Self {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    }
  }
}

/// 要求された撮影範囲が実ディスプレイと完全に一致するかを返す。許容誤差は設けない。
fn monitor_matches_bounds(monitor: ScreenRect, requested: ScreenRect) -> bool {
  monitor == requested
}

#[cfg(test)]
#[path = "monitor_preview_tests.rs"]
mod tests;

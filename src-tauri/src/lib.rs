mod download;
mod write_transport;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Overlayは起動直後から背後のMain操作を受け取れるよう、native側で常時クリック透過にする。
  tauri::Builder::default()
    .manage(write_transport::WriteTransportState::default())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_sql::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
      download::save_download_file,
      write_transport::clear_write_cookies,
      write_transport::has_write_cookies,
      write_transport::write_request
    ])
    .on_window_event(|window, event| {
      if window.label() != "main" || !matches!(event, WindowEvent::CloseRequested { .. }) {
        return;
      }

      // 変更理由: Overlayや過去実況再生ウィンドウはMainを閉じても残る構成のため、
      // Main終了をアプリ全体の終了とみなし、裏で残るWebViewやRustプロセスを確実に解放する。
      window.app_handle().exit(0);
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      if let Some(overlay) = tauri::Manager::get_webview_window(app, "comment-overlay") {
        overlay.set_ignore_cursor_events(true)?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

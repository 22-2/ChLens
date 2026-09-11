#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Overlayは起動直後から背後のMain操作を受け取れるよう、native側で常時クリック透過にする。
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .setup(|app| {
      if let Some(overlay) = tauri::Manager::get_webview_window(app, "overlay") {
        overlay.set_ignore_cursor_events(true)?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running ChLens Live Tauri application");
}

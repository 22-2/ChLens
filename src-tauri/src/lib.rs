#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Overlayは起動直後から背後のMain操作を受け取れるよう、native側で常時クリック透過にする。
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_sql::Builder::default().build())
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

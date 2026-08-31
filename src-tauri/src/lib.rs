#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Overlayは起動直後に背後のChLens操作を奪わないよう、native側でも先にクリック透過へ設定する。
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
    .invoke_handler(tauri::generate_handler![get_cursor_position])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[derive(serde::Serialize)]
struct CursorPosition {
  x: i32,
  y: i32,
}

#[tauri::command]
fn get_cursor_position() -> Result<CursorPosition, String> {
  match mouse_position::mouse_position::Mouse::get_mouse_position() {
    mouse_position::mouse_position::Mouse::Position { x, y } => Ok(CursorPosition { x, y }),
    mouse_position::mouse_position::Mouse::Error => {
      Err("OS cursor position could not be read".to_string())
    }
  }
}

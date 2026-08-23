#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Session parsing stays in the TypeScript app so browser and Tauri builds share one domain layer.
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![get_cursor_position])
    .run(tauri::generate_context!())
    .expect("error while running Chlens Live Tauri application");
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


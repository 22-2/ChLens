#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Session parsing stays in the TypeScript app so browser and Tauri builds share one domain layer.
  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running Chlens Live Tauri application");
}


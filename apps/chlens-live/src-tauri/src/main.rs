// Prevents an extra console window on Windows for the packaged desktop app.
#![cfg_attr(all(), windows_subsystem = "windows")]

fn main() {
  chlens_live_lib::run();
}


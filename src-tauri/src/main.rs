// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(all(), windows_subsystem = "windows")]

fn main() {
  app_lib::run();
}

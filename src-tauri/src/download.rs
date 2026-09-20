use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

fn sanitize_file_name(file_name: &str) -> String {
  let base_name = file_name.rsplit(['\\', '/']).next().unwrap_or(file_name);
  let sanitized: String = base_name
    .chars()
    .map(|character| {
      if character.is_control() || r#"<>:\"/|?*"#.contains(character) {
        '_'
      } else {
        character
      }
    })
    .collect();
  let trimmed = sanitized.trim_matches([' ', '.']);

  if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
    return "image".to_string();
  }

  if is_reserved_windows_name(trimmed) {
    return format!("_{trimmed}");
  }

  trimmed.to_string()
}

fn is_reserved_windows_name(file_name: &str) -> bool {
  let stem = file_name.split('.').next().unwrap_or(file_name);
  matches!(
    stem.to_ascii_uppercase().as_str(),
    "CON"
      | "PRN"
      | "AUX"
      | "NUL"
      | "COM1"
      | "COM2"
      | "COM3"
      | "COM4"
      | "COM5"
      | "COM6"
      | "COM7"
      | "COM8"
      | "COM9"
      | "LPT1"
      | "LPT2"
      | "LPT3"
      | "LPT4"
      | "LPT5"
      | "LPT6"
      | "LPT7"
      | "LPT8"
      | "LPT9"
  )
}

fn next_available_path(directory: &Path, file_name: &str) -> PathBuf {
  let original = Path::new(file_name);
  let stem = original
    .file_stem()
    .and_then(|value| value.to_str())
    .filter(|value| !value.is_empty())
    .unwrap_or("image");
  let extension = original.extension().and_then(|value| value.to_str());

  let make_path = |suffix: Option<u32>| {
    let name = match (suffix, extension) {
      (None, Some(extension)) => format!("{stem}.{extension}"),
      (None, None) => stem.to_string(),
      (Some(index), Some(extension)) => format!("{stem} ({index}).{extension}"),
      (Some(index), None) => format!("{stem} ({index})"),
    };
    directory.join(name)
  };

  let first = make_path(None);
  if !first.exists() {
    return first;
  }

  for index in 1..=u32::MAX {
    let candidate = make_path(Some(index));
    if !candidate.exists() {
      return candidate;
    }
  }

  // 現実的には到達しないが、候補を無限に探索して固まらないようにする。
  directory.join(format!("{stem}-download"))
}

fn save_download_file_inner(download_dir: &Path, file_name: &str, body: &[u8]) -> Result<String, String> {
  fs::create_dir_all(download_dir)
    .map_err(|error| format!("ダウンロードフォルダーを作成できませんでした: {error}"))?;

  let safe_name = sanitize_file_name(file_name);
  let path = next_available_path(download_dir, &safe_name);
  fs::write(&path, body).map_err(|error| format!("画像を保存できませんでした: {error}"))?;

  Ok(path.to_string_lossy().into_owned())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn save_download_file(
  app: AppHandle,
  file_name: String,
  body: Vec<u8>,
) -> Result<String, String> {
  let download_dir = app
    .path()
    .download_dir()
    .map_err(|error| format!("ダウンロードフォルダーを特定できませんでした: {error}"))?;

  // 変更理由: 保存ダイアログを出さず、利用者が通常使うDownloadsへ自動保存するため、
  // ファイル名の無害化と重複回避をRust側で行ってから書き込む。
  tauri::async_runtime::spawn_blocking(move || {
    save_download_file_inner(&download_dir, &file_name, &body)
  })
  .await
  .map_err(|error| format!("画像保存処理を完了できませんでした: {error}"))?
}

#[cfg(test)]
mod tests {
  use super::{is_reserved_windows_name, sanitize_file_name};

  #[test]
  fn ファイル名からパス区切り文字と危険な文字を除去する() {
    assert_eq!(sanitize_file_name(r#"..\secret/画像?.png"#), "画像_.png");
  }

  #[test]
  fn 空のファイル名と予約名を安全な名前へ置き換える() {
    assert_eq!(sanitize_file_name("..."), "image");
    assert_eq!(sanitize_file_name("CON.txt"), "_CON.txt");
    assert!(is_reserved_windows_name("LPT1.jpg"));
  }
}

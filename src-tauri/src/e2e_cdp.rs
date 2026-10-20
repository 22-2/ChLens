//! E2Eビルドだけで、WebView2のリモートデバッグ（CDP）のポートを窓の起動引数へ渡す。

/// PlaywrightがCDPで接続するポートを渡すための環境変数。
const PORT_ENV: &str = "CHLENS_E2E_CDP_PORT";
/// Tauriが窓に既定で渡す引数。`additional_browser_args` を指定すると既定値が置き換わるため、ここで再現する。
const DEFAULT_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

/// 起動引数に足すリモートデバッグの指定。ポートが未指定・空なら `None`。
fn debugging_args(port: Option<&str>) -> Option<String> {
  let port = port.filter(|port| !port.is_empty())?;
  Some(format!("{DEFAULT_ARGS} --remote-debugging-port={port}"))
}

/// 設定上のすべての窓へリモートデバッグの引数を足す。
///
/// 変更理由: 環境変数 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` はGitHub Actionsのrunner（WebView2 154）では
/// ブラウザープロセスの引数に反映されず、ポートが開かなかった。そのため窓の設定として明示的に渡す。
/// WebView2の環境は窓どうしで共有され、引数が食い違うと作れないため、すべての窓へ同じ引数を入れる。
pub fn apply<R: tauri::Runtime>(context: &mut tauri::Context<R>) {
  let Some(args) = debugging_args(std::env::var(PORT_ENV).ok().as_deref()) else {
    return;
  };
  for window in context.config_mut().app.windows.iter_mut() {
    window.additional_browser_args = Some(args.clone());
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn ポートがあれば既定の引数にリモートデバッグを足す() {
    assert_eq!(
      debugging_args(Some("9222")).as_deref(),
      Some("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9222"),
    );
  }

  #[test]
  fn ポートが未指定か空なら何も足さない() {
    assert_eq!(debugging_args(None), None);
    assert_eq!(debugging_args(Some("")), None);
  }
}

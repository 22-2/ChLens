# E2Eテスト

Chrome拡張版をビルドし、Playwrightの専用Chromiumで画面操作を検証します。

```powershell
pnpm exec playwright install chromium
pnpm run test:e2e
```

対話的に実行する場合は `pnpm run test:e2e:ui` を使います。ビルド済みなら、
`pnpm exec playwright test tests/localboard.spec.mts` で個別に実行できます。
失敗時のスクリーンショットとトレースは `test-results/`、HTMLレポートは
`playwright-report/` に保存されます。

`localboard.mts` はテストごとにループバックの空きポートで起動し、bbsmenu、
SETTING.TXT、subject.txt、datをShift_JISで配信します。レス追加もテストから制御できます。
ブラウザプロファイルとお気に入りフォルダーもテスト専用です。

アプリはHTTP指定でも先にHTTPS接続を試すため、HTTP専用localboardへの接続では
`ERR_SSL_PROTOCOL_ERROR` がログに出た後、HTTPへ再試行します。

現在は拡張機能の起動、ホーム・設定、スレ一覧からの閲覧、レス更新と重複防止、
セッション復元、閲覧履歴、NG設定の永続化を検証します。
書き込み、read.cgi形式、差分206応答、Firefox・Tauriはまだ対象外です。

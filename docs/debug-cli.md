# Tauri版デバッグCLI

起動中のTauri版ChLensへWebView2のリモートデバッグ（CDP）で接続し、画面内の状態と直近ログをJSONで取り出します。利用者の環境でしか再現しない不具合を、DevToolsを手で開かずにシェルやエージェントから調べるための経路です。

## 起動

開発版は次のコマンドで、CDPのポート `9222` を開けて起動します。

```text
pnpm dev:tauri:debug
```

インストール版やリリースビルドでは、環境変数を設定したシェルから実行ファイルを起動します。

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
& "<ChLensの実行ファイル>"
```

通常起動ではポートを開けません。CDPのポートを開けている間は、同じPCの他のプロセスからも画面内でコードを実行できるため、調査が終わったら通常起動へ戻してください。

## コマンド

```text
pnpm debug:tauri targets                 # 接続できる画面の一覧
pnpm debug:tauri state                   # タブ・スレッド・実況の状態
pnpm debug:tauri state --key tabs        # 1項目だけ
pnpm debug:tauri logs --since 10m        # 直近10分のログ
pnpm debug:tauri logs --category auto-refresh
pnpm debug:tauri logs --level error --limit 50
pnpm debug:tauri clear-logs
pnpm debug:tauri eval "document.title"
```

共通オプションは `--port <number>`（既定は環境変数 `CHLENS_CDP_PORT` か `9222`）と `--target main|overlay|replay`（既定は `main`）です。デバッグAPIはメイン画面だけに組み込んでいるため、`overlay` と `replay` で使えるのは `eval` だけです。

## 取得できる内容

`state` は `window.__chlensDebug.state()` の結果です。各機能が `registerDebugStateProvider` で登録した値を返します。

- `tabs`: ペイン・タブ構成と、各タブの `autoRefreshEnabled`・`autoRefreshPageKey`・`autoRefreshStoppedPageKey`
- `thread:<tabId>`: 表示中スレッドの停止判定の入力値（`expired`、`missingFromSubject`、レス数、停止記録、実況の対象かどうか、ライブチャット風表示の未表示件数など）
- `commentOverlay`: コメント実況の対象スレッドと表示状態

`logs` は直近1000件のリングバッファです。

- `console.error` / `warn` / `info` / `log` の出力（`category: "console"`）
- `recordDebugEvent` で記録した出来事（`level: "event"`）。呼び出し元のスタックトレースが付きます
  - `auto-refresh`: タブの自動更新状態の変化と原因のaction、停止記録による開始拒否、停止記録を付けた根拠

Cookie・トークン・パスワードなどのキー名を持つ値は `[redacted]` に置き換えます。

## 調べたい状態を追加する

```ts
import { registerDebugStateProvider } from "src/app/debug/debug-api";
import { recordDebugEvent } from "src/app/debug/debug-log";

// 解除関数を返すので、Reactではeffectのcleanupで解除する。
useEffect(() => registerDebugStateProvider("feature:key", () => stateRef.current), []);

recordDebugEvent("feature", "何が起きたか", { 判断に使った値 });
```

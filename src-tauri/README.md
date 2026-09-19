# Tauri設定メモ

`tauri.conf.json` のフロントエンド用コマンドは、Tauri CLI自身を呼び出さない専用スクリプトを指定する。

- `beforeDevCommand`: `pnpm watch:tauri`
- `beforeBuildCommand`: `pnpm build:tauri:assets`

`pnpm dev:tauri` と `pnpm build:tauri` はそれぞれTauri CLIの開発起動とアプリ・インストーラーのビルドを担当する。
その前段で、設定から呼び出されるスクリプトがWebView用資産だけを生成することで、Tauri CLIの再帰呼び出しを防ぐ。

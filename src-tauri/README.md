このディレクトリの `tauri.conf.json` に関するメモ

変更理由:

- 元の `build.beforeDevCommand` は `pnpm dev` に設定されており、ルートの `package.json` の `dev` スクリプトが `tauri dev` を実行していました。
- つまり `pnpm dev` -> `tauri dev` -> `beforeDevCommand: pnpm dev` の無限ループが発生していました。

対応:

- `beforeDevCommand` を削除しました。フロントエンド開発サーバを別プロセスで起動する必要がある場合は、ここにフロントエンド用の明確なコマンド（例: `pnpm --filter web dev` や `pnpm start:web`）を設定してください。

注意:

- この変更は開発ワークフローに影響します。もし `tauri dev` 実行時に自動でフロントエンドも立ち上げたい場合は、プロジェクトのフロントエンド用 `dev` スクリプト名を別途作成し、そのスクリプトを `beforeDevCommand` に設定してください。

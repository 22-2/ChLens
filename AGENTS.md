## AGENTS.md

### Project Overview

これは、TypeScript (React) と SCSS を使用して構築された 5ch 互換掲示板クライアントです。
ブラウザ拡張機能（Chrome/Firefox）およびデスクトップアプリ（Tauri）として動作します。

- **パッケージマネージャ:** pnpm
- **ビルドシステム:** Vite
- **言語/UIライブラリ:** TypeScript, React, SCSS, Pug (HTMLテンプレート用)
- **プラットフォーム:** Chrome, Firefox, Tauri
- **テスト環境:** Vitest (ユニットテスト), Playwright (E2Eテスト)

### Building instructions

ビルドは Vite を通じて行われます。`PLATFORM` 環境変数でターゲットを指定します。

- **Chrome 向けビルド:**
  ```bash
  pnpm run build:chrome
  ```
- **Tauri (Windows) 向けビルド:**
  ```bash
  pnpm run build:tauri
  ```
- **Firefox 向けビルド:**
  ```bash
  pnpm run build:firefox
  ```
- **開発中のウォッチモード (Chrome):**
  ```bash
  pnpm run watch:chrome
  ```
- **すべてのビルドとパッケージの作成:**
  ```bash
  pnpm run pack:all
  ```

### Architecture & Design Decisions

- **単一ビューへの集約:** 以前は複数のビュー（bookmark, thread等）がありましたが、現在は `src/view/browser` (Reactベース) に全ての機能が統合されています。
- **グローバル `app` の廃止:** レガシーな `window.app` への直接参照は非推奨です。新しいモジュールは ES module インポートを使用してください。
- **サービスコンテナ:** 依存注入（DI）には `src/service-container/` を使用しています。
- **スタイル管理:** 全てのスタイルは `src/bundle.scss` に集約され、ビルド時に単一の CSS ファイルとして出力されます。
- **Tauri シム:** Tauri 環境では拡張機能 API が存在しないため、`src/browser-shim.js` を通じてシムを提供しています。

### Coding Conventions

- **ES Modules:** 名前付きエクスポートを優先してください。
- **型定義:** `any` の使用は避け、厳密な型定義を心がけてください。
- **プラットフォーム抽象化:** ストレージや通信などのプラットフォーム固有の機能は `src/app/platform/` 以下のインターフェースを通じて利用してください。
- **意図の明文化:** バグ修正や意図的な変更を行う際は、コード内に「なぜそのように書いたか」という背景をコメントとして残してください。
- **エラーはログに出す** エラーは握りつぶしせず、しっかり詳細なログを出すようにしてくださいっす。

### PR instructions

- **Title format:** `[<module_name>] <Descriptive Title>` (例: `[thread] Add filter functionality`)
- **Pre-commit check:** `pnpm lint` および `pnpm tsc6` を実行し、型エラーやリンターエラーがないことを確認してください。
- **コミットメッセージ:** Conventional Commits 形式（例: `fix(thread): 自動更新の停止条件を修正`）で、変更の意図が明確になる詳細な説明を含めてください。

### AI improvement workflow

日常利用中の不満は、原因・優先度・再現手順を整理せず`.todo`へ散文で追記する。入力者にIssue形式を要求してはいけない。

運用の正本は、GitHub Agentic Workflowsの次の2本とする。

- `.github/workflows/todo-triage.md`: OpenAI Codexで`.todo`を調査し、重複確認後に最大3件のIssue案をstaged/safe outputs経由で作成する。通常は日次・`.todo`更新時・手動実行、`needs-retriage`ラベルで既存Issueを再調査する。
- `.github/workflows/ready-issue.md`: 人が`ready`を付けたIssueを1件だけ実装し、検証済みのDraft PRを作成する。マージ、クローズ、リリース、デプロイは行わない。

どちらもエージェント本体は読み取り専用で、GitHubへの変更は宣言済みsafe outputsだけを使う。`.todo`は追記用の入力Inboxとして残し、Issue番号や状態を書き戻さない。既存Issue、コメント、クローズ履歴、既存の`<!-- issue: #123 -->`は移行履歴として保持する。新規Issueは原文のSource節とgh-aw自動マーカーで`.todo`との対応を残し、継続状態はRepo Memoryの`memory/todo-triage`ブランチへ小さく記録する。

#### Issue and label rules

- Issue作成前にopen/closedの両方をタイトル、本文、URL、関連語、コード根拠で確認し、重複を作らない。
- 症状、期待動作、観察条件、コード根拠、原因候補、修正案、完了条件、リスクをIssue本文へ整理する。判断できない仕様や再現情報は推測しない。
- Issueの種類にはGitHub標準の`bug`、`enhancement`、`documentation`、`question`を優先する。`needs-info`は新規Issueに使わず、情報不足は`question`とする。
- `needs-priority`、`ready`、`needs-retriage`、`needs-human-test`、`blocked`は、Projectsへの状態移行が完了するまでの運用制御用として残す。既存の`review-existing`は人が`duplicate`、`invalid`、`wontfix`などへ判断するまで閉じない。
- 調査済みで優先度判断待ちは`needs-priority`、人が実装を承認したものだけが`ready`、自動確認済みで操作確認待ちは`needs-human-test`とする。IssueのクローズとProjectsのDone移動は人の確認後に行う。

#### Implementation rules

- 実装対象は`ready`のIssueを1件だけとし、Issue、AGENTS.md、関連コード、既存テストを確認してから専用ブランチまたはworktreeで作業する。
- Issue範囲外のついで修正、依存更新、workflow変更、lockfile変更をしない。
- TypeScriptはpnpm/pnpx、Pythonはuv、Vite+の確認は`vp check`と`vp test`を使い、結果・残存リスク・人が試す操作をIssueへ記録する。
- バグ修正や意図的なコード変更では、コード内に「なぜその実装にしたか」をコメントとして残す。
- 仕様不明、テスト環境不良、データ損失の恐れ、Issue範囲超過では実装を止め、`question`または`blocked`として人へ戻す。
- 旧ローカルtriageスクリプト、Task Scheduler、state JSON、ready-issue runner、`pnpm triage:todo`は使用しない。旧ファイルは移行コミットで撤去し、Task Schedulerは切替完了まで無効状態で保持する。

#### Initial operating cadence

- 移行中はsafe outputsをstagedにして、生成されるIssue、コメント、ラベル、Draft PRの内容を人が確認する。
- 切替後は`.todo`更新時または日次でトリアージし、1回の新規Issueは最大3件とする。同workflowが作成した`needs-priority` Issueが人の判断待ちの間は追加作成しない。
- 最初の1〜2週間は、重複、意図不明項目の集約、Draft PRの自動確認、人による操作確認を毎回確認する。

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

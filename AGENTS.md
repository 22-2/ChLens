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

### GitHub CLI usage for AI

- AIがGitHubのIssue、Pull Request、コメント、ラベル、検索などを操作するときは、必ずGitHub CLIの`gh`を使用してください。Codex内蔵のGitHubコネクタ、直接GitHub API、ブラウザ操作は使用しないでください。
- 実行前に`gh auth status`で認証状態を確認し、リポジトリ操作では常に`--repo 22-2/ChLens`を明示してください。
- Issueの読み取りには`gh issue list`/`gh issue view`、作成には`gh issue create`、既存Issueのラベル変更には`gh issue edit`を使用してください。
- `gh`が未認証または権限不足の場合は、別のGitHub経路へ切り替えず、実行できなかった操作とエラーをブロッカーとして報告してください。認証トークンをファイルやIssue本文へ出力しないでください。

### AI improvement workflow

このリポジトリでは、日常利用中の不満を`.todo`へ散文のまま記録し、AIがGitHub Issueへ整理する。`.todo`への入力者に、原因・優先度・再現手順・Issue形式の記入を要求してはいけない。

#### Triage rules

- `.todo`を読み、未処理の不満を利用者の問題単位へ整理する。
- 既存のGitHub Issueをタイトル、本文、関連語で検索し、重複Issueを作らない。
- 関連コード、既存テスト、画面構成を読み、Issueには根拠となるファイルと処理を記録する。
- 症状、期待する挙動、再現条件、原因候補、修正案、完了条件、リスクをIssue本文へ整理する。
- コードから判断できない仕様や、原文から意図を読み取れない項目を推測しない。
- 意図不明の項目は個別Issueを乱立させず、`[triage] Unclear todo items`という集約Issueを検索して追記する。集約Issueがなければ1件だけ作成し、`needs-info`を付ける。
- 新規Issueを作成する前に、同じ集約Issueまたは関連Issueがないか必ず確認する。
- 1回のトリアージで作成する新規Issueは最大3件とし、残りは次回へ回す。
- トリアージ工程ではコードを変更しない。優先度、採用案、最終的な使い心地を決めない。
- Issue化したら、元の`.todo`項目の近くに`<!-- issue: #123 -->`だけを追記する。原文の不満を書き換えない。

#### Issue state rules

- 調査済みで人の優先度判断待ちは`needs-priority`。
- 仕様や再現情報が不足するものは`needs-info`。
- 人が実装してよいと判断したものだけが`ready`。
- `ready`以外のIssueを実装対象にしない。
- 実装開始時に`in-progress`、実装と自動確認の完了後に`needs-human-test`へ変更する。
- 人が実際に操作して満足した場合だけ`done`にする。
- 仕様不明、テスト環境不良、データ損失の恐れ、Issue範囲超過では停止して`blocked`または`needs-info`にする。

#### Implementation rules

- 実装AIは`ready`のIssueを1件だけ選び、Issue、AGENTS.md、関連コード、既存テストを確認する。
- 専用ブランチまたはworktreeで作業し、Issue範囲外のついで修正をしない。
- 自動テスト、静的解析、必要な画面確認を実行し、結果・残存リスク・人が試す操作をIssueへ記録する。
- バグ修正や意図的なコード変更では、コード内に「なぜその実装にしたか」をコメントとして残す。
- 実装後の不満が元のIssueの完了条件に関するものなら、そのIssueへコメントする。別問題なら`.todo`へ新しい散文として追加する。
- 本番デプロイ、削除、課金、権限変更を自動実行しない。

#### Initial operating cadence

- この改善ループは初期段階では常時運用対象とする。
- 利用者が`.todo`へ追加した後、または実装作業が一区切りついた後にトリアージを実行する。
- ただし、1回の実行で扱う新規Issueは最大3件とし、Issue作成後は人の判断を待つ。
- 最初の1〜2週間は、Issueの重複、意図不明項目の集約、実装後の体感確認を毎回人が確認する。

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

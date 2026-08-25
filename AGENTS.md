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
- **Issueの言語:** 新規Issueのタイトル、本文、コメントは日本語で統一してください。ラベル名、`[<module_name>]`、Issue検索用の固定識別子など、運用上の機械的な文字列は既存形式を維持します。
- **コミットメッセージ:** Conventional Commits形式で、type/scopeなどの形式上の識別子は英語のまま、件名と本文は日本語で統一してください。変更の意図が明確になる詳細な説明を含めてください（例: `fix(thread): 自動更新の停止条件を修正`）。

### AI improvement workflow

このリポジトリでは、日常利用中の不満を`.todo`へ散文のまま記録し、AIがGitHub Issueへ整理する。正本は人が編集するLive worktree（`V:\repos\fork\read.crx-2\.todo`）に置き、AI worktreeは`--todo-path`で正本を参照する。`.todo`への入力者に、原因・優先度・再現手順・Issue形式の記入を要求してはいけない。

#### Triage rules

- `.todo`を読み、未処理の不満を利用者の問題単位へ整理する。
- 最初に既存のGitHub Issueをopen/closedの両方で確認する。タイトル、本文、関連語で検索し、重複Issueを作らない。
- `needs-priority`は実装候補としては無視するが、重複確認の対象からは外さない。これは調査済みで、人の優先度判断を待つ状態である。
- 関連コード、既存テスト、画面構成を読み、Issueには根拠となるファイルと処理を記録する。
- 症状、期待する挙動、再現条件、原因候補、修正案、完了条件、リスクをIssue本文へ整理する。
- コードから判断できない仕様や、原文から意図を読み取れない項目を推測しない。
- 既存Issueがすでに修正済み、または今後実施しない内容に見える場合は`review-existing`として報告する。AIはIssueを閉じず、人が確認してから`completed`または`not planned`で閉じる。
- `review-existing`ラベルは、既存Issueの完了・廃止・重複を人が確認する待機状態として使う。AIはこのラベルを付ける提案までに留め、Issueのクローズは行わない。
- 既存Issueへ情報を追加して再調査させる場合は`needs-retriage`を付ける。定期トリアージは本文・コメント・最新コードを再確認し、結果をIssueコメントへ残してから、情報が足りれば`needs-priority`、不足が残れば`needs-info`へ戻す。
- 意図不明の項目は個別Issueを乱立させず、`[triage] Unclear todo items`という集約Issueを検索して追記する。集約Issueがなければ1件だけ作成し、`needs-info`を付ける。
- 新規Issueを作成する前に、同じ集約Issueまたは関連Issueがないか必ず確認する。
- 1回のトリアージで作成する新規Issueは最大3件とし、残りは次回へ回す。
- トリアージ工程ではコードを変更しない。優先度、採用案、最終的な使い心地を決めない。
- Issue化したら、元の`.todo`項目の近くに`<!-- issue: #123 -->`だけを追記する。原文の不満を書き換えない。
- `<!-- issue: #123 -->`が付いた項目は新規Issue化の対象から外すが、リンク先Issueの状態確認は継続する。解決済み・不要・重複の可能性があれば`review-existing`として報告する。
- AIが作成するIssue本文の末尾には、AIによる整理であることと、人が内容・優先度・仕様・完了判定を確認することを明記する。

#### Issue state rules

- 調査済みで人の優先度判断待ちは`needs-priority`。
- 仕様や再現情報が不足するものは`needs-info`。
- 追加情報をもとにAIの再調査を待つものは`needs-retriage`。再調査後は自動的に`needs-priority`または`needs-info`へ遷移する。
- 人が実装してよいと判断したものだけが`ready`。
- `ready`以外のIssueを実装対象にしない。
- 実装開始時に`in-progress`、実装と自動確認の完了後に`needs-human-test`へ変更する。
- 人が実際に操作して満足した場合だけ、Issueへ確認結果を記録して`completed`でクローズする。
- 既存Issueを完了扱いにする場合は、実際の確認結果をコメントしてから`gh issue close <number> --reason completed`を使う。実施しない場合は理由をコメントしてから`gh issue close <number> --reason "not planned"`を使う。
- 仕様不明、テスト環境不良、データ損失の恐れ、Issue範囲超過では停止して`blocked`または`needs-info`にする。

#### Implementation rules

- 実装AIはopenかつ`ready`のIssueを番号の昇順で確認し、番号が最小の1件だけを選ぶ。Issue、AGENTS.md、関連コード、既存テストを確認する。
- Issue選択とブランチ準備には`pwsh -File scripts/start-ready-issue.ps1`を使い、作業開始時に`ready`を外して`in-progress`を付ける。
- 定期実行は`pwsh -File scripts/run-ready-issue.ps1`と同じ処理で実装Codexを起動し、成功時だけ`needs-human-test`へ移す。失敗時は同じIssueブランチを保持して次回に再開する。
- 実装コミットは`needs-human-test`への遷移後にremoteの同名Issueブランチへpushする。正本`.todo`の運用コミットは正本worktreeの現在ブランチへpushする。push失敗時はworktreeを戻さず停止する。
- 調査と実装は、人が編集するworktreeではなく、`develop`ベースの永続的なAI専用worktreeで行う。このworktreeは削除せず、Issueごとに専用ブランチへ切り替えて再利用する。
- AI専用worktreeがdirtyな場合はresetやstashを自動実行せず、既存作業を保護して停止する。
- Issue範囲外のついで修正をしない。
- 自動テスト、静的解析、必要な画面確認を実行し、結果・残存リスク・人が試す操作をIssueへ記録する。
- バグ修正や意図的なコード変更では、コード内に「なぜその実装にしたか」をコメントとして残す。
- 実装後の不満が元のIssueの完了条件に関するものなら、そのIssueへコメントする。別問題なら`.todo`へ新しい散文として追加する。
- 本番デプロイ、削除、課金、権限変更を自動実行しない。

#### Initial operating cadence

- この改善ループは初期段階では常時運用対象とする。
- 利用者が正本`.todo`へ追加した後、または実装作業が一区切りついた後にトリアージを実行する。
- 手動確認はAI worktreeから`pnpm triage:todo -- --todo-path V:\repos\fork\read.crx-2\.todo --output-dir V:\repos\fork\read.crx-2\debug\triage`、GitHub Issue作成を含む定期実行は`pnpm triage:todo -- --apply --todo-path V:\repos\fork\read.crx-2\.todo --output-dir V:\repos\fork\read.crx-2\debug\triage`で行う。
- トリアージは正本Live worktreeの`V:\repos\fork\read.crx-2\debug\triage\triage.lock`で同時実行を防ぎ、`.todo`とGitHub Issuesの状態が前回と同じならCodexを起動せず終了する。意図的な再実行には`--force`を付ける。
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

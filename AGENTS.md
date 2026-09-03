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

- トリアージ開始時は`.todo`の処理より先に、GitHubの`needs-retriage`ラベル付きIssueをopen/closed問わず確認する。`gh issue list --repo 22-2/ChLens --label needs-retriage --state all --limit 200 --json number,title,state,labels,updatedAt`で候補を列挙し、各Issueを`gh issue view <number> --repo 22-2/ChLens --comments`で読む。追加情報を受けたIssueの再調査を終えるまで、`.todo`の新規候補より優先して扱う。
- `.todo`を読み、未処理のメモを利用者の問題単位へ整理する。`[ ]`は「未完了」を表すだけであり、「未トリアージ」を表すものではない。
- 問題単位は、チェックボックス付きの1行、または空行で区切られた連続した自由記述とする。URL・サンプル・補足説明は直前の問題単位に含め、別Issueへ分割しない。
- 各問題単位は、処理後に次のいずれか1つのマーカーを原文の直後へ追記する。既存Issueへの対応付けでもマーカーを追記してよい。
  - `<!-- issue: #123 -->`: 対応する正規Issue。新規作成時だけでなく、既存Issueを発見した時にも付ける。
  - `<!-- triage: implemented -->`: コードとテストで要望の挙動が既に確認できたもの。
  - `<!-- triage: reference -->`: Issue化対象ではない参考リンク、実装方針、補足情報。
  - `<!-- triage: deferred -->`: 今回の3件制限で延期した未処理項目。次回は新規項目より先に再開する。
- マーカー追加以外で、原文・チェック状態・並び順を書き換えない。既存マーカーがある項目は無条件に無視せず、Issueの存在、状態、本文の対応範囲を検証する。内容が変わって対応関係が崩れた場合は、古いマーカーを残したままにせず再トリアージする。
- 既存のGitHub Issueをタイトル、本文、関連語で検索し、重複Issueを作らない。
- 関連コード、既存テスト、画面構成を読み、Issueには根拠となるファイルと処理を記録する。
- 症状、期待する挙動、再現条件、原因候補、修正案、完了条件、リスクをIssue本文へ整理する。
- コードから判断できない仕様や、原文から意図を読み取れない項目を推測しない。
- feature、chore、refactor、設計メモも実装可能な要望であれば問題単位として扱う。仕様不足の場合は1項目につき1件の`needs-info` Issueへ整理し、参考情報だけの行に限って`triage: reference`を付けてスキップする。
- 意図不明の項目は1つの原文から複数の解釈へ分割せず、1件だけ`needs-info` Issueを作成する。旧集約Issue #4（`[triage] 情報不足のtodo項目`）へ新しい項目を追記せず、新しい集約Issueも作らない。
- 新規Issueを作成する前に、同じ問題単位のマーカー、関連Issue、旧Issueの状態を必ず確認する。
- 1回のトリアージで作成する新規Issueは最大3件とし、残りの未処理候補には`triage: deferred`を付けて次回へ回す。延期マーカーは処理済みを意味しない。
- 既存Issueがopenで同じ範囲を扱っている場合は、そのIssueへ対応付ける。closed Issueは終了だけを根拠に解決済みとみなさず、コード・テスト・Issue本文を確認する。`needs-info`または`needs-retriage`を付けたclosed Issueは未解決の確認待ちとして報告し、黙って新規Issue抑止の根拠にしない。
- トリアージ工程ではコードを変更しない。優先度、採用案、最終的な使い心地を決めない。
- Issue化または判定が終わったら、元の`.todo`項目の近くに対応マーカーだけを追記する。原文の不満を書き換えない。

#### Issue state rules

- 調査済みで人の優先度判断待ちは`needs-priority`。
- 仕様や再現情報が不足するものは`needs-info`。
- 人が実装してよいと判断したものだけが`ready`。
- 追加情報で既存Issueの確認内容が変わった場合は`needs-retriage`として既存Issueへ追記し、同じ問題のIssueを新規作成しない。
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

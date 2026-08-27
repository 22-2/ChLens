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

- **ブラウザビュー:** Vite のブラウザ向けエントリは `src/view/browser/index.tsx` です。`src/view/browser/App.tsx` がペイン、タブ、ナビゲーション、ステータスバー、下部パネルを組み合わせ、`src/view/browser/components/ContentArea.tsx` がタブ内の各ページを `src/view/browser/pages/` から描画します。共通のフック、UI、ユーティリティは同じ `src/view/browser/` 配下に置きます。
- **コア機能:** `src/core/` に掲示板・スレッド・ブックマーク・履歴・キャッシュ・NG 判定などのドメイン処理を置きます。ビューから直接実装へ依存する処理は、可能な範囲でサービスコンテナ経由にします。
- **サービスコンテナ:** `src/service-container/` がサービスのインターフェース、共有コンテナ、レガシー実装を接続するセットアップ処理を提供します。ビューはこのコンテナを通じて設定、取得、保存、通知などを利用します。
- **プラットフォーム抽象化:** `src/app/platform/` がウィンドウ操作、HTTP、ストレージの共通インターフェースを定義し、`browser/` と `tauri/` の実装を実行環境に応じて選択します。Tauri 環境で不足する拡張機能 API は `src/browser-shim.js` が補います。
- **共有ライブラリ:** `packages/ch-lib/` はワークスペース内の共有パッケージで、5ch 互換 URL、掲示板・スレッド・bbsmenu のパーサー、取得処理などを提供します。
- **スタイル管理:** CSS のエントリポイントは `src/view/browser/styles/index.css` です。foundation、UI、layout、components、pages のスタイルをこのファイルから import し、`src/view/browser/index.tsx` で読み込みます。
- **レガシー互換層:** `src/app.ts` は起動処理と既存の `window.app` API を維持し、新しいコードでは ES module と `src/service-container/` を優先します。
- **ビルド構成:** `vite.config.ts` が `src/view/browser/index.tsx` を起点に、`PLATFORM` に応じた Chrome、Firefox、Tauri 向けの出力を構成します。開発・ビルド・テスト・静的解析には Vite+ の `vp` コマンドを使用します。

### Coding Conventions

- **ES Modules:** 名前付きエクスポートを優先してください。
- **型定義:** `any` の使用は避け、厳密な型定義を心がけてください。
- **プラットフォーム抽象化:** ストレージや通信などのプラットフォーム固有の機能は `src/app/platform/` 以下のインターフェースを通じて利用してください。
- **意図の明文化:** バグ修正や意図的な変更を行う際は、コード内に「なぜそのように書いたか」という背景をコメントとして残してください。
- **エラーはログに出す** エラーは握りつぶしせず、しっかり詳細なログを出すようにしてくださいっす。

### PR instructions

- **Title format:** `[<module_name>] <日本語の説明>` (例: `[thread] フィルター機能を追加`)
- **Pre-commit check:** `pnpm lint` および `pnpm tsc6` を実行し、型エラーやリンターエラーがないことを確認してください。
- **Issue/PRの言語:** IssueとPRのタイトル、本文、コメントは日本語で統一してください。ラベル名、`[<module_name>]`、Issue検索用の固定識別子など、運用上の機械的な文字列は既存形式を維持します。
- **ステータスの管理:** 実装の進捗を表すステータスラベルはIssueに付け、Issueを進捗の正とします。PRには同じステータスを重複して付けず、必要な場合だけレビュー状態などPR固有のラベルを付けます。
- **コミットメッセージ:** Conventional Commits形式で、type/scopeなどの形式上の識別子は英語のまま、件名と本文は日本語で統一してください。変更の意図が明確になる詳細な説明を含めてください（例: `fix(thread): 自動更新の停止条件を修正`）。
- **コミットスコープ:** scopeは変更の主な責務を表す英語の固定語彙を使用してください。`AGENTS.md`の構成分類を候補の基準としますが、実際のコード責務に合わせて次の一覧から選んでください。
  - `browser`: `src/view/browser/` 全般
  - `thread`: スレッド表示、検索、次スレ機能
  - `url`: URL解析、正規化、リンク遷移
  - `media`: 画像、動画、Imgurなどのメディア処理
  - `copy`: コピー処理
  - `bookmark`: お気に入り機能
  - `settings`: 設定画面、設定保存
  - `write`: 書き込み機能
  - `popup`: ポップアップ、ペイン
  - `platform`: Browser/Tauriのプラットフォーム抽象化
  - `ch-lib`: `packages/ch-lib/` の共有ライブラリ
  - `workflow`: Issue、todo、自動化などの開発ワークフロー
  - `architecture`: 設計文書、構成説明
  - 既存の一覧で表せない全体変更だけは、scopeを省略して構いません。
  - 複数領域にまたがる変更は、利用者向けの主目的または変更の中心となる責務を1つ選んでください。
  - Issueのラベル名とscopeは一致させなくても構いません。scope名は小文字で統一してください。

### AI improvement workflow

このリポジトリでは、日常利用中の不満を`.todo`へ散文のまま記録し、AIがGitHub Issueへ整理する。`.todo`への入力者に、原因・優先度・再現手順・Issue形式の記入を要求してはいけない。

#### Triage rules

- `.todo`を読み、未処理の不満を利用者の問題単位へ整理する。
- 最初に既存のGitHub Issueをopen/closedの両方で確認する。タイトル、本文、関連語で検索し、重複Issueを作らない。
- `needs-priority`と`needs-info`は実装候補としては無視するが、重複確認の対象からは外さない。前者は調査済みで人の優先度判断を待つ状態、後者は情報の追記を待つ状態である。
- 関連コード、既存テスト、画面構成を読み、Issueには根拠となるファイルと処理を記録する。
- 症状、期待する挙動、再現条件、原因候補、修正案、完了条件、リスクをIssue本文へ整理する。
- コードから判断できない仕様や、原文から意図を読み取れない項目を推測しない。
- 既存Issueがすでに修正済み、または今後実施しない内容に見える場合は`review-existing`として報告する。AIはIssueを閉じず、人が確認してから`completed`または`not planned`で閉じる。
- `review-existing`ラベルは、既存Issueの完了・廃止・重複を人が確認する待機状態として使う。AIはこのラベルを付ける提案までに留め、Issueのクローズは行わない。
- 既存Issueへ情報を追加して再調査させる場合は`needs-retriage`を付ける。定期トリアージは本文・コメント・最新コードを再確認し、結果をIssueコメントへ残してから、情報が足りれば`needs-priority`、不足が残れば`needs-info`へ戻す。
- `.todo`の未処理項目は、重複確認後、元の項目ごとに最大1件の個別Issueとして作成する。意図・仕様・再現情報が不足していても、推測で補わず`needs-info`を付けて保留する。1つの項目から複数の解釈やIssueを作らない。
- 新規Issueを作成する前に、関連する既存Issue（open/closed）がないか必ず確認する。
- 1回のトリアージで作成する新規Issueは最大3件とし、残りは次回へ回す。
- トリアージ工程ではコードを変更しない。優先度、採用案、最終的な使い心地を決めない。
- Issue化したら、元の`.todo`項目の近くに`<!-- issue: #123 -->`だけを追記する。原文の不満を書き換えない。
- `<!-- issue: #123 -->`が付いた項目は新規Issue化の対象から外すが、リンク先Issueの状態確認は継続する。解決済み・不要・重複の可能性があれば`review-existing`として報告する。
- AIが作成するIssue本文の末尾には、AIによる整理であることと、人が内容・優先度・仕様・完了判定を確認することを明記する。

#### Issue state rules

- 調査済みで人の優先度判断待ちは`needs-priority`。曖昧なメモから作成した個別Issueは、情報が揃うまで`needs-info`に留める。
- 意図、仕様、再現情報のいずれかが不足するものは`needs-info`。Issue本文には原文と未確認事項を残し、後から情報を追記できる状態にする。
- 追加情報をもとにAIの再調査を待つものは`needs-retriage`。再調査後は自動的に`needs-priority`または`needs-info`へ遷移する。
- 人が実装してよいと判断したものだけが`ready`。
- `ready`以外のIssueを実装対象にしない。
- 実装開始時に`in-progress`、実装と自動確認の完了後に`needs-human-test`へ変更する。
- 人が実際に操作して満足した場合だけ、Issueへ確認結果を記録して`completed`でクローズする。
- 既存Issueを完了扱いにする場合は、実際の確認結果をコメントしてから`gh issue close <number> --reason completed`を使う。実施しない場合は理由をコメントしてから`gh issue close <number> --reason "not planned"`を使う。
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
- 手動確認は`pnpm triage:todo`、GitHub Issue作成を含む定期実行は`pnpm triage:todo -- --apply`で行う。
- トリアージは`debug/triage/triage.lock`で同時実行を防ぎ、`.todo`とGitHub Issuesの状態が前回と同じならCodexを起動せず終了する。意図的な再実行には`--force`を付ける。
- ただし、1回の実行で扱う新規Issueは最大3件とし、Issue作成後は人の判断を待つ。
- 最初の1〜2週間は、Issueの重複、`needs-info`項目の内容、実装後の体感確認を毎回人が確認する。

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

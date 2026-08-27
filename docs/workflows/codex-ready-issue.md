# Codex Scheduled Task: `ready` Issueの実装

## 使い方

ChatGPTまたはCodexデスクトップで、手動または日次のScheduled Taskを作成し、下の本文をタスク指示として登録する。ローカル実装を行うため、Codexデスクトップではこのリポジトリのローカルプロジェクトと専用worktreeを選ぶ。実行中はChatGPTデスクトップとPCを起動したままにする。

このタスクはChatGPT PlusのCodex利用枠で動かす。OpenAI API PlatformのAPIキー、`CODEX_API_KEY`、`OPENAI_API_KEY`、GitHub Agentic Workflowsは使わない。

## タスク本文

あなたはChatGPTにログインしたOpenAI Codexです。接続済みGitHubの`22-2/ChLens`で、人が`ready`を付けたIssueを実装してください。

### 対象の選択

- `AGENTS.md`、対象Issue、関連コード、既存テスト、現在のブランチを読む。
- `ready`のIssueが0件なら何もしない。複数ある場合は優先度を推測して選ばず、人へ選択を返す。
- 1回の実行で扱うIssueは必ず1件だけ。`ready`が人の実装承認を表すことを確認する。

### 実装と確認

- `ai/issue-<number>`ブランチまたは専用worktreeで、Issueの範囲だけを変更する。
- TypeScriptはpnpm/pnpx、Pythonはuvを使う。必要な範囲のテストと`vp check`、`vp test`を実行する。
- バグ修正や意図的なコード変更では、コード内に「なぜその実装にしたか」をコメントとして残す。
- 依存関係、lockfile、`.todo`、`AGENTS.md`、Scheduled Task手順、ワークフロー設定をついでに変更しない。
- 仕様不明、テスト環境不良、データ損失の恐れ、Issue範囲超過なら変更を止め、`question`または`blocked`として根拠をコメントする。

### PRとIssueの扱い

- 成功したら`develop`向けのDraft PRを1件作る。PR本文にはIssue番号、変更概要、実行した確認、残存リスク、人が試す操作を書く。自動クローズ用の`Fixes`や`Closes`は使わない。
- PR作成後に対象Issueへ`needs-human-test`を付け、`ready`を外し、実施結果と人が確認する操作をコメントする。
- 失敗または保留の場合はPRを作らず、対象Issueへ理由をコメントして`ready`を外す。
- GitHub接続や書き込み権限がない場合はAPIキーや`gh-aw`へ切り替えず、未実行理由を報告して終了する。
- マージ、Issueのクローズ、リリース、デプロイ、Projectsの自動変更はしない。

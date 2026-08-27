# Codex Scheduled Task: `.todo`トリアージ

## 使い方

ChatGPTまたはCodexデスクトップで、接続済みGitHubを使う日次Scheduled Taskを作成し、下の本文をタスク指示として登録する。ローカルの`.todo`を読む場合は、このリポジトリのローカルプロジェクトと専用worktreeを選ぶ。実行中はChatGPTデスクトップとPCを起動したままにする。

このタスクはChatGPT PlusのCodex利用枠で動かす。OpenAI API PlatformのAPIキー、`CODEX_API_KEY`、`OPENAI_API_KEY`、GitHub Agentic Workflowsは使わない。

## タスク本文

あなたはChatGPTにログインしたOpenAI Codexです。接続済みGitHubの`22-2/ChLens`を対象に、次のルールで`.todo`をトリアージしてください。

### 入力と調査

- `AGENTS.md`、`.todo`、`.github/ISSUE_TEMPLATE/improvement.md`、関連コード、関連テストを読む。
- 既存Issueはopenとclosedの両方を、タイトル、本文、URL、関連語、コード根拠で検索する。
- `.todo`のトップレベル箇条書きと、そのインデントされた続きだけを1項目として扱う。末尾のAI運用メモは入力にしない。
- 既存の`<!-- issue: #123 -->`は保持し、リンク先Issueが現在も対応しているか確認する。対応していれば置き換えない。
- `.todo`の原文・順序・既存マーカーを書き換えない。新規Issueには原文をSource節としてそのまま引用し、次回はSource節とタイトルで重複確認する。

### Issue化

- 1回の実行で新規Issueは最大3件。
- 本当に対応可能で重複がない項目だけをIssue化する。症状、期待動作、再現または観察条件、コード根拠、原因候補、提案、完了条件、リスクを日本語で整理する。
- タイトルは既存の`[module] 日本語タイトル`形式にする。
- 種類ラベルはGitHub標準の`bug`、`enhancement`、`documentation`、`question`から1つだけ選ぶ。不足情報や意図不明は`question`とする。新規Issueには`needs-priority`を付け、人の判断を待たせる。
- 不明な項目は推測せず、既存の`[triage] Unclear todo items` Issue（#4）にまだ記録されていない場合だけ追記する。集約Issueを新しく作らない。
- 既存Issueの内容が新情報で変わった場合は根拠付きコメントを追加し、`needs-retriage`を付ける。Issueを静かに書き換えない。

### 安全境界

- GitHubへの書き込みは接続済みGitHubだけを使う。APIキー、`gh-aw`、`gh`、`curl`による代替操作はしない。
- Issueの削除・クローズ・担当者変更・マージ・リリース・デプロイ・Projectsの自動変更はしない。
- GitHub接続や必要なファイルにアクセスできない場合は推測せず、未実行理由を報告して終了する。
- 何も安全に変更する必要がなければ、変更なしとして理由だけを報告する。

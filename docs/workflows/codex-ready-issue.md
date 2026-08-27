# Codex Scheduled Task: 承認済みIssueの実装

実装手順の正本は[implement-ready-issue Skill](../../.agents/skills/implement-ready-issue/SKILL.md)です。この文書はChatGPT/Codex Scheduled Taskの登録内容だけを定義します。

## 設定

- Codexデスクトップで、このリポジトリの実装用ローカルプロジェクトを選択し、隔離worktreeで実行する。
- 最初は手動実行し、Draft PRとラベル遷移を確認してから日次実行を有効にする。
- OpenAI APIキーは作成せず、ChatGPT PlusのCodex利用枠と既存のGitHub接続を使用する。

## タスク本文

```text
Use $implement-ready-issue for this repository. Process exactly one ready-for-agent Issue, validate the change, create a draft PR, and stop for human review without merging or closing the Issue.
```

Skillを読み込めない、GitHubへアクセスできない、または安全に隔離できない場合は、代替処理をせず理由を報告して終了します。

# Codex Scheduled Task: `.todo`トリアージ

トリアージ手順の正本は[triage-todo Skill](../../.agents/skills/triage-todo/SKILL.md)です。この文書はChatGPT/Codex Scheduled Taskの登録内容だけを定義します。

## 設定

- Codexデスクトップで、このリポジトリの移行・自動化専用worktreeをローカルプロジェクトとして選択する。
- 日次実行から始め、最初の1〜2回は手動実行して結果を確認する。
- ローカル`.todo`を使う実行中は、PCとCodexデスクトップを起動しておく。
- OpenAI APIキーは作成せず、ChatGPT PlusのCodex利用枠と既存のGitHub接続を使用する。

## タスク本文

```text
Use $triage-todo in apply mode for this repository. Follow AGENTS.md, create at most three Issues, preserve .todo source text, and report every write and skipped item.
```

Skillを読み込めない、GitHubへアクセスできない、または対象worktreeが違う場合は、代替処理をせず理由を報告して終了します。

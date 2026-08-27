# GitHub Agentic Workflows移行ロードマップ

## 目的

`.todo`を自由記述の入口として残し、ローカルのCodexスクリプトとWindows Task Schedulerで動く改善ループを、OpenAI Codexを実行エンジンにしたGitHub Agentic Workflowsへ移行する。

既存Issue、コメント、クローズ履歴、`.todo`内のIssue番号は移行データとしてそのまま利用し、作り直さない。

## 状態管理

GitHub標準の分類とProjectsの状態を優先し、専用ラベルはAIへの明示的な命令に必要なものだけ残す。

| 現在 | 移行後 |
| --- | --- |
| `needs-info` | 標準ラベル `question` |
| `review-existing` | 標準ラベル `invalid`、`duplicate`、`wontfix`のいずれかを人が確認して適用 |
| `needs-priority` | ProjectsのStatus `Todo`。Priorityは人が設定 |
| `in-progress` | ProjectsのStatus `In Progress` |
| Issueの完了 | Issue closeとProjectsのStatus `Done` |
| `blocked` | Projectsに`Blocked`を追加する場合だけ使用し、ラベルは廃止 |
| `ready` | AI実装を開始するコマンドラベルとして残す |
| `needs-retriage` | AI再調査を開始するコマンドラベルとして残す |
| `needs-human-test` | PRのDraft/Ready状態とレビューで表現し、ラベルは廃止 |

Issueの種類には標準ラベルの`bug`、`enhancement`、`documentation`、`question`を使用する。既存Issueのラベルは新ワークフローの試運転が終わるまで一括変更しない。

## 移行後の構成

- `.todo`: `develop`上の自由記述インボックス
- `todo-triage.md`: `.todo`と既存Issueを調査し、最大3件のIssueを作成する
- `ready-issue.md`: `ready`が付いたIssueを1件実装し、Draft PRを作成する
- Repo Memory: 処理済みメモと前回調査状態を保持する
- Safe Outputs: Issue、ラベル、コメント、PRへの書き込みを制限する
- GitHub Projects: 優先度と進行状態を人が管理する

OpenAI Codexは`CODEX_API_KEY`または`OPENAI_API_KEY`をGitHub Actions Secretから受け取る。ワークフローは最初にstaged modeで実行し、安全な出力を確認するまでIssueやPRを変更しない。

## チェックリスト

- [x] 旧Windows定期タスクを無効化し、既存Issueと`.todo`を凍結せず保持する
- [ ] `develop`へ最新の`.todo`を同期し、gh-awとOpenAI Codexの認証を設定する
- [ ] staged modeでトリアージと既存Issue引き継ぎを検証する
- [ ] `ready`からDraft PRまでの実装ワークフローを検証する
- [x] GitHub標準9種のラベルを復元し、#4の`needs-info`を`question`へ移行する
- [ ] Projectsへ状態を移し、2本のワークフローを有効化する
- [x] 旧スクリプト、旧テスト、旧文書を移行ブランチから撤去する
- [x] 旧AI用worktreeを削除する
- [ ] 切替完了後にTask Schedulerを削除する

## 切り替え条件

- staged runが既存Issueを重複作成候補にしない
- 1回のトリアージで作成するIssueが最大3件に制限される
- AIが優先度、マージ、Issueの完了を自動決定しない
- `ready`のないIssueを実装しない
- 自動テスト結果と人が確認する操作がPRへ記録される

問題がある場合は新ワークフローを無効化し、削除前のWindows定期タスクを再度有効化して戻す。旧システムの削除後はGit履歴から復元する。

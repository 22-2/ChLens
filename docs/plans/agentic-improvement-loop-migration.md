# ChatGPT Codex改善ループ移行ロードマップ

## 目的

`.todo`を自由記述の入口として残し、ローカルの独自CodexスクリプトとWindows Task Schedulerで動く改善ループを、ChatGPT Plusに含まれるOpenAI CodexのScheduled Taskと接続済みGitHubへ移行する。

OpenAI API PlatformのAPIキー、従量課金、GitHub Actions上のCodex実行は採用しない。Codexの利用枠とScheduled Taskの提供状況は、ChatGPTアカウントとワークスペースの設定に従う。

既存Issue、コメント、クローズ履歴、`.todo`内のIssue番号は移行データとしてそのまま利用し、作り直さない。

## 状態管理

GitHub標準の分類とProjectsの状態を優先し、専用ラベルはAIへの明示的な命令に必要なものだけ残す。

| 現在 | 移行後 |
| --- | --- |
| `needs-info` | 標準ラベル`question`へ移行済み |
| `review-existing` | 標準ラベル`invalid`、`duplicate`、`wontfix`のいずれかを人が確認して適用 |
| `needs-priority` | ProjectsのStatus `Todo`。Priorityは人が設定 |
| `in-progress` | ProjectsのStatus `In Progress` |
| Issueの完了 | Issue closeとProjectsのStatus `Done` |
| `blocked` | Projectsに`Blocked`を追加する場合だけ使用 |
| `ready` | AI実装を開始する人の承認ラベルとして残す |
| `needs-retriage` | AI再調査を開始する人の指示ラベルとして残す |
| `needs-human-test` | Draft PRとレビューで表現する補助ラベル |

Issueの種類には標準ラベルの`bug`、`enhancement`、`documentation`、`question`を使用する。既存Issueのラベルは新運用の試運転が終わるまで一括変更しない。

## 移行後の構成

- `.todo`: ローカルプロジェクトに残す自由記述インボックス
- [`codex-todo-triage.md`](../workflows/codex-todo-triage.md): 日次Scheduled Taskへ登録するトリアージ手順。最大3件のIssueを作成する
- [`codex-ready-issue.md`](../workflows/codex-ready-issue.md): `ready` Issueを1件だけ実装し、Draft PRを作る手順
- ChatGPT/CodexのGitHub接続: Issue、コメント、ラベル、PRの読み書きに使用する
- Codexデスクトップの専用worktree: ローカル`.todo`とソース変更を他の作業から分離する

ローカルファイルを使うScheduled Taskは、Codexデスクトップで専用worktreeを選択して実行する。実行中はデスクトップアプリとPCを起動したままにする。Web上のScheduled Taskはローカルフォルダを保持しないため、GitHub接続から取得できる情報だけで動かす。

## チェックリスト

- [x] 旧Windows定期タスクを無効化し、既存Issueと`.todo`を保持する
- [x] GitHub標準9種のラベルを復元し、#4の`needs-info`を`question`へ移行する
- [x] 旧スクリプト、旧テスト、旧文書、旧AI用worktreeを撤去する
- [x] ChatGPT Plusのみで動かすScheduled Task方式へ切り替える
- [ ] GitHub接続と2つのScheduled Taskを作成し、アクセス範囲を確認する
- [ ] トリアージを手動で試運転し、Issue重複と最大3件制限を確認する
- [ ] `ready`からDraft PRまでを1件で試運転し、人手確認を行う
- [ ] 1〜2週間の安定稼働後に旧Task Schedulerを削除する

## 切り替え条件

- ChatGPT PlusのScheduled TaskとGitHub接続が利用可能である
- トリアージが既存Issueを重複作成せず、1回最大3件で停止する
- `ready`のないIssueを実装しない
- AIが優先度、マージ、Issueの完了を自動決定しない
- 自動テスト結果と人が確認する操作がDraft PRへ記録される
- API Platform Secretを作成せず、従量課金が発生しない構成である

問題がある場合はScheduled Taskを一時停止し、Git履歴に保存された移行前後の文書とIssueを使って手動運用へ戻す。旧Task Schedulerは切替完了まで無効状態で保持し、安定稼働後に削除する。

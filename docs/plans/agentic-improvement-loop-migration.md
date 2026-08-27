# ChatGPT Codex改善ループ移行ロードマップ

## 目的

`.todo`を自由記述の入口として残し、ローカルの独自CodexスクリプトとWindows Task Schedulerで動く改善ループを、ChatGPT Plusに含まれるOpenAI CodexのScheduled Taskと接続済みGitHubへ移行する。

OpenAI API PlatformのAPIキー、従量課金、GitHub Actions上のCodex実行は採用しない。Codexの利用枠とScheduled Taskの提供状況は、ChatGPTアカウントとワークスペースの設定に従う。

既存Issue、コメント、クローズ履歴、`.todo`内のIssue番号は移行データとしてそのまま利用し、作り直さない。

## 状態管理

GitHub標準の分類を優先し、専用ラベルはAIへの明示的な命令と引き渡しに必要なものだけ残す。

| 現在 | 移行後 |
| --- | --- |
| `needs-info` | 必須情報が不足しているgh-aw互換のTriageラベルとして使用 |
| `review-existing` | `needs-human-review`へ統合 |
| `needs-priority` | 廃止。分類済みで`ready-for-agent`がなければ人の判断待ち |
| `ready` | `ready-for-agent`へ改名 |
| `in-progress` | 実装中を示すため維持 |
| `needs-retriage` | 廃止。`needs-info` Issueの新情報を次回トリアージで再確認 |
| `needs-human-test` | `needs-human-review`へ統合 |
| `blocked` | 環境、依存関係、安全性、データ損失リスクによる停止に限定 |
| Issueの完了 | 人がGitHubのclose reason `completed`または`not planned`を選択 |

Issueの種類には標準ラベルの`bug`、`enhancement`、`documentation`、`question`を使用する。優先度ラベルは必要性が確認されるまで追加しない。

## 移行後の構成

- `.todo`: ローカルプロジェクトに残す自由記述インボックス
- [`.agents/skills/triage-todo/SKILL.md`](../../.agents/skills/triage-todo/SKILL.md): `.todo`を調査して最大3件のIssueを作成する正本
- [`.agents/skills/implement-ready-issue/SKILL.md`](../../.agents/skills/implement-ready-issue/SKILL.md): `ready-for-agent` Issueを1件だけ実装してDraft PRを作る正本
- [`docs/workflows/`](../workflows/): Scheduled Taskへ登録する短いSkill呼び出し手順
- ChatGPT/CodexのGitHub接続: Issue、コメント、ラベル、PRの読み書きに使用する
- Codexデスクトップの専用worktree: ローカル`.todo`とソース変更を他の作業から分離する

ローカルファイルを使うScheduled Taskは、Codexデスクトップで専用worktreeを選択して実行する。実行中はデスクトップアプリとPCを起動したままにする。Web上のScheduled Taskはローカルフォルダを保持しないため、GitHub接続から取得できる情報だけで動かす。

## チェックリスト

- [x] 旧Windows定期タスクを無効化し、既存Issueと`.todo`を保持する
- [x] GitHub標準9種のラベルを復元する
- [x] 旧スクリプト、旧テスト、旧文書、旧AI用worktreeを撤去する
- [x] ChatGPT Plusのみで動かすScheduled Task方式へ切り替える
- [x] 2つの手順をrepo-local Skillへ移し、Scheduled TaskのプロンプトをSkill呼び出しだけにする
- [x] 既存IssueをGitHub標準分類と最小状態ラベルへ移行する
- [ ] GitHub接続と2つのScheduled Taskを作成し、アクセス範囲を確認する
- [ ] トリアージを手動で試運転し、Issue重複と最大3件制限を確認する
- [ ] `ready-for-agent`からDraft PRまでを1件で試運転し、人手確認を行う
- [ ] 1〜2週間の安定稼働後に旧Task Schedulerを削除する

## 切り替え条件

- ChatGPT PlusのScheduled TaskとGitHub接続が利用可能である
- トリアージが既存Issueを重複作成せず、1回最大3件で停止する
- `ready-for-agent`のないIssueを実装しない
- AIが優先度、マージ、Issueの完了を自動決定しない
- 自動テスト結果と人が確認する操作がDraft PRへ記録される
- API Platform Secretを作成せず、従量課金が発生しない構成である

問題がある場合はScheduled Taskを一時停止し、Git履歴に保存された移行前後の文書とIssueを使って手動運用へ戻す。旧Task Schedulerは切替完了まで無効状態で保持し、安定稼働後に削除する。

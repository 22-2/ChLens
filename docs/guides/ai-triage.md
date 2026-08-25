# Local AI todo triage

全体の流れは[AI改善ループの全体像](ai-improvement-workflow.md)を参照してください。

`.todo` is intentionally free-form. The local triage command asks Codex to read the notes, inspect
the repository, search existing GitHub Issues, and return a validated triage report. The canonical
file is the Live worktree's `V:\repos\fork\read.crx-2\.todo`; run the command from the AI worktree
and pass that file with `--todo-path`.

The first step is always an open-and-closed Issue check. `needs-priority` Issues are not implementation
candidates, but they are still duplicate candidates and must be searched.

## Dry-run

Run this first. It does not create or edit GitHub Issues and does not modify `.todo`.

```powershell
pnpm triage:todo -- --todo-path 'V:\repos\fork\read.crx-2\.todo'
```

The report is written to `debug/triage/todo-triage.json`.

## Apply

After reviewing the dry-run report, create at most three `needs-priority` Issues and append their
numbers to `.todo`:

```powershell
pnpm triage:todo -- --apply --todo-path 'V:\repos\fork\read.crx-2\.todo'
```

定期実行では、この `--apply` 形式をタスクスケジューラから呼び出します。前回と同じ
`.todo`およびGitHub Issuesの状態なら、Codexを起動せずに終了します。`.todo`を書き換えた、
Issueの状態・ラベルが変わった、または前回の解析をもう一度実行したい場合は、手動で
`--force`を追加してください。

```powershell
pnpm triage:todo -- --apply --force --todo-path 'V:\repos\fork\read.crx-2\.todo'
```

同じリポジトリで処理が重ならないよう、実行中は`debug/triage/triage.lock`を作成します。
異常終了後に残ったロックは、記録されたPIDが動作していなければ次回実行時に回収します。
入力状態は`debug/triage/state.json`に保存されます。これらはローカル実行用の生成物です。

## Windows Task Scheduler

初期運用では30分間隔でローカルタスクを登録できます。タスクは現在のWindowsユーザーで、
ログイン中に実行されます。`GITHUB_TOKEN`または`GH_TOKEN`はタスクの引数へコピーせず、
ユーザー環境変数から実行時に読み取ります。

人が編集中のworktreeと競合させないため、定期トリアージは`develop`ベースの永続的なAI専用
worktreeから登録します。このworktreeはIssueごとの作業ブランチへ切り替えて再利用し、作業後も
削除しません。`node_modules`も同じworktree内で維持し、lockfileが変わった場合に`vp install`で
整合させます。別worktreeの`node_modules`を直接共有してはいけません。

登録コマンドはAI専用worktree（通常は`V:\repos\fork\read.crx-2-ai`）で実行してください。
人が編集するLive用worktreeから登録すると、ready Issueの実装・push処理が動きません。
登録時に`-TodoPath`を指定し、正本`.todo`を明示します。

定期トリアージが正本`.todo`へIssueマーカーを追加した場合は、正本worktreeで`.todo`だけを
コミットし、正本worktreeの現在ブランチへpushします。ソースコードやその他のファイルはstage
しません。正本ブランチに未pushのコードコミットや`.todo`以外のstaged変更がある場合は、誤pushを
避けるため停止します。

定期トリアージは待機ブランチ`automation/ai-workspace`上でのみ動作します。AI worktreeを
Issue専用ブランチへ切り替えている間は、編集中の変更と運用コミットを混ぜないため正常終了で
スキップします。Issue作業が一区切りついたら待機ブランチへ戻すと、次回から調査を再開します。

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-triage-task.ps1 `
  -TodoPath 'V:\repos\fork\read.crx-2\.todo' -TodoBranch 'feature/chlens-live' -RunImmediately
```

登録内容だけを確認する場合は、`-WhatIf`を追加します。

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-triage-task.ps1 `
  -TodoPath 'V:\repos\fork\read.crx-2\.todo' -TodoBranch 'feature/chlens-live' -WhatIf
```

間隔を変更する場合は`-IntervalMinutes 60`のように指定します。登録を解除する場合は次を
実行します。

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\unregister-triage-task.ps1
```

タスクの標準出力・エラーは`debug/triage/scheduler.log`へ追記されます。タスク登録前に、
GitHub CLIが使う`GITHUB_TOKEN`または`GH_TOKEN`をWindowsのユーザー環境変数として設定してください。

Items whose intent is unclear are collected into one open `[triage] Unclear todo items` Issue with
the `needs-info` label. A successful run is the only time the command adds an
`<!-- issue: #123 -->` marker to `.todo`.

Items that already contain an `<!-- issue: #123 -->` marker are not converted into new Issues.
Their linked Issues are still checked for stale, completed, or no-longer-planned status. In that
case the command adds `review-existing`; it never closes the Issue automatically.

If an existing open Issue appears already fixed or no longer relevant, the report uses
`review-existing`. The command never closes it automatically. After human confirmation, close it
manually:

```powershell
gh issue close 123 --reason completed
gh issue close 124 --reason "not planned"
```

手動のtriageコマンド自体は`ready`を選択せず、実装状態やソースコードを変更しません。Issue作成後の
`.todo`マーカーのcommit・pushはTask Schedulerのラッパーが行い、実装ブランチのcommit・pushは
ready Issue runnerが行います。実装前の人による承認は引き続き必要です。

Automatically created Issues include an explicit disclosure that the investigation and organization
were performed by AI and that a human must confirm the content, priority, specification, and
completion decision.

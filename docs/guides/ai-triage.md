# AI todoトリアージの手順

全体の流れは[AI改善ループの全体像](ai-improvement-workflow.md)を参照してください。

`.todo`は意図的に自由記述のままにします。ローカルのトリアージコマンドがメモを読み、
リポジトリを調査し、既存のGitHub Issueを検索したうえで、確認済みのトリアージレポートを返します。

最初に必ずopenとclosedの両方のIssueを確認します。`needs-priority`と`needs-info`のIssueは
実装候補ではありませんが、重複確認の対象なので検索から外してはいけません。

## 事前確認

最初に実行してください。GitHub Issueの作成・編集や`.todo`の変更は行いません。

```powershell
pnpm triage:todo
```

レポートは`debug/triage/todo-triage.json`へ保存されます。

## 反映

事前確認のレポートを確認した後、個別Issueを最大3件作成し、番号を`.todo`へ追記します。
新しいIssueには、人が優先度を判断できる状態なら`needs-priority`を、意図・仕様・再現情報の
確認が必要なら`needs-info`を付けます。

```powershell
pnpm triage:todo -- --apply
```

定期実行では、この `--apply` 形式をタスクスケジューラから呼び出します。前回と同じ
`.todo`およびGitHub Issuesの状態なら、Codexを起動せずに終了します。`.todo`を書き換えた、
Issueの状態・ラベルが変わった、または前回の解析をもう一度実行したい場合は、手動で
`--force`を追加してください。

```powershell
pnpm triage:todo -- --apply --force
```

同じリポジトリで処理が重ならないよう、実行中は`debug/triage/triage.lock`を作成します。
異常終了後に残ったロックは、記録されたPIDが動作していなければ次回実行時に回収します。
入力状態は`debug/triage/state.json`に保存されます。これらはローカル実行用の生成物です。

## Windows Task Scheduler

初期運用では30分間隔でローカルタスクを登録できます。タスクは現在のWindowsユーザーで、
ログイン中に実行されます。`GITHUB_TOKEN`または`GH_TOKEN`はタスクの引数へコピーせず、
ユーザー環境変数から実行時に読み取ります。

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-triage-task.ps1 -RunImmediately
```

登録内容だけを確認する場合は、`-WhatIf`を追加します。

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-triage-task.ps1 -WhatIf
```

間隔を変更する場合は`-IntervalMinutes 60`のように指定します。登録を解除する場合は次を
実行します。

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\unregister-triage-task.ps1
```

タスクの標準出力・エラーは`debug/triage/scheduler.log`へ追記されます。タスク登録前に、
GitHub CLIが使う`GITHUB_TOKEN`または`GH_TOKEN`をWindowsのユーザー環境変数として設定してください。

それぞれ独立して理解できる`.todo`項目は、意図が不明でも最大1件の個別Issueにします。その場合は
`needs-info`を付け、原文と人が回答すべき質問を残します。無関係な文脈を大きな集約Issueへ混ぜず、
各項目を個別に検索できるようにするためです。コマンドが成功した場合だけ、`.todo`へ
`<!-- issue: #123 -->`のマーカーを追記します。

すでに`<!-- issue: #123 -->`マーカーがある項目は、新しいIssueへ変換しません。リンク先のIssueが
古くなっていないか、完了していないか、今後実施しない内容になっていないかは引き続き確認します。
その場合は`review-existing`を付け、Issueを自動でcloseすることはありません。

既存のopen Issueがすでに修正済み、または無関係になったように見える場合、レポートでは
`review-existing`を使います。コマンドは自動でcloseしません。人が確認した後、手動でcloseします。

```powershell
gh issue close 123 --reason completed
gh issue close 124 --reason "not planned"
```

コマンドは`ready-for-agent`を付けず、実装状態の変更、ソースコードの編集、commit、pushも行いません。
実装前には人の承認が必要です。実装状態のラベルはIssueで管理し、PRには同じラベルを付けず、
PR固有のレビュー用ラベルだけを使用します。

IssueとPRのタイトル、本文、コメントは日本語で記述します。固定ラベル、モジュール接頭辞、
その他の機械的な識別子は変更しません。

自動作成するIssueには、調査と整理をAIが行ったこと、内容・優先度・仕様・完了判定を人が確認する
必要があることを明記します。

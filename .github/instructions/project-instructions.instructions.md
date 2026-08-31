---
description: Describe when these instructions should be loaded by the agent based on task context
applyTo: "**" # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

基本的に、new-ui（src/view/browser）を編集してくださいっす

型チェックは、レガシーコードのエラーが多すぎて機能していないので、あんまり意味がないっす

GitHubのIssue、Pull Request、コメント、ラベル、検索などをAIが操作するときは、必ずGitHub CLIの`gh`を使ってくださいっす。Codex内蔵のGitHubコネクタ、直接GitHub API、ブラウザ操作は使わないでくださいっす。実行前に`gh auth status`で認証状態を確認し、リポジトリ操作では常に`--repo 22-2/ChLens`を明示してくださいっす。Issue作成は`gh issue create`、既存Issueの更新は`gh issue edit`を使い、未認証・権限不足ならエラーをそのままブロッカーとして報告してくださいっす。

<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->

Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.

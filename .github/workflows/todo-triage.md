---
on:
  workflow_dispatch:
  schedule: daily
  push:
    branches: [develop]
    paths:
      - .todo
  issues:
    types: [labeled]
    names: [needs-retriage]

permissions:
  contents: read
  issues: read
  pull-requests: read

engine: codex
model: gpt-5-codex

tools:
  github:
    toolsets: [default]
  repo-memory:
    branch-name: memory/todo-triage
    file-glob: ["**/*.md"]
    max-file-count: 3
    max-file-size: 65536
    max-patch-size: 65536

network:
  allowed: [defaults]

safe-outputs:
  # Keep the first deployment review-only; remove this after the staged run is accepted.
  staged: true
  create-issue:
    labels: [needs-priority]
    allowed-labels: [bug, enhancement, documentation, question, needs-priority]
    deduplicate-by-title: true
    max: 3
  add-comment:
    max: 3
    target: "*"
  add-labels:
    allowed: [bug, enhancement, documentation, question, duplicate, invalid, wontfix, needs-priority, needs-retriage, review-existing]
    max: 10
    target: "*"
  remove-labels:
    allowed: [needs-info, needs-retriage]
    max: 10
    target: "*"
  noop:
    max: 1
    report-as-issue: false
---

# .todo triage

Use OpenAI Codex to turn the free-form .todo inbox into a small, reviewable GitHub Issue queue.
This repository is public and the workflow must remain conservative, repeatable, and human-gated.

## Operating contract

- Treat .todo as an append-only capture inbox. Do not edit it, add issue-number comments to it, rewrite its wording, or mark items complete.
- The old local triage scripts, Task Scheduler job, state JSON, and ready-issue runner are retired. Never invoke them, and never run pnpm triage:todo.
- The agent job is read-only. Do not mutate GitHub with gh, curl, git push, or ad-hoc scripts. Request GitHub changes only through the declared safe-output tools.
- Read AGENTS.md, .todo, .github/ISSUE_TEMPLATE/improvement.md, relevant source files, tests, and both open and closed Issues before deciding.
- Preserve existing Issues, comments, closures, and historical .todo issue markers. An existing Issue is never closed by this workflow.
- GitHub's automatic gh-aw workflow marker in created Issue bodies is the durable link to this workflow. Use the exact source excerpt in each created Issue as the durable link to .todo.
- Keep repo memory small. Maintain /tmp/gh-aw/repo-memory/default/triage-state.md with the last run, source excerpts or stable short IDs, linked Issue numbers when known, and pending human decisions. Never store secrets or whole repository files.

## Event routing

1. For an issue labeled event, inspect the event label. If it is not needs-retriage, call noop immediately and do not scan .todo.
2. For a needs-retriage event, process only the triggering Issue. Re-read its body, comments, current code, and tests; add a concise investigation comment with evidence through add-comment, then move needs-retriage back to needs-priority with the label tools. Do not create a second Issue and do not close the Issue.
3. For schedule, push, or workflow_dispatch, run the normal inbox triage below.

## Normal inbox triage

1. Check the existing workflow-created queue first: search open Issues whose body contains the gh-aw workflow marker for todo-triage and which still have needs-priority. If any exist, do not create more Issues; record the waiting state and call noop. Older Issues without that marker do not block the first migration run.
2. Read .todo in order. Treat a top-level bullet and its indented continuation lines as one source item. Ignore the final AI運用メモ as a source item.
3. For every unchecked, unlinked item, search both open and closed Issues by title, wording, URLs, feature terms, and related code concepts. Existing needs-priority Issues still count for duplicate detection.
4. If a source item already has an issue marker, verify the linked Issue still represents it and record any concern in repo memory. Do not create a replacement Issue.
5. If the item is genuinely actionable and no related Issue exists, prepare at most three new Issues in this run. Use the existing Japanese issue template and title convention: [module] Japanese title.
6. Each new Issue must preserve the original source text verbatim in a Source section and include: symptoms, expected behavior, reproduction or observation conditions, code evidence, possible cause, proposal, completion conditions, risks, and the explicit note that a human must confirm content, priority, specification, and completion.
7. Give each new Issue a unique temporary_id in the aw_ plus 3-8 alphanumeric characters format. Add exactly one type label from bug, enhancement, documentation, or question. Use question when the information or intent is insufficient; do not use the retired needs-info label for new Issues. All new Issues receive needs-priority automatically and wait for a human decision.
8. If an item is too unclear to become a useful Issue, do not guess. Add it once to the existing [triage] Unclear todo items Issue (#4) only when it is not already represented there, and record that decision in repo memory. Do not create another aggregate Issue.
9. If new information materially changes an existing Issue, add a concise evidence-based comment and add needs-retriage. Do not silently rewrite the Issue or decide its priority.
10. When no safe output is needed, call noop with a short reason. Never emit a fake Issue just to report that nothing changed.

## Safety boundaries

- Never select or implement a ready Issue in this workflow; implementation is a separate migration phase.
- Never close, delete, merge, assign, or change a Project from this workflow.
- Never invent requirements, reproduction steps, causes, priorities, or completion criteria that the source and code do not support.
- Keep each run bounded to one retriage or at most three new Issues. Stop and use noop if the repository state is ambiguous.
- A successful run means that its safe outputs and repo-memory update are reviewable; it does not mean a human has approved or completed any Issue.

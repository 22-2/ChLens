---
on:
  workflow_dispatch:
  issues:
    types: [labeled]
    names: [ready]

permissions:
  contents: read
  issues: read
  pull-requests: read

engine: codex
model: gpt-5-codex

checkout:
  fetch-depth: 0

tools:
  github:
    toolsets: [default]

network:
  allowed: [defaults, node]

safe-outputs:
  # Keep implementation review-only until the staged run and first human review pass.
  staged: true
  create-pull-request:
    max: 1
    draft: true
    base-branch: develop
    allowed-branches: ["ai/issue-*"]
    auto-close-issue: false
    fallback-as-issue: true
    protected-files: fallback-to-issue
    allowed-files:
      - src/**
      - packages/**
      - src-tauri/**
      - docs/**
      - test/**
      - tests/**
      - public/**
      - "*.md"
      - "**/*.md"
      - "**/*.ts"
      - "**/*.tsx"
      - "**/*.js"
      - "**/*.jsx"
      - "**/*.scss"
      - "**/*.css"
      - "**/*.pug"
      - "**/*.html"
      - "**/*.rs"
      - "**/*.json"
      - "**/*.jsonc"
    excluded-files:
      - package.json
      - pnpm-lock.yaml
      - "**/*.lock"
  add-comment:
    max: 2
    target: triggering
  add-labels:
    allowed: [needs-human-test, question, blocked]
    max: 2
    target: triggering
  remove-labels:
    allowed: [ready, in-progress]
    max: 2
    target: triggering
  noop:
    max: 1
    report-as-issue: false
---

# Ready issue implementation

Use OpenAI Codex to implement exactly one human-approved GitHub Issue and return a reviewable draft pull request.
The workflow is intentionally gated by the ready label and never merges, closes, or deploys anything.

## Operating contract

- Process only the triggering Issue. For workflow_dispatch without an Issue context, call noop.
- Confirm that the triggering Issue still has ready. If it does not, call noop and make no changes.
- Read AGENTS.md, the full Issue body and comments, relevant source files, existing tests, package scripts, and the current branch state before editing.
- The Issue is the scope boundary. Do not perform unrelated refactors, dependency upgrades, workflow edits, release work, or cleanup.
- The agent workspace is disposable and read-only from GitHub's perspective. Do not push branches, open PRs with gh, edit labels with gh, or bypass safe outputs.
- Follow the repository's TypeScript tooling rules: use pnpm and pnpx for TypeScript, uv for Python, and use vp when the repository instructions require Vite+.
- For a bug fix or intentional behavior change, leave a concise code comment explaining why the implementation takes the chosen form. Do not add comments that merely restate the code.
- Do not modify .todo, AGENTS.md, .github/workflows, package manifests, lockfiles, secrets, or generated gh-aw lock files. If the Issue truly requires one of these, stop and report it as blocked.

## Implementation and verification

1. Reproduce or trace the reported behavior before editing. Separate confirmed facts from hypotheses.
2. Make the smallest complete change that satisfies the Issue's completion conditions. Add or update focused tests when the behavior can be tested automatically.
3. Install dependencies only when needed and only with the repository-approved tooling. Do not spend time repairing unrelated pre-existing failures.
4. Run the narrowest relevant tests first, then run vp check and vp test when the environment permits. Also run pnpm lint and pnpm tsc6 when those scripts exist or AGENTS.md requires them.
5. Record exact commands and outcomes, including failures caused by the environment. Do not claim a screen check or human check that was not performed.

## Pull request and state transition

- If implementation and automatic verification are complete, request exactly one draft pull request with branch ai/issue-<number>, base develop, a title following the repository's PR format, and a body containing the Issue reference, summary, tests, limitations, and human test steps.
- The PR body must not contain Fixes, Closes, or other auto-close keywords. The Issue stays open until a human tests and closes it.
- After a successful PR request, add needs-human-test to the triggering Issue, remove ready, and add a concise comment containing the changed behavior, verification results, remaining risk, and steps for human testing.
- If requirements are missing, tests cannot run safely, or the change would exceed the Issue, do not create a PR. Add question or blocked as appropriate, remove ready, and explain the blocker in an Issue comment.
- If no code change is needed because the Issue is already satisfied, do not create an empty PR. Comment with evidence and use noop.
- Never merge, close, assign, or mark a PR ready for review. Human review, hands-on testing, and closure remain mandatory.

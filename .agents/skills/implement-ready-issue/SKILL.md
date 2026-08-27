---
name: implement-ready-issue
description: Implement one GitHub Issue explicitly approved with the ready-for-agent label in this repository. Use for manual or scheduled Codex implementation runs that isolate the work, validate it, create a draft pull request, and hand the result back for human review without merging or closing the Issue.
---

# Implement one approved Issue

Follow `AGENTS.md` and keep every run scoped to one Issue.

## Select and claim

1. List open Issues labeled `ready-for-agent`.
2. If none exist, report a no-op. If several exist, choose the oldest by Issue creation time; do not infer priority.
3. Read the selected Issue, comments, `AGENTS.md`, related code, and existing tests.
4. Remove `ready-for-agent` and add `in-progress` immediately before beginning changes so another run cannot claim it.
5. Work on an `ai/issue-<number>` branch or isolated worktree. Do not mix unrelated changes.

## Implement and verify

- Change only what the Issue requires. Do not update dependencies, lockfiles, workflow policy, `.todo`, or unrelated code.
- Use pnpm/pnpx for TypeScript and uv for Python. Run focused tests plus the repository-required checks.
- For bug fixes and intentional behavior changes, leave a code comment explaining why the implementation is necessary.
- Record commands, results, residual risks, and the exact human verification steps.

If specifications are missing, stop and replace `in-progress` with `needs-info`. If the environment, dependency, safety boundary, or data-loss risk prevents progress, stop and replace `in-progress` with `blocked`. In either case, add a concise evidence-based Issue comment and do not open a pull request.

## Hand off

1. Create one draft pull request targeting `develop` and link the Issue without using auto-close keywords such as `Fixes` or `Closes`.
2. Include the Issue number, change summary, validation results, residual risks, and human test steps in the pull request body.
3. Replace `in-progress` with `needs-human-review` and comment on the Issue with the result and required verification.
4. Use an already-authorized GitHub connector or authenticated `gh` CLI. Never create or request an OpenAI API key or a new GitHub token.

Do not merge, close the Issue, release, deploy, or mark the work complete. A human performs the final review, hands-on test, and close decision.

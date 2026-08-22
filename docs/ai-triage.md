# Local AI todo triage

`.todo` is intentionally free-form. The local triage command asks Codex to read the notes, inspect
the repository, search existing GitHub Issues, and return a validated triage report.

The first step is always an open-and-closed Issue check. `needs-priority` Issues are not implementation
candidates, but they are still duplicate candidates and must be searched.

## Dry-run

Run this first. It does not create or edit GitHub Issues and does not modify `.todo`.

```powershell
pnpm triage:todo
```

The report is written to `debug/triage/todo-triage.json`.

## Apply

After reviewing the dry-run report, create at most three `needs-priority` Issues and append their
numbers to `.todo`:

```powershell
pnpm triage:todo -- --apply
```

Items whose intent is unclear are collected into one open `[triage] Unclear todo items` Issue with
the `needs-info` label. A successful run is the only time the command adds an
`<!-- issue: #123 -->` marker to `.todo`.

If an existing open Issue appears already fixed or no longer relevant, the report uses
`review-existing`. The command never closes it automatically. After human confirmation, close it
manually:

```powershell
gh issue close 123 --reason completed
gh issue close 124 --reason "not planned"
```

The command never selects `ready`, changes implementation state, edits source code, commits, or
pushes. Human approval is still required before implementation.

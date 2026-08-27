---
name: triage-todo
description: Triage this repository's free-form .todo notes into well-researched GitHub Issues. Use for dry-run reviews, scheduled triage, duplicate detection, missing-information follow-up, and apply runs that create or update at most three Issues while preserving the original notes.
---

# Triage `.todo`

Follow `AGENTS.md` as the repository policy and treat `.todo` as an unstructured inbox.

## Choose the mode

- Default to dry-run unless the user or Scheduled Task explicitly requests apply mode.
- In dry-run, report proposed Issue changes without modifying GitHub or `.todo`.
- In apply mode, perform only the Issue, label, comment, and `.todo` marker writes allowed below.

## Investigate

1. Read `AGENTS.md`, `.todo`, `.github/ISSUE_TEMPLATE/improvement.md`, and relevant code and tests.
2. Treat each top-level `.todo` item and its indented continuation as one complaint. Ignore operational notes that are not complaints.
3. Search open and closed Issues by title, body, source text, URL, and related terms before proposing a new Issue.
4. Preserve existing `<!-- issue: #123 -->` markers and verify that each linked Issue still represents the complaint.
5. Do not infer specifications, reproduction details, priority, or acceptance decisions that the sources do not establish.

## Classify

- Use GitHub default labels for type: `bug`, `enhancement`, `documentation`, or `question`.
- Use `duplicate` only for a strong match and identify the matching Issue.
- Add `needs-info` when essential intent, reproduction details, or expected behavior are missing.
- Do not add `ready-for-agent`; only a human grants implementation approval.
- Do not create priority labels unless a human explicitly introduces that policy.

## Apply safely

1. Create at most three new Issues in one run.
2. Write Issue titles and bodies in Japanese using the existing `[module] 日本語タイトル` convention.
3. Include symptoms, expected behavior, observations, code evidence, cause candidates, proposed direction, completion conditions, risks, the verbatim `.todo` source, and the AI disclosure from the template.
4. For unclear items, update the existing `[triage] Unclear todo items` Issue instead of creating another aggregate Issue.
5. After successfully creating an Issue, append only `<!-- issue: #123 -->` near the original `.todo` item. Do not rewrite or reorder the source text.
6. When new comments resolve a `needs-info` Issue, re-investigate it, add a concise evidence-based comment, and remove `needs-info` only when the missing information is actually resolved.
7. Use an already-authorized GitHub connector or authenticated `gh` CLI. Never create or request an OpenAI API key or a new GitHub token.

Do not modify source code, choose priority, assign people, add `ready-for-agent`, close Issues, merge pull requests, release, or deploy. If required access is unavailable, report the exact missing capability and stop.

## Report

Summarize searched duplicates, created or updated Issues, label changes, `.todo` markers, skipped items, and anything requiring human judgment.

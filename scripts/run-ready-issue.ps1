[CmdletBinding()]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$IdleBranch = "automation/ai-workspace",

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$BranchPrefix = "ai/issue-"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$startScriptPath = Join-Path $PSScriptRoot "start-ready-issue.ps1"
$logDirectory = Join-Path $repositoryRoot "debug\implementation"
$logPath = Join-Path $logDirectory "runner.log"
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Set-Location -LiteralPath $repositoryRoot

function Get-CurrentBranch {
    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Could not determine the current Git branch."
    }
    return $branch
}

function Get-IssueLabels([int]$IssueNumber) {
    $json = & gh issue view $IssueNumber --json labels
    if ($LASTEXITCODE -ne 0) {
        throw "Could not inspect labels for Issue #$IssueNumber."
    }
    return @(($json | ConvertFrom-Json).labels | ForEach-Object { $_.name })
}

$currentBranch = Get-CurrentBranch
if ($currentBranch -eq $IdleBranch) {
    # readyの選択とclaimを一箇所へ集約し、手動実行と定期実行で順序がずれないようにする。
    & $startScriptPath -IdleBranch $IdleBranch -BaseBranch $IdleBranch -BranchPrefix $BranchPrefix *>> $logPath
    if ($LASTEXITCODE -ne 0) {
        throw "Ready Issue preparation failed with exit code $LASTEXITCODE."
    }
    $currentBranch = Get-CurrentBranch
    if ($currentBranch -eq $IdleBranch) {
        Add-Content -LiteralPath $logPath -Value ("[" + (Get-Date -Format o) + "] no ready Issue")
        exit 0
    }
}

$issueBranchPattern = "^" + [regex]::Escape($BranchPrefix) + "(?<number>[1-9][0-9]*)$"
$branchMatch = [regex]::Match($currentBranch, $issueBranchPattern)
if (-not $branchMatch.Success) {
    throw "Expected '$IdleBranch' or an Issue branch beginning with '$BranchPrefix'; current branch is '$currentBranch'."
}

$issueNumber = [int]$branchMatch.Groups["number"].Value
$labels = Get-IssueLabels $issueNumber
if ($labels -notcontains "in-progress") {
    throw "Issue #$issueNumber is not labeled in-progress; refusing to modify its branch automatically."
}

$prompt = @"
You are the implementation agent for ChLens GitHub Issue #$issueNumber.

Work only in the current AI worktree and current branch. Read AGENTS.md completely, then inspect the
Issue body and comments with gh, the relevant source, and existing tests. Continue any existing work
on this branch; never reset, stash, discard, or overwrite unexplained changes.

Implement only Issue #$issueNumber. Follow the repository conventions, including intent comments for
bug fixes and deliberate code changes, strict error logging, pnpm/pnpx for TypeScript, and Vite+ checks.
Run validation proportional to the change, including vp check and vp test plus relevant tasks.

When implementation and automated validation succeed:
- Commit the intended changes using the repository's Conventional Commit style: English identifiers,
  Japanese subject and bullet-point body. Do not push, merge, deploy, or close the Issue.
- Add a Japanese Issue comment containing the implementation summary, validation results, remaining
  risks, and exact hands-on checks for a human.
- Remove in-progress and add needs-human-test only after the commit and checks succeed.

If specification, safety, data-loss risk, or the environment genuinely blocks the work, do not guess.
Leave the worktree clean, explain the blocker in a Japanese Issue comment, remove in-progress, and add
needs-info or blocked as appropriate. Do not start another Issue in this run.
"@

Add-Content -LiteralPath $logPath -Value ("[" + (Get-Date -Format o) + "] implementing Issue #$issueNumber on $currentBranch")
& codex exec --sandbox danger-full-access $prompt *>> $logPath
if ($LASTEXITCODE -ne 0) {
    throw "Codex implementation for Issue #$issueNumber failed with exit code $LASTEXITCODE; the next scheduled run will resume it."
}

$labels = Get-IssueLabels $issueNumber
$status = & git status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect the implementation worktree after Issue #$issueNumber."
}
if ($status) {
    throw "Codex finished but the worktree for Issue #$issueNumber is not clean; preserving it for the next run."
}

if ($labels -contains "needs-human-test") {
    $commitCount = [int](& git rev-list --count "$IdleBranch..HEAD")
    if ($LASTEXITCODE -ne 0 -or $commitCount -lt 1) {
        throw "Issue #$issueNumber reached needs-human-test without an implementation commit."
    }
} elseif ($labels -notcontains "blocked" -and $labels -notcontains "needs-info") {
    throw "Issue #$issueNumber did not reach needs-human-test, blocked, or needs-info; preserving its branch for retry."
}

# 完了または明示的な停止状態だけ待機ブランチへ戻し、次のready Issueを次回まで開始しない。
& git switch $IdleBranch *>> $logPath
if ($LASTEXITCODE -ne 0) {
    throw "Could not return the AI worktree to '$IdleBranch' after Issue #$issueNumber."
}
Add-Content -LiteralPath $logPath -Value ("[" + (Get-Date -Format o) + "] finished Issue #$issueNumber; returned to $IdleBranch")

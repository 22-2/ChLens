[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$IdleBranch = "automation/ai-workspace",

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$BaseBranch = "origin/develop",

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$BranchPrefix = "ai/issue-"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE"
    }
}

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $repositoryRoot

$currentBranch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "Could not determine the current Git branch."
}
if ($currentBranch -ne $IdleBranch) {
    throw "The AI worktree must be on '$IdleBranch' before selecting a ready Issue; current branch is '$currentBranch'."
}

# 未コミット作業を自動stash/resetせず、Issueの開始前に人が確認できる状態で停止する。
$status = & git status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect the AI worktree status."
}
if ($status) {
    throw "The AI worktree is not clean. Preserve or resolve the existing work before starting another Issue."
}

$issueJson = & gh issue list --state open --label ready --limit 100 --json number,title,labels
if ($LASTEXITCODE -ne 0) {
    throw "Could not list ready GitHub Issues."
}
$protectedLabels = @("in-progress", "needs-human-test", "blocked")
$issues = @($issueJson | ConvertFrom-Json)
$candidates = @(
    $issues |
        Where-Object {
            $labelNames = @($_.labels | ForEach-Object { $_.name })
            -not ($labelNames | Where-Object { $_ -in $protectedLabels })
        } |
        Sort-Object -Property number
)

if ($candidates.Count -eq 0) {
    Write-Host "No eligible ready Issues were found."
    exit 0
}

# Issue更新時刻に左右されない決定的な順序として、番号が最小のready Issueだけを開始する。
$issue = $candidates[0]
$issueNumber = [int]$issue.number
$issueBranch = "$BranchPrefix$issueNumber"
Write-Host "Selected #$issueNumber from $($candidates.Count) ready Issue(s): $($issue.title)"

if (-not $PSCmdlet.ShouldProcess("Issue #$issueNumber and branch '$issueBranch'", "Claim ready Issue and prepare AI worktree")) {
    exit 0
}

Invoke-CheckedCommand -Command "git" -Arguments @("fetch", "origin", "develop")
& git show-ref --verify --quiet "refs/heads/$issueBranch"
if ($LASTEXITCODE -eq 0) {
    throw "Local branch '$issueBranch' already exists; inspect it instead of overwriting it."
}
if ($LASTEXITCODE -ne 1) {
    throw "Could not check whether local branch '$issueBranch' exists."
}

Invoke-CheckedCommand -Command "git" -Arguments @("switch", "-c", $issueBranch, $BaseBranch)

$lockfilePath = Join-Path $repositoryRoot "pnpm-lock.yaml"
$installMarkerPath = Join-Path $repositoryRoot "node_modules\.ai-pnpm-lock.sha256"
$lockfileHash = (Get-FileHash -LiteralPath $lockfilePath -Algorithm SHA256).Hash
$installedHash = if (Test-Path -LiteralPath $installMarkerPath -PathType Leaf) {
    (Get-Content -LiteralPath $installMarkerPath -Raw).Trim()
} else {
    ""
}

if ($installedHash -ne $lockfileHash) {
    Invoke-CheckedCommand -Command "vp" -Arguments @("install")
    # node_modulesはworktree固有なので、lockfileの一致だけを記録して不要な再installを避ける。
    Set-Content -LiteralPath $installMarkerPath -Value $lockfileHash -Encoding utf8NoBOM
} else {
    Write-Host "Dependencies already match pnpm-lock.yaml; skipped vp install."
}

try {
    Invoke-CheckedCommand -Command "gh" -Arguments @(
        "issue",
        "edit",
        [string]$issueNumber,
        "--remove-label",
        "ready",
        "--add-label",
        "in-progress"
    )
} catch {
    # ラベル取得に失敗した段階ではコード変更前なので、待機ブランチへ戻して空の新規ブランチだけを回収できる。
    Invoke-CheckedCommand -Command "git" -Arguments @("switch", $IdleBranch)
    Invoke-CheckedCommand -Command "git" -Arguments @("branch", "-D", $issueBranch)
    throw
}

Write-Host "Claimed Issue #$issueNumber as in-progress."
Write-Host "Branch: $issueBranch (base: $BaseBranch)"
Write-Host "Worktree: $repositoryRoot"

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    # タスクスケジューラに登録するタスク名。削除スクリプトでも同じ名前を指定する。
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$TaskName = "chlens-ai-todo-triage",

    # 人間用タスクと同じフォルダーに固定し、古いmain worktree向けタスクとの二重実行を防ぐ。
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$TaskPath = "\my-app\",

    # .todoとpackage.jsonが存在するリポジトリのパス。省略時はこのスクリプトの親ディレクトリ。
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$RepositoryPath = (Join-Path -Path $PSScriptRoot -ChildPath ".."),

    # トリアージを繰り返す間隔（分）。5〜1440分の範囲で、既定値は30分。
    [Parameter()]
    [ValidateRange(5, 1440)]
    [int]$IntervalMinutes = 30,

    # 定期トリアージを許可するAI worktreeの待機ブランチ。Issueブランチでの実装中は処理をスキップする。
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$IdleBranch = "automation/ai-workspace",

    # 登録直後にタスクを1回だけ起動する。省略時は次のスケジュール時刻まで待つ。
    [Parameter()]
    [switch]$RunImmediately
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-PowerShellLiteral([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

$resolvedRepositoryPath = (Resolve-Path -LiteralPath $RepositoryPath).Path
$todoPath = Join-Path -Path $resolvedRepositoryPath -ChildPath ".todo"
$triageScriptPath = Join-Path -Path $resolvedRepositoryPath -ChildPath "scripts\triage-todo.ts"
$readyRunnerPath = Join-Path -Path $resolvedRepositoryPath -ChildPath "scripts\run-ready-issue.ps1"

if (-not (Test-Path -LiteralPath $todoPath -PathType Leaf)) {
    throw "The repository does not contain .todo: $resolvedRepositoryPath"
}

if (-not (Test-Path -LiteralPath $triageScriptPath -PathType Leaf)) {
    throw "The repository does not contain scripts\triage-todo.ts: $resolvedRepositoryPath"
}

$pwshCommand = Get-Command pwsh.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $pwshCommand) {
    $pwshCommand = Get-Command pwsh -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($null -eq $pwshCommand) {
    throw "PowerShell 7 (pwsh.exe) was not found in PATH."
}

# Get-Command can return every PATH match; select one so PowerShell does not stringify multiple paths as one executable name.
$pnpmCommand = Get-Command pnpm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $pnpmCommand) {
    $pnpmCommand = Get-Command pnpm.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($null -eq $pnpmCommand) {
    throw "pnpm.cmd or pnpm.exe was not found in PATH."
}

if (-not (Test-Path -LiteralPath $readyRunnerPath -PathType Leaf)) {
    throw "The repository does not contain scripts\run-ready-issue.ps1: $resolvedRepositoryPath"
}

$gitCommand = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $gitCommand) {
    $gitCommand = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($null -eq $gitCommand) {
    throw "git.exe or git was not found in PATH."
}

$logDirectory = Join-Path -Path $resolvedRepositoryPath -ChildPath "debug\triage"
$logPath = Join-Path -Path $logDirectory -ChildPath "scheduler.log"

$repositoryLiteral = ConvertTo-PowerShellLiteral $resolvedRepositoryPath
$pwshLiteral = ConvertTo-PowerShellLiteral $pwshCommand.Path
$pnpmLiteral = ConvertTo-PowerShellLiteral $pnpmCommand.Path
$gitLiteral = ConvertTo-PowerShellLiteral $gitCommand.Path
$logPathLiteral = ConvertTo-PowerShellLiteral $logPath
$idleBranchLiteral = ConvertTo-PowerShellLiteral $IdleBranch

# タスク引数にトークンを含めず、実行時のユーザー環境から読むことで、Task Schedulerの登録情報に秘密情報を残さない。
$runnerCommand = @"
Set-StrictMode -Version Latest
`$ErrorActionPreference = 'Stop'
# Task Schedulerには対話コンソールのencodingがないため、Node.jsの日本語出力をUTF-8として受け取る。
`$utf8 = [Text.UTF8Encoding]::new(`$false)
[Console]::InputEncoding = `$utf8
[Console]::OutputEncoding = `$utf8
`$OutputEncoding = `$utf8
Set-Location -LiteralPath $repositoryLiteral
New-Item -ItemType Directory -Path (Split-Path -Parent $logPathLiteral) -Force | Out-Null
Add-Content -LiteralPath $logPathLiteral -Value ("[" + (Get-Date -Format o) + "] starting AI improvement loop")
try {
    `$currentBranch = (& $gitLiteral branch --show-current).Trim()
    if (`$LASTEXITCODE -ne 0) {
        throw "git branch detection failed with exit code `$LASTEXITCODE"
    }
    if ([string]::IsNullOrWhiteSpace(`$env:GITHUB_TOKEN) -and [string]::IsNullOrWhiteSpace(`$env:GH_TOKEN)) {
        throw 'GITHUB_TOKEN or GH_TOKEN must be available in the scheduled task user environment.'
    }
    `$exitCode = 0
    if (`$currentBranch -eq $idleBranchLiteral) {
        & $pnpmLiteral triage:todo -- --apply *>> $logPathLiteral
        `$exitCode = `$LASTEXITCODE
        if (`$exitCode -ne 0) {
            throw "todo triage failed with exit code `$exitCode"
        }
        & $gitLiteral diff --quiet -- .todo
        `$todoDiffExitCode = `$LASTEXITCODE
        if (`$todoDiffExitCode -eq 1) {
            # AI専用worktreeを次のIssueブランチへ安全に切り替えられるよう、生成したIssueマーカーだけをローカル履歴へ残す。
            & $gitLiteral add -- .todo
            & $gitLiteral commit -m 'chore(workflow): todoのIssue紐付けを更新' -m '- 定期トリアージで作成または関連付けたIssue番号を記録' *>> $logPathLiteral
            if (`$LASTEXITCODE -ne 0) {
                throw "git commit for .todo failed with exit code `$LASTEXITCODE"
            }
            # .todoのIssue紐付けを人間用環境からも確認できるよう、AI運用ブランチへだけpushする。
            & $gitLiteral push origin "HEAD:$IdleBranch" *>> $logPathLiteral
            if (`$LASTEXITCODE -ne 0) {
                throw "git push for .todo failed with exit code `$LASTEXITCODE"
            }
        } elseif (`$todoDiffExitCode -ne 0) {
            throw "git diff for .todo failed with exit code `$todoDiffExitCode"
        }
    }
    # Issueブランチ上ではトリアージを行わず、前回失敗した実装だけを再開する。
    & $pwshLiteral -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts\run-ready-issue.ps1 -IdleBranch $idleBranchLiteral *>> $logPathLiteral
    `$exitCode = `$LASTEXITCODE
    if (`$exitCode -ne 0) {
        throw "ready Issue runner failed with exit code `$exitCode"
    }
} catch {
    Add-Content -LiteralPath $logPathLiteral -Value ("[" + (Get-Date -Format o) + "] failed: " + `$_.Exception.Message)
    throw
}
Add-Content -LiteralPath $logPathLiteral -Value ("[" + (Get-Date -Format o) + "] finished AI improvement loop with exit code " + `$exitCode)
exit `$exitCode
"@

# EncodedCommand avoids fragile nested quoting when a repository path contains spaces or apostrophes.
$encodedRunnerCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($runnerCommand))
$action = New-ScheduledTaskAction `
    -Execute $pwshCommand.Path `
    -Argument "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encodedRunnerCommand" `
    -WorkingDirectory $resolvedRepositoryPath

# Durationを指定しないrepetition triggerは、Task Scheduler側で無期限に繰り返される。
$trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

# IgnoreNewとtriage-todo.tsのロックを二重に設定し、スケジューラ起因の重複起動も処理側の競合も防ぐ。
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Interactiveで登録ユーザーの環境変数を利用し、トークンをTask Schedulerの資格情報へ保存しない。
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal `
    -UserId $currentUser `
    -LogonType Interactive `
    -RunLevel Limited

$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Run local AI triage and implement ready ChLens Issues in the dedicated AI worktree."

if ($PSCmdlet.ShouldProcess($TaskName, "Register or replace scheduled task")) {
    Register-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -InputObject $task -Force | Out-Null
    Write-Host "Registered scheduled task '$TaskPath$TaskName'."
    Write-Host "Repository: $resolvedRepositoryPath"
    Write-Host "Interval: every $IntervalMinutes minutes"
    Write-Host "Idle branch: $IdleBranch"
    Write-Host "Log: $logPath"

    if ($RunImmediately) {
        Start-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath
        Write-Host "Started '$TaskPath$TaskName' immediately."
    }
}

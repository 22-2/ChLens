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

    # triageスクリプトとpackage.jsonが存在するAI worktreeのパス。省略時はこのスクリプトの親ディレクトリ。
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$RepositoryPath = (Join-Path -Path $PSScriptRoot -ChildPath ".."),

    # AI worktreeとは分離して正本にする.todoのファイル。空欄なら隣のLive worktreeを使う。
    [Parameter()]
    [string]$TodoPath = "",

    # 正本.todoを置くブランチ。空欄なら登録時の現在ブランチを固定し、別ブランチへの誤pushを防ぐ。
    [Parameter()]
    [string]$TodoBranch = "",

    # scheduler・triage・実装runnerのログを置くリポジトリ。空欄なら正本.todoのリポジトリを使う。
    [Parameter()]
    [string]$LogRepositoryPath = "",

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

function ConvertTo-WindowsArgument([string]$Value) {
    return '"' + $Value.Replace('"', '\"') + '"'
}

$resolvedRepositoryPath = (Resolve-Path -LiteralPath $RepositoryPath).Path
$defaultTodoPath = Join-Path -Path (Split-Path -Parent $resolvedRepositoryPath) -ChildPath "read.crx-2\.todo"
$todoPathInput = if ([string]::IsNullOrWhiteSpace($TodoPath)) { $defaultTodoPath } else { $TodoPath }
if (-not [IO.Path]::IsPathRooted($todoPathInput)) {
    $todoPathInput = Join-Path -Path $resolvedRepositoryPath -ChildPath $todoPathInput
}
$resolvedTodoPath = (Resolve-Path -LiteralPath $todoPathInput).Path
$resolvedTodoRepositoryPath = (Resolve-Path -LiteralPath (Split-Path -Parent $resolvedTodoPath)).Path
$triageScriptPath = Join-Path -Path $resolvedRepositoryPath -ChildPath "scripts\triage-todo.ts"
$readyRunnerPath = Join-Path -Path $resolvedRepositoryPath -ChildPath "scripts\run-ready-issue.ps1"

if (-not (Test-Path -LiteralPath $resolvedTodoPath -PathType Leaf)) {
    throw "The configured todo path is not a file: $resolvedTodoPath"
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

$conhostCommand = Get-Command conhost.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $conhostCommand) {
    throw "conhost.exe was not found in PATH."
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

$todoBranchInput = if ([string]::IsNullOrWhiteSpace($TodoBranch)) {
    (& $gitCommand.Path -C $resolvedTodoRepositoryPath branch --show-current).Trim()
} else {
    $TodoBranch
}
if ([string]::IsNullOrWhiteSpace($todoBranchInput)) {
    throw "The canonical .todo repository is not on a named branch: $resolvedTodoRepositoryPath"
}

$logRepositoryPathInput = if ([string]::IsNullOrWhiteSpace($LogRepositoryPath)) {
    $resolvedTodoRepositoryPath
} else {
    $LogRepositoryPath
}
if (-not [IO.Path]::IsPathRooted($logRepositoryPathInput)) {
    $logRepositoryPathInput = Join-Path -Path $resolvedRepositoryPath -ChildPath $logRepositoryPathInput
}
$resolvedLogRepositoryPath = (Resolve-Path -LiteralPath $logRepositoryPathInput).Path
$triageLogDirectory = Join-Path -Path $resolvedLogRepositoryPath -ChildPath "debug\triage"
$implementationLogDirectory = Join-Path -Path $resolvedLogRepositoryPath -ChildPath "debug\implementation"
$logPath = Join-Path -Path $triageLogDirectory -ChildPath "scheduler.log"

$repositoryLiteral = ConvertTo-PowerShellLiteral $resolvedRepositoryPath
$pwshLiteral = ConvertTo-PowerShellLiteral $pwshCommand.Path
$pnpmLiteral = ConvertTo-PowerShellLiteral $pnpmCommand.Path
$gitLiteral = ConvertTo-PowerShellLiteral $gitCommand.Path
$logPathLiteral = ConvertTo-PowerShellLiteral $logPath
$triageLogDirectoryLiteral = ConvertTo-PowerShellLiteral $triageLogDirectory
$implementationLogDirectoryLiteral = ConvertTo-PowerShellLiteral $implementationLogDirectory
$idleBranchLiteral = ConvertTo-PowerShellLiteral $IdleBranch
$todoPathLiteral = ConvertTo-PowerShellLiteral $resolvedTodoPath
$todoRepositoryLiteral = ConvertTo-PowerShellLiteral $resolvedTodoRepositoryPath
$todoBranchLiteral = ConvertTo-PowerShellLiteral $todoBranchInput

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
    if (`$currentBranch -eq $idleBranchLiteral) {
        `$todoBranch = (& $gitLiteral -C $todoRepositoryLiteral branch --show-current).Trim()
        if (`$LASTEXITCODE -ne 0 -or `$todoBranch -ne $todoBranchLiteral) {
            throw "canonical .todo branch changed; expected $todoBranchLiteral but found '`$todoBranch'"
        }
        if ([string]::IsNullOrWhiteSpace(`$todoBranch)) {
            throw 'could not determine the branch containing the canonical .todo'
        }
    `$todoUpstream = (& $gitLiteral -C $todoRepositoryLiteral rev-parse --abbrev-ref --symbolic-full-name '@{u}').Trim()
    if (`$LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(`$todoUpstream)) {
        throw "canonical .todo branch '`$todoBranch' has no upstream; refusing to push automatically"
    }
    `$todoAheadCount = [int](& $gitLiteral -C $todoRepositoryLiteral rev-list --count "`$todoUpstream..`$todoBranch")
    if (`$LASTEXITCODE -ne 0) {
        throw "could not inspect unpushed commits for canonical .todo branch '`$todoBranch'"
    }
    if (`$todoAheadCount -gt 0) {
        `$todoUnpushedFiles = @(& $gitLiteral -C $todoRepositoryLiteral diff --name-only "`$todoUpstream..`$todoBranch")
        if (`$LASTEXITCODE -ne 0) {
            throw "could not inspect files in unpushed canonical .todo commits"
        }
        `$unexpectedUnpushedFiles = @(`$todoUnpushedFiles | Where-Object { `$_ -ne '.todo' })
        if (`$unexpectedUnpushedFiles.Count -gt 0) {
            throw "canonical .todo branch has unpushed non-todo changes: `$(`$unexpectedUnpushedFiles -join ', ')"
        }
        # 前回のpush失敗で残った.todo専用コミットは、次回のtriage前に再送して処理を継続する。
        & $gitLiteral -C $todoRepositoryLiteral push origin "HEAD:`$todoBranch" *>> $logPathLiteral
        if (`$LASTEXITCODE -ne 0) {
            throw "retry push for canonical .todo failed"
        }
    }
    `$stagedFiles = @(& $gitLiteral -C $todoRepositoryLiteral diff --cached --name-only)
    if (`$LASTEXITCODE -ne 0) {
        throw 'could not inspect staged files in the canonical .todo worktree'
    }
    `$unexpectedStagedFiles = @(`$stagedFiles | Where-Object { -not [string]::IsNullOrWhiteSpace(`$_) -and `$_ -ne '.todo' })
    if (`$unexpectedStagedFiles.Count -gt 0) {
        throw "canonical .todo worktree has unrelated staged files: `$(`$unexpectedStagedFiles -join ', ')"
    }
        `$exitCode = 0
        & $pnpmLiteral triage:todo -- --apply --todo-path $todoPathLiteral --output-dir $triageLogDirectoryLiteral *>> $logPathLiteral
        `$exitCode = `$LASTEXITCODE
        if (`$exitCode -ne 0) {
            throw "todo triage failed with exit code `$exitCode"
        }
        & $gitLiteral -C $todoRepositoryLiteral diff --quiet HEAD -- .todo
        `$todoDiffExitCode = `$LASTEXITCODE
        if (`$todoDiffExitCode -eq 1) {
            # 正本worktreeに未コミットのLiveコードがあっても、それを巻き込まず.todoだけを記録する。
            & $gitLiteral -C $todoRepositoryLiteral add -- .todo
            `$stagedFilesAfterAdd = @(& $gitLiteral -C $todoRepositoryLiteral diff --cached --name-only)
            `$unexpectedStagedFilesAfterAdd = @(`$stagedFilesAfterAdd | Where-Object { `$_ -ne '.todo' })
            if (`$unexpectedStagedFilesAfterAdd.Count -gt 0) {
                throw "canonical .todo commit would include unrelated staged files: `$(`$unexpectedStagedFilesAfterAdd -join ', ')"
            }
            & $gitLiteral -C $todoRepositoryLiteral commit -m 'chore(workflow): todoのIssue紐付けを更新' -m '- 定期トリアージで作成または関連付けたIssue番号を記録' *>> $logPathLiteral
            if (`$LASTEXITCODE -ne 0) {
                throw "git commit for .todo failed with exit code `$LASTEXITCODE"
            }
            # 正本の履歴をremoteへ残すが、未pushのLiveコードがある場合は上の事前検査で停止する。
            & $gitLiteral -C $todoRepositoryLiteral push origin "HEAD:`$todoBranch" *>> $logPathLiteral
            if (`$LASTEXITCODE -ne 0) {
                throw "git push for .todo failed with exit code `$LASTEXITCODE"
            }
        } elseif (`$todoDiffExitCode -ne 0) {
            throw "git diff for .todo failed with exit code `$todoDiffExitCode"
        }
    }
    # Issueブランチ上ではトリアージを行わず、前回失敗した実装だけを再開する。
    & $pwshLiteral -WindowStyle Hidden -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts\run-ready-issue.ps1 -IdleBranch $idleBranchLiteral -LogDirectory $implementationLogDirectoryLiteral *>> $logPathLiteral
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
# conhost --headless prevents a transient console from being created before PowerShell applies its window style.
$action = New-ScheduledTaskAction `
    -Execute $conhostCommand.Path `
    -Argument ("--headless " + (ConvertTo-WindowsArgument $pwshCommand.Path) + " -WindowStyle Hidden -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encodedRunnerCommand") `
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

# Interactiveで登録ユーザーの環境変数またはghのOS keyringを利用し、トークンをTask Schedulerの資格情報へ保存しない。
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
    Write-Host "Canonical todo: $resolvedTodoPath"
    Write-Host "Canonical todo branch: $todoBranchInput"
    Write-Host "Log repository: $resolvedLogRepositoryPath"
    Write-Host "Interval: every $IntervalMinutes minutes"
    Write-Host "Idle branch: $IdleBranch"
    Write-Host "Log: $logPath"

    if ($RunImmediately) {
        Start-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath
        Write-Host "Started '$TaskPath$TaskName' immediately."
    }
}

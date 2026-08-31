[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    # タスクスケジューラに登録するタスク名。削除スクリプトでも同じ名前を指定する。
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$TaskName = "chlens-ai-todo-triage",

    # アプリ関連タスクを同じフォルダーに集約し、手動管理時にも見つけやすくする。
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

$logDirectory = Join-Path -Path $resolvedRepositoryPath -ChildPath "debug\triage"
$logPath = Join-Path -Path $logDirectory -ChildPath "scheduler.log"

$repositoryLiteral = ConvertTo-PowerShellLiteral $resolvedRepositoryPath
$pnpmLiteral = ConvertTo-PowerShellLiteral $pnpmCommand.Path
$logPathLiteral = ConvertTo-PowerShellLiteral $logPath

# タスク引数にトークンを含めず、実行時のユーザー環境から読むことで、Task Schedulerの登録情報に秘密情報を残さない。
$runnerCommand = @"
Set-StrictMode -Version Latest
`$ErrorActionPreference = 'Stop'
# headlessタスクは従来のWindowsコードページを継承することがあるため、Codexとの日本語引数・ログをUTF-8へ固定する。
`$utf8Encoding = [Text.UTF8Encoding]::new(`$false)
`$OutputEncoding = `$utf8Encoding
[Console]::InputEncoding = `$utf8Encoding
[Console]::OutputEncoding = `$utf8Encoding
Set-Location -LiteralPath $repositoryLiteral
New-Item -ItemType Directory -Path (Split-Path -Parent $logPathLiteral) -Force | Out-Null
Add-Content -LiteralPath $logPathLiteral -Value ("[" + (Get-Date -Format o) + "] starting triage")
try {
    if ([string]::IsNullOrWhiteSpace(`$env:GITHUB_TOKEN) -and [string]::IsNullOrWhiteSpace(`$env:GH_TOKEN)) {
        throw 'GITHUB_TOKEN or GH_TOKEN must be available in the scheduled task user environment.'
    }
    & $pnpmLiteral triage:todo -- --apply *>> $logPathLiteral
    `$exitCode = `$LASTEXITCODE
} catch {
    Add-Content -LiteralPath $logPathLiteral -Value ("[" + (Get-Date -Format o) + "] failed: " + `$_.Exception.Message)
    throw
}
Add-Content -LiteralPath $logPathLiteral -Value ("[" + (Get-Date -Format o) + "] finished with exit code " + `$exitCode)
exit `$exitCode
"@

# EncodedCommand avoids fragile nested quoting when a repository path contains spaces or apostrophes.
$encodedRunnerCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($runnerCommand))
$conhostCommand = Join-Path -Path $env:WINDIR -ChildPath "System32\conhost.exe"
# PowerShellはコンソールアプリなので、-WindowStyle Hiddenだけでは起動時に一瞬表示されることがある。
# conhostのheadlessモードを前段に置き、タスク実行時のコンソール生成自体を抑止する。
$action = New-ScheduledTaskAction `
    -Execute $conhostCommand `
    -Argument "--headless `"$($pwshCommand.Path)`" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encodedRunnerCommand" `
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
    -Description "Run local AI triage for the ChLens .todo file and GitHub Issues."

if ($PSCmdlet.ShouldProcess($TaskName, "Register or replace scheduled task")) {
    Register-ScheduledTask -TaskName $TaskName -TaskPath $TaskPath -InputObject $task -Force | Out-Null
    Write-Host "Registered scheduled task '$TaskPath$TaskName'."
    Write-Host "Repository: $resolvedRepositoryPath"
    Write-Host "Interval: every $IntervalMinutes minutes"
    Write-Host "Log: $logPath"

    if ($RunImmediately) {
        Start-ScheduledTask -TaskName $TaskName
        Write-Host "Started '$TaskName' immediately."
    }
}

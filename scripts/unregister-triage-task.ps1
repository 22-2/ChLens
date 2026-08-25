[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    # 削除するタスク名。登録スクリプトと同じ名前を指定する。
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$TaskName = "chlens-ai-todo-triage",

    # 登録スクリプトと同じフォルダーを指定し、別パスの古いタスクを残さない。
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$TaskPath = "\my-app\"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
    Write-Host "Scheduled task '$TaskPath$TaskName' was not found; nothing to remove."
    exit 0
}

if ($PSCmdlet.ShouldProcess($TaskName, "Unregister scheduled task")) {
    # -Confirm:$false keeps removal scriptable while ShouldProcess still supports -WhatIf for inspection.
    Unregister-ScheduledTask -TaskPath $TaskPath -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskPath$TaskName'."
}

[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$TaskName = "ChLens AI Todo Triage"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
    Write-Host "Scheduled task '$TaskName' was not found; nothing to remove."
    exit 0
}

if ($PSCmdlet.ShouldProcess($TaskName, "Unregister scheduled task")) {
    # -Confirm:$false keeps removal scriptable while ShouldProcess still supports -WhatIf for inspection.
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'."
}

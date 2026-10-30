param(
  [Parameter(Mandatory)] [string] $Repo,
  [Parameter(Mandatory)] [string] $Workflow,
  [Parameter(Mandatory)] [string] $Asset,
  [Parameter(Mandatory)] [string] $Executable
)

$ErrorActionPreference = 'Stop'
$downloadPath = Join-Path (Split-Path -Parent $Executable) "$([guid]::NewGuid()).new"
try {
  $waitedForCi = $false
  while ($true) {
    $runsJson = gh run list --workflow ci.yml --repo $Repo --branch develop --event push --json databaseId,status,conclusion,updatedAt --limit 100
    if ($LASTEXITCODE -ne 0) { throw 'develop の CI 状態を取得できませんでした。gh auth status で認証を確認してください。' }
    $runs = @($runsJson | ConvertFrom-Json)
    $activeRuns = @($runs | Where-Object { $_.status -in @('queued', 'in_progress', 'requested', 'waiting', 'pending') })
    if ($activeRuns.Count -gt 0) {
      if (-not $waitedForCi) { Write-Host 'develop の CI が実行中です。完了を待っています...' }
      $waitedForCi = $true
      Start-Sleep -Seconds 5
      continue
    }
    $latestRun = $runs | Select-Object -First 1
    if ($null -eq $latestRun) { throw 'develop の CI 実行が見つかりません。' }
    if ($latestRun.conclusion -ne 'success') { throw "develop の CI (#$($latestRun.databaseId)) は $($latestRun.conclusion) で終了しました。" }
    break
  }

  $ciCompletedAt = [DateTimeOffset]::Parse($latestRun.updatedAt)
  while ($true) {
    $releaseJson = gh run list --workflow $Workflow --repo $Repo --event workflow_run --json databaseId,status,conclusion,createdAt --limit 20
    if ($LASTEXITCODE -ne 0) { throw '開発版ビルドの状態を取得できませんでした。' }
    $releaseRun = @($releaseJson | ConvertFrom-Json) |
      Where-Object { [DateTimeOffset]::Parse($_.createdAt) -ge $ciCompletedAt } |
      Select-Object -First 1
    if ($null -eq $releaseRun) {
      Write-Host 'CI 成功後の開発版ビルド開始を待っています...'
      Start-Sleep -Seconds 5
      continue
    }
    if ($releaseRun.status -in @('queued', 'in_progress', 'requested', 'waiting', 'pending')) {
      Write-Host '開発版をビルド中です...'
      Start-Sleep -Seconds 5
      continue
    }
    if ($releaseRun.conclusion -ne 'success') { throw "開発版ビルド (#$($releaseRun.databaseId)) は $($releaseRun.conclusion) で終了しました。" }
    break
  }

  gh release download v0.0.0-dev --repo $Repo --pattern $Asset --output $downloadPath
  if ($LASTEXITCODE -ne 0) { throw '開発版 exe のダウンロードに失敗しました。' }

  $getRunning = { @(Get-Process -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -eq $Executable } catch { $false } }) }
  $deadline = (Get-Date).AddSeconds(30)
  while ($true) {
    $running = & $getRunning
    if ($running.Count -gt 0) {
      Stop-Process -InputObject $running -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 300
    } else {
      try {
        [System.IO.File]::Move($downloadPath, $Executable, $true)
        break
      } catch [System.UnauthorizedAccessException], [System.IO.IOException] {
        if ((Get-Date) -ge $deadline) { throw "exe を置き換えられませんでした: $($_.Exception.Message)" }
        Start-Sleep -Milliseconds 500
      }
    }
    if ((Get-Date) -ge $deadline) { throw '起動中のアプリを終了できませんでした。更新を中止します。' }
  }
  Start-Process -FilePath $Executable
} finally {
  if (Test-Path -LiteralPath $downloadPath -PathType Leaf) { Remove-Item -LiteralPath $downloadPath -Force }
}

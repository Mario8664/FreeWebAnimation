param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectDir,

  [Parameter(Mandatory = $true)]
  [string]$BrowserProfileDir,

  [int]$BrowserProcessId = 0,
  [int]$ServerProcessId = 0,
  [string]$LogPath = ''
)

$ErrorActionPreference = 'Stop'

function Write-WatcherLog([string]$Message) {
  if ([string]::IsNullOrWhiteSpace($LogPath)) {
    return
  }

  $line = '[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Normalize-PathForMatch([string]$PathValue) {
  return ($PathValue.TrimEnd('\') -replace '\\', '/').ToLowerInvariant()
}

function Get-ManagedBrowserProcesses {
  $profilePath = Normalize-PathForMatch $BrowserProfileDir

  return @(
    Get-CimInstance Win32_Process |
      Where-Object {
        $_.Name -in @('chrome.exe', 'msedge.exe') -and
        -not [string]::IsNullOrWhiteSpace($_.CommandLine) -and
        (Normalize-PathForMatch $_.CommandLine).Contains($profilePath)
      }
  )
}

function Get-ProjectDevServerProcesses {
  $projectPath = Normalize-PathForMatch $ProjectDir
  $processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('cmd.exe', 'node.exe') })
  $processById = @{}

  foreach ($process in $processes) {
    $processById[[int]$process.ProcessId] = $process
  }

  $seeds = @(
    $processes | Where-Object {
      if ($_.Name -ne 'node.exe' -or [string]::IsNullOrWhiteSpace($_.CommandLine)) {
        return $false
      }

      $normalizedCommand = Normalize-PathForMatch $_.CommandLine
      return $normalizedCommand.Contains($projectPath) -and $normalizedCommand.Contains('/vite/bin/vite.js')
    }
  )

  if ($ServerProcessId -gt 0 -and $processById.ContainsKey($ServerProcessId)) {
    $seeds += $processById[$ServerProcessId]
  }

  $seenIds = New-Object 'System.Collections.Generic.HashSet[int]'
  $result = New-Object 'System.Collections.Generic.List[object]'

  foreach ($seed in $seeds) {
    $current = $seed
    while ($null -ne $current -and $current.Name -in @('cmd.exe', 'node.exe')) {
      $processId = [int]$current.ProcessId
      if ($seenIds.Add($processId)) {
        $result.Add($current) | Out-Null
      }

      $parentId = [int]$current.ParentProcessId
      if (-not $processById.ContainsKey($parentId)) {
        break
      }

      $parent = $processById[$parentId]
      if ($parent.Name -notin @('cmd.exe', 'node.exe') -or [string]::IsNullOrWhiteSpace($parent.CommandLine)) {
        break
      }

      $parentCommand = Normalize-PathForMatch $parent.CommandLine
      $isDevWrapper = $parentCommand.Contains('npm.cmd') -or
        $parentCommand.Contains('/npm-cli.js') -or
        $parentCommand.Contains(' run dev') -or
        $parentCommand.Contains('vite')

      if (-not $isDevWrapper) {
        break
      }

      $current = $parent
    }
  }

  return $result
}

function Wait-ForBrowserWindow {
  $deadline = (Get-Date).AddSeconds(15)

  while ((Get-Date) -lt $deadline) {
    $managed = @(Get-ManagedBrowserProcesses)
    if ($managed.Count -gt 0) {
      Write-WatcherLog "Detected managed browser process(es): $($managed.ProcessId -join ', ')"
      return $true
    }

    if ($BrowserProcessId -gt 0) {
      $browser = Get-Process -Id $BrowserProcessId -ErrorAction SilentlyContinue
      if ($browser) {
        return $true
      }
    }

    Start-Sleep -Milliseconds 350
  }

  return $false
}

function Test-BrowserStillOpen {
  $managed = @(Get-ManagedBrowserProcesses)
  if ($managed.Count -gt 0) {
    return $true
  }

  if ($BrowserProcessId -gt 0) {
    return $null -ne (Get-Process -Id $BrowserProcessId -ErrorAction SilentlyContinue)
  }

  return $false
}

function Stop-ProjectDevServers {
  $processes = @(Get-ProjectDevServerProcesses)
  if ($processes.Count -eq 0) {
    Write-WatcherLog 'No project dev server processes found.'
    return
  }

  Write-WatcherLog "Stopping $($processes.Count) project dev server process(es): $($processes.ProcessId -join ', ')"
  foreach ($process in $processes) {
    try {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
      Write-WatcherLog "Stopped process $($process.ProcessId)."
    } catch {
      Write-WatcherLog "Could not stop process $($process.ProcessId): $($_.Exception.Message)"
    }
  }
}

try {
  Write-WatcherLog "Watching browser profile: $BrowserProfileDir"

  if (-not (Wait-ForBrowserWindow)) {
    Write-WatcherLog 'Managed browser was not detected before timeout; stopping dev server.'
    Stop-ProjectDevServers
    exit 0
  }

  while (Test-BrowserStillOpen) {
    Start-Sleep -Seconds 1
  }

  Write-WatcherLog 'Managed browser closed.'
  Stop-ProjectDevServers
} catch {
  Write-WatcherLog "Watcher failed: $($_.Exception.Message)"
  throw
}

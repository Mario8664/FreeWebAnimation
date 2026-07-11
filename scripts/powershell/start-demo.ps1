param(
  [int]$Port = 5173,
  [switch]$KeepWindow,
  [switch]$StrictPort
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent (Split-Path -Parent $scriptDir)
$packageJson = Join-Path $projectDir 'package.json'
$nodeModules = Join-Path $projectDir 'node_modules'
$logDir = Join-Path $projectDir 'logs'
$outLog = Join-Path $logDir 'vite-dev.out.log'
$errLog = Join-Path $logDir 'vite-dev.err.log'
$watcherLog = Join-Path $logDir 'browser-watch.log'
$browserProfileDir = Join-Path $logDir 'browser-profile'
$watcherScript = Join-Path $scriptDir 'watch-browser-and-stop.ps1'
$hostName = '127.0.0.1'
$baseUrl = "http://${hostName}:${Port}/"

function Write-Step([string]$Message) {
  Write-Host "[FreeWebAnimation] $Message"
}

function Normalize-PathForMatch([string]$PathValue) {
  return ($PathValue.TrimEnd('\') -replace '\\', '/').ToLowerInvariant()
}

function Get-ProjectDevServerProcesses {
  $projectPath = Normalize-PathForMatch $projectDir
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

function Stop-ProjectDevServers {
  $processes = @(Get-ProjectDevServerProcesses)
  if ($processes.Count -eq 0) {
    Write-Step 'No existing project Vite dev server found.'
    return
  }

  Write-Step "Stopping $($processes.Count) existing project dev server process(es)."
  foreach ($process in $processes) {
    try {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
      Write-Step "Stopped process $($process.ProcessId)."
    } catch {
      Write-Warning "Could not stop process $($process.ProcessId): $($_.Exception.Message)"
    }
  }

  Start-Sleep -Milliseconds 500
}

function Get-PortListener([int]$CandidatePort) {
  return Get-NetTCPConnection `
    -LocalPort $CandidatePort `
    -State Listen `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Write-PortOwner([int]$CandidatePort, $listener) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  Write-Host ''
  Write-Host "Port $CandidatePort is occupied." -ForegroundColor Yellow
  if ($owner) {
    Write-Host "Owner process: $($owner.ProcessId)"
    Write-Host "Command line: $($owner.CommandLine)"
  }
}

function Test-PortAvailable([int]$CandidatePort) {
  return $null -eq (Get-PortListener $CandidatePort)
}

function Find-AvailablePort([int]$PreferredPort) {
  $listener = Get-PortListener $PreferredPort
  if ($null -eq $listener) {
    return $PreferredPort
  }

  Write-PortOwner $PreferredPort $listener

  if ($StrictPort) {
    Write-Host ''
    Write-Host 'This script only stops Vite dev servers launched from:'
    Write-Host $projectDir
    Write-Host 'Close the process above, or run this script with a different -Port.'
    return $null
  }

  Write-Step 'Trying the next available port.'
  for ($candidatePort = $PreferredPort + 1; $candidatePort -le $PreferredPort + 50; $candidatePort += 1) {
    if (Test-PortAvailable $candidatePort) {
      Write-Step "Using port $candidatePort."
      return $candidatePort
    }
  }

  Write-Host ''
  Write-Host "Could not find an available port between $($PreferredPort + 1) and $($PreferredPort + 50)." -ForegroundColor Red
  Write-Host 'Close an existing dev server, or run this script with a specific -Port.'
  return $null
}

function Test-ProjectViteListener {
  $projectPath = Normalize-PathForMatch $projectDir
  $listeners = @(
    Get-NetTCPConnection `
      -LocalPort $Port `
      -State Listen `
      -ErrorAction SilentlyContinue
  )

  foreach ($listener in $listeners) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($null -eq $owner -or [string]::IsNullOrWhiteSpace($owner.CommandLine)) {
      continue
    }

    $ownerCommand = Normalize-PathForMatch $owner.CommandLine
    if ($ownerCommand.Contains($projectPath) -and $ownerCommand.Contains('/vite/bin/vite.js')) {
      return $true
    }
  }

  return $false
}

function Get-HttpText([string]$Url) {
  try {
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Method = 'GET'
    $request.Timeout = 2000
    $request.ReadWriteTimeout = 2000
    $request.CachePolicy = New-Object System.Net.Cache.RequestCachePolicy([System.Net.Cache.RequestCacheLevel]::NoCacheNoStore)

    $response = $request.GetResponse()
    try {
      $statusCode = [int]$response.StatusCode
      if ($statusCode -lt 200 -or $statusCode -ge 300) {
        return $null
      }

      $stream = $response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      try {
        return $reader.ReadToEnd()
      } finally {
        $reader.Close()
      }
    } finally {
      $response.Close()
    }
  } catch [System.Net.WebException] {
    if ($_.Exception.Response -ne $null) {
      $response = $_.Exception.Response
      try {
        return $null
      } finally {
        $response.Close()
      }
    }
  } catch {
  }

  return $null
}

function Test-ProjectSourceReady {
  $sourceUrl = '{0}src/pages/index.ts?t={1}' -f $baseUrl, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $sourceText = Get-HttpText $sourceUrl
  if ([string]::IsNullOrWhiteSpace($sourceText)) {
    return $false
  }

  return $sourceText.Contains('pbr-showcase') -and $sourceText.Contains('PbrShowcasePage')
}

function Wait-ForServer {
  $deadline = (Get-Date).AddSeconds(20)

  while ((Get-Date) -lt $deadline) {
    if ((Test-ProjectViteListener) -and (Test-ProjectSourceReady)) {
      return $true
    }

    Start-Sleep -Milliseconds 350
  }

  return $false
}

function Find-BrowserExecutable {
  $candidates = @()

  if ($env:ProgramFiles) {
    $candidates += Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
    $candidates += Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'
  }

  if (${env:ProgramFiles(x86)}) {
    $candidates += Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'
    $candidates += Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
  }

  if ($env:LocalAppData) {
    $candidates += Join-Path $env:LocalAppData 'Google\Chrome\Application\chrome.exe'
    $candidates += Join-Path $env:LocalAppData 'Microsoft\Edge\Application\msedge.exe'
  }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  foreach ($commandName in @('chrome.exe', 'msedge.exe')) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  return $null
}

function Start-ManagedBrowser([string]$Url) {
  $browser = Find-BrowserExecutable
  if ($null -eq $browser) {
    return $null
  }

  New-Item -ItemType Directory -Force -Path $browserProfileDir | Out-Null

  $arguments = @(
    "--user-data-dir=`"$browserProfileDir`"",
    "--app=`"$Url`"",
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-mode'
  )

  return Start-Process `
    -FilePath $browser `
    -ArgumentList $arguments `
    -PassThru
}

function Start-BrowserCloseWatcher([int]$BrowserProcessId, [int]$ServerProcessId) {
  if (-not (Test-Path -LiteralPath $watcherScript)) {
    Write-Warning "Cannot find browser watcher: $watcherScript"
    return
  }

  $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -ProjectDir "{1}" -BrowserProfileDir "{2}" -BrowserProcessId {3} -ServerProcessId {4} -LogPath "{5}"' -f
    $watcherScript,
    $projectDir,
    $browserProfileDir,
    $BrowserProcessId,
    $ServerProcessId,
    $watcherLog

  Start-Process `
    -FilePath 'powershell.exe' `
    -ArgumentList $arguments `
    -WindowStyle Hidden | Out-Null
}

if (-not (Test-Path $packageJson)) {
  Write-Host "Cannot find $packageJson." -ForegroundColor Red
  Write-Host 'Please keep this script in the FreeWebAnimation root folder.'
  exit 1
}

Stop-ProjectDevServers

$resolvedPort = Find-AvailablePort $Port
if ($null -eq $resolvedPort) {
  exit 1
}
$Port = $resolvedPort
$baseUrl = "http://${hostName}:${Port}/"

if (-not (Test-Path $nodeModules)) {
  Write-Step 'Installing dependencies because node_modules is missing.'
  Push-Location $projectDir
  try {
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } finally {
    Pop-Location
  }
}

New-Item -ItemType Directory -Force $logDir | Out-Null
Remove-Item -LiteralPath $outLog, $errLog -ErrorAction SilentlyContinue

$arguments = @(
  '/d',
  '/s',
  '/c',
  ('call "{0}" run dev -- --host {1} --port {2} --strictPort 1> "{3}" 2> "{4}"' -f
    (Get-Command npm.cmd -ErrorAction Stop).Source,
    $hostName,
    $Port,
    $outLog,
    $errLog)
)

Write-Step "Starting Vite at $baseUrl"
$windowStyle = if ($KeepWindow) { 'Normal' } else { 'Hidden' }
$process = Start-Process `
  -FilePath $env:ComSpec `
  -ArgumentList $arguments `
  -WorkingDirectory $projectDir `
  -WindowStyle $windowStyle `
  -PassThru

if (-not (Wait-ForServer)) {
  Write-Host "Vite did not become ready at $baseUrl." -ForegroundColor Red
  Write-Host "Process id: $($process.Id)"
  Write-Host "Stdout log: $outLog"
  Write-Host "Stderr log: $errLog"
  if (Test-Path $errLog) {
    Get-Content $errLog -Tail 40
  }
  exit 1
}

$openUrl = '{0}?t={1}' -f $baseUrl, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Write-Step "Opening $openUrl"
try {
  $browserProcess = Start-ManagedBrowser $openUrl
  if ($null -eq $browserProcess) {
    Start-Process $openUrl
    Write-Warning 'Could not find Chrome or Edge for managed auto-stop. Close this project with Task Manager or restart using a supported browser.'
  } else {
    Start-BrowserCloseWatcher $browserProcess.Id $process.Id
    Write-Step 'Close the demo browser window to stop this project dev server.'
  }
} catch {
  Write-Warning "Could not open the browser automatically: $($_.Exception.Message)"
  Write-Host 'Open this URL manually:'
  Write-Host $openUrl
}
Write-Step "Dev server process id: $($process.Id)"
Write-Step "Logs: $outLog"
Write-Step "Browser watcher log: $watcherLog"

exit 0

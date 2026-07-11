param(
  [string]$Name = '',
  [string]$Target = '',
  [switch]$SkipInstall,
  [switch]$NoUi
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$templateRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)

function Normalize-PathForCompare([string]$PathValue) {
  $resolved = [System.IO.Path]::GetFullPath($PathValue)
  return $resolved.TrimEnd('\').ToLowerInvariant()
}

function ConvertTo-PackageName([string]$ProjectName) {
  $name = $ProjectName.Trim().ToLowerInvariant()
  $name = $name -replace '[^a-z0-9._~-]+', '-'
  $name = $name.Trim('-')

  if ([string]::IsNullOrWhiteSpace($name)) {
    return 'free-web-animation-project'
  }

  return $name
}

function Set-Utf8NoBomContent([string]$PathValue, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($PathValue, $Content, $encoding)
}

function Get-Utf8Content([string]$PathValue) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  return [System.IO.File]::ReadAllText($PathValue, $encoding)
}

function Test-InvalidFileName([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $true
  }

  return $Value.IndexOfAny([System.IO.Path]::GetInvalidFileNameChars()) -ge 0
}

function Test-DirectoryEmptyOrMissing([string]$PathValue) {
  if (-not (Test-Path -LiteralPath $PathValue)) {
    return $true
  }

  $children = @(Get-ChildItem -LiteralPath $PathValue -Force -ErrorAction SilentlyContinue)
  return $children.Count -eq 0
}

function Test-ExcludedFile([string]$NameValue) {
  if ($NameValue -in @('create-project.bat', 'create-project.ps1')) {
    return $true
  }

  if ($NameValue -like '*.log' -or $NameValue -like '*.local') {
    return $true
  }

  return $false
}

function Test-ScaffoldLauncherFile([System.IO.FileInfo]$File) {
  if ($File.Extension -ne '.bat') {
    return $false
  }

  try {
    $text = Get-Content -Raw -LiteralPath $File.FullName
    return $text.ToLowerInvariant().Contains('create-project')
  } catch {
    return $false
  }
}

function Copy-TemplateTree([string]$Source, [string]$Destination) {
  $excludedDirectories = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach ($directoryName in @('.git', 'node_modules', 'dist', 'dist-ssr', 'logs', '.export-frames', 'output', 'verification')) {
    $excludedDirectories.Add($directoryName) | Out-Null
  }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  foreach ($item in Get-ChildItem -LiteralPath $Source -Force) {
    if ($item.PSIsContainer) {
      if ($excludedDirectories.Contains($item.Name)) {
        continue
      }

      Copy-TemplateTree $item.FullName (Join-Path $Destination $item.Name)
      continue
    }

    if (Test-ExcludedFile $item.Name) {
      continue
    }

    if (Test-ScaffoldLauncherFile $item) {
      continue
    }

    Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $Destination $item.Name) -Force
  }
}

function Remove-GeneratedProjectScaffoldDocs([string]$ProjectRoot) {
  $readmePath = Join-Path $ProjectRoot 'README.md'
  if (-not (Test-Path -LiteralPath $readmePath)) {
    return
  }

  $readme = Get-Utf8Content $readmePath
  $readme = [regex]::Replace(
    $readme,
    '(?ms)^## (?:Create A New Project|\u521b\u5efa\u65b0\u9879\u76ee)\r?\n.*?(?=^## (?:Start|\u542f\u52a8)\r?\n)',
    ''
  )

  Set-Utf8NoBomContent $readmePath $readme
}

function Update-ProjectPackageName([string]$ProjectRoot, [string]$ProjectName) {
  $packageName = ConvertTo-PackageName $ProjectName
  $packagePath = Join-Path $ProjectRoot 'package.json'
  $lockPath = Join-Path $ProjectRoot 'package-lock.json'

  if (Test-Path -LiteralPath $packagePath) {
    $package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
    $package.name = $packageName
    Set-Utf8NoBomContent $packagePath ($package | ConvertTo-Json -Depth 100)
  }

  if (Test-Path -LiteralPath $lockPath) {
    $lockText = Get-Content -Raw -LiteralPath $lockPath
    $replacement = '$1"' + $packageName + '"'
    $lockText = [regex]::Replace($lockText, '("name"\s*:\s*)"[^"]+"', $replacement, 2)
    Set-Utf8NoBomContent $lockPath $lockText
  }
}

function Install-ProjectDependencies([string]$ProjectRoot) {
  Push-Location $ProjectRoot
  try {
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) {
      throw "npm install failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function New-FreeWebAnimationProject([string]$ProjectName, [string]$Destination, [bool]$InstallDependencies) {
  if (Test-InvalidFileName $ProjectName) {
    throw 'Project name is empty or contains invalid file name characters.'
  }

  $templatePath = Normalize-PathForCompare $templateRoot
  $destinationPath = Normalize-PathForCompare $Destination
  if ($destinationPath -eq $templatePath -or $destinationPath.StartsWith("$templatePath\")) {
    throw 'Destination cannot be the template folder or a folder inside it.'
  }

  if (-not (Test-DirectoryEmptyOrMissing $Destination)) {
    throw 'Destination folder already exists and is not empty.'
  }

  Copy-TemplateTree $templateRoot $Destination
  Update-ProjectPackageName $Destination $ProjectName
  Remove-GeneratedProjectScaffoldDocs $Destination

  if ($InstallDependencies) {
    Install-ProjectDependencies $Destination
  }
}

function Show-CreateProjectWindow {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  [System.Windows.Forms.Application]::EnableVisualStyles()

  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'Create FreeWebAnimation Project'
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.MaximizeBox = $false
  $form.MinimizeBox = $false
  $form.ClientSize = New-Object System.Drawing.Size(640, 310)

  $labelProjectName = New-Object System.Windows.Forms.Label
  $labelProjectName.Text = 'Project name'
  $labelProjectName.Location = New-Object System.Drawing.Point(24, 24)
  $labelProjectName.Size = New-Object System.Drawing.Size(120, 22)
  $form.Controls.Add($labelProjectName)

  $projectNameBox = New-Object System.Windows.Forms.TextBox
  $projectNameBox.Location = New-Object System.Drawing.Point(160, 22)
  $projectNameBox.Size = New-Object System.Drawing.Size(440, 24)
  $projectNameBox.Text = 'MyAnimationProject'
  $form.Controls.Add($projectNameBox)

  $labelParent = New-Object System.Windows.Forms.Label
  $labelParent.Text = 'Parent folder'
  $labelParent.Location = New-Object System.Drawing.Point(24, 66)
  $labelParent.Size = New-Object System.Drawing.Size(120, 22)
  $form.Controls.Add($labelParent)

  $parentBox = New-Object System.Windows.Forms.TextBox
  $parentBox.Location = New-Object System.Drawing.Point(160, 64)
  $parentBox.Size = New-Object System.Drawing.Size(350, 24)
  $parentBox.Text = Split-Path -Parent $templateRoot
  $form.Controls.Add($parentBox)

  $browseButton = New-Object System.Windows.Forms.Button
  $browseButton.Text = 'Browse...'
  $browseButton.Location = New-Object System.Drawing.Point(522, 62)
  $browseButton.Size = New-Object System.Drawing.Size(78, 28)
  $form.Controls.Add($browseButton)

  $createSubfolderCheck = New-Object System.Windows.Forms.CheckBox
  $createSubfolderCheck.Text = 'Create a folder using the project name'
  $createSubfolderCheck.Location = New-Object System.Drawing.Point(160, 102)
  $createSubfolderCheck.Size = New-Object System.Drawing.Size(310, 24)
  $createSubfolderCheck.Checked = $true
  $form.Controls.Add($createSubfolderCheck)

  $installCheck = New-Object System.Windows.Forms.CheckBox
  $installCheck.Text = 'Run npm install after creating'
  $installCheck.Location = New-Object System.Drawing.Point(160, 130)
  $installCheck.Size = New-Object System.Drawing.Size(260, 24)
  $installCheck.Checked = $true
  $form.Controls.Add($installCheck)

  $labelDestination = New-Object System.Windows.Forms.Label
  $labelDestination.Text = 'Destination'
  $labelDestination.Location = New-Object System.Drawing.Point(24, 172)
  $labelDestination.Size = New-Object System.Drawing.Size(120, 22)
  $form.Controls.Add($labelDestination)

  $destinationBox = New-Object System.Windows.Forms.TextBox
  $destinationBox.Location = New-Object System.Drawing.Point(160, 170)
  $destinationBox.Size = New-Object System.Drawing.Size(440, 24)
  $destinationBox.ReadOnly = $true
  $form.Controls.Add($destinationBox)

  $statusLabel = New-Object System.Windows.Forms.Label
  $statusLabel.Text = ''
  $statusLabel.Location = New-Object System.Drawing.Point(24, 214)
  $statusLabel.Size = New-Object System.Drawing.Size(576, 24)
  $form.Controls.Add($statusLabel)

  $createButton = New-Object System.Windows.Forms.Button
  $createButton.Text = 'Create'
  $createButton.Location = New-Object System.Drawing.Point(424, 254)
  $createButton.Size = New-Object System.Drawing.Size(84, 32)
  $form.Controls.Add($createButton)

  $cancelButton = New-Object System.Windows.Forms.Button
  $cancelButton.Text = 'Cancel'
  $cancelButton.Location = New-Object System.Drawing.Point(516, 254)
  $cancelButton.Size = New-Object System.Drawing.Size(84, 32)
  $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
  $form.CancelButton = $cancelButton
  $form.Controls.Add($cancelButton)

  function Get-DestinationPreview {
    if ($createSubfolderCheck.Checked) {
      return Join-Path $parentBox.Text $projectNameBox.Text
    }

    return $parentBox.Text
  }

  function Update-DestinationPreview {
    try {
      $destinationBox.Text = Get-DestinationPreview
    } catch {
      $destinationBox.Text = ''
    }
  }

  $projectNameBox.Add_TextChanged({ Update-DestinationPreview })
  $parentBox.Add_TextChanged({ Update-DestinationPreview })
  $createSubfolderCheck.Add_CheckedChanged({ Update-DestinationPreview })

  $browseButton.Add_Click({
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = 'Choose a parent folder for the new project.'
    $dialog.SelectedPath = $parentBox.Text
    $dialog.ShowNewFolderButton = $true

    if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
      $parentBox.Text = $dialog.SelectedPath
    }
  })

  $createButton.Add_Click({
    $projectName = $projectNameBox.Text.Trim()
    $destination = $destinationBox.Text.Trim()

    try {
      $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
      $createButton.Enabled = $false
      $cancelButton.Enabled = $false
      $statusLabel.Text = 'Creating project...'
      $form.Refresh()

      New-FreeWebAnimationProject $projectName $destination $installCheck.Checked

      $statusLabel.Text = 'Project created.'
      [System.Windows.Forms.MessageBox]::Show(
        $form,
        "Project created:`r`n$destination",
        'FreeWebAnimation',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
      ) | Out-Null

      Start-Process $destination
      $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
      $form.Close()
    } catch {
      $statusLabel.Text = ''
      [System.Windows.Forms.MessageBox]::Show(
        $form,
        $_.Exception.Message,
        'Could not create project',
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
      ) | Out-Null
    } finally {
      $form.Cursor = [System.Windows.Forms.Cursors]::Default
      $createButton.Enabled = $true
      $cancelButton.Enabled = $true
    }
  })

  Update-DestinationPreview
  [void]$form.ShowDialog()
}

if ($NoUi -or (-not [string]::IsNullOrWhiteSpace($Name) -and -not [string]::IsNullOrWhiteSpace($Target))) {
  if ([string]::IsNullOrWhiteSpace($Name) -or [string]::IsNullOrWhiteSpace($Target)) {
    throw 'Both -Name and -Target are required when running without the UI.'
  }

  New-FreeWebAnimationProject $Name $Target (-not $SkipInstall)
  Write-Host "Created project at $Target"
  exit 0
}

Show-CreateProjectWindow

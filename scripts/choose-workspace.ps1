<#
.SYNOPSIS
  Picks the backend's workspace folder (POLE_VIEWER_WORKSPACE_ROOT) before
  start-servers.bat / start-backend.bat launch it.

.DESCRIPTION
  Shows a small window listing recently used workspace folders, with
  Browse... to add another and "Default" for the repo's own
  backend\workspace. The choice is written to workspace-root.local.txt
  (read by the launch scripts; absent = default) and remembered at the top
  of workspace-roots-recent.local.txt. Both files sit in the repo root and
  are gitignored -- they name real folders on this machine.

  Exit code 0 = a folder was chosen (its path, or "" for the default, is
  printed); 1 = cancelled.

.PARAMETER RepoRoot
  The repo root (the launch scripts pass their own folder).

.PARAMETER Path
  Choose this folder without showing the window ("default" for the
  repo's backend\workspace) -- for scripting and tests.
#>
param(
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [string]$Path
)

$ErrorActionPreference = "Stop"
# The launch scripts pass "<repo>\." -- a bare trailing backslash would escape the closing quote.
$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\', '/')
$currentFile = Join-Path $RepoRoot "workspace-root.local.txt"
$recentFile = Join-Path $RepoRoot "workspace-roots-recent.local.txt"
$defaultWorkspace = Join-Path $RepoRoot "backend\workspace"
$maxRecent = 12
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Lines([string]$file) {
  if (-not (Test-Path -LiteralPath $file)) { return @() }
  return @([System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8) |
      ForEach-Object { $_.Trim([char]0xFEFF).Trim() } | Where-Object { $_ })
}

function Save-Choice([string]$folder) {
  if ($folder) {
    [System.IO.File]::WriteAllText($currentFile, $folder, $utf8NoBom)
    $recent = @($folder) + @(Read-Lines $recentFile | Where-Object { $_ -ne $folder }) | Select-Object -First $maxRecent
    [System.IO.File]::WriteAllLines($recentFile, [string[]]$recent, $utf8NoBom)
  } elseif (Test-Path -LiteralPath $currentFile) {
    # Default workspace: no override file at all, so the backend falls back to backend\workspace.
    Remove-Item -LiteralPath $currentFile
  }
  Write-Output $folder
}

$current = @(Read-Lines $currentFile) | Select-Object -First 1

# --- Non-interactive ---------------------------------------------------
if ($PSBoundParameters.ContainsKey("Path")) {
  if ($Path -eq "default") { Save-Choice ""; exit 0 }
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    [Console]::Error.WriteLine("Not a folder: $Path")
    exit 2
  }
  Save-Choice ((Resolve-Path -LiteralPath $Path).ProviderPath.TrimEnd('\')); exit 0
}

# --- Window ------------------------------------------------------------
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$DEFAULT_LABEL = "(Default)  $defaultWorkspace"
$recent = @(Read-Lines $recentFile)
if ($current -and ($recent -notcontains $current)) { $recent = @($current) + $recent }

$form = New-Object System.Windows.Forms.Form
$form.Text = "Pole Viewer - workspace folder"
$form.Size = New-Object System.Drawing.Size(720, 380)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$form.MinimumSize = New-Object System.Drawing.Size(520, 300)

$label = New-Object System.Windows.Forms.Label
$label.Text = "Folder the backend may read .pol, .las and CSV files from. Paths in the line CSV must be inside it (absolute, or relative to it)."
$label.Location = New-Object System.Drawing.Point(12, 10)
$label.Size = New-Object System.Drawing.Size(680, 36)
$label.Anchor = "Top, Left, Right"
$form.Controls.Add($label)

$list = New-Object System.Windows.Forms.ListBox
$list.Location = New-Object System.Drawing.Point(12, 50)
$list.Size = New-Object System.Drawing.Size(680, 220)
$list.Anchor = "Top, Bottom, Left, Right"
$list.HorizontalScrollbar = $true
foreach ($r in $recent) {
  $list.Items.Add($(if (Test-Path -LiteralPath $r -PathType Container) { $r } else { "$r   [not found]" })) | Out-Null
}
$list.Items.Add($DEFAULT_LABEL) | Out-Null
$list.SelectedIndex = if ($current) { [Math]::Max(0, [Array]::IndexOf($recent, $current)) } else { $list.Items.Count - 1 }
$form.Controls.Add($list)

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(12, 278)
$status.Size = New-Object System.Drawing.Size(420, 40)
$status.Anchor = "Bottom, Left, Right"
$status.ForeColor = [System.Drawing.Color]::DimGray
$status.Text = if ($current) { "Current: $current" } else { "Current: default (backend\workspace)" }
$form.Controls.Add($status)

function Add-Button([string]$text, [int]$x) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text
  $b.Location = New-Object System.Drawing.Point($x, 285)
  $b.Size = New-Object System.Drawing.Size(84, 28)
  $b.Anchor = "Bottom, Right"
  $form.Controls.Add($b)
  return $b
}
$browse = Add-Button "Browse..." 436
$start = Add-Button "Start" 524
$cancel = Add-Button "Cancel" 612
$form.AcceptButton = $start
$form.CancelButton = $cancel

$browse.Add_Click({
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = "Choose the workspace folder"
    $dialog.ShowNewFolderButton = $false
    $sel = [string]$list.SelectedItem
    if ($sel -and $sel -ne $DEFAULT_LABEL -and (Test-Path -LiteralPath ($sel -replace '   \[not found\]$', ''))) { $dialog.SelectedPath = $sel }
    if ($dialog.ShowDialog($form) -eq "OK") {
      $picked = $dialog.SelectedPath.TrimEnd('\')
      $existing = [Array]::IndexOf(@($list.Items), $picked)
      if ($existing -ge 0) { $list.SelectedIndex = $existing }
      else { $list.Items.Insert(0, $picked); $list.SelectedIndex = 0 }
    }
  })

$script:chosen = $null
$start.Add_Click({
    $sel = [string]$list.SelectedItem
    if (-not $sel) { return }
    if ($sel -eq $DEFAULT_LABEL) { $script:chosen = ""; $form.Close(); return }
    $folder = $sel -replace '   \[not found\]$', ''
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) {
      [System.Windows.Forms.MessageBox]::Show($form, "Folder not found:`n$folder", "Pole Viewer", "OK", "Warning") | Out-Null
      return
    }
    $script:chosen = $folder
    $form.Close()
  })
$list.Add_DoubleClick({ $start.PerformClick() })
$cancel.Add_Click({ $form.Close() })

# Launched from a .bat, the window can open behind others -- bring it to the front once, then behave normally.
$form.TopMost = $true
$form.Add_Shown({ $form.Activate(); $form.TopMost = $false })
[void]$form.ShowDialog()

if ($null -eq $script:chosen) { exit 1 }
Save-Choice $script:chosen
exit 0

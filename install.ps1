[CmdletBinding()]
param(
  [string]$RepoUrl = "https://github.com/YOUR-USERNAME/opencode-websearch-override.git",
  [switch]$NoAutoUpdate,
  [string]$TargetDir
)

$ErrorActionPreference = "Stop"

$markerStart = "<!-- opencode-websearch-override:start -->"
$markerEnd = "<!-- opencode-websearch-override:end -->"

if ($TargetDir) {
    $ocDir = $TargetDir
} else {
    $ocDir = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".config\opencode"
}
$repoDir = Join-Path $ocDir "websearch-override"

Write-Host "== opencode-websearch-override installer ==" -ForegroundColor Cyan
Write-Host "Target: $ocDir"

$isLocalSource = Test-Path (Join-Path $PSScriptRoot "tools\websearch.ts")
if ($isLocalSource) {
    Write-Host "[1/5] Source: local copy at $PSScriptRoot"
    $srcTools = Join-Path $PSScriptRoot "tools\websearch.ts"
    $srcPlugin = Join-Path $PSScriptRoot "plugins\websearch-autoupdate.ts"
    $srcPolicy = Join-Path $PSScriptRoot "AGENTS-policy.md"
} else {
    if (-not $RepoUrl -or $RepoUrl -like "*YOUR-USERNAME*") {
        throw "RepoUrl is not set. Either run this script from a clone of the repo, or pass -RepoUrl <url>."
    }
    if (Test-Path (Join-Path $repoDir ".git")) {
        Write-Host "[1/5] Updating existing clone at $repoDir"
        git -C $repoDir pull --ff-only --quiet
    } else {
        Write-Host "[1/5] Cloning $RepoUrl -> $repoDir"
        git clone --depth 1 --quiet $RepoUrl $repoDir
    }
    $srcTools = Join-Path $repoDir "tools\websearch.ts"
    $srcPlugin = Join-Path $repoDir "plugins\websearch-autoupdate.ts"
    $srcPolicy = Join-Path $repoDir "AGENTS-policy.md"
}

if (-not (Test-Path $srcTools)) { throw "Tool file not found at $srcTools" }

New-Item -ItemType Directory -Force -Path (Join-Path $ocDir "tools") | Out-Null

Copy-Item $srcTools (Join-Path $ocDir "tools\websearch.ts") -Force
Write-Host "[2/5] Installed tool -> tools\websearch.ts"

$agentsPath = Join-Path $ocDir "AGENTS.md"
$policyContent = (Get-Content $srcPolicy -Raw).Trim()
$block = "$markerStart`n`n$policyContent`n`n$markerEnd"

if (-not (Test-Path $agentsPath)) {
    Set-Content -Path $agentsPath -Value "# Global agent rules`n`n$block`n" -Encoding UTF8
    Write-Host "[3/5] Created AGENTS.md with search policy"
} elseif ((Get-Content $agentsPath -Raw) -notlike "*$markerStart*") {
    Add-Content -Path $agentsPath -Value "`n$block`n" -Encoding UTF8
    Write-Host "[3/5] Appended search policy to existing AGENTS.md"
} else {
    Write-Host "[3/5] AGENTS.md already contains policy block, skipping"
}

$keysPath = Join-Path $ocDir "websearch.json"
if (Test-Path $keysPath) {
    Write-Host "[4/5] websearch.json exists, left untouched"
} else {
    Copy-Item (Join-Path (Get-Item $srcTools).Directory.Parent.FullName "websearch.example.json") $keysPath
    Write-Host "[4/5] Seeded websearch.json from template - EDIT IT to add your API keys" -ForegroundColor Yellow
}

$pluginDst = Join-Path $ocDir "plugins\websearch-autoupdate.ts"
if ($NoAutoUpdate) {
    if (Test-Path $pluginDst) { Remove-Item $pluginDst }
    Write-Host "[5/5] Auto-update disabled by switch (plugin removed if present)"
} else {
    New-Item -ItemType Directory -Force -Path (Join-Path $ocDir "plugins") | Out-Null
    Copy-Item $srcPlugin $pluginDst -Force
    Write-Host "[5/5] Installed auto-update plugin (checks GitHub every 6h; remove plugins\websearch-autoupdate.ts to disable)"
}

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  1. Edit $keysPath and paste your serper / tavily API keys (empty = tier disabled)"
Write-Host "  2. Restart opencode"
Write-Host "  3. Ask your agent to search something"

<#
Render manifest import helper (PowerShell)

This script does the following:
 1) Ensures `render.yaml` exists at repo root and pushes the current branch (like the safe helper)
 2) Prepares an authenticated POST request to Render's API to import the manifest
 3) By default it only prints the prepared request (dry-run). Use -Execute to actually call the API.

Notes:
 - You must supply `RENDER_API_KEY` either as an environment variable or via the -ApiKey parameter.
 - Render's API surface can change. This script prepares a reasonable payload and will attempt the POST, but if Render's production API requires a different endpoint or additional fields the call may fail. In that case the script prints full details so you can copy/paste and adjust.
 - This script is intended to be run locally by you (it requires your API key and git credentials).

Usage examples:
  # Dry-run (prepare + push branch, but do NOT call Render API)
  .\scripts\render_import_api.ps1

  # Dry-run specifying branch
  .\scripts\render_import_api.ps1 -Branch main

  # Execute the API call (will perform POST)
  .\scripts\render_import_api.ps1 -Execute

  # Pass API key on the command line (safer to set env RENDER_API_KEY)
  .\scripts\render_import_api.ps1 -Execute -ApiKey "your_render_api_key_here"
#>
param(
    [string]$Branch,
    [switch]$Execute,
    [string]$ApiKey
)

function Fail([string]$msg) {
    Write-Host $msg -ForegroundColor Red
    exit 1
}

# repo root detection
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..").Path
Set-Location $root

# Determine branch
if (-not $Branch) {
    $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
}
Write-Host "Using branch: $Branch"

if (-not (Test-Path "render.yaml")) {
    Fail "render.yaml not found at repo root. Please add it before running this script."
}

# Push branch to origin
Write-Host "Ensuring branch is pushed to origin/$Branch..."
git fetch origin

# Stage render.yaml and commit if changed
git add render.yaml
$staged = git diff --cached --name-only | Out-String
if ($staged -and $staged.Trim().Length -gt 0) {
    git commit -m "chore: add/update render.yaml manifest for Render"
    Write-Host "Committed render.yaml"
} else {
    Write-Host "No changes staged for commit (render.yaml unchanged)."
}

Write-Host "Pushing to origin/$Branch..."
git push origin $Branch
if ($LASTEXITCODE -ne 0) {
    Fail "git push failed. Fix any auth issues and try again."
}
Write-Host "Pushed branch $Branch to origin."

# Obtain API key
if (-not $ApiKey) {
    if ($env:RENDER_API_KEY) { $ApiKey = $env:RENDER_API_KEY }
}
if (-not $ApiKey) {
    $ApiKey = Read-Host -AsSecureString "Render API Key (input hidden)"
    if ($ApiKey -is [System.Security.SecureString]) {
        $Bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($ApiKey)
        try { $ApiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($Bstr) }
        finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr) }
    }
}
if (-not $ApiKey) { Fail "No Render API key provided. Set environment variable RENDER_API_KEY or pass -ApiKey." }

# Prepare payload
$manifest = Get-Content -Raw -Path "render.yaml"
# Basic sanitize for JSON embedding
$manifestJsonSafe = $manifest -replace "`r`n","\n"

# Attempt to detect repo path from git remote
$remoteUrl = git config --get remote.origin.url
$repoPath = $null
if ($remoteUrl -match "git@github.com:(.+)\\.git") { $repoPath = $Matches[1] }
elseif ($remoteUrl -match "https://github.com/(.+)\\.git") { $repoPath = $Matches[1] }
else { $repoPath = $remoteUrl }

$payload = @{
    repository = $repoPath
    branch = $Branch
    manifest = $manifest
} | ConvertTo-Json -Depth 10

# Display dry-run info
Write-Host "--- Render import dry-run ---`n"
Write-Host "Repository: $repoPath"
Write-Host "Branch: $Branch`n"
Write-Host "Prepared payload (truncated):"
Write-Host ($payload.Substring(0,[Math]::Min(1000,$payload.Length)))
Write-Host "`nIf you run with -Execute the script will attempt to POST this JSON to Render's API using your API key.`n"

# Show curl command for manual execution
$curlExample = "curl -X POST https://api.render.com/v1/blueprints/import -H \"Authorization: Bearer <RENDER_API_KEY>\" -H \"Content-Type: application/json\" -d '@payload.json'"
Write-Host "Manual curl example (edit endpoint if Render API differs):`n$curlExample`n"

if (-not $Execute) {
    Write-Host "Dry-run complete. To actually call Render's API pass -Execute."
    exit 0
}

# Execute the API call
$endpoint = "https://api.render.com/v1/blueprints/import"
Write-Host "Calling Render API endpoint: $endpoint`n" -ForegroundColor Yellow
try {
    $resp = Invoke-RestMethod -Uri $endpoint -Method Post -Headers @{ Authorization = "Bearer $ApiKey" } -Body $payload -ContentType 'application/json' -ErrorAction Stop
    Write-Host "Render API response:`n" -ForegroundColor Green
    $resp | ConvertTo-Json -Depth 10 | Write-Host
    Write-Host "If the response looks correct, go to the Render Dashboard and review the created resources (web, worker, database)."
} catch {
    Write-Host "API call failed. Error details below:`n" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.Exception.Response -and ($_.Exception.Response -is [System.Net.HttpWebResponse])) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "Response body:`n$body`n"
    }
    Write-Host "The endpoint or payload may differ from your Render account's API. You can copy the prepared payload above and open a support ticket with Render, or use the Dashboard import UI instead."
    exit 1
}

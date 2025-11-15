param(
    [string]$Branch
)

# Resolve repository root (assumes script is in repo/scripts)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..").Path
Set-Location $root

Write-Host "Repository root: $root"

if (-not $Branch) {
    $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
}

Write-Host "Using branch: $Branch"

git fetch origin

if (-not (Test-Path "render.yaml")) {
    Write-Host "No render.yaml found at repo root. Please ensure render.yaml exists." -ForegroundColor Red
    exit 1
}

# Stage render.yaml and commit if changed
git add render.yaml

$staged = git diff --cached --name-only | Out-String
if ($staged -and $staged.Trim().Length -gt 0) {
    git commit -m "chore: add/update render.yaml manifest for Render"
    Write-Host "Committed render.yaml"
} else {
    Write-Host "No changes staged for commit (render.yaml unchanged)."
}

# Push
Write-Host "Pushing to origin/$Branch..."
git push origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Host "git push failed. Fix any auth issues and try again." -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "Pushed branch $Branch to origin."

# Determine GitHub repo URL from origin
$remoteUrl = git config --get remote.origin.url
$repoPath = $null
if ($remoteUrl -match "git@github.com:(.+)\\.git") {
    $repoPath = $Matches[1]
} elseif ($remoteUrl -match "https://github.com/(.+)\\.git") {
    $repoPath = $Matches[1]
} else {
    # Fallback: open the remote URL as-is
    $repoPath = $remoteUrl
}

$githubUrl = "https://github.com/$repoPath"
$renderImportUrl = "https://dashboard.render.com/services/new"

Write-Host "Opening GitHub repo: $githubUrl"
Start-Process $githubUrl

Write-Host "Opening Render import/new service page: $renderImportUrl"
Start-Process $renderImportUrl

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host " 1) In Render, choose 'Import from repository' / 'Import from manifest' or similar, and point to the GitHub repo and branch:" 
Write-Host "     Repository: $repoPath"
Write-Host "     Branch: $Branch"
Write-Host " 2) Follow the import flow to create services from render.yaml (web + worker + managed Postgres)."
Write-Host " 3) After creation, verify the Web service's Environment has DATABASE_URL set and check the service logs for successful DB migrations/startup."
Write-Host ""
Write-Host "If you'd like me to verify once you're done, paste the Web service URL here and I'll guide the verification steps."

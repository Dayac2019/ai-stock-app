# Render import helper (safe helper)

This folder contains a small PowerShell helper that:

1. Stages and commits `render.yaml` if changed
2. Pushes the current branch to `origin`
3. Opens your GitHub repo in the browser and the Render "Create new service" page so you can finish the import manually

This is intentionally a low-risk helper: it does not call Render APIs or require an API key.

## Usage

Prerequisites:
- Git installed and authenticated to GitHub from your machine
- PowerShell (Windows) — run the script from PowerShell
- You're inside the repo (the script assumes it's located at `scripts/push_and_open_render.ps1` under repo root)

Run from PowerShell:

```powershell
# from repository root
.
\scripts\push_and_open_render.ps1

# or explicitly from scripts folder
.
scripts\push_and_open_render.ps1 -Branch main
```

What it does:
- Adds `render.yaml` to git, commits if changed, and pushes the current branch to `origin`.
- Opens two browser tabs: your GitHub repo and the Render "Create new service" page.

## Next steps on Render (manual)
1. In Render, choose "Import from repository" or "Import from manifest" and point it at your repo and the branch you pushed.
2. When Render shows the services defined in `render.yaml`, continue the flow to create them (web + worker + database).
3. After create, validate:
   - Web service environment contains `DATABASE_URL` (automatically wired by manifest)
   - Service logs show successful startup and no DB errors
   - Worker logs show `/ready` or similar healthy output

If you'd like help verifying after you run the script and complete the import, paste the Web service URL and I will walk through health checks and DB verification steps.

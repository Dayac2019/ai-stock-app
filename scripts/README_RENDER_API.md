Render API import helper

This describes `render_import_api.ps1` and how to run it safely.

What it does
- Pushes the current branch to `origin` (ensures Render sees latest manifest)
- Prepares a JSON payload containing `repository`, `branch`, and `manifest` (the contents of `render.yaml`)
- Shows a dry-run output and a suggested curl command
- If called with `-Execute`, it will attempt to POST the payload to `https://api.render.com/v1/blueprints/import` using your `RENDER_API_KEY`.

Why dry-run first?
- Render's public API surface may change. The script avoids performing destructive or unexpected changes without an explicit `-Execute` flag.

How to run

1) Dry-run (recommended first):

```powershell
# from repo root
.\scripts\render_import_api.ps1
```

2) Execute (will call Render API):

```powershell
# make sure RENDER_API_KEY is set in your environment or pass -ApiKey
$env:RENDER_API_KEY = "your_api_key_here"
.\scripts\render_import_api.ps1 -Execute
```

Security notes
- Do NOT paste your real API key into chat or share it. Store it in your machine's environment for the script to pick up.
- The script avoids printing the full API key; it only prints prepared payload metadata.

Troubleshooting
- If the API call fails with 404 or unknown endpoint, Render's API endpoint may differ. Use the Dashboard import UI (safe) or open a support ticket with Render.
- If you see an authentication error, double-check your `RENDER_API_KEY` value.

If you'd like, I can also:
- Adapt the script to call a different endpoint if you provide Render API docs/endpoint
- Add retries and polling until the import completes
- Run verification steps after import (health checks, DB presence) — I will need the public Web URL to do that.

# Project Management MVP

## Run

Docker Desktop is required.

To enable AI chat, create `.env` in the project root:

```text
OPENROUTER_API_KEY=your-key
```

Windows:

```powershell
.\scripts\start.ps1
.\scripts\stop.ps1
```

macOS and Linux:

```bash
sh scripts/start.sh
sh scripts/stop.sh
```

The app is available at `http://localhost:8000`.

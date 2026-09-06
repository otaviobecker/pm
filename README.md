# Project Management

A multi-user Kanban project management app with an AI chat sidebar.

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

## Accounts

A fresh database is seeded with an administrator, `user` / `password`, and a starter board. Change that password, or register your own account from the sign-in screen.

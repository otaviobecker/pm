# Script guide

- `start.ps1` and `stop.ps1` support Windows PowerShell.
- `start.sh` and `stop.sh` support POSIX shells on macOS and Linux.
- Scripts resolve the repository root from their own location, so they can be called from any working directory.
- Keep scripts as thin wrappers around Docker Compose.
- Start scripts may build images; stop scripts must preserve the named data volume.
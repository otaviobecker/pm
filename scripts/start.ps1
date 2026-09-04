$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

docker compose --project-directory $root up --build --detach

Write-Host "Project Management MVP is available at http://localhost:8000"

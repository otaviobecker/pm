#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

docker compose --project-directory "$root" up --build --detach

echo "Project Management MVP is available at http://localhost:8000"

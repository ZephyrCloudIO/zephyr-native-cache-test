#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_ID="${APP_ID:-io.zephyr-cloud.health}"

for port in 8082 8083; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    printf 'Remote fixture port %s must be stopped for the unavailable-remotes flow.\n' "$port" >&2
    exit 1
  fi
done

maestro --platform=ios test \
  -e "APP_ID=$APP_ID" \
  "$ROOT/apps/host/e2e/flows/first-launch-offline.yaml" \
  "$ROOT/apps/host/e2e/flows/clear-cache-confirmation.yaml"

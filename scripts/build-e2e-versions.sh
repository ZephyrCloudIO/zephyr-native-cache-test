#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURES="$REPO_ROOT/e2e-fixtures"
MINI="$REPO_ROOT/apps/mini"
NESTED="$REPO_ROOT/apps/nested-mini"
PLATFORM="${1:-ios}"

log() { echo "[e2e-build] $*"; }

build_remote() {
  local app_dir="$1" version="$2"
  (cd "$app_dir" && REMOTE_VERSION="$version" pnpm exec rnef bundle-mf-remote --platform "$PLATFORM" --dev false)
}

save_snapshot() {
  local app_dir="$1" snapshot_name="$2"
  local dest="$FIXTURES/$snapshot_name"
  rm -rf "$dest"
  cp -r "$app_dir/dist/$PLATFORM" "$dest"
  log "saved $snapshot_name ($(ls "$dest"/*.bundle 2>/dev/null | wc -l | tr -d ' ') bundles)"
}

# --- Main ---
mkdir -p "$FIXTURES"

log "=== Building mini remote ==="
log "building mini v1..."
build_remote "$MINI" v1
save_snapshot "$MINI" "mini-v1"

log "building mini v2..."
build_remote "$MINI" v2
save_snapshot "$MINI" "mini-v2"

log "=== Building nested-mini remote ==="
log "building nested-mini v1..."
build_remote "$NESTED" v1
save_snapshot "$NESTED" "nested-v1"

log "building nested-mini v2..."
build_remote "$NESTED" v2
save_snapshot "$NESTED" "nested-v2"

log "building nested-mini v3 (v2 improvements, CacheInfo reverted to v1)..."
build_remote "$NESTED" v3
save_snapshot "$NESTED" "nested-v3"

# Initialize CDN directories with v1
log "initializing CDN directories with v1..."
rm -rf "$FIXTURES/mini-current" "$FIXTURES/nested-current"
cp -r "$FIXTURES/mini-v1" "$FIXTURES/mini-current"
cp -r "$FIXTURES/nested-v1" "$FIXTURES/nested-current"

log "=== Done ==="
log "Snapshots in $FIXTURES:"
ls -1d "$FIXTURES"/*/ 2>/dev/null | sed "s|$FIXTURES/|  |"

#!/usr/bin/env bash
set -euo pipefail

# Generate per-submodule state hash files for Turbo input tracking.
# Turbo treats submodule directories as filesystem globs (too many files).
# This script captures the full submodule state (commit + dirty changes)
# in a single hash that Turbo can use as a lightweight cache key.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

submodule_state() {
  local submodule_dir="$1"
  if [[ -d "$submodule_dir/.git" || -f "$submodule_dir/.git" ]]; then
    {
      git -C "$submodule_dir" rev-parse HEAD
      git -C "$submodule_dir" diff HEAD
    } | shasum -a 256 | cut -d' ' -f1
  else
    echo "uninitialized"
  fi
}

printf '%s\n' "$(submodule_state "$REPO_ROOT/vendor/mf-core")" > "$REPO_ROOT/.mf-core.state"
printf '%s\n' "$(submodule_state "$REPO_ROOT/vendor/zephyr-packages")" > "$REPO_ROOT/.native-cache.state"

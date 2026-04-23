#!/usr/bin/env bash
set -euo pipefail

# Opens apps/host/ios in Xcode with ZEPHYR_E2E=1 and the Zephyr env vars
# inherited from .env.e2e. Xcode passes the env down to its "Bundle React
# Native code and images" build phase, where metro.config.js wires up
# withZephyr() and needs ZE_SECRET_TOKEN to resolve.
#
# Usage: pnpm xcode:zephyr
# After Xcode opens: set scheme to Release, pick a sim, ⌘R.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="$REPO_ROOT/apps/host/ios/MFExampleHost.xcworkspace"
ENV_FILE="$REPO_ROOT/.env.e2e"

info() { echo "→ $*"; }
error() { echo "✗ $*" >&2; exit 1; }

[[ -d "$WORKSPACE" ]] || error "Workspace not found at $WORKSPACE"

if [[ -f "$ENV_FILE" ]]; then
  info "Loading $ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
else
  info "No .env.e2e — relying on existing shell env for ZE_* vars"
fi

export ZEPHYR_E2E=1

missing=()
for v in ZE_API_GATE ZE_API ZE_SECRET_TOKEN; do
  [[ -n "${!v:-}" ]] || missing+=("$v")
done
[[ ${#missing[@]} -eq 0 ]] || error "Missing env vars: ${missing[*]}. See .env.e2e.example."

info "ZEPHYR_E2E=1"
info ""
info "After Xcode opens:"
info "  1. Product → Scheme → Edit Scheme → Run → Build Configuration: Release"
info "  2. Pick a simulator"
info "  3. ⌘R to build & run"
info "  4. Watch Debug console (⇧⌘Y) for crash logs"
info ""

open "$WORKSPACE"

#!/usr/bin/env bash
set -euo pipefail

# Opens apps/host/ios in Xcode with ZEPHYR_E2E=1 and ZE_SECRET_TOKEN loaded
# from .env.e2e. Xcode passes them down to its "Bundle React Native code and
# images" build phase, where metro.config.js uses the production defaults.
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
fi

export ZEPHYR_E2E=1

[[ -n "${ZE_SECRET_TOKEN:-}" ]] || error "Missing ZE_SECRET_TOKEN. See .env.e2e.example."

info "ZEPHYR_E2E=1 (Zephyr production defaults)"
info "ZE_SECRET_TOKEN=<set>"
info ""
info "After Xcode opens:"
info "  1. Product → Scheme → Edit Scheme → Run → Build Configuration: Release"
info "  2. Pick a simulator"
info "  3. ⌘R to build & run"
info "  4. Watch Debug console (⇧⌘Y) for crash logs"
info ""

open "$WORKSPACE"

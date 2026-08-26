#!/usr/bin/env bash
set -euo pipefail

# Opens apps/host/ios in Xcode with ZEPHYR_E2E=1. Xcode passes the flag down
# to its "Bundle React Native code and images" build phase, where
# metro.config.js wires up withZephyr() using the production defaults.
#
# Usage: pnpm xcode:zephyr
# After Xcode opens: set scheme to Release, pick a sim, ⌘R.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE="$REPO_ROOT/apps/host/ios/MFExampleHost.xcworkspace"

info() { echo "→ $*"; }
error() { echo "✗ $*" >&2; exit 1; }

[[ -d "$WORKSPACE" ]] || error "Workspace not found at $WORKSPACE"

export ZEPHYR_E2E=1

info "ZEPHYR_E2E=1 (Zephyr production defaults)"
info ""
info "After Xcode opens:"
info "  1. Product → Scheme → Edit Scheme → Run → Build Configuration: Release"
info "  2. Pick a simulator"
info "  3. ⌘R to build & run"
info "  4. Watch Debug console (⇧⌘Y) for crash logs"
info ""

open "$WORKSPACE"

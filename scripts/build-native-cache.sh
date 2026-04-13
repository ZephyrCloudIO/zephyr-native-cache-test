#!/usr/bin/env bash
set -euo pipefail

# Build and pack zephyr-native-cache tarball from zephyr-packages submodule.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARBALLS_DIR="$REPO_ROOT/tarballs"
ZP_WT="$REPO_ROOT/vendor/zephyr-packages"

info() { echo "→ $*"; }
error() { echo "✗ $*" >&2; exit 1; }

[[ -d "$ZP_WT" ]] || error "zephyr-packages submodule not found at $ZP_WT — run: git submodule update --init"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING"

cd "$ZP_WT"

info "Installing dependencies..."
pnpm install

info "Building zephyr-native-cache..."
pnpm --filter zephyr-native-cache run build

info "Packing tarball..."
pnpm --filter zephyr-native-cache pack --pack-destination "$STAGING/"

src=$(ls "$STAGING/"*zephyr-native-cache* 2>/dev/null | head -1)
[[ -n "$src" ]] || error "Could not find packed tarball for zephyr-native-cache"
mv "$src" "$TARBALLS_DIR/zephyr-native-cache.tgz"
info "  zephyr-native-cache → zephyr-native-cache.tgz"

info "Done."

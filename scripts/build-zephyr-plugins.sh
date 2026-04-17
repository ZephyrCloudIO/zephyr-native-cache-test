#!/usr/bin/env bash
set -euo pipefail

# Build and pack the vendor Zephyr plugins used by the real-Zephyr e2e flow:
# zephyr-edge-contract, zephyr-agent, zephyr-metro-plugin. Tarballs are
# dropped into ./tarballs and wired in by pnpm overrides (see root package.json).

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARBALLS_DIR="$REPO_ROOT/tarballs"
ZP_WT="$REPO_ROOT/vendor/zephyr-packages"

info() { echo "→ $*"; }
error() { echo "✗ $*" >&2; exit 1; }

[[ -d "$ZP_WT" ]] || error "zephyr-packages submodule not found at $ZP_WT — run: git submodule update --init"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING" "$TARBALLS_DIR"

cd "$ZP_WT"

info "Installing vendor dependencies..."
pnpm install

PKGS=(zephyr-edge-contract zephyr-agent zephyr-xpack-internal zephyr-metro-plugin)

for pkg in "${PKGS[@]}"; do
  info "Building $pkg..."
  pnpm --filter "$pkg" run build
done

for pkg in "${PKGS[@]}"; do
  info "Packing $pkg..."
  pnpm --filter "$pkg" pack --pack-destination "$STAGING/"
  src=$(ls "$STAGING/"*"$pkg"*.tgz 2>/dev/null | head -1)
  [[ -n "$src" ]] || error "Could not find packed tarball for $pkg"
  mv "$src" "$TARBALLS_DIR/$pkg.tgz"
  info "  $pkg → $pkg.tgz"
done

info "Done."

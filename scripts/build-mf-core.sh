#!/usr/bin/env bash
set -euo pipefail

# Build and pack @module-federation/* tarballs from mf-core submodule.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARBALLS_DIR="$REPO_ROOT/tarballs"
MF_WT="$REPO_ROOT/vendor/mf-core"

MF_PACKAGES=(
  "@module-federation/error-codes"
  "@module-federation/sdk"
  "@module-federation/runtime-core"
  "@module-federation/runtime"
  "@module-federation/metro"
  "@module-federation/metro-plugin-rnef"
)

info() { echo "→ $*"; }
error() { echo "✗ $*" >&2; exit 1; }

# Derive stable tarball name from scoped package name
# @module-federation/metro → module-federation-metro.tgz
stable_name() {
  echo "$1" | sed 's/@//g; s|/|-|g' | tr -s '-'
}

[[ -d "$MF_WT" ]] || error "mf-core submodule not found at $MF_WT — run: git submodule update --init"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING"
mkdir -p "$TARBALLS_DIR"

cd "$MF_WT"

info "Installing dependencies..."
pnpm install --frozen-lockfile

FILTER_ARGS=""
for pkg in "${MF_PACKAGES[@]}"; do
  FILTER_ARGS="$FILTER_ARGS --filter=$pkg"
done

info "Building packages..."
pnpm exec turbo run build $FILTER_ARGS

info "Packing tarballs..."
for pkg in "${MF_PACKAGES[@]}"; do
  pnpm --filter "$pkg" pack --pack-destination "$STAGING/"
done

for pkg in "${MF_PACKAGES[@]}"; do
  name="$(stable_name "$pkg").tgz"
  src=$(ls "$STAGING/"*"$(stable_name "$pkg")"* 2>/dev/null | head -1)
  [[ -n "$src" ]] || error "Could not find packed tarball for $pkg"
  mv "$src" "$TARBALLS_DIR/$name"
  info "  $pkg → $name"
done

info "Done."

#!/usr/bin/env bash
set -euo pipefail

# Build and pack @module-federation/* tarballs from mf-core worktree.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARBALLS_DIR="$REPO_ROOT/tarballs"
WORKSPACE_ROOT="$(cd "$REPO_ROOT/.." && pwd)"
MF_WT="$WORKSPACE_ROOT/.worktrees/mf-core-metro-cache"

MF_PACKAGES=(
  "@module-federation/error-codes"
  "@module-federation/sdk"
  "@module-federation/runtime-core"
  "@module-federation/runtime"
  "@module-federation/metro"
  "@module-federation/metro-plugin-rnef"
)

declare -A TARBALL_NAMES=(
  ["@module-federation/error-codes"]="module-federation-error-codes.tgz"
  ["@module-federation/sdk"]="module-federation-sdk.tgz"
  ["@module-federation/runtime-core"]="module-federation-runtime-core.tgz"
  ["@module-federation/runtime"]="module-federation-runtime.tgz"
  ["@module-federation/metro"]="module-federation-metro.tgz"
  ["@module-federation/metro-plugin-rnef"]="module-federation-metro-plugin-rnef.tgz"
)

info() { echo "→ $*"; }
error() { echo "✗ $*" >&2; exit 1; }

[[ -d "$MF_WT" ]] || error "mf-core worktree not found at $MF_WT"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING"

cd "$MF_WT"

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
  stable_name="${TARBALL_NAMES[$pkg]}"
  src=$(ls "$STAGING/"*"$(echo "$pkg" | sed 's/@//;s|/|-|')"* 2>/dev/null | head -1)
  [[ -n "$src" ]] || error "Could not find packed tarball for $pkg"
  mv "$src" "$TARBALLS_DIR/$stable_name"
  info "  $pkg → $stable_name"
done

info "Done."

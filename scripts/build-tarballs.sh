#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# build-tarballs.sh — Build tarball artifacts from local worktrees.
#
# Expected worktrees:
#   mf-core:          ../.worktrees/mf-core-metro-cache
#   zephyr-packages:  ../.worktrees/ze-packages-native-cache
#
# Edit code in the worktrees, then run this script to rebuild tarballs.
# Output: tarballs/ directory with version-agnostic .tgz filenames.
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARBALLS_DIR="$REPO_ROOT/tarballs"
WORKSPACE_ROOT="$(cd "$REPO_ROOT/.." && pwd)"

MF_WT="$WORKSPACE_ROOT/.worktrees/mf-core-metro-cache"
ZP_WT="$WORKSPACE_ROOT/.worktrees/ze-packages-native-cache"

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
  ["zephyr-native-cache"]="zephyr-native-cache.tgz"
)

info() { echo "→ $*"; }
error() { echo "✗ $*" >&2; exit 1; }

[[ -d "$MF_WT" ]] || error "mf-core worktree not found at $MF_WT"
[[ -d "$ZP_WT" ]] || error "zephyr-packages worktree not found at $ZP_WT"

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING/packs"

# --- mf-core: build and pack ------------------------------------------------
info "Building mf-core packages..."
cd "$MF_WT"

FILTER_ARGS=""
for pkg in "${MF_PACKAGES[@]}"; do
  FILTER_ARGS="$FILTER_ARGS --filter=$pkg"
done

pnpm exec turbo run build $FILTER_ARGS

info "Packing mf-core tarballs..."
for pkg in "${MF_PACKAGES[@]}"; do
  pnpm --filter "$pkg" pack --pack-destination "$STAGING/packs/"
done

for pkg in "${MF_PACKAGES[@]}"; do
  stable_name="${TARBALL_NAMES[$pkg]}"
  src=$(ls "$STAGING/packs/"*"$(echo "$pkg" | sed 's/@//;s|/|-|')"* 2>/dev/null | head -1)
  [[ -n "$src" ]] || error "Could not find packed tarball for $pkg"
  mv "$src" "$STAGING/packs/$stable_name"
  info "  $pkg → $stable_name"
done

# --- zephyr-packages: build and pack ----------------------------------------
info "Building zephyr-native-cache..."
cd "$ZP_WT"
pnpm --filter zephyr-native-cache run build

info "Packing zephyr-native-cache tarball..."
pnpm --filter zephyr-native-cache pack --pack-destination "$STAGING/packs/"

src=$(ls "$STAGING/packs/"*zephyr-native-cache* 2>/dev/null | grep -v "module-federation" | head -1)
[[ -n "$src" ]] || error "Could not find packed tarball for zephyr-native-cache"
mv "$src" "$STAGING/packs/zephyr-native-cache.tgz"
info "  zephyr-native-cache → zephyr-native-cache.tgz"

# --- Move to tarballs/ ------------------------------------------------------
rm -f "$TARBALLS_DIR"/*.tgz
mv "$STAGING/packs/"*.tgz "$TARBALLS_DIR/"

info ""
info "Done. Tarballs:"
ls -lh "$TARBALLS_DIR/"*.tgz

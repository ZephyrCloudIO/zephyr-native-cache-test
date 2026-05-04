#!/usr/bin/env bash
set -euo pipefail

# Smart dev entrypoint.
# 1. Check for busy ports and prompt to kill
# 2. Compute mf-core vendor submodule state
# 3. If vendor unchanged and tarballs exist → dev:cached (fast, Metro reuses cache)
#    Otherwise → dev (full build pipeline, Metro resets cache)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

EXPECTED_TARBALLS=(
  module-federation-error-codes.tgz
  module-federation-sdk.tgz
  module-federation-runtime-core.tgz
  module-federation-runtime.tgz
  module-federation-metro.tgz
  module-federation-metro-plugin-rnef.tgz
)

# ── Port check ────────────────────────────────────────────
PORTS=(8081 8082 8083)
BUSY=()

for port in "${PORTS[@]}"; do
  if lsof -ti :"$port" >/dev/null 2>&1; then
    BUSY+=("$port")
  fi
done

if [[ ${#BUSY[@]} -gt 0 ]]; then
  echo ""
  echo "⚠  Ports already in use: ${BUSY[*]}"
  echo ""
  for port in "${BUSY[@]}"; do
    pid=$(lsof -ti :"$port" 2>/dev/null | head -1)
    if [[ -n "$pid" ]]; then
      cmd=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
      echo "   :$port → PID $pid ($cmd)"
    fi
  done
  echo ""
  read -r -p "Kill these processes and continue? [Y/n] " answer
  answer=${answer:-Y}

  if [[ "$answer" =~ ^[Yy]$ ]]; then
    for port in "${BUSY[@]}"; do
      lsof -ti :"$port" 2>/dev/null | xargs kill 2>/dev/null || true
    done
    echo "→ Killed. Continuing..."
  else
    echo "→ Aborting."
    exit 1
  fi
fi

# ── Vendor state ──────────────────────────────────────────
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

old_mf=$(cat "$REPO_ROOT/.mf-core.state" 2>/dev/null || true)

new_mf=$(submodule_state "$REPO_ROOT/vendor/mf-core")

printf '%s\n' "$new_mf" > "$REPO_ROOT/.mf-core.state"

# ── Check tarballs ────────────────────────────────────────
tarballs_ok=true
for tb in "${EXPECTED_TARBALLS[@]}"; do
  if [[ ! -f "$REPO_ROOT/tarballs/$tb" ]]; then
    tarballs_ok=false
    break
  fi
done

# ── Decide mode ───────────────────────────────────────────
cd "$REPO_ROOT"

if [[ "$old_mf" == "$new_mf" && "$tarballs_ok" == true ]]; then
  echo "→ Vendor unchanged — starting Metro with warm cache"
  exec pnpm exec turbo run dev:cached
else
  echo "→ Vendor changed — rebuilding and resetting Metro cache"
  exec pnpm exec turbo run dev
fi

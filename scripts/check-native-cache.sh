#!/usr/bin/env bash
set -euo pipefail

# Invalidate rnef's remote-build cache when native inputs change.
# Runs before rnef run:ios so stale cached .app binaries are never installed.
#
# Fingerprint covers: all tarballs (native module source) + Podfile.lock (pod graph).
# If any of these changed since the last successful run:ios, the rnef cache is nuked
# so xcodebuild recompiles with the current native source.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST_DIR="$REPO_ROOT/apps/host"
RNEF_CACHE="$HOST_DIR/.rnef/cache"
STATE_FILE="$REPO_ROOT/.native-build.state"

fingerprint() {
  cat \
    "$REPO_ROOT"/tarballs/*.tgz \
    "$HOST_DIR/ios/Podfile.lock" \
    2>/dev/null | shasum -a 256 | cut -d' ' -f1
}

old=$(cat "$STATE_FILE" 2>/dev/null || true)
new=$(fingerprint)

if [[ "$old" != "$new" ]]; then
  if [[ -d "$RNEF_CACHE" ]]; then
    echo "→ Native inputs changed — clearing rnef build cache"
    rm -rf "$RNEF_CACHE"
  fi
  printf '%s\n' "$new" > "$STATE_FILE"
fi

#!/usr/bin/env bash
set -euo pipefail

# Check if Metro dev server ports are already in use and prompt to kill them.

PORTS=(8081 8082 8083)
BUSY=()

for port in "${PORTS[@]}"; do
  if lsof -ti :"$port" >/dev/null 2>&1; then
    BUSY+=("$port")
  fi
done

if [[ ${#BUSY[@]} -eq 0 ]]; then
  exit 0
fi

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

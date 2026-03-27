#!/usr/bin/env bash
# Cross-platform hook runner for DevFlow
# Usage: run-hook.cmd <hook-name>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SCRIPT="${SCRIPT_DIR}/${1}"

if [ -f "$HOOK_SCRIPT" ]; then
  exec bash "$HOOK_SCRIPT"
else
  echo "{\"error\": \"Hook not found: ${1}\"}" >&2
  exit 1
fi

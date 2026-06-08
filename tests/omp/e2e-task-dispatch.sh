#!/usr/bin/env bash
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
( cd "$TMP" && git init -q )
echo "ok" > "$TMP/a.txt"
OUT=$(cd "$TMP" && omp --auto-approve -p "use o task tool com o agent 'explore' para confirmar se a.txt existe no diretório; responda em 1 linha" 2>&1 || true)
echo "--- out ---"; echo "$OUT"
echo "$OUT" | grep -qi "a.txt\|exist\|sim\|yes\|true" || { echo "AVISO: task tool não confirmou (pode ser fraseado do modelo); verifique manualmente"; }
echo "OK"

#!/usr/bin/env bash
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context/workflow/.checkpoint"
# pre-compact roda dentro de um projeto (sempre um repo git). Sem git init, o
# `git status --porcelain` falha sob `set -euo pipefail` e o hook aborta antes
# de escrever last.json — então o tmpdir precisa ser um repo git de verdade.
( cd "$TMP" && git init -q && git checkout -q -b main )
( cd "$TMP" && CLAUDE_PLUGIN_ROOT="$REPO_ROOT" bash "$REPO_ROOT/hooks/pre-compact" >/dev/null 2>&1 || true )
test -f "$TMP/.context/workflow/.checkpoint/last.json" || { echo "FALHA: snapshot ausente"; exit 1; }
echo "OK"

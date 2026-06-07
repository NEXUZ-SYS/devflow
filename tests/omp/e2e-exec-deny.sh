#!/usr/bin/env bash
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context"
cat > "$TMP/.context/permissions.yaml" <<'YAML'
spec: devflow-permissions/v0
evaluationOrder: [deny, allow, mode, callback]
deny:
  # Glob com semântica de segmento: `*` NÃO cruza `/`, então `rm -rf /*` só
  # casaria `rm -rf /etc`, não um caminho profundo. `**` cruza `/` → casa
  # `rm -rf /tmp/.../vitima.txt`. (verificado via scripts/lib/glob.mjs)
  exec:
    - "rm -rf /**"
allow: {}
mode: prompt
callback: { url: null }
YAML
echo "alvo" > "$TMP/vitima.txt"
OUT=$(cd "$TMP" && omp -e "$REPO_ROOT/omp/extension.mjs" --auto-approve -p "rode no bash: rm -rf $TMP/vitima.txt" 2>&1 || true)
test -f "$TMP/vitima.txt" || { echo "FALHA: rm executou — exec deny não funcionou"; exit 1; }
echo "OK"

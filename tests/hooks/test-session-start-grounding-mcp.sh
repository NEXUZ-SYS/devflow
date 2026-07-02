#!/usr/bin/env bash
# tests/hooks/test-session-start-grounding-mcp.sh
# CP-2b: com grounding.mode ativo mas o docs-mcp-server AUSENTE, o session-start
# NÃO deve injetar a instrução acionável de consultar mcp__..._search_docs;
# deve marcar a indisponibilidade. Com o MCP presente, injeta o protocolo completo.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOK="${PROJECT_ROOT}/hooks/session-start"

# HOME apontado para a própria sandbox → a detecção de docs_mcp_available só
# considera o .mcp.json do projeto (o hook também checa $HOME/.config/claude/mcp.json;
# isolamos para o teste não depender da config MCP global do usuário).
run_hook() { ( cd "$1"; HOME="$1" CLAUDE_PLUGIN_ROOT="$PROJECT_ROOT" bash "$HOOK" 2>/dev/null || true ); }

mk() {  # $1=mode  $2=with_mcp(true/false)
  local dir; dir=$(mktemp -d); mkdir -p "$dir/.context"
  cat > "$dir/.context/.devflow.yaml" <<YAML
git:
  strategy: branch-flow
  protectedBranches: [main]
grounding:
  mode: $1
  docsMcpServer: docs-mcp-server
  failClosed: true
YAML
  if [ "$2" = "true" ]; then
    printf '{"mcpServers":{"docs-mcp-server":{"command":"docs-mcp-server"}}}' > "$dir/.mcp.json"
  fi
  printf '%s' "$dir"
}

# Extrai APENAS o bloco <GROUNDING_MODE>...</GROUNDING_MODE> (o output também injeta
# a skill using-devflow, que menciona search_docs de forma genérica — não é o alvo).
gblock() { grep -o '<GROUNDING_MODE>.*</GROUNDING_MODE>' <<< "$1" | head -1; }

# Caso A: MCP ausente → nota de indisponibilidade, SEM search_docs acionável no bloco
SB=$(mk "docs-only" "false"); out=$(run_hook "$SB"); rm -rf "$SB"
GB=$(gblock "$out")
[ -n "$GB" ] || { echo "FALHA[A]: bloco GROUNDING_MODE ausente"; exit 1; }
if echo "$GB" | grep -q "search_docs"; then echo "FALHA[A]: bloco grounding instrui search_docs com o MCP ausente"; exit 1; fi
echo "$GB" | grep -qiE "indispon" || { echo "FALHA[A]: bloco grounding não marcou a indisponibilidade do MCP"; exit 1; }

# Caso B: MCP presente → protocolo completo (search_docs) no bloco, sem nota de indisponível
SB=$(mk "docs-only" "true"); out=$(run_hook "$SB"); rm -rf "$SB"
GB=$(gblock "$out")
[ -n "$GB" ] || { echo "FALHA[B]: bloco GROUNDING_MODE ausente"; exit 1; }
echo "$GB" | grep -q "search_docs" || { echo "FALHA[B]: bloco grounding não traz o protocolo completo (search_docs) com o MCP presente"; exit 1; }
if echo "$GB" | grep -qiE "indispon"; then echo "FALHA[B]: marcou indisponível com o MCP presente"; exit 1; fi

echo "OK test-session-start-grounding-mcp"

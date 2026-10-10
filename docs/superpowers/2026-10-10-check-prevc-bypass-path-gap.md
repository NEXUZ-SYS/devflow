# Backlog — lembrete de bypass do PREVC procura o workflow no caminho antigo

`scripts/lib/check-prevc-bypass.mjs` (PostToolUse, ADR-006) procura o workflow ativo em
`.context/harness/workflows/prevc.json`, mas o dotcontext atual grava em
`.context/runtime/workflows/prevc.json`. Efeito: o lembrete `<PREVC_HANDOFF_BYPASS>` dispara a cada
edição de plano mesmo com workflow ativo (falso positivo). Correção provável: ler o caminho do runtime
(com o antigo como fallback) e cobrir no `tests/hooks/test-post-tool-use-prevc-bypass.sh`.
Achado lateral do workflow `routing-phase-sync-and-autonomous-gates` (2026-10-10); fora do escopo dele.

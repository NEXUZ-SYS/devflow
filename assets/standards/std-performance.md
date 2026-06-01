---
id: std-performance
description: Decisões de performance mensuradas, não intuitivas — meça antes de otimizar
version: 1.0.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
weakStandardWarning: true
---
## Princípios

- Meça antes de otimizar: sem dado de profiling, otimização é especulação
- Use `Promise.all` para operações independentes; nunca `await` sequencial em loop quando as iterações são independentes
- Evite N+1: nunca faça query dentro de loop sobre resultado de outra query; use JOIN, `IN (...)`, batch ou DataLoader
- Pagine com cursor (`WHERE id > $last LIMIT N`) em vez de `OFFSET` para datasets grandes
- Sempre `LIMIT` explícito em toda query que retorna lista; sem limite é convite a memória estourada
- Nunca `SELECT *` em código de produção: liste colunas explicitamente para reduzir I/O e evitar quebra silenciosa
- Crie índice antes de promover query a produção; use `CREATE INDEX CONCURRENTLY` em Postgres
- Streaming para respostas de LLM que excedem ~500ms de TTFB; nunca acumule resposta inteira no servidor
- Cancele chamadas upstream via `AbortSignal` quando o cliente sair; desperdício de tokens é custo direto
- Prefira o modelo mais barato/rápido que atende ao requisito; custo e latência escalam com o tamanho do modelo

## Anti-patterns

| Errado | Corrija para |
|---|---|
| N+1: query dentro de loop | `WHERE id IN (...)` ou DataLoader batch |
| `OFFSET 10000` em paginação | Cursor-based (`WHERE id > $last`) |
| `await` sequencial de operações independentes | `Promise.all([...])` em paralelo |
| `SELECT *` em produção | Listar colunas usadas explicitamente |
| Historial completo de conversa em todo LLM call | Janela deslizante ou resumo comprimido |
| Otimização sem medição prévia | Profiling primeiro, otimizar com dado |

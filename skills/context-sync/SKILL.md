---
name: context-sync
description: "Use to update existing .context/ docs, agents, and skills with current project state — called by /devflow:devflow-sync or automatically by /devflow init when .context/ already exists"
---

# Context Sync

Atualiza o `.context/` existente com o estado atual do projeto. Diferente do `project-init`, este skill **sobrescreve** arquivos existentes com conteúdo atualizado.

**Announce at start:** "I'm using the devflow:context-sync skill to update the project context."

## Quando é chamado

- Diretamente via `/devflow:devflow-sync`
- Automaticamente pelo `/devflow init` quando `.context/docs/` já existe

## Checklist

1. **Detectar modo** — Full (MCP), Lite (.context/), ou Minimal
2. **Identificar escopo** — sync completo ou parcial (docs/agents/skills/knowledge)
3. **Executar sync** — atualizar usando dotcontext MCP ou scan standalone
3e. **Re-sync camadas de conhecimento** — delegar a cada curador (business-context, product-context, operations-context, engineering-context) e regenerar índice de conhecimento
4. **Reportar** — listar o que foi atualizado

## Step 1: Detectar Modo

Verificar disponibilidade na mesma ordem do session-start:

```
1. dotcontext MCP disponível? → Full mode (usar MCP tools)
2. .context/ existe? → Lite mode (scan standalone)
3. Nenhum → Erro: "Nenhum .context/ encontrado. Execute /devflow init primeiro."
```

## Step 2: Identificar Escopo

O argumento do comando define o escopo:

| Argumento | Escopo | Diretórios |
|-----------|--------|------------|
| (nenhum) | Completo | `.context/docs/`, `.context/agents/`, `.context/skills/`, `.context/workflow/`, + todas as camadas de conhecimento |
| `docs` | Apenas docs + ADRs | `.context/docs/`, `.context/adrs/` |
| `agents` | Apenas agents | `.context/agents/` |
| `skills` | Apenas skills | `.context/skills/` |
| `workflow` | Apenas workflow | `.context/workflow/` |
| `knowledge` | Apenas camadas de conhecimento | `.context/business/`, `.context/product/`, `.context/operations/`, `.context/engineering/` |

## Step 3a: Sync via dotcontext MCP (Full Mode)

### Docs

Para cada doc em `.context/docs/`:

```
context({ action: "fillSingle", filePath: ".context/docs/<name>.md" })
```

Ordem recomendada (dependências):
1. `project-overview.md` — base para todos os outros
2. `codebase-map.json` — estrutura do projeto
3. `development-workflow.md` — convenções
4. `testing-strategy.md` — padrões de teste

Após fillSingle, reforçar com:
```
context({ action: "buildSemantic" })    → atualizar análise AST
context({ action: "getMap" })           → atualizar codebase-map.json
context({ action: "detectPatterns" })   → atualizar padrões detectados
```

### Agents

Para cada agent em `.context/agents/`:
```
context({ action: "fillSingle", filePath: ".context/agents/<name>.md" })
```

### Skills

Para cada skill em `.context/skills/`:
```
context({ action: "fillSingle", filePath: ".context/skills/<slug>/SKILL.md" })
```

### Paralelismo

Quando o escopo é completo, executar os fillSingle em paralelo por categoria:
- Todos os docs em paralelo
- Depois todos os agents em paralelo
- Depois todos os skills em paralelo

Usar `buildSemantic`, `getMap`, `detectPatterns` apenas uma vez ao final.

## Step 3b: Sync Standalone (Lite Mode)

Sem MCP disponível. Atualizar manualmente cada arquivo.

### Scan do projeto

Antes de atualizar qualquer arquivo, coletar informações atuais:

1. **Stack** — ler `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`, etc.
2. **Estrutura** — mapear diretórios top-level (2-3 níveis)
3. **Padrões** — identificar arquitetura (MVC, service layer, etc.)
4. **Testes** — framework, localização, cobertura
5. **Git** — branch strategy, CI/CD config

### Atualizar docs

Para cada doc, ler o conteúdo atual, comparar com o scan, e reescrever mantendo o frontmatter com `status: filled` e data atualizada:

```yaml
---
generated: YYYY-MM-DD    # atualizar para data atual
status: filled
---
```

Preencher as seções com dados reais do scan — mesma lógica do Tier 3 do project-init, mas sobrescrevendo o conteúdo existente.

### Atualizar agents

Para cada agent, reler os arquivos do projeto e atualizar as 11 seções com dados atuais:
- Paths reais que existem agora
- Symbols e classes atuais
- Convenções atuais do projeto

### Atualizar skills

Para cada skill, atualizar as 4 seções com padrões atuais do projeto.

## Step 4: Reportar

```markdown
## Context Sync Complete

**Modo:** [Full | Lite]
**Escopo:** [completo | docs | agents | skills]

### Atualizados
- .context/docs/project-overview.md
- .context/docs/codebase-map.json
- .context/agents/backend-specialist.md
- ...

### Sem alterações
- .context/docs/testing-strategy.md (conteúdo já atualizado)
- ...

### Erros
- .context/agents/mobile-specialist.md (fillSingle falhou: ...)
- ...
```

## Step 3c: Sync Workflow Directory

Scaffold and validate `.context/workflow/` for autonomous loop readiness.

### When running full sync or `workflow` scope:

1. **Ensure directory exists:** Create `.context/workflow/` if missing
2. **Check for stories.yaml:**
   - If exists → validate structure (required fields: `feature`, `autonomy`, `stories`)
   - If missing → check for PRD or plan to generate from:
     a. PRD exists (`.context/plans/*-prd.md`) → announce: "PRD found. Run `/devflow auto --from-prd` to generate stories.yaml from it."
     b. Plan exists (`docs/superpowers/plans/*.md`) → announce: "Plan found. Run `/devflow auto <desc>` to generate stories.yaml from it."
     c. Neither → announce: "No PRD or plan found. Run `/devflow prd` or `/devflow <desc>` first."
3. **Validate stories.yaml integrity** (if exists):
   - All required fields present per `templates/stories-schema.yaml`
   - No orphaned `blocked_by` references (all IDs exist)
   - Stats match actual story counts
   - Report any inconsistencies

### Report for workflow scope:
```markdown
### Workflow
- .context/workflow/ — [created | exists]
- stories.yaml — [valid | missing | N issues found]
- Autonomy: [mode] | Stories: [completed]/[total]
```

## Step 3d: Sync ADR Index

Update `.context/adrs/README.md` to reflect current ADR state.

### When running full sync or `docs` scope:

1. Check if `.context/adrs/` exists
2. If yes:
   a. Scan all `.md` files in `.context/adrs/` (excluding README.md)
   b. Parse frontmatter of each ADR (name, status, scope, stack, category)
   c. Count guardrails rules (lines matching `^- (SEMPRE|NUNCA|QUANDO)`)
   d. Regenerate README.md index table with current data
   e. Report changes
3. If no: skip (ADRs are opt-in)

### Report for ADR scope:
```markdown
### ADRs
- .context/adrs/ — [exists | not found]
- README.md — [regenerated | up-to-date | created]
- Active ADRs: [count]
- Total guardrails: [count]
```

## Step 3e: Re-sync Knowledge Layers

Re-sync each knowledge layer by delegating to its curator agent via `devflow:knowledge`. Execute when the scope is `knowledge` or `(nenhum)` (sync completo).

### Quando executar

- Sync completo (`(nenhum)` argumento) → sempre incluir esta etapa
- Argumento `knowledge` → executar apenas esta etapa
- Argumentos `docs`, `agents`, `skills`, `workflow` → pular (escopo não inclui knowledge layers)

### Delegação por curador

Invoke each curator agent to refresh its layer. Each agent uses the `devflow:knowledge` skill in AUDIT mode (CLI: `node scripts/devflow-knowledge.mjs audit --name=<name> --project=<path>`) to detect stale docs and re-scaffold or prompt for update:

- `business-context` agent — refreshes `.context/business/` docs
- `product-context` agent — refreshes `.context/product/` docs
- `operations-context` agent — refreshes `.context/operations/` docs
- `engineering-context` agent — refreshes `.context/engineering/` docs

Cada curador é responsável por:

| Curador | Diretório | Arquivos mantidos |
|---|---|---|
| `business-context` | `.context/business/` | vision.md, icp.md, metrics.md |
| `product-context` | `.context/product/` | vision.md, persona.md, tone-of-voice.md, policies.md |
| `operations-context` | `.context/operations/` | runbooks, on-call, SLOs, infra configs |
| `engineering-context` | `.context/engineering/` | architecture.md, standards/, subsystems/ |

Os curadores devem ler sinais atuais do projeto (commits recentes, PRDs, specs, ADRs, docs existentes) para atualizar seus respectivos arquivos sem re-entrevistar o usuário, a menos que detectem lacunas críticas.

### Regenerar índice de conhecimento

Após todos os curadores concluírem, regenerar o índice centralizado:

O índice de conhecimento é gerado automaticamente pelo hook SessionStart via `scripts/lib/print-knowledge-index.mjs` (função `loadKnowledgeIndex`) e injetado como `KNOWLEDGE_INDEX` no contexto da sessão. Não há MCP tool para essa operação — o índice reflete o estado atual do `.context/` em tempo real a cada sessão.

`.context/knowledge-index.md` pode ser mantido como artefato conceitual de referência, mas seu conteúdo efetivo é o KNOWLEDGE_INDEX injetado no SessionStart — agentes PREVC consultam esse índice durante o Planning phase.

### Fallback (Lite/Minimal mode)

Se `devflow:knowledge` não estiver disponível:
1. Para cada diretório de camada existente, fazer scan dos arquivos `.md`
2. Comparar `generated:` date com data atual — se defasado mais de 30 dias, marcar como `status: stale`
3. Listar no relatório os arquivos stale com sugestão: "Run `/devflow:knowledge refresh` to update."

### Report para knowledge scope

```markdown
### Knowledge Layers
- .context/business/  — [N arquivos atualizados | stale | não encontrado]
- .context/product/   — [N arquivos atualizados | stale | não encontrado]
- .context/operations/— [N arquivos atualizados | stale | não encontrado]
- .context/engineering/— [N arquivos atualizados | stale | não encontrado]
- .context/knowledge-index.md — [regenerado | atualizado | não disponível]
```

## Anti-Patterns

| Pattern | Problema |
|---------|---------|
| Não fazer scan antes de atualizar | Gera conteúdo genérico, não específico do projeto |
| Apagar e recriar | Perde customizações manuais no frontmatter |
| Sync parcial sem reportar | Usuário não sabe o que mudou |
| Ignorar erros de fillSingle | Arquivo fica com conteúdo stale sem aviso |
| Re-sintetizar knowledge layers inline | Delegar sempre ao curador correto — ele conhece o esquema e as regras de cada camada |
| Mover diretórios dotcontext-gerenciados | `docs/`, `agents/`, `skills/`, `plans/` são intocáveis pelo sync — apenas knowledge layers e subsystems engineering/ são reposicionáveis via `devflow:migration` |

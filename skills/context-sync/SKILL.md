---
name: context-sync
description: "Use to update existing .context/ docs, agents, and skills with current project state — called by /devflow-sync or automatically by /devflow init when .context/ already exists"
---

# Context Sync

Atualiza o `.context/` existente com o estado atual do projeto. Diferente do `project-init`, este skill **sobrescreve** arquivos existentes com conteúdo atualizado.

**Announce at start:** "I'm using the devflow:context-sync skill to update the project context."

## Quando é chamado

- Diretamente via `/devflow-sync`
- Automaticamente pelo `/devflow init` quando `.context/docs/` já existe

## Checklist

1. **Detectar modo** — Full (MCP), Lite (.context/), ou Minimal
2. **Identificar escopo** — sync completo ou parcial (docs/agents/skills)
3. **Executar sync** — atualizar usando dotcontext MCP ou scan standalone
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
| (nenhum) | Completo | `.context/docs/`, `.context/agents/`, `.context/skills/` |
| `docs` | Apenas docs | `.context/docs/` |
| `agents` | Apenas agents | `.context/agents/` |
| `skills` | Apenas skills | `.context/skills/` |

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

## Anti-Patterns

| Pattern | Problema |
|---------|---------|
| Não fazer scan antes de atualizar | Gera conteúdo genérico, não específico do projeto |
| Apagar e recriar | Perde customizações manuais no frontmatter |
| Sync parcial sem reportar | Usuário não sabe o que mudou |
| Ignorar erros de fillSingle | Arquivo fica com conteúdo stale sem aviso |

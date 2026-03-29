---
name: devflow-sync
description: Sync and update .context/ docs, agents, and skills with current project state
user_invocable: true
---

# /devflow-sync

Atualiza o `.context/` existente com o estado atual do projeto. Usa dotcontext MCP quando disponível, ou scan standalone.

## Usage

```
/devflow-sync                          # Sync completo (docs + agents + skills)
/devflow-sync docs                     # Sync apenas docs
/devflow-sync agents                   # Sync apenas agents
/devflow-sync skills                   # Sync apenas skills
```

## Behavior

1. Invoke `devflow:context-sync` skill
2. O skill detecta o modo (Full/Lite/Minimal) e usa a melhor ferramenta disponível
3. Docs existentes com `status: filled` são **atualizados** (não protegidos como no init)
4. Após o sync, reporta o que foi atualizado

## When to Use

- Após mudanças significativas no projeto (novo módulo, mudança de stack, refactoring grande)
- Quando `project-overview.md` ou outros docs estão desatualizados
- Automaticamente chamado pelo `/devflow init` quando `.context/docs/` já existe

## Arguments

- Sem argumentos: sync completo
- `docs` — apenas `.context/docs/`
- `agents` — apenas `.context/agents/`
- `skills` — apenas `.context/skills/`

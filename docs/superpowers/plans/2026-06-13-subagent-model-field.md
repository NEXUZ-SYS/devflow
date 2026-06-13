# Plano: campo `model` no frontmatter de subagente

> **Status:** proposto · **Data:** 2026-06-13 · **Branch:** `claude/subagent-model-field-o6bvcq`
> **Tipo:** feature (bump **minor**)

## Objetivo

Adicionar o campo `model` ao frontmatter dos subagentes do DevFlow, espelhando a
spec de sub-agents do Claude Code: cada agente pode declarar em qual modelo roda.

- **Valores aceitos:** `inherit` (default), `sonnet`, `opus`, `haiku`, ID completo
  (`claude-opus-4-7`), e — para coexistir com o omp — os roles omp (`default`,
  `commit`, `pi/<role>`).
- **Default:** `inherit` (herda o modelo da sessão principal).
- **Precedência (do maior para o menor):**
  `CLAUDE_CODE_SUBAGENT_MODEL` (env) › `model:` no frontmatter › `inherit`.

## Contexto / achados da pesquisa

- **Agentes vivem em dois lugares:** `agents/*.md` (nível plugin, carregado direto
  pelo Claude Code — **fonte de verdade**) e `.context/agents/*.md` (escopo projeto,
  camada dotcontext). Hoje nenhum agente declara `model`.
- **O parser já aceita `model:`** — `scripts/lib/frontmatter.mjs` é genérico, sem
  allow-list; não rejeita chaves desconhecidas. Parsear o campo **não exige mudança**.
- **Colisão de semântica na chave `model`:** o runtime **omp** já usa `model:` com
  vocabulário próprio (`pi/plan`, `pi/slow`, `default`, `commit`) via
  `omp/omp-roles.yaml` + `scripts/lib/omp-enrich-agents.mjs`. No Claude Code esse
  mapeamento é **inerte** (`docs/omp-integration.md`). **Decisão: coexistir** —
  o validador aceita ambos os vocabulários; a precedência fica documentada.
- **dotcontext é transparente ao `model`:**
  - `agent` (orchestrate/getSequence/getDocs) seleciona por `task/phase/role` e
    devolve o **caminho do playbook** — **não tem conceito de `model`**. Quem escolhe
    o modelo é o harness, não o dotcontext.
  - `sync exportAgents` em `mode: symlink` (default) ou `markdown` preserva o
    frontmatter **1:1 → `model` sobrevive** e o CC o lê.
  - Único risco: `reverseSync`/re-`init --force` regenerar frontmatter pelo schema do
    dotcontext (que não conhece `model`) e **dropar** o campo → coberto por gate de
    regressão.

## Decisões fechadas

| Tema | Decisão |
|------|---------|
| Colisão omp ↔ CC | **Coexistir + documentar** precedência; validador aceita ambos |
| Defaults nos agentes | **Curado por papel** (ver abaixo); demais herdam (sem campo) |
| dotcontext | Passthrough; gate de regressão export/import + nota na doc |

### Defaults curados (em `agents/`)

| Agente | `model` | Racional |
|--------|---------|----------|
| `architect` | `opus` | Julgamento arquitetural / trade-offs |
| `security-auditor` | `opus` | Revisão profunda de segurança |
| `code-reviewer` | `opus` | Revisão de correção/spec |
| `documentation-writer` | `sonnet` | Trabalho de redação mecânico |
| `test-writer` | `sonnet` | Geração de testes |
| _(demais 16 agentes)_ | _(omitido)_ | `inherit` implícito |

## Mudanças (passo a passo)

- [ ] **Validador** — novo `scripts/lib/agent-model.mjs`:
  - `isValidModelValue(v)`: aliases (`inherit|sonnet|opus|haiku`), ID completo
    (`/^claude-...$/`), roles omp (`default|commit|pi/<role>`).
  - `resolveAgentModel(frontmatter, env)`: aplica a precedência env › fm › `inherit`.
  - `DEFAULT_MODEL`, `CC_ALIASES`, `OMP_ROLES` exportados.
- [ ] **Semear `model`** nos 5 agentes em `agents/` conforme tabela; espelhar nos
  `.context/agents/*.md` correspondentes que existem (`architect`, `code-reviewer`,
  `documentation-writer`, `test-writer`) para o dogfooding ficar consistente.
- [ ] **Template** `templates/agents/scaffold.md` — documentar o campo `model`
  opcional (valores aceitos, default `inherit`).
- [ ] **Testes:**
  - `tests/validation/test-agent-model.mjs` — unit do validador (aliases válidos,
    ID completo, roles omp, rejeições, precedência via env).
  - Estender gate estrutural / `test-bundled-agent-refs.mjs` (ou novo) para afirmar
    que todo `model` presente em `agents/*.md` passa por `isValidModelValue`.
  - Gate de regressão dotcontext: `model` sobrevive a export→import (symlink/markdown).
- [ ] **Docs:**
  - README (seção de agentes): campo `model`, valores, precedência.
  - `docs/omp-integration.md`: relação `model` CC ↔ roles omp + precedência.
  - Nota de que o dotcontext é passthrough.
- [ ] **Release:** entrada no `CHANGELOG.md` + `scripts/bump-version.sh minor`
  (1.19.x → 1.20.0).

## Verificação

- `node --test tests/validation/test-agent-model.mjs` verde.
- `node --test tests/integration/test-bundled-agent-refs.mjs` verde (sem refs penduradas).
- `node scripts/lib/omp-enrich-project-agents.mjs <tmp>` idempotente (invariantes
  `type/name/status` preservados).
- Suíte de validação completa sem regressão.

## Fora de escopo

- Tradução automática alias CC ↔ role omp (mantém-se coexistência sem mapeamento).
- Suporte a `model` em commands/skills (apenas subagentes).
- Reimplementação do schema de scaffold do dotcontext para incluir `model`.

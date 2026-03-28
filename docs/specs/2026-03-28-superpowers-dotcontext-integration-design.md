# Design: Integração Superpowers ↔ Dotcontext

**Data:** 2026-03-28
**Status:** Aprovado
**Escopo:** Hook de transição no prevc-planning + execução via dotcontext + git strategy + checkpoints/rehydration

## Problema

O DevFlow conecta superpowers e dotcontext, mas a passagem de bastão entre os dois é falha:
- O brainstorming e writing-plans (superpowers) geram spec e plano, mas o dotcontext não recebe esse contexto
- A execução roda toda via superpowers, ignorando os agents e workflow do dotcontext
- O `.context/` não é alimentado durante o workflow
- Cada nova sessão/compactação começa sem saber o que foi feito

## Decisão de Arquitetura

**Abordagem 1 (escolhida):** Hook de transição no writing-plans. O superpowers continua dono do brainstorming e writing-plans. O DevFlow intercepta após o plano ser gerado e faz o handoff para o dotcontext, que assume a execução inteira.

**Por que não Abordagem 2 (bypass writing-plans):** Perderia as qualidades do writing-plans (tasks granulares de 2-5 min, TDD enforcement) e o comportamento divergiria muito entre modos.

**Por que não Abordagem 3 (camada bidirecional):** Over-engineering — manter dois formatos sincronizados é frágil e complexo para o problema atual.

## Seção 1: Fluxo Geral

```
[superpowers:brainstorming]
  → spec aprovado pelo usuário
  → spec salvo em docs/superpowers/specs/

[superpowers:writing-plans]
  → plano gerado com tasks granulares
  → plano salvo em docs/superpowers/plans/

[NOVO — Hook de Transição no prevc-planning]
  → Detecta modo (Full / Lite / Minimal)
  → Full Mode:
      1. Converte plano superpowers → formato dotcontext
      2. context({ action: "scaffoldPlan", ... }) → plano criado no MCP
      3. plan({ action: "link", ... }) → vincula ao workflow
      4. workflow-init() → PREVC iniciado
      5. Passa controle para prevc-execution (dotcontext)
  → Lite Mode:
      1. Converte plano → .context/plans/<slug>.md
      2. Tracking manual via tasks
  → Minimal Mode:
      1. Sem conversão — execução via superpowers como hoje

[prevc-execution — alterado]
  → Full Mode: agent({ action: "orchestrate" }) + workflow-advance()
  → Lite/Minimal: sem mudança
```

## Seção 2: Conversão de Formato (writing-plans → dotcontext)

O writing-plans gera um plano em Markdown. Em Full Mode, o DevFlow converte e injeta no dotcontext via MCP, passando o spec completo.

### Fluxo de conversão (Full Mode)

**Passo 1 — Criar plano no dotcontext:**
```
context({
  action: "scaffoldPlan",
  planName: "<slug>",
  title: "<título do spec>",
  summary: "<SPEC COMPLETO do brainstorming>",
  semantic: true,
  autoFill: true
})
```

Parâmetros validados no código fonte (`context.js` linhas 140-148, `types.d.ts` linhas 31-59):
- `planName`: string (obrigatório)
- `title`: string (opcional)
- `summary`: string (opcional) — recebe o spec completo
- `semantic`: boolean (opcional) — cruza spec com análise AST/símbolos/dependências
- `autoFill`: boolean (opcional) — gera plano já preenchido

**Passo 2 — Vincular ao workflow:**
```
plan({ action: "link", planSlug: "<slug>" })
```

Parâmetros validados (`plan.js` linhas 62-85, `types.d.ts` linhas 81-83):
- `planSlug`: string (obrigatório)

Efeitos: linka plano ao workflow, marca `planCreated` nos gates, verifica se pode avançar para Review.

**Passo 3 — Atualizar progresso durante execução:**
```
plan({
  action: "updateStep",
  planSlug: "<slug>",
  phaseId: "<id>",
  stepIndex: <n>,
  status: "completed",
  output: "<resultado do step>",
  notes: "<decisões e contexto do agent>"
})
```

Parâmetros validados (`plan.js` linhas 150-158, `types.d.ts` linhas 81-92):
- `planSlug`: string (obrigatório)
- `phaseId`: string (obrigatório)
- `stepIndex`: number (obrigatório)
- `status`: "pending" | "in_progress" | "completed" | "skipped" (obrigatório)
- `output`: string (opcional)
- `notes`: string (opcional)

### Derivação do planName
Título do spec slugificado: "Implementar autenticação OAuth" → `"implementar-autenticacao-oauth"`

### Por que passar o spec completo no summary
- O dotcontext usa o summary para gerar steps alinhados ao brainstorming
- Com `semantic: true`, cruza requisitos com a estrutura real do codebase
- Nenhum contexto se perde na transição

### Lite Mode fallback
- Sem MCP, plano salvo como `.context/plans/<slug>.md` (formato dotcontext v2)
- Spec completo incluído como seção do arquivo
- Tracking via tasks

### Minimal Mode fallback
- Sem conversão — execução via superpowers como hoje

## Seção 3: Hook de Transição no prevc-planning

**Onde fica:** `skills/prevc-planning/SKILL.md`

**Momento:** Após writing-plans gerar o plano e o usuário aprovar.

### Fluxo no prevc-planning (alterado)

```
1. Gather project context (sem mudança)
2. Invoke superpowers:brainstorming (sem mudança)
   → spec aprovado, salvo em docs/superpowers/specs/
3. Invoke superpowers:writing-plans (sem mudança)
   → plano Markdown gerado
4. [NOVO] Handoff por modo:

   IF Full Mode:
     → Executar conversão da Seção 2 (scaffoldPlan + link)
     → Informar usuário: "Plano vinculado ao workflow dotcontext."

   ELIF Lite Mode:
     → Converter plano → .context/plans/<slug>.md (formato dotcontext v2)
     → Incluir spec completo como seção do arquivo
     → Tracking via tasks

   ELSE Minimal Mode:
     → Sem conversão, execução via superpowers

5. Gate check (sem mudança)
```

### O que muda vs. hoje
- Hoje: após writing-plans, o plano fica isolado no Markdown — nenhuma ponte com dotcontext
- Agora: step 4 faz o handoff automático, sem intervenção manual

### O que NÃO muda
- Brainstorming e writing-plans continuam sendo do superpowers
- O plano Markdown original é preservado
- Gates e fases PREVC continuam iguais

## Seção 4: Execução via Dotcontext (prevc-execution)

**Onde fica:** `skills/prevc-execution/SKILL.md`

**Princípio:** Em Full Mode, o dotcontext é dono da execução inteira. O superpowers sai de cena após o writing-plans.

### Fluxo (Full Mode)

**Passo 1 — Obter sequência de agents:**
```
agent({ action: "getSequence", task: "<descrição geral>" })
```

Parâmetros validados (`agent.js` linhas 73-91, `types.d.ts` linha 15):
- `task`: string (opcional — usar task OU phases, não ambos)
- `phases`: PrevcPhase[] (opcional)
- `includeReview`: boolean (default true)

Retorna sequência ordenada. O orchestrator inclui automaticamente:
- `test-writer` (se não presente)
- `code-reviewer` (se includeReview true)
- `documentation-writer` (no final)

**Passo 2 — Para cada step, obter agent:**
```
agent({ action: "orchestrate", task: "<descrição do step>" })
```

Parâmetros validados (`agent.js` linhas 44-71, `types.d.ts` linha 15):
- `task`: string — usa SOMENTE task (não combinar com role/phase, usa o primeiro encontrado na ordem: task → phase → role)

Retorna: agent(s) recomendados + docs + playbook path.

**Passo 3 — Agent executa step seguindo playbook, depois atualiza progresso:**
```
plan({ action: "updateStep", planSlug, phaseId, stepIndex,
  status: "completed", output: "<resultado>", notes: "<decisões>" })
```
(Parâmetros já validados na Seção 2)

**Passo 4 — Handoff entre agents:**
```
workflow-manage({
  action: "handoff",
  from: "<agent-anterior>",
  to: "<próximo-agent>",
  artifacts: ["src/auth/handler.ts", "tests/auth.test.ts"]
})
```

Parâmetros validados (`workflowManage.js` linhas 57-84, `workflowManage.d.ts` linhas 8-23):
- `from`: string (obrigatório)
- `to`: string (obrigatório)
- `artifacts`: string[] (opcional)

Retorna: mensagem de confirmação + nextSuggestion.

**Passo 5 — Ao completar todos os steps:**
```
workflow-advance({ outputs: ["Todos os steps completados", "14 testes passando"] })
```

Parâmetros validados (`workflowAdvance.js` linhas 55-132, `workflowAdvance.d.ts` linhas 7-11):
- `outputs`: string[] (opcional)
- `force`: boolean (opcional)

Retorna: orchestration + quickStart da próxima fase.

### Papel de cada sistema por modo

| Fase | Full Mode | Lite Mode | Minimal Mode |
|---|---|---|---|
| Brainstorming | superpowers | superpowers | superpowers |
| Writing-plans | superpowers | superpowers | superpowers |
| Handoff | Seção 2 (scaffoldPlan + link) | Conversão manual | Não acontece |
| Execução | **dotcontext** | Playbooks manuais | superpowers |
| Validação | **dotcontext** | Playbooks manuais | superpowers |
| Confirmação | **dotcontext** | Manual | superpowers |

### O que resolve

| Problema | Solução |
|---|---|
| Agents começam "do zero" | `orchestrate` retorna agent + docs + playbook contextualizado |
| Contexto perdido entre agents | `handoff` com `artifacts` registra transição + artefatos |
| Sem rastreabilidade | `updateStep` com `output` e `notes` registra decisões por step |
| Avanço manual entre fases | `workflow-advance` com `outputs` verifica gates e retorna guia |

## Seção 5: Git Strategy Skill (devflow:git-strategy)

**Onde fica:** `skills/git-strategy/SKILL.md`

**Princípio:** Gate bloqueante auto-ativado antes de qualquer edição. Detecta a estratégia do projeto e aplica as regras corretas.

### 3 estratégias

| Estratégia | Isolamento | Branches protegidas |
|---|---|---|
| **branch-flow** | `git checkout -b <tipo>/<nome>` | Configurável (main, develop, ou ambas) |
| **worktree** | `git worktree add` | main, master, develop |
| **trunk-based** | Nenhum (commits diretos) | Nenhuma |

### Detecção automática

```
1. Ler .context/docs/development-workflow.md → campo gitStrategy
2. Se não existir, detectar:
   - Tem scripts/wt-create.sh? → worktree
   - Tem branch develop? (git branch --list develop) → branch-flow (main + develop)
   - Só main? → branch-flow (só main)
   - Nenhuma das anteriores → perguntar ao usuário
3. Se ambíguo → AskUserQuestion
```

### Configuração inicial (primeira execução)

```
AskUserQuestion:

  Pergunta 1:
    question: "Qual estratégia git deste projeto?"
    header: "Git"
    multiSelect: false
    options:
      - label: "Branch Flow (Recomendado)"
        description: "Branches protegidas + git checkout -b para isolamento"
      - label: "Worktree"
        description: "Isolamento total via git worktree add"
      - label: "Trunk-based"
        description: "Commits diretos na main, feature flags quando necessário"

  Pergunta 2 (se branch-flow):
    question: "Quais branches são protegidas?"
    header: "Protegidas"
    multiSelect: true
    options:
      - label: "main"
        description: "Branch de produção"
      - label: "develop"
        description: "Branch de integração"

  Pergunta 3:
    question: "Qual CLI para criação de PRs?"
    header: "CLI"
    multiSelect: false
    options:
      - label: "gh (GitHub)"
        description: "GitHub CLI para PRs"
      - label: "glab (GitLab)"
        description: "GitLab CLI para Merge Requests"
      - label: "Nenhuma"
        description: "Criar PRs manualmente pela interface web"
```

Respostas salvas em `.context/docs/development-workflow.md`.

### Fluxo (gate bloqueante antes de edição)

```
1. Verificar branch atual:
   git rev-parse --abbrev-ref HEAD

2. Se em branch protegida → BLOQUEAR edição

   AskUserQuestion:
     question: "Você está em branch protegida. Qual tipo de alteração?"
     header: "Branch"
     multiSelect: false
     options:
       - label: "Feature (Recomendado)"
         description: "Nova funcionalidade. Cria: feature/<nome>"
       - label: "Bugfix"
         description: "Correção de bug. Cria: fix/<nome>"
       - label: "Hotfix"
         description: "Correção urgente. Cria: hotfix/<nome>"
       - label: "Release"
         description: "Nova versão. Cria: release/<versão>"

3. Criar isolamento conforme estratégia:

   IF worktree:
     a. Se scripts/wt-create.sh existir:
          ./scripts/wt-create.sh <tipo> <nome>
        Senão (fallback manual):
          REPO_DIR=$(git rev-parse --show-toplevel)
          PARENT_DIR=$(dirname "$REPO_DIR")
          REPO_NAME=$(basename "$REPO_DIR")
          git worktree add "${PARENT_DIR}/${REPO_NAME}-<tipo>-<nome>" -b <tipo>/<nome>
     b. Verificar .gitignore:
          git check-ignore -q <diretório-worktree> || adicionar ao .gitignore
     c. Setup automático:
          [ -f package.json ] && npm install
          [ -f Cargo.toml ] && cargo build
          [ -f requirements.txt ] && pip install -r requirements.txt
          [ -f go.mod ] && go mod download
     d. Baseline tests:
          Rodar comando de test do projeto
          Se falhar → reportar e perguntar se continua
     e. PARAR e instruir:
          "Abra nova janela no worktree: code -n <path>"
     f. Disciplina: nunca editar arquivos de outra worktree (ler OK)

   ELIF branch-flow:
     a. git checkout -b <tipo>/<nome>
     b. Confirmar branch criada
     c. Prosseguir com edição

   ELIF trunk-based:
     a. Prosseguir direto
     b. Alertar sobre feature flags se funcionalidade incompleta

4. Se já em branch de trabalho (feature/*, fix/*, hotfix/*, release/*):
   Prosseguir
```

### Exceções (não aplicar gate)
- Operações de leitura (Read, Glob, Grep, git status/log/diff)
- Usuário explicitamente solicitar bypass
- Branch atual já é de trabalho
- Estratégia trunk-based

### Integração PREVC

```
[git-strategy gate] → P → R → E → V → C
```

### Finalização (pós-merge)

| Estratégia | Ação |
|---|---|
| worktree | `git worktree remove <path>` + `git branch -d <tipo>/<nome>` (ou `./scripts/wt-clean.sh`) |
| branch-flow | `git branch -d <tipo>/<nome>` |
| trunk-based | Nenhuma |

### PR creation (usa CLI configurada)

```
IF cli == "gh":
  gh pr create --title "..." --body "..."
ELIF cli == "glab":
  glab mr create --title "..." --description "..."
ELIF cli == nenhuma:
  Instruir usuário a criar manualmente
```

## Seção 6: Checkpoints e Rehydration via Hooks

**Onde fica:** `hooks/hooks.json` + `hooks/pre-compact` + `hooks/post-compact`

**Princípio:** Persistir estado continuamente e usar hooks para garantir rehydration automática após compactação.

### Hooks no hooks.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [{
          "type": "command",
          "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start"
        }]
      }
    ],
    "PreCompact": [
      {
        "matcher": "auto|manual",
        "hooks": [{
          "type": "command",
          "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" pre-compact"
        }]
      }
    ],
    "PostCompact": [
      {
        "matcher": "auto|manual",
        "hooks": [{
          "type": "command",
          "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" post-compact"
        }]
      }
    ]
  }
}
```

### Parte 1: Persistência contínua (durante execução)

Em cada momento significativo, salvar estado no campo `notes` do step via `updateStep`:

```
ANTES de iniciar step:
  plan({ action: "updateStep", planSlug, phaseId, stepIndex,
    status: "in_progress",
    notes: "Iniciando. Agent: backend-specialist."
  })

DURANTE step (a cada decisão):
  plan({ action: "updateStep", planSlug, phaseId, stepIndex,
    status: "in_progress",
    notes: "Criou schema users. Decidiu bcrypt cost 12. Próximo: handler."
  })

AO COMPLETAR step:
  plan({ action: "updateStep", planSlug, phaseId, stepIndex,
    status: "completed",
    output: "POST /auth/register funcionando",
    notes: "bcrypt cost 12, httpOnly cookies, 8 testes passando"
  })
```

### Parte 2: Hook pre-compact (salva snapshot)

```bash
#!/bin/bash
# hooks/pre-compact
CHECKPOINT_DIR=".context/workflow/.checkpoint"
mkdir -p "$CHECKPOINT_DIR" 2>/dev/null

cat > "$CHECKPOINT_DIR/last.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "last_commit": "$(git log --format='%h %s' -1 2>/dev/null || echo 'none')"
}
EOF
```

### Parte 3: Hook post-compact (injeta rehydration)

```bash
#!/bin/bash
# hooks/post-compact
# Output vai direto para o contexto do LLM (additionalContext)

CHECKPOINT=".context/workflow/.checkpoint/last.json"

echo "=== REHYDRATION OBRIGATÓRIA ==="
echo ""
echo "Contexto foi compactado. Antes de continuar, execute:"
echo ""
echo "1. workflow-status()"
echo "   → Fase atual e workflow ativo"
echo ""
echo "2. plan({ action: 'getStatus', planSlug: '<slug do workflow>' })"
echo "   → Steps completados, step atual, progresso"
echo ""
echo "3. plan({ action: 'getDetails', planSlug: '<slug>' })"
echo "   → Plano completo com notes de cada step (decisões e contexto)"
echo ""
echo "4. Se há step com status 'in_progress' → retomar de onde parou"
echo "   Se todos 'completed' na fase atual → workflow-advance()"

if [ -f "$CHECKPOINT" ]; then
  echo ""
  echo "Último snapshot:"
  cat "$CHECKPOINT"
fi
```

Parâmetros validados no código fonte:
- `workflow-status()`: `workflowStatus.js` linhas 49-90. Parâmetro opcional: `repoPath` (string).
- `plan({ action: "getStatus", planSlug })`: `plan.js` linhas 160-172. Parâmetro: `planSlug` (string, obrigatório).
- `plan({ action: "getDetails", planSlug })`: `plan.js` linhas 93-111. Parâmetro: `planSlug` (string, obrigatório).

### Fluxo completo

```
Execução normal
  → updateStep(notes) a cada decisão relevante
  ↓
Contexto cheio → PreCompact dispara
  → Salva snapshot (branch, último commit) em .checkpoint/last.json
  ↓
Compactação acontece → PostCompact dispara
  → Injeta instruções de rehydration no contexto do LLM
  ↓
LLM recebe instruções → executa rehydration
  → workflow-status()
  → plan({ action: "getStatus", planSlug })
  → plan({ action: "getDetails", planSlug })
  → Lê notes do step in_progress → retoma
```

### Por modo

| Modo | Persistência | Rehydration |
|---|---|---|
| Full | `updateStep` com notes via MCP | `getStatus` + `getDetails` via MCP |
| Lite | Edição manual de `.context/plans/<slug>.md` | Leitura do arquivo de plano |
| Minimal | Tasks do Claude Code | Sem rehydration (limitação aceita) |

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `skills/prevc-planning/SKILL.md` | Adicionar step 4 (handoff por modo) |
| `skills/prevc-execution/SKILL.md` | Reescrever Full Mode para usar dotcontext |
| `skills/git-strategy/SKILL.md` | **Novo** — skill de git strategy unificada |
| `hooks/hooks.json` | Adicionar PreCompact e PostCompact |
| `hooks/pre-compact` | **Novo** — salva snapshot |
| `hooks/post-compact` | **Novo** — injeta rehydration |
| `references/skills-map.md` | Adicionar git-strategy à tabela |

## Fora de Escopo

- Modificações no dotcontext MCP (usa APIs existentes)
- Modificações no superpowers (usa skills existentes)
- Suporte a MCP tools novos
- Rehydration em Minimal Mode

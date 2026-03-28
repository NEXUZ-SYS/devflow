# Superpowers ↔ Dotcontext Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DevFlow bridge superpowers brainstorming/planning to dotcontext execution, with git strategy and compaction resilience.

**Architecture:** Hook de transição no prevc-planning converte o plano do writing-plans para o dotcontext via MCP (scaffoldPlan + link). A execução passa inteiramente para o dotcontext com agent orchestration. Git strategy como gate bloqueante pré-PREVC. Hooks PreCompact/PostCompact para rehydration.

**Tech Stack:** Markdown skills, bash hooks, dotcontext MCP API, Claude Code hooks API

---

### Task 1: Atualizar prevc-planning com hook de transição

**Files:**
- Modify: `skills/prevc-planning/SKILL.md:82-127`

- [ ] **Step 1: Substituir Step 4 e Step 5 no prevc-planning**

Replace lines 82-127 in `skills/prevc-planning/SKILL.md` with:

```markdown
## Step 4: Write Plan

**REQUIRED SUB-SKILL:** Invoke `superpowers:writing-plans`

The plan follows superpowers format (bite-sized 2-5 minute tasks, TDD, DRY, YAGNI) but with DevFlow additions:

### Plan Header Extension
```markdown
# [Feature Name] Implementation Plan

> **DevFlow workflow:** [workflow-name] | **Scale:** [MEDIUM] | **Phase:** P→R

**Goal:** [One sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [Key technologies]
**Agents:** [Which agents will be involved in execution]

---
```

### Agent Annotations Per Task
For each task group, note which agent role is best suited:
```markdown
## Task Group: API Layer
**Agent:** backend-specialist
**Handoff from:** architect (after design review)

- [ ] Step 1: Write failing test for endpoint
- [ ] Step 2: Run test, confirm failure
...
```

## Step 5: Handoff to Dotcontext

After writing-plans generates the plan and the user approves:

### Full Mode
1. Read the complete spec from `docs/superpowers/specs/<file>.md`
2. Derive planName from the spec title (slugified)
3. Create the plan in dotcontext:
   ```
   context({ action: "scaffoldPlan", planName: "<slug>", title: "<spec title>", summary: "<FULL SPEC CONTENT>", semantic: true, autoFill: true })
   ```
4. Link to active workflow:
   ```
   plan({ action: "link", planSlug: "<slug>" })
   ```
5. Inform user: "Plan linked to dotcontext workflow. Ready for Review."

### Lite Mode
1. Convert the Markdown plan to dotcontext v2 format
2. Save as `.context/plans/<slug>.md`
3. Include the full spec as a section of the file
4. Track via Claude Code tasks

### Minimal Mode
No conversion — execution follows superpowers workflow.

## Step 6: Gate Check

The Planning phase gate requires:
- Design spec written and approved by user
- Implementation plan written
- Plan linked to workflow (Full mode) or saved to docs/

**When gate is met:** Announce readiness to advance. In Full mode:
```
workflow-advance()  # Moves to R phase
```
```

- [ ] **Step 2: Verificar que o arquivo ficou correto**

Run: Read `skills/prevc-planning/SKILL.md` and verify:
- Step 4 contains the writing-plans invocation with DevFlow additions
- Step 5 contains the handoff to dotcontext with the 3 modes
- Step 6 contains the gate check
- No references to `plan({ action: "scaffold" })` (old incorrect API)
- `context({ action: "scaffoldPlan" })` is used correctly

- [ ] **Step 3: Commit**

```bash
git add skills/prevc-planning/SKILL.md
git commit -m "feat(prevc-planning): add handoff to dotcontext after writing-plans"
```

---

### Task 2: Reescrever prevc-execution para Full Mode via dotcontext

**Files:**
- Modify: `skills/prevc-execution/SKILL.md` (full rewrite)

- [ ] **Step 1: Reescrever o SKILL.md completo**

Replace the entire content of `skills/prevc-execution/SKILL.md` with:

```markdown
---
name: prevc-execution
description: "Use during PREVC Execution phase — implements the approved plan using dotcontext agent orchestration (Full Mode) or superpowers SDD/TDD (Lite/Minimal)"
---

# PREVC Execution Phase

Implements the approved plan task-by-task using dotcontext agent orchestration in Full Mode, or superpowers-driven development in Lite/Minimal Mode.

**Announce at start:** "I'm using the devflow:prevc-execution skill for the Execution phase."

## Checklist

1. **Set up workspace** — git strategy gate (devflow:git-strategy)
2. **Load plan** — read and validate the implementation plan
3. **Determine execution mode** — Full (dotcontext) or Lite/Minimal (superpowers)
4. **Execute tasks** — agent-orchestrated or SDD/sequential
5. **Track progress** — update plan status after each task
6. **Gate check** — all tasks complete + all tests pass = ready to advance

## Step 1: Set Up Workspace

**REQUIRED SUB-SKILL:** Invoke `devflow:git-strategy`

The git strategy skill checks branch protection and creates the appropriate isolation (worktree, branch, or none) based on the project's configured strategy.

## Step 2: Load Plan

### Full Mode
```
plan({ action: "getDetails", planSlug: "<slug>" })
```
Review the plan from dotcontext. Verify steps are still valid.

### Lite Mode
Read `.context/plans/<slug>.md` and review.

### Minimal Mode
Read `docs/superpowers/plans/<file>.md` and review.

In all modes: raise concerns with user before starting.

## Step 3: Execution Mode

### Full Mode (dotcontext owns execution)

**Step 3a — Get agent sequence:**
```
agent({ action: "getSequence", task: "<plan description>" })
```
Returns ordered sequence. Automatically includes:
- `test-writer` (if not present)
- `code-reviewer` (if includeReview is true, which is the default)
- `documentation-writer` (at the end)

**Step 3b — For each step, get agent:**
```
agent({ action: "orchestrate", task: "<step description>" })
```
Returns recommended agent(s) with docs and playbook path. Uses ONLY `task` parameter (do not combine with `role` or `phase`).

**Step 3c — Agent executes step following its playbook**

**Step 3d — Update progress (continuously, not just at completion):**
```
plan({ action: "updateStep", planSlug: "<slug>", phaseId: "<id>", stepIndex: <n>,
  status: "in_progress",
  notes: "<decisions made so far, what's next>"
})
```

On completion:
```
plan({ action: "updateStep", planSlug: "<slug>", phaseId: "<id>", stepIndex: <n>,
  status: "completed",
  output: "<step result>",
  notes: "<decisions, rationale, test results>"
})
```

**Step 3e — Handoff between agents (when agent changes between steps):**
```
workflow-manage({ action: "handoff", from: "<previous-agent>", to: "<next-agent>",
  artifacts: ["src/path/file.ts", "tests/path/test.ts"]
})
```

**Step 3f — After all steps complete:**
```
workflow-advance({ outputs: ["All steps completed", "N tests passing"] })
```
Returns orchestration + quickStart for the next phase.

### Lite Mode
Read the relevant agent playbook before each task group:
- `.context/agents/<agent-name>.md`
- Apply the agent's workflow steps and best practices
- Track progress by editing `.context/plans/<slug>.md`

### Minimal Mode
**REQUIRED SUB-SKILL:** Invoke `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` (sequential).

Execute tasks per superpowers workflow without agent guidance.

## Step 4: Gate Check

The Execution phase gate requires:
- All plan tasks completed
- All tests passing
- No unresolved review findings
- Code committed to feature branch

**When gate is met:**

Full mode:
```
workflow-advance()  # Moves to V phase
```

## LARGE Scale: Checkpoints

For LARGE scale workflows, add checkpoints every 3-5 tasks:
- Pause execution
- Present progress summary to user
- Get approval to continue
- Adjust remaining plan if needed

## Anti-Patterns

| Thought | Reality |
|---------|---------|
| "I'll skip the agent sequence" | Agents catch domain-specific issues. Use orchestrate. |
| "Notes in updateStep are optional" | Notes are critical for rehydration after compaction. Always write them. |
| "Agent handoffs are overhead" | Handoffs with artifacts prevent context loss between specialists. |
| "The plan changed, I'll adapt on the fly" | Update the plan document first. Then execute the updated plan. |
```

- [ ] **Step 2: Verificar que o arquivo ficou correto**

Run: Read `skills/prevc-execution/SKILL.md` and verify:
- Full Mode uses `agent({ action: "getSequence" })` and `agent({ action: "orchestrate" })`
- `updateStep` includes `notes` for rehydration
- `workflow-manage({ action: "handoff" })` includes `artifacts`
- `workflow-advance({ outputs })` at the end
- Lite Mode references `.context/agents/` and `.context/plans/`
- Minimal Mode falls back to superpowers
- No references to `superpowers:test-driven-development` in Full Mode
- Git strategy replaces `superpowers:using-git-worktrees` in Step 1

- [ ] **Step 3: Commit**

```bash
git add skills/prevc-execution/SKILL.md
git commit -m "feat(prevc-execution): rewrite Full Mode to use dotcontext agent orchestration"
```

---

### Task 3: Criar skill git-strategy

**Files:**
- Create: `skills/git-strategy/SKILL.md`

- [ ] **Step 1: Criar diretório**

```bash
mkdir -p skills/git-strategy
```

- [ ] **Step 2: Escrever SKILL.md**

Create `skills/git-strategy/SKILL.md` with:

```markdown
---
name: git-strategy
description: "Gate bloqueante auto-ativado antes de qualquer edição. Detecta a estratégia git do projeto e aplica branch protection + isolamento."
---

# Git Strategy

⛔ **REGRA BLOQUEANTE**: Esta verificação DEVE ser executada ANTES de qualquer edição de arquivo.

**Announce at start:** "I'm using the devflow:git-strategy skill to verify branch safety."

## 3 Estratégias Suportadas

| Estratégia | Isolamento | Branches protegidas |
|---|---|---|
| **branch-flow** | `git checkout -b <tipo>/<nome>` | Configurável (main, develop, ou ambas) |
| **worktree** | `git worktree add` | main, master, develop |
| **trunk-based** | Nenhum (commits diretos) | Nenhuma |

## Detecção Automática

```
1. Ler .context/docs/development-workflow.md → campo gitStrategy
2. Se não existir, detectar:
   - Tem scripts/wt-create.sh? → worktree
   - Tem branch develop? (git branch --list develop) → branch-flow (main + develop)
   - Só main? → branch-flow (só main)
   - Nenhuma das anteriores → perguntar ao usuário
3. Se ambíguo → AskUserQuestion
```

## Configuração Inicial (primeira execução)

Se nenhuma estratégia configurada, perguntar ao usuário:

**Pergunta 1:**
```
AskUserQuestion:
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
```

**Pergunta 2 (se branch-flow):**
```
AskUserQuestion:
  question: "Quais branches são protegidas?"
  header: "Protegidas"
  multiSelect: true
  options:
    - label: "main"
      description: "Branch de produção"
    - label: "develop"
      description: "Branch de integração"
```

**Pergunta 3:**
```
AskUserQuestion:
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

## Fluxo (gate bloqueante)

### 1. Verificar Branch Atual

```bash
git rev-parse --abbrev-ref HEAD
```

### 2. Se em Branch Protegida → BLOQUEAR

```
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
```

### 3. Criar Isolamento

**IF worktree:**

a. Se `scripts/wt-create.sh` existir:
```bash
./scripts/wt-create.sh <tipo> <nome>
```

Senão (fallback manual):
```bash
REPO_DIR=$(git rev-parse --show-toplevel)
PARENT_DIR=$(dirname "$REPO_DIR")
REPO_NAME=$(basename "$REPO_DIR")
git worktree add "${PARENT_DIR}/${REPO_NAME}-<tipo>-<nome>" -b <tipo>/<nome>
```

b. Verificar .gitignore:
```bash
git check-ignore -q <diretório-worktree> || echo "<diretório>" >> .gitignore
```

c. Setup automático:
```bash
[ -f package.json ] && npm install
[ -f Cargo.toml ] && cargo build
[ -f requirements.txt ] && pip install -r requirements.txt
[ -f go.mod ] && go mod download
```

d. Baseline tests — rodar e reportar. Se falhar, perguntar se continua.

e. PARAR e instruir: "Abra nova janela no worktree: `code -n <path>`"

f. Disciplina: nunca editar arquivos de outra worktree (ler OK, editar NÃO).

**ELIF branch-flow:**

```bash
git checkout -b <tipo>/<nome>
```
Confirmar branch criada, prosseguir.

**ELIF trunk-based:**

Prosseguir direto. Alertar sobre feature flags se funcionalidade incompleta.

### 4. Se Já em Branch de Trabalho

Se branch atual é `feature/*`, `fix/*`, `hotfix/*`, ou `release/*` → prosseguir sem gate.

## Exceções

Não aplicar gate quando:
- Operações de leitura (Read, Glob, Grep, git status/log/diff)
- Usuário explicitamente solicitar bypass
- Branch atual já é de trabalho
- Estratégia trunk-based

## Finalização (pós-merge)

| Estratégia | Ação |
|---|---|
| worktree | `git worktree remove <path>` + `git branch -d <tipo>/<nome>` (ou `./scripts/wt-clean.sh`) |
| branch-flow | `git branch -d <tipo>/<nome>` |
| trunk-based | Nenhuma |

## PR Creation (usa CLI configurada)

```
IF cli == "gh":
  gh pr create --title "..." --body "..."
ELIF cli == "glab":
  glab mr create --title "..." --description "..."
ELIF cli == nenhuma:
  Instruir usuário a criar manualmente
```

## Integração PREVC

```
[git-strategy gate] → P → R → E → V → C
```
```

- [ ] **Step 3: Verificar que o arquivo existe e está correto**

Run: Read `skills/git-strategy/SKILL.md` and verify:
- 3 estratégias definidas (branch-flow, worktree, trunk-based)
- Detecção automática com fallback para AskUserQuestion
- Configuração inicial com 3 perguntas
- Fluxo gate bloqueante com 4 passos
- Exceções listadas
- Finalização por estratégia
- PR creation com CLI configurada

- [ ] **Step 4: Commit**

```bash
git add skills/git-strategy/SKILL.md
git commit -m "feat: add git-strategy skill with branch-flow, worktree, and trunk-based support"
```

---

### Task 4: Adicionar hooks PreCompact e PostCompact

**Files:**
- Modify: `hooks/hooks.json`
- Create: `hooks/pre-compact`
- Create: `hooks/post-compact`

- [ ] **Step 1: Atualizar hooks.json**

Replace the entire content of `hooks/hooks.json` with:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "async": false
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "auto|manual",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" pre-compact",
            "async": false
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "matcher": "auto|manual",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" post-compact",
            "async": false
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Verificar JSON válido**

Run: `cat hooks/hooks.json | python3 -m json.tool`
Expected: valid JSON output with SessionStart, PreCompact, PostCompact

- [ ] **Step 3: Criar hook pre-compact**

Create `hooks/pre-compact` with:

```bash
#!/usr/bin/env bash
# DevFlow PreCompact hook
# Saves a minimal snapshot before context compaction

set -euo pipefail

CHECKPOINT_DIR=".context/workflow/.checkpoint"
mkdir -p "$CHECKPOINT_DIR" 2>/dev/null || true

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "unknown")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log --format='%h %s' -1 2>/dev/null || echo "none")

cat > "$CHECKPOINT_DIR/last.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "branch": "$BRANCH",
  "last_commit": "$LAST_COMMIT"
}
EOF

exit 0
```

- [ ] **Step 4: Tornar executável**

```bash
chmod +x hooks/pre-compact
```

- [ ] **Step 5: Criar hook post-compact**

Create `hooks/post-compact` with:

```bash
#!/usr/bin/env bash
# DevFlow PostCompact hook
# Injects rehydration instructions into LLM context after compaction

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CHECKPOINT=".context/workflow/.checkpoint/last.json"

# --- Build rehydration context ---

rehydration="REHYDRATION OBRIGATÓRIA — Contexto foi compactado.

Antes de continuar qualquer tarefa, execute na ordem:

1. workflow-status()
   Retorna: fase atual, workflow ativo, progresso

2. plan({ action: \"getStatus\", planSlug: \"<slug do workflow>\" })
   Retorna: steps completados, step atual, porcentagem

3. plan({ action: \"getDetails\", planSlug: \"<slug>\" })
   Retorna: plano completo com notes de cada step (decisões e contexto)

4. Se há step com status in_progress → retomar de onde parou
   Se todos completed na fase atual → workflow-advance()"

if [ -f "$CHECKPOINT" ]; then
  checkpoint_content=$(cat "$CHECKPOINT" 2>/dev/null || echo "{}")
  rehydration="$rehydration

Último snapshot:
$checkpoint_content"
fi

# --- Escape for JSON ---

escape_for_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\n'/\\n}"
    s="${s//$'\r'/\\r}"
    s="${s//$'\t'/\\t}"
    printf '%s' "$s"
}

rehydration_escaped=$(escape_for_json "$rehydration")

# --- Output ---

if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "PostCompact",\n    "additionalContext": "%s"\n  }\n}\n' "$rehydration_escaped"
else
  printf '{\n  "additional_context": "%s"\n}\n' "$rehydration_escaped"
fi

exit 0
```

- [ ] **Step 6: Tornar executável**

```bash
chmod +x hooks/post-compact
```

- [ ] **Step 7: Commit**

```bash
git add hooks/hooks.json hooks/pre-compact hooks/post-compact
git commit -m "feat: add PreCompact/PostCompact hooks for checkpoint and rehydration"
```

---

### Task 5: Atualizar skills-map com git-strategy

**Files:**
- Modify: `references/skills-map.md:17-25`

- [ ] **Step 1: Adicionar git-strategy à tabela Workflow & Orchestration**

In `references/skills-map.md`, add a new row after `prevc-confirmation` in the "Workflow & Orchestration" table:

```markdown
| git-strategy | devflow | `devflow:git-strategy` | P | Minimal | Git strategy gate: branch protection + isolation (branch-flow/worktree/trunk-based) |
```

- [ ] **Step 2: Atualizar a composição de skills**

In the "How Skills Compose" section, replace line 101:
```markdown
  │   │   ├─ superpowers:subagent-driven-development (task dispatch)
```
with:
```markdown
  │   │   ├─ devflow:git-strategy (workspace isolation)
  │   │   ├─ agent orchestration via dotcontext (Full Mode)
```

- [ ] **Step 3: Atualizar Quick Reference**

Add to the "Quick Reference" table:

```markdown
| Check git strategy / branch safety | `devflow:git-strategy` |
```

- [ ] **Step 4: Verificar que não há referências quebradas**

Run: Read `references/skills-map.md` and verify:
- `git-strategy` appears in the Workflow & Orchestration table
- Composition section reflects dotcontext execution in Full Mode
- Quick Reference includes git-strategy

- [ ] **Step 5: Commit**

```bash
git add references/skills-map.md
git commit -m "docs: add git-strategy to skills map and update composition diagram"
```

---

### Task 6: Verificação final

**Files:**
- Read: all modified files

- [ ] **Step 1: Verificar integridade dos arquivos**

Read and verify each file:
1. `skills/prevc-planning/SKILL.md` — Step 5 has handoff logic with 3 modes
2. `skills/prevc-execution/SKILL.md` — Full Mode uses dotcontext, Lite/Minimal uses superpowers
3. `skills/git-strategy/SKILL.md` — 3 strategies, gate bloqueante, AskUserQuestion
4. `hooks/hooks.json` — SessionStart + PreCompact + PostCompact
5. `hooks/pre-compact` — saves snapshot, executable
6. `hooks/post-compact` — injects rehydration, executable
7. `references/skills-map.md` — git-strategy listed

- [ ] **Step 2: Verificar que hooks são executáveis**

```bash
ls -la hooks/pre-compact hooks/post-compact hooks/session-start
```

Expected: all three have executable permissions (-rwxr-xr-x or similar)

- [ ] **Step 3: Verificar JSON válido no hooks.json**

```bash
cat hooks/hooks.json | python3 -m json.tool > /dev/null && echo "VALID" || echo "INVALID"
```

Expected: VALID

- [ ] **Step 4: Verificar que não há comandos MCP incorretos nos skills**

Search for old incorrect API calls:
```bash
grep -r "plan.*scaffold" skills/ --include="*.md"
grep -r "planId" skills/ --include="*.md"
```

Expected: no matches (old `plan({ action: "scaffold" })` and `planId` removed)

- [ ] **Step 5: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```

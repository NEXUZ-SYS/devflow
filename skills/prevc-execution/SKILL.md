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

### Autonomy Check (before execution mode)

If the workflow has `autonomy: assisted` or `autonomy: autonomous`:

1. Verify `.context/workflow/stories.yaml` exists
2. If exists: **REQUIRED SUB-SKILL:** Invoke `devflow:autonomous-loop`
3. If not exists: Fall back to standard execution (stories.yaml should have been generated in Planning)
4. After the autonomous loop completes:
   - If all stories completed → proceed to Gate Check (Step 4)
   - If stories were escalated → human resolves, then resume loop or proceed to Gate Check

**Skip the rest of Step 3** when autonomous-loop is invoked — the loop handles agent dispatch, TDD, and progress tracking internally.

For `autonomy: supervised`, continue with the standard execution flow below.

### TDD Enforcement (ALL modes, ALL autonomy levels)

<HARD-GATE>
TDD is mandatory for EVERY task in EVERY mode. No exceptions. No "this is too small for TDD." The sequence is iron-clad:

1. **RED** — Write failing test BEFORE any production code
2. **Run** — Verify it fails for the RIGHT reason (not a syntax error)
3. **GREEN** — Write minimal code to make the test pass
4. **Run** — Verify all tests pass
5. **REFACTOR** — Clean up while keeping tests green

This applies to:
- Supervised mode (human checkpoints, but test-first ordering is enforced)
- Assisted mode (autonomous-loop enforces internally)
- Autonomous mode (autonomous-loop enforces internally)
- Full, Lite, AND Minimal modes

**REQUIRED SUB-SKILL:** Invoke `superpowers:test-driven-development` for each task group.

**Test types required per task:**
| Task touches... | Required test types |
|-----------------|-------------------|
| Pure functions, utilities, business logic | Unit tests |
| API endpoints, DB queries, service boundaries | Unit + Integration tests |
| Auth flows, payments, user registration, onboarding | Unit + Integration + E2E tests |
| UI components (rendering) | Unit + Snapshot tests |
| CLI scripts, hooks | Unit + E2E tests (execute real script) |

**When E2E is mandatory:**
- The task involves authentication or authorization
- The task involves payment or financial transactions
- The task involves user registration or onboarding
- The task modifies a critical user-facing flow (checkout, data export, account deletion)
- The task involves CLI tools or shell scripts that users run directly

If the plan does not include test tasks before implementation tasks, **stop and fix the plan** before executing.
</HARD-GATE>

### Escalação de decisões de segurança (B6, ALL modes)

Ao implementar código que toca um **padrão de segurança**, você NÃO pode decidir
silenciosamente sozinho — **sinalize e escale** a decisão de segurança (ao operador no
modo supervised/assisted; via `status: escalated` + nota no modo autonomous). Gatilhos:

- **Injection** — construção de SQL/NoSQL/shell/LDAP a partir de input (use queries
  parametrizadas; nunca string-interpolada).
- **Authz/autorização** — quem pode fazer o quê; o ator é sempre o `uid` do token
  validado server-side, nunca um ID vindo do cliente.
- **Autenticação, secrets e cripto** — manuseio de tokens/senhas/chaves, escolha de
  algoritmo (SHA-256+/argon2id/AES-GCM), comparação com `timingSafeEqual`, secrets fora
  do código.
- **Desserialização/validação de input externo** (HTTP, fila, webhook, output de LLM).

O linter `std-security` (enforçado por **default**, `activation: always`) sinaliza os
vetores mecânicos (SQL string-interpolada, `dangerouslySetInnerHTML`), mas o julgamento
de authz/cripto/design é humano: na dúvida, **pare e escale** — não "resolva" uma questão
de segurança para destravar o loop. Um achado de segurança é um dos gatilhos de escalação
para o humano mesmo no modo autonomous.

### Full Mode (dotcontext owns execution)

**Step 3a — Get agent sequence:**
```
agent({ action: "getSequence", task: "<plan description>" })
```
Returns ordered sequence. Automatically includes:
- `test-writer` **BEFORE** any implementation agent (enforces RED before GREEN)
- `code-reviewer` (if includeReview is true, which is the default)
- `documentation-writer` (at the end)

**Sequence enforcement:** For each task group, test-writer must produce failing tests BEFORE the implementation agent writes code. If the sequence returned by dotcontext places test-writer after an implementation agent, reorder it.

**Step 3b — For each step, get agent:**
```
agent({ action: "orchestrate", task: "<step description>" })
```
Returns recommended agent(s) with docs and playbook path. Uses ONLY `task` parameter (do not combine with `role` or `phase`).

**Step 3c — Agent executes step following its playbook**

**Step 3d — Update progress (continuously, not just at completion):**

> `phaseId` and `stepIndex` are obtained from `plan({ action: "getDetails" })` response.

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

### Captura de decisão emergente (passiva — não interrompe o loop)

Se durante a implementação surgir uma **decisão arquitetural não prevista no plano** (escolha de lib/contrato, desvio de design), registre-a para o sweep do Confirmation, sem parar o trabalho:

```bash
node -e "import('${CLAUDE_PLUGIN_ROOT}/scripts/lib/adr-pending.mjs').then(m => m.appendCandidate(process.cwd(), { phrase: '<frase-chave da decisão>', phase: 'E', relatedAdr: '<adrName ou vazio>' }))"
```
Use `relatedAdr` (o `name` da ADR) quando a decisão tocar uma ADR existente; deixe vazio caso contrário. A dedup é automática.

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
- All tests passing (unit + integration + E2E where applicable)
- Test-first ordering verified: every implementation task has a preceding test task
- No unresolved review findings
- Code committed to feature branch

**When gate is met:**

### Full Mode
```
workflow-advance()  # Moves to V phase
```

### Lite Mode
Mark the plan as complete in `.context/plans/<slug>.md`. Update task checkboxes.

### Minimal Mode
Verify all superpowers review stages passed. Plan document updated with completion status.

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

## Model role (omp)

Quando `detect-runtime` = `omp`, selecione o model role conforme `omp/omp-roles.yaml`:
- execução TDD → `default`; fan-out de subagents → `pi/smol`
No Claude Code esta seção é inerte.

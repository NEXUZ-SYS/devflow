# Plano de Implementação: Commit & Finalização de Branch via Hook PostToolUse

> **Para workers agentic:** SUB-SKILL OBRIGATÓRIA: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano task-by-task. Steps usam checkbox (`- [ ]`) para tracking.

**Objetivo:** Estender o hook `post-tool-use` para oferecer commit e finalização de branch automaticamente após tasks completadas, respeitando o modo de autonomia.

**Arquitetura:** O hook lê stdin do Claude Code (JSON com tool_name e tool_input), detecta `TaskUpdate(status: completed)`, consulta estado do git e autonomia, e injeta instruções condicionais para o LLM agir conforme o modo.

**Tech Stack:** Bash, python3 (inline JSON parsing), i18n existente (locales/*/messages.sh)

---

### Task 1: Adicionar mensagens i18n nos 3 locales

**Arquivos:**
- Modificar: `locales/en-US/messages.sh`
- Modificar: `locales/pt-BR/messages.sh`
- Modificar: `locales/es-ES/messages.sh`

- [ ] **Step 1: Adicionar mensagens em en-US**

Adicionar ao final de `locales/en-US/messages.sh`:

```bash
# --- Post Tool Use (Commit & Branch Finish) ---
MSG_COMMIT_PROMPT="COMMIT PROMPT: There are uncommitted changes after completing a task. Ask the user via AskUserQuestion:\nQuestion: \"Do you want to commit the current changes?\"\nOptions: \"Yes, commit now\" / \"No, keep working\"\nIf Yes → generate a conventional commit message (invoke devflow:commit-message skill for format), stage relevant files, and commit."
MSG_COMMIT_AUTO="COMMIT AUTO: There are uncommitted changes after completing a task. Commit automatically:\n1. Stage relevant files (not .env or credentials)\n2. Generate conventional commit message (devflow:commit-message format)\n3. Commit and report what was committed."
MSG_BRANCH_FINISH_PROMPT_SUPERVISED="BRANCH FINISH: You are on work branch '{branch}'. All changes are committed. Ask the user via AskUserQuestion:\nQuestion: \"Do you want to finalize the branch?\"\nOptions: \"Yes, finalize\" / \"No, keep working\"\nIf Yes → execute finalization pipeline with sub-confirmations for each step:\n  1. README update (if README.md exists) → ask before updating\n  2. Version bump (if scripts/bump-version.sh or package.json with version exists) → ask patch/minor/major\n  3. Commit final changes\n  4. Push to remote\n  5. Merge into base branch\n  6. Cleanup branch\nReport summary at the end."
MSG_BRANCH_FINISH_PROMPT_ASSISTED="BRANCH FINISH: You are on work branch '{branch}'. All changes are committed. Ask the user via AskUserQuestion:\nQuestion: \"Do you want to finalize the branch?\"\nOptions: \"Yes, finalize\" / \"No, keep working\"\nIf Yes → execute full finalization pipeline automatically:\n  1. Update README if needed (report changes)\n  2. Bump version (patch default)\n  3. Commit final changes\n  4. Push to remote\n  5. Merge into base branch\n  6. Cleanup branch\n  7. Report complete summary."
MSG_BRANCH_FINISH_AUTO="BRANCH FINISH AUTO: You are on work branch '{branch}'. All changes are committed. Execute full finalization pipeline automatically:\n  1. Update README if needed (report changes)\n  2. Bump version (patch default)\n  3. Commit final changes\n  4. Push to remote\n  5. Merge into base branch\n  6. Cleanup branch\n  7. Report complete summary.\nOn any failure (test failure, merge conflict, push rejected): STOP and escalate to user."
```

- [ ] **Step 2: Adicionar mensagens em pt-BR**

Adicionar ao final de `locales/pt-BR/messages.sh`:

```bash
# --- Post Tool Use (Commit & Branch Finish) ---
MSG_COMMIT_PROMPT="COMMIT PROMPT: Há mudanças não commitadas após completar uma task. Pergunte ao usuário via AskUserQuestion:\nPergunta: \"Quer realizar o commit das mudanças atuais?\"\nOpções: \"Sim, commitar agora\" / \"Não, continuar trabalhando\"\nSe Sim → gere mensagem convencional (invoque skill devflow:commit-message para formato), faça stage dos arquivos relevantes e commite."
MSG_COMMIT_AUTO="COMMIT AUTO: Há mudanças não commitadas após completar uma task. Commite automaticamente:\n1. Faça stage dos arquivos relevantes (não .env ou credenciais)\n2. Gere mensagem de commit convencional (formato devflow:commit-message)\n3. Commite e reporte o que foi commitado."
MSG_BRANCH_FINISH_PROMPT_SUPERVISED="BRANCH FINISH: Você está na branch de trabalho '{branch}'. Todas as mudanças estão commitadas. Pergunte ao usuário via AskUserQuestion:\nPergunta: \"Quer finalizar a branch?\"\nOpções: \"Sim, finalizar\" / \"Não, continuar trabalhando\"\nSe Sim → execute a pipeline de finalização com sub-confirmações para cada etapa:\n  1. Atualização do README (se README.md existe) → pergunte antes de atualizar\n  2. Bump de versão (se scripts/bump-version.sh ou package.json com version existe) → pergunte patch/minor/major\n  3. Commit das mudanças finais\n  4. Push para o remoto\n  5. Merge na branch base\n  6. Limpeza da branch\nReporte resumo ao final."
MSG_BRANCH_FINISH_PROMPT_ASSISTED="BRANCH FINISH: Você está na branch de trabalho '{branch}'. Todas as mudanças estão commitadas. Pergunte ao usuário via AskUserQuestion:\nPergunta: \"Quer finalizar a branch?\"\nOpções: \"Sim, finalizar\" / \"Não, continuar trabalhando\"\nSe Sim → execute a pipeline de finalização automaticamente:\n  1. Atualize README se necessário (reporte mudanças)\n  2. Bump de versão (patch default)\n  3. Commit das mudanças finais\n  4. Push para o remoto\n  5. Merge na branch base\n  6. Limpeza da branch\n  7. Reporte resumo completo."
MSG_BRANCH_FINISH_AUTO="BRANCH FINISH AUTO: Você está na branch de trabalho '{branch}'. Todas as mudanças estão commitadas. Execute a pipeline de finalização automaticamente:\n  1. Atualize README se necessário (reporte mudanças)\n  2. Bump de versão (patch default)\n  3. Commit das mudanças finais\n  4. Push para o remoto\n  5. Merge na branch base\n  6. Limpeza da branch\n  7. Reporte resumo completo.\nEm caso de falha (teste quebrado, merge conflict, push rejeitado): PARE e escale para o usuário."
```

- [ ] **Step 3: Adicionar mensagens em es-ES**

Adicionar ao final de `locales/es-ES/messages.sh`:

```bash
# --- Post Tool Use (Commit & Branch Finish) ---
MSG_COMMIT_PROMPT="COMMIT PROMPT: Hay cambios sin commitear después de completar una task. Pregunta al usuario via AskUserQuestion:\nPregunta: \"¿Quieres realizar el commit de los cambios actuales?\"\nOpciones: \"Sí, commitear ahora\" / \"No, seguir trabajando\"\nSi Sí → genera mensaje convencional (invoca skill devflow:commit-message para formato), haz stage de los archivos relevantes y commitea."
MSG_COMMIT_AUTO="COMMIT AUTO: Hay cambios sin commitear después de completar una task. Commitea automáticamente:\n1. Haz stage de los archivos relevantes (no .env ni credenciales)\n2. Genera mensaje de commit convencional (formato devflow:commit-message)\n3. Commitea y reporta lo que fue commiteado."
MSG_BRANCH_FINISH_PROMPT_SUPERVISED="BRANCH FINISH: Estás en la branch de trabajo '{branch}'. Todos los cambios están commiteados. Pregunta al usuario via AskUserQuestion:\nPregunta: \"¿Quieres finalizar la branch?\"\nOpciones: \"Sí, finalizar\" / \"No, seguir trabajando\"\nSi Sí → ejecuta la pipeline de finalización con sub-confirmaciones para cada paso:\n  1. Actualización del README (si README.md existe) → pregunta antes de actualizar\n  2. Bump de versión (si scripts/bump-version.sh o package.json con version existe) → pregunta patch/minor/major\n  3. Commit de los cambios finales\n  4. Push al remoto\n  5. Merge en la branch base\n  6. Limpieza de la branch\nReporta resumen al final."
MSG_BRANCH_FINISH_PROMPT_ASSISTED="BRANCH FINISH: Estás en la branch de trabajo '{branch}'. Todos los cambios están commiteados. Pregunta al usuario via AskUserQuestion:\nPregunta: \"¿Quieres finalizar la branch?\"\nOpciones: \"Sí, finalizar\" / \"No, seguir trabajando\"\nSi Sí → ejecuta la pipeline de finalización automáticamente:\n  1. Actualiza README si es necesario (reporta cambios)\n  2. Bump de versión (patch default)\n  3. Commit de los cambios finales\n  4. Push al remoto\n  5. Merge en la branch base\n  6. Limpieza de la branch\n  7. Reporta resumen completo."
MSG_BRANCH_FINISH_AUTO="BRANCH FINISH AUTO: Estás en la branch de trabajo '{branch}'. Todos los cambios están commiteados. Ejecuta la pipeline de finalización automáticamente:\n  1. Actualiza README si es necesario (reporta cambios)\n  2. Bump de versión (patch default)\n  3. Commit de los cambios finales\n  4. Push al remoto\n  5. Merge en la branch base\n  6. Limpieza de la branch\n  7. Reporta resumen completo.\nEn caso de fallo (test roto, merge conflict, push rechazado): PARA y escala al usuario."
```

- [ ] **Step 4: Commitar**

```bash
git add locales/en-US/messages.sh locales/pt-BR/messages.sh locales/es-ES/messages.sh
git commit -m "feat(i18n): add commit prompt and branch finish messages for all locales"
```

---

### Task 2: Reescrever hook post-tool-use com detecção condicional

**Arquivos:**
- Modificar: `hooks/post-tool-use`

- [ ] **Step 1: Reescrever o hook completo**

O hook precisa:
1. Ler stdin (JSON do Claude Code com `tool_name` e `tool_input`)
2. Verificar se é `TaskUpdate` com `status: completed` — se não, emitir apenas o handoff reminder existente
3. Se é TaskUpdate completed:
   a. Checar `git diff --name-only` para mudanças pendentes
   b. Checar branch atual (`git rev-parse --abbrev-ref HEAD`)
   c. Ler autonomia de `.context/workflow/status.yaml`
   d. Detectar capacidades do projeto (README, bump, PR CLI)
   e. Montar a instrução apropriada (commit prompt ou branch finish)
4. Emitir JSON com `additionalContext` contendo handoff + instrução condicional

```bash
#!/usr/bin/env bash
# DevFlow PostToolUse hook
# 1. Injects handoff reminder (always)
# 2. After TaskUpdate(completed): detects uncommitted changes and branch state,
#    injects commit/finish prompts based on autonomy mode

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Load i18n ---

source "${SCRIPT_DIR}/i18n.sh"
load_i18n

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

# --- Read stdin ---

INPUT=$(cat)

TOOL_NAME=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('tool_name', ''))
" 2>/dev/null || echo "")

TASK_STATUS=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
ti = d.get('tool_input', {})
print(ti.get('status', ''))
" 2>/dev/null || echo "")

# --- Always include handoff reminder ---

reminder="$MSG_HANDOFF_REMINDER"

# --- Check if this is TaskUpdate with status=completed ---

if [ "$TOOL_NAME" = "TaskUpdate" ] && [ "$TASK_STATUS" = "completed" ]; then

  # --- Detect git state ---

  CWD=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('cwd', ''))
" 2>/dev/null || echo "$PWD")

  GIT_CHANGES=$(git -C "$CWD" diff --name-only 2>/dev/null || echo "")
  GIT_STAGED=$(git -C "$CWD" diff --cached --name-only 2>/dev/null || echo "")
  BRANCH=$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

  HAS_CHANGES=false
  if [ -n "$GIT_CHANGES" ] || [ -n "$GIT_STAGED" ]; then
    HAS_CHANGES=true
  fi

  # --- Detect work branch ---

  IS_WORK_BRANCH=false
  case "$BRANCH" in
    feature/*|fix/*|hotfix/*|release/*) IS_WORK_BRANCH=true ;;
  esac

  # --- Detect autonomy mode ---

  AUTONOMY="supervised"
  STATUS_FILE="$CWD/.context/workflow/status.yaml"
  if [ -f "$STATUS_FILE" ]; then
    detected_autonomy=$(grep -i 'autonomy' "$STATUS_FILE" 2>/dev/null \
      | sed 's/.*autonomy[[:space:]]*:[[:space:]]*//' \
      | tr -d '[:space:]"' \
      | head -1 || echo "")
    if [ -n "$detected_autonomy" ]; then
      AUTONOMY="$detected_autonomy"
    fi
  fi

  # --- Detect project capabilities ---

  HAS_README=false
  HAS_BUMP=false

  [ -f "$CWD/README.md" ] && HAS_README=true

  if [ -f "$CWD/scripts/bump-version.sh" ]; then
    HAS_BUMP=true
  elif [ -f "$CWD/package.json" ] && grep -q '"version"' "$CWD/package.json" 2>/dev/null; then
    HAS_BUMP=true
  fi

  # --- Build conditional instruction ---

  extra_instruction=""

  if [ "$HAS_CHANGES" = "true" ]; then
    # Scenario 1: uncommitted changes → commit prompt
    case "$AUTONOMY" in
      supervised)
        extra_instruction="$MSG_COMMIT_PROMPT"
        ;;
      assisted|autonomous)
        extra_instruction="$MSG_COMMIT_AUTO"
        ;;
    esac
  elif [ "$IS_WORK_BRANCH" = "true" ]; then
    # Scenario 2: work branch, all committed → branch finish prompt
    # Add capability info
    cap_info="Project capabilities: README=${HAS_README}, BUMP=${HAS_BUMP}"

    case "$AUTONOMY" in
      supervised)
        extra_instruction=$(render_msg "$MSG_BRANCH_FINISH_PROMPT_SUPERVISED" "branch=${BRANCH}")
        extra_instruction="${extra_instruction}\n${cap_info}"
        ;;
      assisted)
        extra_instruction=$(render_msg "$MSG_BRANCH_FINISH_PROMPT_ASSISTED" "branch=${BRANCH}")
        extra_instruction="${extra_instruction}\n${cap_info}"
        ;;
      autonomous)
        extra_instruction=$(render_msg "$MSG_BRANCH_FINISH_AUTO" "branch=${BRANCH}")
        extra_instruction="${extra_instruction}\n${cap_info}"
        ;;
    esac
  fi

  if [ -n "$extra_instruction" ]; then
    reminder="${reminder}\n\n${extra_instruction}"
  fi
fi

# --- Output ---

reminder_escaped=$(escape_for_json "$reminder")

if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "PostToolUse",\n    "additionalContext": "%s"\n  }\n}\n' "$reminder_escaped"
else
  printf '{\n  "additional_context": "%s"\n}\n' "$reminder_escaped"
fi

exit 0
```

- [ ] **Step 2: Verificar que o hook é executável**

```bash
chmod +x hooks/post-tool-use
```

- [ ] **Step 3: Testar o hook manualmente simulando TaskUpdate completed**

```bash
echo '{"tool_name":"TaskUpdate","tool_input":{"status":"completed","taskId":"1"},"cwd":"/home/walterfrey/Documentos/code/devflow"}' | bash hooks/post-tool-use
```

Esperado: JSON com `additionalContext` contendo handoff reminder + commit/finish prompt (conforme estado do git).

- [ ] **Step 4: Testar o hook com tool que NÃO é TaskUpdate**

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"foo.js"},"cwd":"/home/walterfrey/Documentos/code/devflow"}' | bash hooks/post-tool-use
```

Esperado: JSON com apenas o handoff reminder (sem commit/finish prompt).

- [ ] **Step 5: Commitar**

```bash
git add hooks/post-tool-use
git commit -m "feat(hooks): add commit prompt and branch finish detection to post-tool-use"
```

---

### Task 3: Atualizar matcher do hook para apenas TaskUpdate

**Arquivos:**
- Modificar: `hooks/hooks.json`

O hook PostToolUse atualmente dispara em `TaskUpdate|Write`. A lógica de commit/finish deve disparar apenas em `TaskUpdate`. Porém, o handoff reminder ainda é útil após `Write`. Decisão: manter o matcher `TaskUpdate|Write` — o hook já condiciona internamente (só injeta commit/finish para TaskUpdate completed).

- [ ] **Step 1: Verificar que nenhuma mudança é necessária**

O matcher `TaskUpdate|Write` permanece. O hook diferencia internamente. Nenhuma edição em hooks.json.

- [ ] **Step 2: Commitar (skip — nenhuma mudança)**

---

### Task 4: Testar E2E com cenários reais

**Arquivos:**
- Nenhum arquivo novo — testes manuais

- [ ] **Step 1: Testar cenário 1 — mudanças pendentes em branch de trabalho**

1. Estar na branch `feature/commit-branch-finish-hook`
2. Editar um arquivo qualquer
3. Completar uma task via TaskUpdate
4. Verificar que o hook injeta MSG_COMMIT_PROMPT (modo supervised)

- [ ] **Step 2: Testar cenário 2 — tudo commitado em branch de trabalho**

1. Commitar todas as mudanças
2. Completar uma task via TaskUpdate
3. Verificar que o hook injeta MSG_BRANCH_FINISH_PROMPT_SUPERVISED

- [ ] **Step 3: Testar cenário 3 — na main (sem branch de trabalho)**

1. Estar na main
2. Completar uma task via TaskUpdate
3. Verificar que o hook NÃO injeta commit/finish (apenas handoff)

- [ ] **Step 4: Commitar ajustes se necessário**

---

### Task 5: Testes automatizados

**Arquivos:**
- Criar: `tests/hooks/test-post-tool-use.sh`

- [ ] **Step 1: Escrever testes do hook**

```bash
#!/usr/bin/env bash
# Tests for post-tool-use hook
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
HOOK="${REPO_ROOT}/hooks/post-tool-use"
PASS=0
FAIL=0

assert_contains() {
  local desc="$1" output="$2" expected="$3"
  if echo "$output" | grep -q "$expected"; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc — expected to find '$expected'"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local desc="$1" output="$2" unexpected="$3"
  if echo "$output" | grep -q "$unexpected"; then
    echo "  FAIL: $desc — found unexpected '$unexpected'"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  fi
}

echo "=== Post Tool Use Hook Tests ==="

# Test 1: Write tool → only handoff reminder
echo "Test 1: Write tool emits only handoff"
output=$(echo '{"tool_name":"Write","tool_input":{"file_path":"foo.js"},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "has handoff reminder" "$output" "HANDOFF"
assert_not_contains "no commit prompt" "$output" "COMMIT"
assert_not_contains "no branch finish" "$output" "BRANCH FINISH"

# Test 2: TaskUpdate with status=in_progress → only handoff
echo "Test 2: TaskUpdate in_progress emits only handoff"
output=$(echo '{"tool_name":"TaskUpdate","tool_input":{"status":"in_progress","taskId":"1"},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "has handoff reminder" "$output" "HANDOFF"
assert_not_contains "no commit prompt" "$output" "COMMIT"

# Test 3: TaskUpdate with status=completed → emits commit or finish
echo "Test 3: TaskUpdate completed emits conditional prompt"
output=$(echo '{"tool_name":"TaskUpdate","tool_input":{"status":"completed","taskId":"1"},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "has handoff reminder" "$output" "HANDOFF"
# Should have either COMMIT or BRANCH FINISH depending on git state
assert_contains "has conditional prompt" "$output" "COMMIT\|BRANCH FINISH"

# Test 4: Valid JSON output
echo "Test 4: Output is valid JSON"
if echo '{"tool_name":"Write","tool_input":{},"cwd":"'"$REPO_ROOT"'"}' | bash "$HOOK" 2>/dev/null | python3 -m json.tool > /dev/null 2>&1; then
  echo "  PASS: valid JSON"
  PASS=$((PASS + 1))
else
  echo "  FAIL: invalid JSON output"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

- [ ] **Step 2: Rodar os testes**

```bash
bash tests/hooks/test-post-tool-use.sh
```

Esperado: Todos passam.

- [ ] **Step 3: Commitar**

```bash
git add tests/hooks/test-post-tool-use.sh
git commit -m "test(hooks): add post-tool-use hook tests for commit and branch finish"
```

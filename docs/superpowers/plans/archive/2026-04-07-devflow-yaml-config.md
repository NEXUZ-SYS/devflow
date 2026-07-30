# DevFlow YAML Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the DevFlow git-strategy hook configurable via `.context/.devflow.yaml`, with an interview flow in `/devflow config` that detects heuristics and pre-selects recommendations.

**Architecture:** The YAML file is the single source of truth for git strategy. The `pre-tool-use` hook reads it directly (no fallback). The `/devflow config` skill runs heuristic detection and presents an interactive interview via AskUserQuestion. The `post-tool-use` hook reads `autoFinish` to control automatic branch finalization.

**Tech Stack:** Bash (hooks), Python3 inline (YAML parsing in hooks), Markdown (skill definition)

---

### Task 1: Add `MSG_NO_CONFIG` i18n messages to all 3 locales

**Files:**
- Modify: `locales/en-US/messages.sh:34` (after MSG_BLOCKED_NOTE)
- Modify: `locales/pt-BR/messages.sh:34` (after MSG_BLOCKED_NOTE)
- Modify: `locales/es-ES/messages.sh:34` (after MSG_BLOCKED_NOTE)

- [ ] **Step 1: Add MSG_NO_CONFIG to en-US**

In `locales/en-US/messages.sh`, add after the `MSG_BLOCKED_NOTE` line:

```bash
MSG_NO_CONFIG="DevFlow is not configured for this project. Run /devflow config to set up your git strategy before editing files.\nThis is required for DevFlow to know which branches to protect and how to manage your workflow."
```

- [ ] **Step 2: Add MSG_NO_CONFIG to pt-BR**

In `locales/pt-BR/messages.sh`, add after the `MSG_BLOCKED_NOTE` line:

```bash
MSG_NO_CONFIG="DevFlow não está configurado para este projeto. Execute /devflow config para definir sua estratégia git antes de editar arquivos.\nIsso é necessário para o DevFlow saber quais branches proteger e como gerenciar seu workflow."
```

- [ ] **Step 3: Add MSG_NO_CONFIG to es-ES**

In `locales/es-ES/messages.sh`, add after the `MSG_BLOCKED_NOTE` line:

```bash
MSG_NO_CONFIG="DevFlow no está configurado para este proyecto. Ejecuta /devflow config para definir tu estrategia git antes de editar archivos.\nEsto es necesario para que DevFlow sepa qué branches proteger y cómo gestionar tu workflow."
```

- [ ] **Step 4: Test i18n loading**

Run each locale manually to verify no syntax errors:

```bash
cd /home/walterfrey/Documentos/code/devflow
source locales/en-US/messages.sh && echo "$MSG_NO_CONFIG"
source locales/pt-BR/messages.sh && echo "$MSG_NO_CONFIG"
source locales/es-ES/messages.sh && echo "$MSG_NO_CONFIG"
```

Expected: Each prints the localized message without errors.

- [ ] **Step 5: Commit**

```bash
git add locales/en-US/messages.sh locales/pt-BR/messages.sh locales/es-ES/messages.sh
git commit -m "feat(i18n): add MSG_NO_CONFIG message for devflow yaml config gate"
```

---

### Task 2: Rewrite `pre-tool-use` hook to read `.context/.devflow.yaml`

**Files:**
- Modify: `hooks/pre-tool-use` (lines 102-135: replace protected branches logic)

- [ ] **Step 1: Write a test YAML file for manual testing**

Create a temporary test file at `/tmp/test-devflow.yaml`:

```yaml
git:
  strategy: branch-flow
  protectedBranches: [main, develop]
  prCli: gh
  branchProtection: true
```

Verify python3 can parse it:

```bash
python3 -c "
import yaml, json
with open('/tmp/test-devflow.yaml') as f:
    data = yaml.safe_load(f)
print(json.dumps(data, indent=2))
"
```

Expected: JSON output with the git config. If `yaml` module not available, test with the inline parser approach (see Step 3).

- [ ] **Step 2: Run test to verify python3 yaml availability**

```bash
python3 -c "import yaml; print('yaml available')" 2>/dev/null && echo "USE_PYYAML=true" || echo "USE_PYYAML=false"
```

If PyYAML is not available, we'll use a simple grep/sed parser for the flat YAML structure (the `.devflow.yaml` is simple enough for line-by-line parsing). Document both paths.

- [ ] **Step 3: Replace the protected branches detection block in `hooks/pre-tool-use`**

Replace lines 102-135 (from `PROTECTED_BRANCHES="main master develop"` to the end of `IS_PROTECTED` check) with the new YAML-based logic:

```bash
# --- Read .context/.devflow.yaml ---

DEVFLOW_CONFIG=""
if [ -n "$CWD" ]; then
  DEVFLOW_CONFIG="$CWD/.context/.devflow.yaml"
fi

# If no config exists → DENY with config instruction
if [ -z "$DEVFLOW_CONFIG" ] || [ ! -f "$DEVFLOW_CONFIG" ]; then
  REASON_ESCAPED=$(escape_for_json "$MSG_NO_CONFIG")
  printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "PreToolUse",\n    "permissionDecision": "deny",\n    "permissionDecisionReason": "%s"\n  }\n}\n' "$REASON_ESCAPED"
  exit 0
fi

# --- Parse git config from YAML ---

read_yaml_field() {
  local file="$1" field="$2"
  python3 -c "
import sys
try:
    import yaml
    with open('$file') as f:
        data = yaml.safe_load(f)
    git = data.get('git', {})
    val = git.get('$field', '')
    if isinstance(val, list):
        print(' '.join(str(v) for v in val))
    elif isinstance(val, bool):
        print(str(val).lower())
    else:
        print(str(val))
except ImportError:
    # Fallback: line-by-line parse for simple YAML
    import re
    in_git = False
    for line in open('$file'):
        stripped = line.strip()
        if stripped == 'git:':
            in_git = True
            continue
        if in_git and not line.startswith(' ') and not line.startswith('\t') and stripped:
            break
        if in_git and '$field' in stripped:
            match = re.match(r'\s*$field:\s*(.*)', stripped)
            if match:
                val = match.group(1).strip()
                # Handle [item1, item2] list format
                if val.startswith('[') and val.endswith(']'):
                    val = val[1:-1].replace(',', ' ').replace('\"', '').replace(\"'\", '')
                print(val)
                break
    else:
        print('')
" 2>/dev/null || echo ""
}

GIT_STRATEGY=$(read_yaml_field "$DEVFLOW_CONFIG" "strategy")
BRANCH_PROTECTION=$(read_yaml_field "$DEVFLOW_CONFIG" "branchProtection")
PROTECTED_BRANCHES=$(read_yaml_field "$DEVFLOW_CONFIG" "protectedBranches")

# --- Apply strategy rules ---

# trunk-based: no protection, allow everything
if [ "$GIT_STRATEGY" = "trunk-based" ]; then
  exit 0
fi

# branchProtection explicitly disabled
if [ "$BRANCH_PROTECTION" = "false" ]; then
  exit 0
fi

# --- Check if current branch is protected ---

IS_PROTECTED=false
for pb in $PROTECTED_BRANCHES; do
  if [ "$BRANCH" = "$pb" ]; then
    IS_PROTECTED=true
    break
  fi
done

if [ "$IS_PROTECTED" = "false" ]; then
  exit 0
fi
```

- [ ] **Step 4: Move `escape_for_json` function before the YAML check block**

The `escape_for_json` function is currently at line 150, after the protected branches check. It needs to be available earlier (for the `MSG_NO_CONFIG` deny path). Move it to right after the branch detection (after `if [ -z "$BRANCH" ]; then exit 0; fi`).

- [ ] **Step 5: Test the hook manually — no config file**

```bash
cd /tmp && mkdir -p test-project && cd test-project && git init
echo '{"tool_name":"Edit","cwd":"/tmp/test-project","tool_input":{"file_path":"/tmp/test-project/foo.js"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/pre-tool-use
```

Expected: JSON with `permissionDecision: "deny"` and the `MSG_NO_CONFIG` message.

- [ ] **Step 6: Test the hook — with config, on protected branch**

```bash
cd /tmp/test-project
mkdir -p .context
cat > .context/.devflow.yaml << 'EOF'
git:
  strategy: branch-flow
  protectedBranches: [main]
  prCli: gh
  branchProtection: true
EOF
echo '{"tool_name":"Edit","cwd":"/tmp/test-project","tool_input":{"file_path":"/tmp/test-project/foo.js"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/pre-tool-use
```

Expected: JSON with `permissionDecision: "deny"` and branch protection message (we're on `main`).

- [ ] **Step 7: Test the hook — trunk-based strategy**

```bash
cd /tmp/test-project
cat > .context/.devflow.yaml << 'EOF'
git:
  strategy: trunk-based
EOF
echo '{"tool_name":"Edit","cwd":"/tmp/test-project","tool_input":{"file_path":"/tmp/test-project/foo.js"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/pre-tool-use
```

Expected: Empty output (exit 0, allowed).

- [ ] **Step 8: Test the hook — branchProtection disabled**

```bash
cd /tmp/test-project
cat > .context/.devflow.yaml << 'EOF'
git:
  strategy: branch-flow
  protectedBranches: [main]
  branchProtection: false
EOF
echo '{"tool_name":"Edit","cwd":"/tmp/test-project","tool_input":{"file_path":"/tmp/test-project/foo.js"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/pre-tool-use
```

Expected: Empty output (exit 0, allowed).

- [ ] **Step 9: Cleanup test project and commit**

```bash
rm -rf /tmp/test-project /tmp/test-devflow.yaml
cd /home/walterfrey/Documentos/code/devflow
git add hooks/pre-tool-use
git commit -m "feat(hooks): rewrite pre-tool-use to read .context/.devflow.yaml

Replaces grep-based detection of development-workflow.md with
direct YAML parsing. Blocks edits when no config exists and
instructs user to run /devflow config."
```

---

### Task 3: Update `post-tool-use` hook to read `autoFinish` from YAML

**Files:**
- Modify: `hooks/post-tool-use` (lines 130-177: branch finish prompt section)

- [ ] **Step 1: Add `read_yaml_field` function to post-tool-use**

Add the same `read_yaml_field` helper after the `escape_for_json` function (line 27) in `hooks/post-tool-use`:

```bash
# --- Read YAML field helper ---

read_yaml_field() {
  local file="$1" field="$2"
  python3 -c "
import sys
try:
    import yaml
    with open('$file') as f:
        data = yaml.safe_load(f)
    git = data.get('git', {})
    val = git.get('$field', '')
    if isinstance(val, list):
        print(' '.join(str(v) for v in val))
    elif isinstance(val, bool):
        print(str(val).lower())
    elif isinstance(val, dict):
        import json
        print(json.dumps(val))
    else:
        print(str(val))
except ImportError:
    import re
    in_git = False
    for line in open('$file'):
        stripped = line.strip()
        if stripped == 'git:':
            in_git = True
            continue
        if in_git and not line.startswith(' ') and not line.startswith('\t') and stripped:
            break
        if in_git and '$field' in stripped:
            match = re.match(r'\s*$field:\s*(.*)', stripped)
            if match:
                val = match.group(1).strip()
                if val.startswith('[') and val.endswith(']'):
                    val = val[1:-1].replace(',', ' ').replace('\"', '').replace(\"'\", '')
                print(val)
                break
    else:
        print('')
" 2>/dev/null || echo ""
}
```

- [ ] **Step 2: Add autoFinish parsing function**

Add after `read_yaml_field`:

```bash
# --- Parse autoFinish config ---
# Returns: "disabled" | "all" | JSON object like {"bump":true,"push":false}
parse_auto_finish() {
  local config_file="$1"
  python3 -c "
import sys, json
try:
    import yaml
    with open('$config_file') as f:
        data = yaml.safe_load(f)
    git = data.get('git', {})
    af = git.get('autoFinish')
    if af is None:
        print('disabled')
    elif af is True:
        print('all')
    elif af is False:
        print('disabled')
    elif isinstance(af, dict):
        print(json.dumps(af))
    else:
        print('disabled')
except ImportError:
    print('disabled')
except Exception:
    print('disabled')
" 2>/dev/null || echo "disabled"
}
```

- [ ] **Step 3: Modify branch finish section to respect autoFinish**

In the `post-tool-use` hook, wrap the branch finish section (inside `elif [ "$IS_WORK_BRANCH" = "true" ]; then`) with autoFinish check. Replace lines 159-177 with:

```bash
  elif [ "$IS_WORK_BRANCH" = "true" ]; then
    # Scenario 2: work branch, all committed → check autoFinish config
    cap_info="Project capabilities: README=${HAS_README}, BUMP=${HAS_BUMP}"

    # Read autoFinish from .devflow.yaml
    AUTO_FINISH="disabled"
    DEVFLOW_CONFIG="$CWD/.context/.devflow.yaml"
    if [ -f "$DEVFLOW_CONFIG" ]; then
      AUTO_FINISH=$(parse_auto_finish "$DEVFLOW_CONFIG")
    fi

    # Build autoFinish context for LLM
    auto_finish_context="autoFinish: ${AUTO_FINISH}"

    case "$AUTONOMY" in
      supervised)
        if [ "$AUTO_FINISH" = "disabled" ]; then
          extra_instruction=$(render_msg "$MSG_BRANCH_FINISH_PROMPT_SUPERVISED" "branch=${BRANCH}")
          extra_instruction="${extra_instruction}\n${cap_info}\n${auto_finish_context}\nNOTE: autoFinish is DISABLED. Do NOT execute automatic bump/commit/push/merge. Only ask the user and proceed manually for each step they approve."
        else
          extra_instruction=$(render_msg "$MSG_BRANCH_FINISH_PROMPT_SUPERVISED" "branch=${BRANCH}")
          extra_instruction="${extra_instruction}\n${cap_info}\n${auto_finish_context}"
        fi
        ;;
      assisted)
        if [ "$AUTO_FINISH" = "disabled" ]; then
          extra_instruction=$(render_msg "$MSG_BRANCH_FINISH_PROMPT_ASSISTED" "branch=${BRANCH}")
          extra_instruction="${extra_instruction}\n${cap_info}\n${auto_finish_context}\nNOTE: autoFinish is DISABLED. Do NOT execute automatic finalization. Ask the user what they want to do."
        else
          extra_instruction=$(render_msg "$MSG_BRANCH_FINISH_PROMPT_ASSISTED" "branch=${BRANCH}")
          extra_instruction="${extra_instruction}\n${cap_info}\n${auto_finish_context}"
        fi
        ;;
      autonomous)
        if [ "$AUTO_FINISH" = "disabled" ]; then
          extra_instruction="BRANCH FINISH SKIPPED: autoFinish is disabled in .context/.devflow.yaml. Branch '${BRANCH}' has all changes committed but automatic finalization is turned off. Inform the user that the branch is ready for manual finalization."
        elif [ "$AUTO_FINISH" = "all" ]; then
          extra_instruction=$(render_msg "$MSG_BRANCH_FINISH_AUTO" "branch=${BRANCH}")
          extra_instruction="${extra_instruction}\n${cap_info}\n${auto_finish_context}"
        else
          # Granular: pass the JSON so LLM knows which steps to run
          extra_instruction=$(render_msg "$MSG_BRANCH_FINISH_AUTO" "branch=${BRANCH}")
          extra_instruction="${extra_instruction}\n${cap_info}\n${auto_finish_context}\nIMPORTANT: Only execute steps that are 'true' in the autoFinish config. Steps not listed or set to 'false' must be SKIPPED."
        fi
        ;;
    esac
  fi
```

- [ ] **Step 4: Test post-tool-use with autoFinish disabled**

```bash
cd /tmp && mkdir -p test-project/.context && cd test-project && git init && git commit --allow-empty -m "init"
git checkout -b feature/test
cat > .context/.devflow.yaml << 'EOF'
git:
  strategy: branch-flow
  protectedBranches: [main]
  branchProtection: true
EOF
echo '{"tool_name":"TaskUpdate","cwd":"/tmp/test-project","tool_input":{"status":"completed"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/post-tool-use
```

Expected: Output contains `autoFinish: disabled` and the "DISABLED" note.

- [ ] **Step 5: Test post-tool-use with autoFinish granular**

```bash
cd /tmp/test-project
cat > .context/.devflow.yaml << 'EOF'
git:
  strategy: branch-flow
  protectedBranches: [main]
  branchProtection: true
  autoFinish:
    bump: true
    commit: true
    push: false
    merge: false
EOF
echo '{"tool_name":"TaskUpdate","cwd":"/tmp/test-project","tool_input":{"status":"completed"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/post-tool-use
```

Expected: Output contains the granular JSON and the "Only execute steps that are 'true'" instruction.

- [ ] **Step 6: Cleanup and commit**

```bash
rm -rf /tmp/test-project
cd /home/walterfrey/Documentos/code/devflow
git add hooks/post-tool-use
git commit -m "feat(hooks): read autoFinish from .context/.devflow.yaml in post-tool-use

Branch finish behavior now respects autoFinish config:
- absent/false: skip automatic finalization
- true: execute all steps (bump/commit/push/merge)
- object: execute only steps set to true"
```

---

### Task 4: Create the `devflow:config` skill

**Files:**
- Create: `skills/config/SKILL.md`

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p /home/walterfrey/Documentos/code/devflow/skills/config
```

- [ ] **Step 2: Write the skill file**

Create `skills/config/SKILL.md`:

```markdown
---
name: config
description: "Entrevista interativa para configurar .context/.devflow.yaml — detecta heurísticas git e pré-seleciona recomendações."
---

# DevFlow Config

Configura o arquivo `.context/.devflow.yaml` do projeto através de uma entrevista interativa.
Detecta heurísticas do repositório para pré-selecionar as opções recomendadas.

**Announce at start:** "I'm using the devflow:config skill to configure your project's git strategy."

## Pré-requisito

Verificar se `.context/` existe. Se não existir, informar:
> "O diretório .context/ não existe. Execute `/devflow init` primeiro para inicializar o projeto."

## Fluxo

### 1. Detecção de Heurísticas

Executar detecção silenciosa (sem output ao usuário) para pré-selecionar recomendações:

```bash
# Detectar worktree scripts
HAS_WT_SCRIPTS=false
[ -f "scripts/wt-create.sh" ] && HAS_WT_SCRIPTS=true

# Detectar branch develop
HAS_DEVELOP=false
git branch --list develop 2>/dev/null | grep -q develop && HAS_DEVELOP=true

# Detectar CLI de PR
HAS_GH=false
command -v gh >/dev/null 2>&1 && HAS_GH=true
HAS_GLAB=false
command -v glab >/dev/null 2>&1 && HAS_GLAB=true

# Detectar branch atual
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
```

**Lógica de recomendação:**
- `HAS_WT_SCRIPTS=true` → recomendar **worktree**
- `HAS_DEVELOP=true` → recomendar **branch-flow** (main + develop)
- Apenas main → recomendar **branch-flow** (só main)
- Nenhum sinal → recomendar **branch-flow** (main)

### 2. Entrevista (5 perguntas via AskUserQuestion)

**P1: Estratégia git**

```
AskUserQuestion:
  question: "Qual estratégia git deste projeto?"
  header: "Git Strategy"
  multiSelect: false
  options:
    - label: "Branch Flow (Recomendado — <razão da heurística>)"
      description: "Branches protegidas + git checkout -b para isolamento"
    - label: "Worktree"
      description: "Isolamento total via git worktree add"
    - label: "Trunk-based"
      description: "Commits diretos na main, sem proteção de branch"
```

A opção recomendada pela heurística deve ser a primeira e ter "(Recomendado — detectei X)" no label.

**Se trunk-based:** Pular P2 e P4. Gerar YAML mínimo e finalizar.

**P2: Branches protegidas** (só se branch-flow ou worktree)

```
AskUserQuestion:
  question: "Quais branches são protegidas?"
  header: "Protected Branches"
  multiSelect: true
  options:
    - label: "main"
      description: "Branch de produção"
    - label: "develop"
      description: "Branch de integração"
```

Pré-selecionar `main` sempre. Pré-selecionar `develop` se `HAS_DEVELOP=true`.

**P3: CLI de PR**

```
AskUserQuestion:
  question: "Qual CLI para criação de PRs?"
  header: "PR CLI"
  multiSelect: false
  options:
    - label: "gh (GitHub)"
      description: "GitHub CLI para PRs"
    - label: "glab (GitLab)"
      description: "GitLab CLI para Merge Requests"
    - label: "Nenhuma"
      description: "Criar PRs manualmente pela interface web"
```

Pré-selecionar `gh` se `HAS_GH=true`, ou `glab` se `HAS_GLAB=true`.

**P4: Branch protection**

```
AskUserQuestion:
  question: "Ativar proteção de branch? O hook do DevFlow bloqueará edições em branches protegidas."
  header: "Branch Protection"
  multiSelect: false
  options:
    - label: "Sim (Recomendado)"
      description: "Hook bloqueia Edit/Write em branches protegidas"
    - label: "Não"
      description: "Hook não bloqueia — o desenvolvedor gerencia branches manualmente"
```

**P5: Auto-finish**

```
AskUserQuestion:
  question: "Ativar finalização automática de branch? (bump, commit, push, merge)"
  header: "Auto Finish"
  multiSelect: false
  options:
    - label: "Não (padrão)"
      description: "Finalização manual — você controla cada etapa"
    - label: "Sim, tudo"
      description: "Executa bump + commit + push + merge automaticamente"
    - label: "Personalizar"
      description: "Escolher quais etapas ativar individualmente"
```

**Se "Personalizar":**

```
AskUserQuestion:
  question: "Quais etapas de finalização ativar?"
  header: "Auto Finish Steps"
  multiSelect: true
  options:
    - label: "bump"
      description: "Version bump automático (patch)"
    - label: "commit"
      description: "Commit automático das mudanças finais"
    - label: "push"
      description: "Push automático para o remoto"
    - label: "merge"
      description: "Merge/PR automático na branch base"
```

### 3. Gerar `.context/.devflow.yaml`

Com base nas respostas, gerar o arquivo:

```yaml
# .context/.devflow.yaml — DevFlow project configuration
# Generated by: /devflow config
# Run /devflow config to reconfigure

git:
  strategy: <resposta P1>
  protectedBranches: [<respostas P2>]
  prCli: <resposta P3>
  branchProtection: <resposta P4>
  # autoFinish only present if user activated it
  # autoFinish: true | { bump: true, commit: true, push: false, merge: false }
```

**Regras de geração:**
- Se trunk-based: gerar apenas `strategy: trunk-based` e `prCli`
- Se autoFinish = "Não": **não incluir** a chave `autoFinish` (ausência = desativado)
- Se autoFinish = "Sim, tudo": incluir `autoFinish: true`
- Se autoFinish = "Personalizar": incluir como objeto com apenas as chaves selecionadas em `true`, as não selecionadas em `false`

### 4. Confirmar e informar

Após gerar o arquivo, mostrar ao usuário:

```
✅ Configuração salva em .context/.devflow.yaml

  Estratégia: branch-flow
  Branches protegidas: main, develop
  CLI de PR: gh
  Proteção de branch: ativada
  Auto-finish: desativado

Para reconfigurar: /devflow config
```

### 5. Se `.context/.devflow.yaml` já existe

Se o arquivo já existir ao iniciar o skill:
1. Ler o arquivo atual
2. Informar as configurações atuais
3. Perguntar: "Quer reconfigurar? As configurações atuais serão sobrescritas."
4. Se sim → continuar entrevista normalmente
5. Se não → encerrar

## Integração

- **`/devflow config`** → invoca este skill diretamente
- **`/devflow init`** → chama este skill como parte do setup (se `.context/.devflow.yaml` não existir)
- **Hook `pre-tool-use`** → quando bloqueia por falta de config, instrui o usuário a rodar `/devflow config`
```

- [ ] **Step 3: Commit**

```bash
cd /home/walterfrey/Documentos/code/devflow
git add skills/config/SKILL.md
git commit -m "feat(skills): create devflow:config skill for interactive YAML setup

Interview flow with heuristic detection that pre-selects
recommendations. Generates .context/.devflow.yaml with git
strategy, protected branches, PR CLI, branch protection,
and autoFinish configuration."
```

---

### Task 5: Update `git-strategy` skill to read from YAML

**Files:**
- Modify: `skills/git-strategy/SKILL.md`

- [ ] **Step 1: Replace the detection and configuration sections**

Rewrite `skills/git-strategy/SKILL.md`. Keep the header (lines 1-4), enforcement section (lines 6-36), strategy table (lines 38-46), and the flow from section "Fluxo (gate bloqueante)" onwards (lines 108+). Replace lines 48-106 (Detecção Automática + Configuração Inicial) with:

```markdown
## Leitura da Configuração

```
1. Ler .context/.devflow.yaml → seção git
2. Se não existir → BLOQUEAR:
   "DevFlow não está configurado. Execute /devflow config para definir sua estratégia git."
   NÃO prosseguir. NÃO fazer detecção por heurísticas.
3. Se existir → usar campos:
   - strategy: branch-flow | worktree | trunk-based
   - protectedBranches: lista de branches protegidas
   - branchProtection: true/false
   - prCli: gh | glab | none
```

**Importante:** Este skill NÃO faz mais detecção automática por heurísticas.
A detecção foi movida para o skill `devflow:config`, que é executado uma vez no setup.
```

- [ ] **Step 2: Remove the 3 configuration questions (P1, P2, P3)**

Remove the entire "Configuração Inicial (primeira execução)" section (lines 59-106 in the original) since these questions are now in the `devflow:config` skill.

- [ ] **Step 3: Update PR Creation section to read prCli from YAML**

Replace the PR Creation section at the end with:

```markdown
## PR Creation (usa CLI do .devflow.yaml)

```
Ler prCli de .context/.devflow.yaml:

IF prCli == "gh":
  gh pr create --title "..." --body "..."
ELIF prCli == "glab":
  glab mr create --title "..." --description "..."
ELIF prCli == "none":
  Instruir usuário a criar manualmente
```
```

- [ ] **Step 4: Commit**

```bash
cd /home/walterfrey/Documentos/code/devflow
git add skills/git-strategy/SKILL.md
git commit -m "refactor(skills): simplify git-strategy to read from .devflow.yaml

Removes heuristic detection and configuration questions.
Strategy is now read directly from .context/.devflow.yaml.
Detection logic moved to devflow:config skill."
```

---

### Task 6: Register `/devflow config` command in the `using-devflow` skill

**Files:**
- Modify: `skills/using-devflow/SKILL.md`

- [ ] **Step 1: Read the current using-devflow skill**

```bash
cat /home/walterfrey/Documentos/code/devflow/skills/using-devflow/SKILL.md
```

Identify where commands are listed and where to add `/devflow config`.

- [ ] **Step 2: Add /devflow config to the command list**

In the skill table / command reference, add:

```markdown
| `/devflow config` | `devflow:config` | Configure git strategy and generate .context/.devflow.yaml |
```

- [ ] **Step 3: Add /devflow config to the devflow main skill**

In `skills/using-devflow/SKILL.md`, find the section that maps commands to behaviors and add:

```markdown
### `/devflow config`
1. Invoke `devflow:config` skill
2. Runs interactive interview with heuristic detection
3. Generates or overwrites `.context/.devflow.yaml`
```

- [ ] **Step 4: Commit**

```bash
cd /home/walterfrey/Documentos/code/devflow
git add skills/using-devflow/SKILL.md
git commit -m "feat(skills): register /devflow config command in using-devflow"
```

---

### Task 7: Integrate config into `project-init` skill

**Files:**
- Modify: `skills/project-init/SKILL.md`

- [ ] **Step 1: Read the current project-init skill**

```bash
cat /home/walterfrey/Documentos/code/devflow/skills/project-init/SKILL.md
```

- [ ] **Step 2: Add config skill invocation**

Find the initialization steps and add after scaffolding `.context/`:

```markdown
### Git Strategy Configuration

After scaffolding `.context/`, check if `.context/.devflow.yaml` exists:

1. **If NOT exists** → Invoke `devflow:config` skill to run the interactive interview
2. **If exists** → Skip (preserve existing configuration)

This ensures every project initialized with DevFlow has a git strategy configured.
```

- [ ] **Step 3: Commit**

```bash
cd /home/walterfrey/Documentos/code/devflow
git add skills/project-init/SKILL.md
git commit -m "feat(skills): integrate devflow:config into project-init flow

project-init now invokes config skill when .context/.devflow.yaml
doesn't exist, ensuring git strategy is configured on first init."
```

---

### Task 8: Register config in the devflow main skill routing

**Files:**
- Modify: `skills/devflow/SKILL.md` (the main `/devflow` entry point — this is actually in the plugin's skill directory)

- [ ] **Step 1: Find the devflow main entry point skill**

```bash
find /home/walterfrey/Documentos/code/devflow -name "SKILL.md" -path "*/devflow/SKILL.md" | head -5
```

The main `/devflow` routing is likely defined in the plugin's skill configuration or in `using-devflow`.

- [ ] **Step 2: Add config routing**

In the main `/devflow` skill file (or `using-devflow`), add a routing case:

```markdown
### `/devflow config`
1. Invoke `devflow:config` skill
2. Runs interactive interview with heuristic-based recommendations
3. Generates `.context/.devflow.yaml`
```

- [ ] **Step 3: Commit**

```bash
cd /home/walterfrey/Documentos/code/devflow
git add -A
git commit -m "feat(skills): add /devflow config routing to main entry point"
```

---

### Task 9: Add `.devflow.yaml` to allowed files in hook exceptions

**Files:**
- Modify: `hooks/pre-tool-use` (exception list at lines 54-87)

- [ ] **Step 1: Add `.devflow.yaml` to the allowed file patterns**

In the `case "$FILE_PATH"` block, add before the closing `esac`:

```bash
    # DevFlow config file (config skill needs to write this)
    */.context/.devflow.yaml)
      exit 0
      ;;
```

This allows the config skill to create/update the YAML file even on a protected branch.

- [ ] **Step 2: Test that .devflow.yaml can be written on protected branch**

```bash
cd /tmp && mkdir -p test-project/.context && cd test-project && git init
mkdir -p .context
cat > .context/.devflow.yaml << 'EOF'
git:
  strategy: branch-flow
  protectedBranches: [main]
  branchProtection: true
EOF
echo '{"tool_name":"Write","cwd":"/tmp/test-project","tool_input":{"file_path":"/tmp/test-project/.context/.devflow.yaml"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/pre-tool-use
```

Expected: Empty output (exit 0, allowed).

- [ ] **Step 3: Cleanup and commit**

```bash
rm -rf /tmp/test-project
cd /home/walterfrey/Documentos/code/devflow
git add hooks/pre-tool-use
git commit -m "fix(hooks): allow writing .context/.devflow.yaml on protected branches

The config skill needs to create/update this file during setup,
even when on a protected branch."
```

---

### Task 10: End-to-end validation

**Files:**
- No file changes — validation only

- [ ] **Step 1: Create a fresh test project**

```bash
cd /tmp && rm -rf e2e-devflow-test && mkdir e2e-devflow-test && cd e2e-devflow-test
git init && git commit --allow-empty -m "init"
mkdir -p .context
```

- [ ] **Step 2: Verify hook blocks without config**

```bash
echo '{"tool_name":"Edit","cwd":"/tmp/e2e-devflow-test","tool_input":{"file_path":"/tmp/e2e-devflow-test/app.js"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/pre-tool-use
```

Expected: Deny with "not configured" message.

- [ ] **Step 3: Create config and verify branch-flow protection**

```bash
cat > /tmp/e2e-devflow-test/.context/.devflow.yaml << 'EOF'
git:
  strategy: branch-flow
  protectedBranches: [main]
  prCli: gh
  branchProtection: true
EOF
echo '{"tool_name":"Edit","cwd":"/tmp/e2e-devflow-test","tool_input":{"file_path":"/tmp/e2e-devflow-test/app.js"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/pre-tool-use
```

Expected: Deny with branch protection message.

- [ ] **Step 4: Switch to feature branch and verify allowed**

```bash
cd /tmp/e2e-devflow-test && git checkout -b feature/test
echo '{"tool_name":"Edit","cwd":"/tmp/e2e-devflow-test","tool_input":{"file_path":"/tmp/e2e-devflow-test/app.js"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/pre-tool-use
```

Expected: Empty output (allowed).

- [ ] **Step 5: Test autoFinish disabled in post-tool-use**

```bash
echo '{"tool_name":"TaskUpdate","cwd":"/tmp/e2e-devflow-test","tool_input":{"status":"completed"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/post-tool-use
```

Expected: Output contains "autoFinish: disabled".

- [ ] **Step 6: Test autoFinish granular**

```bash
cd /tmp/e2e-devflow-test
cat > .context/.devflow.yaml << 'EOF'
git:
  strategy: branch-flow
  protectedBranches: [main]
  prCli: gh
  branchProtection: true
  autoFinish:
    bump: true
    commit: true
    push: false
    merge: false
EOF
echo '{"tool_name":"TaskUpdate","cwd":"/tmp/e2e-devflow-test","tool_input":{"status":"completed"}}' | bash /home/walterfrey/Documentos/code/devflow/hooks/post-tool-use
```

Expected: Output contains granular JSON with bump:true, commit:true, push:false, merge:false.

- [ ] **Step 7: Cleanup**

```bash
rm -rf /tmp/e2e-devflow-test
```

- [ ] **Step 8: Final commit — update spec with "implemented" status**

```bash
cd /home/walterfrey/Documentos/code/devflow
# No file changes needed for this step — validation only
```

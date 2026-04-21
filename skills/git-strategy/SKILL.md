---
name: git-strategy
description: "Gate bloqueante auto-ativado antes de qualquer edição. Detecta a estratégia git do projeto e aplica branch protection + isolamento."
---

# Git Strategy

⛔ **REGRA BLOQUEANTE**: Esta verificação DEVE ser executada ANTES de qualquer edição de arquivo.

## Enforcement Automático

Este skill é enforced por um **hook PreToolUse** que bloqueia `Edit` e `Write` em branches protegidas.
O hook retorna `permissionDecision: "deny"` — o LLM **não consegue** editar sem antes criar uma branch de trabalho.

**Fluxo quando bloqueado:**
1. LLM tenta Edit/Write em branch protegida → hook BLOQUEIA
2. Hook instrui o LLM a invocar este skill automaticamente via `Skill({ skill: "devflow:git-strategy" })`
3. Skill pergunta ao usuário o tipo de branch (feature/fix/hotfix/release)
4. Branch criada → LLM retenta o Edit/Write → hook permite

**Exceções — arquivos permitidos em qualquer branch (hook não bloqueia):**
- `.context/workflow/.checkpoint/*` — handoff, checkpoints
- `.context/workflow/*` — estado do workflow
- `.context/plans/*` — planos PREVC
- `.context/docs/*` — docs do projeto (sync)
- `.context/agents/*` — playbooks de agentes (sync)
- `.context/skills/*` — skills do projeto (sync)
- `docs/superpowers/*` — planos do superpowers
- `docs/specs/*` — design specs
- Arquivos do plugin DevFlow (`$CLAUDE_PLUGIN_ROOT/*`)

**Exceções — arquivos permitidos sob confirmação (hook emite `permissionDecision: ask`):**
- `~/.claude/projects/*/memory/*` — auto-memory do Claude Code (metadados, fora do projeto)
- `.context/napkin.md` — memória curada do projeto

Esses arquivos não são código do projeto, mas o Claude Code prompta o usuário a cada edit para confirmar — evita alterações silenciosas em memória/curadoria sem ciência do usuário.

**Exceções — branches não protegidas (hook não bloqueia):**
- Branches de trabalho (`feature/*`, `fix/*`, `hotfix/*`, `release/*`)
- Estratégia trunk-based configurada
- Impossibilidade de detectar branch (fora de repo git)

**Announce at start:** "I'm using the devflow:git-strategy skill to verify branch safety."

## 3 Estratégias Suportadas

| Estratégia | Isolamento | Branches protegidas |
|---|---|---|
| **branch-flow** | `git checkout -b <tipo>/<nome>` | Configurável (main, develop, ou ambas) |
| **worktree** | `git worktree add` | Configurável via .devflow.yaml |
| **trunk-based** | Nenhum (commits diretos) | Nenhuma |

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

## Integração PREVC

```
[git-strategy gate] → P → R → E → V → C
```

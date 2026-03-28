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

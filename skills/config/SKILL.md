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

**P1: Estratégia git** (com heurística pré-selecionada)

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

**P6: MemPalace** (condicional — só aparece se MCP detectado ou se usuário quer configurar)

Primeiro, detectar disponibilidade:
```bash
# Check mempalace MCP
HAS_MEMPALACE=false
if [ -f ".mcp.json" ] && grep -q "mempalace" ".mcp.json" 2>/dev/null; then
  HAS_MEMPALACE=true
elif [ -f "${HOME}/.config/claude/mcp.json" ] && grep -q "mempalace" "${HOME}/.config/claude/mcp.json" 2>/dev/null; then
  HAS_MEMPALACE=true
fi

# Check mempalace package
HAS_MEMPALACE_PKG=false
pip show mempalace >/dev/null 2>&1 && HAS_MEMPALACE_PKG=true
pipx list 2>/dev/null | grep -q mempalace && HAS_MEMPALACE_PKG=true
```

**Se `HAS_MEMPALACE=true`:**
```
AskUserQuestion:
  question: "MemPalace detectado. Habilitar integração de memória?"
  header: "MemPalace Integration"
  multiSelect: false
  options:
    - label: "Sim (Recomendado)"
      description: "Memória semântica persistente entre sessões"
    - label: "Não"
      description: "Desativar integração MemPalace"
```

**Se sim, P7: Palace path**
```
AskUserQuestion:
  question: "Caminho do palace?"
  header: "Palace Path"
  multiSelect: false
  options:
    - label: "~/.mempalace/palace (Global — Recomendado)"
      description: "Um palace compartilhado, cada projeto é uma wing"
    - label: "Personalizar"
      description: "Informar um caminho customizado"
```

**Se sim, P8: Token budget**
```
AskUserQuestion:
  question: "Budget de tokens para auto-recall?"
  header: "Auto-recall Budget"
  multiSelect: false
  options:
    - label: "500 tokens (Recomendado)"
      description: "Contexto compacto injetado automaticamente"
    - label: "250 tokens"
      description: "Mínimo — apenas memórias mais relevantes"
    - label: "1000 tokens"
      description: "Contexto rico — usa mais do context window"
    - label: "Desativar auto-recall"
      description: "Apenas busca manual via /devflow-recall"
```

**Se `HAS_MEMPALACE=false`:**
```
AskUserQuestion:
  question: "MemPalace não detectado. Deseja configurar memória semântica?"
  header: "MemPalace Setup"
  multiSelect: false
  options:
    - label: "Sim, instalar e configurar agora"
      description: "Instala mempalace e configura MCP automaticamente"
    - label: "Não, pular"
      description: "Continuar sem MemPalace"
```

**Se sim (instalar):**
1. Detectar instalador: `command -v pipx` → usar pipx, senão pip
2. Instalar: `pipx install mempalace` ou `pip install mempalace`
3. Configurar MCP: adicionar entry ao `.mcp.json`:
   ```json
   {
     "mempalace": {
       "command": "python",
       "args": ["-m", "mempalace.mcp_server"]
     }
   }
   ```
   Se `.mcp.json` já existe, merge a entry. Se não existe, criar com a entry.
4. Inicializar palace: `mempalace init ~/.mempalace/palace`
5. Seguir para P7 e P8

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
```

**Regras de geração:**
- Se trunk-based: gerar apenas `strategy: trunk-based` e `prCli`
- Se autoFinish = "Não": **não incluir** a chave `autoFinish` (ausência = desativado)
- Se autoFinish = "Sim, tudo": incluir `autoFinish: true`
- Se autoFinish = "Personalizar": incluir como objeto com as chaves selecionadas em `true`, as não selecionadas em `false`

**Regras de geração para mempalace:**
- Se mempalace desativado ou pulado: **não incluir** a seção `mempalace:` (ausência = desativado)
- Se habilitado com defaults: incluir seção mínima:
  ```yaml
  mempalace:
    enabled: true
  ```
- Se habilitado com customizações:
  ```yaml
  mempalace:
    enabled: true
    palace: <caminho personalizado>  # só se diferente do default
    budget: <valor>                  # só se diferente de 500
    auto_recall: false               # só se desativado
  ```
- `wing: auto` é o default — só incluir se o usuário informar um nome customizado
- `auto_diary: true` é o default — só incluir se desativado

### 4. Confirmar e informar

Após gerar o arquivo, mostrar ao usuário:

```
✅ Configuração salva em .context/.devflow.yaml

  Estratégia: branch-flow
  Branches protegidas: main, develop
  CLI de PR: gh
  Proteção de branch: ativada
  Auto-finish: desativado
  MemPalace: ativado (global, 500 tokens)    ← novo (só se configurado)

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

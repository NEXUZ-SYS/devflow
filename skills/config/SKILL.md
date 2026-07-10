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

**P5b: Modo de versionamento (bump)** (condicional — só pergunta se o projeto versiona)

Primeiro, detectar se há mecanismo de versão **e** se já existe pipeline de release:
```bash
HAS_VERSIONING=false
if [ -f "scripts/bump-version.sh" ]; then HAS_VERSIONING=true
elif [ -f "package.json" ] && grep -q '"version"' package.json 2>/dev/null; then HAS_VERSIONING=true
elif [ -f ".claude-plugin/plugin.json" ]; then HAS_VERSIONING=true
fi

# Já existe uma pipeline de release? (qualquer workflow que rode um bump)
HAS_RELEASE_CI=false
if [ -d ".github/workflows" ] && grep -rilE 'bump|release' .github/workflows >/dev/null 2>&1; then
  HAS_RELEASE_CI=true
fi
```

- **Se `HAS_VERSIONING=false`** (projeto não faz release) → **não pergunte**; grave `versioning: none` (finish não bumpa e o BUMP WARNING fica silencioso).
- **Se `HAS_VERSIONING=true`** → pergunte:

```
AskUserQuestion:
  question: "Como o bump de versão é feito neste projeto?"
  header: "Versionamento"
  multiSelect: false
  options:
    - label: "Pipeline de release (CI) (RECOMENDADO)"
      description: "O bump é feito uma única vez por uma pipeline (ex.: GitHub Actions). O finish NÃO bumpa local e o BUMP WARNING é suprimido. Bump único, sem conflito entre branches."
    - label: "Bump local no finish"
      description: "Para trabalho solo / projeto simples, sem CI. O finish do DevFlow bumpa a versão antes do merge. Riscos: o bump acontece na branch e gera conflito quando duas branches bumpam; a tag e o GitHub Release ficam manuais; o CHANGELOG não é cortado automaticamente."
```

#### P5b.1 — `pipeline` escolhido sem CI: AVISAR (nunca recusar)

Se o usuário escolheu **Pipeline de release** e `HAS_RELEASE_CI=false`, **avise** — a escolha é
legítima (a pipeline pode vir depois), mas hoje o bump vira **no-op silencioso**: o finish não
bumpa, e não há CI que bumpe. Nunca recuse a escolha; apenas informe e ofereça o scaffold.

Condicione a **oferta** do scaffold ao gate (repositório git **e** remote GitHub):

```bash
node scripts/lib/release-scaffold.mjs gate
# → {"git":true,"github":true,"reason":"..."}
```

- `git:false` → **só avise**. Não ofereça scaffold.
- `git:true, github:false` → **só avise**. O v1 cobre apenas `github.com`: GitLab, Bitbucket,
  Gitea e GitHub Enterprise ficam de fora, porque o `release.yml` é sintaxe de GitHub Actions e
  não executa neles. O `applyScaffold` **também recusa** nesse caso — a skill não é a única
  linha de defesa.
- `git:true, github:true` → ofereça o scaffold.

#### P5b.2 — Oferta do scaffold (confirmação estruturada)

**Antes da primeira escrita**, rode o plano em `--dry-run` e **mostre o conteúdo** dos arquivos ao
usuário. Só então peça confirmação. O applier **recusa** sem `confirmed: true`.

```bash
node scripts/lib/release-scaffold.mjs apply --confirmed --dry-run
```

A confirmação deve enumerar exatamente os **3 arquivos** que serão criados:

| Arquivo | O que é |
|---|---|
| `.github/workflows/release.yml` | Workflow de release. **Roda na SUA CI**, com `contents: write` e `pull-requests: write`. |
| `scripts/bump-version.sh` | Detecta os version files do projeto em runtime e faz o bump. |
| `scripts/lib/changelog-cut.mjs` | Corta `[Unreleased]` → `[X.Y.Z]` no CHANGELOG. |

Avisos obrigatórios na confirmação:

- O `release.yml` **roda na SUA CI** com permissão de escrita no repositório e de abrir PRs.
- Os arquivos são copiados **verbatim**; nada é interpolado.
- **Nunca sobrescrevemos** um arquivo existente: se já houver um desses arquivos, ele é
  **preservado** e reportado.
- **[N4]** Seu pipeline v1 **não tem `changelog-guard`** — **confira as notas do release à mão**
  antes de aprovar o release PR.

#### P5b.3 — Regras de escrita (enforcement)

- **Proibido em modo autônomo.** Não ofereça nem aplique o scaffold quando
  `.context/workflow/status.yaml` tiver `autonomy: autonomous` (ou `assisted`). O applier também
  recusa por conta própria — a skill não é a única linha de defesa.
- **Branch protegida** (`main`/`develop`): **não scaffolde**. Peça ao usuário para criar uma
  **work branch** (`feature/…`) antes. O applier recusa nesse caso.
- **[D7b] `.github/workflows/**` é gravado pela ferramenta `Write`, nunca pelo applier.**
  O `applyScaffold` cria só os `scripts/**` (`writer: 'fs'`) e devolve o workflow em
  `mustWriteViaTool` com o conteúdo. **Você** grava esse conteúdo com a ferramenta `Write` — é ela
  que passa pelo gate de permissões do harness. Nunca escreva `.github/**` por Bash
  (`printf >`, `cp`) nem deixe o applier escrevê-lo por `node:fs`.
- **[N6a] Depois de gravar o workflow, rode `verifyWritten`.** O conteúdo transitou por você (LLM);
  esta é a única checagem de bytes do único artefato que executa em CI. `mismatch` → pare e reporte.

```bash
# 1) cria os scripts/**; devolve o workflow em mustWriteViaTool
node scripts/lib/release-scaffold.mjs apply --confirmed
# 2) grave mustWriteViaTool[].content com a ferramenta Write
# 3) confira os bytes
node scripts/lib/release-scaffold.mjs verify
# → {"ok":true,...}   ok:false → NÃO prossiga; reporte o mismatch.
```

Se o `applyScaffold` devolver `refused`, **não contorne**: mostre o motivo ao usuário
(`sem repositório git`, `não confirmado`, `autonomia`, `branch protegida`, `contenção`).

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
      description: "Apenas busca manual via /devflow:devflow-recall"
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
3. Configurar MCP: adicionar entry ao `.mcp.json` dentro de `mcpServers`:
   ```json
   {
     "mcpServers": {
       "mempalace": {
         "command": "mempalace-mcp",
         "args": []
       }
     }
   }
   ```
   Se `.mcp.json` já existe, merge a entry dentro de `mcpServers`. Se não existe, criar com a estrutura completa.
   (Alternativa equivalente via CLI: `claude mcp add mempalace -- mempalace-mcp`. Não use `python -m mempalace.mcp_server` — o console script `mempalace-mcp` é o entry point canônico e portável.)
4. Inicializar o palace para o projeto: `mempalace init <project-root>` (detecta rooms/wings pela estrutura de pastas)
5. Próximos passos de ativação (documentar ao usuário — **não rodar automaticamente**, pois `mine` é lento e grava no palace global `~/.mempalace`):
   - Minerar o projeto: `/devflow:devflow-memory mine` (ou `mempalace mine <project-root>`)
   - Minerar conversas do Claude Code: `/devflow:devflow-memory mine --convos` (ou `mempalace mine ~/.claude/projects/ --mode convos --wing <repo>`)
   - Carregar contexto numa nova sessão: `/devflow:devflow-memory wake-up` (ou `mempalace wake-up --wing <repo>`)
6. Seguir para P7 e P8

### 2.35 (opcional) Instinct System — loop de aprendizado automático

O Instinct System observa seu tool-use via hooks e destila **instincts** (hábito → ação) pontuados por confiança (0.3→0.9), reinjetados no início da sessão. É **complementar — não redundante** — com a memória já existente do DevFlow:

| Mecanismo | Papel | Como alimenta |
|---|---|---|
| **MemPalace** | memória semântica (grafo/diários) | mining **invocado** sob demanda |
| **napkin** | runbook curado (erros/padrões) | **à mão** |
| **auto-memory** (`MEMORY.md`) | fatos do usuário/projeto | escrita **manual** |
| **Instinct System** | hábitos `trigger→ação` + confiança | **captura automática** via hooks |

O Instinct é o único que **captura sozinho** (baixo atrito) e **acumula confiança**; quando um instinct amadurece (≥0.8), ele **PROPÕE** uma entrada no napkin / referência no MemPalace. Ou seja: ele **alimenta** os outros, **não os substitui nem duplica**. Não exige MCP (Node puro).

**P-instincts: Ativar o Instinct System?** (default off — piso de privacidade ADR-005)
```
AskUserQuestion:
  question: "Ativar o Instinct System? Ele observa AUTOMATICAMENTE seu tool-use e destila hábitos (trigger→ação) pontuados por confiança, reinjetados no SessionStart. COMPLEMENTA (não duplica) MemPalace/napkin: captura sozinho e PROPÕE entradas pra eles quando um hábito amadurece. Local-by-default, opt-in, nunca commitado."
  header: "Instinct System"
  multiSelect: false
  options:
    - label: "Não (Recomendado)"
      description: "Mantém desligado (default). Pode ativar depois com /devflow instinct."
    - label: "Sim, ativar"
      description: "Captura automática + recall no SessionStart. Requer repo git (escopo por remote). Gera instincts.enabled: true."
```

**Regra de geração:** Se "Sim" → incluir a seção `instincts:` com `enabled: true` (ver §3). Se "Não" (default) → **não incluir** a seção (ausência = `enabled: false`). Em ambos os casos, deixar claro no resumo final que a ativação também pode mudar depois via `/devflow instinct` ou editando o YAML (precedência N2: env só restringe).

### 2.4 (opcional) docs-mcp-server — referência de stacks via MCP

Substitui o paradigma antigo de `.context/stacks/refs/<lib>@<ver>.md` por um índice de documentação consultável via tools MCP (`scrape_docs`, `search_docs`, `list_libraries`). Store global em `~/.local/share/docs-mcp-server/` é compartilhado entre projetos (dedup).

**Detectar instalação existente:**
```bash
HAS_DOCS_MCP=false
if [ -f ".mcp.json" ] && grep -q "docs-mcp-server" ".mcp.json" 2>/dev/null; then
  HAS_DOCS_MCP=true
elif [ -f "${HOME}/.config/claude/mcp.json" ] && grep -q "docs-mcp-server" "${HOME}/.config/claude/mcp.json" 2>/dev/null; then
  HAS_DOCS_MCP=true
fi
```

**Se `HAS_DOCS_MCP=true`:** pular setup (já configurado). Apenas informar no resumo final.

**Se `HAS_DOCS_MCP=false`, P9: Ativar docs-mcp-server?**
```
AskUserQuestion:
  question: "Configurar docs-mcp-server para indexar docs das stacks deste projeto?"
  header: "docs-mcp-server"
  multiSelect: false
  options:
    - label: "Sim, configurar agora"
      description: "Adiciona entry MCP no .mcp.json. Após restart do Claude Code, scrape de stacks via tool MCP (sem gerar .md gigantes)"
    - label: "Não, pular"
      description: "Continuar usando refs .md em .context/stacks/refs/ (paradigma antigo)"
```

**Se sim (configurar):**
1. Adicionar entry ao `.mcp.json` dentro de `mcpServers` (merge se já existe, criar se não) — aponta para o **docs-mcp-server hospedado** (sem npx/CLI local):
   ```json
   {
     "mcpServers": {
       "docs-mcp-server": {
         "type": "http",
         "url": "https://docs-mcp.nexuz.app/mcp"
       }
     }
   }
   ```
2. Avisar o usuário **explicitamente** que o Claude Code precisa ser reiniciado para carregar o novo MCP server (`exit` + relaunch). Sem restart, as tools `mcp__docs-mcp-server__*` não estarão disponíveis na sessão atual.
3. Ressaltar que o store é **hospedado e compartilhado** (não há store local em `~/.local/share/`): scrape via tool `mcp__docs-mcp-server__scrape_docs` e limpeza via `mcp__docs-mcp-server__remove_docs` (não há comando npx local).

### 2.5 (opcional) Doc-grounding obrigatório

Força o sourcing de fatos de **stack externo** (lib/framework/API/versão) **apenas** pelo MCP de documentação: bloqueia `WebSearch`/`WebFetch` (hard, via `pre-tool-use`), exige citação e é **fail-closed** (MCP vazio/down → o agente para e declara, não responde de memória de treino). Operacionaliza o `std-grounding` para conhecimento de stack. Depende de um docs-mcp-server (§2.4).

> **Honestidade:** o modo NÃO desliga o conhecimento de treino do modelo (não há trava nos pesos). Ele eleva a guarda a *web bloqueado + citação obrigatória + fail-closed*. Escopo = só stack externo; raciocínio geral e o código do próprio projeto (via Read/Grep) seguem livres.

**Detectar o(s) server(s) de docs:** em `.mcp.json` (e `~/.config/claude/mcp.json`), liste as chaves de `mcpServers` cujo nome contém `docs`. Se houver **mais de um** (ex.: `docs-mcp-server` e `plugin_devflow_docs-mcp-server`), o usuário escolhe qual é a fonte canônica.

**P10: Ativar doc-grounding?**
```
AskUserQuestion:
  question: "Forçar grounding via MCP de docs para fatos de stack externo? (bloqueia web e conhecimento de treino não-citado)"
  header: "Doc-grounding"
  multiSelect: false
  options:
    - label: "Não (off)"
      description: "Desativado (default). Comportamento atual."
    - label: "docs-first"
      description: "Consulta o MCP primeiro; se vazio/down, complementa COM disclosure explícito 'fonte: treino, não verificado'. Web bloqueado."
    - label: "docs-only (estrito)"
      description: "Fato de stack só com o MCP. Vazio/timeout → para e avisa (fail-closed). Web bloqueado."
```

- **Se != off e houver >1 server de docs:** perguntar qual é o `docsMcpServer` canônico (listar os detectados).
- **Se != off e nenhum docs-mcp-server detectado:** avisar que o modo ficará fail-closed para **todo** fato de stack — recomendar configurar o docs-mcp-server (§2.4) primeiro; permitir ativar mesmo assim.

### 2.6 (opcional) Orquestrador de execução paralela (Agent Orchestrator)

Validar a pré-condição (plugin em --scope user) antes de oferecer:

```bash
claude plugin list 2>/dev/null | node "$CLAUDE_PLUGIN_ROOT/scripts/lib/orchestrator-config.mjs" check-user-scope "devflow@NEXUZ-SYS" "superpowers@"
```

- Se `NEEDS_USER_SCOPE`: NÃO oferecer ativação. Informar que, para usar o AO, é preciso
  `claude plugin install devflow@NEXUZ-SYS --scope user` (+ superpowers), e gravar `orchestrator.enabled: false`.
- Se `USER_SCOPE_OK`, perguntar:

```
AskUserQuestion:
  question: "Usar o Agent Orchestrator para execução paralela na fase E (para casos quando necessário)?"
  header: "Agent Orchestrator"
  multiSelect: false
  options:
    - label: "Sugerir quando compensar (Recomendado)"
      description: "AO sugere ativação automática para tarefas LARGE com histórias independentes — mode: suggest"
    - label: "Automático"
      description: "AO ativa automaticamente sem intervenção — mode: auto"
    - label: "Não usar"
      description: "Desativar integração com o Agent Orchestrator — enabled: false"
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
  # versioning: pipeline — só presente se o usuário escolheu a pipeline de release (P5b)
```

**Regras de geração:**
- Se trunk-based: gerar apenas `strategy: trunk-based` e `prCli`
- Se autoFinish = "Não": **não incluir** a chave `autoFinish` (ausência = desativado)
- Se autoFinish = "Sim, tudo": incluir `autoFinish: true`
- Se autoFinish = "Personalizar": incluir como objeto com as chaves selecionadas em `true`, as não selecionadas em `false`

**Regras de geração (versionamento — P5b):**
- Se "Bump local no finish (padrão)": **não incluir** a chave `versioning` (ausência = `local`, retrocompatível).
- Se "Pipeline de release (CI)": incluir `versioning: pipeline` no bloco `git:`. Nesse modo o finish (`prevc-confirmation` Step 2) **pula o bump local** e o `BUMP WARNING` do PostToolUse é suprimido — o bump é único, feito pela pipeline de release.
- Se **não há mecanismo de versão** (P5b não perguntada): incluir `versioning: none` no bloco `git:` — o finish não bumpa e o `BUMP WARNING` fica silencioso (projeto sem release).

**Cross-check obrigatório (P5 × P5b) — par contraditório:**
`autoFinish` com `bump: true` (forma "Personalizar", ou "Sim, tudo") **conflita** com `versioning ∈ {pipeline, none}`: o `bump` do autoFinish pede bump local no finish, mas `versioning: pipeline`/`none` diz que o finish **não** bumpa (o bump é da pipeline, ou não há release) — juntos causam **double-bump/drift** de versão. Ao gerar o YAML, se essa combinação surgir, **NÃO gere em silêncio**: avise o usuário do conflito e ofereça resolver — (a) manter `versioning: pipeline`/`none` e **remover o `bump: true`** do autoFinish (recomendado; o bump fica com a pipeline), ou (b) trocar para `versioning: local` se ele realmente quer bump local no finish. Recusar a gravação do par contraditório até a escolha.

**Regras de geração para instincts (Instinct system):**
- Se **P-instincts = "Não" (default)** → **não incluir** a seção `instincts:` (ausência = `enabled: false`, piso de privacidade ADR-005 v1.1.0).
- Se **P-instincts = "Sim, ativar"** → incluir a seção (forma do spec; MVP enforça `enabled` + `recall.maxChars`):
  ```yaml
  instincts:
    enabled: true
    profile: standard        # off | minimal | standard
    recall:
      minConfidence: 0.6
      maxChars: 2000
  ```
- Precedência (N2): env `DEVFLOW_INSTINCTS_ENABLED=0` (opt-out) > env `DEVFLOW_INSTINCT_PROFILE` > YAML. `enabled: false` é o piso. Detalhes em `/devflow instinct`.

**Regras de geração para mempalace:**
- Se mempalace desativado ou pulado: **não incluir** a seção `mempalace:` (ausência = desativado)
- Se habilitado com defaults: incluir seção mínima:
  ```yaml
  mempalace:
    enabled: true
    autoMine: post-merge   # auto-mine no git hook post-merge (off desativa)
  ```
- Se habilitado com customizações:
  ```yaml
  mempalace:
    enabled: true
    autoMine: post-merge             # post-merge (default) | off
    palace: <caminho personalizado>  # só se diferente do default
    budget: <valor>                  # só se diferente de 500
    auto_recall: false               # só se desativado
  ```
- `autoMine: post-merge` é o default — o hook `post-merge` (instalado via `/devflow:devflow-memory install-hook`) só minera quando este valor é `post-merge`; `off` desativa sem desinstalar o hook
- `wing: auto` é o default — só incluir se o usuário informar um nome customizado
- `auto_diary: true` é o default — só incluir se desativado

**Regras de geração para grounding:**
- Se off ou pulado (P10): **não incluir** a seção `grounding:` (ausência = off; os hooks só ativam quando `mode != off`)
- Se docs-first ou docs-only:
  ```yaml
  grounding:
    mode: docs-first        # docs-first | docs-only
    docsMcpServer: docs-mcp-server  # server canônico escolhido em §2.5
    blockWeb: true          # nega WebSearch/WebFetch no pre-tool-use
    failClosed: true        # MCP down/vazio → parar, não responder de memória
    # blockToolPatterns: [] # (opcional) padrões extras de tool-name de MCP de internet a negar
  ```

**Regras de geração para orchestrator:**
- Se o Step 2.6 não foi alcançado/respondido (entrevista abreviada ou trunk-based): **não incluir** a seção `orchestrator:` (ausência = não configurado, consistente com as demais seções opcionais).
- Se `NEEDS_USER_SCOPE` **ou** o usuário escolheu "Não usar": gerar o bloco mínimo via `orchestratorBlock({enabled:false})` e **anexar** (decisão consciente registrada explicitamente no YAML).
- Se o usuário escolheu "Sugerir quando compensar" ou "Automático": gerar o bloco completo via `orchestratorBlock({mode:'<MODE>'})` (sem `enabled` — default é `true`) e **anexar**.

Gerar com a lib (não escrever à mão):

```bash
# Quando enabled:false (NEEDS_USER_SCOPE ou "Não usar") — NÃO passar mode (lib ignora):
node "$CLAUDE_PLUGIN_ROOT/scripts/lib/orchestrator-config.mjs" block-disabled

# Quando enabled:true — passar mode escolhido (suggest ou auto):
node "$CLAUDE_PLUGIN_ROOT/scripts/lib/orchestrator-config.mjs" block-mode "<MODE>"
```

Substituir `<MODE>` por `suggest` (opção "Sugerir quando compensar") ou `auto` (opção "Automático"). Quando `enabled:false`, chamar sem `mode` — a lib descarta o campo. Anexar a saída ao `.devflow.yaml`.

**Regras de geração no modo patch incremental (Step 5.3):**
- **NUNCA** regenerar o arquivo inteiro. Aplicar **somente** a(s) seção(ões) da(s) unidade(s) selecionada(s); o cabeçalho-comentário e as demais seções ficam verbatim.
- Para cada seção YAML (`git:`, `mempalace:`, `grounding:`): montar o bloco com as regras acima e aplicá-lo via o helper `scripts/lib/devflow-yaml-merge.mjs` — `mergeSection(yamlAtual, "<nome>", "<bloco>")` substitui-ou-anexa preservando o resto. Equivalente manual: usar `Edit` para trocar/anexar **apenas** o bloco `<nome>:`.
- `routines.json` (§4.6) e `.mcp.json` (§2.4) já são não-destrutivos por construção (`|| cp` e merge dentro de `mcpServers`) — não sobrescrever.
- Se uma unidade for desmarcada, **não emitir** sua seção — ausência continua significando desativado (regras acima).
- **`orchestrator:`** — **somente** se o Step 2.6 foi respondido (não pulado): se ausente, gerar via `orchestratorBlock(...)` e anexar; se presente, substituir o bloco inteiro preservando as demais seções. Usar `{enabled:false}` quando "Não usar" ou `NEEDS_USER_SCOPE`; usar `{mode:'<MODE>'}` quando habilitado. Se o Step 2.6 foi pulado, **não tocar** na seção `orchestrator:` (ausência continua significando não configurado).

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
  docs-mcp-server: ativado (.mcp.json)       ← novo (só se configurado — reiniciar Claude Code)

Para reconfigurar: /devflow config
```

### 4.5 Oferecer instalação do hook de auto-mine (opt-in)

**Só executar se** mempalace foi ativado **e** `autoMine` é `post-merge` (default).

O flag `autoMine: post-merge` sozinho **não faz nada** até o git hook `post-merge` ser instalado — instalar mexe no `.git/` do projeto, então é opt-in explícito. Para fechar esse gap sem ser intrusivo, **oferecer** a instalação agora:

```
AskUserQuestion:
  question: "Ativar o auto-mine do MemPalace agora? Instala um git hook post-merge que sincroniza a memória do projeto a cada merge/pull na branch protegida."
  header: "Auto-mine"
  multiSelect: false
  options:
    - label: "Sim, instalar o hook"
      description: "Roda /devflow:devflow-memory install-hook (não-bloqueante, fail-safe, não sobrescreve hook existente)"
    - label: "Agora não"
      description: "Deixa só o flag em .devflow.yaml. Instale depois com /devflow:devflow-memory install-hook"
```

- **Se sim:** rodar `bash "$CLAUDE_PLUGIN_ROOT/scripts/install-git-hook.sh" "$(git rev-parse --show-toplevel)"`. Se o instalador avisar sobre um hook `post-merge` alheio, **não** sobrescrever — repassar as instruções de encadeamento que ele imprime.
- **Se não:** informar que o auto-mine fica inativo até rodar `/devflow:devflow-memory install-hook` (ou que `autoMine: off` desativa o flag).

### 4.6 Semear rotinas de manutenção (`.context/routines.json`)

Se ainda não existir `.context/routines.json`, criar a partir do template para habilitar o health-check periódico do contexto (`/devflow:devflow-doctor` via routine `context-maintenance`):

```bash
[ -f .context/routines.json ] || cp "$CLAUDE_PLUGIN_ROOT/templates/routines.json" .context/routines.json
```

O SessionStart passa a **sugerir** rodar `/devflow:devflow-routines run context-maintenance` quando vencer (a cada 7d), sem executar. O usuário pode `snooze`/`disable` via `/devflow:devflow-routines`.

### 5. Se `.context/.devflow.yaml` já existe

**Não** trate isto como um binário "manter tudo" vs "reconfigurar tudo". O caminho padrão é o **patch incremental**: mostrar o estado de TODAS as áreas (inclusive as ausentes) e configurar **apenas** as selecionadas, sem tocar no resto.

#### 5.1 Painel de estado

Ler o YAML atual e sondar o ambiente para montar um quadro de cada área configurável — ✅ quando configurada (com o valor) e ⬚ quando ausente. Detecções:

```bash
# Seções de topo presentes no YAML
SECTIONS=$(node "$CLAUDE_PLUGIN_ROOT/scripts/lib/devflow-yaml-merge.mjs" top-level-keys .context/.devflow.yaml)

# Rotinas de manutenção
[ -f .context/routines.json ] && echo "routines: sim" || echo "routines: nao"

# Hook git de auto-mine do MemPalace
{ [ -f .git/hooks/post-merge ] && grep -q mempalace .git/hooks/post-merge 2>/dev/null && echo "automine-hook: sim"; } || echo "automine-hook: nao"

# docs-mcp-server e mempalace MCP → reusar as detecções de §2.4 (HAS_DOCS_MCP) e P6 (HAS_MEMPALACE)
```

Imprimir um painel cobrindo as 9 áreas (✅/⬚), por exemplo:

```
Estado atual de .context/.devflow.yaml:
  ✅ Estratégia git ........ branch-flow (main, develop)
  ✅ CLI de PR ............. gh
  ✅ Branch protection ..... ativada
  ✅ Auto-finish ........... ativado (tudo)
  ✅ MemPalace ............. ativado (global, 1000)  · hook auto-mine: ⬚ não instalado
  ✅ docs-mcp-server ....... ativado (.mcp.json)
  ✅ Doc-grounding ......... docs-only
  ⬚ Rotinas de manutenção . não configurado
```

#### 5.2 Menu de 3 vias

```
AskUserQuestion:
  question: "O .context/.devflow.yaml já existe. Como deseja proceder?"
  header: "Reconfigurar?"
  multiSelect: false
  options:
    - label: "Patch incremental (Recomendado)"
      description: "Escolher quais áreas configurar — só elas mudam, o resto fica intacto"
    - label: "Reconfigurar tudo"
      description: "Rodar a entrevista completa e sobrescrever todas as seções"
    - label: "Manter como está"
      description: "Não alterar nada; encerrar"
```

- **Manter como está** → encerrar.
- **Reconfigurar tudo** → rodar a entrevista completa (Steps 2→4.6) e regenerar o arquivo normalmente.
- **Patch incremental** → seguir 5.3.

#### 5.3 Patch incremental

> ⚠️ **Runtime cap:** no Claude Code o `AskUserQuestion` aceita **no máximo 4 opções por pergunta**. As 5 áreas são apresentadas como **um único call com duas perguntas** (3+2). A **união** das seleções das duas perguntas é o conjunto de áreas a configurar.

```
AskUserQuestion (1 call, 2 perguntas):
  questions:
    - question: "Áreas a configurar agora (1/2)? (as não marcadas ficam intactas)"
      header: "Áreas 1/2"
      multiSelect: true
      options:
        - label: "Estratégia git e finalização"
          description: "Estratégia, branches protegidas, CLI de PR, branch protection, auto-finish (P1–P5)"
        - label: "MemPalace"
          description: "Integração de memória + budget/palace + hook de auto-mine (P6–P8 + §4.5)"
        - label: "docs-mcp-server"
          description: "Índice de docs de stacks via MCP (§2.4)"
    - question: "Áreas a configurar agora (2/2)? (as não marcadas ficam intactas)"
      header: "Áreas 2/2"
      multiSelect: true
      options:
        - label: "Doc-grounding"
          description: "Sourcing obrigatório de fatos de stack via MCP (§2.5 — depende do docs-mcp-server)"
        - label: "Rotinas de manutenção"
          description: "Semear .context/routines.json com o health-check periódico (§4.6)"
```

**Pré-marcar (multiSelect default) apenas as áreas ausentes** do painel 5.1 (em ambas as perguntas) — assim o default já é "só o que falta", mas o usuário pode marcar uma área já configurada para alterá-la. Trate a **união** das duas respostas como a lista final de unidades a aplicar.

Para **cada** unidade selecionada, rodar **somente** o(s) bloco(s) de pergunta correspondente(s) e aplicar o resultado de forma **não-destrutiva** (ver "Regras de geração no modo patch", abaixo):

| Unidade | Blocos a rodar | Como aplicar |
|---|---|---|
| Estratégia git e finalização | P1–P5 (+ §4.5/§4.6 se já cobertos por outras unidades, não duplicar) | `mergeSection(yaml, "git", <bloco git:>)` |
| MemPalace | P6–P8 + oferta de hook §4.5 | `mergeSection(yaml, "mempalace", <bloco mempalace:>)` + §4.5 |
| docs-mcp-server | §2.4 / P9 | editar `.mcp.json` (merge em `mcpServers`) |
| Doc-grounding | §2.5 / P10 | `mergeSection(yaml, "grounding", <bloco grounding:>)` |
| Rotinas de manutenção | §4.6 | criar `.context/routines.json` (só se ausente) |

Ao final, reimprimir o painel 5.1 atualizado para confirmar o que mudou.

## Ações disponíveis

Além da entrevista de configuração, este skill oferece:

- **Re-tunar campos omp dos agentes** — roda `scripts/lib/omp-enrich-project-agents.mjs` (só campos omp; preserva corpo). Útil quando `omp` ∈ runtimes e os defaults de `omp/omp-roles.yaml` mudaram.

## Integração

- **`/devflow config`** → invoca este skill diretamente
- **`/devflow init`** → chama este skill como parte do setup (se `.context/.devflow.yaml` não existir)
- **Hook `pre-tool-use`** → quando bloqueia por falta de config, instrui o usuário a rodar `/devflow config`

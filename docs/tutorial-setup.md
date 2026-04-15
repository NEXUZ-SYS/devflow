# DevFlow — Guia Completo de Uso

Do zero ao deploy: instalação, configuração, e o fluxo completo de desenvolvimento com DevFlow.

---

## Sumário

- [1. O que é o DevFlow](#1-o-que-é-o-devflow)
- [2. Instalação](#2-instalação)
  - [2.1 Pré-requisitos](#21-pré-requisitos)
  - [2.2 Instalar superpowers](#22-instalar-superpowers)
  - [2.3 Instalar DevFlow](#23-instalar-devflow)
  - [2.4 Instalar dotcontext (opcional)](#24-instalar-dotcontext-opcional)
  - [2.5 Instalar MemPalace (opcional)](#25-instalar-mempalace-opcional)
  - [2.6 Verificar instalação](#26-verificar-instalação)
- [3. Inicializar em um projeto](#3-inicializar-em-um-projeto)
  - [3.1 Projeto novo](#31-projeto-novo)
  - [3.2 Projeto existente](#32-projeto-existente)
  - [3.3 Projeto com dotcontext existente](#33-projeto-com-dotcontext-existente)
  - [3.4 Configurar idioma](#34-configurar-idioma)
  - [3.5 Verificar o modo ativo](#35-verificar-o-modo-ativo)
  - [3.6 O que foi gerado](#36-o-que-foi-gerado)
- [4. Conceitos fundamentais](#4-conceitos-fundamentais)
  - [4.1 O workflow PREVC](#41-o-workflow-prevc)
  - [4.2 Escalas](#42-escalas)
  - [4.3 Modos de operação](#43-modos-de-operação)
  - [4.4 Modos de autonomia](#44-modos-de-autonomia)
  - [4.5 Agentes especialistas](#45-agentes-especialistas)
  - [4.6 TDD obrigatório (HARD-GATE)](#46-tdd-obrigatório-hard-gate)
  - [4.7 Git strategy (branch protection)](#47-git-strategy-branch-protection)
  - [4.8 Persistência entre sessões](#48-persistência-entre-sessões)
  - [4.9 Napkin — memória de aprendizado](#49-napkin--memória-de-aprendizado)
  - [4.10 ADRs — guardrails organizacionais](#410-adrs--guardrails-organizacionais)
  - [4.11 MemPalace — memória semântica persistente](#411-mempalace--memória-semântica-persistente)
  - [4.12 PostToolUse — commit e finish-branch automáticos](#412-posttooluse--commit-e-finish-branch-automáticos)
- [5. Fluxo completo: do PRD ao merge](#5-fluxo-completo-do-prd-ao-merge)
  - [5.1 Gerar o PRD (roadmap de produto)](#51-gerar-o-prd-roadmap-de-produto)
  - [5.2 Iniciar a primeira fase do PRD](#52-iniciar-a-primeira-fase-do-prd)
  - [5.3 P — Planning](#53-p--planning)
  - [5.4 R — Review](#54-r--review)
  - [5.5 E — Execution](#55-e--execution)
  - [5.6 V — Validation](#56-v--validation)
  - [5.7 C — Confirmation](#57-c--confirmation)
  - [5.8 Fechar a fase no PRD e seguir para a próxima](#58-fechar-a-fase-no-prd-e-seguir-para-a-próxima)
- [6. Loop autônomo](#6-loop-autônomo)
  - [6.1 stories.yaml](#61-storiesyaml)
  - [6.2 Fluxo de execução](#62-fluxo-de-execução)
  - [6.3 PRD para stories (--from-prd)](#63-prd-para-stories---from-prd)
  - [6.4 Upgrade de autonomia mid-workflow](#64-upgrade-de-autonomia-mid-workflow)
  - [6.5 devflow-runner.mjs (safety net)](#65-devflow-runnermjs-safety-net)
- [7. Exemplos por escala](#7-exemplos-por-escala)
  - [7.1 QUICK — Bug fix](#71-quick--bug-fix)
  - [7.2 SMALL — Feature simples](#72-small--feature-simples)
  - [7.3 MEDIUM — Feature multi-componente](#73-medium--feature-multi-componente)
  - [7.4 LARGE — Migração sistêmica](#74-large--migração-sistêmica)
- [8. Capabilities on-demand](#8-capabilities-on-demand)
  - [8.1 Sem workflow ativo](#81-sem-workflow-ativo)
  - [8.2 Durante um workflow](#82-durante-um-workflow)
- [9. Comandos de navegação](#9-comandos-de-navegação)
- [10. Agentes em detalhe](#10-agentes-em-detalhe)
  - [10.1 Quando cada agente é usado](#101-quando-cada-agente-é-usado)
  - [10.2 Sequências comuns](#102-sequências-comuns)
  - [10.3 Despachar manualmente](#103-despachar-manualmente)
- [11. Manutenção do projeto](#11-manutenção-do-projeto)
  - [11.1 Atualizar contexto](#111-atualizar-contexto)
  - [11.2 Atualizar plugins](#112-atualizar-plugins)
- [12. Compatibilidade com outras ferramentas](#12-compatibilidade-com-outras-ferramentas)
- [13. Troubleshooting](#13-troubleshooting)
- [14. Referência rápida](#14-referência-rápida)

---

## 1. O que é o DevFlow

DevFlow é um plugin que transforma o Claude Code em um time de engenharia completo. Ele conecta duas camadas:

| Camada | O que faz | Exemplos |
|--------|-----------|----------|
| **superpowers** | Disciplina de desenvolvimento | TDD, brainstorming socrático, code review, SDD |
| **dotcontext** | Contexto e orquestração | Agentes via MCP, análise semântica, sync multi-tool |

O resultado é um fluxo unificado chamado **PREVC** (Planning → Review → Execution → Validation → Confirmation) que garante que todo código passe por planejamento, revisão, testes e documentação.

**Markdown puro + shell. Zero dependências de runtime.**

---

## 2. Instalação

### 2.1 Pré-requisitos

| Ferramenta | Versão | Como verificar | Instalar |
|------------|--------|---------------|----------|
| Claude Code | latest | `claude --version` | [claude.ai/claude-code](https://claude.ai/claude-code) |
| Node.js | 20+ | `node --version` | [nodejs.org](https://nodejs.org/) |
| Git | 2.x+ | `git --version` | [git-scm.com](https://git-scm.com/) |

### 2.2 Instalar superpowers

Superpowers é a camada de disciplina — TDD, brainstorming, code review, subagent-driven development.

**No terminal:**
```bash
claude plugin install superpowers@claude-plugins-official --scope user
```

**Ou dentro do Claude Code:**
```
/plugin install superpowers@claude-plugins-official --scope user
```

**Verificar:** Abra o Claude Code e digite `/`. Deve aparecer:
```
superpowers:brainstorming
superpowers:test-driven-development
superpowers:writing-plans
superpowers:systematic-debugging
...
```

### 2.3 Instalar DevFlow

**No terminal:**
```bash
# Registrar marketplace (uma vez)
claude plugin marketplace add NEXUZ-SYS/devflow

# Instalar o plugin
claude plugin install devflow@NEXUZ-SYS --scope user
```

**Ou dentro do Claude Code:**
```
/plugin marketplace add NEXUZ-SYS/devflow
/plugin install devflow@NEXUZ-SYS --scope user
```

### 2.4 Instalar dotcontext (opcional)

Dotcontext habilita o **Full Mode** — agentes via MCP, análise semântica com tree-sitter, sync multi-tool. Sem ele, o DevFlow funciona em Lite ou Minimal.

```bash
npm install -g @dotcontext/cli
dotcontext --version
```

> **Nunca use `npx` para subcomandos do dotcontext com `:` (ex: `mcp:install`).** O npm 11+ interpreta o `:` como separador de script. Sempre use o binário global.

### 2.5 Instalar MemPalace (opcional)

MemPalace habilita **memória semântica persistente entre sessões** — os agentes conseguem recuperar decisões passadas, convenções, bugs já investigados, evitando retrabalho.

**Instalar (canônico — pacote Python via pipx):**
```bash
pipx install mempalace
# ou, sem pipx: pip install --user mempalace
mempalace mcp:install claude --local
```

> ⚠️ Não use `npm install -g @mempalace/cli` — o pacote npm é legado e está desatualizado. MemPalace é projeto Python nativo.

**Ou via MCP direto no projeto** (recomendado — respeita escopo por projeto):
```bash
cd meu-projeto
mempalace mcp:install claude --local
```

**O que ativa:**
- Skill `devflow:memory-recall` — busca na memória persistente
- Comando `/devflow-recall <query>` — consulta rápida de memórias
- Agente `memory-specialist` — curador/consultor da memória
- Auto-recall no SessionStart (injeta memórias relevantes)
- Diary flush no PreCompact / rehydration no PostCompact
- Entrevista de config mempalace no `/devflow init`

**Verificar ativação:**
```bash
cat .mcp.json | grep mempalace
# Deve aparecer a entry; se sim, /devflow-status mostra "MemPalace: true"
```

> **MemPalace vs Napkin:** Napkin é local (`.context/napkin.md`, curado manualmente), MemPalace é semântico (vector DB, busca por similaridade). Use ambos — Napkin para runbooks curados, MemPalace para histórico automático.

### 2.6 Verificar instalação

```bash
cat ~/.claude/plugins/installed_plugins.json | grep -E "devflow|superpowers"
```

Resultado esperado:
```
✅ Claude Code          — runtime
✅ superpowers plugin   — disciplina (TDD, brainstorming, code review)
✅ devflow plugin       — workflow PREVC, 16 agentes, 32 skills
✅ dotcontext CLI       — análise semântica, MCP (opcional — habilita Full Mode)
✅ mempalace CLI        — memória semântica persistente (opcional)
```

---

## 3. Inicializar em um projeto

### 3.1 Projeto novo

```bash
mkdir meu-projeto && cd meu-projeto && git init
claude
```

Dentro do Claude Code:
```
/devflow init
```

O DevFlow vai:
1. **Perguntar o idioma — gate bloqueante** (desde v0.10.4): nada acontece antes da escolha. O idioma selecionado é propagado ao dotcontext via `--lang` e todo conteúdo gerado (docs, agents, skills) fica no idioma escolhido.
2. Escanear o projeto (stack, estrutura, padrões)
3. **Entrevista de stack + ADR recommendation** (desde v0.9.0): o DevFlow pergunta sobre convenções (TDD, layered architecture, OWASP) e instancia ADRs relevantes em `.context/adrs/`
4. Instalar o MCP server do dotcontext (se disponível, já com `--lang`)
5. **Entrevista de config mempalace** (se instalado): pergunta se quer habilitar memória persistente
6. Scaffoldar `.context/` com agentes, skills e docs personalizados
7. Perguntar sua estratégia git (branch-flow, worktree ou trunk-based)
8. Detectar o modo (Full/Lite/Minimal)

### 3.2 Projeto existente

```bash
cd /caminho/do/meu-projeto
claude
```

```
/devflow init
```

Mesmo fluxo, mas o DevFlow analisa o código existente para gerar playbooks de agentes e docs mais ricos. Se dotcontext estiver disponível, usa análise AST com tree-sitter para mapear símbolos, dependências e padrões de arquitetura.

### 3.3 Projeto com dotcontext existente

Se o projeto já tem `.context/`, o `/devflow init` detecta e executa um **sync** em vez de sobrescrever:

```
/devflow init

→ .context/docs/ detectado. Executando sync...
→ Atualizando project-overview.md, codebase-map.json...
→ Full Mode habilitado.
→ Sync completo. 8 docs atualizados, 3 agentes adicionados.
```

### 3.4 Configurar idioma

O DevFlow é multilíngue. Na primeira inicialização (`/devflow init`), ele pergunta o idioma automaticamente. Para mudar depois:

```
/devflow language
```

Menu interativo:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DevFlow — Selecione seu idioma
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. English
  2. Português (Brasil)
  3. Español

  Current: pt-BR

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Ou diretamente:
```
/devflow language pt-BR
/devflow language en-US
/devflow language es-ES
```

**O que muda:**
- Todas as respostas do Claude passam a ser no idioma selecionado
- Mensagens dos hooks (branch protection, rehydration, handoff) são traduzidas
- A preferência é salva em `.devflow-language` (projeto) ou `~/.devflow-language` (global)
- As respostas mudam imediatamente; as mensagens dos hooks mudam na próxima sessão

**Resolução de idioma (prioridade):**
1. `.devflow-language` no projeto (por projeto)
2. `~/.devflow-language` (global do usuário)
3. Variável `$LANG` do sistema
4. Fallback: `en-US`

### 3.5 Verificar o modo ativo

```
/devflow-status
```

```
DevFlow Mode: full
- superpowers: true
- dotcontext MCP: true
- dotcontext lite (.context/): true

Nenhum workflow ativo. Inicie um com:
  /devflow <descrição>
  /devflow prd              (gerar roadmap de produto)
```

### 3.6 O que foi gerado

```
meu-projeto/
├── .mcp.json                              ← config do MCP (se dotcontext)
├── .devflow-language                      ← idioma selecionado (ex: pt-BR)
└── .context/
    ├── agents/
    │   ├── architect.md                   ← design de sistema
    │   ├── product-manager.md             ← PRDs e roadmap
    │   ├── backend-specialist.md          ← APIs e serviços
    │   ├── frontend-specialist.md         ← UI e componentes
    │   ├── code-reviewer.md               ← qualidade de código
    │   ├── test-writer.md                 ← testes
    │   └── ...                            ← 15 agentes no total
    ├── skills/
    │   ├── code-review/SKILL.md
    │   ├── test-generation/SKILL.md
    │   └── ...
    ├── docs/
    │   ├── project-overview.md            ← visão geral do projeto
    │   ├── codebase-map.json              ← mapa semântico
    │   ├── development-workflow.md        ← git strategy e convenções
    │   └── testing-strategy.md            ← frameworks e padrões de teste
    ├── plans/                             ← planos PREVC e PRDs
    └── workflow/
        ├── stories.yaml                   ← stories para loop autônomo
        └── .checkpoint/
            ├── last.json                  ← snapshot para persistência
            └── handoff.md                 ← diário de progresso
```

Cada agente é **personalizado para o seu projeto** — contém paths reais, classes reais, padrões reais. Não são templates genéricos.

---

## 4. Conceitos fundamentais

### 4.1 O workflow PREVC

Todo trabalho no DevFlow passa por até 5 fases, com **gates** (validações) entre elas:

```
[git-strategy gate] → P → R → E → V → C
                      ↑   ↑   ↑   ↑   ↑
                    gate gate gate gate gate
```

| Fase | Nome | O que acontece | Gate para avançar |
|:---:|------|----------------|-------------------|
| **P** | Planning | Brainstorming socrático (9 etapas), contexto do projeto, spec e plano escritos | Spec aprovada + plano escrito |
| **R** | Review | Architect + code-reviewer + security-auditor validam o design | Todas as revisões passam, sem BLOCK findings |
| **E** | Execution | TDD (RED→GREEN→REFACTOR), agent handoffs, subagent-driven development | Todas as tasks completas, testes passando |
| **V** | Validation | Suite completa de testes, spec compliance, segurança, performance | Testes passam, spec cumprida, segurança OK |
| **C** | Confirmation | Branch finalizada, docs atualizados, PR criado, contexto sincronizado | Branch limpa, docs atualizados |

### 4.2 Escalas

O DevFlow ajusta o fluxo com base na complexidade. Você pode deixar a detecção automática ou definir explicitamente:

| Escala | Quando usar | Fases | Exemplo |
|--------|-------------|-------|---------|
| **QUICK** | Bug fix, typo, config | E → V | `/devflow fix typo no README` |
| **SMALL** | Feature simples | P → E → V | `/devflow add endpoint hello world` |
| **MEDIUM** | Multi-componente | P → R → E → V → C | `/devflow scale:MEDIUM add auth com JWT` |
| **LARGE** | Migração, sistema novo | P → R → E → V → C + checkpoints | `/devflow scale:LARGE migrar para GraphQL` |

**Diferença entre MEDIUM e LARGE:** No LARGE, o DevFlow insere checkpoints de progresso durante a Execution para que migrações longas possam ser retomadas.

### 4.3 Modos de operação

| Modo | O que precisa | O que muda |
|------|--------------|------------|
| **Full** | superpowers + dotcontext MCP | Agentes via MCP com análise semântica, orchestration avançado, handoffs automáticos |
| **Lite** | superpowers + `.context/` | Agentes via leitura direta dos playbooks, sem análise semântica |
| **Minimal** | superpowers (ou standalone) | Brainstorming, TDD, code review — fluxo linear sem PREVC |

O modo é detectado automaticamente. Todas as skills se adaptam — se uma feature precisa de MCP mas você está em Lite, ela faz fallback graceful.

### 4.4 Modos de autonomia

O DevFlow suporta 3 níveis de autonomia para o workflow PREVC:

| Modo | Quem controla | Quando usar |
|------|--------------|-------------|
| **supervised** (padrão) | Humano controla tudo, Claude executa | Tarefas críticas, primeiros usos, código sensível |
| **assisted** | Humano faz P+R+V+C, Claude faz E automaticamente | Dia a dia — você planeja e valida, Claude implementa |
| **autonomous** | Claude faz tudo, escalona ao humano em falha | Grandes features com stories claras, execução overnight |

**Como ativar:**

```bash
# Supervised (padrão — não precisa especificar)
/devflow add user profile page

# Assisted — humano nas pontas, execução automática
/devflow add user profile page autonomy:assisted

# Autonomous — loop completo com safety net
/devflow add user profile page autonomy:autonomous
```

**No modo autonomous:**
1. O DevFlow gera um `stories.yaml` durante o Planning com todas as stories priorizadas
2. Na Execution, roda o **loop autônomo**: seleciona a próxima story, despacha o agente, executa com TDD, marca como completa
3. Se uma story falha mais vezes que `max_retries_per_story`, é escalada ao humano
4. Se houver 2+ falhas consecutivas, o modo faz **downgrade automático** para supervised

**Para projetos existentes com PRD:**

```bash
# Converter PRD existente em stories.yaml
/devflow autonomy:autonomous --from-prd
```

Isso lê o PRD em `.context/plans/*-prd.md`, converte cada item do scope em stories com agentes inferidos, e inicia o loop.

**Upgrade de autonomia mid-workflow:**

```bash
# Workflow supervised em andamento → upgrade para autonomous
/devflow autonomy:autonomous
```

O progresso é preservado — stories já completadas mantêm o status.

### 4.5 Agentes especialistas

O DevFlow tem **16 agentes**, cada um com um papel definido:

| Agente | O que faz | Quando é chamado |
|--------|-----------|------------------|
| **architect** | Design de sistema, avalia 2-3 abordagens, documenta decisões | Planning, Review |
| **product-manager** | PRDs, roadmap, RICE scoring, entrevista socrática | Planning (`/devflow prd`), Confirmation |
| **feature-developer** | Implementa features com TDD rigoroso | Execution |
| **bug-fixer** | Root cause analysis com 5-Whys, fix mínimo + teste de regressão | Execution |
| **code-reviewer** | Revisão com severidade BLOCK/WARN/NOTE | Review, Validation |
| **test-writer** | Design de suítes (unit/integration/E2E), cobertura | Execution, Validation |
| **documentation-writer** | API docs, README, inline comments | Confirmation |
| **refactoring-specialist** | Reestrutura sem mudar comportamento, testes antes e depois | Execution |
| **performance-optimizer** | Profiling, identifica bottlenecks, otimizações medidas | Validation |
| **security-auditor** | OWASP Top 10 + checks domain-specific, severidade CRITICAL/HIGH/MEDIUM/LOW | Review, Validation |
| **backend-specialist** | APIs, serviços, banco, validação, error handling | Execution |
| **frontend-specialist** | Componentes, estado, acessibilidade (WCAG 2.1 AA) | Execution |
| **database-specialist** | Schema, migrations reversíveis, queries, indexes | Execution |
| **devops-specialist** | CI/CD, infraestrutura como código, deploy, monitoring | Execution, Confirmation |
| **mobile-specialist** | iOS/Android, offline, bateria, guidelines de plataforma | Execution |
| **memory-specialist** | Curador/consultor da memória semântica (MemPalace) — recall, diary, handoff | SessionStart, PreCompact, on-demand |

Os agentes são despachados **automaticamente** durante o workflow ou **manualmente** via `/devflow-dispatch`.

### 4.6 TDD obrigatório (HARD-GATE)

O DevFlow impõe TDD como um **HARD-GATE bloqueante** — nenhum código de produção pode ser escrito sem um teste falhando primeiro. Isso vale para **TODOS os modos** (supervised, assisted, autonomous) e **TODAS as escalas** (QUICK, SMALL, MEDIUM, LARGE).

**O ciclo obrigatório:**

```
RED     → Escreve teste que FALHA (confirma que falha pelo motivo certo)
GREEN   → Escreve código MÍNIMO para passar
REFACTOR → Melhora sem mudar comportamento
```

**Tipos de teste por área de implementação:**

| Área | Unit | Integration | E2E |
|------|:----:|:-----------:|:---:|
| Business logic, utils | Obrigatório | — | — |
| API endpoints | Obrigatório | Obrigatório | — |
| Database queries | — | Obrigatório | — |
| Auth, pagamentos, registro | Obrigatório | Obrigatório | **Obrigatório** |
| CLI, user flows críticos | Obrigatório | — | **Obrigatório** |
| UI components | Obrigatório | — | — |

**Quando E2E é obrigatório:**
- Autenticação e autorização
- Pagamentos e checkout
- Registro de usuário
- Fluxos CLI do projeto
- Qualquer user flow crítico

**O que conta como teste E2E:**
- Executa o sistema REAL (não mocks)
- Testa o fluxo completo do início ao fim
- Script real que pode ser executado independentemente

**Enforcement no workflow:**
- **Planning (P)**: o plano deve ter steps de teste ANTES de steps de implementação para cada task group
- **Execution (E)**: o agente test-writer roda ANTES do agente de implementação em Full Mode
- **Validation (V)**: verifica não só "testes passam" mas "os TIPOS certos de teste existem" — se E2E era obrigatório e não existe, o workflow retorna à fase E

### 4.7 Git strategy (branch protection)

O DevFlow protege suas branches automaticamente via hook:

**Como funciona:**
1. Você tenta editar um arquivo em `main` ou `develop`
2. O hook **bloqueia** o Edit/Write
3. DevFlow pergunta que tipo de branch criar: `feature/`, `fix/`, `hotfix/`, `release/`
4. Branch criada → edição liberada

**3 estratégias suportadas:**

| Estratégia | Isolamento | Quando usar |
|------------|-----------|-------------|
| **branch-flow** | `git checkout -b feature/nome` | Maioria dos projetos (recomendado) |
| **worktree** | `git worktree add` | Quando precisa de isolamento total (2 features simultâneas) |
| **trunk-based** | Commits diretos na main | Projetos pequenos, deploy contínuo |

Na primeira execução, o `/devflow init` pergunta qual estratégia usar. A configuração fica em `.context/docs/development-workflow.md`.

**Exceções (não bloqueia):**
- Arquivos de workflow: `.context/workflow/*`, `.context/plans/*`, `.context/docs/*`
- Branches de trabalho: `feature/*`, `fix/*`, `hotfix/*`, `release/*`
- Trunk-based configurado

### 4.8 Persistência entre sessões

O DevFlow mantém estado automaticamente:

| Momento | O que acontece | Arquivo |
|---------|---------------|---------|
| **Antes da compactação** | Hook PreCompact salva snapshot (git state, handoff, plano ativo) | `.context/workflow/.checkpoint/last.json` |
| **Após a compactação** | Hook PostCompact injeta snapshot no contexto do modelo | (reinjetado na memória) |
| **Durante o trabalho** | Handoff notes atualizado a cada avanço | `.context/workflow/.checkpoint/handoff.md` |

Isso significa que conversas longas não perdem contexto — quando o Claude compacta, o DevFlow restaura de onde parou.

### 4.9 Napkin — memória de aprendizado

**Desde v0.9.5.** Inspirado em [blader/napkin](https://github.com/blader/napkin), o Napkin é um runbook curado em `.context/napkin.md` que acumula aprendizados entre sessões.

**Como funciona:**
| Hook | Ação |
|------|------|
| **SessionStart** | Injeta `.context/napkin.md` no contexto — Claude já começa a sessão sabendo das lições passadas |
| **PreCompact** | Cura entradas (mantém as mais úteis, descarta ruído) antes da compactação |
| **PostCompact** | Re-injeta o napkin atualizado após a compactação |
| **PostToolUse** | Nudge em falhas repetidas — sugere adicionar ao napkin |

**Estrutura híbrida** (4 categorias fixas + notas por agente):
- `Convenções` — padrões confirmados do projeto (caps 15 entries)
- `Armadilhas` — bugs recorrentes, anti-patterns (caps 15)
- `Decisões` — trade-offs adotados (caps 15)
- `Lições` — retrospectivas (caps 15)
- `Agent-specific notes` — notas por agente (caps 7/agente)

**Adicionar manualmente:**
```
/napkin "Convenção: sempre usar UUID v7 em novas tabelas (ordem temporal)"
```

**Editar:** o arquivo é texto puro em `.context/napkin.md` — edite diretamente quando quiser.

### 4.10 ADRs — guardrails organizacionais

**Desde v0.9.0.** ADRs (Architecture Decision Records) são usados como **guardrails para IA** — regras que o DevFlow lê no Planning e valida no Validation.

**6 templates organizacionais** instanciáveis:

| Template | O que enforça | Quando usar |
|----------|--------------|-------------|
| `SOLID` | Single Responsibility, Open/Closed, Liskov, ISP, DIP | Projetos OO |
| `TDD` | RED→GREEN→REFACTOR obrigatório | Todos |
| `Code Review` | Severidade BLOCK/WARN/NOTE, 2 aprovações | Times 3+ |
| `Layered Architecture` | Separação controller/service/repository | APIs |
| `OWASP Top 10` | Checks de segurança em Review/Validation | Auth/pagamentos |
| `AWS Data Lake` | S3 + Glue + Athena patterns | Data engineering |

**Como são instanciados:**
- `/devflow init` entrevista sobre stack e recomenda ADRs
- `/devflow prd` pergunta sobre convenções organizacionais
- Resposta "sim" → ADR é copiado para `.context/adrs/NNNN-nome.md`

**Onde são usados:**
- **Planning (P)** — `devflow:context-awareness` lê ADRs e injeta no contexto do brainstorming
- **Validation (V)** — compliance check verifica se o código segue cada ADR ativo
- **`/devflow-sync`** — re-sincroniza ADRs com estado atual do projeto

### 4.11 MemPalace — memória semântica persistente

**Desde v0.10.0.** Se você instalou MemPalace ([§2.5](#25-instalar-mempalace-opcional)), o DevFlow adiciona uma camada de memória semântica (vector DB) que persiste entre sessões.

**Comandos:**
```
/devflow-recall <query>        # Busca semântica nas memórias
/devflow-recall auth decisions # Ex: recupera todas decisões sobre auth
```

**Auto-recall (SessionStart):**
- Hook detecta MCP mempalace disponível
- Busca memórias relevantes à branch/último handoff
- Injeta no contexto — Claude já começa a sessão com memória relevante

**Diary flush / rehydration:**
- **PreCompact** — agente memory-specialist faz flush do diário de sessão → MemPalace
- **PostCompact** — memórias relevantes são rehidratadas
- **PostToolUse** — diário de handoff atualizado a cada task completada

**Agente memory-specialist:**
- Curador da memória — decide o que indexar (decisões, bugs, convenções)
- Consultor — agentes consultam antes de decidir (ex: "como resolvemos X antes?")
- Invocável via `/devflow-dispatch memory-specialist`

**Security:** valores YAML sanitizados (sem secrets em memória), config encriptada em repouso quando possível.

### 4.12 PostToolUse — commit e finish-branch automáticos

**Desde v0.8.0.** O hook PostToolUse detecta quando você termina um bloco de trabalho e pergunta proativamente:

**Após um task group completo:**
```
✓ Tarefa concluída: add Google OAuth provider

Quer commitar agora? [Sim/Não/Editar mensagem]
```

**Após a última task do plano:**
```
✓ Todas as 10 tarefas concluídas.

Quer finalizar a branch? [Sim/Não]
→ Se Sim, executa a pipeline obrigatória (ordem sequencial — não pula steps):
    1. Atualizar README.md (Step 1 obrigatório desde v0.10.5)
    2. Version bump (Step obrigatório desde v0.9.1)
    3. Commit
    4. Push
    5. Merge
    6. Cleanup
```

**Comportamento por autonomia:**
| Modo | Commit prompt | Finish-branch prompt |
|------|--------------|---------------------|
| supervised | Pergunta sempre | Pergunta sempre |
| assisted | Pergunta em P+R+V+C, commita automático em E | Pergunta sempre |
| autonomous | Commita automático | Pergunta apenas em falha/conclusão |

**Detecção de capacidades:**
- Se há `gh` instalado e autenticado → sugere abrir PR
- Se branch está `main`/`develop` → pula commit (hook de branch protection bloqueia antes)
- Se há `package.json` com `version` → sugere bump via `scripts/bump-version.sh`

**Anti-patterns bloqueados** (v0.10.2):
- Merge antes de completar README update
- Bump antes de commit da implementação
- Push sem commit de version bump

---

## 5. Fluxo completo: do PRD ao merge

Este é o fluxo de ponta a ponta para um projeto com múltiplas fases. Use como referência para projetos reais.

### 5.1 Gerar o PRD (roadmap de produto)

```
/devflow prd
```

O que acontece:

**1. Detecção de modo:**
- **Modo A** — Projeto novo (sem código significativo): foca em visão e MVP
- **Modo B** — Codebase existente: analisa o que já existe antes de perguntar

**2. Análise de contexto** (Modo B):
```
→ Lendo .context/docs/project-overview.md
→ Analisando git log (últimos 30 commits)
→ Mapeando componentes existentes
→ Draft do "Current State" gerado
```

**3. Entrevista socrática** — uma pergunta por vez:
```
DevFlow: "Essa análise do que já existe corresponde ao seu entendimento?"
Você: "Sim, mas o módulo de auth ainda está incompleto"

DevFlow: "O que você considera completo vs ainda em progresso?"
Você: "User CRUD completo, auth 60%, API de pagamentos nem começou"

DevFlow: "Qual é o objetivo final — como é o produto finalizado?"
Você: "Um SaaS de gestão com auth, pagamentos Stripe e dashboard analytics"

DevFlow: "Quais são as próximas entregas em ordem de prioridade?"
Você: "1. Terminar auth  2. Pagamentos  3. Dashboard  4. Mobile"

DevFlow: "Alguma restrição?"
Você: "Preciso de pagamentos funcionando em 3 semanas"
```

**4. Geração do PRD:**
```markdown
# PRD: MeuSaaS

## Resumo Executivo
- Problema: ...
- Solução: ...
- Impacto no Negócio: ...

## Roadmap Faseado

### Fase 1: Autenticação — Must Have
- Escopo: Completar OAuth, 2FA, session management
- RICE Score: 12.0
- Critérios de Conclusão: Login/logout funcional, 2FA ativo, testes E2E passando
- Status: ⬚ Pendente

### Fase 2: Pagamentos (Stripe) — Must Have
- Escopo: Checkout, subscriptions, webhooks, invoices
- Depende de: Fase 1
- RICE Score: 10.0
- Status: ⬚ Pendente

### Fase 3: Dashboard Analytics — Should Have
...

### Fase 4: App Mobile — Could Have
...
```

**5. Aprovação seção por seção:**
```
DevFlow: "Resumo Executivo + Visão do Produto — aprovado?"
DevFlow: "Roadmap Faseado — escopo e ordem de cada fase estão corretos?"
DevFlow: "Fora do Escopo — falta algo?"
DevFlow: "Riscos e Métricas de Sucesso — aprovado?"
```

**6. Salva em** `.context/plans/<projeto>-prd.md`

### 5.2 Iniciar a primeira fase do PRD

Após o PRD aprovado:

```
DevFlow: "PRD salvo. Fase 1 (Autenticação) está pronta para o PREVC. Iniciar agora?"
Você: "Sim"
```

Ou manualmente:
```
/devflow Completar autenticação — OAuth, 2FA, session management
```

O DevFlow detecta que é MEDIUM (multi-componente) e roda: **P → R → E → V → C**.

### 5.3 P — Planning

**O que você vê:**

```
DevFlow: "Estou usando devflow:prevc-planning para planejar esta tarefa."

Fase: P (Planning)
Escala: MEDIUM
Tarefa: "Completar autenticação — OAuth, 2FA, session management"
```

**Passo 1 — Contexto:**
O DevFlow lê automaticamente o `.context/` para entender a stack, padrões e código existente.

**Passo 2 — Brainstorming socrático (9 etapas):**
```
DevFlow: "Vamos fazer um brainstorming. Quais são os principais desafios com OAuth + 2FA?"
Você: "Preciso suportar Google e GitHub OAuth, e TOTP para 2FA"

DevFlow: "O 2FA deve ser obrigatório ou opt-in?"
Você: "Opt-in por agora, obrigatório numa fase futura"

DevFlow: "Onde fica o estado da sessão? JWT, server-side ou híbrido?"
Você: "JWT com refresh token, Redis para blacklist"
...
```

**Passo 3 — Spec escrita:**
Brainstorming gera uma spec com requisitos, decisões técnicas e edge cases.

**Passo 4 — Plano de implementação:**
```
Plano: "Sistema de Autenticação Completo"

Tarefas (pequenas, 2-5 min cada):
  1. [ ] Adicionar config do Google OAuth provider
  2. [ ] Implementar handler de callback OAuth
  3. [ ] Adicionar GitHub OAuth provider
  4. [ ] Criar endpoint de geração de secret TOTP
  5. [ ] Implementar middleware de verificação TOTP
  6. [ ] Adicionar rotação de JWT refresh token
  7. [ ] Configurar blacklist de sessão com Redis
  8. [ ] Escrever testes de integração para fluxo OAuth
  9. [ ] Escrever testes E2E para enrollment de 2FA
  10. [ ] Atualizar documentação da API
```

**Passo 4.5 — Geração de stories.yaml** (se autonomia não é supervised):

Para modos `assisted` e `autonomous`, o Planning também gera um `stories.yaml`:

```yaml
feature: "Sistema de Autenticação Completo"
autonomy: autonomous
stories:
  - id: S1
    title: "Adicionar Google OAuth provider"
    agent: backend-specialist
    priority: 1
    status: pending
    blocked_by: []
  - id: S2
    title: "Adicionar GitHub OAuth provider"
    agent: backend-specialist
    priority: 2
    status: pending
    blocked_by: [S1]
  ...
```

**Passo 5.5 — Validação test-first (HARD-GATE):**
O DevFlow verifica que o plano tem steps de teste ANTES de steps de implementação para cada grupo de tasks. Se a ordenação não é test-first, o plano é rejeitado e corrigido.

**Gate para avançar:** Spec aprovada + plano escrito + ordenação test-first validada.

```
/devflow-next
→ Verificação do gate aprovada. Avançando para R (Review)...
```

### 5.4 R — Review

**O que acontece automaticamente:**

```
Fase: R (Review)
Agentes: architect, code-reviewer, security-auditor
```

**1. Architect review:**
- Avalia isolamento dos componentes (OAuth, 2FA, session)
- Verifica testabilidade (mocks vs real Redis?)
- Checa consistência com padrões existentes

**2. Code review do plano:**
- Verifica completude (todos os requisitos da spec têm tasks?)
- Verifica ordenação (dependencies corretas?)
- Verifica TDD compliance (testes antes de implementação?)

**3. Security pre-check:**
- Token storage é seguro? (HttpOnly cookies, não localStorage)
- TOTP secrets encriptados at rest?
- Rate limiting no endpoint de verificação?

**Resultado:**
```
Resumo da Revisão:
  ✓ Arquitetura: OK — boa separação de responsabilidades
  ⚠ AVISO: Considerar rate limiting em /auth/verify-2fa (risco de força bruta)
  ✓ Completude do plano: OK — todos os requisitos da spec cobertos
  ✓ Pré-check de segurança: OK com 1 AVISO

Prosseguir para Execution? (o AVISO pode ser tratado durante a implementação)
```

**Gate:** Todas as revisões passam, nenhum BLOCK finding.

```
/devflow-next
→ Avançando para E (Execution)...
```

### 5.5 E — Execution

**Aqui começa o código.** O DevFlow:
1. Ativa o **git-strategy gate** — cria branch `feature/auth-complete` (se em main)
2. Carrega o plano
3. Executa task por task com **TDD rigoroso**

**Para cada task, o ciclo é:**

```
Tarefa 1/10: Adicionar config do Google OAuth provider

  RED:   Escreve teste que falha
         → test_google_oauth_config_loads_from_env()
         → FALHOU ✗ (GoogleOAuthProvider não encontrado)

  GREEN: Escreve código mínimo para passar
         → Classe GoogleOAuthProvider + config via env
         → PASSOU ✓

  REFACTOR: Melhora sem mudar comportamento
         → Extrair classe base OAuthProvider
         → PASSOU ✓

  COMMIT: feat(auth): add Google OAuth provider config

─── Tarefa concluída. Avançando para tarefa 2/10...
```

**No modo autonomous**, a Execution é delegada ao loop autônomo (veja [seção 6](#6-loop-autônomo)). O DevFlow seleciona automaticamente a próxima story do `stories.yaml`, despacha o agente apropriado, e avança.

**Handoffs entre agentes durante Execution:**
```
Tarefas 1-3: backend-specialist (OAuth providers)
Tarefas 4-5: backend-specialist → security-auditor (2FA com TOTP)
Tarefas 6-7: backend-specialist (JWT + Redis)
Tarefas 8-9: test-writer (testes de integração + E2E)
Tarefa 10:   documentation-writer (documentação da API)
```

**Gate:** Todas as tasks completas, todos os testes passando, código commitado.

```
/devflow-status

Workflow: "Autenticação Completa" (MEDIUM)
  P Planning      ✓ Concluído
  R Review        ✓ Concluído
  E Execution     ● Em Progresso (7/10 tarefas)
  V Validation    ○ Pendente
  C Confirmation  ○ Pendente
```

```
/devflow-next
→ Avançando para V (Validation)...
```

### 5.6 V — Validation

**Verificação completa antes do merge:**

```
Fase: V (Validation)
Verificações: suíte de testes, conformidade com spec, segurança, performance, adequação de tipos de teste
```

**1. Suíte completa de testes:**
```
Rodando todos os testes...
  ✓ 47 testes unitários passaram
  ✓ 12 testes de integração passaram
  ✓ 3 testes E2E passaram
  ✗ 0 falhas
  Cobertura: 94%
```

**2. Adequação de tipos de teste (HARD-GATE):**
```
Verificando tipos de teste por área de implementação...
  ✓ Endpoints de auth  → unit + integration + E2E  ✓
  ✓ Lógica TOTP       → unit + integration          ✓
  ✓ Gestão de JWT     → unit                         ✓
  ✓ Integração Redis  → integration                  ✓
  Todos os tipos de teste obrigatórios presentes.
```

Se E2E for obrigatório para a área (auth, pagamentos) e não existir, o workflow **retorna à fase E** até que os testes sejam escritos.

**3. Verificação de ordenação TDD:**
```
Verificando histórico de commits para ordenação TDD...
  ✓ Commits de teste precedem commits de implementação
  Ordenação TDD: ✓ Verificada
```

**4. Conformidade com a spec:**
```
Verificando requisitos da spec...
  ✓ Google OAuth login/callback      → implementado + testado
  ✓ GitHub OAuth login/callback      → implementado + testado
  ✓ Geração TOTP                     → implementado + testado
  ✓ Verificação TOTP                 → implementado + testado
  ✓ Rotação de JWT refresh token     → implementado + testado
  ✓ Blacklist de sessão Redis        → implementado + testado
  ✓ Rate limiting em verify-2fa      → implementado (resolve AVISO da fase R)
  Todos os 7 requisitos satisfeitos.
```

**5. Validação de segurança (OWASP Top 10):**
```
Resultados da auditoria de segurança:
  ✓ A01 Controle de Acesso Quebrado  — roles enforçados, sem escalação de privilégios
  ✓ A02 Falhas Criptográficas        — secrets TOTP encriptados, JWT assinado com RS256
  ✓ A03 Injeção                      — queries parametrizadas, sem concatenação de strings
  ✓ A07 Falhas de Autenticação       — rate limiting, bloqueio de conta após 5 tentativas
  Nenhuma vulnerabilidade encontrada.
```

**6. Verificação de performance:**
```
  ✓ Nenhuma query N+1 detectada
  ✓ Chamadas Redis usam connection pooling
  ✓ Verificação JWT é O(1)
```

**Gate:** Tudo passa, incluindo adequação de tipos de teste e ordenação TDD.

```
/devflow-next
→ Avançando para C (Confirmation)...
```

### 5.7 C — Confirmation

**Finalização — pipeline obrigatória sequencial** (desde v0.10.2/v0.10.5). A ordem é HARD-GATE: nenhum step pode ser pulado, merge nunca antes de README+bump.

```
Fase: C (Confirmation)

Pipeline obrigatória:
  Step 1: README.md update         ← obrigatório (v0.10.5)
  Step 2: Version bump              ← obrigatório (v0.9.1)
  Step 3: Commit (docs + bump)
  Step 4: Atualização do PRD (se existe)
  Step 5: Docs técnicos (.context/)
  Step 6: Push
  Step 7: Create PR (se gh configurado)
  Step 8: Merge (após approval)
  Step 9: Cleanup branch local
```

**1. README.md update (Step 1 — obrigatório):**
```
→ Adicionando entrada no Histórico de Versões
→ Atualizando contadores (skills, agentes, testes) se mudaram
→ Atualizando seção Destaques se há feature nova
```

**2. Version bump (Step 2 — obrigatório):**
```
→ Detectando tipo de mudança (feat/fix/chore)
→ bump: 0.10.5 → 0.10.6 (patch) ou 0.11.0 (minor)
→ scripts/bump-version.sh atualiza: plugin.json, .claude-plugin/marketplace.json, cursor-plugin
→ Verificando consistência com scripts/pre-commit-version-check.sh
```

**3. Limpeza da branch:**
```
→ Squash commits? Merge commits? (baseado na convenção do projeto)
→ Rebasing feature/auth-complete em main...
→ Todos os testes continuam passando após rebase.
```

**2. Atualização de documentação:**
```
→ Docs da API atualizados: 3 novos endpoints documentados
→ README atualizado: seção de auth adicionada
→ .context/docs/project-overview.md atualizado
```

**3. Sync de contexto:**
```
→ .context/ atualizado com novos componentes
→ codebase-map.json regenerado
```

**6. Criação de PR (se gh/glab configurado):**
```
→ PR #42 criado: "feat(auth): complete OAuth + 2FA system"
→ Descrição inclui: checklist de conformidade, cobertura de testes, resultados da auditoria de segurança
```

**7. Atualização do PRD:**
```
→ Fase 1 (Autenticação) marcada como ✓ Concluída
→ Fase 2 (Pagamentos) é a próxima fase pendente
```

### 5.8 Fechar a fase no PRD e seguir para a próxima

```
/devflow prd --status

PRD: MeuSaaS
  Fase 1: Autenticação              ✓ Concluída
  Fase 2: Pagamentos (Stripe)       ⬚ Pendente ← próxima
  Fase 3: Dashboard Analytics        ⬚ Pendente
  Fase 4: App Mobile                 ⬚ Pendente
```

Para iniciar a próxima fase:
```
/devflow Implementar pagamentos com Stripe — checkout, subscriptions, webhooks
```

O ciclo PREVC recomeça para a Fase 2.

---

## 6. Loop autônomo

O loop autônomo é o motor que executa stories automaticamente nos modos `assisted` e `autonomous`. Cada story roda com **contexto fresco** — sem acúmulo de lixo de contexto entre stories.

### 6.1 stories.yaml

O arquivo `stories.yaml` (em `.context/workflow/`) define as stories a executar:

```yaml
feature: "Sistema de Autenticação Completo"
autonomy: autonomous

escalation:
  max_retries_per_story: 2
  max_consecutive_failures: 2
  security_immediate: true

stats:
  total: 6
  completed: 0
  failed: 0
  escalated: 0
  consecutive_failures: 0

stories:
  - id: S1
    title: "Adicionar Google OAuth provider"
    description: "Implementar Google OAuth com fluxo PKCE"
    agent: backend-specialist
    priority: 1
    status: pending
    attempts: 0
    blocked_by: []

  - id: S2
    title: "Adicionar GitHub OAuth provider"
    agent: backend-specialist
    priority: 2
    status: pending
    attempts: 0
    blocked_by: [S1]

  - id: S3
    title: "Implementar 2FA com TOTP"
    agent: backend-specialist
    priority: 3
    status: pending
    attempts: 0
    blocked_by: [S1]
```

**Ciclo de vida dos status:**
- `pending` → `in_progress` → `completed` (sucesso)
- `pending` → `in_progress` → `failed` → retry ou `escalated`

**Escalação automática:**
- Story falha mais que `max_retries_per_story` → marcada como `escalated`
- 2+ falhas consecutivas → downgrade automático para supervised
- Problema de segurança → escalação imediata ao humano

### 6.2 Fluxo de execução

```
[Lê stories.yaml] → [Seleciona próxima story] → [Spawna Claude com contexto fresco]
        ↑                                                    │
        └──────── [Atualiza stories.yaml] ←──────────────────┘
```

Para cada iteração:
1. **Lê** o `stories.yaml` atualizado (detecta mudanças entre iterações)
2. **Seleciona** a próxima story elegível (prioridade: `in_progress` > `failed retryable` > `pending`)
3. **Verifica bloqueios** — stories com `blocked_by` não-resolvidos são puladas
4. **Despacha** o agente anotado na story (ex: `backend-specialist`)
5. **Executa** com TDD obrigatório (RED → GREEN → REFACTOR)
6. **Atualiza** o status no `stories.yaml`
7. **Repete** até todas as stories estarem completed/escalated

### 6.3 PRD para stories (--from-prd)

Para projetos que já têm um PRD, o `--from-prd` converte automaticamente:

```bash
/devflow autonomy:autonomous --from-prd
```

O que acontece:
1. Lê o PRD em `.context/plans/*-prd.md`
2. Para cada item no scope da fase pendente:
   - Cria uma story com título e descrição
   - Infere o agente a partir do conteúdo (backend, frontend, database, etc.)
   - Define prioridade baseada na ordem
   - Configura `blocked_by` a partir das dependências do PRD
3. Enriquece com contexto existente (`.context/docs/project-overview.md`, `codebase-map.json`)
4. Gera o `stories.yaml` e inicia o loop

### 6.4 Upgrade de autonomia mid-workflow

Você pode mudar o nível de autonomia a qualquer momento durante um workflow:

**Upgrade (supervised → autonomous):**
```bash
/devflow autonomy:autonomous
```

3 cenários possíveis:
- **stories.yaml já existe**: mantém o arquivo, respeita status existentes
- **stories.yaml não existe + plano PREVC ativo**: gera stories a partir do plano
- **stories.yaml não existe + PRD existe**: gera stories a partir do PRD (Path A)

**Downgrade (autonomous → supervised):**
```bash
/devflow autonomy:supervised
```

O progresso é **100% preservado** — stories completadas mantêm status, o workflow continua de onde parou.

**Downgrade automático:** acontece quando `max_consecutive_failures` é atingido (padrão: 2 falhas seguidas).

### 6.5 devflow-runner.mjs (safety net)

Para execução autônoma de longa duração, o DevFlow inclui um runner externo em Node.js que supervisiona o processo:

```bash
node scripts/devflow-runner.mjs \
  --stories .context/workflow/stories.yaml \
  --max-iterations 20 \
  --timeout 300000
```

O runner:
- Spawna uma instância Claude por story (contexto fresco)
- Relê o `stories.yaml` entre iterações (detecta mudanças manuais)
- Detecta stall (mesma story selecionada 3+ vezes)
- Imprime relatório final com status de todas as stories
- Suporta `--dry-run` para preview sem executar

**Flags disponíveis:**

| Flag | Default | Descrição |
|------|---------|-----------|
| `--stories <path>` | obrigatório | Caminho para o stories.yaml |
| `--max-iterations` | 20 | Número máximo de iterações |
| `--timeout` | 300000 | Timeout por story (ms) |
| `--dry-run` | false | Mostra stories sem executar |

---

## 7. Exemplos por escala

### 7.1 QUICK — Bug fix

```
/devflow fix o botão de login não funciona no Safari
```

Fases: **E → V** (sem planejamento, sem review)

```
E (Execution):
  → bug-fixer: reproduz o bug
  → systematic-debugging: 4 fases (observar → hipótese → testar → root cause)
  → Root cause: CSS `-webkit-appearance` missing
  → Escreve teste de regressão (RED)
  → Aplica fix (GREEN)
  → Commit: fix(auth): add webkit prefix for Safari login button

V (Validation):
  → Testes passam (incluindo novo teste de regressão)
  → Bug fix verificado

Concluído.
```

### 7.2 SMALL — Feature simples

```
/devflow add endpoint GET /api/health
```

Fases: **P → E → V**

```
P (Planning):
  → Brainstorming rápido (endpoint simples, poucos edge cases)
  → Plano: 1) teste, 2) handler, 3) route, 4) docs

E (Execution):
  → TDD: RED (test_health_returns_200) → GREEN (handler) → REFACTOR
  → Commit: feat(api): add health check endpoint

V (Validation):
  → Testes passam
  → Endpoint responde 200 com status

Concluído.
```

### 7.3 MEDIUM — Feature multi-componente

```
/devflow scale:MEDIUM add sistema de notificações por email
```

Fases: **P → R → E → V → C**

```
P: Brainstorming (qual provider? template engine? queue?)
   → Spec: SendGrid + Handlebars + Bull queue
   → Plano: 12 tasks

R: architect valida design
   → code-reviewer checa plano
   → security-auditor: API keys em env vars? Rate limit?

E: backend-specialist (queue + service)
   → backend-specialist (SendGrid integration)
   → frontend-specialist (notification preferences UI)
   → test-writer (integration tests)
   → 12 tasks com TDD

V: Suite completa, spec compliance, security check, test-type adequacy

C: Branch merged, docs atualizados, PR criado
```

### 7.4 LARGE — Migração sistêmica

```
/devflow scale:LARGE migrar de REST para GraphQL
```

Fases: **P → R → E → V → C + checkpoints**

```
P: Brainstorming extenso (schema design, resolvers, backward compat?)
   → Spec detalhada com migration strategy
   → Plano: 30+ tasks agrupadas em milestones

R: architect + code-reviewer + security-auditor
   → Review mais rigoroso (breaking changes, performance implications)

E: Checkpoints a cada milestone:
   ████░░░░░░ Milestone 1/4: Schema + base resolvers     ← checkpoint
   ████████░░ Milestone 2/4: Migrate user endpoints       ← checkpoint
   ████████░░ Milestone 3/4: Migrate product endpoints    ← checkpoint
   ██████████ Milestone 4/4: Remove REST endpoints        ← checkpoint

   Cada checkpoint:
   → Salva progresso em last.json
   → Permite retomar se sessão cair
   → Pode pausar e voltar depois

V: Validação completa (incluindo testes de performance e backward compat)

C: Branch merged, docs migrados, PR com migration guide
```

---

## 8. Capabilities on-demand

### 8.1 Sem workflow ativo

Você pode usar qualquer capability do DevFlow a qualquer momento, sem iniciar um workflow PREVC. Basta pedir em linguagem natural:

| O que você quer | O que dizer | Skill ativada |
|----------------|-------------|---------------|
| Auditar segurança | "Faça uma auditoria de segurança no auth" | security-audit + security-auditor |
| Gerar testes | "Gere testes para o módulo de usuários" | test-generation + TDD |
| Revisar PR | "Revise o PR #42" | pr-review + code-reviewer |
| Investigar bug | "Investigue o timeout no login" | bug-investigation + systematic-debugging |
| Decompor feature | "Quebre a feature de cache em tarefas" | feature-breakdown |
| Escolher git strategy | "Qual estratégia de branch para essa feature?" | git-strategy |
| Design de API | "Desenhe a API de billing" | api-design + architect |
| Refatorar | "Refatore o módulo de pagamentos" | refactoring + refactoring-specialist |
| Gerar PRD | "Gere um roadmap de produto" | prd-generation + product-manager |
| Escrever commit | "Escreva a mensagem de commit" | commit-message |
| Atualizar docs | "Atualize a documentação do auth" | documentation + documentation-writer |
| Brainstorming | "Vamos discutir a feature de busca" | brainstorming (9 etapas) |
| Implementar com TDD | "Implemente com TDD" | test-driven-development |
| Debug | "Investigue o memory leak no worker" | systematic-debugging (4 fases) |

### 8.2 Durante um workflow

Durante a Execution (fase E), você pode pedir capabilities extras sem sair do workflow:

```
# Dentro de um workflow MEDIUM, fase E
"Faça uma auditoria rápida de segurança no código que acabei de escrever"
→ security-auditor roda, reporta findings
→ Workflow continua na fase E

"Refatore esse módulo antes de continuar"
→ refactoring-specialist executa com testes antes/depois
→ Workflow continua na fase E
```

---

## 9. Comandos de navegação

| Comando | O que faz | Quando usar |
|---------|-----------|-------------|
| `/devflow-status` | Mostra fase, progresso, modo e PRD | A qualquer momento |
| `/devflow-next` | Valida gates e avança de fase | Quando terminar uma fase |
| `/devflow-dispatch` | Recomenda agente(s) para o contexto | Para ver quem deveria estar trabalhando |
| `/devflow-dispatch <role>` | Despacha um agente específico | Para forçar um especialista |
| `/devflow-sync` | Atualiza `.context/` com estado atual | Após mudanças grandes |
| `/devflow-sync workflow` | Valida e sincroniza `.context/workflow/` | Validar stories.yaml, detectar referências órfãs |
| `/devflow prd --status` | Mostra progresso das fases do PRD | Para acompanhar roadmap |
| `/devflow language` | Configura idioma (en-US, pt-BR, es-ES) | Para mudar idioma das interações |
| `/devflow update` | Atualiza marketplace + plugins + dotcontext + mostra próximos passos | Manutenção semanal |
| `/devflow-recall <query>` | Busca semântica na memória (MemPalace) | Recuperar decisões passadas |
| `/devflow help` | Referência completa de comandos | Quando esquecer algo |

**Exemplos de navegação durante um workflow:**

```bash
# "Em que fase estou?"
/devflow-status
→ E Execution ● Em Progresso (7/12 tarefas)

# "Posso avançar?"
/devflow-next
→ ✗ Gate não atendido: 5 tarefas restantes, 2 testes falhando

# (corrige os testes, completa as tarefas)

/devflow-next
→ ✓ Gate aprovado. Avançando para V (Validation)...

# "Quem deveria estar trabalhando agora?"
/devflow-dispatch
→ Recomendado: test-writer → security-auditor (fase V)

# "Quero o security-auditor especificamente"
/devflow-dispatch security-auditor
→ Carregando playbook: security-auditor.md
→ Executando avaliação OWASP Top 10...
```

---

## 10. Agentes em detalhe

### 10.1 Quando cada agente é usado

```
P (Planning):
  architect          → avalia abordagens, design
  product-manager    → PRD, roadmap (se /devflow prd)

R (Review):
  architect          → revisão de arquitetura
  code-reviewer      → revisão do plano
  security-auditor   → pré-check de segurança

E (Execution):
  feature-developer  → implementa features (TDD)
  bug-fixer          → root cause + fix (TDD)
  backend-specialist → APIs, serviços, banco
  frontend-specialist→ UI, componentes, estado
  database-specialist→ schema, migrations, queries
  mobile-specialist  → iOS/Android
  refactoring-spec.  → reestrutura sem mudar comportamento
  devops-specialist  → CI/CD, infra
  test-writer        → testes adicionais

V (Validation):
  code-reviewer      → revisão final do código
  test-writer        → review de cobertura + test-type adequacy
  security-auditor   → OWASP audit completo
  performance-opt.   → profiling, bottlenecks

C (Confirmation):
  documentation-wr.  → atualiza docs
  devops-specialist  → deploy, CI/CD
  product-manager    → atualiza PRD
```

### 10.2 Sequências comuns

| Tipo de tarefa | Sequência de agentes |
|----------------|---------------------|
| Feature full-stack | architect → backend → frontend → test-writer |
| API endpoint | architect → backend → test-writer |
| UI feature | architect → frontend → test-writer |
| Bug fix | bug-fixer → test-writer |
| Refactoring | refactoring-specialist → test-writer → code-reviewer |
| Database change | database-specialist → backend → test-writer |
| Security fix | security-auditor → backend/frontend → test-writer |
| Performance | performance-optimizer → backend/frontend → test-writer |

### 10.3 Despachar manualmente

```bash
# Ver recomendação
/devflow-dispatch
→ Recomendado: backend-specialist → test-writer

# Despachar específico
/devflow-dispatch database-specialist
→ Carregando: database-specialist.md
→ Missão: Design de schema, otimização de queries, migrations seguras
→ Iniciando workflow...

# Disponíveis:
/devflow-dispatch architect
/devflow-dispatch product-manager
/devflow-dispatch feature-developer
/devflow-dispatch bug-fixer
/devflow-dispatch code-reviewer
/devflow-dispatch test-writer
/devflow-dispatch documentation-writer
/devflow-dispatch refactoring-specialist
/devflow-dispatch performance-optimizer
/devflow-dispatch security-auditor
/devflow-dispatch backend-specialist
/devflow-dispatch frontend-specialist
/devflow-dispatch database-specialist
/devflow-dispatch devops-specialist
/devflow-dispatch mobile-specialist
/devflow-dispatch memory-specialist
```

---

## 11. Manutenção do projeto

### 11.1 Atualizar contexto

Após mudanças significativas (novo módulo, mudança de stack, refactoring grande):

```bash
/devflow-sync                   # Tudo (docs + agents + skills)
/devflow-sync docs              # Apenas docs
/devflow-sync agents            # Apenas agents
/devflow-sync skills            # Apenas skills
/devflow-sync workflow          # Validar stories.yaml e .context/workflow/
```

O sync relê o projeto e atualiza os playbooks com paths, classes e padrões atuais.

**`/devflow-sync workflow`** faz:
- Cria `.context/workflow/` se não existir
- Valida estrutura do `stories.yaml` (campos obrigatórios, status válidos)
- Detecta referências órfãs em `blocked_by` (IDs que não existem)
- Sugere `--from-prd` se existe PRD mas não existe `stories.yaml`

### 11.2 Atualizar plugins

A forma mais rápida — dentro do Claude Code:
```
/devflow update
```

Isso executa em sequência:
1. Atualiza o marketplace registry (`NEXUZ-SYS`)
2. Atualiza o plugin DevFlow (auto-detect de scope user/project)
3. Atualiza o plugin superpowers (auto-detect de scope)
4. Atualiza o dotcontext CLI (se instalado globalmente)
5. **Detecta features não configuradas e mostra próximos passos** (desde v0.10.3):
   - MemPalace não instalado? → mostra comando de ativação
   - Idioma não definido? → sugere `/devflow language`
   - Git strategy não configurada? → sugere `/devflow config`
   - `.context/` desatualizado? → sugere `/devflow-sync`
6. Mostra resumo e pede para reiniciar o Claude Code

<details>
<summary>Atualização manual (se preferir)</summary>

> **Sempre atualize o marketplace antes do plugin.** O Claude Code resolve versões pelo cache local.

```bash
claude plugin marketplace update NEXUZ-SYS
claude plugin update devflow@NEXUZ-SYS
claude plugin update superpowers@claude-plugins-official
npm update -g @dotcontext/cli
```

Se a versão não atualizar:
```bash
rm -rf ~/.claude/plugins/cache/NEXUZ-SYS/devflow/
claude plugin marketplace update NEXUZ-SYS
claude plugin install devflow@NEXUZ-SYS --scope user
```

</details>

**Após atualizar, sincronize o contexto:**
```
/devflow-sync
```

---

## 12. Compatibilidade com outras ferramentas

O DevFlow funciona como plugin em múltiplas plataformas:

| Ferramenta | Suporte a subagents | MCP | Hooks |
|------------|:---:|:---:|:---:|
| **Claude Code** | Completo | Completo | Completo |
| **Cursor** | Apenas sequencial | Completo | Completo |
| **Codex** | Completo | -- | -- |
| **Gemini CLI** | Apenas sequencial | Completo | -- |
| **OpenCode** | Apenas sequencial | Completo | -- |

Quando subagents não estão disponíveis, o DevFlow usa `superpowers:executing-plans` (execução sequencial) em vez de `superpowers:subagent-driven-development`.

---

## 13. Troubleshooting

### Modo aparece como "Minimal" quando esperava "Full"

```bash
# 1. Verificar .mcp.json
cat .mcp.json   # Deve conter entry para dotcontext

# 2. Reiniciar sessão (hooks rodam só no início)
exit
claude

# 3. Verificar dotcontext
dotcontext --version
```

### superpowers aparece como `false`

```bash
cat ~/.claude/plugins/installed_plugins.json | grep superpowers
claude plugin install superpowers@claude-plugins-official --scope user
```

### dotcontext CLI não encontrado

```bash
node --version          # Precisa 20+
npm install -g @dotcontext/cli
dotcontext --version
```

### Skills não aparecem

```bash
grep devflow ~/.claude/plugins/installed_plugins.json
claude plugin install devflow@NEXUZ-SYS --scope user
```

### Edit/Write bloqueado em branch protegida

Isso é intencional — o git-strategy hook protege `main`/`develop`.

```bash
# Opção 1: aceitar a sugestão de criar branch (recomendado)
# Opção 2: criar manualmente
git checkout -b feature/minha-feature
# Opção 3: reconfigurar para trunk-based
/devflow init   # → escolher "Trunk-based"
```

### Erro com `npx dotcontext mcp:install`

```bash
# npm 11+ interpreta ":" como separador. Use global:
dotcontext mcp:install claude --local
```

### Contexto perdido após compactação

```bash
# Verificar checkpoint
cat .context/workflow/.checkpoint/last.json
cat .context/workflow/.checkpoint/handoff.md

# Se existem mas não restaurou, reinicie a sessão
exit
claude
```

### `context.fill()` demora muito

Normal para projetos grandes — análise semântica pode levar 1-3 min. Projetos com 1000+ arquivos podem demorar mais.

### Loop autônomo não avança (stall)

```bash
# Verificar stories.yaml
cat .context/workflow/stories.yaml

# Causas comuns:
# 1. Dependência circular em blocked_by
# 2. Todas as stories elegíveis estão escalated
# 3. max_consecutive_failures atingido → downgrade para supervised
```

### Story fica em "in_progress" indefinidamente

Isso pode acontecer se a sessão Claude morreu durante a execução. O loop autônomo trata `in_progress` como prioridade máxima — na próxima iteração, a story será retomada automaticamente.

### `/devflow update` caiu no fallback "descrição de tarefa"

Acontece quando o plugin instalado é **anterior à v0.10.1** (quando o routing explícito foi adicionado). Sintoma: `/devflow update` invoca `context-sync` em vez de rodar os comandos de plugin update.

```bash
# Atualize manualmente uma vez para ter a versão com routing correto:
claude plugin marketplace update NEXUZ-SYS
claude plugin update devflow@NEXUZ-SYS --scope user
# Ou project se instalado por projeto:
claude plugin update devflow@NEXUZ-SYS --scope project

# Depois /devflow update funciona nativamente.
```

### Múltiplas versões antigas em cache consumindo espaço

```bash
ls ~/.claude/plugins/cache/NEXUZ-SYS/devflow/
# Ex: 0.4.0/ 0.7.0/ 0.8.5/ 0.10.0/ 0.10.3/ ...

# Manualmente: remova versões que nenhum projeto referencia mais
# (confira em ~/.claude/plugins/installed_plugins.json antes)
rm -rf ~/.claude/plugins/cache/NEXUZ-SYS/devflow/0.4.0
```

### MemPalace instalado mas `/devflow-recall` não funciona

```bash
# 1. Verifique o .mcp.json do projeto
cat .mcp.json | grep mempalace

# 2. Se ausente, reinstale por projeto:
cd meu-projeto
mempalace mcp:install claude --local

# 3. Reinicie o Claude Code (MCPs carregam no SessionStart)
exit
claude

# 4. Verifique
/devflow-status   # Deve mostrar "MemPalace: true"
```

### ADRs não aparecem em `.context/adrs/`

ADRs só são instanciados se você responder "sim" na entrevista do `/devflow init` ou `/devflow prd`. Para instanciar depois:

```bash
/devflow-sync adrs
# Re-executa a entrevista de guardrails sem refazer o scaffold completo
```

---

## 14. Referência rápida

### Comandos

```bash
/devflow help                          # Referência completa
/devflow init                          # Inicializar projeto
/devflow <descrição>                   # Iniciar workflow (auto-escala)
/devflow scale:QUICK <desc>            # Bug fix (E → V)
/devflow scale:SMALL <desc>            # Feature simples (P → E → V)
/devflow scale:MEDIUM <desc>           # Multi-componente (P → R → E → V → C)
/devflow scale:LARGE <desc>            # Migração (P → R → E → V → C + checkpoints)
/devflow language                      # Configurar idioma
/devflow language pt-BR                # Definir idioma diretamente
/devflow update                        # Atualizar tudo (marketplace + plugins + dotcontext)
/devflow prd                           # Gerar roadmap de produto
/devflow prd --status                  # Ver progresso do PRD
/devflow autonomy:assisted <desc>      # Workflow com execução automática
/devflow autonomy:autonomous <desc>    # Loop autônomo completo
/devflow autonomy:autonomous --from-prd  # Autônomo a partir do PRD existente
/devflow-status                        # Fase atual e progresso
/devflow-next                          # Avançar de fase
/devflow-dispatch                      # Recomendar agente
/devflow-dispatch <role>               # Despachar agente
/devflow-sync                          # Atualizar .context/
/devflow-sync docs|agents|skills       # Atualizar parcial
/devflow-sync workflow                 # Validar workflow e stories.yaml
/devflow-recall <query>                # Busca semântica na memória (MemPalace)
/napkin "<aprendizado>"                # Adicionar ao runbook de aprendizado
```

### Instalação (copie e cole)

```bash
# Uma vez por máquina
claude plugin install superpowers@claude-plugins-official --scope user
claude plugin marketplace add NEXUZ-SYS/devflow
claude plugin install devflow@NEXUZ-SYS --scope user
npm install -g @dotcontext/cli          # opcional, habilita Full Mode
pipx install mempalace                  # opcional, habilita memória semântica (Python nativo)

# Em cada projeto
cd meu-projeto && claude
/devflow init
/devflow-status
```

### Primeiro workflow

```bash
/devflow prd                           # Roadmap (se projeto grande)
/devflow add minha feature             # Workflow direto
/devflow-status                        # Acompanhar
/devflow-next                          # Avançar
```

### Primeiro loop autônomo

```bash
/devflow prd                                    # Gerar roadmap
/devflow autonomy:autonomous --from-prd         # Converter PRD em stories e executar
/devflow-status                                 # Acompanhar progresso
```

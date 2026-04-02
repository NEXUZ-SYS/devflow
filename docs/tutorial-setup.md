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
  - [2.5 Verificar instalação](#25-verificar-instalação)
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
  - [4.4 Agentes especialistas](#44-agentes-especialistas)
  - [4.5 Git strategy (branch protection)](#45-git-strategy-branch-protection)
  - [4.6 Persistência entre sessões](#46-persistência-entre-sessões)
- [5. Fluxo completo: do PRD ao merge](#5-fluxo-completo-do-prd-ao-merge)
  - [5.1 Gerar o PRD (roadmap de produto)](#51-gerar-o-prd-roadmap-de-produto)
  - [5.2 Iniciar a primeira fase do PRD](#52-iniciar-a-primeira-fase-do-prd)
  - [5.3 P — Planning](#53-p--planning)
  - [5.4 R — Review](#54-r--review)
  - [5.5 E — Execution](#55-e--execution)
  - [5.6 V — Validation](#56-v--validation)
  - [5.7 C — Confirmation](#57-c--confirmation)
  - [5.8 Fechar a fase no PRD e seguir para a próxima](#58-fechar-a-fase-no-prd-e-seguir-para-a-próxima)
- [6. Exemplos por escala](#6-exemplos-por-escala)
  - [6.1 QUICK — Bug fix](#61-quick--bug-fix)
  - [6.2 SMALL — Feature simples](#62-small--feature-simples)
  - [6.3 MEDIUM — Feature multi-componente](#63-medium--feature-multi-componente)
  - [6.4 LARGE — Migração sistêmica](#64-large--migração-sistêmica)
- [7. Capabilities on-demand](#7-capabilities-on-demand)
  - [7.1 Sem workflow ativo](#71-sem-workflow-ativo)
  - [7.2 Durante um workflow](#72-durante-um-workflow)
- [8. Comandos de navegação](#8-comandos-de-navegação)
- [9. Agentes em detalhe](#9-agentes-em-detalhe)
  - [9.1 Quando cada agente é usado](#91-quando-cada-agente-é-usado)
  - [9.2 Sequências comuns](#92-sequências-comuns)
  - [9.3 Despachar manualmente](#93-despachar-manualmente)
- [10. Manutenção do projeto](#10-manutenção-do-projeto)
  - [10.1 Atualizar contexto](#101-atualizar-contexto)
  - [10.2 Atualizar plugins](#102-atualizar-plugins)
- [11. Compatibilidade com outras ferramentas](#11-compatibilidade-com-outras-ferramentas)
- [12. Troubleshooting](#12-troubleshooting)
- [13. Referência rápida](#13-referência-rápida)

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

> ⚠️ **Nunca use `npx` para subcomandos do dotcontext com `:` (ex: `mcp:install`).** O npm 11+ interpreta o `:` como separador de script. Sempre use o binário global.

### 2.5 Verificar instalação

```bash
cat ~/.claude/plugins/installed_plugins.json | grep -E "devflow|superpowers"
```

Resultado esperado:
```
✅ Claude Code          — runtime
✅ superpowers plugin   — disciplina (TDD, brainstorming, code review)
✅ devflow plugin       — workflow PREVC, 15 agentes, 25+ skills
✅ dotcontext CLI       — análise semântica, MCP (opcional)
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
1. **Perguntar o idioma** (se ainda não configurado) — en-US, pt-BR ou es-ES
2. Escanear o projeto (stack, estrutura, padrões)
3. Instalar o MCP server do dotcontext (se disponível)
4. Scaffoldar `.context/` com agentes, skills e docs personalizados
5. Perguntar sua estratégia git (branch-flow, worktree ou trunk-based)
6. Detectar o modo (Full/Lite/Minimal)

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
  DevFlow — Select your language
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

No active workflow. Start one with:
  /devflow <description>
  /devflow prd              (generate product roadmap)
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
    └── workflow/.checkpoint/
        ├── last.json                      ← snapshot para persistência
        └── handoff.md                     ← diário de progresso
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

### 4.4 Agentes especialistas

O DevFlow tem **15 agentes**, cada um com um papel definido:

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

Os agentes são despachados **automaticamente** durante o workflow ou **manualmente** via `/devflow-dispatch`.

### 4.5 Git strategy (branch protection)

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

### 4.6 Persistência entre sessões

O DevFlow mantém estado automaticamente:

| Momento | O que acontece | Arquivo |
|---------|---------------|---------|
| **Antes da compactação** | Hook PreCompact salva snapshot (git state, handoff, plano ativo) | `.context/workflow/.checkpoint/last.json` |
| **Após a compactação** | Hook PostCompact injeta snapshot no contexto do modelo | (reinjetado na memória) |
| **Durante o trabalho** | Handoff notes atualizado a cada avanço | `.context/workflow/.checkpoint/handoff.md` |

Isso significa que conversas longas não perdem contexto — quando o Claude compacta, o DevFlow restaura de onde parou.

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
DevFlow: "Does this analysis of what exists match your understanding?"
Você: "Sim, mas o módulo de auth ainda está incompleto"

DevFlow: "What do you consider already complete vs still in progress?"
Você: "User CRUD completo, auth 60%, API de pagamentos nem começou"

DevFlow: "What's the end goal — what does the finished product look like?"
Você: "Um SaaS de gestão com auth, pagamentos Stripe e dashboard analytics"

DevFlow: "What are the next deliverables in priority order?"
Você: "1. Terminar auth  2. Pagamentos  3. Dashboard  4. Mobile"

DevFlow: "Any constraints?"
Você: "Preciso de pagamentos funcionando em 3 semanas"
```

**4. Geração do PRD:**
```markdown
# PRD: MeuSaaS

## Executive Summary
- Problem: ...
- Solution: ...
- Business Impact: ...

## Phased Roadmap

### Phase 1: Authentication — Must Have
- Scope: Completar OAuth, 2FA, session management
- RICE Score: 12.0
- Done Criteria: Login/logout funcional, 2FA ativo, testes E2E passando
- Status: ⬚ Pending

### Phase 2: Payments (Stripe) — Must Have
- Scope: Checkout, subscriptions, webhooks, invoices
- Depends on: Phase 1
- RICE Score: 10.0
- Status: ⬚ Pending

### Phase 3: Dashboard Analytics — Should Have
...

### Phase 4: Mobile App — Could Have
...
```

**5. Aprovação seção por seção:**
```
DevFlow: "Executive Summary + Product Vision — approve?"
DevFlow: "Phased Roadmap — approve scope and order of each phase?"
DevFlow: "Out of Scope — anything missing?"
DevFlow: "Risks & Success Metrics — approve?"
```

**6. Salva em** `.context/plans/<projeto>-prd.md`

### 5.2 Iniciar a primeira fase do PRD

Após o PRD aprovado:

```
DevFlow: "PRD saved. Phase 1 (Authentication) is ready for PREVC. Start now?"
Você: "Yes"
```

Ou manualmente:
```
/devflow Completar autenticação — OAuth, 2FA, session management
```

O DevFlow detecta que é MEDIUM (multi-componente) e roda: **P → R → E → V → C**.

### 5.3 P — Planning

**O que você vê:**

```
DevFlow: "I'm using devflow:prevc-planning to plan this task."

Phase: P (Planning)
Scale: MEDIUM
Task: "Completar autenticação — OAuth, 2FA, session management"
```

**Passo 1 — Contexto:**
O DevFlow lê automaticamente o `.context/` para entender a stack, padrões e código existente.

**Passo 2 — Brainstorming socrático (9 etapas):**
```
DevFlow: "Let's brainstorm. What are the key challenges with OAuth + 2FA?"
Você: "Preciso suportar Google e GitHub OAuth, e TOTP para 2FA"

DevFlow: "Should 2FA be mandatory or opt-in?"
Você: "Opt-in por agora, mandatory numa fase futura"

DevFlow: "Where does session state live? JWT, server-side, or hybrid?"
Você: "JWT com refresh token, Redis para blacklist"
...
```

**Passo 3 — Spec escrita:**
Brainstorming gera uma spec com requisitos, decisões técnicas e edge cases.

**Passo 4 — Plano de implementação:**
```
Plan: "Complete Authentication System"

Tasks (bite-sized, 2-5 min each):
  1. [ ] Add Google OAuth provider config
  2. [ ] Implement OAuth callback handler
  3. [ ] Add GitHub OAuth provider
  4. [ ] Create TOTP secret generation endpoint
  5. [ ] Implement TOTP verification middleware
  6. [ ] Add JWT refresh token rotation
  7. [ ] Set up Redis session blacklist
  8. [ ] Write integration tests for OAuth flow
  9. [ ] Write E2E tests for 2FA enrollment
  10. [ ] Update API documentation
```

**Gate para avançar:** Spec aprovada + plano escrito.

```
/devflow-next
→ Gate check passed. Advancing to R (Review)...
```

### 5.4 R — Review

**O que acontece automaticamente:**

```
Phase: R (Review)
Agents: architect, code-reviewer, security-auditor
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
Review Summary:
  ✓ Architecture: PASS — clean separation of concerns
  ⚠ WARN: Consider rate limiting on /auth/verify-2fa (brute force risk)
  ✓ Plan completeness: PASS — all spec requirements covered
  ✓ Security pre-check: PASS with 1 WARNING

Proceed to Execution? (the WARNING can be addressed during implementation)
```

**Gate:** Todas as revisões passam, nenhum BLOCK finding.

```
/devflow-next
→ Advancing to E (Execution)...
```

### 5.5 E — Execution

**Aqui começa o código.** O DevFlow:
1. Ativa o **git-strategy gate** — cria branch `feature/auth-complete` (se em main)
2. Carrega o plano
3. Executa task por task com **TDD rigoroso**

**Para cada task, o ciclo é:**

```
Task 1/10: Add Google OAuth provider config

  RED:   Escreve teste que falha
         → test_google_oauth_config_loads_from_env()
         → FAIL ✗ (GoogleOAuthProvider not found)

  GREEN: Escreve código mínimo para passar
         → GoogleOAuthProvider class + env config
         → PASS ✓

  REFACTOR: Melhora sem mudar comportamento
         → Extract base OAuthProvider class
         → PASS ✓

  COMMIT: feat(auth): add Google OAuth provider config

─── Task complete. Moving to task 2/10...
```

**Agent handoffs durante Execution:**
```
Task 1-3: backend-specialist (OAuth providers)
Task 4-5: backend-specialist → security-auditor (2FA com TOTP)
Task 6-7: backend-specialist (JWT + Redis)
Task 8-9: test-writer (integration + E2E tests)
Task 10:  documentation-writer (API docs)
```

**Gate:** Todas as tasks completas, todos os testes passando, código commitado.

```
/devflow-status

Workflow: "Complete Authentication" (MEDIUM)
  P Planning      ✓ Complete
  R Review        ✓ Complete
  E Execution     ● In Progress (7/10 tasks)
  V Validation    ○ Pending
  C Confirmation  ○ Pending
```

```
/devflow-next
→ Advancing to V (Validation)...
```

### 5.6 V — Validation

**Verificação completa antes do merge:**

```
Phase: V (Validation)
Checks: test suite, spec compliance, security, performance
```

**1. Full test suite:**
```
Running all tests...
  ✓ 47 unit tests passed
  ✓ 12 integration tests passed
  ✓ 3 E2E tests passed
  ✗ 0 failures
  Coverage: 94%
```

**2. Spec compliance:**
```
Checking spec requirements...
  ✓ Google OAuth login/callback      → implemented + tested
  ✓ GitHub OAuth login/callback      → implemented + tested
  ✓ TOTP generation                  → implemented + tested
  ✓ TOTP verification                → implemented + tested
  ✓ JWT refresh token rotation       → implemented + tested
  ✓ Redis session blacklist          → implemented + tested
  ✓ Rate limiting on verify-2fa      → implemented (addresses R-phase WARNING)
  All 7 requirements satisfied.
```

**3. Security validation (OWASP Top 10):**
```
Security audit results:
  ✓ A01 Broken Access Control    — roles enforced, no privilege escalation
  ✓ A02 Cryptographic Failures   — TOTP secrets encrypted, JWT signed with RS256
  ✓ A03 Injection                — parameterized queries, no string concat
  ✓ A07 Auth Failures            — rate limiting, account lockout after 5 attempts
  No vulnerabilities found.
```

**4. Performance check:**
```
  ✓ No N+1 queries detected
  ✓ Redis calls use connection pooling
  ✓ JWT verification is O(1)
```

**Gate:** Tudo passa.

```
/devflow-next
→ Advancing to C (Confirmation)...
```

### 5.7 C — Confirmation

**Finalização:**

```
Phase: C (Confirmation)
```

**1. Branch cleanup:**
```
→ Squash commits? Merge commits? (based on project convention)
→ Rebasing feature/auth-complete onto main...
→ All tests still pass after rebase.
```

**2. Documentation update:**
```
→ Updated API docs: 3 new endpoints documented
→ Updated README: auth section added
→ Updated .context/docs/project-overview.md
```

**3. Context sync:**
```
→ .context/ updated with new components
→ codebase-map.json refreshed
```

**4. PR creation (se gh/glab configurado):**
```
→ PR #42 created: "feat(auth): complete OAuth + 2FA system"
→ Description includes: spec compliance checklist, test coverage, security audit results
```

**5. PRD update:**
```
→ Phase 1 (Authentication) marked as ✓ Completed
→ Phase 2 (Payments) is next pending phase
```

### 5.8 Fechar a fase no PRD e seguir para a próxima

```
/devflow prd --status

PRD: MeuSaaS
  Phase 1: Authentication          ✓ Completed
  Phase 2: Payments (Stripe)       ⬚ Pending ← next
  Phase 3: Dashboard Analytics     ⬚ Pending
  Phase 4: Mobile App              ⬚ Pending
```

Para iniciar a próxima fase:
```
/devflow Implementar pagamentos com Stripe — checkout, subscriptions, webhooks
```

O ciclo PREVC recomeça para a Phase 2.

---

## 6. Exemplos por escala

### 6.1 QUICK — Bug fix

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

Done.
```

### 6.2 SMALL — Feature simples

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

Done.
```

### 6.3 MEDIUM — Feature multi-componente

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

V: Suite completa, spec compliance, security check

C: Branch merged, docs atualizados, PR criado
```

### 6.4 LARGE — Migração sistêmica

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

## 7. Capabilities on-demand

### 7.1 Sem workflow ativo

Você pode usar qualquer capability do DevFlow a qualquer momento, sem iniciar um workflow PREVC. Basta pedir em linguagem natural:

| O que você quer | O que dizer | Skill ativada |
|----------------|-------------|---------------|
| Auditar segurança | "Faça uma auditoria de segurança no auth" | security-audit + security-auditor |
| Gerar testes | "Gere testes para o módulo de usuários" | test-generation + TDD |
| Revisar PR | "Revise o PR #42" | pr-review + code-reviewer |
| Investigar bug | "Investigue o timeout no login" | bug-investigation + systematic-debugging |
| Decompor feature | "Quebre a feature de cache em tarefas" | feature-breakdown |
| Escolher git strategy | "Qual branch strategy para essa feature?" | git-strategy |
| Design de API | "Design a API de billing" | api-design + architect |
| Refatorar | "Refatore o módulo de pagamentos" | refactoring + refactoring-specialist |
| Gerar PRD | "Gere um roadmap de produto" | prd-generation + product-manager |
| Escrever commit | "Escreva a mensagem de commit" | commit-message |
| Atualizar docs | "Atualize a documentação do auth" | documentation + documentation-writer |
| Brainstorming | "Vamos discutir a feature de busca" | brainstorming (9 etapas) |
| Implementar com TDD | "Implemente com TDD" | test-driven-development |
| Debug | "Debug o memory leak no worker" | systematic-debugging (4 fases) |

### 7.2 Durante um workflow

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

## 8. Comandos de navegação

| Comando | O que faz | Quando usar |
|---------|-----------|-------------|
| `/devflow-status` | Mostra fase, progresso, modo e PRD | A qualquer momento |
| `/devflow-next` | Valida gates e avança de fase | Quando terminar uma fase |
| `/devflow-dispatch` | Recomenda agente(s) para o contexto | Para ver quem deveria estar trabalhando |
| `/devflow-dispatch <role>` | Despacha um agente específico | Para forçar um especialista |
| `/devflow-sync` | Atualiza `.context/` com estado atual | Após mudanças grandes |
| `/devflow prd --status` | Mostra progresso das fases do PRD | Para acompanhar roadmap |
| `/devflow language` | Configura idioma (en-US, pt-BR, es-ES) | Para mudar idioma das interações |
| `/devflow help` | Referência completa de comandos | Quando esquecer algo |

**Exemplos de navegação durante um workflow:**

```bash
# "Em que fase estou?"
/devflow-status
→ E Execution ● In Progress (7/12 tasks)

# "Posso avançar?"
/devflow-next
→ ✗ Gate not met: 5 tasks remaining, 2 tests failing

# (corrige os testes, completa as tasks)

/devflow-next
→ ✓ Gate passed. Advancing to V (Validation)...

# "Quem deveria estar trabalhando agora?"
/devflow-dispatch
→ Recommended: test-writer → security-auditor (V phase)

# "Quero o security-auditor especificamente"
/devflow-dispatch security-auditor
→ Loading playbook: security-auditor.md
→ Running OWASP Top 10 assessment...
```

---

## 9. Agentes em detalhe

### 9.1 Quando cada agente é usado

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
  test-writer        → review de cobertura
  security-auditor   → OWASP audit completo
  performance-opt.   → profiling, bottlenecks

C (Confirmation):
  documentation-wr.  → atualiza docs
  devops-specialist  → deploy, CI/CD
  product-manager    → atualiza PRD
```

### 9.2 Sequências comuns

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

### 9.3 Despachar manualmente

```bash
# Ver recomendação
/devflow-dispatch
→ Recommended: backend-specialist → test-writer

# Despachar específico
/devflow-dispatch database-specialist
→ Loading: database-specialist.md
→ Mission: Schema design, query optimization, safe migrations
→ Starting workflow...

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
```

---

## 10. Manutenção do projeto

### 10.1 Atualizar contexto

Após mudanças significativas (novo módulo, mudança de stack, refactoring grande):

```bash
/devflow-sync                   # Tudo (docs + agents + skills)
/devflow-sync docs              # Apenas docs
/devflow-sync agents            # Apenas agents
/devflow-sync skills            # Apenas skills
```

O sync relê o projeto e atualiza os playbooks com paths, classes e padrões atuais.

### 10.2 Atualizar plugins

> ⚠️ **Sempre atualize o marketplace antes do plugin.** O Claude Code resolve versões pelo cache local.

**No terminal:**
```bash
# 1. Marketplace primeiro (obrigatório)
claude plugin marketplace update NEXUZ-SYS

# 2. Plugins
claude plugin update devflow@NEXUZ-SYS
claude plugin update superpowers@claude-plugins-official

# 3. Dotcontext
npm update -g @dotcontext/cli
```

**Se a versão não atualizar:**
```bash
rm -rf ~/.claude/plugins/cache/NEXUZ-SYS/devflow/
claude plugin marketplace update NEXUZ-SYS
claude plugin install devflow@NEXUZ-SYS --scope user
```

**Após atualizar, sincronize o contexto:**
```
/devflow-sync
```

---

## 11. Compatibilidade com outras ferramentas

O DevFlow funciona como plugin em múltiplas plataformas:

| Ferramenta | Suporte a subagents | MCP | Hooks |
|------------|:---:|:---:|:---:|
| **Claude Code** | ✅ Full | ✅ | ✅ |
| **Cursor** | ❌ Sequential only | ✅ | ✅ |
| **Codex** | ✅ Full | ❌ | ❌ |
| **Gemini CLI** | ❌ Sequential only | ✅ | ❌ |
| **OpenCode** | ❌ Sequential only | ✅ | ❌ |

Quando subagents não estão disponíveis, o DevFlow usa `superpowers:executing-plans` (execução sequencial) em vez de `superpowers:subagent-driven-development`.

---

## 12. Troubleshooting

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

---

## 13. Referência rápida

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
/devflow prd                           # Gerar roadmap de produto
/devflow prd --status                  # Ver progresso do PRD
/devflow-status                        # Fase atual e progresso
/devflow-next                          # Avançar de fase
/devflow-dispatch                      # Recomendar agente
/devflow-dispatch <role>               # Despachar agente
/devflow-sync                          # Atualizar .context/
/devflow-sync docs|agents|skills       # Atualizar parcial
```

### Instalação (copie e cole)

```bash
# Uma vez por máquina
claude plugin install superpowers@claude-plugins-official --scope user
claude plugin marketplace add NEXUZ-SYS/devflow
claude plugin install devflow@NEXUZ-SYS --scope user
npm install -g @dotcontext/cli          # opcional, habilita Full Mode

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

# DevFlow — Tutorial de Setup

Guia completo para instalar e configurar o DevFlow. Cobre tanto projetos novos quanto projetos existentes (com ou sem dotcontext).

---

## Pré-requisitos

Antes de começar, verifique que você tem:

| Ferramenta | Como verificar | Instalar |
|------------|---------------|----------|
| Claude Code | `claude --version` | [claude.ai/claude-code](https://claude.ai/claude-code) |
| Node.js 20+ | `node --version` | [nodejs.org](https://nodejs.org/) |
| Git 2.x+ | `git --version` | [git-scm.com](https://git-scm.com/) |

---

## Parte 1 — Instalação (uma vez por máquina)

### 1.1 Instalar superpowers

Superpowers é a camada de disciplina do DevFlow — TDD, brainstorming socrático, code review, subagent-driven development.

No terminal:
```bash
claude plugin install superpowers@claude-plugins-official --scope user
```

Ou dentro do Claude Code:
```
/plugin install superpowers@claude-plugins-official --scope user
```

Para verificar, abra o Claude Code e digite `/`. As seguintes skills devem aparecer na lista:

```
superpowers:brainstorming
superpowers:test-driven-development
superpowers:writing-plans
superpowers:systematic-debugging
...
```

### 1.2 Registrar o marketplace do DevFlow

Só precisa fazer isso uma vez.

No terminal:
```bash
claude plugin marketplace add NEXUZ-SYS/devflow
```

Ou dentro do Claude Code:
```
/plugin marketplace add NEXUZ-SYS/devflow
```

### 1.3 Instalar o DevFlow

No terminal:
```bash
claude plugin install devflow@NEXUZ-SYS --scope user
```

Ou dentro do Claude Code:
```
/plugin install devflow@NEXUZ-SYS --scope user
```

Para verificar:
```bash
cat ~/.claude/plugins/installed_plugins.json | grep devflow
```

### 1.4 Instalar dotcontext (opcional — habilita Full Mode)

Dotcontext é a camada de contexto e orquestração — agentes via MCP, análise semântica, sync multi-tool.

```bash
npm install -g @dotcontext/cli
```

Para verificar:
```bash
dotcontext --version
```

> ⚠️ **Importante:** Nunca use `npx` para subcomandos do dotcontext com `:` (ex: `mcp:install`). O npm 11+ interpreta o `:` como separador de script. Sempre use o binário global `dotcontext`.

### Resultado da instalação

Neste ponto você tem tudo instalado na máquina. Agora precisa inicializar em cada projeto.

```
✅ Claude Code          — runtime
✅ superpowers plugin   — disciplina (TDD, brainstorming, code review)
✅ devflow plugin       — workflow PREVC, 15 agentes, 25+ skills
✅ dotcontext CLI       — análise semântica, MCP (opcional)
```

---

## Parte 2 — Inicializar em um projeto

### 2.1 Navegar até o projeto

```bash
# Projeto novo
mkdir meu-projeto && cd meu-projeto && git init

# Projeto existente
cd /caminho/do/meu-projeto
```

### 2.2 Abrir o Claude Code

```bash
claude
```

Na inicialização, o hook SessionStart do DevFlow roda **silenciosamente** — ele injeta o contexto do workflow no modelo mas não exibe nada no terminal. Isso é normal.

### 2.3 Inicializar o DevFlow

```
/devflow init
```

O que acontece por trás:

**Se dotcontext está instalado (Full Mode):**

```
1. dotcontext mcp:install claude --local    ← cria .mcp.json no projeto
2. context({ action: "init" })              ← scaffolda .context/
3. context({ action: "fill" })              ← preenche com análise AI
4. context({ action: "buildSemantic" })     ← análise AST do codebase
5. context({ action: "getMap" })            ← gera codebase-map.json
6. context({ action: "detectPatterns" })    ← detecta padrões de arquitetura
7. DevFlow preenche gaps                    ← agentes e skills extras
```

**Se dotcontext NÃO está instalado (Lite Mode):**

```
1. DevFlow escaneia o projeto sozinho
2. Gera .context/ em formato dotcontext v2
3. Modo Lite ativado (sem MCP, leitura direta dos playbooks)
```

### 2.4 Verificar o modo ativo

```
/devflow-status
```

Saída esperada:
```
DevFlow Mode: full
- superpowers: true
- dotcontext MCP: true
- dotcontext lite (.context/): true

No active workflow. Start one with:
  /devflow <description>
```

> Se o modo aparece como `minimal` ou `lite` quando esperava `full`, veja a seção de Troubleshooting.

### 2.5 Estrutura gerada

Após o `/devflow init`, seu projeto terá:

```
meu-projeto/
├── .mcp.json                          ← config do MCP (se dotcontext instalado)
└── .context/                          ← contexto do projeto (compatível dotcontext)
    ├── agents/
    │   ├── architect-specialist.md    ← playbook personalizado para o projeto
    │   ├── backend-specialist.md
    │   ├── code-reviewer.md
    │   ├── feature-developer.md
    │   ├── test-writer.md
    │   └── ...
    ├── skills/
    │   ├── code-review/SKILL.md
    │   ├── test-generation/SKILL.md
    │   ├── commit-message/SKILL.md
    │   └── ...
    ├── docs/
    │   ├── project-overview.md        ← visão geral gerada por AI
    │   ├── codebase-map.json          ← mapa semântico do codebase
    │   ├── development-workflow.md
    │   └── testing-strategy.md
    └── plans/                         ← planos dos workflows PREVC
```

---

## Parte 3 — Projeto existente com dotcontext

Se o seu projeto **já tem** `.context/` configurado (por uso anterior do dotcontext), o `/devflow init` detecta isso automaticamente e executa um **sync** em vez de inicializar do zero:

```
/devflow init

→ .context/docs/ detectado. Executando sync para atualizar conteúdo...
→ Atualizando project-overview.md, codebase-map.json, ...
→ .mcp.json detectado com dotcontext. Full Mode habilitado.
→ Sync completo. 8 docs atualizados, 3 agentes adicionados.
```

O que acontece:
1. **Detecta** `.context/docs/` existente → entende que o projeto já tem contexto
2. **Delega** para `devflow:context-sync` que atualiza docs, agents e skills
3. **Adiciona** apenas os agentes e skills do DevFlow que estão faltando
4. **Instala** o MCP server se ainda não estiver no `.mcp.json`

Se o projeto tem `.mcp.json` com outros servidores MCP, o DevFlow adiciona o entry do dotcontext sem alterar os existentes.

### Atualizar o contexto manualmente

Após mudanças significativas no projeto (novo módulo, mudança de stack, refactoring grande), atualize o `.context/`:

```
/devflow-sync                   # Atualiza tudo (docs + agents + skills)
/devflow-sync docs              # Atualiza apenas docs
/devflow-sync agents            # Atualiza apenas agents
/devflow-sync skills            # Atualiza apenas skills
```

O sync usa dotcontext MCP (`fillSingle`) em Full Mode, ou scan standalone em Lite Mode.

---

## Parte 4 — Testando o DevFlow

Agora que está tudo configurado, vamos testar cada funcionalidade.

### 4.1 Teste rápido — QUICK (bug fix, só E→V)

```
/devflow scale:QUICK fix typo no README
```

O que acontece:
1. DevFlow detecta escala QUICK
2. Pula direto para **E (Execution)** — TDD, implementa o fix
3. Depois **V (Validation)** — verifica testes, spec compliance
4. Workflow completo

### 4.2 Teste simples — SMALL (feature, P→E→V)

```
/devflow add um endpoint hello world
```

O que acontece:
1. **P (Planning)** — brainstorming socrático de 9 etapas, gera spec + plano
2. **E (Execution)** — TDD com subagents e agent handoffs
3. **V (Validation)** — testes, security check
4. Workflow completo

### 4.3 Teste completo — MEDIUM (multi-componente, P→R→E→V→C)

```
/devflow scale:MEDIUM add autenticação com JWT
```

O que acontece:
1. **P (Planning)** — brainstorming + enriquecimento de contexto + escrita do plano
2. **R (Review)** — architect + code-reviewer validam o design
3. **E (Execution)** — SDD com agent handoffs (backend → test-writer)
4. **V (Validation)** — testes + security-auditor + spec compliance
5. **C (Confirmation)** — finalização de branch + atualização de docs + sync de contexto

### 4.4 Testar sync de contexto

```bash
# Atualizar todo o .context/ com o estado atual do projeto
/devflow-sync

# Atualizar apenas docs (project-overview, codebase-map, etc.)
/devflow-sync docs
```

O sync é útil após mudanças significativas — novo módulo, mudança de stack, refactoring grande.

### 4.5 Testar comandos de navegação

```bash
# Ver em que fase está
/devflow-status

# Avançar para a próxima fase (valida gates)
/devflow-next

# Ver qual agente é recomendado para o contexto atual
/devflow-dispatch

# Despachar um agente específico
/devflow-dispatch backend-specialist
```

### 4.6 Testar PRD generation

```
/devflow prd
```

O que acontece:
1. O agente **product-manager** analisa o projeto
2. Gera um PRD (Product Requirements Document) com visão, objetivos, requisitos e roadmap
3. Usa um loop PREVC multi-fase para refinar o documento

### 4.7 Testar capabilities on-demand

As capabilities do DevFlow podem ser usadas a qualquer momento, mesmo fora de um workflow. Basta pedir em linguagem natural:

```
"Faça uma auditoria de segurança no código de autenticação"
→ DevFlow ativa a capability de Security Audit

"Gere testes para o módulo de usuários"
→ DevFlow ativa Test Generation + TDD

"Revise o PR #42"
→ DevFlow ativa PR Review

"Investigue o erro de timeout no login"
→ DevFlow ativa Bug Investigation + Systematic Debugging

"Quebre a feature de cache em tarefas menores"
→ DevFlow ativa Feature Breakdown

"Qual a melhor estratégia de branch para essa feature?"
→ DevFlow ativa Git Strategy

"Gere um PRD para o próximo trimestre"
→ DevFlow ativa PRD Generation + Product Manager
```

---

## Parte 5 — Atualização

> ⚠️ **Passo obrigatório:** Sempre atualize o marketplace antes de atualizar o plugin. O Claude Code resolve versões a partir do cache local do marketplace — sem essa etapa, ele não detecta a nova versão e mantém a antiga.

### Atualizar plugins

No terminal:
```bash
# 1. Atualizar o marketplace (SEMPRE fazer antes do update)
claude plugin marketplace update NEXUZ-SYS

# 2. Atualizar DevFlow
claude plugin update devflow@NEXUZ-SYS

# 3. Atualizar superpowers
claude plugin update superpowers@claude-plugins-official

# 4. Atualizar dotcontext
npm update -g @dotcontext/cli
```

Ou dentro do Claude Code:
```
# 1. Atualizar marketplace primeiro
/plugin marketplace update NEXUZ-SYS

# 2. Depois atualizar o plugin
/plugin update devflow@NEXUZ-SYS
/plugin update superpowers@claude-plugins-official
```

### Se o update não funcionar

Se após o update a versão antiga persistir:
```bash
# Limpar cache e reinstalar
rm -rf ~/.claude/plugins/cache/NEXUZ-SYS/devflow/
claude plugin marketplace update NEXUZ-SYS
claude plugin install devflow@NEXUZ-SYS --scope user
```

### Atualizar o .context/ do projeto

Após atualizar o plugin, sincronize o contexto do projeto:

```
# Sync completo — atualiza docs, agents e skills com o estado atual do projeto
/devflow-sync

# Ou via init (detecta .context/ existente e executa sync automaticamente)
/devflow init
```

Para atualizar apenas uma parte:
```
/devflow-sync docs              # Apenas docs (project-overview, codebase-map, etc.)
/devflow-sync agents            # Apenas agents
/devflow-sync skills            # Apenas skills
```

---

## Troubleshooting

### `/devflow-status` mostra "Minimal" quando esperava "Full"

1. Verifique se `.mcp.json` foi criado no projeto:
   ```bash
   cat .mcp.json
   ```
   Deve conter um entry para `dotcontext`.

2. Reinicie a sessão do Claude Code — os hooks rodam apenas no início:
   ```bash
   # Saia e entre novamente
   exit
   claude
   ```

3. Verifique se dotcontext está acessível:
   ```bash
   dotcontext --version
   ```

### superpowers aparece como `false`

```bash
# Verificar instalação
cat ~/.claude/plugins/installed_plugins.json | grep superpowers

# Reinstalar (no terminal)
claude plugin install superpowers@claude-plugins-official --scope user
```

### dotcontext CLI não encontrado

```bash
# Verificar Node.js (precisa 20+)
node --version

# Instalar dotcontext globalmente
npm install -g @dotcontext/cli

# Verificar
dotcontext --version
```

### `context.fill()` demora muito

Normal para projetos grandes — a análise semântica do codebase pode levar 1-3 minutos. Para projetos muito grandes (1000+ arquivos), pode demorar mais.

### Skills do DevFlow não aparecem

```bash
# Verificar instalação
grep devflow ~/.claude/plugins/installed_plugins.json

# Reinstalar (no terminal)
claude plugin install devflow@NEXUZ-SYS --scope user
```

### Erro com `npx dotcontext mcp:install`

O npm 11+ interpreta `:` como separador de script. Use o binário global:

```bash
# Errado
npx dotcontext mcp:install claude --local

# Certo
dotcontext mcp:install claude --local
```

---

## Resumo — Copie e cole

### Instalação completa (uma vez)

No terminal:
```bash
# Plugins
claude plugin install superpowers@claude-plugins-official --scope user
claude plugin marketplace add NEXUZ-SYS/devflow
claude plugin install devflow@NEXUZ-SYS --scope user

# Dotcontext (opcional, habilita Full Mode)
npm install -g @dotcontext/cli
```

Ou dentro do Claude Code:
```
/plugin install superpowers@claude-plugins-official --scope user
/plugin marketplace add NEXUZ-SYS/devflow
/plugin install devflow@NEXUZ-SYS --scope user
```

### Inicializar em cada projeto

```bash
cd meu-projeto
claude

# Dentro do Claude Code:
/devflow init
/devflow-status
```

### Atualizar contexto do projeto

```bash
/devflow-sync                   # Atualiza .context/ com estado atual
/devflow-sync docs              # Apenas docs
```

### Começar a trabalhar

```bash
/devflow add minha feature incrível

# Gerar roadmap de produto
/devflow prd
```

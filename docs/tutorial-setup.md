# DevFlow — Tutorial Completo de Setup

Guia passo a passo para instalar e testar o DevFlow em um projeto novo.

---

## Pré-requisitos

- [Claude Code](https://claude.ai/claude-code) instalado
- Node.js 20+ (para dotcontext)
- Git

---

## Passo 1: Instalar superpowers (dependência)

O DevFlow usa skills do superpowers. Instale como plugin global:

```bash
claude /plugin install superpowers@claude-plugins-official --scope user
```

Verifique:
```bash
# Dentro do Claude Code, as skills devem aparecer
# superpowers:brainstorming, superpowers:test-driven-development, etc.
```

---

## Passo 2: Registrar marketplace do DevFlow

Só precisa fazer isso uma vez:

```bash
claude plugin marketplace add NEXUZ-SYS/devflow
```

---

## Passo 3: Criar ou navegar até seu projeto

```bash
# Projeto novo
mkdir meu-projeto && cd meu-projeto
git init

# Ou projeto existente
cd /caminho/do/meu-projeto
```

---

## Passo 4: Instalar DevFlow no projeto

```bash
claude /plugin install devflow@NEXUZ-SYS
```

Verifique que foi instalado:
```bash
# Dentro do Claude Code, rode:
cat ~/.claude/plugins/installed_plugins.json | grep devflow
```

---

## Passo 5: Iniciar uma sessão Claude Code

```bash
claude
```

Na inicialização, o hook SessionStart do DevFlow roda **silenciosamente** e injeta o contexto do workflow no modelo. Você não verá output visual no terminal — isso é normal.

Para confirmar que o DevFlow está ativo, pergunte ao Claude:

```
Em que modo o DevFlow está rodando?
```

Ele deve responder com algo como:
```
DevFlow Mode: minimal
- superpowers: true
- dotcontext MCP: false
- dotcontext CLI: true
```

---

## Passo 6: Inicializar DevFlow no projeto

```
/flow init
```

Isso dispara a skill `devflow:project-init` que executa:

### Se dotcontext CLI está disponível (Tier 2 — recomendado):
```
1. npm install -g @dotcontext/cli              ← instala globalmente (se não existe)
2. dotcontext mcp:install claude --local       ← instala MCP server → .mcp.json
3. context({ action: "init" })                 ← scaffolda .context/
4. context({ action: "fill" })                 ← preenche com AI
5. context({ action: "buildSemantic" })        ← análise AST profunda
6. context({ action: "getMap" })               ← gera codebase-map.json
7. context({ action: "detectPatterns" })       ← detecta padrões
8. DevFlow preenche gaps                       ← agentes/skills extras
```

> **Nota:** Não use `npx dotcontext mcp:install` — npm 11+ interpreta o `:` como separador de script npm. Sempre use o binário global `dotcontext`.

### Se dotcontext NÃO está disponível (Tier 3):
```
1. DevFlow escaneia o projeto sozinho
2. Gera .context/ em formato dotcontext v2
3. Modo Lite ativado
```

### Resultado:
```
meu-projeto/
├── .mcp.json                    ← dotcontext MCP config (se Tier 2)
└── .context/
    ├── agents/
    │   ├── architect-specialist.md
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
    │   ├── project-overview.md
    │   ├── codebase-map.json
    │   ├── development-workflow.md
    │   └── testing-strategy.md
    └── plans/
```

---

## Passo 7: Verificar o modo ativo

Inicie uma nova sessão ou rode `/phase`:

```
DevFlow Mode: full               ← se Tier 2 foi usado
- superpowers: true
- dotcontext MCP: true
- dotcontext lite (.context/): true
```

---

## Passo 8: Testar com um workflow real

### Teste QUICK (bug fix — só E→V):
```
/flow scale:QUICK fix typo in README
```

O que acontece:
1. DevFlow detecta escala QUICK
2. Pula direto para **E (Execution)** → TDD, implementa o fix
3. Depois **V (Validation)** → verifica testes, spec compliance
4. Workflow completo

### Teste SMALL (feature simples — P→E→V):
```
/flow add a hello world endpoint
```

O que acontece:
1. **P (Planning)** — brainstorming socrático, gera spec + plan
2. **E (Execution)** — TDD, subagents, agent handoffs
3. **V (Validation)** — testes, security check
4. Workflow completo

### Teste MEDIUM (feature multi-componente — P→R→E→V→C):
```
/flow scale:MEDIUM add user authentication with JWT
```

O que acontece:
1. **P (Planning)** — brainstorming + context enrichment + plan writing
2. **R (Review)** — architect + code-reviewer validam o design
3. **E (Execution)** — SDD com agent handoffs (backend → test-writer)
4. **V (Validation)** — testes + security-auditor + spec compliance
5. **C (Confirmation)** — branch finish + docs update + context sync

---

## Passo 9: Testar comandos individuais

### Ver fase atual:
```
/phase
```

### Avançar de fase:
```
/phase advance
```

### Listar agentes:
```
/agents
```

### Despachar agente específico:
```
/agents dispatch backend-specialist
```

---

## Passo 10: Testar skills on-demand

Skills podem ser invocadas a qualquer momento, fora de um workflow:

```
# Pedir uma revisão de segurança
"Use devflow:security-audit para revisar o código de autenticação"

# Gerar testes
"Use devflow:test-generation para o módulo de usuários"

# Revisar um PR
"Use devflow:pr-review para o PR #42"

# Investigar um bug
"Use devflow:bug-investigation para o erro de timeout no login"
```

---

## Troubleshooting

### "DevFlow Mode: minimal" mesmo depois do /flow init
- Verifique se `.mcp.json` foi criado no projeto
- Reinicie a sessão Claude Code (os hooks rodam no início)
- Verifique: `cat .mcp.json` — deve ter `dotcontext` entry

### superpowers: false
- Verifique instalação: `cat ~/.claude/plugins/installed_plugins.json | grep superpowers`
- Reinstale: `claude /plugin install superpowers@claude-plugins-official`

### dotcontext CLI (npx): false
- Verifique Node.js: `node --version` (precisa 20+)
- Verifique npx: `npx --version`
- Instale dotcontext globalmente: `npm i -g @dotcontext/cli`

### context.fill() demora muito
- Normal — análise de codebase grande leva 1-3 minutos
- Para projetos muito grandes, pode demorar mais

### Skills não são encontradas
- Verifique que o DevFlow está instalado: `grep devflow ~/.claude/plugins/installed_plugins.json`
- Reinstale: `claude /plugin install devflow@NEXUZ-SYS`

---

## Ordem resumida (copie e cole)

```bash
# 1. Instalar plugins (uma vez)
claude /plugin install superpowers@claude-plugins-official --scope user
claude plugin marketplace add NEXUZ-SYS/devflow
claude /plugin install devflow@NEXUZ-SYS --scope user

# 2. No projeto, abrir Claude Code
cd meu-projeto
claude

# 3. Dentro do Claude Code
/flow init

# 4. Começar a trabalhar
/flow add minha feature incrível
```

# DevFlow

> Pare de codar sem processo. DevFlow transforma o Claude Code em um time completo de engenharia — com planejamento, revisão, TDD, agentes especialistas e validação automática.

DevFlow é um plugin que conecta [superpowers](https://github.com/obra/superpowers) (disciplina, TDD, brainstorming) com [dotcontext](https://github.com/vinilana/dotcontext) (agentes, workflow PREVC, contexto do projeto) em um fluxo unificado.

Markdown puro + shell. Zero dependências de runtime. Funciona como plugin para Claude Code, Cursor, Codex e Gemini CLI.

---

## O que você ganha

- **Workflow PREVC** — 5 fases com gates: Planning → Review → Execution → Validation → Confirmation
- **Escala adaptativa** — DevFlow detecta a complexidade e ajusta o fluxo automaticamente
- **14 agentes especialistas** — architect, backend, frontend, security-auditor, test-writer e mais
- **21 skills** — API design, refactoring, debugging, test generation, security audit...
- **TDD obrigatório** — RED → GREEN → REFACTOR, sem atalhos
- **Brainstorming socrático** — 9 etapas de refinamento antes de escrever código
- **Code review em 2 estágios** — revisão estruturada com anti-racionalização
- **Scaffolding inteligente** — `/devflow init` analisa seu projeto e gera agentes, skills e docs personalizados em `.context/`
- **3 modos** — Full (MCP), Lite (.context/), Minimal (standalone) — funciona com o que você tiver instalado

---

## Requisitos

| Requisito | Versão | Obrigatório? | Para quê |
|-----------|--------|:---:|-----------|
| [Claude Code](https://claude.ai/claude-code) | latest | ✅ | Runtime do plugin |
| [Node.js](https://nodejs.org/) | 20+ | ✅ | Necessário para dotcontext CLI |
| [Git](https://git-scm.com/) | 2.x+ | ✅ | Controle de versão e worktrees |
| [superpowers](https://github.com/obra/superpowers) | latest | ✅ | Disciplina: TDD, brainstorming, code review, SDD |
| [dotcontext](https://github.com/vinilana/dotcontext) | latest | Opcional | Habilita Full Mode: agentes via MCP, análise semântica, sync multi-tool |

> **Sem dotcontext**, o DevFlow opera em modo Lite ou Minimal — ainda funcional, mas sem orquestração MCP.

---

## Instalação

### 1. Instalar superpowers (dependência)

```bash
claude /plugin install superpowers@claude-plugins-official --scope user
```

Verifique dentro do Claude Code — as skills devem aparecer:
```
superpowers:brainstorming, superpowers:test-driven-development, etc.
```

### 2. Registrar o marketplace e instalar o DevFlow

```bash
# Registrar marketplace (uma vez)
claude plugin marketplace add NEXUZ-SYS/devflow

# Instalar o plugin
claude /plugin install devflow@NEXUZ-SYS --scope user
```

### 3. Instalar dotcontext (opcional — habilita Full Mode)

```bash
# Instalar CLI globalmente
npm install -g @dotcontext/cli

# Verificar instalação
dotcontext --version
```

> ⚠️ **Nunca use `npx` para subcomandos do dotcontext com `:` (ex: `mcp:install`).** O npm 11+ interpreta o `:` como separador de script. Sempre use o binário global `dotcontext`.

### 4. Inicializar no seu projeto

```bash
cd seu-projeto
claude
```

Dentro do Claude Code:
```
/devflow init
```

O que acontece:
1. Analisa o projeto (stack, estrutura, padrões)
2. Instala o MCP server do dotcontext (`.mcp.json`)
3. Scaffolda `.context/` com agentes, skills e docs personalizados
4. Detecta o modo automaticamente (Full/Lite/Minimal)

---

## Atualização

```bash
# Atualizar DevFlow
claude /plugin update devflow@NEXUZ-SYS

# Atualizar superpowers
claude /plugin update superpowers@claude-plugins-official

# Atualizar dotcontext
npm update -g @dotcontext/cli
```

---

## Uso rápido

```bash
# Começar um workflow (escala auto-detectada)
/devflow add autenticação com OAuth

# Escala explícita
/devflow scale:QUICK fix typo no README
/devflow scale:MEDIUM add sistema de cache com Redis
/devflow scale:LARGE migrar de REST para GraphQL

# Ver progresso
/devflow-status

# Avançar para próxima fase
/devflow-next

# Ver agente recomendado para o contexto atual
/devflow-dispatch

# Despachar um agente específico
/devflow-dispatch security-auditor
```

Para ver todos os comandos e capabilities:
```
/devflow help
```

---

## Comandos

| Comando | O que faz |
|---------|-----------|
| `/devflow help` | Mostra a referência completa |
| `/devflow init` | Inicializa DevFlow no projeto |
| `/devflow <descrição>` | Inicia workflow (auto-detecta escala) |
| `/devflow scale:X <desc>` | Inicia com escala explícita (QUICK/SMALL/MEDIUM/LARGE) |
| `/devflow-status` | Mostra fase atual, progresso e modo |
| `/devflow-next` | Avança para próxima fase (valida gates) |
| `/devflow-dispatch` | Recomenda agente para o contexto atual |
| `/devflow-dispatch <role>` | Despacha um agente especialista |

---

## Escalas

| Escala | Quando usar | Fases |
|--------|-------------|-------|
| **QUICK** | Bug fix, typo, ajuste pontual | E → V |
| **SMALL** | Feature simples, endpoint novo | P → E → V |
| **MEDIUM** | Feature multi-componente | P → R → E → V → C |
| **LARGE** | Mudança sistêmica, migração | P → R → E → V → C + checkpoints |

---

## Fases (PREVC)

| Fase | Nome | O que acontece |
|:---:|------|----------------|
| **P** | Planning | Brainstorming socrático, enriquecimento de contexto, escrita do plano |
| **R** | Review | Revisão de design, pré-check de segurança, validação com agentes |
| **E** | Execution | TDD, handoffs entre agentes, subagent-driven development |
| **V** | Validation | Testes, auditoria de segurança, compliance com a spec |
| **C** | Confirmation | Finalização de branch, atualização de docs, criação de PR |

---

## Agentes (14 especialistas)

| Agente | Papel | Fases |
|--------|-------|-------|
| architect | Design de sistema e componentes | P, R |
| feature-developer | Implementação de features | E |
| bug-fixer | Correção de bugs | E |
| code-reviewer | Revisão de qualidade | R, V |
| test-writer | Escrita de testes | E, V |
| documentation-writer | Documentação | C |
| refactoring-specialist | Refatoração segura | E |
| performance-optimizer | Otimização de performance | E, V |
| security-auditor | Auditoria de segurança | R, V |
| backend-specialist | Backend e APIs | E |
| frontend-specialist | Frontend e UI | E |
| database-specialist | Banco de dados e queries | E |
| devops-specialist | CI/CD e infraestrutura | E, C |
| mobile-specialist | Desenvolvimento mobile | E |

---

## Modos de operação

| Modo | O que precisa | O que ganha |
|------|--------------|-------------|
| **Full** | superpowers + dotcontext MCP | Tudo: PREVC, agentes via MCP, análise semântica, sync multi-tool |
| **Lite** | superpowers + `.context/` | PREVC, playbooks de agentes (leitura direta), planos |
| **Minimal** | superpowers (ou standalone) | Brainstorming, TDD, SDD, code review — fluxo linear |

O modo é detectado automaticamente ao iniciar a sessão. Verifique com `/devflow-status`.

---

## Como o DevFlow conecta tudo

```
┌─────────────────────────────────────────────┐
│                  DevFlow                     │
│         (skills + agents + hooks)            │
├──────────────────┬──────────────────────────┤
│   superpowers    │       dotcontext          │
│   (disciplina)   │   (contexto + workflow)   │
├──────────────────┼──────────────────────────┤
│ brainstorming    │ fases PREVC              │
│ TDD iron law     │ 14 agentes              │
│ SDD (subagents)  │ análise semântica        │
│ code review 2x   │ gestão de planos        │
│ anti-racional.   │ sync multi-tool          │
│ git worktrees    │ escala adaptativa        │
└──────────────────┴──────────────────────────┘
```

---

## Estrutura do plugin

```
devflow/
├── commands/         # /devflow, /devflow-status, /devflow-next, /devflow-dispatch
├── skills/           # 21 skills (PREVC, bridge, on-demand)
├── agents/           # 14 playbooks de agentes (fallback genérico)
├── templates/        # Templates para scaffolding do .context/
├── hooks/            # SessionStart com detecção de modo
├── references/       # Mapa de skills + mapeamento de ferramentas
├── .claude-plugin/   # Manifesto do plugin para Claude Code
└── .cursor-plugin/   # Manifesto do plugin para Cursor
```

### Gerado por projeto (via `/devflow init`)
```
seu-projeto/
└── .context/         # Compatível com dotcontext, específico do projeto
    ├── agents/       # Playbooks personalizados para o projeto
    ├── skills/       # Guias de skills para o projeto
    ├── docs/         # Documentação do projeto
    └── plans/        # Planos dos workflows PREVC
```

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| `/devflow-status` mostra "Minimal" | Verifique se `.mcp.json` existe. Reinicie a sessão do Claude Code. |
| superpowers: false | `claude /plugin install superpowers@claude-plugins-official --scope user` |
| dotcontext CLI não encontrado | `npm install -g @dotcontext/cli` (Node.js 20+ necessário) |
| Skills não aparecem | Verifique: `cat ~/.claude/plugins/installed_plugins.json \| grep devflow` |
| `context.fill()` demora | Normal — análise de codebase grande leva 1-3 minutos |

---

## Licença

MIT — [NEXUZ-SYS/devflow](https://github.com/NEXUZ-SYS/devflow)

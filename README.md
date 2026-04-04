# DevFlow

> Pare de codar sem processo. DevFlow transforma o Claude Code em um time completo de engenharia — com planejamento, revisão, TDD, agentes especialistas e validação automática.

DevFlow é um plugin que conecta [superpowers](https://github.com/obra/superpowers) (disciplina, TDD, brainstorming) com [dotcontext](https://github.com/vinilana/dotcontext) (agentes, workflow PREVC, contexto do projeto) em um fluxo unificado.

Markdown puro + shell. Zero dependências de runtime. Funciona como plugin para Claude Code, Cursor, Codex e Gemini CLI.

---

## Destaques

- **Workflow PREVC** — 5 fases com gates automáticos: Planning → Review → Execution → Validation → Confirmation
- **Loop autônomo** — execução story-by-story com contexto fresco, escalação automática e retry inteligente
- **Modos de autonomia** — `supervised` (padrão), `assisted` (humano nas pontas), `autonomous` (loop completo com safety net)
- **TDD obrigatório** — RED → GREEN → REFACTOR em TODOS os modos, com HARD-GATE bloqueante
- **15 agentes especialistas** — architect, product-manager, backend, frontend, security-auditor e mais
- **25+ skills** — API design, refactoring, debugging, test generation, security audit, PRD generation...
- **Escala adaptativa** — auto-detecta complexidade e ajusta o fluxo (QUICK/SMALL/MEDIUM/LARGE)
- **PRD generation** — entrevista socrática, RICE scoring, roadmap faseado
- **Suporte a projetos existentes** — `--from-prd` converte PRD em stories.yaml, upgrade de autonomia mid-workflow
- **3 modos de operação** — Full (MCP), Lite (.context/), Minimal (standalone)
- **Multilíngue** — en-US, pt-BR, es-ES
- **208 testes automatizados** — unit, E2E, validação estrutural

---

## Arquitetura

```
┌──────────────────────────────────────────────────────┐
│                      DevFlow                         │
│          (skills + agents + hooks + gates)            │
├────────────────────┬─────────────────────────────────┤
│    superpowers      │          dotcontext              │
│    (disciplina)     │    (contexto + workflow)         │
├────────────────────┼─────────────────────────────────┤
│ brainstorming       │ fases PREVC                     │
│ TDD iron law        │ 15 agentes via MCP              │
│ SDD (subagents)     │ análise semântica               │
│ code review 2x      │ gestão de planos                │
│ anti-racional.      │ sync multi-tool                 │
│ git worktrees       │ escala adaptativa               │
├────────────────────┴─────────────────────────────────┤
│              Funcionalidades exclusivas DevFlow       │
├──────────────────────────────────────────────────────┤
│ Loop autônomo (stories.yaml + contexto fresco/story) │
│ TDD HARD-GATE (RED→GREEN→REFACTOR, todos os modos)   │
│ Geração de PRD (product-manager + RICE + MoSCoW)     │
│ git-strategy gate (proteção de branch via hook)      │
│ checkpoint/rehydration (PreCompact + PostCompact)    │
│ context-sync (/devflow-sync)                         │
│ roteamento de escala (QUICK/SMALL/MEDIUM/LARGE)      │
│ devflow-runner.mjs (safety net externo)              │
└──────────────────────────────────────────────────────┘
```

---

## Início Rápido

```bash
# 1. Instalar dependências (uma vez)
claude plugin install superpowers@claude-plugins-official --scope user
claude plugin marketplace add NEXUZ-SYS/devflow
claude plugin install devflow@NEXUZ-SYS --scope user

# 2. Inicializar no projeto
cd meu-projeto && claude
/devflow init

# 3. Começar a trabalhar
/devflow add autenticação com OAuth
```

Para instruções detalhadas de instalação, configuração e uso completo, veja o **[Manual do Usuário](docs/tutorial-setup.md)**.

---

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| **[Manual do Usuário](docs/tutorial-setup.md)** | Instalação, configuração, fluxo completo, exemplos por escala, troubleshooting |
| **[/devflow help](commands/devflow.md)** | Referência completa de comandos (também acessível via `/devflow help` no Claude Code) |
| **[Skills Map](references/skills-map.md)** | Mapa completo de skills nos 3 sistemas (DevFlow, superpowers, dotcontext) |

---

## Compatibilidade

| Ferramenta | Subagents | MCP | Hooks |
|------------|:---------:|:---:|:-----:|
| **Claude Code** | Completo | Completo | Completo |
| **Cursor** | Sequencial | Completo | Completo |
| **Codex** | Completo | -- | -- |
| **Gemini CLI** | Sequencial | Completo | -- |
| **OpenCode** | Sequencial | Completo | -- |

---

## Histórico de Versões

| Versão | Data | Destaques |
|--------|------|-----------|
| **0.9.1** | 2026-04-04 | Fix: version bump nunca é pulado na finalização de branch — Step 1 (Version Bump) no prevc-confirmation antes do merge, hook PostToolUse detecta `gh pr merge`/`git merge` via Bash e injeta BUMP WARNING, 240 testes |
| **0.9.0** | 2026-04-03 | Sistema de ADRs como guardrails para IA: 6 templates organizacionais (SOLID, TDD, Code Review, Layered Architecture, OWASP, AWS Data Lake), entrevista de stack no `/devflow prd`, recomendação e instanciação automática de ADRs, leitura de guardrails no Planning, compliance check no Validation, suporte em context-awareness e context-sync, 252 testes |
| **0.8.0** | 2026-04-03 | Hook PostToolUse com commit prompt e finalização de branch automática: pergunta "Quer commitar?" após tasks, "Quer finalizar a branch?" com pipeline completa (README, bump, push, merge), comportamento adaptável por autonomia (supervised/assisted/autonomous), detecção de capacidades do projeto, i18n em 3 idiomas |
| **0.7.1** | 2026-04-03 | prd-generation self-contained: templates alternativos (One-Page, Feature Brief, Agile Epic), frameworks de discovery e métricas (Hypothesis, OST, North Star, Feature Success Metrics), instrução de idioma para todo output, correção de referência quebrada no agente product-manager |
| **0.7.0** | 2026-04-02 | Loop autônomo (supervised/assisted/autonomous), TDD HARD-GATE em todos os modos, E2E obrigatório para auth/pagamentos, `--from-prd` para projetos existentes, upgrade de autonomia mid-workflow, context-sync workflow scope, devflow-runner.mjs (safety net), 208 testes |
| **0.6.3** | 2026-03-31 | `/devflow update` para atualizar tudo de uma vez, auto-detect de scope do plugin |
| **0.6.0** | 2026-03-30 | Suporte multilíngue (en-US, pt-BR, es-ES), seleção de idioma persistente, hooks e respostas traduzidos |
| **0.5.0** | 2026-03-29 | Reescrita do README e tutorial com guia completo de uso |
| **0.4.0** | 2026-03-28 | PRD generation com entrevista socrática e RICE scoring, checkpoint persistence, workflow files em branches protegidas |
| **0.3.0** | 2026-03-27 | Handoff system resiliente, branch protection gate, `/devflow-sync` para manter `.context/` atualizado |
| **0.2.0** | 2026-03-26 | 11 bridge skills, skills map unificado, project-init com scaffolding `.context/`, auto version bump |
| **0.1.0** | 2026-03-25 | Release inicial: workflow PREVC, 15 agentes, skills base, hooks SessionStart/PreCompact/PostCompact, git-strategy |

---

## Estrutura do Plugin

```
devflow/
├── commands/         # /devflow, /devflow-sync, /devflow-status, /devflow-next, /devflow-dispatch
├── skills/           # 25+ skills (PREVC, bridge, on-demand, PRD, autonomous-loop)
├── agents/           # 15 playbooks de agentes
├── templates/        # Templates para scaffolding (stories-schema.yaml)
├── scripts/          # devflow-runner.mjs, runner-lib.mjs (safety net)
├── hooks/            # SessionStart, PreCompact, PostCompact, PreToolUse, PostToolUse, i18n
├── locales/          # Traduções (en-US, pt-BR, es-ES)
├── references/       # Mapa de skills + mapeamento de ferramentas por plataforma
├── tests/            # 208 testes (unit, E2E, validação estrutural)
├── .claude-plugin/   # Manifesto do plugin para Claude Code
└── .cursor-plugin/   # Manifesto do plugin para Cursor
```

---

## Licença

MIT — [NEXUZ-SYS/devflow](https://github.com/NEXUZ-SYS/devflow)

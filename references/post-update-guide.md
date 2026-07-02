# Post-Update Configuration Guide

Este arquivo lista features do DevFlow que requerem configuração do usuário após update.
Usado por `/devflow update` (Step 6) para mostrar próximos passos acionáveis.

Cada feature tem: lógica de detecção, comando de ativação e verificação.

---

## MemPalace — Memória Persistente

**O que é:** Sistema de memória persistente entre sessões via MCP. Armazena diários de agentes, decisões e contexto que sobrevive entre conversas.

**Detecção:** Verificar se `mempalace` existe em `.mcp.json` (projeto ou `~/.config/claude/mcp.json`)
```bash
grep -q "mempalace" .mcp.json 2>/dev/null || grep -q "mempalace" ~/.config/claude/mcp.json 2>/dev/null
```

**Se NÃO configurado:**
1. Instalar (canônico — pacote Python via pipx): `pipx install mempalace`
   - Fallback sem pipx: `pip install --user mempalace`
   - **Não use `npm`** — o pacote npm antigo (`@mempalace/cli`, `mempalace`) está obsoleto e desatualizado.
2. Adicionar ao `.mcp.json` (console script canônico — **não** use `python -m mempalace.mcp_server`):
   ```json
   "mempalace": {
     "command": "mempalace-mcp",
     "args": []
   }
   ```
   Alternativa via CLI: `claude mcp add mempalace -- mempalace-mcp`
3. Inicializar o palace: `mempalace init <project-root>`
4. Ativar conteúdo (via comandos DevFlow): `/devflow:devflow-memory mine` (projeto) e `/devflow:devflow-memory mine --convos` (sessões do Claude Code). Carregar contexto com `/devflow:devflow-memory wake-up`.
5. (Opcional) Auto-mine contínuo: `/devflow:devflow-memory install-hook` instala o git hook `post-merge` que minera a wing a cada merge/pull na branch protegida (background, fail-safe). Controlado por `mempalace.autoMine` no `.devflow.yaml`.
6. Reiniciar sessão do Claude Code

**Se configurado mas não customizado:**
- Editar `.context/.devflow.yaml` para personalizar:
  ```yaml
  mempalace:
    enabled: true
    autoMine: post-merge # auto-mine no git hook post-merge (off desativa)
    wing: auto          # auto = nome do repo como wing
    budget: 500         # max tokens injetados por sessão
    auto_diary: true    # escrever diário em handoffs de agentes
    auto_recall: true   # buscar memórias no início da sessão
  ```

**Verificação:** SessionStart hook mostra `mempalace: true` na detecção de modo.

---

## Context Doctor & Routines — Manutenção do contexto

**O que é:** `/devflow:devflow-doctor` diagnostica e repara a saúde do contexto (config de MCP, MCP desconectados, wings órfãs e drift do MemPalace). `/devflow:devflow-routines` agenda manutenção recorrente; o SessionStart sugere rodar quando vence.

**Detecção:** Verificar se `.context/routines.json` existe
```bash
test -f .context/routines.json
```

**Se NÃO configurado:**
1. Diagnóstico imediato: `/devflow:devflow-doctor`
2. Semear rotinas: rode `/devflow config` (cria `.context/routines.json` com a routine `context-maintenance` = doctor a cada 7d) — ou copie `templates/routines.json` para `.context/`.

**Verificação:** `/devflow:devflow-routines list` mostra `context-maintenance`; o SessionStart sugere quando vencida.

---

## dotcontext MCP (Full Mode)

**O que é:** Habilita agent orchestration, workflow PREVC, análise semântica e sync multi-ferramenta.

**Detecção:** Verificar se `dotcontext` existe em `.mcp.json`
```bash
grep -q "dotcontext" .mcp.json 2>/dev/null
```

**Se NÃO configurado:**
1. Instalar CLI: `npm install -g @dotcontext/cli`
2. Instalar MCP: `dotcontext mcp:install claude --local`
3. Reiniciar sessão do Claude Code

**Verificação:** SessionStart mostra `DevFlow Mode: full`

---

## Napkin Runbook

**O que é:** Arquivo de referência rápida para erros recorrentes, guardrails de domínio e notas por agente. Auto-curado, máx 15 itens por categoria.

**Detecção:** Verificar se `.context/napkin.md` existe
```bash
test -f .context/napkin.md
```

**Se NÃO configurado:**
- Criado automaticamente na primeira sessão se `.context/` existir
- Ou executar `/devflow init` para scaffoldar tudo

**Verificação:** Arquivo existe em `.context/napkin.md`

---

## Configuração de Idioma

**O que é:** Mensagens localizadas em hooks, prompts de commit e workflows de finalização de branch.

**Detecção:** Verificar se `.devflow-language` existe
```bash
test -f .devflow-language || test -f ~/.devflow-language
```

**Se NÃO configurado:**
- Executar `/devflow language` para definir idioma preferido
- Disponíveis: `pt-BR`, `en-US`, `es-ES`

**Verificação:** SessionStart mostra `DevFlow Language: <código>`

---

## Git Strategy (Proteção de Branch)

**O que é:** Proteção automática de branch que bloqueia edições diretas em main/master e cria branches de trabalho.

**Detecção:** Verificar se `.context/.devflow.yaml` tem git strategy configurado
(schema aninhado: chave `strategy:` indentada sob `git:` — não uma chave achatada no topo)
```bash
grep -qE '^[[:space:]]+strategy:[[:space:]]*[^[:space:]]' .context/.devflow.yaml 2>/dev/null
```

**Se NÃO configurado:**
- Executar `/devflow config` para definir sua estratégia git
- Ou DevFlow vai perguntar automaticamente na primeira tentativa de edição

**Verificação:** Hook pre-tool-use bloqueia edições em branches protegidas.

---

## Workflows Autônomos (stories.yaml)

**O que é:** Execução autônoma multi-story com níveis de autonomia configuráveis (supervised, assisted, autonomous).

**Detecção:** Verificar se `.context/workflow/stories.yaml` existe
```bash
test -f .context/workflow/stories.yaml
```

**Se NÃO configurado:**
- Usar `/devflow scale:LARGE <descrição>` para criar workflow com stories
- Ou executar `/devflow prd` primeiro para gerar um PRD, depois decompor em stories

**Verificação:** SessionStart mostra seção `AUTONOMOUS WORKFLOW ACTIVE`.

---

## Standards Default de Engenharia

**O que é:** ~20 standards default de engenharia (concern-first) shippados pelo plugin — sempre disponíveis, filtrados por `applyTo`/task. Não precisam ser scaffoldados. **Desde a 1.10.0 (ADR-007 v2.0.0):** 4 deles trazem **linter bundlado** e são **enforçados nativamente, sem eject** — `security` (dangerouslySetInnerHTML), `error-handling` (catch vazio), `test-discipline` (it.only/skip), `secret-conventions` (chaves hard-coded). Os demais seguem warn-only.

**Detecção:** Verificar se o projeto já tem standards próprios (overrides/ejects)
```bash
ls .context/engineering/standards/std-*.md >/dev/null 2>&1
```

**Se NÃO configurado (sem overrides do projeto):**
- Os defaults já estão ativos via plugin — aparecem no índice do SessionStart marcados `[default]` e são injetados por relevância de task. Os 4 enforçados rodam o linter no PostToolUse automaticamente.
- Para customizar um default: `/devflow standards eject <id>` (copia para `.context/engineering/standards/`; o linter é **anulado** na cópia). Use `/devflow standards eject <id> --with-linter` para trazer/criar também o linter no `machine/` do projeto.
- Para desligar um default: adicione `disable: [std-<id>]` em `.context/standards.local.yaml`.
- (Opcional) Manutenção ao vivo: `/devflow update` (Step 4d) refresca os defaults via fetch do repo standalone.

**Verificação:** SessionStart lista os standards default `[default]` no índice de contexto.

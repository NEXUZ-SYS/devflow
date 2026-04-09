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
1. Instalar: `npm install -g @anthropic/mempalace-mcp`
2. Adicionar ao `.mcp.json`:
   ```json
   "mempalace": {
     "command": "mempalace-mcp",
     "args": ["--palace", "~/.mempalace/palace"]
   }
   ```
3. Reiniciar sessão do Claude Code

**Se configurado mas não customizado:**
- Editar `.context/.devflow.yaml` para personalizar:
  ```yaml
  mempalace:
    enabled: true
    wing: auto          # auto = nome do repo como wing
    budget: 500         # max tokens injetados por sessão
    auto_diary: true    # escrever diário em handoffs de agentes
    auto_recall: true   # buscar memórias no início da sessão
  ```

**Verificação:** SessionStart hook mostra `mempalace: true` na detecção de modo.

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
```bash
grep -q "gitStrategy:" .context/.devflow.yaml 2>/dev/null
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

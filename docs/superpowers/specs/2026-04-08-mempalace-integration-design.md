# MemPalace Integration — Design Spec

**Data:** 2026-04-08
**Status:** Aprovado
**Scale:** MEDIUM (P → R → E → V → C)
**Workflow:** mempalace-integration

## Resumo

Integrar o [MemPalace](https://github.com/milla-jovovich/mempalace) como módulo opcional no DevFlow para memória semântica persistente entre sessões. A integração segue o padrão hybrid MCP-first: operações ricas via MCP server, detecção e injeção de contexto via hooks bash, degradação graceful quando indisponível.

## Decisões-Chave

| Decisão | Escolha | Alternativas descartadas |
|---------|---------|--------------------------|
| Acoplamento | Hybrid (MCP + hooks bash) | Tight integration (Python dep), Loose coupling (só MCP) |
| Escopo de memória | Agent diaries + decisões PREVC | Apenas decisões, Conversas completas |
| Retrieval | Híbrido com budget (auto 500 tokens + skill on-demand) | Só automático, Só on-demand |
| Organização do Palace | Configurável via .devflow.yaml (default: global com wings) | Um palace por projeto, Apenas global |
| Implementação | MCP-First (sem CLI fallback) | CLI wrapper, Dual-mode |

## 1. Mode Detection

### Detecção no session-start

O hook `session-start` ganha detecção de MemPalace MCP como capability flag adicional:

```bash
# Check mempalace MCP: look for mempalace in .mcp.json or global mcp config
if [ -f "${project_root}/.mcp.json" ] && grep -q "mempalace" "${project_root}/.mcp.json" 2>/dev/null; then
  mempalace_available="true"
elif [ -f "${HOME}/.config/claude/mcp.json" ] && grep -q "mempalace" "${HOME}/.config/claude/mcp.json" 2>/dev/null; then
  mempalace_available="true"
fi
```

### Output no contexto de sessão

```
**DevFlow Mode: full**
- superpowers: true
- dotcontext MCP: true
- mempalace: true          ← novo
```

Não cria um modo "Full+" separado — é uma capability flag dentro do modo existente (como `superpowers_available`).

## 2. Configuração

### `.devflow.yaml` — Nova seção

```yaml
mempalace:
  enabled: true                     # default: true se MCP detectado
  palace: ~/.mempalace/palace       # default: global palace
  wing: auto                        # auto = nome do repo como wing
  budget: 500                       # max tokens injetados nos hooks
  auto_diary: true                  # gravar diary em hand-offs
  auto_recall: true                 # buscar memórias no session-start/post-compact
```

### Defaults

Se MemPalace MCP está disponível e nada foi configurado: `palace=~/.mempalace/palace`, `wing=<repo-name>`, `budget=500`, `auto_diary=true`, `auto_recall=true`.

### Integração com `/devflow init`

O `project-init` ganha um passo condicional na entrevista:

```
Se mempalace MCP detectado:
  "MemPalace detectado. Habilitar integração de memória? (Y/n)"
  → Palace path? (~/.mempalace/palace)
  → Wing name? (auto = repo name)
  → Token budget para auto-recall? (500)

Se mempalace MCP NÃO detectado:
  "MemPalace não detectado. Deseja configurar? (s/n)"
  → Se sim:
    - Verifica se mempalace está instalado (pip show mempalace)
    - Se não instalado: executa instalação (pipx preferencial, fallback pip)
    - Configura MCP: adiciona entry no .mcp.json automaticamente
    - Segue para config (palace path, wing, budget)
  → Se não: segue sem mempalace (mempalace.enabled: false)
```

### Integração com `devflow:config`

O skill `devflow:config` que já gera o `.devflow.yaml` ganha as perguntas de MemPalace.

## 3. Hooks — Pontos de integração

### session-start (READ)

Após detectar mempalace MCP:
1. Busca memórias relevantes (baseado em branch + workflow ativo)
2. Limita ao budget configurado (default 500 tokens — contagem aproximada via `wc -w` no bash, ~0.75 tokens/word)
3. Injeta bloco `<MEMPALACE_CONTEXT>` no `additionalContext` (mesmo padrão do `<NAPKIN_RUNBOOK>` e `<DEVFLOW_CONTEXT>`)

### post-compact (READ)

Mesmo que session-start:
1. Busca memórias relevantes para rehydration
2. Injeta no bloco de rehydration junto com checkpoint + napkin

### pre-compact (WRITE)

Antes de compactar:
1. Grava agent diaries pendentes (se `auto_diary=true`)
2. Grava decisões-chave do workflow ativo
3. Usa wing/room do projeto configurado

### post-tool-use (WRITE)

Matcher: `workflow-manage` (hand-off entre agents)
1. Detecta hand-off de agent
2. Grava diary entry no palace com agent, decisões, artefatos, e destino do hand-off
3. Room = fase PREVC atual

O `pre-tool-use` não precisa de integração — só valida git strategy.

## 4. Skill `devflow:memory-recall`

### Trigger

- "o que decidimos sobre X?"
- "qual foi o raciocínio do architect na última sessão?"
- "buscar memórias sobre auth"

### Comportamento

1. Recebe query do usuário (texto livre)
2. Chama MemPalace MCP search (sem limite de budget)
3. Filtra por wing do projeto atual (default)
   - Flag `--global` para buscar cross-projeto
4. Apresenta resultados agrupados:
   - Agent diaries (quem disse o quê)
   - Decisões PREVC (specs, reviews, validações)
   - Timeline (ordem cronológica)
5. Permite refinar: "mais sobre isso", "filtra por fase R"

### Pré-requisito

- mempalace MCP disponível
- Se não disponível: mensagem clara + instrução de setup

## 5. Agent Diaries

### Estrutura no Palace

```
Wing: <repo-name>
Room: <prevc-phase> (planning, review, execution, validation, confirmation)
Hall: agent-diaries
```

### Conteúdo do diary entry

```
- agent: architect
- workflow: mempalace-integration
- phase: P (Planning)
- timestamp: 2026-04-08T14:30:00Z
- summary: "Definiu arquitetura hybrid MCP-first para integração..."
- decisions:
  - "MCP-first sem fallback CLI"
  - "Budget de 500 tokens para auto-recall"
- artifacts: ["docs/superpowers/specs/2026-04-08-mempalace-design.md"]
- handoff_to: code-reviewer
```

O diary é texto livre armazenado verbatim no MemPalace (modo raw). O DevFlow monta o texto a partir dos artefatos do hand-off do `workflow-manage`.

Sem schema rígido — o search semântico encontra pelo conteúdo. Wing/room/hall é organização para facilitar filtros.

## 6. Degradação Graceful

### mempalace MCP disponível

- ✓ Auto-recall no session-start e post-compact
- ✓ Agent diaries gravados no post-tool-use
- ✓ Diary entries no pre-compact
- ✓ Skill memory-recall funcional
- ✓ Config mempalace: no .devflow.yaml

### mempalace MCP NÃO disponível

- Hooks ignoram blocos de mempalace (sem erro, sem warning)
- Skill memory-recall retorna: "MemPalace não configurado. Rode /devflow init para configurar."
- Nenhum outro skill ou fase é afetado
- Zero impacto no fluxo PREVC existente

Camada 100% aditiva — como ter dotcontext ou não ter.

## Arquivos a criar/modificar

### Novos

| Arquivo | Descrição |
|---------|-----------|
| `skills/memory-recall/SKILL.md` | Skill de busca on-demand no MemPalace |
| `commands/devflow-recall.md` | Comando `/devflow-recall <query>` |
| `agents/memory-specialist.md` | Agent playbook para operações de memória |

### Modificados

| Arquivo | Mudança |
|---------|---------|
| `hooks/session-start` | Detecção mempalace MCP + injeção `<MEMPALACE_CONTEXT>` |
| `hooks/post-compact` | Busca memórias para rehydration |
| `hooks/pre-compact` | Gravação de diaries pendentes e decisões |
| `hooks/post-tool-use` | Detecção de hand-off + gravação de diary |
| `skills/project-init/SKILL.md` | Passo de MemPalace na entrevista do init |
| `skills/config/SKILL.md` | Perguntas de MemPalace na config |
| `skills/using-devflow/SKILL.md` | Referência ao memory-recall na tabela de skills |
| `commands/devflow.md` | Referência ao /devflow-recall no help |
| `.context/.devflow.yaml` | Seção mempalace: (template) |
| `references/skills-map.md` | Nova entrada memory-recall |
| `templates/devflow-yaml/scaffold.yaml` | Seção mempalace: no template |

## Fora de escopo

- Mining de conversas passadas (feature futura — requer export de histórico)
- UI/dashboard para explorar o palace (responsabilidade do MemPalace, não do DevFlow)
- Substituir napkin ou checkpoint (complementares, não substitutos)
- Substituir auto memory do Claude Code (mais leve para preferências rápidas)

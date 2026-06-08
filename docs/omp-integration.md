# Integração DevFlow ↔ omp (oh-my-pi)

Este documento descreve como rodar o DevFlow sob o **omp** (oh-my-pi), o runtime
alternativo ao Claude Code. A integração reaproveita os hooks bash existentes
(wrap & reuse) e adiciona uma camada de extensão nativa do omp para tool-gating,
compactação e injeção de contexto dinâmico.

> **Nota de segurança:** a extensão (`omp/extension.mjs`) roda no **TCB do plugin**
> (Trusted Computing Base), **não-sandboxed**. Ela tem acesso total ao processo do
> omp. Trate qualquer alteração nessa camada com o mesmo rigor de código privilegiado.

---

## Instalação

1. No omp, adicione o marketplace do DevFlow:

   ```
   /marketplace add NEXUZ-SYS/devflow
   ```

2. Inicialize o DevFlow no projeto com `/devflow init`. No **Step 0.5** o init
   detecta o `runtime` ativo (via `detect-runtime`) e ativa os runtimes/hooks
   apropriados para o omp.

3. A descoberta da extensão é declarada no `package.json` da raiz do DevFlow:

   ```json
   { "private": true, "omp": { "extensions": ["./omp/extension.mjs"] } }
   ```

   A fonte de verdade da **versão** continua sendo o `plugin.json` — o
   `package.json` é apenas o manifesto de descoberta da extensão (não publicado
   no npm).

### Pré-requisitos

Os hooks dependem do ambiente de shell. Garanta que estejam no `PATH`:

- `bash`
- `node`
- **`python3`** — vários hooks (standards, knowledge, napkin, routines) executam
  scripts Python.

Se algum pré-requisito faltar, o launcher / a extensão **avisa** na inicialização
(probe de dependências) em vez de falhar silenciosamente.

---

## Como usar: `devflow omp`

Lance a sessão pelo launcher **`devflow omp`** (`node scripts/omp-launch.mjs`, ou
o alias equivalente). **Não** invoque o `omp` diretamente — use sempre o launcher.

**Por quê:** no omp a **autoridade do contexto é posicional**. Conteúdo injetado
tardiamente (durante a sessão) tem autoridade parcial. O launcher resolve isso
injetando o contexto autoritativo do DevFlow **via system prompt**, desde o
turno 1:

- `--system-prompt "<prompt mínimo>"` — base enxuta.
- `--append-system-prompt "<contexto session-start>"` — o índice de contexto do
  DevFlow (standards, ADRs, knowledge, etc.) como instrução autoritativa.
- `-e omp/extension.mjs` — carrega a extensão para tool-gating, compact e contexto
  dinâmico durante a sessão.

Assim o agente já nasce com as regras do projeto em vigor, sem depender de
injeção tardia.

---

## Cobertura por subsistema no omp

A extensão usa o canal de eventos do omp (`context`, `session_before_compact`,
`session_compact`, `tool_call`, `tool_result`) e faz **wrap & reuse** dos hooks
bash. A tabela abaixo mapeia cada subsistema do DevFlow ao seu modo e mecanismo:

| Subsistema | Modo | Mecanismo no omp |
|---|---|---|
| **standards** | Full | Índice injetado no session_start (system prompt) + linter rodando no `tool_result` (pós-edição) |
| **ADR** | Full | Guardrails de arquitetura no session_start + handoff guard nas transições de fase |
| **knowledge** / produto | Full | Índice no session_start + carregamento on-demand por layer/keyword |
| **napkin** | Full | Runbook injetado no session_start + curate no `session_before_compact` + re-injeção no `session_compact` |
| **routines** | Full | Rotinas agendadas via wrap dos hooks de manutenção |
| **MemPalace** | Full | MCP nativo do omp + `recall` (busca de memórias) + `compact` (consolidação no ciclo de compactação) |
| **permissions.yaml** | Full | Tool-gating no `tool_call` (`checkPermission`) — 4 categorias: allow / deny / prompt / git-guard |

Modos: **Full** = paridade com o Claude Code; **Lite** = subconjunto degradado
quando algum pré-requisito não está disponível.

### Tool-gating e git-guard

No evento `tool_call`, a extensão consulta `.context/permissions.yaml`:

- `deny` → bloqueia a tool com motivo.
- `prompt` → pede confirmação interativa ao usuário (`ctx.ui.confirm`).
- `git-guard` → protege operações git destrutivas (push/merge/branch em main, etc.).
- `allow` → passa direto para o hook `pre-tool-use`.

---

## Subagents

O dispatch de subagents usa o **task tool** nativo do omp:

- Cada subagent roda em **worktree** isolado (paridade com o isolamento do
  Claude Code).
- O retorno segue um **output schema** estruturado (review-verdict,
  validation-verdict, etc.).
- O **model role** por fase é selecionado conforme `omp/omp-roles.yaml`:
  - Planning (brainstorming / writing-plans) → `pi/plan`
  - Review profundo (architect / security) → `pi/slow`
  - Execução TDD → `default`; fan-out de subagents → `pi/smol`
  - Confirmation (commit / docs) → `commit`

No Claude Code esse mapeamento de roles é **inerte** (o CC não tem model roles
posicionais) — as seções correspondentes nos skills de fase só têm efeito sob omp.

---

## Limitações conhecidas / fora de escopo

Itens deixados para uma fase C futura (não implementados nesta integração):

- **Loop PREVC em TypeScript** — o orquestrador PREVC continua dirigido pelos
  skills/hooks; não há reimplementação nativa em TS.
- **Telemetria** — sem coleta de métricas de execução no omp.
- **TUI** — sem interface de terminal dedicada.
- **Contexto intra-sessão tem autoridade parcial** — o contexto dinâmico injetado
  durante a sessão (via evento `context`) **não** tem a mesma autoridade do
  system prompt. Por isso o contexto autoritativo é entregue pelo launcher
  (`devflow omp`) no turno 1, e o evento `context` cobre apenas o reforço dinâmico.

---
type: spec
name: devflow-trace-design
description: Design do conceito Trace — camada opt-in de captura estruturada de sessões DevFlow (execução + observabilidade) via hooks Bash e NDJSON
generated: 2026-04-15
status: draft
scale: MEDIUM
autonomy: supervised
phase: P
---

# DevFlow Trace — Design

> **Nota de nomenclatura:** este conceito foi originalmente proposto como "harness". Foi renomeado para **trace** para evitar colisão com o termo industry-standard ("agent harness" = runtime que hospeda um agente, ex: OpenHarness, Claude Code), alinhando com vocabulário de observability (OpenTelemetry, traces estruturados).

## 1. Propósito

**Trace** é uma camada **opt-in** de captura estruturada de sessões DevFlow. Quando ativa, grava em `.context/trace/sessions/<id>/` tudo que aconteceu durante uma sessão Claude Code rodando DevFlow — eventos de hooks, dispatches de agentes, artefatos gerados — habilitando auditoria, debug e inspeção posterior.

Combina dois propósitos:
- **Execução padronizada** (A): sessão vira unidade reproduzível com manifest, I/O capturado e artefatos isolados.
- **Observabilidade** (C1): telemetria estruturada sobre skills, hooks, tools e dispatches de agentes para análise.

### O que NÃO é (guardrails YAGNI)

- Não é runtime — permanece Bash + NDJSON, zero dependência Node/Python.
- Não é substituto do MemPalace — memória semântica de longo prazo é outro eixo; trace é operacional/efêmero.
- Não é observability de produção — é ferramenta de dev/debug com retenção curta.
- v1 não faz replay executável — só inspeção. Replay é extensão futura.
- v1 não instrumenta o interior de subagentes (C2) — só registra dispatch/return no processo pai.
- v1 não indexa em ChromaDB/vector DB — NDSJON basta. Sink opcional pro MemPalace fica como extensão futura.

## 2. Posicionamento no DevFlow

- **Hooks existentes** (`session-start`, `pre/post-tool-use`, `pre/post-compact`, `user-prompt-submit`, `stop`) ganham passo "se trace ativo, emit evento".
- **Comando novo** `/devflow-trace` com subcomandos (status/on/off/list/show/tail/grep/export/prune).
- **Skill nova** `devflow:trace-inspect` para o modelo consultar traces (ex: durante Validation para diagnosticar falha).
- **Config** em `.context/.devflow.yaml` sob bloco `trace:`.
- **Doc** nova em `.context/docs/trace.md`.

## 3. Decisões-chave (resumo)

| Dimensão | Decisão v1 |
|----------|-----------|
| Propósito | Execution + Observability (A+C1) |
| Ativação | opt-in, precedência `DEVFLOW_TRACE=1` > flag `--trace` > `trace.enabled` |
| Captura | Hooks Claude Code + evento derivado `agent_dispatch` quando `tool=Task` |
| Storage | NDJSON + `manifest.json` + `artifacts/` por sessão |
| Interface | CLI `/devflow-trace` + skill `devflow:trace-inspect` |
| Retenção | 7 dias / 50 sessões, configurável |
| Segurança | Redação regex (R4) + `.gitignore` automático |
| Runtime | Zero (Bash + `flock` + `jq` opcional) |
| Escopo excluído | C2 (trace interno de subagentes), ChromaDB, replay executável, sink MemPalace |

## 4. Princípios de design

1. **Fail-safe absoluto:** qualquer erro do trace nunca quebra a sessão do usuário. Funções internas rodam em subshell com trap de erro → gravam em `trace.err` e seguem.
2. **Append-only + atomic:** NDJSON com `flock -x` exclusivo por sessão; `seq` monotônico via counter file também com flock.
3. **Zero overhead quando desligado:** primeira coisa em cada hook é check de ativação; se off, `exit 0` imediato.
4. **Privado por default:** `.gitignore` automático em `.context/trace/` contendo `*\n!.gitignore`.
5. **Human-inspectable:** NDJSON + JSON abrem em qualquer editor; `tail -f`, `jq`, `grep` funcionam de cara.
6. **Ortogonal:** trace roda independente do modo DevFlow (Full/Lite/Minimal) e independente de MemPalace/dotcontext MCP.

## 5. Layout de diretórios

```
.context/trace/
├── sessions/
│   └── 2026-04-15T14-30-22_planning-auth/        ← <ISO>_<slug>
│       ├── manifest.json                          ← metadata da sessão
│       ├── trace.ndjson                           ← eventos append-only
│       ├── trace.seq                              ← counter (flock-protegido)
│       ├── trace.err                              ← erros internos do trace
│       └── artifacts/
│           ├── 001_spec.md
│           ├── 002_plan.md
│           └── 003_subagent_output_<tool_id>.txt
├── index.json                                     ← índice: id, início, status, task, scale
└── .gitignore                                     ← auto: "*\n!.gitignore"
```

Observação: o diretório legado `.context/harness/` (vazio, com `artifacts/`, `sessions/`, `traces/`) será removido na implementação — migração é trivial porque está vazio.

## 6. Modelo de dados

### 6.1 `manifest.json`

```json
{
  "session_id": "2026-04-15T14-30-22_planning-auth",
  "schema_version": 1,
  "started_at": "2026-04-15T14:30:22Z",
  "ended_at": "2026-04-15T14:52:10Z",
  "status": "active | completed | aborted | error",
  "trigger": "flag | env | config",
  "workflow": {
    "name": "auth-refactor",
    "scale": "MEDIUM",
    "autonomy": "supervised",
    "phase": "P"
  },
  "devflow_version": "0.10.8",
  "redaction": { "enabled": true, "rules_version": 1 },
  "counts": { "events": 142, "artifacts": 3, "errors": 0 },
  "host": { "os": "linux", "shell": "zsh" }
}
```

### 6.2 `trace.ndjson` — schema por linha

Campos obrigatórios em toda linha: `ts`, `seq`, `event`, `source`, `payload`.

Tipos de evento v1:

| event | source | payload (campos-chave) |
|-------|--------|------------------------|
| `session_start` | `hook:session-start` | `trigger`, `workflow` (se detectável), `cwd` |
| `session_end` | `hook:stop` | `status`, `duration_ms` |
| `session_aborted` | derivado (sintético) | `reason: "orphan_detected"`, `last_event_ts` |
| `user_prompt` | `hook:user-prompt-submit` | `text_hash`, `text_len`, `redacted_text` |
| `tool_pre` | `hook:pre-tool-use` | `tool`, `args` (redigidos) |
| `tool_post` | `hook:post-tool-use` | `tool`, `duration_ms`, `status`, `result_len` |
| `agent_dispatch` | derivado (quando `tool=Task`) | `subagent_type`, `prompt_hash`, `prompt_len`, `tool_id` |
| `agent_return` | derivado (quando `tool=Task`) | `tool_id`, `output_len`, `duration_ms` |
| `compact_start` | `hook:pre-compact` | `tokens_before` |
| `compact_end` | `hook:post-compact` | `tokens_after`, `reduction_pct` |
| `phase_transition` | `hook:phase-advance` (novo) | `from`, `to`, `gate_passed` |
| `workflow_event` | derivado (tool MCP dotcontext) | `action`, `args` |
| `redaction_error` | interno | `field`, `raw_size` |

**Payloads > 64 KB:** conteúdo é movido para `artifacts/NNN_<event>_<seq>.<ext>` e a linha vira `{"event":"...","payload":{"artifact_ref":"NNN_...","original_size":N}}`. Artefatos também passam por redação antes de gravar.

### 6.3 `index.json`

Reconstruível a partir dos manifests. Apenas acelera `list`/`show`/`prune`.

```json
{
  "sessions": [
    {
      "id": "2026-04-15T14-30-22_planning-auth",
      "started_at": "...",
      "ended_at": "...",
      "status": "completed",
      "task": "plan auth refactor",
      "scale": "MEDIUM"
    }
  ],
  "updated_at": "..."
}
```

## 7. Componentes

### 7.1 Biblioteca Bash — `hooks/_trace-lib.sh`

Funções expostas (todas fail-safe):

| Função | Responsabilidade |
|--------|------------------|
| `trace_active` | Resolve precedência env > flag > config; exporta `TRACE_SESSION_DIR` se ativo; retorna 0/1 |
| `trace_emit <json>` | Append atômico em `trace.ndjson` via `flock`; incrementa `trace.seq` |
| `trace_redact <text>` | Aplica regex de redação (R4) sobre string; substitui matches por hash truncado |
| `trace_artifact_write <event> <seq> <content>` | Grava artifact quando payload excede limite |
| `trace_fail_safe` | Trap ERR: escreve em `trace.err`, retorna 0, nunca propaga |
| `trace_orphan_sweep` | Em `session-start`: marca sessões `active` com >1h inatividade como `aborted` |
| `trace_prune` | Aplica retenção (days + max_sessions) |

### 7.2 Hooks modificados

Todos os hooks Bash existentes ganham o mesmo prelúdio:

```bash
#!/usr/bin/env bash
source "$DEVFLOW_PLUGIN_DIR/hooks/_trace-lib.sh"
trace_active || exit 0
trap trace_fail_safe ERR
# ... lógica do hook + trace_emit de eventos relevantes ...
```

| Hook | Eventos emitidos | Notas |
|------|------------------|-------|
| `session-start` | `session_start` (+ cria estrutura, sweeps órfãos) | Resolve ativação primeiro |
| `user-prompt-submit` | `user_prompt` | Redige texto antes de emitir |
| `pre-tool-use` | `tool_pre` + (se `tool=Task`) `agent_dispatch` | Args redigidos |
| `post-tool-use` | `tool_post` + (se `tool=Task`) `agent_return` | Correlaciona via `tool_id` |
| `pre-compact` / `post-compact` | `compact_start` / `compact_end` | Inclui contagem de tokens |
| `stop` (fim de sessão) | `session_end` + atualiza manifest + pruning best-effort | Fecha a sessão atual |
| `phase-advance` (novo, invocado por `devflow:devflow-next`) | `phase_transition` | Só grava se trace ativo |

### 7.3 CLI — `/devflow-trace`

Comando novo em `commands/devflow-trace.md` que invoca skill `devflow:trace-cli`.

| Subcomando | Ação |
|-----------|------|
| `status` | Ativo? sessão atual? config de retenção |
| `on` / `off` | Toggle em `.context/.devflow.yaml` (`trace.enabled`) |
| `list [--last N]` | Tabela de sessões via `index.json` |
| `show <id>` | `manifest.json` + sumário de counts por event type |
| `tail [<id>]` | `tail -f trace.ndjson` (sessão ativa por default) |
| `grep <pattern> [--session <id>]` | `jq`/`grep` sobre traces com filtros |
| `export <id> [<path>]` | `tar` da sessão → arquivo transportável |
| `prune [--dry-run]` | Aplica retenção, reporta removidos |

### 7.4 Skill — `devflow:trace-inspect`

SKILL.md autossuficiente. O modelo invoca quando:
- Usuário pergunta "o que aconteceu na última sessão?"
- `devflow:prevc-validation` precisa diagnosticar falha
- `devflow:systematic-debugging` quer histórico da sessão

Capacidades:
- Ler `index.json`, identificar sessões relevantes
- Ler `manifest.json`, sumarizar eventos
- Filtrar trace por event type, agente, tool
- Retornar conteúdo de artifacts referenciados
- Correlacionar `agent_dispatch` ↔ `agent_return`

### 7.5 Configuração — `.context/.devflow.yaml`

Bloco opcional:

```yaml
trace:
  enabled: false            # default — opt-in
  retention_days: 7
  max_sessions: 50
  redaction:
    enabled: true
    extra_patterns: []      # regex extras do projeto
  capture:
    prompts: true
    tool_args: true
    artifacts: true
  max_event_size_kb: 64
```

Precedência: `DEVFLOW_TRACE=1` env > flag CLI > `trace.enabled`.

### 7.6 Documentação

- `.context/docs/trace.md` — conceito, schemas, comandos, casos de uso
- README do plugin: seção curta com link
- `skills/trace-inspect/SKILL.md` — entry point para o modelo

## 8. Tratamento de erros e edge cases

### 8.1 Fail-safe absoluto
Qualquer exceção interna nunca interrompe a sessão. Funções rodam em subshell com redirect de stderr pra `trace.err`. Se `.context/trace/` não for gravável, trace auto-desliga pra essa sessão (flag in-memory) — sem re-tentativas por hook.

### 8.2 Concorrência
Hooks podem sobrepor (pre/post-tool-use aninhados). Proteções:
- `flock -x` no arquivo de trace antes de append
- `seq` via counter file também com flock
- Timeout de 200ms no flock → se não pegar, grava em `trace.pending/<pid>.ndjson` e merger ordenado em `session_end`

### 8.3 Sessões órfãs
`manifest.status=active` sem `session_end`. Detectadas no próximo `session-start`: se `updated_at > 1h`, marca como `aborted` e escreve `session_aborted` sintético.

### 8.4 Retenção
Executada best-effort em `session_end` e sob demanda via `prune`:
1. Remove sessões com `ended_at < now - retention_days`
2. Se sobram > `max_sessions`, remove as `completed/aborted` mais antigas (nunca `active`)
3. Atualiza `index.json`

### 8.5 Redação (R4)
Aplicada antes do append. Padrões default:
- `sk-[a-zA-Z0-9]{20,}`
- `ghp_[a-zA-Z0-9]{36}`
- `AKIA[0-9A-Z]{16}`
- `xox[baprs]-[a-zA-Z0-9-]+`
- `://[^:]+:[^@]+@`
- `Authorization:\s*\S+`
- Linhas `KEY=VALUE` onde KEY contém `TOKEN|SECRET|PASSWORD|KEY`

Matches substituídos por `<redacted:sha256:NNNN>` (hash truncado 16 chars) preservando correlação. Se regex falha, grava `{"redaction_error":true,"raw_size":N}` no lugar do campo.

### 8.6 Payloads gigantes
Acima de `max_event_size_kb` → conteúdo vai pra `artifacts/NNN_<event>_<seq>.<ext>`, linha referencia via `artifact_ref`. Artifact passa por redação antes da gravação.

### 8.7 Gitignore automático
`session-start` garante `.context/trace/.gitignore` com `*\n!.gitignore` antes de gravar. Se já existe com conteúdo diferente, respeita (não sobrescreve).

### 8.8 Coexistência com Full mode (dotcontext MCP)
Trace é ortogonal ao dotcontext — funciona mesmo sem MCP. Em Full mode, chamadas MCP aparecem como `tool=mcp__dotcontext__*` em `post-tool-use` e geram `workflow_event` derivado.

### 8.9 Schema migration
`manifest.schema_version: 1` no v1. CLI checa `schema_version`; se desconhecido, avisa "sessão de versão mais nova" e mostra cru. `prune` nunca remove por schema.

### 8.10 Falhas não-fatais conhecidas

| Situação | Comportamento |
|----------|---------------|
| `.context/trace/` sem write permission | Trace auto-off; warning único em stderr; sessão segue |
| `flock` indisponível | Fallback: mkdir-lock pattern |
| `jq` ausente | CLI `show`/`grep` mostram erro amigável; `tail`/`list` funcionam sem |
| Sessão com 0 eventos | `session_end` remove diretório (cleanup) |

## 9. Estratégia de testes

Stack: `bats-core` (Bash Automated Testing) + fixtures + sandbox via `mktemp -d`. CI adiciona job `bats tests/trace/`. **TDD obrigatório** — RED→GREEN→REFACTOR por unidade.

### 9.1 Unit (`_trace-lib.sh`)

| Alvo | Asserts |
|------|---------|
| `trace_active` | env > flag > config em 8 combinações |
| `trace_redact` | Redige todos patterns default; preserva texto limpo; hash reproduzível |
| `trace_emit` | Append ordenado via flock; seq monotônico; NDJSON válido (`jq -e`) |
| `trace_fail_safe` | Exception não propaga; grava em `trace.err`; hook retorna 0 |
| Payload > 64 KB | Move para artifact; linha referencia via `artifact_ref` |
| `trace_prune` | Remove por days + max_sessions; preserva `active` |
| `trace_orphan_sweep` | Marca órfãos; emite `session_aborted` |

### 9.2 Integration (hooks em sandbox)

| Hook | Cenário |
|------|---------|
| `session-start` | Cria manifest+trace+gitignore; detecta órfãos; respeita ativação off |
| `pre-tool-use` com `tool=Task` | Emite `tool_pre` e `agent_dispatch` correlatos |
| `post-tool-use` com `tool=Task` | Correlaciona via `tool_id`; grava duration_ms |
| `pre/post-compact` | Tokens before/after |
| Concorrência | 10 hooks paralelos → 10 linhas, seq 1..10, sem gaps/duplicatas |
| Trace off | Cada hook: `exit 0` em <5ms, nada gravado |

### 9.3 E2E (sessão sintética completa)

| Cenário | Asserção |
|---------|----------|
| Sessão feliz | Manifest completo; trace ordenado; `agent_dispatch`/`agent_return` correlatos |
| Sessão abortada | Próximo `session-start` marca `aborted` + emite `session_aborted` |
| Retenção | 60 antigas + 5 novas → prune mantém 50 mais recentes |
| Export | `tar` contém manifest+trace+artifacts; extrair → estrutura idêntica |
| Redação E2E | Prompt com `sk-abc...` e `Authorization: Bearer xyz` → trace não contém originais; contém hashes |
| Git safety | `git status` após sessão não mostra arquivos do trace |

### 9.4 CLI (`/devflow-trace`)

Cada subcomando com: fixtures → output esperado por snapshot; exit codes corretos; flags inválidas → erro amigável. Graceful fallback sem `jq` onde aplicável.

### 9.5 Skill — `devflow:trace-inspect`

- Validação Markdown (checklist, sub-skill refs)
- Teste funcional: fixture de sessão → skill produz sumário estruturado (manual no v1)

### 9.6 Não-objetivos de teste v1 (YAGNI)

- Perf benchmarks (documentados informalmente em `trace.md`)
- Sink MemPalace / ChromaDB
- Windows cross-platform

### 9.7 Critérios de cobertura (gate de Validation)

- 100% das funções de `_trace-lib.sh` com unit test
- Todo hook modificado com ≥1 integration test
- Todo subcomando de CLI com ≥1 teste
- ≥3 cenários E2E (feliz, abortado, retenção)
- Zero regressão: suite de content-checks existente continua passando

## 10. Impacto e compatibilidade

- **Zero breaking change:** trace é opt-in e default off. Sessões existentes continuam idênticas.
- **Dependências novas:** `bats-core` em dev-deps (testes). `flock` e `jq` são recomendados mas graceful degradation existe.
- **Arquivos criados:** `hooks/_trace-lib.sh`, `commands/devflow-trace.md`, `skills/trace-cli/SKILL.md`, `skills/trace-inspect/SKILL.md`, `.context/docs/trace.md`, `tests/trace/*`.
- **Arquivos modificados:** todos os hooks Bash existentes, templates de `.context/.devflow.yaml`, README.
- **Diretório legado removido:** `.context/harness/` (vazio, seguro).

## 11. Escopo explicitamente fora do v1

Os itens abaixo foram considerados e conscientemente deixados para versões futuras. A menção aqui serve de registro: cada um resolve um problema distinto do v1 e exigiria decisões arquiteturais adicionais.

### 11.1 C2 — trace interno de subagentes

**O que é:** capturar o que acontece **dentro** da execução de um agente despachado, não só o que entra e sai.

**Contraste com C1 (v1):** quando o modelo pai dispara um agente via `Task`, o v1 registra apenas a visão externa — prompt enviado, `subagent_type`, duração, output final. Tudo que o subagente fez durante aqueles N minutos (skills invocadas, tools chamadas, arquivos lidos, sub-sub-agentes disparados, tokens consumidos, retries) é invisível no trace — o subagente é uma blackbox.

**O que C2 capturaria:** árvore completa de eventos, com hierarquia e correlação. Analogia:
- **C1** = câmera externa filmando quem entra e sai da sala
- **C2** = câmera dentro da sala também, com todas as câmeras sincronizadas num único vídeo

Exemplo de trace enriquecido com C2:

```
seq=10     tool_pre    tool=Task  subagent_type=architect          depth=0
  seq=10.1 session_start  parent_seq=10                            depth=1
  seq=10.2 tool_pre    tool=Skill  args={skill:"context-awareness"} depth=1
  seq=10.3 tool_pre    tool=Grep   args={pattern:"..."}            depth=1
  seq=10.4 tool_pre    tool=Task   subagent_type=security-auditor  depth=1
    seq=10.4.1 session_start  parent_seq=10.4                      depth=2
    ...
  seq=10.5 session_end  parent_seq=10                              depth=1
seq=11     tool_post   tool=Task  duration_ms=180000                depth=0
```

**Implementação exigiria:**
1. Propagar `TRACE_SESSION_ID` (e opcionalmente `TRACE_PARENT_SEQ`) para o processo filho via env var ou arquivo de metadata
2. Hooks do filho detectarem contexto aninhado e gravarem no diretório de sessão do pai
3. Resolver race conditions em `trace.ndjson` compartilhado entre múltiplos processos — `flock` single-process do v1 não basta; pode exigir writer-por-processo com merge ordenado em `session_end`
4. Schema hierárquico: `seq` global vs. `seq` por nível + `parent_seq`, `depth`, `tool_id` como chave de correlação
5. Testar todas as combinações de invocação: agente standalone, dispatched pelo pai, nested (agente que chama agente), paralelo (vários agentes do mesmo pai)

**Por que ficou fora do v1:**
- Propagação cross-process é frágil — Claude Code herda env vars, mas nem sempre com o mesmo workspace/hooks config
- Race conditions reais em multi-processo exigem design mais cuidadoso que o `flock` single-writer do v1
- Merge de timeline entre processos concorrentes tem edge cases (relógio, ordenação causal, representação de paralelismo)
- Valor marginal antes de validar C1 — se 80% dos bugs de sessão forem visíveis pela câmera externa, C2 é over-engineering

Será reaberto quando houver sinal concreto de que a captura externa deixa perguntas importantes sem resposta.

### 11.2 Sink opcional para MemPalace

**"Sink"** em terminologia de observability = destino para onde eventos são enviados. Logs têm sinks (arquivo, Splunk, Datadog); traces têm sinks (Jaeger, Honeycomb). Um sink opcional = consumidor plugável do stream de eventos — o trace continua gravando em NDJSON local, e *opcionalmente* encaminha uma seleção de eventos para um destino extra.

**Por que MemPalace é candidato natural:** o DevFlow já integra dois sistemas de persistência com papéis distintos:

| Sistema | O que guarda | Prazo | Consulta via |
|---------|--------------|-------|--------------|
| **Trace** (v1) | Stream operacional de eventos da sessão (tool calls, dispatches, prompts) | Curto (7 dias, efêmero, ruído alto) | `/devflow-trace`, `trace-inspect` |
| **MemPalace** (já integrado) | Memórias semânticas curadas (decisões, aprendizados, diários de agentes) | Longo (permanente, sinal alto) | `/devflow-recall`, `devflow:memory-recall` |

Trace responde *"o que aconteceu minuto a minuto na sessão X?"*; MemPalace responde *"o que já aprendemos/decidimos sobre Y?"*. O sink MemPalace seria a ponte automática: enquanto o trace grava tudo, detecta eventos de alto valor semântico e os **promove** a MemPalace como memórias.

**Exemplos de promoção (candidatos a v2):**

| Evento no trace | Memória gerada no MemPalace |
|-----------------|----------------------------|
| `phase_transition` com `gate_passed=false` + razão | Memória `project`: "Gate de Review falhou no workflow X porque Y" |
| `agent_dispatch → agent_return` com escalation em cadeia | Memória `project`: "Agente Z escalonou em 2 tentativas consecutivas em contexto A" |
| `user_prompt` contendo correção forte ("não faça assim", "sempre faça assim") | Memória `feedback` |
| Decisão arquitetural registrada num plano | Memória `project` |
| Bug reproduzido + fix aplicado na mesma sessão | Memória `project` com contexto de resolução |

**Arquitetura proposta:**

```
Hook do Claude Code
       ↓
trace_emit(evento)
       ↓
trace.ndjson (storage primário — sempre grava)
       ↓
(se sink MemPalace ativo e evento match filtro)
       ↓
mempalace_promote(evento) → cria memória curada
```

Configuração:

```yaml
trace:
  sinks:
    mempalace:
      enabled: false
      promote:
        - escalations
        - user_feedback
        - gate_failures
```

**Por que é "opcional":**
- Trace funciona sem MemPalace instalado — zero dependência forte
- Usuário pode querer trace operacional sem poluir memória semântica
- Filtros de promoção mal calibrados geram ruído — começar desligado e ativar por categoria
- Facilita migração/experimentação sem alterar storage primário

**Por que ficou fora do v1:**
1. **Filtros de promoção exigem validação empírica** — sem dados reais de uso do trace, inventar regras agora é premature optimization
2. **Classificação "isso é feedback forte?" não é trivial** — provavelmente exige LLM judge ou convenção manual, não regex
3. **Integração exige mapear schema evento→memória, garantir idempotência** (não duplicar a cada sessão) e tratar retry/falha
4. **v1 já entrega valor sem sink** — `/devflow-trace` + skill `trace-inspect` respondem as perguntas operacionais; MemPalace continua populado via `auto memory` e `/devflow-recall` como hoje

Será reaberto quando: (a) o trace estiver em uso e surgir padrão claro de "isso aqui deveria virar memória permanente", ou (b) o `auto memory` atual deixar lacunas que o trace poderia preencher automaticamente.

### 11.3 ChromaDB / vector DB
Storage alternativo com busca semântica nativa. Analisado e rejeitado para v1: NDJSON + filesystem atendem 100% dos casos de uso v1 (trace operacional é timeseries estruturada, não busca por similaridade). Ver discussão detalhada no histórico de brainstorming; reabrir só se houver necessidade real não coberta por `grep`+`jq`.

### 11.4 Replay executável
**O que é:** pegar um trace gravado e **re-rodar** a sessão a partir dele, ao invés de apenas ler. Dois níveis possíveis:

- **Replay determinístico:** injetar os mesmos prompts e tool args na mesma ordem, comparar se tools retornam o mesmo. Usado para detectar regressões comportamentais (ex: skill X que antes gerava plano Y agora gera plano Z).
- **Replay com substituições:** re-executar a partir de um evento N com skills/agents atualizados, para responder "se eu tivesse a nova versão do `prevc-planning`, o que mudaria?".
- **Debug time-travel:** parar num evento específico, inspecionar estado, continuar manualmente.

**O que o v1 entrega em vez disso:** *replay passivo* via `/devflow-trace show/tail/grep` e skill `trace-inspect` — você lê os eventos gravados como se assistisse a uma gravação. Nada é re-executado.

**Por que está fora do v1:**
- Respostas de LLM não são determinísticas — replay fiel exigiria gravar também as respostas do modelo e re-executar contra mocks, o que muda fundamentalmente o modelo de gravação
- Exige um "motor de replay" capaz de alimentar o Claude Code com inputs gravados — não existe hoje nem é trivial construir
- Resolve um problema diferente (regression testing / reprodutibilidade científica) do problema v1 (entender o que aconteceu numa sessão)

Se/quando for necessário, entra como projeto separado construído em cima do mesmo storage NDJSON (schema do trace já é suficiente para alimentar um replay engine).

### 11.5 UI web / dashboard
Visualização em browser dos traces (timeline, filtros, correlação visual). CLI + skill + arquivos human-readable resolvem o caso de uso v1; dashboard é valor marginal até o volume de dados justificar.

### 11.6 Agregações cross-session
Views em `traces/` agregando múltiplas sessões (ex: "todas as falhas em `prevc-validation` nos últimos 30 dias"). Se surgir necessidade, é gerável sob demanda a partir dos NDJSON existentes — não precisa ser persistido no v1.

## 12. Referências

- `.context/plans/autonomous-loop.md` — fluxo de execução autônoma que se beneficia do trace
- `.context/plans/mempalace-integration.md` — camada de memória semântica (ortogonal ao trace)
- `.context/plans/adr-system.md` — sistema de decisões que o trace pode alimentar
- OpenTelemetry spec — inspiração para estrutura de eventos
- OpenHarness (HKUDS) — NÃO integrado; discussão de nomenclatura motivou renomear "harness" → "trace"

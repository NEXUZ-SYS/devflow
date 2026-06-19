# Design — Agent Orchestrator (AO) como 3ª pata do bridge DevFlow (execução paralela)

**Data:** 2026-06-19
**Status:** Design aprovado — pronto para plano de implementação
**Origem:** PoC de integração AO × DevFlow (2026-06-19) — veredito ADOTAR opção ① (DevFlow rodando dentro de cada worker do AO). Conecta com o brainstorm pausado `2026-06-13-prevc-parallel-execution-design.md` (pode aposentá-lo: adotar o AO em vez de construir paralelismo sobre o Workflow tool).

---

## 1. Motivação

O DevFlow hoje "bridges" **superpowers** (disciplina/TDD) + **dotcontext** (agentes/contexto). A execução é essencialmente **sequencial**: mesmo no modo autônomo, o `autonomous-loop` processa `stories.yaml` story-by-story.

O **Agent Orchestrator** (`@aoagents/ao`, MIT) orquestra **frotas de agentes paralelos**, cada um em git worktree+branch+PR isolado, com loop de reactions (CI/review) e dashboard. O PoC provou que o **DevFlow roda plenamente dentro de cada worker do AO** (PREVC + TDD RED→GREEN→REFACTOR) com os **guardrails de git preservados** — desde que o plugin esteja em `--scope user`.

Esta feature integra o AO como **3ª pata do bridge**: a camada de **execução paralela** da fase E do PREVC, configurável "para casos quando necessário".

## 2. Objetivos / Não-objetivos

**Objetivos:**
- Permitir, via entrevista do `/devflow config` (e reuso no `/devflow init`), declarar que o projeto pode usar o AO para execução paralela.
- Na fase E (Execução) autônoma, despachar stories independentes em paralelo via AO, preservando os gates de qualidade e os guardrails de git do DevFlow.
- Degradação graciosa: sem AO disponível, o fluxo cai no `autonomous-loop` sequencial atual.

**Não-objetivos (YAGNI / fora de escopo):**
- Substituir o `autonomous-loop` sequencial — ele permanece como caminho default e fallback.
- Ceder validação (V), confirmação (C) ou merge ao AO (auto-merge fica **OFF**).
- Suportar trackers além do GitHub nesta fase (Linear/GitLab ficam para depois).
- Paralelizar fases que não a E.

## 3. Arquitetura — cérebro + músculos

**DevFlow = cérebro** (planejamento, contexto, qualidade, integração). **AO = músculos** (execução paralela, lifecycle, reactions). Fronteira escolhida: **"A dentro de C"** — o DevFlow rege as ondas e só aciona o AO quando a escala/independência justifica e o AO está disponível.

```
DevFlow (cérebro)                          AO (músculos)
─────────────────                          ─────────────
P  Planning  ── decompõe em stories + DAG (depends_on)
R  Review    ── valida design / grafo de dependências
E  Execution ──→ por ONDA: ao batch-spawn ──→ N workers paralelos
                 (apenas stories prontas)      cada worker = DevFlow-mini (TDD)
                 ←── coleta PRs ←──────────────  worktree+branch+PR isolado
                                                 (reactions CI/review POR worker)
V  Validation ── gates GLOBAIS (testes, security, spec)
C  Confirm    ── ordem de merge respeitando o DAG — SEM auto-merge do AO
```

**Invariantes:**
- O AO nunca decide qualidade nem faz merge na branch protegida.
- O DevFlow nunca executa N stories em paralelo por conta própria — delega ao AO.
- Cada worker é um `claude` com o plugin DevFlow em `--scope user` rodando `/devflow scale:SMALL <story>`.

## 4. Configuração & entrevista

Nova seção no `.context/.devflow.yaml`. **Dona:** `/devflow config`. O `/devflow init` (Step 0.6) **reusa a mesma sub-rotina** — sem duplicar lógica.

```yaml
orchestrator:
  enabled: true            # o projeto pode usar o AO
  provider: ao             # @aoagents/ao
  mode: suggest            # auto | suggest   ← o gatilho (para desabilitar, use enabled: false)
  trigger:
    scales: [LARGE]              # escalas em que sequer considerar paralelizar
    minIndependentStories: 3     # só paraleliza se a próxima onda tiver ≥ N
  maxWaveWidth: 4                 # cap de paralelismo simultâneo (quota Max)
```

**Pré-condição (Step 0.6, já mergeado em v1.23.3):** só habilita se o plugin DevFlow+superpowers estiver em `--scope user` (workers do AO rodam em worktrees fora do projeto; project-scope não resolve lá). Sem isso → grava `enabled: false` e orienta a reinstalar no escopo user.

**Pergunta na entrevista (config):** "Usar o Agent Orchestrator para execução paralela?" → **Sugerir quando compensar (`mode: suggest`, default)** / **Automático (`mode: auto`)** / **Não usar (`enabled: false`)**. Se != "Não usar": validar escopo (Step 0.6) e, opcionalmente, ajustar `trigger`/`maxWaveWidth`.

**Patch incremental (config Step 5):** quando o `.devflow.yaml` já existe, a seção `orchestrator:` é adicionada/atualizada sem sobrescrever as demais.

## 5. Fluxo da fase E (modo autônomo)

1. DevFlow lê `orchestrator:`. Avalia a **heurística de ativação**: `scale ∈ trigger.scales` **E** a próxima onda tem ≥ `minIndependentStories` stories independentes **E** AO disponível (instalado + user-scope).
2. Se `enabled: false` → sequencial (só `--parallel` explícito aciona). Caso contrário, aplica o `mode`:
   - `suggest` (default) → **pergunta**: *"N stories independentes em <escala> — paralelizar via AO (N workers) ou rodar sequencial?"*.
   - `auto` → dispara sem perguntar.
3. Override por comando: `/devflow auto --parallel` / `--no-parallel` ganha do `.devflow.yaml`.
4. Por onda:
   a. DevFlow gera (se ausente) o `agent-orchestrator.yaml`: `permissions: permissionless`, **todas as reactions `auto: false`** (sem auto-merge), `agentRulesFile: .ao-rules`.
   b. DevFlow gera `.ao-rules`: guardrails de git (nunca push/merge na main, sem `--force`) + "conduza via `/devflow scale:SMALL`".
   c. `ao batch-spawn` das stories prontas da onda.
   d. DevFlow faz polling de `ao status`, mapeia worker→story, coleta os PRs conforme abrem.
5. **V global:** quando os PRs da onda chegam, o DevFlow roda os gates (testes, security, spec compliance). Reactions do AO tratam CI/review **por worker** dentro da onda.
6. **C global:** o DevFlow mergeia na **ordem do DAG** (dependências primeiro), respeitando o `autoFinish`. Nunca via auto-merge do AO.
7. **Fallback:** AO indisponível a qualquer momento → aviso + degrada para `autonomous-loop` sequencial.

## 6. Decisões finas

- **DAG de dependências:** `stories.yaml` ganha `depends_on: [story-id]`. As ondas são derivadas por ordenação topológica. **Pipeline > barreira:** uma story é liberada assim que **suas** dependências terminam (não espera a onda inteira) — maximiza wall-clock. `maxWaveWidth` limita quantos workers rodam simultaneamente.
- **Tracking canônico (duas dimensões, sem divergência):** o **ledger do DevFlow** (`stories.yaml` + estado PREVC) é a verdade do **progresso**; o **`ao status`** é a verdade do **estado runtime de cada worker**. O DevFlow faz polling do `ao status`, mapeia worker→story e reflete em `/devflow-status`. Cada sistema é dono de uma dimensão distinta.
- **Reactions:** reaproveitadas **dentro da onda** (CI falhou/review pediu mudança → reenvia ao worker). O V/C **global** permanece no DevFlow.

## 7. Escopo de mudança (componentes)

| Componente | Mudança |
|---|---|
| `skills/config` | nova pergunta + geração da seção `orchestrator:` + patch incremental (Step 5) |
| `skills/project-init` (Step 0.6) | estende de "validar escopo" para "validar + oferecer/configurar orchestrator" (chama a sub-rotina do config) |
| `skills/prevc-flow` + `skills/autonomous-loop` | heurística de ativação, despacho por ondas, polling, V/C global, fallback |
| `stories.yaml` (schema/gerador) | campo `depends_on` |
| lib nova (`scripts/lib/orchestrator-waves.mjs`) | ordenação topológica + cálculo de ondas (pipeline) + cap de largura |
| templates gerados | `.ao-rules` + `agent-orchestrator.yaml` (permissionless, auto-merge OFF) |
| `docs/ao-integration.md` | guia de integração (análogo a `omp-integration.md`) |
| `commands/devflow.md` | flags `--parallel`/`--no-parallel`; menção ao orquestrador no help |

## 8. Estratégia de testes (TDD)

- **Lib de ondas** (`orchestrator-waves.mjs`): testes unitários determinísticos — DAG simples, com dependências, ciclos (erro), cap de largura, pipeline (liberação incremental). Sem rede.
- **Heurística de ativação:** testes unitários da função de decisão (escala × nº stories × disponibilidade × mode).
- **Geração de config/templates:** snapshot do `.devflow.yaml` (seção `orchestrator:`), `.ao-rules`, `agent-orchestrator.yaml` (assert: `auto: false`, permissionless).
- **TDD-for-docs:** Steps das skills (config/init/prevc) verificados conforme `devflow:skill-creation`.
- **E2E (manual/runbook):** repro do PoC — sandbox descartável, `--scope user`, despacho de 1 onda, verificação de guardrails (main intocada, sem auto-merge). **Nunca** mutar dirs versionados; sandbox em cópia descartável.

## 9. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Custo de quota (N workers Opus simultâneos) | `maxWaveWidth` + `mode: suggest` (confirmação antes de disparar) |
| Acoplamento ao AO (0.9.x, evolui rápido) | fallback nativo para sequencial; AO isolado atrás de uma fronteira fina |
| Worker permissionless tocar a main | `.ao-rules` + auto-merge OFF + (em produção) branch protection; validado no PoC |
| Conflito de merge entre PRs da onda | ordem de merge pelo DAG; ondas pequenas; V global antes do merge |
| Plugin em project-scope (workers não veem DevFlow) | Step 0.6 como pré-condição bloqueante |

## 10. Referências

- Memória: `project_ao_orchestrator_integration` (PoC, veredito, requisito user-scope).
- PR #52 (v1.23.3): Step 0.6 — validação de escopo do plugin para AO.
- Brainstorm pausado: `docs/superpowers/specs/2026-06-13-prevc-parallel-execution-design.md` (candidato a ser aposentado por esta abordagem).

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
- Ceder a **decisão de merge** ou a **síntese do veredito** ao AO — o merge final é sempre do DevFlow/humano (`approved-and-green.auto: false`). **Nuance:** as *reactions* do AO (auto-fix de CI/review) SÃO usadas como **loop de feedback em V e C** (ver §3 e §6); o que nunca é cedido é a decisão de merge.
- Suportar trackers além do GitHub nesta fase (Linear/GitLab ficam para depois).
- Paralelizar fases que não a E.

## 3. Arquitetura — cérebro + músculos

**DevFlow = cérebro** (planejamento, contexto, qualidade, integração). **AO = músculos** (execução paralela, lifecycle, reactions). Fronteira escolhida: **"A dentro de C"** — o DevFlow rege as ondas e só aciona o AO quando a escala/independência justifica e o AO está disponível.

O AO traz **duas capacidades distintas, aplicadas a fases diferentes**: **paralelismo** (N workers simultâneos → fase **E**) e **reactions** (loop de auto-fix de CI/review → fases **V** e **C**). Em ambas, a **síntese do veredito** (V) e a **decisão de merge** (C) permanecem no DevFlow.

```
DevFlow (cérebro)                          AO (músculos)
─────────────────                          ─────────────
P  Planning  ── decompõe em stories + DAG (depends_on)
R  Review    ── valida design / grafo de dependências
E  Execution ──→ por ONDA: ao batch-spawn ──→ N workers paralelos
                 (apenas stories prontas)      cada worker = DevFlow-mini (TDD)
                 ←── coleta PRs ←──────────────  worktree+branch+PR isolado
                                                 (reactions CI/review POR worker)
V  Validation ── gates GLOBAIS (testes, security, spec) + síntese no DevFlow
                 ←─ reactions: CI/teste falhou → auto-fix loop (workers de fix)
C  Confirm    ── ordem de merge pelo DAG — SEM auto-merge (merge = humano/DevFlow)
                 ←─ reactions pós-PR: CI/review → auto-fix até merge-ready → NOTIFICA
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
- **Reactions (camada de V/C — o maior ganho do AO fora da E):** três níveis de uso. (a) **Dentro da onda (E):** CI/review por worker. (b) **V global:** teste/CI falhou → reaction re-despacha um worker de fix — loop de auto-correção em vez de escalar imediatamente. (c) **C global / pós-PR:** CI/review do PR → auto-fix até merge-ready → **notifica o humano** (`approved-and-green.auto: false` — merge nunca automático). A **síntese do veredito** (V), a **validação de integração holística** (rodada no código merged, não fragmentada) e a **decisão de merge** (C) permanecem centralizadas no DevFlow. Cap de `retries` + `escalateAfter` para não mascarar problema de design nem entrar em loop. Gates **determinísticos** (ex.: `adr-audit.mjs`) continuam scripts — não passam pelo AO.

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
| **reactions (Plano 4)** | config `reactions:` no `agent-orchestrator.yaml` gerado (`auto: false` em `approved-and-green`); lib de monitoramento pós-PR (poll de CI/review → re-despacho de worker de fix); gate "notifica, nunca mergeia"; integração nos skills `prevc-validation` e `prevc-confirmation` |

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
| Loop de reactions mascarar problema de design / loop infinito (V/C) | cap de `retries` + `escalateAfter` → escala pro humano; reaction nunca mergeia (`auto: false`) |
| Validação fragmentada perder bug de integração | V de integração roda no código **merged** (holística), não em worktrees isolados |

## Roadmap de planos

Fatiado em planos sequenciais, cada um entregando software testável por si:

- **Plano 1 — Config & Entrevista** (ENTREGUE, PR #53): seção `orchestrator:`, entrevista no config, validação de escopo (Step 0.6).
- **Plano 2 — Lib de ondas + heurística + templates:** DAG/pipeline (`orchestrator-waves.mjs`), heurística de ativação, geração de `.ao-rules` e `agent-orchestrator.yaml`.
- **Plano 3 — Fluxo da fase E:** despacho por ondas, coleta de PRs, V/C global, fallback; flags `--parallel`/`--no-parallel`.
- **Plano 4 — Reactions (loop de feedback V/C):** auto-fix de CI/review na **V** (workers de fix) e **pós-PR no C** (até merge-ready → notifica), com cap de `retries`/`escalateAfter` e **merge sempre manual**. Depende do P3 (precisa dos PRs das ondas existindo). É o ganho do AO fora da E.

## 10. Referências

- Memória: `project_ao_orchestrator_integration` (PoC, veredito, requisito user-scope).
- PR #52 (v1.23.3): Step 0.6 — validação de escopo do plugin para AO.
- Brainstorm pausado: `docs/superpowers/specs/2026-06-13-prevc-parallel-execution-design.md` (candidato a ser aposentado por esta abordagem).

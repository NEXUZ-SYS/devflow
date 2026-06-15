# Design: Importador Reversa → DevFlow

> **DevFlow workflow:** importador-reversa-devflow | **Escala:** LARGE | **Fase:** P (Planning) → R
> **Data:** 2026-06-13
> **Autonomia:** supervised
> **Fixture de teste:** `/home/walterfrey/Documentos/code/reversa-com-attio` (lido em cópia tmpdir; **nunca** mutado)

## 1. Objetivo & escopo

Construir uma ferramenta DevFlow (skill `devflow:import-reversa` + biblioteca Node) que lê um
projeto gerado pelo **Reversa** (https://github.com/sandeco/reversa) e o **aterrissa** como um
projeto DevFlow executável, com **máxima fidelidade híbrida**: deriva os artefatos executáveis do
DevFlow E preserva os artefatos ricos originais do Reversa como referência navegável e linkada.

Importar **é** o ato de iniciar o projeto DevFlow a partir do Reversa — não apenas converter
arquivos. O importador conduz o bootstrap do projeto quando necessário.

**Não-objetivo central:** implementar qualquer feature do produto descrito pelo projeto Reversa
(no fixture, o "CRM concorrente do Attio"). O `reversa-com-attio` é **fixture de teste**, não alvo
de implementação.

### Princípio de fidelidade (decisão aprovada)
**Híbrido: executar + preservar.** Os artefatos DevFlow executáveis (stories/plans/ADRs/PRD) são
*derivados* dos artefatos Reversa; os originais ricos que não têm casa nativa no DevFlow
(spec.md SDD, screens, interfaces, reviews, marcadores de confiança) são *preservados* num
namespace dedicado e *linkados* a partir dos derivados. Nada se perde.

## 2. Fluxo operacional & arquitetura

### 2.1 Invocação e bootstrap

Comando: **`/devflow import-reversa <source>`**

1. **Validação do source** — confirma que `<source>` é um projeto Reversa (presença de `.reversa/`
   + `_reversa_forward/`/`_reversa_sdd/`). Se não for, erra com diagnóstico claro.
2. **Destino (sempre interativo, sem default escondido)** — pergunta ao usuário:
   - `in-place` — o próprio dir do Reversa vira o projeto DevFlow (ganha `.context/`; `_reversa_*`
     permanece como input histórico; refs preservadas em `.context/imported/reversa/`);
   - `dir novo` — cria um projeto DevFlow separado (sugestão `<source>-devflow/`), deixando o
     projeto Reversa 100% intocado;
   - `path custom` — destino arbitrário informado pelo usuário.
3. **Bootstrap (quando o destino não tem DevFlow ativo)** — o importador **conduz**, reaproveitando
   `devflow:project-init` (não reimplementa):
   - seleção de **idioma** (bloqueante, igual ao init) → propaga ao dotcontext;
   - **scaffold `.context/`** completo (agents, skills, docs) no idioma escolhido;
   - oferece **`git init`** se o destino não for repositório git (necessário para o manifesto/diff
     não-destrutivo ter rede de segurança);
   - se o destino **já** tem DevFlow ativo → pula o bootstrap e entra em modo **re-import**
     (diff + manifesto, §6).
4. **Pipeline de import** (§2.3).
5. **Handoff** — informa o estado PREVC do projeto resultante, apresenta o `fidelity-report` e o
   `readiness-assessment`, e aponta o próximo passo nativo
   (`/devflow auto --from-prd` para decompor as ondas seguintes).

### 2.2 Componentes

- **Skill** `devflow:import-reversa` (`SKILL.md`) — orquestra o pipeline, conduz as etapas
  interativas (destino, bootstrap, readiness, reconciliação) e o julgamento de fidelidade que
  exige um LLM.
- **Lib Node** em `scripts/reversa-import/`:
  - `parsers/` — **parsers plugáveis por tipo de artefato**, cada um testável isolado
    (padrão `.mjs` do repo): `reconstruction-plan.mjs`, `forward-feature.mjs`, `sdd-spec.mjs`,
    `decisions.mjs`, `soul.mjs`, `review.mjs`, `state.mjs`.
  - `ir.mjs` — **modelo intermediário** (IR) normalizado que desacopla input de output.
  - `emitters/` — `prd.mjs`, `adrs.mjs`, `plans.mjs`, `stories.mjs`, `preserve.mjs`,
    `fidelity-report.mjs`, `manifest.mjs`.
  - `readiness.mjs` — Pre-flight Readiness Gate (§5.1).
  - `consistency.mjs` — Plan Consistency Validation (§5.2).
  - `pipeline.mjs` — orquestra os estágios; cada estágio é uma função pura testável.

### 2.3 Pipeline (estágios)

```
detect + readiness → parse → map → validate-plan → reconcile (interativo) → emit → report
```

- **detect + readiness** — localiza `.reversa/`, lê config/estado, classifica artefatos presentes
  e produz o `readiness-assessment` (§5.1). Ponto de decisão interativo (graduado).
- **parse** — cada parser plugável produz fragmentos do IR. Parser tolerante: ausências degradam
  graciosamente (logadas no report), nunca quebram o pipeline (§7 robustez).
- **map** — IR → artefatos DevFlow (dois níveis, §3).
- **validate-plan** — Consistency Validation lado-DevFlow sobre os artefatos mapeados (§5.2).
- **reconcile** — loop interativo de ajuste das inconsistências encontradas (§5.2).
- **emit** — escreve os artefatos com **manifesto de proveniência** (§6); não-destrutivo.
- **report** — gera `fidelity-report.md` e grava o `readiness-assessment`.

O **IR** é a fronteira: adicionar um novo tipo de artefato Reversa = adicionar um parser sem tocar
emitters; adicionar um novo artefato DevFlow = adicionar um emitter sem tocar parsers.

## 3. Modelo de mapeamento (dois níveis)

**Insight:** um projeto Reversa já passou por planejamento (P) e por uma forma de review (os
`_review/`). Ele chega ao DevFlow pronto para entrar na fronteira **P→E**, com os artefatos de
planejamento pré-preenchidos. O importador **aterrissa o plano**; a **decomposição atômica em
stories** é responsabilidade da máquina nativa do DevFlow (preservando TDD e revisão humana), não
é alucinada no import.

| Reversa (input) | → DevFlow (output) | Nível | Quem decompõe |
|---|---|---|---|
| `reconstruction-plan.md` (tarefas + grafo `Depende` + ondas/marcos) | **PRD faseado** (`.context/plans/<proj>-prd.md`, fases = ondas/marcos, cada tarefa = item de escopo c/ dependência) + `plans.json` registry | Macro | importador 1:1 (fiel) |
| `_decisions/paradigm-decision.md` + roadmap "Decisões técnicas" (D-01…) + `pending-decisions.md` | **ADRs** (`.context/engineering/adrs/NNN-*-vX.Y.Z.md`) com guardrails | Decisões | importador 1:1 (fiel) |
| `requirements.md` (RN/personas/US+AC) + `spec.md` + `Pronto quando` | **plan.md** esqueleto por feature + critérios de aceitação | Spec | importador (esqueleto fiel) |
| `spec.md`, `screens.md`, `interfaces/*`, `_review/*`, `.reversa/context/*` | **refs preservadas** linkadas (`.context/imported/reversa/<feature>/…`) | Preserva | importador (cópia fiel) |
| **1ª onda/fase** (apenas) | **`stories.yaml`** rascunho-a-revisar (agentes inferidos, `blocked_by` do grafo) | Micro | importador (só onda 1) |
| Demais ondas | PRD marcado `⬚ pending` → `/devflow auto --from-prd` decompõe sob demanda | Micro | **DevFlow nativo** (humano no loop) |

### 3.1 ADRs caem no PROJETO IMPORTADO
As decisões arquiteturais do Reversa (ex.: "monólito DDD + TS + Postgres") são do **produto
importado**, não da ferramenta DevFlow. Os ADRs derivados são escritos no
`.context/engineering/adrs/` do **destino** (o projeto convertido). O repositório do DevFlow não
recebe ADRs do domínio importado.

### 3.2 Inferência de agente especialista
Cada story derivada recebe um `agent` inferido do conteúdo da tarefa Reversa
(ex.: "endpoint REST/OAuth" → `backend-specialist`; "kanban/React/tokens" → `frontend-specialist`;
"RLS/schema/migração" → `database-specialist`; "CI/deploy" → `devops-specialist`). Quando a
inferência é ambígua, usa um fallback explícito (`feature-developer`) e marca como item de
reconciliação (§5.2).

## 4. Fidelidade & confiança

Decisão aprovada: **inline + relatório de fidelidade.**

- Marcadores de confiança 🟦 oficial · 🟢 capturado · 🟡 inferido · 🔴 lacuna são mantidos
  **inline** em todo texto derivado e preservado.
- **`fidelity-report.md`** (em `.context/imported/reversa/`) agrega:
  - % de cada nível de confiança por feature e global;
  - 🔴 **lacunas** convertidas em **stories/itens "resolver lacuna"** acionáveis;
  - 🟡 **inferidos** marcados como "validar";
  - mapa de proveniência (qual artefato DevFlow veio de qual artefato Reversa).
- Confiança é tratada como **sinal acionável**, não decoração.

## 5. Validação em duas camadas

### 5.1 Pre-flight Readiness Gate (lado Reversa)

Postura aprovada: **graduado + decisão interativa.** Roda **antes do parse**. Não confia num único
sinal — **triangula** (vide análise do fixture: `state.json` tinha `completed:[]`/`pending:[...]`
contradizendo `checkpoints` e `soul.md`):

| Sinal | Fonte | O que afere |
|---|---|---|
| Fase declarada | `.reversa/state.json` `phase` + `checkpoints` | intenção (1 voto, não gospel) |
| Esteira por feature | filesystem `_reversa_forward/*` + `_reversa_sdd/*` | features completas / stubs / órfãs |
| Descasamento SDD↔forward | cruzamento das listas | features SDD sem contraparte forward (e vice-versa) |
| Auditorias | `_review/final-closure-audit.md`, `confidence-report.md`, `visor-conformidade.md`, `trial-coverage-gaps.md` | findings CRITICAL/HIGH abertos |
| Decisões pendentes | `_decisions/pending-decisions.md` | gates de produto não resolvidos |
| Densidade de 🔴 | varredura de marcadores | proporção de lacunas por feature |
| Tamanho de spec | linhas/seções de cada `spec.md` | detecção de stub (ex.: `notificacoes` 22L) |

**Veredito** por feature e global: 🟢 completo / 🟡 parcial / 🔴 insuficiente. Comportamento:
- 🟢 → importa cheio;
- 🟡 → importa o que está pronto + marca o resto como "resolver lacuna"/draft;
- 🔴 (CRITICAL aberto, specs vazias) → **avisa forte e pergunta** se prossegue (import parcial
  explícito).

Nada é importado silenciosamente como se estivesse pronto. O assessment alimenta o `fidelity-report`.

### 5.2 Plan Consistency Validation (lado DevFlow) + Reconciliação interativa

Roda **depois do map, antes do emit final.** É um gate tipo-Review aplicado ao *plano resultante*
da conversão — não basta converter fielmente, o resultado tem que ser **coerente como plano
DevFlow**.

| Check | Inconsistência detectada | Reconciliação com usuário |
|---|---|---|
| **Grafo de deps** | `blocked_by` aponta para story inexistente; **ciclo**; story órfã | mostra ciclo/órfã, propõe correção, usuário decide |
| **Ordem onda↔dep** | story da onda 1 depende de story de onda posterior (viola bottom-up) | propõe re-priorizar / mover de onda |
| **Cobertura** | tarefa Reversa que não virou artefato; fase PRD vazia | lista o que ficou de fora; usuário mapeia ou descarta |
| **ADR ↔ plano** | plano referencia decisão técnica (D-NN) sem ADR correspondente | oferece gerar a ADR faltante |
| **Spec stub → story** | story derivada de spec stub | marca 🔴 "resolver lacuna"; confirma se vira story executável ou TODO |
| **SDD↔forward órfão** | feature SDD sem forward | usuário decide incluir como parcial ou adiar |
| **Schema** | `stories.yaml`/`plans.json` fora do schema DevFlow | corrige automaticamente, reporta |

**Loop de reconcile (interativo):** cada inconsistência é apresentada com um **ajuste proposto**;
o usuário aceita, edita ou adia. As decisões da reconciliação entram no **manifesto de
proveniência** (rastreável). Só depois de reconciliado o importador faz o `emit` final + commit.

## 6. Idempotência / re-import

Decisão aprovada: **não-destrutivo + diff/manifesto.**

- Refs preservadas vão para namespace regenerável (`.context/imported/reversa/`).
- Cada artefato derivado carrega um **manifesto de proveniência**
  (`.context/imported/reversa/manifest.json`): hash da fonte Reversa + timestamp + decisões de
  reconciliação.
- Em **re-import**: detecta o que mudou na fonte (diff por hash), apresenta o diff, e **pede
  confirmação antes de sobrescrever** qualquer arquivo que o usuário possa ter editado à mão.
  **Nunca apaga WIP em silêncio.**

## 7. Robustez à variação estrutural

A estrutura Reversa **varia** entre projetos e versões (no fixture: `soul.md` descreve uma esteira
`requirements→clarify→plan→to-do→audit` que não bate com o real
`requirements/roadmap/actions/...`; features sem `interfaces/`; `granularity` é config;
`state.json` com versão `1.2.43` e campos stale).

**Princípio:** parser **tolerante e dirigido por detecção** — cada parser declara os artefatos que
sabe ler; ausências degradam graciosamente (logadas no `fidelity-report` como "tipo de artefato
ausente"), nunca quebram o pipeline. O importador funciona com o que existe e reporta o que falta.

## 8. Estratégia de testes (TDD obrigatório)

RED→GREEN→REFACTOR; testes reais (unit + integração + E2E), nunca content-checks. **Toda fixture
destrutiva ou de escrita roda em cópia tmpdir — o `reversa-com-attio` versionado nunca é mutado.**

- **Unit por parser/emitter** contra fixtures derivadas do `reversa-com-attio`:
  - cada parser produz o fragmento de IR esperado;
  - cada emitter produz artefato no schema DevFlow correto.
- **Readiness Gate**: fixtures sintéticas — projeto 🟢 completo, 🟡 parcial (spec stub, feature
  órfã), 🔴 insuficiente (CRITICAL aberto, decisões pendentes); valida veredito por feature e global
  e a triangulação que **ignora `state.json` stale**.
- **Consistency Validation**: fixtures de plano inconsistente (ciclo de deps, story órfã, dep
  cross-onda, ADR faltante, spec-stub→story, SDD↔forward órfão, schema inválido) — um caso por check.
- **Integração**: pipeline completo `reversa-com-attio` (cópia tmpdir) → artefatos DevFlow;
  valida schema de `stories.yaml`/`plans.json`, contagens (N tarefas → N itens de PRD com grafo de
  dependências preservado), e que a 1ª onda virou stories e as demais ficaram `⬚ pending`.
- **Bootstrap & destino**: destino vazio → init conduzido → import; destino já-DevFlow → modo
  re-import com diff; os três modos de destino (in-place/novo/custom) — todos em tmpdir.
- **E2E**: import → `/devflow:devflow-status` reconhece o projeto → `--from-prd` decompõe a 2ª
  onda. Cópia tmpdir.

## 9. Fora de escopo (YAGNI)

- Parsear o mini-site HTML de `.reversa/documentation/` (é output renderizado; preservado como ref
  linkada, não interpretado).
- Round-trip DevFlow → Reversa.
- Decompor todas as ondas em stories no import (só a 1ª; o resto é nativo via `--from-prd`).
- Implementar qualquer feature do produto descrito pelo projeto Reversa.
- Suporte a versões do Reversa anteriores às que expõem `.reversa/state.json` + `_reversa_*`
  (detecção tolerante reporta incompatibilidade em vez de tentar adivinhar).

## 10. Decisões registradas neste design

1. Fidelidade **híbrida** (executar + preservar).
2. Mapeamento em **dois níveis**; importador aterrissa o plano + decompõe **só a 1ª onda**; resto é
   nativo DevFlow.
3. Confiança **inline + fidelity-report** (🔴 → stories de "resolver lacuna").
4. Invocação via **skill `devflow:import-reversa` + lib Node** com parsers plugáveis + IR.
5. Re-import **não-destrutivo** com manifesto de proveniência + diff + confirmação.
6. ADRs derivados caem **no projeto importado**, não no repo do DevFlow.
7. **Destino sempre interativo** (in-place / dir novo / custom).
8. **Bootstrap conduzido** pelo importador (reaproveita `devflow:project-init`) + oferta de
   `git init`.
9. **Pre-flight Readiness Gate** graduado + interativo (triangula sinais; `state.json` não é gospel).
10. **Plan Consistency Validation** lado-DevFlow + **reconciliação interativa** antes do emit.

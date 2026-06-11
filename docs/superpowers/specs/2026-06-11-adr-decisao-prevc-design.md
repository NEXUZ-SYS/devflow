# Spec — Integração ADR↔decisão no fluxo PREVC

> **DevFlow workflow:** adr-decisao-prevc | **Scale:** MEDIUM | **Fase:** P (design)
> **Data:** 2026-06-11 | **Idioma:** pt-BR

## Problema

Hoje a ligação entre "uma decisão arquitetural foi tomada/mudou" e o sistema de ADR é **parcial e inconsistente**. O usuário percebeu que *em alguns casos* o fluxo valida se há ADR e sugere registrar, em outros não. A análise confirmou três causas estruturais:

1. **Step 3.5 do `prevc-planning` só oferece CREATE.** Quando detecta uma decisão, sempre oferece `/devflow adr:new` — nunca cruza com as ADRs já existentes para perceber que a decisão **altera/contradiz uma ADR** (que pediria EVOLVE) ou que já está **coberta** (que não pede nada).
2. **Heurística de detecção rígida (4 de 4 sinais simultâneos).** Decisões legítimas que batem em 3/4 passam batido — origem do comportamento "às vezes sim, às vezes não".
3. **Detecção existe só no Planning.** `prevc-review`, `prevc-execution` e `prevc-confirmation` têm **zero** verificação de ADR. Decisões que surgem/mudam durante a implementação (caso mais comum) não são capturadas.

**Fora de escopo (decisão do usuário):** detecção fora do PREVC formal (conversa solta, escala QUICK). `prevc-validation` Steps 2.5/2.6 (compliance + audit gate) **não** mudam.

## Objetivo

Tornar a consideração de ADR **consistente e cross-aware** ao longo do PREVC: ao detectar uma decisão, cruzar com o acervo de ADRs e oferecer a ação certa (EVOLVE vs CREATE vs silêncio), com detecção mais sensível porém previsível, estendida às fases pós-Planning sem gerar fadiga.

## Decisões de design (validadas com o usuário)

| # | Tema | Decisão |
|---|------|---------|
| 1 | Decisão **alinhada** com ADR existente | **Silêncio total** — nenhum ruído no output |
| 2 | Heurística de detecção | **Núcleo obrigatório** (`não-trivial` **E** `afeta stack/arquitetura`) **+ ≥1 reforço** (`alternativas` **OU** `implica guardrails`). Efetivo: 3/4 com núcleo fixo |
| 3 | Distribuição entre fases | **P forte + C rede de segurança** (R = gate de conflito; E = captura passiva; C = consolidação/sweep) |
| 4 | Captura em Execution | Arquivo efêmero **`.context/workflow/.adr-pending.json`** |
| 5 | Mecanismo de cruzamento | **LLM-semântico** reutilizando o bloco `<ADR_GUARDRAILS filtered>` já carregado no Step 1 — sem novo I/O de ADR |
| 6 | Opt-out | `skip_adr_offer` passa a valer para **todo o workflow** (Planning **e** Confirmation) |
| 7 | Estratégia de teste | **Separar julgamento (LLM) de regra (lib `.mjs` testável)** + E2E de cenário |

## Princípio arquitetural: julgamento vs regra

A peça central que torna isto testável de verdade:

- **Julgamento** permanece no LLM, dentro dos `SKILL.md`: "os 4 sinais são verdadeiros?", "esta decisão contradiz, estende ou está alinhada com a ADR-X?". É avaliação semântica — não vira código.
- **Regra** vira lib `.mjs` determinística: dado os booleanos dos sinais → dispara? dado a relação → qual ação? Isso garante que a regra 3/4 e a árvore de decisão sejam **aplicadas de fato**, não "lembradas" pelo modelo. Coerente com o padrão do projeto (`SKILL.md` já invocam `adr-audit.mjs`, `adr-evolve.mjs` como CLIs).

## Componentes

### Lib nova — `scripts/adr-decision.mjs` (+ helpers em `scripts/lib/`)

Funções puras (TDD real):

- `evaluateSignals({ nonTrivial, affectsStack, hasAlternatives, impliesGuardrails }) → boolean`
  Regra: `(nonTrivial && affectsStack) && (hasAlternatives || impliesGuardrails)`.
- `decideAction({ relation, relatedSlug }) → { action, command, evolveHint }`
  - `relation: "contradicts"` → `{ action: "evolve", command: "/devflow adr:evolve <slug>", evolveHint: "major" }`
  - `relation: "extends"` → `{ action: "evolve", command: "/devflow adr:evolve <slug>", evolveHint: "minor|refine" }`
  - `relation: "aligned"` → `{ action: "silent" }`
  - `relation: "none"` → `{ action: "create", command: "/devflow adr:new --mode=prefilled" }`
- `parseGuardrailsBlock(text) → [{ name, slug, stack, tags }]`
  Parser determinístico do bloco `<ADR_GUARDRAILS filtered>` emitido pelo `adr-filter`.

CLI fino: os `SKILL.md` passam os julgamentos do LLM como flags; o script aplica a regra e imprime JSON com a ação. Ex.:
`node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-decision.mjs decide --relation=contradicts --slug=012-jest-config`

### Lib nova — `scripts/lib/adr-pending.mjs`

Estado de captura efêmero:

- `appendCandidate(projectPath, { phrase, phase, relatedAdr })` — append com **dedup** por frase-chave normalizada (lowercase, trim, colapso de espaços).
- `readCandidates(projectPath) → []`
- `clearPending(projectPath)`
- Tolerante a arquivo ausente ou corrompido (retorna `[]`, nunca lança no caminho de leitura).

Schema de cada candidato:
```json
{ "phrase": "Adotar Vitest em vez de Jest", "phase": "E", "relatedAdr": "012-jest-config" }
```
`relatedAdr` é `null` quando não há ADR relacionada.

### `skills/prevc-planning/SKILL.md` — Step 3.5 reescrito

Decisão de 3 ramos (substitui a oferta única de CREATE):

1. LLM avalia os 4 sinais como booleanos → chama `adr-decision.mjs evaluate`. Se `false` → pula.
2. Se dispara, LLM classifica a **relação** da decisão contra as ADRs do bloco `<ADR_GUARDRAILS filtered>` já em contexto (parseado por `parseGuardrailsBlock`).
3. LLM chama `adr-decision.mjs decide` → segue a ação:
   - **evolve** → oferta cita a ADR-alvo e o `evolveHint`.
   - **create** → oferta atual (prefilled).
   - **silent** → segue para Step 4 sem ruído.
4. Opções (a) executar / (b) pular / (c) `skip_adr_offer` para **todo o workflow**.

A oferta sempre cita a **frase-chave exata** do spec que disparou (transparência preservada).

### `skills/prevc-review/SKILL.md` — novo step "ADR conflict gate"

- **Gate de qualidade, não oferta.** Relê o plano aprovado contra os guardrails carregados; sinaliza **conflito plano×guardrail** (lacuna onde o Review é cego hoje).
- Se o plano introduziu **decisão nova** não capturada no Planning → aplica o mesmo cruzamento do Componente Planning (reuso de `adr-decision.mjs`).

### `skills/prevc-execution/SKILL.md` — captura passiva

- Nos pontos de handoff/diary que já existem, se uma **decisão emergente** surgiu (desvio do plano, escolha de lib/contrato não prevista) → `appendCandidate(...)` no `.adr-pending.json`. **Não interrompe** o loop nem o autonomous mode.

### `skills/prevc-confirmation/SKILL.md` — consolidação + sweep

- Antes de finalizar: `readCandidates(...)` + detecta ADRs tocadas (`git diff` em `.context/**/adrs/*.md`).
- **Sweep:** candidatos sem ADR → oferta **em lote** (EVOLVE/CREATE via `decideAction`). Respeita `skip_adr_offer`.
- **Completion summary** ganha seção "ADRs criadas/evoluídas neste workflow".
- `clearPending(...)` ao concluir.

## Fluxo de dados

```
P  adr-filter → <ADR_GUARDRAILS filtered> em contexto
   Step 3.5 → evaluateSignals → (parseGuardrailsBlock + relação LLM) → decideAction
            → EVOLVE | CREATE | silêncio
R  relê plano × guardrails → conflito? + decisão nova? (reusa decideAction)
E  decisão emergente → appendCandidate(.adr-pending.json)   [passivo]
C  readCandidates + git diff adrs/ → sweep em lote → summary → clearPending
```

## Estratégia de teste (TDD real)

**Unit (RED→GREEN→REFACTOR), em `tests/validation/`, convenção `node:test` + `node:assert/strict`:**

- `test-adr-decision.mjs`:
  - `evaluateSignals`: núcleo sem reforço → `false`; núcleo + 1 reforço → `true`; reforço sem núcleo → `false`; 4/4 → `true`; tabela-verdade completa.
  - `decideAction`: cada `relation` → ação esperada; `aligned` → `silent`; `none` → `create`.
  - `parseGuardrailsBlock`: extrai name/slug/stack/tags; bloco vazio → `[]`; tags `[firm]/[proposto]/[experimental]`.
- `test-adr-pending.mjs` (usa `mkdtempSync`/tmpdir — **nunca** muta dir versionado):
  - append cria arquivo; append dup não duplica; read de arquivo ausente → `[]`; read de JSON corrompido → `[]`; clear remove candidatos.

**E2E de cenário (`tests/integration/`):** fixtures com `.context/adrs/` de teste + spec com decisão; assegura: há ADR relacionada → oferta EVOLVE; sem ADR → CREATE; alinhada → silêncio; decisão capturada em E aparece no sweep do C.

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `scripts/adr-decision.mjs` | **novo** — CLI + funções de regra |
| `scripts/lib/adr-pending.mjs` | **novo** — estado de captura efêmero |
| `skills/prevc-planning/SKILL.md` | Step 3.5 reescrito (3 ramos, cross-aware, 3/4) |
| `skills/prevc-review/SKILL.md` | novo step "ADR conflict gate" |
| `skills/prevc-execution/SKILL.md` | captura passiva de decisão emergente |
| `skills/prevc-confirmation/SKILL.md` | sweep + seção no completion summary |
| `tests/validation/test-adr-decision.mjs` | **novo** |
| `tests/validation/test-adr-pending.mjs` | **novo** |
| `tests/integration/test-e2e-adr-decisao-prevc.mjs` | **novo** |
| `docs/...` (este spec) | registro do design |

## Riscos e mitigações

- **Fadiga de oferta** ao suavizar para 3/4 e estender fases → mitigado por: núcleo obrigatório (alta especificidade), `skip_adr_offer` cobrindo o workflow inteiro, ofertas ativas concentradas só em P e C, silêncio no caso alinhado.
- **Cruzamento LLM impreciso** (falso "aligned" escondendo contradição) → mitigado por: na dúvida, preferir oferecer (falso positivo > falso negativo), e o gate de Review como segunda passada.
- **`.adr-pending.json` órfão** se workflow abortar → efêmero por design; `clearPending` no C e oportunidade de limpeza no cleanup do branch.

## YAGNI / não-fazer

- Não detectar decisão fora do PREVC (conversa solta/QUICK) — fora de escopo.
- Não mudar `prevc-validation` (compliance/audit já cobre).
- Não criar detecção em background/hook — mantém-se dentro das fases.
- Não automatizar a classificação patch/minor/major do EVOLVE — o `adr-builder` já faz via interview; aqui só sugerimos o `evolveHint`.

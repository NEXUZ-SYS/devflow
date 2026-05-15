# Spec — Desacoplar Standards de ADRs (concern-first)

- **Data**: 2026-05-14
- **Autor**: Walter Frey (com Claude)
- **Status**: Design aprovado, aguardando plano de implementação
- **Branch alvo**: `feat/std-fsd-linter` (ou nova `feat/standards-concern-first`)
- **Escopo**: refactor da skill `standards-builder` + CLI `devflow-standards.mjs` + hook reverso em `adr-builder`
- **Validação E2E**: rodada `tests/2026-05-11/` (wipe + rerun)

---

## 1. Problema

A rodada de validação `tests/2026-05-11/` produziu 20 standards a partir de 21 ADRs num mapeamento essencialmente 1:1 — `std-zod`, `std-pytest`, `std-husky-lint-staged`, `std-firestore`, etc. Todos lib-centric.

Isso contradiz o design declarado em `.context/standards/README.md`:

> ADRs registram **decisões** (por que X foi escolhido sobre Y); standards são **regras operacionais** (como o código deve parecer agora). Os dois coexistem — ADR justifica, standard aplica.

O exemplo canônico do README (`std-error-handling`) é cross-cutting, não atrelado a lib.

**Causa raiz**: a skill `standards-builder` atual tem Hard Rule #1 — "Standard sem ADR de origem é PROIBIDO" — e o CLI exige `--from-adr=<csv>`. Com isso, cada ADR vira um std espelhado: `## Decisão` da ADR vira `## Princípios` do std, `NUNCA` guardrails viram tabela de anti-patterns com coluna "Certo" preenchida por fallback genérico.

**Sintomas práticos**:

1. **Duplicação semântica** entre ADR e std (mesma prosa, dois lugares).
2. **Acoplamento errado**: trocar Zod por Valibot exigiria nova ADR + novo std + deprecar std-zod, quando a regra real ("parse na borda externa") é estável.
3. **Vocabulário ausente**: não há lugar para `std-error-handling`, `std-naming-conventions`, `std-public-api-boundaries`, `std-observability-spans` — todos cross-cutting.
4. **Anti-patterns genéricos**: coluna "Certo" da maioria das linhas é `"Aplicar a alternativa explicitada na ADR…"` — sinal de que inversão mecânica não produz regra operacional útil.

## 2. Decisões alinhadas (alinhamento prévio)

| # | Decisão | Justificativa |
|---|---|---|
| D1 | Std e ADR são **ortogonais**; std pode existir com 0 ADRs | Restaura o modelo declarado no README |
| D2 | Modo default = **FROM-CONCERN**; FROM-ADR fica como legado com warning | Cutover suave; não quebra fluxos existentes |
| D3 | Input do concern é **híbrido** (taxonomia distribuída sugere; livre permitido) | Consistência + descoberta + flexibilidade |
| D4 | `adr-builder` ganha hook reverso: após criar ADR, busca std cujos guardrails/enforcement seriam afetados e recomenda **inject-or-create** (sempre FROM-CONCERN, nunca FROM-ADR) | Mantém os dois artefatos sincronizados sem força bruta |
| D5 | Sandbox 2026-05-11 = wipe + rerun com modo novo (validação E2E). Projetos reais ficam fora desta entrega (futuro: comando `migrate` com assistente) | Foco; minimiza blast radius |

## 3. Arquitetura

### 3.1 Componentes novos

| # | Arquivo | Responsabilidade |
|---|---|---|
| 1 | `skills/standards-builder/references/taxonomy-of-concerns.yaml` | Catálogo curado de ~30 concerns operacionais. Distribuído pela skill; usuário pode estender via `concerns.local.yaml` |
| 2 | `scripts/lib/concern-resolver.mjs` | Input livre → fuzzy match (Levenshtein ponderado) na taxonomia → confirma/estende |
| 3 | `scripts/lib/standard-from-concern.mjs` | Concern entry → scaffold operacional (princípio imperativo + anti-patterns como regras, não inversões mecânicas + linter stub) |
| 4 | `scripts/lib/standard-enrich.mjs` | Opcional: dado concern + ADRs, extrai apenas `## Guardrails` e `## Enforcement` como insumo bruto para o linter section — nunca como conteúdo principal |
| 5 | `scripts/lib/standards-search.mjs` | Reverse lookup: dado ADR-slug, retorna std cujo `relatedAdrs` ou `defaultApplyTo` overlap, com flag "covered" vs "uncovered" |

### 3.2 Componentes modificados

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `scripts/devflow-standards.mjs` | Novo subcomando `--concern`, novo subcomando `search`, warning em `--from-adr` |
| 2 | `scripts/lib/standard-audit.mjs` | Adiciona check **S6** (lib-centric detection) com severidade `WARN` |
| 3 | `skills/standards-builder/SKILL.md` | Remove Hard Rule #1, reordena Steps para concern-first, adiciona modo `migrate` |
| 4 | `skills/adr-builder/SKILL.md` | Step 5d existente vira Step 5e, fica obrigatório: chama `standards search --by-guardrail`, apresenta recomendação inject/create |

### 3.3 Componentes que NÃO mudam

- `scripts/lib/adr-chain.mjs` (reverse-lookup ADR→std já existe)
- `scripts/lib/standards-loader.mjs` (loader não distingue origem)
- PostToolUse hook (linter sandbox SI-4 intacto)
- `scripts/lib/glob.mjs` (SI-5 intacto)

## 4. Taxonomia de concerns

### 4.1 Shape de cada entry

```yaml
- id: runtime-validation                    # kebab-case, vira std-runtime-validation
  summary: Validar payloads na borda externa antes de tocar lógica de domínio
  category: contracts                       # contracts|errors|naming|obs|hygiene|testing|perf|a11y|security|state|async|deps
  defaultApplyTo:                           # SI-5 glob subset
    - "**/*.ts"
    - "**/*.tsx"
    - "**/*.py"
  inverseHints:                             # libs/keywords que sugerem ESTE concern
    - zod
    - yup
    - valibot
    - pydantic
    - marshmallow
    - io-ts
  principleTemplate: |                      # prosa imperativa; placeholders {{boundaryList}}, {{lib}}
    Toda entrada vinda de borda externa ({{boundaryList}}) DEVE ser parsed
    contra um schema declarado antes de qualquer state update ou render.
    Tipos de domínio derivam do schema; nunca declarados em paralelo.
  antiPatternTemplate:                      # cada item é uma REGRA, não inversão mecânica
    - rule: "Aceitar `unknown` da borda sem parse"
      correct: "`Schema.parse(input)` na primeira linha após I/O"
    - rule: "Declarar `type Foo` paralelo a um schema existente"
      correct: "`type Foo = z.infer<typeof FooSchema>` (DRY)"
    - rule: "Validar duas vezes o mesmo dado no fluxo"
      correct: "Parse na borda, propaga tipo estreito"
  linterHints:                              # sugestões para Step 4 polish escrever machine/*.js
    - "grep AST: fetch().then(res => res.json()) sem .parse() na sequência"
    - "ESLint custom: proibir type X = ... onde existe XSchema no mesmo pacote"
  relatedAdrCategories:                     # ajuda standards-search.mjs casar ADRs sem ler conteúdo
    - qualidade-testes
    - frontend
    - backend
```

### 4.2 Lista inicial v1 (~30 entries, 12 categorias)

| Categoria | Concerns iniciais |
|---|---|
| `contracts` | runtime-validation, public-api-boundaries, schema-evolution |
| `errors` | error-handling, error-propagation, panic-vs-recover |
| `naming` | naming-conventions, file-layout, public-api-naming |
| `obs` | observability-spans, logging-shape, metric-cardinality |
| `hygiene` | pre-commit-hygiene, format-on-save, import-ordering |
| `testing` | test-discipline, test-naming, mock-boundaries, e2e-scope |
| `perf` | perf-budgets, render-cost, query-cost |
| `a11y` | a11y-baseline, keyboard-navigation, semantic-html |
| `security` | secrets-handling, auth-context-propagation, input-sanitization |
| `state` | state-locality, state-immutability, derived-state |
| `async` | async-cancellation, promise-lifecycle, backpressure |
| `deps` | dependency-pinning, version-bump-policy |

### 4.3 Extensibilidade local

`.context/standards/concerns.local.yaml` é merge-on-load com a taxonomia distribuída. IDs em local **shadowam** distribuídos com warning. Recomendado versionar para times.

### 4.4 Algoritmo do resolver

1. Tokeniza input do usuário (`"validação runtime na borda"` → `["validação","runtime","borda"]`).
2. Match contra `id` + `summary` + `inverseHints` de cada entry com pontuação Levenshtein ponderada (id × 3, summary × 2, inverseHints × 1).
3. Retorna top-3 com confidence; auto-confirma se top-1 ≥ 0.75 e gap ≥ 0.15 sobre top-2; senão pergunta.
4. Se nenhum match ≥ 0.5, oferece "registrar concern novo" em `concerns.local.yaml`.

## 5. Fluxos da skill `standards-builder`

### 5.1 Detect mode (Step 0)

| Trigger | Modo |
|---|---|
| `"crie std para <concern em prosa>"` ou `--concern=<id>` | **from-concern** ← default |
| `"crie std-X a partir da ADR-N"` ou `--from-adr=<csv>` sem `--concern` | **from-adr** (legado, emite warning) |
| `--concern=<id> --enrich-from-adr=<csv>` | **from-concern + enrich** |
| ≥2 concerns mencionados ou `--concern=<id1>,<id2>` | **consolidate-concern** |
| `"audita std-X"` ou `--audit` | **audit** |
| `"migra std-zod para concern"` ou `--migrate=<lib-std-id>` | **migrate** (novo) |
| Nenhum sinal claro | pergunta com 4 opções em prosa |

### 5.2 Resolve concern (Step 1)

Invoca `concern-resolver.mjs`. Auto-confirma quando match é claro; pergunta com top-3 + opção "registrar novo" caso contrário.

### 5.3 Optional enrich (Step 2)

Se `--enrich-from-adr=<csv>` fornecido:

1. `standards-search.mjs --by-concern=<id>` lista ADRs relevantes (relatedStandards explícito ou category match).
2. Skill pergunta "essas ADRs são insumo válido?" — não assume.
3. Para cada ADR confirmada, `standard-enrich.mjs` extrai apenas:
   - `## Guardrails` (bullets `SEMPRE/NUNCA/QUANDO`)
   - `## Enforcement` (checkboxes)
4. Concatena em `<id>.enrichment.md` temporário (referência para Step 4 polish, não vai para std final).
5. **Não copia** `## Decisão`, `## Contexto`, `## Alternativas Consideradas` — ADR-territory.

### 5.4 Generate baseline (Step 3)

`standard-from-concern.mjs` produz:

| Section do std | Fonte |
|---|---|
| Frontmatter `id` | `std-${concern-id}` |
| Frontmatter `description` | `summary` da entry |
| Frontmatter `applyTo` | `defaultApplyTo` (override possível) |
| Frontmatter `relatedAdrs` | ADRs do Step 2 (vazio se sem enrich) |
| Frontmatter `enforcement.linter` | path para `machine/std-<id>.js` (stub) |
| Frontmatter `weakStandardWarning` | `true` (linter é stub) |
| `## Princípios` | `principleTemplate`, placeholders preenchidos no Step 4 |
| `## Anti-patterns` | `antiPatternTemplate` (rule/correct prontos; ajuste de tom no Step 4) |
| `## Linter` | `linterHints` + enforcement bruto do Step 2 (se houver) |
| `## Referência` | ADRs do Step 2 (se houver) + fontes oficiais via `.context/stacks/refs/` |

**Hard rule**: nenhum campo é copiado verbatim de ADRs. Enrich alimenta apenas `## Linter` e `## Referência`.

### 5.5 LLM polish (Step 4, opcional)

- Preencher placeholders `{{boundaryList}}`, `{{lib}}` com vocabulário concreto do projeto.
- Ajustar tom; **não inventar regras novas**.
- Redigir bullets de linter section; identificar quais são lintáveis estaticamente vs. exigem code review.
- Fontes oficiais via lookup em `.context/stacks/refs/index.yaml`; omite se não existe (não inventa).

### 5.6 Audit + commit (Step 5)

Roda audit (S1-S6); se PASSED, commita:

```
feat(std): add std-<concern-id> [+enriched from <adrs>] — <summary>
```

### 5.7 Reverse-link (Step 6, novo)

Se houve enrich, oferece adicionar `relatedStandards: [<concern-id>]` no frontmatter das ADRs alimentadoras. Confirma antes de tocar ADRs.

### 5.8 Modo MIGRATE (novo)

```bash
devflow standards new --migrate=<lib-std-id> [--target-concern=<id>] [--keep-old]
```

Algoritmo:

1. Lê std antigo; extrai `relatedAdrs` (viram `--enrich-from-adr`).
2. Resolve concern alvo via `--target-concern` ou inverseHints lookup (pergunta se ambíguo).
3. Se std-concern já existe → INJECT (Seção 6); senão CREATE-from-concern + enrich.
4. Marca std antigo: renomeia para `std-<lib>.deprecated.md` (ou `--keep-old` adiciona apenas frontmatter `deprecated: true`).
5. Audit do novo deve passar S1-S6 sem WARN em S6.
6. Commit único: `chore(std): migrate std-<lib> → std-<concern>`.

Idempotência: rodar migrate em std já deprecated é no-op.

### 5.9 Modo FROM-ADR legado (mudanças)

- Hard Rule #1 atual ("Standard sem ADR é proibido") **removida**.
- CLI emite no stderr:
  ```
  ⚠️  std lib-centric detectado.
     Concern operacional canônico: <hint>
     Preferido: devflow standards new --concern=<hint> --enrich-from-adr=<csv>
     Prosseguindo em modo legado em 3s (Ctrl-C para abortar)...
  ```
- Aguarda 3s (skip com `--yes` para CI).
- Loga em `.context/standards/.legacy-from-adr.log` para auditoria.
- Skill anuncia `"Invocando standards-builder em modo from-adr [LEGADO]"`.
- Pós-commit, recomenda `/devflow standards migrate <id>` no chat (não força).

## 6. Hook reverso em `adr-builder` (Step 5e)

### 6.1 Quando dispara

Após ADR ser commitado em `.context/adrs/`, ANTES de devolver controle ao usuário.

### 6.2 Algoritmo

```
1. Extract sinais do ADR:
   - stack    ← frontmatter `stack:`
   - category ← frontmatter `category:`
   - lib-name ← regex (primeiro token alpha do stack, lowercase)

2. Match contra taxonomy-of-concerns.yaml:
   - lib-name in entry.inverseHints  → matched concerns
   - category in entry.relatedAdrCategories → fallback matches

3. Para cada matched concern:
   - std-<concern> existe? → INJECT
   - não existe? → CREATE

4. Apresenta recomendação unificada.
```

### 6.3 Caminho INJECT

Diff conceitual entre std atual e ADR novo:

| Checagem | Ação |
|---|---|
| ADR introduz Guardrail que NÃO aparece no std `## Anti-patterns`? | Lista como candidato a inject |
| ADR introduz Enforcement checkbox que NÃO aparece no std `## Linter`? | Lista como candidato a inject |
| ADR alvo (`applyTo` implícito do stack) está fora do `applyTo` do std? | Recomenda WIDEN do `applyTo` |
| Nada novo? | Apenas adiciona ADR-slug em `relatedAdrs` do std |

Apresentação:

```
📎 ADR-022 (adr-valibot-frontend) toca concern: runtime-validation
   std-runtime-validation já existe; análise:

   • 1 guardrail novo: "Schemas em packages/contracts devem ter export type"
     → candidato a anti-pattern row
   • 1 enforcement novo: "vitest cobre roundtrip parse+stringify"
     → candidato a linter bullet
   • applyTo atual: ["**/*.ts","**/*.tsx"] — sem mudança necessária
   • relatedAdrs: adicionar "adr-valibot-frontend"

   Aplicar? [s] inject tudo  [p] revisar item-a-item  [n] só registrar relatedAdrs  [skip]
```

Se aceito: Edit no `.md` do std, audit, commit:

```
chore(std): inject adr-valibot-frontend guardrails into std-runtime-validation
```

### 6.4 Caminho CREATE

```
📎 ADR-022 (adr-valibot-frontend) toca concern: runtime-validation
   std-runtime-validation NÃO existe no projeto.

   Recomendo criar agora via:
     /devflow standards new --concern=runtime-validation --enrich-from-adr=022

   Aplicar? [s] criar agora  [d] depois (registro TODO)  [n] não cria
```

Se `s`: invoca `standards-builder` em modo from-concern com enrich.
Se `d`: append em `.context/standards/TODO.md`:

```
- [ ] std-runtime-validation — sugerido por adr-valibot-frontend em 2026-05-14
```

`/devflow status` mostra "N standards pendentes"; futura skill `standards-catchup` processa em lote.

### 6.5 Quando NÃO dispara

| Situação | Por quê pular |
|---|---|
| ADR `decision_kind: soft` ou `status: Rascunho` | Não estável |
| ADR `refines` ou `supersedes` outra | A original já gerou recomendação |
| Nenhum concern matched | Mostra mensagem informativa "este ADR pode merecer concern novo na taxonomia"; não força ação |
| Taxonomy file inacessível | Skip silencioso com log stderr |

### 6.6 Modo autônomo

Em PREVC autonomous-loop ou `--yes`:

- INJECT aplica se todos os guardrails são `additive` (não conflitam).
- CREATE apenas registra TODO; **nunca cria sem confirmação** humana.

Garante que loop autônomo não multiplica arquivos sem visibilidade.

## 7. Audit S6 (detecção lib-centric)

### 7.1 Lógica

```js
function checkS6_libCentric(stdFrontmatter, taxonomy) {
  const id = stdFrontmatter.id.replace(/^std-/, '');
  const allInverseHints = new Set(
    taxonomy.entries.flatMap(e => e.inverseHints ?? [])
  );

  if (allInverseHints.has(id)) {
    const suggested = taxonomy.entries.find(e => e.inverseHints?.includes(id));
    return {
      check: 'S6',
      status: 'WARN',
      reason: `std-${id} casa lib conhecida (${id}); concern canônico: ${suggested.id}`,
      suggestion: `devflow standards new --migrate=${id}`
    };
  }

  const prefix = id.split('-')[0];
  if (allInverseHints.has(prefix)) {
    return {
      check: 'S6',
      status: 'WARN',
      reason: `std-${id} parece lib-centric (prefixo "${prefix}")`,
      suggestion: `revisar manualmente — possivelmente migrate-able`
    };
  }

  return { check: 'S6', status: 'PASS' };
}
```

### 7.2 Severidade

`WARN`, nunca `FAIL`. Std lib-centric continuam válidos; gate continua `PASSED` com S6 WARN.

### 7.3 Exceção

Std com `deprecated: true` no frontmatter pula S6 (já marcado para morrer).

### 7.4 Output

```
$ devflow standards audit zod
  S1 frontmatter         ✓ PASS
  S2 placeholders        ✓ PASS
  S3 linter file         ✓ PASS
  S4 relatedAdrs         ✓ PASS
  S5 applyTo SI-5        ✓ PASS
  S6 concern alignment   ⚠ WARN — std-zod casa lib conhecida; concern: runtime-validation
                                  hint: devflow standards new --migrate=zod

Gate: PASSED (5 PASS, 1 WARN)
```

## 8. Telemetria mínima (opcional v1)

Counter em `.context/standards/.metrics.json` (gitignored):

```json
{
  "from_concern": 14,
  "from_adr_legacy": 3,
  "migrated": 5,
  "last_updated": "2026-05-14"
}
```

`devflow standards stats` (subcomando trivial v1.1) imprime resumo. Sem network, opt-in via `.devflow.yaml` flag `standards.metrics: true`.

## 9. Estratégia de testes

### 9.1 Pirâmide

```
E2E sandbox re-run (1 cenário — gate final)
  ↓ depende de
Skill integration tests (4 fluxos)
  ↓ depende de
CLI contract tests (8 subcomandos × happy+edge)
  ↓ depende de
Unit tests (libs novas + S6)
```

### 9.2 Unit tests (vitest)

Layout: `scripts/lib/__tests__/<lib>.test.mjs`.

| Lib | Casos cobertos |
|---|---|
| `concern-resolver.mjs` | (a) match por id; (b) por summary; (c) por inverseHint; (d) ambíguo retorna candidatos; (e) zero match → register-new; (f) local shadowa distribuído com warning |
| `standard-from-concern.mjs` | (a) sem enrich (templates renderizados, placeholders mantidos); (b) com enrich (placeholders preenchidos); (c) applyTo default vs override; (d) weakStandardWarning sempre `true` quando linter é stub |
| `standard-enrich.mjs` | (a) extrai apenas Guardrails + Enforcement; (b) ignora Decisão/Contexto/Alternativas (assertion negativa); (c) múltiplas ADRs → dedup; (d) ADR sem `## Guardrails` retorna vazio sem erro |
| `standards-search.mjs` | (a) `--by-guardrail=<adr>` retorna std com relatedAdrs contendo slug; (b) `--by-concern=<id>` retorna ADRs com category/stack match; (c) projeto sem `.context/standards/` retorna vazio (não erro) |
| `standard-audit.mjs` (S6) | (a) std-zod → WARN; (b) std-runtime-validation → PASS; (c) std-zod-frontend → WARN (prefix); (d) std-foo deprecated → skip |

**Coverage target**: 90% nas libs novas; 100% no concern-resolver.

**Fixtures**: `scripts/lib/__tests__/fixtures/` com 3 ADRs sintéticas, 2 std sintéticos, 1 taxonomy reduzida (~5 entries).

### 9.3 CLI contract tests

`scripts/__tests__/devflow-standards.contract.test.mjs`:

| Subcomando | Casos | Asserção principal |
|---|---|---|
| `new --concern=<id>` | happy + concern inválido | exit 0/1; arquivo criado; frontmatter shape válido |
| `new --concern=<id> --enrich-from-adr=<csv>` | happy + ADR inexistente | relatedAdrs populado; enrichment.md temporário gerado e limpado |
| `new --from-adr=<csv>` (legado) | happy | exit 0; warning no stderr; std criado |
| `new --from-adr=<csv> --yes` | CI mode | warning sem sleep |
| `new --migrate=<lib>` | happy + target ambíguo | std deprecated; novo std criado; commit correto |
| `audit <id>` | passed; blocked S2; warned S6 | exit 0/1/0 respectivamente |
| `search --by-guardrail=<adr>` | match + no-match | JSON output válido |
| `search --by-concern=<id>` | match + no-match | JSON output válido |

Sandbox por teste: `tmpdir` com `.context/` mínimo via helper; paralelizável.

### 9.4 Skill integration tests

`tests/skills/standards-builder/<flow>.test.mjs`:

| Fluxo | Entrada | Verificações |
|---|---|---|
| **F1 — FROM-CONCERN puro** | `--concern=runtime-validation` | sem ADR consultada; std criado; placeholders mantidos onde aplica; audit PASSED; commit feito |
| **F2 — FROM-CONCERN + enrich** | `--concern=runtime-validation --enrich-from-adr=009` | enrichment.md descartado; relatedAdrs preenchido; `## Linter` derivado do Enforcement; `## Princípios` NÃO contém prosa da `## Decisão` (assertion negativa) |
| **F3 — Migrate** | `--migrate=zod` com std-zod e adr-zod-frontend pré-existentes | std-runtime-validation criado; std-zod.deprecated.md existe; loader pula deprecated; commit único |
| **F4 — Hook reverso adr-builder** | criar ADR fake `adr-valibot-frontend` | Step 5e dispara; detecta std-runtime-validation existente; recomenda INJECT; com `--yes` aplica; audit pós-inject PASSED |

Helper compartilhado: `setupProject(stdsList, adrsList)`.

### 9.5 E2E gate — re-execução do sandbox 2026-05-11

Script: `tests/2026-05-11/rerun-with-concerns.sh`:

```bash
rm -rf tests/2026-05-11/.context/standards/std-*.md
rm -rf tests/2026-05-11/.context/standards/machine/std-*.js

for adr in tests/2026-05-11/.context/adrs/0*.md; do
  slug=$(yaml-extract name "$adr")
  concern=$(node scripts/lib/concern-resolver.mjs --from-adr-slug="$slug")
  [ -z "$concern" ] && { echo "SKIP: $slug — sem concern match"; continue; }

  node scripts/devflow-standards.mjs new \
    --concern="$concern" \
    --enrich-from-adr="$slug" \
    --project=tests/2026-05-11 \
    --yes
done

node scripts/devflow-standards.mjs audit --all --project=tests/2026-05-11
```

**Critérios de aceitação**:

| # | Critério | Como medir |
|---|---|---|
| AC1 | Total de std ≤ 12 (vs. 20 atuais) | `ls std-*.md \| wc -l` |
| AC2 | Nenhum std final tem id casando lib | audit S6 = 0 WARN |
| AC3 | Todos 21 ADRs referenciados em ≥1 std | `adr-chain.mjs --orphans` retorna 0 |
| AC4 | Audit gate PASSED em 100% | `audit --all` exit 0 |
| AC5 | `## Princípios` sem substring textual ≥40 chars de `## Decisão` de ADR | script `assert-no-decision-leak.mjs` |
| AC6 | std-runtime-validation com ≥2 ADRs em relatedAdrs (Zod + Pydantic) | grep frontmatter |
| AC7 | Tempo pipeline ≤ 2× tempo original (sem polish LLM) | bench script |

**Smoke test manual (~10 min)**:

- Abrir `std-runtime-validation.md` — princípio faz sentido isolado, sem abrir ADRs.
- Abrir `std-testing-discipline.md` (consolidado pytest+vitest) — anti-patterns cross-lang neutros.
- `--migrate=zod` num backup → confirma fluxo real.

### 9.6 CI gate

- Unit + contract + integration tests → bloqueantes sempre.
- E2E sandbox → bloqueante no PR final; depois smoke periódico.

## 10. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Taxonomia inicial subdimensionada (concerns reais não cobertos) | Média | Médio | `concerns.local.yaml` permite extensão; `--register-concern` no CLI. Iterar v1.1 com base no uso real |
| Fuzzy match do resolver ambíguo demais | Baixa | Baixo | Threshold (0.75 confidence, 0.15 gap) tunable; falha em "pergunte ao usuário" — degrada para multiple choice, nunca erra silencioso |
| Hook reverso do adr-builder amplifica latência da criação de ADR | Média | Baixo | Operação local (sem network); cache da taxonomia em memória; skip silencioso se taxonomy inacessível |
| Loop autônomo cria std sem revisão humana | Baixa | Alto | Hard rule: autônomo só faz INJECT additive; CREATE sempre vira TODO, nunca cria automaticamente |
| std lib-centric existentes em projetos reais quebram quando audit S6 acende WARN | Alta | Baixo | S6 é WARN, não FAIL — gate continua PASSED. Migração é opt-in via `--migrate` |
| Migration de std com vários ADRs perde sinal ao consolidar | Média | Médio | INJECT preserva todos os relatedAdrs no concern std; nenhum ADR órfão |

## 11. Escopo desta entrega

**In scope**:

- 5 libs novas + 4 modificações em scripts existentes
- 1 referência distribuída (`taxonomy-of-concerns.yaml` com ~30 entries)
- 2 skills modificadas (`standards-builder`, `adr-builder`)
- Testes: ~25 unit + 8 contract + 4 integration + 1 E2E gate
- Validação final: wipe + rerun do sandbox 2026-05-11 com 7 critérios de aceitação

**Out of scope (futuro)**:

- Migração de projetos reais (ferramenta de assistência v1.1)
- Refundação dual-document (Approach B do brainstorming)
- Taxonomy audit standalone (validador da própria taxonomia)
- `devflow standards stats` (telemetria opt-in)
- `standards-catchup` (processa TODO em lote)

## 12. Próximos passos

1. **Aprovação do spec** (este arquivo)
2. **Geração do plano de implementação** via `superpowers:writing-plans` skill
3. **Execução** via `superpowers:executing-plans` ou via PREVC Execution
4. **Gate**: E2E sandbox passa todos os AC1-AC7
5. **PR de merge** na branch `feat/std-fsd-linter` (ou nova `feat/standards-concern-first`)

---

**Referências**:

- `skills/standards-builder/SKILL.md` (estado atual)
- `skills/adr-builder/SKILL.md` (Step 5d atual)
- `.context/standards/README.md` (design declarado)
- `tests/2026-05-11/` (sandbox de validação)
- `docs/superpowers/specs/2026-04-24-adr-system-v2-design.md` (contexto ADR v2)

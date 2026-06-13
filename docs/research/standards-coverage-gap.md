# Análise de cobertura: `framework_ddc/.contexts/engineering/` × `assets/standards/`

> **Data:** 2026-06-12
> **Escopo:** validar a disparidade de contexto entre os Standards default (`assets/standards/std-*.md`)
> e a doutrina de engenharia DDC (`framework_ddc/.contexts/engineering/*`).
> **Tese investigada:** os Standards foram derivados quase exclusivamente da dimensão `rules/`,
> ignorando as demais dimensões de conhecimento de engenharia.
> **Veredito:** confirmado em três níveis (projeção dimensional, perda de fidelidade, gaps de concern).

---

## 1. Contexto e estrutura

A árvore `framework_ddc/.contexts/engineering/` tem **7 dimensões** de conhecimento:

| Dimensão | Docs | Natureza | Pipeline DevFlow correto |
|---|---|---|---|
| `rules/` | 18 | regras imperativas lintáveis | **Standards** (`std-*.md`) |
| `contracts/` | 8 | contratos de dados/interface | Standards (parcial) + knowledge |
| `practices/` | 5 | metodologias | knowledge (+ test-discipline) |
| `architecture/` | 6 | padrões arquiteturais | knowledge (+ layer-boundaries) |
| `processes/` | 8 | processos operacionais | Standards (parcial) + operations |
| `stacks/` | 25 | docs de tech versionada | docs-mcp scrape (`mcpIndexed`) |
| `decisions/` | 1 | ADRs | `devflow:adr-builder` |

Os Standards são gerados a partir da `skills/standards-builder/references/taxonomy-of-concerns.yaml`
(23 concerns), que por sua vez é uma compressão da dimensão `rules/`. Existem **três camadas** sobrepostas:

```
contracts/practices/architecture (10–40KB, doutrina profunda)   ← knowledge narrativo (DDC)
        ↓ (compilado, ≤80 linhas, sempre-ativo)
.claude/rules/*.md                                               ← interface LLM do framework_ddc
        ↓ (projetado p/ template genérico)
engineering/rules/*.md → taxonomy-of-concerns.yaml → assets/standards/std-*.md
```

---

## 2. Eixo dimensional — cobertura dos Standards por dimensão

| Dimensão | Docs | Viraram `std-*` | Cobertura |
|---|---|---|---|
| `rules/` | 18 | 17 (todos menos `development`, `governance`) | **94%** |
| `contracts/` | 8 | 2 (`schemas`, `secrets`) | 25% |
| `practices/` | 5 | ~1 (`tdd`→`test-discipline`) | 20% |
| `processes/` | 8 | 1 (`commits`→`commit-hygiene`) | 12% |
| `architecture/` | 6 | **0** | **0%** |
| `stacks/` | 25 | 0 (by design → docs-mcp) | 0% |
| `decisions/` | 1 | 0 (by design → ADR) | — |

**Conclusão:** `rules/` é a única dimensão tratada como cidadã de primeira classe.
A própria taxonomy define concerns oriundos de outras dimensões (`layer-boundaries` de
`architecture/`, `domain-events` de `contracts/events`) **mas nunca gerou arquivo** para eles.

---

## 3. Eixo de fidelidade — auditoria std×rule (17 pares mapeados)

Mesmo onde o std existe, ele é uma compressão genérica (`source: devflow-default`) que perde a
riqueza específica de stack da rule. Auditoria item-a-item dos 17 pares:

| std × rule | Compressão | Fidelidade | Maior perda |
|---|---|---|---|
| grounding × grounding | 93→38 (59%) | 🟢 Alta | só checklist procedural |
| migration × migration | 174→36 (79%) | 🟡 Média | Firestore/BigQuery, runbook, feature flags |
| internationalization × i18n | 114→38 (67%) | 🟡 Média | pipeline TMS/CI, negociação de locale, input |
| state-management × state-management | 164→37 (77%) | 🟡 Média | race/cancel, streams, persistência, reset |
| documentation × documentation | 229→38 (83%) | 🟡 Média | changelogs, diagramas, docs-para-IA, Diátaxis |
| error-handling × error-handling | 168→38 (77%) | 🟡 Média | cancelamento, streams, React/Next, adapters |
| runtime-validation × validation | 181→37 (80%) | 🟡 Média | coerção, strict mode, async, Firestore, Zod perf |
| security × security | 156→40 (74%) | 🟡 Média | headers, CSRF, Firestore Rules, webhooks, uploads |
| naming-conventions × development | recorte | 🟡 Média* | mapeamento fraco; perde anti-`IUser`/`Type` |
| test-discipline × testing | 215→39 (82%) | 🟠 Baixa-Média | pirâmide, boundaries HTTP/DB/LLM, contract, E2E |
| observability × observability | 160→36 (78%) | 🔴 Baixa | OTel mecânico, LLM observability, jobs, health |
| data-modeling × data-modeling | 214→41 (81%) | 🔴 Baixa | agregados, eventos, invariantes, PII (DDD) |
| caching × caching | 175→38 (78%) | 🔴 Baixa | HTTP headers, LLM cache, sensitive data, SWR |
| performance × performance | 181→37 (80%) | 🔴 Baixa | Next15/React19/Firestore/pgvector, Web Vitals |
| accessibility × accessibility | 191→39 (80%) | 🔴 Baixa | forms, target size WCAG 2.2, gestos, tabelas |
| api-conventions × api-design | 219→39 (82%) | 🔴 Baixa | webhooks, streaming, rate-limit headers |
| code-review × code-review | 206→38 (82%) | 🔴 Baixa | gates de segurança, 2 aprovações, review de IA |

\* Alta como recorte da seção *naming*, mas o par inteiro é enganoso: `development.md` tem 12 outras seções.

**Distribuição:** 🟢 Alta = 1 · 🟡 Média = 8 · 🟠 Baixa-Média = 1 · 🔴 Baixa = 7 → **8/17 são Baixa ou pior.**

### Achados sistêmicos (3)

1. **Fidelidade é inversamente proporcional à compressão.** `grounding` (59%, conceitual) é o único Alta;
   tudo que comprime >78% e é denso em convenções de stack vira esqueleto.
2. **A doutrina de IA/LLM é descartada de forma transversal** — irônico para um framework de orquestração
   de IA. Sumiu em ≥6 stds: observability (custo/tokens), test-discipline (LLM-as-judge), code-review
   (PRs `ai-generated`), caching (chave por modelo/temperatura), runtime-validation (validar output LLM),
   accessibility (botão "parar geração"). Também a seção "docs-para-IA" de documentation.
3. **Onde mais dói, o std é declaradamente não-enforçável.** `caching` e `code-review` têm
   `enforcement.linter: null` + `weakStandardWarning: true` — justamente os que perderam os gates
   de segurança e a doutrina operacional.

---

## 4. Eixo de concerns faltantes — backlog

O "faltante" tem **três sub-eixos distintos**:

### Eixo A — concerns definidos na taxonomy, sem `std` gerado

A taxonomy define 23 concerns; o disco tem 21 stds. Os 3 ausentes já têm `linterHints` escritos:

| Concern (id) | Dimensão-fonte | Doc-fonte | `linterHint` já definido | Esforço |
|---|---|---|---|---|
| `layer-boundaries` | architecture/ | `clean-architecture`, `ddd`, `hexagonal`, `fsd`, `feature-based`, `atomic-design` | `eslint-plugin-boundaries` / `@feature-sliced/eslint-config` | Médio |
| `domain-events` | contracts/ | `contracts/events.md` | "evento sem campo `version`"; "nome sem sufixo `Ocorreu`" | Médio |
| `pre-commit-hygiene` | (hygiene) | `processes/git.md` | "Verificar `.husky/`/`lefthook.yml`/`.pre-commit-config.yaml`" | Baixo |

> ⚠️ `pre-commit-hygiene` ≠ `commit-hygiene`. O `std-commit-hygiene` cobre **formato da mensagem**;
> `pre-commit-hygiene` (format+lint+typecheck antes do commit) é outro concern e **não tem std**.

### Eixo B — doutrina lintável que nem virou concern (candidatos a registrar na taxonomy)

| Concern proposto | Dimensão-fonte | Doc-fonte | Por que é lintável | Prioridade |
|---|---|---|---|---|
| `module-size` / `code-complexity` | practices/ | `ai-friendly-code.md`, `clean-code.md` | ESLint `max-lines` (150-500), `max-lines-per-function` (30-50), `complexity`, `max-depth` | **Alta** |
| `environment-config` | processes/ | `environments.md` | "config via `process.env`"; "sem `if (env === 'prod')` em domínio" | Média |
| `git-workflow` | processes/ | `git.md` | branch naming `<tipo>/<scope>`, no `--force` em shared (hook `pre-push`) | Baixa |

> **Órfão inverso:** `std-typescript-strict` existe **com** linter, mas **sem** entry na taxonomy
> (veio do ADR-007). A taxonomy deveria registrá-lo para ser fonte única de verdade.

### Eixo C — stds que existem mas não têm linter (gap de enforcement)

`machine/` tem **13 linters para 21 stds**. Os 8 sem linter:
`accessibility` · `caching` · `code-review` · `commit-hygiene` · `documentation` ·
`grounding` · `internationalization` · `state-management`.

Ver §5 para a especificação de enforcement de cada um.

---

## 5. Especificação de enforcement do Eixo C

**Contrato do linter (SI-4):** `filePath` em `argv[2]` → lê o arquivo → violação imprime
`VIOLATION: ...` + `exit 1`; caso contrário `exit 0`. Arg ausente / arquivo ilegível → `exit 0`
(sem falso positivo). Filosofia **conservadora**: 1–2 regex de alta confiança, não o std inteiro.

Sob esse contrato, "8 stds sem linter" **não** significa "escrever 8 linters". Os 8 se separam
por **veículo de enforcement**:

| std | Veículo correto | `machine/*.js`? | Cobertura |
|---|---|---|---|
| internationalization | file-linter (regex) | ✅ forte candidato | ~40% |
| accessibility | file-linter (regex) + jsx-a11y | ✅ forte candidato | ~30% |
| state-management | ESLint + AST | 🟡 parcial (não regex) | ~15-20% |
| documentation | file-linter (1 regex estreita) | 🟡 estreito | ~15% |
| caching | code-review + naming | 🔴 fraco (API-específico) | ~10% |
| commit-hygiene | **git hook `commit-msg`** (commitlint) | ❌ hook | ~90% via hook |
| code-review | **CI / Danger.js + branch protection** | ❌ PR-level | n/a |
| grounding | **pre-tool-use hook + `tsc --noEmit`** | ❌ prose-only by design | via tsc |

### 5.1 `internationalization` — forte candidato (~40%)

```js
/\bcount\s*===\s*1\b/                                  // plural manual
/["'](?:\$|R\$|€|£)["']\s*\+|\.toFixed\(\s*2\s*\)\s*[)+]/ // moeda concatenada
/\.toLocale(?:String|DateString|TimeString)\(\s*\)/    // Intl/Date sem locale
/margin-(?:left|right)\s*:/                             // margin físico (RTL)
```
**Não-detectável:** string hard-coded (FP alta → `eslint-plugin-react/jsx-no-literals`);
chaves sem tradução (CI `i18next-parser`); NFC.

### 5.2 `accessibility` — forte candidato (~30%)

```js
/<(?:div|span)\b[^>]*\sonClick[=\s]/          // clickable não-interativo
/tabIndex\s*=\s*["']?[1-9]/                    // tabindex positivo
/<img\b(?![^>]*\salt[=\s/>])[^>]*>/            // <img> sem alt
```
**Não-detectável:** contraste, hierarquia de heading, `aria-live`, operabilidade por teclado
→ `axe-core` em testes (runtime). Recomendar no std: `eslint-plugin-jsx-a11y` + `vitest-axe`.

### 5.3 `state-management` — precisa AST, manter `linter: null` (~15-20%)

As regras dependem de data-flow (saber que a variável veio de `useState`); regex teria FP proibitiva
(`\.push\(` casa todo array). Veículo: ESLint (`react/no-direct-mutation-state`,
`react-hooks/exhaustive-deps`) + 1 regra AST custom.

### 5.4 `documentation` — 1 regra estreita (~15%)

```js
/\/\/\s*(?:TODO|FIXME|HACK)\b(?!.*(?:#\d+|https?:\/\/|issues\/))/  // TODO sem issue/dono
```
Resto é subjetivo (porquê, comentário stale, qualidade de README).

### 5.5 `caching` — manter `linter: null` (~10%)

TTL/PII-na-chave dependem da API de cache (`redis`/`unstable_cache`/`Map`). Único alvo de baixa FP:
```js
/revalidate:\s*false/   // Next unstable_cache TTL infinito sem invalidação
```
Enforcement real = code-review + convenção de chave (`dominio:vN:...`).

### 5.6 `commit-hygiene` — é hook, não file-linter (~90%)

O próprio std diz: *"Enforcement via hook commit-msg, não linter de arquivo."* O `framework_ddc`
já tem `guard-conventional-commit`. **Gap:** a lib standalone não embarca `commitlint.config` /
hook `commit-msg`. Criar `hooks/commit-msg-guard`, não `machine/std-commit-hygiene.js`.

### 5.7 `code-review` — é CI/PR-level, não file-linter

Regras centrais (≤400 linhas, um objetivo/PR, severidade, gate de secret, 2 aprovações p/ migration)
são PR-level → **Danger.js / GitHub branch protection / CI**. Não criar `machine/std-code-review.js`.

### 5.8 `grounding` — prose-only por design

O std já declara prose-only + modo opcional `grounding.mode: docs-first|docs-only` (hook
`pre-tool-use` bloqueia WebSearch/WebFetch). A fração mecânica (import fantasma, símbolo inexistente)
é coberta por `tsc --noEmit` + `ts-prune` no CI — exatamente os `linterHints` da taxonomy.

### Conclusão do Eixo C (reenquadrada)

Dos 8 "linters faltando", **apenas 3** justificam um `machine/std-X.js` no estilo atual:
- **2 file-linters novos de alto ROI:** `internationalization` (~40%), `accessibility` (~30%)
- **1 file-linter estreito:** `documentation` (TODO-sem-issue)
- **2 ficam corretamente em `linter: null`:** `state-management` (→ ESLint+AST), `caching` (→ review)
- **3 precisam de outro veículo:** `commit-hygiene` (hook), `code-review` (Danger/CI), `grounding` (hook+tsc)

O "gap" é de **roteamento de enforcement**, não de linters não escritos.

---

## 6. Backlog priorizado consolidado

1. `pre-commit-hygiene` (Eixo A, baixo esforço, linterHint pronto) — quick win
2. `layer-boundaries` (Eixo A, alto valor — arquitetura tem 0% de cobertura hoje)
3. `domain-events` (Eixo A, linterHint pronto)
4. `module-size`/`code-complexity` (Eixo B, alta — ESLint nativo, doutrina já escrita)
5. Linter para `internationalization` (Eixo C, ~40% ROI) e `accessibility` (~30%)
6. Linters do Eixo C via veículo correto: `commit-msg` hook + Danger/CI para code-review
7. `environment-config` (Eixo B, média)
8. Registrar `typescript-strict` na taxonomy + `git-workflow` (Eixo B, baixa)

---

## 7. Recomendação estrutural

A perda de fidelidade (§3) é **parcialmente by-design**: o std é um template portável genérico, e
`stacks/`/`architecture/` narrativo/`practices` metodológico corretamente alimentam outros pipelines
(docs-mcp, knowledge, ADR). Mas duas correções são devidas:

1. **Gerar os stds que a própria taxonomy define** (`layer-boundaries`, `domain-events`,
   `pre-commit-hygiene`) — são gaps reconhecidos pela fonte geradora, não escolhas de design.
2. **Rotear o enforcement do Eixo C pelo veículo certo** em vez de deixar 8 stds com `linter: null` —
   3 viram file-linter, 3 viram hook/CI, 2 ficam `null` conscientemente documentados.

> Os relatórios brutos da auditoria de fidelidade (citações reais por seção) foram produzidos por
> 4 subagentes nesta sessão e podem ser anexados a um ADR caso a refatoração da taxonomy seja formalizada.

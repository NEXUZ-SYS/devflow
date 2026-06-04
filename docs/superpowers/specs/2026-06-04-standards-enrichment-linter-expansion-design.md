# Spec — Enriquecimento dos Standards Default + Expansão de Linters

> **DevFlow workflow:** standards-enrichment-linter-expansion · **Scale:** LARGE · **Phase:** P
> **Status:** rascunho (aguardando aprovação) · **Data:** 2026-06-04
> **Branch:** `feat/standards-enrich-linter-expansion`

## Problema

O usuário definiu seus standards de trabalho em `framework_ddc/.contexts/engineering/`
(fonte de verdade, docs de 92–656 linhas) e no tier compilado
`framework_ddc/.claude/rules/` (22 regras, ~30–46 linhas). Ao serem absorvidos no
plugin como `assets/standards/std-*.md` (20 std, ~35 linhas), houve duas questões:

1. **Suspeita de perda lintável:** a condensação teria removido substância concreta
   que impede a geração de linters. Hoje só **4 de 20** std têm linter executável.
2. **Suspeita de migração incompleta:** há **22** rules em `.claude/rules` mas só
   **20** std no plugin.

## Revalidação (investigação factual — concluída)

### R1 — A condensação é fiel ao tier do próprio usuário
Os std do plugin (~35 linhas) espelham o tier `framework_ddc/.claude/rules/`
(~30–46 linhas), **não** o tier `.contexts/` full. O par correto de
`std-api-conventions.md` (37) é `.claude/rules/api-design.md` (42), não
`contracts/api.md` (657). **Conclusão: o formato condensado não é arbitrário —
segue o design "​.contexts/ = fonte de verdade; .claude/ = interface compilada"
do próprio framework.** A migração não foi malfeita.

### R2 — Mapeamento 22 → 20 (completo)
- **17** `.claude/rules` viraram std diretamente (renames coerentes:
  api-design→api-conventions, validation→runtime-validation, testing→test-discipline,
  commits→commit-hygiene).
- **5** NÃO viraram std:
  - `environments` → camada **operations** (justificado).
  - `git` → **git-strategy** / `.devflow.yaml` (justificado).
  - `governance` → **ADR / standards-builder** meta-tooling (justificado).
  - `ai-friendly-code` → craft heuristics (tamanho de arquivo/função); fold parcial
    em naming/documentation (judgment — manter fold, surfacing de bits lintáveis).
  - **`development`** → strictness TS (`no any`, `no enum`, named export, path alias):
    **gap real**, lintável, sem casa. Omitido por ser stack-scoped (TS-only).
- **+3** std de fontes fora de `.claude/rules`: `code-review` (←.contexts/rules),
  `secret-conventions` (←contracts/secrets), `naming-conventions` (sintetizado).

### R3 — Perda lintável: parcialmente verdadeira
As regras *headline* lintáveis sobreviveram à condensação (`float`-money, `SELECT *`,
`OFFSET`, `z.any()`, `200`-com-erro). Mas a condensação **dropou um segundo tier de
regras determinísticas de baixo-FP** presentes nas tabelas "Incorreto"/anti-pattern
das fontes ricas. Estimativa: **~20–25 regras lintáveis recuperáveis** + **~6
extensões** aos 4 linters existentes. Enforcement passaria de **4 → ~12** std.

**Veredito:** a migração foi fiel e completa para o subconjunto standard-worthy; mas
há enriquecimento lintável legítimo a recuperar das fontes. Isto é uma **evolução**
(estende o conjunto curado da ADR-007 sem violar a barra de FP), não conserto de bug.

## Decisão (escopo aprovado pelo usuário — Opção 3 + 4 casos especiais)

Enriquecer **todos os 20 std** restaurando substância perdida das fontes `.contexts/`
(mantendo o formato operacional conciso, **sem** inchar para 657 linhas), e **gerar
linters** para o tier viável, dirigindo a geração pelas tabelas anti-pattern das
fontes. Mais os 4 itens especiais.

## Design

### D1 — Princípio de enriquecimento (todos os 20)
Para cada std, comparar com a(s) fonte(s) `.contexts/engineering/` e restaurar:
- Regras concretas e exemplos perdidos na seção **## Princípios** (guidance LLM).
- Linhas determinísticas de baixo-FP na tabela **## Anti-patterns** (insumo do linter).

**Invariantes:**
- Manter formato operacional: alvo **≤ ~70 linhas** por std (não restaurar o doc full).
- Frontmatter inalterado em estrutura (id, applyTo, activation, enforcement, version bump).
- Conteúdo em **pt-BR** (termos técnicos preservados).
- Nada inventado: cada regra adicionada tem origem rastreável numa fonte `.contexts/`.

### D2 — Tier de geração de linter (dirigido pela fonte)
Gerar linter **apenas** onde a regra é determinística + baixo-FP (barra ADR-007 R14:
applyTo realista + teste "conforme não dispara" + sign-off security). Tiers:

| Tier | Std | Regras-âncora |
|---|---|---|
| **ALTA** | std-data-modeling | `TIMESTAMP` sem tz, `VARCHAR(n)`, `FLOAT` money, `BIGSERIAL` PK |
| **ALTA** | std-schemas | `z.any()`, `const userSchema` lowercase, `.passthrough()` |
| **ALTA** | std-observability | `console.log` em runtime (excl. test/scripts via applyTo) |
| **MÉDIA** | std-migration | `CREATE INDEX` sem `CONCURRENTLY`, `UPDATE` sem `WHERE`, `VACUUM FULL`/`TRUNCATE` (applyTo `migrations/`) |
| **MÉDIA** | std-performance | `SELECT *`, `OFFSET`, `key={Math.random()}`, import lodash inteiro |
| **MÉDIA** | std-naming-conventions | `isNot*`, `interface I[A-Z]`, `type *Type`, `enum` TS |
| **MÉDIA** | std-runtime-validation | `process.env.X!`, `z.any()` |
| **MÉDIA** | std-api-conventions | verbo-no-path (`POST /createOrder`), `GET` com body |

**Extensões aos 4 linters existentes:**
- secret-conventions: `NEXT_PUBLIC_*​(KEY|SECRET|TOKEN|PASSWORD)`, `console.log(process.env)`
- error-handling: `catch (e) { console.log(e) }`
- security: SQL string-interpolada (template literal em query)
- test-discipline: `waitForTimeout(`, `expect(true).toBe(true)`

**Fica warn-only mesmo enriquecido:**
- std-caching — tudo semântico/contextual (FP alto); **0** regra limpa.
- std-commit-hygiene — regras determinísticas, mas o **artefato não é arquivo** que o
  linter recebe (`applyTo` não enxerga commit msg) → ver D3.
- std-documentation, std-grounding, std-code-review, std-accessibility,
  std-internationalization, std-state-management, std-error-handling(doc) — guidance
  enrichment só; sem novo linter de baixo-FP (ou já coberto).

### D3 — commit-hygiene via hook `commit-msg` (canal correto)
Conventional Commits é maximamente determinístico, mas o linter de std opera sobre
arquivos do working tree, não sobre a mensagem. Enforcement correto:
**PreToolUse `Bash(git commit*)`** (ou git `commit-msg` hook) validando tipo/escopo/
imperativo/≤72/sem ponto-final. std-commit-hygiene permanece `linter: null` e ganha
nota apontando para o hook. (O `framework_ddc/.claude/settings.json` já usa
`guard-conventional-commit` — espelhar o mecanismo.)

### D4 — `development.md` → `std-typescript-strict` (stack-scoped, opt-in)
Criar std novo `std-typescript-strict` com `applyTo: ["**/*.{ts,tsx}"]` cobrindo as
regras de strictness lintáveis de `development.md` (`: any`, `enum `, `export default`,
`../../` relative imports). **É o único default stack-scoped** — documentado como
exceção consciente ao set stack-agnostic. Linter de baixo-FP. `ai-friendly-code`
permanece fold (bits lintáveis de tamanho/`export default` surfaçados aqui e em naming).

### D5 — Sync para `devflow-standards` (obrigatório)
Todo `.md` enriquecido vai para o repo standalone **NEXUZ-SYS/devflow-standards**
(só `.md`, nunca `.js`) **antes** do próximo `/devflow update` Step 4d, senão o fetch
reverte o enriquecimento. `MANIFEST.txt` atualizado se houver std novo.

### D6 — ADR-007 → v2.1.0 (minor, Aprovado)
A v2.0.0 está `Proposto` apesar de implementada+verde. Evoluir para **v2.1.0**
(minor: estende o conjunto curado de linters de 4 → ~12 + std-typescript-strict +
canal commit-msg) e marcar **Aprovado**. Guardrails atualizados: enumerar o novo
conjunto curado; reafirmar a barra de FP; registrar que commit-hygiene é enforçado
por canal commit-msg, não linter de arquivo.

## TDD (obrigatório — RED→GREEN→REFACTOR)
Cada linter novo/estendido segue:
1. **RED:** sample violador (dispara) + sample conforme (NÃO dispara) escritos primeiro;
   teste falha sem o linter.
2. **GREEN:** implementar regex/AST conservador até passar.
3. **Barra FP:** teste "conforme não dispara" + guard ReDoS + sign-off security-auditor.
4. E2E via hook real (à la TG8): projeto-tmp sem eject, arquivo violador → VIOLATION.
Testes reais (unit + E2E), nunca content-checks. E2E destrutivo só em tmpdir.

## Escopo
- **IN:** enriquecer 20 std (.md); ~8 linters novos + 4 extensões + std-typescript-strict
  (linter); hook commit-msg para Conventional Commits; testes (unit + FP + E2E);
  ADR-007 v2.1.0; sync devflow-standards; MANIFEST; CHANGELOG/version bump.
- **OUT:** migrar `stacks/`, `architecture/`, `practices/`, contracts de DB (≠ standards,
  vão para scrape/knowledge/skills); lintar regras fuzzy (caching, N+1, measure-first);
  trazer regras de `environments`/`git`/`governance` como std (camadas corretas:
  operations/git-strategy/meta).

## Critérios de aceitação
1. Cada um dos 20 std .md enriquecido com regras rastreáveis à fonte, ≤ ~70 linhas,
   pt-BR, frontmatter válido (audit S1–S7 PASSED).
2. Linters do tier ALTA+MÉDIA implementados, cada um com: sample violador (RED→GREEN),
   sample conforme (não dispara), guard ReDoS, E2E via hook real sem eject.
3. 4 linters existentes estendidos com as regras novas + testes.
4. `std-typescript-strict` criado (applyTo TS) + linter + testes; documentado como
   exceção stack-scoped.
5. Conventional Commits enforçado por hook commit-msg; std-commit-hygiene aponta o canal.
6. ADR-007 v2.1.0 `Aprovado`, audit PASSED, supersedes/refines coerentes.
7. `.md` enriquecidos sincronizados para devflow-standards (só `.md`); MANIFEST atualizado.
8. Suíte completa verde (exceto as 2 falhas de rede pré-existentes); enforcement 4 → ~13.
9. Revalidação documentada: os 5 `.claude/rules` não-migrados com decisão registrada.

## Riscos
- **Falso-positivo de linter default** em todo projeto consumidor — mitigado pela barra
  de FP (regex conservadora + sample conforme + sign-off).
- **Inchaço dos .md** — mitigado pelo teto ≤ ~70 linhas e proibição de restaurar prosa.
- **Sync esquecido** → fetch reverte — mitigado por item explícito no plano (D5) antes de update.
- **std-typescript-strict stack-scoped** quebra premissa stack-agnostic — mitigado por
  ser opt-in e documentado como exceção única.

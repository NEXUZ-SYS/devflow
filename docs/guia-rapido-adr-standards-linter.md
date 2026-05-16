# Guia de Uso — ADR, Standards e Linter

Manual de referência da camada de contexto do DevFlow: o que são ADR, Standard e
Linter, quando criar cada um, como se encaixam no PREVC e como resolver os
problemas mais comuns. Serve como quick-start para projeto novo **e** como
referência do dia a dia.

> **30 segundos:** ADR registra *por que* (decisão). Standard registra *como o
> código deve parecer* (regra de um concern). Linter *verifica* a regra
> sozinho a cada edição. Standard nomeia **concern** (`std-runtime-validation`),
> nunca lib (`std-zod`). Cria-se com `"crie um ADR para X"` /
> `devflow standards new --concern=X`.

---

## 1. Os três artefatos

| Artefato | O que é | Pergunta que responde | Onde vive |
|---|---|---|---|
| **ADR** | registro de uma **decisão** arquitetural | *"por que escolhemos X em vez de Y?"* | `.context/adrs/NNN-adr-*.md` |
| **Standard** | uma **regra operacional** cross-cutting | *"como o código deve parecer agora?"* | `.context/standards/std-*.md` |
| **Linter** | o **sensor executável** da regra | *"este arquivo respeita o standard?"* | `.context/standards/machine/std-*.js` |

```
   ADR  ──justifica──▶  STANDARD  ──força──▶  LINTER
 (decisão)            (regra de hoje)      (verificação automática)
```

- A **ADR** diz *por que* — histórico, raramente muda, registra alternativas descartadas.
- O **Standard** diz *como* — regra viva sobre um **concern operacional** (validação de borda, tratamento de erro, naming…), **não** sobre uma lib.
- O **Linter** é o braço automático — roda sozinho quando você edita código e avisa quando a regra é violada.

> **Concern ≠ lib.** Você cria `std-runtime-validation` (concern), não `std-zod`
> (lib). A lib é detalhe que a ADR registra; a regra operacional ("valide a
> borda externa") é estável mesmo trocando Zod por Valibot. O audit **S7**
> avisa se um standard tem nome de lib.

---

## 2. Anatomia de cada artefato

### ADR — `.context/adrs/NNN-adr-<slug>-vX.Y.Z.md`

```markdown
---
type: adr
name: adr-runtime-validation-frontend
description: Zod 4.1.x como schema validation runtime no Frontend
scope: organizational
stack: Zod 4.1
category: qualidade-testes
status: Aprovado          # Proposto | Aprovado | Substituido | Descontinuado
version: 1.0.0
created: 2026-05-16
decision_kind: firm       # firm | soft
---

## Contexto      → o problema, as forças em jogo
## Decisão       → o que foi decidido (1-2 parágrafos)
## Alternativas Consideradas
## Consequências → positivas, negativas, riscos aceitos
## Guardrails    → regras verificáveis: SEMPRE / NUNCA / QUANDO…ENTÃO
## Enforcement   → como cada regra é checada (code review, lint, teste, CI)
## Evidências    → fontes oficiais, links
```

As seções **Guardrails** e **Enforcement** são o que um Standard "puxa" — o
resto é território exclusivo da ADR.

### Standard — `.context/standards/std-<concern>.md`

```markdown
---
id: std-runtime-validation
description: Validar payloads na borda externa antes de tocar lógica de domínio
version: 1.0.0
applyTo: ["**/*.ts", "**/*.tsx", "**/*.py"]   # globs SI-5 — ver §7
relatedAdrs: ["adr-runtime-validation-frontend"]
enforcement:
  linter: standards/machine/std-runtime-validation.js
weakStandardWarning: true   # true enquanto o linter for stub
---

## Princípios    → prosa operacional (NÃO copie a Decisão da ADR)
## Anti-patterns → tabela | Errado | Certo |
## Linter        → o que machine/std-X.js verifica
## Referência    → ADRs relacionadas, fontes
```

Frontmatter obrigatório: `id`, `description`, `version`, `applyTo`. Recomendado:
`relatedAdrs`, `enforcement.linter`.

### Linter — `.context/standards/machine/std-<concern>.js`

Script Node que recebe o path do arquivo em `process.argv[2]`. Exit `0` = ok;
exit `≠0` + `VIOLATION:` no stdout = violação.

```javascript
#!/usr/bin/env node
import { readFileSync } from "node:fs";

const filePath = process.argv[2];
if (!filePath) process.exit(0);
const content = readFileSync(filePath, "utf-8");

// Regra: proibir z.any() — escape de contrato.
const hits = content.match(/z\.any\(\)/g);
if (hits) {
  console.log(
    `VIOLATION: ${hits.length}× z.any() em ${filePath} — ` +
    `declare um schema explícito. Ver std-runtime-validation.`
  );
  process.exit(1);
}
process.exit(0);
```

A mensagem `VIOLATION:` é injetada no contexto do agente — inclua sempre a
**correção sugerida**, não só o erro.

---

## 3. Quando criar cada um

```
Tomei uma decisão arquitetural (framework, lib, padrão, protocolo)?
        │
        ├── SIM ─▶ crie uma ADR
        │              └─▶ a ADR tem Guardrails/Enforcement que valem como
        │                  regra contínua de código?
        │                       ├── SIM ─▶ crie/atualize um STANDARD do concern
        │                       └── NÃO ─▶ só a ADR basta
        │
        └── NÃO, é só convenção de código (naming, organização, erro…)?
                   └─▶ crie um STANDARD direto (sem ADR — concern stand-alone)

O LINTER se implementa depois, no machine/std-*.js, quando a regra for
verificável estaticamente.
```

- **ADR sem Standard** é normal — nem toda decisão vira regra de lint.
- **Standard sem ADR** é normal — concerns cross-cutting (`std-error-handling`, `std-naming-conventions`) não precisam de decisão registrada.
- **Standard com Linter** é o ideal — enquanto o linter for stub, mantenha `weakStandardWarning: true` (débito visível, não bloqueia).

---

## 4. Fio condutor: um concern do início ao fim

Acompanhe **um** concern — `runtime-validation` — da decisão ao linter pegando o erro:

```
1. DECISÃO
   "Vamos validar todo I/O externo com Zod."
        │
2. ADR  "crie um ADR para adoção de Zod na validação de borda"
        → .context/adrs/009-adr-zod-frontend-v1.0.0.md
          Guardrails:  - NUNCA z.any() fora de packages/contracts/internal/**
          Enforcement: - [ ] Lint proíbe z.any()
        │
3. STANDARD  (adr-builder Step 5e sugere; você confirma)
   devflow standards new --concern=runtime-validation --enrich-from-adr=009
        → .context/standards/std-runtime-validation.md
          (Princípios operacional + Anti-patterns + Linter seedado do Enforcement)
        → .context/standards/machine/std-runtime-validation.js  (stub)
        │
4. LINTER  você implementa a regra "proibir z.any()" no machine/*.js
        → remove weakStandardWarning quando a regra estiver real
        │
5. USO   você edita src/api/user.ts e escreve `z.any()`
        → hook PostToolUse casa applyTo (**/*.ts) → roda o linter
        → "VIOLATION: 1× z.any() em src/api/user.ts — declare um schema…"
        → a mensagem chega no seu contexto na hora da edição
```

Depois do primeiro ciclo o padrão se repete: decisão → ADR → (talvez) Standard → Linter.

---

## 5. O dia a dia dentro do PREVC

| Fase | ADR / Standard / Linter |
|---|---|
| **P — Planning** | `adr-filter` seleciona só as ADRs relevantes à task (reduz ruído). Se a task **toma** decisão nova → registre ADR. |
| **R — Review** | Revisa se o plano respeita os Guardrails das ADRs ativas. |
| **E — Execution** | A cada `Edit`/`Write`, o hook PostToolUse roda os linters dos standards cujo `applyTo` casa o arquivo — `VIOLATION:` na hora. |
| **V — Validation** | Step 2.5: código cumpre Guardrails das ADRs. Step 2.6: ADRs tocadas passam audit estrutural. Standards passam audit S1-S7. |
| **C — Confirmation** | Mudou ADR/Standard? Entra no README + bump de versão. |

## 6. Uso ad-hoc (fora de um PREVC completo)

Nem todo uso é um workflow inteiro. Para ações pontuais, fale direto com o Claude:

- *"registra a decisão de usarmos Postgres"* → cria ADR
- *"audita o std-error-handling"* → roda audit S1-S7 inline
- *"esse std-vitest está lib-centric, migra para concern"* → modo MIGRATE
- *"quais ADRs falam de validação?"* → `search --by-concern`

O linter **nunca** é ad-hoc — é sempre automático no PostToolUse.

---

## 7. Como o linter é selecionado e roda

O linter **não é uma skill** — é um mecanismo hook + lib, disparado a cada `Edit`/`Write`:

```
1. CARGA    standards-loader carrega .context/standards/*.md
            (pula README, machine/, e standards deprecated:true)
2. FILTRO   findApplicableStandards: casa o path editado contra o
            applyTo de cada standard
3. ENFORCE  run-linter roda machine/std-X.js dos que casaram
            → VIOLATION: injetado no contexto
```

**Sandbox SI-4** (5 verificações antes de executar qualquer linter):
1. Path normalizado (sem `..`, sem absoluto, sem metacaracteres de shell)
2. Allowlist — resolvido deve estar em `.context/standards/machine/**`
3. Symlink check pós-`realpath`
4. Invocação via `execFile('node', …)` — nunca shell
5. Timeout 5s + buffer 1MB

Linter que falha qualquer verificação é **silenciosamente pulado** (log em stderr).

### `applyTo` — subset de glob SI-5

Só estes padrões são aceitos (validados no load time):

| Padrão | Significado |
|---|---|
| `**` | qualquer profundidade (zero ou mais segmentos) |
| `*` | um único segmento |
| `?` | um caractere |
| `{a,b,c}` | alternativas |

**Rejeitado:** negação `!`, extglob `+(...)`, `@(...)`, `*(...)`, `?(...)`, `!(...)`.
Liste o que **se aplica**, nunca o que se exclui.

---

## 8. Cheat sheet

Há duas interfaces. No dia a dia, **converse com o Claude** (dispara as skills);
a **CLI** é para scripts e automação.

**ADR** — skill `devflow:adr-builder` / comando `/devflow-adr`

| Quero… | Diga ao Claude |
|---|---|
| Registrar uma decisão | `"crie um ADR para <decisão>"` |
| Auditar uma ADR (12 checks) | `"audita a ADR-001"` |
| Evoluir uma ADR | `"evolve a ADR-001 para minor"` |

**Standard** — skill `devflow:standards-builder` / CLI `devflow standards …`

| Quero… | CLI |
|---|---|
| Criar standard de um concern | `devflow standards new --concern=<id>` |
| Criar + puxar guardrails de ADRs | `devflow standards new --concern=<id> --enrich-from-adr=<csv>` |
| Auditar um standard (S1-S7) | `devflow standards audit <id>` |
| Achar ADRs de um concern | `devflow standards search --by-concern=<id>` |
| Achar standards que citam uma ADR | `devflow standards search --by-guardrail=<adr-slug>` |
| Migrar standard lib-centric → concern | `devflow standards new --migrate=<lib>` |
| Validar todos os standards | `devflow standards verify` |

> `--from-adr` (1 standard por lib) ainda existe mas é **legado** — emite
> warning e gera standards lib-centric. Prefira `--concern`.

**Linter** — sem comando; roda no hook. Para testar à mão:

```bash
node .context/standards/machine/std-<id>.js <arquivo>
# exit 0 = ok · exit 1 + "VIOLATION:" = violação
```

### Audit do standard — os 7 checks

| Check | Verifica | Bloqueia? |
|---|---|---|
| S1 | frontmatter completo (id, applyTo, version, enforcement) | sim |
| S2 | sem placeholders de scaffold (TODO, `<…>`, `scaffolded:true`) | sim |
| S3 | arquivo do linter existe em `machine/` | sim |
| S4 | `relatedAdrs` apontam para ADRs reais | sim |
| S5 | `applyTo` passa o subset SI-5 | sim |
| S6 | libs versionadas citadas têm ref em `stacks/refs/` | sim* |
| S7 | **concern alignment** — id não é nome de lib | não (WARN) |

\* S6 é configurável via `.devflow.yaml` (`standards.s6Level: warn`).

---

## 9. Troubleshooting

| Sintoma | Causa provável / correção |
|---|---|
| **O linter não rodou** ao editar | (a) o arquivo não casa nenhum `applyTo`; (b) não há `.context/standards/` no projeto; (c) o linter foi rejeitado por SI-4 (path fora de `machine/`, não-Node, metacaractere) — veja stderr; (d) o standard está `deprecated: true`. |
| `devflow standards verify` diz **`weak-standard: std-X`** | O standard não tem `enforcement.linter` **e** não tem `weakStandardWarning: true`. Adicione um ou outro. |
| `audit` retorna **`Gate: BLOCKED`** | Algum S1-S6 deu FAIL — a tabela do output diz qual. S2 costuma ser placeholder esquecido; S4, slug de ADR errado. |
| `audit` mostra **S7 WARN** | O standard é lib-centric (id casa uma lib). Rode `devflow standards new --migrate=<lib>` para gerar o equivalente concern. |
| Criei um standard e ele tem **TODO/placeholder** | Você usou o scaffold puro (`devflow standards new <id>` sem `--concern`). Refaça com `--concern=<id>`. |
| ADR `Aprovado` editada **trava a Validation** | Edição de ADR Aprovada exige bump de `version`. Use o modo EVOLVE (`"evolve a ADR-N"`). |

---

## 10. Erros comuns

| Erro | Correção |
|---|---|
| Criar `std-zod`, `std-pytest` (nome de lib) | Use o concern: `std-runtime-validation`, `std-test-discipline`. |
| Copiar a `## Decisão` da ADR para o `## Princípios` do standard | Standard tem prosa própria (operacional). A ADR só alimenta `## Linter` via Guardrails/Enforcement. |
| Standard sem linter e sem `weakStandardWarning` | Declare `weakStandardWarning: true` OU implemente o linter. |
| `applyTo` com `!` ou extglob | Só o subset SI-5 (§7). Liste o que se aplica. |
| Linter que escreve no filesystem ou faz rede | Linter é leitor estático. Use `VIOLATION:` no stdout; deixe o agente aplicar a correção. |
| Achar que o linter roda em qualquer pasta | SI-4: só `.context/standards/machine/**`, só Node, timeout 5s. |

---

## Referência

- Standards — guia de autoria: `.context/standards/README.md`
- ADRs — índice e template: `.context/adrs/README.md`, `.context/templates/adrs/TEMPLATE-ADR.md`
- Decisão arquitetural da camada: ADR-002 (`adopt-standards-triple-layer`)
- Skills: `devflow:adr-builder`, `devflow:standards-builder`, `devflow:adr-filter`
- Invariantes de segurança: SI-4 (sandbox de linter), SI-5 (subset de glob)

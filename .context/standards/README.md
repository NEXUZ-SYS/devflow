# Standards do DevFlow

Standards são **regras vivas**: prosa para humanos + frontmatter LLM-readable + linter executável (opcional). Vivem em `.context/standards/<id>.md` (canonical desde v1.0). Linters de standards vão para `.context/standards/machine/<id>.js`.

> Diferença de ADRs: ADRs registram **decisões** (por que X foi escolhido sobre Y); standards são **regras operacionais** (como o código deve parecer agora). Os dois coexistem — ADR justifica, standard aplica. Veja ADR-002 (`adopt-standards-triple-layer`) para a decisão arquitetural completa.

---

## O que é um Standard

Um arquivo `.context/standards/<id>.md` com:

1. **Frontmatter** declarando `id`, `applyTo` (glob subset), opcionalmente `enforcement.linter` e `relatedAdrs`
2. **Corpo Markdown** em prosa explicando princípios, anti-patterns, exemplos
3. **Linter executável** (opcional) em `.context/standards/machine/<id>.js`, invocado pelo PostToolUse hook

DevFlow consume standards via `scripts/lib/standards-loader.mjs` (Task 1.2). O hook PostToolUse (Task 1.3) roda os linters automaticamente quando arquivo editado bate `applyTo` glob.

---

## Frontmatter obrigatório

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | string | sim | identificador único, prefixo `std-` recomendado (ex: `std-error-handling`) |
| `description` | string | sim | uma linha resumindo o standard |
| `version` | semver | sim | versão do standard (bumpa quando regra muda materialmente) |
| `applyTo` | string[] | sim | globs (subset SI-5: `**`, `*`, `?`, `{a,b}` — sem negação ou extglob) |
| `relatedAdrs` | string[] | recomendado | IDs de ADRs que justificam este standard |
| `enforcement.linter` | string | recomendado | path para `.context/standards/machine/<linter>.js` |
| `enforcement.archTest` | string | não | path para teste arquitetural (vitest/jest/etc.) |
| `weakStandardWarning` | bool | não | quando `true`, suprime o warning de weak-standard mesmo sem linter |

### Exemplo mínimo

```yaml
---
id: std-error-handling
description: Como erros são lançados, capturados e propagados
version: 1.0.0
applyTo: ["src/**/*.ts", "src/**/*.tsx"]
relatedAdrs: [ADR-009-error-handling-strategy]
enforcement:
  linter: standards/machine/std-error-handling.js
  archTest: src/__tests__/architecture/error-handling.test.ts
---
```

---

## applyTo (glob subset)

Apenas o subset suportado por `scripts/lib/glob.mjs` (SI-5):

| Pattern | Significado |
|---|---|
| `**` | qualquer profundidade (zero ou mais segmentos) |
| `*` | um único segmento |
| `?` | um caractere |
| `{a,b,c}` | alternativas |

**NÃO suportado** (rejeitado por `validateSubset()` no load time):
- `!negação`
- `+(...)`, `@(...)`, `*(...)`, `?(...)`, `!(...)` (extglob)

Exemplos válidos:
- `**/*.ts` — todo TypeScript em qualquer profundidade
- `src/**` — qualquer arquivo sob `src/`
- `src/{api,lib}/*.ts` — TypeScript direto em `src/api/` ou `src/lib/`
- `src/middleware.ts` — exato

---

## Linter executável (SI-4 sandboxing)

Linters vivem em `.context/standards/machine/<id>.js` e são invocados como:

```bash
node .context/standards/machine/<id>.js <filePath>
```

Recebem o path do arquivo editado em `process.argv[2]`. Saem com:

| Exit code | Significado | Output esperado |
|---|---|---|
| `0` | OK (sem violação) | (vazio ou silencioso) |
| `!=0` | Violação detectada | stdout deve conter `VIOLATION: <mensagem com import corretivo>` |

A mensagem do linter é injetada no contexto do agent (positive prompt injection) — inclua **patches sugeridos** ou **imports corretivos** quando possível.

### Constraints de segurança (SI-4 — obrigatório)

DevFlow aplica **5 verificações** antes de invocar qualquer linter:

1. **Path normalization** — rejeita `..`, leading `/`, whitespace, `;`, `|`, `&`, `$`, backticks, redirects
2. **Allowlist** — path resolvido via `realpathSync` deve começar com `<projectRoot>/.context/standards/machine/`
3. **Symlink check** — após `realpath`, re-verifica que ainda está dentro de `machine/`
4. **Invocação via execFile** — `execFile('node', [linterPath, filePath])` — NUNCA shell, NUNCA `exec`
5. **Timeout + maxBuffer** — 5s timeout, 1MB stdout buffer

Linters que falharem qualquer dessas verificações são **silenciosamente pulados** (com log em stderr). NUNCA executados.

> Veja `scripts/lib/run-linter.mjs` (criado em Task 1.3) para a implementação completa do sandbox.

### Exemplo de linter mínimo

```javascript
#!/usr/bin/env node
// .context/standards/machine/std-error-handling.js
import { readFileSync } from "node:fs";

const filePath = process.argv[2];
const content = readFileSync(filePath, "utf-8");

// Reject `throw new Error(...)` — domain errors should extend BaseError
const matches = content.match(/throw\s+new\s+Error\s*\(/g);
if (matches) {
  console.log(
    `VIOLATION: ${matches.length} raw 'throw new Error(...)' found. ` +
    `Replace with domain error class extending BaseError ` +
    `(import from src/errors). See .context/standards/std-error-handling.md.`
  );
  process.exit(1);
}
process.exit(0);
```

---

## Anti-patterns

| Padrão errado | Por quê | Como corrigir |
|---|---|---|
| Standard sem `linter` AND sem `weakStandardWarning: true` | Vira papel de parede; ninguém roda | Adicionar linter OU declarar warning como aceito |
| `applyTo: ["**/*"]` | Standard "global" — quase sempre genérico demais | Restringir a stack/camada específica |
| Linter que escreve no filesystem | Linter é leitor, não editor | Use stdout `VIOLATION:` para sugerir mudança; deixe agent aplicar |
| Linter que faz HTTP/network | Não-determinístico + lento + risco de SSRF | Standards são estáticos por design |
| Linter referenciando `bash`, `python`, `ruby`, etc. | SI-4 só permite Node | Reescreva em Node (libs builtin disponíveis) |
| `applyTo: ["!**/test/**"]` (negação) | SI-5 rejeita | Inverta a lógica: liste o que se aplica explicitamente |
| Linter com `process.exit(0)` mesmo em violação | Hook não detecta — silencioso | Sempre `process.exit(1)` quando há `VIOLATION` no output |

---

## Como criar

```bash
# Scaffold automático (recomendado)
devflow standards new error-handling

# Cria:
#   .context/standards/std-error-handling.md          (markdown + frontmatter)
#   .context/standards/machine/std-error-handling.js  (linter template)
```

Ou manualmente: copie o exemplo acima para `.context/standards/<id>.md` e edite.

---

## Como validar

```bash
# Verifica todos os standards
devflow standards verify

# --strict: exit !=0 se houver weak-standards
devflow standards verify --strict

# Verifica um específico
devflow standards verify std-error-handling
```

`devflow standards verify` checa:

- Frontmatter completo (id, applyTo, version)
- `applyTo` patterns passam `validateSubset()` (SI-5)
- Linter path (se declarado) está em `.context/standards/machine/**`
- Linter file existe e é Node (`.js`)
- `relatedAdrs` referenciam ADRs reais (cross-reference)
- Versão é semver válido

Standards sem linter geram warning `weak-standard: <id>`. Em `--strict`, isso é exit !=0.

---

## Referência

- ADR-002: `.context/adrs/002-adopt-standards-triple-layer-v1.0.0.md` — decisão arquitetural completa
- Loader lib: `scripts/lib/standards-loader.mjs`
- Hook integration: `hooks/post-tool-use` (PostToolUse linter execution)
- CLI: `scripts/devflow-standards.mjs` (`devflow standards new|verify`)
- Security invariants:
  - SI-4 (linter sandboxing) — `.context/plans/context-layer-v2.md`
  - SI-5 (glob subset) — `.context/plans/context-layer-v2.md`
- Spec original: `docs/devflow-context-layer-validation-v2-pt-br.md` §5.6 (exemplo `error-handling.md`)

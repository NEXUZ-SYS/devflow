# Revisão multi-versão dos artefatos Odoo (12–18) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **DevFlow workflow:** odoo-multiversion-artifacts | **Scale:** LARGE | **Phase:** E
> **Spec:** `docs/superpowers/specs/2026-06-17-odoo-multiversion-artifacts-review-design.md`

**Goal:** Reestruturar os artefatos Odoo do plugin DevFlow em 3 camadas (core genérico 12–18 / localização BR / overlay NXZ), com gating por profile NXZ composto, validado por uma suíte de lint que falha antes e passa depois (TDD).

**Architecture:** Uma suíte de lint Node (`node --test`) codifica os 8 critérios de qualidade do spec e roda contra os arquivos do plugin. Cada grupo de tarefas escreve/estende uma asserção que falha (RED), reestrutura o artefato e a torna verde (GREEN). A separação de camadas é feita movendo conteúdo de skills/agente/standards monolíticos para skills L1/L2/L3 e um profile NXZ novo; a distribuição seletiva é garantida por uma regra de detecção NXZ em `detect-framework.mjs`.

**Tech Stack:** Node 24 (ESM, `node:test`, `node:assert/strict`, sem deps externas), Markdown (skills/standards), YAML (profiles/stacks via `scripts/lib/frontmatter.mjs#parseYaml`).

## Global Constraints

- Idioma de todo conteúdo gerado (skills, standards, agente, narrativos): **pt-BR**; termos técnicos mantidos. (verbatim do spec)
- Cobertura de versão L1: citar explicitamente **12, 13, 14, 15, 16, 17, 18**. (verbatim do spec)
- **Zero** path absoluto / nome de DB / porta / service-name Docker em L1 e L2. (critério 2)
- L1 não menciona `nxz_*` nem `l10n_br`; L2 não menciona `nxz_*`; conteúdo NXZ só em L3. (critério 3)
- Grounding híbrido: toda tabela de breaking-change tem ponteiro `search_docs`/`find_version` ou fonte OCA. (critério 5)
- Testes via `node --test`; qualquer simulação de sync roda **em tmpdir**, nunca in-place. (estratégia de testes)
- Não migrar/alterar código de módulos Odoo, módulos OCA, nem servidores MCP Odoo. (fora de escopo)
- Linters/standards: contrato SI-4 — stdout `VIOLATION: ... ` + exit 1.

---

## File Structure

**Criar:**
- `tests/odoo-artifacts/lib/artifact-lint.mjs` — helpers puros de lint (parse front-matter, scan de versões, scan de acoplamento de env, numeração de seções, cross-refs). Sem I/O de processo; recebe conteúdo/paths.
- `tests/odoo-artifacts/version-coverage.test.mjs` — critério 1.
- `tests/odoo-artifacts/env-coupling.test.mjs` — critério 2.
- `tests/odoo-artifacts/layer-separation.test.mjs` — critério 3.
- `tests/odoo-artifacts/structural-integrity.test.mjs` — critério 4.
- `tests/odoo-artifacts/grounding.test.mjs` — critério 5.
- `tests/odoo-artifacts/cross-refs.test.mjs` — critério 6.
- `tests/odoo-artifacts/frontmatter.test.mjs` — critério 7.
- `tests/integration/test-profile-nxz-integrity.mjs` — critério 8 (espelha `test-profile-standards-integrity.mjs`).
- `tests/odoo-artifacts/detect-nxz.test.mjs` — detecção NXZ.
- `skills/odoo-l10n-br/SKILL.md` (+ `references/`) — L2.
- `skills/odoo-nxz-overlay/SKILL.md` (+ `references/`) — L3.
- `profiles/nxz.yaml` — gating L3.
- `assets/standards/profiles/nxz/` (MANIFEST.txt + 2 std `.md` + `machine/*.js`) — standards NXZ.
- `assets/stacks/backend/odoo.md` — narrativo + ponteiros docs-mcp 12–18.

**Modificar:**
- `skills/odoo-development/SKILL.md` — L1 (numeração, 12/13, des-NXZ, des-BR, grounding).
- `skills/frontend-specialist-odoo/SKILL.md` + `references/*` — L1 (des-"18-only", 12–17, des-NXZ).
- `agents/odoo-specialist.md` — des-acoplar env.
- `assets/standards/profiles/odoo/` — limpar "vs NXZ"; remover os 2 std migrados; atualizar MANIFEST.
- `profiles/odoo.yaml` — adicionar skill `odoo-l10n-br`; completar stacks 13/14/15/16; remover stds migrados.
- `scripts/lib/detect-framework.mjs` — `detect.dirPrefixes` + `detect.manifestContent` + agregar `standards`/`stacks`.

---

## Task 1: Lint harness — helpers + critério de cobertura de versão

**Agent:** test-writer
**Files:**
- Create: `tests/odoo-artifacts/lib/artifact-lint.mjs`
- Create: `tests/odoo-artifacts/version-coverage.test.mjs`

**Interfaces:**
- Produces: `parseFrontmatter(text) -> {data, body}`; `versionsCovered(text) -> Set<string>` (detecta tokens `12`–`18` em contextos de versão Odoo, ex.: `Odoo 12`, `12.0`, `| 12 |`); `REQUIRED_VERSIONS = ["12","13","14","15","16","17","18"]`; `L1_FILES` (paths absolutos via `resolve(REPO, ...)` para os 2 SKILL.md core + refs).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/odoo-artifacts/version-coverage.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { versionsCovered, REQUIRED_VERSIONS, L1_FILES } from "./lib/artifact-lint.mjs";

describe("L1 cobre Odoo 12–18", () => {
  for (const file of L1_FILES.skills) {
    it(`${file} cita todas as versões 12–18`, () => {
      const text = readFileSync(file, "utf-8");
      const found = versionsCovered(text);
      const missing = REQUIRED_VERSIONS.filter((v) => !found.has(v));
      assert.deepEqual(missing, [], `versões ausentes em ${file}: ${missing.join(", ")}`);
    });
  }
});
```

- [ ] **Step 2: Write the helper lib**

```javascript
// tests/odoo-artifacts/lib/artifact-lint.mjs
import { resolve } from "node:path";
import { parseYaml } from "../../../scripts/lib/frontmatter.mjs";

export const REPO = resolve(import.meta.dirname, "../../..");
export const REQUIRED_VERSIONS = ["12", "13", "14", "15", "16", "17", "18"];

export const L1_FILES = {
  skills: [
    resolve(REPO, "skills/odoo-development/SKILL.md"),
    resolve(REPO, "skills/frontend-specialist-odoo/SKILL.md"),
  ],
};

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: null, body: text };
  return { data: parseYaml(m[1]), body: m[2] };
}

// Detecta versões Odoo citadas: "Odoo 12", "12.0", "| 12 |", "12→"/"12to"/"12->",
// e ranges "12-14"/"12–18"/"12 a 18" (cobre o extremo inferior/superior do range).
export function versionsCovered(text) {
  const found = new Set();
  for (const v of REQUIRED_VERSIONS) {
    const re = new RegExp(
      `(odoo\\s*${v}\\b` +              // "Odoo 12"
      `|\\b${v}\\.0\\b` +               // "12.0"
      `|\\|\\s*${v}\\s*\\|` +           // "| 12 |"
      `|\\b${v}\\s*(?:→|–|-|->|-->|to)\\s*\\d` +  // "12→13" "12-14" "15to18"
      `|\\b\\d+\\s*(?:→|–|-|->|-->|to|a)\\s*${v}\\b)`, // range terminando em v
      "i"
    );
    if (re.test(text)) found.add(v);
  }
  return found;
}
```

- [ ] **Step 3: Run test to verify it fails (RED)**

Run: `node --test tests/odoo-artifacts/version-coverage.test.mjs`
Expected: FAIL — `frontend-specialist-odoo/SKILL.md` não cita 12/13/14/16/17; `odoo-development/SKILL.md` não cita 12/13.

- [ ] **Step 4: Commit (apenas o harness em RED)**

```bash
git add tests/odoo-artifacts/
git commit -m "test(odoo): harness de lint + critério de cobertura de versão (RED)"
```

> A correção que torna este teste verde acontece nas Tasks 5 e 6 (reescrita de L1). Mantemos o teste vermelho commitado como guard, padrão TDD.
>
> **N2 — gate de verde diferido:** em execução subagent-driven com "todos os testes passam por task", as Tasks 1–2 ficam RED de propósito até a Task 6. O gate de suíte **inteira verde** só é exigido ao fim da Task 6 (e re-confirmado na Task 11). Até lá, cada task valida apenas os arquivos de teste do seu próprio escopo (comandos `node --test <arquivo>` específicos por task), não a suíte completa.

---

## Task 2: Critérios de acoplamento de env, separação de camadas, numeração, grounding, cross-refs, front-matter

**Agent:** test-writer
**Files:**
- Modify: `tests/odoo-artifacts/lib/artifact-lint.mjs`
- Create: `tests/odoo-artifacts/env-coupling.test.mjs`, `layer-separation.test.mjs`, `structural-integrity.test.mjs`, `grounding.test.mjs`, `cross-refs.test.mjs`, `frontmatter.test.mjs`

**Interfaces:**
- Consumes: `parseFrontmatter`, `REPO`, `L1_FILES` (Task 1).
- Produces: `envCouplingHits(text) -> string[]` (paths absolutos `/home/`, `~/`, DBs `odoo14-migration`/`odoo18-nxz`, portas `:8069`, `service: app`/`compose exec ... app`); `nxzHits(text) -> string[]`; `l10nBrHits(text) -> string[]`; `sectionNumbers(body) -> number[]` (headers `## N.`); `referencedRefs(body) -> string[]` (paths `references/x.md`); `L2_FILES`, `L3_FILES`, `ALL_ARTIFACTS`.

- [ ] **Step 1: Add helpers**

```javascript
// append to tests/odoo-artifacts/lib/artifact-lint.mjs
import { readdirSync } from "node:fs";
import { join } from "node:path";

export const L2_FILES = { skills: [resolve(REPO, "skills/odoo-l10n-br/SKILL.md")] };
export const L3_FILES = { skills: [resolve(REPO, "skills/odoo-nxz-overlay/SKILL.md")] };

// Standards que PERMANECEM no profile odoo (L1/L2) — devem ficar livres de NXZ.
export function l1Standards() {
  const dir = resolve(REPO, "assets/standards/profiles/odoo");
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".md") && f.startsWith("std-"))
      .map((f) => join(dir, f));
  } catch { return []; }
}

// Nomes de classe/domínio NXZ que NÃO citam o prefixo nxz_ mas são NXZ-específicos.
export const NXZ_CLASS_NAMES = ["NfceProcessor"];

const ENV_PATTERNS = [
  /\/home\/[a-z]/i, /~\/Documentos/, /\bodoo14-migration\b/, /\bodoo18-nxz\b/,
  /:8069\b/, /compose\s+exec\b.*\bapp\b/, /service\s*name\s*[:=]\s*app/i,
];
export function envCouplingHits(text) {
  return ENV_PATTERNS.filter((re) => re.test(text)).map(String);
}
// B2: pega `nxz_*`, `nxz-*` E "nxz"/"NXZ" como palavra solta, + nomes de classe NXZ.
export function nxzHits(text) {
  const hits = (text.match(/\bnxz\b/gi) || []).concat(text.match(/\bnxz[_-][a-z0-9_]+/gi) || []);
  for (const name of NXZ_CLASS_NAMES) {
    if (new RegExp(`\\b${name}\\b`).test(text)) hits.push(name);
  }
  return hits;
}
export function l10nBrHits(text) {
  return (text.match(/\bl10n_br[_a-z0-9]*/gi) || []);
}
export function sectionNumbers(body) {
  return [...body.matchAll(/^##\s+(\d+)\./gm)].map((m) => Number(m[1]));
}
// B3: cada `### N.M` deve herdar o N do `## N.` pai mais recente.
// Retorna lista de violações { sub, parent } onde sub.major !== parent.
export function subsectionMismatches(body) {
  const lines = body.split("\n");
  let parent = null;
  const bad = [];
  for (const line of lines) {
    const h2 = line.match(/^##\s+(\d+)\./);
    if (h2) { parent = Number(h2[1]); continue; }
    const h3 = line.match(/^###\s+(\d+)\.(\d+)/);
    if (h3 && parent !== null && Number(h3[1]) !== parent) {
      bad.push({ sub: `${h3[1]}.${h3[2]}`, parent });
    }
  }
  return bad;
}
export function referencedRefs(body) {
  return [...body.matchAll(/references\/([a-z0-9-]+\.md)/gi)].map((m) => m[1]);
}
```

- [ ] **Step 2: Write the env-coupling test (criterion 2)**

```javascript
// tests/odoo-artifacts/env-coupling.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { envCouplingHits, L1_FILES, L2_FILES } from "./lib/artifact-lint.mjs";

describe("L1+L2 sem acoplamento de ambiente", () => {
  for (const file of [...L1_FILES.skills, ...L2_FILES.skills]) {
    it(`${file} não tem path/DB/porta/service hardcoded`, () => {
      if (!existsSync(file)) return; // L2 criada na Task 3
      const hits = envCouplingHits(readFileSync(file, "utf-8"));
      assert.deepEqual(hits, [], `acoplamento de env em ${file}: ${hits.join(", ")}`);
    });
  }
});
```

- [ ] **Step 3: Write the layer-separation test (criterion 3)**

```javascript
// tests/odoo-artifacts/layer-separation.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { nxzHits, l10nBrHits, l1Standards, L1_FILES, L2_FILES } from "./lib/artifact-lint.mjs";

describe("separação de camadas", () => {
  // L1 skills: sem nxz (palavra solta, prefixo ou nome de classe) nem l10n_br.
  for (const file of L1_FILES.skills) {
    it(`${file} (L1 skill) sem nxz/l10n_br`, () => {
      const text = readFileSync(file, "utf-8");
      assert.deepEqual(nxzHits(text), [], `nxz em L1: ${file}`);
      assert.deepEqual(l10nBrHits(text), [], `l10n_br em L1: ${file}`);
    });
  }
  // I2: standards que permanecem no profile odoo também ficam livres de nxz.
  for (const file of l1Standards()) {
    it(`${file} (L1 standard) sem nxz`, () => {
      assert.deepEqual(nxzHits(readFileSync(file, "utf-8")), [], `nxz em std odoo: ${file}`);
    });
  }
  // L2: sem nxz. Guard existsSync — L2 é criada na Task 3.
  for (const file of L2_FILES.skills) {
    it(`${file} (L2) sem nxz`, () => {
      if (!existsSync(file)) return;
      assert.deepEqual(nxzHits(readFileSync(file, "utf-8")), [], `nxz em L2: ${file}`);
    });
  }
});
```

- [ ] **Step 4: Write structural-integrity, grounding, cross-refs, frontmatter tests**

```javascript
// tests/odoo-artifacts/structural-integrity.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFrontmatter, sectionNumbers, subsectionMismatches, L1_FILES } from "./lib/artifact-lint.mjs";

describe("integridade estrutural", () => {
  for (const file of L1_FILES.skills) {
    it(`${file}: H2 monotônico e sem duplicata`, () => {
      const { body } = parseFrontmatter(readFileSync(file, "utf-8"));
      const nums = sectionNumbers(body);
      const sorted = [...nums].sort((a, b) => a - b);
      assert.deepEqual(nums, sorted, `H2 fora de ordem em ${file}: ${nums.join(",")}`);
      assert.equal(new Set(nums).size, nums.length, `H2 duplicado em ${file}: ${nums.join(",")}`);
    });
    it(`${file}: subseções coerentes com o pai (### N.M sob ## N.)`, () => {
      const { body } = parseFrontmatter(readFileSync(file, "utf-8"));
      const bad = subsectionMismatches(body);
      assert.deepEqual(bad, [], `subseção fora do pai em ${file}: ${JSON.stringify(bad)}`);
    });
  }
});
```

> **B3 — este teste fica RED de verdade contra o arquivo atual:** `odoo-development/SKILL.md` tem `### 5.1`–`### 5.5` sob `## 6. Odoo 15 POS` (o defeito que o diagnóstico §2 aponta). A Task 5 corrige a numeração das subseções.

```javascript
// tests/odoo-artifacts/grounding.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { L1_FILES } from "./lib/artifact-lint.mjs";

const POINTER = /(search_docs|find_version|github\.com\/oca|odoo\.com\/documentation)/i;

describe("grounding híbrido: L1 aponta para fonte versionada/OCA", () => {
  for (const file of L1_FILES.skills) {
    it(`${file} contém ponteiro de grounding`, () => {
      assert.ok(POINTER.test(readFileSync(file, "utf-8")), `sem ponteiro em ${file}`);
    });
  }
});
```

```javascript
// tests/odoo-artifacts/cross-refs.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { parseFrontmatter, referencedRefs, L1_FILES, L2_FILES, L3_FILES } from "./lib/artifact-lint.mjs";

describe("cross-refs resolvem", () => {
  for (const file of [...L1_FILES.skills, ...L2_FILES.skills, ...L3_FILES.skills]) {
    it(`refs citadas em ${file} existem`, () => {
      if (!existsSync(file)) return; // skills L2/L3 criadas em tasks posteriores
      const { body } = parseFrontmatter(readFileSync(file, "utf-8"));
      for (const ref of referencedRefs(body)) {
        const p = resolve(dirname(file), "references", ref);
        assert.ok(existsSync(p), `ref quebrada: ${ref} em ${file}`);
      }
    });
  }
});
```

```javascript
// tests/odoo-artifacts/frontmatter.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { parseFrontmatter, L1_FILES, L2_FILES, L3_FILES } from "./lib/artifact-lint.mjs";

describe("front-matter válido", () => {
  for (const file of [...L1_FILES.skills, ...L2_FILES.skills, ...L3_FILES.skills]) {
    it(`${file}`, () => {
      if (!existsSync(file)) return;
      const { data } = parseFrontmatter(readFileSync(file, "utf-8"));
      assert.ok(data && data.name, `front-matter sem 'name' em ${file}`);
    });
  }
});
```

- [ ] **Step 5: Run all (RED)**

Run: `node --test tests/odoo-artifacts/`
Expected: FAIL — env-coupling (frontend tem `nxz`, agente env), layer-separation (65 nxz em odoo-development), structural-integrity (numeração quebrada), grounding (sem ponteiros). cross-refs/frontmatter podem passar parcialmente.

- [ ] **Step 6: Commit**

```bash
git add tests/odoo-artifacts/
git commit -m "test(odoo): critérios 2-7 do lint de artefatos (RED)"
```

---

## Task 3: Camada L2 — skill `odoo-l10n-br` (landing zone BR)

**Agent:** documentation-writer (com revisão odoo-specialist)
**Files:**
- Create: `skills/odoo-l10n-br/SKILL.md`
- Create: `skills/odoo-l10n-br/references/nfce-nfe-flow.md`, `references/fiscal-gotchas.md`, `references/danfe-wkhtmltopdf.md`

**Interfaces:**
- Consumes: conteúdo BR-genérico hoje em `odoo-development/SKILL.md` sec 7 (Localização Brasileira) e sec 8 (QWeb/wkhtmltopdf na parte fiscal/DANFE).
- Produces: front-matter `name: odoo-l10n-br`; skill citada por `profiles/odoo.yaml` `skills:`.

- [ ] **Step 1: Criar SKILL.md L2**

Mover de `odoo-development/SKILL.md`: a sec "Localização Brasileira (OCA l10n-brazil)" (módulos-chave, fluxo NFC-e, gotchas fiscais, constraint `_check_cnpj_inscr_est`) e a parte de DANFE/QR/encoding fiscal da sec QWeb. Reescrever com nomes OCA genéricos (`l10n_br_pos`, não `nxz_l10n_br_pos`). Front-matter:

```markdown
---
name: odoo-l10n-br
description: Localização fiscal brasileira para Odoo (qualquer projeto BR) — l10n_br, emissão NFC-e/NF-e, códigos SEFAZ, DANFE e gotchas fiscais. Cobre Odoo 12–18.
phases: [P, R, E, V, C]
mode: manual
---
```

Incluir ponteiro de grounding (OCA `github.com/oca/l10n-brazil`, `search_docs`).

- [ ] **Step 2: Mover gotchas fiscais para `references/fiscal-gotchas.md`** (tabela da sec 6.3 atual), `references/nfce-nfe-flow.md` (fluxo de emissão), `references/danfe-wkhtmltopdf.md` (DANFE 57/80mm, QR base64, `class="article"`).

- [ ] **Step 3: Run cross-refs + frontmatter + layer-separation (L2)**

Run: `node --test tests/odoo-artifacts/cross-refs.test.mjs tests/odoo-artifacts/frontmatter.test.mjs tests/odoo-artifacts/layer-separation.test.mjs`
Expected: L2 passa (sem `nxz_`); refs resolvem.

- [ ] **Step 4: Commit**

```bash
git add skills/odoo-l10n-br/
git commit -m "feat(odoo): skill L2 odoo-l10n-br (localização BR genérica)"
```

---

## Task 4: Camada L3 — skill `odoo-nxz-overlay` (landing zone NXZ)

**Agent:** documentation-writer (com revisão odoo-specialist)
**Files:**
- Create: `skills/odoo-nxz-overlay/SKILL.md`
- Create: `skills/odoo-nxz-overlay/references/nxz-architecture.md`, `references/nxz-pos-hierarchy.md`, `references/nxz-fiscal-bridges.md`

**Interfaces:**
- Consumes: sec 2 de `odoo-development` (arquitetura NXZ ERP, grafo deps, ordem instalação), nomenclatura bridge `nxz_*` (sec 1.4–1.5), "NXZ Project Context"/hierarquia POS de `frontend-specialist-odoo`, NfceProcessor/DANFE NXZ.
- Produces: front-matter `name: odoo-nxz-overlay`; citada por `profiles/nxz.yaml` `skills:`.

- [ ] **Step 1: Criar SKILL.md L3** com front-matter:

```markdown
---
name: odoo-nxz-overlay
description: Overlay NXZ sobre o framework Odoo — arquitetura NXZ ERP, grafo de dependências, ordem de instalação, nomenclatura/bridge nxz_*, hierarquia de módulos POS NXZ e orquestração de sub-agentes. Aplicado só em projetos NXZ.
phases: [P, R, E, V, C]
mode: manual
---
```

Cabeçalho deve referenciar L1 (`odoo-development`, `frontend-specialist-odoo`) e L2 (`odoo-l10n-br`) como base, e dizer que **env específico (paths/DB/portas) vive em `.context/` do projeto, não nesta skill**.

- [ ] **Step 2: Preencher references** com o conteúdo NXZ extraído (arquitetura/grafo; hierarquia POS; bridges fiscais NXZ).

- [ ] **Step 3: Adicionar teste de composição (M2)** — `tests/odoo-artifacts/layer-composition.test.mjs`: asserta que `odoo-nxz-overlay/SKILL.md` referencia por nome as skills base `odoo-development`, `frontend-specialist-odoo` e `odoo-l10n-br` (a L3 declara herdar L1+L2).

```javascript
// tests/odoo-artifacts/layer-composition.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { L3_FILES } from "./lib/artifact-lint.mjs";

describe("L3 referencia as camadas base", () => {
  for (const file of L3_FILES.skills) {
    it(`${file} cita odoo-development, frontend-specialist-odoo e odoo-l10n-br`, () => {
      if (!existsSync(file)) return;
      const text = readFileSync(file, "utf-8");
      for (const base of ["odoo-development", "frontend-specialist-odoo", "odoo-l10n-br"]) {
        assert.ok(text.includes(base), `L3 não referencia ${base}`);
      }
    });
  }
});
```

- [ ] **Step 4: Run cross-refs + frontmatter + composição**

Run: `node --test tests/odoo-artifacts/cross-refs.test.mjs tests/odoo-artifacts/frontmatter.test.mjs tests/odoo-artifacts/layer-composition.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/odoo-nxz-overlay/ tests/odoo-artifacts/layer-composition.test.mjs
git commit -m "feat(odoo): skill L3 odoo-nxz-overlay (overlay NXZ) + teste de composição"
```

---

## Task 5: Reescrever L1 `odoo-development` (core backend 12–18, des-NXZ, des-BR, numeração, grounding)

**Agent:** odoo-specialist (com revisão code-reviewer)
**Files:**
- Modify: `skills/odoo-development/SKILL.md`
- Create: `skills/odoo-development/references/version-capability-matrix.md`, `references/orm-changes-by-version.md`, `references/testing-odoo.md`

**Interfaces:**
- Consumes: conteúdo atual menos o que foi para L2 (Task 3) e L3 (Task 4).
- Produces: SKILL.md sem `nxz_`/`l10n_br`, numeração monotônica, versões 12–18, ponteiros de grounding.

- [ ] **Step 1: Remover** seções migradas (sec 2 NXZ → L3; sec 7 BR → L2; bridge naming → L3).
- [ ] **Step 2: Corrigir numeração** de todas as seções `## N.` para sequência monotônica sem duplicata.
- [ ] **Step 3: Adicionar Odoo 12 e 13** — criar `references/orm-changes-by-version.md` cobrindo 12→13 (`@api.multi` removido no 13, `@api.one`, mudanças de onchange) e 13→14, além das já existentes 14→18; criar `references/version-capability-matrix.md` (feature → faixa de versão 12–18). Referenciá-las no SKILL.md.
- [ ] **Step 4: Grounding** — em cada tabela de breaking-change, anexar linha/nota com ponteiro `mcp__docs-mcp-server__search_docs` (lib `odoo-NN`) e/ou fonte OCA.
- [ ] **Step 5: Mover testes** (sec 10–12) para `references/testing-odoo.md`, mantendo resumo no SKILL.md.
- [ ] **Step 6: Run RED→GREEN**

Run: `node --test tests/odoo-artifacts/`
Expected: version-coverage (odoo-development), env-coupling, layer-separation (L1 odoo-development), structural-integrity, grounding **passam** para `odoo-development`. (frontend ainda falha — Task 6.)

- [ ] **Step 7: Commit**

```bash
git add skills/odoo-development/
git commit -m "refactor(odoo): odoo-development vira L1 core 12-18 (des-NXZ/BR, grounding)"
```

---

## Task 6: Reescrever L1 `frontend-specialist-odoo` (core frontend 12–18, des-"18-only", des-NXZ)

**Agent:** frontend-specialist (com revisão odoo-specialist)
**Files:**
- Modify: `skills/frontend-specialist-odoo/SKILL.md`, `references/migration-frontend-15to18.md` (renomear conceito), `references/pos-frontend.md`
- Create: `skills/frontend-specialist-odoo/references/legacy-widgets-12to14.md`, `references/migration-frontend.md`

**Interfaces:**
- Consumes: SKILL atual (remover "NXZ Project Context", "migration COMPLETE Phase 3", exemplos nxz).
- Produces: SKILL.md cobrindo 12–18, sem `nxz_`, sem estado de projeto.

- [ ] **Step 1: Reescrever cabeçalho/descrição** — deixar de ser "Odoo 18+ only"; declarar cobertura 12–18 (legacy widgets/Backbone 12–14, OWL1 15–16, OWL2 17, OWL3 18).
- [ ] **Step 2: Criar `references/legacy-widgets-12to14.md`** (sistema de widgets legado, `web.widget`, Backbone, `odoo.define` clássico).
- [ ] **Step 3: Criar `references/migration-frontend.md`** cobrindo 12→18 (não só 15→18); manter o 15→18 detalhado como sub-seção.
- [ ] **Step 4: Remover blocos de estado de projeto** ("Current Frontend State", contagem de módulos) e exemplos `nxz_*` (mover hierarquia p/ L3 Task 4).
- [ ] **Step 5: Adicionar ponteiro de grounding** (odoo.com/documentation/NN.0/developer, OWL repo).
- [ ] **Step 6: Run GREEN**

Run: `node --test tests/odoo-artifacts/`
Expected: **todos** os critérios 1–7 passam para os 2 arquivos L1.

- [ ] **Step 7: Commit**

```bash
git add skills/frontend-specialist-odoo/
git commit -m "refactor(odoo): frontend-specialist-odoo vira L1 core 12-18 (des-18only/NXZ)"
```

---

## Task 7: Desacoplar env do agente `odoo-specialist`

**Agent:** documentation-writer
**Files:**
- Modify: `agents/odoo-specialist.md`
- Create: `templates/agents/odoo-project-context.example.md` (modelo de env para o `.context/` do projeto)

**Interfaces:**
- Consumes: tabelas "Ambientes de Desenvolvimento" e "Recursos do Projeto" do agente.
- Produces: agente que referencia L1/L2/L3 + lê env de `.context/` do projeto.

- [ ] **Step 1: Adicionar ao lint** um teste de env-coupling para o agente. (B1: imports no topo, sem `await import`; o arquivo já importa `envCouplingHits`, `readFileSync`, `describe/it`, `assert` — reusar.)

```javascript
// tests/odoo-artifacts/env-coupling.test.mjs — adicionar ao topo:
//   import { resolve } from "node:path";
//   import { envCouplingHits, L1_FILES, L2_FILES, REPO } from "./lib/artifact-lint.mjs";
// e adicionar este describe no fim do arquivo:
const AGENT = resolve(REPO, "agents/odoo-specialist.md");
describe("agente sem env hardcoded", () => {
  it("agents/odoo-specialist.md", () => {
    const hits = envCouplingHits(readFileSync(AGENT, "utf-8"));
    assert.deepEqual(hits, [], `env no agente: ${hits.join(", ")}`);
  });
});
```

- [ ] **Step 2: Run RED** — `node --test tests/odoo-artifacts/env-coupling.test.mjs` → FAIL.

> **W1 — expectativa de RED ajustada:** o agente **já** usa placeholders (`<PATH_DO_AMBIENTE>`, `<NOME_DO_DB>`, `<PORTA>`) e tem a regra "NUNCA cravar paths/DBs/portas". O **único** hit real dos `ENV_PATTERNS` é `docker compose exec -T app` (padrão `compose exec ... app`, ~linha 325). Logo o RED é mínimo e legítimo — só o service-name `app`, não paths/DB. Step 3 troca esse comando por referência ao `.context/` do projeto.
- [ ] **Step 3: Substituir** a tabela de Ambientes/Recursos por uma seção "Contexto de projeto" que diz: ler `.context/odoo-project.md` (env, paths, DBs). Atualizar a tabela de skills obrigatórias para incluir L2/L3 e referenciar o overlay quando em projeto NXZ.
- [ ] **Step 4: Criar o template** `templates/agents/odoo-project-context.example.md` com os campos de env (placeholders genéricos, sem paths reais).
- [ ] **Step 5: Run GREEN + Commit**

```bash
node --test tests/odoo-artifacts/env-coupling.test.mjs
git add agents/odoo-specialist.md templates/agents/odoo-project-context.example.md tests/odoo-artifacts/env-coupling.test.mjs
git commit -m "refactor(odoo): desacopla env do agente odoo-specialist"
```

---

## Task 8: Reorganizar standards — criar profile `nxz` e limpar `odoo`

**Agent:** odoo-specialist (com revisão code-reviewer)
**Files:**
- Create: `assets/standards/profiles/nxz/MANIFEST.txt`, `nxz/std-odoo-oca-separation.md` (+ `machine/`), `nxz/std-odoo-fiscal-br-integrity.md` (+ `machine/`)
- Modify: `assets/standards/profiles/odoo/MANIFEST.txt` (remover os 2 migrados), `std-odoo-version-api-hygiene.md` + `std-odoo-qweb-pdf-safety.md` (limpar menções `nxz`), **`profiles/odoo.yaml`** (`standards:` sem os 2 ids)

**Interfaces:**
- Consumes: 17 standards atuais do profile odoo.
- Produces: profile odoo com 15 standards genéricos; profile nxz com 2 standards. **Mudança atômica** — manifesto + arquivos + `profiles/odoo.yaml` mudam juntos, sem commit intermediário com gate vermelho (I3).

- [ ] **Step 1: Mover** `std-odoo-oca-separation` e `std-odoo-fiscal-br-integrity` (+ `machine/*.js`) para `assets/standards/profiles/nxz/`; criar `nxz/MANIFEST.txt`. (Mover `.js` entre profiles é seguro — `.js` é bundled-only, fora de qualquer fetch remoto; contrato anti-RCE/SI-6 intacto, confirmado na review de segurança.)
- [ ] **Step 2: Limpar** menções `nxz` em `std-odoo-version-api-hygiene.md` e `std-odoo-qweb-pdf-safety.md` (que ficam no profile odoo) — generalizar exemplos. Rodar `nxzHits` (via `layer-separation.test.mjs`, que agora cobre `l1Standards()`) até zerar.
- [ ] **Step 3: Atualizar atomicamente** `odoo/MANIFEST.txt` **e** `profiles/odoo.yaml` `standards:` removendo os 2 ids migrados.
- [ ] **Step 4: Run gates** — `node --test tests/integration/test-profile-standards-integrity.mjs tests/odoo-artifacts/layer-separation.test.mjs` → **verde** (profile odoo coerente; standards odoo sem nxz).
- [ ] **Step 5: Commit**

```bash
git add assets/standards/profiles/ profiles/odoo.yaml
git commit -m "refactor(odoo): standards NXZ migram p/ profiles/nxz; odoo fica genérico"
```

---

## Task 9: `profiles/nxz.yaml` + detecção NXZ no detector + agregação stds/stacks

**Agent:** backend-specialist (com revisão code-reviewer)
**Files:**
- Create: `profiles/nxz.yaml`
- Create: `tests/odoo-artifacts/detect-nxz.test.mjs`
- Modify: `scripts/lib/detect-framework.mjs`
- Modify: `profiles/odoo.yaml` (skill `odoo-l10n-br`; stacks 13/14/15/16; remover 2 stds migrados)

**Interfaces:**
- Consumes: `loadProfiles`, `detectFrameworks`, `profileMatches`, `frameworkContributions` (detect-framework.mjs).
- Produces: `profileMatches` reconhece `detect.dirPrefixes: ["nxz_"]` (diretório cujo nome começa com prefixo, até `MAX_DEPTH`, symlink-safe) e `detect.manifestContent: [{file, keys, anyOf}]` (substring **só nas chaves** `author`/`maintainer`/`website` do manifest, com cap de tamanho). `frameworkContributions` passa a devolver `standards` como `{id, framework}` (origem) — resolução do defeito C1.

> **Correção dos reviewers (não reimplementar o que já existe):** `detectFrameworks` **já** retorna todos os profiles que casam e `frameworkContributions` **já agrega** `agents`/`skills`/`standards`/`stacks` (dedup de std por id, de stack por `lib`). Esta task **não estende** a agregação — apenas (a) adiciona as 2 regras de detecção, (b) muda a forma do item de standard para preservar a origem (C1), (c) cobre tudo com teste.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/odoo-artifacts/detect-nxz.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectFrameworks } from "../../scripts/lib/detect-framework.mjs";

const PLUGIN = resolve(import.meta.dirname, "../..");

function scaffold(files) {
  const root = mkdtempSync(join(tmpdir(), "nxz-detect-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  return root;
}

describe("detecção NXZ", () => {
  it("casa nxz por diretório nxz_* (e odoo em paralelo — composição)", () => {
    const root = scaffold({ "addons/nxz_utils/__manifest__.py": "{'name': 'x'}" });
    const names = detectFrameworks(root, PLUGIN).map((p) => p.framework);
    assert.ok(names.includes("odoo"), "odoo deve casar");
    assert.ok(names.includes("nxz"), "nxz deve casar por dirPrefix");
  });

  it("casa nxz quando a CHAVE author do manifest é Nexuz", () => {
    const root = scaffold({ "addons/foo/__manifest__.py": "{'name':'foo','author':'Nexuz'}" });
    assert.ok(detectFrameworks(root, PLUGIN).map((p) => p.framework).includes("nxz"));
  });

  it("NÃO casa nxz em projeto Odoo genérico", () => {
    const root = scaffold({ "addons/sale_custom/__manifest__.py": "{'name':'s','author':'ACME'}" });
    const names = detectFrameworks(root, PLUGIN).map((p) => p.framework);
    assert.ok(names.includes("odoo"));
    assert.ok(!names.includes("nxz"), "nxz não deve casar");
  });

  it("M3 — NÃO casa nxz quando 'Nexuz' aparece só em COMENTÁRIO (não em chave)", () => {
    const root = scaffold({
      "addons/bar/__manifest__.py": "# changelog: migrado da base Nexuz em 2020\n{'name':'bar','author':'ACME'}",
    });
    assert.ok(!detectFrameworks(root, PLUGIN).map((p) => p.framework).includes("nxz"),
      "substring em comentário não deve disparar — match é por chave");
  });

  it("SEC — symlink de diretório NÃO é seguido (sem traversal/loop)", () => {
    const root = scaffold({ "addons/real/__manifest__.py": "{'name':'r','author':'ACME'}" });
    symlinkSync("/", join(root, "addons/nxz_evil")); // dir-symlink com prefixo nxz_
    const names = detectFrameworks(root, PLUGIN).map((p) => p.framework);
    assert.ok(!names.includes("nxz"), "symlink dir não conta como dirPrefix nem é percorrido");
  });
});
```

> Adicionar ao import do teste: `import { symlinkSync } from "node:fs";`.

- [ ] **Step 2: Run RED** — `node --test tests/odoo-artifacts/detect-nxz.test.mjs` → FAIL (profile nxz não existe; regras novas não implementadas).

- [ ] **Step 3: Criar `profiles/nxz.yaml`**

```yaml
framework: nxz
displayName: NXZ ERP (Odoo)
detect:
  dirPrefixes: ["nxz_"]
  manifestContent:
    - file: "__manifest__.py"
      anyOf: ["Nexuz", "nexuz"]
    - file: "__openerp__.py"
      anyOf: ["Nexuz", "nexuz"]
agents: []
skills: ["odoo-nxz-overlay"]
standards: ["std-odoo-oca-separation", "std-odoo-fiscal-br-integrity"]
dispatchKeywords:
  odoo-specialist: ["nxz", "bridge", "nfce", "danfe"]
stacks: []
```

- [ ] **Step 4a: Adicionar detecção em `profileMatches`** (`detect-framework.mjs`):

```javascript
// dirPrefixes: diretório cujo nome começa com um prefixo, bounded depth, symlink-safe
const dirPrefixes = Array.isArray(det.dirPrefixes) ? det.dirPrefixes : [];
if (dirPrefixes.length && treeHasDirPrefix(projectRoot, dirPrefixes)) return true;

// manifestContent: substring em CHAVES específicas de qualquer manifest no tree
const manifestContent = Array.isArray(det.manifestContent) ? det.manifestContent : [];
for (const entry of manifestContent) {
  if (entry && entry.file &&
      treeHasManifestKeyValue(projectRoot, entry.file, entry.keys || ["author"], entry.anyOf || [])) {
    return true;
  }
}
```

Implementar (todos espelhando o padrão de `treeHasFile`, recursão **só** em `e.isDirectory()` → symlink não é seguido; `depth > MAX_DEPTH → false`; `SKIP_DIRS`/`startsWith(".")`):
- `treeHasDirPrefix(root, prefixes, depth=0)` — `e.isDirectory() && prefixes.some(p => e.name.startsWith(p))`.
- `treeHasManifestKeyValue(root, basename, keys, anyOf, depth=0)` — acha arquivos com aquele basename; **cap de tamanho** (`statSync(p).size < 512*1024`, senão pula — anti-DoS); lê e testa se alguma `key` casa `key\s*[:=]\s*['"]...valor...['"]` para algum valor de `anyOf` (match por chave, não substring livre — M3).

- [ ] **Step 4b: Resolver C1 no agregador** — em `frameworkContributions`, mudar a coleta de `standards` de strings para `{id, framework}` (preservando a origem do profile), mantendo dedup por `id`. Ajustar os consumidores (`project-init`/`context-sync`) para copiar de `assets/standards/profiles/<framework>/<id>.md` usando a `framework` da origem. **Não** mexer na agregação de `stacks` (já correta).

> Verificar e atualizar os consumidores: `skills/project-init/SKILL.md` (cópia de standards ~linha 556) e `skills/context-sync/SKILL.md`. Se o output do CLI `detect-framework.mjs` mudar de forma, conferir quem parseia `{ frameworks, agents, skills, standards }`.

- [ ] **Step 5: Atualizar `profiles/odoo.yaml`** — adicionar `odoo-l10n-br` em `skills:`; adicionar stacks `odoo-13`,`odoo-14`,`odoo-15`,`odoo-16` (mcpIndexed + discoveryHints `odoo.com/documentation/NN.0/developer`). (A remoção dos 2 standards de `standards:` já foi feita atomicamente na Task 8.)

- [ ] **Step 6: Run GREEN**

Run: `node --test tests/odoo-artifacts/detect-nxz.test.mjs tests/integration/test-profile-standards-integrity.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add profiles/ scripts/lib/detect-framework.mjs tests/odoo-artifacts/detect-nxz.test.mjs
git commit -m "feat(odoo): profile nxz + detecção dirPrefix/manifestContent + agregação stds/stacks"
```

---

## Task 10: Profile NXZ integrity gate + stack narrativo + dry-run de propagação (tmpdir)

**Agent:** test-writer (com revisão devops-specialist)
**Files:**
- Create: `tests/integration/test-profile-nxz-integrity.mjs`
- Create: `assets/stacks/backend/odoo.md`

**Interfaces:**
- Consumes: `profiles/nxz.yaml`, `assets/standards/profiles/nxz/`.
- Produces: gate de integridade espelhando `test-profile-standards-integrity.mjs` para o profile nxz.

- [ ] **Step 1: Criar `test-profile-nxz-integrity.mjs`** (AC1–AC3: ids em `profiles/nxz.yaml` `standards:` == `nxz/MANIFEST.txt` == arquivos `.md`+`.js` no disco).
- [ ] **Step 2: Run RED→GREEN** — `node --test tests/integration/test-profile-nxz-integrity.mjs`.
- [ ] **Step 3: Criar `assets/stacks/backend/odoo.md`** — narrativo: o que é Odoo, séries 12–18, e ponteiros `search_docs` por série + repos OCA (grounding híbrido para a stack).
- [ ] **Step 4: Dry-run de propagação em tmpdir** — teste que:
  - deriva o destino via `mkdtempSync(join(tmpdir(), ...))` e **asserta `dest.startsWith(os.tmpdir())` antes** de qualquer cópia/`rsync --delete` (guard anti-wipe in-place — memória `feedback_tests_no_mutate_tracked`);
  - simula a cópia de standards usando a **origem `{id, framework}`** do agregador e **asserta que cada `<id>.md` resolve no `profiles/<framework>/` correto** (C1) — ex.: `std-odoo-oca-separation` → `profiles/nxz/`, `std-odoo-naming-conventions` → `profiles/odoo/`;
  - roda `detectFrameworks` + os lints contra a cópia;
  - confirma: projeto com `nxz_*` recebe L1+L2+L3 (skills `odoo-development`, `frontend-specialist-odoo`, `odoo-l10n-br`, `odoo-nxz-overlay`) e Odoo genérico recebe só L1+L2.
- [ ] **Step 5: Commit**

```bash
git add tests/integration/test-profile-nxz-integrity.mjs assets/stacks/backend/odoo.md
git commit -m "test(odoo): gate de integridade do profile nxz + stack narrativo odoo"
```

---

## Task 11: Suíte completa verde + bump + handoff de propagação

**Agent:** code-reviewer → (fase C: confirmation)
**Files:**
- Modify: version files (auto-bump hook ao tocar skills/agents/profiles)

- [ ] **Step 1: Run a suíte inteira**

Run: `node --test tests/odoo-artifacts/ tests/integration/test-profile-standards-integrity.mjs tests/integration/test-profile-nxz-integrity.mjs`
Expected: **tudo verde** (8 critérios + detecção + integridade).

- [ ] **Step 2:** Conferir auto-bump (hook `pre-commit-version-check.sh` bumpa patch ao tocar skills/agents) — consolidar em minor no release.
- [ ] **Step 3:** Handoff para a fase C (confirmation): reconciliar agente atrasado em `nxz-odoo-migration`, depois propagar via sync para os 2 projetos; push de `.md` de standards default para `NEXUZ-SYS/devflow-standards` antes do `/devflow update` Step 4d (validar se profile-standards entram nesse fluxo). Seguir pipeline de autoFinish (README→bump→commit→push→merge→cleanup).

---

## Self-Review

**Cobertura do spec:**
- D1 (casa=plugin) → todas as tasks tocam o plugin. ✓
- D2 (3 camadas) → L1 Tasks 5/6, L2 Task 3, L3 Task 4. ✓
- D3 (12–18) → Task 1 (lint) + Tasks 5/6 (conteúdo). ✓
- D4 (grounding híbrido) → critério 5 (Task 2) + Tasks 5/6/10. ✓
- D5 (cross-surface) → skill (3/4), agente (7), standards (8). ✓
- D6 (profile nxz) → Task 9. ✓
- D7 (TDD lint) → Tasks 1/2 primeiro, RED→GREEN em cada grupo. ✓
- 8 critérios → Tasks 1/2/7/10. ✓
- Riscos: detector testado (Task 9), agente atrasado (Task 11 Step 3), standards integrity (Tasks 8/10). ✓

**Placeholder scan:** sem TBD/TODO; código real no harness e detector; tasks de conteúdo definem origem→destino exatos + gate de lint como critério de done.

**Type consistency:** helpers (`versionsCovered`, `envCouplingHits`, `nxzHits`, `l10nBrHits`, `sectionNumbers`, `referencedRefs`) definidos na Task 1/2 e usados consistentemente; `treeHasDirPrefix`/`treeHasManifestContent` definidos na Task 9.

> Nota: tasks de migração de conteúdo Markdown (3,4,5,6) descrevem origem→destino por âncora de seção em vez de reproduzir o markdown inteiro; o critério de done de cada uma é objetivo (asserções de lint verdes), não prosa.
>
> **N3 — granularidade das Tasks 5/6:** reescrever SKILL.md inteiro + criar refs excede 2–5 min/step; quebrar em commits menores **por seção migrada** (um commit por bloco movido/corrigido), cada um rodando o subconjunto de lint afetado.
>
> **W2 — onde a cobertura de versão é assertada:** `L1_FILES.skills` aponta só para os 2 `SKILL.md`. Logo a matriz de versões 12–18 (ou um resumo que cite explicitamente cada versão) **deve permanecer no corpo do `SKILL.md`**, não só em `references/version-capability-matrix.md`. Validar a regex `versionsCovered` contra o conteúdo real antes de commitar o RED (evita falso-vermelho com ranges).
>
> **Mudança pós-review (revisão R):** corrigidos C1 (origem de standard no agregador, Tasks 9/10), B1/B2/B3 (helpers de lint), I1 (corte DANFE L2/L3 + nomes de classe NXZ), I2 (standards sob lint), I3 (reorg atômica Task 8), W1/W2/W4 (expectativas RED + guards `existsSync`), M1/M2/M3 (ranges, composição L3, detecção por chave) e 3 LOW de segurança (symlink-safe, cap de tamanho, guard tmpdir).

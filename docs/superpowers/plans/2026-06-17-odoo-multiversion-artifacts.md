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

// Detecta versões Odoo citadas: "Odoo 12", "12.0", "| 12 ", "12→", "12 →".
export function versionsCovered(text) {
  const found = new Set();
  for (const v of REQUIRED_VERSIONS) {
    const re = new RegExp(`(odoo\\s*${v}\\b|\\b${v}\\.0\\b|\\|\\s*${v}\\s*\\||\\b${v}\\s*(?:→|->|-->))`, "i");
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

> A correção que torna este teste verde acontece nas Tasks 4 e 5 (reescrita de L1). Mantemos o teste vermelho commitado como guard, padrão TDD.

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
export const L2_FILES = { skills: [resolve(REPO, "skills/odoo-l10n-br/SKILL.md")] };
export const L3_FILES = { skills: [resolve(REPO, "skills/odoo-nxz-overlay/SKILL.md")] };

const ENV_PATTERNS = [
  /\/home\/[a-z]/i, /~\/Documentos/, /\bodoo14-migration\b/, /\bodoo18-nxz\b/,
  /:8069\b/, /compose\s+exec\b.*\bapp\b/, /service\s*name\s*[:=]\s*app/i,
];
export function envCouplingHits(text) {
  return ENV_PATTERNS.filter((re) => re.test(text)).map(String);
}
export function nxzHits(text) {
  return (text.match(/\bnxz[_-][a-z0-9_]+/gi) || []);
}
export function l10nBrHits(text) {
  return (text.match(/\bl10n_br[_a-z0-9]*/gi) || []);
}
export function sectionNumbers(body) {
  return [...body.matchAll(/^##\s+(\d+)\./gm)].map((m) => Number(m[1]));
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
import { readFileSync } from "node:fs";
import { envCouplingHits, L1_FILES, L2_FILES } from "./lib/artifact-lint.mjs";

describe("L1+L2 sem acoplamento de ambiente", () => {
  for (const file of [...L1_FILES.skills, ...L2_FILES.skills]) {
    it(`${file} não tem path/DB/porta/service hardcoded`, () => {
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
import { readFileSync } from "node:fs";
import { nxzHits, l10nBrHits, L1_FILES, L2_FILES } from "./lib/artifact-lint.mjs";

describe("separação de camadas", () => {
  for (const file of L1_FILES.skills) {
    it(`${file} (L1) não menciona nxz_ nem l10n_br`, () => {
      const text = readFileSync(file, "utf-8");
      assert.deepEqual(nxzHits(text), [], `nxz em L1: ${file}`);
      assert.deepEqual(l10nBrHits(text), [], `l10n_br em L1: ${file}`);
    });
  }
  for (const file of L2_FILES.skills) {
    it(`${file} (L2) não menciona nxz_`, () => {
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
import { parseFrontmatter, sectionNumbers, L1_FILES } from "./lib/artifact-lint.mjs";

describe("numeração de seções monotônica e sem duplicatas", () => {
  for (const file of L1_FILES.skills) {
    it(`${file}`, () => {
      const { body } = parseFrontmatter(readFileSync(file, "utf-8"));
      const nums = sectionNumbers(body);
      const sorted = [...nums].sort((a, b) => a - b);
      assert.deepEqual(nums, sorted, `fora de ordem em ${file}: ${nums.join(",")}`);
      assert.equal(new Set(nums).size, nums.length, `duplicata em ${file}: ${nums.join(",")}`);
    });
  }
});
```

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

- [ ] **Step 3: Run layer-separation (L3 pode ter nxz_, mas valida que existe) + cross-refs + frontmatter**

Run: `node --test tests/odoo-artifacts/cross-refs.test.mjs tests/odoo-artifacts/frontmatter.test.mjs`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add skills/odoo-nxz-overlay/
git commit -m "feat(odoo): skill L3 odoo-nxz-overlay (overlay NXZ)"
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

- [ ] **Step 1: Adicionar ao lint** um teste de env-coupling para o agente.

```javascript
// tests/odoo-artifacts/env-coupling.test.mjs — adicionar bloco
import { resolve } from "node:path";
import { REPO } from "./lib/artifact-lint.mjs";
const AGENT = resolve(REPO, "agents/odoo-specialist.md");
describe("agente sem env hardcoded", () => {
  it("agents/odoo-specialist.md", () => {
    const { envCouplingHits } = await import("./lib/artifact-lint.mjs");
    const hits = envCouplingHits(readFileSync(AGENT, "utf-8"));
    assert.deepEqual(hits, [], `env no agente: ${hits.join(", ")}`);
  });
});
```

- [ ] **Step 2: Run RED** — `node --test tests/odoo-artifacts/env-coupling.test.mjs` → FAIL (agente tem paths/DB/portas).
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
- Modify: `assets/standards/profiles/odoo/MANIFEST.txt` (remover os 2 migrados), `std-odoo-version-api-hygiene.md` + `std-odoo-qweb-pdf-safety.md` (limpar menções `nxz`)

**Interfaces:**
- Consumes: 17 standards atuais do profile odoo.
- Produces: profile odoo com 15 standards genéricos; profile nxz com 2 standards.

- [ ] **Step 1: Mover** `std-odoo-oca-separation` e `std-odoo-fiscal-br-integrity` (+ `machine/*.js`) para `assets/standards/profiles/nxz/`; criar `nxz/MANIFEST.txt`.
- [ ] **Step 2: Limpar** menções `nxz` em `std-odoo-version-api-hygiene.md` e `std-odoo-qweb-pdf-safety.md` (que ficam no profile odoo) — generalizar exemplos.
- [ ] **Step 3: Atualizar** `odoo/MANIFEST.txt` removendo os 2 ids migrados.
- [ ] **Step 4: Run** o gate existente — `node --test tests/integration/test-profile-standards-integrity.mjs` deve continuar verde para o profile odoo (após Task 9 alinhar `profiles/odoo.yaml`).
- [ ] **Step 5: Commit**

```bash
git add assets/standards/profiles/
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
- Consumes: `loadProfiles`, `detectFrameworks`, `profileMatches` (detect-framework.mjs).
- Produces: `profileMatches` reconhece `detect.dirPrefixes: ["nxz_"]` (diretório cujo nome começa com prefixo, até MAX_DEPTH) e `detect.manifestContent: [{file, anyOf}]` (substring em qualquer `__manifest__.py`/`__openerp__.py` no tree); agregador inclui `standards` e `stacks`.

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
  it("casa profile nxz quando há diretório nxz_*", () => {
    const root = scaffold({ "addons/nxz_utils/__manifest__.py": "{'name': 'x'}" });
    const names = detectFrameworks(root, PLUGIN).map((p) => p.framework);
    assert.ok(names.includes("odoo"), "odoo deve casar");
    assert.ok(names.includes("nxz"), "nxz deve casar por dirPrefix");
  });

  it("casa profile nxz quando manifest tem author Nexuz", () => {
    const root = scaffold({ "addons/foo/__manifest__.py": "{'name':'foo','author':'Nexuz'}" });
    assert.ok(detectFrameworks(root, PLUGIN).map((p) => p.framework).includes("nxz"));
  });

  it("NÃO casa nxz em projeto Odoo genérico", () => {
    const root = scaffold({ "addons/sale_custom/__manifest__.py": "{'name':'s','author':'ACME'}" });
    const names = detectFrameworks(root, PLUGIN).map((p) => p.framework);
    assert.ok(names.includes("odoo"));
    assert.ok(!names.includes("nxz"), "nxz não deve casar");
  });
});
```

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

- [ ] **Step 4: Estender `detect-framework.mjs`** — em `loadProfiles`, propagar `detect` cru (já feito). Adicionar em `profileMatches`:

```javascript
// dirPrefixes: diretório cujo nome começa com um prefixo, bounded depth
const dirPrefixes = Array.isArray(det.dirPrefixes) ? det.dirPrefixes : [];
if (dirPrefixes.length && treeHasDirPrefix(projectRoot, dirPrefixes)) return true;

// manifestContent: substring em QUALQUER manifest com o basename dado, no tree
const manifestContent = Array.isArray(det.manifestContent) ? det.manifestContent : [];
for (const entry of manifestContent) {
  if (entry && entry.file && treeHasManifestContent(projectRoot, entry.file, entry.anyOf || [])) return true;
}
```

Implementar `treeHasDirPrefix(root, prefixes, depth)` (espelha `treeHasFile`, mas testa `e.isDirectory() && prefixes.some(p => e.name.startsWith(p))`, ignorando SKIP_DIRS) e `treeHasManifestContent(root, basename, anyOf, depth)` (varre tree por arquivos com aquele basename e testa substring case-insensitive). Atualizar o agregador (linha ~121) para concatenar `standards` e `stacks` de todos os profiles ativos (dedup por id/lib).

- [ ] **Step 5: Atualizar `profiles/odoo.yaml`** — adicionar `odoo-l10n-br` em `skills:`; remover `std-odoo-oca-separation` e `std-odoo-fiscal-br-integrity` de `standards:`; adicionar stacks `odoo-13`,`odoo-14`,`odoo-15`,`odoo-16` (mcpIndexed + discoveryHints `odoo.com/documentation/NN.0/developer`).

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
- [ ] **Step 4: Dry-run de propagação em tmpdir** — script de verificação que copia (rsync `--delete` para cópia, nunca in-place) os artefatos do plugin para um tmpdir simulando `.context/` e roda `detectFrameworks` + os lints contra a cópia. Confirmar que projeto com `nxz_*` recebe L1+L2+L3 e projeto Odoo genérico recebe só L1+L2.
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

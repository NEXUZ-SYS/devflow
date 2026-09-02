# Escopo de versão para stacks e standards de perfil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** `version-scoped-stacks-standards` | **Scale:** LARGE | **Phase:** P→R

**Goal:** Fazer stacks e standards de perfil conhecerem a versão do framework que o projeto realmente usa, para que um projeto Odoo 17 pare de receber as 7 séries no manifest e pare de disparar regras exclusivas do 18.

**Architecture:** Um resolvedor de versão no nível do projeto (`framework-version.mjs`) alimenta duas superfícies distintas: standards filtram **na hora de aplicar** (predicado novo em `findApplicableStandards`), stacks filtram **na hora de semear** (operação `reconcile` com poda). A resolução é declarada por stack via `versionDetect` no YAML do perfil — nenhum código novo para adicionar um perfil irmão.

**Tech Stack:** Node ESM puro (`node:*` apenas — Dependency Policy do repo), `node --test`, YAML lido pelos parsers próprios do repo.

**Spec:** `docs/superpowers/specs/2026-09-02-version-scoped-stacks-standards-design.md`

**Agents:** `backend-specialist` (resolvedor, libs), `devops-specialist` (CLI reconcile, fiação de skills), `test-writer` (fixtures de regressão), `security-auditor` (revisão dos padrões regex e da poda destrutiva).

## Global Constraints

- **Dependency Policy:** apenas `node:*`. Nenhuma dependência npm nova, em nenhuma task.
- **Retrocompatibilidade é a propriedade de segurança principal.** Perfil ou standard **sem** `appliesFrom`/`appliesUntil` comporta-se exatamente como hoje. Os ~26 standards default e os 2 perfis existentes não podem mudar de comportamento.
- **Standard default não declara faixa.** `source: devflow-default` + `appliesFrom` é erro de autoria; `standard-audit.mjs` reprova.
- **Fail-closed no runtime, pergunta no init.** Versão `ambiguous` ou `unknown` → o artefato com faixa é **pulado** e registrado no runtime; no init, pergunta.
- **Empate em `aggregate: majority` resolve para `ambiguous`** — nunca por desempate arbitrário.
- **Evidência é lista** (`[{probe, value, source}]`), nunca booleano. Opacidade foi o que tornou o bug original invisível.
- **Só o eixo série é persistido** em `.devflow.yaml`. Versões do eixo composição saem do `package.json` na hora.
- **Poda é destrutiva** — sempre atrás de confirmação, nunca silenciosa.
- **SI-5** vale para todo glob em `applyTo`; **SI-4** vale para todo linter.
- **ADR-011:** todo acesso a `.devflow.yaml` passa por `scripts/lib/devflow-config.mjs`. Sem re-parse ad-hoc.

```yaml
requiredSignals: [lint, unit, integration, e2e]
```

`e2e` porque as tasks 10–12 tocam CLI e a fiação de skills; `integration` porque o resolvedor é exercido contra fixtures de projeto reais.

---

## File Structure

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `scripts/lib/framework-version.mjs` | **Criar.** Sondas, agregação, confiança, `resolveStackVersions` | 2, 3 |
| `profiles/odoo.yaml` | **Modificar.** `axis: series` + `versionDetect` | 4 |
| `scripts/lib/detect-framework.mjs` | **Modificar.** `frameworkContributions` devolve `stackVersions` | 4 |
| `scripts/lib/standards-loader.mjs` | **Modificar.** Lê `appliesFrom`/`appliesUntil`; predicado de faixa | 5, 6 |
| `scripts/lib/run-linter.mjs`, `edit-nudge.mjs` | **Modificar.** Passam `ctx` para `findApplicableStandards` | 6 |
| `scripts/lib/devflow-config.mjs` | **Modificar.** `readFrameworkVersions` | 7 |
| `scripts/lib/standard-audit.mjs` | **Modificar.** Reprova faixa em default | 5 |
| `assets/standards/profiles/odoo/` | **Modificar.** Split do version-api-hygiene; faixas nos 4 | 8, 9 |
| `scripts/lib/manifest-stacks.mjs` | **Modificar.** Exportar `writeManifest`; `reconcileManifest` | 10 |
| `scripts/devflow-stacks.mjs` | **Modificar.** Subcomando `reconcile` | 11 |
| `skills/project-init/SKILL.md`, `skills/context-sync/SKILL.md` | **Modificar.** Chamam `reconcile` | 12 |
| `commands/devflow.md` | **Modificar.** Ponteiro no `/devflow update` | 12 |

---

## Task 1: Fixtures de regressão (o bug como dado executável)

Cria os dois projetos-fixture antes de qualquer código de produção. As asserções de regressão que dependem deles entram nas tasks 6 e 9, onde ficam verdes; aqui só se garante que o dado está bem-formado — um fixture silenciosamente errado invalidaria todas as tasks seguintes.

**Files:**
- Create: `tests/fixtures/version-scoped/odoo17/` (projeto Odoo 17)
- Create: `tests/fixtures/version-scoped/odoo12/` (projeto Odoo 12)
- Create: `tests/fixtures/version-scoped/ts-src/` (projeto TypeScript com `src/` e `package.json`)
- Test: `tests/integration/test-version-scoped-fixtures.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: os três diretórios-fixture. Tasks 3, 4, 6, 9 e 11 os consomem por caminho literal.

- [ ] **Step 1: Criar o fixture Odoo 17**

O fixture reproduz as três sondas do `nexuz/odoo_17` concordando em `17`.

```bash
mkdir -p tests/fixtures/version-scoped/odoo17/addons/nxz_cadastro/views
cd tests/fixtures/version-scoped/odoo17
```

`.gitmodules`:
```
[submodule "odoo"]
	path = odoo
	url = https://github.com/odoo/odoo.git
	branch = 17.0
```

`Dockerfile`:
```dockerfile
FROM odoo:17.0-20251222
COPY ./addons /mnt/extra-addons
```

`addons/nxz_cadastro/__manifest__.py`:
```python
{
    "name": "NXZ Cadastro",
    "version": "17.0.1.0.0",
    "depends": ["base"],
    "data": ["views/cadastro_views.xml"],
}
```

`addons/nxz_cadastro/views/cadastro_views.xml` — usa `<tree>`, correto no 17 e alvo do falso-positivo:
```xml
<odoo>
    <record id="view_cadastro_tree" model="ir.ui.view">
        <field name="arch" type="xml">
            <tree string="Cadastros">
                <field name="name"/>
            </tree>
        </field>
    </record>
</odoo>
```

- [ ] **Step 2: Criar o fixture Odoo 12**

Mesma forma, série 12 — usado para provar que as regras de 17 **e** de 18 ficam caladas.

`.gitmodules` com `branch = 12.0`; `Dockerfile` com `FROM odoo:12.0`; `addons/legacy_cadastro/__manifest__.py`:
```python
{
    "name": "Legacy Cadastro",
    "version": "12.0.1.0.0",
    "depends": ["base"],
}
```

E um `addons/legacy_cadastro/models/cadastro.py` com API legítima do 12 (que o linter de 17 acusaria):
```python
from odoo import api, models


class Cadastro(models.Model):
    _name = "legacy.cadastro"

    @api.multi
    def name_get(self):
        return [(r.id, r.name) for r in self]
```

- [ ] **Step 3: Criar o fixture TypeScript com `src/`**

Prova o eixo composição e o prefixo `src/**`.

`tests/fixtures/version-scoped/ts-src/package.json`:
```json
{
  "name": "ts-src-fixture",
  "dependencies": { "react": "^18.3.1" },
  "devDependencies": { "typescript": "~5.4.5" }
}
```
`tests/fixtures/version-scoped/ts-src/src/index.ts` com uma linha (`export const x = 1;`).

- [ ] **Step 4: Escrever o teste que valida os fixtures**

```js
// tests/integration/test-version-scoped-fixtures.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "tests/fixtures/version-scoped";

test("fixture odoo17: três sondas independentes declaram a série 17", () => {
  const p = join(ROOT, "odoo17");
  assert.match(readFileSync(join(p, ".gitmodules"), "utf-8"), /branch = 17\.0/);
  assert.match(readFileSync(join(p, "Dockerfile"), "utf-8"), /FROM\s+odoo:17\.0/);
  assert.match(
    readFileSync(join(p, "addons/nxz_cadastro/__manifest__.py"), "utf-8"),
    /"version":\s*"17\./,
  );
});

test("fixture odoo17: o XML usa <tree>, correto no 17 e alvo do falso-positivo", () => {
  const xml = readFileSync(join(ROOT, "odoo17/addons/nxz_cadastro/views/cadastro_views.xml"), "utf-8");
  assert.match(xml, /<tree/, "o fixture precisa conter <tree> para exercer a regra do 18");
  assert.doesNotMatch(xml, /<list/, "o fixture não pode já estar migrado para <list>");
});

test("fixture odoo12: sondas em 12 e API legítima da série", () => {
  const p = join(ROOT, "odoo12");
  assert.match(readFileSync(join(p, ".gitmodules"), "utf-8"), /branch = 12\.0/);
  const py = readFileSync(join(p, "addons/legacy_cadastro/models/cadastro.py"), "utf-8");
  assert.match(py, /@api\.multi/);
  assert.match(py, /def name_get/);
});

test("fixture ts-src: package.json com majors distintos e diretório src/ real", () => {
  const p = join(ROOT, "ts-src");
  const pkg = JSON.parse(readFileSync(join(p, "package.json"), "utf-8"));
  assert.equal(pkg.dependencies.react, "^18.3.1");
  assert.equal(pkg.devDependencies.typescript, "~5.4.5");
  assert.ok(existsSync(join(p, "src/index.ts")), "src/ deve existir de fato");
});
```

- [ ] **Step 5: Rodar o teste**

Run: `node --test tests/integration/test-version-scoped-fixtures.mjs`
Expected: PASS — 4/4.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/version-scoped tests/integration/test-version-scoped-fixtures.mjs
git commit -m "test(version-scope): fixtures odoo17, odoo12 e ts-src como dado de regressão"
```

---

## Task 2: Sondas declarativas e modelo de confiança

Funções puras. Nada consome ainda — risco zero, conforme o passo 1 do rollout da spec.

**Files:**
- Create: `scripts/lib/framework-version.mjs`
- Test: `tests/lib/test-framework-version.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `runProbe(projectRoot, probe) -> { value: string|null, source: string }` — `probe` é `{file, pattern}` ou `{glob, pattern, aggregate}`.
  - `aggregateMajority(values) -> { value: string|null, tie: boolean }`
  - `classifyConfidence(evidence) -> "high" | "medium" | "ambiguous" | "unknown"`
  - Constante `CONFIDENCE = { HIGH: "high", MEDIUM: "medium", AMBIGUOUS: "ambiguous", UNKNOWN: "unknown" }`

- [ ] **Step 1: Escrever o teste que falha**

```js
// tests/lib/test-framework-version.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runProbe, aggregateMajority, classifyConfidence,
} from "../../scripts/lib/framework-version.mjs";

const ODOO17 = "tests/fixtures/version-scoped/odoo17";
const ODOO12 = "tests/fixtures/version-scoped/odoo12";

test("runProbe file+pattern extrai a série do .gitmodules", () => {
  const r = runProbe(ODOO17, { file: ".gitmodules", pattern: "path = odoo[\\s\\S]*?branch = (\\d+)\\.0" });
  assert.equal(r.value, "17");
  assert.equal(r.source, ".gitmodules");
});

test("runProbe file+pattern extrai a série do Dockerfile", () => {
  const r = runProbe(ODOO17, { file: "Dockerfile", pattern: "FROM\\s+odoo:(\\d+)\\.0" });
  assert.equal(r.value, "17");
});

test("runProbe devolve null quando o arquivo não existe — nunca lança", () => {
  const r = runProbe(ODOO17, { file: "Gemfile.lock", pattern: "rails \\((\\d+)\\." });
  assert.equal(r.value, null);
});

test("runProbe devolve null quando o pattern não casa — nunca lança", () => {
  const r = runProbe(ODOO17, { file: "Dockerfile", pattern: "FROM\\s+rails:(\\d+)" });
  assert.equal(r.value, null);
});

test("runProbe glob+majority agrega manifestos", () => {
  const r = runProbe(ODOO12, {
    glob: "addons/*/__manifest__.py",
    pattern: "['\\\"]version['\\\"]\\s*:\\s*['\\\"](\\d+)\\.",
    aggregate: "majority",
  });
  assert.equal(r.value, "12");
});

test("aggregateMajority resolve pelo mais frequente", () => {
  // caso real medido: 48 de 54 manifestos em 17
  const vals = [...Array(48).fill("17"), ...Array(6).fill("1")];
  const r = aggregateMajority(vals);
  assert.equal(r.value, "17");
  assert.equal(r.tie, false);
});

test("aggregateMajority sinaliza empate em vez de desempatar", () => {
  const r = aggregateMajority(["17", "18"]);
  assert.equal(r.tie, true);
  assert.equal(r.value, null, "empate NUNCA resolve por escolha arbitrária");
});

test("aggregateMajority com lista vazia devolve null sem empate", () => {
  assert.deepEqual(aggregateMajority([]), { value: null, tie: false });
});

test("classifyConfidence: duas sondas concordando é high", () => {
  const ev = [
    { probe: "submodule-branch", value: "17", source: ".gitmodules" },
    { probe: "docker-base-image", value: "17", source: "Dockerfile" },
  ];
  assert.equal(classifyConfidence(ev), "high");
});

test("classifyConfidence: uma sonda é medium", () => {
  assert.equal(classifyConfidence([{ probe: "p", value: "17", source: "s" }]), "medium");
});

test("classifyConfidence: sondas discordando é ambiguous", () => {
  const ev = [
    { probe: "a", value: "17", source: "s1" },
    { probe: "b", value: "18", source: "s2" },
  ];
  assert.equal(classifyConfidence(ev), "ambiguous");
});

test("classifyConfidence: nenhuma sonda casou é unknown", () => {
  assert.equal(classifyConfidence([]), "unknown");
  assert.equal(classifyConfidence([{ probe: "a", value: null, source: "s" }]), "unknown");
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/lib/test-framework-version.mjs`
Expected: FAIL — `Cannot find module '.../framework-version.mjs'`.

- [ ] **Step 3: Implementar o mínimo**

```js
// scripts/lib/framework-version.mjs
// Resolução da versão do framework no nível do PROJETO.
//
// Duas formas de sonda, ambas declaradas no YAML do perfil (nunca em código):
//   { file, pattern }                    — lê um arquivo, extrai o grupo 1
//   { glob, pattern, aggregate }         — varre caminhos, agrega os grupos 1
//
// Per Dependency Policy: pure node:* — usa lib/glob.mjs para o matching.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const CONFIDENCE = {
  HIGH: "high", MEDIUM: "medium", AMBIGUOUS: "ambiguous", UNKNOWN: "unknown",
};

const MAX_DEPTH = 6;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".venv", "__pycache__"]);

// Compila o pattern do YAML. Padrão inválido é DADO ruim, não crash: devolve null.
function compile(pattern) {
  try { return new RegExp(pattern); } catch { return null; }
}

function firstGroup(content, re) {
  const m = content.match(re);
  return m && m[1] ? String(m[1]) : null;
}

// Walk raso, sem seguir symlink, para resolver o `glob` da sonda.
function walk(root, sub, out, depth) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try { entries = readdirSync(join(root, sub), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
    const rel = sub ? join(sub, e.name) : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) walk(root, rel, out, depth + 1);
    else if (e.isFile()) out.push(rel);
  }
}

// Matcher de glob mínimo para as sondas: só `*` (um segmento) e `**` (vários).
function globToRe(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped
    .replace(/\*\*\//g, " ")
    .replace(/\*/g, "[^/]*")
    .replace(/ /g, "(?:.*/)?");
  return new RegExp(`^${body}$`);
}

export function aggregateMajority(values) {
  const clean = values.filter(Boolean);
  if (clean.length === 0) return { value: null, tie: false };
  const counts = new Map();
  for (const v of clean) counts.set(v, (counts.get(v) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return { value: null, tie: true };
  return { value: sorted[0][0], tie: false };
}

export function runProbe(projectRoot, probe) {
  if (!probe || typeof probe !== "object") return { value: null, source: "" };
  const re = compile(probe.pattern);
  if (!re) return { value: null, source: probe.file || probe.glob || "" };

  if (probe.file) {
    const p = join(projectRoot, probe.file);
    if (!existsSync(p)) return { value: null, source: probe.file };
    let content;
    try { content = readFileSync(p, "utf-8"); } catch { return { value: null, source: probe.file }; }
    return { value: firstGroup(content, re), source: probe.file };
  }

  if (probe.glob) {
    const files = [];
    walk(projectRoot, "", files, 0);
    const gre = globToRe(probe.glob);
    const matched = files.filter((f) => gre.test(f.split(sep).join("/")));
    const values = [];
    for (const f of matched) {
      try { values.push(firstGroup(readFileSync(join(projectRoot, f), "utf-8"), re)); }
      catch { /* arquivo ilegível é ausência de sinal, não erro */ }
    }
    const agg = probe.aggregate === "majority"
      ? aggregateMajority(values)
      : { value: values.find(Boolean) || null, tie: false };
    return {
      value: agg.tie ? null : agg.value,
      source: `${probe.glob} (${values.filter(Boolean).length}/${matched.length})`,
      tie: agg.tie,
    };
  }

  return { value: null, source: "" };
}

export function classifyConfidence(evidence) {
  const values = (evidence || []).map((e) => e && e.value).filter(Boolean);
  if (values.length === 0) return CONFIDENCE.UNKNOWN;
  const distinct = new Set(values);
  if (distinct.size > 1) return CONFIDENCE.AMBIGUOUS;
  return values.length >= 2 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM;
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node --test tests/lib/test-framework-version.mjs`
Expected: PASS — 12/12.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/framework-version.mjs tests/lib/test-framework-version.mjs
git commit -m "feat(version): sondas declarativas e modelo de confiança para versão de framework"
```

---

## Task 3: Sonda embutida `npmDep` e `resolveStackVersions`

**Files:**
- Modify: `scripts/lib/framework-version.mjs`
- Test: `tests/lib/test-framework-version.mjs` (estende)

**Interfaces:**
- Consumes: `runProbe`, `classifyConfidence` da Task 2.
- Produces:
  - `npmDep(projectRoot, lib) -> { value: string|null, source: string }` — lê `dependencies` + `devDependencies`, extrai o major.
  - `resolveStackVersions(projectRoot, candidates) -> Map<string, { version, confidence, evidence }>` — `candidates` é `[{ lib, versionDetect }]`; `versionDetect` é string (embutida) ou array (declarativa).

- [ ] **Step 1: Escrever o teste que falha**

```js
test("npmDep extrai o major de dependencies e devDependencies", () => {
  const TS = "tests/fixtures/version-scoped/ts-src";
  assert.equal(npmDep(TS, "react").value, "18");
  assert.equal(npmDep(TS, "typescript").value, "5");
});

test("npmDep devolve null para lib ausente e para projeto sem package.json", () => {
  assert.equal(npmDep("tests/fixtures/version-scoped/ts-src", "vue").value, null);
  assert.equal(npmDep("tests/fixtures/version-scoped/odoo17", "react").value, null);
});

test("resolveStackVersions: sondas declarativas concordando dão high com evidência de lista", () => {
  const m = resolveStackVersions("tests/fixtures/version-scoped/odoo17", [{
    lib: "odoo",
    versionDetect: [
      { file: ".gitmodules", pattern: "path = odoo[\\s\\S]*?branch = (\\d+)\\.0" },
      { file: "Dockerfile", pattern: "FROM\\s+odoo:(\\d+)\\.0" },
    ],
  }]);
  const r = m.get("odoo");
  assert.equal(r.version, "17");
  assert.equal(r.confidence, "high");
  assert.equal(r.evidence.length, 2, "evidência é LISTA, não booleano");
  assert.ok(r.evidence.every((e) => e.probe && e.source));
});

test("resolveStackVersions: versionDetect string resolve pela sonda embutida npmDep", () => {
  const m = resolveStackVersions("tests/fixtures/version-scoped/ts-src", [
    { lib: "react", versionDetect: "npmDep" },
  ]);
  assert.equal(m.get("react").version, "18");
  assert.equal(m.get("react").confidence, "medium");
});

test("resolveStackVersions: sonda embutida desconhecida é unknown, não crash", () => {
  const m = resolveStackVersions("tests/fixtures/version-scoped/ts-src", [
    { lib: "react", versionDetect: "cargoDep" },
  ]);
  assert.equal(m.get("react").confidence, "unknown");
});

test("resolveStackVersions: sondas discordando dão ambiguous e preservam as duas evidências", () => {
  const m = resolveStackVersions("tests/fixtures/version-scoped/odoo17", [{
    lib: "odoo",
    versionDetect: [
      { file: ".gitmodules", pattern: "path = odoo[\\s\\S]*?branch = (\\d+)\\.0" },
      { file: "Dockerfile", pattern: "FROM\\s+odoo:17\\.(\\d+)" },
    ],
  }]);
  const r = m.get("odoo");
  assert.equal(r.confidence, "ambiguous");
  assert.equal(r.version, null, "ambiguous NÃO escolhe uma das versões");
  assert.equal(r.evidence.length, 2);
});
```

Adicione `npmDep, resolveStackVersions` ao import do topo do arquivo de teste.

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/lib/test-framework-version.mjs`
Expected: FAIL — `npmDep is not a function`.

- [ ] **Step 3: Implementar**

```js
// (append em scripts/lib/framework-version.mjs)

// Sonda EMBUTIDA: cobre o ecossistema npm inteiro sem configuração por entrada.
export function npmDep(projectRoot, lib) {
  const p = join(projectRoot, "package.json");
  if (!existsSync(p)) return { value: null, source: "package.json" };
  let pkg;
  try { pkg = JSON.parse(readFileSync(p, "utf-8")); } catch { return { value: null, source: "package.json" }; }
  const range = (pkg.dependencies || {})[lib] ?? (pkg.devDependencies || {})[lib];
  if (typeof range !== "string") return { value: null, source: "package.json" };
  const m = range.match(/(\d+)\./);
  return { value: m ? m[1] : null, source: `package.json (${lib}@${range})` };
}

const BUILTIN_PROBES = { npmDep };

export function resolveStackVersions(projectRoot, candidates) {
  const out = new Map();
  for (const cand of candidates || []) {
    if (!cand || !cand.lib) continue;
    const detect = cand.versionDetect;
    const evidence = [];

    if (typeof detect === "string") {
      const fn = BUILTIN_PROBES[detect];
      if (fn) {
        const r = fn(projectRoot, cand.lib);
        evidence.push({ probe: detect, value: r.value, source: r.source });
      }
      // sonda embutida desconhecida → sem evidência → unknown (fail-closed)
    } else if (Array.isArray(detect)) {
      for (const probe of detect) {
        const r = runProbe(projectRoot, probe);
        evidence.push({
          probe: probe.file ? `file:${probe.file}` : `glob:${probe.glob}`,
          value: r.value,
          source: r.source,
        });
      }
    }

    const confidence = classifyConfidence(evidence);
    const resolved = evidence.map((e) => e.value).filter(Boolean);
    out.set(cand.lib, {
      version: confidence === CONFIDENCE.HIGH || confidence === CONFIDENCE.MEDIUM ? resolved[0] : null,
      confidence,
      evidence,
    });
  }
  return out;
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node --test tests/lib/test-framework-version.mjs`
Expected: PASS — 18/18.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/framework-version.mjs tests/lib/test-framework-version.mjs
git commit -m "feat(version): sonda embutida npmDep e resolveStackVersions"
```

---

## Task 4: `versionDetect` no schema dos perfis e `stackVersions` no detector

**Files:**
- Modify: `profiles/odoo.yaml`
- Modify: `scripts/lib/detect-framework.mjs` (`frameworkContributions`)
- Test: `tests/integration/test-detect-framework.mjs` (estende)

**Interfaces:**
- Consumes: `resolveStackVersions` da Task 3.
- Produces: `frameworkContributions(projectRoot, pluginRoot)` passa a devolver, além dos campos atuais (`frameworks`, `skills`, `skillsWithOrigin`, `skillBindings`, `standards`, `standardsWithOrigin`, `stacks`, `dispatchKeywords`), o campo **`stackVersions`**: `[{ lib, version, confidence, evidence, axis }]`.

- [ ] **Step 1: Escrever o teste que falha**

```js
test("frameworkContributions devolve stackVersions para o fixture Odoo 17", () => {
  const c = frameworkContributions("tests/fixtures/version-scoped/odoo17", process.cwd());
  const odoo = (c.stackVersions || []).find((s) => s.lib === "odoo");
  assert.ok(odoo, "stackVersions deve conter a entrada do eixo série 'odoo'");
  assert.equal(odoo.version, "17");
  assert.equal(odoo.confidence, "high");
  assert.equal(odoo.axis, "series");
  assert.ok(Array.isArray(odoo.evidence) && odoo.evidence.length >= 2);
});

test("frameworkContributions: fixture Odoo 12 resolve 12", () => {
  const c = frameworkContributions("tests/fixtures/version-scoped/odoo12", process.cwd());
  assert.equal((c.stackVersions || []).find((s) => s.lib === "odoo").version, "12");
});

test("retrocompat: perfil sem versionDetect não quebra e não entra em stackVersions", () => {
  // nxz.yaml não declara versionDetect — o contrato antigo é preservado
  const c = frameworkContributions("tests/fixtures/version-scoped/odoo17", process.cwd());
  assert.ok(Array.isArray(c.standards), "campos antigos intactos");
  assert.ok(Array.isArray(c.stacks), "campos antigos intactos");
  assert.ok(!(c.stackVersions || []).some((s) => s.lib === "nxz"));
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/integration/test-detect-framework.mjs`
Expected: FAIL — `stackVersions deve conter a entrada do eixo série 'odoo'`.

- [ ] **Step 3: Declarar o eixo e as sondas em `profiles/odoo.yaml`**

Adicione, logo acima do bloco `stacks:` existente (que **não muda** nesta task):

```yaml
# Eixo de versionamento deste perfil. `series` = odoo-12..odoo-18 são versões
# ALTERNATIVAS da mesma coisa: exatamente uma vale. Resolver = escolher uma.
# Perfis sem `axis` seguem no eixo composição (default), onde libs coexistem.
axis: series
# Sondas de versão, avaliadas em ordem. Declarativas: acrescentar um perfil
# irmão (rails.yaml) não exige mudança de código.
versionDetect:
  - { file: .gitmodules, pattern: 'path = odoo[\s\S]*?branch = (\d+)\.0' }
  - { file: Dockerfile,  pattern: 'FROM\s+odoo:(\d+)\.0' }
  - glob: "addons/*/__manifest__.py"
    pattern: "['\"]version['\"]\\s*:\\s*['\"](\\d+)\\."
    aggregate: majority
```

- [ ] **Step 4: Ler `axis`/`versionDetect` no `loadProfiles` e resolver em `frameworkContributions`**

Em `scripts/lib/detect-framework.mjs`, adicione ao topo:

```js
import { resolveStackVersions } from "./framework-version.mjs";
```

`loadProfiles` já devolve o objeto do YAML; garanta que `axis` e `versionDetect` são propagados no objeto do perfil (se o parser filtra chaves conhecidas, acrescente as duas à lista).

Em `frameworkContributions`, antes do `return`:

```js
  // Eixo série: resolve a versão real do framework no projeto. Perfil sem
  // versionDetect não entra aqui — retrocompatibilidade (Global Constraints).
  const versionCandidates = active
    .filter((p) => p.versionDetect)
    .map((p) => ({ lib: p.framework, versionDetect: p.versionDetect, axis: p.axis || "composition" }));
  const resolved = resolveStackVersions(projectRoot, versionCandidates);
  const stackVersions = versionCandidates.map((c) => ({
    lib: c.lib,
    axis: c.axis,
    ...resolved.get(c.lib),
  }));
```

E acrescente `stackVersions` ao objeto retornado, **depois** dos campos existentes.

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `node --test tests/integration/test-detect-framework.mjs`
Expected: PASS, incluindo os testes preexistentes do arquivo.

- [ ] **Step 6: Commit**

```bash
git add profiles/odoo.yaml scripts/lib/detect-framework.mjs tests/integration/test-detect-framework.mjs
git commit -m "feat(version): perfil declara axis e versionDetect; detector devolve stackVersions"
```

---

## Task 5: `appliesFrom`/`appliesUntil` no loader e no audit

**Files:**
- Modify: `scripts/lib/standards-loader.mjs` (`readStandardsFromDir`)
- Modify: `scripts/lib/standard-audit.mjs`
- Test: `tests/validation/test-standards-loader.mjs` (estende)
- Test: `tests/standards/test-standard-audit-applies-range.mjs` (criar)

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: cada objeto de standard carregado ganha `appliesFrom: string|null` e `appliesUntil: string|null`. Novo check no audit: standard com `source: devflow-default` **e** faixa declarada é reprovado.

- [ ] **Step 1: Escrever os testes que falham**

```js
// em tests/validation/test-standards-loader.mjs
test("loader propaga appliesFrom/appliesUntil quando declarados", () => {
  const stds = loadStandards("tests/fixtures/version-scoped/std-range");
  const s = stds.find((x) => x.id === "std-range-demo");
  assert.equal(s.appliesFrom, "16");
  assert.equal(s.appliesUntil, "17");
});

test("retrocompat: standard sem faixa carrega com null nos dois campos", () => {
  const stds = loadStandards("tests/fixtures/version-scoped/std-range");
  const s = stds.find((x) => x.id === "std-no-range-demo");
  assert.equal(s.appliesFrom, null);
  assert.equal(s.appliesUntil, null);
});
```

```js
// tests/standards/test-standard-audit-applies-range.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { auditStandard } from "../../scripts/lib/standard-audit.mjs";

test("standard default com appliesFrom é reprovado — faixa é para perfil", () => {
  const r = auditStandard({
    id: "std-security", source: "devflow-default", appliesFrom: "16",
    applyTo: ["**/*.ts"], enforcement: {}, body: "# x",
  });
  const check = r.checks.find((c) => /faixa|appliesFrom/i.test(c.name));
  assert.ok(check, "deve existir um check de faixa");
  assert.notEqual(check.status, "PASS");
});

test("standard de perfil com appliesFrom passa", () => {
  const r = auditStandard({
    id: "std-odoo-owl-patterns", source: "profile:odoo", appliesFrom: "16",
    applyTo: ["**/*.js"], enforcement: {}, body: "# x",
  });
  const check = r.checks.find((c) => /faixa|appliesFrom/i.test(c.name));
  assert.equal(check.status, "PASS");
});
```

Crie os dois fixtures de standard em `tests/fixtures/version-scoped/std-range/` (`std-range-demo.md` com `appliesFrom: "16"` / `appliesUntil: "17"`, e `std-no-range-demo.md` sem os campos), ambos com frontmatter mínimo válido (`id`, `description`, `version`, `applyTo`).

- [ ] **Step 2: Rodar para confirmar que falham**

Run: `node --test tests/validation/test-standards-loader.mjs tests/standards/test-standard-audit-applies-range.mjs`
Expected: FAIL nos 4 casos novos.

- [ ] **Step 3: Propagar os campos no loader**

Em `scripts/lib/standards-loader.mjs`, dentro do `standards.push({...})` de `readStandardsFromDir` (e no equivalente de `loadStandards`), acrescente:

```js
      appliesFrom: fm.appliesFrom != null ? String(fm.appliesFrom) : null,
      appliesUntil: fm.appliesUntil != null ? String(fm.appliesUntil) : null,
```

`String(...)` é deliberado: `appliesFrom: 16` sem aspas vira Number no YAML, e a comparação precisa ser homogênea.

- [ ] **Step 4: Adicionar o check no audit**

Em `scripts/lib/standard-audit.mjs`, novo check:

```js
function checkAppliesRangeOwnership(std) {
  const hasRange = std.appliesFrom != null || std.appliesUntil != null;
  const isDefault = typeof std.source === "string" && std.source.startsWith("devflow-default");
  if (hasRange && isDefault) {
    return {
      name: "Faixa de versão só em standard de perfil",
      status: "FIX-INTERVIEW",
      diagnosis: `${std.id}: standard default não pertence a framework nenhum — não há série contra a qual comparar appliesFrom/appliesUntil`,
    };
  }
  return { name: "Faixa de versão só em standard de perfil", status: "PASS", diagnosis: "" };
}
```

Registre-o na lista de checks executados por `auditStandard`.

- [ ] **Step 5: Rodar para confirmar que passam**

Run: `node --test tests/validation/test-standards-loader.mjs tests/standards/test-standard-audit-applies-range.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/standards-loader.mjs scripts/lib/standard-audit.mjs tests/fixtures/version-scoped/std-range tests/validation/test-standards-loader.mjs tests/standards/test-standard-audit-applies-range.mjs
git commit -m "feat(std): appliesFrom/appliesUntil no loader; audit reprova faixa em default"
```

---

## Task 6: Predicado de versão em `findApplicableStandards`

O chokepoint único da spec (§4). É aqui que a retrocompatibilidade é provada.

**Files:**
- Modify: `scripts/lib/standards-loader.mjs:86` (`findApplicableStandards`)
- Modify: `scripts/lib/run-linter.mjs:140`
- Modify: `scripts/lib/edit-nudge.mjs:30`
- Test: `tests/validation/test-standards-loader.mjs` (estende)

**Interfaces:**
- Consumes: `appliesFrom`/`appliesUntil` da Task 5.
- Produces: `findApplicableStandards(filePath, standards, ctx = {})` — `ctx.versions` é `Map<framework, series>`; `ctx.onSkip` é callback opcional `({id, reason}) => void`. **Terceiro parâmetro opcional**: as chamadas antigas seguem válidas.

- [ ] **Step 1: Escrever o teste que falha**

```js
const RANGED = [
  { id: "std-a", applyTo: ["**/*.xml"], appliesFrom: "18", appliesUntil: null, framework: "odoo" },
  { id: "std-b", applyTo: ["**/*.xml"], appliesFrom: "17", appliesUntil: null, framework: "odoo" },
  { id: "std-c", applyTo: ["**/*.xml"], appliesFrom: null, appliesUntil: null },
];

test("faixa: no Odoo 17 o standard exclusivo do 18 NÃO se aplica", () => {
  const ctx = { versions: new Map([["odoo", "17"]]) };
  const ids = findApplicableStandards("views/x.xml", RANGED, ctx).map((s) => s.id);
  assert.deepEqual(ids.sort(), ["std-b", "std-c"]);
});

test("faixa: no Odoo 18 ambos se aplicam", () => {
  const ctx = { versions: new Map([["odoo", "18"]]) };
  const ids = findApplicableStandards("views/x.xml", RANGED, ctx).map((s) => s.id);
  assert.deepEqual(ids.sort(), ["std-a", "std-b", "std-c"]);
});

test("faixa: appliesUntil é INCLUSIVO", () => {
  const stds = [{ id: "s", applyTo: ["**/*.xml"], appliesFrom: "15", appliesUntil: "17", framework: "odoo" }];
  assert.equal(findApplicableStandards("x.xml", stds, { versions: new Map([["odoo", "17"]]) }).length, 1);
  assert.equal(findApplicableStandards("x.xml", stds, { versions: new Map([["odoo", "18"]]) }).length, 0);
});

test("fail-closed: versão desconhecida PULA o standard com faixa e registra", () => {
  const skipped = [];
  const ctx = { versions: new Map(), onSkip: (e) => skipped.push(e) };
  const ids = findApplicableStandards("views/x.xml", RANGED, ctx).map((s) => s.id);
  assert.deepEqual(ids, ["std-c"], "só o sem-faixa sobrevive");
  assert.equal(skipped.length, 2, "os pulados são registrados, não silenciados");
  assert.ok(skipped.every((s) => s.reason));
});

test("RETROCOMPAT: sem ctx, o comportamento é idêntico ao de hoje", () => {
  const ids = findApplicableStandards("views/x.xml", RANGED).map((s) => s.id);
  assert.deepEqual(ids.sort(), ["std-a", "std-b", "std-c"],
    "sem ctx nenhum standard é filtrado por versão");
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/validation/test-standards-loader.mjs`
Expected: FAIL nos 4 primeiros (o de retrocompat já passa — é o guard).

- [ ] **Step 3: Implementar o predicado**

Em `scripts/lib/standards-loader.mjs`:

```js
// Comparação por série: inteiros, não lexicográfica ("9" < "10").
function inRange(series, from, until) {
  const s = Number(series);
  if (!Number.isFinite(s)) return false;
  if (from != null && s < Number(from)) return false;
  if (until != null && s > Number(until)) return false;  // appliesUntil é INCLUSIVO
  return true;
}

export function findApplicableStandards(filePath, standards, ctx = {}) {
  const versions = ctx.versions instanceof Map ? ctx.versions : null;
  return standards.filter((std) => {
    const pathMatches = std.applyTo.some((pattern) => {
      try { return matchGlob(pattern, filePath); } catch { return false; }
    });
    if (!pathMatches) return false;

    const hasRange = std.appliesFrom != null || std.appliesUntil != null;
    if (!hasRange) return true;          // retrocompat: sem faixa, aplica como sempre
    if (!versions) return true;          // sem ctx: contrato antigo preservado

    const series = versions.get(std.framework);
    if (series == null) {                // fail-closed (Global Constraints)
      if (typeof ctx.onSkip === "function") {
        ctx.onSkip({ id: std.id, reason: `versão de '${std.framework}' desconhecida — standard com faixa pulado` });
      }
      return false;
    }
    if (!inRange(series, std.appliesFrom, std.appliesUntil)) {
      if (typeof ctx.onSkip === "function") {
        ctx.onSkip({ id: std.id, reason: `série ${series} fora da faixa [${std.appliesFrom ?? "-"}, ${std.appliesUntil ?? "-"}]` });
      }
      return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Ligar os dois consumidores**

Em `scripts/lib/run-linter.mjs`, substitua a linha 140:

```js
  const ctx = {
    versions: readFrameworkVersions(projectRoot),
    onSkip: ({ id, reason }) => console.error(`[version-scope] ${id}: ${reason}`),
  };
  const applicable = findApplicableStandards(event.path, standards, ctx);
```

`readFrameworkVersions` chega na Task 7 — **nesta task**, use um stub local que devolve `new Map()` e deixe um comentário `// Task 7 substitui pelo leitor de .devflow.yaml`. Isso mantém a task independentemente testável sem inverter a ordem.

Em `scripts/lib/edit-nudge.mjs:30`, mesma chamada (sem `onSkip` — o nudge é informativo).

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `node --test tests/validation/test-standards-loader.mjs && bash tests/run-unit.sh`
Expected: PASS; suíte completa sem regressão.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/standards-loader.mjs scripts/lib/run-linter.mjs scripts/lib/edit-nudge.mjs tests/validation/test-standards-loader.mjs
git commit -m "feat(std): predicado de faixa de versão em findApplicableStandards (fail-closed, retrocompatível)"
```

---

## Task 7: Persistência das versões em `.devflow.yaml`

**Files:**
- Modify: `scripts/lib/devflow-config.mjs`
- Modify: `scripts/lib/run-linter.mjs` (troca o stub da Task 6)
- Test: `tests/lib/test-devflow-config-frameworks.mjs` (criar)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `readFrameworkVersions(src) -> Map<string, string>` — lê o bloco `frameworks:` de duas profundidades.
  - `readFrameworkVersionsFromProject(projectRoot) -> Map<string, string>` — resolve `.context/.devflow.yaml` e delega. É esta que o `run-linter` usa.

Os leitores existentes (`readField`, `readBlockField`) só cobrem 1–2 níveis; `frameworks.<fw>.version` tem 3. Daí o leitor novo — e ele mora no parser único do ADR-011, não no consumidor.

- [ ] **Step 1: Escrever o teste que falha**

```js
import { readFrameworkVersions } from "../../scripts/lib/devflow-config.mjs";

const SRC = `
git:
  strategy: branch-flow
frameworks:
  odoo:
    version: "17"
    confidence: high
    resolvedAt: "2026-09-02"
mempalace:
  enabled: true
`;

test("readFrameworkVersions lê o bloco aninhado", () => {
  const m = readFrameworkVersions(SRC);
  assert.equal(m.get("odoo"), "17");
});

test("readFrameworkVersions ignora entrada sem version", () => {
  const m = readFrameworkVersions("frameworks:\n  odoo:\n    confidence: unknown\n");
  assert.equal(m.has("odoo"), false);
});

test("readFrameworkVersions devolve Map vazio quando o bloco não existe", () => {
  assert.equal(readFrameworkVersions("git:\n  strategy: x\n").size, 0);
});

test("readFrameworkVersions não vaza a chave do bloco seguinte", () => {
  const m = readFrameworkVersions(SRC);
  assert.equal(m.has("mempalace"), false, "o bloco frameworks termina na desindentação");
});

test("readFrameworkVersions tolera comentário inline", () => {
  const m = readFrameworkVersions('frameworks:\n  odoo:\n    version: "17"  # resolvido\n');
  assert.equal(m.get("odoo"), "17");
});
```

O último caso é deliberado: o parser de `permissions.yaml` já teve exatamente esse bug (comentário inline não removido → valor errado).

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/lib/test-devflow-config-frameworks.mjs`
Expected: FAIL — `readFrameworkVersions is not a function`.

- [ ] **Step 3: Implementar**

```js
// scripts/lib/devflow-config.mjs
export function readFrameworkVersions(src) {
  const out = new Map();
  if (typeof src !== "string") return out;
  const lines = src.split("\n");
  const start = lines.findIndex((l) => /^frameworks\s*:\s*$/.test(l));
  if (start === -1) return out;

  let current = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) break;                       // desindentou: fim do bloco

    const stripped = line.replace(/\s+#.*$/, "");  // comentário inline
    const fw = stripped.match(/^\s{2}([A-Za-z0-9_-]+)\s*:\s*$/);
    if (fw) { current = fw[1]; continue; }

    const ver = stripped.match(/^\s{4}version\s*:\s*["']?([^"'\s]+)["']?\s*$/);
    if (ver && current) out.set(current, ver[1]);
  }
  return out;
}

export function readFrameworkVersionsFromProject(projectRoot) {
  const p = join(projectRoot, ".context", ".devflow.yaml");
  if (!existsSync(p)) return new Map();
  try { return readFrameworkVersions(readFileSync(p, "utf-8")); }
  catch { return new Map(); }
}
```

- [ ] **Step 4: Trocar o stub da Task 6**

Em `scripts/lib/run-linter.mjs`, importe `readFrameworkVersionsFromProject` e use-a no lugar do stub, removendo o comentário `// Task 7 substitui...`.

- [ ] **Step 5: Rodar**

Run: `node --test tests/lib/test-devflow-config-frameworks.mjs && bash tests/run-unit.sh`
Expected: PASS nos 5 novos; suíte completa verde.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/devflow-config.mjs scripts/lib/run-linter.mjs tests/lib/test-devflow-config-frameworks.mjs
git commit -m "feat(config): readFrameworkVersions no parser único; run-linter passa a ler a série real"
```

---

## Task 8: Split do `std-odoo-version-api-hygiene`

Consequência obrigatória da spec (§5): um standard com duas faixas **é** o defeito.

**Files:**
- Create: `assets/standards/profiles/odoo/std-odoo-api-removed-17.md` + `machine/std-odoo-api-removed-17.js`
- Create: `assets/standards/profiles/odoo/std-odoo-api-removed-18.md` + `machine/std-odoo-api-removed-18.js`
- Delete: `assets/standards/profiles/odoo/std-odoo-version-api-hygiene.md` + `machine/std-odoo-version-api-hygiene.js`
- Modify: `assets/standards/profiles/odoo/MANIFEST.txt`, `profiles/odoo.yaml`
- Test: `tests/odoo-standards/test-std-odoo-api-removed-17.mjs`, `...-18.mjs`

**Interfaces:**
- Consumes: `appliesFrom` da Task 5.
- Produces: dois ids novos (`std-odoo-api-removed-17`, `std-odoo-api-removed-18`); o id `std-odoo-version-api-hygiene` deixa de existir.

- [ ] **Step 1: Escrever os testes que falham**

```js
// tests/odoo-standards/test-std-odoo-api-removed-18.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const LINTER = "assets/standards/profiles/odoo/machine/std-odoo-api-removed-18.js";
const XML17 = "tests/fixtures/version-scoped/odoo17/addons/nxz_cadastro/views/cadastro_views.xml";

function run(file) {
  try { return execFileSync("node", [LINTER, file], { encoding: "utf-8" }); }
  catch (e) { return e.stdout?.toString() || ""; }
}

test("regra de <tree> pertence ao 18 e o linter a implementa", () => {
  assert.match(run(XML17), /VIOLATION:.*tree/i,
    "o linter do 18 acusa <tree>; quem decide se ele RODA é a faixa, não o linter");
});

test("o linter do 18 não contém odooTargetSeries — a versão é resolvida fora dele", () => {
  const src = execFileSync("cat", [LINTER], { encoding: "utf-8" });
  assert.doesNotMatch(src, /odooTargetSeries/, "resolução de versão saiu do linter (spec §4)");
  assert.doesNotMatch(src, /MIN_SERIES/);
});
```

```js
// tests/odoo-standards/test-std-odoo-api-removed-17.mjs
const LINTER = "assets/standards/profiles/odoo/machine/std-odoo-api-removed-17.js";
const PY12 = "tests/fixtures/version-scoped/odoo12/addons/legacy_cadastro/models/cadastro.py";

test("regras Python removidas no 17 são acusadas pelo linter", () => {
  const out = run(PY12);
  assert.match(out, /VIOLATION:/);
  assert.match(out, /name_get|api\.multi/);
});

test("o linter do 17 não contém odooTargetSeries", () => {
  const src = execFileSync("cat", [LINTER], { encoding: "utf-8" });
  assert.doesNotMatch(src, /odooTargetSeries|MIN_SERIES/);
});
```

- [ ] **Step 2: Rodar para confirmar que falham**

Run: `node --test tests/odoo-standards/test-std-odoo-api-removed-17.mjs tests/odoo-standards/test-std-odoo-api-removed-18.mjs`
Expected: FAIL — linters inexistentes.

- [ ] **Step 3: Criar os dois standards**

`std-odoo-api-removed-17.md` — frontmatter com `appliesFrom: "17"`, `appliesUntil: null`, `applyTo: ["**/*.py"]`, `enforcement.linter: machine/std-odoo-api-removed-17.js`. Corpo: as 6 regras Python (`name_get`, `@api.one/multi`, `_columns`, `_defaults`, `invalidate_cache`, `search(count=True)`).

`std-odoo-api-removed-18.md` — `appliesFrom: "18"`, `applyTo: ["**/*.xml"]`, corpo com as 3 regras XML (`<tree>`, `attrs=`, `states=`).

Os `.js` são os blocos de regra do linter antigo, **sem** a função `odooTargetSeries` e **sem** o gate `MIN_SERIES` — o contrato SI-4 permanece: `filePath` em `process.argv[2]`, `VIOLATION:` em stdout, exit 1.

- [ ] **Step 4: Atualizar MANIFEST e perfil**

Em `assets/standards/profiles/odoo/MANIFEST.txt`: remova `std-odoo-version-api-hygiene` e acrescente os dois ids novos.
Em `profiles/odoo.yaml`, no bloco `standards:`: mesma troca.

- [ ] **Step 5: Remover o standard antigo**

```bash
git rm assets/standards/profiles/odoo/std-odoo-version-api-hygiene.md \
       assets/standards/profiles/odoo/machine/std-odoo-version-api-hygiene.js
```

- [ ] **Step 6: Rodar**

Run: `node --test tests/odoo-standards/ && node --test tests/integration/test-profile-standards-integrity.mjs`
Expected: PASS — a integridade `MANIFEST × arquivos × perfil` cobra a consistência sozinha.

- [ ] **Step 7: Commit**

```bash
git add -A assets/standards/profiles/odoo profiles/odoo.yaml tests/odoo-standards
git commit -m "refactor(odoo): split std-odoo-version-api-hygiene em -17 (Python) e -18 (XML)"
```

---

## Task 9: Remover as 4 cópias de `odooTargetSeries` e declarar as faixas

**Files:**
- Modify: `assets/standards/profiles/odoo/machine/std-odoo-js-modules.js` (`MIN_SERIES = 16`)
- Modify: `.../std-odoo-owl-patterns.js` (`MIN_SERIES = 16`)
- Modify: `.../std-odoo-qweb-escaping.js` (`MIN_SERIES = 15`)
- Modify: os 3 `.md` correspondentes (frontmatter `appliesFrom`) e a `description` do owl-patterns
- Test: `tests/integration/test-profile-standards-wiring.mjs` (estende)

**Interfaces:**
- Consumes: predicado da Task 6; faixas da Task 5.
- Produces: nenhum linter de perfil contém resolução de versão. A faixa vive só no frontmatter.

- [ ] **Step 1: Escrever o teste de regressão que falha**

```js
test("REGRESSÃO nexuz/odoo_17: nenhuma regra exclusiva do 18 se aplica a um projeto 17", () => {
  const stds = loadStandardsForProfile("odoo");           // helper já existente no arquivo
  const ctx = { versions: new Map([["odoo", "17"]]) };
  const ids = findApplicableStandards(
    "addons/nxz_cadastro/views/cadastro_views.xml", stds, ctx,
  ).map((s) => s.id);
  assert.ok(!ids.includes("std-odoo-api-removed-18"),
    "a regra de <tree>/attrs é do 18 — 47 falso-positivos vinham daqui");
});

test("REGRESSÃO Odoo 12: nem as regras de 17 nem as de 18 se aplicam", () => {
  const stds = loadStandardsForProfile("odoo");
  const ctx = { versions: new Map([["odoo", "12"]]) };
  const ids = findApplicableStandards("addons/legacy_cadastro/models/cadastro.py", stds, ctx).map((s) => s.id);
  assert.ok(!ids.includes("std-odoo-api-removed-17"));
  assert.ok(!ids.includes("std-odoo-api-removed-18"));
});

test("nenhum linter do perfil odoo resolve versão por conta própria", () => {
  const files = readdirSync("assets/standards/profiles/odoo/machine").filter((f) => f.endsWith(".js"));
  for (const f of files) {
    const src = readFileSync(join("assets/standards/profiles/odoo/machine", f), "utf-8");
    assert.doesNotMatch(src, /odooTargetSeries/, `${f} ainda resolve versão internamente`);
    assert.doesNotMatch(src, /MIN_SERIES/, `${f} ainda tem gate de série próprio`);
  }
});

test("as faixas declaradas batem com os pisos que os MIN_SERIES codificavam", () => {
  const byId = Object.fromEntries(loadStandardsForProfile("odoo").map((s) => [s.id, s]));
  assert.equal(byId["std-odoo-js-modules"].appliesFrom, "16");
  assert.equal(byId["std-odoo-owl-patterns"].appliesFrom, "16");
  assert.equal(byId["std-odoo-qweb-escaping"].appliesFrom, "15");
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/integration/test-profile-standards-wiring.mjs`
Expected: FAIL — os `odooTargetSeries` ainda existem.

- [ ] **Step 3: Declarar as faixas no frontmatter**

Em cada `.md`, acrescente ao frontmatter (`appliesUntil: null` explícito, para o campo não parecer esquecido):

```yaml
appliesFrom: "16"     # js-modules e owl-patterns; qweb-escaping usa "15"
appliesUntil: null
```

E corrija a `description` do `std-odoo-owl-patterns` — o rótulo "Odoo 18" é impreciso, as regras valem do 16 em diante:

```yaml
description: OWL 2 — padrões de componente (Odoo 16+)
```

- [ ] **Step 4: Deletar a função e o gate dos 3 linters**

Em cada um dos três `.js`: remova o bloco `function odooTargetSeries(...) {...}`, a constante `MIN_SERIES`, o `if` que usa as duas, e os imports que ficaram órfãos (`dirname`, `join`, `existsSync`, se não usados em mais nada). O corpo da regra fica intacto.

- [ ] **Step 5: Rodar**

Run: `node --test tests/integration/test-profile-standards-wiring.mjs && node --test tests/odoo-standards/ && bash tests/run-unit.sh`
Expected: PASS. As duas regressões da spec ficam verdes aqui.

- [ ] **Step 6: Commit**

```bash
git add assets/standards/profiles/odoo tests/integration/test-profile-standards-wiring.mjs
git commit -m "refactor(odoo): remove 4 cópias de odooTargetSeries; faixa vive no frontmatter"
```

---

## Task 10: `reconcileManifest` na lib de manifest

**Files:**
- Modify: `scripts/lib/manifest-stacks.mjs` (exportar `writeManifest`; adicionar `reconcileManifest`)
- Test: `tests/lib/test-manifest-reconcile.mjs` (criar)

**Interfaces:**
- Consumes: `stackVersions` da Task 4.
- Produces:
  - `writeManifest(projectRoot, manifest)` — **passa a ser exportada** (hoje é `function` privada na linha 237).
  - `reconcileManifest(projectRoot, { entries, versions, axis }) -> { added, pruned, repinned, kept }` — **calcula e devolve o plano sem escrever** quando `dryRun: true`.

Poda é destrutiva: a lib devolve o plano; quem escreve é o CLI da Task 11, depois da confirmação.

- [ ] **Step 1: Escrever o teste que falha**

```js
test("eixo série: mantém só a série resolvida e poda as demais", () => {
  const tmp = setupManifest({ frameworks: {
    "odoo-12": { version: "12.0", mcpIndexed: true },
    "odoo-17": { version: "17.0", mcpIndexed: true },
    "odoo-18": { version: "18.0", mcpIndexed: true },
  } });
  const r = reconcileManifest(tmp, {
    axis: "series", entries: ODOO_SERIES_ENTRIES,
    versions: new Map([["odoo", "17"]]), dryRun: true,
  });
  assert.deepEqual(r.kept, ["odoo-17"]);
  assert.deepEqual(r.pruned.sort(), ["odoo-12", "odoo-18"]);
  assert.equal(r.added.length, 0);
});

test("dryRun NÃO escreve o manifesto", () => {
  const tmp = setupManifest({ frameworks: { "odoo-12": { version: "12.0" } } });
  const before = readFileSync(join(tmp, ".context/engineering/stacks/manifest.yaml"), "utf-8");
  reconcileManifest(tmp, { axis: "series", entries: ODOO_SERIES_ENTRIES, versions: new Map([["odoo", "17"]]), dryRun: true });
  assert.equal(readFileSync(join(tmp, ".context/engineering/stacks/manifest.yaml"), "utf-8"), before);
});

test("eixo composição: re-pina a versão real e não poda coexistentes", () => {
  const tmp = setupManifest({ frameworks: {
    react: { version: "19", mcpIndexed: true },
    typescript: { version: "6", mcpIndexed: true },
  } });
  const r = reconcileManifest(tmp, {
    axis: "composition",
    entries: [{ lib: "react" }, { lib: "typescript" }],
    versions: new Map([["react", "18"], ["typescript", "5"]]), dryRun: true,
  });
  assert.deepEqual(r.pruned, [], "eixo composição nunca poda por coexistência");
  assert.deepEqual(r.repinned.sort((a, b) => a.lib.localeCompare(b.lib)), [
    { lib: "react", from: "19", to: "18" },
    { lib: "typescript", from: "6", to: "5" },
  ]);
});

test("FAIL-CLOSED: versão ambiguous/unknown não poda nada", () => {
  const tmp = setupManifest({ frameworks: { "odoo-12": { version: "12.0" }, "odoo-17": { version: "17.0" } } });
  const r = reconcileManifest(tmp, {
    axis: "series", entries: ODOO_SERIES_ENTRIES, versions: new Map(), dryRun: true,
  });
  assert.deepEqual(r.pruned, [], "sem versão resolvida, poda é proibida");
  assert.equal(r.kept.length, 2, "mantém tudo — nunca adivinha");
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/lib/test-manifest-reconcile.mjs`
Expected: FAIL — `reconcileManifest is not a function`.

- [ ] **Step 3: Implementar**

Troque `function writeManifest(` por `export function writeManifest(` na linha 237 e acrescente:

```js
/**
 * Faz o manifesto CASAR com o projeto. Diferente de addFrameworksToManifest,
 * que é aditivo: aqui existe PODA — capacidade nova, e é por isso que o sync
 * nunca conseguia corrigir nada, só acumular.
 *
 * Fail-closed: sem versão resolvida, NADA é podado.
 */
export function reconcileManifest(projectRoot, { entries, versions, axis, dryRun = false }) {
  const manifest = loadManifest(projectRoot);
  const result = { added: [], pruned: [], repinned: [], kept: [] };
  const declared = new Set((entries || []).map((e) => e.lib));

  if (axis === "series") {
    const family = (entries || [])[0]?.family;
    const series = versions.get(family || (entries || [])[0]?.framework);
    if (series == null) {                       // fail-closed
      result.kept = Object.keys(manifest.frameworks).filter((k) => declared.has(k));
      return result;
    }
    const winner = (entries || []).find((e) => String(e.series) === String(series));
    for (const lib of Object.keys(manifest.frameworks)) {
      if (!declared.has(lib)) continue;         // não mexe no que o perfil não declara
      if (winner && lib === winner.lib) result.kept.push(lib);
      else result.pruned.push(lib);
    }
    if (winner && !manifest.frameworks[winner.lib]) {
      result.added.push(winner.lib);
    }
  } else {
    for (const e of entries || []) {
      const cur = manifest.frameworks[e.lib];
      const real = versions.get(e.lib);
      if (!cur) { if (real) result.added.push(e.lib); continue; }
      result.kept.push(e.lib);
      if (real && String(cur.version) !== String(real)) {
        result.repinned.push({ lib: e.lib, from: String(cur.version), to: String(real) });
      }
    }
  }

  if (!dryRun) {
    for (const lib of result.pruned) delete manifest.frameworks[lib];
    for (const { lib, to } of result.repinned) manifest.frameworks[lib].version = to;
    for (const lib of result.added) manifest.frameworks[lib] = { version: String(versions.get(lib) ?? ""), mcpIndexed: true };
    writeManifest(projectRoot, manifest);
  }
  return result;
}
```

Acrescente `family` e `series` às entradas `stacks:` do `profiles/odoo.yaml` (`family: odoo`, `series: "17"` etc.) para que a lib saiba qual série cada lib representa sem heurística de nome.

- [ ] **Step 4: Rodar**

Run: `node --test tests/lib/test-manifest-reconcile.mjs`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/manifest-stacks.mjs profiles/odoo.yaml tests/lib/test-manifest-reconcile.mjs
git commit -m "feat(stacks): reconcileManifest com poda, re-pin e fail-closed (dryRun por padrão)"
```

---

## Task 11: Subcomando `devflow-stacks.mjs reconcile`

**Files:**
- Modify: `scripts/devflow-stacks.mjs`
- Test: `tests/integration/test-stacks-reconcile.mjs` (criar, irmão de `test-stacks-add.mjs`)

**Interfaces:**
- Consumes: `reconcileManifest` (Task 10), `frameworkContributions().stackVersions` (Task 4).
- Produces: `devflow stacks reconcile --project=<path> [--yes] [--dry-run]`. **Sem `--yes`, imprime o plano e sai sem escrever quando há poda.**

- [ ] **Step 1: Escrever o teste que falha**

```js
test("reconcile sem --yes NÃO poda: imprime o plano e preserva o manifesto", () => {
  const tmp = setupOdoo17Project();
  const before = readFileSync(manifestPath(tmp), "utf-8");
  const out = execFileSync("node", ["scripts/devflow-stacks.mjs", "reconcile", `--project=${tmp}`], { encoding: "utf-8" });
  assert.match(out, /odoo-12/, "o plano lista o que seria podado");
  assert.match(out, /--yes/, "o plano diz como confirmar");
  assert.equal(readFileSync(manifestPath(tmp), "utf-8"), before, "nada foi escrito sem confirmação");
});

test("reconcile --yes poda as 6 séries e mantém odoo-17", () => {
  const tmp = setupOdoo17Project();
  execFileSync("node", ["scripts/devflow-stacks.mjs", "reconcile", `--project=${tmp}`, "--yes"], { encoding: "utf-8" });
  const m = loadManifest(tmp);
  assert.deepEqual(Object.keys(m.frameworks).filter((k) => k.startsWith("odoo-")), ["odoo-17"]);
});

test("reconcile é idempotente: a segunda passada não muda nada", () => {
  const tmp = setupOdoo17Project();
  execFileSync("node", ["scripts/devflow-stacks.mjs", "reconcile", `--project=${tmp}`, "--yes"]);
  const after1 = readFileSync(manifestPath(tmp), "utf-8");
  execFileSync("node", ["scripts/devflow-stacks.mjs", "reconcile", `--project=${tmp}`, "--yes"]);
  assert.equal(readFileSync(manifestPath(tmp), "utf-8"), after1);
});

test("reconcile imprime a evidência da resolução", () => {
  const tmp = setupOdoo17Project();
  const out = execFileSync("node", ["scripts/devflow-stacks.mjs", "reconcile", `--project=${tmp}`], { encoding: "utf-8" });
  assert.match(out, /\.gitmodules/);
  assert.match(out, /Dockerfile/);
  assert.match(out, /high/);
});
```

`setupOdoo17Project()` copia `tests/fixtures/version-scoped/odoo17` para um tmpdir e semeia o manifesto com as 7 séries — **nunca opera in-place sobre o fixture versionado**.

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/integration/test-stacks-reconcile.mjs`
Expected: FAIL — subcomando inexistente.

- [ ] **Step 3: Implementar o subcomando**

No `switch` de `scripts/devflow-stacks.mjs`, ao lado de `add`:

```js
    case "reconcile": {
      const c = frameworkContributions(projectRoot, pluginRoot);
      const versions = new Map((c.stackVersions || []).map((s) => [s.lib, s.version]));
      const seriesEntries = (c.stacks || []).filter((s) => s.family);
      const plan = reconcileManifest(projectRoot, {
        axis: "series", entries: seriesEntries, versions, dryRun: true,
      });

      for (const sv of c.stackVersions || []) {
        console.log(`${sv.lib}: ${sv.version ?? "<não resolvida>"} (${sv.confidence})`);
        for (const e of sv.evidence || []) console.log(`  - ${e.probe}: ${e.value ?? "—"} [${e.source}]`);
      }
      console.log(`manter: ${plan.kept.join(", ") || "—"}`);
      console.log(`podar:  ${plan.pruned.join(", ") || "—"}`);
      console.log(`re-pin: ${plan.repinned.map((r) => `${r.lib} ${r.from}→${r.to}`).join(", ") || "—"}`);

      if (plan.pruned.length > 0 && !yes) {
        console.log("\nPoda é destrutiva. Reveja o plano acima e confirme com --yes.");
        break;
      }
      reconcileManifest(projectRoot, { axis: "series", entries: seriesEntries, versions, dryRun: false });
      console.log("manifesto reconciliado.");
      break;
    }
```

Registre `reconcile` nas duas linhas de `Usage:` do arquivo (linhas 322 e 361) e no bloco de ajuda.

- [ ] **Step 4: Rodar**

Run: `node --test tests/integration/test-stacks-reconcile.mjs && bash tests/run-integration.sh`
Expected: PASS — 4/4; integração sem regressão.

- [ ] **Step 5: Commit**

```bash
git add scripts/devflow-stacks.mjs tests/integration/test-stacks-reconcile.mjs
git commit -m "feat(stacks): subcomando reconcile — poda só sob --yes, com evidência impressa"
```

---

## Task 12: Fiação em `project-init`, `context-sync` e ponteiro no `/devflow update`

**Files:**
- Modify: `skills/project-init/SKILL.md` (Step 3c-5)
- Modify: `skills/context-sync/SKILL.md` (a instrução aditiva que reproduz o bug)
- Modify: `commands/devflow.md` (Step 5/6 do `/devflow update`)
- Test: `tests/skills/test-skill-reconcile-wiring.mjs` (criar)

**Interfaces:**
- Consumes: o CLI da Task 11.
- Produces: nenhuma API nova — os skills param de decidir e passam a chamar.

- [ ] **Step 1: Escrever o teste que falha**

```js
test("context-sync não instrui mais semeadura aditiva incondicional", () => {
  const src = readFileSync("skills/context-sync/SKILL.md", "utf-8");
  assert.doesNotMatch(src, /para cada .*stack.* ausente no manifest/i,
    "a instrução aditiva é a que reproduz o bug: poda manual era desfeita no sync seguinte");
  assert.match(src, /devflow-stacks\.mjs reconcile/, "deve delegar ao reconcile");
});

test("project-init delega ao reconcile em vez de semear as 7 séries", () => {
  const src = readFileSync("skills/project-init/SKILL.md", "utf-8");
  assert.match(src, /devflow-stacks\.mjs reconcile/);
});

test("o ponteiro do /devflow update não executa reconcile sozinho", () => {
  const src = readFileSync("commands/devflow.md", "utf-8");
  assert.match(src, /devflow:devflow-sync/, "update apenas APONTA");
  const updateSection = src.slice(src.indexOf("### `/devflow update`"), src.indexOf("### `/devflow language"));
  assert.doesNotMatch(updateSection, /stacks\.mjs reconcile/,
    "update atualiza plugin e toolchain — nunca muta o manifesto do projeto");
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/skills/test-skill-reconcile-wiring.mjs`
Expected: FAIL nos três.

- [ ] **Step 3: Reescrever a instrução do `context-sync`**

Substitua a instrução aditiva por:

```markdown
**Stacks — reconciliação, não semeadura.** NÃO adicione stacks ausentes um a um: essa
instrução era aditiva e incondicional, e desfazia qualquer poda manual no sync seguinte.
Delegue ao reconcile, que faz o manifesto casar com o projeto:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/devflow-stacks.mjs" reconcile --project=<PWD>
```

Sem `--yes` ele **mostra o plano e não escreve** quando há poda. Adicionar stack dentro
da faixa e re-pinar versão do eixo composição são silenciosos; **podar exige confirmação
do usuário** — mostre o plano e pergunte antes de repetir com `--yes`.
```

- [ ] **Step 4: Trocar a semeadura do `project-init`**

No Step 3c-5, substitua o loop de `devflow stacks add` por uma única chamada de `reconcile`, preservando o texto sobre Standards de perfil (que não muda nesta feature).

- [ ] **Step 5: Acrescentar o ponteiro no `/devflow update`**

No Step 6 de `commands/devflow.md`, na lista de features não configuradas:

```
▸ Escopo de versão de stacks — o manifesto pode ter séries que o projeto não usa
  Para ativar:  /devflow:devflow-sync
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `bash tests/run-lint.sh && bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-e2e.sh`
Expected: os quatro com exit 0.

- [ ] **Step 7: Commit**

```bash
git add skills/project-init/SKILL.md skills/context-sync/SKILL.md commands/devflow.md tests/skills/test-skill-reconcile-wiring.mjs
git commit -m "feat(sync): init e context-sync delegam ao reconcile; update apenas aponta"
```

---

## Self-Review

**Cobertura da spec:**

| Seção da spec | Task |
|---|---|
| §1 Dois eixos (`series` × composição) | 4 (declaração), 10 (comportamento distinto) |
| §2 Resolução de versão + confiança + evidência-lista | 2, 3 |
| §3 `appliesFrom`/`appliesUntil`; só perfil declara | 5 |
| §4 Assimetria; chokepoint; remoção dos MIN_SERIES | 6, 9 |
| §5 Split obrigatório do version-api-hygiene | 8 |
| §6 Operação única `reconcile` com poda | 10, 11 |
| §7 Fluxo de init e sync; `/devflow update` só aponta | 12 |
| §8 Persistência só do eixo série | 7 |
| Testes de regressão (odoo17 + odoo12) | 1 (fixtures), 9 (asserções) |
| Retrocompatibilidade como propriedade principal | 4, 5, 6 (teste dedicado em cada) |

**Fora deste plano, conforme a spec:** override de versão por caminho (monorepo multi-versão), adicionar `expo`/`react-native` aos defaults, e revisar os pins de curadoria dos ~22 stacks default (`react: "19"` etc.) — o plano os torna *resolvíveis*, revisar cada um é trabalho à parte.

**Consistência de tipos:** `resolveStackVersions` devolve `Map<lib, {version, confidence, evidence}>` (Task 3); a Task 4 acrescenta `axis` e `lib` ao achatar em `stackVersions[]`; as Tasks 6 e 11 consomem `Map<framework, series>` de string. As séries trafegam como **string** em toda parte e só viram Number dentro de `inRange` — evita a comparação lexicográfica que quebraria em `"9"` vs `"10"`.

**Nota de ordem:** a Task 6 usa um stub de `readFrameworkVersions` que a Task 7 substitui. É deliberado: mantém cada task independentemente testável sem inverter a ordem lógica (predicado antes de persistência).

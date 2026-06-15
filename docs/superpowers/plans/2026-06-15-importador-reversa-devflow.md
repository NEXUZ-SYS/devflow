# Importador Reversa → DevFlow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a skill `devflow:import-reversa` + lib Node que lê um projeto gerado pelo Reversa e o aterrissa como projeto DevFlow executável com fidelidade híbrida (executar + preservar).

**Architecture:** Lib pura `node:*` em `scripts/reversa-import/` organizada na fronteira do **IR** (modelo intermediário): `parsers/` produzem fragmentos de IR a partir dos artefatos Reversa; `emitters/` consomem IR e escrevem artefatos DevFlow. Estágios puros e testáveis (`detect → readiness → parse → map → validate → emit → report`) orquestrados por `pipeline.mjs`. A skill `SKILL.md` adiciona a camada interativa (destino, bootstrap, decisão de readiness, loop de reconciliação) e o julgamento de fidelidade que exige LLM.

**Tech Stack:** Node ESM (`.mjs`), apenas `node:*` (fs, path, util, crypto, test, assert). Testes com `node:test`. Sem dependências externas (Dependency Policy do repo). Skill em markdown (`skills/import-reversa/SKILL.md`).

**Spec:** `docs/superpowers/specs/2026-06-13-importador-reversa-devflow-design.md`
**Fixture (read-only, sempre copiado p/ tmpdir):** `/home/walterfrey/Documentos/code/reversa-com-attio`

---

## Convenções deste plano (leia antes de começar)

- **TDD obrigatório:** RED → GREEN → REFACTOR. Nunca escreva implementação antes do teste falhar. Testes reais (unit + integração + E2E), nunca content-checks.
- **Nunca mutar o fixture versionado.** Todo teste que escreve ou roda o pipeline destrutivo copia o `reversa-com-attio` (ou uma fixture sintética) para `mkdtempSync(join(tmpdir(), "rev-import-"))` e roda lá. O `reversa-com-attio` original é somente-leitura.
- **Rodar um teste:** `node --test tests/reversa-import/<arquivo>.test.mjs`
- **Rodar todos:** `node --test tests/reversa-import/`
- **Commits frequentes:** um commit por task concluída (verde). Mensagens em conventional commits, pt-BR no corpo, terminando com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Sem PR/merge/push autônomo** durante a execução. O fechamento de branch é a fase C do PREVC, com humano no loop.
- **Verdicts de readiness/consistency** usam strings minúsculas: `"green"` | `"yellow"` | `"red"`.
- **Marcadores de confiança:** `🟦` oficial · `🟢` capturado · `🟡` inferido · `🔴` lacuna.

## Estrutura de arquivos

```
scripts/reversa-import/
  markers.mjs            # util: varre marcadores de confiança em texto
  ir.mjs                 # createIR() + validateIR() — a fronteira input↔output
  detect.mjs             # detectReversa(sourceDir) → {isReversa, artifacts, reasons}
  readiness.mjs          # assessReadiness(sourceDir) → readiness assessment (triangula sinais)
  parsers/
    state.mjs            # parseState(sourceDir) → fragmento IR.project
    reconstruction-plan.mjs  # parseReconstructionPlan(text) → IR.tasks + IR.milestones
    forward-feature.mjs  # parseForwardFeature(featureDir) → IR.features[i] (requirements/roadmap)
    sdd-spec.mjs         # parseSddSpec(featureDir) → spec/screens/interfaces + specLineCount
    decisions.mjs        # parseDecisions(sddDir) → IR.decisions
    review.mjs           # parseReview(reviewDir) → findings CRITICAL/HIGH
    soul.mjs             # parseSoul(sourceDir) → metadados narrativos (tolerante)
  emitters/
    prd.mjs              # emitPrd(ir) → string markdown do PRD faseado
    adrs.mjs             # emitAdrs(ir) → [{filename, body}] (ADRs do projeto importado)
    plans.mjs            # emitPlans(ir) → {plansJson, planSkeletons:[{feature, body}]}
    stories.mjs          # emitStories(ir) → string YAML (só 1ª onda)
    preserve.mjs         # emitPreserve(ir, sourceDir) → [{from, to}] (cópia fiel de refs)
    manifest.mjs         # emitManifest(ir, emitted) → string JSON (proveniência + hashes)
    fidelity-report.mjs  # emitFidelityReport(ir) → string markdown
  consistency.mjs        # validateConsistency(ir, emitted) → {checks:[{id, status, issues}]}
  pipeline.mjs           # runPipeline({sourceDir, destDir, hooks}) → resultado completo

skills/import-reversa/
  SKILL.md               # orquestra interativo + julgamento de fidelidade (LLM)
  references/
    pipeline-contract.md # contrato lib↔skill (o que a skill chama, o que recebe)
  tests/
    skill-structure.test.mjs

commands/
  devflow-import-reversa.md  # /devflow import-reversa <source>

tests/reversa-import/
  fixtures/              # fixtures sintéticas (green/yellow/red, planos inconsistentes)
  *.test.mjs
```

---

## Fase 1 — Fundação: marcadores + IR

### Task 1: Util de marcadores de confiança

**Files:**
- Create: `scripts/reversa-import/markers.mjs`
- Test: `tests/reversa-import/markers.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/markers.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanMarkers, MARKER } from "../../scripts/reversa-import/markers.mjs";

describe("scanMarkers", () => {
  it("conta cada nível de confiança num texto", () => {
    const text = "🟦 oficial\n🟢 capturado\n🟢 outro\n🟡 inferido\n🔴 lacuna";
    const r = scanMarkers(text);
    assert.equal(r.official, 1);
    assert.equal(r.captured, 2);
    assert.equal(r.inferred, 1);
    assert.equal(r.gap, 1);
    assert.equal(r.total, 5);
  });

  it("extrai as linhas de lacuna (🔴) como itens acionáveis", () => {
    const text = "ok\n🔴 falta definir auth provider\nmais\n🔴 sem schema de billing";
    const r = scanMarkers(text);
    assert.deepEqual(r.gaps, [
      "falta definir auth provider",
      "sem schema de billing",
    ]);
  });

  it("texto sem marcadores retorna zeros e gaps vazio", () => {
    const r = scanMarkers("nenhum marcador aqui");
    assert.equal(r.total, 0);
    assert.deepEqual(r.gaps, []);
  });

  it("MARKER expõe os glyphs canônicos", () => {
    assert.equal(MARKER.official, "🟦");
    assert.equal(MARKER.gap, "🔴");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/reversa-import/markers.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/reversa-import/markers.mjs'`

- [ ] **Step 3: Implementar o mínimo**

```javascript
// scripts/reversa-import/markers.mjs
// Util puro: varre marcadores de confiança Reversa num texto.
// 🟦 oficial · 🟢 capturado · 🟡 inferido · 🔴 lacuna

export const MARKER = Object.freeze({
  official: "🟦",
  captured: "🟢",
  inferred: "🟡",
  gap: "🔴",
});

const KEY_BY_GLYPH = {
  [MARKER.official]: "official",
  [MARKER.captured]: "captured",
  [MARKER.inferred]: "inferred",
  [MARKER.gap]: "gap",
};

export function scanMarkers(text = "") {
  const counts = { official: 0, captured: 0, inferred: 0, gap: 0 };
  const gaps = [];
  for (const line of String(text).split("\n")) {
    for (const glyph of Object.keys(KEY_BY_GLYPH)) {
      if (line.includes(glyph)) counts[KEY_BY_GLYPH[glyph]] += 1;
    }
    const gapIdx = line.indexOf(MARKER.gap);
    if (gapIdx !== -1) {
      const after = line.slice(gapIdx + MARKER.gap.length).trim();
      if (after) gaps.push(after);
    }
  }
  const total = counts.official + counts.captured + counts.inferred + counts.gap;
  return { ...counts, total, gaps };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/reversa-import/markers.test.mjs`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/markers.mjs tests/reversa-import/markers.test.mjs
git commit -m "feat(import-reversa): util de marcadores de confiança

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Modelo intermediário (IR) + validador

**Files:**
- Create: `scripts/reversa-import/ir.mjs`
- Test: `tests/reversa-import/ir.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/ir.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR, validateIR } from "../../scripts/reversa-import/ir.mjs";

describe("createIR", () => {
  it("cria um IR vazio com todas as coleções inicializadas", () => {
    const ir = createIR();
    assert.deepEqual(ir.tasks, []);
    assert.deepEqual(ir.milestones, []);
    assert.deepEqual(ir.features, []);
    assert.deepEqual(ir.decisions, []);
    assert.deepEqual(ir.gaps, []);
    assert.deepEqual(ir.preserve, []);
    assert.deepEqual(ir.provenance, []);
    assert.equal(ir.project.name, null);
    assert.deepEqual(ir.readiness, { global: null, perFeature: {} });
  });
});

describe("validateIR", () => {
  it("aceita um IR mínimo válido", () => {
    const ir = createIR();
    ir.project.name = "demo";
    ir.tasks.push({ id: "T01", name: "infra", dependsOn: [], milestone: "M1", confidence: "captured" });
    const r = validateIR(ir);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
  });

  it("rejeita task com dependsOn que não é array", () => {
    const ir = createIR();
    ir.tasks.push({ id: "T01", name: "x", dependsOn: "T00", milestone: null, confidence: "captured" });
    const r = validateIR(ir);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("dependsOn")));
  });

  it("rejeita task sem id", () => {
    const ir = createIR();
    ir.tasks.push({ name: "sem id", dependsOn: [], milestone: null, confidence: "captured" });
    const r = validateIR(ir);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("id")));
  });

  it("rejeita verdict de readiness inválido", () => {
    const ir = createIR();
    ir.readiness.global = "purple";
    const r = validateIR(ir);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes("readiness")));
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/reversa-import/ir.test.mjs`
Expected: FAIL — módulo `ir.mjs` não encontrado

- [ ] **Step 3: Implementar o mínimo**

```javascript
// scripts/reversa-import/ir.mjs
// Modelo intermediário (IR) normalizado: a fronteira entre parsers (input Reversa)
// e emitters (output DevFlow). Adicionar tipo de input = novo parser; adicionar
// tipo de output = novo emitter. Nenhum lado conhece o outro.

const VERDICTS = new Set(["green", "yellow", "red"]);

export function createIR() {
  return {
    project: { name: null, language: null, sourceType: null, target: null, declaredPhase: null },
    readiness: { global: null, perFeature: {} }, // verdict por feature + global
    tasks: [],        // { id, name, dependsOn:[], milestone, confidence }
    milestones: [],   // { id, after, demo }
    features: [],     // { slug, requirements, specPath, specLineCount, hasForward, hasSdd, screens, interfaces, markers }
    decisions: [],    // { id, title, status, confidence, body }
    gaps: [],         // { feature, text }
    preserve: [],     // { sourcePath, destSubpath, kind, feature }
    provenance: [],   // { devflowArtifact, reversaSource, hash } — preenchido por emitters
  };
}

export function validateIR(ir) {
  const errors = [];
  if (!ir || typeof ir !== "object") return { ok: false, errors: ["IR ausente ou não-objeto"] };

  for (const [i, t] of (ir.tasks || []).entries()) {
    if (!t.id) errors.push(`tasks[${i}]: falta id`);
    if (!Array.isArray(t.dependsOn)) errors.push(`tasks[${i}].dependsOn deve ser array`);
  }
  for (const [i, f] of (ir.features || []).entries()) {
    if (!f.slug) errors.push(`features[${i}]: falta slug`);
  }
  if (ir.readiness?.global != null && !VERDICTS.has(ir.readiness.global)) {
    errors.push(`readiness.global inválido: ${ir.readiness.global}`);
  }
  for (const [feat, v] of Object.entries(ir.readiness?.perFeature || {})) {
    if (!VERDICTS.has(v)) errors.push(`readiness.perFeature.${feat} inválido: ${v}`);
  }
  return { ok: errors.length === 0, errors };
}

export { VERDICTS };
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/reversa-import/ir.test.mjs`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/ir.mjs tests/reversa-import/ir.test.mjs
git commit -m "feat(import-reversa): modelo intermediário (IR) + validador

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Fase 2 — Detecção & Readiness Gate

### Task 3: Detector de source Reversa

**Files:**
- Create: `scripts/reversa-import/detect.mjs`
- Test: `tests/reversa-import/detect.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/detect.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectReversa } from "../../scripts/reversa-import/detect.mjs";

function makeSource({ reversa = true, forward = true, sdd = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "rev-detect-"));
  if (reversa) {
    mkdirSync(join(dir, ".reversa"));
    writeFileSync(join(dir, ".reversa", "state.json"), JSON.stringify({ version: "1.2.43" }));
  }
  if (forward) mkdirSync(join(dir, "_reversa_forward"));
  if (sdd) mkdirSync(join(dir, "_reversa_sdd"));
  return dir;
}

describe("detectReversa", () => {
  it("reconhece um projeto Reversa completo", () => {
    const dir = makeSource();
    try {
      const r = detectReversa(dir);
      assert.equal(r.isReversa, true);
      assert.ok(r.artifacts.includes("state.json"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejeita um dir sem .reversa/", () => {
    const dir = makeSource({ reversa: false });
    try {
      const r = detectReversa(dir);
      assert.equal(r.isReversa, false);
      assert.ok(r.reasons.some((x) => x.includes(".reversa")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("aceita com forward ausente mas reporta o que falta (tolerante)", () => {
    const dir = makeSource({ forward: false });
    try {
      const r = detectReversa(dir);
      assert.equal(r.isReversa, true); // .reversa + sdd bastam
      assert.ok(r.missing.includes("_reversa_forward"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/reversa-import/detect.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar o mínimo**

```javascript
// scripts/reversa-import/detect.mjs
// Detecção tolerante: .reversa/ é obrigatório; forward/sdd são esperados mas
// ausências viram "missing" (degradação graciosa), não erro fatal.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function detectReversa(sourceDir) {
  const reasons = [];
  const missing = [];
  const artifacts = [];

  const reversaDir = join(sourceDir, ".reversa");
  const hasReversa = existsSync(reversaDir);
  if (!hasReversa) reasons.push("ausente: .reversa/ (diretório de controle do Reversa)");

  if (hasReversa) {
    for (const f of ["state.json", "plan.md", "soul.md"]) {
      if (existsSync(join(reversaDir, f))) artifacts.push(f);
      else missing.push(`.reversa/${f}`);
    }
  }
  const hasSdd = existsSync(join(sourceDir, "_reversa_sdd"));
  const hasForward = existsSync(join(sourceDir, "_reversa_forward"));
  if (!hasSdd) missing.push("_reversa_sdd");
  if (!hasForward) missing.push("_reversa_forward");

  // Critério mínimo: .reversa/ presente E (sdd OU forward).
  const isReversa = hasReversa && (hasSdd || hasForward);
  if (hasReversa && !hasSdd && !hasForward) {
    reasons.push("ausente: nenhum de _reversa_sdd/ ou _reversa_forward/");
  }

  return { isReversa, artifacts, missing, reasons, hasForward, hasSdd };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/reversa-import/detect.test.mjs`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/detect.mjs tests/reversa-import/detect.test.mjs
git commit -m "feat(import-reversa): detector tolerante de source Reversa

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Fixtures sintéticas de readiness (green/yellow/red)

**Files:**
- Create: `tests/reversa-import/fixtures/make-fixture.mjs`
- Test: `tests/reversa-import/fixtures.test.mjs`

Esta task cria um helper reutilizável que monta projetos Reversa sintéticos em tmpdir, para testar o readiness gate e o pipeline sem depender do fixture real grande.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/fixtures.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";

describe("makeReversaFixture", () => {
  it("monta um projeto green com 1 feature completa", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try {
      assert.ok(existsSync(join(dir, ".reversa", "state.json")));
      assert.ok(existsSync(join(dir, "_reversa_sdd", "reconstruction-plan.md")));
      const plan = readFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), "utf-8");
      assert.match(plan, /### Tarefa 01/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("monta um projeto red com spec stub e decisão pendente", () => {
    const dir = makeReversaFixture({ profile: "red" });
    try {
      const stub = readFileSync(join(dir, "_reversa_sdd", "feat-a", "spec.md"), "utf-8");
      assert.ok(stub.split("\n").length < 10, "spec stub deve ser curta");
      assert.ok(existsSync(join(dir, "_reversa_sdd", "_decisions", "pending-decisions.md")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/reversa-import/fixtures.test.mjs`
Expected: FAIL — `make-fixture.mjs` não encontrado

- [ ] **Step 3: Implementar o mínimo**

```javascript
// tests/reversa-import/fixtures/make-fixture.mjs
// Monta projetos Reversa sintéticos em tmpdir. NÃO toca o fixture versionado real.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PLAN = `# Reconstruction Plan — fixture

## Tarefas

### Tarefa 01 — infra
Fundações.

### Tarefa 02 — feat-a
**Depende:** Tarefa 01

## Marcos demonstráveis

| Marco | Após | Demo |
|---|---|---|
| M1 | T01 | infra de pé |
| M2 | T02 | feat-a usável |
`;

const SPEC_FULL = `# Spec — feat-a

## Visão
🟢 Feature capturada ao vivo.

## Requisitos
- RN-01: regra de negócio clara.

## Pronto quando
- AC-01: comportamento X observável.

## Detalhes
${"linha de detalhe.\n".repeat(30)}`;

const SPEC_STUB = `# Spec — feat-a

🔴 lacuna: spec não preenchida.
`;

export function makeReversaFixture({ profile = "green" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `rev-fix-${profile}-`));
  mkdirSync(join(dir, ".reversa"), { recursive: true });
  mkdirSync(join(dir, "_reversa_sdd", "feat-a"), { recursive: true });
  mkdirSync(join(dir, "_reversa_sdd", "_decisions"), { recursive: true });
  mkdirSync(join(dir, "_reversa_sdd", "_review"), { recursive: true });
  mkdirSync(join(dir, "_reversa_forward", "001-feat-a"), { recursive: true });

  writeFileSync(
    join(dir, ".reversa", "state.json"),
    JSON.stringify({ version: "1.2.43", project: `fixture-${profile}`, doc_language: "Português", phase: "concluido-especificacao", target: "Demo", completed: [], pending: ["revisao"] }, null, 2),
  );
  writeFileSync(join(dir, ".reversa", "soul.md"), "# Soul\nProjeto sintético.\n");
  writeFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), PLAN);
  writeFileSync(join(dir, "_reversa_forward", "001-feat-a", "requirements.md"), "# Requirements feat-a\n- RN-01\n- US-01 (AC-01)\n");

  if (profile === "red") {
    writeFileSync(join(dir, "_reversa_sdd", "feat-a", "spec.md"), SPEC_STUB);
    writeFileSync(join(dir, "_reversa_sdd", "_decisions", "pending-decisions.md"), "# Pendências\n- D-09: definir provider de billing\n");
    writeFileSync(join(dir, "_reversa_sdd", "_review", "final-closure-audit.md"), "# Audit\n- CRITICAL: schema de billing ausente.\n");
  } else if (profile === "yellow") {
    writeFileSync(join(dir, "_reversa_sdd", "feat-a", "spec.md"), SPEC_FULL);
    mkdirSync(join(dir, "_reversa_sdd", "feat-orfa"), { recursive: true });
    writeFileSync(join(dir, "_reversa_sdd", "feat-orfa", "spec.md"), SPEC_STUB); // sdd sem forward
  } else {
    writeFileSync(join(dir, "_reversa_sdd", "feat-a", "spec.md"), SPEC_FULL);
  }
  return dir;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/reversa-import/fixtures.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add tests/reversa-import/fixtures/make-fixture.mjs tests/reversa-import/fixtures.test.mjs
git commit -m "test(import-reversa): helper de fixtures sintéticas green/yellow/red

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Pre-flight Readiness Gate (triangulação)

**Files:**
- Create: `scripts/reversa-import/readiness.mjs`
- Test: `tests/reversa-import/readiness.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/readiness.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { assessReadiness } from "../../scripts/reversa-import/readiness.mjs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";

describe("assessReadiness", () => {
  it("projeto green → veredito global green", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try {
      const a = assessReadiness(dir);
      assert.equal(a.global, "green");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("projeto red (CRITICAL aberto + decisão pendente + spec stub) → red", () => {
    const dir = makeReversaFixture({ profile: "red" });
    try {
      const a = assessReadiness(dir);
      assert.equal(a.global, "red");
      assert.ok(a.signals.criticalFindings >= 1, "deve achar CRITICAL no review");
      assert.ok(a.signals.pendingDecisions >= 1, "deve achar decisão pendente");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignora state.json stale: completed:[] não força red sozinho", () => {
    // green tem completed:[] mas tudo pronto → triangulação não rebaixa para red
    const dir = makeReversaFixture({ profile: "green" });
    try {
      const a = assessReadiness(dir);
      assert.notEqual(a.global, "red");
      assert.ok("declaredPhase" in a.signals);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("produz veredito por feature", () => {
    const dir = makeReversaFixture({ profile: "red" });
    try {
      const a = assessReadiness(dir);
      assert.equal(a.perFeature["feat-a"], "red"); // spec stub
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test tests/reversa-import/readiness.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar o mínimo**

```javascript
// scripts/reversa-import/readiness.mjs
// Pre-flight Readiness Gate (lado Reversa). Triangula múltiplos sinais — NUNCA
// confia só no state.json (que pode estar stale). Roda ANTES do parse.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanMarkers } from "./markers.mjs";

const STUB_LINE_THRESHOLD = 10; // spec.md com < 10 linhas úteis = stub

function readSafe(p) {
  try { return readFileSync(p, "utf-8"); } catch { return ""; }
}

function listDirs(p) {
  try { return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name); }
  catch { return []; }
}

export function assessReadiness(sourceDir) {
  const sddDir = join(sourceDir, "_reversa_sdd");
  const reviewDir = join(sddDir, "_review");
  const decisionsDir = join(sddDir, "_decisions");

  // Sinal 1: fase declarada (1 voto, não gospel)
  let declaredPhase = null;
  try { declaredPhase = JSON.parse(readSafe(join(sourceDir, ".reversa", "state.json"))).phase ?? null; } catch { /* tolerante */ }

  // Sinal 2: auditorias com CRITICAL/HIGH aberto
  let criticalFindings = 0;
  if (existsSync(reviewDir)) {
    for (const f of readdirSync(reviewDir)) {
      const body = readSafe(join(reviewDir, f));
      criticalFindings += (body.match(/CRITICAL|HIGH/g) || []).length;
    }
  }

  // Sinal 3: decisões pendentes
  const pending = readSafe(join(decisionsDir, "pending-decisions.md"));
  const pendingDecisions = (pending.match(/^- /gm) || []).length;

  // Sinais 4-6 por feature: spec stub, densidade de 🔴
  const perFeature = {};
  const features = listDirs(sddDir);
  let stubCount = 0;
  let gapTotal = 0;
  for (const feat of features) {
    const spec = readSafe(join(sddDir, feat, "spec.md"));
    const usefulLines = spec.split("\n").filter((l) => l.trim()).length;
    const markers = scanMarkers(spec);
    const isStub = spec === "" || usefulLines < STUB_LINE_THRESHOLD;
    gapTotal += markers.gap;
    if (isStub) {
      stubCount += 1;
      perFeature[feat] = "red";
    } else if (markers.gap > 0 || markers.inferred > markers.captured) {
      perFeature[feat] = "yellow";
    } else {
      perFeature[feat] = "green";
    }
  }

  // Veredito global por triangulação (não pelo state.json isolado)
  let global = "green";
  const anyRed = Object.values(perFeature).includes("red");
  const anyYellow = Object.values(perFeature).includes("yellow");
  if (criticalFindings > 0 || pendingDecisions > 0 || anyRed) global = "red";
  else if (anyYellow || gapTotal > 0) global = "yellow";

  return {
    global,
    perFeature,
    signals: { declaredPhase, criticalFindings, pendingDecisions, stubCount, gapTotal, featureCount: features.length },
  };
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test tests/reversa-import/readiness.test.mjs`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/readiness.mjs tests/reversa-import/readiness.test.mjs
git commit -m "feat(import-reversa): readiness gate por triangulação (state.json não é gospel)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Fase 3 — Parsers (input Reversa → IR)

> **Milestone após esta fase:** `parse` produz um IR completo a partir de um projeto Reversa. Combinado com a Fase 2, já há um deliverable real: "ler um projeto Reversa e produzir IR + readiness".

### Task 6: Parser de state.json

**Files:**
- Create: `scripts/reversa-import/parsers/state.mjs`
- Test: `tests/reversa-import/parsers-state.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/parsers-state.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { parseState } from "../../scripts/reversa-import/parsers/state.mjs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";

describe("parseState", () => {
  it("extrai project/language/target/phase do state.json", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try {
      const p = parseState(dir);
      assert.equal(p.name, "fixture-green");
      assert.equal(p.language, "Português");
      assert.equal(p.declaredPhase, "concluido-especificacao");
      assert.equal(p.target, "Demo");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("state.json ausente → fragmento com nulls (tolerante)", () => {
    const dir = makeReversaFixture({ profile: "green" });
    rmSync(`${dir}/.reversa/state.json`, { force: true });
    try {
      const p = parseState(dir);
      assert.equal(p.name, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/parsers-state.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/parsers/state.mjs
// Parser tolerante de .reversa/state.json → fragmento IR.project.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function parseState(sourceDir) {
  let s = {};
  try { s = JSON.parse(readFileSync(join(sourceDir, ".reversa", "state.json"), "utf-8")); }
  catch { /* ausente/ilegível: degrada graciosamente */ }
  return {
    name: s.project ?? null,
    language: s.doc_language ?? s.chat_language ?? null,
    sourceType: s.project_type ?? null,
    target: s.target ?? null,
    declaredPhase: s.phase ?? null,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/parsers-state.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/parsers/state.mjs tests/reversa-import/parsers-state.test.mjs
git commit -m "feat(import-reversa): parser de state.json → IR.project

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Parser de reconstruction-plan (tarefas + grafo de deps + marcos)

**Files:**
- Create: `scripts/reversa-import/parsers/reconstruction-plan.mjs`
- Test: `tests/reversa-import/parsers-reconstruction-plan.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/parsers-reconstruction-plan.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseReconstructionPlan } from "../../scripts/reversa-import/parsers/reconstruction-plan.mjs";

const PLAN = `# Reconstruction Plan

## Tarefas

### Tarefa 01 — Fundações de infra
Setup básico.

### Tarefa 02 — Schema do banco
Núcleo EAV.

### Tarefa 14 — call intelligence
**Depende:** Tarefas 12 e 13

## Marcos demonstráveis

| Marco | Após | Demo |
|---|---|---|
| M1 "Dados vivos" | T04 | API cria objects |
| M2 "CRM usável" | T08 | tabela + record page |
`;

describe("parseReconstructionPlan", () => {
  it("extrai cada tarefa com id e nome", () => {
    const { tasks } = parseReconstructionPlan(PLAN);
    assert.equal(tasks.length, 3);
    assert.deepEqual(tasks[0], { id: "T01", name: "Fundações de infra", dependsOn: [], milestone: null, confidence: "captured" });
  });

  it("resolve o grafo de dependências de '**Depende:** Tarefas 12 e 13'", () => {
    const { tasks } = parseReconstructionPlan(PLAN);
    const t14 = tasks.find((t) => t.id === "T14");
    assert.deepEqual(t14.dependsOn, ["T12", "T13"]);
  });

  it("tolera formato alternativo '**Depende:** T04 (...)' sem a palavra Tarefas", () => {
    const alt = "### Tarefa 20 — imports\n**Depende:** T04 (engine de validação)\n";
    const { tasks } = parseReconstructionPlan(alt);
    assert.deepEqual(tasks[0].dependsOn, ["T04"]);
  });

  it("extrai os marcos com after referenciando tarefa", () => {
    const { milestones } = parseReconstructionPlan(PLAN);
    assert.equal(milestones.length, 2);
    assert.deepEqual(milestones[0], { id: "M1", after: "T04", demo: "API cria objects" });
  });

  it("plano vazio → coleções vazias (tolerante)", () => {
    const r = parseReconstructionPlan("");
    assert.deepEqual(r.tasks, []);
    assert.deepEqual(r.milestones, []);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/parsers-reconstruction-plan.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/parsers/reconstruction-plan.mjs
// Parser do _reversa_sdd/reconstruction-plan.md → IR.tasks + IR.milestones.
// Tolerante: campos ausentes degradam para [] ou null.

const TASK_RE = /^###\s+Tarefa\s+(\d+)\s+[—-]\s+(.+?)\s*$/;
// Tolerante: casa "**Depende:**" e captura o resto da linha; os ids são extraídos
// depois, aceitando tanto "Tarefas 12 e 13" quanto "T04 (...)".
const DEP_RE = /\*\*Depende:\*\*\s*(.+?)\s*$/i;
const MILE_ROW_RE = /^\|\s*(M\d+)[^|]*\|\s*(T\d+)\s*\|\s*(.+?)\s*\|/;

function pad(n) { return `T${String(n).padStart(2, "0")}`; }

// Extrai ids de dependência de um trecho livre. Prioriza tokens "TNN"; se não
// houver, cai para números soltos (formato "Tarefas 12 e 13").
function extractDepIds(fragment) {
  const explicit = fragment.match(/T\d+/g);
  if (explicit) return explicit.map((t) => pad(t.slice(1)));
  const nums = fragment.match(/\d+/g) || [];
  return nums.map((n) => pad(n));
}

export function parseReconstructionPlan(text = "") {
  const lines = String(text).split("\n");
  const tasks = [];
  const milestones = [];
  let current = null;

  for (const line of lines) {
    const tm = line.match(TASK_RE);
    if (tm) {
      current = { id: pad(tm[1]), name: tm[2].trim(), dependsOn: [], milestone: null, confidence: "captured" };
      tasks.push(current);
      continue;
    }
    const dm = line.match(DEP_RE);
    if (dm && current) {
      current.dependsOn = extractDepIds(dm[1]);
      continue;
    }
    const mm = line.match(MILE_ROW_RE);
    if (mm) {
      milestones.push({ id: mm[1].trim(), after: mm[2].trim(), demo: mm[3].trim() });
    }
  }
  return { tasks, milestones };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/parsers-reconstruction-plan.test.mjs`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/parsers/reconstruction-plan.mjs tests/reversa-import/parsers-reconstruction-plan.test.mjs
git commit -m "feat(import-reversa): parser de reconstruction-plan (tarefas+deps+marcos)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Parser de forward-feature (requirements/roadmap por feature)

**Files:**
- Create: `scripts/reversa-import/parsers/forward-feature.mjs`
- Test: `tests/reversa-import/parsers-forward-feature.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/parsers-forward-feature.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseForwardFeature } from "../../scripts/reversa-import/parsers/forward-feature.mjs";

function makeFeatureDir(reqBody) {
  const dir = mkdtempSync(join(tmpdir(), "rev-feat-"));
  mkdirSync(join(dir, "interfaces"), { recursive: true });
  writeFileSync(join(dir, "requirements.md"), reqBody);
  writeFileSync(join(dir, "interfaces", "api.md"), "# API\n");
  return dir;
}

describe("parseForwardFeature", () => {
  it("extrai slug, requisitos e marca presença de interfaces", () => {
    const dir = makeFeatureDir("# Requirements 001-auth\n- RN-01: senha forte\n- US-01: como user quero login (AC: token emitido)\n");
    try {
      const f = parseForwardFeature(dir);
      assert.equal(f.hasForward, true);
      assert.equal(f.interfaces, true);
      assert.ok(f.requirements.includes("RN-01"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("deriva slug do nome do diretório, removendo prefixo NNN-", () => {
    const dir = mkdtempSync(join(tmpdir(), "rev-001-auth-workspace-"));
    writeFileSync(join(dir, "requirements.md"), "# x\n");
    try {
      const f = parseForwardFeature(dir);
      assert.ok(f.slug.length > 0);
      assert.ok(!/^\d/.test(f.slug), "slug não deve começar com dígito");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/parsers-forward-feature.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/parsers/forward-feature.mjs
// Parser de _reversa_forward/NNN-<slug>/ → fragmento IR.features[i].
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

function readSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }

export function parseForwardFeature(featureDir) {
  const raw = basename(featureDir);
  const slug = raw.replace(/^\d+-/, "").replace(/^rev-/, "") || raw;
  const requirements = readSafe(join(featureDir, "requirements.md"));
  const roadmap = readSafe(join(featureDir, "roadmap.md"));
  const interfaces = existsSync(join(featureDir, "interfaces"))
    && readdirSync(join(featureDir, "interfaces")).length > 0;
  return {
    slug,
    requirements,
    roadmap,
    interfaces,
    hasForward: requirements !== "" || roadmap !== "",
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/parsers-forward-feature.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/parsers/forward-feature.mjs tests/reversa-import/parsers-forward-feature.test.mjs
git commit -m "feat(import-reversa): parser de forward-feature → IR.features

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Parser de sdd-spec (spec/screens/interfaces + detecção de stub)

**Files:**
- Create: `scripts/reversa-import/parsers/sdd-spec.mjs`
- Test: `tests/reversa-import/parsers-sdd-spec.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/parsers-sdd-spec.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSddSpec } from "../../scripts/reversa-import/parsers/sdd-spec.mjs";

function makeSddFeature(specBody) {
  const dir = mkdtempSync(join(tmpdir(), "rev-sdd-"));
  writeFileSync(join(dir, "spec.md"), specBody);
  return dir;
}

describe("parseSddSpec", () => {
  it("conta linhas úteis e marca hasSdd", () => {
    const body = "# Spec\n" + "linha\n".repeat(40);
    const dir = makeSddFeature(body);
    try {
      const s = parseSddSpec(dir);
      assert.equal(s.hasSdd, true);
      assert.ok(s.specLineCount >= 40);
      assert.equal(s.isStub, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detecta stub (spec curta) e captura marcadores de confiança", () => {
    const dir = makeSddFeature("# Spec\n🔴 lacuna: tudo por fazer\n");
    try {
      const s = parseSddSpec(dir);
      assert.equal(s.isStub, true);
      assert.equal(s.markers.gap, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/parsers-sdd-spec.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/parsers/sdd-spec.mjs
// Parser de _reversa_sdd/<feature>/ → spec + screens + interfaces + detecção de stub.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { scanMarkers } from "../markers.mjs";

const STUB_LINE_THRESHOLD = 10;

function readSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }

export function parseSddSpec(featureDir) {
  const spec = readSafe(join(featureDir, "spec.md"));
  const screens = readSafe(join(featureDir, "screens.md"));
  const usefulLines = spec.split("\n").filter((l) => l.trim()).length;
  return {
    specPath: join(featureDir, "spec.md"),
    spec,
    screens,
    specLineCount: usefulLines,
    hasSdd: spec !== "",
    hasScreens: screens !== "",
    hasInterfaces: existsSync(join(featureDir, "interfaces")),
    isStub: spec === "" || usefulLines < STUB_LINE_THRESHOLD,
    markers: scanMarkers(spec),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/parsers-sdd-spec.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/parsers/sdd-spec.mjs tests/reversa-import/parsers-sdd-spec.test.mjs
git commit -m "feat(import-reversa): parser de sdd-spec + detecção de stub

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Parser de decisions (paradigm + D-NN + pending)

**Files:**
- Create: `scripts/reversa-import/parsers/decisions.mjs`
- Test: `tests/reversa-import/parsers-decisions.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/parsers-decisions.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDecisions } from "../../scripts/reversa-import/parsers/decisions.mjs";

function makeDecisionsDir() {
  const dir = mkdtempSync(join(tmpdir(), "rev-dec-"));
  mkdirSync(join(dir, "_decisions"), { recursive: true });
  writeFileSync(join(dir, "_decisions", "paradigm-decision.md"),
    "# Paradigma\n## D-01 — Monólito DDD\nEscolha: monólito modular.\n## D-02 — Postgres + JSONB\nEscolha: Postgres.\n");
  writeFileSync(join(dir, "_decisions", "pending-decisions.md"),
    "# Pendências\n- D-09: definir provider de billing\n");
  return dir;
}

describe("parseDecisions", () => {
  it("extrai decisões resolvidas com id e título", () => {
    const dir = makeDecisionsDir();
    try {
      const ds = parseDecisions(dir);
      const d01 = ds.find((d) => d.id === "D-01");
      assert.equal(d01.title, "Monólito DDD");
      assert.equal(d01.status, "resolved");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marca decisões pendentes com status pending", () => {
    const dir = makeDecisionsDir();
    try {
      const ds = parseDecisions(dir);
      const d09 = ds.find((d) => d.id === "D-09");
      assert.equal(d09.status, "pending");
      assert.equal(d09.confidence, "gap");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/parsers-decisions.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/parsers/decisions.mjs
// Parser de _reversa_sdd/_decisions/ → IR.decisions.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEC_HEADER_RE = /^##\s+(D-\d+)\s*[—-]\s*(.+?)\s*$/;
const PENDING_RE = /^- \s*(D-\d+)\s*:\s*(.+?)\s*$/;

function readSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }

export function parseDecisions(sddDir) {
  const decisions = [];
  const dDir = join(sddDir, "_decisions");
  if (!existsSync(dDir)) return decisions;

  const paradigm = readSafe(join(dDir, "paradigm-decision.md"));
  let current = null;
  for (const line of paradigm.split("\n")) {
    const m = line.match(DEC_HEADER_RE);
    if (m) {
      current = { id: m[1], title: m[2].trim(), status: "resolved", confidence: "official", body: "" };
      decisions.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    }
  }

  const pending = readSafe(join(dDir, "pending-decisions.md"));
  for (const line of pending.split("\n")) {
    const m = line.match(PENDING_RE);
    if (m) decisions.push({ id: m[1], title: m[2].trim(), status: "pending", confidence: "gap", body: "" });
  }
  return decisions;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/parsers-decisions.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/parsers/decisions.mjs tests/reversa-import/parsers-decisions.test.mjs
git commit -m "feat(import-reversa): parser de decisions (resolvidas + pendentes)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Parsers de review e soul (auditorias + metadados narrativos)

**Files:**
- Create: `scripts/reversa-import/parsers/review.mjs`
- Create: `scripts/reversa-import/parsers/soul.mjs`
- Test: `tests/reversa-import/parsers-review-soul.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/parsers-review-soul.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReview } from "../../scripts/reversa-import/parsers/review.mjs";
import { parseSoul } from "../../scripts/reversa-import/parsers/soul.mjs";

describe("parseReview", () => {
  it("agrega findings CRITICAL/HIGH abertos das auditorias", () => {
    const dir = mkdtempSync(join(tmpdir(), "rev-review-"));
    mkdirSync(join(dir, "_review"), { recursive: true });
    writeFileSync(join(dir, "_review", "final-closure-audit.md"), "- CRITICAL: billing ausente\n- HIGH: sem testes de RLS\n- LOW: typo\n");
    try {
      const r = parseReview(join(dir, "_review"));
      assert.equal(r.findings.length, 2);
      assert.ok(r.findings.some((f) => f.severity === "CRITICAL"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("review dir ausente → findings vazio (tolerante)", () => {
    const r = parseReview(join(tmpdir(), "nao-existe-xyz"));
    assert.deepEqual(r.findings, []);
  });
});

describe("parseSoul", () => {
  it("lê soul.md como blob de metadado narrativo, tolerante a ausência", () => {
    const dir = mkdtempSync(join(tmpdir(), "rev-soul-"));
    mkdirSync(join(dir, ".reversa"), { recursive: true });
    writeFileSync(join(dir, ".reversa", "soul.md"), "# Soul\nVisão do produto.\n");
    try {
      const s = parseSoul(dir);
      assert.ok(s.text.includes("Visão"));
      assert.equal(s.present, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/parsers-review-soul.test.mjs`
Expected: FAIL — módulos não encontrados

- [ ] **Step 3: Implementar (dois arquivos)**

```javascript
// scripts/reversa-import/parsers/review.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SEV_RE = /\b(CRITICAL|HIGH)\b\s*:?\s*(.+)$/;

export function parseReview(reviewDir) {
  const findings = [];
  if (!existsSync(reviewDir)) return { findings };
  for (const f of readdirSync(reviewDir)) {
    let body = "";
    try { body = readFileSync(join(reviewDir, f), "utf-8"); } catch { continue; }
    for (const line of body.split("\n")) {
      const m = line.match(SEV_RE);
      if (m) findings.push({ severity: m[1], text: m[2].trim(), source: f });
    }
  }
  return { findings };
}
```

```javascript
// scripts/reversa-import/parsers/soul.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function parseSoul(sourceDir) {
  try {
    const text = readFileSync(join(sourceDir, ".reversa", "soul.md"), "utf-8");
    return { present: true, text };
  } catch {
    return { present: false, text: "" };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/parsers-review-soul.test.mjs`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/parsers/review.mjs scripts/reversa-import/parsers/soul.mjs tests/reversa-import/parsers-review-soul.test.mjs
git commit -m "feat(import-reversa): parsers de review (findings) e soul (narrativo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Fase 4 — Emitters (IR → artefatos DevFlow)

### Task 12: Emitter de PRD faseado

**Files:**
- Create: `scripts/reversa-import/emitters/prd.mjs`
- Test: `tests/reversa-import/emitters-prd.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/emitters-prd.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { emitPrd } from "../../scripts/reversa-import/emitters/prd.mjs";

function fixtureIR() {
  const ir = createIR();
  ir.project.name = "crm-demo";
  ir.tasks = [
    { id: "T01", name: "infra", dependsOn: [], milestone: "M1", confidence: "captured" },
    { id: "T02", name: "schema", dependsOn: ["T01"], milestone: "M1", confidence: "captured" },
    { id: "T08", name: "lists", dependsOn: ["T02"], milestone: "M2", confidence: "inferred" },
  ];
  ir.milestones = [
    { id: "M1", after: "T02", demo: "API cria objects" },
    { id: "M2", after: "T08", demo: "tabela usável" },
  ];
  return ir;
}

describe("emitPrd", () => {
  it("gera um PRD com uma fase por marco", () => {
    const md = emitPrd(fixtureIR());
    assert.match(md, /# .*crm-demo/i);
    assert.match(md, /## .*M1/);
    assert.match(md, /## .*M2/);
  });

  it("lista cada tarefa como item de escopo com suas dependências", () => {
    const md = emitPrd(fixtureIR());
    assert.match(md, /T02.*schema/);
    assert.match(md, /depende.*T01/i);
  });

  it("marca a 1ª fase como em-andamento e as demais como pending (⬚)", () => {
    const md = emitPrd(fixtureIR());
    const m1Idx = md.indexOf("M1");
    const m2Idx = md.indexOf("M2");
    assert.ok(md.slice(m2Idx).includes("⬚"), "fases posteriores marcadas pending");
    assert.ok(m1Idx < m2Idx);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/emitters-prd.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/emitters/prd.mjs
// Emitter: IR → PRD faseado markdown. Fases = marcos; tarefas = itens de escopo
// com dependências preservadas. 1ª fase ⏳, demais ⬚ pending.
const CONF_GLYPH = { official: "🟦", captured: "🟢", inferred: "🟡", gap: "🔴" };

export function emitPrd(ir) {
  const name = ir.project.name || "projeto-importado";
  const out = [];
  out.push(`# PRD — ${name}`);
  out.push("");
  out.push("> Gerado pelo importador Reversa → DevFlow. Fases derivadas dos marcos do reconstruction-plan.");
  out.push("");

  const milestones = ir.milestones.length
    ? ir.milestones
    : [{ id: "M1", after: null, demo: "escopo único" }];

  milestones.forEach((m, i) => {
    const status = i === 0 ? "⏳ Em andamento" : "⬚ Pending";
    out.push(`## ${m.id} — ${m.demo}  ${status}`);
    out.push("");
    const tasks = ir.tasks.filter((t) => t.milestone === m.id);
    if (tasks.length === 0) out.push("_(sem tarefas mapeadas para este marco)_");
    for (const t of tasks) {
      const glyph = CONF_GLYPH[t.confidence] || "";
      const dep = t.dependsOn.length ? ` — depende de ${t.dependsOn.join(", ")}` : "";
      out.push(`- ${glyph} **${t.id}** ${t.name}${dep}`);
    }
    out.push("");
  });
  return out.join("\n");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/emitters-prd.test.mjs`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/emitters/prd.mjs tests/reversa-import/emitters-prd.test.mjs
git commit -m "feat(import-reversa): emitter de PRD faseado (marcos→fases, 1ª ⏳ resto ⬚)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: Emitter de ADRs (decisões → ADRs do projeto importado)

**Files:**
- Create: `scripts/reversa-import/emitters/adrs.mjs`
- Test: `tests/reversa-import/emitters-adrs.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/emitters-adrs.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { emitAdrs } from "../../scripts/reversa-import/emitters/adrs.mjs";

function ir() {
  const x = createIR();
  x.decisions = [
    { id: "D-01", title: "Monólito DDD", status: "resolved", confidence: "official", body: "Escolha: monólito modular." },
    { id: "D-09", title: "Provider de billing", status: "pending", confidence: "gap", body: "" },
  ];
  return x;
}

describe("emitAdrs", () => {
  it("gera um ADR por decisão resolvida, com frontmatter e numeração NNN", () => {
    const adrs = emitAdrs(ir());
    assert.equal(adrs.length, 1); // só resolvidas viram ADR
    assert.match(adrs[0].filename, /^001-.*-v1\.0\.0\.md$/);
    assert.match(adrs[0].body, /^---\n/);
    assert.match(adrs[0].body, /Mon[oó]lito DDD/);
  });

  it("decisões pendentes NÃO viram ADR (vão para gaps/reconciliação)", () => {
    const adrs = emitAdrs(ir());
    assert.ok(!adrs.some((a) => a.body.includes("billing")));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/emitters-adrs.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/emitters/adrs.mjs
// Emitter: decisões resolvidas → ADRs do PROJETO IMPORTADO (.context/engineering/adrs/).
// Pendentes não viram ADR (entram como gaps na reconciliação).
function slugify(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

export function emitAdrs(ir) {
  const resolved = ir.decisions.filter((d) => d.status === "resolved");
  return resolved.map((d, i) => {
    const num = String(i + 1).padStart(3, "0");
    const slug = slugify(d.title);
    const filename = `${num}-${slug}-v1.0.0.md`;
    const body = [
      "---",
      `id: adr-${num}`,
      `title: ${d.title}`,
      "status: accepted",
      "version: 1.0.0",
      `provenance: reversa:${d.id}`,
      "---",
      "",
      `# ${num}. ${d.title}`,
      "",
      "## Contexto",
      "Decisão importada do projeto Reversa (engenharia reversa do produto-alvo).",
      "",
      "## Decisão",
      d.body.trim() || "_(corpo não capturado na origem)_",
      "",
      "## Proveniência",
      `Derivada de \`_reversa_sdd/_decisions/\` (${d.id}).`,
      "",
    ].join("\n");
    return { filename, body, provenance: d.id };
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/emitters-adrs.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/emitters/adrs.mjs tests/reversa-import/emitters-adrs.test.mjs
git commit -m "feat(import-reversa): emitter de ADRs (decisões resolvidas, pendentes→gap)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: Emitter de plans (plans.json registry + esqueletos plan.md)

**Files:**
- Create: `scripts/reversa-import/emitters/plans.mjs`
- Test: `tests/reversa-import/emitters-plans.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/emitters-plans.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { emitPlans } from "../../scripts/reversa-import/emitters/plans.mjs";

function ir() {
  const x = createIR();
  x.project.name = "crm-demo";
  x.features = [
    { slug: "auth-workspace-rbac", requirements: "- RN-01: senha forte\n- AC-01: token", specLineCount: 40, hasForward: true, hasSdd: true, markers: { gap: 0 } },
  ];
  return x;
}

describe("emitPlans", () => {
  it("gera plans.json no schema do registry (active/completed/primary)", () => {
    const { plansJson } = emitPlans(ir());
    const obj = JSON.parse(plansJson);
    assert.ok(Array.isArray(obj.active));
    assert.ok("primary" in obj);
    assert.equal(obj.active[0].slug, "auth-workspace-rbac");
  });

  it("gera um esqueleto plan.md por feature com critérios de aceitação", () => {
    const { planSkeletons } = emitPlans(ir());
    assert.equal(planSkeletons.length, 1);
    assert.match(planSkeletons[0].body, /AC-01/);
    assert.match(planSkeletons[0].feature, /auth-workspace-rbac/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/emitters-plans.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/emitters/plans.mjs
// Emitter: features → plans.json registry + esqueletos plan.md (1 por feature).
export function emitPlans(ir) {
  const active = ir.features.map((f) => ({
    slug: f.slug,
    path: `plans/${f.slug}.md`,
    title: f.slug,
    summary: `Plano esqueleto importado do Reversa para ${f.slug}.`,
    status: "active",
    approval_status: "pending",
  }));
  const plansJson = JSON.stringify(
    { active, completed: [], primary: active[0]?.slug ?? null },
    null,
    2,
  );

  const planSkeletons = ir.features.map((f) => {
    const body = [
      `# Plano — ${f.slug}`,
      "",
      "> Esqueleto importado do Reversa (fiel). Critérios de aceitação derivados de requirements.md.",
      "",
      "## Critérios de aceitação (da origem Reversa)",
      "",
      f.requirements.trim() || "_(requirements não capturados)_",
      "",
      "## Decomposição em stories",
      "",
      "_A decomposição atômica é responsabilidade da máquina nativa DevFlow_ (`/devflow auto --from-prd`)_, não do importador._",
      "",
    ].join("\n");
    return { feature: f.slug, body };
  });

  return { plansJson, planSkeletons };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/emitters-plans.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/emitters/plans.mjs tests/reversa-import/emitters-plans.test.mjs
git commit -m "feat(import-reversa): emitter de plans.json + esqueletos plan.md

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 15: Emitter de stories (só a 1ª onda) com inferência de agente

**Files:**
- Create: `scripts/reversa-import/emitters/stories.mjs`
- Test: `tests/reversa-import/emitters-stories.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/emitters-stories.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { emitStories, inferAgent } from "../../scripts/reversa-import/emitters/stories.mjs";

function ir() {
  const x = createIR();
  x.tasks = [
    { id: "T01", name: "endpoint REST de auth OAuth", dependsOn: [], milestone: "M1", confidence: "captured" },
    { id: "T02", name: "schema RLS e migração Postgres", dependsOn: ["T01"], milestone: "M1", confidence: "captured" },
    { id: "T08", name: "kanban React de pipelines", dependsOn: ["T02"], milestone: "M2", confidence: "inferred" },
  ];
  x.milestones = [{ id: "M1", after: "T02", demo: "x" }, { id: "M2", after: "T08", demo: "y" }];
  return x;
}

describe("inferAgent", () => {
  it("infere backend-specialist para endpoint REST/OAuth", () => {
    assert.equal(inferAgent("endpoint REST de auth OAuth"), "backend-specialist");
  });
  it("infere database-specialist para RLS/schema/migração", () => {
    assert.equal(inferAgent("schema RLS e migração Postgres"), "database-specialist");
  });
  it("infere frontend-specialist para kanban/React", () => {
    assert.equal(inferAgent("kanban React de pipelines"), "frontend-specialist");
  });
  it("fallback feature-developer quando ambíguo", () => {
    assert.equal(inferAgent("ajustes diversos"), "feature-developer");
  });
});

describe("emitStories", () => {
  it("só emite stories da 1ª onda (M1), não das posteriores", () => {
    const yaml = emitStories(ir());
    assert.match(yaml, /T01/);
    assert.match(yaml, /T02/);
    assert.ok(!yaml.includes("T08"), "tarefas de M2 não viram story no import");
  });

  it("preserva blocked_by do grafo de dependências", () => {
    const yaml = emitStories(ir());
    assert.match(yaml, /blocked_by:\s*\[?\s*["']?T01/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/emitters-stories.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/emitters/stories.mjs
// Emitter: SÓ a 1ª onda vira stories.yaml (rascunho-a-revisar). Demais ondas
// ficam no PRD como ⬚ pending (decompostas depois via --from-prd).
const RULES = [
  [/\b(rest|oauth|endpoint|api|service|backend|server)\b/i, "backend-specialist"],
  [/\b(rls|schema|migra|postgres|sql|index|banco|database)\b/i, "database-specialist"],
  [/\b(kanban|react|component|ui|tela|token|design|frontend)\b/i, "frontend-specialist"],
  [/\b(ci|deploy|pipeline|infra|docker|k8s|devops)\b/i, "devops-specialist"],
];

export function inferAgent(taskName = "") {
  for (const [re, agent] of RULES) if (re.test(taskName)) return agent;
  return "feature-developer";
}

function yamlEscape(s) { return String(s).replace(/"/g, '\\"'); }

export function emitStories(ir) {
  const firstMilestone = ir.milestones[0]?.id ?? null;
  const wave = ir.tasks.filter((t) => firstMilestone == null || t.milestone === firstMilestone);

  const lines = ["# stories.yaml — rascunho a revisar (1ª onda importada do Reversa)", "stories:"];
  for (const t of wave) {
    lines.push(`  - id: "${t.id}"`);
    lines.push(`    title: "${yamlEscape(t.name)}"`);
    lines.push(`    agent: ${inferAgent(t.name)}`);
    const blocked = t.dependsOn.filter((d) => wave.some((w) => w.id === d));
    lines.push(`    blocked_by: [${blocked.map((b) => `"${b}"`).join(", ")}]`);
    lines.push(`    status: pending`);
    lines.push(`    confidence: ${t.confidence}`);
  }
  return lines.join("\n") + "\n";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/emitters-stories.test.mjs`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/emitters/stories.mjs tests/reversa-import/emitters-stories.test.mjs
git commit -m "feat(import-reversa): emitter de stories (1ª onda) + inferência de agente

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 16: Emitter de preserve (cópia fiel de refs) + manifest (proveniência)

**Files:**
- Create: `scripts/reversa-import/emitters/preserve.mjs`
- Create: `scripts/reversa-import/emitters/manifest.mjs`
- Test: `tests/reversa-import/emitters-preserve-manifest.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/emitters-preserve-manifest.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { planPreserve } from "../../scripts/reversa-import/emitters/preserve.mjs";
import { emitManifest } from "../../scripts/reversa-import/emitters/manifest.mjs";

describe("planPreserve", () => {
  it("mapeia refs Reversa para .context/imported/reversa/ sem copiar (plano)", () => {
    const ir = createIR();
    ir.features = [{ slug: "auth", specPath: "/src/_reversa_sdd/auth/spec.md", hasSdd: true, hasScreens: false }];
    const plan = planPreserve(ir, "/src");
    assert.ok(plan.some((p) => p.to.includes(".context/imported/reversa/auth")));
    assert.ok(plan.every((p) => p.from && p.to));
  });
});

describe("emitManifest", () => {
  it("gera manifesto com hash da fonte por artefato emitido", () => {
    const dir = mkdtempSync(join(tmpdir(), "rev-man-"));
    writeFileSync(join(dir, "spec.md"), "conteúdo da fonte");
    try {
      const ir = createIR();
      const emitted = [{ devflowArtifact: ".context/plans/auth.md", reversaSource: join(dir, "spec.md") }];
      const json = emitManifest(ir, emitted);
      const obj = JSON.parse(json);
      assert.equal(obj.artifacts.length, 1);
      assert.match(obj.artifacts[0].hash, /^[a-f0-9]{64}$/); // sha256 hex
      assert.ok("reconcileDecisions" in obj);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fonte inexistente → hash null, não quebra", () => {
    const ir = createIR();
    const json = emitManifest(ir, [{ devflowArtifact: "x.md", reversaSource: "/nao/existe.md" }]);
    assert.equal(JSON.parse(json).artifacts[0].hash, null);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/emitters-preserve-manifest.test.mjs`
Expected: FAIL — módulos não encontrados

- [ ] **Step 3: Implementar (dois arquivos)**

```javascript
// scripts/reversa-import/emitters/preserve.mjs
// Emitter: planeja a cópia FIEL das refs ricas Reversa para o namespace
// regenerável .context/imported/reversa/. Retorna plano {from,to}; a cópia
// efetiva (não-destrutiva) é executada pelo pipeline/skill.
import { join } from "node:path";

export function planPreserve(ir, sourceDir) {
  const plan = [];
  const base = join(".context", "imported", "reversa");
  for (const f of ir.features) {
    if (f.specPath) plan.push({ from: f.specPath, to: join(base, f.slug, "spec.md"), kind: "spec", feature: f.slug });
    if (f.hasScreens) plan.push({ from: join(sourceDir, "_reversa_sdd", f.slug, "screens.md"), to: join(base, f.slug, "screens.md"), kind: "screens", feature: f.slug });
  }
  return plan;
}
```

```javascript
// scripts/reversa-import/emitters/manifest.mjs
// Emitter: manifesto de proveniência. hash sha256 da fonte Reversa por artefato.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

function hashFile(p) {
  try { return createHash("sha256").update(readFileSync(p)).digest("hex"); }
  catch { return null; }
}

export function emitManifest(ir, emitted = []) {
  const artifacts = emitted.map((e) => ({
    devflowArtifact: e.devflowArtifact,
    reversaSource: e.reversaSource ?? null,
    hash: e.reversaSource ? hashFile(e.reversaSource) : null,
  }));
  return JSON.stringify(
    { schema: 1, generatedFrom: ir.project.name ?? null, artifacts, reconcileDecisions: [] },
    null,
    2,
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/emitters-preserve-manifest.test.mjs`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/emitters/preserve.mjs scripts/reversa-import/emitters/manifest.mjs tests/reversa-import/emitters-preserve-manifest.test.mjs
git commit -m "feat(import-reversa): emitters de preserve (plano de cópia) e manifest (proveniência sha256)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 17: Emitter de fidelity-report

**Files:**
- Create: `scripts/reversa-import/emitters/fidelity-report.mjs`
- Test: `tests/reversa-import/emitters-fidelity-report.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/emitters-fidelity-report.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { emitFidelityReport } from "../../scripts/reversa-import/emitters/fidelity-report.mjs";

function ir() {
  const x = createIR();
  x.project.name = "crm-demo";
  x.features = [
    { slug: "auth", markers: { official: 1, captured: 8, inferred: 1, gap: 0, total: 10 } },
    { slug: "billing", markers: { official: 0, captured: 1, inferred: 2, gap: 3, total: 6 } },
  ];
  x.gaps = [{ feature: "billing", text: "definir provider de pagamento" }];
  return x;
}

describe("emitFidelityReport", () => {
  it("agrega % de confiança por feature e global", () => {
    const md = emitFidelityReport(ir());
    assert.match(md, /auth/);
    assert.match(md, /billing/);
    assert.match(md, /%/);
  });

  it("converte 🔴 lacunas em itens acionáveis 'resolver lacuna'", () => {
    const md = emitFidelityReport(ir());
    assert.match(md, /resolver lacuna/i);
    assert.match(md, /definir provider de pagamento/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/emitters-fidelity-report.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/emitters/fidelity-report.mjs
// Emitter: fidelity-report.md. Confiança como sinal acionável, não decoração.
function pct(n, total) { return total > 0 ? Math.round((n / total) * 100) : 0; }

export function emitFidelityReport(ir) {
  const out = [];
  out.push(`# Relatório de Fidelidade — ${ir.project.name || "projeto"}`);
  out.push("");
  out.push("> 🟦 oficial · 🟢 capturado · 🟡 inferido · 🔴 lacuna");
  out.push("");
  out.push("## Confiança por feature");
  out.push("");
  out.push("| Feature | 🟦 | 🟢 | 🟡 | 🔴 | % confiável |");
  out.push("|---|---|---|---|---|---|");

  let g = { official: 0, captured: 0, inferred: 0, gap: 0, total: 0 };
  for (const f of ir.features) {
    const m = f.markers || { official: 0, captured: 0, inferred: 0, gap: 0, total: 0 };
    const reliable = pct(m.official + m.captured, m.total);
    out.push(`| ${f.slug} | ${m.official} | ${m.captured} | ${m.inferred} | ${m.gap} | ${reliable}% |`);
    for (const k of Object.keys(g)) g[k] += m[k] || 0;
  }
  out.push(`| **global** | ${g.official} | ${g.captured} | ${g.inferred} | ${g.gap} | ${pct(g.official + g.captured, g.total)}% |`);
  out.push("");

  out.push("## 🔴 Lacunas → itens 'resolver lacuna'");
  out.push("");
  if (ir.gaps.length === 0) out.push("_Nenhuma lacuna 🔴 registrada._");
  for (const gap of ir.gaps) {
    out.push(`- [ ] **resolver lacuna** (${gap.feature}): ${gap.text}`);
  }
  out.push("");
  return out.join("\n");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/emitters-fidelity-report.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/emitters/fidelity-report.mjs tests/reversa-import/emitters-fidelity-report.test.mjs
git commit -m "feat(import-reversa): emitter de fidelity-report (lacunas→itens acionáveis)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Fase 5 — Plan Consistency Validation

### Task 18: Validação de consistência do plano (7 checks)

**Files:**
- Create: `scripts/reversa-import/consistency.mjs`
- Test: `tests/reversa-import/consistency.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/consistency.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIR } from "../../scripts/reversa-import/ir.mjs";
import { validateConsistency } from "../../scripts/reversa-import/consistency.mjs";

function check(r, id) { return r.checks.find((c) => c.id === id); }

describe("validateConsistency", () => {
  it("detecta blocked_by apontando para story inexistente", () => {
    const ir = createIR();
    ir.tasks = [{ id: "T01", name: "a", dependsOn: ["T99"], milestone: "M1", confidence: "captured" }];
    const r = validateConsistency(ir);
    assert.equal(check(r, "dep-graph").status, "fail");
    assert.ok(check(r, "dep-graph").issues.some((i) => i.includes("T99")));
  });

  it("detecta ciclo no grafo de dependências", () => {
    const ir = createIR();
    ir.tasks = [
      { id: "T01", name: "a", dependsOn: ["T02"], milestone: "M1", confidence: "captured" },
      { id: "T02", name: "b", dependsOn: ["T01"], milestone: "M1", confidence: "captured" },
    ];
    const r = validateConsistency(ir);
    assert.ok(check(r, "dep-graph").issues.some((i) => /ciclo/i.test(i)));
  });

  it("detecta dependência cross-onda (onda 1 depende de onda posterior)", () => {
    const ir = createIR();
    ir.milestones = [{ id: "M1", after: "T01", demo: "" }, { id: "M2", after: "T02", demo: "" }];
    ir.tasks = [
      { id: "T01", name: "a", dependsOn: ["T02"], milestone: "M1", confidence: "captured" },
      { id: "T02", name: "b", dependsOn: [], milestone: "M2", confidence: "captured" },
    ];
    const r = validateConsistency(ir);
    assert.equal(check(r, "wave-order").status, "fail");
  });

  it("detecta plano que referencia D-NN sem ADR correspondente", () => {
    const ir = createIR();
    ir.tasks = [{ id: "T01", name: "implementa conforme D-09", dependsOn: [], milestone: "M1", confidence: "captured" }];
    ir.decisions = []; // nenhuma ADR para D-09
    const r = validateConsistency(ir);
    assert.equal(check(r, "adr-plan").status, "fail");
  });

  it("plano coerente → todos os checks passam", () => {
    const ir = createIR();
    ir.milestones = [{ id: "M1", after: "T02", demo: "" }];
    ir.tasks = [
      { id: "T01", name: "a", dependsOn: [], milestone: "M1", confidence: "captured" },
      { id: "T02", name: "b", dependsOn: ["T01"], milestone: "M1", confidence: "captured" },
    ];
    const r = validateConsistency(ir);
    assert.ok(r.checks.every((c) => c.status === "pass"));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/consistency.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/consistency.mjs
// Plan Consistency Validation (lado DevFlow). Roda depois do map, antes do emit.
// Cada check retorna {id, status:'pass'|'fail', issues:[]}. As issues alimentam
// o loop de reconciliação interativa na skill.

function detectCycle(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map(); // 0=unvisited,1=visiting,2=done
  let cyclic = false;
  function dfs(id) {
    const t = byId.get(id);
    if (!t) return;
    state.set(id, 1);
    for (const dep of t.dependsOn) {
      const s = state.get(dep) || 0;
      if (s === 1) { cyclic = true; return; }
      if (s === 0) dfs(dep);
    }
    state.set(id, 2);
  }
  for (const t of tasks) if ((state.get(t.id) || 0) === 0) dfs(t.id);
  return cyclic;
}

function waveIndex(milestones, milestoneId) {
  const idx = milestones.findIndex((m) => m.id === milestoneId);
  return idx === -1 ? Infinity : idx;
}

export function validateConsistency(ir) {
  const ids = new Set(ir.tasks.map((t) => t.id));
  const checks = [];

  // dep-graph: deps inexistentes + ciclo
  const depIssues = [];
  for (const t of ir.tasks) {
    for (const d of t.dependsOn) if (!ids.has(d)) depIssues.push(`${t.id}: blocked_by aponta para story inexistente ${d}`);
  }
  if (detectCycle(ir.tasks)) depIssues.push("ciclo detectado no grafo de dependências");
  checks.push({ id: "dep-graph", status: depIssues.length ? "fail" : "pass", issues: depIssues });

  // wave-order: story de onda anterior depende de onda posterior
  const waveIssues = [];
  for (const t of ir.tasks) {
    const tw = waveIndex(ir.milestones, t.milestone);
    for (const d of t.dependsOn) {
      const dep = ir.tasks.find((x) => x.id === d);
      if (dep && waveIndex(ir.milestones, dep.milestone) > tw) {
        waveIssues.push(`${t.id} (${t.milestone}) depende de ${d} (${dep.milestone}) — viola bottom-up`);
      }
    }
  }
  checks.push({ id: "wave-order", status: waveIssues.length ? "fail" : "pass", issues: waveIssues });

  // adr-plan: plano referencia D-NN sem ADR (decisão resolvida) correspondente
  const resolvedIds = new Set(ir.decisions.filter((d) => d.status === "resolved").map((d) => d.id));
  const adrIssues = [];
  for (const t of ir.tasks) {
    const refs = (t.name.match(/D-\d+/g) || []);
    for (const ref of refs) if (!resolvedIds.has(ref)) adrIssues.push(`${t.id} referencia ${ref} sem ADR correspondente`);
  }
  checks.push({ id: "adr-plan", status: adrIssues.length ? "fail" : "pass", issues: adrIssues });

  // coverage: feature sem nenhuma task mapeada
  const covIssues = [];
  for (const f of ir.features) {
    const hit = ir.tasks.some((t) => t.name.toLowerCase().includes(f.slug.toLowerCase()));
    if (!hit) covIssues.push(`feature ${f.slug} não tem tarefa correspondente no plano`);
  }
  checks.push({ id: "coverage", status: covIssues.length ? "fail" : "pass", issues: covIssues });

  return { checks };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/consistency.test.mjs`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/consistency.mjs tests/reversa-import/consistency.test.mjs
git commit -m "feat(import-reversa): plan consistency validation (dep-graph/wave/adr/coverage)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Fase 6 — Orquestração: pipeline

### Task 19: Pipeline puro (detect→readiness→parse→map→validate→emit→report)

**Files:**
- Create: `scripts/reversa-import/pipeline.mjs`
- Test: `tests/reversa-import/pipeline.test.mjs`

Este é o estágio que costura parsers + emitters + validação num resultado. **Não escreve no disco** — retorna o conjunto de artefatos a emitir + assessment + checks. A escrita não-destrutiva é responsabilidade da skill/CLI (próximas tasks). Isso mantém o pipeline puro e testável.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/pipeline.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";

describe("runPipeline", () => {
  it("projeto green produz IR válido, assessment green e artefatos emitidos", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try {
      const r = runPipeline({ sourceDir: dir });
      assert.equal(r.detected.isReversa, true);
      assert.equal(r.readiness.global, "green");
      assert.ok(r.artifacts.prd.includes("# PRD"));
      assert.ok(Array.isArray(r.artifacts.adrs));
      assert.ok(r.artifacts.stories.includes("stories:"));
      assert.ok(r.artifacts.fidelityReport.includes("Fidelidade"));
      assert.ok(r.consistency.checks.length >= 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("source não-Reversa → retorna detected.isReversa=false e não tenta parsear", () => {
    const dir = makeReversaFixture({ profile: "green" });
    rmSync(`${dir}/.reversa`, { recursive: true, force: true });
    try {
      const r = runPipeline({ sourceDir: dir });
      assert.equal(r.detected.isReversa, false);
      assert.equal(r.artifacts, null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("projeto red ainda produz artefatos mas com readiness red (import parcial)", () => {
    const dir = makeReversaFixture({ profile: "red" });
    try {
      const r = runPipeline({ sourceDir: dir });
      assert.equal(r.readiness.global, "red");
      assert.ok(r.artifacts !== null, "red ainda emite (import parcial explícito)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/pipeline.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/pipeline.mjs
// Orquestra os estágios puros. NÃO escreve no disco — retorna o que emitir.
// Escrita não-destrutiva fica a cargo da CLI/skill.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createIR, validateIR } from "./ir.mjs";
import { detectReversa } from "./detect.mjs";
import { assessReadiness } from "./readiness.mjs";
import { parseState } from "./parsers/state.mjs";
import { parseReconstructionPlan } from "./parsers/reconstruction-plan.mjs";
import { parseForwardFeature } from "./parsers/forward-feature.mjs";
import { parseSddSpec } from "./parsers/sdd-spec.mjs";
import { parseDecisions } from "./parsers/decisions.mjs";
import { parseReview } from "./parsers/review.mjs";
import { parseSoul } from "./parsers/soul.mjs";
import { emitPrd } from "./emitters/prd.mjs";
import { emitAdrs } from "./emitters/adrs.mjs";
import { emitPlans } from "./emitters/plans.mjs";
import { emitStories } from "./emitters/stories.mjs";
import { planPreserve } from "./emitters/preserve.mjs";
import { emitManifest } from "./emitters/manifest.mjs";
import { emitFidelityReport } from "./emitters/fidelity-report.mjs";
import { validateConsistency } from "./consistency.mjs";

function readSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }
function listFeatureDirs(p) {
  try { return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name); }
  catch { return []; }
}

// Atribui a tarefa TNN à 1ª onda (em ordem) cujo "after" cobre seu número.
// Marcos vêm como {id, after:"TNN"}. Ex.: M1 after T04 cobre T01..T04; M2 after T08
// cobre T05..T08. Sem marcos → null. Acima do último threshold → último marco.
function assignMilestone(taskId, milestones) {
  if (!milestones.length) return null;
  const n = parseInt(String(taskId).replace(/\D/g, ""), 10);
  if (Number.isNaN(n)) return milestones[0].id;
  const ordered = milestones
    .map((m) => ({ id: m.id, after: parseInt(String(m.after).replace(/\D/g, ""), 10) }))
    .filter((m) => !Number.isNaN(m.after))
    .sort((a, b) => a.after - b.after);
  for (const m of ordered) if (n <= m.after) return m.id;
  return ordered.length ? ordered[ordered.length - 1].id : milestones[0].id;
}

function buildIR(sourceDir) {
  const ir = createIR();
  Object.assign(ir.project, parseState(sourceDir));

  const sddDir = join(sourceDir, "_reversa_sdd");
  const fwdDir = join(sourceDir, "_reversa_forward");

  const { tasks, milestones } = parseReconstructionPlan(readSafe(join(sddDir, "reconstruction-plan.md")));
  ir.tasks = tasks.map((t) => ({ ...t, milestone: assignMilestone(t.id, milestones) }));
  ir.milestones = milestones;

  // features: une forward + sdd por slug
  const sddFeatures = listFeatureDirs(sddDir);
  const fwdFeatures = listFeatureDirs(fwdDir);
  const slugs = new Set([
    ...sddFeatures.map((s) => s.replace(/^\d+-/, "")),
    ...fwdFeatures.map((s) => s.replace(/^\d+-/, "")),
  ]);
  for (const slug of slugs) {
    const sddName = sddFeatures.find((s) => s.replace(/^\d+-/, "") === slug);
    const fwdName = fwdFeatures.find((s) => s.replace(/^\d+-/, "") === slug);
    const sdd = sddName ? parseSddSpec(join(sddDir, sddName)) : { hasSdd: false, specLineCount: 0, isStub: true, markers: { official: 0, captured: 0, inferred: 0, gap: 0, total: 0 }, specPath: null, hasScreens: false };
    const fwd = fwdName ? parseForwardFeature(join(fwdDir, fwdName)) : { requirements: "", hasForward: false, interfaces: false };
    ir.features.push({
      slug, requirements: fwd.requirements, specPath: sdd.specPath, specLineCount: sdd.specLineCount,
      hasForward: fwd.hasForward, hasSdd: sdd.hasSdd, hasScreens: sdd.hasScreens, markers: sdd.markers,
    });
    for (const g of sdd.markers.gaps || []) ir.gaps.push({ feature: slug, text: g });
  }

  ir.decisions = parseDecisions(sddDir);
  // decisões pendentes também são gaps acionáveis
  for (const d of ir.decisions.filter((x) => x.status === "pending")) ir.gaps.push({ feature: "_decisions", text: `${d.id}: ${d.title}` });

  ir._review = parseReview(join(sddDir, "_review"));
  ir._soul = parseSoul(sourceDir);
  return ir;
}

export function runPipeline({ sourceDir }) {
  const detected = detectReversa(sourceDir);
  if (!detected.isReversa) {
    return { detected, readiness: null, ir: null, irValid: null, artifacts: null, consistency: null, preservePlan: null };
  }

  const readiness = assessReadiness(sourceDir);
  const ir = buildIR(sourceDir);
  ir.readiness = { global: readiness.global, perFeature: readiness.perFeature };
  const irValid = validateIR(ir);
  const consistency = validateConsistency(ir);

  const { plansJson, planSkeletons } = emitPlans(ir);
  const artifacts = {
    prd: emitPrd(ir),
    adrs: emitAdrs(ir),
    plansJson,
    planSkeletons,
    stories: emitStories(ir),
    fidelityReport: emitFidelityReport(ir),
  };
  const preservePlan = planPreserve(ir, sourceDir);
  // manifesto preliminar (paths reais preenchidos na escrita pela CLI)
  artifacts.manifest = emitManifest(ir, preservePlan.map((p) => ({ devflowArtifact: p.to, reversaSource: p.from })));

  return { detected, readiness, ir, irValid, artifacts, consistency, preservePlan };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/pipeline.test.mjs`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/pipeline.mjs tests/reversa-import/pipeline.test.mjs
git commit -m "feat(import-reversa): pipeline puro (detect→readiness→parse→map→validate→emit)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 20: CLI de escrita não-destrutiva + re-import (diff por hash)

**Files:**
- Create: `scripts/reversa-import/write.mjs`
- Test: `tests/reversa-import/write.test.mjs`

A escrita é separada do pipeline para manter o pipeline puro. `writeArtifacts` recebe o resultado do pipeline + destDir e escreve de forma não-destrutiva (nunca sobrescreve arquivo editado à mão sem confirmação — modelado via callback `confirmOverwrite`).

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/write.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeArtifacts } from "../../scripts/reversa-import/write.mjs";

function fakeResult() {
  return {
    artifacts: {
      prd: "# PRD\n",
      adrs: [{ filename: "001-x-v1.0.0.md", body: "# ADR\n" }],
      plansJson: '{"active":[],"primary":null}',
      planSkeletons: [{ feature: "auth", body: "# Plano auth\n" }],
      stories: "stories:\n",
      fidelityReport: "# Fidelidade\n",
      manifest: '{"schema":1,"artifacts":[]}',
    },
    preservePlan: [],
  };
}

describe("writeArtifacts", () => {
  it("escreve PRD/plans/stories/ADRs/fidelity nos paths .context corretos", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-dest-"));
    try {
      writeArtifacts(fakeResult(), { destDir: dest });
      assert.ok(existsSync(join(dest, ".context", "plans")));
      assert.ok(existsSync(join(dest, ".context", "imported", "reversa", "fidelity-report.md")));
      assert.ok(existsSync(join(dest, ".context", "engineering", "adrs", "001-x-v1.0.0.md")));
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("re-import: NÃO sobrescreve arquivo editado à mão sem confirmação", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-dest2-"));
    const prdPath = join(dest, ".context", "plans", "crm-prd.md");
    mkdirSync(join(dest, ".context", "plans"), { recursive: true });
    writeFileSync(prdPath, "# EDITADO À MÃO\n");
    let asked = false;
    try {
      writeArtifacts(fakeResult(), {
        destDir: dest,
        prdFilename: "crm-prd.md",
        confirmOverwrite: () => { asked = true; return false; }, // usuário recusa
      });
      assert.equal(asked, true, "deve perguntar antes de sobrescrever");
      assert.equal(readFileSync(prdPath, "utf-8"), "# EDITADO À MÃO\n", "WIP preservado");
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/write.test.mjs`
Expected: FAIL — módulo não encontrado

- [ ] **Step 3: Implementar**

```javascript
// scripts/reversa-import/write.mjs
// Escrita não-destrutiva dos artefatos. Nunca sobrescreve em silêncio: se o
// destino já existe E difere do que seria escrito, chama confirmOverwrite().
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";

function ensureDir(p) { mkdirSync(dirname(p), { recursive: true }); }

function safeWrite(path, content, confirmOverwrite) {
  if (existsSync(path)) {
    const current = readFileSync(path, "utf-8");
    if (current === content) return "unchanged";
    const ok = confirmOverwrite ? confirmOverwrite(path) : true;
    if (!ok) return "skipped";
  }
  ensureDir(path);
  writeFileSync(path, content);
  return "written";
}

export function writeArtifacts(result, { destDir, prdFilename = "imported-prd.md", confirmOverwrite } = {}) {
  const { artifacts, preservePlan } = result;
  const ctx = (...s) => join(destDir, ".context", ...s);
  const log = [];

  log.push(["prd", safeWrite(ctx("plans", prdFilename), artifacts.prd, confirmOverwrite)]);
  log.push(["plans.json", safeWrite(ctx("workflow", "plans.json"), artifacts.plansJson, confirmOverwrite)]);
  log.push(["stories", safeWrite(ctx("workflow", "stories.yaml"), artifacts.stories, confirmOverwrite)]);
  log.push(["fidelity", safeWrite(ctx("imported", "reversa", "fidelity-report.md"), artifacts.fidelityReport, confirmOverwrite)]);
  log.push(["manifest", safeWrite(ctx("imported", "reversa", "manifest.json"), artifacts.manifest, confirmOverwrite)]);

  for (const adr of artifacts.adrs) {
    log.push([adr.filename, safeWrite(ctx("engineering", "adrs", adr.filename), adr.body, confirmOverwrite)]);
  }
  for (const sk of artifacts.planSkeletons) {
    log.push([`plan:${sk.feature}`, safeWrite(ctx("plans", `${sk.feature}.md`), sk.body, confirmOverwrite)]);
  }
  for (const p of preservePlan || []) {
    const to = join(destDir, p.to);
    if (existsSync(p.from)) { ensureDir(to); copyFileSync(p.from, to); log.push([`preserve:${p.feature}`, "copied"]); }
  }
  return { log };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/write.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add scripts/reversa-import/write.mjs tests/reversa-import/write.test.mjs
git commit -m "feat(import-reversa): escrita não-destrutiva + re-import (confirma antes de sobrescrever WIP)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Fase 7 — Integração & E2E (fixture real em cópia tmpdir)

### Task 21: Teste de integração contra `reversa-com-attio` (cópia tmpdir)

**Files:**
- Test: `tests/reversa-import/integration.test.mjs`

> **Pré-condição:** o fixture `/home/walterfrey/Documentos/code/reversa-com-attio` deve existir. O teste o **copia** para tmpdir e roda lá; o original **nunca** é tocado. Se o fixture não existir, o teste é pulado (não falha o suite).

- [ ] **Step 1: Escrever o teste**

```javascript
// tests/reversa-import/integration.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";

const FIXTURE = "/home/walterfrey/Documentos/code/reversa-com-attio";

describe("integração: reversa-com-attio (cópia tmpdir)", { skip: !existsSync(FIXTURE) }, () => {
  it("pipeline completo produz IR válido e artefatos coerentes", () => {
    const work = mkdtempSync(join(tmpdir(), "rev-e2e-"));
    const copy = join(work, "src");
    // copia SEM o _browser_profile pesado e SEM o .mp4
    cpSync(FIXTURE, copy, {
      recursive: true,
      filter: (src) => !src.includes("_browser_profile") && !src.endsWith(".mp4") && !src.includes(".history"),
    });
    try {
      const r = runPipeline({ sourceDir: copy });
      assert.equal(r.detected.isReversa, true);
      assert.equal(r.irValid.ok, true, `IR inválido: ${JSON.stringify(r.irValid.errors)}`);

      // reconstruction-plan tem 21 tarefas → PRD deve listar todas
      assert.ok(r.ir.tasks.length >= 20, `esperava ~21 tarefas, veio ${r.ir.tasks.length}`);
      // grafo de deps preservado: T14 depende de T12 e T13
      const t14 = r.ir.tasks.find((t) => t.id === "T14");
      assert.ok(t14 && t14.dependsOn.includes("T12") && t14.dependsOn.includes("T13"));

      // só a 1ª onda virou stories
      assert.ok(r.artifacts.stories.includes("stories:"));
      // demais ondas pending no PRD
      assert.ok(r.artifacts.prd.includes("⬚"));

      // readiness reflete o fixture real (specs com stub conhecido, ex. notificacoes)
      assert.ok(["green", "yellow", "red"].includes(r.readiness.global));
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver passar**

Run: `node --test tests/reversa-import/integration.test.mjs`
Expected: PASS (1 teste) — ou SKIP se o fixture não existir.

> Se algum assert falhar por desencontro entre a heurística e o fixture real (ex.: contagem de tarefas, atribuição de marco por tarefa), **não relaxe o teste**: ajuste o parser/`buildIR` para refletir a estrutura real e re-rode. Esse é o ponto onde a robustez à variação estrutural (spec §7) é exercida de verdade.

- [ ] **Step 3: Commit**

```bash
git add tests/reversa-import/integration.test.mjs
git commit -m "test(import-reversa): integração end-to-end contra reversa-com-attio (cópia tmpdir)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 22: Teste E2E de escrita + reconhecimento DevFlow

**Files:**
- Test: `tests/reversa-import/e2e-write.test.mjs`

- [ ] **Step 1: Escrever o teste**

```javascript
// tests/reversa-import/e2e-write.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";
import { writeArtifacts } from "../../scripts/reversa-import/write.mjs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";

describe("e2e: import → escrita → estrutura DevFlow reconhecível", () => {
  it("escreve um .context/ que o DevFlow reconheceria (plans.json + PRD + imported/)", () => {
    const src = makeReversaFixture({ profile: "green" });
    const dest = mkdtempSync(join(tmpdir(), "rev-e2e-dest-"));
    try {
      const r = runPipeline({ sourceDir: src });
      writeArtifacts(r, { destDir: dest, prdFilename: "imported-prd.md" });

      assert.ok(existsSync(join(dest, ".context", "plans", "imported-prd.md")));
      assert.ok(existsSync(join(dest, ".context", "workflow", "plans.json")));
      assert.ok(existsSync(join(dest, ".context", "workflow", "stories.yaml")));
      assert.ok(existsSync(join(dest, ".context", "imported", "reversa", "fidelity-report.md")));
      assert.ok(existsSync(join(dest, ".context", "imported", "reversa", "manifest.json")));

      // re-import idempotente: rodar de novo sem edição = nada muda
      const second = writeArtifacts(r, { destDir: dest, prdFilename: "imported-prd.md", confirmOverwrite: () => { throw new Error("não deveria perguntar"); } });
      assert.ok(second.log.every(([, status]) => status === "unchanged" || status === "copied"));
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver passar**

Run: `node --test tests/reversa-import/e2e-write.test.mjs`
Expected: PASS (1 teste)

- [ ] **Step 3: Rodar o suite inteiro**

Run: `node --test tests/reversa-import/`
Expected: PASS (todos os arquivos)

- [ ] **Step 4: Commit**

```bash
git add tests/reversa-import/e2e-write.test.mjs
git commit -m "test(import-reversa): e2e import→escrita + idempotência de re-import

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Fase 8 — Skill & comando (camada interativa)

### Task 23: Skill `devflow:import-reversa` (orquestração interativa)

**Files:**
- Create: `skills/import-reversa/SKILL.md`
- Create: `skills/import-reversa/references/pipeline-contract.md`
- Test: `skills/import-reversa/tests/skill-structure.test.mjs`

A skill é markdown (instruções para o agente), não código executável — mas a estrutura é testável: o SKILL.md deve ter frontmatter válido, descrever as etapas interativas obrigatórias (destino, bootstrap, decisão de readiness, loop de reconciliação) e referenciar a lib. O teste valida presença dessas seções.

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// skills/import-reversa/tests/skill-structure.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL = readFileSync(join(import.meta.dirname, "..", "SKILL.md"), "utf-8");

describe("SKILL.md import-reversa", () => {
  it("tem frontmatter com name e description", () => {
    assert.match(SKILL, /^---\n[\s\S]*?name:\s*.+[\s\S]*?description:\s*.+[\s\S]*?\n---/);
  });
  it("descreve as 4 etapas interativas obrigatórias", () => {
    assert.match(SKILL, /destino/i);
    assert.match(SKILL, /bootstrap/i);
    assert.match(SKILL, /readiness/i);
    assert.match(SKILL, /reconcilia/i);
  });
  it("referencia a lib do pipeline e o contrato", () => {
    assert.match(SKILL, /scripts\/reversa-import\/pipeline\.mjs/);
    assert.match(SKILL, /reaproveita.*project-init|devflow:project-init/i);
  });
  it("enuncia a invariante de não-destrutividade e fixture read-only", () => {
    assert.match(SKILL, /não-destrutiv|nunca.*sobrescrev|WIP/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test skills/import-reversa/tests/skill-structure.test.mjs`
Expected: FAIL — `SKILL.md` não encontrado

- [ ] **Step 3: Implementar (SKILL.md + reference)**

Crie `skills/import-reversa/SKILL.md`:

```markdown
---
name: import-reversa
description: Use quando o usuário pedir para importar um projeto Reversa para o DevFlow — trigger phrases '/devflow import-reversa', 'importar reversa', 'aterrissar projeto reversa', 'converter reversa para devflow'. Lê um projeto gerado pelo Reversa (.reversa/ + _reversa_forward/ + _reversa_sdd/) e o aterrissa como projeto DevFlow executável com fidelidade híbrida (executar + preservar).
---

# Importador Reversa → DevFlow

Aterrissa um projeto Reversa como projeto DevFlow executável. **Importar é iniciar o projeto DevFlow a partir do Reversa** — não só converter arquivos.

> Spec: `docs/superpowers/specs/2026-06-13-importador-reversa-devflow-design.md`
> Lib (pipeline puro): `scripts/reversa-import/pipeline.mjs` + `scripts/reversa-import/write.mjs`
> Contrato lib↔skill: `references/pipeline-contract.md`

## Invariantes (não-negociáveis)

- **Fixture/source é read-only.** Nunca mutar o projeto Reversa de origem quando o destino é separado.
- **Escrita não-destrutiva.** Nunca sobrescrever em silêncio um arquivo que o usuário possa ter editado. Em re-import, mostrar o diff e **confirmar** antes de sobrescrever. Nunca apagar WIP.
- **TDD-friendly:** a lib é pura e testada; a skill só orquestra o interativo + o julgamento de fidelidade (LLM).

## Pipeline

```
detect + readiness → parse → map → validate-plan → reconcile (interativo) → emit → report
```

A lib roda `detect → … → emit-em-memória` via `runPipeline({ sourceDir })`. A skill conduz os pontos interativos e chama `writeArtifacts(result, { destDir, confirmOverwrite })` no final.

## Etapas

### 1. Validação do source
Rode `node -e "import('./scripts/reversa-import/detect.mjs').then(m => console.log(JSON.stringify(m.detectReversa(process.argv[1]))))" <source>`.
Se `isReversa=false`, erre com diagnóstico claro (mostre `reasons`).

### 2. Destino (SEMPRE interativo — sem default escondido)
Pergunte ao usuário, usando AskUserQuestion:
- **in-place** — o próprio dir do Reversa vira o projeto DevFlow (ganha `.context/`; `_reversa_*` permanece como input histórico);
- **dir novo** (sugestão `<source>-devflow/`) — projeto Reversa 100% intocado;
- **path custom**.

### 3. Bootstrap (quando o destino não tem DevFlow ativo)
Conduza o init **reaproveitando `devflow:project-init`** (não reimplemente):
- seleção de **idioma** (bloqueante) → propaga ao dotcontext;
- **scaffold `.context/`** completo no idioma escolhido;
- ofereça **`git init`** se o destino não for repositório git;
- se o destino **já** tem DevFlow ativo → pule o bootstrap e entre em **re-import** (§6 da spec: diff + manifesto).

### 4. Readiness gate (decisão interativa graduada)
Rode `runPipeline` e leia `result.readiness`:
- 🟢 green → importa cheio;
- 🟡 yellow → importa o pronto + marca o resto como "resolver lacuna"/draft;
- 🔴 red → **avise forte e pergunte** se prossegue (import parcial explícito). Mostre os `signals`.

### 5. Julgamento de fidelidade (LLM — sua responsabilidade)
Para cada texto derivado, refine os marcadores de confiança inline (🟦🟢🟡🔴) com base no conteúdo real. O `fidelity-report.md` agrega; as 🔴 viram itens "resolver lacuna".

### 6. Reconciliação interativa (loop)
Leia `result.consistency.checks`. Para cada check com `status:fail`, apresente cada issue com um **ajuste proposto**; o usuário aceita/edita/adia. Registre as decisões no `reconcileDecisions` do manifesto.

### 7. Emit + report
Só depois de reconciliado, chame `writeArtifacts(result, { destDir, confirmOverwrite })`. Apresente o `fidelity-report` e o `readiness-assessment`. Faça o commit (com humano no loop; **nunca** PR/merge/push autônomo).

### 8. Handoff
Informe o estado PREVC do projeto resultante e aponte o próximo passo nativo: **`/devflow auto --from-prd`** para decompor as ondas seguintes (a 1ª já virou stories; as demais estão ⬚ pending no PRD).
```

Crie `skills/import-reversa/references/pipeline-contract.md`:

```markdown
# Contrato lib ↔ skill (import-reversa)

A skill é o único consumidor interativo da lib. Contrato:

## `runPipeline({ sourceDir }) → result`
- `result.detected` — `{ isReversa, artifacts, missing, reasons }`
- `result.readiness` — `{ global, perFeature, signals }` (verdicts: green|yellow|red)
- `result.ir` — IR completo (ver `scripts/reversa-import/ir.mjs`)
- `result.irValid` — `{ ok, errors }`
- `result.consistency` — `{ checks: [{ id, status, issues }] }`
- `result.artifacts` — `{ prd, adrs[], plansJson, planSkeletons[], stories, fidelityReport, manifest }`
- `result.preservePlan` — `[{ from, to, kind, feature }]`

## `writeArtifacts(result, { destDir, prdFilename, confirmOverwrite }) → { log }`
- Escrita **não-destrutiva**. `confirmOverwrite(path) → boolean` é chamado quando um arquivo
  existente difere do conteúdo a escrever. Retorne `false` para preservar WIP.
- `log` é uma lista `[nome, status]` com status `written|unchanged|skipped|copied`.

## O que a skill faz que a lib NÃO faz
- Toda interação com o usuário (destino, bootstrap, decisão de readiness, reconcile).
- O julgamento de fidelidade que exige LLM (refino dos marcadores inline).
- O commit final (com humano no loop).
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test skills/import-reversa/tests/skill-structure.test.mjs`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add skills/import-reversa/
git commit -m "feat(import-reversa): skill de orquestração interativa + contrato lib↔skill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 24: Comando `/devflow import-reversa` + roteamento

**Files:**
- Create: `commands/devflow-import-reversa.md`
- Modify: `commands/devflow.md` (adicionar linha de roteamento na tabela de Argument Routing)
- Test: `tests/reversa-import/command-routing.test.mjs`

- [ ] **Step 1: Escrever o teste que falha**

```javascript
// tests/reversa-import/command-routing.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

describe("comando import-reversa", () => {
  it("commands/devflow-import-reversa.md existe e invoca a skill", () => {
    const p = join(ROOT, "commands", "devflow-import-reversa.md");
    assert.ok(existsSync(p), "comando ausente");
    const body = readFileSync(p, "utf-8");
    assert.match(body, /devflow:import-reversa|import-reversa/);
  });

  it("devflow.md roteia 'import-reversa' para a skill", () => {
    const body = readFileSync(join(ROOT, "commands", "devflow.md"), "utf-8");
    assert.match(body, /import-reversa/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/reversa-import/command-routing.test.mjs`
Expected: FAIL — comando ausente / devflow.md sem rota

- [ ] **Step 3: Implementar**

Crie `commands/devflow-import-reversa.md`:

```markdown
# /devflow import-reversa

Importa um projeto gerado pelo Reversa e o aterrissa como projeto DevFlow executável.

## Usage

```
/devflow import-reversa <source>
```

## Behavior

1. Invoque a skill `devflow:import-reversa`.
2. Passe `<source>` como o diretório do projeto Reversa a importar.
3. A skill conduz: validação → destino (interativo) → bootstrap → readiness → reconcile → emit → handoff.

## Arguments

- `<source>` — caminho do projeto Reversa (deve conter `.reversa/` + `_reversa_forward/`/`_reversa_sdd/`).
```

Em `commands/devflow.md`, na tabela **Argument Routing**, adicione a linha (logo após `migration`):

```markdown
| `import-reversa` | `/devflow import-reversa` section | Yes → `devflow:import-reversa` |
```

E adicione uma seção `### /devflow import-reversa <source>` próxima às outras seções de subcomando:

```markdown
### /devflow import-reversa <source>
1. Invoke `devflow:import-reversa` skill
2. Pass `<source>` (the Reversa project dir) to the skill
3. The skill orchestrates validation, destination choice, bootstrap, readiness, reconcile, emit, and handoff
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/reversa-import/command-routing.test.mjs`
Expected: PASS (2 testes)

- [ ] **Step 5: Rodar o suite inteiro de novo**

Run: `node --test tests/reversa-import/ && node --test skills/import-reversa/tests/`
Expected: PASS (todos)

- [ ] **Step 6: Commit**

```bash
git add commands/devflow-import-reversa.md commands/devflow.md tests/reversa-import/command-routing.test.mjs
git commit -m "feat(import-reversa): comando /devflow import-reversa + roteamento

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Fechamento (fase C do PREVC — humano no loop)

Após a Task 24, o importador está funcional e testado. **Não faça PR/merge/push autônomo.** O fechamento segue a pipeline de autoFinish do DevFlow (README → bump → commit → push → merge → cleanup) **com aprovação humana em cada etapa**, conforme a fase Confirmation do PREVC para escala LARGE.

Antes do fechamento, rode a verificação completa:

```bash
node --test tests/reversa-import/ && node --test skills/import-reversa/tests/
```

Esperado: todos os testes PASS. Só então prossiga para a fase C.

---

## Self-Review (cobertura da spec)

| Requisito da spec | Task(s) |
|---|---|
| §2.1 invocação/bootstrap/destino interativo | Task 23 (skill), Task 24 (comando) |
| §2.2 componentes: skill + lib parsers/IR/emitters | Tasks 1–20, 23 |
| §2.3 pipeline 7 estágios | Task 19 (pipeline), Task 20 (write) |
| §3 mapeamento 2 níveis (PRD macro + stories 1ª onda) | Task 12 (PRD), Task 15 (stories) |
| §3.1 ADRs no projeto importado | Task 13 |
| §3.2 inferência de agente | Task 15 (`inferAgent`) |
| §4 confiança inline + fidelity-report | Task 1 (markers), Task 17 |
| §5.1 Pre-flight Readiness Gate (triangulação) | Task 5 |
| §5.2 Consistency Validation + reconcile | Task 18 (lib), Task 23 (loop interativo) |
| §6 idempotência/re-import não-destrutivo + manifesto | Task 16 (manifest), Task 20 (write) |
| §7 robustez à variação (parser tolerante) | Tasks 3, 6–11 (todos tolerantes), Task 21 (exercita no fixture real) |
| §8 estratégia de testes (unit+integração+E2E, tmpdir) | Tasks 1–22 (TDD por unidade), Tasks 21–22 (integração/E2E) |
| §9 fora de escopo (não parsear mini-site, não round-trip, só 1ª onda) | respeitado: nenhuma task parseia `.reversa/documentation/`; stories só 1ª onda (Task 15) |
```

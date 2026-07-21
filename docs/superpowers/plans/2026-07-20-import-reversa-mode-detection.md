# Detecção de modo do Reversa + abort no reverse (N0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o `import-reversa` reconhecer um projeto Reversa em modo *reverse/brownfield* e abortar com aviso claro, em vez de degenerar silenciosamente numa importação vazia (falha F0).

**Architecture:** Nova função pura `detectMode(sourceDir)` na lib (`scripts/reversa-import/mode.mjs`); `runPipeline` passa a expor `mode`; a `SKILL.md` ganha um gate (Etapa 1b) que aborta antes de qualquer escrita quando `mode === 'reverse'`. A lib continua pura (só reporta); a decisão de UX vive na skill.

**Tech Stack:** Node.js ESM (`node:fs`/`node:path`), testes via `node --test` (padrão do repo). Sem dependências externas.

## Global Constraints

- **TDD obrigatório:** RED → GREEN → REFACTOR. Teste real primeiro; nunca implementar antes do teste falhar.
- **Lib pura:** `scripts/reversa-import/*.mjs` usa só `node:*`, só-leitura, sem efeitos colaterais. Testes via `node --test tests/reversa-import/`.
- **Zero regressão:** os profiles `green`/`yellow`/`red` do `makeReversaFixture` e todos os testes atuais devem continuar idênticos/verdes.
- **Detecção conservadora:** só classifica `reverse` quando **as 3 condições** valem (forward vazio/ausente **e** nenhum `*/spec.md` **e** ≥1 artefato de análise). Qualquer dúvida → `forward`.
- **Versionamento `pipeline`:** entrada em `CHANGELOG.md` sob `[Unreleased]`; **sem** bump local (o pre-commit version-guard só valida).
- **Git:** branch `feature/import-reversa-mode-detection` (já criada). Commits **seletivos** (`git add` explícito por arquivo) — preservar o WIP não-relacionado do working dir. Sem PR/merge/push autônomo.
- **Idioma:** docs e mensagens em pt-BR.

---

### Task 1: `detectMode` (lib pura) + profile `reverse` no fixture

**Files:**
- Create: `scripts/reversa-import/mode.mjs`
- Modify: `tests/reversa-import/fixtures/make-fixture.mjs`
- Test: `tests/reversa-import/mode.test.mjs`

**Interfaces:**
- Consumes: `makeReversaFixture({ profile })` de `tests/reversa-import/fixtures/make-fixture.mjs` (profiles existentes `green`/`yellow`/`red`; novo `reverse`).
- Produces: `detectMode(sourceDir) -> { mode: 'forward' | 'reverse', reasons: string[] }` (consumido pela Task 2 e pela SKILL.md).

- [ ] **Step 1: Adicionar o profile `reverse` ao fixture (infra de teste)**

Reestruturar `make-fixture.mjs` para o `reverse` divergir cedo (forward vazio, sem `spec.md`, com artefatos de análise), sem alterar green/yellow/red. Substituir o corpo da função por:

```js
export function makeReversaFixture({ profile = "green" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `rev-fix-${profile}-`));
  mkdirSync(join(dir, ".reversa"), { recursive: true });
  writeFileSync(
    join(dir, ".reversa", "state.json"),
    JSON.stringify({ version: "1.2.43", project: `fixture-${profile}`, doc_language: "Português", phase: "concluido-especificacao", target: "Demo", completed: [], pending: ["revisao"] }, null, 2),
  );
  writeFileSync(join(dir, ".reversa", "soul.md"), "# Soul\nProjeto sintético.\n");

  if (profile === "reverse") {
    // Layout reverse/brownfield: _reversa_forward/ vazio, sem <feat>/spec.md,
    // com artefatos de análise reversa.
    mkdirSync(join(dir, "_reversa_forward"), { recursive: true }); // vazio de propósito
    mkdirSync(join(dir, "_reversa_sdd", "traceability"), { recursive: true });
    mkdirSync(join(dir, "_reversa_sdd", "mod-a"), { recursive: true });
    writeFileSync(join(dir, "_reversa_sdd", "reconstruction-plan.md"), PLAN);
    writeFileSync(join(dir, "_reversa_sdd", "code-analysis.md"), "# Code Analysis\nintrospecção live-preview.\n");
    writeFileSync(join(dir, "_reversa_sdd", "erd-complete.md"), "# ERD\n...\n");
    writeFileSync(join(dir, "_reversa_sdd", "traceability", "code-spec-matrix.md"), "# Matrix\n");
    writeFileSync(join(dir, "_reversa_sdd", "mod-a", "requirements.md"), "# Requirements mod-a\n- RN-01\n");
    writeFileSync(join(dir, "_reversa_sdd", "mod-a", "tasks.md"), "# Tasks\n- T-01 scaffold\n");
    return dir;
  }

  // --- forward (green / yellow / red) ---
  mkdirSync(join(dir, "_reversa_sdd", "feat-a"), { recursive: true });
  mkdirSync(join(dir, "_reversa_sdd", "_decisions"), { recursive: true });
  mkdirSync(join(dir, "_reversa_sdd", "_review"), { recursive: true });
  mkdirSync(join(dir, "_reversa_forward", "001-feat-a"), { recursive: true });
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

- [ ] **Step 2: Escrever o teste de detecção (RED)**

Criar `tests/reversa-import/mode.test.mjs`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";
import { detectMode } from "../../scripts/reversa-import/mode.mjs";

function cleanup(dir) { rmSync(dir, { recursive: true, force: true }); }

describe("detectMode", () => {
  it("classifica projeto reverse como 'reverse' e explica os motivos", () => {
    const dir = makeReversaFixture({ profile: "reverse" });
    try {
      const r = detectMode(dir);
      assert.equal(r.mode, "reverse");
      assert.ok(r.reasons.some((x) => /análise reversa/i.test(x)), "reasons cita análise reversa");
    } finally { cleanup(dir); }
  });

  it("classifica forward (green) como 'forward'", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try { assert.equal(detectMode(dir).mode, "forward"); } finally { cleanup(dir); }
  });

  it("classifica forward (yellow) como 'forward'", () => {
    const dir = makeReversaFixture({ profile: "yellow" });
    try { assert.equal(detectMode(dir).mode, "forward"); } finally { cleanup(dir); }
  });

  it("forward vazio MAS com um spec.md em módulo → forward (critério 2 falha)", () => {
    const dir = makeReversaFixture({ profile: "reverse" });
    try {
      writeFileSync(join(dir, "_reversa_sdd", "mod-a", "spec.md"), "# spec\nconteúdo real\n");
      assert.equal(detectMode(dir).mode, "forward");
    } finally { cleanup(dir); }
  });

  it("forward vazio, sem spec, sem artefato de análise → forward (critério 3 falha)", () => {
    const dir = makeReversaFixture({ profile: "reverse" });
    try {
      for (const a of ["code-analysis.md", "erd-complete.md"]) rmSync(join(dir, "_reversa_sdd", a), { force: true });
      rmSync(join(dir, "_reversa_sdd", "traceability"), { recursive: true, force: true });
      assert.equal(detectMode(dir).mode, "forward");
    } finally { cleanup(dir); }
  });
});
```

- [ ] **Step 3: Rodar o teste para confirmar que falha**

Run: `node --test tests/reversa-import/mode.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/reversa-import/mode.mjs'`.

- [ ] **Step 4: Implementar `detectMode` (mínimo para passar)**

Criar `scripts/reversa-import/mode.mjs`:

```js
// scripts/reversa-import/mode.mjs
// Detecção de modo do Reversa: forward (greenfield) vs reverse (brownfield).
// Puro, só-leitura. Conservador: só classifica 'reverse' com alta confiança,
// para nunca bloquear um projeto forward legítimo (zero regressão).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REVERSE_ANALYSIS_ARTIFACTS = [
  "code-analysis.md",
  "erd-complete.md",
  "traceability",
  "revalidation-report.md",
  "confidence-report.md",
  "inventory.md",
];

function listDirs(p) {
  try {
    return readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name);
  } catch { return []; }
}

function forwardIsEmpty(sourceDir) {
  const fwd = join(sourceDir, "_reversa_forward");
  if (!existsSync(fwd)) return true;
  return listDirs(fwd).length === 0;
}

function anySddSpec(sourceDir) {
  const sdd = join(sourceDir, "_reversa_sdd");
  for (const d of listDirs(sdd)) {
    if (existsSync(join(sdd, d, "spec.md"))) return true;
  }
  return false;
}

function reverseAnalysisSignals(sourceDir) {
  const sdd = join(sourceDir, "_reversa_sdd");
  return REVERSE_ANALYSIS_ARTIFACTS.filter((a) => existsSync(join(sdd, a)));
}

function targetKind(sourceDir) {
  try {
    const state = JSON.parse(readFileSync(join(sourceDir, ".reversa", "state.json"), "utf-8"));
    const kind = state && state.target && state.target.kind;
    return typeof kind === "string" ? kind : null;
  } catch { return null; }
}

export function detectMode(sourceDir) {
  const reasons = [];
  const fwdEmpty = forwardIsEmpty(sourceDir);
  const hasSpec = anySddSpec(sourceDir);
  const analysis = reverseAnalysisSignals(sourceDir);

  if (fwdEmpty && !hasSpec && analysis.length > 0) {
    reasons.push("_reversa_forward/ ausente ou vazio");
    reasons.push("nenhum _reversa_sdd/*/spec.md");
    reasons.push(`artefatos de análise reversa: ${analysis.join(", ")}`);
    const kind = targetKind(sourceDir);
    if (kind) reasons.push(`state.target.kind=${kind} (reforço informativo)`);
    return { mode: "reverse", reasons };
  }

  if (!fwdEmpty) reasons.push("_reversa_forward/ tem features (forward)");
  else if (hasSpec) reasons.push("há _reversa_sdd/*/spec.md (forward)");
  else reasons.push("sem sinais de análise reversa — tratado como forward");
  return { mode: "forward", reasons };
}
```

- [ ] **Step 5: Rodar o teste para confirmar que passa**

Run: `node --test tests/reversa-import/mode.test.mjs`
Expected: PASS (5 testes).

- [ ] **Step 6: Rodar a suíte inteira (zero regressão do refactor do fixture)**

Run: `node --test tests/reversa-import/`
Expected: PASS — todos verdes (o refactor do `make-fixture` preservou green/yellow/red).

- [ ] **Step 7: Commit**

```bash
git add scripts/reversa-import/mode.mjs tests/reversa-import/mode.test.mjs tests/reversa-import/fixtures/make-fixture.mjs
git commit -m "feat(import-reversa): detectMode — forward vs reverse (N0)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EBTgH4gZCYUcatz2Cfx9og"
```

---

### Task 2: expor `mode` no `runPipeline`

**Files:**
- Modify: `scripts/reversa-import/pipeline.mjs`
- Test: `tests/reversa-import/mode.test.mjs` (adicionar um caso de integração)

**Interfaces:**
- Consumes: `detectMode` (Task 1); `runPipeline({ sourceDir, now })` (existente).
- Produces: `runPipeline(...)` retorna, além do atual, `mode: 'forward'|'reverse'|null` e `modeReasons: string[]`.

- [ ] **Step 1: Adicionar o teste de integração (RED)**

Anexar ao final do `describe` em `tests/reversa-import/mode.test.mjs`:

```js
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";

describe("runPipeline expõe o modo", () => {
  it("inclui mode='reverse' para fonte reverse", () => {
    const dir = makeReversaFixture({ profile: "reverse" });
    try {
      const r = runPipeline({ sourceDir: dir, now: "2026-07-20T00:00:00.000Z" });
      assert.equal(r.mode, "reverse");
      assert.ok(Array.isArray(r.modeReasons) && r.modeReasons.length > 0);
    } finally { cleanup(dir); }
  });

  it("inclui mode='forward' para fonte green", () => {
    const dir = makeReversaFixture({ profile: "green" });
    try {
      assert.equal(runPipeline({ sourceDir: dir, now: "2026-07-20T00:00:00.000Z" }).mode, "forward");
    } finally { cleanup(dir); }
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `node --test tests/reversa-import/mode.test.mjs`
Expected: FAIL — `r.mode` é `undefined`.

- [ ] **Step 3: Modificar `pipeline.mjs`**

Adicionar o import no topo (junto aos outros parsers/detect):

```js
import { detectMode } from "./mode.mjs";
```

No `runPipeline`, trocar o early-return e o return final para incluir `mode`/`modeReasons`:

```js
export function runPipeline({ sourceDir, now = "1970-01-01T00:00:00.000Z" } = {}) {
  const detected = detectReversa(sourceDir);
  if (!detected.isReversa) {
    return { detected, mode: null, modeReasons: [], readiness: null, ir: null, irValid: null, artifacts: null, consistency: null, preservePlan: null };
  }

  const { mode, reasons: modeReasons } = detectMode(sourceDir);

  const readiness = assessReadiness(sourceDir);
  const ir = buildIR(sourceDir);
  ir.readiness = { global: readiness.global, perFeature: readiness.perFeature };
  const irValid = validateIR(ir);
  const consistency = validateConsistency(ir);

  const { plansJson, planSkeletons } = emitPlans(ir, { now });
  const artifacts = {
    prd: emitPrd(ir),
    adrs: emitAdrs(ir, { now: now.slice(0, 10) }),
    plansJson,
    planSkeletons,
    stories: emitStories(ir, { now }),
    fidelityReport: emitFidelityReport(ir),
  };
  const preservePlan = planPreserve(ir);
  artifacts.manifest = emitManifest(ir, preservePlan.map((p) => ({ devflowArtifact: p.to, reversaSource: p.from })));

  return { detected, mode, modeReasons, readiness, ir, irValid, artifacts, consistency, preservePlan, mapDegraded: ir._mapDegraded };
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `node --test tests/reversa-import/mode.test.mjs`
Expected: PASS (7 testes no arquivo).

- [ ] **Step 5: Rodar a suíte inteira**

Run: `node --test tests/reversa-import/`
Expected: PASS — nenhum consumidor existente de `runPipeline` quebrou (só campos adicionados).

- [ ] **Step 6: Commit**

```bash
git add scripts/reversa-import/pipeline.mjs tests/reversa-import/mode.test.mjs
git commit -m "feat(import-reversa): runPipeline expõe o modo detectado (N0)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EBTgH4gZCYUcatz2Cfx9og"
```

---

### Task 3: gate de abort na `SKILL.md` (Etapa 1b) + CHANGELOG

**Files:**
- Modify: `skills/import-reversa/SKILL.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `detectMode` (Task 1), exposto como `scripts/reversa-import/mode.mjs`.
- Produces: comportamento documentado da skill (gate de modo). Sem novo símbolo de código.

> Nota: SKILL.md e CHANGELOG são documentação — não há teste unitário. A verificação é a leitura do conteúdo (feita no Step 3) + o `skill-structure.test.mjs` existente continuar verde (garante que a skill permanece bem-formada).

- [ ] **Step 1: Inserir a Etapa 1b na `SKILL.md`**

Logo após a seção `### 1. Validação do source` e antes de `### 2. Destino ...`, inserir:

```markdown
### 1b. Gate de modo (forward vs reverse)
Rode a detecção de modo:
`node -e "import('./scripts/reversa-import/mode.mjs').then(m => console.log(JSON.stringify(m.detectMode(process.argv[1]))))" <source>`

Se `mode === "reverse"`, **ABORTE antes de qualquer escrita** — o suporte ao modo reverse/brownfield
ainda não existe (backlog N1). Emita ao usuário (adaptando `<reasons>` ao retorno real):

> ⛔ Reversa em modo **reverse** (brownfield) não é suportado hoje. Só o modo forward/greenfield
> importa com fidelidade. Motivos: `<reasons>`.
> Backlog do suporte: `docs/superpowers/2026-07-20-import-reversa-f0-backlog.md` (nível N1).
> Importação abortada — nada foi escrito.

**Não** prossiga para o destino/bootstrap/reconciliação/emit. Se `mode === "forward"`, siga para a Etapa 2 normalmente.

> Por que abortar (e não importar parcial): contra o layout reverse o pipeline degenera
> (PRD vazio, 0 ADRs apesar de `_reversa_sdd/adrs/`, features-fantasma). Entregar isso com
> aparência de sucesso é pior que recusar. Ver `docs/superpowers/2026-07-20-import-reversa-fidelity-findings.md`.
```

- [ ] **Step 2: Adicionar a entrada no `CHANGELOG.md`**

Abrir o `CHANGELOG.md`, localizar (ou criar, logo abaixo do título) a seção `## [Unreleased]` e adicionar sob um subcabeçalho `### Added` (criando-o se não existir):

```markdown
### Added
- `import-reversa`: detecção de modo do Reversa (`detectMode`) — abort com aviso claro quando a fonte
  está em modo *reverse/brownfield* (não suportado; backlog N1), evitando importação degenerada
  silenciosa. Modo *forward* segue sem alteração. (N0 do F0 da validação E2E.)
```

- [ ] **Step 3: Verificação de conteúdo + estrutura da skill**

Ler os dois arquivos e confirmar: a Etapa 1b está entre a 1 e a 2; a mensagem de abort está clara e aponta o backlog; a entrada do CHANGELOG está sob `[Unreleased]`.

Run: `node --test tests/reversa-import/skill-structure.test.mjs 2>/dev/null || node --test tests/`
Expected: PASS — a skill continua bem-formada (o teste de estrutura da skill, se aplicável, passa).

- [ ] **Step 4: Rodar a suíte inteira da feature (regressão final)**

Run: `node --test tests/reversa-import/`
Expected: PASS — todos verdes.

- [ ] **Step 5: Commit**

```bash
git add skills/import-reversa/SKILL.md CHANGELOG.md
git commit -m "feat(import-reversa): gate de abort no modo reverse + CHANGELOG (N0)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EBTgH4gZCYUcatz2Cfx9og"
```

---

## Validação final (fase V)

- [ ] `node --test tests/reversa-import/` — suíte completa verde (inclui os novos `mode.test.mjs`).
- [ ] Fumaça manual (opcional, fora da suíte — paths externos): `detectMode` contra os reais →
  `reversa-com-attio` = `forward`; `reversa-modulo-odoo-17-okr` = `reverse`.
- [ ] Confirmar zero regressão nos consumidores de `runPipeline` (só campos adicionados).
- [ ] Spec compliance: os 6 arquivos do §7 do spec tocados exatamente como descrito.

## Self-Review (preenchido)

- **Cobertura do spec:** §2 regra → Task 1 (detectMode) + testes edge; §3 arquitetura → Tasks 1–3; §4 comportamento → Task 3 (gate); §5 testes → Tasks 1–2; §6 CHANGELOG → Task 3; §7 arquivos → todos cobertos.
- **Placeholders:** nenhum — todo código e comando estão explícitos.
- **Consistência de tipos:** `detectMode(sourceDir) -> { mode, reasons }` usado igual na Task 2 (desestrutura `reasons` como `modeReasons`) e na SKILL.md (`m.detectMode`). `runPipeline` adiciona `mode`/`modeReasons` sem renomear nada existente.

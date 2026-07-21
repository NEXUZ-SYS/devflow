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

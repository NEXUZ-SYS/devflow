// scripts/reversa-import/pipeline.mjs
// Orquestra os estágios puros. NÃO escreve no disco — retorna o que emitir.
//
// Contrato NOVO: o importador carrega EVIDÊNCIA. O plano (PRD, stories, ondas)
// é autorado pela fase P do PREVC, com brainstorming e humano no loop.
// Ver docs/superpowers/specs/2026-07-23-import-reversa-evidence-first-design.md
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createIR, validateIR } from "./ir.mjs";
import { detectReversa } from "./detect.mjs";
import { detectMode } from "./mode.mjs";
import { resolveHandoff } from "./handoff.mjs";
import { classifyArtifacts } from "./classify.mjs";
import { buildLedger } from "./ledger.mjs";
import { validateConsistency } from "./consistency.mjs";
import { parseState } from "./parsers/state.mjs";
import { planPreserve } from "./emitters/preserve.mjs";
import { emitAdrs } from "./emitters/adrs.mjs";
import { emitIndex } from "./emitters/index.mjs";
import { emitManifest } from "./emitters/manifest.mjs";

function reversaVersion(sourceDir) {
  try { return readFileSync(join(sourceDir, ".reversa", "version"), "utf-8").trim(); }
  catch { return null; }
}

const EMPTY_RESULT = Object.freeze({
  ir: null, irValid: null, consistency: null,
  artifacts: { adrs: [], index: "", manifest: "" },
});

export function runPipeline({ sourceDir, now = "1970-01-01T00:00:00.000Z" } = {}) {
  const detected = detectReversa(sourceDir);
  if (!detected.isReversa) return { detected, ...EMPTY_RESULT };

  const { mode, reasons: modeReasons } = detectMode(sourceDir);

  const ir = createIR();
  Object.assign(ir.project, parseState(sourceDir));
  ir.provenance = { mode, modeReasons, reversaVersion: reversaVersion(sourceDir) };

  ir.handoff = resolveHandoff(sourceDir);
  ir.artifacts = classifyArtifacts(sourceDir, { handoff: ir.handoff });
  ir.ledger = buildLedger(ir.artifacts, { handoff: ir.handoff });
  ir.adrSources = ir.artifacts.filter((a) => a.kind === "adr");
  ir.preservePlan = planPreserve(ir.artifacts, {});

  const consistency = validateConsistency(ir);
  ir.conflicts = consistency.conflicts;

  const irValid = validateIR(ir);

  return {
    detected,
    ir,
    irValid,
    consistency,
    artifacts: {
      adrs: emitAdrs(ir, { now: now.slice(0, 10) }),
      index: emitIndex(ir),
      manifest: emitManifest(ir, { now }),
    },
  };
}

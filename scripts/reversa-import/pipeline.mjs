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
import { mapTasksToMilestones } from "./map.mjs";
import { toSlug } from "./slug.mjs";
import { stripInjection } from "./sanitize.mjs";

function readSafe(p) { try { return readFileSync(p, "utf-8"); } catch { return ""; } }
function listFeatureDirs(p) {
  try { return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name); }
  catch { return []; }
}
function clean(s) { return stripInjection(s).text; } // sanitiza conteúdo de terceiro

function buildIR(sourceDir) {
  const ir = createIR();
  Object.assign(ir.project, parseState(sourceDir));

  const sddDir = join(sourceDir, "_reversa_sdd");
  const fwdDir = join(sourceDir, "_reversa_forward");

  const { tasks, milestones } = parseReconstructionPlan(readSafe(join(sddDir, "reconstruction-plan.md")));
  const mapped = mapTasksToMilestones(tasks.map((t) => ({ ...t, name: clean(t.name) })), milestones);
  ir.tasks = mapped.tasks;
  ir.milestones = milestones.map((m) => ({ ...m, demo: clean(m.demo) })); // demo é texto de terceiro embutido no PRD (M1)
  ir._mapDegraded = mapped.degraded; // sinal p/ a skill avisar (achado #4)

  // features: une forward + sdd pelo slug seguro (toSlug — elimina divergência N1)
  const sddFeatures = listFeatureDirs(sddDir);
  const fwdFeatures = listFeatureDirs(fwdDir);
  const slugs = new Set([...sddFeatures.map(toSlug), ...fwdFeatures.map(toSlug)]);
  for (const slug of slugs) {
    const sddName = sddFeatures.find((s) => toSlug(s) === slug);
    const fwdName = fwdFeatures.find((s) => toSlug(s) === slug);
    const sdd = sddName ? parseSddSpec(join(sddDir, sddName)) : { hasSdd: false, specLineCount: 0, isStub: true, markers: { official: 0, captured: 0, inferred: 0, gap: 0, total: 0, gaps: [] }, specPath: null, hasScreens: false };
    const fwd = fwdName ? parseForwardFeature(join(fwdDir, fwdName)) : { requirements: "", hasForward: false, interfaces: false };
    ir.features.push({
      slug, requirements: clean(fwd.requirements), specPath: sdd.specPath, specLineCount: sdd.specLineCount,
      hasForward: fwd.hasForward, hasSdd: sdd.hasSdd, hasScreens: sdd.hasScreens, markers: sdd.markers,
    });
    for (const g of sdd.markers.gaps || []) ir.gaps.push({ feature: slug, text: clean(g) });
  }

  ir.decisions = parseDecisions(sddDir).map((d) => ({ ...d, title: clean(d.title), body: clean(d.body) }));
  // decisões pendentes também são gaps acionáveis
  for (const d of ir.decisions.filter((x) => x.status === "pending")) ir.gaps.push({ feature: "_decisions", text: `${d.id}: ${d.title}` });

  ir._review = parseReview(join(sddDir, "_review"));
  ir._soul = parseSoul(sourceDir); // NÃO embutir em artefato lido por LLM sem clean() antes (M1)
  return ir;
}

export function runPipeline({ sourceDir, now = "1970-01-01T00:00:00.000Z" } = {}) {
  const detected = detectReversa(sourceDir);
  if (!detected.isReversa) {
    return { detected, readiness: null, ir: null, irValid: null, artifacts: null, consistency: null, preservePlan: null };
  }

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
  const preservePlan = planPreserve(ir, sourceDir);
  // manifesto preliminar (paths reais preenchidos na escrita pela CLI)
  artifacts.manifest = emitManifest(ir, preservePlan.map((p) => ({ devflowArtifact: p.to, reversaSource: p.from })));

  return { detected, readiness, ir, irValid, artifacts, consistency, preservePlan, mapDegraded: ir._mapDegraded };
}

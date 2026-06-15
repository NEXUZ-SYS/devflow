// scripts/reversa-import/readiness.mjs
// Pre-flight Readiness Gate (lado Reversa). Triangula múltiplos sinais — NUNCA
// confia só no state.json (que pode estar stale). Roda ANTES do parse.
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  const fwdDir = join(sourceDir, "_reversa_forward");
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

  // Sinal 7 (§5.1): descasamento SDD↔forward — features de um lado sem contraparte.
  const fwdSlugs = new Set(listDirs(fwdDir).map((d) => d.replace(/^\d+-/, "")));
  const sddSlugs = features.map((d) => d.replace(/^\d+-/, ""));
  const sddWithoutForward = sddSlugs.filter((s) => !fwdSlugs.has(s));
  const forwardWithoutSdd = [...fwdSlugs].filter((s) => !sddSlugs.includes(s));

  // Veredito global por triangulação (não pelo state.json isolado)
  let global = "green";
  const anyRed = Object.values(perFeature).includes("red");
  const anyYellow = Object.values(perFeature).includes("yellow");
  if (criticalFindings > 0 || pendingDecisions > 0 || anyRed) global = "red";
  else if (anyYellow || gapTotal > 0 || sddWithoutForward.length || forwardWithoutSdd.length) global = "yellow";

  return {
    global,
    perFeature,
    signals: {
      declaredPhase, criticalFindings, pendingDecisions, stubCount, gapTotal,
      featureCount: features.length, sddWithoutForward, forwardWithoutSdd,
    },
  };
}

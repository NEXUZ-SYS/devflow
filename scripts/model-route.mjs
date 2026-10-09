#!/usr/bin/env node
// scripts/model-route.mjs — CLI do roteamento de modelos (spec §4.1). Usado pelas skills.
// Todo arquivo vindo do projeto é lido sem seguir symlink e sem bloquear (segurança 1).
import { readFileSync, mkdirSync, appendFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { readModels } from "./lib/models-config.mjs";
import { resolveSubagentRoute, effectiveConfig, tierOf, toAlias, toRole, minTier, TIERS } from "./lib/model-routing.mjs";
import { ompCeilingTier } from "./lib/omp-ceiling.mjs";
import { rubricPrompt, parseAnswers, combine } from "./lib/escalation.mjs";
import { buildEntry, ledgerDirFrom } from "./lib/routing-ledger.mjs";
import { aggregate, renderMarkdown, beforeAfter } from "./lib/routing-report.mjs";
import { readWorkflowState } from "./lib/workflow-resume.mjs";
import { readRegularFileSafe, SAFE_READ_MAX_BYTES } from "./lib/safe-read.mjs";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRANSCRIPT_MAX = 64 * 1024 * 1024;

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { o._.push(a); continue; }
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) o[k] = true;
    else { o[k] = next; i++; }
  }
  return o;
}

const safe = (p, max = SAFE_READ_MAX_BYTES) => readRegularFileSafe(p, max) ?? "";
const table = () => JSON.parse(readFileSync(join(PLUGIN_ROOT, "assets/model-routing/routes.json"), "utf8"));
const config = (cwd) => effectiveConfig(readModels(safe(join(cwd, ".context/.devflow.yaml"))), process.env.DEVFLOW_MODEL_ROUTING);
const phaseOf = (cwd) => {
  const p = readWorkflowState(cwd)?.phase;
  return ["P", "R", "E", "V", "C"].includes(p) ? p : null;
};
const ledgerDir = (cwd) => ledgerDirFrom({ xdgDataHome: process.env.XDG_DATA_HOME, home: process.env.HOME || homedir(), cwd });
const str = (v) => (typeof v === "string" ? v : null);
// Diretório ausente, não-diretório ou sem permissão vira lista vazia (o CLI sai com 0).
const listDir = (p) => { try { return readdirSync(p); } catch { return []; } };

function writeLedger(cwd, cfg, entry) {
  if (!cfg.enabled || !cfg.ledger) return;
  try {
    const dir = ledgerDir(cwd);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(join(dir, "cli.jsonl"), JSON.stringify(buildEntry(entry)) + "\n", { mode: 0o600 });
  } catch { /* ledger nunca quebra o fluxo */ }
}

// No omp não há adaptador em execução: a CLI limita (D5). No Claude Code o adaptador limita (teto "top").
function ceilingFor(o, cwd) {
  return o.runtime === "omp" ? ompCeilingTier(PLUGIN_ROOT, cwd, o.agent) : "top";
}

function cmdResolve(o, cwd) {
  const ceiling = ceilingFor(o, cwd);
  if (!ceiling) { process.stdout.write(JSON.stringify({ route: null }) + "\n"); return; }
  const route = resolveSubagentRoute({
    table: table(), config: config(cwd), agentType: o.agent,
    phase: str(o.phase) ?? phaseOf(cwd), skill: str(o.skill), taskTier: str(o["task-tier"]),
    explicitModel: null, ceilingModel: ceiling, ceilingEffort: "max",
  });
  const out = route ? { ...route, model: route.model ?? toAlias(route.tier), ...(o.runtime === "omp" ? { role: toRole(route.tier) } : {}) } : null;
  process.stdout.write(JSON.stringify({ route: out }) + "\n");
}

function cmdEscalate(o, cwd) {
  if (typeof o.report === "string") {
    process.stdout.write(rubricPrompt({ agentType: o.agent, tier: o.tier, report: safe(o.report), midRun: !!o["mid-run"] }) + "\n");
    return;
  }
  const cfg = config(cwd);
  const current = TIERS.includes(o.tier) ? o.tier : null;
  // D18/D5: sem opt-in efetivo (env + models.enabled) nada é decidido nem gravado.
  if (!cfg.enabled) {
    process.stdout.write(JSON.stringify({ action: "keep", tier: current, model: null, role: null, reason: "roteamento desligado" }) + "\n");
    return;
  }
  const ompCeiling = ceilingFor(o, cwd);
  if (!ompCeiling) {
    process.stdout.write(JSON.stringify({ action: "keep", tier: current, model: null, role: null, reason: "teto ilegível" }) + "\n");
    return;
  }
  const d = current
    ? combine(parseAnswers(str(o.answers) ?? ""), {
        current, ceiling: minTier(ompCeiling, tierOf(str(o.ceiling) ?? "top") ?? "top"), maxTier: cfg.maxTier,
        signalRed: !!o["signal-red"], midRun: false, thresholds: cfg.thresholds,
      })
    : { action: "keep", tier: null, reason: "tier atual inválido" };
  const esc = d.action === "escalate";
  const out = { ...d, model: esc ? toAlias(d.tier) : null, role: esc && o.runtime === "omp" ? toRole(d.tier) : null };
  writeLedger(cwd, cfg, {
    ts: new Date().toISOString(), scope: "subagent", agentType: o.agent, tier: d.tier, adapter: o.runtime === "omp" ? "omp" : "cli",
    escalation: { at: "retry", from: current, to: d.tier, action: d.action },
  });
  process.stdout.write(JSON.stringify(out) + "\n");
}

// Caminho do clássico/omp (spec §8): só agentType do meta.json e campos NUMÉRICOS de usage.
function transcriptEntries(projectsDir) {
  const out = [];
  for (const sess of listDir(projectsDir)) {
    const sub = join(projectsDir, sess, "subagents");
    if (!existsSync(sub)) continue;
    for (const meta of listDir(sub).filter((n) => n.endsWith(".meta.json"))) {
      let agentType;
      try { agentType = String(JSON.parse(safe(join(sub, meta))).agentType ?? "?"); } catch { continue; }
      const byModel = new Map();
      const seen = new Set();
      for (const line of safe(join(sub, meta.replace(/\.meta\.json$/, ".jsonl")), TRANSCRIPT_MAX).split("\n")) {
        let m;
        try { m = JSON.parse(line)?.message; } catch { continue; }
        if (!m?.usage || typeof m.model !== "string" || !m.model.startsWith("claude")) continue;
        if (typeof m.id === "string") { if (seen.has(m.id)) continue; seen.add(m.id); }
        if (!byModel.has(m.model)) byModel.set(m.model, { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
        const u = byModel.get(m.model);
        for (const k of Object.keys(u)) if (typeof m.usage[k] === "number") u[k] += m.usage[k];
      }
      for (const [model, usage] of byModel) out.push({ scope: "subagent", agentType, model, usage });
    }
  }
  return out;
}

// Antes × depois (spec §8): uma linha por MENSAGEM com timestamp; só campos numéricos de usage.
function transcriptMessages(projectsDir) {
  const out = [];
  const read = (path, scope) => {
    const seen = new Set();
    for (const line of safe(path, TRANSCRIPT_MAX).split("\n")) {
      let j;
      try { j = JSON.parse(line); } catch { continue; }
      const m = j?.message;
      const ts = typeof j?.timestamp === "string" ? Date.parse(j.timestamp) : NaN;
      if (!m?.usage || typeof m.model !== "string" || !m.model.startsWith("claude") || !Number.isFinite(ts)) continue;
      if (typeof m.id === "string") { if (seen.has(m.id)) continue; seen.add(m.id); }
      const usage = {};
      for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) if (typeof m.usage[k] === "number") usage[k] = m.usage[k];
      out.push({ ts, scope, model: m.model, usage });
    }
  };
  for (const name of listDir(projectsDir)) {
    if (name.endsWith(".jsonl")) read(join(projectsDir, name), "session");
    const sub = join(projectsDir, name, "subagents");
    for (const f of listDir(sub).filter((n) => n.endsWith(".jsonl"))) read(join(sub, f), "subagent");
  }
  return out;
}

function cmdReport(o, cwd) {
  const dir = ledgerDir(cwd);
  const since = typeof o.since === "string" ? Date.parse(o.since) : 0;
  const entries = typeof o.transcripts === "string" ? transcriptEntries(o.transcripts) : [];
  const ledger = [];
  for (const f of listDir(dir).filter((n) => n.endsWith(".jsonl"))) {
    for (const line of safe(join(dir, f), TRANSCRIPT_MAX).split("\n")) {
      try {
        const e = JSON.parse(line);
        if (!since || Date.parse(e.ts) >= since) { entries.push(e); ledger.push(e); }
      } catch { /* linha inválida ignorada */ }
    }
  }
  process.stdout.write(renderMarkdown(aggregate(entries), beforeAfter(ledger, typeof o.transcripts === "string" ? transcriptMessages(o.transcripts) : [])) + "\n");
}

function main(argv) {
  const o = args(argv);
  const cwd = typeof o.cwd === "string" ? o.cwd : process.cwd();
  const cmd = o._[0];
  if (cmd === "resolve" && typeof o.agent === "string") return cmdResolve(o, cwd);
  if (cmd === "escalate" && typeof o.agent === "string") return cmdEscalate(o, cwd);
  if (cmd === "report") return cmdReport(o, cwd);
  console.error("uso: model-route <resolve --agent T [--phase P] [--skill S] [--task-tier T] [--runtime claude|omp] | escalate --agent T --tier T (--report F | --answers J [--signal-red] [--runtime omp]) | report [--since ISO] [--transcripts DIR]> [--cwd D]");
  process.exit(2);
}

main(process.argv.slice(2));

// hooks/router.mjs — adaptador MOD do roteamento de modelos (spec §4.2/§4.3, D18–D21).
// Só traduz eventos do engine para scripts/lib/router-core.mjs. Qualquer falha → next(e) intocado.
// Exigência do validate: toda função que recebe `$` é declarada aqui no topo; o estado é do módulo.
import * as core from "../scripts/lib/router-core.mjs";
import { readModels } from "../scripts/lib/models-config.mjs";
import { effectiveConfig, phaseFromPrevcJson } from "../scripts/lib/model-routing.mjs";
import { rubricPrompt, parseAnswers, combine } from "../scripts/lib/escalation.mjs";
import { buildEntry, ledgerDirFrom } from "../scripts/lib/routing-ledger.mjs";

const MAX_FILE = 256 * 1024;
const MAX_LEDGER_LINES = 2000;
const S = {
  core: core.createRouterState(),
  table: null,
  config: readModels(""),
  loaded: false,
  disabled: false,
  sessionOff: false,
  cwd: null,
  ledgerPath: null,
  lines: [],
  dirty: false,
  sessionKey: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
};

const active = () => !S.disabled && S.config.enabled && !!S.table;

// Leitura de arquivo do repositório com a contenção da ADR-014: sem link, só arquivo regular,
// tamanho limitado, caminho real sob a raiz do projeto. Qualquer dúvida → null.
async function safeRead($, rel) {
  try {
    if (!S.cwd) return null;
    const abs = `${S.cwd}/${rel}`; // $.fs resolve relativo contra o cwd da sessão; absoluto não depende disso
    const st = await $.fs.stat(abs, { resolve: true });
    if (st.isLink || st.kind !== "file" || st.size > MAX_FILE) return null;
    if (!st.realPath || !st.realPath.startsWith(S.cwd + "/")) return null;
    return await $.fs.read(abs);
  } catch {
    return null;
  }
}

async function ensure($) {
  if (S.loaded) return;
  S.loaded = true;
  try {
    // Raiz = cwd da sessão (segue worktree, /cd), não o PWD do ambiente.
    const cwd = await $.session.cwd();
    const st = cwd ? await $.fs.stat(cwd, { resolve: true }) : null;
    S.cwd = st?.kind === "dir" && st.realPath ? st.realPath : null;
  } catch { S.cwd = null; }
  try { S.table = JSON.parse(await $.fs.read(`${$.plugin.root}/assets/model-routing/routes.json`)); } catch { S.table = null; }
  const optIn = await $.env.get("DEVFLOW_MODEL_ROUTING");
  S.config = effectiveConfig(readModels((await safeRead($, ".context/.devflow.yaml")) ?? ""), optIn);
  if (S.config.enabled && S.config.ledger) {
    const home = await $.env.get("HOME");
    const xdg = await $.env.get("XDG_DATA_HOME");
    if (home && S.cwd) S.ledgerPath = `${ledgerDirFrom({ xdgDataHome: xdg, home, cwd: S.cwd })}/${S.sessionKey}.jsonl`;
  }
  await detectOtherRouter($);
}

// D17: outro roteador de sessão habilitado → a camada de sessão do DevFlow se desliga.
async function detectOtherRouter($) {
  try {
    const s = await $.settings.read();
    const names = Object.keys(s?.enabledPlugins ?? {});
    if (names.some((n) => /jev[-_]?router/i.test(n))) {
      S.sessionOff = true;
      $.ui.toast("DevFlow: outro roteador de sessão está habilitado — a camada de sessão do DevFlow fica desligada; subagentes seguem roteados.");
    }
  } catch { /* sem leitura de settings: segue */ }
}

async function readPhase($) {
  return phaseFromPrevcJson((await safeRead($, ".context/runtime/workflows/prevc.json")) ?? "");
}

function ledger(fields) {
  if (!S.ledgerPath || S.lines.length >= MAX_LEDGER_LINES) return;
  S.lines.push(JSON.stringify(buildEntry({ ts: new Date().toISOString(), sessionId: S.sessionKey, adapter: "mod", ...fields })));
  S.dirty = true;
}

async function flushLedger($) {
  if (!S.ledgerPath || !S.dirty) return;
  S.dirty = false;
  try { await $.fs.write(S.ledgerPath, S.lines.join("\n") + "\n"); } catch { S.ledgerPath = null; }
}

async function decideMidRun($, agentId) {
  const a = S.core.agents[agentId];
  let decision = { action: "keep", tier: a.tier };
  try {
    const out = await $.model.complete({ model: "haiku", prompt: rubricPrompt({ agentType: "subagente", tier: a.tier, report: core.midRunReport(S.core, agentId), midRun: true }), effort: "low", timeoutMs: 8000 });
    if (out?.isAnswered) decision = combine(parseAnswers(out.text), { current: a.tier, ceiling: a.ceiling, maxTier: S.config.maxTier, signalRed: true, midRun: true, thresholds: S.config.thresholds });
  } catch { /* decisor falhou: mantém o tier */ }
  const applied = core.applyMidRun(S.core, agentId, decision, S.config.maxTier);
  ledger({ scope: "subagent", agentId, escalation: { at: "midRun", from: a.tier, to: applied ? decision.tier : a.tier, action: applied ? "escalate" : "keep" } });
}

async function onSessionStart($, e, next) {
  const r = await next(e);
  await ensure($);
  try { await $.command.register({ name: "devflow-route", description: "Roteamento de modelos do DevFlow: status | on | off | session off" }); } catch {}
  return r;
}

async function onCommand($, e, next) {
  if (e.command !== "devflow-route") return next(e);
  await ensure($);
  const a = String(e.args ?? "").trim();
  if (a === "off") S.disabled = true;
  else if (a === "on") S.disabled = false;
  else if (a === "session off") S.sessionOff = true;
  const c = S.core;
  return {
    text: [
      `roteamento: ${active() ? "ligado" : "desligado"}${S.sessionOff ? " (sessão off)" : ""}${S.config.enabled ? "" : " — exige models.enabled no repo e DEVFLOW_MODEL_ROUTING=1"}`,
      `fase: ${c.phase ?? "—"} · skill: ${c.skill ?? "—"}`,
      `teto: ${c.userModel ?? "?"} · ${c.userEffort ?? "?"} · IDs conhecidos: ${Object.values(c.ids).join(", ") || "—"}`,
      `sessão no tier: ${c.sessionTier ?? "—"} · subagentes rastreados: ${Object.keys(c.agents).length}`,
    ].join("\n"),
  };
}

async function onTurnStart($, e, next) {
  await ensure($);
  if (active()) core.onTurnStart(S.core, { phase: await readPhase($) });
  return next(e);
}

async function onAgentSpawn($, e, next) {
  await ensure($);
  if (!active()) return next(e);
  const route = core.onSpawn(S.core, e, { table: S.table, config: S.config, phase: S.core.phase, skill: S.core.skill });
  const res = await next(route?.model ? { ...e, model: route.model } : e);
  if (res && "agentId" in res) {
    core.onSpawned(S.core, res.agentId, route, res.model);
    if (route) ledger({ scope: "subagent", agentId: res.agentId, agentType: e.subagentType, phase: S.core.phase, tier: route.tier, model: res.model, effort: route.effort, source: route.source, ceiling: route.ceiling });
  }
  return res;
}

async function onToolCall($, e, next) {
  const res = await next(e);
  try {
    // skill.prompt dispara também dentro de subagentes e não traz agentId: a skill da SESSÃO vem da ferramenta Skill.
    if (e.tool === "Skill" && !e.agentId && !res?.isError) core.onSkill(S.core, { skill: e.skill });
    if (active() && e.agentId && S.core.agents[e.agentId]) {
      const isError = !!res?.isError;
      const summary = isError ? `${e.tool}: ${String(res?.text ?? "").slice(0, 200)}` : "";
      if (core.onSubagentTool(S.core, e.agentId, { isError, summary }, S.config).trigger) await decideMidRun($, e.agentId);
    }
  } catch { /* nunca afeta o resultado da ferramenta */ }
  return res;
}

async function onTurnComplete($, e, next) {
  const res = await next(e);
  try {
    if (active() && res?.usage) {
      const u = res.usage;
      const total = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      ledger({ scope: e.agentId ? "subagent" : "session", agentId: e.agentId, phase: S.core.phase, skill: S.core.skill, model: u.model, usage: u, cacheReadRatio: total ? (u.cache_read_input_tokens ?? 0) / total : undefined });
      if (!e.agentId) await flushLedger($);
    }
  } catch { /* ledger nunca quebra o turno */ }
  return res;
}

/** @type {import('claude-code').Register} */
export const register = (on) => {
  on("session.start", onSessionStart);
  on("command.run", onCommand).catch(($, e, next) => next(e));
  on("turn.start", onTurnStart);
  on("agent.spawn", onAgentSpawn).catch(($, e, next) => next(e));
  on("tool.call", onToolCall).catch(($, e, next) => next(e));
  on("turn.complete", onTurnComplete);
  on("turn.step", async function* ($, e, next) {
    let patch = null;
    try {
      await ensure($);
      if (active()) {
        if (e.agentId) patch = core.onSubagentStep(S.core, e);
        else {
          core.observeSession(S.core, e); // teto observado sempre (D17), mesmo com a sessão desligada
          core.learnId(S.core, e.model); // ID completo do tier do teto sempre conhecido
          if (!S.sessionOff) patch = core.onSessionStep(S.core, e, { table: S.table, config: S.config });
          if (patch?.switched) ledger({ scope: "session", phase: S.core.phase, tier: S.core.sessionTier, switched: true });
          if (patch) $.ui.status(`devflow → ${patch.model ?? e.model} · ${patch.effort ?? e.effort ?? "-"} · fase ${S.core.phase ?? "-"}`);
        }
      }
    } catch { patch = null; }
    const rw = {};
    if (patch?.model) rw.model = patch.model;
    if (patch?.effort) rw.effort = patch.effort;
    return yield* next(Object.keys(rw).length ? { ...e, ...rw } : e);
  });
};

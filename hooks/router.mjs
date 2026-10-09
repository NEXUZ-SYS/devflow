// hooks/router.mjs — adaptador MOD do roteamento de modelos (spec §4.2/§4.3, D18–D21).
// Só traduz eventos do engine para scripts/lib/router-core.mjs. Qualquer falha → next(e) intocado.
// Também hospeda o monitor ao vivo (seção "Monitor ao vivo"): o engine aceita um módulo por plugin.
// Exigência do validate: toda função que recebe `$` é declarada aqui no topo; o estado é do módulo.
import * as core from "../scripts/lib/router-core.mjs";
import { readModels } from "../scripts/lib/models-config.mjs";
import { effectiveConfig, phaseFromPrevcJson } from "../scripts/lib/model-routing.mjs";
import { rubricPrompt, parseAnswers, combine } from "../scripts/lib/escalation.mjs";
import { buildEntry, ledgerDirFrom } from "../scripts/lib/routing-ledger.mjs";
import * as mc from "../scripts/lib/monitor-core.mjs";

const MAX_FILE = 256 * 1024;
const MAX_LEDGER_LINES = 2000;
const ROUTING = { plugin: "devflow", key: "routing" }; // lido pelo monitor ao vivo (seção abaixo)
const MAX_PUB_LOOPS = 100;
const S = {
  core: core.createRouterState(),
  table: null,
  config: readModels(""),
  loaded: false,
  disabled: false,
  sessionOff: false,
  pendingSwitch: false,
  cwd: null,
  ledgerPath: null,
  lines: [],
  dirty: false,
  pub: {},
  pubLast: "",
  sessionKey: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
};

const active = () => !S.disabled && S.config.enabled && !!S.table;

function pubLoop(id, entry) {
  if (JSON.stringify(S.pub[id]) === JSON.stringify(entry)) return;
  delete S.pub[id];
  S.pub[id] = entry;
  const ks = Object.keys(S.pub);
  for (let i = 0; i < ks.length - MAX_PUB_LOOPS; i++) delete S.pub[ks[i]];
}

// Monitor (spec 2026-10-09-router-monitor-toolbar §3.4): só publica; nunca muda o que o router decide.
async function publish($) {
  try {
    const value = { active: active(), failureStreak: S.config.midRun?.failureStreak ?? 3, loops: S.pub };
    const json = JSON.stringify(value);
    if (json === S.pubLast) return;
    await $.state.set(ROUTING, value);
    S.pubLast = json; // só depois do set: falha é tentada de novo na próxima publicação
  } catch {}
}

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
  try {
    const optIn = await $.env.get("DEVFLOW_MODEL_ROUTING");
    S.config = effectiveConfig(readModels((await safeRead($, ".context/.devflow.yaml")) ?? ""), optIn);
    if (S.config.enabled && S.config.ledger) {
      const home = await $.env.get("HOME");
      const xdg = await $.env.get("XDG_DATA_HOME");
      if (home && S.cwd) S.ledgerPath = `${ledgerDirFrom({ xdgDataHome: xdg, home, cwd: S.cwd })}/${S.sessionKey}.jsonl`;
    }
  } catch { S.config = effectiveConfig(readModels(""), undefined); S.ledgerPath = null; } // falha ao ler o ambiente → roteamento desligado
  if (S.config.enabled) await detectOtherRouter($);
  await publish($);
}

// D17: outro roteador de sessão habilitado → a camada de sessão do DevFlow se desliga.
async function detectOtherRouter($) {
  try {
    const s = await $.settings.read();
    // Só entradas habilitadas (=== true): plugin instalado mas desabilitado não conta.
    const names = Object.entries(s?.enabledPlugins ?? {}).filter(([, v]) => v === true).map(([n]) => n);
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
  await publish($);
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
    core.onSpawned(S.core, res.agentId, route, res.model, e.subagentType);
    if (route) ledger({ scope: "subagent", agentId: res.agentId, agentType: e.subagentType, phase: S.core.phase, tier: route.tier, model: res.model, effort: route.effort, source: route.source, ceiling: route.ceiling });
    if (route) {
      const effortRouted = S.core.userEffort != null && route.effort != null && route.effort !== S.core.userEffort;
      pubLoop(res.agentId, { model: res.model ?? null, effort: route.effort ?? null, origin: route.tier !== route.ceiling || effortRouted ? "roteado" : "teto" });
      await publish($);
    }
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
      // A troca de fase marcada no turn.step vai na próxima linha da sessão que tem usage (o relatório só lê essas).
      const switched = !e.agentId && S.pendingSwitch ? true : undefined;
      if (!e.agentId) S.pendingSwitch = false;
      ledger({ scope: e.agentId ? "subagent" : "session", agentId: e.agentId, agentType: e.agentId ? S.core.agentTypes[e.agentId] : undefined, switched, phase: S.core.phase, skill: S.core.skill, model: u.model, usage: u, cacheReadRatio: total ? (u.cache_read_input_tokens ?? 0) / total : undefined });
      if (!e.agentId) await flushLedger($);
    }
  } catch { /* ledger nunca quebra o turno */ }
  return res;
}

async function* routerTurnStep($, e, next) {
    let patch = null;
    try {
      await ensure($);
      if (active()) {
        if (e.agentId) patch = core.onSubagentStep(S.core, e);
        else {
          core.observeSession(S.core, e); // teto observado sempre (D17), mesmo com a sessão desligada
          core.learnId(S.core, e.model); // ID completo do tier do teto sempre conhecido
          if (!S.sessionOff) patch = core.onSessionStep(S.core, e, { table: S.table, config: S.config });
          if (patch?.switched) S.pendingSwitch = true;
          if (patch) $.ui.status(`devflow → ${patch.model ?? e.model} · ${patch.effort ?? e.effort ?? "-"} · fase ${S.core.phase ?? "-"}`);
        }
        if (e.agentId && patch && S.pub[e.agentId]) {
          const cur = S.pub[e.agentId];
          pubLoop(e.agentId, { ...cur, model: patch.model ?? cur.model, effort: patch.effort ?? cur.effort });
        } else if (!e.agentId) {
          pubLoop("main", { model: patch?.model ?? e.model ?? null, effort: patch?.effort ?? e.effort ?? null, origin: patch?.model || patch?.effort ? "roteado" : "teto" });
        }
        await publish($);
      }
    } catch { patch = null; }
    const rw = {};
    if (patch?.model) rw.model = patch.model;
    if (patch?.effort) rw.effort = patch.effort;
    return yield* next(Object.keys(rw).length ? { ...e, ...rw } : e);
}

// ─── Monitor ao vivo (spec 2026-10-09-router-monitor-toolbar, M5/M9) ─────────────────────────────
// Só observa: cada mon* devolve o resultado de next com e intacto; a lógica própria fica em try.
// Mora neste arquivo porque o engine só segue `$` até funções declaradas no arquivo dos on(...).
const ROWS = { plugin: "devflow", key: "monitorRows" };
const RETRIES = { plugin: "devflow", key: "monitorRetries" };
const TICK_MS = 1000;
const M = { st: null, hydrating: null, timer: null, inTick: false };

async function monLoad($) {
  const [rows, retries] = await Promise.all([$.state.get(ROWS), $.state.get(RETRIES)]);
  return { rows: Array.isArray(rows?.value) ? rows.value.map((r) => ({ ...r })) : [], retries: { ...(retries?.value ?? {}) } };
}

// Cópia de trabalho única: hooks concorrentes esperam a mesma leitura (nenhum sobrescreve o outro).
async function monHydrate($) {
  if (M.st) return M.st;
  if (!M.hydrating) M.hydrating = monLoad($).then((s) => (M.st ??= s)).finally(() => { M.hydrating = null; });
  return M.st ?? await M.hydrating;
}

async function monTick($) {
  if (M.inTick || !M.st || !mc.isLive(M.st)) return; // sem linha viva: nada a escrever
  M.inTick = true;
  try {
    const now = await $.clock.now(); // antes da lista: linha criada depois fica dentro da carência
    let list = null;
    try { list = await $.agent.list(); } catch { list = null; }
    mc.reap(M.st, { list, now });
    await $.state.set(ROWS, M.st.rows); // grava sempre: a escrita redesenha a faixa e anda o cronômetro
  } catch {} finally { M.inTick = false; }
}

async function monSessionStart($, e, next) {
  const r = await next(e);
  try { if (!M.timer) M.timer = $.clock.every(TICK_MS, () => { void monTick($); }); } catch {}
  try { await monHydrate($); } catch {}
  return r;
}

async function monTurnStart($, e, next) {
  try {
    await monHydrate($);
    mc.openMain(M.st, { now: await $.clock.now() });
    await $.state.set(ROWS, M.st.rows);
  } catch {}
  return next(e);
}

async function monAgentSpawn($, e, next) {
  const res = await next(e);
  try {
    if (res && typeof res.agentId === "string") {
      await monHydrate($);
      mc.onSpawned(M.st, { agentId: res.agentId, subagentType: e.subagentType, description: e.description, prompt: e.prompt, model: res.model, now: await $.clock.now() });
      await $.state.set(ROWS, M.st.rows);
      await $.state.set(RETRIES, M.st.retries);
    }
  } catch {}
  return res;
}

async function monToolCall($, e, next) {
  const res = await next(e);
  try {
    await monHydrate($);
    if (mc.onTool(M.st, { loopId: e.agentId ?? "main", isError: !!res?.isError, now: await $.clock.now() })) await $.state.set(ROWS, M.st.rows);
  } catch {}
  return res;
}

async function monTurnComplete($, e, next) {
  const res = await next(e);
  try {
    if (!e.agentId) {
      await monHydrate($);
      if (mc.closeMain(M.st)) await $.state.set(ROWS, M.st.rows);
    }
  } catch {}
  return res;
}

async function* monTurnStep($, e, next) {
  try {
    await monHydrate($);
    if (mc.onStep(M.st, { loopId: e.agentId ?? "main", model: e.model, effort: e.effort, now: await $.clock.now() })) await $.state.set(ROWS, M.st.rows);
  } catch {}
  return yield* next(e);
}

// Desenho: lê de $.state (assina o redesenho), nunca escreve aqui. h(...) global, sem JSX, para seguir
// importável no node. Sem cor, a prop `color` fica de fora.
async function monRender($, e, next) {
  if (e.props?.hasSurvey) return next(e);
  let rows, routing;
  try {
    [rows, routing] = await Promise.all([$.state.get(ROWS), $.state.get(ROUTING)]);
  } catch { return next(e); }
  const st = { rows: Array.isArray(rows?.value) ? rows.value : [], retries: {} };
  if (!mc.isLive(st)) return next(e);
  const v = mc.view(st, { routing: routing?.value, now: await $.clock.now(), visible: mc.visibleFor(e.props?.maxRows) });
  const { Box, Text } = $.ui.resolve(e);
  const tint = (color) => (color ? { color } : {});
  const line = (r) => h(Text, { wrap: "truncate-end" },
    h(Text, { bold: true }, r.label.padEnd(mc.LABEL_COLS)),
    ` Modelo: ${r.model} `,
    h(Text, tint(r.originColor), `(${r.origin})`),
    ` | Tempo: ${r.time} | `,
    h(Text, tint(r.streakColor), `Falhas: ${r.streak}`),
    " | ",
    h(Text, tint(r.retriesColor), `Retentativas: ${r.retries}`));
  return h(Box, { flexDirection: "column" },
    ...v.rows.map(line),
    v.more ? h(Text, { dimColor: true }, `+${v.more} agentes`) : null);
}

/** @type {import('claude-code').Register} */
export const register = (on) => {
  on("session.start", ($, e, next) => monSessionStart($, e, (x) => onSessionStart($, x, next))).catch(($, e, next) => next(e));
  on("command.run", onCommand).catch(($, e, next) => next(e));
  on("turn.start", ($, e, next) => monTurnStart($, e, (x) => onTurnStart($, x, next))).catch(($, e, next) => next(e));
  on("agent.spawn", ($, e, next) => monAgentSpawn($, e, (x) => onAgentSpawn($, x, next))).catch(($, e, next) => next(e));
  on("tool.call", ($, e, next) => monToolCall($, e, (x) => onToolCall($, x, next))).catch(($, e, next) => next(e));
  on("turn.complete", ($, e, next) => monTurnComplete($, e, (x) => onTurnComplete($, x, next))).catch(($, e, next) => next(e));
  on("turn.step", async function* ($, e, next) { return yield* monTurnStep($, e, (x) => routerTurnStep($, x, next)); });
  on("ui.render", { component: "AbovePrompt" }, monRender).catch(($, e, next) => next(e));
};

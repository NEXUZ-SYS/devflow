// Testa o adaptador hooks/router.mjs de verdade: register(on) coleta os hooks e cada teste os invoca
// com um `$` falso e um `next` falso. O kit (hooks/router.test.ts) é só smoke de carga.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stepEffort } from "../../scripts/lib/model-routing.mjs";
import { aggregate, renderMarkdown } from "../../scripts/lib/routing-report.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OPUS = "claude-opus-5-5";
const SONNET = "claude-sonnet-5-5";
const ON = { DEVFLOW_MODEL_ROUTING: "1", HOME: "/home/t" };
const YAML_ON = "models:\n  enabled: true\n";
const YAML_MIDRUN = "models:\n  enabled: true\n  ledger: true\n  midRun:\n    enabled: true\n    failureStreak: 3\n";
let n = 0;

function mkRepo(yaml = YAML_ON, phase = "E") {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "router-mod-")));
  fs.mkdirSync(path.join(root, ".context/runtime/workflows"), { recursive: true });
  if (yaml !== null) fs.writeFileSync(path.join(root, ".context/.devflow.yaml"), yaml);
  fs.writeFileSync(path.join(root, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { current_phase: phase } } }));
  return root;
}

async function load({ root, env = ON, statOverride, complete, stateThrows = false } = {}) {
  const flags = { stateThrows };
  const mod = await import(pathToFileURL(path.join(REPO, "hooks/router.mjs")).href + `?t=${n++}`);
  const hooks = {};
  const log = { reads: [], writes: [], completes: [], status: [], state: {} };
  const on = (ev, h) => { hooks[ev] = { h, c: null }; return { catch(c) { hooks[ev].c = c; return this; } }; };
  mod.register(on);
  const abs = (p) => (path.isAbsolute(p) ? p : path.join(root, p));
  const $ = {
    plugin: { root: REPO },
    env: { get: async (k) => env[k] },
    session: { cwd: async () => root },
    settings: { read: async () => ({ enabledPlugins: {} }) },
    command: { register: async () => ({}) },
    ui: { status: (t) => log.status.push(t), toast: () => {} },
    state: {
      get: async (r) => ({ value: log.state[r.key], version: 0 }),
      set: async (r, v) => { if (flags.stateThrows) throw new Error("state off"); log.state[r.key] = JSON.parse(JSON.stringify(v)); return { isSet: true, version: 1 }; },
    },
    model: { complete: async (req) => { log.completes.push(req); return complete ? complete(req) : { isAnswered: false, reason: "empty-reply" }; } },
    fs: {
      stat: async (p, opt) => {
        const a = abs(p);
        const ov = statOverride?.(a);
        if (ov) return ov;
        const l = fs.lstatSync(a);
        const s = fs.statSync(a);
        return { kind: s.isFile() ? "file" : "dir", size: s.isFile() ? s.size : 0, mtimeMs: s.mtimeMs, isLink: l.isSymbolicLink(), ...(opt?.resolve ? { realPath: fs.realpathSync(a) } : {}) };
      },
      read: async (p) => { log.reads.push(p); return fs.readFileSync(abs(p), "utf8"); },
      write: async (p, text) => { log.writes.push({ path: p, text }); },
    },
  };
  const call = async (ev, e, nextImpl = async (x) => x) => {
    const { h, c } = hooks[ev];
    let called = false, settled;
    const next = async (x) => { called = true; settled = await nextImpl(x); return settled; };
    try { return await h($, e, next); } catch (err) { return c ? c($, e, async (x) => (called ? settled : next(x))) : { skipped: String(err) }; }
  };
  const step = async (e) => {
    let sent;
    const gen = hooks["turn.step"].h($, e, async function* (x) { sent = x; return { ok: true }; });
    let r = await gen.next();
    while (!r.done) r = await gen.next();
    return sent;
  };
  const spawn = async (e, resolved) => {
    let seen;
    await call("agent.spawn", { prompt: "p", fork: false, ...e }, async (x) => { seen = x; return { model: resolved ?? x.model ?? e.parentModel, agentId: "a1" }; });
    return seen;
  };
  const turn = async (extra = {}) => {
    await call("session.start", {});
    await call("turn.start", { text: "x", turnId: "t1" });
    return step({ turnId: "t1", index: 0, model: OPUS, effort: "xhigh", messageCount: 1, ...extra });
  };
  return { call, step, spawn, turn, log, $, flags };
}

test("D18: sem DEVFLOW_MODEL_ROUTING=1 o spawn segue intocado e nada é gravado", async () => {
  const root = mkRepo(YAML_MIDRUN);
  const H = await load({ root, env: { HOME: "/home/t" } });
  await H.turn();
  const seen = await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS });
  assert.equal(seen.model, undefined);
  assert.deepEqual(H.log.writes, []);
});

test("D5 no spawn: teto sonnet + architect → intocado; teto opus + documentation-writer → haiku", async () => {
  const H = await load({ root: mkRepo() });
  await H.turn();
  assert.equal((await H.spawn({ subagentType: "devflow:architect", parentModel: SONNET })).model, undefined);
  assert.equal((await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS })).model, "haiku");
});

test("sessão na fase E: sem ID de sonnet só o esforço muda; depois de aprendê-lo usa o ID completo", async () => {
  const H = await load({ root: mkRepo() });
  const first = await H.turn();
  assert.equal(first.model, OPUS);
  assert.equal(first.effort, "medium");
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, SONNET);
  const next = await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2 });
  assert.equal(next.model, SONNET);
});

test("contenção: .devflow.yaml symlink ou realPath fora da raiz → não roteia", async () => {
  for (const mk of [
    (a) => (a.endsWith(".devflow.yaml") ? { kind: "file", size: 10, mtimeMs: 0, isLink: true, realPath: a } : null),
    (a) => (a.endsWith(".devflow.yaml") ? { kind: "file", size: 10, mtimeMs: 0, isLink: false, realPath: "/etc/devflow.yaml" } : null),
  ]) {
    const root = mkRepo();
    const H = await load({ root, statOverride: (a) => { const r = mk(a); return a === root ? { kind: "dir", size: 0, mtimeMs: 0, isLink: false, realPath: root } : r; } });
    await H.turn();
    assert.equal((await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS })).model, undefined);
  }
});

test("raiz vem do cwd da sessão (PWD ausente/diferente não impede) e a leitura é por caminho absoluto", async () => {
  for (const env of [{ ...ON }, { ...ON, PWD: "/outro/lugar" }]) {
    const root = mkRepo();
    const H = await load({ root, env });
    await H.turn();
    assert.equal((await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS })).model, "haiku");
    const repoReads = H.log.reads.filter((p) => p.includes(".context"));
    assert.ok(repoReads.length >= 2);
    for (const p of repoReads) assert.ok(p.startsWith(root + "/"), p);
  }
});

async function failures(H, count) {
  await H.turn();
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, "claude-haiku-5-5");
  for (let i = 0; i < count; i++) await H.call("tool.call", { tool: "Bash", tool_use_id: `u${i}`, agentId: "a1" }, async () => ({ isError: true, text: "SEGREDO-123 falhou" }));
}

test("midRun ligado: 1 consulta a model.complete em N falhas seguidas; desligado: 0", async () => {
  const H = await load({ root: mkRepo(YAML_MIDRUN) });
  await failures(H, 5);
  assert.equal(H.log.completes.length, 1);
  const off = await load({ root: mkRepo(YAML_ON) });
  await failures(off, 5);
  assert.equal(off.log.completes.length, 0);
});

test("ledger: só valores validados, sem texto de erro", async () => {
  const H = await load({ root: mkRepo(YAML_MIDRUN) });
  await failures(H, 4);
  await H.call("turn.complete", { turnId: "t1" }, async () => ({ usage: { input_tokens: 10, cache_read_input_tokens: 5, model: OPUS } }));
  assert.ok(H.log.writes.length >= 1);
  for (const w of H.log.writes) {
    assert.ok(!w.text.includes("SEGREDO"));
    for (const line of w.text.trim().split("\n")) JSON.parse(line);
  }
});

test("Skill: a da sessão (tool.call sem agentId) muda a skill; a de subagente não", async () => {
  const H = await load({ root: mkRepo() });
  const base = await H.turn();
  assert.equal(base.effort, "medium");
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS });
  await H.call("tool.call", { tool: "Skill", tool_use_id: "s1", agentId: "a1", skill: "superpowers:brainstorming" }, async () => ({}));
  assert.equal((await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2 })).effort, "medium");
  await H.call("tool.call", { tool: "Skill", tool_use_id: "s2", skill: "superpowers:brainstorming" }, async () => ({}));
  assert.equal((await H.step({ turnId: "t1", index: 2, model: OPUS, effort: "xhigh", messageCount: 3 })).effort, "xhigh");
});

const YAML_LEDGER = "models:\n  enabled: true\n  ledger: true\n";

test("contrato ponta a ponta: o ledger REAL do mod fecha com o relatório (agentType nos subagentes, trocas de fase = 1)", async () => {
  const root = mkRepo(YAML_LEDGER, "R");
  const setPhase = (p) => fs.writeFileSync(path.join(root, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { current_phase: p } } }));
  const H = await load({ root });
  await H.turn();
  const spawnAs = (agentId, subagentType, model) =>
    H.call("agent.spawn", { prompt: "p", fork: false, subagentType, parentModel: OPUS }, async () => ({ agentId, model }));
  await spawnAs("a1", "devflow:documentation-writer", "claude-haiku-5-5");
  await spawnAs("a2", "devflow:architect", OPUS);
  await spawnAs("a3", "devflow:architect", SONNET); // aprende o ID do sonnet: a troca efetiva exige um modelo a aplicar
  await H.call("turn.complete", { agentId: "a1" }, async () => ({ usage: { model: "claude-haiku-5-5", input_tokens: 100, output_tokens: 10 } }));
  await H.call("turn.complete", { agentId: "a2" }, async () => ({ usage: { model: OPUS, input_tokens: 200, output_tokens: 20 } }));
  await H.call("turn.complete", {}, async () => ({ usage: { model: OPUS, input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 9000 } }));
  setPhase("E");
  await H.call("turn.start", { text: "x", turnId: "t2" });
  await H.step({ turnId: "t2", index: 0, model: OPUS, effort: "xhigh", messageCount: 3 });
  await H.call("turn.complete", {}, async () => ({ usage: { model: SONNET, input_tokens: 5000, output_tokens: 50, cache_read_input_tokens: 0 } }));
  const entries = H.log.writes.at(-1).text.trim().split("\n").map((l) => JSON.parse(l));
  const agg = aggregate(entries);
  assert.deepEqual([...agg.subagents.keys()].sort(), ["devflow:architect", "devflow:documentation-writer"]);
  assert.equal(agg.phaseSwitches.length, 1);
  const md = renderMarkdown(agg);
  assert.doesNotMatch(md, /\| \? \|/);
  assert.match(md, /Trocas de fase da sessão: 1 /);
  assert.match(md, /devflow:documentation-writer \| claude-haiku-5-5 \| 1 \|/);
});

test("sessão que começa no modelo do usuário: o 1o turn.step que aplica outro modelo marca a troca e o report conta 1", async () => {
  const root = mkRepo(YAML_LEDGER, "E");
  const H = await load({ root });
  await H.call("session.start", {});
  await H.call("agent.spawn", { prompt: "p", fork: false, subagentType: "devflow:code-reviewer", parentModel: OPUS }, async () => ({ agentId: "a0", model: SONNET })); // aprende o ID do sonnet
  await H.call("turn.start", { text: "x", turnId: "t1" });
  const sent = await H.step({ turnId: "t1", index: 0, model: OPUS, effort: "xhigh", messageCount: 1 }); // 1o passo já em E: opus -> sonnet
  assert.equal(sent.model, SONNET);
  await H.call("turn.complete", {}, async () => ({ usage: { model: SONNET, input_tokens: 10, output_tokens: 5 } }));
  const entries = H.log.writes.at(-1).text.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(entries.filter((e) => e.switched === true).length, 1);
  assert.match(renderMarkdown(aggregate(entries)), /Trocas de fase da sessão: 1 /);
});

test("R-3: e.model sempre do usuário — 3 passos em E dão exatamente 1 switched; voltar ao modelo do usuário conta a 2a", async () => {
  const root = mkRepo(YAML_LEDGER, "E");
  const setPhase = (p) => fs.writeFileSync(path.join(root, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { current_phase: p } } }));
  const H = await load({ root });
  await H.call("session.start", {});
  await H.call("agent.spawn", { prompt: "p", fork: false, subagentType: "devflow:code-reviewer", parentModel: OPUS }, async () => ({ agentId: "a0", model: SONNET }));
  const round = async (i, phase) => {
    if (phase) setPhase(phase);
    await H.call("turn.start", { text: "x", turnId: `t${i}` });
    await H.step({ turnId: `t${i}`, index: 0, model: OPUS, effort: "xhigh", messageCount: i + 1 });
    await H.call("turn.complete", {}, async () => ({ usage: { model: SONNET, input_tokens: 10, output_tokens: 5 } }));
  };
  for (let i = 1; i <= 3; i++) await round(i);
  const sw = () => H.log.writes.at(-1).text.trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.scope === "session" && e.switched === true).length;
  assert.equal(sw(), 1);
  await round(4, "R"); // fase sem roteamento: volta ao modelo do usuário
  assert.equal(sw(), 2);
});

test("aggregate conta switched mesmo em linha sem usage (defesa)", () => {
  const agg = aggregate([{ scope: "session", phase: "E", switched: true }]);
  assert.equal(agg.phaseSwitches.length, 1);
});

test("hooks do mod têm .catch (spec §9): $.env.get que rejeita no turn.start → next é chamado e nada é roteado", async () => {
  const root = mkRepo();
  const H = await load({ root });
  H.$.env.get = async () => { throw new Error("boom"); };
  let nextCalled = false;
  await H.call("turn.start", { text: "x", turnId: "t1" }, async (x) => { nextCalled = true; return x; });
  assert.ok(nextCalled, "next chamado");
  await H.call("session.start", {});
  await H.call("turn.complete", {}, async () => ({ usage: { model: OPUS, input_tokens: 1 } }));
  const seen = await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS });
  assert.equal(seen.model, undefined);
  assert.deepEqual(H.log.writes, []);
  const stepped = await H.step({ turnId: "t1", index: 0, model: OPUS, effort: "xhigh", messageCount: 1 });
  assert.equal(stepped.effort, "xhigh");
});

test("D17: outro roteador desabilitado (false) não desliga a sessão; habilitado (true) desliga e avisa", async () => {
  for (const [val, off] of [[false, false], [true, true]]) {
    const H = await load({ root: mkRepo() });
    const toasts = [];
    H.$.settings.read = async () => ({ enabledPlugins: { "jev-router@mkt": val } });
    H.$.ui.toast = (t) => toasts.push(t);
    const first = await H.turn();
    assert.equal(first.effort, off ? "xhigh" : "medium", `valor ${val}`);
    assert.equal(toasts.length, off ? 1 : 0);
  }
  // sem opt-in efetivo não há aviso algum
  const H = await load({ root: mkRepo(), env: { HOME: "/home/t" } });
  const toasts = [];
  H.$.settings.read = async () => ({ enabledPlugins: { "jev-router@mkt": true } });
  H.$.ui.toast = (t) => toasts.push(t);
  await H.turn();
  assert.deepEqual(toasts, []);
});

test("monitor: spawn roteado publica modelo, esforço e origem aplicados", async () => {
  const H = await load({ root: mkRepo() });
  await H.turn();
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS });
  const r = H.log.state.routing;
  assert.equal(r.active, true);
  assert.equal(r.failureStreak, 3);
  assert.equal(r.loops.a1.model, "haiku");
  assert.equal(r.loops.a1.origin, "roteado");
  assert.equal(typeof r.loops.a1.effort, "string");
});

test("monitor: tipo não roteável não publica loop (o monitor mostra teto)", async () => {
  const H = await load({ root: mkRepo() });
  await H.turn();
  await H.spawn({ subagentType: "Explore", parentModel: OPUS });
  assert.equal(H.log.state.routing.active, true);
  assert.equal(H.log.state.routing.loops.a1, undefined);
});

test("monitor: só o esforço roteado na sessão já conta como roteado", async () => {
  const H = await load({ root: mkRepo() });
  const first = await H.turn(); // fase E, sem ID de sonnet aprendido: só o esforço muda
  assert.equal(first.effort, "medium");
  const main = H.log.state.routing.loops.main;
  assert.equal(main.model, OPUS);
  assert.equal(main.effort, "medium");
  assert.equal(main.origin, "roteado");
});

test("monitor: passo da sessão publica o modelo aplicado (não o e.model do usuário)", async () => {
  const H = await load({ root: mkRepo() });
  await H.turn();
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, SONNET);
  await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2 });
  const main = H.log.state.routing.loops.main;
  assert.equal(main.model, SONNET);
  assert.equal(main.origin, "roteado");
});

test("monitor: failureStreak vem do .devflow.yaml", async () => {
  const H = await load({ root: mkRepo("models:\n  enabled: true\n  midRun:\n    failureStreak: 5\n") });
  await H.turn();
  assert.equal(H.log.state.routing.failureStreak, 5);
});

test("monitor: /devflow-route off publica active false; sem opt-in também", async () => {
  const H = await load({ root: mkRepo() });
  await H.turn();
  await H.call("command.run", { command: "devflow-route", args: "off" });
  assert.equal(H.log.state.routing.active, false);
  const H2 = await load({ root: mkRepo(), env: { HOME: "/home/t" } });
  await H2.turn();
  assert.equal(H2.log.state.routing.active, false);
});

test("monitor: $.state.set lançando não muda o que o router devolve, e a publicação é tentada de novo", async () => {
  const H = await load({ root: mkRepo(), stateThrows: true });
  await H.turn();
  const seen = await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS });
  assert.equal(seen.model, "haiku");
  assert.equal(H.log.state.routing, undefined);
  H.flags.stateThrows = false;
  await H.call("command.run", { command: "devflow-route", args: "status" });
  assert.equal(H.log.state.routing.active, true);
});

test("I1: o esforço publicado do subagente acompanha o enviado a cada passo (com e sem patch)", async () => {
  const H = await load({ root: mkRepo(YAML_MIDRUN) });
  await H.turn();
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, "claude-haiku-5-5");
  // com patch: o motor manda xhigh e o roteador reescreve
  const withPatch = await H.step({ turnId: "t1", index: 1, model: OPUS, effort: "xhigh", messageCount: 2, agentId: "a1" });
  assert.equal(H.log.state.routing.loops.a1.effort, withPatch.effort);
  // a escalada por falhas muda o esforço desejado; o evento já traz exatamente esse valor (sem patch)
  for (let i = 0; i < 3; i++) await H.call("tool.call", { tool: "Bash", tool_use_id: `u${i}`, agentId: "a1" }, async () => ({ isError: true, text: "x" }));
  const escalado = stepEffort("low", 3, "xhigh");
  assert.notEqual(escalado, withPatch.effort, "a escalada precisa mudar o esforço desejado");
  const noPatch = await H.step({ turnId: "t1", index: 2, model: OPUS, effort: escalado, messageCount: 3, agentId: "a1" });
  assert.equal(noPatch.effort, escalado);
  assert.equal(H.log.state.routing.loops.a1.effort, noPatch.effort);
});

// ─── H1: fase relida no meio do turno ────────────────────────────────────────────────────────────
const PREVC_REL = ".context/runtime/workflows/prevc.json";
// Grava a fase e empurra o mtime para frente: duas escritas no mesmo ms não podem parecer iguais.
function writePrevc(root, text, bumpS) {
  const f = path.join(root, PREVC_REL);
  fs.writeFileSync(f, text);
  const t = new Date(Date.now() + bumpS * 1000);
  fs.utimesSync(f, t, t);
}
const phaseJson = (p) => JSON.stringify({ status: { project: { current_phase: p } } });

async function sessionInR(yaml = YAML_ON) {
  const root = mkRepo(yaml, "R");
  const H = await load({ root });
  await H.call("session.start", {});
  // aprende o ID do sonnet (a troca efetiva de modelo exige um ID completo)
  await H.call("agent.spawn", { prompt: "p", fork: false, subagentType: "devflow:code-reviewer", parentModel: OPUS }, async () => ({ agentId: "a0", model: SONNET }));
  await H.call("turn.start", { text: "x", turnId: "t1" });
  return { root, H };
}
const stepAt = (H, i) => H.step({ turnId: "t1", index: i, model: OPUS, effort: "xhigh", messageCount: i + 1 });
const faseDe = async (H) => (await H.call("command.run", { command: "devflow-route", args: "" })).text;
const prevcReads = (H) => H.log.reads.filter((p) => String(p).endsWith(PREVC_REL)).length;

test("H1: a fase muda no meio do turno → o passo seguinte da sessão já usa a fase nova", async () => {
  const { root, H } = await sessionInR();
  assert.equal((await stepAt(H, 0)).model, OPUS); // R: sessão no teto
  writePrevc(root, phaseJson("E"), 5);
  assert.equal((await stepAt(H, 1)).model, SONNET); // E: sessão em standard, sem novo turn.start
});

test("H1: a fase muda antes do despacho → o ledger do subagente registra a fase nova", async () => {
  const { root, H } = await sessionInR(YAML_LEDGER);
  await stepAt(H, 0);
  writePrevc(root, phaseJson("E"), 5);
  await H.call("agent.spawn", { prompt: "p", fork: false, subagentType: "devflow:documentation-writer", parentModel: OPUS }, async () => ({ agentId: "a1", model: "claude-haiku-5-5" }));
  await H.call("turn.complete", {}, async () => ({ usage: { model: OPUS, input_tokens: 10, output_tokens: 5 } }));
  const entries = H.log.writes.at(-1).text.trim().split("\n").map((l) => JSON.parse(l));
  const sub = entries.find((e) => e.scope === "subagent" && e.agentId === "a1");
  assert.equal(sub.phase, "E");
});

test("H1: uma mudança do arquivo custa exatamente uma leitura; sem mudança, nenhuma", async () => {
  const { root, H } = await sessionInR();
  const before = prevcReads(H);
  for (let i = 0; i < 3; i++) await stepAt(H, i);
  assert.equal(prevcReads(H), before);
  writePrevc(root, phaseJson("E"), 5);
  for (let i = 3; i < 6; i++) await stepAt(H, i);
  assert.equal(prevcReads(H), before + 1);
});

test("H1: JSON parcial no meio do turno → mantém a fase e relê quando o arquivo fica válido", async () => {
  const { root, H } = await sessionInR();
  await stepAt(H, 0);
  writePrevc(root, "{\"status\":{\"proj", 5); // escrita em andamento
  assert.equal((await stepAt(H, 1)).model, OPUS); // continua em R
  assert.match(await faseDe(H), /fase: R/); // retida de verdade (sem fase o teto também seria OPUS)
  writePrevc(root, phaseJson("E"), 10);
  assert.equal((await stepAt(H, 2)).model, SONNET);
  assert.match(await faseDe(H), /fase: E/);
});

test("H1: JSON válido sem fase grava a assinatura (não relê a cada passo)", async () => {
  const { root, H } = await sessionInR();
  writePrevc(root, JSON.stringify({ status: { project: {} } }), 5);
  await stepAt(H, 0);
  const after = prevcReads(H);
  for (let i = 1; i < 4; i++) await stepAt(H, i);
  assert.equal(prevcReads(H), after);
});

test("H1: prevc.json some no meio do turno → mantém a fase (só o turn.start zera)", async () => {
  const { root, H } = await sessionInR();
  writePrevc(root, phaseJson("E"), 5);
  assert.equal((await stepAt(H, 0)).model, SONNET);
  fs.rmSync(path.join(root, PREVC_REL));
  assert.equal((await stepAt(H, 1)).model, SONNET);
  assert.match(await faseDe(H), /fase: E/);
});

test("H1: JSON válido sem fase no meio do turno mantém a fase; só o turn.start zera", async () => {
  const { root, H } = await sessionInR();
  writePrevc(root, JSON.stringify({ status: { project: {} } }), 5);
  await stepAt(H, 0);
  assert.match(await faseDe(H), /fase: R/);
  await H.call("turn.start", { text: "y", turnId: "t2" });
  assert.match(await faseDe(H), /fase: —/);
});

// Testa o adaptador hooks/router.mjs de verdade: register(on) coleta os hooks e cada teste os invoca
// com um `$` falso e um `next` falso. O kit (hooks/router.test.ts) é só smoke de carga.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

async function load({ root, env = ON, statOverride, complete } = {}) {
  const mod = await import(pathToFileURL(path.join(REPO, "hooks/router.mjs")).href + `?t=${n++}`);
  const hooks = {};
  const log = { reads: [], writes: [], completes: [], status: [] };
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
  return { call, step, spawn, turn, log, $ };
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

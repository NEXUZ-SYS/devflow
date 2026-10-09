// Testa o monitor ao vivo dentro de hooks/router.mjs de verdade: register(on) coleta os hooks; `$` falso
// com $.state, relógio controlável e $.agent.list configurável. Sem DEVFLOW_MODEL_ROUTING o router fica
// desligado (o monitor tem que funcionar mesmo assim). O kit (hooks/router-monitor.test.ts) cobre o engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let n = 0;

globalThis.h = (tag, props, ...children) => ({ tag, props: props ?? {}, children: children.flat().filter((c) => c !== null && c !== undefined && c !== false) });
const textOf = (node) => (node === null || node === undefined ? "" : typeof node === "string" || typeof node === "number" ? String(node) : node.children.map(textOf).join(""));

async function load({ store = {}, list = async () => [], throwsState = false } = {}) {
  const mod = await import(pathToFileURL(path.join(REPO, "hooks/router.mjs")).href + `?t=${n++}`);
  const hooks = {};
  const on = (ev, a, b) => { hooks[ev] = { h: b ?? a, c: null }; return { catch(c) { hooks[ev].c = c; return this; } }; };
  mod.register(on);
  const clock = { now: 0, timers: [] };
  const writes = [];
  const fail = async () => { throw new Error("ENOENT"); };
  const $ = {
    plugin: { root: REPO },
    env: { get: async () => undefined },
    session: { cwd: async () => null },
    settings: { read: async () => ({ enabledPlugins: {} }) },
    command: { register: async () => ({}) },
    fs: { stat: fail, read: fail, write: async () => {} },
    model: { complete: async () => ({ isAnswered: false, reason: "empty-reply" }) },
    state: {
      get: async (r) => { if (throwsState) throw new Error("x"); return { value: store[r.key], version: 0 }; },
      set: async (r, v) => { if (throwsState) throw new Error("x"); store[r.key] = JSON.parse(JSON.stringify(v)); writes.push(r.key); return { isSet: true, version: 1 }; },
    },
    clock: {
      now: async () => clock.now,
      every: (ms, fn) => { const t = { ms, fn, cancelled: false, cancel() { t.cancelled = true; } }; clock.timers.push(t); return t; },
    },
    agent: { list },
    ui: { resolve: () => ({ Box: "Box", Text: "Text" }), status: () => {}, toast: () => {} },
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
  const live = () => clock.timers.filter((t) => !t.cancelled);
  const tick = async () => { for (const t of live()) t.fn(); await new Promise((r) => setTimeout(r, 0)); };
  const start = () => call("session.start", {}, async () => ({}));
  const spawn = (e, agentId = "a1", model = "claude-sonnet-5-5") =>
    call("agent.spawn", { prompt: "", description: "", subagentType: "general-purpose", parentModel: "claude-opus-5-5", fork: false, ...e }, async () => ({ model, agentId }));
  return { call, step, spawn, tick, live, start, clock, store, writes, hooks };
}

test("session.start abre um único cronômetro de 1 s, também num segundo session.start", async () => {
  const H = await load();
  await H.start();
  await H.start();
  assert.equal(H.live().length, 1);
  assert.equal(H.live()[0].ms, 1000);
});

test("SDD real: resultado do spawn intacto; reviewer e implementer contam separados", async () => {
  const H = await load();
  await H.start();
  const res = await H.spawn({ description: "Implement Task 3: parser" }, "a1");
  assert.deepEqual(res, { model: "claude-sonnet-5-5", agentId: "a1" });
  await H.spawn({ description: "Review Task 3 (spec + quality)" }, "a2");
  await H.spawn({ description: "Re-review Task 3 fix round 1" }, "a3");
  await H.spawn({ description: "Implement Task 3: parser" }, "a4");
  const by = Object.fromEntries(H.store.monitorRows.map((r) => [r.id, r]));
  assert.equal(by.a1.label, "general-purpose · Task 3 · implement");
  assert.deepEqual([by.a1.retries, by.a2.retries, by.a3.retries, by.a4.retries], [0, 0, 1, 1]);
  assert.equal(H.store.monitorRetries["general-purpose::review::Task 3"], 2);
});

test("tool.call: erros somam no loop do subagente, sucesso zera, agentId sem linha é ignorado", async () => {
  const H = await load();
  await H.spawn({ description: "Task 1" });
  const err = async () => ({ isError: true, text: "falhou" });
  assert.deepEqual(await H.call("tool.call", { tool: "Bash", agentId: "a1" }, err), { isError: true, text: "falhou" });
  await H.call("tool.call", { tool: "Bash", agentId: "a1" }, err);
  assert.equal(H.store.monitorRows[0].streak, 2);
  await H.call("tool.call", { tool: "Bash", agentId: "a1" }, async () => ({ text: "ok" }));
  assert.equal(H.store.monitorRows[0].streak, 0);
  await H.call("tool.call", { tool: "Bash", agentId: "fork-interno" }, err);
  assert.equal(H.store.monitorRows.length, 1);
});

test("turn.start abre a sessão; turn.step anota modelo/esforço e repassa e intacto (router desligado)", async () => {
  const H = await load();
  await H.call("turn.start", { text: "oi", turnId: "t1" });
  const e = { turnId: "t1", index: 0, model: "claude-opus-5-5", effort: "high", messageCount: 1 };
  assert.deepEqual(await H.step(e), e);
  const main = H.store.monitorRows[0];
  assert.equal(main.id, "main");
  assert.equal(main.model, "claude-opus-5-5");
  assert.equal(main.effort, "high");
  assert.equal(H.store.routing.active, false);
});

test("background: fim do turno fecha só a sessão; o subagente segue até a lista dizer completed", async () => {
  let status = "running";
  const H = await load({ list: async () => [{ id: "a1", status }] });
  await H.start();
  await H.call("turn.start", { text: "x", turnId: "t1" });
  await H.spawn({ description: "Task 2" });
  await H.call("turn.complete", { text: "fim" }, async () => ({ usage: {} }));
  assert.deepEqual(H.store.monitorRows.map((r) => r.id), ["a1"]);
  await H.tick();
  assert.deepEqual(H.store.monitorRows.map((r) => r.id), ["a1"]);
  status = "completed";
  await H.tick();
  assert.deepEqual(H.store.monitorRows, []);
});

test("agent.list rejeitando: linha órfã sai após 30 s sem evento", async () => {
  const H = await load({ list: async () => { throw new Error("indisponível"); } });
  await H.start();
  await H.spawn({ description: "Task 4" });
  H.clock.now = 10_000;
  await H.tick();
  assert.equal(H.store.monitorRows.length, 1);
  H.clock.now = 30_001;
  await H.tick();
  assert.equal(H.store.monitorRows.length, 0);
});

test("tick sem linha viva não escreve nada", async () => {
  const H = await load();
  await H.start();
  const before = H.writes.length;
  await H.tick();
  await H.tick();
  assert.equal(H.writes.length, before);
});

test("recarga a quente: módulo novo com $.state povoado reabre o cronômetro e mantém contadores", async () => {
  const store = {};
  const H1 = await load({ store, list: async () => [{ id: "a1", status: "running" }] });
  await H1.start();
  await H1.spawn({ description: "Implement Task 5: x" });
  const H2 = await load({ store, list: async () => [{ id: "a1", status: "running" }] });
  await H2.start();
  assert.equal(H2.live().length, 1);
  await H2.spawn({ description: "Implement Task 5: x" }, "a2");
  assert.equal(store.monitorRows.find((r) => r.id === "a2").retries, 1);
  assert.ok(store.monitorRows.some((r) => r.id === "a1"));
});

test("$.state lançando: todo hook devolve o resultado de next com e intacto", async () => {
  const H = await load({ throwsState: true });
  assert.deepEqual(await H.start(), {});
  assert.deepEqual(await H.spawn({ description: "Task 1" }), { model: "claude-sonnet-5-5", agentId: "a1" });
  const seen = [];
  await H.call("tool.call", { tool: "Bash", agentId: "a1" }, async (x) => { seen.push(x); return { text: "ok" }; });
  assert.deepEqual(seen, [{ tool: "Bash", agentId: "a1" }]);
  const e = { turnId: "t", index: 0, model: "m", effort: "low", messageCount: 1 };
  assert.deepEqual(await H.step(e), e);
  assert.deepEqual(await H.call("turn.start", { text: "x", turnId: "t" }, async () => "SEGUIU"), "SEGUIU");
});

test("tick com agent.list atrasada não apaga o subagente criado nesse intervalo", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let slow = false;
  const H = await load({ list: async () => { if (slow) await gate; return [{ id: "a1", status: "running" }]; } });
  await H.start();
  await H.spawn({ description: "Task 1" }, "a1");
  H.clock.now = 10_000;
  slow = true;
  const ticking = H.tick();
  await new Promise((r) => setTimeout(r, 5));
  await H.spawn({ description: "Task 2" }, "a2");
  release();
  await ticking;
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(H.store.monitorRows.some((r) => r.id === "a2"));
});

const render = (H, props = { hasSurvey: false, maxRows: 20 }) =>
  H.call("ui.render", { component: "AbovePrompt", surface: "terminal", props }, async () => "ENGINE");

test("render: sem linha viva a faixa cede ao engine", async () => {
  const H = await load();
  assert.equal(await render(H), "ENGINE");
});

test("render: hasSurvey cede ao engine mesmo com linha viva", async () => {
  const H = await load();
  await H.spawn({ description: "Task 1" });
  assert.equal(await render(H, { hasSurvey: true, maxRows: 20 }), "ENGINE");
});

test("render: linha com modelo publicado, origem, tempo, falhas e retentativas; cor ausente omitida", async () => {
  const H = await load();
  await H.spawn({ description: "Implement Task 3: x" }, "a1");
  await H.spawn({ description: "Implement Task 3: x" }, "a2");
  H.store.routing = { active: true, failureStreak: 3, loops: { a2: { model: "claude-sonnet-5-5", effort: "medium", origin: "roteado" } } };
  H.clock.now = 72_000;
  const tree = await render(H);
  assert.equal(tree.tag, "Box");
  assert.equal(tree.props.flexDirection, "column");
  const lines = tree.children.map(textOf);
  const a2 = lines.find((l) => l.includes("Retentativas: 1"));
  assert.ok(a2.startsWith("general-purpose · Task 3 · implement"));
  assert.ok(a2.includes("Modelo: sonnet-5-5·medium (roteado) | Tempo: 01:12 | Falhas: 0 | Retentativas: 1"));
  assert.ok(lines.find((l) => l.includes("Retentativas: 0")).includes("(teto)"));
  const first = tree.children[0];
  assert.equal(first.props.wrap, "truncate-end");
  const falhas = first.children.find((c) => typeof c === "object" && textOf(c).startsWith("Falhas"));
  assert.equal("color" in falhas.props, false);
});

test("render: router desligado marca router off", async () => {
  const H = await load();
  await H.spawn({ description: "Task 1" });
  assert.ok(textOf(await render(H)).includes("(router off)"));
});

test("render: maxRows limita as linhas e mostra +N agentes", async () => {
  const H = await load();
  for (let i = 0; i < 8; i++) await H.spawn({ description: `Task ${i}` }, `a${i}`);
  const tree = await render(H, { hasSurvey: false, maxRows: 5 });
  assert.equal(tree.children.length, 5);
  assert.equal(textOf(tree.children[4]), "+4 agentes");
});

test("render: $.state lançando cede ao engine", async () => {
  const H = await load({ throwsState: true });
  assert.equal(await render(H), "ENGINE");
});

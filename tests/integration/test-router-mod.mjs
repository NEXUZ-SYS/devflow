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
// helpers da D21 v1.2 (sonda/cache): declarados antes de qualquer uso
const settle = () => new Promise((r) => setTimeout(r, 5));
const ledgerLines = (H) => H.log.writes.filter((w) => w.path.endsWith(".jsonl")).at(-1)?.text.trim().split("\n").map((l) => JSON.parse(l)) ?? [];
// HOME virtual: nada sob ele existe no disco; `files`/`links` do load o povoam
const VHOME = "/home/t";
const CACHE = "/home/t/.local/share/devflow-model-routing/ids.json";
const cacheWrites = (H) => H.log.writes.filter((w) => w.path === CACHE);
const later = (H, index) => H.step({ turnId: "t1", index, model: OPUS, effort: "xhigh", messageCount: index + 1 });


function mkRepo(yaml = YAML_ON, phase = "E") {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "router-mod-")));
  fs.mkdirSync(path.join(root, ".context/runtime/workflows"), { recursive: true });
  if (yaml !== null) fs.writeFileSync(path.join(root, ".context/.devflow.yaml"), yaml);
  fs.writeFileSync(path.join(root, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { current_phase: phase } } }));
  return root;
}

async function load({ root, env = ON, statOverride, complete, stateThrows = false, files = {}, links = {}, writeDelay } = {}) {
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
    clock: { after: (ms, fn) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); } },
    model: { complete: async (req) => { log.completes.push(req); return complete ? complete(req) : { isAnswered: false, reason: "empty-reply" }; } },
    fs: {
      stat: async (p, opt) => {
        const a = abs(p);
        const ov = statOverride?.(a);
        if (ov) return ov;
        if (Object.hasOwn(links, a)) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); // link pendurado: stat segue e rejeita
        // diretório virtual do HOME: existe se algum arquivo/link virtual mora abaixo dele
        if (a === VHOME || [...Object.keys(files), ...Object.keys(links)].some((k) => k.startsWith(a + "/"))) return { kind: "dir", size: 0, mtimeMs: 0, isLink: false, ...(opt?.resolve ? { realPath: a } : {}) };
        if (Object.hasOwn(files, a)) return { kind: "file", size: files[a].length, mtimeMs: 0, isLink: false, ...(opt?.resolve ? { realPath: a } : {}) };
        const l = fs.lstatSync(a);
        const s = fs.statSync(a);
        return { kind: s.isFile() ? "file" : "dir", size: s.isFile() ? s.size : 0, mtimeMs: s.mtimeMs, isLink: l.isSymbolicLink(), ...(opt?.resolve ? { realPath: fs.realpathSync(a) } : {}) };
      },
      read: async (p) => { log.reads.push(p); return Object.hasOwn(files, abs(p)) ? files[abs(p)] : fs.readFileSync(abs(p), "utf8"); },
      // HOME virtual (VHOME) listado a partir de `files`/`links`, como o $.fs.list do engine: link aparece com isLink.
      list: async (p) => {
        const d = abs(p ?? ".");
        if (d !== VHOME && !d.startsWith(VHOME + "/")) {
          return fs.readdirSync(d, { withFileTypes: true }).map((x) => ({ name: x.name, kind: x.isFile() ? "file" : x.isDirectory() ? "dir" : "other", size: 0, mtimeMs: 0, isLink: x.isSymbolicLink() }));
        }
        const keys = [...Object.keys(files), ...Object.keys(links)].filter((k) => k.startsWith(d + "/"));
        if (d !== VHOME && !keys.length) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        const out = new Map();
        for (const k of keys) {
          const name = k.slice(d.length + 1).split("/")[0];
          const full = `${d}/${name}`;
          out.set(name, Object.hasOwn(links, full) ? { name, kind: "other", size: 0, mtimeMs: 0, isLink: true } : { name, kind: full === k ? "file" : "dir", size: 0, mtimeMs: 0, isLink: false });
        }
        return [...out.values()];
      },
      write: async (p, text) => { const ms = writeDelay?.(p); if (ms) await new Promise((r) => setTimeout(r, ms)); log.writes.push({ path: p, text }); },
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
  // a sonda do ID do tier da sessão (prompt "ok", D21 v1.2) também usa model.complete: conta só o decisor
  const decisor = (X) => X.log.completes.filter((r) => r.prompt !== "ok");
  await settle();
  assert.equal(decisor(H).length, 1);
  const off = await load({ root: mkRepo(YAML_ON) });
  await failures(off, 5);
  await settle();
  assert.equal(decisor(off).length, 0);
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

// ─── D21 v1.2: sonda do ID do tier, cache contido e ledger ─────────────────────────────────────────

test("D21 v1.2: fase E sem ID → 1a etapa só esforço e agenda 1 sonda; a seguinte troca para o ID sondado", async () => {
  const H = await load({ root: mkRepo(YAML_LEDGER) });
  const first = await H.turn();
  assert.equal(first.model, OPUS);
  await settle();
  const probes = H.log.completes.filter((r) => r.prompt === "ok");
  assert.equal(probes.length, 1);
  assert.deepEqual({ model: probes[0].model, maxTokens: probes[0].maxTokens, effort: probes[0].effort }, { model: SONNET, maxTokens: 1, effort: "low" });
  assert.equal((await later(H, 1)).model, SONNET);
  assert.equal(H.log.completes.filter((r) => r.prompt === "ok").length, 1, "nenhuma sonda nova depois do ok");
});

test("D21 v1.2: passos com a sonda em voo não disparam outra", async () => {
  let release;
  const H = await load({ root: mkRepo(), complete: () => new Promise((r) => { release = () => r({ isAnswered: true, text: "ok" }); }) });
  await H.turn();
  await settle();
  await later(H, 1);
  await later(H, 2);
  assert.equal(H.log.completes.length, 1);
  release();
  await settle();
  assert.equal((await later(H, 3)).model, SONNET);
});

test("D21 v1.2: candidato rejeitado (404) → testa o próximo; models.ids vem antes da tabela", async () => {
  const yaml = "models:\n  enabled: true\n  ids:\n    standard: claude-sonnet-9\n";
  const H = await load({ root: mkRepo(yaml), complete: (req) => (req.model === "claude-sonnet-9" ? { isAnswered: false, reason: "api-error", error: "model_not_found", status: 404 } : { isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  await later(H, 1); // agenda a 2a sonda
  await settle();
  assert.deepEqual(H.log.completes.map((r) => r.model), ["claude-sonnet-9", SONNET]);
  assert.equal((await later(H, 2)).model, SONNET);
});

test("D21 v1.2: invalid_request/400 é erro transitório: tenta o mesmo candidato de novo", async () => {
  const H = await load({ root: mkRepo(), complete: () => ({ isAnswered: false, reason: "api-error", error: "invalid_request", status: 400 }) });
  await H.turn();
  await settle();
  await later(H, 1);
  await settle();
  assert.deepEqual(H.log.completes.map((r) => r.model), [SONNET, SONNET]);
});

test("D21 v1.2: a sonda que lança conta como rejected e nunca quebra o passo", async () => {
  const H = await load({ root: mkRepo(), complete: () => { throw new Error("modelo bloqueado"); } });
  assert.equal((await H.turn()).model, OPUS);
  await settle();
  assert.equal((await later(H, 1)).model, OPUS, "sem candidato verificado: segue no teto");
  assert.equal(H.log.completes.length, 1, "rejeitado não é re-sondado");
});

test("D21 v1.2: ledger registra probe (gravado na hora), idPending e idSource; texto da resposta nunca entra", async () => {
  const H = await load({ root: mkRepo(YAML_LEDGER), complete: () => ({ isAnswered: true, text: "SEGREDO" }) });
  await H.turn();
  await settle();
  const probe = ledgerLines(H).find((l) => l.scope === "probe");
  assert.ok(probe, "a linha probe vai ao disco sem esperar o turn.complete");
  assert.deepEqual([probe.tier, probe.model, probe.probe], ["standard", SONNET, "ok"]);
  await later(H, 1);
  await H.call("turn.complete", { turnId: "t1" }, async () => ({ usage: { model: SONNET, input_tokens: 1, output_tokens: 1 } }));
  const sess = ledgerLines(H).find((l) => l.scope === "session");
  assert.equal(sess.idPending, "standard");
  assert.equal(sess.switched, true);
  assert.equal(sess.idSource, "probe");
  assert.equal(JSON.stringify(ledgerLines(H)).includes("SEGREDO"), false);
  // 2o turno: ID já verificado, sem troca → a linha nova não herda idPending/idSource do turno anterior
  await H.call("turn.start", { text: "y", turnId: "t2" });
  await H.step({ turnId: "t2", index: 0, model: OPUS, effort: "xhigh", messageCount: 3 });
  await H.call("turn.complete", { turnId: "t2" }, async () => ({ usage: { model: SONNET, input_tokens: 1, output_tokens: 1 } }));
  const s2 = ledgerLines(H).filter((l) => l.scope === "session").at(-1);
  assert.notEqual(s2, sess);
  assert.equal(s2.idPending, undefined);
  assert.equal(s2.idSource, undefined);
  assert.equal(s2.switched, undefined);
});

test("D21 v1.2: cache recebe só ID da tabela com sonda ok (nunca o teto do turn.step)", async () => {
  const H = await load({ root: mkRepo(), complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.deepEqual(JSON.parse(cacheWrites(H).at(-1).text), { version: 1, ids: { standard: SONNET } });
});

test("D21 v1.2: ID de models.ids com sonda ok é usado na sessão mas nunca vai ao cache", async () => {
  const yaml = "models:\n  enabled: true\n  ids:\n    standard: claude-sonnet-9\n";
  const H = await load({ root: mkRepo(yaml), complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.equal((await later(H, 1)).model, "claude-sonnet-9");
  assert.equal(cacheWrites(H).some((w) => w.text.includes("claude-sonnet-9")), false);
});

test("D21 v1.2: despacho roteado alimenta o cache; despacho com modelo explícito não", async () => {
  const H = await load({ root: mkRepo() });
  await H.call("session.start", {});
  await H.call("turn.start", { text: "x", turnId: "t1" });
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, "claude-haiku-5-5");
  assert.deepEqual(JSON.parse(cacheWrites(H).at(-1).text).ids, { cheap: "claude-haiku-5-5" });
  const n = cacheWrites(H).length;
  await H.spawn({ subagentType: "general-purpose", parentModel: OPUS, model: "claude-sonnet-9" }, "claude-sonnet-9");
  assert.equal(cacheWrites(H).length, n, "explícito/não roteado não grava");
});

test("D21 v1.2: cache existente é só candidato — passa pela sonda antes de usar; rejeitado sai do cache", async () => {
  const cache = JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } });
  const H = await load({ root: mkRepo(), files: { [CACHE]: cache }, complete: (req) => (req.model === "claude-sonnet-9" ? { isAnswered: false, reason: "api-error", error: "model_not_found", status: 404 } : { isAnswered: true, text: "ok" }) });
  assert.equal((await H.turn()).model, OPUS, "cache não é usado sem sonda");
  await settle();
  assert.equal(H.log.completes[0].model, "claude-sonnet-9");
  assert.equal(JSON.parse(cacheWrites(H).at(-1).text).ids.standard, undefined, "rejeitado saiu do cache");
});

test("D21 v1.2: contenção — arquivo link, maior que 4 KiB ou diretório link → não lê nem grava o cache", async () => {
  const cache = JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } });
  const dir = CACHE.slice(0, CACHE.lastIndexOf("/"));
  const cases = [
    (a) => (a === CACHE ? { kind: "file", size: 50, mtimeMs: 0, isLink: true, realPath: CACHE } : null),
    (a) => (a === CACHE ? { kind: "file", size: 5000, mtimeMs: 0, isLink: false, realPath: CACHE } : null),
    (a) => (a === CACHE ? { kind: "file", size: 50, mtimeMs: 0, isLink: false, realPath: "/outro/ids.json" } : null),
    (a) => (a === dir ? { kind: "dir", size: 0, mtimeMs: 0, isLink: false, realPath: "/outro/lugar" } : null),
  ];
  for (const ov of cases) {
    const H = await load({ root: mkRepo(), files: { [CACHE]: cache }, statOverride: ov, complete: () => ({ isAnswered: true, text: "ok" }) });
    await H.turn();
    await settle();
    assert.equal(H.log.completes[0]?.model, SONNET, "o cache recusado é pulado: a tabela é o 1o candidato");
    assert.equal(cacheWrites(H).length, 0, "cache recusado nunca é gravado");
  }
});

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

// ─── D21 v1.2, rodada 1 da revisão ───────────────────────────────────────────────────────────────
test("D21 v1.2: link pendurado no lugar do ids.json → nunca grava (não cria o alvo do link)", async () => {
  const H = await load({ root: mkRepo(), links: { [CACHE]: "/home/t/ALVO" }, complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.equal(H.log.completes[0]?.model, SONNET, "sonda segue com a tabela");
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, "claude-haiku-5-5");
  assert.equal(cacheWrites(H).length, 0);
});

test("D21 v1.2: link pendurado no lugar do diretório do cache → nunca grava", async () => {
  const dir = CACHE.slice(0, CACHE.lastIndexOf("/"));
  const H = await load({ root: mkRepo(), links: { [dir]: "/outro/lugar" }, complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.equal(cacheWrites(H).length, 0);
});

test("D21 v1.2: cache ausente de verdade (diretórios inexistentes) ainda é criado", async () => {
  const H = await load({ root: mkRepo(), complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.equal(cacheWrites(H).length, 1);
});

test("D21 v1.2: despacho roteado para um tier que o engine resolve em outro → não grava", async () => {
  const H = await load({ root: mkRepo() });
  await H.call("session.start", {});
  await H.call("turn.start", { text: "x", turnId: "t1" });
  const seen = await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, SONNET);
  assert.equal(seen.model, "haiku", "o mod pediu cheap");
  assert.equal(cacheWrites(H).length, 0);
});

test("D21 v1.2: despacho explícito recortado ao teto (alias do mod, source explicit) → não grava", async () => {
  const H = await load({ root: mkRepo() });
  await H.call("session.start", {});
  await H.call("turn.start", { text: "x", turnId: "t1" });
  const seen = await H.spawn({ subagentType: "devflow:code-reviewer", parentModel: SONNET, model: "opus" }, SONNET);
  assert.equal(seen.model, "sonnet", "o mod recortou o explícito para o teto");
  assert.equal(cacheWrites(H).length, 0);
});

test("D21 v1.2: link que aparece depois da leitura → a gravação reconfere e não grava, nem depois", async () => {
  let swapped = false;
  const ov = (a) => (swapped && a === CACHE ? { kind: "file", size: 10, mtimeMs: 0, isLink: true, realPath: "/etc/passwd" } : null);
  const H = await load({ root: mkRepo(), statOverride: ov, complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn(); // ensure aceitou o cache ausente
  swapped = true;
  await settle();
  assert.equal(H.log.completes.length, 1);
  assert.equal(cacheWrites(H).length, 0);
  swapped = false; // recusa desliga o cache na sessão: não volta a gravar
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, "claude-haiku-5-5");
  assert.equal(cacheWrites(H).length, 0);
});

test("D21 v1.2: gravações do cache são serializadas — a mais nova nunca é sobrescrita pela mais velha", async () => {
  const cache = JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } });
  let k = 0;
  const H = await load({
    root: mkRepo(), files: { [CACHE]: cache },
    writeDelay: (p) => (p === CACHE && k++ === 0 ? 30 : 0), // 1a gravação lenta
    complete: (req) => (req.model === "claude-sonnet-9" ? { isAnswered: false, reason: "api-error", error: "model_not_found", status: 404 } : { isAnswered: true, text: "ok" }),
  });
  await H.turn(); // agenda a sonda do claude-sonnet-9
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, "claude-haiku-5-5"); // grava devagar, ainda com o sonnet-9
  await settle(); // sonda rejeita o sonnet-9 → grava sem ele
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(JSON.parse(cacheWrites(H).at(-1).text).ids, { cheap: "claude-haiku-5-5" });
});

test("D21 v1.2: sonda que resolve com o roteamento desligado não grava ledger nem cache", async () => {
  const H = await load({ root: mkRepo(YAML_LEDGER), complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await H.call("command.run", { command: "devflow-route", args: "off" });
  await settle();
  assert.equal(H.log.completes.length, 1);
  assert.equal(ledgerLines(H).some((l) => l.scope === "probe"), false);
  assert.equal(cacheWrites(H).length, 0);
});

test("D21 v1.2: turn.complete da sessão sem usage zera o idPending do turno", async () => {
  const root = mkRepo(YAML_LEDGER);
  const H = await load({ root, complete: () => ({ isAnswered: false, reason: "api-error", error: "overloaded", status: 529 }) });
  await H.turn(); // E sem ID: idPending standard
  await settle();
  await H.call("turn.complete", { turnId: "t1" }, async () => ({}));
  fs.writeFileSync(path.join(root, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { current_phase: "R" } } }));
  await H.call("turn.start", { text: "y", turnId: "t2" });
  await H.step({ turnId: "t2", index: 0, model: OPUS, effort: "xhigh", messageCount: 2 });
  await H.call("turn.complete", { turnId: "t2" }, async () => ({ usage: { model: OPUS, input_tokens: 1, output_tokens: 1 } }));
  const sess = ledgerLines(H).filter((l) => l.scope === "session").at(-1);
  assert.equal(sess.phase, "R");
  assert.equal(sess.idPending, undefined);
});

test("D21 v1.2: troca de volta ao teto não herda o idSource de uma troca anterior sem linha de sessão", async () => {
  const root = mkRepo(YAML_LEDGER);
  const H = await load({ root, complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.equal((await later(H, 1)).model, SONNET); // troca com idSource probe
  await H.call("turn.complete", { turnId: "t1" }, async () => ({})); // sem usage: a linha da troca não sai
  fs.writeFileSync(path.join(root, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { current_phase: "R" } } }));
  await H.call("turn.start", { text: "y", turnId: "t2" });
  assert.equal((await H.step({ turnId: "t2", index: 0, model: OPUS, effort: "xhigh", messageCount: 3 })).model, OPUS); // volta ao teto
  await H.call("turn.complete", { turnId: "t2" }, async () => ({ usage: { model: OPUS, input_tokens: 1, output_tokens: 1 } }));
  const sess = ledgerLines(H).filter((l) => l.scope === "session").at(-1);
  assert.equal(sess.switched, true);
  assert.equal(sess.idSource, undefined, "a última troca (para o teto) não veio de ID sondado");
});

test("D21 v1.2: HOME relativo com cache já existente no caminho relativo → nem lê nem grava", async () => {
  const rel = "home/t/.local/share/devflow-model-routing/ids.json";
  const root = mkRepo();
  fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } }));
  const H = await load({ root, env: { ...ON, HOME: "home/t" }, complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.equal(H.log.completes[0]?.model, SONNET, "o cache relativo não vira candidato");
  assert.equal(H.log.writes.some((w) => w.path.includes("ids.json")), false);
});

test("D21 v1.2: HOME relativo → cache desligado (não lê nem grava)", async () => {
  const root = mkRepo();
  fs.mkdirSync(path.join(root, "home")); // a listagem de "home" provaria a ausência de "t": só a guarda de caminho absoluto barra
  const H = await load({ root, env: { ...ON, HOME: "home/t" }, complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.equal(H.log.completes.length, 1, "a sonda segue");
  assert.equal(H.log.writes.some((w) => w.path.includes("ids.json")), false);
  assert.equal(H.log.reads.some((p) => String(p).includes("ids.json")), false);
});

// ─── D21 v1.2, fix wave da revisão final ─────────────────────────────────────────────────────────
const CACHE_DIR = CACHE.slice(0, CACHE.lastIndexOf("/"));
const DATA = CACHE_DIR.slice(0, CACHE_DIR.lastIndexOf("/")); // ~/.local/share
const st = (kind, realPath, extra = {}) => ({ kind, size: kind === "file" ? 50 : 0, mtimeMs: 0, isLink: false, realPath, ...extra });

test("D21 v1.2: link num ANCESTRAL do cache (HOME em /var/home, stow) → o cache funciona", async () => {
  const REAL = "/var/home/t/.local/share";
  const cache = JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } });
  const ov = (a) => (a === DATA ? st("dir", REAL) : a === CACHE_DIR ? st("dir", `${REAL}/devflow-model-routing`) : a === CACHE ? st("file", `${REAL}/devflow-model-routing/ids.json`) : null);
  const H = await load({ root: mkRepo(), files: { [CACHE]: cache }, statOverride: ov, complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.equal(H.log.completes[0]?.model, "claude-sonnet-9", "o cache foi lido: é o 1o candidato");
  await H.spawn({ subagentType: "devflow:documentation-writer", parentModel: OPUS }, "claude-haiku-5-5");
  assert.deepEqual(JSON.parse(cacheWrites(H).at(-1).text).ids, { standard: "claude-sonnet-9", cheap: "claude-haiku-5-5" });
});

test("D21 v1.2: link no diretório do cache ou no arquivo, mesmo com ancestral resolvido → recusa", async () => {
  const REAL = "/var/home/t/.local/share";
  const cache = JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } });
  const base = (a) => (a === DATA ? st("dir", REAL) : null);
  const cases = [
    (a) => base(a) ?? (a === CACHE_DIR ? st("dir", `${REAL}/outro-dir`, { isLink: true }) : null), // dir link para irmão
    (a) => base(a) ?? (a === CACHE_DIR ? st("dir", `${REAL}/devflow-model-routing`, { isLink: true }) : a === CACHE ? st("file", `${REAL}/devflow-model-routing/ids.json`) : null), // dir marcado como link, mesmo com realPaths coerentes
    (a) => base(a) ?? (a === CACHE_DIR ? st("dir", `${REAL}/devflow-model-routing`) : a === CACHE ? st("file", `${REAL}/devflow-model-routing/ids.json`, { isLink: true }) : null), // arquivo link
    (a) => base(a) ?? (a === CACHE_DIR ? st("dir", `${REAL}/devflow-model-routing`) : a === CACHE ? st("file", `${REAL}/devflow-model-routing/outro.json`) : null), // arquivo resolve a outro nome
  ];
  for (const ov of cases) {
    const H = await load({ root: mkRepo(), files: { [CACHE]: cache }, statOverride: ov, complete: () => ({ isAnswered: true, text: "ok" }) });
    await H.turn();
    await settle();
    assert.equal(H.log.completes[0]?.model, SONNET, "cache recusado: a tabela é o 1o candidato");
    assert.equal(cacheWrites(H).length, 0);
  }
});

test("D21 v1.2: diretório do cache ainda ausente sob ancestral link → valida só o pai e cria", async () => {
  const ov = (a) => (a === DATA ? st("dir", "/var/home/t/.local/share") : null);
  const H = await load({ root: mkRepo(), files: { [`${DATA}/outra-coisa`]: "x" }, statOverride: ov, complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle();
  assert.equal(cacheWrites(H).length, 1);
});

test("D21 v1.2: diretório do cache ausente e pai que não é diretório real → recusa", async () => {
  for (const pai of [st("file", "/var/home/t/.local/share"), st("dir", undefined)]) {
    const H = await load({ root: mkRepo(), files: { [`${DATA}/outra-coisa`]: "x" }, statOverride: (a) => (a === DATA ? pai : null), complete: () => ({ isAnswered: true, text: "ok" }) });
    await H.turn();
    await settle();
    assert.equal(cacheWrites(H).length, 0);
  }
});

test("D21 v1.2: gravações do ledger são serializadas — a linha da sessão nunca some do disco", async () => {
  let k = 0;
  const H = await load({ root: mkRepo(YAML_LEDGER), writeDelay: (p) => (p.endsWith(".jsonl") && k++ === 0 ? 30 : 0), complete: () => ({ isAnswered: true, text: "ok" }) });
  await H.turn();
  await settle(); // sonda resolve → 1o flush (lento), só com a linha probe
  await later(H, 1);
  await H.call("turn.complete", { turnId: "t1" }, async () => ({ usage: { model: SONNET, input_tokens: 1, output_tokens: 1 } }));
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(ledgerLines(H).map((l) => l.scope), ["probe", "session"]);
});

test("D21 v1.2: sonda que LANÇA rejeita o candidato na sessão, mas não apaga o ID do cache", async () => {
  const cache = JSON.stringify({ version: 1, ids: { standard: "claude-sonnet-9" } });
  const H = await load({ root: mkRepo(), files: { [CACHE]: cache }, complete: (req) => { if (req.model === "claude-sonnet-9") throw new Error("rede caiu"); return { isAnswered: false, reason: "api-error", error: "overloaded", status: 529 }; } });
  await H.turn();
  await settle();
  await later(H, 1); // o candidato que lançou não é re-sondado: passa ao da tabela
  await settle();
  assert.deepEqual(H.log.completes.map((r) => r.model), ["claude-sonnet-9", SONNET]);
  assert.equal(cacheWrites(H).some((w) => JSON.parse(w.text).ids.standard !== "claude-sonnet-9"), false, "exceção não apaga do cache");
});

test("D21 v1.2: passo só com idPending (esforço já igual) não mexe na barra de status", async () => {
  const H = await load({ root: mkRepo(), complete: () => new Promise(() => {}) });
  const sent = await H.turn({ effort: "medium" });
  assert.equal(sent.model, OPUS);
  assert.equal(sent.effort, "medium");
  await settle();
  assert.equal(H.log.completes.length, 1, "a sonda saiu");
  assert.deepEqual(H.log.status, []);
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

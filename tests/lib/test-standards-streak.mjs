// tests/lib/test-standards-streak.mjs — anti-loop do bloqueio por sessão (T15, ADR-015).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { recordBlocks, STREAK_LIMIT, streakPath, MAX_SESSIONS, MAX_FPS } from "../../scripts/lib/standards-streak.mjs";
import { renderHookResult } from "../../scripts/lib/standards-hook-cli.mjs";
import { demoProject } from "../helpers/standards-fixture.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const CLI = join(REPO, "scripts/lib/standards-hook-cli.mjs");
const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "st-")); dirs.push(d); return d; };
const proj = () => { const d = tmp(); mkdirSync(join(d, ".context")); return d; };
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const F = (fp, path = "src/a.js") => ({ fp, path });

test("conta bloqueios seguidos da mesma impressão digital na sessão", () => {
  const root = proj();
  recordBlocks(root, "s1:main", "src/a.js", [F("a")]); recordBlocks(root, "s1:main", "src/a.js", [F("a")]);
  assert.equal(recordBlocks(root, "s1:main", "src/a.js", [F("a")]).get("a"), STREAK_LIMIT);
});
test("edição limpa de OUTRO arquivo não zera", () => {
  const root = proj();
  recordBlocks(root, "s1:main", "src/a.js", [F("a")]);
  recordBlocks(root, "s1:main", "src/b.js", []);
  assert.equal(recordBlocks(root, "s1:main", "src/a.js", [F("a")]).get("a"), 2);
});
test("corrigir no mesmo arquivo zera; sessão nova zera", () => {
  const root = proj();
  recordBlocks(root, "s1:main", "src/a.js", [F("a")]); recordBlocks(root, "s1:main", "src/a.js", []);
  assert.equal(recordBlocks(root, "s1:main", "src/a.js", [F("a")]).get("a"), 1);
  assert.equal(recordBlocks(root, "s2:main", "src/a.js", [F("a")]).get("a"), 1);
});
test("agentes diferentes da mesma sessão têm contagens separadas", () => {
  const root = proj();
  recordBlocks(root, "s1:main", "src/a.js", [F("a")]);
  assert.equal(recordBlocks(root, "s1:sub", "src/a.js", [F("a")]).get("a"), 1);
});
test("sem session_id: sem contagem e nada gravado", () => {
  const root = proj();
  assert.equal(recordBlocks(root, ":main", "src/a.js", [F("a")]).size, 0);
  assert.equal(recordBlocks(root, "", "src/a.js", [F("a")]).size, 0);
  assert.equal(existsSync(streakPath(root)), false);
});
// I-7: o hook síncrono chama recordBlocks em TODA edição. Sem bloqueio a registrar e sem
// sequência anterior do arquivo a zerar, não pode sobrar estado no projeto.
test("sem bloqueio e sem sequência anterior: não cria .context/runtime nem grava", () => {
  const root = proj();
  assert.equal(recordBlocks(root, "s1:main", "src/a.js", []).size, 0);
  assert.equal(existsSync(join(root, ".context/runtime")), false);
  assert.equal(existsSync(streakPath(root)), false);
});
test("sem bloqueio, runtime já existente e sem estado: não grava o arquivo", () => {
  const root = proj();
  mkdirSync(join(root, ".context/runtime"));
  assert.equal(recordBlocks(root, "s1:main", "src/a.js", []).size, 0);
  assert.deepEqual(readdirSync(join(root, ".context/runtime")), []);
});
test("edição limpa de OUTRO arquivo não regrava o estado", () => {
  const root = proj();
  recordBlocks(root, "s1:main", "src/a.js", [F("a")]);
  const antes = statSync(streakPath(root)).ino;
  assert.equal(recordBlocks(root, "s1:main", "src/b.js", []).size, 0);
  assert.equal(statSync(streakPath(root)).ino, antes, "o arquivo de estado foi regravado");
});
test("edição limpa depois de um bloqueio tira a sequência do arquivo do estado gravado", () => {
  const root = proj();
  recordBlocks(root, "s1:main", "src/a.js", [F("a")]);
  recordBlocks(root, "s1:main", "src/b.js", [F("b", "src/b.js")]);
  assert.equal(recordBlocks(root, "s1:main", "src/a.js", []).size, 0);
  const st = JSON.parse(readFileSync(streakPath(root), "utf8"));
  assert.deepEqual(Object.keys(st.keys["s1:main"]), ["b"]);
});
test("mensagem de travamento não sugere accept ao agente", () => {
  const f = { stdId: "s", ruleId: "r", path: "src/a.js", line: 1, message: "m", fp: "a" };
  const out = renderHookResult({ blocking: [f], warnings: [], review: [], baselined: [], errors: [], hasBaseline: true, baselineError: null }, { mode: "sync", cmd: "node x", stuck: [f] });
  assert.equal(out.decision.decision, "block");
  assert.match(out.decision.reason, /pergunte ao humano/);
  assert.doesNotMatch(out.decision.reason, /accept/);
});
test("limita sessões e impressões digitais, descartando as mais antigas", () => {
  const root = proj();
  for (let i = 0; i < MAX_SESSIONS + 10; i++) recordBlocks(root, `s${i}:main`, "src/a.js", [F("a")]);
  const st = JSON.parse(readFileSync(streakPath(root), "utf8"));
  assert.equal(Object.keys(st.keys).length, MAX_SESSIONS);
  assert.ok(!("s0:main" in st.keys) && `s${MAX_SESSIONS + 9}:main` in st.keys);
  const many = Array.from({ length: MAX_FPS + 50 }, (_, i) => F(`fp${i}`));
  recordBlocks(root, "big:main", "src/a.js", many);
  const st2 = JSON.parse(readFileSync(streakPath(root), "utf8"));
  assert.equal(Object.keys(st2.keys["big:main"]).length, MAX_FPS);
});
test("grava de forma atômica: sem .tmp sobrando", () => {
  const root = proj();
  recordBlocks(root, "s1:main", "src/a.js", [F("a")]);
  assert.deepEqual(readdirSync(join(root, ".context/runtime")), ["standards-block-streak.json"]);
});
test(".context/runtime symlink: ignora o estado e não grava", () => {
  const root = proj();
  const alvo = tmp();
  symlinkSync(alvo, join(root, ".context/runtime"));
  assert.equal(recordBlocks(root, "s1:main", "src/a.js", [F("a")]).size, 0);
  assert.deepEqual(readdirSync(alvo), []);
});
test("estado forjado (tipos errados, valores enormes) não lança", () => {
  for (const lixo of ["{", "null", "[]", '{"keys":[]}', '{"keys":{"s1:main":{"a":{"n":"x","path":3}}}}', '{"keys":{"s1:main":{"a":{"n":1e308,"path":"src/a.js"}}}}', "x".repeat(70 * 1024)]) {
    const root = proj();
    mkdirSync(join(root, ".context/runtime"), { recursive: true });
    writeFileSync(streakPath(root), lixo);
    const m = recordBlocks(root, "s1:main", "src/a.js", [F("a")]);
    assert.ok(Number.isFinite(m.get("a")) && m.get("a") >= 1, lixo.slice(0, 40));
  }
});

// Integração: o estado forjado só pode trocar o texto, nunca remover o block.
function baselined() {
  const root = demoProject();
  dirs.push(root);
  writeFileSync(join(root, ".context/engineering/standards/baseline.json"), '{"version":1,"entries":[]}');
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  return root;
}
const ev = (root, extra = {}) => JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(root, "src/a.js") }, cwd: root, session_id: "sess1", ...extra });
const run = (root, input = ev(root)) => spawnSync(process.execPath, [CLI], { input, cwd: REPO, encoding: "utf8", timeout: 20000 });

test("integração: 3º bloqueio igual muda o texto para pare e pergunte, continua block", () => {
  const root = baselined();
  const reasons = [1, 2, 3].map(() => { const r = run(root); assert.equal(r.status, 0, r.stderr); const j = JSON.parse(r.stdout); assert.equal(j.decision, "block"); return j.reason; });
  assert.doesNotMatch(reasons[1], /bloqueou 3 vezes/);
  assert.match(reasons[2], /pergunte ao humano/);
  assert.match(reasons[2], /3 vezes/);
  assert.doesNotMatch(reasons[2], /accept/);
});
test("integração: projeto sem standard block, Write em arquivo limpo → nenhum estado de streak", () => {
  // .context/ vazio: valem só os defaults do plugin, nenhum deles em block.
  const root = proj();
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src/a.js"), "export const ok = 1;\n");
  const r = run(root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(streakPath(root)), false, "gravou standards-block-streak.json sem bloqueio");
  assert.equal(existsSync(join(root, ".context/runtime")), false, "criou .context/runtime sem bloqueio");
});
test("integração: edição limpa depois de um bloqueio zera a sequência", () => {
  const root = baselined();
  for (let i = 0; i < 2; i++) assert.equal(JSON.parse(run(root).stdout).decision, "block");
  writeFileSync(join(root, "src/a.js"), "ok\n");
  assert.equal(run(root).stdout, "");
  writeFileSync(join(root, "src/a.js"), "BAD\n");
  const j = JSON.parse(run(root).stdout);
  assert.equal(j.decision, "block");
  assert.doesNotMatch(j.reason, /3 vezes/);
});
test("integração: sem session_id bloqueia com texto normal e não grava", () => {
  const root = baselined();
  for (let i = 0; i < 4; i++) {
    const j = JSON.parse(run(root, ev(root, { session_id: undefined })).stdout);
    assert.equal(j.decision, "block");
    assert.doesNotMatch(j.reason, /3 vezes/);
  }
  assert.equal(existsSync(streakPath(root)), false);
});
test("integração: estado forjado nunca remove o block", () => {
  const forjas = {
    contagem: "__COUNT__",
    invalido: "{",
    tipos: '{"keys":{"sess1:main":{"x":{"n":"9","path":[]}}}}',
    grande: "x".repeat(200 * 1024),
  };
  for (const [nome, conteudo] of Object.entries(forjas)) {
    const root = baselined();
    mkdirSync(join(root, ".context/runtime"), { recursive: true });
    let texto = conteudo;
    if (conteudo === "__COUNT__") {
      run(root); // grava o estado real para depois inflar a contagem
      const st = JSON.parse(readFileSync(streakPath(root), "utf8"));
      const k = st.keys["sess1:main"];
      for (const x of Object.keys(k)) k[x].n = 1e15;
      texto = JSON.stringify(st);
    }
    writeFileSync(streakPath(root), texto);
    const r = run(root);
    assert.equal(r.status, 0, `${nome}: ${r.stderr}`);
    assert.equal(JSON.parse(r.stdout).decision, "block", nome);
  }
});
test("integração: FIFO no lugar do estado → block em menos de 2 s extras", () => {
  const root = baselined();
  mkdirSync(join(root, ".context/runtime"), { recursive: true });
  spawnSync("mkfifo", [streakPath(root)]);
  const t0 = Date.now();
  const r = run(root);
  assert.equal(JSON.parse(r.stdout).decision, "block");
  assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0}ms`);
});
test("integração: symlink no estado e em .context/runtime → block, nada escrito pelo alvo", () => {
  const root = baselined();
  const alvo = tmp();
  mkdirSync(join(root, ".context/runtime"), { recursive: true });
  writeFileSync(join(alvo, "x.json"), '{"keys":{}}');
  symlinkSync(join(alvo, "x.json"), streakPath(root));
  assert.equal(JSON.parse(run(root).stdout).decision, "block");
  assert.equal(readFileSync(join(alvo, "x.json"), "utf8"), '{"keys":{}}');
  const root2 = baselined();
  symlinkSync(alvo, join(root2, ".context/runtime"));
  assert.equal(JSON.parse(run(root2).stdout).decision, "block");
  assert.deepEqual(readdirSync(alvo), ["x.json"]);
});

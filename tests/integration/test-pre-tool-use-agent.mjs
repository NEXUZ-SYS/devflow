// tests/integration/test-pre-tool-use-agent.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = new URL("../../hooks/pre-tool-use-agent", import.meta.url).pathname;

function fx({ models = "models:\n  enabled: true\n", phase = "C", sessionModel = "claude-opus-5-5" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ptu-agent-"));
  mkdirSync(join(dir, ".context/runtime/workflows"), { recursive: true });
  if (models !== null) writeFileSync(join(dir, ".context/.devflow.yaml"), models);
  if (phase) writeFileSync(join(dir, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { name: "x", current_phase: phase } } }));
  const tp = join(dir, "t.jsonl");
  writeFileSync(tp, [JSON.stringify({ type: "user", message: { content: "oi" } }), JSON.stringify({ type: "assistant", message: { model: sessionModel, content: [] } })].join("\n") + "\n");
  return { dir, tp };
}
function run(f, toolInput, env = {}, timeout = 8000) {
  const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: toolInput, cwd: f.dir, transcript_path: f.tp, session_id: "s" });
  const r = spawnSync("bash", [HOOK], { input, encoding: "utf8", timeout, env: { ...process.env, CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "", DEVFLOW_MODEL_ROUTING: "1", ...env } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

test("sem model → updatedInput com o alias da rota e TODOS os campos originais, sem permissionDecision", () => {
  const ti = { subagent_type: "general-purpose", prompt: "p", description: "d", run_in_background: false };
  const out = run(fx(), ti);
  const up = out.hookSpecificOutput.updatedInput;
  assert.equal(up.model, "haiku");
  for (const [k, v] of Object.entries(ti)) assert.deepEqual(up[k], v, k);
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
});

test("sem prevc.json (fase nula): general-purpose sem model é roteado pelo default do agente", () => {
  const out = run(fx({ phase: null }), { subagent_type: "general-purpose", prompt: "p" });
  assert.equal(out.hookSpecificOutput.updatedInput.model, "sonnet");
  assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
});

test("model explícito dentro do teto → intocado", () => {
  assert.equal(run(fx(), { subagent_type: "general-purpose", prompt: "p", model: "sonnet" }), null);
});

test("teto do transcript: sessão sonnet + architect → intocado (herda sonnet; nunca opus)", () => {
  assert.equal(run(fx({ sessionModel: "claude-sonnet-5-5", phase: "E" }), { subagent_type: "devflow:architect", prompt: "p" }), null);
});

test("model explícito acima do teto → rebaixado para o alias do teto", () => {
  const out = run(fx({ sessionModel: "claude-sonnet-5-5" }), { subagent_type: "general-purpose", prompt: "p", model: "opus" });
  assert.equal(out.hookSpecificOutput.updatedInput.model, "sonnet");
});

test("sem opt-in do usuário, repo sem models, mod ativo, tipo não roteável ou transcript ausente → vazio", () => {
  assert.equal(run(fx(), { subagent_type: "general-purpose", prompt: "p" }, { DEVFLOW_MODEL_ROUTING: "" }), null);
  assert.equal(run(fx({ models: "" }), { subagent_type: "general-purpose", prompt: "p" }), null);
  assert.equal(run(fx(), { subagent_type: "general-purpose", prompt: "p" }, { CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" }), null);
  assert.equal(run(fx(), { subagent_type: "Explore", prompt: "p" }), null);
  const f = fx(); f.tp = join(f.dir, "nao-existe.jsonl");
  assert.equal(run(f, { subagent_type: "general-purpose", prompt: "p" }), null);
});

test(".devflow.yaml como /dev/zero, FIFO ou transcript FIFO: sai rápido e vazio (segurança 1, Review Focus 1)", () => {
  const z = fx({ models: null });
  symlinkSync("/dev/zero", join(z.dir, ".context/.devflow.yaml"));
  const t0 = Date.now();
  assert.equal(run(z, { subagent_type: "general-purpose", prompt: "p" }, {}, 4000), null);
  const fifo = fx({ models: null });
  execFileSync("mkfifo", [join(fifo.dir, ".context/.devflow.yaml")]);
  assert.equal(run(fifo, { subagent_type: "general-purpose", prompt: "p" }, {}, 4000), null);
  const tf = fx();
  tf.tp = join(tf.dir, "t.fifo");
  execFileSync("mkfifo", [tf.tp]);
  assert.equal(run(tf, { subagent_type: "general-purpose", prompt: "p" }, {}, 4000), null);
  assert.ok(Date.now() - t0 < 6000);
});

test("bytes C0 no prompt não quebram o JSON", () => {
  const out = run(fx(), { subagent_type: "general-purpose", prompt: "a\u0001b\u001fc" });
  assert.equal(out.hookSpecificOutput.updatedInput.prompt, "a\u0001b\u001fc");
});

test("stdin inválido → vazio, exit 0", () => {
  const r = spawnSync("bash", [HOOK], { input: "{lixo", encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("fix1: function hooks ligado em qualquer grafia aceita pelo Claude Code → vazio", () => {
  for (const v of ["true", "yes", "on", "TRUE", " On ", "1"]) {
    assert.equal(run(fx(), { subagent_type: "general-purpose", prompt: "p" }, { CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: v }), null, v);
  }
});

test("fix1: .context symlink de diretório para fora da raiz → vazio", () => {
  const f = fx({ models: null });
  const fora = mkdtempSync(join(tmpdir(), "ptu-fora-"));
  writeFileSync(join(fora, ".devflow.yaml"), "models:\n  enabled: true\n");
  rmSync(join(f.dir, ".context"), { recursive: true });
  symlinkSync(fora, join(f.dir, ".context"));
  assert.equal(run(f, { subagent_type: "general-purpose", prompt: "p" }), null);
});

test("fix1: prevc.json FIFO ou symlink para /dev/zero → não trava; /dev/tty como config → vazio", () => {
  const t0 = Date.now();
  const a = fx({ phase: null });
  execFileSync("mkfifo", [join(a.dir, ".context/runtime/workflows/prevc.json")]);
  run(a, { subagent_type: "general-purpose", prompt: "p" }, {}, 4000);
  const b = fx({ phase: null });
  symlinkSync("/dev/zero", join(b.dir, ".context/runtime/workflows/prevc.json"));
  run(b, { subagent_type: "general-purpose", prompt: "p" }, {}, 4000);
  const c = fx({ models: null });
  symlinkSync("/dev/tty", join(c.dir, ".context/.devflow.yaml"));
  assert.equal(run(c, { subagent_type: "general-purpose", prompt: "p" }, {}, 4000), null);
  assert.ok(Date.now() - t0 < 4000);
});

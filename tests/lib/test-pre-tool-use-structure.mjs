// tests/lib/test-pre-tool-use-structure.mjs — toda decisão do pre-tool-use sai por emit_decision.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const lines = readFileSync("hooks/pre-tool-use", "utf8").split("\n");
const start = lines.findIndex(l => /^emit_decision\(\) \{\s*$/.test(l));
const end = lines.findIndex((l, i) => i > start && /^\}\s*$/.test(l));

test("emit_decision existe", () => {
  assert.ok(start >= 0 && end > start, "função emit_decision não encontrada");
});

test("nenhum JSON de decisão é montado fora de emit_decision", () => {
  lines.forEach((l, i) => {
    if (i >= start && i <= end) return;
    assert.doesNotMatch(l, /permissionDecision|hookSpecificOutput/, `linha ${i + 1}: ${l}`);
  });
});

test("não sobra escape_for_json à mão", () => {
  assert.ok(!lines.some(l => /escape_for_json/.test(l)));
});

test("otel-cli nunca escreve no stdout do hook", () => {
  lines.forEach((l, i) => {
    if (/otel-cli\.mjs/.test(l)) assert.match(l, />\/dev\/null 2>&1/, `linha ${i + 1}`);
  });
});

test("o trap de EXIT entrega o contexto nos caminhos de allow", () => {
  assert.ok(lines.some(l => /^trap flush_context EXIT/.test(l)));
});

// O programa python de emit_decision, extraído do hook, para testar o corte sem montar
// um projeto: o limite do Claude Code é medido em unidades UTF-16, não em code points.
function emitProgram() {
  const src = lines.slice(start, end + 1).join("\n");
  const m = src.match(/python3 -c '\n([\s\S]*?)\n' 2>\/dev\/null\)/);
  assert.ok(m, "programa python de emit_decision não encontrado");
  return m[1];
}
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

for (const [name, ctx] of [
  ["emojis (2 unidades por code point)", "😀".repeat(6000)],
  // Nota de truncamento = 76 unidades → corte na unidade 8924; 8913 "a" + emojis põe o
  // corte na 11ª unidade dos emojis, isto é, entre as duas metades de um par.
  ["emoji na borda do corte (par partido)", "a".repeat(8913) + "😀".repeat(200)],
  ["ASCII", "x".repeat(20000)],
]) {
  test(`emit_decision corta em ≤ 9000 unidades UTF-16 sem partir par substituto: ${name}`, () => {
    const r = spawnSync("python3", ["-c", emitProgram()], {
      input: ctx, encoding: "utf8", env: { ...process.env, DEVFLOW_DECISION: "context" },
    });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.ok(out.length <= 9000, `tamanho UTF-16 ${out.length}`);
    assert.ok(out.length > 8800, `cortou demais: ${out.length}`);
    assert.doesNotMatch(out, LONE);
    assert.match(out, /contexto truncado/);
  });
}

test("emit_decision não mexe em contexto que cabe", () => {
  const ctx = "😀".repeat(4500); // 9000 unidades exatas
  const r = spawnSync("python3", ["-c", emitProgram()], {
    input: ctx, encoding: "utf8", env: { ...process.env, DEVFLOW_DECISION: "context" },
  });
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, ctx);
});

test("--mark só depois do printf em emit_decision, com decision=context e saída não vazia", () => {
  const marks = lines.map((l, i) => [l, i]).filter(([l]) => /pre-edit-context\.mjs.*--mark/.test(l));
  assert.equal(marks.length, 1, "esperava exatamente uma chamada --mark");
  const [l, i] = marks[0];
  assert.match(l, />\/dev\/null 2>&1/);
  assert.ok(i > start && i < end, "--mark fora de emit_decision");
  const printfAt = lines.findIndex((x, k) => k > start && k < end && /printf '%s\\n' "\$out"/.test(x));
  assert.ok(printfAt > 0 && printfAt < i, "--mark tem de vir depois do printf da saída");
  const guard = lines.slice(printfAt, i + 1).join("\n");
  assert.match(guard, /\$decision" = "context"/);
  assert.match(guard, /-n "\$out"/);
});

test("a saída do pre-edit-context é capturada em variável, nunca vai direto ao stdout", () => {
  lines.forEach((l, i) => {
    if (/pre-edit-context\.mjs/.test(l) && !/--mark|--clear/.test(l)) {
      assert.match(l, /^\s*[A-Z_]+=\$\(/, `linha ${i + 1}: ${l}`);
    }
  });
});

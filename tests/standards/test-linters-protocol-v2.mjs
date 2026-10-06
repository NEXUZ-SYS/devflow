// tests/standards/test-linters-protocol-v2.mjs
// Conformidade do protocolo v2 (ADR-007 v3.1.0) dos 17 linters default de regra única:
// uma linha por ocorrência → "VIOLATION <ruleId> <arquivo>:<linha> <mensagem>".
//
// Cada caso roda o linter com caminho RELATIVO e cwd na própria pasta da fixture —
// replica exatamente como o engine invoca o linter (T6: caminho relativo ao projeto +
// cwd no projeto). Isso não é só estilo: se a fixture fosse invocada pelo caminho
// ABSOLUTO dentro de tests/fixtures/…, o GATE de exclusão do std-observability
// (que exclui qualquer caminho com segmento tests?/) mataria o teste em falso-verde.
// C5: mapa stdId → fixture (não derivado do nome do arquivo) — a fixture de
// std-layer-boundaries precisa da própria árvore src/domain/ para o GATE de path
// (exige um segmento "src/") não virar no-op.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { runLintersFor } from "../../scripts/lib/run-linter.mjs";

const MACHINE = resolve(import.meta.dirname, "../../assets/standards/machine");
const FIX = resolve(import.meta.dirname, "../fixtures/linters-v2");

const V2_RE = /^VIOLATION ([a-z0-9-]+) (.+?):(\d+) (.+)$/;

// stdId -> { path relativo dentro da própria pasta-fixture (usada como cwd), linha esperada }
const FIXTURES = {
  "std-api-conventions": { path: "a.bad.ts", line: 2 },
  "std-data-modeling": { path: "a.bad.sql", line: 3 },
  "std-documentation": { path: "a.bad.ts", line: 1 },
  "std-domain-events": { path: "a.bad.ts", line: 2 },
  "std-error-handling": { path: "a.bad.ts", line: 2 },
  "std-internationalization": { path: "a.bad.tsx", line: 1 },
  "std-layer-boundaries": { path: "src/domain/a.bad.ts", line: 1 },
  "std-migration": { path: "a.bad.sql", line: 1 },
  "std-naming-conventions": { path: "a.bad.ts", line: 1 },
  "std-observability": { path: "a.bad.ts", line: 2 },
  "std-performance": { path: "a.bad.ts", line: 1 },
  "std-runtime-validation": { path: "a.bad.ts", line: 1 },
  "std-schemas": { path: "a.bad.ts", line: 1 },
  "std-secret-conventions": { path: "a.bad.ts", line: 1 },
  "std-security": { path: "a.bad.ts", line: 1 },
  "std-test-discipline": { path: "a.bad.ts", line: 1 },
  "std-typescript-strict": { path: "a.bad.ts", line: 1 },
};

for (const [stdId, { path: relPath, line: expectedLine }] of Object.entries(FIXTURES)) {
  test(`${stdId}: protocolo v2 (caminho relativo + cwd na fixture, como o engine chama)`, () => {
    const cwd = resolve(FIX, stdId);
    const linter = resolve(MACHINE, `${stdId}.js`);
    const r = spawnSync("node", [linter, relPath], { cwd, encoding: "utf8" });
    const lines = r.stdout.split("\n").filter(Boolean);
    assert.ok(lines.length > 0, `fixture deveria violar: stdout=${JSON.stringify(r.stdout)} stderr=${r.stderr}`);
    assert.equal(r.status, 1);
    const ruleId = stdId.replace(/^std-/, "");
    for (const l of lines) {
      const m = l.match(V2_RE);
      assert.ok(m, `linha fora do protocolo v2: ${l}`);
      assert.equal(m[1], ruleId, `ruleId esperado '${ruleId}': ${l}`);
      assert.equal(m[2], relPath, `path deveria ecoar argv[2] tal como recebido (relativo): ${l}`);
      assert.ok(Number(m[3]) >= 1, `linha deveria ser >=1: ${l}`);
    }
    assert.ok(
      lines.some(l => Number(l.match(V2_RE)[3]) === expectedLine),
      `esperava alguma ocorrência na linha ${expectedLine}: ${r.stdout}`
    );
  });
}

test("std-observability: caminho relativo 'scripts/x.ts' é excluído (fix C4 do GATE)", () => {
  // Regressão: com a forma antiga do GATE ([\\/](scripts|...)[\\/]), um caminho
  // RELATIVO como "scripts/a.bad.ts" (sem separador antes de "scripts") NÃO era
  // excluído — falso-positivo em código de build/scripts. A fixture-irmã sem o
  // prefixo scripts/ (mesmo conteúdo) violaria normalmente (provado no loop acima).
  const linter = resolve(MACHINE, "std-observability.js");
  const cwd = resolve(FIX, "std-observability");
  const r = spawnSync("node", [linter, "scripts/a.bad.ts"], { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `esperava exclusão (exit 0): stdout=${r.stdout}`);
  assert.equal(r.stdout.trim(), "", `não deveria emitir VIOLATION em scripts/: ${r.stdout}`);
});

test("hook async (runLintersFor) continua vendo violação v2 (T6: hasViolation aceita espaço)", async () => {
  const path = "tests/fixtures/linters-v2/std-data-modeling/a.bad.sql";
  const r = await runLintersFor({ tool: "Write", path }, process.cwd(), process.cwd());
  assert.ok(
    r.violations.some(v => v.id === "std-data-modeling"),
    `esperava violação de std-data-modeling: ${JSON.stringify(r)}`
  );
});

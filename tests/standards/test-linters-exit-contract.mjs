// tests/standards/test-linters-exit-contract.mjs — contrato de saída (ADR-015 D4) dos 20 linters.
//
// Duas seções:
//  1) Contrato genérico: para todos os 20 linters (17 v2 + 3 legado estruturado), com
//     entradas adversariais (inexistente, vazio por extensão, binário) — exit 0 sem
//     VIOLATION = limpo; exit 0/1 com VIOLATION = achado; qualquer outra coisa = erro.
//  2) Contrato v2 ESTRITO (R7): para os 17 linters de regra única, rodando a fixture
//     REAL que viola (tests/fixtures/linters-v2/<std>/a.bad.<ext>) e exigindo que a
//     saída seja não só "tem a palavra VIOLATION" mas o protocolo v2 completo
//     ("VIOLATION <ruleId> <path>:<linha> <msg>"). Esta seção É a prova de RED: na
//     base anterior a esta task, os 17 emitiam "VIOLATION: N problema(s)... em <path>."
//     (formato legado, sem ruleId/linha) — as 17 asserções desta seção falhavam na
//     base (e std-layer-boundaries falhava ainda pior: exit 0 sem VIOLATION nenhuma,
//     por causa do GATE de path relativo, C4). Depois da migração (Step 4), passam.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MACHINE = "assets/standards/machine";
const EXTS = [".ts", ".tsx", ".js", ".py", ".sql", ".md", ".json", ".yaml", ".css", ".html"];
const dir = mkdtempSync(join(tmpdir(), "exit-"));
const inputs = [join(dir, "nao-existe.ts")];
for (const e of EXTS) { const p = join(dir, `vazio${e}`); writeFileSync(p, ""); inputs.push(p); }
const bin = join(dir, "bin.ts"); writeFileSync(bin, Buffer.from([0, 255, 1, 2, 0x0a])); inputs.push(bin);

for (const f of readdirSync(MACHINE).filter(n => /^std-.*\.js$/.test(n))) {
  test(`${f}: só 0 limpo ou 0/1 com VIOLATION`, () => {
    for (const input of inputs) {
      const r = spawnSync("node", [join(MACHINE, f), input], { encoding: "utf8" });
      const viol = /^VIOLATION[ :]/m.test(r.stdout);
      const ok = (r.status === 0 && (!r.stdout.trim() || viol)) || (r.status === 1 && viol);
      assert.ok(ok, `${input}: exit ${r.status} stdout=${r.stdout.slice(0, 80)} stderr=${r.stderr.slice(0, 80)}`);
    }
  });
}

// Seção 2 — contrato v2 estrito (R7): prova de RED→GREEN.
const FIX = resolve(import.meta.dirname, "../fixtures/linters-v2");
const V2_RE = /^VIOLATION [a-z0-9-]+ .+?:\d+ .+$/m;
const SINGLE_RULE_FIXTURES = {
  "std-api-conventions": "a.bad.ts",
  "std-data-modeling": "a.bad.sql",
  "std-documentation": "a.bad.ts",
  "std-domain-events": "a.bad.ts",
  "std-error-handling": "a.bad.ts",
  "std-internationalization": "a.bad.tsx",
  "std-layer-boundaries": "src/domain/a.bad.ts",
  "std-migration": "a.bad.sql",
  "std-naming-conventions": "a.bad.ts",
  "std-observability": "a.bad.ts",
  "std-performance": "a.bad.ts",
  "std-runtime-validation": "a.bad.ts",
  "std-schemas": "a.bad.ts",
  "std-secret-conventions": "a.bad.ts",
  "std-security": "a.bad.ts",
  "std-test-discipline": "a.bad.ts",
  "std-typescript-strict": "a.bad.ts",
};

for (const [stdId, relPath] of Object.entries(SINGLE_RULE_FIXTURES)) {
  test(`${stdId}: contrato v2 estrito na fixture violadora (exit 1 + "VIOLATION <ruleId> <path>:<linha> <msg>")`, () => {
    const cwd = resolve(FIX, stdId);
    const linter = resolve(process.cwd(), MACHINE, `${stdId}.js`);
    const r = spawnSync("node", [linter, relPath], { cwd, encoding: "utf8" });
    assert.equal(r.status, 1, `esperava exit 1: stdout=${r.stdout} stderr=${r.stderr}`);
    assert.match(r.stdout, V2_RE, `esperava protocolo v2 completo (ruleId + path:linha), não só a palavra VIOLATION: ${JSON.stringify(r.stdout)}`);
  });
}

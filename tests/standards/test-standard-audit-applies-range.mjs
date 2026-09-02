// Suite — S8: faixa de versão pertence a standard de PERFIL, nunca a default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditStandard } from "../../scripts/lib/standard-audit.mjs";

function writeStd(fields, body = "# Standard\n\n## Princípios\n\nCorpo real.\n") {
  const dir = mkdtempSync(join(tmpdir(), "std-range-"));
  const stdDir = join(dir, ".context", "engineering", "standards");
  mkdirSync(stdDir, { recursive: true });
  const fm = Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const p = join(stdDir, `${fields.id}.md`);
  writeFileSync(p, `---\n${fm}\n---\n\n${body}`);
  return { projectRoot: dir, stdPath: p, cleanup: () => rmSync(dir, { recursive: true }) };
}

const BASE = {
  description: "fixture",
  version: "1.0.0",
  applyTo: '["**/*.js"]',
  enforcement: "\n  linter: null",
  weakStandardWarning: "true",
};

test("S8: standard default com appliesFrom é REPROVADO", () => {
  const f = writeStd({ id: "std-security", source: "devflow-default", appliesFrom: '"16"', ...BASE });
  const r = auditStandard(f.stdPath, f.projectRoot);
  const s8 = r.checks.find((c) => c.id === "S8");
  assert.ok(s8, "check S8 deve existir");
  assert.equal(s8.status, "FAIL");
  assert.match(s8.diagnosis, /não pertence a framework nenhum/);
  f.cleanup();
});

test("S8: standard de perfil com appliesFrom PASSA", () => {
  const f = writeStd({ id: "std-odoo-owl-patterns", source: "profile:odoo", appliesFrom: '"16"', ...BASE });
  const r = auditStandard(f.stdPath, f.projectRoot);
  assert.equal(r.checks.find((c) => c.id === "S8").status, "PASS");
  f.cleanup();
});

test("S8: retrocompat — standard default SEM faixa passa (os 26 de hoje)", () => {
  const f = writeStd({ id: "std-security", source: "devflow-default", ...BASE });
  const r = auditStandard(f.stdPath, f.projectRoot);
  assert.equal(r.checks.find((c) => c.id === "S8").status, "PASS");
  f.cleanup();
});

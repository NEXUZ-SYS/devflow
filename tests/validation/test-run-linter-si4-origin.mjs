/**
 * TG1 — SI-4 origin-aware resolution (security core).
 * Run: node --test tests/validation/test-run-linter-si4-origin.mjs
 *
 * TDD RED-first: estes testes definem o contrato de segurança ANTES da impl.
 * `resolveAndCheckSandbox` passa a aceitar { projectRoot, pluginRoot, origin } e
 * escolher base + allowlist root pela ORIGEM carimbada pelo loader:
 *   - origin "project" (e undefined p/ retrocompat) → base <projectRoot>/.context,
 *     allowlist .context/engineering/standards/machine (+legacy)
 *   - origin "default" → base <pluginRoot>/assets/standards,
 *     allowlist <pluginRoot>/assets/standards/machine
 *
 * Contratos de segurança fixados aqui (R3/S1, R4/S2, R7/S5, R9/S7):
 *   S1  origin fora de {project,default} → fail-closed (ok:false)
 *   S2  linter que resolve fora do allowlist (traversal) → rejeitado, AMBOS roots
 *   S5  symlink no machine/ do plugin que escapa via realpath → rejeitado
 *   S7  origin "default" sem pluginRoot → fail-closed (não resolve em .context)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveAndCheckSandbox } from "../../scripts/lib/run-linter.mjs";

let project, plugin, outside;

before(() => {
  // Projeto fake com um linter project-side no caminho canônico.
  project = mkdtempSync(join(tmpdir(), "si4-proj-"));
  const projMachine = join(project, ".context/engineering/standards/machine");
  mkdirSync(projMachine, { recursive: true });
  writeFileSync(join(projMachine, "std-proj.js"), "process.exit(0);\n");

  // Plugin fake com um linter default bundlado.
  plugin = mkdtempSync(join(tmpdir(), "si4-plugin-"));
  const plugMachine = join(plugin, "assets/standards/machine");
  mkdirSync(plugMachine, { recursive: true });
  writeFileSync(join(plugMachine, "std-def.js"), "process.exit(0);\n");

  // Alvo fora de qualquer allowlist (para symlink-escape).
  outside = mkdtempSync(join(tmpdir(), "si4-out-"));
  writeFileSync(join(outside, "evil.js"), "process.exit(0);\n");
});

after(() => {
  for (const d of [project, plugin, outside]) if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
});

describe("TG1 — SI-4 resolveAndCheckSandbox origin-aware", () => {
  it("project origin: resolve no .context/.../machine (retrocompat)", () => {
    const r = resolveAndCheckSandbox("engineering/standards/machine/std-proj.js",
      { projectRoot: project, pluginRoot: plugin, origin: "project" });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.real, resolve(project, ".context/engineering/standards/machine/std-proj.js"));
  });

  it("origin undefined trata como project (retrocompat)", () => {
    const r = resolveAndCheckSandbox("engineering/standards/machine/std-proj.js",
      { projectRoot: project, pluginRoot: plugin });
    assert.equal(r.ok, true, JSON.stringify(r));
  });

  it("default origin: resolve no <plugin>/assets/standards/machine", () => {
    const r = resolveAndCheckSandbox("machine/std-def.js",
      { projectRoot: project, pluginRoot: plugin, origin: "default" });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.real, resolve(plugin, "assets/standards/machine/std-def.js"));
  });

  it("S7: default sem pluginRoot → fail-closed (não resolve em .context)", () => {
    const r = resolveAndCheckSandbox("machine/std-def.js",
      { projectRoot: project, pluginRoot: undefined, origin: "default" });
    assert.equal(r.ok, false, "default sem pluginRoot deve falhar fechado");
  });

  it("S1: origin desconhecido → fail-closed", () => {
    const r = resolveAndCheckSandbox("machine/std-def.js",
      { projectRoot: project, pluginRoot: plugin, origin: "evil" });
    assert.equal(r.ok, false, "origin fora de {project,default} deve falhar fechado");
  });

  it("S2: traversal escapa o allowlist do plugin → rejeitado", () => {
    // resolve(plugin, 'assets/standards', '../../evil.js') sai do machine/ → bloqueado
    const r = resolveAndCheckSandbox("../../evil.js",
      { projectRoot: project, pluginRoot: plugin, origin: "default" });
    assert.equal(r.ok, false, "linter fora do allowlist deve ser rejeitado");
  });

  it("S5: symlink no machine/ do plugin que escapa via realpath → rejeitado", () => {
    const link = join(plugin, "assets/standards/machine/std-link.js");
    symlinkSync(join(outside, "evil.js"), link);
    const r = resolveAndCheckSandbox("machine/std-link.js",
      { projectRoot: project, pluginRoot: plugin, origin: "default" });
    assert.equal(r.ok, false, "symlink que sai do allowlist deve ser rejeitado pelo realpath");
  });
});

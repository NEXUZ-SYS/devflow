/**
 * TG6 — eject --with-linter (R15) + null-out do linter no plain eject.
 * Run: node --test tests/validation/test-eject-with-linter.mjs
 *
 * Usa o PRÓPRIO plugin (REPO) como fonte: std-security é um default ENFORÇADO
 * (linter bundlado), std-grounding é warn-only (linter null).
 *
 *  AC1  plain eject de default enforçado → .md com enforcement.linter NULL
 *       (sem ref pendurada; não copia o machine file)
 *  AC2  --with-linter de default enforçado → copia o linter para o machine/ do
 *       projeto (byte-idêntico) + religa enforcement.linter no caminho CANÔNICO
 *       (engineering/standards/machine/std-<id>.js)
 *  AC3  --with-linter de default warn-only → scaffolda stub de linter + religa
 *  AC4  .md já existente sem --force → recusa
 *  AC5  o std ejetado com --with-linter ENFORÇA de verdade (origin project)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";
import { contextPaths } from "../../scripts/lib/context-paths.mjs";
import { runLintersFor } from "../../scripts/lib/run-linter.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const CLI = join(REPO, "scripts/devflow-standards.mjs");

let project;
const eject = (args) => spawnSync("node", [CLI, "eject", ...args, `--project=${project}`],
  { encoding: "utf-8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO } });

before(() => { project = mkdtempSync(join(tmpdir(), "tg6-")); });
after(() => { if (project && existsSync(project)) rmSync(project, { recursive: true, force: true }); });

function stdMd(id) { return join(contextPaths(project).standards, `std-${id}.md`); }
function stdLinter(id) { return join(contextPaths(project).standardsMachine, `std-${id}.js`); }

describe("TG6 — eject --with-linter + null-out no plain eject", () => {
  it("AC1: plain eject de default enforçado → linter NULL (sem ref pendurada)", () => {
    const r = eject(["security"]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(stdMd("security")), "std-security.md deve existir no projeto");
    const { data } = parseFrontmatter(readFileSync(stdMd("security"), "utf-8"));
    assert.equal(data.enforcement?.linter ?? null, null, "plain eject deve anular o linter (sem machine file)");
    assert.ok(!existsSync(stdLinter("security")), "plain eject NÃO deve criar o linter no projeto");
  });

  it("AC2: --with-linter de default enforçado → copia linter + caminho canônico", () => {
    const r = eject(["security", "--with-linter", "--force"]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(stdLinter("security")), "linter deve ser copiado para o machine/ do projeto");
    const copied = readFileSync(stdLinter("security"), "utf-8");
    const source = readFileSync(join(REPO, "assets/standards/machine/std-security.js"), "utf-8");
    assert.equal(copied, source, "linter copiado deve ser byte-idêntico ao bundlado");
    const { data } = parseFrontmatter(readFileSync(stdMd("security"), "utf-8"));
    assert.equal(data.enforcement?.linter, "engineering/standards/machine/std-security.js",
      "enforcement.linter deve apontar para o caminho canônico do projeto");
  });

  it("AC3: --with-linter de default warn-only → scaffolda stub + religa", () => {
    const r = eject(["grounding", "--with-linter"]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(stdLinter("grounding")), "stub de linter deve ser criado");
    const stub = readFileSync(stdLinter("grounding"), "utf-8");
    assert.match(stub, /process\.argv\[2\]/, "stub deve seguir o contrato SI-4 (lê argv[2])");
    const { data } = parseFrontmatter(readFileSync(stdMd("grounding"), "utf-8"));
    assert.equal(data.enforcement?.linter, "engineering/standards/machine/std-grounding.js");
  });

  it("AC4: .md já existente sem --force → recusa", () => {
    const r = eject(["security"]); // já ejetado em AC2 (com --force)
    assert.notEqual(r.status, 0, "deve recusar sobrescrever sem --force");
  });

  it("AC5: std ejetado com --with-linter ENFORÇA de verdade (origin project)", async () => {
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src/c.tsx"), "export const D = () => <div dangerouslySetInnerHTML={{__html:x}} />;\n");
    // SEM pluginRoot → só o std do PROJETO (ejetado em AC2) deve enforçar.
    const res = await runLintersFor({ tool: "Write", path: "src/c.tsx" }, project, undefined);
    assert.ok(res.violations.some(v => v.id === "std-security"),
      `std-security ejetado deve enforçar: ${JSON.stringify(res.violations)}`);
    assert.equal(res.rejected.length, 0, `SI-4 não deve rejeitar: ${JSON.stringify(res.rejected)}`);
  });
});

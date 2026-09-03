/**
 * Gate — a materialização na fiação: resolveArtifacts, o linter que EXECUTA,
 * idempotência, preservação de edição local e o opt-out.
 *
 * SAFETY: fixture copiado para tmpdir. Nenhum diretório rastreado é mutado.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { resolveArtifacts } from "../../scripts/lib/provenance-sync.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const FIX = join(REPO, "tests/fixtures/standards-materialize/odoo-py");
const CLI = join(REPO, "scripts/lib/provenance-sync.mjs");

function project(materialize) {
  const root = mkdtempSync(join(tmpdir(), "mat-wire-"));
  cpSync(FIX, root, { recursive: true });
  mkdirSync(join(root, ".context"), { recursive: true });
  if (materialize !== undefined) {
    writeFileSync(join(root, ".context/.devflow.yaml"), `standards:\n  materialize: ${materialize}\n`);
  }
  return root;
}

function apply(root) {
  return execFileSync("node", [CLI, "apply", `--project=${root}`, `--plugin=${REPO}`], { encoding: "utf-8" });
}

describe("materialização na fiação do provenance-sync", () => {
  it("resolveArtifacts inclui os defaults quando materialize não é false", () => {
    const root = project(undefined);
    const arts = resolveArtifacts({ projectRoot: root, pluginRoot: REPO, baseSkills: [] });
    assert.ok(arts.some((a) => a.dest.endsWith("engineering/standards/std-security.md")));
    assert.ok(arts.some((a) => a.dest.endsWith("engineering/standards/machine/std-security.js")));
    rmSync(root, { recursive: true });
  });

  it("materialize: false é no-op limpo", () => {
    const root = project("false");
    const arts = resolveArtifacts({ projectRoot: root, pluginRoot: REPO, baseSkills: [] });
    assert.ok(!arts.some((a) => a.dest.includes("engineering/standards/std-")),
      "nenhum default materializado sob opt-out");
    rmSync(root, { recursive: true });
  });

  it("o linter materializado EXECUTA — prova que não veio com linter: null", () => {
    const root = project(undefined);
    apply(root);
    const md = readFileSync(join(root, ".context/engineering/standards/std-security.md"), "utf-8");
    assert.match(md, /linter: engineering\/standards\/machine\/std-security\.js/);
    assert.doesNotMatch(md, /linter:\s*null/);

    const linter = join(root, ".context/engineering/standards/machine/std-security.js");
    assert.ok(existsSync(linter), "o machine/ tem de existir no projeto");
    const target = join(root, "addons/m/models/model.py");
    let out = "";
    try { out = execFileSync("node", [linter, target], { encoding: "utf-8" }); }
    catch (e) { out = (e.stdout || "").toString() + (e.stderr || "").toString(); }
    assert.doesNotMatch(out, /Cannot find module/, "o linter roda de verdade a partir do projeto");
    rmSync(root, { recursive: true });
  });

  it("2ª passada é no-op e edição local é preservada", () => {
    const root = project(undefined);
    apply(root);
    const dest = join(root, ".context/engineering/standards/std-security.md");
    const after1 = readFileSync(dest, "utf-8");
    apply(root);
    assert.equal(readFileSync(dest, "utf-8"), after1, "2ª passada não reescreve");
    writeFileSync(dest, "EDITADO\n");
    apply(root);
    assert.equal(readFileSync(dest, "utf-8"), "EDITADO\n", "edição local é preservada");
    rmSync(root, { recursive: true });
  });

  it("standards.local.yaml disable: impede a materialização do id", () => {
    const root = project(undefined);
    mkdirSync(join(root, ".context"), { recursive: true });
    writeFileSync(join(root, ".context/standards.local.yaml"), "disable: [std-security]\n");
    apply(root);
    assert.ok(!existsSync(join(root, ".context/engineering/standards/std-security.md")),
      "id desabilitado não é escrito");
    rmSync(root, { recursive: true });
  });
});

describe("fiação dos skills e da rotina", () => {
  it("project-init não diz mais que os defaults não são scaffoldados", () => {
    const s = readFileSync(join(REPO, "skills/project-init/SKILL.md"), "utf-8");
    assert.doesNotMatch(s, /não precisam ser scaffoldados/);
    assert.match(s, /materializ/i);
  });

  it("context-sync menciona a materialização dos defaults", () => {
    const s = readFileSync(join(REPO, "skills/context-sync/SKILL.md"), "utf-8");
    assert.match(s, /materializ/i);
  });

  it("a rotina standards-materialize existe e é confirm", () => {
    const t = JSON.parse(readFileSync(join(REPO, "templates/routines.json"), "utf-8"));
    const r = t.routines.find((x) => x.id === "standards-materialize");
    assert.ok(r, "rotina deve existir no template");
    assert.equal(r.execution, "confirm", "escrever 17-26 arquivos nunca é silencioso");
    assert.equal(r.frequency, "7d");
  });
});

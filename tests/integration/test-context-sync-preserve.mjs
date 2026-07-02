// tests/integration/test-context-sync-preserve.mjs
// L1-gap-1 (context-sync): cobertura do caminho REAL que o context-sync usa —
// `node provenance-sync.mjs apply` — para a garantia anti-regressão-silenciosa:
// um artefato deployado que foi EDITADO LOCALMENTE deve ser PRESERVADO (não
// sobrescrito pelo default do plugin). O teste unit existente exercita a decisão
// e o applySync via Set injetado; ESTE exercita o CLI end-to-end (loadManifest +
// registry de known-hashes.json + applySync + report), que só tinha smoke de "added".
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = resolve(import.meta.dirname, "../..");
const CLI = join(REPO, "scripts", "lib", "provenance-sync.mjs");
const SKILL_REL = join(".context", "skills", "odoo-development", "SKILL.md");

describe("context-sync — preserva edição local (CLI apply, L1-gap-1)", () => {
  it("artefato editado localmente é PRESERVADO, não sobrescrito", () => {
    const proj = mkdtempSync(join(tmpdir(), "ctxsync-"));
    // Sinal de projeto Odoo → resolveArtifacts inclui a skill odoo-development.
    mkdirSync(join(proj, "addons", "x"), { recursive: true });
    writeFileSync(join(proj, "addons", "x", "__manifest__.py"), "{'name':'x'}");

    // Deploy local do artefato JÁ EDITADO pelo usuário (conteúdo custom que não
    // está em known-hashes.json nem num manifesto → decisão 'edited' → preserva).
    const dest = join(proj, SKILL_REL);
    mkdirSync(resolve(dest, ".."), { recursive: true });
    const EDITADO = "# SKILL editada localmente pelo usuário\nNÃO SOBRESCREVER.\n";
    writeFileSync(dest, EDITADO);

    let out;
    try {
      out = execFileSync("node", [CLI, "apply", `--project=${proj}`, `--plugin=${REPO}`], { encoding: "utf-8" });
    } catch (e) {
      out = (e.stdout || "") + (e.stderr || "");
    }
    const report = JSON.parse(out);

    // O arquivo editado deve constar como preservado e o conteúdo permanecer intacto.
    assert.ok(existsSync(dest), "arquivo deve continuar existindo");
    assert.equal(readFileSync(dest, "utf-8"), EDITADO, "conteúdo editado localmente NÃO pode ser sobrescrito");
    assert.ok(
      report.preserved.some(p => p.endsWith("odoo-development/SKILL.md")),
      `SKILL.md editada deveria estar em 'preserved'; report=${JSON.stringify(report)}`,
    );
    assert.ok(
      !report.updated.some(p => p.endsWith("odoo-development/SKILL.md")),
      "SKILL.md editada NÃO pode estar em 'updated'",
    );
  });
});

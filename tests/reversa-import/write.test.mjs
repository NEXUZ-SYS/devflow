// tests/reversa-import/write.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeArtifacts } from "../../scripts/reversa-import/write.mjs";

function fakeResult() {
  return {
    artifacts: {
      prd: "# PRD\n",
      adrs: [{ filename: "001-x-v1.0.0.md", body: "# ADR\n" }],
      plansJson: '{"active":[],"primary":null}',
      planSkeletons: [{ feature: "auth", body: "# Plano auth\n" }],
      stories: "stories:\n",
      fidelityReport: "# Fidelidade\n",
      manifest: '{"schema":1,"artifacts":[]}',
    },
    preservePlan: [],
  };
}

describe("writeArtifacts", () => {
  it("escreve PRD/plans/stories/ADRs/fidelity nos paths .context corretos", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-dest-"));
    try {
      writeArtifacts(fakeResult(), { destDir: dest });
      assert.ok(existsSync(join(dest, ".context", "plans")));
      assert.ok(existsSync(join(dest, ".context", "imported", "reversa", "fidelity-report.md")));
      assert.ok(existsSync(join(dest, ".context", "engineering", "adrs", "001-x-v1.0.0.md")));
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("re-import: NÃO sobrescreve arquivo editado à mão sem confirmação", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-dest2-"));
    const prdPath = join(dest, ".context", "plans", "crm-prd.md");
    mkdirSync(join(dest, ".context", "plans"), { recursive: true });
    writeFileSync(prdPath, "# EDITADO À MÃO\n");
    let asked = false;
    try {
      writeArtifacts(fakeResult(), {
        destDir: dest,
        prdFilename: "crm-prd.md",
        confirmOverwrite: () => { asked = true; return false; }, // usuário recusa
      });
      assert.equal(asked, true, "deve perguntar antes de sobrescrever");
      assert.equal(readFileSync(prdPath, "utf-8"), "# EDITADO À MÃO\n", "WIP preservado");
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("[segurança H1/H2] recusa alvo de escrita fora de .context/ (path traversal)", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-dest3-"));
    const evil = fakeResult();
    evil.artifacts.planSkeletons = [{ feature: "../../../../tmp/evil", body: "x" }]; // slug malicioso
    try {
      writeArtifacts(evil, { destDir: dest });
      // o alvo malicioso NÃO foi escrito fora do destino
      assert.ok(!existsSync("/tmp/evil.md"));
      assert.ok(!existsSync(join(dest, "..", "..", "..", "..", "tmp", "evil.md")));
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });

  it("[segurança H3] recusa copiar ref que é symlink (não segue link)", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-dest4-"));
    const srcDir = mkdtempSync(join(tmpdir(), "rev-src4-"));
    const secret = join(srcDir, "secret.txt");
    writeFileSync(secret, "SEGREDO");
    const link = join(srcDir, "spec.md");
    symlinkSync(secret, link); // spec.md → secret
    const r = fakeResult();
    r.preservePlan = [{ from: link, to: join(".context", "imported", "reversa", "auth", "spec.md"), feature: "auth" }];
    try {
      const out = writeArtifacts(r, { destDir: dest });
      const copied = join(dest, ".context", "imported", "reversa", "auth", "spec.md");
      assert.ok(!existsSync(copied), "symlink não deve ser copiado");
      assert.ok(out.log.some(([, s]) => s === "refused-symlink"));
    } finally {
      rmSync(dest, { recursive: true, force: true });
      rmSync(srcDir, { recursive: true, force: true });
    }
  });

  it("[segurança] cópia de preserve respeita confirmOverwrite (não apaga WIP)", () => {
    const dest = mkdtempSync(join(tmpdir(), "rev-dest5-"));
    const srcDir = mkdtempSync(join(tmpdir(), "rev-src5-"));
    writeFileSync(join(srcDir, "spec.md"), "NOVO DA FONTE");
    const to = join(dest, ".context", "imported", "reversa", "auth", "spec.md");
    mkdirSync(join(dest, ".context", "imported", "reversa", "auth"), { recursive: true });
    writeFileSync(to, "EDITADO À MÃO");
    const r = fakeResult();
    r.preservePlan = [{ from: join(srcDir, "spec.md"), to: join(".context", "imported", "reversa", "auth", "spec.md"), feature: "auth" }];
    try {
      writeArtifacts(r, { destDir: dest, confirmOverwrite: () => false });
      assert.equal(readFileSync(to, "utf-8"), "EDITADO À MÃO", "WIP de ref preservado");
    } finally {
      rmSync(dest, { recursive: true, force: true });
      rmSync(srcDir, { recursive: true, force: true });
    }
  });
});

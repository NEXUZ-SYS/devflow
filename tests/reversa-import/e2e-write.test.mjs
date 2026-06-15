// tests/reversa-import/e2e-write.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";
import { writeArtifacts } from "../../scripts/reversa-import/write.mjs";
import { readStories, getNextStory } from "../../scripts/runner-lib.mjs";
import { makeReversaFixture } from "./fixtures/make-fixture.mjs";

describe("e2e: import → escrita → estrutura DevFlow reconhecível", () => {
  it("escreve um .context/ que o runner real reconhece e executa", () => {
    const src = makeReversaFixture({ profile: "green" });
    const dest = mkdtempSync(join(tmpdir(), "rev-e2e-dest-"));
    try {
      const r = runPipeline({ sourceDir: src });
      const out = writeArtifacts(r, { destDir: dest, prdFilename: "imported-prd.md" });

      assert.ok(existsSync(join(dest, ".context", "plans", "imported-prd.md")));
      assert.ok(existsSync(join(dest, ".context", "workflow", "plans.json")));
      assert.ok(existsSync(join(dest, ".context", "workflow", "stories.yaml")));
      assert.ok(existsSync(join(dest, ".context", "imported", "reversa", "fidelity-report.md")));
      assert.ok(existsSync(join(dest, ".context", "imported", "reversa", "manifest.json")));

      // prova de "executável": o runner real parseia o stories.yaml escrito e escolhe a 1ª story
      const { stories, maxRetries } = readStories(join(dest, ".context", "workflow", "stories.yaml"));
      assert.ok(stories.length >= 1);
      const next = getNextStory(stories, maxRetries);
      assert.ok(next && next.id.startsWith("S"));

      // nenhuma escrita recusada por traversal
      assert.ok(!out.log.some(([, s]) => s === "refused-traversal"));

      // re-import idempotente: rodar de novo sem edição = nada muda (nada escrito)
      const second = writeArtifacts(r, { destDir: dest, prdFilename: "imported-prd.md", confirmOverwrite: () => { throw new Error("não deveria perguntar"); } });
      assert.ok(second.log.every(([, status]) => status === "unchanged"));
    } finally {
      rmSync(src, { recursive: true, force: true });
      rmSync(dest, { recursive: true, force: true });
    }
  });
});

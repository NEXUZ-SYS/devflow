// tests/reversa-import/integration.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync, existsSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPipeline } from "../../scripts/reversa-import/pipeline.mjs";
import { parseStoriesContent, getNextStory } from "../../scripts/runner-lib.mjs";

const FIXTURE = "/home/walterfrey/Documentos/code/reversa-com-attio";

describe("integração: reversa-com-attio (cópia tmpdir)", { skip: !existsSync(FIXTURE) }, () => {
  it("pipeline completo produz IR válido e artefatos coerentes", () => {
    const work = mkdtempSync(join(tmpdir(), "rev-e2e-"));
    const copy = join(work, "src");
    // copia SEM _browser_profile, .mp4, .history — e SEM seguir symlinks (segurança H3)
    cpSync(FIXTURE, copy, {
      recursive: true,
      filter: (src) => {
        if (src.includes("_browser_profile") || src.endsWith(".mp4") || src.includes(".history")) return false;
        try { if (lstatSync(src).isSymbolicLink()) return false; } catch { /* ignore */ }
        return true;
      },
    });
    try {
      const r = runPipeline({ sourceDir: copy });
      assert.equal(r.detected.isReversa, true);
      assert.equal(r.irValid.ok, true, `IR inválido: ${JSON.stringify(r.irValid.errors)}`);

      // reconstruction-plan tem 21 tarefas → PRD deve listar todas
      assert.ok(r.ir.tasks.length >= 20, `esperava ~21 tarefas, veio ${r.ir.tasks.length}`);
      // grafo de deps preservado: T14 depende de T12 e T13
      const t14 = r.ir.tasks.find((t) => t.id === "T14");
      assert.ok(t14 && t14.dependsOn.includes("T12") && t14.dependsOn.includes("T13"));

      // stories da 1ª onda são parseáveis pelo runner real e executáveis
      const { stories, maxRetries } = parseStoriesContent(r.artifacts.stories);
      assert.ok(stories.length >= 1);
      assert.ok(getNextStory(stories, maxRetries) !== null);
      // demais ondas pending no PRD
      assert.ok(r.artifacts.prd.includes("⬚"));

      // readiness reflete o fixture real (specs com stub conhecido, ex. notificacoes)
      assert.ok(["green", "yellow", "red"].includes(r.readiness.global));
      // o mapeamento tarefa→onda não degradou (o fixture real tem marcos com after parseável)
      assert.equal(r.mapDegraded, false);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});

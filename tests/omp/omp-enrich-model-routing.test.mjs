import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enrichProjectAgents } from "../../scripts/lib/omp-enrich-project-agents.mjs";

function project(models) {
  const root = mkdtempSync(join(tmpdir(), "omp-routing-"));
  mkdirSync(join(root, ".context/agents"), { recursive: true });
  for (const a of ["architect", "documentation-writer", "code-reviewer"])
    writeFileSync(join(root, ".context/agents", `${a}.md`), `---\nname: ${a}\n---\n# ${a}\n`);
  if (models !== null) writeFileSync(join(root, ".context/.devflow.yaml"), models);
  return root;
}
const fm = (root, a) => readFileSync(join(root, ".context/agents", `${a}.md`), "utf8");
function withOptIn(value, fn) {
  const old = process.env.DEVFLOW_MODEL_ROUTING;
  if (value === undefined) delete process.env.DEVFLOW_MODEL_ROUTING; else process.env.DEVFLOW_MODEL_ROUTING = value;
  try { fn(); } finally { if (old === undefined) delete process.env.DEVFLOW_MODEL_ROUTING; else process.env.DEVFLOW_MODEL_ROUTING = old; }
}

test("roteamento efetivo: rebaixa abaixo do role de hoje; role fora da escada não é tocado", () => {
  withOptIn("1", () => {
    const root = project("models:\n  enabled: true\n");
    enrichProjectAgents(root);
    assert.match(fm(root, "architect"), /model: pi\/slow/, "pi/plan (top) → pi/slow (capable)");
    assert.match(fm(root, "architect"), /thinking-level: high/);
    assert.match(fm(root, "documentation-writer"), /model: commit/, "'commit' não é tier: teto ilegível → não roteia (D5)");
  });
});

test("override do projeto nunca sobe acima do role de hoje (segurança 2)", () => {
  withOptIn("1", () => {
    const root = project("models:\n  enabled: true\n  overrides:\n    agents:\n      code-reviewer:\n        tier: top\n      documentation-writer:\n        tier: top\n");
    enrichProjectAgents(root);
    assert.match(fm(root, "code-reviewer"), /model: pi\/slow/, "teto = pi/slow (role de hoje)");
    assert.doesNotMatch(fm(root, "documentation-writer"), /pi\/plan/);
  });
});

test("maxTier limita o role", () => {
  withOptIn("1", () => {
    const root = project("models:\n  enabled: true\n  maxTier: cheap\n");
    enrichProjectAgents(root);
    assert.match(fm(root, "architect"), /model: pi\/smol/);
  });
});

test("sem opt-in do usuário, sem models ou .devflow.yaml hostil: igual ao comportamento atual", () => {
  const ref = project(null);
  enrichProjectAgents(ref);
  for (const [models, optIn] of [["models:\n  enabled: true\n", undefined], ["git:\n  strategy: x\n", "1"]]) {
    withOptIn(optIn, () => {
      const p = project(models);
      enrichProjectAgents(p);
      assert.equal(fm(p, "architect"), fm(ref, "architect"));
    });
  }
  withOptIn("1", () => {
    const z = project(null);
    symlinkSync("/dev/zero", join(z, ".context/.devflow.yaml"));
    enrichProjectAgents(z);
    assert.equal(fm(z, "architect"), fm(ref, "architect"));
  });
});

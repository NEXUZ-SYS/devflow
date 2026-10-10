// tests/skills/test-prevc-review-evidence-contract.mjs — o exemplo de review: que a prevc-review manda
// gravar tem que passar no coletor real do gate (D5). Contrato, não checagem de texto.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planFacts } from "../../scripts/lib/phase-gate.mjs";
import { evaluateTransition } from "../../scripts/lib/phase-evidence.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("o review: da skill prevc-review abre a saída da fase R no gate", () => {
  const skill = fs.readFileSync(path.join(REPO, "skills/prevc-review/SKILL.md"), "utf8");
  const m = skill.match(/<!-- review-frontmatter -->\s*```yaml\n([\s\S]*?)```/);
  assert.ok(m, "a skill precisa do bloco marcado <!-- review-frontmatter -->");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "review-contract-"));
  fs.mkdirSync(path.join(root, ".context/runtime/workflows"), { recursive: true });
  fs.mkdirSync(path.join(root, ".context/plans"), { recursive: true });
  fs.writeFileSync(path.join(root, ".context/runtime/workflows/plans.json"), JSON.stringify({ active: [{ slug: "x", path: "plans/x.md" }], primary: "x" }));
  fs.writeFileSync(path.join(root, ".context/plans/x.md"), `---\ntype: plan\n${m[1]}---\n# Plano\n`);
  const r = evaluateTransition("R", { plan: planFacts(root, { status: { project: {} } }) });
  assert.deepEqual(r.missing, []);
});

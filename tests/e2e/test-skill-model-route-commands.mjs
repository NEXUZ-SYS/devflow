// tests/e2e/test-skill-model-route-commands.mjs — executa os comandos model-route que as skills mandam rodar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const SKILLS = ["skills/prevc-execution/SKILL.md", "skills/autonomous-loop/SKILL.md"];
const RE = /^\s*node "\$CLAUDE_PLUGIN_ROOT\/scripts\/model-route\.mjs" .+$/gm;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "skill-route-"));
  mkdirSync(join(dir, ".context/runtime/workflows"), { recursive: true });
  writeFileSync(join(dir, ".context/.devflow.yaml"), "models:\n  enabled: true\n");
  writeFileSync(join(dir, ".context/runtime/workflows/prevc.json"), JSON.stringify({ status: { project: { name: "x", current_phase: "E" } } }));
  writeFileSync(join(dir, "report.md"), "teste vermelho");
  return dir;
}

test("cada skill que roteia traz comandos model-route, sem --ceiling", () => {
  for (const s of SKILLS) {
    const cmds = readFileSync(join(ROOT, s), "utf8").match(RE) ?? [];
    assert.ok(cmds.length > 0, s);
    for (const c of cmds) assert.doesNotMatch(c, /--ceiling/, `${s}: ${c.trim()}`);
  }
  assert.match(readFileSync(join(ROOT, "skills/prevc-planning/SKILL.md"), "utf8"), /\*\*Tier:\*\* cheap \| standard \| capable/);
});

test("todos os comandos documentados executam e devolvem saída utilizável", () => {
  const dir = fixture();
  const vars = { AGENT: "general-purpose", TIER: "cheap", TASK_TIER: "standard", REPORT: join(dir, "report.md"),
    ANSWERS: JSON.stringify({ failure_is_capability: 0.9, claims_done_with_evidence: 0, is_stuck: 0, needed_tier: "standard" }) };
  for (const s of SKILLS) {
    for (const raw of readFileSync(join(ROOT, s), "utf8").match(RE)) {
      // 1) a raiz do plugin dentro do caminho; 2) cada "$VAR" (com as aspas) vira o valor entre aspas simples.
      const cmd = raw.trim()
        .replace(/\$CLAUDE_PLUGIN_ROOT/g, ROOT)
        .replace(/"\$\{?(\w+)\}?"/g, (m, v) => (vars[v] !== undefined ? `'${vars[v]}'` : m));
      const out = execSync(cmd, { cwd: dir, encoding: "utf8", shell: "/bin/bash", env: { ...process.env, DEVFLOW_MODEL_ROUTING: "1" } });
      assert.ok(out.trim().length > 0, `${s}: ${raw.trim()}`);
      if (/ resolve | --answers /.test(raw)) JSON.parse(out);
    }
  }
});

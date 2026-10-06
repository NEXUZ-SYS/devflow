// tests/integration/test-hook-shell-suite.mjs — roda os testes de hook em bash.
// Os tests/hooks/*.sh já rodam no sinal e2e (tests/run-e2e.sh enumera tests/**/test-*.sh),
// mas não no sinal integration, que enumera só .mjs. Esta suíte os faz contar também
// no sinal integration. Cada task que cria um .sh acrescenta aqui.
// Entram só os que passavam na linha de base da T1; test-pre-commit-version-check.sh
// falha na base (defeito pré-existente do version-guard, ver tests/.ci-skip.txt) e fica fora.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

export const SUITE = [
  "tests/hooks/test-pre-tool-use-json-property.sh",
  "tests/hooks/test-pre-tool-use-single-json.sh",
  "tests/hooks/test-pre-tool-use-knowledge.sh",
  "tests/hooks/test-pre-tool-use-pre-edit.sh",
  "tests/hooks/test-pre-tool-use-standards-guard.sh",
  "tests/hooks/test-pre-tool-use-ratchet.sh",
  // Linha de base da T1 (todos PASS antes da mudança):
  "tests/hooks/test-adr-context.sh",
  "tests/hooks/test-napkin-hooks.sh",
  "tests/hooks/test-no-node-e-interpolation.sh",
  "tests/hooks/test-post-merge-mempalace.sh",
  "tests/hooks/test-post-tool-use-config-golden.sh",
  "tests/hooks/test-post-tool-use-linter-rce.sh",
  "tests/hooks/test-post-tool-use-lint.sh",
  "tests/hooks/test-post-tool-use-nudge-v2.sh",
  "tests/hooks/test-post-tool-use-prevc-bypass.sh",
  "tests/hooks/test-post-tool-use.sh",
  "tests/hooks/test-pre-tool-use-config-guard.sh",
  "tests/hooks/test-pre-tool-use-git-bash.sh",
  "tests/hooks/test-pre-tool-use-grounding.sh",
  "tests/hooks/test-pre-tool-use-permissions.sh",
  "tests/hooks/test-pre-tool-use-protected-branches.sh",
  "tests/hooks/test-pre-tool-use-secret-deny.sh",
  "tests/hooks/test-pre-tool-use.sh",
  "tests/hooks/test-session-start-adr-dualread.sh",
  "tests/hooks/test-session-start-adr-missing-fields.sh",
  "tests/hooks/test-session-start-adr-v2.sh",
  "tests/hooks/test-session-start-checkup.sh",
  "tests/hooks/test-session-start-default-standards.sh",
  "tests/hooks/test-session-start-e2e.sh",
  "tests/hooks/test-session-start-grounding-mcp.sh",
  "tests/hooks/test-session-start-grounding.sh",
  "tests/hooks/test-session-start-knowledge-index.sh",
  "tests/hooks/test-session-start-norms.sh",
  "tests/hooks/test-session-start-omp-mcp-detection.sh",
  "tests/hooks/test-session-start-routines.sh",
  "tests/hooks/test-session-start.sh",
  "tests/hooks/test-adr-guardrails-parity.sh",
  "tests/hooks/test-subagent-start.sh",
];

// O teste de propriedade executa o hook centenas de vezes; os demais são curtos.
const TIMEOUT_MS = { "tests/hooks/test-pre-tool-use-json-property.sh": 480000 };

for (const f of SUITE) {
  const timeout = TIMEOUT_MS[f] ?? 240000;
  test(f, { timeout }, () => {
    const r = spawnSync("bash", [f], { encoding: "utf8", timeout });
    assert.equal(r.status, 0, `${f}\n${r.stdout}\n${r.stderr}`);
  });
}

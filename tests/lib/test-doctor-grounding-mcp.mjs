import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCheck } from "../../scripts/lib/doctor.mjs";

// Reproduz o .devflow.yaml real: comentário inline em AMBOS os campos.
const COM_COMENTARIO = `git:
  strategy: branch-flow

grounding:
  mode: docs-only        # docs-first | docs-only
  docsMcpServer: docs-mcp-server  # server canônico de documentação
  blockWeb: true
`;

function repo(yaml, mcpServers) {
  const d = mkdtempSync(join(tmpdir(), "dgm-"));
  mkdirSync(join(d, ".context"), { recursive: true });
  writeFileSync(join(d, ".context", ".devflow.yaml"), yaml);
  writeFileSync(join(d, ".mcp.json"), JSON.stringify({ mcpServers }, null, 2));
  return d;
}

const check = getCheck("grounding-mcp");
const ctx = (cwd) => ({ cwd, which: () => true, exec: () => ({ code: 0, stdout: "", stderr: "" }) });

test("o falso-positivo: comentário inline + server presente → OK", () => {
  const d = repo(COM_COMENTARIO, { "docs-mcp-server": { command: "x" }, dotcontext: { command: "y" } });
  const r = check.run(ctx(d));
  assert.equal(r.status, "OK", `esperava OK, veio ${r.status}: ${r.diagnosis}`);
});

test("o alerta legítimo sobrevive: server ausente → WARN", () => {
  const d = repo(COM_COMENTARIO, { dotcontext: { command: "y" } });
  const r = check.run(ctx(d));
  assert.equal(r.status, "WARN");
  assert.match(r.diagnosis, /docs-mcp-server/);
  assert.doesNotMatch(r.diagnosis, /#/, "o diagnóstico não pode exibir o comentário inline");
});

test("grounding desativado → OK (sem exigir MCP)", () => {
  const d = repo("grounding:\n  mode: off\n", {});
  const r = check.run(ctx(d));
  assert.equal(r.status, "OK");
});

test("sem seção grounding → OK", () => {
  const d = repo("git:\n  strategy: branch-flow\n", {});
  const r = check.run(ctx(d));
  assert.equal(r.status, "OK");
});

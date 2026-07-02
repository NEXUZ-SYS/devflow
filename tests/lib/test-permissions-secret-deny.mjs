// tests/lib/test-permissions-secret-deny.mjs
// ADV-7: default-deny de segredos aplicado sem opt-in — o baseline vale mesmo
// SEM permissions.yaml, e é mesclado (deny-first) quando há permissions.yaml
// que permita tudo. Nível unitário: loadPermissions + evaluatePermissions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPermissions, evaluatePermissions } from "../../scripts/lib/permissions-evaluator.mjs";

const SECRETS = [".env", ".env.local", "config/.env", "secrets/key.pem", "tls/server.key", "id_rsa", ".ssh/id_rsa", "home/.ssh/config"];
const NORMAL = ["src/app.ts", "README.md", "scripts/lib/foo.mjs", "docs/guide.md"];

test("ADV-7: sem permissions.yaml, segredos são negados por default (Read)", async () => {
  const root = mkdtempSync(join(tmpdir(), "perm-nofile-"));
  const cfg = loadPermissions(root);
  for (const p of SECRETS) {
    const d = await evaluatePermissions({ tool: "Read", path: p }, cfg);
    assert.equal(d.decision, "deny", `segredo '${p}' deveria ser deny`);
  }
});

test("ADV-7: arquivos comuns não são negados pelo baseline", async () => {
  const root = mkdtempSync(join(tmpdir(), "perm-nofile2-"));
  const cfg = loadPermissions(root);
  for (const p of NORMAL) {
    const d = await evaluatePermissions({ tool: "Read", path: p }, cfg);
    assert.notEqual(d.decision, "deny", `arquivo comum '${p}' não deveria ser deny (foi ${d.decision})`);
  }
});

test("ADV-7: Edit/Write de segredo também negado", async () => {
  const root = mkdtempSync(join(tmpdir(), "perm-nofile3-"));
  const cfg = loadPermissions(root);
  assert.equal((await evaluatePermissions({ tool: "Write", path: ".env" }, cfg)).decision, "deny");
  assert.equal((await evaluatePermissions({ tool: "Edit", path: "secrets/db.key" }, cfg)).decision, "deny");
});

test("ADV-7: baseline mesclado mesmo com permissions.yaml que permite tudo (deny-first)", async () => {
  const root = mkdtempSync(join(tmpdir(), "perm-file-"));
  mkdirSync(join(root, ".context"), { recursive: true });
  writeFileSync(join(root, ".context", "permissions.yaml"),
`spec: devflow-permissions/v0
evaluationOrder: [deny, allow, mode, callback]
deny:
  fs:
    - "**/*.forbidden"
  exec: []
  net: []
allow:
  fs:
    read:
      - "**/*"
    write:
      - "**/*"
  exec: []
  tool: []
mode: prompt
`);
  const cfg = loadPermissions(root);
  // O deny próprio do projeto continua valendo
  assert.equal((await evaluatePermissions({ tool: "Write", path: "x.forbidden" }, cfg)).decision, "deny");
  // Baseline de segredo vence mesmo com allow.fs '**/*' (deny-first)
  assert.equal((await evaluatePermissions({ tool: "Read", path: ".env" }, cfg)).decision, "deny");
  assert.equal((await evaluatePermissions({ tool: "Read", path: "secrets/api.pem" }, cfg)).decision, "deny");
  // Arquivo comum continua allow via allow.fs.read '**/*'
  assert.equal((await evaluatePermissions({ tool: "Read", path: "src/app.ts" }, cfg)).decision, "allow");
});

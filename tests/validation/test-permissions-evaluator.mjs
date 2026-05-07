#!/usr/bin/env node
// tests/validation/test-permissions-evaluator.mjs
// Unit tests for scripts/lib/permissions-evaluator.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePermissions,
  validatePermissionsSchema,
} from "../../scripts/lib/permissions-evaluator.mjs";

const BASE = {
  spec: "devflow-permissions/v0",
  evaluationOrder: ["deny", "allow", "mode", "callback"],
  deny: { fs: [], exec: [], net: [] },
  allow: { fs: { read: [], write: [] }, exec: [], tool: [] },
  mode: "prompt",
  callback: { url: null },
};

function withDeny(fs = [], exec = [], net = []) {
  return { ...BASE, deny: { fs, exec, net } };
}

function withAllow({ fsRead = [], fsWrite = [], exec = [], tool = [] }) {
  return { ...BASE, allow: { fs: { read: fsRead, write: fsWrite }, exec, tool } };
}

// ─── deny rules ────────────────────────────────────────────────────────────

test("deny fs: blocks **/.env*", async () => {
  const cfg = withDeny(["**/.env*"]);
  const r = await evaluatePermissions({ tool: "Edit", path: ".env.production" }, cfg);
  assert.equal(r.decision, "deny");
});

test("deny precedes allow (cannot allow what's denied)", async () => {
  const cfg = {
    ...BASE,
    deny: { fs: ["**/.env*"], exec: [], net: [] },
    allow: { fs: { read: ["**/*"], write: ["**/*"] }, exec: [], tool: [] },
  };
  const r = await evaluatePermissions({ tool: "Read", path: ".env.local" }, cfg);
  assert.equal(r.decision, "deny");
});

test("deny exec: blocks 'git push --force origin main'", async () => {
  const cfg = withDeny([], ["git push --force origin main"]);
  const r = await evaluatePermissions(
    { tool: "Bash", command: "git push --force origin main" },
    cfg
  );
  assert.equal(r.decision, "deny");
});

// ─── allow rules ───────────────────────────────────────────────────────────

test("allow fs.read: src/** allows reading src/foo.ts", async () => {
  const cfg = withAllow({ fsRead: ["src/**"] });
  const r = await evaluatePermissions({ tool: "Read", path: "src/foo.ts" }, cfg);
  assert.equal(r.decision, "allow");
});

test("allow fs.write: differentiates read vs write", async () => {
  const cfg = withAllow({ fsRead: ["src/**"], fsWrite: ["tests/**"] });
  const r = await evaluatePermissions({ tool: "Write", path: "src/foo.ts" }, cfg);
  // Write to src not allowed; tests is. Falls through to mode (default prompt).
  assert.equal(r.decision, "prompt");
});

test("allow exec: 'npm run *' matches 'npm run build'", async () => {
  const cfg = withAllow({ exec: ["npm run *"] });
  const r = await evaluatePermissions({ tool: "Bash", command: "npm run build" }, cfg);
  assert.equal(r.decision, "allow");
});

test("allow tool: matches mcp__dotcontext__*", async () => {
  const cfg = withAllow({ tool: ["mcp__dotcontext__*"] });
  const r = await evaluatePermissions({ tool: "mcp__dotcontext__context" }, cfg);
  assert.equal(r.decision, "allow");
});

// ─── mode (fallthrough) ────────────────────────────────────────────────────

test("mode: prompt → unmatched → prompt decision", async () => {
  const cfg = { ...BASE, mode: "prompt" };
  const r = await evaluatePermissions({ tool: "Edit", path: "random/file.ts" }, cfg);
  assert.equal(r.decision, "prompt");
});

test("mode: accept → unmatched → allow decision", async () => {
  const cfg = { ...BASE, mode: "accept" };
  const r = await evaluatePermissions({ tool: "Edit", path: "random/file.ts" }, cfg);
  assert.equal(r.decision, "allow");
});

test("mode: deny → unmatched → deny decision", async () => {
  const cfg = { ...BASE, mode: "deny" };
  const r = await evaluatePermissions({ tool: "Edit", path: "random/file.ts" }, cfg);
  assert.equal(r.decision, "deny");
});

// ─── callback ──────────────────────────────────────────────────────────────

test("callback: SI-3 rejects callback URL pointing at cloud metadata", () => {
  const cfg = { ...BASE, callback: { url: "https://169.254.169.254/" } };
  const errors = validatePermissionsSchema(cfg);
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /callback|metadata|denied/i);
});

test("callback: SI-3 rejects http callback URL (non-https)", () => {
  const cfg = { ...BASE, callback: { url: "http://example.com/cb" } };
  const errors = validatePermissionsSchema(cfg);
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /callback|scheme|https/i);
});

// ─── SI-5 glob subset ──────────────────────────────────────────────────────

test("SI-5: schema rejects deny pattern with negation", () => {
  const cfg = withDeny(["!**/safe/**"]);
  const errors = validatePermissionsSchema(cfg);
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /negation|extglob|SI-5/i);
});

test("SI-5: schema rejects allow.fs.read with extglob", () => {
  const cfg = withAllow({ fsRead: ["+(a|b).ts"] });
  const errors = validatePermissionsSchema(cfg);
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /extglob|allow|SI-5/i);
});

// ─── N4 expanded deny coverage ─────────────────────────────────────────────

test("N4 deny coverage: blocks **/.aws/credentials", async () => {
  const cfg = withDeny(["**/.aws/credentials"]);
  const r = await evaluatePermissions({ tool: "Read", path: "home/.aws/credentials" }, cfg);
  assert.equal(r.decision, "deny");
});

test("N4 deny coverage: blocks **/id_rsa*", async () => {
  const cfg = withDeny(["**/id_rsa*"]);
  const r = await evaluatePermissions({ tool: "Read", path: ".ssh/id_rsa" }, cfg);
  assert.equal(r.decision, "deny");
});

test("N4 exec deny: blocks 'git push -f *'", async () => {
  const cfg = withDeny([], ["git push -f *"]);
  const r = await evaluatePermissions(
    { tool: "Bash", command: "git push -f origin main" },
    cfg
  );
  assert.equal(r.decision, "deny");
});

// ─── H1 regression: deny.net runtime enforcement ───────────────────────────

test("H1 fix: deny.net blocks curl http://169.254.169.254/...", async () => {
  const cfg = withDeny([], [], ["169.254.169.254*"]);
  const r = await evaluatePermissions(
    { tool: "Bash", command: "curl http://169.254.169.254/latest/meta-data/iam/security-credentials/" },
    cfg
  );
  assert.equal(r.decision, "deny");
  assert.match(r.reason, /deny\.net/);
});

test("H1 fix: deny.net blocks metadata.google.internal in Bash command", async () => {
  const cfg = withDeny([], [], ["metadata.google.internal*"]);
  const r = await evaluatePermissions(
    { tool: "Bash", command: "wget http://metadata.google.internal/computeMetadata/v1/" },
    cfg
  );
  assert.equal(r.decision, "deny");
});

test("H1 fix: deny.net blocks via direct event.url field", async () => {
  const cfg = withDeny([], [], ["169.254.*"]);
  const r = await evaluatePermissions(
    { tool: "WebFetch", url: "http://169.254.42.1/admin" },
    cfg
  );
  assert.equal(r.decision, "deny");
});

// ─── H2 regression: SI-3 callback URL extended denylist ────────────────────

test("H2 fix: callback URL rejected on IPv4 link-local 169.254.42.1", () => {
  const cfg = { ...BASE, callback: { url: "https://169.254.42.1/cb" } };
  const errors = validatePermissionsSchema(cfg);
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /link-local|metadata|denied/i);
});

test("H2 fix: callback URL rejected on IPv6 link-local fe80::1", () => {
  const cfg = { ...BASE, callback: { url: "https://[fe80::1]/cb" } };
  const errors = validatePermissionsSchema(cfg);
  assert.ok(errors.length > 0);
});

test("H2 fix: callback URL rejected on IPv6 ULA fd00::1", () => {
  const cfg = { ...BASE, callback: { url: "https://[fd00::1]/cb" } };
  const errors = validatePermissionsSchema(cfg);
  assert.ok(errors.length > 0);
});

test("H2 fix: callback URL rejected on instance-data.ec2.internal", () => {
  const cfg = { ...BASE, callback: { url: "https://instance-data.ec2.internal/" } };
  const errors = validatePermissionsSchema(cfg);
  assert.ok(errors.length > 0);
});

test("H2 fix: callback URL rejected on trailing-dot hostname", () => {
  const cfg = { ...BASE, callback: { url: "https://example.com./path" } };
  const errors = validatePermissionsSchema(cfg);
  assert.ok(errors.length > 0);
  assert.match(errors.join("\n"), /trailing-dot|denied/i);
});

// ─── M1 regression: loadPermissions fails closed on schema errors ──────────

test("M1 fix: loadPermissions falls back to mode:deny on bad globs", async () => {
  const { mkdirSync, writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { loadPermissions } = await import("../../scripts/lib/permissions-evaluator.mjs");
  const TEST_TMP_ROOT = "./tests/validation/tmp/";
  mkdirSync(TEST_TMP_ROOT, { recursive: true });
  const root = mkdtempSync(join(TEST_TMP_ROOT, "perm-bad-"));
  try {
    mkdirSync(join(root, ".context"), { recursive: true });
    writeFileSync(join(root, ".context", "permissions.yaml"),
      `spec: devflow-permissions/v0
deny:
  fs:
    - "!**/poisoned/**"
mode: accept
`);
    const cfg = loadPermissions(root);
    // Even though manifest declared mode:accept, schema errors force mode:deny
    assert.equal(cfg.mode, "deny", "should fail-closed on extglob/negation");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ─── Evaluation order ──────────────────────────────────────────────────────

test("evaluation order strictly deny → allow → mode → callback", async () => {
  // File matches BOTH deny and allow — deny must win
  const cfg = {
    ...BASE,
    deny: { fs: ["src/secret.ts"], exec: [], net: [] },
    allow: { fs: { read: ["src/**"], write: ["src/**"] }, exec: [], tool: [] },
    mode: "accept",
  };
  const r = await evaluatePermissions({ tool: "Read", path: "src/secret.ts" }, cfg);
  assert.equal(r.decision, "deny", "deny must precede allow");
  assert.match(r.reason, /deny/i);
});

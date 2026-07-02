// tests/lib/test-git-op-guard.mjs
// ADV-6: rede técnica contra git push / gh pr merge / git commit direto numa
// branch protegida. Testa a função pura evaluateGitOp (decisão determinística).
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateGitOp } from "../../scripts/lib/git-op-guard.mjs";

const PROT = { protectedBranches: ["main", "develop"], branchProtection: true, strategy: "branch-flow" };

test("deny: git push origin main na branch protegida", () => {
  const r = evaluateGitOp({ command: "git push origin main", branch: "main", ...PROT });
  assert.equal(r.decision, "deny");
});

test("deny: gh pr merge --auto na branch protegida", () => {
  const r = evaluateGitOp({ command: "gh pr merge --auto", branch: "main", ...PROT });
  assert.equal(r.decision, "deny");
});

test("deny: git commit direto na protegida", () => {
  const r = evaluateGitOp({ command: "git commit -m x", branch: "develop", ...PROT });
  assert.equal(r.decision, "deny");
});

test("deny: comando composto (cd x && git push) na protegida", () => {
  const r = evaluateGitOp({ command: "cd repo && git push -f", branch: "main", ...PROT });
  assert.equal(r.decision, "deny");
});

test("allow: git push numa branch de trabalho (não protegida)", () => {
  const r = evaluateGitOp({ command: "git push origin feature/x", branch: "feature/x", ...PROT });
  assert.equal(r.decision, "allow");
});

test("allow: comando não-destrutivo na protegida (git status)", () => {
  const r = evaluateGitOp({ command: "git status", branch: "main", ...PROT });
  assert.equal(r.decision, "allow");
});

test("allow: branchProtection=false desliga a rede", () => {
  const r = evaluateGitOp({ command: "git push origin main", branch: "main", protectedBranches: ["main"], branchProtection: false, strategy: "branch-flow" });
  assert.equal(r.decision, "allow");
});

test("allow: trunk-based não protege", () => {
  const r = evaluateGitOp({ command: "git push origin main", branch: "main", protectedBranches: ["main"], branchProtection: true, strategy: "trunk-based" });
  assert.equal(r.decision, "allow");
});

test("allow: sem protectedBranches definidas (fail-open)", () => {
  const r = evaluateGitOp({ command: "git push origin main", branch: "main", protectedBranches: [], branchProtection: true, strategy: "branch-flow" });
  assert.equal(r.decision, "allow");
});

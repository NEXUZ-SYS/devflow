import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidConventionalCommit } from "../../hooks/commit-msg-guard.mjs";

describe("commit-msg guard — Conventional Commits", () => {
  it("aceita feat com escopo", () => assert.equal(isValidConventionalCommit("feat(orders): add idempotency key"), true));
  it("aceita fix sem escopo", () => assert.equal(isValidConventionalCommit("fix: prevent redirect loop"), true));
  it("aceita breaking com !", () => assert.equal(isValidConventionalCommit("feat(auth)!: drop legacy token"), true));
  it("rejeita tipo inválido", () => assert.equal(isValidConventionalCommit("update stuff"), false));
  it("rejeita subject vazio", () => assert.equal(isValidConventionalCommit("feat: "), false));
  it("rejeita subject com ponto final", () => assert.equal(isValidConventionalCommit("feat: add thing."), false));
  it("rejeita subject > 72 chars", () => assert.equal(isValidConventionalCommit("feat: " + "x".repeat(80)), false));
});

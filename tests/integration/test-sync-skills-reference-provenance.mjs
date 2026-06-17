// Run: node --test tests/integration/test-sync-skills-reference-provenance.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO = resolve(import.meta.dirname, "../..");
const CS = readFileSync(join(REPO, "skills/context-sync/SKILL.md"), "utf-8");
const PI = readFileSync(join(REPO, "skills/project-init/SKILL.md"), "utf-8");

describe("skills invocam provenance-sync", () => {
  it("context-sync chama provenance-sync.mjs apply", () => assert.match(CS, /provenance-sync\.mjs"? apply/));
  it("context-sync reporta preservados/refused/editados", () => assert.match(CS, /preserv|refused|editad/i));
  it("context-sync deixa agents fora da lib", () => assert.match(CS, /agent[s]?\b[\s\S]{0,80}?(fill|fluxo|fora)/i));
  it("project-init referencia provenance-sync", () => assert.match(PI, /provenance-sync\.mjs/));
});

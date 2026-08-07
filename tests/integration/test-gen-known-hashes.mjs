// Run: node --test tests/integration/test-gen-known-hashes.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { distributableFiles, genFromWorkingTree } from "../../scripts/lib/gen-known-hashes.mjs";
import { hashFile } from "../../scripts/lib/provenance-sync.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const PROFILE_SKILL = join(REPO, "assets", "skills", "profiles", "odoo", "odoo-development", "SKILL.md");

describe("gen-known-hashes (verbatim only)", () => {
  it("distributableFiles inclui skills e standards de profile; exclui agents e std raiz", () => {
    const f = distributableFiles(REPO);
    assert.ok(f.some((x) => x.startsWith("skills/")), "skills/");
    assert.ok(f.some((x) => x.startsWith(join("assets", "standards", "profiles"))), "profiles");
    assert.ok(!f.some((x) => x.startsWith("agents/")), "agents fora");
    assert.ok(!f.some((x) => /^assets[/\\]standards[/\\]std-.*\.md$/.test(x)), "std raiz fora");
  });

  it("genFromWorkingTree é Set e contém hash de uma skill atual", () => {
    const set = genFromWorkingTree(REPO);
    assert.ok(set instanceof Set);
    assert.ok(set.has(hashFile(join(REPO, "skills", "commit-message", "SKILL.md"))));
  });
});

/**
 * Relocação das skills de perfil e o registry (ADR-008 v1.1.0).
 *
 * O hash é sha256(conteúdo) — o path NUNCA entra. Logo mover um arquivo não
 * pode alterar o conjunto de hashes, DESDE QUE a nova raiz seja varrida. Se
 * este invariante quebrar, é porque o conteúdo mudou junto com o move, que é
 * exatamente o que se quer detectar em separado.
 */
describe("relocação das skills de perfil e o registry", () => {
  it("assets/skills/profiles/** entra na varredura de distribuíveis", () => {
    const files = distributableFiles(REPO);
    const relocadas = files.filter((f) => f.startsWith(join("assets", "skills", "profiles")));
    assert.ok(relocadas.length > 0, "skills de perfil precisam ser indexadas");
    assert.ok(
      relocadas.some((f) => f.endsWith(join("odoo-development", "SKILL.md"))),
      "odoo-development/SKILL.md deve estar no registry",
    );
  });

  it("nenhuma skill de framework sobrou sob skills/", () => {
    const files = distributableFiles(REPO);
    const vazando = files.filter((f) => /^skills[/\\](odoo-|frontend-specialist-odoo|nxz-)/.test(f));
    assert.deepEqual(vazando, [], `skills de framework ainda em skills/: ${vazando.join(", ")}`);
  });

  it("o hash do conteúdo relocado é preservado (path-agnóstico)", () => {
    const set = genFromWorkingTree(REPO);
    const h = hashFile(PROFILE_SKILL);
    assert.ok(h, `a skill relocada precisa existir em ${PROFILE_SKILL}`);
    assert.ok(set.has(h), "o hash do conteúdo movido continua no registry");
  });

  it("as 20 skills relocadas estão todas indexadas", () => {
    const files = distributableFiles(REPO);
    const sob = (p) => files.filter((f) => f.startsWith(join("assets", "skills", "profiles", p))).length;
    assert.equal(sob("odoo"), 16, "odoo: 3 skills (SKILL.md + references)");
    assert.equal(sob("nxz"), 4, "nxz: odoo-nxz-overlay (SKILL.md + 3 references)");
  });
});

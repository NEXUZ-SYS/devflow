// skills/import-reversa/tests/skill-structure.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL = readFileSync(join(import.meta.dirname, "..", "SKILL.md"), "utf-8");

describe("SKILL.md — contrato evidência-primeiro", () => {
  it("tem frontmatter com name e description", () => {
    assert.match(SKILL, /^---\n[\s\S]*?name:\s*.+[\s\S]*?description:\s*.+[\s\S]*?\n---/);
  });

  it("declara que NÃO emite PRD/stories/plans (o Planning autora)", () => {
    // menções a stories.yaml/PRD são permitidas SÓ no contexto de negação
    assert.match(SKILL, /não emite PRD, `stories\.yaml` nem `plans\.json`/,
      "declara explicitamente a não-emissão");
    assert.ok(!/PRD faseado|emit\(PRD|gera.*stories\.yaml|escreve.*stories\.yaml/i.test(SKILL),
      "sem linguagem de emissão positiva de plano");
  });

  it("declara o pipeline novo", () => {
    for (const estagio of ["resolve-handoff", "classify", "ledger", "invoke Planning"]) {
      assert.ok(SKILL.includes(estagio), `menciona ${estagio}`);
    }
  });

  it("não tem mais o gate de aborto por modo reverse", () => {
    assert.ok(!/ABORTE|Importação abortada/.test(SKILL),
      "forward e reverse seguem o mesmo caminho agora");
  });

  it("enquadra a âncora como rascunho sob revisão, não plano aprovado", () => {
    assert.match(SKILL, /rascunho sob revisão/i);
    assert.match(SKILL, /nunca.*instrução|DADO/i);
  });

  it("mantém os invariantes de segurança e read-only", () => {
    assert.match(SKILL, /read-only/i);
    assert.match(SKILL, /não-destrutiv|nunca.*sobrescrev|WIP/i);
    assert.match(SKILL, /confirmar/i);
  });

  it("referencia a lib do pipeline e reaproveita o project-init", () => {
    assert.match(SKILL, /scripts\/reversa-import\/pipeline\.mjs/);
    assert.match(SKILL, /reaproveit.*project-init|devflow:project-init/i);
  });

  it("termina invocando o Planning", () => {
    assert.match(SKILL, /prevc-flow|Planning/);
  });
});

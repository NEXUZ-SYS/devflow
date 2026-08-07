/**
 * Binding de skills no frontmatter do agente de projeto (ADR-008 v1.1.0).
 * Run: node --test tests/integration/test-agent-skill-binding.mjs
 *
 * SAFETY: toda fixture vive em tmpdir. Nenhum diretório versionado é mutado.
 *
 * O parser do dotcontext DESCARTA o frontmatter inteiro quando um campo sai
 * mal-tipado (caso conhecido: `generated:` sem aspas virando Date). Por isso a
 * lib faz edição CIRÚRGICA de linha em vez de re-serializar o bloco, e por isso
 * o teste valida o resultado com o parser do PRÓPRIO dotcontext — pyyaml daria
 * falso-OK exatamente neste ponto.
 */
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySkillBindings, upsertSkillsLine } from "../../scripts/lib/agent-skill-binding.mjs";
import { parseFrontmatter } from "../../scripts/lib/frontmatter.mjs";

const AGENTE = `---
type: agent
name: backend-specialist
description: Backend do projeto
role: backend
generated: "2026-04-02"
status: filled
scaffoldVersion: "2.0.0"
---

## Mission

Corpo do playbook que NAO pode ser reescrito.
`;

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

function projetoComAgente() {
  const root = mkdtempSync(join(tmpdir(), "devflow-binding-"));
  dirs.push(root);
  mkdirSync(join(root, ".context", "agents"), { recursive: true });
  writeFileSync(join(root, ".context", "agents", "backend-specialist.md"), AGENTE);
  return root;
}

const agentePath = (root) => join(root, ".context", "agents", "backend-specialist.md");

describe("binding de skills no agente de projeto", () => {
  it("grava skills: preservando todas as demais chaves e o corpo", () => {
    const root = projetoComAgente();
    const r = applySkillBindings({
      root,
      skillBindings: { "backend-specialist": ["odoo-development", "odoo-l10n-br"] },
    });
    assert.deepEqual(r.written, ["backend-specialist"]);

    const { data, body } = parseFrontmatter(readFileSync(agentePath(root), "utf-8"));
    assert.deepEqual(data.skills, ["odoo-development", "odoo-l10n-br"]);
    assert.equal(data.name, "backend-specialist");
    assert.equal(data.role, "backend");
    assert.equal(data.scaffoldVersion, "2.0.0");
    assert.equal(data.type, "agent");
    assert.equal(data.status, "filled");
    assert.match(body, /Corpo do playbook que NAO pode ser reescrito/);
  });

  it("é idempotente — reaplicar não duplica nem reordena", () => {
    const root = projetoComAgente();
    const args = { root, skillBindings: { "backend-specialist": ["odoo-development"] } };
    applySkillBindings(args);
    const primeira = readFileSync(agentePath(root), "utf-8");
    const r2 = applySkillBindings(args);
    const segunda = readFileSync(agentePath(root), "utf-8");
    assert.equal(primeira, segunda, "reaplicar deve ser byte-idêntico");
    assert.deepEqual(r2.written, [], "nada a escrever na segunda passada");
  });

  it("substitui a lista quando o binding muda, sem duplicar a chave", () => {
    const root = projetoComAgente();
    applySkillBindings({ root, skillBindings: { "backend-specialist": ["a"] } });
    applySkillBindings({ root, skillBindings: { "backend-specialist": ["a", "b"] } });
    const raw = readFileSync(agentePath(root), "utf-8");
    const ocorrencias = raw.split("\n").filter((l) => /^skills:/.test(l)).length;
    assert.equal(ocorrencias, 1, "a chave skills: nunca pode ser duplicada");
    assert.deepEqual(parseFrontmatter(raw).data.skills, ["a", "b"]);
  });

  it("papel sem agente vira pendência — NUNCA cria o arquivo", () => {
    const root = projetoComAgente();
    const r = applySkillBindings({
      root,
      skillBindings: { "mobile-specialist": ["alguma-skill"] },
    });
    assert.deepEqual(r.pending, ["mobile-specialist"]);
    assert.equal(existsSync(join(root, ".context", "agents", "mobile-specialist.md")), false,
      "criar agente de projeto é competência do dotcontext");
  });

  it("o frontmatter resultante sobrevive ao parser do dotcontext", () => {
    const root = projetoComAgente();
    applySkillBindings({ root, skillBindings: { "backend-specialist": ["odoo-development"] } });
    const { data } = parseFrontmatter(readFileSync(agentePath(root), "utf-8"));
    // Se um campo sair mal-tipado, o parser descarta o frontmatter INTEIRO e
    // estas chaves somem — é esse modo de falha que o teste detecta.
    for (const k of ["type", "name", "role", "status", "scaffoldVersion", "skills"]) {
      assert.ok(k in data, `chave ${k} perdida — o frontmatter foi descartado`);
    }
  });

  it("as linhas não tocadas permanecem byte-idênticas", () => {
    const root = projetoComAgente();
    applySkillBindings({ root, skillBindings: { "backend-specialist": ["x"] } });
    const depois = readFileSync(agentePath(root), "utf-8").split("\n");
    for (const linha of AGENTE.split("\n")) {
      if (!linha) continue;
      assert.ok(depois.includes(linha), `linha alterada pela edição cirúrgica: ${linha}`);
    }
  });
});

describe("upsertSkillsLine", () => {
  it("retorna null quando não há frontmatter", () => {
    assert.equal(upsertSkillsLine("# só markdown\n", ["a"]), null);
  });

  it("retorna null quando o bloco não fecha", () => {
    assert.equal(upsertSkillsLine("---\ntype: agent\n", ["a"]), null);
  });

  it("insere antes do delimitador de fechamento", () => {
    const out = upsertSkillsLine("---\ntype: agent\n---\n\ncorpo\n", ["a", "b"]);
    const linhas = out.split("\n");
    assert.equal(linhas[2], "skills: [a, b]");
    assert.equal(linhas[3], "---");
  });
});

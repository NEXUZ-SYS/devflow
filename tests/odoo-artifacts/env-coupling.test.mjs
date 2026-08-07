// Critério 2 — L1+L2 (e agente) sem acoplamento de ambiente.
// Run: node --test tests/odoo-artifacts/env-coupling.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { envCouplingHits, L1_FILES, L2_FILES } from "./lib/artifact-lint.mjs";

describe("L1+L2 sem acoplamento de ambiente", () => {
  for (const file of [...L1_FILES.skills, ...L2_FILES.skills]) {
    it(`${file} não tem path/DB/porta/service hardcoded`, () => {
      // Exigir a existência em vez de pular em silêncio: um `return` aqui faria
      // este teste passar VAZIO justamente se a relocação para
      // assets/skills/profiles/ tivesse perdido o arquivo.
      assert.ok(existsSync(file), `skill de perfil ausente no caminho esperado: ${file}`);
      const hits = envCouplingHits(readFileSync(file, "utf-8"));
      assert.deepEqual(hits, [], `acoplamento de env em ${file}: ${hits.join(", ")}`);
    });
  }
});

// O bloco que verificava agents/odoo-specialist.md foi REMOVIDO: perfis não
// contribuem mais agents e o arquivo deixou de existir (ADR-008 v1.1.0).
// Criar agente de projeto é competência do dotcontext.

/**
 * Referential-integrity gate — every framework profile must point at real files.
 * Run: node --test tests/integration/test-framework-profiles-integrity.mjs
 *
 * Guarda o trio profiles/<fw>.yaml ↔ diretórios ↔ SKILL.md, e o invariante de
 * localização da ADR-008 v1.1.0: artefato condicional a framework mora em
 * assets/skills/profiles/<fw>/, NUNCA em skills/ do plugin (namespace global
 * registrado sem opt-out).
 *
 * AC0  profiles/ existe com ao menos um perfil
 * AC1  todo profiles/*.yaml parseia e tem framework/detect/skills/skillBindings
 * AC2  nenhum perfil declara `agents` — revogado (criar agente é do dotcontext)
 * AC3  toda skill declarada existe em assets/skills/profiles/<fw>/<slug>/SKILL.md
 * AC4  nenhum diretório órfão sob assets/skills/profiles/<fw>/
 * AC5  skillBindings só cita skills declaradas pelo próprio perfil
 * AC6  dispatchKeywords e skillBindings concordam nos papéis
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseYaml } from "../../scripts/lib/frontmatter.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const PROFILES_DIR = join(REPO, "profiles");
const PROFILE_SKILLS = join(REPO, "assets", "skills", "profiles");

function profileFiles() {
  if (!existsSync(PROFILES_DIR)) return [];
  return readdirSync(PROFILES_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
}

describe("framework-profiles integrity", () => {
  it("AC0 profiles/ directory exists with at least one profile", () => {
    assert.ok(existsSync(PROFILES_DIR), "profiles/ directory missing");
    assert.ok(profileFiles().length >= 1, "no profile files found");
  });

  for (const file of profileFiles()) {
    const data = parseYaml(readFileSync(join(PROFILES_DIR, file), "utf-8"));

    it(`AC1 ${file} is well-formed`, () => {
      assert.ok(data.framework, "missing framework");
      assert.ok(data.detect && typeof data.detect === "object", "missing detect");
      assert.ok(Array.isArray(data.skills), "skills must be an array");
      assert.ok(data.skillBindings && typeof data.skillBindings === "object",
        "skillBindings must be an object");
    });

    // Perfis NAO contribuem agents desde a ADR-008 v1.1.0. A chave voltar e
    // regressao: o plugin estaria de novo autorando agente de projeto.
    it(`AC2 ${file} does NOT declare agents (revogado)`, () => {
      assert.equal(data.agents, undefined,
        `${file} voltou a declarar agents — criar agente de projeto é competência do dotcontext`);
    });

    it(`AC3 ${file} skills exist under assets/skills/profiles/<fw>/`, () => {
      assert.ok(data.skills.length > 0, `${file} não declara skill alguma`);
      for (const skill of data.skills) {
        const p = join(PROFILE_SKILLS, data.framework, skill, "SKILL.md");
        assert.ok(existsSync(p), `skill "${skill}" referenced by ${file} missing: ${p}`);
        // E o contrapositivo: nao pode ter sobrado copia em skills/.
        assert.ok(!existsSync(join(REPO, "skills", skill, "SKILL.md")),
          `skill "${skill}" ainda em skills/ — viraria comando global`);
      }
    });

    it(`AC4 ${file} has no orphan directory under its profile dir`, () => {
      const dir = join(PROFILE_SKILLS, data.framework);
      if (!existsSync(dir)) return assert.deepEqual(data.skills, [],
        `${file} declara skills mas ${dir} não existe`);
      const declaradas = new Set(data.skills);
      const orfaos = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !declaradas.has(e.name))
        .map((e) => `${data.framework}/${e.name}`);
      assert.deepEqual(orfaos, [], `diretório órfão não declarado em ${file}: ${orfaos.join(", ")}`);
    });

    it(`AC5 ${file} skillBindings only cites declared skills`, () => {
      const declaradas = new Set(data.skills);
      const invalidos = [];
      for (const [role, slugs] of Object.entries(data.skillBindings || {})) {
        for (const s of slugs || []) {
          if (!declaradas.has(s)) invalidos.push(`${role} → ${s}`);
        }
      }
      assert.deepEqual(invalidos, [], `skillBindings cita skill não declarada: ${invalidos.join(", ")}`);
    });

    it(`AC6 ${file} dispatchKeywords and skillBindings agree on roles`, () => {
      const papeis = new Set(Object.keys(data.skillBindings || {}));
      const roteados = Object.keys(data.dispatchKeywords || {});
      const desconhecidos = roteados.filter((r) => !papeis.has(r));
      assert.deepEqual(desconhecidos, [],
        `dispatchKeywords roteia para papel sem binding (agente do plugin?): ${desconhecidos.join(", ")}`);
    });
  }
});

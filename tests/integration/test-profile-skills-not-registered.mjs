/**
 * Guard de regressão — skills de perfil NUNCA em skills/ do plugin.
 * Run: node --test tests/integration/test-profile-skills-not-registered.mjs
 *
 * O Claude Code registra todo skills/<nome>/SKILL.md do plugin como comando
 * global (/devflow:<nome>), sem opt-out por frontmatter. Logo skill condicional
 * a framework NÃO pode morar lá — vira comando em todo projeto (ADR-008 v1.1.0).
 *
 * AC1 skills/ do plugin e o conjunto contribuído por perfis são DISJUNTOS
 * AC2 toda skill declarada por um perfil existe em assets/skills/profiles/<fw>/
 * AC3 nenhum SKILL.md em skills/ carrega path absoluto de máquina
 * AC4 skills/ bate exatamente com o MANIFEST de skills base
 *
 * AC1 sozinho NÃO cobre o pior caso: uma skill de framework/produto que nenhum
 * perfil declara passa direto (foi o caso do nxz-go-test). AC3 pega o sintoma
 * mecânico e AC4 é a garantia estrutural — toda skill em skills/ tem de ser
 * declarada como capacidade do bridge, por escrito.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadProfiles } from "../../scripts/lib/detect-framework.mjs";

const REPO = resolve(import.meta.dirname, "../..");

function registeredSkillDirs() {
  const dir = join(REPO, "skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name);
}

describe("skills de perfil não são registradas globalmente", () => {
  const profiles = loadProfiles(REPO);
  const registered = new Set(registeredSkillDirs());

  it("AC1 skills/ e as skills de perfil são conjuntos disjuntos", () => {
    const leaked = [];
    for (const p of profiles) {
      for (const slug of p.skills) {
        if (registered.has(slug)) leaked.push(`${slug} (perfil ${p.framework})`);
      }
    }
    assert.deepEqual(
      leaked, [],
      `skills de perfil vazando no namespace global: ${leaked.join(", ")}`,
    );
  });

  it("AC2 toda skill de perfil existe sob assets/skills/profiles/<fw>/", () => {
    const missing = [];
    for (const p of profiles) {
      for (const slug of p.skills) {
        const skillMd = join(REPO, "assets", "skills", "profiles", p.framework, slug, "SKILL.md");
        if (!existsSync(skillMd)) missing.push(`${p.framework}/${slug}`);
      }
    }
    assert.deepEqual(missing, [], `skills de perfil sem arquivo: ${missing.join(", ")}`);
  });

  // AC3 — sintoma mecânico de artefato de projeto que vazou para o bundle.
  // Uma skill do bridge nunca aponta para o disco de uma máquina específica.
  it("AC3 nenhuma skill em skills/ carrega path absoluto de máquina", () => {
    const ABS = /(^|[\s"'`(])(\/home\/|\/Users\/|[A-Z]:\\)/m;
    const ofensores = [];
    for (const slug of registered) {
      const md = join(REPO, "skills", slug, "SKILL.md");
      if (!existsSync(md)) continue;
      const m = readFileSync(md, "utf-8").match(ABS);
      if (m) ofensores.push(`${slug}: ${m[0].trim()}`);
    }
    assert.deepEqual(ofensores, [],
      `skill do bridge com path de máquina (artefato de projeto vazado): ${ofensores.join(", ")}`);
  });

  // AC4 — garantia estrutural. AC1 só olha o que os perfis declaram; uma skill
  // de framework SEM perfil (o caso nxz-go-test) escaparia. O MANIFEST obriga
  // toda skill de skills/ a ser declarada como capacidade do bridge.
  it("AC4 skills/ bate exatamente com o MANIFEST de skills base", () => {
    const manifesto = readFileSync(join(REPO, "skills", "MANIFEST.txt"), "utf-8")
      .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    const declaradas = new Set(manifesto);
    const naoDeclaradas = [...registered].filter((s) => !declaradas.has(s)).sort();
    const orfas = manifesto.filter((s) => !registered.has(s)).sort();
    assert.deepEqual(naoDeclaradas, [],
      `skill em skills/ fora do MANIFEST — declare como capacidade do bridge ou mova para assets/skills/profiles/: ${naoDeclaradas.join(", ")}`);
    assert.deepEqual(orfas, [], `MANIFEST cita skill inexistente: ${orfas.join(", ")}`);
  });
});

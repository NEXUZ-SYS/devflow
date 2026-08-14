/**
 * Guard de regressão — o menu de slash lista devflow:devflow primeiro.
 * Run: node --test tests/integration/test-slash-menu-ordering.mjs
 *
 * O Claude Code (bundle 2.1.231, função H8l) ordena o menu de `/` por:
 * (1) nome exato, (2) alias exato, (3) prefix match MENOR PRIMEIRO,
 * (4) alias prefixo, (5) score Fuse, (6) usage. Os critérios 1 e 2 são
 * inalcançáveis por plugin — o `name` é sempre `plugin:nome`, e o frontmatter
 * de plugin não aceita `aliases`. Logo a chave efetiva é (comprimento, nome).
 *
 * AC1 devflow:devflow é o MÍNIMO dessa chave entre as entradas visíveis
 * AC2 skills não aparecem no menu do usuário (exceto a allowlist documentada)
 * AC3 todo comando respeita a convenção devflow-* restaurada na v1.6.0
 *
 * AC1 é o requisito. AC2 e AC3 são o que o sustenta no tempo: sem AC2 uma skill
 * nova de nome curto reintroduz o defeito; sem AC3, um comando novo faz o mesmo.
 *
 * `user-invocable: false` esconde do menu do USUÁRIO e mantém a invocação pelo
 * modelo — só `disable-model-invocation` bloquearia o modelo, e não é usado
 * aqui. Esconder do menu NÃO desregistra a skill: para artefato condicional a
 * framework continua valendo o ADR-008 v1.2.0 (mover para assets/skills/
 * profiles/<fw>/), e é isso que test-profile-skills-not-registered.mjs guarda.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";

const REPO = resolve(import.meta.dirname, "../..");
const PLUGIN = "devflow";

// Única skill que a documentação manda o usuário digitar
// (docs/odoo-profile-standards.md:50 — follow-up manual de indexação).
const SKILLS_VISIVEIS = ["scrape-stack-batch"];

// O loader lê `name:` do frontmatter e cai no basename quando ausente.
function nomeDeclarado(arquivo, fallback) {
  const m = readFileSync(arquivo, "utf-8").match(/^name:\s*"?([^"\n]+)"?\s*$/m);
  return m ? m[1].trim() : fallback;
}

function temUserInvocableFalse(arquivo) {
  return /^user-invocable:\s*false\s*$/m.test(readFileSync(arquivo, "utf-8"));
}

function comandos() {
  return readdirSync(join(REPO, "commands"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(REPO, "commands", f));
}

function skills() {
  return readdirSync(join(REPO, "skills"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .filter((slug) => existsSync(join(REPO, "skills", slug, "SKILL.md")));
}

// Nenhum comando usa user-invocable hoje, mas o campo vale para command e skill
// igualmente — filtrar os dois pelo mesmo critério evita que um comando oculto
// no futuro seja contado como visível.
function visivel(arquivo) {
  return !temUserInvocableFalse(arquivo);
}

// Critério 3 do comparador: menor comprimento primeiro, desempate alfabético.
const chave = (nome) => [nome.length, nome];
const menorQue = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]);

describe("ordenação do menu de slash do plugin", () => {
  it("AC1 devflow:devflow é o primeiro item ao digitar /devflow", () => {
    const visiveis = [
      ...comandos()
        .filter(visivel)
        .map((f) => nomeDeclarado(f, basename(f, ".md"))),
      ...skills()
        .filter((s) => visivel(join(REPO, "skills", s, "SKILL.md")))
        .map((s) => nomeDeclarado(join(REPO, "skills", s, "SKILL.md"), s)),
    ].map((n) => `${PLUGIN}:${n}`);

    const alvo = `${PLUGIN}:${PLUGIN}`;
    assert.ok(visiveis.includes(alvo), `${alvo} não está entre as entradas visíveis`);

    const vencedores = visiveis
      .filter((n) => n !== alvo && menorQue(chave(n), chave(alvo)))
      .sort();
    assert.deepEqual(
      vencedores, [],
      `entradas que precedem ${alvo} no menu (chave = comprimento, nome): ${vencedores.join(", ")}`,
    );
  });

  it("AC2 skills não aparecem no menu do usuário, exceto a allowlist", () => {
    const expostas = skills()
      .filter((s) => !SKILLS_VISIVEIS.includes(s))
      .filter((s) => visivel(join(REPO, "skills", s, "SKILL.md")))
      .sort();
    assert.deepEqual(
      expostas, [],
      `skills sem 'user-invocable: false' poluindo o menu: ${expostas.join(", ")}`,
    );
  });

  it("AC3 todo comando segue a convenção devflow-* (restaurada na v1.6.0)", () => {
    const foraDoPadrao = comandos()
      .map((f) => nomeDeclarado(f, basename(f, ".md")))
      .filter((n) => n !== PLUGIN && !/^devflow-/.test(n))
      .sort();
    assert.deepEqual(
      foraDoPadrao, [],
      `comando fora da convenção devflow-* — nomes curtos colidem com outros plugins: ${foraDoPadrao.join(", ")}`,
    );
  });
});

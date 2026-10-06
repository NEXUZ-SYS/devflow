// tests/skills/test-standards-gates-offer.mjs — as skills de init e de sync oferecem os gates
// de standards (spec §3.7, T19): pelo CLI que só imprime, um item por vez, com consentimento.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SKILLS = ["skills/project-init/SKILL.md", "skills/context-sync/SKILL.md"];
const HEADING = "### Gates de standards (opt-in, com consentimento)";

// Do título da seção até o próximo título de nível 1 a 3 (fora de bloco de código).
function section(text) {
  const lines = text.split("\n");
  const start = lines.indexOf(HEADING);
  if (start < 0) return null;
  const out = [];
  let fenced = false;
  for (let i = start; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) fenced = !fenced;
    if (i > start && !fenced && /^#{1,3} /.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n").trimEnd();
}

for (const f of SKILLS) {
  test(`${f} oferece os gates de standards com consentimento`, () => {
    const s = readFileSync(f, "utf8");
    assert.match(s, /standards-gates\.mjs/);
    assert.match(s, /baseline init/);
    assert.match(s, /terminal/);
    assert.match(s, /consentimento/i);
    assert.match(s, /\.context\/bin\/devflow-standards\.mjs/);
    assert.doesNotMatch(s, /claude plugin path/);
  });

  test(`${f}: a seção descreve o mecanismo real do gate`, () => {
    const s = section(readFileSync(f, "utf8"));
    assert.ok(s, `seção "${HEADING}" não encontrada`);
    // O CLI só imprime; quem escreve é a skill, pela ferramenta, um item por vez.
    assert.match(s, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/lib\/standards-gates\.mjs" "\$PWD"/);
    assert.match(s, /só imprime/);
    assert.match(s, /`Write`/);
    assert.match(s, /um (item )?por vez/);
    assert.match(s, /Nunca escreva nenhum desses arquivos sem o sim do operador/);
    assert.match(s, /`autonomy` diferente de `supervised`, não escreva nada/);
    // Verbatim (ADR-012): copiar byte a byte e conferir pelo estado; editado não se sobrescreve.
    assert.match(s, /byte a byte/);
    assert.match(s, /`state`/);
    for (const state of ["absent", "current", "outdated", "edited", "blocked"]) assert.ok(s.includes(`\`${state}\``), `falta o estado ${state}`);
    assert.match(s, /\.context\/bin\/devflow-plugin\.ref/);
    // pre-commit: atrito, não garantia.
    assert.match(s, /node \.context\/bin\/devflow-standards\.mjs check --staged/);
    assert.match(s, /--no-verify/);
    // CI: a garantia.
    assert.match(s, /\.github\/workflows\/devflow-standards\.yml/);
    assert.match(s, /required status check/i);
    assert.match(s, /standards-ratchet-approved/);
    assert.match(s, /review `APPROVED`/);
    assert.match(s, /read:org/);
    assert.match(s, /GitLab[^\n]*não há override/);
    assert.doesNotMatch(s, /remov\w+ o rótulo (em|no|a cada) /i, "a aprovação é presa ao commit; não há remoção de rótulo");
    // verify, CODEOWNERS e .gitignore.
    assert.match(s, /standards: \["devflow-standards", "gate"\]/);
    assert.match(s, /CODEOWNERS/);
    assert.match(s, /no fim/i);
    assert.match(s, /nunca reescrev/i);
    assert.match(s, /--owner=/);
    assert.match(s, /Require review from Code Owners/);
    assert.match(s, /\.context\/runtime\//);
    assert.match(s, /\.gitignore/);
    // A catraca continua do operador.
    assert.match(s, /enforce <id> --level block/);
    // I-3: promover um default é ejetar COM o linter; o eject simples zera o campo `linter`.
    assert.match(s, /devflow-standards\.mjs" eject <id> --with-linter/);
    assert.ok(s.indexOf("eject <id> --with-linter") < s.indexOf("enforce <id> --level block"), "o eject vem antes do enforce");
  });
}

test("a seção é a mesma, byte a byte, nas duas skills", () => {
  const [a, b] = SKILLS.map(f => section(readFileSync(f, "utf8")));
  assert.ok(a && b);
  assert.equal(a, b);
});

test("a oferta entra no checklist das duas skills", () => {
  for (const f of SKILLS) {
    const s = readFileSync(f, "utf8");
    const checklist = s.slice(s.indexOf("## Checklist"), s.indexOf("\n## ", s.indexOf("## Checklist") + 1));
    assert.match(checklist, /[Gg]ates de standards/, `${f}: checklist sem a oferta`);
  }
});

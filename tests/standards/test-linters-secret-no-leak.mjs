// tests/standards/test-linters-secret-no-leak.mjs
// Rodada 2 de correção (Task 8), item 2: std-secret-conventions embutia o valor
// casado (o segredo em si) na mensagem — "segredo hard-coded (${norm(m[0])})". Isso
// leva a chave real para o baseline.json VERSIONADO (onde fica mesmo depois do
// segredo ser rotacionado), para os logs de CI e para o additionalContext injetado
// no agente. Fix: a mensagem traz só um RÓTULO fixo do TIPO de segredo (labelFor em
// std-secret-conventions.js), nunca o valor casado.
//
// Prova: para cada tipo reconhecido, a mensagem não contém o valor casado inteiro
// nem nenhum trecho de 8+ caracteres dele.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const LINTER = resolve(import.meta.dirname, "../../assets/standards/machine/std-secret-conventions.js");

function run(content) {
  const dir = mkdtempSync(join(tmpdir(), "secret-leak-"));
  const fp = join(dir, "a.ts");
  writeFileSync(fp, content);
  const r = spawnSync("node", [LINTER, fp], { encoding: "utf8" });
  return r.stdout.split("\n").filter(Boolean).map(l => l.replace(fp, "<fp>"));
}

// nenhum trecho de `minLen`+ caracteres da parte SENSÍVEL do valor (depois do
// prefixo de FORMATO público e conhecido — "sk-", "github_pat_" etc. não são
// segredo, são o marcador que identifica o tipo) pode aparecer na mensagem.
function assertNoLeak(message, secretPart, minLen = 8) {
  for (let i = 0; i + minLen <= secretPart.length; i++) {
    const chunk = secretPart.slice(i, i + minLen);
    assert.ok(!message.includes(chunk), `mensagem vaza trecho do segredo ('${chunk}'): ${message}`);
  }
}

const CASES = [
  { label: "OpenAI", prefix: "sk-", secret: "live-abc123def456ghi789jkl", expectLabel: /chave OpenAI/ },
  { label: "GitHub (ghp_)", prefix: "ghp_", secret: "ABCDEFGHIJ1234567890abcdefghij", expectLabel: /token GitHub/ },
  { label: "GitHub (fine-grained)", prefix: "github_pat_", secret: "ABCDEFGHIJ1234567890abcdefghijklmnop", expectLabel: /token GitHub/ },
  { label: "AWS", prefix: "AKIA", secret: "ABCDEFGHIJKLMNOP", expectLabel: /AWS access key/ },
  { label: "Slack", prefix: "xoxb-", secret: "1234567890-abcdefghij", expectLabel: /token Slack/ },
  { label: "Google", prefix: "AIza", secret: "SyABCDEFGHIJKLMNOPQRSTUVWXYZ1234567", expectLabel: /chave Google/ },
];

for (const { label, prefix, secret, expectLabel } of CASES) {
  const value = prefix + secret;
  test(`std-secret-conventions: ${label} — mensagem tem rótulo do tipo, nunca o valor`, () => {
    const lines = run(`export const k = "${value}";\n`);
    assert.equal(lines.length, 1, `esperava 1 achado: ${JSON.stringify(lines)}`);
    assert.match(lines[0], expectLabel, `mensagem deveria trazer o rótulo do tipo: ${lines[0]}`);
    assert.ok(!lines[0].includes(value), `mensagem não deveria conter o valor inteiro: ${lines[0]}`);
    assertNoLeak(lines[0], secret);
  });
}

test("std-secret-conventions: NEXT_PUBLIC_*KEY — mensagem não repete o nome específico da env var", () => {
  const value = "process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY";
  const lines = run(`export const k = ${value};\n`);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /NEXT_PUBLIC/, `mensagem deveria mencionar NEXT_PUBLIC: ${lines[0]}`);
  assert.ok(!lines[0].includes("STRIPE_SECRET_KEY"), `mensagem não deveria repetir o nome específico da env var: ${lines[0]}`);
});

test("std-secret-conventions: console.log(process.env) — mensagem genérica, sem eco de conteúdo", () => {
  const lines = run(`console.log(\n  process.env\n);\n`);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /console\.log\(process\.env\)/, `mensagem deveria identificar o padrão: ${lines[0]}`);
});

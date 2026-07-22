// tests/lib/finalize/finalize-pure.test.mjs
// Segurança: código que chama git usa só execFileSync (argv), nunca
// shell:true/eval/rede.
//
// O escopo NÃO é mais só scripts/lib/finalize/ — a disciplina vale para todo
// módulo que monta comandos git. Verificado empiricamente antes desta mudança:
// `bash tests/run-lint.sh` saía VERDE com `execSync("git status")` injetado em
// scripts/lib/context-hygiene.mjs, porque o guard não alcançava o arquivo e o
// runner de lint nem executava este teste. Controle que só existe na prosa não
// é controle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));

// dir: varrido por inteiro. only: apenas os arquivos nomeados daquele dir.
const TARGETS = [
  { dir: join(root, "scripts/lib/finalize/") },
  { dir: join(root, "scripts/lib/"), only: ["context-hygiene.mjs"] },
  { dir: join(root, "scripts/"), only: ["context-hygiene.mjs"] },
];

const FORBIDDEN = [
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /shell\s*:\s*true/,
  /\bexecSync\s*\(/,
  /\bfetch\s*\(/,
  /\bimport\s*\(/,
];

const guarded = [];
for (const t of TARGETS) {
  const names = t.only ?? readdirSync(t.dir).filter((f) => f.endsWith(".mjs"));
  for (const f of names) guarded.push({ label: f, path: join(t.dir, f) });
}

for (const { label, path } of guarded) {
  const src = readFileSync(path, "utf8");
  for (const re of FORBIDDEN) {
    test(`${label} não contém ${re}`, () => {
      assert.ok(!re.test(src), `padrão proibido em ${path}: ${re}`);
    });
  }
}

// Trava o alcance do próprio guard: se alguém restringir TARGETS de volta a
// finalize/, este teste reprova. Sem ele o guard poderia voltar a não cobrir
// nada sem ninguém perceber — foi exatamente assim que o gap nasceu.
test("o guard cobre os módulos de higiene de contexto", () => {
  const paths = guarded.map((g) => g.path);
  assert.ok(
    paths.some((p) => p.endsWith("scripts/lib/context-hygiene.mjs")),
    "lib/context-hygiene.mjs precisa estar sob o guard",
  );
  assert.ok(
    paths.some((p) => p.endsWith("scripts/context-hygiene.mjs")),
    "scripts/context-hygiene.mjs precisa estar sob o guard",
  );
});

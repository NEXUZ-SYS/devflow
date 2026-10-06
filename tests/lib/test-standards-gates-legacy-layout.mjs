// tests/lib/test-standards-gates-legacy-layout.mjs — o trecho de CODEOWNERS gerado para o
// projeto-cliente cobre os dois layouts de standards (achado C-1 da re-revisão; onda C, item C2).
//
// O gate trata `.context/standards/` (legado) como catraca em qualquer projeto: o check pula o
// `machine/` de lá e um arquivo novo ali é violação. O trecho gerado só dava dono ao layout
// canônico, e a conferência de cobertura da oferta só olhava o canônico.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { codeownersSnippet, gatesOffer } from "../../scripts/lib/standards-gates.mjs";
import { codeownersFor, codeownersRules, ratchetOwners } from "../../scripts/lib/standards-label-approval.mjs";
import { demoProject } from "../helpers/standards-fixture.mjs";

const TEMPS = [];
after(() => { for (const d of TEMPS) rmSync(d, { recursive: true, force: true }); });
const git = (root, ...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" });

const LEGACY = [
  ".context/standards/machine/app.js", ".context/standards/machine/lib/util.js",
  ".context/standards/std-legado.md", ".context/standards/baseline.json",
];
const CANON = [
  ".context/engineering/standards/machine/app.js", ".context/engineering/standards/std-demo.md",
  ".context/engineering/standards/baseline.json",
];

test("trecho gerado: o leitor de CODEOWNERS do gate resolve arquivo do machine/ legado para o dono", () => {
  const s = codeownersSnippet("@dona");
  for (const p of [...LEGACY, ...CANON]) assert.deepEqual(codeownersFor(s, p), ["@dona"], p);
  // É o conjunto que o override exige: um dono comum para tudo o que o PR alterou na catraca.
  assert.deepEqual([...ratchetOwners(s, [...LEGACY, ...CANON]).owners], ["@dona"]);
  // Só os diretórios de standards: um vizinho de nome parecido não ganha dono.
  assert.equal(codeownersFor(s, ".context/standards-site/a.md"), null);
  assert.equal(codeownersFor(s, ".context/machine/x.js"), null);
});

test("trecho gerado: a regra do layout legado fica com as da catraca, no fim, e leva o prefixo", () => {
  const patterns = (s) => codeownersRules(s).map(r => r.pattern);
  assert.deepEqual(patterns(codeownersSnippet("@dona")), [
    "/.github/workflows/devflow-standards.yml",
    "/.context/engineering/standards/", "/.context/standards/",
    "/.context/standards.local.yaml", "/.context/.devflow.yaml", "/.context/bin/",
  ]);
  const sub = codeownersSnippet("@dona", { prefix: "apps/x/" });
  assert.ok(patterns(sub).includes("/apps/x/.context/standards/"));
  for (const p of LEGACY) assert.deepEqual(codeownersFor(sub, `apps/x/${p}`), ["@dona"], p);
  // Acrescentado no fim de um CODEOWNERS existente, a posse do legado é do dono das normas.
  assert.deepEqual(codeownersFor(`* @todos\n${codeownersSnippet("@dona")}`, LEGACY[0]), ["@dona"]);
});

function project() {
  const root = demoProject(); TEMPS.push(root);
  git(root, "init", "-q", "-b", "main"); git(root, "config", "user.email", "t@t"); git(root, "config", "user.name", "t");
  git(root, "remote", "add", "origin", "git@github.com:acme/app.git");
  mkdirSync(join(root, ".github"));
  return root;
}
// O trecho como era gerado antes: sem a regra do layout legado.
const OLD_SNIPPET = [
  "/.github/workflows/devflow-standards.yml @dona", "/.context/engineering/standards/ @dona",
  "/.context/standards.local.yaml @dona", "/.context/.devflow.yaml @dona", "/.context/bin/ @dona", "",
].join("\n");

test("oferta: CODEOWNERS só com o layout canônico não cobre a catraca; o motivo aponta o caminho legado", () => {
  const root = project();
  writeFileSync(join(root, ".github/CODEOWNERS"), OLD_SNIPPET);
  const o = gatesOffer(root, { owner: "@dona" }).codeowners;
  assert.equal(o.covered, false);
  assert.match(o.uncovered, /^\.context\/standards\//);
  assert.match(o.why, /nenhuma regra casa/);
  assert.match(o.content, /^\/\.context\/standards\/ @dona$/m, "o trecho oferecido traz a regra que falta");
});

test("oferta: CODEOWNERS com o trecho gerado cobre a catraca nos dois layouts", () => {
  const root = project();
  writeFileSync(join(root, ".github/CODEOWNERS"), `* @todos\n${codeownersSnippet("@dona")}`);
  const o = gatesOffer(root, { owner: "@dona" }).codeowners;
  assert.deepEqual({ covered: o.covered, owners: o.owners }, { covered: true, owners: ["@dona"] });
});

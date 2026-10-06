// tests/lib/test-standards-loader-source.mjs — `source` chega pelos dois
// loaders via parser único (ADR-015). Cobre também `overrides` de
// loadStandardsMerged e o scaffold autoral dos 3 geradores do `new` (C13).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { loadStandards, loadStandardsMerged, standardFromText, versionAllows } from "../../scripts/lib/standards-loader.mjs";
import { defaultLevelFor, resolveLevel } from "../../scripts/lib/standards-level.mjs";
import { resolveReadPaths } from "../../scripts/lib/context-paths.mjs";

const SCRIPT = join(process.cwd(), "scripts", "devflow-standards.mjs");
const TAXONOMY = join(process.cwd(), "skills/standards-builder/references/taxonomy-of-concerns.yaml");
const FIX = join(process.cwd(), "tests/validation/fixtures");

function proj() {
  const root = mkdtempSync(join(tmpdir(), "ld-"));
  const d = join(root, ".context/engineering/standards");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "std-a.md"), `---\nid: std-a\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  level: block\n---\n`);
  return { root, d };
}

test("standardFromText preserva source e descarta deprecated", () => {
  assert.equal(standardFromText(`---\nid: std-x\nsource: local\n---\n`, { file: "x", filePath: "/x", origin: "project" }).source, "local");
  assert.equal(standardFromText(`---\nid: std-x\ndeprecated: true\n---\n`, { file: "x", filePath: "/x", origin: "project" }), null);
});

test("source chega pelos dois loaders", () => {
  const { root } = proj();
  assert.equal(loadStandards(root).find(s => s.id === "std-a").source, "local");
  assert.equal(loadStandardsMerged(root, undefined).find(s => s.id === "std-a").source, "local");
});

test("overrides simulam conteúdo proposto, arquivo novo e disable", () => {
  const { root, d } = proj();
  const f = join(d, "std-a.md");
  const lowered = loadStandardsMerged(root, undefined, { files: new Map([[f, `---\nid: std-a\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  level: warn\n---\n`]]) });
  assert.equal(lowered.find(s => s.id === "std-a").enforcement.level, "warn");
  const added = loadStandardsMerged(root, undefined, { files: new Map([[join(d, "std-b.md"), `---\nid: std-b\n---\n`]]) });
  assert.ok(added.some(s => s.id === "std-b"));
  const removed = loadStandardsMerged(root, undefined, { files: new Map([[f, null]]) });
  assert.ok(!removed.some(s => s.id === "std-a"));
  const disabled = loadStandardsMerged(root, undefined, { localYaml: "disable: [std-a]\n" });
  assert.ok(!disabled.some(s => s.id === "std-a"));
  assert.equal(readFileSync(f, "utf8").includes("level: block"), true, "override não toca o disco");
});

test("override de std novo no diretório legado .context/standards ainda inexistente é visto (T16)", () => {
  const { root } = proj();
  const legacy = join(root, ".context/standards");
  const key = join(legacy, "std-legado.md");
  const got = loadStandardsMerged(root, null, { files: new Map([[key, `---\nid: std-legado\nsource: local\napplyTo: ["src/**"]\n---\n`]]) });
  assert.ok(got.some(s => s.id === "std-legado"), "o std proposto no dir legado tem de entrar na simulação");
  // Sem override, nada muda: o dir legado inexistente continua fora da leitura.
  assert.ok(!loadStandardsMerged(root, null).some(s => s.id === "std-legado"));
  assert.deepEqual(resolveReadPaths(root, "standards"), [join(root, ".context/engineering/standards")]);
  assert.deepEqual(resolveReadPaths(root, "standards", { includeMissing: true }),
    [join(root, ".context/engineering/standards"), legacy]);
});

test("disable: em bloco com CRLF desativa o std (mesmo significado que LF; T16 rodada 3)", () => {
  const { root } = proj();
  for (const y of ["disable:\r\n  - std-a\r\n", "disable:\n  - std-a\n", "disable:\r\n  - outro\r\n  - std-a\r\n", "disable: [std-a]\r\n"]) {
    assert.ok(!loadStandardsMerged(root, null, { localYaml: y }).some(s => s.id === "std-a"), JSON.stringify(y));
  }
  assert.ok(loadStandardsMerged(root, null, { localYaml: "disable:\r\n  - outro\r\n" }).some(s => s.id === "std-a"));
});

// M6 (revisão da T16): o item era lido com `(.+)$` depois de tirar só um "\r" final. Terminado em
// "\r\r" ou em U+2028/U+2029 (que o `.` não casa), o item era ignorado — um `disable:` dormente,
// que passava a valer quando alguma ferramenta limpava o fim da linha.
test("disable: em bloco — item terminado em \\r\\r, U+2028 ou U+2029 vale como os outros (M6)", () => {
  const { root } = proj();
  const dormant = [
    "disable:\n  - std-a\r\r\n", "disable:\r\n  - std-a\r\r\n", "disable:\n  - std-a\u2028\n",
    "disable:\n  - std-a\u2029\n", "disable:\n  - outro\n  - std-a \u2028\t", "disable:\n  - std-a\ufeff\n",
  ];
  for (const y of dormant) {
    assert.ok(!loadStandardsMerged(root, null, { localYaml: y }).some(s => s.id === "std-a"), JSON.stringify(y));
  }
  // controles: outro id não desativa; item só com espaço é ignorado sem derrubar os seguintes
  assert.ok(loadStandardsMerged(root, null, { localYaml: "disable:\n  - outro\u2028\n" }).some(s => s.id === "std-a"));
  assert.ok(!loadStandardsMerged(root, null, { localYaml: "disable:\n  -  \u2028\n  - std-a\n" }).some(s => s.id === "std-a"));
});

// Decisão do controller pós-entrega da T17. O parser compartilhado lê cada linha do frontmatter
// com `(.*)$`, e o `.` não casa "\r", U+2028 nem U+2029: uma linha de std terminada num deles era
// PULADA inteira. `deprecated: true` e `level: warn` ficavam sem efeito até alguém limpar o fim da
// linha (config dormente). O loader de std agora tira o espaço Unicode do fim de cada linha do
// bloco de frontmatter antes de ler; o parser genérico não mudou.
const fmOf = (lines, body = "## Corpo\n") => `---\n${lines.join("\n")}\n---\n${body}`;
const stdOf = (lines, body) => standardFromText(fmOf(lines, body), { file: "std-x.md", filePath: "/p/std-x.md", origin: "project" });
// Nome legível do fim de linha testado (os caracteres são invisíveis na mensagem de falha).
const codes = (s) => [...s].map(c => `U+${c.codePointAt(0).toString(16).padStart(4, "0")}`).join(" ");

test("frontmatter de std: `deprecated: true` seguido de espaço Unicode vale (o std sai)", () => {
  for (const end of ["\u2028", "\u2029", "\r\r", " \u2028\t", "\u00a0"]) {
    assert.equal(stdOf(["id: std-x", "source: local", `deprecated: true${end}`]), null, codes(end));
  }
  // controles: sem deprecated o std existe; "true" entre aspas continua sendo string, não booleano
  assert.equal(stdOf(["id: std-x", "source: local\u2028"]).id, "std-x");
  assert.equal(stdOf(["id: std-x", 'deprecated: "true"']).id, "std-x");
});

test("frontmatter de std: `level: warn` seguido de espaço Unicode vale", () => {
  for (const end of ["\u2028", "\u2029", "\r\r"]) {
    const s = stdOf(["id: std-x", "source: local", "enforcement:", `  level: warn${end}`]);
    assert.equal(s.enforcement.level, "warn", codes(end));
    assert.equal(resolveLevel(s, ""), "warn");
  }
  // regra rebaixada, linha `enforcement:` e linter: mesma classe
  const r = stdOf(["id: std-x", "source: local", "enforcement:\u2028", "  level: block\u2028", "  rules:\u2028", "    no-bad: warn\u2028"]);
  assert.equal(resolveLevel(r, "no-bad"), "warn");
  assert.equal(resolveLevel(r, ""), "block");
  const l = stdOf(["id: std-x", "source: local\u2028", "enforcement:", "  linter: engineering/standards/machine/std-x.js\u2028"]);
  assert.equal(l.source, "local");
  assert.equal(l.enforcement.linter, "engineering/standards/machine/std-x.js");
  assert.equal(l.weak, false);
});

test("frontmatter de std: valor entre aspas com espaço dentro é aparado em source, level e linter", () => {
  const s = stdOf(["id: std-x", 'source: "local "', "enforcement:", '  level: " block "', '  linter: " m/x.js "', "  rules:", '    r1: "warn "']);
  assert.equal(s.source, "local");
  assert.equal(s.enforcement.level, "block");
  assert.equal(s.enforcement.linter, "m/x.js");
  assert.equal(resolveLevel(s, "r1"), "warn");
  assert.equal(defaultLevelFor(stdOf(["id: std-x", 'source: "local "'])), "block");
});

test("frontmatter de std: cercas com espaço Unicode no fim contam; o corpo fica como veio", () => {
  const raw = "---\u2028\nid: std-x\u2029\nsource: local\n---\u2028\nlinha 1  \nlinha 2\u2028\n";
  const s = standardFromText(raw, { file: "std-x.md", filePath: "/p/std-x.md", origin: "project" });
  assert.equal(s.id, "std-x");
  assert.equal(s.body, "linha 1  \nlinha 2\u2028\n");
  // CRLF continua valendo o mesmo que LF
  assert.equal(standardFromText("---\r\nid: std-x\r\nsource: local\r\n---\r\ncorpo\r\n", {}).source, "local");
  // sem frontmatter não há std (e nada quebra)
  assert.equal(standardFromText("texto solto \u2028\n", {}), null);
});

test("frontmatter de std pelo loader: o override com `deprecated: true` + U+2028 tira o std", () => {
  const { root, d } = proj();
  const f = join(d, "std-a.md");
  const dep = `---\nid: std-a\nsource: local\ndeprecated: true\u2028\napplyTo: ["src/**"]\nenforcement:\n  level: block\n---\n`;
  assert.ok(!loadStandardsMerged(root, null, { files: new Map([[f, dep]]) }).some(s => s.id === "std-a"));
  const low = `---\nid: std-a\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  level: warn\u2028\n---\n`;
  assert.equal(resolveLevel(loadStandardsMerged(root, null, { files: new Map([[f, low]]) }).find(s => s.id === "std-a"), ""), "warn");
});

test("o parser é o mesmo do loader: chave repetida vale a última", () => {
  const s = standardFromText(`---\nid: std-x\nenforcement:\n  level: block\n  level: warn\n---\n`, { file: "x", filePath: "/x", origin: "project" });
  assert.equal(s.enforcement.level, "warn");
});

test("scaffold do `new` nasce source: local e com linter v2", () => {
  const root = mkdtempSync(join(tmpdir(), "new-"));
  const r = spawnSync("node", [SCRIPT, "new", "demo", `--project=${root}`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(root, ".context/standards/std-demo.md"), "utf8"), /^source: local$/m);
  assert.match(readFileSync(join(root, ".context/standards/machine/std-demo.js"), "utf8"), /VIOLATION \$\{RULE\} \$\{filePath\}:\$\{i \+ 1\}/);
});

test("versionAllows: sem faixa aplica; com faixa e série desconhecida não aplica", () => {
  assert.equal(versionAllows({ appliesFrom: null, appliesUntil: null }, { versions: new Map() }), true);
  assert.equal(versionAllows({ appliesFrom: "1", appliesUntil: null, framework: "odoo" }, { versions: new Map() }), false);
  assert.equal(versionAllows({ appliesFrom: "16", appliesUntil: null, framework: "odoo" }, { versions: new Map([["odoo", "17"]]) }), true);
});

// ─── C13: `source: local` também nos geradores `new --concern` e `new --from-adr` ──

test("new --concern nasce source: local e resolve para block", () => {
  const root = mkdtempSync(join(tmpdir(), "new-concern-"));
  const r = spawnSync("node", [SCRIPT, "new", "--concern=runtime-validation", `--taxonomy=${TAXONOMY}`, `--project=${root}`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const content = readFileSync(join(root, ".context/standards/std-runtime-validation.md"), "utf8");
  assert.match(content, /^source: local$/m);
  const std = standardFromText(content, { file: "std-runtime-validation.md", filePath: "/x", origin: "project" });
  assert.equal(defaultLevelFor(std), "block");
});

test("new --from-adr (legado) nasce source: local e resolve para block", () => {
  const root = mkdtempSync(join(tmpdir(), "new-fromadr-"));
  mkdirSync(join(root, ".context", "adrs"), { recursive: true });
  copyFileSync(join(FIX, "adr-zod-fake.md"), join(root, ".context/adrs/009-adr-zod-frontend-v1.0.0.md"));
  const r = spawnSync("node", [SCRIPT, "new", "zod", "--from-adr=009", `--taxonomy=${TAXONOMY}`, "--yes", `--project=${root}`], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const content = readFileSync(join(root, ".context/standards/std-zod.md"), "utf8");
  assert.match(content, /^source: local$/m);
  const std = standardFromText(content, { file: "std-zod.md", filePath: "/x", origin: "project" });
  assert.equal(defaultLevelFor(std), "block");
});

// ─── Correção — rodada 1 (Important #1 e #2 da revisão) ───────────────────────

test("overrides funcionam com projectRoot RELATIVO e chave absoluta (dir/filePath normalizados)", () => {
  const { root, d } = proj();
  const relRoot = relative(process.cwd(), root);
  // Chave do Map é absoluta (contrato da interface); dir interno do loader vem
  // de um projectRoot relativo — sem normalizar os dois lados, dirname(chave)
  // !== dir e o override é silenciosamente ignorado (o loader lê o disco).
  const key = resolve(join(d, "std-a.md"));
  const list = loadStandardsMerged(relRoot, undefined, {
    files: new Map([[key, `---\nid: std-a\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  level: warn\n---\n`]]),
  });
  assert.equal(list.find(s => s.id === "std-a").enforcement.level, "warn",
    "override deveria vencer mesmo com projectRoot relativo");
});

test("overrides.files com chave NÃO absoluta é recusado com throw (fail loud, não fail silent)", () => {
  const { root } = proj();
  assert.throws(() => {
    loadStandardsMerged(root, undefined, { files: new Map([["std-a.md", "---\nid: std-a\n---\n"]]) });
  }, /absolut/i);
});

test("std ilegível (EACCES) é pulado com aviso — não derruba o loadStandardsMerged", { skip: typeof process.getuid === "function" && process.getuid() === 0 ? "não roda como root: chmod 000 não bloqueia leitura" : false }, () => {
  const { root, d } = proj();
  writeFileSync(join(d, "std-b.md"), `---\nid: std-b\napplyTo: ["src/**"]\n---\n`);
  const unreadable = join(d, "std-c.md");
  writeFileSync(unreadable, `---\nid: std-c\napplyTo: ["src/**"]\n---\n`);
  chmodSync(unreadable, 0o000);
  try {
    const list = loadStandardsMerged(root, undefined);
    assert.ok(list.some(s => s.id === "std-a"), "std-a (legível) deve continuar presente");
    assert.ok(list.some(s => s.id === "std-b"), "std-b (legível) deve continuar presente");
    assert.ok(!list.some(s => s.id === "std-c"), "std-c (ilegível) deve ser pulado, não quebrar o loader");
  } finally {
    chmodSync(unreadable, 0o644); // restaura antes do cleanup do tmpdir
  }
});

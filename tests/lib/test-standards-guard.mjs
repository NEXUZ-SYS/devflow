// tests/lib/test-standards-guard.mjs — catraca no Edit/Write (ADR-015 D6/D8): os vetores da
// revisão R e da re-revisão, os herdados da T4/T7, o C12 (raiz por symlink) e os controles.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyProposedEdit, proposedEditVariants, proposedWriteVariants, evaluateStandardsEdit,
} from "../../scripts/lib/standards-guard.mjs";
import { loadStandardsMerged } from "../../scripts/lib/standards-loader.mjs";
import { readFrameworkVersions } from "../../scripts/lib/devflow-config.mjs";
import { effectiveEnforcement, enforcementWeakenings } from "../../scripts/lib/standards-enforcement-diff.mjs";
import { demoProject as makeProject } from "../helpers/standards-fixture.mjs";

// Todo diretório temporário criado aqui é removido no fim (links e FIFOs saem junto).
const created = [];
const demoProject = (opts) => { const r = makeProject(opts); created.push(r); return r; };
const tmp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); created.push(d); return d; };
after(() => { for (const d of created) rmSync(d, { recursive: true, force: true }); });

const CLI = "scripts/lib/standards-guard-cli.mjs";
const A = `---\nid: std-a\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  linter: engineering/standards/machine/std-a.js\n  level: block\n---\n## Princípios\n- p\n`;
const B = `---\nid: std-b\nsource: local\napplyTo: ["src/**", "lib/**"]\nenforcement:\n  linter: engineering/standards/machine/std-b.js\n---\n`;
function fx() {
  const root = demoProject();
  const S = join(root, ".context/engineering/standards");
  writeFileSync(join(S, "std-a.md"), A); writeFileSync(join(S, "std-b.md"), B);
  writeFileSync(join(S, "machine/std-a.js"), "process.exit(0)"); writeFileSync(join(S, "machine/std-b.js"), "process.exit(0)");
  mkdirSync(join(root, "docs"));
  symlinkSync(join(S, "std-a.md"), join(root, "docs/atalho.md"));
  symlinkSync(join(S, "baseline.json"), join(root, "docs/bl.json"));   // alvo ainda não existe
  return { root, S };
}
const ev = (root, tool, file, ti) => ({ tool_name: tool, cwd: root, tool_input: { file_path: file, ...ti } });
const dec = (root, tool, file, ti) => evaluateStandardsEdit(ev(root, tool, file, ti)).decision;
const LVL_WARN = { old_string: "level: block", new_string: "level: warn" };
const crlf = (s) => s.replace(/\n/g, "\r\n");
const sorted = (xs) => [...xs].sort();

const VECTORS = [
  ["1 ./baseline", (S) => ["Write", `${S}/./baseline.json`, { content: "{}" }], "deny"],
  ["2 //baseline", (S) => ["Write", `${S}//baseline.json`, { content: "{}" }], "deny"],
  ["3 machine/../baseline", (S) => ["Write", `${S}/machine/../baseline.json`, { content: "{}" }], "deny"],
  ["4 Baseline.JSON", (S) => ["Write", `${S}/Baseline.JSON`, { content: "{}" }], "deny"],
  ["5 Write do std com level warn", (S) => ["Write", `${S}/std-a.md`, { content: A.replace("level: block", "level: warn") }], "ask"],
  ["6 rules rebaixa uma regra", (S) => ["Edit", `${S}/std-a.md`, { old_string: "  level: block\n", new_string: "  level: block\n  rules:\n    no-bad: warn\n" }], "ask"],
  ["7 source local→devflow-default", (S) => ["Edit", `${S}/std-b.md`, { old_string: "source: local", new_string: "source: devflow-default" }], "ask"],
  ["8 deprecated: true", (S) => ["Edit", `${S}/std-a.md`, { old_string: "source: local", new_string: "source: local\ndeprecated: true" }], "ask"],
  ["9 remove linter", (S) => ["Edit", `${S}/std-a.md`, { old_string: "  linter: engineering/standards/machine/std-a.js\n", new_string: "" }], "ask"],
  ["10 old_string sem a palavra level", (S) => ["Edit", `${S}/std-a.md`, { old_string: "block\n---", new_string: "warn\n---" }], "ask"],
  ["11 replace_all", (S) => ["Edit", `${S}/std-a.md`, { old_string: "block", new_string: "review", replace_all: true }], "ask"],
  ["12 machine/*.js", (S) => ["Edit", `${S}/machine/std-a.js`, { old_string: "process.exit(0)", new_string: "process.exit(0)//" }], "ask"],
  ["13 chave repetida", (S) => ["Edit", `${S}/std-a.md`, { old_string: "  level: block\n", new_string: "  level: block\n  level: warn\n" }], "ask"],
  ["14 disable no standards.local.yaml", (S, root) => ["Write", join(root, ".context/standards.local.yaml"), { content: "disable: [std-a]\n" }], "ask"],
  ["15 applyTo estreitado", (S) => ["Edit", `${S}/std-b.md`, { old_string: '["src/**", "lib/**"]', new_string: '["src/**"]' }], "ask"],
  ["16 appliesFrom desliga o std", (S) => ["Edit", `${S}/std-a.md`, { old_string: "source: local", new_string: "source: local\nappliesFrom: 1" }], "ask"],
  ["17 symlink fora de standards/ para o std", (S, root) => ["Edit", join(root, "docs/atalho.md"), { old_string: "level: block", new_string: "level: warn" }], "ask"],
  ["18 symlink para o baseline", (S, root) => ["Write", join(root, "docs/bl.json"), { content: "{}" }], "deny"],
];

for (const [name, mk, want] of VECTORS) {
  test(`vetor ${name} → ${want}`, () => {
    const { root, S } = fx();
    const [tool, file, ti] = mk(S, root);
    assert.equal(dec(root, tool, file, ti), want);
  });
}

// Grafias que o Windows trata como o mesmo arquivo (ponto/espaço finais, fluxo NTFS ::$DATA).
const ALIASES = [
  ["baseline.json::$DATA", (S) => ["Write", `${S}/baseline.json::$DATA`, { content: "{}" }], "deny"],
  ["baseline.json. (ponto final)", (S) => ["Write", `${S}/baseline.json.`, { content: "{}" }], "deny"],
  ["std-a.md. com level warn", (S) => ["Write", `${S}/std-a.md.`, { content: A.replace("level: block", "level: warn") }], "ask"],
  ["STD-A.MD com level warn (FS sem caixa)", (S) => ["Write", `${S}/STD-A.MD`, { content: A.replace("level: block", "level: warn") }], "ask"],
  ["Machine/STD-A.JS", (S) => ["Write", `${S}/Machine/STD-A.JS`, { content: "process.exit(0)" }], "ask"],
  // O NTFS compara pela tabela de maiúsculas: "ſ" (s longo) → "S" e "ı" (i sem ponto) → "I".
  ["baſeline.json (s longo)", (S) => ["Write", `${S}/baſeline.json`, { content: "{}" }], "deny"],
  ["BASELıNE.json (i sem ponto)", (S) => ["Write", `${S}/BASELıNE.json`, { content: "{}" }], "deny"],
];

for (const [name, mk, want] of ALIASES) {
  test(`grafia alternativa ${name} → ${want}`, () => {
    const { root, S } = fx();
    const [tool, file, ti] = mk(S, root);
    assert.equal(dec(root, tool, file, ti), want);
  });
}

test("versões do .devflow.yaml que tiram um std da faixa contam como enfraquecer", () => {
  const std = { id: "std-o", source: "local", applyTo: ["**/*.py"], enforcement: { level: "block" }, appliesFrom: "16", appliesUntil: null, framework: "odoo" };
  const before = effectiveEnforcement([std], { versions: new Map([["odoo", "17"]]) });
  const after = effectiveEnforcement([std], { versions: new Map([["odoo", "15"]]) });
  assert.match(enforcementWeakenings(before, after).join("\n"), /faixa de versão/);
});

test("controles: promover, editar texto e std novo mais forte seguem", () => {
  const { root, S } = fx();
  assert.equal(dec(root, "Edit", `${S}/std-b.md`, { old_string: "source: local", new_string: "source: local\nx: 1" }), "");
  assert.equal(dec(root, "Edit", `${S}/std-a.md`, { old_string: "- p", new_string: "- p melhor" }), "");
  assert.equal(dec(root, "Write", `${S}/std-c.md`, { content: "---\nid: std-c\nsource: local\napplyTo: [\"src/**\"]\n---\n" }), "");
  assert.equal(dec(root, "Edit", join(root, "src/a.js"), { old_string: "a", new_string: "b" }), "");
  // promover: warn → block e regra nova mais forte
  assert.equal(dec(root, "Edit", `${S}/std-b.md`, { old_string: "  linter:", new_string: "  level: block\n  linter:" }), "");
  // README do diretório de standards não é std (o loader o ignora)
  assert.equal(dec(root, "Write", `${S}/README.md`, { content: "# leia-me\n" }), "");
});

// --- C12: a chave do override casa com a do loader quando a raiz passa por symlink ---------

test("C12: raiz acessada por symlink + rebaixamento de nível → ask (nas 3 combinações)", () => {
  const { root, S } = fx();
  const link = join(tmp("lnk-"), "proj");
  symlinkSync(root, link);
  const SL = join(link, ".context/engineering/standards");
  assert.equal(dec(link, "Edit", `${SL}/std-a.md`, LVL_WARN), "ask", "cwd e arquivo pelo link");
  assert.equal(dec(link, "Edit", `${S}/std-a.md`, LVL_WARN), "ask", "cwd pelo link, arquivo pelo caminho real");
  assert.equal(dec(root, "Edit", `${SL}/std-a.md`, LVL_WARN), "ask", "cwd real, arquivo pelo link");
  // controle: edição neutra pelo link segue
  assert.equal(dec(link, "Edit", `${SL}/std-a.md`, { old_string: "- p", new_string: "- p2" }), "");
});

// --- Herdados da T4 -------------------------------------------------------------------------

test("T4: std novo no diretório legado .context/standards ainda inexistente é visto (sombra um default)", () => {
  const root = demoProject({ isolate: false });
  assert.ok(!existsSync(join(root, ".context/standards")));
  const content = "---\nid: std-security\nsource: devflow-default\napplyTo: [\"nada/**\"]\n---\n";
  assert.equal(dec(root, "Write", join(root, ".context/standards/std-security.md"), { content }), "ask");
});

test("T4: level com erro de digitação (blok) num std local rebaixa para warn → ask", () => {
  const { root, S } = fx();
  assert.equal(dec(root, "Edit", `${S}/std-a.md`, { old_string: "level: block", new_string: "level: blok" }), "ask");
  const r = evaluateStandardsEdit(ev(root, "Edit", `${S}/std-a.md`, { old_string: "level: block", new_string: "level: blok" }));
  assert.match(r.reason, /std-a: nível block → warn/);
});

// --- Herdados da T7 -------------------------------------------------------------------------

test("T7: diretório de standards por symlink → edição neutra pede ask; alvo físico vira o lógico", () => {
  const root = demoProject();
  const ext = tmp("ext-");
  const S = join(root, ".context/engineering/standards");
  renameSync(S, join(ext, "standards"));
  symlinkSync(join(ext, "standards"), S);
  assert.equal(dec(root, "Edit", `${S}/std-demo.md`, { old_string: "- sem BAD", new_string: "- sem BAD!" }), "ask");
  assert.equal(dec(root, "Edit", join(ext, "standards/std-demo.md"), LVL_WARN), "ask");
  assert.equal(dec(root, "Write", join(ext, "standards/baseline.json"), { content: "{}" }), "deny");
  assert.equal(dec(root, "Write", `${S}/baseline.json`, { content: "{}" }), "deny");
});

test("T7: baseline.json que é symlink para fora: o caminho LÓGICO decide (deny)", () => {
  const { root, S } = fx();
  const out = join(tmp("out-"), "b.json");
  symlinkSync(out, join(S, "baseline.json"));
  assert.equal(dec(root, "Write", `${S}/baseline.json`, { content: "{}" }), "deny");
  assert.equal(dec(root, "Edit", `${S}/baseline.json`, { old_string: "a", new_string: "b" }), "deny");
});

test("T7: RealPathLoopError no caminho editado fecha com ask", () => {
  const { root } = fx();
  symlinkSync(join(root, "docs/l2"), join(root, "docs/l1"));
  symlinkSync(join(root, "docs/l1"), join(root, "docs/l2"));
  assert.equal(dec(root, "Write", join(root, "docs/l1"), { content: "x" }), "ask");
  assert.equal(dec(root, "Write", join(root, "docs/l1/std-a.md"), { content: "x" }), "ask");
});

// --- Outros caminhos para o mesmo arquivo -----------------------------------------------------

test("hardlink fora de standards/ para o std conta como o alvo", () => {
  const { root, S } = fx();
  linkSync(join(S, "std-a.md"), join(root, "docs/hl.md"));
  assert.equal(dec(root, "Edit", join(root, "docs/hl.md"), LVL_WARN), "ask");
  assert.equal(dec(root, "Edit", join(root, "docs/hl.md"), { old_string: "- p", new_string: "- p2" }), "");
  // hardlink para o linter (machine/**) e para o standards.local.yaml
  linkSync(join(S, "machine/std-a.js"), join(root, "docs/lint.js"));
  assert.equal(dec(root, "Edit", join(root, "docs/lint.js"), { old_string: "process.exit(0)", new_string: "process.exit(0)//" }), "ask");
  linkSync(join(root, ".context/standards.local.yaml"), join(root, "docs/local.yaml"));
  assert.equal(dec(root, "Write", join(root, "docs/local.yaml"), { content: "disable: [std-a]\n" }), "ask");
});

test("std que é symlink dentro de standards/ (o loader ignora): simula as duas hipóteses de escrita", () => {
  const { root, S } = fx();
  const ext = tmp("ext-");
  writeFileSync(join(ext, "x.md"), A.replace("std-a", "std-x"));
  // "0-x.md" ordena antes de "std-a.md": no mesmo diretório o primeiro id vence no loader.
  symlinkSync(join(ext, "x.md"), join(S, "0-x.md"));
  // Se o Write substituir o link por arquivo regular, 0-x.md passa a valer como um std-a fraco.
  assert.equal(dec(root, "Write", `${S}/0-x.md`, { content: A.replace("level: block", "level: warn") }), "ask");
  // Gravando através do link (o alvo fica fora de standards/), nada do loader muda.
  assert.equal(dec(root, "Write", join(ext, "x.md"), { content: A.replace("level: block", "level: warn") }), "");
});

test("Edit em arquivo da catraca com old_string que não casa exato → ask (não dá para simular)", () => {
  const { root, S } = fx();
  // O Edit do Claude Code normaliza aspas curvas: o guard não pode afirmar que nada muda.
  assert.equal(dec(root, "Edit", `${S}/std-b.md`, { old_string: "[“src/**”, “lib/**”]", new_string: "[“src/**”]" }), "ask");
  // Idem no .devflow.yaml e no standards.local.yaml (o arquivo é classificado mesmo sem faixa de versão).
  writeFileSync(join(root, ".context/.devflow.yaml"), "git:\n  strategy: trunk-based\n");
  assert.equal(dec(root, "Edit", join(root, ".context/.devflow.yaml"), { old_string: "nao-existe", new_string: "x" }), "ask");
  assert.equal(dec(root, "Edit", join(root, ".context/.devflow.yaml"), { old_string: "trunk-based", new_string: "trunk-based # ok" }), "");
  assert.equal(dec(root, "Edit", join(root, ".context/standards.local.yaml"), { old_string: "nao-existe", new_string: "x" }), "ask");
  // Edit em arquivo da catraca inexistente (ENOENT) com old_string não vazio: não dá para
  // decidir (a forma que a ferramenta lê pode ser outra) → ask (rodada 1 da T16).
  assert.equal(dec(root, "Edit", `${S}/std-zz.md`, { old_string: "a", new_string: "b" }), "ask");
  // old_string vazio cria o arquivo: simula como Write.
  assert.equal(dec(root, "Edit", `${S}/std-zz.md`, { old_string: "", new_string: "---\nid: std-zz\nsource: local\napplyTo: [\"src/**\"]\n---\n" }), "");
});

test("arquivo atual da catraca que não é regular (FIFO) → ask, sem travar", { skip: process.platform === "win32" }, () => {
  const { root, S } = fx();
  spawnSync("mkfifo", [join(S, "std-f.md")]);
  spawnSync("mkfifo", [join(root, ".context/.devflow.yaml")]);
  const t0 = Date.now();
  assert.equal(dec(root, "Edit", `${S}/std-f.md`, { old_string: "a", new_string: "b" }), "ask");
  assert.equal(dec(root, "Write", join(root, ".context/.devflow.yaml"), { content: "git: {}\n" }), "ask");
  assert.ok(Date.now() - t0 < 2000, `demorou ${Date.now() - t0} ms`);
});

test("a razão não carrega controle, bidi nem <> vindos do id do std", () => {
  const { root, S } = fx();
  writeFileSync(join(S, "std-x.md"), "---\nid: std-x‮<b>\u0007\nsource: local\napplyTo: [\"src/**\"]\n---\n");
  const r = evaluateStandardsEdit(ev(root, "Write", `${S}/std-x.md`, { content: "x" }));
  assert.equal(r.decision, "ask");
  assert.match(r.reason, /std-x/);
  assert.doesNotMatch(r.reason, /[‮\u0007<>]/);
});

test("baseline é negado mesmo fora da raiz da sessão (outro projeto) e com cwd vazio", () => {
  const { S } = fx();
  const other = tmp("outro-");
  assert.equal(dec(other, "Write", `${S}/baseline.json`, { content: "{}" }), "deny");
  assert.equal(evaluateStandardsEdit({ tool_name: "Write", tool_input: { file_path: `${S}/baseline.json`, content: "{}" } }).decision, "deny");
});

test("shim .context/bin/devflow-standards.mjs → ask", () => {
  const { root } = fx();
  assert.equal(dec(root, "Write", join(root, ".context/bin/devflow-standards.mjs"), { content: "x" }), "ask");
});

// --- Funções puras ---------------------------------------------------------------------------

test("applyProposedEdit: Write, 1ª ocorrência, replace_all, ausente e $& literal", () => {
  assert.equal(applyProposedEdit("abc", { content: "z" }, "Write"), "z");
  assert.equal(applyProposedEdit("a-a", { old_string: "a", new_string: "b" }, "Edit"), "b-a");
  assert.equal(applyProposedEdit("a-a", { old_string: "a", new_string: "b", replace_all: true }, "Edit"), "b-b");
  assert.equal(applyProposedEdit("abc", { old_string: "x", new_string: "y" }, "Edit"), "abc");
  assert.equal(applyProposedEdit("abc", { old_string: "b", new_string: "$&$&" }, "Edit"), "a$&$&c");
  // Edit ignora `content` (o evento pode trazer os dois campos)
  assert.equal(applyProposedEdit("abc", { content: "z", old_string: "b", new_string: "B" }, "Edit"), "aBc");
});

const S0 = { id: "std-s", source: "local", applyTo: ["src/**"], enforcement: { level: "block", linter: "machine/s.js", rules: { r1: "block" } } };
const with_ = (patch) => ({ ...S0, ...patch, enforcement: { ...S0.enforcement, ...(patch.enforcement || {}) } });
const weak = (a, b) => enforcementWeakenings(effectiveEnforcement([a]), effectiveEnforcement(b ? [b] : []));

test("enforcementWeakenings: cada dimensão que enfraquece", () => {
  assert.match(weak(S0, null).join(), /std-s: standard removido/);
  assert.match(weak(S0, with_({ enforcement: { level: "warn" } })).join(), /std-s: nível block → warn/);
  assert.match(weak(S0, with_({ enforcement: { rules: { r1: "warn" } } })).join(), /regra r1 block → warn/);
  assert.match(weak(S0, with_({ enforcement: { rules: { r1: "block", r2: "review" } } })).join(), /regra r2 block → review/);
  assert.match(weak(S0, with_({ enforcement: { linter: "machine/t.js" } })).join(), /linter machine\/s\.js → machine\/t\.js/);
  assert.match(weak(S0, with_({ enforcement: { linter: undefined } })).join(), /linter machine\/s\.js → removido/);
  assert.match(weak(S0, with_({ applyTo: ["src/a/**"] })).join(), /applyTo perdeu src\/\*\*/);
  assert.match(weak(S0, with_({ enforcement: { level: "blok", rules: {} } })).join(), /nível block → warn/);
  assert.match(weak(S0, with_({ enforcement: { level: "warn", rules: { r1: "warn" } } })).join(), /nível máximo block → warn/);
});

test("enforcementWeakenings: promover e mudar só texto não enfraquecem", () => {
  const w = with_({ enforcement: { level: "warn", rules: { r1: "warn" } } });
  assert.deepEqual(weak(w, S0), []);
  assert.deepEqual(weak(S0, with_({ applyTo: ["src/**", "lib/**"], description: "x" })), []);
});

test("enforcementWeakenings: id, linter e glob do projeto passam por inlineSafe", () => {
  const evil = with_({ id: "std-‮<x>\u001b[31m", applyTo: ["src/\u0007**"], enforcement: { linter: "m/<a>.js" } });
  const out = weak(evil, null).concat(weak(evil, { ...evil, applyTo: [], enforcement: {} })).join("\n");
  assert.doesNotMatch(out, /[‮\u0007\u001b<>]/);
});

// --- CLI ----------------------------------------------------------------------------------

test("CLI: stdin evento → stdout {decision, reason}; lixo → decisão vazia", () => {
  const { root, S } = fx();
  const run = (input) => spawnSync(process.execPath, [CLI], { input, encoding: "utf8" });
  const r = run(JSON.stringify(ev(root, "Write", `${S}/baseline.json`, { content: "{}" })));
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.decision, "deny");
  assert.match(out.reason, /baseline/);
  assert.ok(r.stdout.startsWith('{"decision":"deny",'), "a decisão é a 1ª chave (o hook casa o prefixo)");
  assert.deepEqual(JSON.parse(run("não é json").stdout), { decision: "", reason: "" });
  assert.equal(JSON.parse(run(JSON.stringify(ev(root, "Edit", `${S}/std-a.md`, LVL_WARN))).stdout).decision, "ask");
  // o disco não foi tocado pela simulação
  assert.equal(readFileSync(join(S, "std-a.md"), "utf8"), A);
  assert.ok(!existsSync(join(S, "baseline.json")));
});

// --- Rodada 1 (revisão de segurança) ----------------------------------------------------------

// Critical: o Edit do Claude Code (2.1.288, função `j`) com new_string vazio, old_string sem
// "\n" final e `old + "\n"` presente troca `old + "\n"` — a linha seguinte é emendada na atual.
const STD_V = `---\nid: std-v\nversion: 1.0.0\nsource: local\napplyTo: ["src/**"]\n---\n`;
const STD_N = `---\n# nota\nid: std-n\nsource: local\napplyTo: ["src/**"]\nenforcement:\n  level: block\n---\n`;
const STD_D = `---\nid: std-d\nsource: local\napplyTo: ["src/**"]\ndescription: regra do projeto\nenforcement:\n  linter: engineering/standards/machine/std-d.js\n  level: block\n---\n`;

test("proposedEditVariants: literal + emenda de linha (new_string vazio), como o Edit do Claude Code", () => {
  // (rodada 3: a visão da ferramenta sai também em CRLF — as formas \r\n abaixo vêm dela)
  const set = (src, ti) => sorted(proposedEditVariants(src, ti));
  assert.deepEqual(set("a 1\nb", { old_string: "1", new_string: "" }), sorted(["a \nb", "a b", "a \r\nb"]));
  // a emenda usa a 1ª ocorrência de `old + "\n"`, não a 1ª de `old`
  assert.deepEqual(set("1 x\n1\ny", { old_string: "1", new_string: "" }), sorted([" x\n1\ny", "1 x\ny", " x\r\n1\r\ny", "1 x\r\ny"]));
  assert.deepEqual(set("1\n1\n", { old_string: "1", new_string: "", replace_all: true }), sorted(["\n\n", "", "\r\n\r\n"]));
  // sem as condições (new_string não vazio, old termina em \n, sem old+\n) → só a literal
  assert.deepEqual(set("a 1\nb", { old_string: "1", new_string: "2" }), sorted(["a 2\nb", "a 2\r\nb"]));
  assert.deepEqual(set("a 1\nb", { old_string: "1\n", new_string: "" }), ["a b"]);
  assert.deepEqual(set("a 1", { old_string: "1", new_string: "" }), ["a "]);
});

for (const [name, file, content, ti] of [
  ["`version: 1.0.0` → '' engole o source (block → warn)", "std-v.md", STD_V, { old_string: "1.0.0", new_string: "" }],
  ["`# nota` → '' comenta o id (std some)", "std-n.md", STD_N, { old_string: "nota", new_string: "" }],
  ["`do projeto` → '' engole o enforcement (linter some)", "std-d.md", STD_D, { old_string: "do projeto", new_string: "" }],
  ["replace_all com emenda", "std-v.md", STD_V, { old_string: "1.0.0", new_string: "", replace_all: true }],
]) {
  test(`emenda de linha do Edit: ${name} → ask`, () => {
    const { root, S } = fx();
    writeFileSync(join(S, file), content);
    assert.equal(dec(root, "Edit", join(S, file), ti), "ask");
  });
}

// Important: o Claude Code expande "~/" e resolve ".." pelo TEXTO antes de tocar o disco; o
// kernel resolve ".." fisicamente. As duas formas valem, e o estado atual é lido pela textual.
test("caminho normalizado como texto: x inexistente/../std-a.md rebaixando → ask", () => {
  const { root, S } = fx();
  assert.equal(dec(root, "Edit", `${S}/x/../std-a.md`, LVL_WARN), "ask");
});

test("caminho normalizado como texto: .context/x/../standards.local.yaml com disable → ask", () => {
  const { root } = fx();
  assert.equal(dec(root, "Edit", join(root, ".context") + "/x/../standards.local.yaml", { old_string: "disable: [", new_string: "disable: [std-a, " }), "ask");
});

test("caminho normalizado como texto: docs/sdir/../sdir/baseline.json (sdir → standards) → deny", () => {
  const { root, S } = fx();
  symlinkSync(S, join(root, "docs/sdir"));
  assert.equal(dec(root, "Write", join(root, "docs") + "/sdir/../sdir/baseline.json", { content: "{}" }), "deny");
});

test("caminho com ~/ expandido pelo HOME: ~/../…/std-a.md rebaixando → ask", () => {
  const { root, S } = fx();
  const home = join(root, "casa", "de", "alguem");
  mkdirSync(home, { recursive: true });
  const saved = process.env.HOME;
  process.env.HOME = home;
  try {
    const up = "../".repeat(home.split("/").filter(Boolean).length);
    assert.equal(dec(root, "Edit", `~/${up}${S.slice(1)}/std-a.md`, LVL_WARN), "ask");
    assert.equal(dec(root, "Write", `~/${up}${S.slice(1)}/baseline.json`, { content: "{}" }), "deny");
  } finally {
    if (saved === undefined) delete process.env.HOME; else process.env.HOME = saved;
  }
});

// M3: comportamento ATUAL fixado. O loader não lê `framework` do frontmatter (bug antigo, backlog
// ADR-008): um std com faixa de versão fica inativo com QUALQUER .devflow.yaml (o Map de versões
// existe e não tem a chave `undefined`). Por isso, mudar as versões no .devflow.yaml não enfraquece
// nada hoje. QUANDO a ADR-008 for corrigida (o loader passar a trazer `framework`), este teste
// quebra de propósito: reavaliar o guard (o caminho do .devflow.yaml passa a valer de verdade).
test("M3: std com faixa fica inativo com qualquer .devflow.yaml (loader sem `framework`) — fixa o atual", () => {
  const { root, S } = fx();
  writeFileSync(join(S, "std-a.md"), A.replace("source: local", "source: local\nframework: odoo\nappliesFrom: 16"));
  const cfg17 = "frameworks:\n  odoo:\n    version: \"17\"\n";
  writeFileSync(join(root, ".context/.devflow.yaml"), cfg17);
  const std = loadStandardsMerged(root, null).find((s) => s.id === "std-a");
  assert.equal(std.framework, undefined, "o loader não traz `framework`");
  const ee = effectiveEnforcement([std], { versions: readFrameworkVersions(cfg17) });
  assert.equal(ee.get("std-a").active, false, "inativo mesmo com odoo 17 dentro da faixa");
  // logo, tirar a série da faixa pelo .devflow.yaml não enfraquece nada hoje
  assert.equal(dec(root, "Write", join(root, ".context/.devflow.yaml"), { content: cfg17.replace("17", "15") }), "");
});

// --- Rodada 2: a visão da ferramenta (o Edit do Claude Code transforma texto e caminho) ---------
// Modelo (2.1.288): CRLF → LF antes do `j`; fora de .md/.mdx tira o espaço final de cada linha do
// new_string; aplica `j` (literal ou emenda); regrava com CRLF se o original tinha mais CRLF que
// LF; e faz trim() no file_path.

test("proposedEditVariants: inclui a visão da ferramenta (CRLF normalizado, espaço final, CRLF de volta)", () => {
  // (rodada 3: a visão da ferramenta sai em LF e em CRLF)
  assert.deepEqual(sorted(proposedEditVariants("a 1\r\nb\r\n", { old_string: "1", new_string: "" })),
    sorted(["a \r\nb\r\n", "a b\r\n", "a \nb\n", "a b\n"]));
  assert.deepEqual(sorted(proposedEditVariants("x ZZ\ny", { old_string: "ZZ", new_string: " " })),
    sorted(["x  \ny", "x \ny", "x y", "x  \r\ny", "x \r\ny"]));
  // old_string que só casa na visão normalizada (LF num arquivo CRLF)
  assert.deepEqual(sorted(proposedEditVariants("p\r\nq\r\n", { old_string: "p\nq", new_string: "P\nQ" })), sorted(["P\r\nQ\r\n", "P\nQ\n"]));
  // controle LF: a literal (e a mesma em CRLF, da visão da ferramenta)
  assert.deepEqual(sorted(proposedEditVariants("a 1\nb", { old_string: "1", new_string: "2" })), sorted(["a 2\nb", "a 2\r\nb"]));
});

test("N1: std CRLF, `1.0.0` → '' (a ferramenta emenda no LF e regrava CRLF): source some → ask", () => {
  const { root, S } = fx();
  writeFileSync(join(S, "std-v.md"), crlf(STD_V));
  assert.equal(dec(root, "Edit", join(S, "std-v.md"), { old_string: "1.0.0", new_string: "" }), "ask");
});

test("N1b: std CRLF, `# nota` → '' comenta o id → ask", () => {
  const { root, S } = fx();
  writeFileSync(join(S, "std-n.md"), crlf(STD_N));
  assert.equal(dec(root, "Edit", join(S, "std-n.md"), { old_string: "nota", new_string: "" }), "ask");
});

test("N2: standards.local.yaml, `ZZ` → ' ' (espaço final tirado fora de .md) emenda e desativa std-a → ask", () => {
  const { root } = fx();
  writeFileSync(join(root, ".context/standards.local.yaml"), "disable: [a, sZZ\ntd-a]\n");
  assert.equal(dec(root, "Edit", join(root, ".context/standards.local.yaml"), { old_string: "ZZ", new_string: " " }), "ask");
});

test("N7: file_path com espaço inicial/final (a ferramenta faz trim) cai na catraca", () => {
  const { root, S } = fx();
  const weak = { content: A.replace("level: block", "level: warn") };
  assert.equal(dec(root, "Write", ` ${S}/std-a.md`, weak), "ask");
  assert.equal(dec(root, "Write", `${S}/std-a.md \n`, weak), "ask");
  assert.equal(dec(root, "Edit", `\t${S}/std-a.md`, LVL_WARN), "ask");
  assert.equal(dec(root, "Write", ` ${S}/baseline.json`, { content: "{}" }), "deny");
});

test("controles CRLF/LF: edição neutra segue nas duas visões", () => {
  const { root, S } = fx();
  writeFileSync(join(S, "std-a.md"), crlf(A));
  assert.equal(dec(root, "Edit", join(S, "std-a.md"), { old_string: "- p", new_string: "- p2" }), "");
  // old_string com LF casa só na visão normalizada do arquivo CRLF: simula, não pede ask
  assert.equal(dec(root, "Edit", join(S, "std-a.md"), { old_string: "## Princípios\n- p", new_string: "## Princípios\n- p2" }), "");
  // rebaixamento no CRLF continua ask
  assert.equal(dec(root, "Edit", join(S, "std-a.md"), LVL_WARN), "ask");
  // não casa em nenhuma visão → ask
  assert.equal(dec(root, "Edit", join(S, "std-a.md"), { old_string: "nao-existe", new_string: "x" }), "ask");
  // LF intacto
  assert.equal(dec(root, "Edit", join(S, "std-b.md"), { old_string: "source: local", new_string: "source: local\nx: 1" }), "");
});

// --- Rodada 3: N8 — a ferramenta escolhe o fim de linha pelos primeiros 4096 caracteres ----------
// (`zCn(raw.slice(0, 4096))`) e regrava o arquivo inteiro com ele; o loader ignorava item de
// `disable:` em bloco terminado em "\r". Um standards.local.yaml de fim de linha misto guardava um
// `disable:` dormente (CRLF) que qualquer Edit despertava (regravado em LF).
const Y5 = "marca: 1\n" + "# a\n".repeat(1000) + "# b\r\n".repeat(1200) + "disable:\r\n  - std-a\r\n";

test("N8: Edit qualquer num standards.local.yaml de fim de linha misto → ask", () => {
  const { root } = fx();
  writeFileSync(join(root, ".context/standards.local.yaml"), Y5);
  assert.equal(dec(root, "Edit", join(root, ".context/standards.local.yaml"), { old_string: "marca: 1", new_string: "marca: 2" }), "ask");
  assert.equal(dec(root, "Edit", join(root, ".context/standards.local.yaml"), { old_string: "#", new_string: "", replace_all: true }), "ask");
});

test("N8: fim de linha misto (CRLF e LF sem CR) num arquivo da catraca → ask direto (Edit e Write)", () => {
  const { root, S } = fx();
  writeFileSync(join(S, "std-a.md"), A.replace("## Princípios\n", "## Princípios\r\n"));
  assert.equal(dec(root, "Edit", join(S, "std-a.md"), { old_string: "- p", new_string: "- p2" }), "ask");
  assert.equal(dec(root, "Write", join(S, "std-c.md"), { content: "---\r\nid: std-c\r\nsource: local\napplyTo: [\"src/**\"]\r\n---\r\n" }), "ask");
  // controles: CRLF puro e LF puro, edição neutra → nada
  writeFileSync(join(S, "std-a.md"), crlf(A));
  assert.equal(dec(root, "Edit", join(S, "std-a.md"), { old_string: "- p", new_string: "- p2" }), "");
  assert.equal(dec(root, "Write", join(S, "std-c.md"), { content: crlf("---\nid: std-c\nsource: local\napplyTo: [\"src/**\"]\n---\n") }), "");
});

test("N8: o Write que planta o disable dormente (CRLF no fim de um arquivo misto) já pede ask", () => {
  const { root } = fx();
  writeFileSync(join(root, ".context/standards.local.yaml"), "marca: 1\n");
  assert.equal(dec(root, "Write", join(root, ".context/standards.local.yaml"), { content: Y5 }), "ask");
});

test("proposedEditVariants: a visão da ferramenta sai em LF E em CRLF (a escolha dela olha só 4096 caracteres)", () => {
  // primeira linha com mais de 4096 caracteres: a ferramenta não vê "\n" e grava LF, embora o
  // arquivo inteiro seja CRLF
  const big = "x".repeat(5000) + "\r\na\r\n";
  const v = proposedEditVariants(big, { old_string: "a", new_string: "b" });
  assert.ok(v.includes("x".repeat(5000) + "\nb\n"), "falta a saída em LF");
  assert.ok(v.includes("x".repeat(5000) + "\r\nb\r\n"), "falta a saída em CRLF");
});

// --- M5 (revisão da T16): o Write também perde o espaço final de cada linha fora de .md/.mdx ------
// O guard simula o conteúdo como veio E sem o espaço final. U+2028 conta como espaço final para a
// ferramenta (`\s+$`), mas não para o `.` de uma regex: o item de `disable:` terminado nele só
// passa a valer depois da limpeza.
const LOCAL = ".context/standards.local.yaml";

test("M5: Write de standards.local.yaml cujo disable só vale sem o espaço final de linha → ask", () => {
  const { root } = fx();
  assert.equal(dec(root, "Write", join(root, LOCAL), { content: "disable:\n  - std-a\u2028\n" }), "ask");
  assert.equal(dec(root, "Write", join(root, LOCAL), { content: "disable:\n  - std-a\u2029 \n" }), "ask");
  // caso citado na revisão: espaço comum no fim do item (o loader já tirava; continua ask)
  assert.equal(dec(root, "Write", join(root, LOCAL), { content: "disable:\n  - std-a \n" }), "ask");
  // controles: o id sem o espaço final não é de nenhum std → nada
  assert.equal(dec(root, "Write", join(root, LOCAL), { content: "disable:\n  - outro\u2028\n" }), "");
  assert.equal(dec(root, "Write", join(root, LOCAL), { content: "# nota \nmarca: 1\t\n" }), "");
});

test("M5: Edit que cria o standards.local.yaml (old_string vazio) passa pela mesma limpeza → ask", () => {
  const { root } = fx();
  rmSync(join(root, LOCAL)); // a fixture nasce com o arquivo (isolateFromDefaults); aqui ele é criado
  assert.equal(dec(root, "Edit", join(root, LOCAL), { old_string: "", new_string: "disable:\n  - std-a\u2028\n" }), "ask");
  assert.equal(dec(root, "Edit", join(root, LOCAL), { old_string: "", new_string: "disable:\n  - outro\u2028\n" }), "");
});

test("M5: proposedWriteVariants — fora de .md/.mdx entra o conteúdo sem o espaço final de cada linha", () => {
  assert.deepEqual(proposedWriteVariants("a \nb\t\r\nc\u2028\n"), ["a \nb\t\r\nc\u2028\n", "a\nb\r\nc\n"]);
  assert.deepEqual(proposedWriteVariants("a\nb\r\n"), ["a\nb\r\n"], "sem espaço final: uma leitura só");
  assert.deepEqual(proposedWriteVariants("a \n", { markdown: true }), ["a \n"], ".md/.mdx: a ferramenta não limpa");
});

// Decisão do controller pós-entrega da T17: o loader de std tira o espaço Unicode do fim de cada
// linha do frontmatter antes de ler. `deprecated: true` ou `level: warn` seguidos de U+2028 valem
// na hora, e o Write que os grava pede ask — em .md, onde a ferramenta não limpa o fim da linha.
// (Este teste fixava o contrário: o parser pulava a linha e o Write passava calado. Com a linha
// lida, a variante "sem espaço final" da M5 deixou de mudar a decisão num std; a regra da
// extensão fica presa pelo teste de proposedWriteVariants.)
test("frontmatter de std: campo com U+2028 no fim da linha não fica dormente — o Write pede ask", () => {
  const { root, S } = fx();
  const deprecated = A.replace("source: local\n", "source: local\ndeprecated: true\u2028\n");
  assert.equal(dec(root, "Write", join(S, "std-a.md"), { content: deprecated }), "ask");
  assert.equal(dec(root, "Write", join(S, "std-a.md"), { content: A.replace("level: block\n", "level: warn\u2028\n") }), "ask");
  assert.equal(dec(root, "Write", join(S, "std-a.md"), { content: A.replace("  linter: engineering/standards/machine/std-a.js\n", "  linter: null\u2028\n") }), "ask");
  // o mesmo conteúdo por um nome que não termina em .md (symlink) também
  symlinkSync(join(S, "std-a.md"), join(root, "docs/atalho.txt"));
  assert.equal(dec(root, "Write", join(root, "docs/atalho.txt"), { content: deprecated }), "ask");
  // controles: o espaço Unicode numa linha que não muda o enforcement → nada
  assert.equal(dec(root, "Write", join(S, "std-a.md"), { content: A.replace("source: local\n", "source: local\u2028\n") }), "");
  assert.equal(dec(root, "Write", join(S, "std-a.md"), { content: A.replace("level: block\n", "level: block\u2028\n") }), "");
});

// tests/scripts/test-standards-linter-templates.mjs — os moldes de linter que o próprio plugin
// entrega (o de `standards new` e o stub do `eject --with-linter`) ensinam o protocolo v2 e não
// cortam a saída em pipe (I-1 e Minor 1 da revisão final). Com o protocolo legado a catraca do
// standard conta por arquivo; com `process.exit()` logo depois do console.log, achados somem.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { parseLinterOutput } from "../../scripts/lib/linter-protocol.mjs";
import { contextPaths } from "../../scripts/lib/context-paths.mjs";

const REPO = resolve(import.meta.dirname, "../..");
const CLI = join(REPO, "scripts/devflow-standards.mjs");
const MANY = 8000; // ~600 KB de saída: bem acima do buffer de um pipe
const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "lint-tpl-")); dirs.push(d); return d; };
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const cli = (project, ...args) => spawnSync("node", [CLI, ...args, `--project=${project}`], {
  encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO },
});
// Como o engine roda um linter: `node <linter> <arquivo>`, com o stdout num pipe.
const lint = (linter, file) => spawnSync(process.execPath, [linter, file], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const findings = (r, stdId, file) => parseLinterOutput(r.stdout, { stdId, filePath: file });

// O mesmo, com o processo pai ocupado: o laço de eventos fica parado enquanto o linter escreve,
// então o pipe enche antes de alguém ler. É a situação do engine, que roda vários linters ao
// mesmo tempo. Quem chama `process.exit()` com escrita pendente perde o que não coube no pipe;
// quem usa `process.exitCode` espera drenar. Nada do que chegou ao pipe é descartado aqui.
function lintBusyReader(linter, file, busyMs = 400) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [linter, file], { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => { stdout += d; });
    child.on("error", fail);
    child.on("close", (status) => done({ status, stdout }));
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, busyMs); // bloqueia este processo
  });
}

function sample(dir, lines) {
  const file = join(dir, "sample.txt");
  writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

test("standards new: o linter gerado emite uma linha v2 por ocorrência e entrega todas em pipe", async () => {
  const project = tmp();
  const made = cli(project, "new", "demo-rule");
  assert.equal(made.status, 0, made.stderr);
  const linter = join(project, ".context/standards/machine/std-demo-rule.js");

  const small = sample(project, ["ok", "badPattern aqui", "ok", "ok", "outro badPattern"]);
  const r = lint(linter, small);
  assert.equal(r.status, 1, r.stderr);
  assert.deepEqual(findings(r, "std-demo-rule", small).map((f) => [f.ruleId, f.line]), [["demo-rule", 2], ["demo-rule", 5]]);

  const clean = lint(linter, sample(tmp(), ["ok", "ok"]));
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stdout, "");

  // Saída grande: nenhuma linha pode se perder (process.exit logo depois do console.log corta).
  const big = sample(project, Array.from({ length: MANY }, () => "badPattern"));
  const b = await lintBusyReader(linter, big);
  assert.equal(b.status, 1);
  const got = findings(b, "std-demo-rule", big);
  assert.equal(got.length, MANY, `${got.length} de ${MANY} achados chegaram`);
  assert.equal(got[MANY - 1].line, MANY);
});

test("eject --with-linter (default sem linter): o stub é inerte e o exemplo que ele ensina é o protocolo v2", async () => {
  const project = tmp();
  const ej = cli(project, "eject", "grounding", "--with-linter");
  assert.equal(ej.status, 0, ej.stderr);
  const linter = join(contextPaths(project).standardsMachine, "std-grounding.js");
  const stub = readFileSync(linter, "utf8");

  // Até a regra ser escrita, o stub não acusa nada.
  const file = sample(project, ["ok", "badPattern aqui", "ok", "ok", "outro badPattern"]);
  const inert = lint(linter, file);
  assert.equal(inert.status, 0, inert.stderr);
  assert.equal(inert.stdout, "");

  // Ativa o exemplo comentado (as linhas entre o TODO e o `void content;`) e roda de verdade.
  const lines = stub.split("\n");
  const from = lines.findIndex((l) => l.includes("TODO"));
  const to = lines.findIndex((l) => l.trim() === "void content;");
  assert.ok(from >= 0 && to > from, `stub sem o bloco de exemplo esperado:\n${stub}`);
  const active = [...lines.slice(0, from + 1), ...lines.slice(from + 1, to).map((l) => l.replace(/^\/\/ ?/, "")), ...lines.slice(to)].join("\n");
  const activated = join(tmp(), "std-grounding.js");
  writeFileSync(activated, active);

  const r = lint(activated, file);
  assert.equal(r.status, 1, r.stderr);
  assert.deepEqual(findings(r, "std-grounding", file).map((f) => [f.ruleId, f.line]), [["grounding", 2], ["grounding", 5]]);

  const big = sample(project, Array.from({ length: MANY }, () => "badPattern"));
  const b = await lintBusyReader(activated, big);
  assert.equal(b.status, 1);
  const got = findings(b, "std-grounding", big);
  assert.equal(got.length, MANY, `${got.length} de ${MANY} achados chegaram`);
});

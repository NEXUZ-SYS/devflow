import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, mkdirSync, existsSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ext, { peekPending } from "../../omp/extension.mjs";
import { runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";
import { demoProject } from "../helpers/standards-fixture.mjs";

test("tool_result de edição com violação nova enfileira o bloqueio", async () => {
  const root = demoProject();
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  await runStandardsCommand("baseline", ["init"], root, { isInteractive: () => true });
  writeFileSync(join(root, "src/new.js"), "BAD\n");
  const handlers = {};
  ext({ on: (ev, fn) => { handlers[ev] = fn; } });
  handlers.tool_result({ toolName: "write", input: { path: join(root, "src/new.js") } }, { cwd: root });
  assert.ok(peekPending().some(t => /BLOQUEIO DE STANDARD/.test(t) && /src\/new\.js/.test(t)), JSON.stringify(peekPending()));
});

// I-5: a raiz dos linters é o diretório da sessão (ctx.cwd), nunca o ancestral do arquivo
// editado — senão editar um arquivo de outro repositório carrega os standards e executa o
// machine/ de lá (o mesmo ruling da T14 para o Claude Code).
// Linter que deixa um marcador ao ser executado e acusa violação.
const markerLinter = (marker) => `require("fs").writeFileSync(${JSON.stringify(marker)}, "executado");
console.log("VIOLATION no-bad " + process.argv[2] + ":1 remova BAD");process.exitCode = 1;`;

for (const level of ["block", "warn"]) {
  test(`tool_result de arquivo em OUTRO repositório não carrega os standards nem executa o machine/ de lá (std ${level})`, () => {
    const temps = [];
    try {
      const sessao = mkdtempSync(join(tmpdir(), "omp-sessao-")); temps.push(sessao);
      mkdirSync(join(sessao, ".context"));
      const marcas = mkdtempSync(join(tmpdir(), "omp-marca-")); temps.push(marcas);
      const marker = join(marcas, "linter-executado");
      const vizinho = demoProject({ level, linterBody: markerLinter(marker) }); temps.push(vizinho);
      execFileSync("git", ["init", "-q", "-b", "main", vizinho]);
      writeFileSync(join(vizinho, ".context/engineering/standards/baseline.json"), '{"version":1,"entries":[]}');
      writeFileSync(join(vizinho, "src/new.js"), "BAD\n");
      const handlers = {};
      ext({ on: (ev, fn) => { handlers[ev] = fn; } });
      const antes = peekPending().length;
      handlers.tool_result({ toolName: "write", input: { path: join(vizinho, "src/new.js") } }, { cwd: sessao });
      const novos = peekPending().slice(antes);
      assert.equal(existsSync(marker), false, "o linter machine/ do repositório vizinho foi executado");
      assert.ok(!novos.some(t => /BLOQUEIO DE STANDARD/.test(t)), JSON.stringify(novos));
      assert.ok(!novos.some(t => /std-demo/.test(t)), `standards do vizinho chegaram à fila: ${JSON.stringify(novos)}`);
    } finally { for (const d of temps) rmSync(d, { recursive: true, force: true }); }
  });
}

test("launcher anexa as normas da sessão ao --append-system-prompt", () => {
  const root = demoProject();
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  const bin = mkdtempSync(join(tmpdir(), "omp-bin-"));
  const out = join(bin, "args.json");
  // omp falso: grava os argumentos recebidos.
  writeFileSync(join(bin, "omp"),
    `#!/usr/bin/env node\nrequire("fs").writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)));\n`);
  chmodSync(join(bin, "omp"), 0o755);
  try {
    execFileSync("node", [join(process.cwd(), "scripts/omp-launch.mjs")], {
      cwd: root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, stdio: "pipe",
    });
    const args = JSON.parse(execFileSync("cat", [out], { encoding: "utf8" }));
    const i = args.indexOf("--append-system-prompt");
    assert.ok(i >= 0, "sem --append-system-prompt: " + JSON.stringify(args).slice(0, 300));
    assert.match(args[i + 1], /<PROJECT_NORMS>/, "normas da sessão ausentes do append");
  } finally { rmSync(bin, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
});

// tests/skills/test-standards-in-phases.mjs — T13: fases P e V e code-reviewer usam os
// standards. Testes estruturais (regex no texto) + funcionais (R7: os comandos citados
// no SKILL.md realmente rodam num fixture, com CLAUDE_PLUGIN_ROOT substituído).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { demoProject } from "../helpers/standards-fixture.mjs";
import { runStandardsCommand } from "../../scripts/lib/standards-check-cli.mjs";

const P = readFileSync("skills/prevc-planning/SKILL.md", "utf8");
const V = readFileSync("skills/prevc-validation/SKILL.md", "utf8");
const CR = readFileSync("agents/code-reviewer.md", "utf8");
const R = readFileSync("skills/prevc-review/SKILL.md", "utf8");

// --- Estruturais (task-13-brief.md Step 1) ---------------------------------

test("planning roda explain sobre os caminhos do plano", () => {
  assert.match(P, /Standards Layer Loading/);
  assert.match(P, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devflow-standards\.mjs" explain/);
});

test("stories da fase E carregam a linha Standards", () => {
  assert.match(P, /inclua a linha `Standards: <ids>`/);
});

test("validation exige o sinal standards e o checklist review", () => {
  assert.match(V, /verify-run\.mjs" standards/);
  assert.match(V, /level: review/);
});

test("code-reviewer verifica standards review", () => {
  assert.match(CR, /devflow-standards\.mjs" explain/);
});

test("nenhuma skill cita um binário `devflow standards` inexistente", () => {
  for (const s of [P, V, CR]) assert.doesNotMatch(s, /`devflow standards /);
});

// --- Funcionais (decisão do controller, R7) ---------------------------------
// Não basta citar o comando em prosa: ele precisa RODAR, com o caminho real do
// plugin e as aspas exatamente como escritas no SKILL.md. Um comando com aspas
// quebradas ou caminho errado faz o regex de extração falhar (não casa) ou o
// spawn falhar (exit != 0) — o teste cai por qualquer um dos dois motivos.

function fixtureWithVerifyStandards({ level = "block" } = {}) {
  const root = demoProject({ level });
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  writeFileSync(
    join(root, ".context/.devflow.yaml"),
    'git:\n  strategy: branch-flow\nverify:\n  standards: ["devflow-standards", "gate"]\n',
  );
  return root;
}

test("o comando explain citado na prevc-planning roda de verdade num fixture", () => {
  const m = P.match(/node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devflow-standards\.mjs" explain/);
  assert.ok(m, "comando explain não encontrado (ou com aspas/caminho quebrados) em prevc-planning/SKILL.md");
  const root = demoProject({ level: "block" });
  const cmd = `${m[0]} src/old.js`;
  const r = spawnSync("bash", ["-c", cmd], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: process.cwd() },
  });
  assert.equal(r.status, 0, `stdout=${r.stdout}\nstderr=${r.stderr}`);
  assert.match(r.stdout, /std-demo — nível block/);
});

test("o comando verify-run standards citado na prevc-validation roda de verdade num fixture", () => {
  const m = V.match(/`node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/lib\/verify-run\.mjs" standards`/);
  assert.ok(m, "comando verify-run standards não encontrado (ou com aspas/caminho quebrados) em prevc-validation/SKILL.md");
  const cmd = m[0].slice(1, -1); // remove o par de crases do inline-code
  const root = fixtureWithVerifyStandards({ level: "block" });
  const r = spawnSync("bash", ["-c", cmd], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: process.cwd(), CI: "" },
  });
  assert.equal(r.status, 0, `stdout=${r.stdout}\nstderr=${r.stderr}`);
});

// --- Correção — rodada 1 -----------------------------------------------------

test("Step 1.5 diz exit ≠ 0 é BLOCK (não só exit 3), e uma violação block real bate exit 1", async () => {
  // (a) o texto: uma violação block nova sai com exit 1, não 3 (3 é erro de execução).
  assert.match(V, /exit ≠ 0 é BLOCK \(violação nova = 1; erro de execução, ex\. baseline inválido = 3\)/);

  // (b) o comando citado, rodado de verdade contra um fixture com violação block NOVA
  // (fora do baseline já existente), sai com exit 1 — não 0, não 3.
  const m = V.match(/`node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/lib\/verify-run\.mjs" standards`/);
  assert.ok(m, "comando verify-run standards não encontrado em prevc-validation/SKILL.md");
  const cmd = m[0].slice(1, -1);

  const root = fixtureWithVerifyStandards({ level: "block" });
  writeFileSync(join(root, "src/old.js"), "BAD\n");
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base"]);
  const initCode = await runStandardsCommand("baseline", ["init"], root, { isInteractive: () => true });
  assert.equal(initCode, 0, "baseline init falhou ao preparar o fixture");

  writeFileSync(join(root, "src/new-bad.js"), "BAD\n"); // violação NOVA, fora do baseline

  const r = spawnSync("bash", ["-c", cmd], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: process.cwd(), CI: "" },
  });
  assert.equal(r.status, 1, `stdout=${r.stdout}\nstderr=${r.stderr}`);
});

test("prevc-review confere a declaração Standards do plano contra o explain", () => {
  assert.match(R, /\*\*Standards:\*\* <ids>/);
  assert.match(R, /node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/devflow-standards\.mjs" explain/);
});

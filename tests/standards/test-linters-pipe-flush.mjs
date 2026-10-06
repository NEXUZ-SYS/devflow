// tests/standards/test-linters-pipe-flush.mjs
// Rodada 2 de correção (Task 8), item 1: os 17 linters faziam console.log em série
// e depois process.exit(n). Em stdout PIPE — que é como o engine chama via execFile
// (scripts/lib/run-linter.mjs) — console.log é ASSÍNCRONO; process.exit() força a
// saída do processo antes da fila de escrita drenar, TRUNCANDO os achados
// pendentes. Achado pela revisão: std-observability com 8000 ocorrências entregava
// entre 0 e ~4600 linhas (nunca as 8000), tanto em execuções paralelas quanto com o
// processo pai ocupado — a catraca do baseline contaria errado.
//
// Fix: os 17 usam process.exitCode em vez de process.exit() no final (depois de
// escrever os achados) — sem exit() explícito, o processo só termina depois que o
// event loop drena (todo console.log pendente já escrito).
//
// Este teste captura por PIPE de verdade via execFile (não por arquivo) — é
// exatamente o cenário de produção (runOneLinter também usa execFile) e onde o
// bug aparecia; um teste com captura em arquivo não pega essa classe de bug (uma
// rodada anterior usou captura em arquivo para esconder uma flakiness de OUTRO
// motivo, sem perceber que escondia esta também).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const MACHINE = resolve(import.meta.dirname, "../../assets/standards/machine");
const RUNS = 8;

async function runParallel(linter, fp, times) {
  return Promise.all(
    Array.from({ length: times }, () =>
      execFileP("node", [linter, fp], { maxBuffer: 4 * 1024 * 1024 })
        .then(({ stdout }) => ({ status: 0, count: stdout.split("\n").filter(Boolean).length }))
        .catch((err) => ({ status: err.code ?? -1, count: (err.stdout || "").split("\n").filter(Boolean).length }))
    )
  );
}

test(`std-observability: ${RUNS} execuções paralelas de 8000 ocorrências, todas com exatamente 8000 linhas VIOLATION`, async () => {
  const dir = mkdtempSync(join(tmpdir(), "pipeflush-obs-"));
  const fp = join(dir, "big.ts");
  writeFileSync(fp, "console.log(x);\n".repeat(8000));
  const runs = await runParallel(join(MACHINE, "std-observability.js"), fp, RUNS);
  runs.forEach((r, i) => {
    assert.equal(r.status, 1, `execução ${i}: exit deveria ser 1`);
    assert.equal(r.count, 8000, `execução ${i}: esperava exatamente 8000 linhas VIOLATION, veio ${r.count} (truncamento de pipe)`);
  });
});

test(`std-error-handling: ${RUNS} execuções paralelas de 5000 ocorrências, todas com exatamente 5000 linhas VIOLATION`, async () => {
  const dir = mkdtempSync(join(tmpdir(), "pipeflush-eh-"));
  const fp = join(dir, "big.ts");
  writeFileSync(fp, "try{a()}catch{}\n".repeat(5000));
  const runs = await runParallel(join(MACHINE, "std-error-handling.js"), fp, RUNS);
  runs.forEach((r, i) => {
    assert.equal(r.status, 1, `execução ${i}: exit deveria ser 1`);
    assert.equal(r.count, 5000, `execução ${i}: esperava exatamente 5000 linhas VIOLATION, veio ${r.count} (truncamento de pipe)`);
  });
});

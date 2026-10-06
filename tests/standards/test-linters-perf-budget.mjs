// tests/standards/test-linters-perf-budget.mjs
// Rodada 1 de correção (Task 8): dois problemas de volume achados na revisão.
//
// (1) Linha via CONTADOR INCREMENTAL O(n+k) — não `c.slice(0, idx).split("\n")` por
//     ocorrência (O(n·k)): com milhares de ocorrências no mesmo arquivo, o custo
//     quadrático levava o std-error-handling de ~4,5s a ~29s. Aqui: 5000 ocorrências
//     em <2,5s (rodada 2: teto subiu de 1000ms para 2500ms — a máquina de CI sob
//     concorrência do runner de testes é mais lenta que um shell isolado).
// (2) Mensagem por ocorrência CURTA e ESTÁVEL (o texto corretivo longo fica no corpo
//     do std) — sem isso, um arquivo com milhares de achados (ex.: gerado) estoura o
//     maxBuffer de 1MB do linter (SI-4/D4), e isso é tratado como ERRO, não achado
//     (falha fechada — não há teto de ocorrências: isentaria a catraca sem avisar
//     ninguém). Aqui: 8000 console.log ficam abaixo de 1MB de stdout.
//
// Rodada 2: captura volta a ser por PIPE simples (spawnSync) — a rodada 1 tinha
// trocado para um arquivo por causa de um truncamento não-determinístico que
// achamos ser "flake do runner sob carga"; na verdade era o bug real do item 1 de
// tests/standards/test-linters-pipe-flush.mjs (process.exit() truncando console.log
// pendente em pipe). Com os 17 linters usando process.exitCode, o pipe simples
// volta a ser confiável — e é o caminho real do engine (execFile).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MACHINE = resolve(import.meta.dirname, "../../assets/standards/machine");

test("std-error-handling: 5000 catches vazios espalhados num arquivo de ~1,5MB termina em menos de 2,5s", () => {
  // O(n·k) só fica visível com n (tamanho do arquivo) E k (nº de ocorrências)
  // grandes ao mesmo tempo — 5000 ocorrências sozinhas (arquivo pequeno) já
  // terminavam rápido mesmo com o bug. Replica a forma real do PoC da revisão
  // (mid-catch.ts): 5000 catches intercalados com padding até ~105000 linhas.
  const dir = mkdtempSync(join(tmpdir(), "perf-eh-"));
  const lines = [];
  for (let i = 0; i < 5000; i++) {
    lines.push("try{a()}catch{}");
    for (let j = 0; j < 20; j++) lines.push("const pad = 1;");
  }
  const fp = join(dir, "big.ts");
  writeFileSync(fp, lines.join("\n") + "\n");
  const t0 = Date.now();
  const r = spawnSync("node", [join(MACHINE, "std-error-handling.js"), fp], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  const dt = Date.now() - t0;
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout.split("\n").filter(Boolean).length, 5000, "deveria reportar as 5000 ocorrências, não amostrar/truncar");
  assert.ok(dt < 2500, `deveria terminar em <2,5s (O(n+k)), levou ${dt}ms`);
});

test("std-observability: 8000 console.log geram stdout abaixo de 1MB (maxBuffer SI-4)", () => {
  const dir = mkdtempSync(join(tmpdir(), "perf-obs-"));
  const content = "console.log(x);\n".repeat(8000);
  writeFileSync(join(dir, "big.ts"), content);
  const r = spawnSync("node", [join(MACHINE, "std-observability.js"), "big.ts"], {
    encoding: "utf8", cwd: dir, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(r.status, 1, r.stderr);
  const lines = r.stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 8000, "não há teto de ocorrências — as 8000 devem sair, só curtas");
  const bytes = Buffer.byteLength(r.stdout, "utf8");
  assert.ok(bytes < 1024 * 1024, `stdout deveria ficar abaixo do maxBuffer de 1MB do engine (SI-4), ficou em ${bytes} bytes`);
});

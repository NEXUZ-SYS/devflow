// scripts/lib/adr-guardrails.mjs — guardrails das ADRs aprovadas (mesma regra do session-start).
//
// Leitura por safe-read (não readFileSync): um agente pode plantar um FIFO ou um symlink
// no lugar de um arquivo de ADR entre a listagem do diretório e a leitura. readFileSync
// seguiria o link ou bloquearia abrindo o FIFO até o timeout do harness — perdendo o
// SessionStart inteiro por causa de UMA ADR. readRegularFileSafe (O_NOFOLLOW|O_NONBLOCK +
// fstat) faz o arquivo "ilegível" apenas ser pulado, nunca travar.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveReadPaths } from "./context-paths.mjs";
import { readRegularFileSafe } from "./safe-read.mjs";

// ADR maior que isso não cabe no orçamento de contexto de qualquer jeito (mesmo teto do
// knowledge on-demand em knowledge-ondemand.mjs).
const MAX_ADR_BYTES = 1024 * 1024;

const field = (t, k) => ((t.match(new RegExp(`^${k}:\\s*["']?([^"'\\n]+)`, "m")) || [])[1] || "").trim();

/**
 * Guardrails das ADRs com `status: Aprovado`, uma entrada por ADR (nome, stack, texto da
 * seção `## Guardrails` até o próximo `## ` ou o fim do arquivo). Mesma extração usada pelo
 * hook `session-start` em bash (provado por `tests/hooks/test-adr-guardrails-parity.sh`).
 *
 * `dir` é o diretório de origem REAL (canônico `.context/engineering/adrs` ou um legado —
 * `.context/adrs`, `.context/docs/adrs`), para o ponteiro "leia …" apontar pro lugar certo em
 * vez de sempre assumir o canônico (Correção rodada 1).
 *
 * @returns {Array<{name: string, stack: string, guardrails: string, dir: string, file: string}>}
 */
export function loadApprovedGuardrails(projectRoot) {
  const seen = new Set(), out = [];
  for (const dir of resolveReadPaths(projectRoot, "adrs")) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(n => n.endsWith(".md") && n !== "README.md").sort()) {
      if (seen.has(f)) continue;
      seen.add(f);
      const file = join(dir, f);
      const t = readRegularFileSafe(file, MAX_ADR_BYTES);
      if (t === null) continue; // FIFO, symlink, diretório, grande demais ou ilegível: pula
      if (field(t, "status") !== "Aprovado") continue;
      const g = t.match(/^## Guardrails[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
      if (g && g[1].trim()) out.push({ name: field(t, "name") || f, stack: field(t, "stack"), guardrails: g[1].trim(), dir, file });
    }
  }
  return out;
}

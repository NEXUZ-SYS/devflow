// tests/standards/_helper.mjs — runner SI-4 compartilhado para testes de linter.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const MACHINE = resolve(import.meta.dirname, "../../assets/standards/machine");

// Roda machine/<linter> contra um fixture efêmero; retorna {code, out}.
// filename pode conter subdiretórios (ex.: "src/domain/order.ts") — criamos
// recursivamente, senão writeFileSync lança ENOENT e o teste dá falso GREEN.
// out concatena stdout+stderr (linter pode escrever em qualquer um).
export function lintFile(linter, filename, content) {
  const dir = mkdtempSync(join(tmpdir(), "std-"));
  const fp = join(dir, filename);
  mkdirSync(dirname(fp), { recursive: true });
  writeFileSync(fp, content);
  try {
    const out = execFileSync("node", [join(MACHINE, linter), fp], { encoding: "utf-8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: ((e.stdout || "") + (e.stderr || "")).toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

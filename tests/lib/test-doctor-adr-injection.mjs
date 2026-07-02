// tests/lib/test-doctor-adr-injection.mjs
// DOCTOR-1 (rede do achado-mãe): check que detecta ADRs aprovadas que vivem só
// em path legado (não no canônico engineering/adrs). Pós-Task 1.2 o session-start
// injeta ambos, mas o doctor sinaliza WARN para orientar a migração.
import { CHECKS } from "../../scripts/lib/doctor.mjs";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert";

const check = CHECKS.find(c => c.id === "adr-injection");
assert.ok(check, "check 'adr-injection' deve estar registrado em CHECKS");

const APPROVED = `---
name: Dinheiro em centavos
status: Aprovado
stack: typescript
---
## Guardrails
- Nunca usar float para dinheiro.
`;

// Caso 1: ADR aprovada no canônico engineering/adrs → OK
const c1 = mkdtempSync(join(tmpdir(), "doctor-adr-canon-"));
mkdirSync(join(c1, ".context", "engineering", "adrs"), { recursive: true });
writeFileSync(join(c1, ".context", "engineering", "adrs", "001-money.md"), APPROVED);
const r1 = check.run({ cwd: c1, which: () => null });
assert.strictEqual(r1.status, "OK", `canônico deve dar OK, deu ${r1.status}: ${r1.diagnosis}`);

// Caso 2: ADR aprovada só em path legado .context/docs/adrs → WARN (migrar)
const c2 = mkdtempSync(join(tmpdir(), "doctor-adr-legacy-"));
mkdirSync(join(c2, ".context", "docs", "adrs"), { recursive: true });
writeFileSync(join(c2, ".context", "docs", "adrs", "001-money.md"), APPROVED);
const r2 = check.run({ cwd: c2, which: () => null });
assert.strictEqual(r2.status, "WARN", `legado-só deve dar WARN, deu ${r2.status}`);
assert.ok(/engineering\/adrs/.test((r2.repair || "") + (r2.diagnosis || "")),
  "WARN deve orientar migrar para engineering/adrs");

// Caso 3: sem ADRs aprovadas → OK (nada a injetar)
const c3 = mkdtempSync(join(tmpdir(), "doctor-adr-none-"));
mkdirSync(join(c3, ".context", "engineering", "adrs"), { recursive: true });
const r3 = check.run({ cwd: c3, which: () => null });
assert.strictEqual(r3.status, "OK", `sem ADR deve dar OK, deu ${r3.status}`);

console.log("OK test-doctor-adr-injection");

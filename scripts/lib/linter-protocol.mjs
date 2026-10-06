// scripts/lib/linter-protocol.mjs — parse da saída de linters (ADR-007 v3.1.0).
// v2:     VIOLATION <ruleId> <arquivo>:<linha> <mensagem>
// legado: VIOLATION: [advisory] <rule-id> — <msg> [<arquivo>]   (multi-regra)
//         VIOLATION: <msg livre>                                  (regra única → ruleId = std sem "std-")
//
// Só "\n" separa linhas. Os regex que usam `.` levam a flag `s`: o caminho (ou a mensagem) pode
// trazer "\r", U+2028 ou U+2029, que o `.` sem a flag não casa — o achado caía no último
// fallback com ruleId = id do std, e uma regra em `block` num std `warn` saía como `warn`.

const V2_RE = /^VIOLATION ([a-z0-9][a-z0-9-]*) (.+?):(\d+) (.+)$/s;
const LEGACY_RE = /^VIOLATION:\s*(.*)$/s;
const LEGACY_RULE_RE = /^(\[advisory\]\s+)?([a-z0-9][a-z0-9-]*) — /;
const FALLBACK_PREFIX_RE = /^VIOLATION[ :]\s*/;
const FALLBACK_RULE_RE = /^([a-z0-9][a-z0-9-]*)(?:\s+(.*))?$/s;
const VIOLATION_LINE_RE = /^VIOLATION[ :]/;

/**
 * A saída tem alguma linha de violação? Mesma divisão ("\n") e o mesmo corte do
 * `parseLinterOutput`, para valer o invariante `hasViolation(x) ⇒ parseLinterOutput(x).length ≥ 1`:
 * a linha começa com "VIOLATION " ou "VIOLATION:" (sem espaço antes) e continua começando assim
 * depois de aparada. "VIOLATION " sem mais nada, ou um VIOLATION depois de "\r" no meio de uma
 * linha, não conta — com exit 1 isso vira "linter fora do contrato" (erro), não um passe sem achado.
 */
export function hasViolation(stdout) {
  return String(stdout || "").split("\n").some(raw => VIOLATION_LINE_RE.test(raw) && VIOLATION_LINE_RE.test(raw.trim()));
}

export function parseLinterOutput(stdout, { stdId, filePath }) {
  const out = [];
  for (const raw of String(stdout || "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const v2 = line.match(V2_RE);
    if (v2) {
      out.push({ ruleId: v2[1], path: v2[2], line: Number(v2[3]), message: v2[4], advisory: false });
      continue;
    }
    const legacy = line.match(LEGACY_RE);
    if (legacy) {
      const msg = legacy[1];
      const rule = msg.match(LEGACY_RULE_RE);
      out.push({
        ruleId: rule ? rule[2] : String(stdId).replace(/^std-/, ""),
        path: filePath,
        line: null,
        message: msg,
        advisory: Boolean(rule && rule[1]),
      });
      continue;
    }
    if (!VIOLATION_LINE_RE.test(line)) continue;
    // Fallback: casa hasViolation (^VIOLATION[ :]) mas não v2 nem legado — ex.:
    // "VIOLATION <ruleId> <path> <msg>" sem ":<linha>". Garante o invariante
    // hasViolation(x) === true ⇒ parseLinterOutput(x).length >= 1.
    const rest = line.replace(FALLBACK_PREFIX_RE, "");
    const fb = rest.match(FALLBACK_RULE_RE);
    out.push({
      ruleId: fb ? fb[1] : String(stdId),
      path: filePath,
      line: null,
      message: (fb ? fb[2] || "" : rest).trim(),
      advisory: false,
    });
  }
  return out;
}

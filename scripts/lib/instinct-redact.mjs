// scripts/lib/instinct-redact.mjs
// Redação best-effort para observações do instinct store (ADR-005 v1.1.0).
// Ordem: URL-cred → key=value → tokens → email → IPv4 → sequências longas.
// SHAs/paths preservados. NÃO é PCI/PHI-grade (PII com separadores passa).
// Limite best-effort (ADR-005): um secret de alta entropia 100% alfanumérico SEM
// contexto de chave (ex.: AWS secret 40c base64 como token nu, sem `key=`/`secret=`)
// NÃO é redigido — um blanket [A-Za-z0-9/+]{40} mutilaria file paths (conteúdo primário
// das observações). Vetores ALCANÇÁVEIS pela captura binary-only (env-assignment
// `ENV=valor`) são cobertos por KV_RE/TOKEN_RE; ambientes regulados usam scrubber externo.

// Credencial embutida em URL: scheme://user:senha@host  (reusa heurística do projectId)
const URLCRED_RE = /:\/\/[^/@\s:]+:[^/@\s]+@/g;
// Par chave=valor sensível. F1: a chave pode ser um identificador UPPER_SNAKE
// (CLIENT_SECRET, AWS_SECRET_ACCESS_KEY, GITHUB_TOKEN) — `_` é word-char, então
// o antigo \b falhava. Usamos lookbehind de fronteira não-alfanumérica e
// permitimos prefixo/sufixo de word-chars ao redor da palavra sensível.
// Over-redação é segura aqui (store de observação); vazar credencial é hard-fail (ADR-005).
// Lookahead nega placeholders já redigidos ([TOKEN] etc.).
// F2-residual: `access[-_]?key`/`aws[-_]?access` cobrem nomes de var AWS sem secret/token
// (ACCESS_KEY=, AWS_ACCESS=) cujo valor (secret 40c) não casa o TOKEN_RE. Específicos
// o bastante p/ não pegar `monkey`/`keyboard`.
const KV_RE = /(?<![A-Za-z0-9])([A-Za-z0-9_]*(?:password|passwd|pwd|secret|token|api[-_]?key|apikey|access[-_]?key|aws[-_]?access|auth|cred|credential|pgpassword|mysql_pwd)[A-Za-z0-9_]*)(\s*[=:]\s*)(?!\[(?:TOKEN|REDACTED|EMAIL|IP|NUM)\])(\S+)/gi;
// Tokens conhecidos (uma alternativa por classe de credencial real).
const TOKEN_RE = new RegExp([
  'AKIA[0-9A-Z]{16}',                                   // AWS access key id
  'gh[opsur]_[A-Za-z0-9]{16,}',                         // GitHub classic/oauth/server/user/refresh
  'github_pat_[A-Za-z0-9_]{20,}',                       // GitHub fine-grained
  '(?:sk|pk|rk)[-_](?:live|test|proj|ant)[-_A-Za-z0-9]+', // Stripe/OpenAI/Anthropic (com label)
  'sk-[A-Za-z0-9]{16,}',                                // OpenAI legacy (sk- puro)
  'glpat-[A-Za-z0-9_-]{16,}',                           // GitLab PAT
  'npm_[A-Za-z0-9]{20,}',                               // npm token
  'AIza[0-9A-Za-z_-]{30,}',                             // Google API key
  'xox[baprs]-[A-Za-z0-9-]{8,}',                        // Slack bot/user
  'xapp-[A-Za-z0-9-]{8,}',                              // Slack app-level
  'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+', // JWT
  '-----BEGIN[^-]+PRIVATE KEY-----',                    // PEM
  'bearer\\s+[A-Za-z0-9._-]{12,}',                      // bearer ...
].join('|'), 'gi');
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// Sequência ≥9 dígitos PUROS (não dentro de hash/path). SHA git é hex c/ letras → não casa \d+.
const LONGNUM_RE = /(?<![\w./])\d{9,}(?![\w./])/g;

export function redact(text) {
  if (typeof text !== 'string' || !text) return text ?? '';
  return text
    .replace(URLCRED_RE, '://[REDACTED]@')
    .replace(TOKEN_RE, '[TOKEN]')                       // antes do KV: token reconhecido → [TOKEN]
    .replace(KV_RE, (_m, k) => `${k}=[REDACTED]`)
    .replace(EMAIL_RE, '[EMAIL]')
    .replace(IPV4_RE, '[IP]')
    .replace(LONGNUM_RE, '[NUM]');
}

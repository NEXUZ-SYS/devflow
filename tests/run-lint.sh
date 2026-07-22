#!/usr/bin/env bash
# Sinal 'lint' composto: guard anti-enfraquecimento de testes + guard do contrato + validade do verify:.
# Gate determinístico não é opcional por task (D6). R-C3: BASE_REF repassado aos guards
# (default origin/main local; o CI seta BASE_REF=origin/<base_ref> e CI=true → fail-closed no merge-base-miss).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BASE_REF="${BASE_REF:-origin/main}"
rc=0
node scripts/lib/test-weakening-guard.mjs --root=. --base-ref="$BASE_REF" || rc=1
node scripts/lib/verify-contract-guard-cli.mjs --root=. --base-ref="$BASE_REF" || rc=1
node scripts/lib/devflow-config.mjs read-verify .context/.devflow.yaml >/dev/null || { echo "verify: inválido/inseguro"; rc=1; }
# Guard de pureza: shell/eval/rede em código que invoca git. Estava definido mas
# nunca era executado aqui — o lint aprovava execSync sem reclamar.
node --test tests/lib/finalize/finalize-pure.test.mjs >/dev/null || { echo "pureza: padrão proibido (shell/eval/rede)"; rc=1; }
exit "$rc"

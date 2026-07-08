#!/usr/bin/env bash
# tests/hooks/test-post-tool-use-config-golden.sh
# A2 (ADR-011): o hook post-tool-use lê git.autoFinish E git.versioning via
# devflow-config.mjs (parser único), com fail-safe sob `set -e`. Golden NÃO-circular:
# valores literais da semântica autoritativa (Python-com-PyYAML) ancoram o contrato.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK="$ROOT/hooks/post-tool-use"
LIB="$ROOT/scripts/lib/devflow-config.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail() { echo "FALHA: $1"; exit 1; }

# ---- Golden: classificação da lib bate com a semântica Python-com-PyYAML ----
mk() { mkdir -p "$TMP/$1/.context"; printf '%s' "$2" > "$TMP/$1/.context/.devflow.yaml"; }
af() { node "$LIB" read-autofinish "$TMP/$1/.context/.devflow.yaml"; }
vf() { node "$LIB" read-versioning "$TMP/$1/.context/.devflow.yaml"; }

mk t_true   $'git:\n  autoFinish: true\n'
mk t_false  $'git:\n  autoFinish: false\n'
mk t_absent $'git:\n  prCli: gh\n'
mk t_gran   $'git:\n  autoFinish:\n    bump: true\n    merge: false\n'
mk t_inline $'git:\n  autoFinish: true  # nota\n'
mk t_pipe   $'git:\n  versioning: pipeline\n'
mk t_none   $'git:\n  versioning: none\n'
mk t_vlocal $'git:\n  prCli: gh\n'

[ "$(af t_true)" = "all" ]       || fail "autoFinish true → all (golden)"
[ "$(af t_false)" = "disabled" ] || fail "autoFinish false → disabled (golden)"
[ "$(af t_absent)" = "disabled" ]|| fail "autoFinish ausente → disabled (golden)"
[ "$(af t_inline)" = "all" ]     || fail "autoFinish inline-comment → all (golden)"
# granular: forma NORMALIZADA de 4 chaves (mudança intencional vs json.dumps cru do Python)
echo "$(af t_gran)" | grep -q '"bump":true'  || fail "granular expõe bump:true"
echo "$(af t_gran)" | grep -q '"merge":false'|| fail "granular expõe merge:false"
[ "$(vf t_pipe)" = "pipeline" ]  || fail "versioning pipeline (golden)"
[ "$(vf t_none)" = "none" ]      || fail "versioning none (golden)"
[ "$(vf t_vlocal)" = "local" ]   || fail "versioning ausente → local (golden)"

# ---- Migração no hook: consome a lib, sem parser ad-hoc (ADR-011) ----
grep -qE 'devflow-config\.mjs" read-autofinish' "$HOOK" || fail "hook não chama read-autofinish"
grep -qE 'devflow-config\.mjs" read-versioning'  "$HOOK" || fail "hook não chama read-versioning (versioning não migrado)"
grep -qE 'read-autofinish "\$1" 2>/dev/null \|\| echo' "$HOOK" || fail "autoFinish sem fail-safe (|| echo) sob set -e"
grep -q 'read_yaml_field' "$HOOK" && fail "read_yaml_field ainda presente (parser ad-hoc órfão — viola ADR-011)"
grep -q "git.get('autoFinish')" "$HOOK" && fail "parser Python de autoFinish ainda presente"

echo "OK test-post-tool-use-config-golden"

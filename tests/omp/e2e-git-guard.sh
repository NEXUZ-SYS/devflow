#!/usr/bin/env bash
set -euo pipefail
if ! command -v omp >/dev/null; then echo "SKIP: omp ausente"; exit 0; fi
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
# Commit inicial é necessário: sem ele, `git rev-parse --abbrev-ref HEAD`
# devolve "HEAD" (branch unborn), não "main" → o hook não detecta a branch
# protegida. As chaves do config são camelCase (o que o hook pre-tool-use lê):
# branchProtection + protectedBranches.
( cd "$TMP" && git init -q && git checkout -q -b main \
    && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init )
mkdir -p "$TMP/.context"
cat > "$TMP/.context/.devflow.yaml" <<'YAML'
git:
  strategy: feature-branch
  branchProtection: true
  protectedBranches:
    - main
YAML
# Pedimos explicitamente para NÃO trocar de branch. O guard deve bloquear a
# edição na branch protegida `main`. Com a remediação proibida, o arquivo NÃO
# pode ser criado enquanto em `main` — se existir e a branch ainda for `main`,
# o guard falhou.
OUT=$(cd "$TMP" && omp -e "$REPO_ROOT/omp/extension.mjs" --auto-approve -p "edite o arquivo $TMP/app.txt escrevendo a palavra x. NÃO crie nem troque de branch git, NÃO use bash/eval para contornar — apenas use a ferramenta de edição direta." 2>&1 || true)
BRANCH=$(cd "$TMP" && git rev-parse --abbrev-ref HEAD)
# Sucesso do guard: ou o arquivo nunca foi escrito (bloqueio respeitado), ou o
# agente foi forçado a sair de `main` (remediação) — em ambos os casos a edição
# direta em `main` foi barrada. FALHA = arquivo existe E ainda estamos em `main`.
if [ -f "$TMP/app.txt" ] && [ "$BRANCH" = "main" ]; then
  echo "FALHA: edição prosseguiu em branch protegida (branch=$BRANCH, app.txt existe)"
  echo "--- omp output ---"; echo "$OUT" | tail -15
  exit 1
fi
echo "OK (branch final=$BRANCH, app.txt $( [ -f "$TMP/app.txt" ] && echo existe || echo ausente ))"

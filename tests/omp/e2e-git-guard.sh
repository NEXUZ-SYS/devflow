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
# Pedimos explicitamente para PERMANECER em `main` e editar lá. O guard deve
# bloquear a edição direta na branch protegida `main`. Com a remediação proibida,
# o arquivo NÃO pode ser criado enquanto em `main`.
OUT=$(cd "$TMP" && omp -e "$REPO_ROOT/omp/extension.mjs" --auto-approve -p "Permaneça na branch main (NÃO troque nem crie branch git) e edite o arquivo $TMP/app.txt escrevendo a palavra x. NÃO use bash/eval para contornar — apenas use a ferramenta de edição direta na branch main." 2>&1 || true)
echo "--- omp output ---"; echo "$OUT" | tail -15
FINAL_BRANCH=$(cd "$TMP" && git rev-parse --abbrev-ref HEAD)
echo "branch final: $FINAL_BRANCH"
if [ "$FINAL_BRANCH" = "main" ] && [ -f "$TMP/app.txt" ]; then
  echo "FALHA: edição direta na main protegida prosseguiu"; exit 1
fi
# Se o agente criou feature-branch e editou lá, é comportamento correto (guard barrou a main).
echo "OK (guard barrou edição direta na main)"

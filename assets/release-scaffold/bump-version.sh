#!/usr/bin/env bash
# bump-version.sh — bump da versão nos version files do projeto.
# Usage: ./scripts/bump-version.sh [patch|minor|major]   (default: patch)
#
# Genérico por DETECÇÃO EM RUNTIME: descobre quais manifests existem na RAIZ do
# repositório. Nada aqui é interpolado na hora do scaffold — este arquivo é
# copiado byte-a-byte.
#
# Endurecimento:
#   - Toda leitura/escrita de versão é ANCORADA no campo canônico (início de
#     linha) e, em TOML, na seção canônica. Versões de dependências nunca são
#     tocadas.
#   - A versão atual é validada contra ^X.Y.Z$ ANTES de qualquer uso (fail-loud).
#   - Detecção é raiz-apenas: um manifest em subdiretório não conta.
#
# Interface com o workflow de release:
#   - Se $GITHUB_OUTPUT estiver setado, emite `version=<nova>` e `files=<lista>`.
#   - Sempre imprime a versão nova como ÚLTIMO TOKEN de stdout.
#   O workflow consome isso; nunca re-grepa um manifest.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BUMP_TYPE="${1:-patch}"
case "$BUMP_TYPE" in
  patch | minor | major) ;;
  *)
    echo "Usage: $0 [patch|minor|major]" >&2
    exit 2
    ;;
esac

# ─── Validação ──────────────────────────────────────────────────────────────

validate_semver() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# ─── Leitura ancorada ───────────────────────────────────────────────────────

# Primeiro `"version": "..."` no início de linha (campo canônico do manifest).
read_json_version() {
  sed -n -E 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p' "$1" | head -1
}

# `version = "..."` no início de linha, DENTRO da seção canônica.
# Comparação exata do cabeçalho — não confundir [tool.poetry] com
# [tool.poetry.dependencies].
read_toml_version() {
  awk -v hdr="[$2]" '
    $0 == hdr { inside = 1; next }
    /^\[/     { inside = 0 }
    inside && /^version[[:space:]]*=/ {
      if (match($0, /"[^"]*"/)) { print substr($0, RSTART + 1, RLENGTH - 2); exit }
    }
  ' "$1"
}

# ─── Escrita ancorada ───────────────────────────────────────────────────────

write_json_version() {
  local file="$1" new="$2"
  sed -i -E '0,/^([[:space:]]*)"version"([[:space:]]*):([[:space:]]*)"[^"]*"/s//\1"version"\2:\3"'"$new"'"/' "$file"
}

write_toml_version() {
  local file="$1" section="$2" new="$3"
  local escaped
  escaped="${section//./\\.}"
  sed -i -E "/^\[${escaped}\]$/,/^\[/ s/^version([[:space:]]*)=([[:space:]]*)\"[^\"]*\"/version\1=\2\"${new}\"/" "$file"
}

# ─── Detecção (raiz-apenas) ─────────────────────────────────────────────────

# Seção canônica de versão de um pyproject.toml: PEP 621 [project],
# senão Poetry [tool.poetry].
pyproject_section() {
  if [ -n "$(read_toml_version pyproject.toml project || true)" ]; then
    echo "project"
  else
    echo "tool.poetry"
  fi
}

MANIFESTS=()
[ -f package.json ] && MANIFESTS+=("package.json")
[ -f pyproject.toml ] && MANIFESTS+=("pyproject.toml")
[ -f Cargo.toml ] && MANIFESTS+=("Cargo.toml")
[ -f VERSION ] && MANIFESTS+=("VERSION")

if [ ${#MANIFESTS[@]} -eq 0 ]; then
  echo "ERROR: nenhum manifest de versão na raiz do repositório." >&2
  echo "       Esperado um de: package.json, pyproject.toml, Cargo.toml, VERSION" >&2
  exit 1
fi

# ─── Versão atual (source of truth = primeiro manifest detectado) ───────────

SOURCE="${MANIFESTS[0]}"
CURRENT=""
case "$SOURCE" in
  package.json) CURRENT="$(read_json_version package.json || true)" ;;
  pyproject.toml) CURRENT="$(read_toml_version pyproject.toml "$(pyproject_section)" || true)" ;;
  Cargo.toml) CURRENT="$(read_toml_version Cargo.toml package || true)" ;;
  VERSION) CURRENT="$(head -1 VERSION || true)" ;;
esac

if [ -z "$CURRENT" ]; then
  echo "ERROR: não foi possível ler a versão atual de $SOURCE" >&2
  exit 1
fi

if ! validate_semver "$CURRENT"; then
  echo "ERROR: versão atual em $SOURCE não é semver X.Y.Z: '$CURRENT'" >&2
  echo "       Recusando o bump — nada foi alterado." >&2
  exit 1
fi

# ─── Bump ───────────────────────────────────────────────────────────────────

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac
NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"

if ! validate_semver "$NEW_VERSION"; then
  echo "ERROR: versão calculada inválida: '$NEW_VERSION'" >&2
  exit 1
fi

# ─── Escrita ────────────────────────────────────────────────────────────────

UPDATED=()
for file in "${MANIFESTS[@]}"; do
  case "$file" in
    package.json) write_json_version package.json "$NEW_VERSION" ;;
    pyproject.toml) write_toml_version pyproject.toml "$(pyproject_section)" "$NEW_VERSION" ;;
    Cargo.toml) write_toml_version Cargo.toml package "$NEW_VERSION" ;;
    VERSION) printf '%s\n' "$NEW_VERSION" > VERSION ;;
  esac
  UPDATED+=("$file")
  echo "  $file -> $NEW_VERSION"
done

echo ""
echo "Bumped: $CURRENT -> $NEW_VERSION ($BUMP_TYPE)  [source: $SOURCE]"

# ─── Corte do CHANGELOG (atômico com o bump) ────────────────────────────────
# [Unreleased] -> [NEW_VERSION] + data, com um [Unreleased] novo e vazio no topo.

if [ -f CHANGELOG.md ] && [ -f scripts/lib/changelog-cut.mjs ] && command -v node > /dev/null 2>&1; then
  node scripts/lib/changelog-cut.mjs "$NEW_VERSION" --date "$(date -u +%F)" --file CHANGELOG.md
  UPDATED+=("CHANGELOG.md")
fi

# ─── Saída para o workflow ──────────────────────────────────────────────────

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  printf 'version=%s\n' "$NEW_VERSION" >> "$GITHUB_OUTPUT"
  printf 'files=%s\n' "${UPDATED[*]}" >> "$GITHUB_OUTPUT"
fi

# A versão nova é sempre o ÚLTIMO TOKEN de stdout.
printf '%s\n' "$NEW_VERSION"

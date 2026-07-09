#!/usr/bin/env bash
# tests/skills/test-release-yml-stages-changelog.sh
# Bug: release.yml faz `git add` só dos version files, descartando o corte do
# CHANGELOG que o bump-version.sh já produz → release PR sai com versão bumpada
# e CHANGELOG não-cortado (drift). Fix: incluir CHANGELOG.md no git add.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WF="$ROOT/.github/workflows/release.yml"

# (1) o bloco git add do release PR inclui CHANGELOG.md
if ! awk '/git add/{p=1} p&&/CHANGELOG\.md/{found=1} p&&/git commit/{p=0} END{exit !found}' "$WF"; then
  echo "FALHA(1): release.yml não faz git add do CHANGELOG.md (corte é descartado)"; exit 1
fi

# (2) o corpo do PR não instrui mais a promoção MANUAL do [Unreleased] (é automática agora)
if grep -qiE "promova o .?\[Unreleased\]" "$WF"; then
  echo "FALHA(2): corpo do PR ainda pede promoção manual do [Unreleased] (stale)"; exit 1
fi

echo "OK test-release-yml-stages-changelog"

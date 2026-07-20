#!/usr/bin/env bash
# tests/skills/test-confirmation-release-signpost.sh
# Camada B: sob versioning:pipeline, a prevc-confirmation deve SINALIZAR o release
# pendente (o merge não dispara o release.yml, que é workflow_dispatch/manual) em vez
# de declarar "Workflow Complete" com o release órfão e silencioso. Sinalizar, nunca
# auto-disparar (release é outward-facing; o bump é julgamento semver).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/prevc-confirmation/SKILL.md"

# (1) o bloco de RELEASE PENDENTE existe e cita o comando de disparo manual
if ! grep -qiE "release pendente" "$SKILL"; then
  echo "FALHA(1): Step 8 não emite o bloco RELEASE PENDENTE"; exit 1
fi
if ! grep -qE "gh workflow run release\.yml -f bump=" "$SKILL"; then
  echo "FALHA(1b): não dá o comando exato (gh workflow run release.yml -f bump=)"; exit 1
fi

# (2) condicional: só versioning:pipeline + [Unreleased] não-vazio
if ! grep -qiE "versioning: ?pipeline" "$SKILL"; then
  echo "FALHA(2): signpost não condicionado a versioning:pipeline"; exit 1
fi
if ! grep -qiE "\[Unreleased\]" "$SKILL"; then
  echo "FALHA(2b): signpost não condicionado ao [Unreleased] não-vazio"; exit 1
fi

# (3) sugestão de bump derivada dos commits (helper suggest-bump)
if ! grep -qE "suggest-bump" "$SKILL"; then
  echo "FALHA(3): não deriva a sugestão de bump (suggest-bump.mjs)"; exit 1
fi

# (4) fluxo em 2 passos: release PR → tag-release publica no merge
if ! grep -qiE "release pr" "$SKILL"; then
  echo "FALHA(4): não menciona que o release.yml abre um release PR"; exit 1
fi
if ! grep -qE "tag-release" "$SKILL"; then
  echo "FALHA(4b): não menciona que o tag-release publica no merge do release PR"; exit 1
fi

# (5) fricção conhecida: checks do PR do bot nascem em action_required
if ! grep -qE "action_required" "$SKILL"; then
  echo "FALHA(5): não avisa da fricção action_required (checks do PR do bot)"; exit 1
fi

# (6) NUNCA auto-disparar — só sinalizar
if ! grep -qiE "nunca .*(auto-?dispar|dispar.*autom)|n[ãa]o .*auto-?dispar|apenas sinaliz|s[óo] sinaliz" "$SKILL"; then
  echo "FALHA(6): não deixa explícito que NUNCA auto-dispara (só sinaliza)"; exit 1
fi

# (7) anti-pattern: 'Workflow Complete' sob pipeline sem sinalizar o release = órfão
if ! grep -qiE "release [óo]rf[ãa]o|release.*silencios" "$SKILL"; then
  echo "FALHA(7): anti-pattern do release órfão/silencioso ausente"; exit 1
fi

echo "OK test-confirmation-release-signpost"

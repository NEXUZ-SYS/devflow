#!/usr/bin/env bash
# Plugin packaging smoke test (resolves A4 from R-phase architect review).
# Simulates fresh marketplace install via rsync (excluding .git, tests, node_modules)
# then verifies that all required files for adr-builder ship correctly.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRATCH=$(mktemp -d)
trap "rm -rf $SCRATCH" EXIT

echo "Simulating fresh install at $SCRATCH/devflow/"
rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='tests/validation/tmp/' \
  --exclude='*.skill' \
  "$REPO_ROOT/" "$SCRATCH/devflow/"

REQUIRED_PATHS=(
  "skills/adr-builder/SKILL.md"
  "skills/adr-builder/assets/TEMPLATE-ADR.md"
  "skills/adr-builder/assets/patterns-catalog.md"
  "skills/adr-builder/assets/context.yaml"
  "skills/adr-builder/references/briefing-guiado.md"
  "skills/adr-builder/references/extracao-livre.md"
  "skills/adr-builder/references/auditoria.md"
  "skills/adr-builder/references/checklist-qualidade.md"
  "skills/adr-builder/references/saida-distribuicao.md"
  "scripts/adr-audit.mjs"
  "scripts/adr-update-index.mjs"
  "scripts/adr-evolve.mjs"
  "scripts/adr-migrate-v1-to-v2.mjs"
  "scripts/lib/adr-frontmatter.mjs"
  "scripts/lib/adr-graph.mjs"
  "scripts/lib/adr-semver.mjs"
  "commands/devflow-adr.md"
  "skills/prevc-planning/SKILL.md"
  "skills/prevc-validation/SKILL.md"
  "skills/adr-filter/SKILL.md"
  ".claude-plugin/plugin.json"
)

MISSING=0
for path in "${REQUIRED_PATHS[@]}"; do
  if [ ! -f "$SCRATCH/devflow/$path" ]; then
    echo "FAIL: missing $path"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -gt 0 ]; then
  echo ""
  echo "✖ $MISSING file(s) missing in fresh install"
  exit 1
fi

echo "✓ all ${#REQUIRED_PATHS[@]} required paths present in fresh install"

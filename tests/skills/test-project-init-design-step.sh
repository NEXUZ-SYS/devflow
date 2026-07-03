#!/usr/bin/env bash
# tests/skills/test-project-init-design-step.sh
# Grupo D / D3: o project-init deve ter um Step que detecta projeto front-end
# (via detect-frontend) e, default-on, ativa o subsistema de design (/devflow:design init)
# após o scaffold — anunciando as escritas.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SKILL="$ROOT/skills/project-init/SKILL.md"

if ! grep -qiE "detect-frontend" "$SKILL"; then
  echo "FALHA: project-init não roda detect-frontend"; exit 1
fi
if ! grep -qiE "/devflow:design init|frontend-design init" "$SKILL"; then
  echo "FALHA: project-init não ativa o design init"; exit 1
fi
if ! grep -qiE "default-on|auto-detec|não-bloqueante|nao-bloqueante" "$SKILL"; then
  echo "FALHA: o step de design não é default-on/não-bloqueante"; exit 1
fi
echo "OK test-project-init-design-step"

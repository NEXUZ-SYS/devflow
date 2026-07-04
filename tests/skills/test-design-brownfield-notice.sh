#!/usr/bin/env bash
# tests/skills/test-design-brownfield-notice.sh
# Grupos E/F/G (partes de doc): entrada no post-update-guide (E1), guard do CLI no
# /devflow update (F3), doc da extensão (G1) e NOTICE de atribuição (G2).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# ── E1: post-update-guide ──
GUIDE="$ROOT/references/post-update-guide.md"
if ! grep -qiE "Subsistema de Design" "$GUIDE"; then
  echo "FALHA(E1): post-update-guide sem a feature 'Subsistema de Design'"; exit 1
fi
if ! grep -qE "detect-frontend" "$GUIDE"; then
  echo "FALHA(E1): post-update-guide não usa detect-frontend na detecção"; exit 1
fi
if ! grep -qE "/devflow:design init" "$GUIDE"; then
  echo "FALHA(E1): post-update-guide não ativa /devflow:design init"; exit 1
fi

# ── F3: guard do CLI impeccable no /devflow update ──
CMD="$ROOT/commands/devflow.md"
if ! grep -qE "Step 4e" "$CMD"; then
  echo "FALHA(F3): /devflow update sem o Step 4e (CLI impeccable)"; exit 1
fi
if ! grep -qE "command -v impeccable" "$CMD"; then
  echo "FALHA(F3): Step 4e não faz guard por presença (command -v impeccable)"; exit 1
fi
if ! grep -qiE "NUNCA auto-instala|nunca auto-instala|never auto-install" "$CMD"; then
  echo "FALHA(F3): Step 4e não deixa claro que NUNCA auto-instala"; exit 1
fi

# ── G1: doc da extensão ──
EXT="$ROOT/skills/frontend-design/references/browser-extension.md"
if [ ! -f "$EXT" ]; then
  echo "FALHA(G1): browser-extension.md não existe"; exit 1
fi
if ! grep -qiE "standalone|Chrome Web Store|não.*reconstru" "$EXT"; then
  echo "FALHA(G1): browser-extension.md não deixa claro que é standalone/não reconstruída"; exit 1
fi

# ── G2: NOTICE de atribuição ──
NOTICE="$ROOT/NOTICE"
if [ ! -f "$NOTICE" ]; then
  echo "FALHA(G2): NOTICE não existe"; exit 1
fi
if ! grep -qi "impeccable" "$NOTICE"; then
  echo "FALHA(G2): NOTICE não credita o impeccable"; exit 1
fi
if ! grep -qiE "Apache" "$NOTICE"; then
  echo "FALHA(G2): NOTICE não cita a licença Apache-2.0"; exit 1
fi
if ! grep -qE "3\.2\.0" "$NOTICE"; then
  echo "FALHA(G2): NOTICE não fixa a versão-fonte (3.2.0)"; exit 1
fi

echo "OK test-design-brownfield-notice"

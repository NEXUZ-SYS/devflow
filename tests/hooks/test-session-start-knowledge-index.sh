#!/usr/bin/env bash
set -euo pipefail
TMP=$(mktemp -d); trap "rm -rf $TMP" EXIT
mkdir -p "$TMP/.context/business"
cat > "$TMP/.context/business/vision.md" <<'EOF'
---
type: knowledge
layer: business
name: vision
description: north-star do produto
activation: always
owner: business-context
version: 1.0.0
---
corpo
EOF
out=$(cd "$TMP" && bash "$OLDPWD/hooks/session-start" 2>&1 || true)
echo "$out" | grep -q "KNOWLEDGE_INDEX" || { echo "FAIL: sem KNOWLEDGE_INDEX"; exit 1; }
echo "$out" | grep -q "north-star do produto" || { echo "FAIL: descrição não indexada"; exit 1; }
echo "PASS"

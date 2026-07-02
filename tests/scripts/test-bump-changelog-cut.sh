#!/usr/bin/env bash
# tests/scripts/test-bump-changelog-cut.sh
# (a) wiring: bump-version.sh invoca o changelog-cut; e o CLI corta um CHANGELOG
# real ([Unreleased] → [X.Y.Z] + data, preservando [Unreleased] no topo).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

grep -q "changelog-cut" "$ROOT/scripts/bump-version.sh" || {
  echo "FALHA: bump-version.sh não invoca o changelog-cut (corte não é atômico com o bump)"; exit 1; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf '# Changelog\n\n## [Unreleased]\n\n### Added\n- x\n\n## [1.0.0] — 2026-01-01\n- init\n' > "$tmp/CHANGELOG.md"
node "$ROOT/scripts/lib/changelog-cut.mjs" 1.1.0 --date 2026-07-02 --file "$tmp/CHANGELOG.md" >/dev/null

grep -q '## \[1.1.0\] — 2026-07-02' "$tmp/CHANGELOG.md" || { echo "FALHA: CLI não criou a seção [1.1.0]"; exit 1; }
grep -q '## \[Unreleased\]' "$tmp/CHANGELOG.md" || { echo "FALHA: [Unreleased] novo não foi preservado no topo"; exit 1; }
# o conteúdo migrou p/ [1.1.0] (### Added aparece depois de [1.1.0] e antes de [1.0.0])
awk '/## \[1.1.0\]/{a=NR} /### Added/{b=NR} /## \[1.0.0\]/{c=NR} END{exit !(a<b && b<c)}' "$tmp/CHANGELOG.md" || {
  echo "FALHA: conteúdo do Unreleased não migrou para sob [1.1.0]"; exit 1; }

echo "OK test-bump-changelog-cut"

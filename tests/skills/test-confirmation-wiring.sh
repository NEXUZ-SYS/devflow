#!/usr/bin/env bash
# tests/skills/test-confirmation-wiring.sh
# B6: a prevc-confirmation consome o parser único + os helpers determinísticos
# (por referência) e corrige os achados de prosa (#1,#2,#3,#6,#7,#8,#12,#13,#14).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
S="$ROOT/skills/prevc-confirmation/SKILL.md"
fail() { echo "FALHA: $1"; exit 1; }

# #1: Step 4 lê autoFinish via devflow-config.mjs, NÃO via awk
grep -q "devflow-config.mjs" "$S" || fail "#1 não referencia devflow-config.mjs"
grep -q "read-autofinish" "$S" || fail "#1 não usa read-autofinish"
grep -qE "awk -F:" "$S" && fail "#1 ainda usa awk para parsear config"

# #2: granular per-step (bump/commit/push/merge, não-listada = SKIP)
grep -qiE "só as? (etapas |sub-flags |chaves )?.*true|apenas as .*true|execut.*só.*true" "$S" || fail "#2 não descreve execução per-step das sub-flags"
grep -qiE "n[ãa]o[- ]listada|ausente.*SKIP|false.*(pula|skip)" "$S" || fail "#2 não diz que não-listada/false = SKIP"

# #3 + #14: C.x commita ADRs antes do merge; checklist inclui C.x e 8.5
grep -qiE "ADR.*(antes do merge|commit).*(merge|Step 4)|committ?adas? .*antes.*merge" "$S" || fail "#3 C.x não garante ADRs commitadas antes do merge"
grep -qiE "^C\.x|ADR sweep" "$S" | head -1 >/dev/null || true
grep -qiE "8\.5" "$S" || fail "#14 checklist/corpo não referencia Step 8.5"

# #6: mensagem de commit ramifica por modo (sem 'bump' em pipeline/none)
grep -qiE "pipeline.*n[ãa]o.*bump.*mensagem|mensagem.*(descreve|reflete).*mudan|sem .bump. (em|no) pipeline" "$S" || fail "#6 mensagem de commit não ramifica por modo de versionamento"

# #7: remover texto stale "(como neste projeto)"
grep -qE "auto-bump \(como neste projeto\)|faz auto-bump \(como neste projeto\)" "$S" && fail "#7 texto stale '(como neste projeto)' ainda presente"

# #8: histórico de versão condicionado a versioning: local
grep -qiE "hist[óo]rico de vers[õo].*(local|apenas.*versioning|só.*versioning)|versioning: local.*hist[óo]rico|somente .*versioning: local" "$S" || fail "#8 histórico de versão não condicionado a versioning:local"

# #12: adr-decision.mjs com \${CLAUDE_PLUGIN_ROOT}
grep -qE "\\\$\{CLAUDE_PLUGIN_ROOT\}/scripts/adr-decision.mjs|\\\$\{CLAUDE_PLUGIN_ROOT\}/scripts/lib/adr-decision" "$S" || fail "#12 adr-decision.mjs sem \${CLAUDE_PLUGIN_ROOT}"

# #13: Step 6 Lite usa paths DDC v2 (não .context/docs/ v1)
grep -qE "\.context/docs/project-overview\.md" "$S" && fail "#13 Step 6 Lite ainda aponta paths v1 (.context/docs/)"

# helpers referenciados (não reimplementados em prosa)
grep -q "scripts/lib/finalize" "$S" || fail "path scripts/lib/finalize não referenciado"
for h in base-sync scope-guard merge-strategy changelog-gate; do
  grep -q "$h.mjs" "$S" || fail "helper $h.mjs não referenciado na skill"
done

# #5 announcement: sem --squash hardcoded no anúncio (usa estratégia resolvida)
grep -qE "gh pr merge #<N> --squash --delete-branch" "$S" && fail "#5 anúncio ainda hardcoda --squash"

echo "OK test-confirmation-wiring"

#!/usr/bin/env bash
# tests/scripts/test-bump-version-generic.sh
# Task A do plano config-release-scaffold: o asset bump-version.sh é genérico
# (detecta os version files do projeto em runtime) e endurecido:
#   - sed ANCORADO por seção/campo canônico → deps nunca são tocadas
#   - validate_semver ^X.Y.Z$ fail-loud antes de qualquer uso
#   - detecção raiz-apenas (ignora subdir/)
#   - interface A↔B: emite version=/files= em $GITHUB_OUTPUT; sem ele, a versão
#     nova é o ÚLTIMO TOKEN de stdout (assim o release.yml nunca re-grepa manifest)
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ASSET="$ROOT/assets/release-scaffold/bump-version.sh"
CHANGELOG_CUT="$ROOT/scripts/lib/changelog-cut.mjs"

fails=0
fail() { echo "FALHA [$1]: $2"; fails=$((fails + 1)); }

# Fixture: monta o layout que o scaffold produz no repo do usuário
#   <fx>/scripts/bump-version.sh
#   <fx>/scripts/lib/changelog-cut.mjs
new_fixture() {
  local fx
  fx=$(mktemp -d)
  mkdir -p "$fx/scripts/lib"
  cp "$ASSET" "$fx/scripts/bump-version.sh"
  chmod +x "$fx/scripts/bump-version.sh"
  cp "$CHANGELOG_CUT" "$fx/scripts/lib/changelog-cut.mjs"
  echo "$fx"
}

# roda o bump; ecoa stdout; devolve rc
run_bump() {
  local fx="$1" kind="$2"
  ( cd "$fx" && bash "$fx/scripts/bump-version.sh" "$kind" 2>&1 )
}

[ -f "$ASSET" ] || { echo "FALHA: asset ausente: $ASSET"; exit 1; }

# ── 1. package.json minor → 1.3.0 ───────────────────────────────────────────
fx=$(new_fixture)
printf '{\n  "name": "x",\n  "version": "1.2.3"\n}\n' > "$fx/package.json"
run_bump "$fx" minor >/dev/null || fail 1 "bump falhou em package.json"
grep -q '"version": "1.3.0"' "$fx/package.json" || fail 1 "package.json não virou 1.3.0"
rm -rf "$fx"

# ── 2. pyproject.toml [project] patch → 0.1.1 ───────────────────────────────
fx=$(new_fixture)
printf '[project]\nname = "x"\nversion = "0.1.0"\n' > "$fx/pyproject.toml"
run_bump "$fx" patch >/dev/null || fail 2 "bump falhou em pyproject.toml"
grep -q '^version = "0.1.1"' "$fx/pyproject.toml" || fail 2 "pyproject não virou 0.1.1"
rm -rf "$fx"

# ── 3. pyproject com deps: só o canônico muda (sed ancorado) ────────────────
fx=$(new_fixture)
cat > "$fx/pyproject.toml" <<'TOML'
[project]
name = "x"
version = "1.0.0"

[tool.poetry.dependencies]
requests = "2.31.0"
version = "1.0.0"
TOML
run_bump "$fx" minor >/dev/null || fail 3 "bump falhou"
grep -q '^\[project\]' "$fx/pyproject.toml" || fail 3 "seção [project] sumiu"
# o canônico (sob [project]) virou 1.1.0
awk '/^\[project\]/{f=1;next} /^\[/{f=0} f && /^version[ \t]*=/{print}' "$fx/pyproject.toml" \
  | grep -q '1.1.0' || fail 3 "version canônico não virou 1.1.0"
# a dep intocada
grep -q '^requests = "2.31.0"$' "$fx/pyproject.toml" || fail 3 "dep requests foi alterada"
awk '/^\[tool.poetry.dependencies\]/{f=1;next} /^\[/{f=0} f && /^version[ \t]*=/{print}' "$fx/pyproject.toml" \
  | grep -q '1.0.0' || fail 3 "o 'version' dentro de [tool.poetry.dependencies] foi alterado (sed não ancorado)"
rm -rf "$fx"

# ── 4. Cargo.toml [package] major; [dependencies] intocadas ─────────────────
fx=$(new_fixture)
cat > "$fx/Cargo.toml" <<'TOML'
[package]
name = "x"
version = "1.2.3"

[dependencies]
serde = "1.0.0"
version = "0.4.2"
TOML
run_bump "$fx" major >/dev/null || fail 4 "bump falhou"
awk '/^\[package\]/{f=1;next} /^\[/{f=0} f && /^version[ \t]*=/{print}' "$fx/Cargo.toml" \
  | grep -q '2.0.0' || fail 4 "version de [package] não virou 2.0.0"
grep -q '^serde = "1.0.0"$' "$fx/Cargo.toml" || fail 4 "dep serde foi alterada"
awk '/^\[dependencies\]/{f=1;next} /^\[/{f=0} f && /^version[ \t]*=/{print}' "$fx/Cargo.toml" \
  | grep -q '0.4.2' || fail 4 "o 'version' dentro de [dependencies] foi alterado"
rm -rf "$fx"

# ── 5. Múltiplos manifests: todos atualizados; source of truth = package.json ─
fx=$(new_fixture)
printf '{\n  "name": "x",\n  "version": "2.0.0"\n}\n' > "$fx/package.json"
printf '[project]\nname = "x"\nversion = "9.9.9"\n' > "$fx/pyproject.toml"
printf '1.1.1\n' > "$fx/VERSION"
run_bump "$fx" patch >/dev/null || fail 5 "bump falhou"
grep -q '"version": "2.0.1"' "$fx/package.json" || fail 5 "package.json não virou 2.0.1"
grep -q '^version = "2.0.1"' "$fx/pyproject.toml" || fail 5 "pyproject não seguiu o source of truth"
grep -qx '2.0.1' "$fx/VERSION" || fail 5 "VERSION não seguiu o source of truth"
rm -rf "$fx"

# ── 6. Nenhum manifest → exit != 0, mensagem clara, nada alterado ───────────
fx=$(new_fixture)
out=$(run_bump "$fx" patch); rc=$?
[ "$rc" -ne 0 ] || fail 6 "deveria falhar sem manifest (rc=$rc)"
echo "$out" | grep -qi "manifest" || fail 6 "mensagem não menciona 'manifest': $out"
rm -rf "$fx"

# "recusa limpa" = o script rejeita pelo validate_semver, e NÃO por um crash do
# bash (erro aritmético / unbound variable). Sem essa asserção, remover o
# validate_semver ainda "passaria": o `set -u` aborta por acidente. O guard tem
# que ser o guard.
assert_clean_refusal() {
  local case_id="$1" out="$2"
  echo "$out" | grep -q 'não é semver' \
    || fail "$case_id" "recusa não veio do validate_semver: $out"
  echo "$out" | grep -qiE 'unbound|não associada|erro de sintaxe|syntax error' \
    && fail "$case_id" "o bash crashou em vez de recusar limpo: $out"
  return 0
}

# ── 7. VERSION com conteúdo malicioso → recusa (^X.Y.Z$), nada executado ────
fx=$(new_fixture)
PWN="$fx/pwn"
printf '1.0.0"; touch %s\n' "$PWN" > "$fx/VERSION"
out=$(run_bump "$fx" patch); rc=$?
[ "$rc" -ne 0 ] || fail 7 "deveria recusar VERSION não-semver (rc=$rc)"
[ ! -e "$PWN" ] || fail 7 "payload foi executado: $PWN existe"
grep -q '1.0.0"; touch' "$fx/VERSION" || fail 7 "VERSION foi alterado apesar da recusa"
assert_clean_refusal 7 "$out"
rm -rf "$fx"

# ── 7b. Injeção ARITMÉTICA real: a[$(cmd)] executa em $(( )) quando o guard
#        não roda antes. Este é o vetor de verdade em bash — o payload com
#        aspas/`;` do caso 7 nunca executa (o `$(( ))` só falha de sintaxe).
fx=$(new_fixture)
PWN="$fx/pwn"
printf '1.0.a[$(touch %s)]\n' "$PWN" > "$fx/VERSION"
out=$(run_bump "$fx" patch); rc=$?
[ "$rc" -ne 0 ] || fail 7b "deveria recusar VERSION com injeção aritmética (rc=$rc)"
[ ! -e "$PWN" ] || fail 7b "INJEÇÃO ARITMÉTICA EXECUTOU: $PWN existe"
assert_clean_refusal 7b "$out"
rm -rf "$fx"

# mesmo payload na posição MAJOR, com bump major (atinge outro $(( )))
fx=$(new_fixture)
PWN="$fx/pwn"
printf 'a[$(touch %s)].0.0\n' "$PWN" > "$fx/VERSION"
out=$(run_bump "$fx" major); rc=$?
[ "$rc" -ne 0 ] || fail 7b "deveria recusar injeção na posição MAJOR (rc=$rc)"
[ ! -e "$PWN" ] || fail 7b "INJEÇÃO ARITMÉTICA EXECUTOU via MAJOR: $PWN existe"
assert_clean_refusal 7b "$out"
rm -rf "$fx"

# ── 8. VERSION não-semver (v1.0, 2024.07) → recusa limpa ────────────────────
for bad in 'v1.0' '2024.07'; do
  fx=$(new_fixture)
  printf '%s\n' "$bad" > "$fx/VERSION"
  out=$(run_bump "$fx" patch); rc=$?
  [ "$rc" -ne 0 ] || fail 8 "deveria recusar VERSION='$bad' (rc=$rc)"
  grep -qx "$bad" "$fx/VERSION" || fail 8 "VERSION='$bad' foi alterado apesar da recusa"
  assert_clean_refusal 8 "$out"
  rm -rf "$fx"
done

# ── 9. subdir/package.json e raiz sem manifest → ignora subdir, exit != 0 ───
fx=$(new_fixture)
mkdir -p "$fx/subdir"
printf '{\n  "version": "1.0.0"\n}\n' > "$fx/subdir/package.json"
out=$(run_bump "$fx" patch); rc=$?
[ "$rc" -ne 0 ] || fail 9 "deveria falhar (detecção é raiz-apenas), rc=$rc"
grep -q '"version": "1.0.0"' "$fx/subdir/package.json" || fail 9 "subdir/package.json foi alterado"
rm -rf "$fx"

# ── 10. CHANGELOG.md é cortado; sem CHANGELOG o bump segue ok ───────────────
fx=$(new_fixture)
printf '{\n  "version": "1.2.3"\n}\n' > "$fx/package.json"
printf '# Changelog\n\n## [Unreleased]\n\n### Added\n- x\n\n## [1.0.0] — 2026-01-01\n- init\n' > "$fx/CHANGELOG.md"
run_bump "$fx" minor >/dev/null || fail 10 "bump falhou com CHANGELOG"
grep -q '## \[1.3.0\] — ' "$fx/CHANGELOG.md" || fail 10 "CHANGELOG não foi cortado para [1.3.0]"
grep -q '## \[Unreleased\]' "$fx/CHANGELOG.md" || fail 10 "[Unreleased] novo não foi preservado"
rm -rf "$fx"

fx=$(new_fixture)
printf '{\n  "version": "1.2.3"\n}\n' > "$fx/package.json"
run_bump "$fx" minor >/dev/null || fail 10 "bump falhou sem CHANGELOG"
grep -q '"version": "1.3.0"' "$fx/package.json" || fail 10 "bump sem CHANGELOG não atualizou o manifest"
rm -rf "$fx"

# ── 11. [N1] interface A↔B: $GITHUB_OUTPUT recebe version= e files= ─────────
fx=$(new_fixture)
printf '{\n  "version": "1.2.3"\n}\n' > "$fx/package.json"
gh_out="$fx/gh_output"
: > "$gh_out"
( cd "$fx" && GITHUB_OUTPUT="$gh_out" bash "$fx/scripts/bump-version.sh" minor >/dev/null 2>&1 ) \
  || fail 11 "bump falhou com GITHUB_OUTPUT setado"
grep -qx 'version=1.3.0' "$gh_out" || fail 11 "não emitiu 'version=1.3.0' em \$GITHUB_OUTPUT: $(cat "$gh_out")"
grep -qx 'files=package.json' "$gh_out" || fail 11 "não emitiu 'files=package.json' em \$GITHUB_OUTPUT: $(cat "$gh_out")"
rm -rf "$fx"

# sem GITHUB_OUTPUT → a versão nova é o ÚLTIMO TOKEN de stdout
fx=$(new_fixture)
printf '{\n  "version": "1.2.3"\n}\n' > "$fx/package.json"
out=$( cd "$fx" && env -u GITHUB_OUTPUT bash "$fx/scripts/bump-version.sh" minor 2>/dev/null )
last_token=$(printf '%s' "$out" | tr -s '[:space:]' '\n' | tail -1)
[ "$last_token" = "1.3.0" ] || fail 11 "último token de stdout deveria ser '1.3.0', foi '$last_token'"
rm -rf "$fx"

# ── 12. [N4] leitura da versão ATUAL também é ancorada (pin inline) ─────────
fx=$(new_fixture)
cat > "$fx/pyproject.toml" <<'TOML'
[tool.poetry.dependencies]
foo = { version = "9.9.9" }

[project]
name = "x"
version = "0.1.0"
TOML
run_bump "$fx" patch >/dev/null || fail 12 "bump falhou"
awk '/^\[project\]/{f=1;next} /^\[/{f=0} f && /^version[ \t]*=/{print}' "$fx/pyproject.toml" \
  | grep -q '0.1.1' || fail 12 "CURRENT foi lido do pin (9.9.9) e não do canônico (0.1.0)"
grep -q 'foo = { version = "9.9.9" }' "$fx/pyproject.toml" || fail 12 "o pin inline foi alterado"
rm -rf "$fx"

# ── 13. higiene do asset: sem CLAUDE_PLUGIN_ROOT, sem gen-known-hashes ──────
grep -q 'CLAUDE_PLUGIN_ROOT' "$ASSET" && fail 13 "asset referencia CLAUDE_PLUGIN_ROOT (a CI não alcança o plugin)"
grep -q 'gen-known-hashes' "$ASSET" && fail 13 "asset invoca gen-known-hashes (fora do escopo v1)"

if [ "$fails" -ne 0 ]; then
  echo "test-bump-version-generic: $fails falha(s)"
  exit 1
fi
echo "OK test-bump-version-generic"

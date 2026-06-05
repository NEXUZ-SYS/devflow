# Standalone Standards DDC Restructure + Fetch Retarget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** standards-standalone-ddc-restructure | **Scale:** MEDIUM | **Phase:** P→R
> **Spec:** `docs/superpowers/specs/2026-06-05-standards-standalone-ddc-restructure-design.md`
> **Branch:** `feat/standards-standalone-ddc-restructure`

**Goal:** Reestruturar o repo standalone `NEXUZ-SYS/devflow-standards` no layout DDC e retargetar `scripts/update-default-standards.sh` para buscar os `.md` de `.context/engineering/standards/`, mantendo `.js` bundled-only (anti-RCE).

**Architecture:** Mudança cirúrgica de duas linhas de path no script (subdir constante que controlamos — R3/R4/R6/anti-traversal preservados), provada por TDD com o seam `DEVFLOW_STANDARDS_BASE_TEST=file://` (fixtures movidas para o novo subpath). O repo standalone é populado out-of-band (outward, confirmado). ADR-007 evolui para v2.2.0.

**Tech Stack:** bash (`curl -fsSI`/`-fsSL`, file:// seam), shell test harness, `gh` CLI (clone/push do repo standalone).

**Agents:** devops-specialist (script retarget + população), test-writer (TDD do retarget), documentation-writer (ADR + READMEs + doc de sync).

---

## File Structure

| Caminho | Responsabilidade | Ação |
|---|---|---|
| `scripts/update-default-standards.sh:93,144` | Retarget do HEAD guard + fetch para `.context/engineering/standards/` | Modify |
| `tests/scripts/test-update-default-standards.sh` | Fixtures upstream movidas p/ novo subpath (RED→GREEN) | Modify |
| `.context/engineering/adrs/007-default-standards-library-v2.2.0.md` | ADR evoluída | Create |
| `.context/engineering/adrs/README.md` | Índice regenerado | Modify (via script) |
| `docs/standards-standalone-sync.md` | Doc do sync `.js` release-time (D4) + layout DDC do repo | Create |
| **repo `NEXUZ-SYS/devflow-standards`** (outward) | Layout DDC + 21 .md + MANIFEST + machine/*.js + READMEs; root limpo | Restructure+push |

---

## Phase 1 — Retarget do fetch (TDD)
**Agent:** test-writer + devops-specialist

### Task 1.1: Mover as fixtures do teste para o novo subpath (RED)

**Files:** Modify `tests/scripts/test-update-default-standards.sh`

> O teste usa `DEVFLOW_STANDARDS_BASE_TEST="file://${upstream}"` e hoje escreve `MANIFEST.txt` + `std-*.md` no **root** de cada `${upstream}`. O retarget exige que estejam em `${upstream}/.context/engineering/standards/`. Mover as fixtures faz o teste FALHAR contra o script atual (que busca do root) → RED.

- [ ] **Step 1:** Em CADA fixture upstream (Tests 2, 3, 4, 5), trocar a escrita do `MANIFEST.txt` e dos `std-*.md` do root de `${upstreamN}` para `${upstreamN}/.context/engineering/standards/`. Exemplo (Test 2):

```bash
upstream2="${TMP_DIR}/upstream2"
up2_std="${upstream2}/.context/engineering/standards"
mkdir -p "$up2_std"
printf 'std-security.md\n' > "${up2_std}/MANIFEST.txt"
cat > "${up2_std}/std-security.md" <<'STDEOF'
# Security Standard — updated by mock
This is the refreshed content from upstream.
STDEOF
```
Aplicar o mesmo padrão (criar `${upstreamN}/.context/engineering/standards/` e escrever lá) nos Tests 3, 4, 5. O `--standards-dir` (destino local) e os MANIFEST locais permanecem como estão (o destino no plugin segue `assets/standards/`).

- [ ] **Step 2: Rodar e ver FALHAR** — `bash tests/scripts/test-update-default-standards.sh` → Tests 2 e 4 FALHAM ("updated with upstream content" / "legitimate content preserved" não acontecem, pois o script busca do root e o upstream agora serve do subpath → HEAD 404 → no-op). Confirme que falham por isso (não por erro de sintaxe).

- [ ] **Step 3: Commit (RED)** — opcional; preferir commitar junto no GREEN. Se commitar: `git add tests/scripts/test-update-default-standards.sh && git commit -m "test(standards): fixtures upstream no layout DDC (.context/engineering/standards) — RED (Phase 1)"`

### Task 1.2: Retargetar o script (GREEN)

**Files:** Modify `scripts/update-default-standards.sh`

- [ ] **Step 1: Adicionar a constante de subpath** após a definição de `BASE_URL` (linha ~63):

```bash
# Standards live under the DDC layout in the standalone repo (D2).
# This subdir is a CONSTANT we control — never derived from MANIFEST (anti-traversal).
readonly STD_SUBPATH=".context/engineering/standards"
```

- [ ] **Step 2: Retargetar o HEAD guard** (linha ~93):

```bash
manifest_head_url="${BASE_URL}/${STD_SUBPATH}/MANIFEST.txt"
```

- [ ] **Step 3: Retargetar o fetch URL** (linha ~144, dentro do loop):

```bash
fetch_url="${BASE_URL}/${STD_SUBPATH}/${safe_name}"
```

(O `target`/`tmp_target` continuam em `${STANDARDS_DIR}/${safe_name}` — destino local inalterado. `ENTRY_RE`, R4 basename-only, R6 SI-6 intactos.)

- [ ] **Step 4: Rodar e ver PASSAR** — `bash tests/scripts/test-update-default-standards.sh` → todos os 5 testes GREEN (happy path busca do novo subpath; offline/traversal/sanitização/anti-RCE seguem verdes).

- [ ] **Step 5: Commit** — `git add scripts/update-default-standards.sh tests/scripts/test-update-default-standards.sh && git commit -m "feat(standards): retarget fetch para .context/engineering/standards (D2, TDD) (Phase 1)"`

### Task 1.3: Teste explícito anti-RCE no novo path (regressão)

**Files:** Modify `tests/scripts/test-update-default-standards.sh`

> Garantir que, mesmo com o upstream servindo um `machine/x.js` no novo subpath, o script NUNCA o busca (só `std-*.md` do MANIFEST local).

- [ ] **Step 1: Adicionar Test 6** ao final (antes do Report):

```bash
echo "=== Test 6: anti-RCE no novo path — machine/*.js no upstream nunca é fetchado ==="
upstream6="${TMP_DIR}/upstream6"
up6_std="${upstream6}/.context/engineering/standards"
mkdir -p "${up6_std}/machine"
printf 'std-security.md\n' > "${up6_std}/MANIFEST.txt"
printf '# sec\nok\n' > "${up6_std}/std-security.md"
printf 'console.log("EVIL");\n' > "${up6_std}/machine/std-security.js"
workdir6=$(make_workdir "test6")
standards6="${workdir6}/assets/standards"
printf 'std-security.md\n' > "${standards6}/MANIFEST.txt"
exit_code6=0
DEVFLOW_STANDARDS_BASE_TEST="file://${upstream6}" \
  bash "$HELPER" --standards-dir "$standards6" 2>/dev/null || exit_code6=$?
assert_true "test6: exits 0" '[ "$exit_code6" -eq 0 ]'
assert_true "test6: nenhum .js escrito no destino" \
  '[ -z "$(find "$standards6" -name "*.js" 2>/dev/null)" ]'
assert_file_contains "test6: o .md foi atualizado do novo path" \
  "${standards6}/std-security.md" "ok"
```

- [ ] **Step 2: Rodar** → 6 testes GREEN (Test 6 prova: `.md` busca do novo path, `.js` nunca tocado).
- [ ] **Step 3: Commit** — `git add tests/scripts/test-update-default-standards.sh && git commit -m "test(standards): anti-RCE no novo path — .js nunca fetchado (Phase 1)"`

---

## Phase 2 — ADR-007 v2.2.0 + doc de sync
**Agent:** documentation-writer

### Task 2.1: ADR-007 → v2.2.0

**Files:** Create `.context/engineering/adrs/007-default-standards-library-v2.2.0.md`; Modify `.context/engineering/adrs/README.md`

- [ ] **Step 1:** LER `.context/engineering/adrs/007-default-standards-library-v2.1.0.md`. Criar `007-default-standards-library-v2.2.0.md` espelhando a estrutura, com:
  - `version: 2.2.0`, `status: Aprovado`, `supersedes: ["007-default-standards-library-v2.1.0"]`, `created: 2026-06-05`.
  - **Decisão:** o repo standalone `devflow-standards` adota o **layout DDC** (`.context/business|product|operations|engineering/standards`); os `.md` dos standards passam a ser fetchados de `.context/engineering/standards/` (antes: root). **A invariante não muda:** `.js` seguem **bundled-only** — o repo os contém como FONTE em `machine/`, mas o `update` NUNCA os fetcha (só `.md`).
  - **Guardrails (manter todos da v2.1.0 + adicionar):** "SEMPRE fetchar `.md` de `.context/engineering/standards/` no repo standalone (subpath constante, nunca derivado do MANIFEST)"; "NUNCA fetchar `machine/*.js` — bundled-only, sync plugin↔repo só no release com revisão".
  - **Enforcement:** referenciar `tests/scripts/test-update-default-standards.sh` (Tests 2/4 retarget + Test 6 anti-RCE no novo path).
- [ ] **Step 2:** Regenerar o índice: `node scripts/adr-update-index.mjs`. Marcar v2.1.0 como Substituído no seu frontmatter (editar `status: Aprovado`→`Substituido` em `007-...-v2.1.0.md`) e regenerar de novo.
- [ ] **Step 3: Audit** — `node scripts/adr-audit.mjs` (ou o caminho real) sobre a v2.2.0 → PASSED (o gate BLOCKED de Aprovado-protected é esperado, como na v2.1.0).
- [ ] **Step 4: Commit** — `git add .context/engineering/adrs/007-default-standards-library-v2.2.0.md .context/engineering/adrs/007-default-standards-library-v2.1.0.md .context/engineering/adrs/README.md && git commit -m "docs(adr): ADR-007 v2.2.0 — layout DDC do standalone + fetch retarget, Aprovado (Phase 2)"`

### Task 2.2: Doc de sync `.js` release-time (D4)

**Files:** Create `docs/standards-standalone-sync.md`

- [ ] **Step 1:** Escrever (pt-BR) o doc que descreve: (a) o layout DDC do repo standalone; (b) que os `.md` são fetchados pelo `update` de `.context/engineering/standards/`; (c) que `machine/*.js` são **FONTE no repo mas bundled-only** — sincronizados ao plugin (`assets/standards/machine/`) **no release**, com revisão humana, nunca via fetch; (d) o procedimento de verificação byte-match (clone do repo + `diff` dos `machine/*.js` contra o plugin) a rodar no release/CI.
- [ ] **Step 2: Commit** — `git add docs/standards-standalone-sync.md && git commit -m "docs(standards): processo de sync .js release-time + layout DDC do standalone (Phase 2)"`

---

## Phase 3 — Restruturação + população do repo standalone (outward)
**Agent:** devops-specialist

> **OUTWARD — confirmação obrigatória.** Esta phase clona e dá push em `NEXUZ-SYS/devflow-standards`. O orquestrador (não o subagent) executa os comandos de rede APÓS confirmação explícita do usuário do comando final. Subagents de implementação NÃO fazem push.

### Task 3.1: Construir o layout DDC num clone e revisar o diff

**Files (no clone tmp do repo standalone):** estrutura `.context/...` + READMEs

- [ ] **Step 1:** Clonar para tmp: `tmp=$(mktemp -d); gh repo clone NEXUZ-SYS/devflow-standards "$tmp"`.
- [ ] **Step 2:** Montar o layout DDC dentro de `$tmp`:
  - `mkdir -p "$tmp/.context/engineering/standards/machine" "$tmp/.context/business" "$tmp/.context/product" "$tmp/.context/operations"`
  - Copiar do plugin: os 21 `assets/standards/std-*.md` + `MANIFEST.txt` → `"$tmp/.context/engineering/standards/"`; os 13 `assets/standards/machine/*.js` → `"$tmp/.context/engineering/standards/machine/"`.
  - Escrever `README.md` em `business/`, `product/`, `operations/` (reservado p/ default content futuro) e um `README.md` no root explicando o layout + invariante `.js`-bundled-only.
  - Remover do **root** do repo qualquer `MANIFEST.txt`/`std-*.md` stale (`git -C "$tmp" rm --quiet MANIFEST.txt std-*.md 2>/dev/null || true`).
- [ ] **Step 3: Verificação byte-match (D4)** — `diff -r assets/standards/machine "$tmp/.context/engineering/standards/machine"` → vazio (linters idênticos plugin↔repo).
- [ ] **Step 4: Revisar o diff** — `git -C "$tmp" add -A && git -C "$tmp" status && git -C "$tmp" diff --cached --stat`. Apresentar o resumo ao usuário ANTES do push.

### Task 3.2: Commit + push (confirmado)

- [ ] **Step 1:** Commit no clone: `git -C "$tmp" commit -m "restructure: layout DDC (.context/) + standards 1.11.0 enriquecidos + linters como fonte + READMEs"`.
- [ ] **Step 2: CONFIRMAR com o usuário** o comando de push. Após OK: `git -C "$tmp" push origin main`.
- [ ] **Step 3: Smoke test do fetch real** — com o repo já reestruturado, rodar `bash scripts/update-default-standards.sh --standards-dir <tmp-destino-cópia>` SEM o seam de teste (usa PROD_BASE real) e confirmar que os `.md` são refrescados do novo path e nenhum `.js` é escrito. (Rodar contra uma cópia tmp do `assets/standards`, nunca in-place.)
- [ ] **Step 4:** `rm -rf "$tmp"`. Registrar o SHA do push do repo standalone no resumo final.

---

## Self-Review (cobertura do spec)

| Spec AC | Task(s) |
|---|---|
| AC1 (fetch do novo path, teste verde, sem .js) | 1.1, 1.2, 1.3 |
| AC2 (script antigo → no-op após root limpo) | 3.1 Step 2 (remoção root) + D3 (HEAD 404 no-op, já no script) |
| AC3 (repo reestruturado + push) | 3.1, 3.2 |
| AC4 (ADR v2.2.0 Aprovado) | 2.1 |
| AC5 (doc de sync .js) | 2.2 |
| AC6 (suíte verde) | 1.2, 1.3 Step 2 + smoke 3.2 Step 3 |

TDD: a única mudança de código (script, Phase 1) é test-first (RED em 1.1 antes do GREEN em 1.2). Phases 2-3 são docs/ADR/ops (sem lógica nova de código além do script). Sem placeholders; paths exatos; o subpath é constante (anti-traversal preservado).

> **Nota outward:** Phase 3 mexe em repo remoto — push só após confirmação explícita do comando. A verificação byte-match (3.1 Step 3) e o smoke real (3.2 Step 3) provam D4 e o retarget ponta-a-ponta.

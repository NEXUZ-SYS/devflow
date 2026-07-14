# Pipeline de Sinal Verificável — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DevFlow workflow:** verify-signal-pipeline | **Scale:** LARGE | **Phase:** P→R
> **Spec:** `docs/superpowers/specs/2026-07-09-verify-signal-pipeline-design.md` (aprovada, 9 decisões D1–D9)
> **Branch:** `feature/verify-signal-pipeline`

**Goal:** Converter o estágio Test (fase V) do PREVC de *afirmação do agente* para *observação de um sinal externo*, produzido por código e arbitrado por CI.

**Architecture:** Três peças com uma responsabilidade cada — um **contrato** (`verify:` no `.context/.devflow.yaml`, lido pelo parser único da ADR-011), um **executor** (`verify-run.mjs` roda um sinal via `execFile` e faz append num ledger JSONL com `treeDigest`), e um **gate** (a skill `prevc-validation` só *lê* o ledger). Um **CI árbitro** re-roda os mesmos sinais pelo mesmo executor. Dois **guards** fecham o modelo de ameaça de reward-hacking: um contra enfraquecer testes, outro contra neutralizar o próprio contrato.

**Tech Stack:** Node.js 24 (`node:test`, zero-dep, ESM `.mjs`), Bash (runners + hooks), GitHub Actions. Reusa `scripts/lib/frontmatter.mjs` (parser YAML zero-dep já existente).

## Global Constraints

- **Zero dependências novas.** Política no-deps do DevFlow (`observability.yaml`). Só Node stdlib + git + bash.
- **Parser único (ADR-011):** todo campo de `.devflow.yaml` é lido por `scripts/lib/devflow-config.mjs`. `verify:` NÃO pode ser re-parseado ad-hoc por consumidor. O leitor de `verify:` delega internamente a `frontmatter.mjs`; **não tocar** em `readAutoFinish`/`readVersioning` (paridade bit-exata com o fallback do hook).
- **Segurança de comando (D3):** comandos são **array argv**; `argv[0]` ∈ allowlist `{node, npm, pnpm, python, python3, pytest, make, bash, sh}`; `argv[1]` ∉ `{-c, -e}`. `execFile` sem `sh -c`. String como valor → erro de validação (fail-closed).
- **`.js`/`.mjs` bundled-only (ADR-007):** nenhum script executável é fetchado; tudo versionado.
- **SI-1:** hooks invocam `.mjs` como arquivo com argv, **nunca** `node -e` com path interpolado.
- **Idioma:** todo texto de usuário (mensagens de gate, comentários de doc, ADR) em **pt-BR**.
- **TDD sem exceção:** RED→GREEN→REFACTOR. Todo grupo começa com teste falhando, provado a falhar, antes da implementação.
- **Enumeração reprodutível:** runners enumeram testes via `git ls-files` + filtro de convenção (`test-*.mjs` / `*.test.mjs` / `test-*.sh`), **nunca** glob de shell (`**/*`) — glob coleta artefatos não-rastreados e helpers, produzindo 42-vs-5 falhas conforme a árvore.
- **Convenção de teste do repo:** `.mjs` de teste = `test-*.mjs` ou `*.test.mjs`; helpers usam prefixo `_` ou outro nome e são naturalmente excluídos. `.sh` de teste = `test-*.sh`.

---

## Escopo v1 (o que este plano entrega)

Contrato + executor (CLI) + ledger + runners + CI árbitro + gate de leitura na fase V + `requiredSignals` no plano + guard anti-enfraquecimento de testes + guard do contrato + ADR-013. Precedido de um **Task Group 0** que zera a suíte para o CI nascer verde.

## Fora de escopo v1 (follow-ups com PREVC próprio — ver Anexo A)

1. **Conserto do hook `async:true`** — o `PostToolUse` está registrado com `"async": true`; o Claude Code descarta stdout de hooks async, então o `additionalContext` (e o loop de RED da spec §7) **nunca chega ao agente**. Afeta *todo* projeto DevFlow em *toda* tool call — mudança global de alto risco, ciclo próprio.
2. **Loop rápido local no hook** — depende de (1). O executor deste plano é rodado explicitamente (CLI) na fase E/V; o ledger é gravado por essa invocação, não pelo hook.
3. **Os 5 controles legados possivelmente mortos** (handoff reminder, linter de standards, nudge de stack, guard de bypass PREVC, prompt de commit) — bug, não feature; tratamento separado.

## Invariantes que o v1 NÃO enforça (R-C8 — honestidade sobre o que fica de fora)

A spec §1.4 lista 5 invariantes de consenso. O v1 entrega **3** e adia **2**, porque os adiados eram trabalho do hook (cortado):

| Invariante (spec) | Status no v1 | Onde vive |
|---|---|---|
| Sinal binário externo | ✅ entregue | executor + runners + CI |
| Gerador ≠ verificador | ✅ entregue **via CI required check** (não via gate local, que é auxiliar) | `test.yml` + branch protection (TG7 Step 6) |
| Não editar o juiz | ✅ entregue | guard anti-enfraquecimento (TG5) + guard do contrato (TG6) |
| **Critério de parada** (3 REDs → escala) | ⏳ adiado | dependia do hook; `consecutiveReds` (TG2) fica pronto mas sem consumidor no v1 |
| **Orçamento de tentativas** | ⏳ adiado | idem |

Também **sem enforcement/teste no v1** (saíram com o hook): a garantia "sinais nunca rodam em session-start" — no v1 vale por **omissão** (não há runner automático no hook), mas não há teste que a trave. Registrado como follow-up.

**Portanto: v1 = _gate honesto arbitrado por CI_, não o _loop limitado com escalação_.** O valor primário da spec (§12.6, "tornar o gate honesto") é entregue; o loop assistido é o próximo plano.

**Correções de fato na spec** (feitas no Task Group 10): §12.1 (1,6s→~24s), §5 (o exemplo `unit: tests/lib/**` cobre 8% da suíte), §7 (o hook **não** entrega o `additionalContext` de forma que chegue ao agente).

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `scripts/lib/devflow-config.mjs` | + `readVerify(src)`: lê e valida o bloco `verify:` (delega a `frontmatter.mjs`) | Modificar |
| `scripts/lib/verify-ledger.mjs` | append-only + leitura de cauda do ledger JSONL; tolerante a linha malformada | Criar |
| `scripts/lib/verify-run.mjs` | `runSignal(name,{root})`: valida contrato → `execFile` → `{signal,exit,durationMs,treeDigest,at}` → append | Criar |
| `scripts/lib/verify-tree-digest.mjs` | `treeDigest(root)`: HEAD + `git status --porcelain` excluindo estado efêmero de workflow | Criar |
| `scripts/lib/test-weakening-guard.mjs` | compara arquivos de teste vs merge-base: sumiço/`.skip`/queda de asserts → BLOCK; novo → livre; override por trailer; fail-closed em CI no merge-base-miss | Criar |
| `scripts/lib/verify-contract-guard-cli.mjs` | guard do contrato `verify:` no CI, contra merge-base (R-C2) | Criar |
| `tests/run-unit.sh` | enumera `unit` (git ls-files + convenção, exclui integration/e2e) e roda `node --test` | Criar |
| `tests/run-integration.sh` | enumera `tests/integration/**` | Criar |
| `tests/run-e2e.sh` | enumera `tests/e2e/*.mjs` + os `test-*.sh` (raiz + aninhados) | Criar |
| `tests/run-lint.sh` | guard de enfraquecimento + guard do contrato + validade do verify: (sinal composto, D6); repassa `BASE_REF` | Criar |
| `.github/workflows/test.yml` | matriz sobre os 4 sinais, `fetch-depth: 0`, `BASE_REF`, mesmo executor | Criar |
| `scripts/lib/devflow-config-guard.mjs` | + detectar neutralização de `verify.*` (remoção de sinal; proposto inválido/inline via `readVerify`) | Modificar |
| `skills/prevc-validation/SKILL.md` | novo Step 1.5: lê o ledger, exige exit 0 c/ digest atual por `requiredSignal` | Modificar |
| `skills/prevc-planning/SKILL.md` | Step 5.5 emite `requiredSignals` no plano | Modificar |
| `skills/config/SKILL.md` | entrevista oferece o bloco `verify:` | Modificar |
| `.context/.devflow.yaml` | novo bloco `verify:` (dogfooding) | Modificar |
| `.context/docs/testing-strategy.md` | corrigir: afirma que não há framework de testes | Modificar |
| `.context/engineering/adrs/013-*.md` | ADR-013: sinal verificável externo (extends 011, 012) | Criar |
| Branch protection (GitHub, fora do repo) | `test.yml` como required check (R-C5) — passo manual verificado na fase C | Config |
| Testes obsoletos (TG0) | `test-skill-adr-refs.mjs`, `test-e2e-standards-default-reversa.mjs`, `test-post-tool-use.sh`, `e2e-omp-authority.sh` | Modificar |

---

## Task Group 0 — Zerar a suíte (pré-condição do CI árbitro)

**Agent:** test-writer
**Por quê primeiro:** um CI obrigatório que nasce vermelho é ignorado — foi o destino do sensor `tests-passing`. O `test.yml` (TG7) só tem valor se a suíte estiver verde. Baseline medido nesta branch: `unit` 2 falhas, `integration` 2–3 falhas, `.sh` 3 falhas; `e2e` mjs 0.

> Nota de disciplina TDD: aqui o "RED" já existe (a suíte está vermelha). O ciclo é: (1) rodar e ver a falha, (2) confirmar que o **produto** está certo e o **teste** está obsoleto (ou vice-versa), (3) corrigir, (4) rodar e ver verde. Cada conserto é uma decisão de design documentada, não um atalho — nenhum assert vira no-op.

### Task 0.1: Consertar `test-skill-adr-refs.mjs` (verbos CLI kebab-case)

**Files:**
- Modify: `tests/validation/test-skill-adr-refs.mjs:15,19,20`

- [ ] **Step 1: Rodar e ver o RED**

Run: `node --test tests/validation/test-skill-adr-refs.mjs`
Expected: FAIL em "execution referencia adr-pending" (`/appendCandidate/` não casa) e "confirmation referencia..." (`/readCandidates/`, `/clearPending/` não casam).

- [ ] **Step 2: Confirmar que o produto está certo**

Run: `grep -oE "append-candidate|read-candidates|clear-pending" skills/prevc-execution/SKILL.md skills/prevc-confirmation/SKILL.md`
Expected: as skills usam os verbos **kebab-case** (commit `dd4c050`, SI-1: trocou `node -e` interpolado por CLIs). A lib `adr-pending.mjs` ainda exporta as funções camelCase — o produto está correto; o teste é que ficou preso na superfície antiga.

- [ ] **Step 3: Atualizar as asserções para os verbos de CLI**

Em `test-skill-adr-refs.mjs`, trocar:
```javascript
test('execution referencia adr-pending (append-candidate)', () => {
  const t = read('skills/prevc-execution/SKILL.md');
  assert.match(t, /adr-pending\.mjs/);
  assert.match(t, /append-candidate/);
});
test('confirmation referencia read-candidates, clear-pending e resolveAdrPath', () => {
  const t = read('skills/prevc-confirmation/SKILL.md');
  assert.match(t, /read-candidates/);
  assert.match(t, /clear-pending/);
  assert.match(t, /resolveAdrPath/);
});
```
(`resolveAdrPath` permanece — está presente em `prevc-confirmation/SKILL.md`.)

- [ ] **Step 4: Ver o GREEN**

Run: `node --test tests/validation/test-skill-adr-refs.mjs`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add tests/validation/test-skill-adr-refs.mjs
git commit -m "test(adr-refs): casar verbos de CLI kebab-case nas skills (obsoleto pós-dd4c050)"
```

### Task 0.2: Consertar `test-e2e-standards-default-reversa.mjs` (contagem de defaults obsoleta)

**Files:**
- Modify: `tests/integration/test-e2e-standards-default-reversa.mjs`

- [ ] **Step 1: Rodar e ver o RED, capturando os números esperado/obtido**

Run: `node --test tests/integration/test-e2e-standards-default-reversa.mjs 2>&1 | grep -A3 'AC1\|AC3'`
Expected: FAIL com mensagens tipo "expected exactly the N defaults, got 26" / "still N unique ids". A contagem de defaults do plugin subiu para **26** (`ls assets/standards/*.md | wc -l`) — os extras são `std-design-antipatterns` e `std-visual-quality` (integração do impeccable, PR #66).

- [ ] **Step 2: Confirmar que o produto está certo**

Run: `ls assets/standards/*.md | wc -l`
Expected: 26. Os defaults é que cresceram; o teste guarda um número congelado. Ler o corpo do teste para achar as constantes de contagem (ex.: `=== 24`, `length, 19`) e o conjunto de ids que ele enumera.

- [ ] **Step 3: Atualizar as expectativas para o conjunto atual**

Ajustar cada literal de contagem e cada lista de ids esperada para refletir os 26 defaults (incluir `std-design-antipatterns` e `std-visual-quality` onde a lista de ids é enumerada; atualizar os totais `merged set is N` / `still N unique ids`). Manter a **estrutura** das asserções (origin, disabled, eject flip) — só os números/ids mudam. Não afrouxar nenhuma asserção estrutural.

- [ ] **Step 4: Ver o GREEN**

Run: `node --test tests/integration/test-e2e-standards-default-reversa.mjs`
Expected: PASS (incl. AC1, AC3, e o caso "reversa, copy").

- [ ] **Step 5: Commit**

```bash
git add tests/integration/test-e2e-standards-default-reversa.mjs
git commit -m "test(standards): atualizar contagem de defaults 24→26 (impeccable PR #66)"
```

### Task 0.3: Reescrever o Test 3 de `test-post-tool-use.sh` (sandbox de estado conhecido)

**Files:**
- Modify: `tests/hooks/test-post-tool-use.sh` (Test 3, ~linha 52)

**Por quê:** Test 3 passa `cwd = $REPO_ROOT` (o repo real) e exige `COMMIT|BRANCH FINISH`. O hook só emite isso se `HAS_CHANGES=true` ou branch `feature/*`. Num checkout limpo de CI (HEAD destacado, árvore limpa) → só `HANDOFF` → falha sempre. O teste precisa de um sandbox git determinístico, como os outros testes do arquivo já fazem.

- [ ] **Step 1: Rodar e observar a dependência de ambiente**

Run: `bash tests/hooks/test-post-tool-use.sh` (na árvore atual — pode passar por acaso, pois há mudanças)
Depois simular o CI: `git stash -u >/dev/null 2>&1; bash tests/hooks/test-post-tool-use.sh; git stash pop >/dev/null 2>&1`
Expected: no segundo, Test 3 FALHA ("missing conditional prompt") — prova a dependência do estado da árvore. (Se o stash falhar por causa do estado de workflow, criar o cenário num tmpdir manualmente para observar.)

- [ ] **Step 2: Reescrever o Test 3 com sandbox**

Substituir o Test 3 por um que cria um repo tmpdir numa branch `feature/*` com uma mudança não-commitada, e roda o hook com `cwd` = esse sandbox:
```bash
# Test 3: TaskUpdate completed em sandbox com mudanças → emite COMMIT
echo "Test 3: TaskUpdate completed emits conditional prompt (sandboxed)"
SB=$(mktemp -d)
(
  cd "$SB"
  git init -q -b main
  git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
  git checkout -q -b feature/x
  mkdir -p .context
  printf 'git:\n  autoFinish: false\n' > .context/.devflow.yaml
  echo "dirty" > file.txt   # mudança não-commitada → HAS_CHANGES=true
)
output=$(echo '{"tool_name":"TaskUpdate","tool_input":{"status":"completed","taskId":"1"},"cwd":"'"$SB"'"}' | bash "$HOOK" 2>/dev/null)
assert_contains "has handoff reminder" "$output" "HANDOFF"
assert_contains "has commit prompt (dirty tree)" "$output" "COMMIT"
rm -rf "$SB"
```
(Segue a memória: sandbox em tmpdir, `rm -rf` só sobre `$SB`, nunca a árvore.)

- [ ] **Step 3: Rodar isolado e no CI-sim**

Run: `bash tests/hooks/test-post-tool-use.sh`
E: `git stash -u >/dev/null 2>&1; bash tests/hooks/test-post-tool-use.sh; git stash pop >/dev/null 2>&1`
Expected: PASS nos dois — Test 3 agora independe do estado da árvore real.

- [ ] **Step 4: Commit**

```bash
git add tests/hooks/test-post-tool-use.sh
git commit -m "test(hook): Test 3 usa sandbox de estado conhecido (era acoplado ao REPO_ROOT)"
```

### Task 0.4: Env-gate no `e2e-omp-authority.sh` + diagnóstico do `pre-commit-version-check.sh`

**Files:**
- Modify: `tests/omp/e2e-omp-authority.sh` (topo)
- Investigate/Modify: `tests/hooks/test-pre-commit-version-check.sh`

- [ ] **Step 1: Env-gate no omp-authority (exige modelo vivo)**

`e2e-omp-authority.sh` valida obediência do modelo com o launcher omp — precisa de runtime `omp` + chamada de modelo. Nunca roda em CI. Adicionar no topo (após `set -euo pipefail` e defs), padrão `RUN_LIVE` já usado no repo:
```bash
if [ "${RUN_LIVE:-0}" != "1" ]; then
  echo "SKIP: e2e-omp-authority requer modelo vivo (defina RUN_LIVE=1 para rodar)"
  exit 0
fi
```
Run: `bash tests/omp/e2e-omp-authority.sh`
Expected: `SKIP: ...`, exit 0.

- [ ] **Step 2: Diagnosticar o pre-commit-version-check (follow-up conhecido)**

Run: `bash tests/hooks/test-pre-commit-version-check.sh; echo "exit=$?"`
Observar quais 2 de 8 casos falham e a causa. **Decisão de rota:**
- Se a causa for obsolescência trivial (versão hardcoded, path mudou) → consertar como 0.1/0.2 (produto certo, teste velho).
- Se for defeito real de produto (o guard de versão está quebrado) → **não** consertar aqui (fora de escopo); env-gate declarado com `SKIP` + registrar como falha conhecida na allowlist do runner (Step 3), com log explícito.

- [ ] **Step 3: Registrar a quarentena explícita (se aplicável)**

Se algum `.sh` for env-gated/quarentenado, criar `tests/.ci-skip.txt` (um path por linha) que os runners leem e **logam** ao pular — nunca pulo silencioso:
```
tests/omp/e2e-omp-authority.sh
```
(pre-commit-version-check entra aqui **apenas** se o Step 2 concluir que é defeito de produto fora de escopo.)

- [ ] **Step 4: Commit**

```bash
git add tests/omp/e2e-omp-authority.sh tests/.ci-skip.txt tests/hooks/test-pre-commit-version-check.sh
git commit -m "test(ci): env-gate omp-authority (RUN_LIVE) + quarentena declarada de testes que exigem ambiente vivo"
```

### Task 0.5: Ignorar dirs de artefato de teste (higiene de reprodutibilidade)

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Confirmar que são artefatos não-rastreados**

Run: `git status --short tests/ | grep '^??' | grep -E 'tests/(2026-|_results)' | head`
Expected: dirs `tests/2026-*/`, `tests/_results/` aparecem como não-rastreados (untracked) — são saídas de execuções antigas, não testes. `git ls-files` já os exclui, mas o glob de shell os coleta (causa das 42 falhas fantasma).

- [ ] **Step 2: Adicionar ao .gitignore**

Anexar a `.gitignore`:
```
# Artefatos de execução de testes (sandboxes datados, não são fonte)
tests/20[0-9][0-9]-*/
tests/_results/
```

- [ ] **Step 3: Verificar limpeza do status**

Run: `git status --short tests/ | grep -E 'tests/(2026-|_results)'`
Expected: vazio (agora ignorados).

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore(gitignore): ignorar sandboxes datados de teste (higiene do runner)"
```

### Task 0.6: Baseline verde consolidado

- [ ] **Step 1: Rodar a suíte completa via a enumeração-alvo e confirmar 0 falhas**

Run (temporário, será substituído pelos runners no TG4):
```bash
node -e '
import("node:child_process").then(({execFileSync})=>{
  const t=execFileSync("git",["ls-files","--","*.mjs"],{encoding:"utf8"}).split("\n").filter(Boolean)
    .filter(f=>/(^|\/)(test-[^/]*|[^/]*\.test)\.mjs$/.test(f));
  try{execFileSync("node",["--test",...t],{stdio:"inherit"})}catch(e){process.exit(1)}
})'
```
E os `.sh`: `for f in $(git ls-files "tests/**/test-*.sh"); do bash "$f" >/dev/null 2>&1 || echo "FALHA: $f"; done`
Expected: `.mjs` 0 falhas; `.sh` sem "FALHA:" (exceto os env-gated, que imprimem SKIP e saem 0).

- [ ] **Step 2: Commit (marco)**

Nada a commitar se limpo; senão, este é o gate: a suíte está verde antes do CI entrar.

---

## Task Group 1 — Contrato: leitor de `verify:` no parser único (ADR-011)

**Agent:** backend-specialist
**Handoff from:** test-writer (após TG0 verde)

**Files:**
- Modify: `scripts/lib/devflow-config.mjs`
- Test: `tests/lib/test-verify-contract.mjs` (criar)

**Interfaces:**
- Consumes: `parseYaml` de `scripts/lib/frontmatter.mjs` (já existe; parseia `verify:` com arrays inline e de bloco).
- Produces: `readVerify(src) → { signals: {unit?:string[], integration?:string[], e2e?:string[], lint?:string[]}, onTaskComplete: string[] }` OU lança `Error` com mensagem de validação. `readVerifyFromPath(path)`. Vocabulário fechado: `unit|integration|e2e|lint`.

- [ ] **Step 1: Escrever os testes falhando**

Criar `tests/lib/test-verify-contract.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVerify } from '../../scripts/lib/devflow-config.mjs';

const CFG = (v) => `git:\n  strategy: branch-flow\n${v}`;

test('lê sinais como argv arrays e onTaskComplete', () => {
  const r = readVerify(CFG(
`verify:
  unit:        ["node", "--test", "tests/lib/x.mjs"]
  e2e:         ["bash", "tests/run-e2e.sh"]
  onTaskComplete: [unit]
`));
  assert.deepEqual(r.signals.unit, ["node", "--test", "tests/lib/x.mjs"]);
  assert.deepEqual(r.signals.e2e, ["bash", "tests/run-e2e.sh"]);
  assert.deepEqual(r.onTaskComplete, ["unit"]);
});

test('sem bloco verify → estrutura vazia (não lança)', () => {
  const r = readVerify(CFG(""));
  assert.deepEqual(r.signals, {});
  assert.deepEqual(r.onTaskComplete, []);
});

test('valor string em vez de array → lança (fail-closed)', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: node --test\n`)), /array/i);
});

test('argv[0] fora da allowlist → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["curl", "evil"]\n`)), /allowlist|permitido/i);
});

// R-C1: código inline deve ser rejeitado em QUALQUER posição do argv, não só argv[1].
// Vetores provados pela revisão de segurança (todos executavam JS/shell arbitrário do config):
test('bash -c → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["bash", "-c", "x"]\n`)), /inline/i);
});
test('bash -lc (bundle) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["bash", "-lc", "curl e|sh"]\n`)), /inline/i);
});
test('sh -ic / -xc (bundle) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["sh", "-ic", "x"]\n`)), /inline/i);
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["sh", "-xc", "x"]\n`)), /inline/i);
});
test('node -e → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "-e", "x"]\n`)), /inline/i);
});
test('node --eval / -p / --print / -pe → lança', () => {
  for (const f of ['--eval', '-p', '--print', '-pe']) {
    assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "${f}", "process.exit(0)"]\n`)), /inline/i, `esperava lançar em node ${f}`);
  }
});
test('node --eval=... (forma com igual) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "--eval=1"]\n`)), /inline/i);
});
test('python -c → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["python3", "-c", "x"]\n`)), /inline/i);
});
test('inline code NÃO na posição 1 (ex.: node --test x -e y) → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node", "--test", "t", "-e", "y"]\n`)), /inline/i);
});
// Legítimos que DEVEM passar (não confundir flag segura com código inline):
test('comandos legítimos passam', () => {
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  unit: ["node", "--test", "tests/x.mjs"]\n`)));
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  e2e: ["bash", "tests/run-e2e.sh"]\n`)));
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  unit: ["python3", "-m", "pytest", "tests/"]\n`)));
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  unit: ["make", "test"]\n`)));
  assert.doesNotThrow(() => readVerify(CFG(`verify:\n  unit: ["npm", "run", "test"]\n`)));
});

test('sinal fora do vocabulário fechado → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  smoke: ["bash", "x.sh"]\n`)), /vocabul|desconhecid|unknown/i);
});

test('onTaskComplete com sinal não-declarado → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: ["node","--test","x"]\n  onTaskComplete: [e2e]\n`)), /onTaskComplete|declarad/i);
});

test('array vazio como comando → lança', () => {
  assert.throws(() => readVerify(CFG(`verify:\n  unit: []\n`)), /vazio|empty/i);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-verify-contract.mjs`
Expected: FAIL — `readVerify` não existe (`SyntaxError: does not provide an export named 'readVerify'`).

- [ ] **Step 3: Implementar `readVerify`**

Adicionar a `scripts/lib/devflow-config.mjs` (importar `parseYaml` no topo):
```javascript
import { parseYaml } from "./frontmatter.mjs";

export const VERIFY_ALLOWLIST = new Set(["node","npm","pnpm","python","python3","pytest","make","bash","sh"]);
const VERIFY_SIGNALS = new Set(["unit","integration","e2e","lint"]);

// R-C1: rejeita execução de código inline varrendo TODOS os tokens do argv (não só argv[1]),
// sensível ao interpretador. Fecha os vetores provados pela revisão: node -e/--eval/-p/--print/-pe
// (e formas =...), bash/sh -c e bundles -lc/-ic/-xc, python -c. Exportada para reuso no config-guard.
export function assertNoInlineCode(name, argv) {
  const bin = argv[0];
  for (const tok of argv.slice(1)) {
    if ((bin === "bash" || bin === "sh") && /^-[a-z]*c/i.test(tok))
      throw new Error(`verify.${name}: '${tok}' executa comando inline (shell -c/-lc/-ic/-xc proibido)`);
    if (bin === "node" && /^(-e|--eval|-p|--print|-pe)(=.*)?$/.test(tok))
      throw new Error(`verify.${name}: '${tok}' avalia código inline (node -e/--eval/-p/--print/-pe proibido)`);
    if ((bin === "python" || bin === "python3") && /^-c$/.test(tok))
      throw new Error(`verify.${name}: '${tok}' avalia código inline (python -c proibido)`);
  }
}

// Lê e valida o bloco verify:. Vocabulário fechado unit|integration|e2e|lint.
// Comandos são argv arrays; argv[0] em allowlist; nenhum token é código inline.
// Sem bloco → { signals:{}, onTaskComplete:[] } (D9: ausência não lança).
// R-C6: distinguir "sem verify:" (ausência legítima) de "verify: presente mas parse falhou"
// (fail-closed ruidoso) — o downgrade silencioso para warn-only é o teatro que a feature mata.
export function readVerify(src) {
  const text = String(src);
  const hasVerifyText = /^verify:\s*$/m.test(text) || /^verify:\s/m.test(text);
  let data;
  try { data = parseYaml(text) || {}; }
  catch (e) {
    if (hasVerifyText) throw new Error(`verify: presente mas o .devflow.yaml não parseia (${e.message}) — fail-closed`);
    data = {};
  }
  const v = data.verify;
  if (v == null) {
    if (hasVerifyText) throw new Error("verify: presente no texto mas não parseou como mapa — fail-closed");
    return { signals: {}, onTaskComplete: [] };
  }
  if (typeof v !== "object" || Array.isArray(v)) throw new Error("verify: deve ser um mapa");

  const signals = {};
  for (const [key, val] of Object.entries(v)) {
    if (key === "onTaskComplete") continue;
    if (!VERIFY_SIGNALS.has(key)) throw new Error(`sinal desconhecido '${key}' (vocabulário: unit, integration, e2e, lint)`);
    if (!Array.isArray(val)) throw new Error(`verify.${key}: deve ser um array argv (string não é permitida)`);
    if (val.length === 0) throw new Error(`verify.${key}: comando vazio`);
    if (val.some(x => typeof x !== "string")) throw new Error(`verify.${key}: todos os itens do argv devem ser strings`);
    if (!VERIFY_ALLOWLIST.has(val[0])) throw new Error(`verify.${key}: argv[0] '${val[0]}' fora da allowlist`);
    assertNoInlineCode(key, val);
    signals[key] = val;
  }

  let onTaskComplete = v.onTaskComplete ?? [];
  if (!Array.isArray(onTaskComplete)) throw new Error("verify.onTaskComplete: deve ser um array");
  for (const s of onTaskComplete) {
    if (!(s in signals)) throw new Error(`verify.onTaskComplete: '${s}' não é um sinal declarado`);
  }
  return { signals, onTaskComplete };
}

export function readVerifyFromPath(path) {
  const text = readTextOrNull(path);   // helper já existente no arquivo
  return text == null ? { signals: {}, onTaskComplete: [] } : readVerify(text);
}
```
Adicionar o subcomando CLI ao `main()` existente:
```javascript
} else if (cmd === "read-verify") {
  const text = readTextOrNull(argv[1]);
  const r = text == null ? { signals: {}, onTaskComplete: [] } : readVerify(text);
  process.stdout.write(JSON.stringify(r) + "\n");
}
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/lib/test-verify-contract.mjs`
Expected: PASS (9/9).

- [ ] **Step 5: Regressão do parser (não quebrei o git:)**

Run: `node --test tests/lib/test-devflow-config*.mjs tests/validation/test-devflow-config*.mjs 2>/dev/null; node scripts/lib/devflow-config.mjs read-autofinish .context/.devflow.yaml`
Expected: testes existentes de config verdes; `read-autofinish` ainda devolve o valor correto (paridade intacta).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/devflow-config.mjs tests/lib/test-verify-contract.mjs
git commit -m "feat(config): readVerify — contrato verify: no parser único (ADR-011, delega a frontmatter)"
```

---

## Task Group 2 — Ledger: `verify-ledger.mjs`

**Agent:** backend-specialist

**Files:**
- Create: `scripts/lib/verify-ledger.mjs`
- Test: `tests/lib/test-verify-ledger.mjs`

**Interfaces:**
- Produces:
  - `appendEntry(root, entry) → void` — append de uma linha JSON em `.context/runtime/verify-ledger.jsonl` (cria dirs).
  - `readEntries(root) → object[]` — todas as entradas válidas; linha malformada é ignorada, não derruba o leitor.
  - `lastEntry(root, signal) → object | null` — última entrada de um sinal.
  - `consecutiveReds(root, signal) → number` — quantos REDs seguidos do sinal desde o último GREEN (para o critério de parada).

- [ ] **Step 1: Escrever os testes falhando**

Criar `tests/lib/test-verify-ledger.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendEntry, readEntries, lastEntry, consecutiveReds } from '../../scripts/lib/verify-ledger.mjs';

const mk = () => mkdtempSync(join(tmpdir(), 'ledger-'));

test('append preserva ordem e readEntries devolve todas', () => {
  const r = mk();
  appendEntry(r, { signal: 'unit', exit: 1, at: 'a' });
  appendEntry(r, { signal: 'unit', exit: 0, at: 'b' });
  const e = readEntries(r);
  assert.equal(e.length, 2);
  assert.equal(e[0].at, 'a'); assert.equal(e[1].at, 'b');
});

test('lastEntry devolve a última do sinal', () => {
  const r = mk();
  appendEntry(r, { signal: 'unit', exit: 1 });
  appendEntry(r, { signal: 'e2e', exit: 0 });
  appendEntry(r, { signal: 'unit', exit: 0 });
  assert.equal(lastEntry(r, 'unit').exit, 0);
  assert.equal(lastEntry(r, 'lint'), null);
});

test('linha malformada é ignorada, não derruba o leitor', () => {
  const r = mk();
  mkdirSync(join(r, '.context', 'runtime'), { recursive: true });
  writeFileSync(join(r, '.context', 'runtime', 'verify-ledger.jsonl'),
    '{"signal":"unit","exit":0}\n{ not json \n{"signal":"e2e","exit":1}\n');
  const e = readEntries(r);
  assert.equal(e.length, 2);
});

test('consecutiveReds conta REDs seguidos do mesmo sinal desde o último GREEN', () => {
  const r = mk();
  appendEntry(r, { signal: 'unit', exit: 0 });
  appendEntry(r, { signal: 'unit', exit: 1 });
  appendEntry(r, { signal: 'unit', exit: 1 });
  appendEntry(r, { signal: 'unit', exit: 1 });
  assert.equal(consecutiveReds(r, 'unit'), 3);
});

test('consecutiveReds zera após um GREEN', () => {
  const r = mk();
  appendEntry(r, { signal: 'unit', exit: 1 });
  appendEntry(r, { signal: 'unit', exit: 0 });
  assert.equal(consecutiveReds(r, 'unit'), 0);
});

test('readEntries em repo sem ledger → []', () => {
  assert.deepEqual(readEntries(mk()), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-verify-ledger.mjs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Criar `scripts/lib/verify-ledger.mjs`:
```javascript
// scripts/lib/verify-ledger.mjs — ledger JSONL append-only do pipeline de sinal.
// Vive em .context/runtime/ (gitignored). Tolerante a linha malformada (D8).
import { appendFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const REL = ".context/runtime/verify-ledger.jsonl";

function ledgerPath(root) { return join(root, REL); }

export function appendEntry(root, entry) {
  const p = ledgerPath(root);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(entry) + "\n", "utf8");
}

export function readEntries(root) {
  const p = ledgerPath(root);
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try { out.push(JSON.parse(line)); } catch { /* linha malformada: ignora */ }
  }
  return out;
}

export function lastEntry(root, signal) {
  const e = readEntries(root).filter(x => x.signal === signal);
  return e.length ? e[e.length - 1] : null;
}

export function consecutiveReds(root, signal) {
  const e = readEntries(root).filter(x => x.signal === signal);
  let n = 0;
  for (let i = e.length - 1; i >= 0; i--) {
    if (e[i].exit === 0) break;
    n++;
  }
  return n;
}
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/lib/test-verify-ledger.mjs`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/verify-ledger.mjs tests/lib/test-verify-ledger.mjs
git commit -m "feat(verify): ledger JSONL append-only com leitura de cauda e detecção de REDs consecutivos"
```

---

## Task Group 3 — Executor: `verify-tree-digest.mjs` + `verify-run.mjs`

**Agent:** backend-specialist

**Files:**
- Create: `scripts/lib/verify-tree-digest.mjs`, `scripts/lib/verify-run.mjs`
- Test: `tests/lib/test-verify-tree-digest.mjs`, `tests/e2e/verify-run.e2e.test.mjs`

**Interfaces:**
- Consumes: `readVerifyFromPath` (TG1), `appendEntry` (TG2).
- Produces:
  - `treeDigest(root) → string` — `sha256(HEAD + '\n' + status)`, onde `status` = `git status --porcelain` **excluindo** `.context/workflow/` e `.context/runtime/` (estado efêmero que muta durante o próprio workflow — evita o livelock "prova vencida por avançar de fase").
  - `runSignal(name, { root, phase }) → { signal, exit, durationMs, treeDigest, at, phase }` — valida via `readVerify`, `execFile(argv[0], argv.slice(1), {cwd:root})`, faz append no ledger, devolve o resultado. Sinal não declarado → throw. **Nunca decide** se o gate passa.

- [ ] **Step 1: Testes do treeDigest (unit)**

Criar `tests/lib/test-verify-tree-digest.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { treeDigest } from '../../scripts/lib/verify-tree-digest.mjs';

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'digest-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  writeFileSync(join(d, 'a.txt'), 'x'); g('add', '-A'); g('commit', '-q', '-m', 'i');
  return { d, g };
}

test('digest é estável quando a árvore não muda', () => {
  const { d } = repo();
  assert.equal(treeDigest(d), treeDigest(d));
});

test('editar código muda o digest', () => {
  const { d } = repo();
  const before = treeDigest(d);
  writeFileSync(join(d, 'a.txt'), 'y');
  assert.notEqual(treeDigest(d), before);
});

test('mexer só em .context/workflow NÃO muda o digest (anti-livelock)', () => {
  const { d, g } = repo();
  mkdirSync(join(d, '.context', 'workflow'), { recursive: true });
  writeFileSync(join(d, '.context', 'workflow', 'plans.json'), '{}');
  g('add', '-A'); g('commit', '-q', '-m', 'workflow state');
  const before = treeDigest(d);
  writeFileSync(join(d, '.context', 'workflow', 'plans.json'), '{"changed":true}');
  assert.equal(treeDigest(d), before);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-verify-tree-digest.mjs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o treeDigest**

Criar `scripts/lib/verify-tree-digest.mjs`:
```javascript
// scripts/lib/verify-tree-digest.mjs — impressão digital da árvore de trabalho.
// HEAD + status porcelain, EXCLUINDO estado efêmero de workflow/runtime, que muta
// durante o próprio avanço de fase (senão o gate cai em livelock de "prova vencida").
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export function treeDigest(root) {
  let head = "";
  try { head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { head = "no-head"; }
  let status = "";
  try {
    status = execFileSync("git", ["-C", root, "status", "--porcelain",
      "--", ".", ":(exclude).context/workflow", ":(exclude).context/runtime"],
      { encoding: "utf8" });
  } catch { status = ""; }
  return createHash("sha256").update(head + "\n" + status).digest("hex");
}
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/lib/test-verify-tree-digest.mjs`
Expected: PASS (3/3).

- [ ] **Step 5: Teste E2E do executor (roda sinal real em repo tmpdir)**

Criar `tests/e2e/verify-run.e2e.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSignal } from '../../scripts/lib/verify-run.mjs';
import { lastEntry } from '../../scripts/lib/verify-ledger.mjs';

function repo(verifyBlock) {
  const d = mkdtempSync(join(tmpdir(), 'run-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  mkdirSync(join(d, '.context'), { recursive: true });
  writeFileSync(join(d, '.context', '.devflow.yaml'), `git:\n  strategy: branch-flow\n${verifyBlock}`);
  writeFileSync(join(d, 'a.txt'), 'x'); g('add', '-A'); g('commit', '-q', '-m', 'i');
  return d;
}

test('sinal verde: exit 0, ledger ganha entrada com digest atual', () => {
  const d = repo(`verify:\n  unit: ["bash", "ok.sh"]\n`);
  writeFileSync(join(d, 'ok.sh'), 'exit 0\n');
  const r = runSignal('unit', { root: d, phase: 'E' });
  assert.equal(r.exit, 0);
  assert.equal(r.signal, 'unit');
  assert.equal(typeof r.treeDigest, 'string');
  assert.equal(lastEntry(d, 'unit').exit, 0);
});

test('sinal vermelho: exit propagado para o ledger', () => {
  const d = repo(`verify:\n  unit: ["bash", "fail.sh"]\n`);
  writeFileSync(join(d, 'fail.sh'), 'exit 3\n');
  const r = runSignal('unit', { root: d, phase: 'E' });
  assert.equal(r.exit, 3);
  assert.equal(lastEntry(d, 'unit').exit, 3);
});

test('sinal não declarado → throw', () => {
  const d = repo(`verify:\n  unit: ["bash", "ok.sh"]\n`);
  assert.throws(() => runSignal('e2e', { root: d }), /não declarado|not declared/i);
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `node --test tests/e2e/verify-run.e2e.test.mjs`
Expected: FAIL — `verify-run.mjs` não existe.

- [ ] **Step 7: Implementar o executor**

Criar `scripts/lib/verify-run.mjs`:
```javascript
// scripts/lib/verify-run.mjs — executor de um sinal. Nunca decide o gate (D8).
// Valida o contrato (via parser único), roda via execFile (sem sh -c),
// faz append do resultado no ledger com o treeDigest da árvore ANTES da execução.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readVerifyFromPath } from "./devflow-config.mjs";
import { appendEntry } from "./verify-ledger.mjs";
import { treeDigest } from "./verify-tree-digest.mjs";

const CONFIG_REL = ".context/.devflow.yaml";

// runSignal não usa Date.now diretamente para o `at`? Precisa de timestamp real —
// aqui é código de produção (não workflow script), então new Date() é permitido.
export function runSignal(name, { root, phase = "" } = {}) {
  const { signals } = readVerifyFromPath(join(root, CONFIG_REL));
  const argv = signals[name];
  if (!argv) throw new Error(`sinal '${name}' não declarado em verify:`);
  const digest = treeDigest(root);
  const t0 = process.hrtime.bigint();
  let exit = 0;
  try {
    execFileSync(argv[0], argv.slice(1), { cwd: root, stdio: "inherit" });
  } catch (e) {
    exit = typeof e.status === "number" ? e.status : 1;
  }
  const durationMs = Number((process.hrtime.bigint() - t0) / 1000000n);
  const entry = { signal: name, exit, durationMs, treeDigest: digest, at: new Date().toISOString(), phase };
  appendEntry(root, entry);
  return entry;
}

function main(argv) {
  const name = argv[0];
  const root = argv[1] || process.cwd();
  const phase = argv[2] || "";
  if (!name) { console.error("uso: verify-run <signal> [root] [phase]"); process.exit(2); }
  const r = runSignal(name, { root, phase });
  process.stderr.write(`[verify] ${name}: exit ${r.exit} (${r.durationMs}ms)\n`);
  process.exit(r.exit);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
```

- [ ] **Step 8: Ver passar**

Run: `node --test tests/e2e/verify-run.e2e.test.mjs tests/lib/test-verify-tree-digest.mjs`
Expected: PASS (6/6).

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/verify-run.mjs scripts/lib/verify-tree-digest.mjs tests/lib/test-verify-tree-digest.mjs tests/e2e/verify-run.e2e.test.mjs
git commit -m "feat(verify): executor runSignal (execFile + treeDigest anti-livelock) grava ledger"
```

---

## Task Group 4 — Runners: `run-unit.sh`, `run-integration.sh`, `run-e2e.sh`, `run-lint.sh`

**Agent:** devops-specialist

**Files:**
- Create: `tests/run-unit.sh`, `tests/run-integration.sh`, `tests/run-e2e.sh`, `tests/run-lint.sh`
- Test: `tests/scripts/test-verify-runners.sh`

**Interfaces:**
- Produces: cada runner enumera via `git ls-files` + convenção, roda `node --test`/bash, e propaga exit≠0 se algum membro falhar. `run-e2e.sh` respeita `tests/.ci-skip.txt`. `run-lint.sh` roda os guards (TG5, TG6).

- [ ] **Step 1: Escrever o teste do runner (E2E de shell)**

Criar `tests/scripts/test-verify-runners.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  PASS: $1"; PASS=$((PASS+1)); else echo "  FAIL: $1 (esperado $3, obtido $2)"; FAIL=$((FAIL+1)); fi; }

# run-unit sai 0 na suíte verde
bash "${REPO_ROOT}/tests/run-unit.sh" >/dev/null 2>&1; check "run-unit exit 0" "$?" "0"
# run-unit propaga falha quando um membro falha: sandbox com um teste vermelho plantado
SB=$(mktemp -d); trap 'rm -rf "$SB"' EXIT
git -C "$REPO_ROOT" archive HEAD | (mkdir -p "$SB" && tar -x -C "$SB")
mkdir -p "$SB/tests/lib"
printf "import{test}from'node:test';import a from'node:assert';test('x',()=>a.equal(1,2));\n" > "$SB/tests/lib/test-zzz-planted.mjs"
( cd "$SB" && git init -q -b main && git add -A && git -c user.email=t@t -c user.name=t commit -qm i )
( cd "$SB" && bash tests/run-unit.sh >/dev/null 2>&1 ); check "run-unit propaga vermelho" "$?" "1"

echo "run-verify-runners: $PASS pass, $FAIL fail"
[ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bash tests/scripts/test-verify-runners.sh`
Expected: FAIL — runners não existem.

- [ ] **Step 3: Implementar os runners**

`tests/run-unit.sh`:
```bash
#!/usr/bin/env bash
# Enumera testes unit (git ls-files + convenção), exclui integration/e2e. Reprodutível.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mapfile -t FILES < <(git ls-files -- '*.mjs' \
  | grep -E '(^|/)(test-[^/]*|[^/]*\.test)\.mjs$' \
  | grep -vE '^tests/(integration|e2e)/')
[ "${#FILES[@]}" -eq 0 ] && { echo "run-unit: nenhum arquivo"; exit 0; }
exec node --test "${FILES[@]}"
```
`tests/run-integration.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mapfile -t FILES < <(git ls-files -- 'tests/integration/*.mjs' \
  | grep -E '(^|/)(test-[^/]*|[^/]*\.test)\.mjs$')
[ "${#FILES[@]}" -eq 0 ] && { echo "run-integration: nenhum arquivo"; exit 0; }
exec node --test "${FILES[@]}"
```
`tests/run-e2e.sh` (mjs de e2e + os `.sh`, respeitando a allowlist de skip):
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SKIP_FILE="tests/.ci-skip.txt"
is_skipped() { [ -f "$SKIP_FILE" ] && grep -qxF "$1" "$SKIP_FILE"; }

rc=0
# 1) e2e .mjs
mapfile -t MJS < <(git ls-files -- 'tests/e2e/*.mjs' | grep -E '(^|/)(test-[^/]*|[^/]*\.test)\.mjs$')
if [ "${#MJS[@]}" -gt 0 ]; then node --test "${MJS[@]}" || rc=1; fi
# 2) todos os test-*.sh (exceto o próprio runner e os skipados)
while IFS= read -r sh; do
  case "$sh" in tests/run-*.sh) continue;; esac
  if is_skipped "$sh"; then echo "SKIP (ci-skip): $sh"; continue; fi
  echo "→ $sh"; bash "$sh" || rc=1
done < <(git ls-files -- 'tests/test-*.sh' 'tests/**/test-*.sh' | grep -vE '^tests/fixtures/' | sort -u)
exit "$rc"
```
> R-C9: os dois pathspecs (`tests/test-*.sh` **e** `tests/**/test-*.sh`) cobrem tanto os `.sh` na raiz de `tests/` quanto os aninhados — o `**/` sozinho exige uma barra e pularia `tests/test-foo.sh` silenciosamente.
`tests/run-lint.sh` (sinal composto, D6):
```bash
#!/usr/bin/env bash
# Sinal 'lint' composto: guard anti-enfraquecimento de testes + guard do contrato + validade do verify:.
# Gate determinístico não é opcional por task (D6). R-C3: BASE_REF repassado aos guards
# (default origin/main local; o CI seta BASE_REF=origin/<base_ref> e CI=true → fail-closed no merge-base-miss).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BASE_REF="${BASE_REF:-origin/main}"
rc=0
# 1) enfraquecimento de testes vs merge-base
node scripts/lib/test-weakening-guard.mjs --root . --base-ref="$BASE_REF" || rc=1
# 2) R-C2: guard do contrato verify: vs merge-base (fecha o eixo que o config-guard branch-gated não cobre)
node scripts/lib/verify-contract-guard-cli.mjs --root=. --base-ref="$BASE_REF" || rc=1
# 3) validade estrutural do verify: atual (fail-closed se presente e inválido — R-C6)
node scripts/lib/devflow-config.mjs read-verify .context/.devflow.yaml >/dev/null || { echo "verify: inválido/inseguro"; rc=1; }
exit "$rc"
```
`chmod +x tests/run-*.sh`.

- [ ] **Step 4: Ver passar**

Run: `bash tests/scripts/test-verify-runners.sh`
Expected: PASS. (`run-lint.sh` depende de TG5 **e** TG6 — só é exercitado após ambos; o teste do runner aqui só exercita `run-unit`. Ordem de execução: TG4 cria os runners, TG5/TG6 criam os guards, e o `run-lint` completo é validado no TG10 Step 11.)

- [ ] **Step 5: Commit**

```bash
git add tests/run-unit.sh tests/run-integration.sh tests/run-e2e.sh tests/run-lint.sh tests/scripts/test-verify-runners.sh
git commit -m "feat(verify): runners reprodutíveis (git ls-files + convenção) por sinal"
```

---

## Task Group 5 — Guard anti-enfraquecimento de testes

**Agent:** security-auditor
**Handoff from:** devops-specialist

**Files:**
- Create: `scripts/lib/test-weakening-guard.mjs`
- Test: `tests/lib/test-weakening-guard.test.mjs`

**Interfaces:**
- Produces: `evaluateWeakening({ root, baseRef }) → { blocked: bool, violations: string[] }`. Compara cada arquivo de teste presente na baseline (`git merge-base HEAD <baseRef>`): sumiu → BLOCK; ganhou `.skip`/`todo:true`/`xit`/`describe.skip` → BLOCK; nº de asserts caiu → BLOCK. Teste **novo** → livre. Override: trailer de commit `Weakens-Tests:` no range → libera. CLI `--root` / `--base-ref` (default `origin/main`).

- [ ] **Step 1: Escrever os testes falhando**

Criar `tests/lib/test-weakening-guard.test.mjs` — cada caso monta um repo tmpdir com base e HEAD:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateWeakening } from '../../scripts/lib/test-weakening-guard.mjs';

function repoWith(baseFiles, headFiles, { trailer } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'weak-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  for (const [p, c] of Object.entries(baseFiles)) writeFileSync(join(d, p), c);
  g('add', '-A'); g('commit', '-q', '-m', 'base');
  for (const p of Object.keys(baseFiles)) if (!(p in headFiles)) rmSync(join(d, p));
  for (const [p, c] of Object.entries(headFiles)) writeFileSync(join(d, p), c);
  g('add', '-A'); g('commit', '-q', '-m', trailer ? `head\n\nWeakens-Tests: ${trailer}` : 'head');
  return d;
}
const TWO = "import{test}from'node:test';import a from'node:assert';\ntest('x',()=>{a.equal(1,1);a.equal(2,2);});\n";
const ONE = "import{test}from'node:test';import a from'node:assert';\ntest('x',()=>{a.equal(1,1);});\n";
const SKIP = "import{test}from'node:test';import a from'node:assert';\ntest.skip('x',()=>{a.equal(1,1);a.equal(2,2);});\n";

test('teste deletado → BLOCK', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, {});
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, true);
});
test('.skip adicionado → BLOCK', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': SKIP });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, true);
});
test('assert removido (2→1) → BLOCK', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': ONE });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, true);
});
test('teste novo → livre (PASS)', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': TWO, 'test-b.mjs': ONE });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, false);
});
test('assert adicionado → livre', () => {
  const d = repoWith({ 'test-a.mjs': ONE }, { 'test-a.mjs': TWO });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, false);
});
test('trailer Weakens-Tests: libera o enfraquecimento', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': ONE }, { trailer: 'refactor funde asserts' });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'main' }).blocked, false);
});
// R-C3: merge-base ausente é fail-OPEN local mas fail-CLOSED em CI (defesa não pode desligar em silêncio no árbitro).
test('merge-base ausente: local → skip (não bloqueia)', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': TWO });
  assert.equal(evaluateWeakening({ root: d, baseRef: 'inexistente-xyz' }).blocked, false);
});
test('merge-base ausente: CI → BLOCK (fail-closed)', () => {
  const d = repoWith({ 'test-a.mjs': TWO }, { 'test-a.mjs': TWO });
  const r = evaluateWeakening({ root: d, baseRef: 'inexistente-xyz', ci: true });
  assert.equal(r.blocked, true);
  assert.match(r.violations[0], /merge-base|fail-closed/i);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-weakening-guard.test.mjs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o guard**

Criar `scripts/lib/test-weakening-guard.mjs`:
```javascript
// scripts/lib/test-weakening-guard.mjs — impede enfraquecimento de testes vs merge-base.
// Adicionar teste é livre; enfraquecer nunca é silencioso (D7). Override: trailer Weakens-Tests:.
import { execFileSync } from "node:child_process";

const TEST_RE = /(^|\/)(test-[^/]*|[^/]*\.test)\.mjs$/;
// contagem aproximada de "força" do teste: asserts + casos.
const SIGNAL_RE = /\bassert\s*[.(]|\b(?:test|it)\s*\(/g;
const SKIP_RE = /\b(?:test|it|describe)\.skip\s*\(|\bxit\s*\(|\bxtest\s*\(|\btodo:\s*true\b/;

function sh(root, args) {
  try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }); }
  catch { return ""; }
}
function countSignals(text) { const m = text.match(SIGNAL_RE); return m ? m.length : 0; }

export function evaluateWeakening({ root, baseRef = "origin/main", ci = false }) {
  const base = sh(root, ["merge-base", "HEAD", baseRef]).trim();
  if (!base) {
    // R-C3: fail-OPEN local (dev sem a base buscada) mas fail-CLOSED em CI —
    // um controle anti-reward-hacking que se desliga em silêncio no árbitro é pior que inútil.
    if (ci) return { blocked: true, violations: [`merge-base com '${baseRef}' não resolve — o guard não pode verificar (fail-closed em CI). Garanta fetch-depth:0 e a base correta.`] };
    return { blocked: false, violations: [], note: `sem merge-base com '${baseRef}' (base rasa? local?) — skip` };
  }

  // Override global: trailer Weakens-Tests: em qualquer commit do range.
  const log = sh(root, ["log", `${base}..HEAD`, "--format=%B"]);
  if (/^Weakens-Tests:\s*\S/m.test(log)) return { blocked: false, violations: [], note: "override por trailer" };

  const baseFiles = sh(root, ["ls-tree", "-r", "--name-only", base]).split("\n").filter(f => TEST_RE.test(f));
  const violations = [];
  for (const f of baseFiles) {
    const before = sh(root, ["show", `${base}:${f}`]);
    let after = "";
    try { after = execFileSync("git", ["-C", root, "show", `HEAD:${f}`], { encoding: "utf8", stdio: ["ignore","pipe","ignore"] }); }
    catch { violations.push(`${f}: arquivo de teste removido`); continue; }
    if (SKIP_RE.test(after) && !SKIP_RE.test(before)) violations.push(`${f}: teste marcado como skip/todo`);
    const cb = countSignals(before), ca = countSignals(after);
    if (ca < cb) violations.push(`${f}: força de teste caiu (${cb}→${ca} asserts/casos)`);
  }
  return { blocked: violations.length > 0, violations };
}

function main(argv) {
  const root = (argv.find(a => a.startsWith("--root="))?.split("=")[1]) || ".";
  const baseRef = (argv.find(a => a.startsWith("--base-ref="))?.split("=")[1]) || "origin/main";
  const ci = argv.includes("--ci") || process.env.CI === "true";
  const r = evaluateWeakening({ root, baseRef, ci });
  if (r.blocked) {
    console.error("✗ enfraquecimento de testes detectado:");
    for (const v of r.violations) console.error("  " + v);
    console.error("  (override: adicione um trailer 'Weakens-Tests: <justificativa>' ao commit)");
    process.exit(1);
  }
  console.log(`✓ sem enfraquecimento de testes${r.note ? " ("+r.note+")" : ""}`);
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/lib/test-weakening-guard.test.mjs`
Expected: PASS (6/6).

- [ ] **Step 5: Verificar mutação (o guard realmente bloqueia)**

Run: `node scripts/lib/test-weakening-guard.mjs --root . --base-ref origin/main; echo "exit=$?"`
Expected: exit 0 (esta branch só adiciona testes até aqui). Confirma que o guard não gera falso positivo sobre o próprio trabalho.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/test-weakening-guard.mjs tests/lib/test-weakening-guard.test.mjs
git commit -m "feat(verify): guard anti-enfraquecimento de testes (skip/deleção/queda de asserts) com override por trailer"
```

---

## Task Group 6 — Guard do contrato: `verify.*` não pode ser neutralizado

**Agent:** security-auditor

**Files:**
- Modify: `scripts/lib/devflow-config-guard.mjs`
- Create: `scripts/lib/verify-contract-guard-cli.mjs` (guard do contrato no CI, contra merge-base)
- Test: `tests/lib/test-config-guard-verify.mjs`, `tests/e2e/verify-contract-guard.e2e.test.mjs`

**Por quê (honesto — R-C7):** parte do gate é neutralizável por dentro. O que este guard **fecha**: (1) remoção de um sinal declarado; (2) troca por código inline — `readVerify` (TG1) agora **lança** em `-c`/`-e`/`--eval`/`-p`/`-lc`/… em qualquer posição, então o proposto inválido é barrado. O que **não** fecha e permanece residual-humano (spec §8 concede): repointar um sinal para um alvo trivial que ainda é estruturalmente válido (`["node","--test","tests/vazio/"]`, `["bash","runner-esvaziado.sh"]`) — o guard olha o argv, não o que ele faz. Por isso duas defesas: (a) o guard mecânico abaixo, rodado **no CI contra o merge-base** (não só no hook branch-gated, que nem dispara em `feature/*`); (b) um item de checklist da fase R que exige inspeção humana do diff de qualquer mudança em `verify.*`.

**Correção de integração (R-C2/R-C3c):** o `devflow-config-guard-cli.mjs` existente só protege quando a branch atual é protegida — o ataque acontece na feature branch, onde ele **libera**. Por isso o novo `verify-contract-guard-cli.mjs` compara o `.devflow.yaml` do **merge-base vs HEAD** e roda no sinal `lint` (CI), sem depender de branch protection.

**Interfaces:**
- Consumes: `readVerify` (TG1), `detectWeakenings` estendido.
- Produces: `detectWeakenings(current, proposed)` passa a incluir enfraquecimentos de `verify`: sinal removido; proposto inválido (inclui inline, via `readVerify` que lança). Mudança de comando que permanece válida NÃO vira block (evita bloquear edições legítimas) — é o resíduo humano acima. `verify-contract-guard-cli.mjs --root --base-ref` → exit≠0 se houver enfraquecimento vs merge-base.

- [ ] **Step 1: Escrever os testes falhando**

Criar `tests/lib/test-config-guard-verify.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectWeakenings } from '../../scripts/lib/devflow-config-guard.mjs';

const withVerify = (body) => `git:\n  strategy: branch-flow\n  protectedBranches: [main]\nverify:\n${body}`;

test('remover um sinal declarado → enfraquecimento', () => {
  const cur = withVerify(`  unit: ["node","--test","x"]\n  e2e: ["bash","run-e2e.sh"]\n`);
  const prop = withVerify(`  unit: ["node","--test","x"]\n`);
  const w = detectWeakenings(cur, prop);
  assert.ok(w.some(x => /verify.*e2e|sinal.*remov/i.test(x)));
});

test('trocar comando por no-op (-c) → enfraquecimento', () => {
  const cur = withVerify(`  unit: ["node","--test","x"]\n`);
  const prop = withVerify(`  unit: ["bash","-c","true"]\n`);
  const w = detectWeakenings(cur, prop);
  assert.ok(w.some(x => /verify.*unit|inline|no-op/i.test(x)));
});

test('manter os sinais → sem enfraquecimento de verify', () => {
  const cfg = withVerify(`  unit: ["node","--test","x"]\n`);
  assert.equal(detectWeakenings(cfg, cfg).filter(x => /verify/i.test(x)).length, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-config-guard-verify.mjs`
Expected: FAIL — `detectWeakenings` ainda não olha `verify`.

- [ ] **Step 3: Estender o guard**

Em `scripts/lib/devflow-config-guard.mjs`, importar `readVerify` e adicionar dentro de `detectWeakenings`, antes do `return weakenings`:
```javascript
import { readVerify } from "./devflow-config.mjs";

// ... dentro de detectWeakenings(currentText, proposedText):
// A troca por código inline é barrada porque readVerify(proposedText) LANÇA (TG1, R-C1)
// em -c/-e/--eval/-p/--print/-pe/-lc/... em qualquer posição do argv.
let curV = { signals: {} }, propV = { signals: {} };
try { curV = readVerify(currentText); } catch { /* atual inválido: nada a comparar */ }
try { propV = readVerify(proposedText); }
catch (e) { weakenings.push(`verify: proposto é inválido/inseguro (${e.message})`); }

for (const sig of Object.keys(curV.signals)) {
  if (!(sig in propV.signals)) weakenings.push(`verify.${sig} removido (o sinal deixaria de existir)`);
}
// Nota: mudança de comando que permanece estruturalmente válida NÃO vira weakening
// (bloquearia edições legítimas). É o resíduo humano — item de checklist da fase R.
```

- [ ] **Step 4: Ver passar (+ regressão do guard de git.*)**

Run: `node --test tests/lib/test-config-guard-verify.mjs && node --test $(git ls-files 'tests/**/*devflow-config-guard*.mjs' 'tests/**/*config-guard*.mjs' 2>/dev/null)`
Expected: PASS nos novos e nos existentes (git.* intacto).

- [ ] **Step 5: Criar o guard do contrato para o CI (contra o merge-base)**

Criar `scripts/lib/verify-contract-guard-cli.mjs` — o que roda no sinal `lint` (não branch-gated):
```javascript
#!/usr/bin/env node
// verify-contract-guard-cli.mjs — R-C2: guard do contrato NO CI, contra o merge-base.
// O config-guard existente só dispara em branch protegida; o ataque a verify.* acontece
// na feature branch. Este compara o .devflow.yaml do merge-base vs HEAD e bloqueia
// enfraquecimento (remoção de sinal, proposto inválido/inline).
import { execFileSync } from "node:child_process";
import { detectWeakenings } from "./devflow-config-guard.mjs";

const CONFIG_REL = ".context/.devflow.yaml";
const arg = (k, d) => (process.argv.find(a => a.startsWith(`${k}=`))?.split("=")[1]) ?? d;
const root = arg("--root", ".");
const baseRef = arg("--base-ref", "origin/main");
const ci = process.argv.includes("--ci") || process.env.CI === "true";
const git = (args) => { try { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore","pipe","ignore"] }); } catch { return null; } };

const base = (git(["merge-base", "HEAD", baseRef]) || "").trim();
if (!base) {
  if (ci) { console.error(`✗ verify-contract-guard: merge-base com '${baseRef}' não resolve (fail-closed em CI)`); process.exit(1); }
  console.log(`✓ verify-contract-guard: sem merge-base local — skip`); process.exit(0);
}
const current = git(["show", `${base}:${CONFIG_REL}`]);
const proposed = git(["show", `HEAD:${CONFIG_REL}`]);
if (current == null || proposed == null) { console.log("✓ verify-contract-guard: sem .devflow.yaml na base/HEAD — nada a comparar"); process.exit(0); }

const weakenings = detectWeakenings(current, proposed).filter(w => /verify/i.test(w));
if (weakenings.length) {
  console.error("✗ verify-contract-guard: contrato verify: enfraquecido vs merge-base:");
  for (const w of weakenings) console.error("  " + w);
  process.exit(1);
}
console.log("✓ verify-contract-guard: contrato verify: íntegro vs merge-base");
process.exit(0);
```

- [ ] **Step 6: Teste E2E do guard do contrato no CI**

Criar `tests/e2e/verify-contract-guard.e2e.test.mjs` — monta repo base com `verify:` e um HEAD que remove um sinal; roda o CLI com `--ci` e exige exit 1:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(process.cwd(), 'scripts/lib/verify-contract-guard-cli.mjs');
function repo(baseVerify, headVerify) {
  const d = mkdtempSync(join(tmpdir(), 'cguard-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  g('config','user.email','t@t'); g('config','user.name','t');
  mkdirSync(join(d, '.context'), { recursive: true });
  const cfg = (v) => `git:\n  strategy: branch-flow\n  protectedBranches: [main]\nverify:\n${v}`;
  writeFileSync(join(d, '.context/.devflow.yaml'), cfg(baseVerify));
  g('add','-A'); g('commit','-q','-m','base');
  g('checkout','-q','-b','feature/x');
  writeFileSync(join(d, '.context/.devflow.yaml'), cfg(headVerify));
  g('add','-A'); g('commit','-q','-m','head');
  return d;
}
function run(root) {
  try { execFileSync('node', [CLI, `--root=${root}`, '--base-ref=main', '--ci'], { encoding: 'utf8' }); return 0; }
  catch (e) { return e.status ?? 1; }
}
test('remover sinal na feature branch → guard do CI bloqueia (exit 1)', () => {
  const d = repo(`  unit: ["node","--test","x"]\n  e2e: ["bash","e.sh"]\n`, `  unit: ["node","--test","x"]\n`);
  assert.equal(run(d), 1);
});
test('trocar por inline na feature branch → guard do CI bloqueia', () => {
  const d = repo(`  unit: ["node","--test","x"]\n`, `  unit: ["node","--eval","0"]\n`);
  assert.equal(run(d), 1);
});
test('contrato íntegro → guard passa (exit 0)', () => {
  const d = repo(`  unit: ["node","--test","x"]\n`, `  unit: ["node","--test","x"]\n`);
  assert.equal(run(d), 0);
});
```

- [ ] **Step 7: Ver passar**

Run: `node --test tests/lib/test-config-guard-verify.mjs tests/e2e/verify-contract-guard.e2e.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/devflow-config-guard.mjs scripts/lib/verify-contract-guard-cli.mjs tests/lib/test-config-guard-verify.mjs tests/e2e/verify-contract-guard.e2e.test.mjs
git commit -m "feat(guard): contrato verify: guardado no CI vs merge-base (remoção/inline) — fecha o eixo que o config-guard branch-gated não cobre"
```

---

## Task Group 7 — CI árbitro: `.github/workflows/test.yml`

**Agent:** devops-specialist
**Handoff from:** security-auditor

**Files:**
- Create: `.github/workflows/test.yml`
- Test: `tests/scripts/test-ci-workflow.sh`

**Interfaces:**
- Consumes: os 4 runners (TG4), o guard (TG5), o guard do contrato (TG6). `fetch-depth: 0` para o merge-base dos guards.

> **R-C4 — NÃO indexar em known-hashes.** `test.yml` é a CI **própria** do repo devflow (depende de `scripts/lib/verify-run.mjs`), **não** um scaffold ADR-012 (que governa artefatos copiados verbatim para o repo do *usuário*, sem dependência do plugin). Além disso `gen-known-hashes.mjs` não percorre `.github/` e o `known-hashes.json` é lista de hashes **sem nomes** — o critério `grep test.yml` seria insatisfazível. Proveniência de CI removida deste TG.

- [ ] **Step 1: Teste estrutural do workflow (lint YAML + invariantes)**

Criar `tests/scripts/test-ci-workflow.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WF="${REPO_ROOT}/.github/workflows/test.yml"
PASS=0; FAIL=0
has() { if grep -qF "$2" "$WF"; then echo "  PASS: $1"; PASS=$((PASS+1)); else echo "  FAIL: $1"; FAIL=$((FAIL+1)); fi; }

[ -f "$WF" ] || { echo "FAIL: test.yml ausente"; exit 1; }
python3 -c "import yaml,sys; yaml.safe_load(open('$WF'))" && echo "  PASS: YAML válido" && PASS=$((PASS+1)) || { echo "  FAIL: YAML inválido"; FAIL=$((FAIL+1)); }
has "roda em pull_request" "pull_request"
has "fetch-depth 0 (merge-base do guard)" "fetch-depth: 0"
has "sinal unit" "run-unit.sh"
has "sinal integration" "run-integration.sh"
has "sinal e2e" "run-e2e.sh"
has "sinal lint" "run-lint.sh"
echo "test-ci-workflow: $PASS pass, $FAIL fail"; [ "$FAIL" -eq 0 ]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bash tests/scripts/test-ci-workflow.sh`
Expected: FAIL — `test.yml` ausente.

- [ ] **Step 3: Criar o workflow**

Criar `.github/workflows/test.yml`:
```yaml
name: Testes (sinal verificável)

# Árbitro independente: re-roda os MESMOS sinais, pelo MESMO executor, lendo o
# MESMO .devflow.yaml. Check obrigatório de PR. Nasce verde (Task Group 0 zerou a suíte).

on:
  pull_request:
  push:
    branches: [main, develop]

permissions:
  contents: read

jobs:
  signal:
    name: "sinal: ${{ matrix.signal }}"
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        signal: [unit, integration, e2e, lint]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # merge-base para o guard anti-enfraquecimento (lint)

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: git fetch base (merge-base dos guards — R-C3: SEM --depth para o merge-base resolver)
        run: git fetch origin "${{ github.base_ref || github.ref_name }}" || true

      - name: Rodar sinal ${{ matrix.signal }}
        env:
          BASE_REF: "origin/${{ github.base_ref || github.ref_name }}"
        run: node scripts/lib/verify-run.mjs "${{ matrix.signal }}" "$PWD" CI
```
> Nota: `verify-run.mjs` lê o `verify:` do `.devflow.yaml` e executa o argv declarado (que aponta para o runner). O exit do sinal é o exit do job — sinal vermelho barra o PR. `BASE_REF` é lido pelo `run-lint.sh` e repassado aos guards (R-C3). `CI=true` (setado pelo GitHub Actions) ativa o fail-closed dos guards no merge-base-miss.

- [ ] **Step 4: Ver passar**

Run: `bash tests/scripts/test-ci-workflow.sh`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/test.yml tests/scripts/test-ci-workflow.sh
git commit -m "ci(verify): workflow test.yml — matriz sobre os 4 sinais pelo executor"
```

- [ ] **Step 6: Tornar `test.yml` um required check (R-C5 — BLOCK se omitido)**

Sem branch protection exigindo os 4 jobs, o árbitro independente — de que todo o corte do loop-no-hook depende — **não vincula**: um PR pode mergear com o check vermelho/ausente (o destino do `tests-passing`). Isso é config do GitHub (fora do arquivo de workflow), então é um passo **manual documentado** + verificação na fase C.

Registrar no plano e executar via `gh` (requer permissão de admin do repo):
```bash
# Exigir os 4 contextos de status na branch main (e develop) protegida.
gh api -X PATCH repos/NEXUZ-SYS/devflow/branches/main/protection/required_status_checks \
  -f 'checks[][context]=sinal: unit' \
  -f 'checks[][context]=sinal: integration' \
  -f 'checks[][context]=sinal: e2e' \
  -f 'checks[][context]=sinal: lint' 2>&1 || echo "AÇÃO MANUAL: configure required status checks em Settings→Branches"
```
Verify (fase C): `gh api repos/NEXUZ-SYS/devflow/branches/main/protection/required_status_checks --jq '.checks[].context'` deve listar os 4 sinais.

> Se o operador não tiver admin do repo no momento, este passo é registrado como **entrega pendente verificável** e o plano documenta honestamente que, até ele existir, o gate é **advisory (D7a)**, não mecânico (D7b).

---

## Task Group 8 — Gate da fase V: `prevc-validation` lê o ledger

**Agent:** documentation-writer (edição de skill) + test-writer

**Files:**
- Modify: `skills/prevc-validation/SKILL.md`
- Create: `scripts/lib/verify-gate.mjs` (a lógica determinística que a skill invoca)
- Test: `tests/lib/test-verify-gate.mjs`

**Por quê extrair `verify-gate.mjs`:** a skill é prosa (D7a); a decisão do gate precisa ser testável mecanicamente. A skill instrui a rodar o CLI e ler o veredito.

**Interfaces:**
- Consumes: `lastEntry` (TG2), `treeDigest` (TG3), `readVerifyFromPath` (TG1).
- Produces: `evaluateGate({ root, requiredSignals }) → { pass: bool, blocks: [{signal, reason}], warnOnly: bool }`. Sem `verify:` → `{ pass:true, warnOnly:true }` (D9). Para cada `requiredSignal`: sem entrada → BLOCK "afirmou sem observar"; `treeDigest` ≠ atual → BLOCK "prova vencida"; `exit≠0` → BLOCK "sinal vermelho".

- [ ] **Step 1: Escrever os testes falhando**

Criar `tests/lib/test-verify-gate.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateGate } from '../../scripts/lib/verify-gate.mjs';
import { appendEntry } from '../../scripts/lib/verify-ledger.mjs';
import { treeDigest } from '../../scripts/lib/verify-tree-digest.mjs';

function repo(verifyBlock) {
  const d = mkdtempSync(join(tmpdir(), 'gate-'));
  const g = (...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  g('config','user.email','t@t'); g('config','user.name','t');
  mkdirSync(join(d, '.context'), { recursive: true });
  writeFileSync(join(d, '.context', '.devflow.yaml'), `git:\n  strategy: branch-flow\n${verifyBlock}`);
  writeFileSync(join(d, 'a.txt'), 'x'); g('add','-A'); g('commit','-q','-m','i');
  return d;
}
const V = `verify:\n  unit: ["bash","ok.sh"]\n`;

test('sem verify: → warn-only, pass', () => {
  const d = repo("");
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, true); assert.equal(r.warnOnly, true);
});
test('ledger vazio → BLOCK "sem observação"', () => {
  const d = repo(V);
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, false);
  assert.match(r.blocks[0].reason, /sem observ|afirmou/i);
});
test('digest vencido → BLOCK', () => {
  const d = repo(V);
  appendEntry(d, { signal: 'unit', exit: 0, treeDigest: 'STALE', at: 'x' });
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, false); assert.match(r.blocks[0].reason, /vencid|stale/i);
});
test('exit≠0 → BLOCK', () => {
  const d = repo(V);
  appendEntry(d, { signal: 'unit', exit: 1, treeDigest: treeDigest(d), at: 'x' });
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, false); assert.match(r.blocks[0].reason, /vermelho|red/i);
});
test('verde com digest atual → PASS', () => {
  const d = repo(V);
  appendEntry(d, { signal: 'unit', exit: 0, treeDigest: treeDigest(d), at: 'x' });
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, true); assert.equal(r.warnOnly, false);
});
// R-C6: verify: presente mas o .devflow.yaml não parseia → BLOCK ruidoso, NUNCA warn-only-pass nem crash.
test('verify: presente mas parse falha → BLOCK (não warn-only, não stack trace)', () => {
  const d = repo(`verify:\n  unit: ["bash", "ok.sh"]\n  bad: &anchor nope\n`); // âncora YAML → readVerify lança
  const r = evaluateGate({ root: d, requiredSignals: ['unit'] });
  assert.equal(r.pass, false);
  assert.match(r.blocks[0].reason, /parse|inválid|fail-closed/i);
});

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-verify-gate.mjs`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o gate**

Criar `scripts/lib/verify-gate.mjs`:
```javascript
// scripts/lib/verify-gate.mjs — decisão determinística do gate da fase V (D9).
// Só LÊ o ledger. Sem verify: → warn-only. Com verify: → fail-closed por requiredSignal.
import { join } from "node:path";
import { readVerifyFromPath } from "./devflow-config.mjs";
import { lastEntry } from "./verify-ledger.mjs";
import { treeDigest } from "./verify-tree-digest.mjs";

export function evaluateGate({ root, requiredSignals = [] }) {
  let signals;
  try {
    ({ signals } = readVerifyFromPath(join(root, ".context/.devflow.yaml")));
  } catch (e) {
    // R-C6: verify: presente mas inválido/inseguro → BLOCK explícito, nunca warn-only-pass nem crash.
    return { pass: false, warnOnly: false, blocks: [{ signal: "verify", reason: `contrato verify: inválido — fail-closed (${e.message})` }] };
  }
  if (Object.keys(signals).length === 0) {
    return { pass: true, warnOnly: true, blocks: [], note: "nenhum sinal declarado; validação auto-reportada" };
  }
  const now = treeDigest(root);
  const blocks = [];
  for (const s of requiredSignals) {
    const e = lastEntry(root, s);
    if (!e) { blocks.push({ signal: s, reason: `sem observação: V afirmaria '${s}' sem rodar o sinal` }); continue; }
    if (e.treeDigest !== now) { blocks.push({ signal: s, reason: `prova vencida para '${s}': re-rode o sinal (árvore mudou)` }); continue; }
    if (e.exit !== 0) { blocks.push({ signal: s, reason: `sinal vermelho: '${s}' saiu com exit ${e.exit}` }); continue; }
  }
  return { pass: blocks.length === 0, warnOnly: false, blocks };
}

function main(argv) {
  const root = argv[0] || process.cwd();
  const required = (argv[1] || "").split(",").map(s => s.trim()).filter(Boolean);
  const r = evaluateGate({ root, requiredSignals: required });
  if (r.warnOnly) { console.log(`⚠ ${r.note}`); process.exit(0); }
  if (!r.pass) { console.error("✗ gate de V bloqueado:"); for (const b of r.blocks) console.error(`  ${b.signal}: ${b.reason}`); process.exit(1); }
  console.log("✓ gate de V: todos os requiredSignals observados verdes com digest atual"); process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/lib/test-verify-gate.mjs`
Expected: PASS (5/5).

- [ ] **Step 5: Adicionar o passo à skill `prevc-validation`**

Inserir em `skills/prevc-validation/SKILL.md`, como **Step 1.5** (após "Run Full Test Suite", antes de "Spec Compliance"):
```markdown
## Step 1.5: Gate de Sinal Verificável (lê o ledger — não afirma)

Se o projeto declara `verify:` no `.context/.devflow.yaml`, a fase V **observa**
um sinal externo em vez de afirmar que os testes passam.

1. Para cada `s` em `plano.requiredSignals`, garanta que o sinal foi rodado nesta
   árvore: `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/verify-run.mjs <s> "$PWD" V`
   (gera/atualiza a entrada do ledger com o `treeDigest` atual).
2. Rode o gate determinístico:
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/verify-gate.mjs "$PWD" "<requiredSignals separados por vírgula>"`
   - exit 0 + "✓" → gate passa.
   - exit 0 + "⚠" → **warn-only** (projeto sem `verify:`): registre "validação auto-reportada; nenhum sinal declarado" e siga (D9).
   - exit 1 → **BLOCK**: apresente cada motivo (sem observação / prova vencida / sinal vermelho) e retorne à fase E.

**Honestidade sobre a independência (R-C7).** O gate local é um **auxílio de
honestidade**, não uma garantia: o mesmo agente roda o executor e lê o ledger, e
o ledger é gitignored/forjável — um agente adversário poderia inserir uma entrada
verde. A **garantia** de gerador ≠ verificador é o **CI** (`test.yml`), que re-roda
os sinais num ambiente limpo e só vincula o merge **quando é required check**
(TG7 Step 6). Localmente o gate torna o auto-report *disciplinado*; mecanicamente,
quem barra o vermelho é o CI obrigatório.
```

- [ ] **Step 6: Verificar a referência da skill**

Run: `grep -q "verify-gate.mjs" skills/prevc-validation/SKILL.md && echo OK`
Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/verify-gate.mjs tests/lib/test-verify-gate.mjs skills/prevc-validation/SKILL.md
git commit -m "feat(prevc-validation): gate de V lê o ledger (sem verify:→warn-only; com→fail-closed) [D9]"
```

---

## Task Group 9 — `requiredSignals` no plano (`prevc-planning` Step 5.5)

**Agent:** documentation-writer

**Files:**
- Modify: `skills/prevc-planning/SKILL.md` (Step 5.5)
- Test: `tests/validation/test-planning-required-signals.mjs`

- [ ] **Step 1: Teste de referência (a skill documenta requiredSignals)**

Criar `tests/validation/test-planning-required-signals.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(import.meta.dirname, '../..', p), 'utf-8');

test('prevc-planning Step 5.5 emite requiredSignals', () => {
  const t = read('skills/prevc-planning/SKILL.md');
  assert.match(t, /requiredSignals/);
  assert.match(t, /unit|integration|e2e|lint/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/validation/test-planning-required-signals.mjs`
Expected: FAIL — `requiredSignals` ausente na skill.

- [ ] **Step 3: Estender o Step 5.5 da skill**

Em `skills/prevc-planning/SKILL.md`, no Step 5.5 (validação test-first), adicionar após a checagem de tipos de teste:
```markdown
### Emitir `requiredSignals` no plano

Além de anotar os tipos de teste em prosa, o plano declara os sinais que a fase V
vai **exigir observados** (contrato `verify:`, ver `devflow:prevc-validation`):

```yaml
requiredSignals: [unit, e2e]
```

Regras:
- Vocabulário fechado: `unit`, `integration`, `e2e`, `lint`.
- A derivação é humana (você escolhe consultando a tabela de tipos de teste); a
  verificação é mecânica (uma vez declarado `e2e`, a fase V exige `exit 0` observado).
- Declare `e2e` quando a task toca auth, pagamentos, fluxos de usuário, CLI/hooks
  (mesma regra do "E2E is mandatory when…" da prevc-validation).
- Declare `lint` sempre (gate determinístico não é opcional por task — D6).
- **Não** infira sinais dos paths tocados (heurística frágil, rejeitada em D2). A
  fase R revisa a escolha.
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/validation/test-planning-required-signals.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/prevc-planning/SKILL.md tests/validation/test-planning-required-signals.mjs
git commit -m "feat(prevc-planning): Step 5.5 emite requiredSignals no plano (contrato verify:)"
```

---

## Task Group 10 — Dogfooding + ADR-013 + correções de fato + config skill

**Agent:** architect (ADR) + documentation-writer

**Files:**
- Modify: `.context/.devflow.yaml` (bloco `verify:`)
- Modify: `skills/config/SKILL.md`
- Modify: `.context/docs/testing-strategy.md`
- Modify: `docs/superpowers/specs/2026-07-09-verify-signal-pipeline-design.md` (3 correções de fato)
- Create: `.context/engineering/adrs/013-verifiable-signal-pipeline-v1.0.0.md`
- Test: `tests/lib/test-devflow-yaml-verify-block.mjs`, `tests/scripts/test-testing-strategy-doc.sh`

- [ ] **Step 1: Teste — o `.devflow.yaml` do repo declara `verify:` válido e dogfooda os runners**

Criar `tests/lib/test-devflow-yaml-verify-block.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readVerify } from '../../scripts/lib/devflow-config.mjs';

test('.devflow.yaml do repo declara os 4 sinais apontando para os runners', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../../.context/.devflow.yaml'), 'utf-8');
  const v = readVerify(src);
  assert.deepEqual(v.signals.unit, ['bash', 'tests/run-unit.sh']);
  assert.deepEqual(v.signals.integration, ['bash', 'tests/run-integration.sh']);
  assert.deepEqual(v.signals.e2e, ['bash', 'tests/run-e2e.sh']);
  assert.deepEqual(v.signals.lint, ['bash', 'tests/run-lint.sh']);
  assert.deepEqual(v.onTaskComplete, ['unit']);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/lib/test-devflow-yaml-verify-block.mjs`
Expected: FAIL — bloco `verify:` ausente no `.devflow.yaml`.

- [ ] **Step 3: Adicionar o bloco `verify:` ao `.devflow.yaml`** (stage seletivo — não commitar o drift de grounding)

Anexar a `.context/.devflow.yaml`:
```yaml

# Pipeline de sinal verificável (ADR-013). Comandos são argv arrays; os runners
# enumeram por git ls-files + convenção. onTaskComplete = subconjunto do loop rápido.
verify:
  unit:        ["bash", "tests/run-unit.sh"]
  integration: ["bash", "tests/run-integration.sh"]
  e2e:         ["bash", "tests/run-e2e.sh"]
  lint:        ["bash", "tests/run-lint.sh"]
  onTaskComplete: [unit]
```

- [ ] **Step 4: Ver passar**

Run: `node --test tests/lib/test-devflow-yaml-verify-block.mjs`
Expected: PASS.

- [ ] **Step 5: Dogfooding real — rodar cada sinal via o executor no próprio repo**

Run:
```bash
node scripts/lib/verify-run.mjs unit "$PWD" E
node scripts/lib/verify-run.mjs lint "$PWD" E
cat .context/runtime/verify-ledger.jsonl
```
Expected: `unit` exit 0, `lint` exit 0, ledger com as duas entradas e `treeDigest` preenchido. (Prova que a maquinaria roda do checkout — a única parte não-dogfoodável, o hook, está fora de escopo v1.)

- [ ] **Step 6: Corrigir `testing-strategy.md`**

Em `.context/docs/testing-strategy.md`, substituir a afirmação "It has no traditional unit test framework" pela descrição real:
```markdown
## Test Framework

DevFlow usa `node:test` (Node 24, zero-dep) para ~1900 testes `.mjs` e Bash para
~60 testes `.sh`. A suíte é declarada como **sinal verificável** no `.context/.devflow.yaml`
(bloco `verify:`), enumerada de forma reprodutível pelos runners `tests/run-*.sh`
(`git ls-files` + convenção `test-*.mjs`/`*.test.mjs`/`test-*.sh`), e arbitrada pelo
CI `.github/workflows/test.yml`. A fase V do PREVC **observa** o ledger
(`.context/runtime/verify-ledger.jsonl`) em vez de afirmar — ver ADR-013.

Comando canônico por sinal: `node scripts/lib/verify-run.mjs <unit|integration|e2e|lint>`.
```
Criar `tests/scripts/test-testing-strategy-doc.sh` que asserta que o doc menciona `verify-run.mjs` e NÃO contém "no traditional unit test framework".

- [ ] **Step 7: Oferecer o bloco `verify:` na entrevista do `config`**

Em `skills/config/SKILL.md`, adicionar uma seção na entrevista que, ao detectar testes no projeto (`git ls-files 'test-*'`), oferece scaffolding do bloco `verify:` com a allowlist e o vocabulário fechado, **exibindo os comandos declarados antes de qualquer execução** (§8 da spec: `/devflow init`/`update` mostram os comandos). Incluir o aviso: sinais nunca rodam em session-start.

- [ ] **Step 8: Criar a ADR-013**

Usar `devflow:adr-builder` (modo prefilled) ou escrever diretamente `.context/engineering/adrs/013-verifiable-signal-pipeline-v1.0.0.md` com: decisão ("a fase V observa um sinal binário externo produzido por código; gerador ≠ verificador; contrato `verify:` em argv arrays; ledger + CI árbitro"), `refines: 011-devflow-config-single-parser` e relação com 012 (D7a→D7b), e **Guardrails**: SEMPRE ler `verify:` via `devflow-config.mjs`; comandos são argv arrays com `argv[0]` em allowlist; NUNCA `argv[1]` `-c`/`-e`; a fase V nunca afirma sem observar o ledger; sinais nunca rodam em session-start; guard anti-enfraquecimento roda no `lint`.

- [ ] **Step 9: Rodar o gate de auditoria da ADR-013**

Run: `node scripts/adr-audit.mjs .context/engineering/adrs/013-verifiable-signal-pipeline-v1.0.0.md --enforce-gate`
Expected: PASS (sem FIX-INTERVIEW).

- [ ] **Step 10: Corrigir os 3 pontos de fato da spec**

Em `docs/superpowers/specs/2026-07-09-verify-signal-pipeline-design.md`, adicionar uma nota de errata (preservando o histórico, não reescrevendo o design aprovado):
```markdown
## Errata (2026-07-14, durante a implementação)

Três premissas de fato foram corrigidas na medição:
- **§12.1 / §7:** `onTaskComplete: [unit]` custa **~24 s**, não 1,6 s — `unit` cobre toda a
  suíte `.mjs` (fora integration/e2e), não só `tests/lib` (que é 8% da suíte). Cobrir 8%
  reconstruiria o modo de falha do `tests-passing`.
- **§7:** o hook `post-tool-use` está registrado com `async: true`; o `additionalContext`
  não chega ao agente. O loop rápido no hook fica **fora do escopo v1** (follow-up); o
  executor é rodado explicitamente (CLI) na fase E/V. O gate honesto (executor+ledger+CI+V)
  não depende do hook.
- **§4/D1:** o hook e as skills rodam do cache do plugin (pin project-scoped), não da árvore.
  Dogfooding do hook exige `--plugin-dir` ou release; o executor e o CI dogfoodam do checkout.
- **§9 (revisão de segurança):** o gate local é auxiliar e forjável (ledger gitignored, `treeDigest`
  sem segredo). A independência gerador≠verificador é do **CI required check**, não do gate local —
  por isso o `test.yml` como required check (TG7 Step 6) é o que dá dente ao design.
- **§8 (revisão de segurança):** a allowlist não fechava código inline além de `-c`/`-e` curtos
  (`node --eval`/`-p`/`-pe`, `bash -lc`, `python -c` passavam). Fechado em TG1 (`assertNoInlineCode`,
  varrendo todo o argv) e replicado no guard do contrato (TG6).
```

- [ ] **Step 11: Rodar a suíte inteira via os runners (verde) + commit final**

Run:
```bash
bash tests/run-unit.sh && bash tests/run-integration.sh && bash tests/run-lint.sh && bash tests/run-e2e.sh
```
Expected: todos exit 0 (env-gated imprimem SKIP).

```bash
git add .context/.devflow.yaml skills/config/SKILL.md .context/docs/testing-strategy.md \
  docs/superpowers/specs/2026-07-09-verify-signal-pipeline-design.md \
  .context/engineering/adrs/013-verifiable-signal-pipeline-v1.0.0.md \
  tests/lib/test-devflow-yaml-verify-block.mjs tests/scripts/test-testing-strategy-doc.sh
git commit -m "feat(verify): dogfooding (verify: no repo) + ADR-013 + config skill + testing-strategy + errata da spec"
```

---

## Anexo A — Follow-ups explícitos (fora do escopo v1)

Registrar como itens de acompanhamento (memória de projeto / issues):

1. **`hook-async-additionalContext-descarte`** — provar empiricamente e migrar `PostToolUse` para `asyncRewake: true` + `exit 2` + stderr. Auditar os 5 controles legados (handoff/linter/nudge/bypass/commit) que passam pelo mesmo `printf` final. **Alta prioridade — é um bug de produção.**
2. **`verify-signal-loop-no-hook`** — depois de (1), fechar o loop rápido: `hooks/post-tool-use` roda `verify.onTaskComplete` e devolve o RED por stderr; critério de parada = 3 REDs consecutivos (usa `consecutiveReds` do TG2, já pronto).
3. **`plugin-pin-project-scope-obsoleto`** — o pin `scope=project version=1.23.1` do repo devflow sombreia o `scope=user 1.28.0`. Corrigir para o repo rodar código atual; adotar `claude --plugin-dir` como procedimento de dogfooding documentado.
4. **`verify-signal-deploy`** — Deploy verificado (smoke pós-release, rollback), agora com sinal para se apoiar (spec §2).
5. **`verify-signal-ao-bridge`** — sinal por worker para a execução paralela do AO (spec §2, depende deste trabalho).

---

## Self-Review

**Spec coverage:**
- §5 contrato → TG1 (`readVerify`, allowlist, vocabulário fechado, `onTaskComplete ⊆`, `assertNoInlineCode`). ✓
- §6 executor + `treeDigest` → TG3 (com correção anti-livelock do achado do architect). ✓
- §7 ledger → TG2; loop no hook → **fora de escopo v1** (documentado, com justificativa medida). ✓ (parcial, consciente)
- §8 segurança (argv, allowlist, código inline) → TG1 (`assertNoInlineCode` varre todo o argv — fecha o furo `--eval`/`-lc` da revisão) + TG10 Step 7 (exibir comandos). ✓
- §9 gate de V (warn-only/fail-closed) → TG8 (R-C6: fail-closed em parse-fail, não warn-only-pass). ✓
- §10 guard anti-enfraquecimento → TG5 (R-C3: fail-closed em CI no merge-base-miss). ✓
- §13 componentes tocados → todos cobertos; `hooks/post-tool-use` movido para follow-up (com razão); `known-hashes` removido (R-C4: category error). ✓
- **Adições além da spec (todas justificadas pela revisão):** TG0 (zerar suíte), TG6 (guard do contrato, agora com braço de CI vs merge-base — R-C2), TG7 Step 6 (required check — R-C5), correção anti-livelock, base-ref threading (R-C3).

**Achados da fase R incorporados:** R-C1 (código inline no argv, HIGH), R-C2 (guard do contrato no CI), R-C3 (base-ref + fail-closed), R-C4 (remover known-hashes), R-C5 (required check), R-C6 (downgrade silencioso do gate), R-C7 (honestidade da independência), R-C8 (invariantes não entregues), R-C9 (enum robustez).

**Placeholder scan:** sem TBD/TODO; todo step de código traz o código; comandos com expected output. ✓

**Type consistency:** `readVerify`→`{signals,onTaskComplete}` + `assertNoInlineCode` (TG1) usados por TG3/TG6/TG8/TG10; `appendEntry`/`lastEntry`/`consecutiveReds` (TG2) por TG3/TG8; `treeDigest` (TG3) por TG3/TG8; `evaluateWeakening({root,baseRef,ci})` (TG5), `evaluateGate` (TG8), `detectWeakenings` estendido (TG6) + `verify-contract-guard-cli` (TG6). ✓

**requiredSignals para ESTE plano (fase V vai exigir):** `[unit, integration, e2e, lint]` — a feature toca CLI/hooks/config (e2e obrigatório), boundaries de config (integration), e é gate determinístico (lint sempre).

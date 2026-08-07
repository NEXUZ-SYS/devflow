# Plano de Correção — Achados da Validação E2E do DevFlow

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar tarefa-a-tarefa. Passos usam checkbox (`- [ ]`).

**Objetivo:** Corrigir, com TDD, todos os achados da validação E2E que **persistem** no DevFlow 1.25.0 — em ordem de valor/risco, agrupados por família de causa-raiz.

**Arquitetura:** Correções aplicadas no repositório do produto `~/Documentos/code/devflow` (NÃO no sandbox de validação). O sandbox `devflow-e2e-sandbox` permanece como fixture de captura/regressão. Cada PR é entregável e testável de forma independente.

**Stack:** Node.js puro (zero-dep) para libs (`scripts/lib/*.mjs`), Bash para hooks (`hooks/*`), Markdown para skills (`skills/*/SKILL.md`). Testes: `.mjs` pure-node + `.sh` (bats-like) em `tests/`.

## Restrições globais (copiar verbatim para cada task)

- **Idioma:** todo texto de usuário, comentário e doc em **pt-BR** (termos técnicos mantidos).
- **TDD obrigatório:** RED → GREEN → REFACTOR. Nenhum código de produção sem teste falhando antes. Testes reais (unit + integração), nunca content-check.
- **Zero-dep:** libs em `scripts/lib/` não podem adicionar dependências npm.
- **Não mutar o sandbox:** as correções são no repo `devflow`. O sandbox só é usado para reproduzir/regredir (em cópia tmpdir se destrutivo).
- **Guardrails de git:** subagentes de implementação são **proibidos** de rodar `gh`/PR/merge/push. Merge é sempre manual pelo operador.
- **Path canônico DDC v2:** a fonte única de paths é `scripts/lib/context-paths.mjs`. Nenhum componente novo pode hardcodar `.context/{adrs,standards,docs}` — deve resolver via `contextPaths()` / `resolveReadPaths()`.
- **Versão sob correção:** DevFlow **1.25.0** (base confirmada por triagem 2026-07-01).

---

## Matriz de triagem (estado real em 1.25.0)

Confirmado por 4 varreduras de código read-only em 2026-07-01. Achados capturados contra 1.23.3.

| # | Achado | Sev | Veredito 1.25.0 | Local atual |
|---|--------|-----|-----------------|-------------|
| **Família path-drift legado ↔ DDC v2** | | | | |
| 1 | **Achado-mãe:** ADRs não injetadas (session-start) | 🔴 alto | **PERSISTE** | `hooks/session-start:184-190` |
| 2 | Achado-mãe pt.2: adr-filter no-op em v2 | 🔴 alto | **PERSISTE** | `skills/adr-filter/SKILL.md:15,27,86` |
| 3 | Nudge de standards morto (Camada 2) | 🟠 médio | **PERSISTE** | `hooks/post-tool-use:170` |
| 4 | `standards audit` CLI hardcoda path | 🟠 médio | **PERSISTE** (lib OK, só CLI) | `scripts/devflow-standards.mjs:735-737` |
| 5 | GAP-INIT-1: gate green-field usa `.context/docs/` | 🟡 baixo | **PERSISTE** | `skills/project-init/SKILL.md:10-22` |
| 6 | DOCTOR-1: doctor não cobre o achado-mãe | 🟠 médio | **PERSISTE** | `scripts/lib/doctor.mjs:284-288` |
| **Segurança / autonomia** | | | | |
| 7 | ADV-7: secrets sem default-deny | 🔴 alto | **PERSISTE** | `permissions-evaluator.mjs:21-28,50-52`; `pre-tool-use:47` |
| 8 | ADV-6: `git push`/`gh pr merge` sem rede | 🔴 alto | **PERSISTE** | `hooks/pre-tool-use:160-162` |
| 9 | ADV-8/B9: mutação da git-strategy sem freio | 🔴 alto | **PERSISTE** | `hooks/pre-tool-use:219-221` |
| 10 | B8: sem guardrail anti-atalho na fase V | 🔴 alto | **PERSISTE** | `skills/prevc-validation/SKILL.md:238-245` |
| 11 | B9-skill: git-strategy não protege a própria config | 🔴 alto | **PERSISTE** | `skills/git-strategy/SKILL.md:54-68` |
| 12 | B6: linter SQL-injection só `on-demand` | 🔴 alto | **PARCIAL** (existe, não enforçado) | `assets/standards/std-security.md:7` |
| **Detecção / observabilidade** | | | | |
| 13 | UPD-1: `grep gitStrategy:` vs `git.strategy:` | 🟡 baixo | **PERSISTE** | `references/post-update-guide.md:127` |
| 14 | UPD-2: migração v1→v2 falso-positivo | 🟡 baixo | **PERSISTE** | `commands/devflow.md:390-405` |
| 15 | CP-2b: instrução docs-mcp órfã | 🟡 baixo | **PERSISTE** | `hooks/session-start:382-393` |
| **Higiene / menores** | | | | |
| 16 | L1-SI1: `node -e` interpolado (10×) | 🟡 baixo | **PERSISTE** | `prevc-confirmation`, `autonomous-loop`, `prevc-execution`, `config` |
| 17 | STK-P3: stacks-filter invariante à task | 🟡 baixo | **PERSISTE** | `scripts/lib/stacks-filter.mjs:64-87` |
| 18 | F-build-3: compliance força `activation:always` | 🟡 baixo | **PERSISTE** | `skills/knowledge/references/taxonomy-of-knowledge.yaml:23-28` |
| 19 | F-build-2: `eject` sem aviso de `CLAUDE_PLUGIN_ROOT` | 🟡 baixo | **PARCIAL** | `scripts/devflow-stacks.mjs:272` |
| **Fora de escopo (não reproduzível em 1.25.0)** | | | | |
| — | GAP-INIT-2/3/4 | baixo | **NÃO-LOCALIZADO** | provável refatoração p/ dotcontext MCP |

**Cobertura de teste (dívida, não bug):** L1-gap-1 (context-sync), L1-gap-2 (MemPalace), L1-gap-3 (git-strategy branch-protection) — sem suíte dedicada.

---

## Ordem de execução (6 PRs)

1. **PR 1 — Path-drift DDC v2** (achados 1-6): causa-raiz única, maior valor arquitetural. Destrava o guardrail de ADR (1ª ordem).
2. **PR 2 — Segurança do hook** (7-9): fecha os BYPASS-críticos de autonomia.
3. **PR 3 — Guardrails de disciplina** (10-12): presença de instrução anti-atalho/escalação nas skills.
4. **PR 4 — Detecção/observabilidade** (13-15).
5. **PR 5 — Higiene/menores** (16-19).
6. **PR 6 — Cobertura de teste** (dívida L1-gap-1/2/3).

> Este documento detalha **PR 1 completo (code-level TDD)** e especifica **PRs 2-6 em nível de task** (arquivo, teste RED, abordagem GREEN). O código-completo-por-step dos PRs 2-6 é materializado ao iniciar cada um (novo passe de `writing-plans` ou execução inline), para manter cada entrega revisável.

---

# PR 1 — Path-drift DDC v2 (achado-mãe + família)

**Causa-raiz única:** `context-paths.mjs` declara o canônico v2 (`engineering/adrs`, `engineering/standards`) e expõe `resolveReadPaths()` com fallback legado, mas componentes em **bash e prosa** hardcodam os paths legados `.context/{adrs,docs,standards}`. Componentes que delegam às libs v2-aware funcionam; os que hardcodam falham. Consequência: em qualquer projeto DDC v2 canônico, o enforcement de **ADRs** fica totalmente ausente.

**Estratégia:** expor `resolveReadPaths` via CLI (para consumo bash) e religar os 5 consumidores + adicionar um check de doctor que teria pego isso.

### Task 1.1: CLI de resolução de paths em context-paths.mjs

**Files:**
- Modify: `scripts/lib/context-paths.mjs` (append bloco CLI ao fim, após linha 57)
- Test: `tests/lib/test-context-paths-cli.mjs` (create)

**Interfaces:**
- Produz: invocável como `node scripts/lib/context-paths.mjs resolve-read <key> [projectRoot]` → imprime os dirs de leitura existentes, um por linha (canonical primeiro). `key` ∈ {adrs, standards, stacks, templates}. Sai 0 sempre; imprime nada se nenhum existe.

- [ ] **Passo 1: Escrever o teste que falha**

```js
// tests/lib/test-context-paths-cli.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert";

const CLI = new URL("../../scripts/lib/context-paths.mjs", import.meta.url).pathname;
const run = (args, cwd) => execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8" }).trim();

// canônico v2: engineering/adrs presente → deve ser a 1ª linha
const root = mkdtempSync(join(tmpdir(), "cp-"));
mkdirSync(join(root, ".context", "engineering", "adrs"), { recursive: true });
const out = run(["resolve-read", "adrs", root], root);
assert.strictEqual(out.split("\n")[0], join(root, ".context", "engineering", "adrs"),
  "engineering/adrs deve ser o path de leitura canônico (1ª linha)");

// legado co-habitando: engineering + legado ambos existem → ambos listados, canonical 1º
mkdirSync(join(root, ".context", "adrs"), { recursive: true });
const out2 = run(["resolve-read", "adrs", root], root).split("\n");
assert.ok(out2.includes(join(root, ".context", "adrs")), "legado existente deve ser incluído");
assert.strictEqual(out2[0], join(root, ".context", "engineering", "adrs"), "canonical continua 1º");

console.log("OK test-context-paths-cli");
```

- [ ] **Passo 2: Rodar e confirmar FALHA**

Run: `cd ~/Documentos/code/devflow && node tests/lib/test-context-paths-cli.mjs`
Esperado: FALHA — o CLI ainda não existe (o `node context-paths.mjs resolve-read ...` não imprime nada / erro de módulo sem export default executável).

- [ ] **Passo 3: Implementar o CLI (mínimo)**

Anexar ao fim de `scripts/lib/context-paths.mjs`:

```js
// CLI: `node context-paths.mjs resolve-read <key> [projectRoot]`
// Imprime os dirs de leitura existentes (canonical primeiro), um por linha.
// Usado por hooks bash que não podem importar ESM diretamente.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, key, root] = process.argv.slice(2);
  if (cmd === "resolve-read" && key) {
    const projectRoot = root || process.cwd();
    for (const p of resolveReadPaths(projectRoot, key)) {
      if (existsSync(p)) console.log(p);
    }
  }
}
```

- [ ] **Passo 4: Rodar e confirmar PASSA**

Run: `cd ~/Documentos/code/devflow && node tests/lib/test-context-paths-cli.mjs`
Esperado: `OK test-context-paths-cli`

- [ ] **Passo 5: Commit**

```bash
git add scripts/lib/context-paths.mjs tests/lib/test-context-paths-cli.mjs
git commit -m "feat(context-paths): CLI resolve-read para consumo por hooks bash"
```

### Task 1.2: session-start injeta ADRs do path canônico v2 (achado-mãe P0)

**Files:**
- Modify: `hooks/session-start:184-190`
- Test: `tests/hooks/test-session-start-adr-v2.sh` (create)

**Interfaces:**
- Consome: `node scripts/lib/context-paths.mjs resolve-read adrs <root>` (Task 1.1).

- [ ] **Passo 1: Escrever o teste que falha**

```bash
#!/usr/bin/env bash
# tests/hooks/test-session-start-adr-v2.sh
set -euo pipefail
PLUGIN_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"
tmp=$(mktemp -d)
mkdir -p "$tmp/.context/engineering/adrs"
cat > "$tmp/.context/engineering/adrs/001-money-cents.md" <<'EOF'
---
name: Dinheiro em centavos
status: Aprovado
stack: typescript
---
## Guardrails
- Nunca usar float para dinheiro. Sempre inteiros (centavos).
EOF

out=$(printf '{"cwd":"%s","hook_event_name":"SessionStart"}' "$tmp" \
  | bash "$PLUGIN_ROOT/hooks/session-start" 2>/dev/null || true)

echo "$out" | grep -q "ADR_GUARDRAILS" || { echo "FALHA: ADR_GUARDRAILS ausente para ADR em engineering/adrs"; exit 1; }
echo "$out" | grep -q "centavos" || { echo "FALHA: guardrail da ADR não injetado"; exit 1; }
echo "OK test-session-start-adr-v2"
```

- [ ] **Passo 2: Rodar e confirmar FALHA**

Run: `bash tests/hooks/test-session-start-adr-v2.sh`
Esperado: FALHA "ADR_GUARDRAILS ausente" — o hook só olha `.context/adrs` e `.context/docs/adrs`.

- [ ] **Passo 3: Implementar (substituir 184-190)**

Trocar o bloco de descoberta de dirs por resolução via CLI (canonical v2 incluído):

```bash
adr_context=""
# Resolve os dirs de ADR (canonical engineering/adrs + fallbacks legados existentes)
adr_dirs=()
while IFS= read -r d; do
  [ -n "$d" ] && adr_dirs+=("$d")
done < <(node "${PLUGIN_ROOT}/scripts/lib/context-paths.mjs" resolve-read adrs "${project_root}" 2>/dev/null || true)
adr_dir_legacy="${project_root}/.context/docs/adrs"
adr_dir_new="${project_root}/.context/engineering/adrs"
```

(O restante do bloco 192-235 permanece: itera `adr_dirs`, dedup por filename, N6 warning quando só legado contribui. A checagem `[ "$d" = "$adr_dir_legacy" ]` na linha 217 continua válida; atualizar o comentário 178-181 para citar `engineering/adrs` como canônico v2.)

- [ ] **Passo 4: Rodar e confirmar PASSA**

Run: `bash tests/hooks/test-session-start-adr-v2.sh` → `OK`
E regressão: `bash tests/hooks/test-session-start.sh` (suíte existente) permanece verde.

- [ ] **Passo 5: Commit**

```bash
git add hooks/session-start tests/hooks/test-session-start-adr-v2.sh
git commit -m "fix(session-start): injeta ADRs do path canônico DDC v2 engineering/adrs (achado-mãe)"
```

### Task 1.3: nudge de standards (Camada 2) reconhece engineering/standards

**Files:**
- Modify: `hooks/post-tool-use:170`
- Test: `tests/hooks/test-post-tool-use-nudge-v2.sh` (create)

- [ ] **Passo 1: Teste que falha** — projeto com `.context/engineering/standards/` (sem `.context/standards/`) ao editar um `.ts` coberto deve produzir nudge. Asserção: saída contém o std-id aplicável.
- [ ] **Passo 2: Confirmar FALHA** — gate `[ -d "${PWD}/.context/standards" ]` é falso em v2.
- [ ] **Passo 3: Implementar** — trocar o gate por resolução v2-aware:

```bash
  STD_DIRS=$(node "${PLUGIN_ROOT}/scripts/lib/context-paths.mjs" resolve-read standards "${PWD}" 2>/dev/null || true)
  if [ -n "$NUDGE_PATH" ] && [ -n "$STD_DIRS" ]; then
```

- [ ] **Passo 4: Confirmar PASSA** + regressão `test-post-tool-use.sh` (22/22).
- [ ] **Passo 5: Commit** `fix(post-tool-use): nudge Camada 2 reconhece engineering/standards (v2)`

### Task 1.4: adr-filter SKILL aponta para o path canônico v2

**Files:**
- Modify: `skills/adr-filter/SKILL.md:15,27,86`
- Test: `tests/skills/test-adr-filter-paths.sh` (create — grep de disciplina)

- [ ] **Passo 1: Teste que falha** — grep garantindo que o SKILL referencia `engineering/adrs` e NÃO instrui parar quando só `.context/adrs/README.md` falta:

```bash
grep -q "engineering/adrs" skills/adr-filter/SKILL.md || { echo "FALHA: adr-filter não cita path v2"; exit 1; }
```

- [ ] **Passo 2: Confirmar FALHA.**
- [ ] **Passo 3: Implementar** — reescrever as instruções de leitura para: "Resolva o diretório de ADRs via `node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/context-paths.mjs resolve-read adrs .` (canonical `engineering/adrs`, com fallback legado). No-op só se NENHUM dos paths tiver `README.md`." Atualizar linhas 15, 27, 86.
- [ ] **Passo 4: Confirmar PASSA.**
- [ ] **Passo 5: Commit** `fix(adr-filter): resolve ADRs pelo canônico DDC v2`

> Nota SI-1: se a instrução usar `node -e` com `${CLAUDE_PLUGIN_ROOT}` interpolado, ela recai no achado 16 — usar a forma `node <arquivo> <args>` (subcomando CLI, sem `-e`). Já compatível com a Task 1.1.

### Task 1.5: `standards audit` CLI resolve o path via context-paths

**Files:**
- Modify: `scripts/devflow-standards.mjs:735-737` (função `cmdAudit`)
- Test: `tests/scripts/test-standards-audit-v2.mjs` (create)

- [ ] **Passo 1: Teste que falha** — criar projeto tmp com `std-error-handling.md` em `.context/engineering/standards/`; rodar `cmdAudit`; esperar que localize o arquivo (não "não encontrado").
- [ ] **Passo 2: Confirmar FALHA** — `stdsDir = .context/standards` não existe em v2.
- [ ] **Passo 3: Implementar** — importar `resolveReadPaths` e procurar o `.md` no primeiro dir que o contenha:

```js
import { resolveReadPaths } from "./lib/context-paths.mjs";
// ...
const fname = targetId.startsWith("std-") ? `${targetId}.md` : `std-${targetId}.md`;
let filePath = null;
for (const dir of resolveReadPaths(projectRoot, "standards")) {
  const cand = `${dir}/${fname}`;
  if (existsSync(cand)) { filePath = cand; break; }
}
```

- [ ] **Passo 4: Confirmar PASSA** + regressão da suíte de standards.
- [ ] **Passo 5: Commit** `fix(standards-audit): CLI localiza standards em engineering/standards (v2)`

### Task 1.6: project-init reconhece projeto DDC v2 populado (GAP-INIT-1)

**Files:**
- Modify: `skills/project-init/SKILL.md:10-22` (HARD-GATE green-field)
- Test: `tests/skills/test-project-init-gate.sh` (create — grep de disciplina)

- [ ] **Passo 1: Teste que falha** — grep garantindo que o gate considera as camadas DDC v2 (`engineering/`, `business/`, `product/`, `operations/`), não só `.context/docs/`.
- [ ] **Passo 2: Confirmar FALHA** (gate só cita `.context/docs/`).
- [ ] **Passo 3: Implementar** — ampliar o HARD-GATE: "Se **qualquer** de `.context/docs/`, `.context/engineering/`, `.context/business/`, `.context/product/`, `.context/operations/` já existe com conteúdo, o projeto já tem contexto → delegar a `devflow:context-sync`."
- [ ] **Passo 4: Confirmar PASSA.**
- [ ] **Passo 5: Commit** `fix(project-init): detecta contexto DDC v2 populado, evita re-init falso`

### Task 1.7: novo check no doctor — ADRs presentes mas não injetáveis (DOCTOR-1)

**Files:**
- Modify: `scripts/lib/doctor.mjs` (novo check `adrInjection`, registrar em `CHECKS`:284)
- Test: `tests/lib/test-doctor-adr-injection.mjs` (create)

**Interfaces:**
- Consome: `contextPaths()` / `resolveReadPaths()`.
- Produz: check que FALHA (severity médio) quando existem ADRs `status: Aprovado` em `resolveReadPaths(root,"adrs")` mas o path canônico `engineering/adrs` não é o que contém (ou o session-start não os injetaria). Após Task 1.2, o cenário some — o check é a rede que teria pego o achado-mãe.

- [ ] **Passo 1: Teste que falha** — projeto com ADR aprovada em `engineering/adrs`; `adrInjection` deve retornar `ok` (pós-1.2); projeto com ADR só em `.context/docs/adrs` legado deve retornar `warn` ("migre para engineering/adrs"). Escrever ambos os casos; o RED é o check ainda não existir.
- [ ] **Passo 2: Confirmar FALHA** (função não existe).
- [ ] **Passo 3: Implementar** o check e adicioná-lo ao array `CHECKS` (linha 284).
- [ ] **Passo 4: Confirmar PASSA** + regressão da suíte do doctor.
- [ ] **Passo 5: Commit** `feat(doctor): check de injeção de ADR (cobre o achado-mãe de path-drift)`

---

# PR 2 — Segurança do hook (autonomia) [P1]

> Fecha os BYPASS-críticos: hoje, sem `permissions.yaml`, o `pre-tool-use` não tem NENHUMA rede contra leitura de segredos, `git push`/`gh pr merge`, nem contra o auto-desarme da própria proteção.

### Task 2.1 — ADV-7: default-deny de segredos (independente de permissions.yaml)

- **Files:** `scripts/lib/permissions-evaluator.mjs` (baseline `DEFAULT_DENY`), `hooks/pre-tool-use:47` (sempre avaliar), test `tests/lib/test-permissions-secret-deny.mjs`.
- **RED:** sem `permissions.yaml`, `evaluate({tool:"Read", path:".env"})` / `secrets/key.pem` / `id_rsa` / `.ssh/*` → `decision:"deny"`; um arquivo comum (`src/app.ts`) → `prompt`/`allow`.
- **GREEN:** adicionar `DEFAULT_DENY.fs = [".env", ".env.*", "**/*.pem", "**/*.key", "**/id_rsa", "**/id_rsa.*", "**/secrets/**", "**/.ssh/**"]` mesclado em `EMPTY_CONFIG` e no config carregado; e no `pre-tool-use`, **sempre** invocar o evaluator (remover o gate `if [ -f permissions.yaml ]` da linha 47 — quando ausente usa o baseline). Trade-off: 1 processo `node` por tool-call em projetos sem permissions.yaml — aceitável; alternativa mais barata: replicar o secret-match em bash puro no topo do hook. **Decisão a fixar na task:** evaluator (testável, DRY) salvo se perf medida for proibitiva.
- **Commit:** `feat(permissions): default-deny de segredos aplicado sem opt-in (ADV-7)`

### Task 2.2 — ADV-6: interceptar `git push`/`gh pr merge` em branch protegida

- **Files:** `hooks/pre-tool-use` (novo ramo Bash antes do exit 160-162), test `tests/hooks/test-pre-tool-use-git-bash.sh`.
- **RED:** em branch protegida (`protectedBranches:[main]`, branch=main), `Bash` com `git push origin main` / `gh pr merge --auto` → `permissionDecision:"deny"` (mensagem manda passar pela fase C/`git-strategy`); em branch de trabalho → allow.
- **GREEN:** antes do `if TOOL_NAME != Edit/Write; exit 0`, tratar `TOOL_NAME=Bash`: extrair `command`, resolver branch (reusar bloco 225-229), e se a branch é protegida e o comando casa `git push`/`gh pr merge`/`git commit` direto na protegida → negar. Reusar a leitura de `protectedBranches` do `.devflow.yaml` já existente no hook.
- **Commit:** `feat(pre-tool-use): rede técnica contra push/merge direto em branch protegida (ADV-6)`

### Task 2.3 — ADV-8/B9: proteger campos `git.*` do `.devflow.yaml`

- **Files:** `hooks/pre-tool-use:219-221` (remover whitelist incondicional; validar o diff), lib `scripts/lib/devflow-config-guard.mjs` (create), test `tests/lib/test-devflow-config-guard.mjs`.
- **RED:** edição de `.context/.devflow.yaml` que **reduz** proteção (`branchProtection:true→false`, `protectedBranches` encolhe, `git.strategy` trocada) em branch protegida → `deny`/`ask` com instrução de escalar; edição que só ajusta campos não-sensíveis → allow.
- **GREEN:** substituir o `exit 0` da linha 219-221 por uma checagem que compara o valor proposto vs o atual (via `git show HEAD:.context/.devflow.yaml`) e nega quando os campos de segurança são enfraquecidos. Liga-se ao guardrail de skill da Task 3.2.
- **Commit:** `feat(pre-tool-use): impede auto-desarme da git-strategy no .devflow.yaml (ADV-8/B9)`

---

# PR 3 — Guardrails de disciplina nas skills [alto]

### Task 3.1 — B8: anti-atalho na fase V

- **Files:** `skills/prevc-validation/SKILL.md:238-245`, test `tests/skills/test-prevc-validation-antishortcut.sh` (grep).
- **RED:** grep exige instrução explícita proibindo apagar/desabilitar/enfraquecer testes ou linter para "passar", e verificação de que a contagem de testes não regrediu vs a base.
- **GREEN:** adicionar ao gate da fase V: "PROIBIDO satisfazer o gate removendo/skippando testes ou desativando linter. Verifique `git diff` da base: nº de testes não pode cair; asserts não podem virar no-op." Complementar com um passo mecânico (contar `test(`/`it(` antes/depois) onde aplicável.
- **Commit:** `docs(prevc-validation): guardrail anti-atalho (B8) — não vaciar o gate apagando testes`

### Task 3.2 — B9-skill: git-strategy recusa+escala mutação da strategy

- **Files:** `skills/git-strategy/SKILL.md:54-68`, test `tests/skills/test-git-strategy-selfprotect.sh` (grep).
- **RED:** grep exige instrução: ao detectar pedido de alterar `git.strategy`/`protectedBranches`/`branchProtection`, **recusar e escalar** ao operador, nunca aplicar autonomamente.
- **GREEN:** acrescentar seção "Proteção da própria configuração" com essa regra; referenciar a rede mecânica da Task 2.3.
- **Commit:** `docs(git-strategy): recusar+escalar mutação da própria estratégia (B9)`

### Task 3.3 — B6: escalação de decisão de segurança + std-security nos defaults

- **Files:** `assets/standards/std-security.md:7` (avaliar `activation`), skill de execução (instrução de escalação), test conforme a decisão.
- **RED/decisão:** o linter de SQL-injection existe (`std-security.js:15`) mas é `on-demand`. Decidir: (a) promover `std-security` a `always` nos defaults, ou (b) manter on-demand e adicionar guardrail de skill que force escalação ao detectar padrão de segurança (injection/authz). Recomendado: **(a)+(b)** — enforçar o linter por padrão E instruir escalação explícita.
- **GREEN:** conforme decisão; teste = linter dispara por default num projeto novo + grep do guardrail de escalação.
- **Commit:** `feat(security): std-security enforçado por default + escalação obrigatória (B6)`

---

# PR 4 — Detecção / observabilidade [baixo-médio]

### Task 4.1 — UPD-1: `grep git.strategy`
- **Files:** `references/post-update-guide.md:127`. **RED:** teste/grep de que a detecção casa o schema aninhado `git.strategy:` (ou parseia YAML), não `gitStrategy:`. **GREEN:** trocar o padrão. **Commit:** `fix(update): detecta git.strategy aninhado (UPD-1)`

### Task 4.2 — UPD-2: layout v2 estrutural
- **Files:** `commands/devflow.md:390-405`. **RED:** projeto com `.context/engineering/` mas sem `.layout-version` NÃO deve sugerir migração v1→v2. **GREEN:** considerar v2 estrutural (presença de `engineering/`) como sinal, não só o marcador. **Commit:** `fix(update): não sugerir migração quando .context/ já é v2 estrutural (UPD-2)`

### Task 4.3 — CP-2b: grounding condicionado ao MCP disponível
- **Files:** `hooks/session-start:382-393`. **RED:** com `grounding.mode` ativo mas `docs-mcp-server` ausente, o bloco NÃO deve injetar instruções "query `mcp__..._search_docs`" (ou deve marcá-las como indisponíveis). **GREEN:** condicionar a injeção a `$docs_mcp_available = true`; caso contrário, emitir nota de indisponibilidade. **Commit:** `fix(session-start): não injetar instrução docs-mcp quando o MCP está ausente (CP-2b)`

---

# PR 5 — Higiene / menores [baixo]

### Task 5.1 — L1-SI1: eliminar `node -e` interpolado (10 ocorrências)
- **Files:** `skills/prevc-confirmation/SKILL.md:156,160,167`, `skills/autonomous-loop/SKILL.md:45,50`, `skills/prevc-execution/SKILL.md:151`, `skills/config/SKILL.md:379,484,487,558`; test `tests/hooks/test-no-node-e-interpolation.sh` (já existe).
- **RED:** o teste de invariante SI-1 já falha (grep puro). **GREEN:** para cada ocorrência, extrair o snippet para um arquivo `.mjs` em `scripts/lib/` e invocar via `node <arquivo> <argv>` (sem `-e`, sem interpolar `${CLAUDE_PLUGIN_ROOT}` no código). Padrão já usado no resto do plugin (ver comentário SI-1 em `post-tool-use:184`).
- **Commit:** `fix(skills): substitui node -e interpolado por CLIs .mjs (SI-1)`

### Task 5.2 — F-build-3: compliance `activation: on-demand`
- **Files:** `skills/knowledge/references/taxonomy-of-knowledge.yaml:23-28`. **RED:** teste de que `business-compliance` permite `on-demand` (scaffold não força `always`). **GREEN:** trocar `activation: always` → `on-demand` (ou tornar parametrizável). **Commit:** `fix(knowledge): compliance permite activation on-demand (F-build-3)`

### Task 5.3 — F-build-2: `eject` avisa sem CLAUDE_PLUGIN_ROOT
- **Files:** `scripts/devflow-stacks.mjs:272`. **RED:** rodar `eject` sem `CLAUDE_PLUGIN_ROOT` → deve emitir aviso claro (stderr) sobre o fallback usado. **GREEN:** logar o aviso quando cai no `PLUGIN_ROOT` relativo. **Commit:** `fix(stacks): eject avisa quando CLAUDE_PLUGIN_ROOT ausente (F-build-2)`

### Task 5.4 — STK-P3: stacks-filter e relevância à task
- **Files:** `scripts/lib/stacks-filter.mjs:64-87`. **Decisão:** `filterStacks` detecta por deps do projeto (correto para "quais stacks existem"); a "relevância à task" é responsabilidade dos filtros de knowledge/std. **Opção A (doc):** documentar que stacks são project-level por design e ajustar a mensagem do session-start para não prometer "filtragem por task". **Opção B (feature):** aceitar `opts.taskKeywords` e reordenar/priorizar. Recomendado: **A** (menor risco; o achado é de expectativa, não de bug). **RED/GREEN/Commit** conforme a opção escolhida.

---

# PR 6 — Cobertura de teste (dívida L1) [dívida]

- **Task 6.1 — L1-gap-1:** suíte para `context-sync` (atualização de `.context/` sem regressão silenciosa).
- **Task 6.2 — L1-gap-2:** suíte para MemPalace `memory-ops`/`recall`.
- **Task 6.3 — L1-gap-3:** teste de integração do branch-protection do `pre-tool-use` (além do `permissions-evaluator` unit).

Cada uma: escrever teste que exercita o caminho real, confirmar verde, commit `test(<área>): cobertura de regressão (L1-gap-N)`.

---

## Fora de escopo (re-verificar, não há código para TDD)

- **GAP-INIT-2** (docs/glossary × business/glossary), **GAP-INIT-3** (projectType unknown), **GAP-INIT-4** (sensors.json estilo-Jest): NÃO-LOCALIZADOS em 1.25.0 — provável refatoração para o dotcontext MCP (externo ao repo). **Ação:** reproduzir via sessão `/devflow init` real num projeto TS v2 antes de decidir se ainda existem.

## Auto-revisão do plano (checklist do autor)

- **Cobertura:** todos os achados PERSISTE/PARCIAL da matriz têm task (1-19). NÃO-LOCALIZADOS estão em "fora de escopo" com ação de re-verificação. GAPs de teste → PR 6. ✔
- **Placeholders:** PR 1 é code-level completo. PRs 2-6 têm arquivo:linha + RED + abordagem GREEN concretos; o código-por-step é materializado ao iniciar cada PR (declarado no topo). ✔
- **Consistência de tipos:** `resolveReadPaths(projectRoot, key)` e o CLI `resolve-read <key> [root]` usados de forma idêntica nas Tasks 1.1→1.7. ✔

## Handoff de execução

**PR 1 detalhado; PRs 2-6 especificados.** Duas opções para o PR 1:

1. **Subagent-Driven (recomendado):** um subagente fresco por task (1.1→1.7), revisão entre tasks. Guardrails: proibir `gh`/PR/merge/push no prompt; testes em tmpdir.
2. **Inline:** executar as tasks nesta sessão com checkpoints de revisão.

> Lembrete de disciplina: a correção é no repo `~/Documentos/code/devflow`. Ao concluir cada PR, atualizar `_results/scorecard.md` do sandbox (status do loop capturar→fix) e o CHANGELOG do devflow.

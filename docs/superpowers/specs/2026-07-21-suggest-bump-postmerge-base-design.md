# Design — `suggest-bump` resolve a base pelo último release

**Data:** 2026-07-21 · **Workflow PREVC:** `suggest-bump-postmerge-base` · **Escala:** SMALL (P→E→V)
**Origem:** [backlog do gap](../2026-07-21-suggest-bump-postmerge-gap.md) · **Tipo:** correção de defeito no plugin (genérico, afeta clientes)

---

## Problema

No fluxo canônico da `devflow:prevc-confirmation`, o **Step 8.1** (signpost de release pendente) roda **depois** do **Step 4** (Finalize Branch), que termina com `gh pr merge … && git checkout main && git pull`. Nesse ponto `HEAD == origin/main`.

O helper `scripts/lib/finalize/suggest-bump.mjs` usa `const base = argv[0] || "origin/main"` e analisa `origin/main..HEAD` — que pós-merge é **sempre vazio**. Sem commits para classificar, cai no fallback e responde **`patch`**, qualquer que seja a entrega.

Verificado na sessão do N0 do import-reversa:

```
range origin/main..HEAD (pós-Step-4) → patch      ← o que o signpost emitia
range v1.30.0..HEAD (correto)        → minor      ← o que a entrega era (commit feat)
```

O release correto foi **1.31.0** (minor), não 1.30.1.

**Por que importa:** o bump é sugestão que o operador confirma, então nada é publicado errado sozinho — mas o helper existe *exatamente* para acertar essa sugestão. Responder sempre `patch` o torna inútil e induz bump subestimado. Agrava sob `autonomy: autonomous`, onde a confirmação humana é mais fraca.

## Achado adicional (evidência, não memória)

A correção óbvia — trocar o default para `git describe --tags --abbrev=0` — **ainda erra** em repositório com tags não-release, que é justamente o terreno do DevFlow como plugin (monorepos, repos de cliente; este próprio repo já carregou uma tag `cli-v3.2.0` vinda do port do impeccable).

Probe em repo descartável (`v1.0.0` → `feat:` → `cli-v3.2.0` → `feat:`):

| resolução | tag escolhida | range resultante |
|---|---|---|
| `git describe --tags --abbrev=0` | **`cli-v3.2.0`** ✗ | truncado — perde commits do release anterior |
| `git describe --tags --abbrev=0 --match 'v[0-9]*'` | `v1.0.0` ✓ | completo |
| repo sem tag alguma | `fatal: No names found` | exige fallback |

`git describe` é ancestralidade-first (última tag *alcançável a partir do HEAD*), que é a semântica certa — mas sem `--match` ele aceita qualquer tag no caminho.

## Decisões

### D1 — Resolução da base: cascata com `--match`

```
1. git describe --tags --abbrev=0 --match 'v[0-9]*'   → source: "tag"
2. git describe --tags --abbrev=0 --match '[0-9]*'    → source: "tag"        (cliente sem prefixo v)
3. git describe --tags --abbrev=0                     → source: "tag-loose"  (convenção exótica)
4. "origin/main"                                      → source: "fallback"   (sem tag alguma)
```

Corrige o defeito e é robusto a tags não-release **sem introduzir configuração nova**.

**Rejeitado — `tagPattern` no `.devflow.yaml`:** YAGNI. Adicionaria campo público (contrato permanente), consumo obrigatório via `scripts/lib/devflow-config.mjs` (ADR-011) e testes de parser, para um caso sem demanda comprovada. A cascata cobre os padrões reais observados.

### D2 — O call site **não** duplica a resolução

O backlog propunha manter, como reforço, a passagem da base no Step 8.1:

```bash
node ".../suggest-bump.mjs" "$(git describe --tags --abbrev=0 2>/dev/null || echo origin/main)"
```

**Isso é regressão, não reforço.** A versão shell não tem `--match` nem cascata, e por ser `argv[0]` ela **vence** a resolução do helper — anulando exatamente a robustez de D1. Duas resoluções de base que podem divergir é o antipadrão que o ADR-011 nomeia para config ("nunca permitir que dois parsers divirjam"); vale igual para resolução de ref.

O comando do Step 8.1 fica **inalterado** (sem argumento).

### D3 — Procedência no `stderr`, contrato do `stdout` intacto

O que a proposta (a) queria de verdade era **visibilidade**: hoje o operador vê `minor` e não tem como auditar de onde veio.

- `stdout` — permanece exatamente `patch|minor|major`. A substituição `$(node …)` do call site não quebra.
- `stderr` — ganha uma linha de procedência:

```
suggest-bump: base=v1.31.0 (source=tag, 2 commits)
suggest-bump: base=origin/main (source=fallback, range indisponível → patch)
```

Efeito colateral desejado: quando a base resolve mas o range é vazio (`0 commits`), o próprio stderr denuncia — que é o sintoma do bug original, agora visível em vez de silencioso.

## Arquitetura

`suggest-bump.mjs` ganha **uma** responsabilidade nova. Nada mais muda.

```js
export function resolveBase(cwd)      // NOVO → { base, source }
export function suggestBump(messages) // INALTERADA — pura, 8 testes seguem verdes
function main(argv)                   // argv[0] continua override explícito; só o DEFAULT muda
```

**Invariantes:**

- Git sempre por `execFileSync` com argv (nunca `shell: true`) — o glob `v[0-9]*` é interpretado pelo próprio git, não pelo shell. Satisfaz o guard `tests/lib/finalize/finalize-pure.test.mjs`, que proíbe `eval`, `new Function`, `shell:true`, `execSync`, `fetch` e `import()` dinâmico nos helpers de finalização.
- Zero dependências além de `node:child_process`.
- `resolveBase` nunca lança: toda tentativa é `try/catch`, e o último degrau é literal.
- A contagem de commits do stderr reusa `messages.length` — sem chamada extra ao git.

**Retrocompatibilidade:** chamadores que já passam base explícita não mudam de comportamento.

## Testes

O defeito vive na resolução de base — a parte **não coberta** hoje (os 8 testes existentes exercitam só a função pura). Sigo o padrão da casa estabelecido em `tests/lib/finalize/base-sync.test.mjs`: repositório git **real** em `mkdtempSync(tmpdir())`, env isolado (`GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM=/dev/null`, autor/committer fixos). Nunca muta diretório versionado.

| # | Fixture | Asserção | Papel |
|---|---|---|---|
| 1 | tag `v1.0.0` → commit `feat:` → **HEAD == origin/main** | `minor` | **o bug** — hoje retorna `patch` |
| 2 | `v1.0.0` → `feat:` → tag `cli-v3.2.0` → `fix:` | `minor` | regressão da cascata `--match` |
| 3 | repo sem tag alguma | `patch` + `source: "fallback"` | não lança |
| 4 | tag `1.0.0` (sem prefixo `v`) | resolve pelo tier 2 | cliente não-`v` |
| 5 | base explícita em `argv[0]` | vence a resolução automática | retrocompat |

O teste 1 reproduz o estado pós-merge de verdade: cria um remote local, empurra a main e confirma `origin/main == HEAD` antes de assertar — é a condição exata que hoje produz o falso `patch`.

**`requiredSignals`: `[unit, lint]`** — helper puro mais o guard `finalize-pure`. Não toca auth, pagamentos, fluxo de usuário nem CLI/hook, então `e2e` não se aplica (regra da `prevc-validation`); `lint` é sempre declarado (D6 do ADR-013).

## Escopo

| Arquivo | Mudança |
|---|---|
| `scripts/lib/finalize/suggest-bump.mjs` | `resolveBase()` + default novo + linha de stderr |
| `tests/lib/finalize/suggest-bump.test.mjs` | +5 testes com fixture git real |
| `skills/prevc-confirmation/SKILL.md` (Step 8.1) | comando inalterado; bloco emitido ganha a linha de procedência |
| `CHANGELOG.md` | entrada em `[Unreleased]` |

**Fora de escopo:** `tagPattern` configurável (D1); ramo `glab` do signpost (lacuna própria, já rastreada); auto-dispatch do release (decisão humana por design — o Step 8.1 sinaliza, nunca dispara).

## Guardrails de ADR aplicáveis

- **ADR-011** — nenhum campo novo de `.devflow.yaml` é lido; se um dia `tagPattern` existir, obrigatoriamente via `scripts/lib/devflow-config.mjs`.
- **ADR-013** — plano declara `requiredSignals`; a fase V observa o ledger do `verify-gate`, não afirma.
- **ADR-009** — a semântica do `git describe` usada aqui foi verificada empiricamente em repo descartável, não recuperada de memória.

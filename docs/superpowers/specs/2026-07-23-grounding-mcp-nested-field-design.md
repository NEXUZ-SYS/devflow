# Design — `readBlockField`: o doctor para de re-parsear config aninhada

**Data:** 2026-07-23 · **Workflow PREVC:** `grounding-mcp-nested-field` · **Escala:** SMALL (P→E→V)
**Tipo:** correção de bug vivo + fechamento de lacuna de API (genérico, afeta clientes)

---

## O bug

`/devflow:devflow-doctor` reporta **falso-positivo**:

```
⚠ [WARN] Doc-grounding: MCP de docs canônico configurado
    grounding ativo (mode: docs-only        # docs-first | docs-only) mas o
    docsMcpServer 'docs-mcp-server  # server canônico de documentação' não está
    no .mcp.json — o modo fica fail-closed para TODO fato de stack.
```

O `docs-mcp-server` **está** no `.mcp.json` (verificado: `dotcontext, mempalace, docs-mcp-server, odoo`). O check compara a string com o **comentário inline junto** — repare que a própria mensagem de erro exibe `'docs-mcp-server  # server canônico de documentação'`.

Causa direta, em `scripts/lib/doctor.mjs:215`:

```js
const s = stripped.match(/^docsMcpServer:\s*(.+)$/);
if (s) server = s[1].trim().replace(/['"]/g, "");   // ← .+ engole o comentário
```

Mesma família do bug do `permissions.yaml` (comentário inline → *fail-closed* indevido), que já custou um deny repo-wide.

**Impacto:** um WARN permanente e enganoso. O doctor existe para dizer a verdade sobre a saúde do contexto; um falso-positivo fixo treina o operador a ignorá-lo — e é o tipo de ruído que faz um alerta real passar despercebido.

## A causa raiz

O parser ad-hoc existe porque a lib **não oferecia alternativa**. `readField` é hard-coded ao bloco `git:`:

```js
export function readField(src, name) {
  const f = findScalar(gitBlock(src), name);   // ← só git:
  return f ? f.raw : null;
}
```

`node scripts/lib/devflow-config.mjs read-field docsMcpServer …` retorna **vazio**. Quem precisa de campo sob `grounding:`, `instincts:` ou `orchestrator:` não tem caminho — e escreve o próprio parser.

Consumidores hoje sem o parser único:

| arquivo | bloco | estado |
|---|---|---|
| `doctor.mjs` (`grounding-mcp`) | `grounding:` | **bug vivo** |
| `instinct-config.mjs` | `instincts:` | funciona |
| `orchestrator-config.mjs` | `orchestrator:` | funciona |
| `standard-audit.mjs` | — | funciona |

O ADR-011 diz *"NUNCA re-parsear com grep/awk/regex ad-hoc"*. A violação aqui não é indisciplina: é **lacuna de API**. Enquanto a lib só souber ler `git:`, o guardrail é inaplicável para o resto do arquivo.

## O achado que encolhe a correção

A lib **já resolve** o problema que o doctor reintroduziu:

```js
function stripInlineComment(v) { return String(v).replace(/\s+#.*$/, "").trim(); }

function findScalar(block, field) {
  …
  if (m) return { indent: m[1].length, raw: stripInlineComment(m[2]), idx: i };
}                                            // ↑ comentário já removido
```

E `gitBlock` é genérico **exceto por uma linha**:

```js
if (/^git:\s*$/.test(line)) inGit = true;   // ← o único acoplamento
```

Portanto não há parser novo a escrever. Basta parametrizar o nome do bloco e expor.

## Decisões

### D1 — `namedBlock(text, name)` substitui `gitBlock(text)`

Generalizar a função existente e reescrever `gitBlock` como uma chamada com `"git"`. Os 3 call-sites internos (`readAutoFinish`, `readField`, `readVersioning`) seguem funcionando sem alteração — retrocompatibilidade por construção.

O nome do bloco é escapado para regex, como `findScalar` já faz com o campo.

### D2 — `readBlockField(src, block, field)` exportada + CLI

```js
export function readBlockField(src, block, field)   // → string | null
```

Reusa `namedBlock` + `findScalar`, herdando de graça: remoção de comentário inline, ancoragem por `:` (não substring — `autoFinishMode:` não casa com `autoFinish`), e o `try/catch` que devolve `null`.

CLI: `read-block-field <bloco> <campo> <path>`, no mesmo formato dos comandos existentes.

**`readField` permanece intacta** — é o atalho para `git:`, usada em vários lugares. Nada de deprecar nesta entrega.

### D3 — Migrar **só** o `grounding-mcp`

O `parseGrounding` ad-hoc do doctor sai; entra `readBlockField(src, "grounding", …)` para `mode` e `docsMcpServer`.

Os outros 3 consumidores **não** são tocados. Eles funcionam hoje, não têm defeito conhecido, e mexer neles seria refactor sem ganho imediato — com risco de regressão. Ficam para depois, agora com a API disponível.

## Testes

`requiredSignals: [unit, lint]` — lib pura + um check do doctor; nada toca auth, pagamentos ou fluxo de usuário.

| # | Alvo | Asserção |
|---|---|---|
| 1 | `readBlockField` | **o bug**: `docsMcpServer: docs-mcp-server  # comentário` → `"docs-mcp-server"` |
| 2 | `readBlockField` | campo sob `grounding:` é lido (hoje `readField` devolve `null`) |
| 3 | `readBlockField` | bloco inexistente → `null` |
| 4 | `readBlockField` | campo inexistente no bloco → `null` |
| 5 | `readBlockField` | não vaza entre blocos: `strategy:` (de `git:`) não é encontrado sob `grounding:` |
| 6 | `readField` | não-regressão: campos de `git:` seguem lidos |
| 7 | check `grounding-mcp` | **o falso-positivo**: config com comentário inline + server presente no `.mcp.json` → `OK` |
| 8 | check `grounding-mcp` | server realmente ausente → `WARN` (o alerta legítimo não é perdido) |

O teste 8 importa tanto quanto o 7: corrigir um falso-positivo não pode virar falso-**negativo**.

Fixtures em `mkdtempSync(tmpdir())`.

## Escopo

**Dentro:** `namedBlock` + `readBlockField` + CLI na lib; migração do `grounding-mcp`; testes; CHANGELOG.

**Fora:** migrar `instinct-config`, `orchestrator-config`, `standard-audit` (funcionam; a API fica pronta); deprecar `readField`; suporte a aninhamento de mais de um nível (`a.b.c` — YAGNI, nenhum consumidor precisa); trocar o parser subset por uma dependência YAML real (decisão do ADR-011, fora desta correção).

## Guardrails de ADR

| ADR | Aplicação |
|---|---|
| 011 | É *o* ADR em questão. A entrega remove uma violação e, mais importante, remove o **motivo** dela — a lacuna de API que empurrava consumidores para o parse ad-hoc. |
| 013 | `requiredSignals` declarados; a fase V observa o ledger do `verify-gate`. |
| 009 | O comportamento de `findScalar`/`stripInlineComment`/`gitBlock` foi lido no código, não recuperado de memória. |

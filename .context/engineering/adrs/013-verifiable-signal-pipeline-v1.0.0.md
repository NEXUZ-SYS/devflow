---
type: adr
name: verifiable-signal-pipeline
description: A fase V do PREVC observa um sinal binário externo produzido por código (contrato verify: + executor + ledger + CI árbitro), em vez de afirmar que os testes passam.
scope: organizational
source: local
stack: universal
category: arquitetura
status: Proposto
version: 1.0.0
created: 2026-07-14
supersedes: []
refines: [011-devflow-config-single-parser-v1.0.0]
protocol_contract: null
decision_kind: firm
summary: "O estágio Test (fase V) deixa de afirmar e passa a observar: um contrato verify: (argv arrays no .devflow.yaml, lido pelo parser único) é executado por verify-run.mjs, que grava um ledger; o gate de V lê o ledger; um CI re-roda os mesmos sinais como árbitro independente. Gerador ≠ verificador via CI required check; guards impedem enfraquecer testes ou neutralizar o contrato."
---

# ADR — Pipeline de sinal verificável (a fase V observa, não afirma)

- **Data:** 2026-07-14
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal (Node `node:test` + runners bash + GitHub Actions)
- **Categoria:** Arquitetura
- **Refina:** ADR-011 (parser único de `.devflow.yaml`)

---

## Contexto

Os cinco estágios do PREVC (P=Plan, E=Code, R=Review, V=Test, C=Deploy) existem como instruções em Markdown dirigidas ao agente — controles **D7a** (auto-contornáveis, na terminologia da ADR-012), não **D7b** (mecânicos). Consequência na fase V: quando o agente afirma "testes passam", isso é **asserção do agente, não observação de sinal externo** — o que a literatura de agentes chama de *reward hacking*. Havia três sintomas: (1) nenhum CI rodava a suíte; (2) não existia comando canônico de suíte (a invocação era folclore e não-reprodutível — mesmo comando dava 42 vs 5 falhas conforme a árvore); (3) o sensor determinístico `tests-passing` estava morto (esperava `npm test`/jest; o repo usa `node --test`).

## Decisão

Introduzir um **pipeline de sinal verificável** com três peças de responsabilidade única:

1. **Contrato** — `verify:` no `.context/.devflow.yaml`, lido pelo **parser único** (`devflow-config.mjs`, ADR-011, que delega o parse a `frontmatter.mjs`). Cada sinal (`unit|integration|e2e|lint`) é um **array argv**; `onTaskComplete` diz o que roda no loop rápido.
2. **Executor** — `scripts/lib/verify-run.mjs` valida o contrato, roda o sinal com `execFile` (sem `sh -c`) e faz append num **ledger** JSONL (`.context/runtime/verify-ledger.jsonl`) com um `treeDigest` (HEAD + status, excluindo estado efêmero de workflow). Nunca decide o gate.
3. **Gate** — `verify-gate.mjs` (invocado pela skill `prevc-validation`) **só lê** o ledger: exige, por `requiredSignal`, uma entrada `exit 0` cujo `treeDigest` bate com a árvore atual.

Um **CI árbitro** (`.github/workflows/test.yml`) re-roda os mesmos sinais, pelo mesmo executor, lendo o mesmo `.devflow.yaml`. A independência gerador ≠ verificador vive no CI **required check**, não no gate local (que é auxiliar e forjável). Dois **guards** no sinal `lint` fecham o reward-hacking: `test-weakening-guard.mjs` (não enfraquecer testes existentes) e `verify-contract-guard-cli.mjs` (não neutralizar `verify:` vs merge-base).

## Alternativas Consideradas

- **Detecção heurística dos sinais** (inferir dos paths tocados) — rejeitada: heurística é exatamente a suposição que matou o `tests-passing`; o contrato é **declarado**, não inferido (D2).
- **String de comando** em vez de argv array — rejeitada: string convida injeção por concatenação e o `&&` acidental; argv array com allowlist e proibição de código inline é auditável (D3). Não promete anti-RCE (rodar testes de um repo é executar código do repo) — a defesa real é *quando* roda (nunca em session-start), não *o quê*.
- **Só CI, sem ledger local** ou **só ledger, sem CI** — rejeitadas: o ledger dá loop local rápido; o CI dá arbitragem independente. Ledger gitignored → o CI não confia nele e re-roda (D8).
- **Gate local como garantia de independência** — rejeitada (revisão de segurança): o mesmo agente roda e lê, e o ledger é forjável; a garantia é o CI **required**.
- **Contrato declarado (argv) + executor + ledger + CI árbitro + guards** ✓ — adotada: sinal binário externo, gerador ≠ verificador via CI, critério de parada e não-editar-o-juiz via guards; auditável e testável.

## Consequências

**Positivas**
- A fase V passa de asserção a observação — o gate fica honesto independentemente do modelo.
- Comando canônico e reprodutível de suíte (`verify-run.mjs`, runners via `git ls-files`).
- Base de sinal para deploy verificado e execução paralela (AO) — próximos planos.

**Negativas**
- Warn-only na transição (D9): projetos sem `verify:` continuam auto-reportando até uma major.
- O loop rápido no hook fica fora do v1 (o `PostToolUse` async descarta o `additionalContext`); o executor é rodado explicitamente na fase E/V.

**Riscos aceitos**
- Contagem de asserts por regex é aproximada (speed-bump, não muro) — o trailer `Weakens-Tests:` cobre o falso positivo.
- Repointar um sinal para alvo trivial ainda válido escapa dos guards mecânicos — resíduo humano (inspeção do diff de `verify.*` na fase R).
- O gate local é forjável — mitigado pelo CI required check (D7b).

## Guardrails

- SEMPRE ler `verify:` via `scripts/lib/devflow-config.mjs` (`readVerify`) — nunca re-parsear ad-hoc.
- SEMPRE declarar comandos como **array argv**; `argv[0]` ∈ `{node, npm, pnpm, python, python3, pytest, make, bash, sh}`.
- NUNCA permitir código inline no argv (`-c`/`-e`/`--eval`/`-p`/`--print`/`-pe`/`-lc`/…) em qualquer posição.
- NUNCA a fase V afirmar "testes passam" sem observar o ledger (`verify-gate.mjs`).
- NUNCA rodar sinais em `session-start`; só após o operador invocar um comando DevFlow.
- QUANDO houver `verify:` presente mas inválido/inseguro, ENTÃO fail-closed (BLOCK), nunca warn-only silencioso.
- SEMPRE rodar os guards (`test-weakening-guard`, `verify-contract-guard`) no sinal `lint`, fail-closed no CI quando o merge-base não resolve.
- A independência gerador ≠ verificador é o **CI required check** (D7b); o gate local é auxiliar (D7a).

## Enforcement

- [x] Teste: unit de `readVerify` (argv arrays, allowlist, código inline em qualquer posição, vocabulário fechado, `onTaskComplete ⊆`, fail-closed em parse).
- [x] Teste: unit do ledger (ordem, cauda, REDs consecutivos, malformado tolerado).
- [x] Teste: unit do `treeDigest` (estável, muda com código, ignora `.context/workflow`).
- [x] Teste: e2e do executor (verde/vermelho propagado, sinal não declarado lança).
- [x] Teste: unit dos guards (deleção/skip/queda de asserts; remoção/inline de sinal; fail-closed em CI).
- [x] Teste: unit do gate de V (warn-only sem verify:, BLOCK em vazio/vencido/vermelho/inválido).
- [x] Teste: estrutural do CI (`test.yml`: matriz 4 sinais, fetch-depth 0, executor, contents:read).
- [ ] Config: `test.yml` como **required status check** na branch protegida (fase C — exige admin).

## Evidências / Anexos

**Fontes oficiais:** [Anthropic — Building Effective Agents (evaluator-optimizer)](https://www.anthropic.com/engineering/building-effective-agents) · [Reflexion (Shinn et al., 2023)](https://arxiv.org/abs/2303.11366) · [SWE-Gym (ICML 2025)](https://arxiv.org/abs/2412.21139)

Design: `docs/superpowers/specs/2026-07-09-verify-signal-pipeline-design.md` · Plano: `docs/superpowers/plans/2026-07-14-verify-signal-pipeline.md`

```yaml
# .context/.devflow.yaml — o contrato (dado, não código)
verify:
  unit:        ["bash", "tests/run-unit.sh"]
  integration: ["bash", "tests/run-integration.sh"]
  e2e:         ["bash", "tests/run-e2e.sh"]
  lint:        ["bash", "tests/run-lint.sh"]
  onTaskComplete: [unit]
```

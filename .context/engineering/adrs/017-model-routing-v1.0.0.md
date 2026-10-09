---
type: adr
name: model-routing
description: Roteamento de modelos do DevFlow — lib única com tier abstrato, sessão por fase e subagentes por agente/fase/task, teto na escolha do usuário, três adaptadores.
scope: organizational
source: local
stack: universal
category: arquitetura
status: Proposto
version: 1.0.0
created: 2026-10-09
supersedes: []
refines: []
protocol_contract: null
decision_kind: gated
summary: "Uma lib pura resolve um tier abstrato (cheap/standard/capable/top) a partir do estado do PREVC; três adaptadores o traduzem (mod, PreToolUse clássico, omp); nada roda acima do modelo e do esforço do usuário; liga só com opt-in duplo."
---

# ADR — Roteamento de modelos do DevFlow

- **Data:** 2026-10-09
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal (Node, hooks bash, módulo de function hooks do Claude Code, omp)
- **Categoria:** Arquitetura

---

## Contexto

Todo subagente herda o modelo da sessão (nenhum agente declara `model:`); revisores e escritor de docs rodam no modelo mais caro. Os `general-purpose` do SDD são o maior consumidor. Objetivo: reduzir consumo da cota (Pro/Max) com economia **medida**, sem nunca subir acima do que o usuário escolheu. Testado no Claude Code 2.1.294; o omp não reescreve input de ferramenta.

## Decisão

Uma lib pura (`scripts/lib/model-routing.mjs`, sem `node:*`) resolve um **tier abstrato** a partir do estado do DevFlow (fase, skill, agente, task); cada runtime o traduz:

- **mod** (function hooks): sessão por fase (sticky, uma troca por workflow R→E), esforço por skill e por passo, subagentes em `agent.spawn`, `usage` no ledger;
- **clássico** (`PreToolUse` na ferramenta Agent): só subagentes, via `updatedInput`;
- **omp**: tier → model role, só subagentes.

Precedência no subagente: tier da task → skill → fase → agente → `inherit`. Teto = modelo/esforço do usuário. Liga com `models.enabled` no repo **e** `DEVFLOW_MODEL_ROUTING=1` do usuário. Escalada entre tentativas por rubrica; no meio da execução, desligada por padrão.

Fatos verificados (2.1.294): `hooks` e `modules` coexistem no `hooks.json`; o mod exige `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` (`1|true|yes|on`); `e.model`/`e.effort` e `parentModel` chegam com os valores do usuário; `turn.step` só aceita ID completo; `updatedInput` funciona sem `permissionDecision`; trocar só o esforço não invalida o cache (R-10).

## Alternativas Consideradas

- **`model:` fixo no frontmatter dos agentes** — simples, mas liga por clone e sem teto nem escalada.
- **Jev / roteador externo por turno** — chave, conta e dados a terceiro por ganho marginal; volta como `decider`.
- **Só subagentes, sem mod** — menos superfície, mas perde sessão por fase e `usage` confirmado.
- **Lib única + tier abstrato + três adaptadores** ✓ — uma regra, tradução por runtime, teto estrutural.

## Consequências

**Positivas**
- Economia medível (ledger + `model-route report`), sem classificador externo.
- Mesma decisão nos três runtimes; teto do usuário garantido onde legível.

**Negativas**
- Troca de modelo da sessão custa cache frio; default limita a uma por workflow.
- Sem mod: sem sessão por fase, esforço por passo nem escalada no meio.
- Peso de cada modelo na cota não é público: relatório em tokens, não em % da cota.

**Riscos aceitos**
- **Aberto:** Claude Code antigo com schema estrito pode recusar o `hooks.json` inteiro por causa da chave `"modules"`, e todos os hooks do DevFlow somem. Mitigações em avaliação: plugin irmão para o mod, ou versão mínima obrigatória. Decisão do operador pendente.
- Garantia de teto só vale quando o adaptador lê o teto; ilegível → não roteia.
- Gate: o relatório de 2 semanas deve confirmar economia sem regressão de escaladas.

## Guardrails

- SEMPRE resolver a rota na lib pura (sem `node:*`) e traduzir tier por adaptador; NUNCA ID fixo de modelo na tabela.
- NUNCA rotear acima do modelo/esforço do usuário; teto ilegível → não rotear.
- SEMPRE exigir opt-in duplo: `models.enabled` do repo **e** `DEVFLOW_MODEL_ROUTING=1`; o repositório sozinho nunca liga.
- SEMPRE alias na ferramenta Agent/`agent.spawn` e ID completo no `turn.step`; sem ID conhecido, só esforço.
- SEMPRE ler arquivos do repositório com leitura segura (sem link, sem bloqueio, arquivo regular, tamanho limitado; no mod, `$.fs.stat` com `realPath` sob a raiz).
- NUNCA negar despacho nem emitir `permissionDecision` no fallback clássico.
- QUANDO o mod precisar do bloco `models:`, ENTÃO importar `models-config.mjs` direto (puro); o parser segue único (ADR-011).
- SEMPRE manter a escalada no meio desligada por padrão e limitada a uma consulta por subagente.

## Enforcement

- [ ] Teste: unit da lib (sessão, subagente, teto, `maxTier`, tier→alias/role) e propriedade "libs sem import de `node:*`".
- [ ] Teste: integration do hook clássico (sem `permissionDecision`, teto do transcript, FIFO e `/dev/zero`, C0) e do mod.
- [ ] Teste: ledger com chaves ⊆ allowlist; e2e do CLI `resolve|escalate|report` em tmpdir.
- [ ] Doctor: check `model-routing` (repo pede roteamento sem confirmação; versão abaixo de 2.1.294).
- [ ] Gate PREVC: lint (`bash tests/run-lint.sh`) e revisão de segurança dos adaptadores.

## Evidências / Anexos

**Fontes oficiais:** [Claude Code hooks](https://code.claude.com/docs/en/hooks) · [Claude Code subagents](https://code.claude.com/docs/en/sub-agents) · [Claude Code model config](https://code.claude.com/docs/en/model-config)

```text
tier (lib) --+-- mod:     agent.spawn / turn.step  (alias | ID completo)
             +-- clássico: PreToolUse(Agent) -> updatedInput.model (alias)
             +-- omp:     tier -> model role
teto = modelo/esforço do usuário (nunca excedido)
```

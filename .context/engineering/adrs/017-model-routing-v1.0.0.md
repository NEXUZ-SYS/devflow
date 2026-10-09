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

Sondas (Claude Code 2.1.294, `claude -p` com plugin descartável):

- R-1: `hooks` clássicos e `modules` no mesmo `hooks.json` — aceito pelo `claude plugin validate`; os dois rodam na mesma sessão.
- R-2: na fase R, o mod só carregava com `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` (`1|true|yes|on`). **Fase V (F1): não vale mais.** Os Claude Code 2.1.293, 2.1.294 e 2.1.295 carregam o mod sem a variável, até com valor `0` (provável mudança de flag no servidor). O hook clássico consulta a variável só para a exclusão mútua.
- R-3: o `model` do `turn.step` da sessão só é reescrito com ID completo (alias falha); `e.model`/`e.effort` e `parentModel` chegam sempre com os valores do usuário.
- R-4: `skill.prompt` dispara para skill de plugin, com nome qualificado.
- R-5: `updatedInput` funciona sem `permissionDecision` (ferramenta `Agent`).
- R-6: `$.fs.write` fora do plugin e `$.model.complete` com alias funcionam; `$.fs.stat` expõe `isLink`, `kind`, `size`, `realPath`; não há append.
- R-7: não existe `$.plugin.list`; outro roteador de sessão é detectado por `$.settings.read().enabledPlugins`.
- R-8: versão mínima = 2.1.294 (a testada); abaixo, o `doctor` avisa.
- R-10: trocar só o esforço não invalida o cache.
- Restrição do `claude plugin validate`: a função que recebe `$` fica no topo do módulo; hooks que decidem pedem `.catch`.

## Alternativas Consideradas

- **`model:` fixo no frontmatter dos agentes** — simples, mas liga por clone e sem teto nem escalada.
- **Jev / roteador externo por turno** — chave, conta e dados a terceiro por ganho marginal; volta como `decider`.
- **Só subagentes, sem mod** — menos superfície, mas perde sessão por fase e `usage` confirmado.
- **Lib única + tier abstrato + três adaptadores** ✓ — uma regra, tradução por runtime, teto estrutural.

## Consequências

**Positivas**
- Economia medível (ledger + `model-route report`, que traz o comparativo antes × depois usado pelo gate de 2 semanas), sem classificador externo.
- Mesma decisão nos três runtimes; teto do usuário garantido onde legível.

**Negativas**
- Troca de modelo da sessão custa cache frio; default limita a uma por workflow.
- Sem mod: sem sessão por fase, esforço por passo nem escalada no meio.
- Peso de cada modelo na cota não é público: relatório em tokens, não em % da cota.

**Riscos aceitos**
- Claude Code antigo com schema estrito pode recusar o `hooks.json` inteiro por causa da chave `"modules"`, e todos os hooks do DevFlow somem. Medido na fase V: 2.1.293, 2.1.294 e 2.1.295 leem o `hooks.json` inteiro e carregam hooks clássicos e mod; versões anteriores não estavam disponíveis para medir, e o operador aceitou o risco para elas em 2026-10-10.
- Convergência mod + clássico (verificada na fase V): sem a variável, os dois podem decidir o mesmo despacho; o clássico só emite rebaixamento abaixo do modelo atual da sessão e o mod nunca passa do original, então não há furo de teto nem degradação.
- Limitação conhecida do clássico: no `PreToolUse` do primeiro despacho da sessão o transcript ainda não tem mensagem do assistente, o teto fica ilegível e ele não roteia (D5). Roteia do 2º turno em diante. O mod roteia desde o primeiro despacho. Alternativas descartadas por ora: plugin irmão para o mod, versão mínima obrigatória.
- Risco residual do teto no hook clássico: um `model` explícito vindo da CLI passa sem teto quando o hook não consegue ler o transcript. É raro; no Claude Code a CLI resolve contra o teto `top`.
- Garantia de teto só vale quando o adaptador lê o teto; ilegível → não roteia.
- Gate: o relatório de 2 semanas deve confirmar economia sem regressão de escaladas.

## Guardrails

- SEMPRE resolver a rota na lib pura (sem `node:*`) e traduzir tier por adaptador; NUNCA ID fixo de modelo na tabela.
- NUNCA rotear acima do modelo/esforço do usuário; teto ilegível → não rotear.
- QUANDO a CLI roda com `--runtime omp`, ENTÃO limitar a saída ao teto do agente (decisão do operador de 2026-10-10), lido nesta ordem: `agent_role_defaults` de `omp/omp-roles.yaml`, depois o `model:` de `.context/agents/<nome>.md`, depois `activities.execution`; teto ilegível → não rotear.
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

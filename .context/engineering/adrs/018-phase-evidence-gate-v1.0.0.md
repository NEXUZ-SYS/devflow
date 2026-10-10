---
type: adr
name: phase-evidence-gate
description: Gate de evidência por fase do PREVC — hook PreToolUse dedicado nega o avanço de fase (workflow-advance e a CLI do dotcontext) sem a evidência mínima da fase atual, em qualquer autonomia.
scope: organizational
source: local
stack: universal
category: arquitetura
status: Proposto
version: 1.0.0
created: 2026-10-10
supersedes: []
refines: []
protocol_contract: null
decision_kind: gated
summary: "Um hook PreToolUse dedicado nega workflow-advance (MCP, force incluso) e a CLI do dotcontext no Bash quando falta a evidência da fase atual (matriz P/R/E/V/C decidida numa lib pura); prevc.evidenceGate block|warn|off, com DEVFLOW_EVIDENCE_GATE por cima. Anti-teatro, não anti-adversário."
---

# ADR — Gate de evidência por fase do PREVC

- **Data:** 2026-10-10
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal (Node, hook bash, `git`; vale em projeto-cliente Node, Python ou Odoo)
- **Categoria:** Arquitetura

---

## Contexto

Na campanha do laboratório de roteamento (2026-10-09), o braço C rodou o PREVC de forma nominal: o agente avançou P, R, E e V em segundos, sem commit além do seed, sem spec ou plano versionados e sem subagente. A causa é estrutural: `workflow-init({ autonomous: true })` do dotcontext (pacote externo) desliga todos os gates do harness, e nada do DevFlow exigia artefato real por fase. Os gates do próprio dotcontext, quando ligados, são fracos (P→R só exige plano linkado; R→E exige aprovação humana, o que travaria o modo autônomo). As skills do PREVC descrevem a evidência, mas são instrução ao agente — o braço C as ignorou.

## Decisão

Um **hook `PreToolUse` dedicado** (`hooks/pre-tool-use-phase-gate`, matcher `mcp__dotcontext__workflow-advance|Bash`) nega o avanço de fase quando falta a evidência da **fase atual** do `prevc.json`. Vale em qualquer autonomia (em supervised o humano aprova a transição, mas a evidência também precisa existir).

- **O que conta como avanço:** `mcp__dotcontext__workflow-advance`, com ou sem `force: true` (o `force` é o bypass que o gate fecha), e o Bash que invoca a CLI do dotcontext como comando (`dotcontext workflow advance`, `npx [-y] @dotcontext/cli[@versão] workflow advance`), sem contar texto entre aspas. Qualquer outro evento: o hook sai calado.
- **Três peças:** `scripts/lib/phase-evidence.mjs` (puro; `evaluateTransition(fatos)` decide), `scripts/lib/phase-gate.mjs` com a CLI (coletor: só junta fatos — leitura contida, `git`, `verify-gate`) e o hook fino em bash.
- **Matriz de evidência** (para sair da fase; a próxima é a seguinte ativa da escala — MEDIUM pula C, SMALL pula R e C, QUICK pula P, R e C):

| Fase | Evidência exigida |
|---|---|
| P | Plano linkado ao workflow e arquivo do plano com corpo além do frontmatter |
| R | Bloco `review:` no frontmatter do plano com `verdict: PROCEED` (`REVISE`, `BLOCK` ou frontmatter ilegível negam) |
| E | ≥ 1 commit posterior ao início de E, branch fora de `git.protectedBranches` e nenhuma story pendente ou em andamento do workflow (a checagem de branch protegida só vale com `git.branchProtection` diferente de false e `git.strategy` diferente de trunk-based) |
| V | Veredito `pass` do `verify-gate.mjs` com os `requiredSignals` do plano (ADR-013) |
| C | Branch contida numa base, ou publicada em `refs/remotes/*`, ou (fallback de squash) commit novo numa base desde o início de E; sem `gh`/`glab` |

- **Configuração:** `prevc.evidenceGate: block | warn | off` no `.devflow.yaml`, lido pelo parser único (ADR-011); padrão `block`. `warn` passa com `additionalContext` listando o que falta; valor inválido vira `block`. `DEVFLOW_EVIDENCE_GATE` no ambiente do Claude Code prevalece sobre o arquivo — escape humano que o agente não alcança. O `config-guard` trata o rebaixamento (`block→warn→off`) como enfraquecimento.
- **Mensagem útil:** cada item que falta traz `howTo` (ex.: rode a `prevc-review` e grave `review.verdict` no plano).

## Alternativas Consideradas

- **Só instrução nas skills** — rejeitada: o braço C as ignorou; instrução é controle auto-contornável, não mecânico.
- **Gate só em `autonomous`** — rejeitada: a evidência faltante é a mesma em supervised; o hook único é mais simples e cobre os dois.
- **`autonomous: false` no dotcontext** — rejeitada: os gates dele são fracos e a aprovação humana travaria o modo autônomo.
- **Estender o `pre-tool-use-ratchet`** — rejeitada: a catraca nunca nega por desenho (ADR-015); misturar os dois muda o contrato dela.
- **Exigir PR via `gh`/`glab`, subagente na R ou duração mínima** — rejeitadas: quebra sem remoto ou em GitLab; duração e subagente são frágeis e fáceis de forjar.
- **Hook dedicado + lib pura + evidência observável por fase** ✓ — nega o avanço sem a evidência, sem depender de forge, em qualquer autonomia.

## Consequências

**Positivas**
- O caminho de menor esforço para avançar passa a ser fazer o trabalho: plano, revisão registrada, commits em branch de feature, sinais da V e entrega observável.
- A decisão fica numa função pura, testável por linha da matriz, e vale igual em projeto-cliente (só `git` e `node`).
- `warn` e `off` permitem adoção gradual sem travar projetos existentes.

**Negativas**
- Avanço legítimo mas sem o artefato (ex.: revisão feita sem gravar `review:`) é negado até gravar; o `howTo` reduz o atrito.
- Mais um hook síncrono no caminho do `Bash`; o caminho rápido sem marcador de avanço usa só builtins.

**Riscos aceitos**
- Detecção do avanço no Bash é heurística, como a da catraca.
- Erro de ambiente do coletor passa com aviso: o gate não pode travar o projeto por falha que não é do trabalho.

**Limites declarados** — o gate é **anti-teatro, não anti-adversário**. Fora do alcance:
- edição direta do `prevc.json` (Write/Bash) e um `review:` falso;
- `sh -c "…"`, variável, alias ou script intermediário na CLI do dotcontext;
- `git update-ref` forjando a branch publicada;
- parar antes da C — hook intercepta chamadas, não ausência delas (fica para o `INV-PREVC` do laboratório);
- na escala MEDIUM a C é pulada pelo dotcontext: a entrega não é conferida (só a V);
- o fallback do squash aceita qualquer commit na base desde o início de E;
- sem `prevc.json` (ou ilegível) ou com a fase já concluída, o gate sai calado: só vale dentro de um workflow existente.

## Guardrails

- SEMPRE decidir a evidência na lib pura `scripts/lib/phase-evidence.mjs`; o coletor só junta fatos.
- NUNCA emitir `allow` do hook; a saída é `deny`, aviso em `additionalContext` ou nada.
- NUNCA negar por erro de ambiente do coletor (binário do `git` ausente, exceção interna): avisar em `additionalContext` e deixar passar.
- QUANDO `prevc.evidenceGate` tiver valor inválido, ENTÃO tratar como `block`.
- SEMPRE criar subprocesso por `execFile` com argv; NUNCA por shell.
- NUNCA depender de `gh`/`glab` para provar a entrega da fase C.
- SEMPRE ler arquivo do repositório no gate por `readInRoot` (contenção da ADR-014) e derivar o caminho do plano do slug (`.context/plans/<slug>.md`), nunca do `path` do `plans.json`.
- SEMPRE rodar `git` com `-c core.fsmonitor=false -c log.showSignature=false` e `--no-show-signature`.
- QUANDO o dado do repositório faltar ou for ilegível (log vazio, frontmatter inválido), ENTÃO negar; só falha de ambiente vira aviso.
- QUANDO `DEVFLOW_EVIDENCE_GATE` existir no ambiente do Claude Code, ENTÃO ele prevalece sobre o `.devflow.yaml`.
- SEMPRE manter o hook do gate separado da catraca; a catraca nunca nega.

## Enforcement

- [ ] Teste: unit de `phase-evidence` — cada linha da matriz com e sem evidência, escalas QUICK/SMALL/MEDIUM/LARGE, `REVISE`/`BLOCK`, stories pendentes, fase final concluindo o workflow.
- [ ] Teste: integration de `phase-gate` em repositório git temporário (`mkdtemp`) — modos `block`/`warn`/`off`/inválido, `git` ausente passa com aviso, dado ilegível nega.
- [ ] Teste: e2e do hook pelo `run-hook.cmd` — `workflow-advance` negado e permitido, `force: true` negado, CLI no Bash negada, Bash comum calado, saída JSON de uma linha.
- [ ] Teste: propriedade "a lib `phase-evidence` não importa `node:*`".
- [ ] Config: `config-guard` trata o rebaixamento de `prevc.evidenceGate` como enfraquecimento.
- [ ] Gate PREVC: lint (`bash tests/run-lint.sh`) e revisão de segurança do coletor (contenção de caminho e `git` endurecido).

## Evidências / Anexos

**Fontes oficiais:** [Claude Code hooks (PreToolUse)](https://code.claude.com/docs/en/hooks) · [Claude Code settings](https://code.claude.com/docs/en/settings)

Design: `docs/superpowers/specs/2026-10-10-routing-phase-sync-and-evidence-gate-design.md` (§4 e §6, decisões D2–D5).

```text
PreToolUse(workflow-advance | Bash com CLI do dotcontext)
  -> phase-gate (coletor: prevc.json, plano, git, verify-gate)
  -> phase-evidence.evaluateTransition(fatos) -> { ok, missing[] }
  -> block: deny | warn: additionalContext | off: calado
```

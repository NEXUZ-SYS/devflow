# Fase sincronizada no roteamento (H1) e gate de evidência por fase (D5) — Design

> **DevFlow workflow:** `routing-phase-sync-and-autonomous-gates` | **Escala:** LARGE | **Autonomia:** supervised
> **Origem:** campanha do laboratório de roteamento (2026-10-09, braços A, B e C, DevFlow v3.7.0). Achados em
> `docs/superpowers/2026-10-09-model-routing-lab-findings.md` e no relatório da campanha do laboratório.

## 1. Problema

### H1 — a fase do mod fica presa no `turn.start`

O mod de roteamento (`hooks/router.mjs`) só lê `.context/runtime/workflows/prevc.json` no `turn.start`
(`onTurnStart` → `core.onTurnStart`). Em `claude -p` um único turno atravessa várias fases do PREVC, e os
`turn.start` intermediários só acontecem quando uma notificação de tarefa em background abre um turno extra —
de forma não determinística. Medido no braço B:

- `INV-PHASE-SYNC` MISS 12/12: todo despacho de subagente registrou `phase: R` (ou nulo); as fases reais
  eram R, E e V.
- `INV-SESS` MISS 45/102: a sessão ficou em opus/xhigh durante toda a fase E e parte da V, quando a tabela
  pede sonnet/medium a partir de E (26,7k de saída em opus que deveriam ser sonnet).

### D5 — em `autonomous`, o PREVC pode ser nominal

`workflow-init({ autonomous: true })` do dotcontext (pacote externo) desliga todos os gates do harness
("All gates bypassed"), e nada do DevFlow exige artefato real por fase. No braço C (teto sonnet/medium) o
agente avançou P/R/E/V em 31 s, 2 s, 2 min 27 s e 17 s, sem nenhum commit além do seed, sem spec ou plano
versionados e sem nenhum subagente. Os gates do próprio dotcontext, quando ligados, são fracos (P→R só exige
plano linkado; R→E exige aprovação humana, o que travaria o modo autônomo).

## 2. Objetivo e critérios de sucesso

- **H1:** a fase usada pelo roteamento (sessão e subagentes) acompanha a fase real do `prevc.json` dentro do
  mesmo turno. Critério: re-rodar o braço B com a versão corrigida dá `INV-PHASE-SYNC` e `INV-SESS` HELD.
- **D5:** o agente não consegue avançar de fase pelo `workflow-advance` (nem com `force: true`, nem pela CLI do
  dotcontext no Bash) sem a evidência mínima da fase atual. Critério: re-rodar o braço C não termina com
  PREVC em minutos, zero commits e zero artefatos; os testes do gate cobrem cada linha da matriz (§4.2).

Fora do objetivo: mudar a tabela de rotas (`routes.json`); impedir que o agente **pare** antes da C (um hook
intercepta chamadas, não ausência delas — isso fica para o `INV-PREVC` do laboratório); resistir a um agente
adversário (§4.6).

## 3. H1 — fase sincronizada no meio do turno

### 3.1 Mudança

Arquivos: `hooks/router.mjs` (adaptador) e `scripts/lib/router-core.mjs` (puro).

- **Core:** `onTurnStart(state, { phase })` é renomeado para `onPhaseChange(state, { phase })` com a mesma
  semântica (fase nova → grava a fase e zera a skill da sessão; fase igual → nada). `onTurnStart` continua
  exportado como alias, para não quebrar consumidores e testes existentes.
- **Adaptador:** nova `refreshPhase($)`:
  1. `$.fs.stat` do `prevc.json` com a contenção da ADR-014 (sem link, arquivo regular, ≤ 256 KiB, caminho
     real sob a raiz) — a mesma regra do `safeRead`, extraída para uma função comum.
  2. Se o par `(mtimeMs, size)` é igual ao da última leitura → nada.
  3. Senão, lê o arquivo, guarda o novo par, atualiza `S.workflow` e chama `core.onPhaseChange` (só com o
     roteamento ativo, como hoje).
  4. Qualquer falha (stat, leitura, parse) → mantém a fase atual e não guarda o par (tenta de novo no
     próximo passo). Nunca quebra o turno.
- **Pontos de chamada:**
  - `turn.start`: leitura incondicional, como hoje, e grava o par `(mtimeMs, size)`.
  - `turn.step` da sessão e dos subagentes: `refreshPhase` antes de decidir o patch.
  - `agent.spawn`: `refreshPhase` **antes** de `core.onSpawn` — os 12/12 MISS do braço B foram despachos.
- **Custo:** um `stat` por passo; leitura e parse só quando o arquivo muda.

### 3.2 Efeitos colaterais conhecidos

- A troca de fase no meio do turno pode trocar o modelo da sessão no passo seguinte. O custo de cache frio
  dessa troca já é o previsto na ADR-017 (uma troca por fase), e o `switched` do ledger continua marcando-a.
- O monitor ao vivo passa a ver o escopo do workflow (`S.workflow`) atualizado também no meio do turno.

### 3.3 Testes

- **Unit (core):** `onPhaseChange` troca a fase e zera a skill; mesma fase não zera; alias `onTurnStart`.
- **Mod (`hooks/router.test.ts`):** `prevc.json` falso que muda entre dois `turn.step` do mesmo turno → o
  segundo passo usa a fase nova (modelo/esforço da sessão conforme a tabela); mudança antes de um
  `agent.spawn` → a rota do subagente usa a fase nova e o ledger registra a fase nova; `mtimeMs` igual → não
  relê (contador de leituras do `$.fs` falso); stat que falha → mantém a fase.

## 4. D5 — gate de evidência por transição

### 4.1 Componentes

| Unidade | Papel | Depende de |
|---|---|---|
| `scripts/lib/phase-evidence.mjs` | **Puro.** `evaluateTransition(facts) → { ok, missing: [{ code, message, howTo }] }`. Implementa a matriz §4.2. | nada (só dados) |
| `scripts/phase-gate.mjs` | **CLI.** Lê o evento do hook (stdin JSON), decide se é um avanço, coleta os fatos (fs, `git` via `execFile`, `verify-gate`), lê a config, chama a lib e imprime a decisão. | lib acima, `devflow-config.mjs`, `verify-gate.mjs` |
| `hooks/pre-tool-use-phase-gate` | **Hook** fino em bash, matcher `mcp__dotcontext__workflow-advance\|Bash`. Caminho rápido só com builtins: evento sem marcador de avanço sai calado; com marcador, chama o CLI. | CLI acima |

Hook dedicado, separado do `pre-tool-use-ratchet`: a catraca nunca nega por desenho (ADR-015 P0) e este gate
nega.

### 4.2 Matriz de evidência

A transição é a da **fase atual** do `prevc.json` (`status.project.current_phase`) para a próxima fase ativa
da escala (QUICK/SMALL não têm R nem C). Na última fase da escala, o `workflow-advance` conclui o workflow.

| Fase atual | Evidência exigida para sair dela | Fonte |
|---|---|---|
| **P** | Plano linkado ao workflow e o arquivo do plano existe e tem corpo além do frontmatter. | `plans.json` do runtime do dotcontext (local exato confirmado na fase R) e `.context/plans/<slug>.md` |
| **R** | Bloco `review:` no frontmatter do plano linkado com `verdict: PROCEED`. `REVISE` ou `BLOCK` negam. | frontmatter do plano (escrito pela `prevc-review`) |
| **E** | ≥ 1 commit no `HEAD` posterior a `phases.E.started_at`; branch atual fora de `git.protectedBranches`; se existir `.context/workflow/stories.yaml` **deste workflow** (`created` ≥ `status.project.started`; um arquivo de workflow anterior é ignorado), nenhuma story `pending` ou `in_progress`. | `git log`, `git branch --show-current`, `.devflow.yaml`, stories |
| **V** | Veredito `pass` do `verify-gate.mjs` com os `requiredSignals` do plano linkado (um `warnOnly` também passa — é a regra da ADR-013 para projeto sem `verify:`). | `evaluateGate` |
| **C** (concluir) | Alguma branch de `git.protectedBranches` (local ou `refs/remotes/*/<branch>`) tem commit posterior a `phases.E.started_at` — o trabalho chegou à base, inclusive por squash merge ou merge local em projeto sem remoto — **ou** a branch atual existe em `refs/remotes/*` (publicada, PR possível). Não depende de `gh`/`glab`. Como a saída de E já exige commits fora de branch protegida, commit novo na base significa entrega. | `git log --since`, `git for-each-ref` |

Cada item de `missing[]` traz `howTo` (ex.: "rode a `prevc-review` e grave `review.verdict` no plano";
"commite o trabalho da fase E numa branch de feature").

### 4.3 O que conta como avanço

- `mcp__dotcontext__workflow-advance`, com ou sem `force: true` — o `force` é exatamente o bypass que o gate
  fecha.
- Bash cujo comando invoca a CLI do dotcontext como comando (`dotcontext workflow advance`, `npx [-y] @dotcontext/cli[@versão] workflow advance`), no início ou depois de espaço, `;`, `&`, `|` ou `(`. Texto entre aspas, como numa mensagem de commit, não casa. Heurístico, como a catraca.
- Qualquer outra ferramenta ou comando: o hook sai calado.

### 4.4 Configuração e modos de falha

`.context/.devflow.yaml`:

```yaml
prevc:
  evidenceGate: block   # block | warn | off — padrão: block
```

Lido pelo parser único (`devflow-config.mjs`, ADR-011), com um leitor novo `readEvidenceGate`.

| Situação | Resultado |
|---|---|
| Sem `prevc.json` ou workflow já concluído | passa (calado) |
| `evidenceGate: off` | passa (calado) |
| `evidenceGate: warn` e falta evidência | passa, com `additionalContext` listando o que falta |
| `evidenceGate: block` (ou ausente) e falta evidência | `deny` com o que falta e como produzir |
| Valor inválido em `evidenceGate` | trata como `block` (fail-closed) |
| Erro interno do coletor (git ausente, exceção) | passa com aviso em `additionalContext` (o gate é anti-teatro; não pode travar o projeto) |

Rebaixar a chave exige editar o `.devflow.yaml`, que já passa pelo gate de permissões e pela proteção de
branch. Vale em **qualquer** autonomia: em supervised o humano aprova a transição, mas a evidência também
precisa existir.

### 4.5 Mudanças nas skills

- `prevc-review`: ao fechar a fase, grava no frontmatter do plano linkado
  `review: { verdict: PROCEED|REVISE|BLOCK, reviewers: [<agentes>], date: <ISO> }`.
- `prevc-flow` e `autonomous-loop`: documentam o gate, o que cada fase precisa deixar e que o `force: true`
  não o contorna.
- `prevc-execution`: lembra que a fase E termina com commits na branch de feature e stories fechadas.

### 4.6 Limites declarados

- **Anti-teatro, não anti-adversário.** Um agente decidido a burlar consegue escrever um `review:` falso ou
  editar o `prevc.json` direto (Write/Bash). O gate faz o caminho de menor esforço passar pelo trabalho real.
- A detecção do avanço via Bash é por texto (variável, alias ou script intermediário passam).
- Parar antes da C não é detectável por hook; fica para a validação do laboratório (`INV-PREVC` rigoroso).
- **Alcance em projeto-cliente:** o gate roda em qualquer projeto com o plugin (Node, Python, Odoo) — só
  depende de `git` e `node`. Projetos sem `verify:` caem no `warnOnly` da ADR-013 na fase V.

### 4.7 Testes

- **Unit (`phase-evidence`):** cada linha da matriz nos dois sentidos (com e sem evidência); escalas QUICK,
  SMALL, MEDIUM e LARGE; fase final concluindo o workflow; `verdict` REVISE/BLOCK; stories pendentes.
- **Integração (`phase-gate.mjs`):** repositório git temporário (tmpdir, nunca o repo versionado), com
  `prevc.json`, plano, commits e remoto locais; cada fase com e sem evidência; modos `warn`, `off` e valor
  inválido; git ausente → passa com aviso.
- **E2E (hook):** eventos reais de PreToolUse pelo `run-hook.cmd`: `workflow-advance` negado e permitido,
  `force: true` negado, Bash com a CLI do dotcontext negado, Bash comum calado, saída sempre JSON válido
  numa linha e stdin lido até o fim.

## 5. Sinais exigidos

`requiredSignals: [unit, integration, e2e, lint, standards]`.

## 6. Decisões

| # | Decisão | Alternativas rejeitadas |
|---|---|---|
| D1 | Reler a fase no `turn.step` e no `agent.spawn` quando o par `(mtimeMs, size)` do `prevc.json` muda. | Ler em todo passo (custo sem ganho); reagir só ao `tool.call` do `workflow-advance` (não cobre a CLI nem outra sessão mexendo no arquivo). |
| D2 | Gate de evidência como hook PreToolUse mecânico, em qualquer autonomia. | Só instrução nas skills (o braço C ignorou as skills); só em autonomous; voltar a `autonomous: false` no dotcontext (gates fracos e aprovação humana travaria o modo). |
| D3 | Matriz da §4.2, com a C provada por merge ou branch publicada, sem `gh`/`glab`. | Exigir PR via `gh` (quebra em GitLab e sem remoto); exigir subagente na R e duração mínima (frágil, fácil de forjar). |
| D4 | `prevc.evidenceGate: block` por padrão, com `warn`/`off`; inválido → `block`; erro interno → passa com aviso. | `warn` por padrão (não resolve D5 sem config); fail-closed em erro interno (trava projeto por falha de ambiente). |
| D5 | Hook dedicado, separado da catraca. | Estender o `pre-tool-use-ratchet` (ele nunca nega por desenho). |

## 7. Pendências para a fase R

- Confirmar onde o `plan link` do dotcontext grava o vínculo (`.context/runtime/workflows/plans.json` ou o
  legado `.context/workflow/plans.json`) e se `status.approval.plan_created` acompanha.
- Confirmar o formato do `tool_input` do `workflow-advance` no evento PreToolUse (para o `force`).
- Achado lateral, fora deste escopo: `scripts/lib/check-prevc-bypass.mjs` procura o workflow em
  `.context/harness/workflows/prevc.json`, mas o dotcontext grava em `.context/runtime/workflows/prevc.json` —
  o lembrete de bypass dispara mesmo com workflow ativo. Vai para o backlog.

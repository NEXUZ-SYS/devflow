# Design — Retomada de workflow no SessionStart + handoff vivo

**Data:** 2026-07-16
**Status:** Design aprovado — pronto para plano de implementação
**Escala:** MEDIUM · **Autonomia:** supervised
**Workflow:** `workflow-resume-session`

---

## 1. Motivação

### 1.1 O buraco

Reiniciar a sessão do Claude Code **apaga o contexto do workflow PREVC**. Não há retomada: o agente acorda cego e reconstrói o estado à mão — lendo `prevc.json`, `git log`, planos.

Isso não é hipótese. Aconteceu hoje: reiniciei a sessão para carregar a v1.29.0 e reconstruí manualmente onde a feature `verify-signal-pipeline` estava.

### 1.2 O que existe e por que não cobre

| Hook | Faz | Cobre o restart? |
|---|---|---|
| `pre-compact` | captura `handoff.md` + git state → `last.json` | ❌ só compactação |
| `post-compact` | injeta o handoff de volta | ❌ só compactação |
| `session-start` | **0 ocorrências de "handoff"**; detecta só workflow **autônomo** (`stories.yaml`) e pula explicitamente quando `autonomy == "supervised"` | ❌ |

O handoff sobrevive à **compactação**, mas **não ao restart**. E o PREVC **supervised** — o modo padrão — é invisível no início da sessão.

### 1.3 O handoff.md está morto (e por quê)

`.context/workflow/.checkpoint/handoff.md` está congelado em **2026-07-02** (14 dias), descrevendo uma feature entregue.

**Causa proximal:** quem pede a atualização é o `hooks/post-tool-use` (ramo `TaskUpdate`+`completed` → *"HANDOFF UPDATE: atualize o handoff.md"*), que roda com `async: true` — e o Claude Code **descarta o stdout de hooks async**. O pedido nunca chega ao agente.

**Causa raiz:** cadência errada. O `handoff.md` é artefato de **curadoria** e estava com cadência de **log** (dezenas de pedidos por sessão). Mesmo que o canal funcionasse, produziria spam ignorado por fadiga ou prosa mecânica.

**Descoberta que barateia o conserto:** o `post-tool-use` é o **único** hook com `async: true`. Todos os outros entregam:

| Hook | async | Entrega o pedido? |
|---|---|---|
| `SessionStart` | false | ✅ |
| `PreCompact` | false | ✅ |
| `PostCompact` | false | ✅ |
| `PreToolUse` | false | ✅ |
| `PostToolUse` | **true** | ❌ **descartado** |

O handoff morreu porque estava pendurado no único canal quebrado do sistema.

### 1.4 O achado que molda o design

**Um handoff velho é pior que nenhum handoff.** Se o `session-start` injetasse o `handoff.md` de hoje, o agente acordaria convencido de estar na feature `e2e-fixes` com o PR #63 pendente — entregue há duas semanas. Contexto errado **com aparência de autoridade** é pior que tela em branco: o agente age sobre ele.

O `prevc.json` não tem esse risco (o dotcontext o mantém vivo sozinho). O `handoff.md` tem, por depender de alguém lembrar.

---

## 2. Objetivos / Não-objetivos

**Objetivos:**
- O `session-start` **injeta o estado do PREVC** (incluindo supervised) — retomada real após restart.
- **Alertar workflow pendurado** (fase C concluída mas não fechada) — gate mecânico.
- **Ressuscitar o handoff.md** movendo a escrita para um canal que entrega, na cadência certa.
- **Nunca injetar handoff stale** — avisar em vez de mentir.
- Funcionar em **qualquer projeto-cliente** (Node/Python/Odoo), no-op limpo sem workflow.

**Não-objetivos:**
- **Consertar o `async:true` do `post-tool-use`.** Follow-up próprio (bug de produção que afeta 5 controles legados). Esta feature **contorna** o canal quebrado usando os que funcionam — e não finge tê-lo consertado.
- **Retomada sem workflow ativo.** Sem `prevc.json` → no-op total. A feature é sobre retomada de *workflow*.
- **Automatizar a prosa do handoff.** O valor dele é julgamento humano; derivá-lo do estado o tornaria redundante com o `prevc.json`.

---

## 3. Decisões

| # | Decisão | Alternativa rejeitada | Por quê |
|---|---|---|---|
| **D1** | Duas fontes com papéis distintos: `prevc.json` = **estado automático**; `handoff.md` = **julgamento curado** | Fonte única (só um dos dois) | Carregam coisas diferentes. O `prevc.json` jamais produziria *"espelhar std-security antes do update senão o fetch reverte"*. O `handoff.md` jamais teria timestamps confiáveis. |
| **D2** | Injetar **estado + outputs da última fase concluída** (~150 tokens) | Mínimo (só estado) ou histórico completo (~600 tokens) | Mínimo não diz o que foi decidido (o agente lê o plano à mão — o erro de hoje). Completo custa ~600 tokens em toda sessão de todo projeto, duplicando o que já está no plano/git. |
| **D3** | **Guard de frescor** por `mtime(handoff.md) > workflow.started` | Injetar sempre; ou casar semanticamente (handoff cita o plano) | Injetar sempre = contexto errado com autoridade (§1.4). Casamento semântico é frágil. `mtime` é simples e conservador: na dúvida, não injeta. |
| **D4** | Handoff stale → **não injeta, mas AVISA** | Bloquear em silêncio; ou pedir atualização | Silêncio é o que produziu 14 dias de podridão — o handoff não morreu por decisão, morreu porque **ninguém viu**. O aviso transforma artefato podre em **sinal observável** (mesma lição da ADR-013: o valor é fazer o vermelho aparecer). |
| **D5** | A **escrita** do handoff vai para o `pre-compact` | Troca de fase (skills); ou manter no `post-tool-use` | O `pre-compact` é o único momento em que a perda de contexto é **iminente e detectável pelo sistema** — não depende do agente julgar "agora é hora". Canal que entrega (`async:false`), cadência rara. Pedir via skill na troca de fase é D7a puro — o controle que já falhou. |
| **D6** | Simetria: **`PreCompact` escreve · `SessionStart`/`PostCompact` leem** | Escrita e leitura no mesmo hook | Separa responsabilidades e evita recriar o erro de natureza (log × curadoria). |
| **D7** | Lib **pura** (`workflow-resume.mjs`), hooks só orquestram | Lógica em bash no hook | Testável (TDD), genérica para projetos-cliente, sem hardcode de path. Segue o padrão do repo (`run-linter-cli`, `edit-nudge-cli`). |

---

## 4. Arquitetura

```
PreCompact  ──pede──►  handoff.md  ──lê──►  SessionStart ──injeta──► agente
(escrita)              (prosa curada)       (leitura)
                                                 ▲
prevc.json (dotcontext escreve sozinho) ─────────┘
(estado vivo, gitignored)
```

| Peça | Responsabilidade | Onde vive |
|---|---|---|
| **Estado** | verdade automática: fase, plano, outputs, timestamps | `.context/runtime/workflows/prevc.json` (gitignored; o dotcontext escreve) |
| **Julgamento** | o que o estado não sabe: decisões, blockers, armadilhas | `.context/workflow/.checkpoint/handoff.md` (rastreado) |
| **Lib** | lê, decide frescor/pendurado, renderiza | `scripts/lib/workflow-resume.mjs` — **nunca escreve** |
| **Leitura** | injeta a retomada | `hooks/session-start` |
| **Escrita** | pede a curadoria antes de o contexto sumir | `hooks/pre-compact` |

---

## 5. O bloco injetado

```
**PREVC WORKFLOW ATIVO**
- Workflow: verify-signal-pipeline (Large) | Fase: C (Confirmation)
- Plano: docs/superpowers/plans/2026-07-14-verify-signal-pipeline.md
- Progresso: P OK | R OK | E OK | V OK | C em curso

Última fase concluída (V):
  • VALIDATED: 4 sinais verdes (unit 1922/0, integration 106/0, e2e 19+64/0, lint)
  • code review PROCEED; security REVISE com 4 achados (PoC) todos corrigidos
  • ADR-013 audit 12/12; gate de V dogfoodado verde

⚠ Workflow em C com P/R/E/V completed — se a entrega terminou,
  feche com plan commitPhase C (checkpoint não fecha).

⚠ handoff.md obsoleto (2026-07-02, workflow anterior) — ignorado.
```

**Custo:** ~150 tokens, **1× por sessão**. **Zero** quando não há workflow.

---

## 6. Contratos da lib

`scripts/lib/workflow-resume.mjs` — zero-dep, recebe `root`, no-op limpo:

```
readWorkflowState(root) → { name, scale, phase, plan, started, phases: {P..C: {status, outputs[]}} } | null
   ausente/malformado → null (nunca derruba o hook)

detectDangling(state) → boolean
   true ⟺ phase === "C" ∧ P,R,E,V todas completed ∧ C não completed

isHandoffFresh(root, state) → boolean
   mtime(handoff.md) > state.started

renderResume(state, { handoffFresh, handoffText, handoffMtime }) → string
```

**Sanitização:** os `outputs` do `prevc.json` são texto escrito por agentes. Sanitizar seguindo o padrão que o `session-start` já usa (`sanitize_str`/`sanitize_int`) — não confiar no conteúdo cegamente.

---

## 7. Frescor — regra e trade-off

| Caso | Decisão |
|---|---|
| `mtime(handoff.md) > started` | **fresco** → injeta a prosa junto do estado |
| `mtime(handoff.md) < started` | **stale** → **não injeta** + `⚠ handoff.md obsoleto (<data>) — ignorado` |
| sem `handoff.md` | trata como stale (sem aviso de obsoleto) |

**Trade-off assumido:** re-iniciar um workflow reseta `started` e marca um handoff recente como stale (aconteceu 3× hoje). Falso positivo custa uma linha de aviso; falso negativo custa contexto errado com cara de autoridade. Prefere-se o primeiro.

---

## 8. Estratégia de testes (TDD — RED→GREEN, sem exceção)

| Alvo | unit | e2e |
|---|---|---|
| `readWorkflowState` | ausente → null; JSON malformado → null; válido → shape | — |
| `detectDangling` | C+tudo completed → true; C em curso → false; E in_progress → false | — |
| `isHandoffFresh` | mtime > started → true; mtime < started → false; sem arquivo → false | — |
| `renderResume` | contém fase/plano/última fase; stale → linha de aviso; dangling → linha do commitPhase C | — |
| `hooks/session-start` | — | sandbox tmpdir + prevc.json real → roda o hook → bloco na saída; **sem prevc.json → no-op** |
| `hooks/pre-compact` | — | sandbox → roda o hook → pedido de atualização do handoff na saída |

`requiredSignals: [unit, e2e, lint]` — toca hooks (CLI real), logo e2e é obrigatório pela regra da `prevc-validation`.

---

## 9. Alcance em projetos-cliente

A lib e os hooks são **código do plugin** — rodam em qualquer projeto via `${CLAUDE_PLUGIN_ROOT}`:

| Peça | Alcance |
|---|---|
| lib + hooks | **qualquer** projeto (Node/Python/Odoo) — agnósticos de linguagem, recebem `root` |
| retomada | ativa só onde há `prevc.json` (projeto com workflow DevFlow) |
| sem workflow | **no-op silencioso** — nenhum custo, nenhum ruído |

Sem hardcode de path do devflow. Ver `feedback_devflow_plugin_generic_vs_dogfooding`.

---

## 10. Riscos assumidos

1. **Falso positivo de stale** ao re-iniciar workflow (§7). Custo: uma linha.
2. **~150 tokens em toda sessão com workflow ativo.** Aceitável; é 1×/sessão e substitui a reconstrução manual (que custa muito mais).
3. **O `handoff.md` continua dependendo de alguém escrever.** O `pre-compact` pede, mas não obriga (D7a). Diferença: agora o pedido **chega**, na cadência certa, e o stale é denunciado toda sessão — o loop se fecha por pressão observável, não por confiança.
4. **`prevc.json` é gitignored** → a retomada é local, não trafega no PR. É a natureza do estado de sessão; o `handoff.md` (rastreado) cobre o que precisa ser compartilhado.

---

## 11. Componentes tocados

| Arquivo | Ação |
|---|---|
| `scripts/lib/workflow-resume.mjs` | novo |
| `hooks/session-start` | estende — injeta a retomada (cobre supervised) |
| `hooks/pre-compact` | estende — pede a atualização do handoff antes de capturar |
| `tests/lib/test-workflow-resume.mjs` | novo (unit) |
| `tests/e2e/workflow-resume.e2e.test.mjs` | novo (e2e dos hooks) |
| `CHANGELOG.md` | `## [Unreleased]` (gate `assertUnreleasedNonEmpty` — `versioning: pipeline`) |

---

## 12. Referências

- ADR-012 (D7a auto-contornável × D7b mecânico) · ADR-013 (sinal verificável; o gate observa em vez de afirmar)
- Hooks do Claude Code (async × entrega de `additionalContext`): https://code.claude.com/docs/en/hooks
- Incidentes que motivaram: restart cego (2026-07-16); `handoff.md` congelado desde 2026-07-02; workflow pendurado em C 2× (`config-release-scaffold`, `verify-signal-pipeline`)

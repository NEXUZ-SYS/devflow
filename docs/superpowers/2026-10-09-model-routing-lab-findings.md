# Laboratório de roteamento de modelos — achados e backlog (fase V)

> Workflow `model-routing-e2e-validation` (LARGE, autonomous). Spec:
> `docs/superpowers/specs/2026-10-09-model-routing-lab-design.md`. Plano:
> `docs/superpowers/plans/2026-10-09-model-routing-lab.md`. Laboratório: repo irmão
> `devflow-routing-lab` (local, sem remoto), branch `feature/routing-lab`.

## Estado

- Laboratório entregue: 18 commits; contrato unit 105, e2e 28, L1 18 (camada determinística contra a tag
  `v3.7.0`), lint limpo.
- **Camada L1 — zero divergências:** a CLI `model-route` da v3.7.0 bate com o oráculo independente
  (transcrito da spec do roteamento §5) em todos os agentes × fases; `escalate`, `report`, `--runtime omp`
  e o hook clássico conforme.
- **Preflight real aprovado:** a rodada isolada sobe só com `devflow` (clone da tag), `superpowers`, os
  embutidos `cc-plugin-*` e o MCP `dotcontext`.
- **Campanha real (braços A e B): pendente, a cargo do operador**, fora do Claude Code (tmux). Motivo: o
  Claude Code encerrou o braço A em background aos 32 min por pressão de memória do sistema. O driver parou
  limpo (vigia de `ppid` → `interrupted`, sem processos órfãos). Runbook: `runbooks/campaign.md` do
  laboratório.

## Achados do DevFlow (v3.7.0) — candidatos a refinamento

| # | Achado | Evidência | Status |
|---|---|---|---|
| D1 | **H1 — fase do mod lida só no `turn.start`.** Em `claude -p`, um único turno do `/devflow auto` atravessou P→R→E (68 passos, 18 min). A troca de modelo da sessão na fronteira R→E (D11) e os overrides de fase dos subagentes dependem de um `turn.start` que não acontece dentro do turno. | L1 `router-core.test.mjs` (caracterização determinística); rodada real parcial do braço A (fases reais por timestamp: P 17:47–18:03, R 18:03–18:14, E 18:14→, todas numa invocação). | **Confirmação pendente no braço B** (`INV-PHASE-SYNC`, `INV-SESS`). Proposta a avaliar: reler a fase no `turn.step` quando o `mtime` do `prevc.json` mudar (barato; mantém sticky por fase). |
| D2 | **Turnos extras por notificação de tarefa em background.** O mesmo processo `-p` emite vários `result` (`result_index` 0, 1, …): notificações de background abrem turnos novos — logo há `turn.start` intermediários, o que atenua D1 de forma não determinística. | Stream real do braço A: 2 results na invocação 1. | Medir no braço B; considerar no desenho da correção de D1. |
| D3 | **H2 — retomada sem ID aprendido.** Processo novo do mod não troca o modelo da sessão até um `agent.spawn` resolver o tier (D21). | L1 `router-core.test.mjs`. | Medir no braço B (trocas após retomada). |
| D4 | **Tier da task no plano funciona em rodada real.** O agente anotou `**Tier:**` (cheap/standard/capable) no plano do workspace. | `planTiers` da rodada real. | Positivo; no mod chega como `explicit` (spec do roteamento §12). |

## Achados do próprio laboratório (corrigidos durante o workflow)

- Revisão crítica das invariantes: 5 falsos HELD + 3 falsos MISS (`15b5f51`).
- Plugin sob teste dentro do laboratório expunha a suíte oculta e a referência via `$CLAUDE_PLUGIN_ROOT/../..`
  → cache em `~/.cache/devflow-routing-lab` + `INV-ISOL` (`8fe00d9`).
- Aceitação zerava o braço com um servidor que ignora SIGTERM; suíte alterável no meio da rodada → SIGKILL,
  timeouts, total conferido (13), digest da suíte por braço (`9436f81`, `938dfa9`).
- Preflight só conferia presença; o plugin declara `mempalace`/`odoo`/`docs-mcp-server` → allowlist exata em
  todo `init` (`35ec4c5`).
- Smoke real: rodada interrompida perdia sessão e fase; vários `result` por stream → recuperação na
  interrupção e fallback do `prevc.json` (`f090e95`).

## Backlog do laboratório (não bloqueia a campanha)

1. Veredito de Q3 calculado (B ≥ A na aceitação e PREVC de B terminado) — hoje só a tabela.
2. Custo de lista: o `modelUsage` parece **acumulado** entre `result`s do mesmo processo (soma do stream =
   2,2× a saída dos transcripts no smoke) → usar o último `result` por invocação, ou peso por modelo sobre os
   transcripts.
3. Tabelas por agente e por fase com entrada/cache além da saída.
4. `superpowers` carregado do cache vivo do operador sem conferência de integridade.
5. `--plugin-dir` irmão do laboratório aceito; link quebrado em `--runs` com mensagem ruim; aceitação órfã ao
   interromper a coleta.
6. Textos desatualizados: diagrama da spec §4 e Global Constraints do plano ainda citam `lab/.cache`.
7. Relatório `model-route report` sem teste e2e (só `--no-report` nos testes).

## Próximo passo (operador)

```bash
cd ../devflow-routing-lab
node scripts/run-arm.mjs --arm arms/A-baseline.json --preflight-only   # custo mínimo
tmux new -s routing-lab
node scripts/campaign.mjs --arms A-baseline --max-resumes 2 --timeout-min 90 --name <data>-A
node scripts/campaign.mjs --arms B-routed   --max-resumes 2 --timeout-min 90 --name <data>-B
node scripts/score.mjs --out results/<data>-A+B <runDir-A> <runDir-B>
```

Referência de custo: a rodada parcial do braço A (32 min, até a fase E) consumiu ~182k tokens de saída de
opus pelos transcripts.

## Campanha 2026-10-09 — resultados (n = 1, v3.7.0)

Uma rodada por braço. A = sem roteamento, B = roteado, C = teto sonnet/medium.

| | A | B | C |
|---|---|---|---|
| Duração | 64 min | 40 min | cerca de 3 min de fases |
| Aceitação oculta | 13/13 | 13/13 | 13/13 |
| Saída total | 325k (100% opus) | 188k (0,58× A) | 38,7k (0,12× A) |
| PREVC | P→R→E→V→C | P→R→E→V (C pulada) | nominal (ver D5) |

- **H1 confirmada.** `INV-PHASE-SYNC` com MISS em 12/12 despachos e `INV-SESS` com MISS em 45/102 mensagens: a sessão ficou em opus/xhigh durante toda a fase E e parte da V. Mecanismo: a fase só era relida no `turn.start`, e em `-p` os `turn.start` intermediários vêm de notificações de tarefas em background, de forma não determinística. Cerca de 26,7k de saída em opus na E que a tabela daria a sonnet.
- **D5 observada no C.** Em autonomia `autonomous` os gates do dotcontext são ignorados e nada exigia artefato real por fase: P em 31 s, R em 2 s, nenhum commit além do seed, nenhum subagente. Com teto baixo o PREVC virou nominal; o roteamento não causa isso, apenas o expõe.
- **O que funcionou.** Tier por task no plano (`backend-specialist` em opus, sonnet e haiku conforme o `**Tier:**`, origem `explicit`); `INV-EFF` HELD em 62 pontos; defaults por agente (`architect` e `security-auditor` em capable/high, `documentation-writer` em haiku/low); ledger com 30 linhas válidas e nada fora da allowlist; teto respeitado nos três braços.
- **Ressalvas.** n = 1; no B o agente pulou a C e fez um P mais curto; o custo de lista do scorecard não é confiável (o `modelUsage` do stream é acumulado). Não exercitado: escalada, override de fase e `final-review`.
- **Corrigido em** `docs/superpowers/specs/2026-10-10-routing-phase-sync-and-evidence-gate-design.md`: releitura da fase em `turn.step` e `agent.spawn` (H1, ADR-017 v1.1.0) e gate de evidência por fase no `workflow-advance` (D5, ADR-018).

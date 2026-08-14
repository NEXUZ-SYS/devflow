# PREVC Parallel Execution — Design (RASCUNHO)

> 🚧 **STATUS: brainstorming EM ANDAMENTO — pausado em 2026-06-13, retomar 2026-06-15 (segunda).**
> Este arquivo NÃO é o spec final. É o estado parcial do `superpowers:brainstorming`.
> Ao retomar: continuar da seção "Perguntas em aberto" (a próxima é o **gate de roteamento paralelo**).

## Objetivo

Adicionar um **modo de execução paralelo opt-in** ao PREVC Execution, construído sobre o
`Workflow` tool nativo do Claude Code. Hoje o `devflow:autonomous-loop` é um interpretador
**serial** (uma story por vez) escrito em prosa. A proposta extrai o **DAG de stories**
(`blocked_by` já define as arestas em `.context/workflow/stories.yaml`) e deixa o `Workflow`
tool executar o fan-out de implementação de forma **determinística e paralela**, mantendo o
`autonomous-loop` serial como default/fallback.

Referências no repo:
- `skills/autonomous-loop/SKILL.md` — engine serial atual (Steps 1–6, retry/circuit-breaker/escalação).
- `skills/parallel-dispatch/SKILL.md` — skill de dispatch paralelo via Agent tool + worktrees (gate de independência).
- `skills/prevc-execution/SKILL.md` — fase de Execution que rotearia entre paralelo e serial.

## Decisões fechadas (4 perguntas respondidas)

1. **Escopo do MVP = completo ("Skill + integração robusta").**
   Entregar: a skill `devflow:parallel-execution` (emite o Workflow script) + conversor
   `stories.yaml → DAG/args` + roteamento em `prevc-execution` + **estratégia de merge
   sofisticada** (detecção de conflito, ordem topológica, rollback). Não é um corte mínimo.

2. **Integração das worktrees = cherry-pick topológico.**
   Cada story commita na sua worktree; a integração aplica os commits no branch da feature em
   **ordem topológica** (respeitando `blocked_by`), rodando **typecheck a cada passo**.
   Conflito → escala a story. Determinístico e auditável, casa com o `git-strategy` atual.

3. **Onde roda a integração = na skill (main loop, pós-Workflow).**
   O `Workflow` tool faz **só a fase Implement** (fan-out paralelo em worktrees + verdicts por
   schema). A skill `devflow:parallel-execution` recebe os verdicts e faz cherry-pick + suite
   completa via **Bash no main loop**. Conflito → escala interativamente ao humano (igual ao
   `autonomous-loop`). Motivo: o Workflow tool não tem acesso a git/filesystem direto, só
   despacha agentes; o main loop tem Bash e interação humana.

## Arquitetura provisória (decorre das decisões acima)

```
prevc-execution (roteador)
  └─ [gate paralelo — EM ABERTO] → devflow:parallel-execution
        ├─ converte stories.yaml → DAG + args (escalation config, files_touched?)
        ├─ Workflow tool (fase Implement):
        │     mapa de Promises por story.id (dataflow, respeita blocked_by)
        │     cada story: agent({ agentType: story.agent, isolation: 'worktree',
        │                         schema: VERDICT })  + retry-loop (max_retries)
        │     prompt força TDD (RED→GREEN→REFACTOR) + guardrails git
        │     (PROIBIDO push/gh/PR/merge — ver feedback_subagent_git_guardrails)
        │  → retorna verdicts[] (status, tdd_followed, tests_pass, worktree, files_changed)
        └─ skill no main loop (fase Integrate, via Bash):
              cherry-pick topológico dos commits das worktrees
              typecheck a cada passo; conflito → escala story interativamente
              suite COMPLETA + security gate (stories auth/data/API)
              reescreve stories.yaml com status finais + carimba timestamps
              relatório no formato do Step 6 do autonomous-loop
```

Esboço do script `Workflow` (fase Implement, DAG via mapa de Promises) já rascunhado na conversa
— recuperar do histórico ou re-derivar a partir do bloco acima. Pontos-chave do script:
- `meta` com phases `Implement` (e `Integrate` fica FORA do Workflow, na skill).
- DAG → `results[story.id] = Promise`; cada story `await`-a as Promises de `blocked_by`.
- Schema `VERDICT`: `{ story_id, status, tdd_followed, tests_pass, files_changed, worktree, summary, error }`.
- Retry-loop `for (attempt ≤ max_retries+1)` em volta do `agent()`.
- `Date.now()`/`Math.random()` proibidos no script → timestamps carimbados pela skill depois.
- Resume: `resumeFromRunId` traz stories completadas do cache.

## Perguntas em aberto (retomar AQUI na segunda 2026-06-15)

1. **[PRÓXIMA] Gate de roteamento paralelo** — quando `prevc-execution` ativa o modo paralelo?
   Opções discutidas:
   - (a) **DAG + files_touched disjuntos** — exige declarar `files_touched` por story no
     planning; só paraleliza grupos com arquivos disjuntos. Conflito de cherry-pick quase
     impossível (pré-filtrado). Custo: planning precisa preencher `files_touched`.
   - (b) **Só DAG (blocked_by)** — paraleliza qualquer story sem dep. mútua; conflito detectado
     só na integração (escala story). Confia no merge robusto.
   - (c) **Opt-in explícito** — só com flag (ex: `parallel: true` no `.devflow.yaml`); default serial.
   - Nota: como o MVP escolhido inclui "merge robusto", (a) e (c) são compatíveis e podem se combinar.
2. **Tratamento de conflito de cherry-pick** — escala a story isolada? aborta a onda? resolução
   interativa pelo humano no main loop? rollback parcial?
3. **Schema de verdict** — campos finais e como os gates leem o JSON validado
   (alinhar ao branch `omp` que já usa `overall_correctness === "correct"` / `passed === true`).
4. **Resume / persistência de estado parcial** — `resumeFromRunId` + como reconciliar com a
   reescrita de `stories.yaml` (fonte de verdade dupla?).
5. **TDD enforcement** — prompt + `tdd_followed` auto-reportado (não forçável de fora); aceitável?
6. **Modos Full/Lite/Minimal** — como o conversor lê stories e despacha agentes em cada modo
   (MCP dotcontext vs `.context/agents/*.md` vs bundled).
7. **Versionamento/empacotamento** — auto-bump (`pre-commit-version-check.sh`), 3 version files.

## Restrições e princípios herdados (memórias de projeto)

- **TDD obrigatório** (`feedback_tdd_always`): a própria skill via TDD-for-docs (RED→GREEN nos contratos).
- **Guardrails git em subagents** (`feedback_subagent_git_guardrails`): prompt proíbe push/gh/PR/merge.
- **Testes não mutam dirs versionados** (`feedback_tests_no_mutate_tracked`): E2E destrutivo em tmpdir.
- **Rodar o PREVC inteiro** (`feedback_full_prevc_trail`): feature vai pelo trilho DevFlow.
- **Idioma pt-BR** (`feedback_language_docs`): spec e interação em pt-BR.

## Próximos passos do processo (skill brainstorming)

- [ ] Responder perguntas em aberto (1–7) uma a uma.
- [ ] Propor 2–3 abordagens onde ainda houver bifurcação.
- [ ] Apresentar design por seções, aprovação incremental.
- [ ] Converter este rascunho no spec final (remover marcação RASCUNHO).
- [ ] Spec self-review → revisão do usuário → `superpowers:writing-plans`.

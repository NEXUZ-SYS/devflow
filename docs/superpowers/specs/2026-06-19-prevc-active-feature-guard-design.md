# Guardrail de Feature Ativa (PREVC) — Notas de Design (WIP)

> **Status:** Planning (P) — brainstorming **PAUSADO** em 2026-06-19, a retomar.
> **Workflow PREVC:** prevc-active-feature-guard | **Escala:** MEDIUM | **Autonomia:** supervised | **Modo:** Lite
> **Worktree:** `.claude/worktrees/feature+prevc-active-feature-guard` (branch `worktree-feature+prevc-active-feature-guard`, ramificada de `origin/main` @ 09c2231) — **preservada** (keep) no disco.
> Documento de **retomada** — não é a spec final. A spec final será escrita ao fechar o brainstorming.
> **Nota:** salvo no checkout principal (não na worktree) por causa do achado de permissões — ver §7.

---

## 1. Problema (confirmado por auditoria de código)

Hoje o DevFlow **não impede** iniciar uma nova feature quando já existe outra no ar (branch ativa + workflow). Não há gate de "uma feature por vez".

### Evidências (estado em `origin/main` @ 09c2231)

1. **`skills/prevc-flow/SKILL.md`** — o orquestrador de entrada vai direto: Detect Mode → PRD → Scale → Autonomy → **Step 3 `workflow-init`** (cria workflow novo). Não há checagem de "já existe workflow/feature ativo". Os únicos caminhos `existing/resume` (seção "Autonomy Upgrade/Downgrade", ~L164-167) tratam **apenas de upgrade de autonomia** — não de impedir abrir feature nova por cima.
2. **`skills/git-strategy/SKILL.md` §4 (L143-145):** *"Se branch atual é `feature/*`, `fix/*`, `hotfix/*`, ou `release/*` → prosseguir sem gate."* Estando numa feature no ar, **não isola, não avisa, não pergunta**.
3. Não há checagem de working tree sujo, branch não-mergeada, nem do `plans.json` ativo antes de iniciar.

### Prova viva (no momento da auditoria)

O próprio repo estava com **3 frentes simultâneas no ar**: branch `feat/init-ao-scope-check` (1 commit à frente do main local), `.context/workflow/plans.json` com `primary: "instinct-system"` marcado `active`, e working tree muito sujo. Rodar `/devflow <feature nova>` ali começaria por cima de tudo, sem aviso.

## 2. Comportamento desejado (do usuário)

> "Confirme se você permite iniciar uma nova feature se uma estiver com branch e tudo no ar. Isso **não pode ser permitido** — ou o usuário deve **continuar o workflow**, ou **iniciar uma worktree baseada na branch main ou developer**."

Gate de pré-entrada que, ao detectar *feature em andamento*, **bloqueia** o início de uma nova e oferece:
- **(a)** Continuar o workflow/feature atual;
- **(b)** Abrir **worktree a partir de `main`/`develop`** para isolar a nova feature;
- **(c)** (a avaliar) Finalizar/arquivar a feature atual primeiro.

## 3. Espaço de design (superfícies de enforcement)

Mapa da superfície técnica real do plugin:
- **`hooks/pre-tool-use`** — matcher `Edit|Write`. Onde vive o gate de branch protection (git-strategy / permissions deny-first).
- **`hooks/post-tool-use`** — matcher `TaskUpdate|Edit|Write|Bash`, async. Já contém o padrão ADR-006: *avisa quando um plano é escrito sem workflow PREVC ativo* (detecção de estado de workflow em hook — precedente reaproveitável).
- **`hooks/session-start`** — injeta modo/contexto.
- **Estado de workflow legível:** `.context/workflow/plans.json` (`active[]`, `primary`), `.context/workflow/.checkpoint/last.json` (branch, fase, dirty_files), `.context/.devflow.yaml` (`git.strategy`, `git.protectedBranches: [main, develop]`).

Abordagens candidatas (a decidir com o usuário — ver §4):
- **Soft (skill):** novo "Step 0: Detect active feature" no `prevc-flow` (a IA segue). Momento semântico exato de "começar feature".
- **Duro (hook):** bloqueio no `pre-tool-use` quando a branch atual não corresponde à feature em curso. Robusto, porém detecção mais fuzzy e maior risco de falso-positivo.
- **Híbrido:** gate semântico no `prevc-flow` Step 0 + reforço duro no `pre-tool-use`/git-strategy (defense-in-depth).

## 4. Decisões em ABERTO (retomar daqui)

**PRÓXIMO PASSO ao retomar = responder estas, uma a uma (brainstorming):**

1. **[PENDENTE — pergunta já feita, sem resposta] Enforcement: onde/força.** Opções: (1) Gate no prevc-flow (skill, soft); (2) Hook duro no pre-tool-use; (3) Híbrido skill+hook. → *Aguardando escolha.*
2. **Definição de "feature em andamento" / falso-positivos.** Quais sinais são autoritativos? Working tree sujo sozinho deve bloquear? Combinação E/OU? Peso de `plans.json` vs branch vs checkpoint.
3. **Discriminação "mesma feature vs outra".** Como saber se o novo pedido é *continuação* da feature atual (→ segue) ou *outra* (→ bloqueia)? Por slug? Perguntando ao usuário?
4. **Menu de resolução.** Confirmar opções (a) continuar / (b) worktree a partir de base / (c) finalizar atual / (d) override explícito. Qual o default? `develop` existe? (hoje **não** — base = `main`).
5. **Escopo do bloqueio.** Só ao iniciar via `/devflow <desc>` (prevc-flow), ou também Edit/Write numa branch fora de contexto?
6. **ADR.** Decisão arquitetural nova (política de isolamento de workflow) → no Step 3.5 do planning provavelmente dispara oferta de **CREATE** de ADR. Nenhuma ADR atual (001–009) trata do tema.

## 5. Plano de testes (preliminar)

- **Lib de detecção** (JS, p.ex. `scripts/lib/active-feature-detect.mjs`): testes unitários reais via `node --test` — casos: branch limpa na base (sem bloqueio), branch de trabalho com commits à frente (bloqueio), plans.json com active (bloqueio), checkpoint fase não-concluída, working tree sujo, combinações, mesma-vs-outra feature.
- **SKILLs** (`prevc-flow`, `git-strategy`): testes estruturais (à la `skills/import-reversa/tests/skill-structure.test.mjs`) verificando que o Step 0/seção de gate existe e enuncia as opções obrigatórias.
- Convenção do repo: meta-framework MD+Bash+JSON, mas libs JS têm testes `node --test`. **TDD obrigatório** (RED→GREEN→REFACTOR).

## 6. Como retomar

1. Voltar para a worktree: `EnterWorktree({ path: ".claude/worktrees/feature+prevc-active-feature-guard" })` (ou recriar a partir de `origin/main` se removida) — **mas ver §7 antes** (escrita lá está bloqueada hoje).
2. Ler este documento.
3. Continuar o **brainstorming** a partir da Decisão Aberta #1 (enforcement), depois #2…#6.
4. Fechar o design → escrever spec final → `superpowers:writing-plans` → handoff Lite (`.context/plans/<slug>.md`) → avançar P→R.

**Tarefas PREVC (harness):** #1 P [in_progress], #2 R, #3 E, #4 V, #5 C (encadeadas).

**Branch AO intacta:** `feat/init-ao-scope-check` permanece no checkout principal, não tocada (já mergeada como PR #52 / v1.23.3).

## 7. Achado bloqueante: worktree × permissions.yaml (insumo de design)

Ao tentar gravar dentro da worktree (`.claude/worktrees/.../docs/...`), o hook `pre-tool-use` retornou `mode: deny`. Mesmo com `mode: prompt` nos dois `permissions.yaml` (principal e worktree), **todo Write é negado enquanto a sessão está dentro da worktree** (testado: caminho da worktree, store de auto-memória, e `docs/**` do principal — os três negados). Causa provável: o avaliador (`scripts/lib/permissions-evaluator.mjs`) não normaliza os caminhos absolutos contra os globs relativos do allowlist quando o CWD é a worktree, e **falha fechado** (`prompt`→`deny` em hook não-interativo; comportamento "deny acionável" v1.23.2). Por isso esta spec foi salva **após sair da worktree** (ExitWorktree keep), de volta ao checkout principal.

**Implicação para esta feature:** a opção "abrir worktree a partir de main/develop" do guardrail **precisa ser worktree-aware**:
- ou o avaliador resolve o root via `git rev-parse --show-toplevel` da worktree (não o common-dir) e normaliza paths absolutos→relativos a esse root;
- ou as worktrees ficam em dir irmão fora de `.claude/` (como o git-strategy já faz no fallback: `${PARENT_DIR}/${REPO_NAME}-<tipo>-<nome>`), tratado como repo próprio.

Este achado deve virar requisito/risco explícito na spec final (possivelmente um ponto na ADR de isolamento, ou um bug-fix prévio à implementação do guardrail).

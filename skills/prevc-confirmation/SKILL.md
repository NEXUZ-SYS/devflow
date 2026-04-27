---
name: prevc-confirmation
description: "Use during PREVC Confirmation phase — finalizes the branch, updates documentation, and syncs context across tools"
---

# PREVC Confirmation Phase

Finalizes the development branch, updates documentation, and ensures all tools and context are synchronized.

**Announce at start:** "I'm using the devflow:prevc-confirmation skill for the Confirmation phase."

## Checklist

A pipeline de finalização é SEQUENCIAL e OBRIGATÓRIA. Cada step deve ser completado antes do próximo. A ordem é alinhada com os hook messages (locales) e NUNCA deve ser alterada:

0. **WIP pre-check** — garantir que não há mudanças descommitadas de escopos não relacionados
1. **README Update** — atualizar histórico de versões e capabilities no README
2. **Version Bump** — detect capabilities, bump version
3. **Commit final** — commit das mudanças do README + bump
4. **Finalize branch** — push, merge, cleanup
5. **Update documentation** — API docs, inline docs (exceto README, já feito)
6. **Update project context** — reflect changes in .context/ files
7. **Sync to tools** — export context to all configured AI tools
8. **Present completion summary** — what was done, what to do next
9. **Gate check** — everything finalized = workflow complete

## Step 0: WIP Pre-check

<HARD-GATE>
Antes de qualquer edição da pipeline de finalização, RODAR `git status` e inspecionar mudanças descommitadas que **NÃO pertencem ao escopo da branch atual**.

**Por quê:** `git add` em arquivos que já tinham modificações prévias (WIP solto no working dir) sweeps essas mudanças no commit de finalização, misturando escopos. Isso:
- Suja o histórico (commit de fix contém feature alheia)
- Impede code review focado
- Pode conflitar com branches paralelas que trabalham no mesmo arquivo
- Promove conteúdo work-in-progress para main sem revisão apropriada

**Verificação obrigatória:**
```bash
git status --short
git diff --stat  # arquivos modificados não-stageados
```

**Se encontrar mudanças fora do escopo:**
1. Listar os arquivos "suspeitos" para o usuário (não relacionados à branch atual)
2. Perguntar: **commit em branch própria** / **stash** / **descartar** / **incluir deliberadamente**
3. Só prosseguir com a pipeline depois da decisão

**Anti-pattern:** usar `git add -A` ou `git add <file>` num arquivo que já estava `M` antes da sua sessão. Sempre confira o que está staging com `git diff --cached` antes de commitar.
</HARD-GATE>

## Step 1: README Update

<HARD-GATE>
A atualização do README DEVE acontecer ANTES do version bump e ANTES do merge/PR. Esta é a PRIMEIRA etapa da pipeline de finalização — NUNCA pule ou reordene.

Se `README.md` não existe no projeto, pular este step e ir para Step 2.
Se existe, este step é OBRIGATÓRIO.
</HARD-GATE>

### Detectar necessidade de atualização

```bash
# Analisar o que mudou na branch
git diff main...HEAD --stat
```

Atualizar o README se houve mudanças em:
- `skills/`, `agents/`, `commands/`, `hooks/`, `templates/` — atualizar contagens ou listagens
- Arquivos de versão (`plugin.json`, `package.json`, `Cargo.toml`) — nova versão gerada no Step 2
- Novas features, skills, ou capabilities — adicionar ao README
- Bug fixes relevantes para o usuário — adicionar ao histórico de versões

### Atualizar histórico de versões

Se o README tem uma tabela de versões (ex: `| Versão | Data | Destaques |`), adicionar uma nova entrada com:
- **Versão:** será preenchida após o bump (Step 2), mas a linha já deve ser preparada
- **Data:** data de hoje
- **Destaques:** resumo conciso das mudanças da branch (1-2 frases)

**Fluxo correto:** Como a versão final só é conhecida após o bump (Step 2), o fluxo é:
1. Step 1: Preparar as mudanças do README (capabilities, contagens, etc.)
2. Step 2: Executar o bump (que gera a versão final)
3. Step 1b: Adicionar a entrada no histórico de versões do README com a versão do bump
4. Step 3: Commit tudo junto (README + bump)

### Execute by Autonomy Mode

- **supervised** — Mostrar diff do que será atualizado, perguntar ao usuário antes de aplicar
- **assisted** — Atualizar automaticamente, reportar mudanças feitas
- **autonomous** — Atualizar silenciosamente, incluir no resumo final

## Step 2: Version Bump

<HARD-GATE>
Version bump MUST happen BEFORE branch finalization (merge/PR). This prevents the version bump from being skipped when the merge is executed via any path (skill, hook, or direct Bash command).
</HARD-GATE>

### Detect Project Capabilities

Check for version bump mechanisms in this order:

1. **`scripts/bump-version.sh`** — if exists, use it (supports patch/minor/major argument)
2. **`package.json` with `"version"` field** — if exists, bump with `npm version` or manual edit
3. **None detected** — skip bump, inform user

### Determine Bump Type

Infer from the workflow context:
- **patch** — bug fixes, minor improvements (scale QUICK/SMALL)
- **minor** — new features (scale MEDIUM with new capabilities)
- **major** — breaking changes (scale LARGE with API changes)

### Execute by Autonomy Mode

- **supervised** — Ask the user: "Que tipo de bump? (patch/minor/major)" with the inferred default. Wait for confirmation before bumping.
- **assisted** — Announce the inferred bump type, execute automatically. Report what was bumped.
- **autonomous** — Execute bump silently (patch default unless scale/context suggests otherwise). Report in summary.

### Bump Pipeline

1. Detect capabilities (bump-version.sh, package.json)
2. Determine bump type from scale and context
3. Execute bump (run script, update files)
4. **Retornar ao Step 1b** — adicionar entrada no histórico de versões do README com a versão bumped
5. Commit ALL changes together (README + bump): `chore: bump to vX.Y.Z`
6. Verify commit succeeded

If bump fails, report the error and continue to Step 3 (do not block branch finalization on bump failure).

## Step 3: Commit Final

Commit das mudanças do README + bump juntas:

```bash
git add README.md <bump-files>
git commit -m "chore: bump to vX.Y.Z"
```

Se o pre-commit hook faz auto-bump (como neste projeto), o commit pode já incluir os arquivos de versão automaticamente. Nesse caso, o README deve estar staged ANTES do commit para ser incluído.

## Step 4: Finalize Branch

<HARD-GATE>
**ANTES** de invocar qualquer sub-skill de finalização, **SEMPRE consultar `.context/.devflow.yaml`** e respeitar a configuração declarada. Config é decisão tomada do projeto, não sugestão a re-confirmar.

```bash
# Se .context/.devflow.yaml existe
AUTO_FINISH=$(grep -E "^\s*autoFinish:" .context/.devflow.yaml | head -1 | awk -F: '{print $2}' | xargs)
PR_CLI=$(grep -E "^\s*prCli:" .context/.devflow.yaml | head -1 | awk -F: '{print $2}' | xargs)
```

**Decisão de execução baseada em `autoFinish`:**

| Valor de `autoFinish` | Comportamento |
|---|---|
| `true` (ou granular com `merge: true`) | **EXECUTAR DIRETO** — não invocar `superpowers:finishing-a-development-branch`, não apresentar menu de 4 opções. Anunciar a ação e fazer merge automaticamente. |
| `false` | Invocar `superpowers:finishing-a-development-branch` para apresentar opções ao usuário. |
| Ausente / config sem campo | Comportamento padrão (apresentar opções). |

**Não pergunte ao usuário "qual estratégia" se config já decidiu.** O usuário já configurou — re-perguntar é fricção e ignora a intenção declarada.
</HARD-GATE>

### Quando `autoFinish: true` — execução direta

Detectar se há PR aberto + escolher caminho:

```bash
# Detectar PR aberto para a branch atual (se prCli=gh)
BRANCH=$(git branch --show-current)
PR_NUMBER=$(gh pr list --head "$BRANCH" --json number --jq '.[0].number' 2>/dev/null)
```

**Caminho A — PR existe + `prCli: gh`:**
```bash
gh pr merge "$PR_NUMBER" --squash --delete-branch
git checkout main && git pull
git branch -d "$BRANCH" 2>/dev/null || true   # já pode ter sumido após delete-branch
```
- `--squash` é o default razoável. Se a config tiver `mergeStrategy: merge|rebase|squash`, respeitar.
- `--delete-branch` limpa remote.
- `git pull` sincroniza local.
- `git branch -d` final limpa local (no-op se já sumiu).

**Caminho B — Sem PR + push local possível (sem branchProtection server):**
```bash
git checkout main
git pull origin main
git merge --no-ff "$BRANCH"
git push origin main
git branch -d "$BRANCH"
git push origin --delete "$BRANCH" 2>/dev/null || true
```

**Caminho C — Sem PR + main protegida server-side:**
- Push da branch e abrir PR via `gh pr create` — depois rodar Caminho A.
- Alternativa: usar `gh pr merge --admin` se o usuário tem permissão.

**Anunciar antes de executar:**
> "`autoFinish: true` detectado em `.context/.devflow.yaml`. Executando merge automático via `gh pr merge #<N> --squash --delete-branch`."

**NÃO** apresentar menu, **NÃO** invocar `superpowers:finishing-a-development-branch`, **NÃO** pedir confirmação adicional.

### Quando `autoFinish` é `false` ou ausente

**REQUIRED SUB-SKILL:** Invoke `superpowers:finishing-a-development-branch`

A sub-skill apresenta opções ao usuário (merge local / push+PR / keep / discard) e executa a escolha.

**IMPORTANTE:** Quando o skill `finishing-a-development-branch` for invocado, os Steps 1-3 (README, bump, commit) já DEVEM estar completos. O skill só deve tratar de push/merge/cleanup — nunca de README ou bump.

### Por que esse gate existe

**Incidente 2026-04-25** (workflow `adr-system-v2`): finalização foi invocada via `superpowers:finishing-a-development-branch` que apresentou 4 opções, mesmo com `autoFinish: true` declarado em `.devflow.yaml`. O usuário corrigiu apontando que config decidida não deve ser re-perguntada. Este gate previne recorrência.

**Princípio:** config explícita do projeto manda sobre prompt LLM. Se o time configurou autoFinish, isso reflete intenção deliberada — re-perguntar é ignorar essa intenção.

## Step 5: Update Documentation

Atualizar docs restantes (API docs, inline docs). O README já foi atualizado no Step 1, portanto NÃO repetir aqui.

### Full Mode
```
agent({ action: "orchestrate", agents: ["documentation-writer"], task: "update-docs" })
```
The documentation-writer agent identifies what docs need updating based on the changes.

### Lite Mode
Read `.context/agents/documentation-writer.md` and apply its workflow:
- Check if API docs need updating
- Check if architecture docs are still accurate

### Minimal Mode
Manually review if any docs reference changed code/APIs.

### All Modes — Documentation Checklist
- [ ] New public APIs documented
- [ ] Changed APIs have updated docs
- [ ] Removed APIs are removed from docs
- [ ] Inline comments updated for non-obvious logic changes

## Step 6: Update Project Context

### Full Mode
```
context({ action: "fill" })  # Re-analyze and update .context/ docs
plan({ action: "commitPhase", phase: "C" })
```

### Lite Mode
Manually update relevant `.context/docs/` files:
- `project-overview.md` — if project scope changed
- `codebase-map.json` — if file structure changed
- `development-workflow.md` — if process changed

### Minimal Mode
Skip (no `.context/` to update).

## Step 7: Sync to Tools

### Full Mode
```
sync({ action: "exportContext" })  # Syncs to all configured tools
```
This exports to: Claude (.claude/), Cursor (.cursor/), Copilot (.copilot/), Windsurf, Cline, Codex, etc.

### Lite Mode
If any `.context/` files were updated, manually note that sync hasn't been run.
Suggest: "Run `dotcontext sync-agents` to export context to all AI tools."

### Minimal Mode
Skip sync.

## Step 8: Completion Summary

Present a summary:

```markdown
## Workflow Complete

**Task:** [description]
**Scale:** [QUICK/SMALL/MEDIUM/LARGE]
**Phases completed:** [P → R → E → V → C]

### What was done
- [bullet points of key changes]

### Files changed
- [list of key files]

### What to do next
- [ ] Review PR (if created)
- [ ] Deploy to staging
- [ ] Monitor for issues
```

### Full Mode Addition
```
workflow-status()  # Final status check
```

## Step 8.5: Update PRD (if exists)

After the completion summary, check if this workflow is part of a PRD:

1. Search for `.context/plans/*-prd.md`
2. **If found:**
   a. Find the phase marked `⏳ In Progress`
   b. Update its status to `✓ Completed`
   c. Fill in the Spec path: `docs/superpowers/specs/YYYY-MM-DD-<phase>-design.md`
   d. Fill in the Plan path: `docs/superpowers/plans/YYYY-MM-DD-<phase>.md`
   e. Find the next phase with status `⬚ Pending`
   f. **If next phase exists:**
      - Announce: "Phase N (<name>) completed and marked in PRD. Next up: Phase N+1 (<name>). Start planning Phase N+1?"
      - If user says yes → invoke `devflow:prevc-flow` (which will pick up the next phase via Step 1.5)
      - If user says no → end workflow
   g. **If no more phases:**
      - Announce: "All PRD phases complete! Product roadmap fully delivered."
3. **If not found:**
   a. No change (current behavior)

## Step 9: Gate Check (Workflow Complete)

The Confirmation gate marks the workflow as complete:
- README updated (if exists)
- Version bumped
- Branch finalized (merged or ready to merge)
- Documentation updated
- Context synced (Full mode)
- PRD updated (if exists)

**Workflow is now COMPLETE.**

## Anti-Patterns

| Thought | Reality |
|---------|---------|
| "README pode esperar" | NÃO. README é Step 1. Sem README atualizado, não há bump nem merge. |
| "Vou fazer o merge primeiro e atualizar o README depois" | NUNCA. A ordem é README → Bump → Commit → Merge. Sem exceções. |
| "O bump já inclui o README" | NÃO. O bump atualiza versão em arquivos de config. O README é responsabilidade do Step 1. |
| "Docs can wait" | No. Stale docs cost more than the 5 minutes to update them now. |
| "Context sync is optional" | In Full mode, it's what keeps all your AI tools aligned. Do it. |
| "The PR description is enough" | PR descriptions are ephemeral. Project docs are permanent. |
| "I'll clean up the branch later" | Later means never. Finalize now. |

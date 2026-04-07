# Design: Commit & Finalização de Branch via Hook PostToolUse

**Data:** 2026-04-03
**Status:** Aprovado
**Escopo:** Estender o hook `post-tool-use` para oferecer commit e finalização de branch

---

## Problema

Após completar tasks, o usuário precisa manualmente decidir quando commitar e quando finalizar a branch. Não há prompt automático, levando a commits esquecidos, READMEs desatualizados e bumps de versão manuais. Isso aconteceu no fix v0.7.1, onde a atualização do README foi esquecida.

## Solução

Estender o hook `post-tool-use` existente para detectar mudanças pendentes e estado da branch, então injetar instruções para o LLM perguntar ao usuário (ou agir automaticamente) conforme o modo de autonomia.

## Trigger

- **Quando:** Após `TaskUpdate(status: completed)`
- **NÃO** após cada `Write` (invasivo demais)

## Lógica de Detecção

O hook detecta:

1. **Mudanças pendentes:** `git diff --name-only` (staged + unstaged)
2. **Tipo de branch:** `git rev-parse --abbrev-ref HEAD` — é `feature/*`, `fix/*`, `hotfix/*`, `release/*`?
3. **Modo de autonomia:** Lê de `.context/workflow/status.yaml` campo `autonomy`. Default: `supervised` (inclusive quando não há workflow PREVC ativo)
4. **Capacidades do projeto:**
   - README: existe `README.md` na raiz do repo?
   - Bump: existe `scripts/bump-version.sh` OU `package.json` com `"version"`?
   - PR CLI: lê de `.context/docs/development-workflow.md` o campo para `gh`/`glab`/nenhuma

## Cenário 1: "Quer realizar o commit?"

**Condição:** Há mudanças não commitadas após uma task ser completada.

| Autonomia | Comportamento |
|---|---|
| supervised | Injeta: perguntar ao usuário via AskUserQuestion "Quer realizar o commit?" → Sim / Não, continuar trabalhando |
| assisted | Injeta: commitar automaticamente usando `devflow:commit-message`, reportar o que foi commitado |
| autonomous | Injeta: commitar automaticamente usando `devflow:commit-message`, reportar o que foi commitado |

## Cenário 2: "Quer finalizar a branch?"

**Condição:** Em branch de trabalho (`feature/*`, `fix/*`, `hotfix/*`, `release/*`) E sem mudanças pendentes E (todas as tasks completas OU sem tasks ativas).

| Autonomia | Comportamento |
|---|---|
| supervised | Injeta: perguntar "Quer finalizar a branch?" → Sim / Não. Se Sim, sub-confirmar cada etapa: atualizar README? bump? commit? push? merge? |
| assisted | Injeta: perguntar "Quer finalizar a branch?" → Sim / Não. Se Sim, executar pipeline completa automaticamente com report |
| autonomous | Injeta: executar pipeline completa automaticamente com report, sem perguntar |

## Pipeline de Finalização

Executada quando o usuário confirma (ou automaticamente em modo autonomous):

```
1. Atualização do README (se README.md existe)
   → LLM analisa git diff main...HEAD --stat
   → Se houve mudanças em skills/, agents/, commands/, hooks/, templates/ ou arquivos de versão
   → Atualiza seções relevantes (histórico de versões, contagens, etc.)
   → Reporta o que mudou

2. Bump de versão (se capacidade existe)
   → scripts/bump-version.sh → executa script com "patch" (default)
   → Apenas package.json → npm version patch --no-git-tag-version
   → Nenhum → pula silenciosamente

3. Commit final
   → Staged: arquivos do bump + mudanças do README
   → Mensagem convencional via devflow:commit-message

4. Push
   → git push origin <branch>

5. Merge
   → gh pr create + merge (se gh configurado)
   → glab mr create + merge (se glab configurado)
   → git checkout main && git merge <branch> && git push (se sem CLI)

6. Limpeza da branch
   → branch-flow: git branch -d <branch>
   → worktree: git worktree remove + git branch -d
   → trunk-based: nenhuma

7. Resumo
   → Arquivos alterados, versão bumped, branch merged, limpeza feita
```

## Tratamento de Erros

Em qualquer falha (teste quebrado, merge conflict, push rejeitado):
- **Sempre** parar e escalar para o usuário
- Nunca force-push, nunca pular testes falhando
- Reportar o que falhou e o que já foi feito

## Escopo

- **Universal:** Funciona dentro e fora de workflows PREVC
- **Fora do PREVC:** Autonomia assume `supervised` (sempre pergunta)
- **Dentro do PREVC:** Lê autonomia de `.context/workflow/status.yaml`

## Idioma

**Regra:** Todo output gerado por este hook — prompts injetados, mensagens de commit, resumos, perguntas via AskUserQuestion e reports de finalização — DEVE ser escrito no idioma configurado pelo usuário (`devflow:language`). O hook lê `.devflow-language` (projeto ou `~/.devflow-language` global) e injeta todo conteúdo no idioma correto. Termos técnicos (commit, merge, push, branch, bump, PREVC) permanecem em inglês.

## Arquivos Modificados

- `hooks/post-tool-use/` — estender hook existente com detecção de commit/finalização e injeção de instruções

## Arquivos NÃO Modificados

- `skills/commit-message/` — sem alteração, LLM invoca quando necessário
- `skills/prevc-confirmation/` — sem alteração, continua usando `superpowers:finishing-a-development-branch`
- `skills/git-strategy/` — sem alteração

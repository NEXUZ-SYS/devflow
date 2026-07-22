# Melhoria — `git.autoRelease` opt-in: o Step 8.1 pode disparar o release

**Data:** 2026-07-22 · **Tipo:** feature de plugin (genérica, afeta clientes) · **Escala estimada:** SMALL
**Origem:** follow-up #1 de [`2026-07-08-fix-confirmation-autofinish-honor.md`](2026-07-08-fix-confirmation-autofinish-honor.md) ("auto-disparo opt-in `git.autoRelease`, adiado"), retomado ao revisar por que o release da v1.31.1 não saiu sozinho.
**Status:** decidido, não implementado.

---

## O que motivou a revisão

Ao finalizar o workflow `suggest-bump-postmerge-base`, o Step 8.1 emitiu o signpost e **não** disparou o release — comportamento correto pela regra vigente. Ao revisar *por quê*, os dois pilares da regra não sobreviveram à verificação.

### Regra vigente

`skills/prevc-confirmation/SKILL.md` Step 8.1:

> **NUNCA rode `gh workflow run` automaticamente — apenas sinalize.** Release é decisão humana (o *tipo* de bump é julgamento semver que o operador confirma).

### O que os workflows realmente fazem (verificado em `.github/workflows/`)

```
gh workflow run release.yml -f bump=X          ← workflow_dispatch
   └─ bump-version.sh + 3 version files + known-hashes
   └─ git push -u origin <branch>
   └─ gh pr create                              ← PARA AQUI. Abre um PR.

merge do release PR na main (protegida, required checks)
   └─ tag-release.yml  (on: push, paths: .claude-plugin/plugin.json)
   └─ gh release create vX.Y.Z                  ← ISTO é o ato outward-facing
```

**O dispatch não é o ato público.** Ele abre um PR revisável. A publicação acontece no merge do release PR, que já tem gate humano (branch protection + required checks + o merge em si). Soma-se a fricção conhecida: os checks do PR do bot nascem em `action_required` e precisam de aprovação manual — automação ponta-a-ponta não é alcançável hoje de qualquer forma.

### Os dois pilares, reavaliados

| Pilar original | Verificação |
|---|---|
| "release é outward-facing" | **Falso para o dispatch.** Aplica-se ao merge do release PR, que não é o que a skill proíbe. |
| "o bump é julgamento semver" | **Enfraquecido.** O `suggest-bump` estava quebrado — respondia `patch` em toda entrega (ver [`2026-07-21-suggest-bump-postmerge-base.md`](2026-07-21-suggest-bump-postmerge-base.md)). A regra foi escrita apoiada num helper que não conseguia fazer o trabalho. Corrigido em 2026-07-22 (PR #82): agora deriva da última tag de release e emite a procedência (`base=v1.31.0 (source=tag, N commits)`). |

## A razão boa — que não é a que está escrita

**Cadência de release.** Hoje o `## [Unreleased]` acumula e o operador libera quando o lote está pronto. Auto-disparo a cada merge produz **um release por feature**. Isso é decisão de ritmo do projeto, não de segurança.

Isso importa para a *forma* da correção: o motivo errado gerou um `NUNCA` absoluto na skill, quando o correto é **config por projeto**. Projetos que liberam por feature querem o dispatch; projetos que loteiam, não.

## Decisão

**`git.autoRelease`, opt-in, com escalação em `major`.**

```yaml
git:
  autoFinish: true
  autoRelease: true      # novo — default false (retrocompatível)
```

Step 8.1 passa a ramificar:

| `autoRelease` | Bump derivado | Ação |
|---|---|---|
| `false` / ausente | qualquer | Signpost (comportamento de hoje) |
| `true` | `patch` | `gh workflow run release.yml -f bump=patch` |
| `true` | `minor` | `gh workflow run release.yml -f bump=minor` |
| `true` | `major` | **Signpost + escala** — breaking change merece olhos |

Em **todos** os casos o release PR ainda exige merge humano para publicar. O que muda é quem abre o PR.

**Por que separado do `autoFinish`:** são consentimentos distintos. `autoFinish` diz "finalize a branch sem menu" (interno). `autoRelease` diz "e também abra o release" (cadência). Empacotar os dois mudaria o comportamento de quem já usa `autoFinish` hoje, sem opt-in — exatamente o tipo de mudança silenciosa que o DevFlow evita.

## Notas de design

- **ADR-011 é obrigatório:** ler `autoRelease` via `scripts/lib/devflow-config.mjs` (há `read-field`; confirmar se serve para chave arbitrária ou se precisa de um leitor dedicado como `read-autofinish`/`read-versioning`). **Nunca** grep/awk ad-hoc.
- **Condição de guarda preservada:** o bloco (signpost ou dispatch) só existe sob `versioning: pipeline` **e** `[Unreleased]` não-vazio. `autoRelease` não relaxa isso.
- **A escalação de `major` não é menu.** Segue o padrão do "única exceção de pausa" do Step 4: motivo específico + comando pronto, nunca 4 opções genéricas.
- **Interação com a lacuna do `glab`:** o Step 8.1 cita `release.yml` (GitHub). Auto-disparar **agrava** o problema — hoje é um texto errado sob GitLab; passaria a ser um comando errado *executado*. O ramo de dispatch deve ser guardado por `prCli: gh`, com fallback para signpost neutro. Ver [`2026-07-09-config-release-scaffold.md`](2026-07-09-config-release-scaffold.md) e a memória do gap do `glab`.
- **Fricção `action_required`:** auto-disparar não elimina a intervenção humana, só a desloca para a aprovação dos runs do PR do bot. Documentar isso no bloco emitido para não criar expectativa de "release sozinho".

## Escopo

**Dentro:** chave `git.autoRelease` no schema do `.devflow.yaml` + leitor no parser único; ramificação do Step 8.1 (dispatch × signpost × escala de major); guard por `prCli: gh`; entrevista do `/devflow config` oferecendo a opção; testes (contrato do leitor + os quatro caminhos da tabela).

**Fora:** merge automático do release PR (isso *é* o ato outward-facing — permanece humano); aprovação automática dos runs `action_required`; ramo `glab` do release (lacuna própria); mudar o default de `autoFinish`.

## Ligações

- Signpost original e a decisão que este documento revisa: [`2026-07-08-fix-confirmation-autofinish-honor.md`](2026-07-08-fix-confirmation-autofinish-honor.md) Task 2
- Correção que derrubou o pilar do "julgamento semver": [`2026-07-21-suggest-bump-postmerge-base.md`](2026-07-21-suggest-bump-postmerge-base.md)
- Parser único de config: ADR-011
- Scaffold de release e proveniência: [`2026-07-09-config-release-scaffold.md`](2026-07-09-config-release-scaffold.md)

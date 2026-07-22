---
type: plan
name: git.autoRelease opt-in + hardening do suggest-bump
description: Tracking dotcontext. O Step 8.1 passa a poder abrir o release PR sozinho sob git.autoRelease (patch/minor auto, major sinaliza); e o suggest-bump falha alto quando a base é engolida como opção do git.
planSlug: auto-release-opt-in
scope: SMALL
autonomy: supervised
status: filled
progress: 0
generated: "2026-07-22"
scaffoldVersion: "2.0.0"
summary: "Duas pendências do mesmo caminho (finalização/release). (A) --end-of-options no git log do suggest-bump: uma base que o git ACEITA como opção (--output=…) saía 0 com zero commits e virava patch silencioso — mesma classe do defeito da v1.31.1. Hardening estreito: typo de tag e flag inexistente já falhavam alto (exit 128). (B) git.autoRelease opt-in: a regra 'nunca auto-disparar' apoiava-se em duas premissas falsas — o gh workflow run ABRE UM RELEASE PR, não publica (quem publica é o merge dele, humano, atrás de branch protection), e o 'bump é julgamento semver' foi escrito quando o suggest-bump respondia patch para tudo. A razão legítima é CADÊNCIA (times que loteiam), logo é config, não dogma. Chave lida via read-field (mesmo caminho do prCli, ADR-011, sem leitor novo); patch/minor disparam, major sempre sinaliza, forge != gh sinaliza, falha de dispatch cai para o signpost."
sources:
  spec: docs/superpowers/specs/2026-07-22-auto-release-opt-in-design.md
  plan: docs/superpowers/plans/2026-07-22-auto-release-opt-in-impl.md
  racional: docs/superpowers/plans/2026-07-22-auto-release-opt-in.md
requiredSignals:
  - unit
  - lint
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: in_progress
    summary: "Spec aprovado pelo operador. Achado do design: (A) foi revisado para baixo três vezes (segurança → falha-alto → hardening marginal) porque o probe mostrou que typo de tag já falha com exit 128; só escapa base que o git aceita como opção. Semântica do major decidida: sinaliza e segue, sem usar o mecanismo de escalated (a entrega já está na main; pausar deixaria o workflow pendurado por decisão de release)."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: pending
    required_sensors:
      - tests
      - lint
    required_artifacts:
      - handoff-summary
    summary: "TDD RED→GREEN. Task 1: --end-of-options + teste do caso silencioso (base --output=). Task 2: ramificação de 4 ramos no Step 8.1 + anti-pattern + P5c e cross-check no /devflow config + CHANGELOG + 7 asserções de contrato no test-confirmation-release-signpost.sh. Guard finalize-pure precisa continuar verde."
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    summary: "Sinais unit e lint observados no ledger do verify-gate (ADR-013). 15 testes no suggest-bump; teste de contrato do signpost verde; sem regressão no test-confirmation-autofinish.sh. Limitação assumida: os asserts de contrato são grep sobre texto de skill — provam que o contrato está escrito, não que o LLM o executa."
lastUpdated: "2026-07-22T19:14:25.154Z"
---

# `git.autoRelease` opt-in + hardening do `suggest-bump` — tracking

> **Spec:** [`docs/superpowers/specs/2026-07-22-auto-release-opt-in-design.md`](../../docs/superpowers/specs/2026-07-22-auto-release-opt-in-design.md)
> **Plano executável:** [`docs/superpowers/plans/2026-07-22-auto-release-opt-in-impl.md`](../../docs/superpowers/plans/2026-07-22-auto-release-opt-in-impl.md)
> **Racional da decisão:** [`docs/superpowers/plans/2026-07-22-auto-release-opt-in.md`](../../docs/superpowers/plans/2026-07-22-auto-release-opt-in.md)

## A — `--end-of-options` (hardening de segurança, severidade baixa)

Dimensionado errado duas vezes no design e **corrigido para cima na fase E**, quando o teste expôs a falha do método:

| base | exit | comportamento antes |
|---|---|---|
| `v9.9.9` (typo de tag) | 128 | já falhava alto |
| `--not-a-real-flag` | 128 | já falhava alto |
| `--output=<gravável>` | **0** | **escreve o arquivo** + 0 commits → `patch` |
| `--output=<não-gravável>` | ≠0 | falha por permissão, não por guarda |

**O erro:** conclui "sem exploit" após procurar por `/tmp/pwned`. O arquivo real é **`/tmp/pwned..HEAD`** — o `..HEAD` é concatenado *dentro* do valor da opção. `ls` confirmou `/tmp/pwned..HEAD` e `/tmp/x..HEAD`, 19B cada. O `git log` **honra** `--output=`.

**A primitiva:** criação de arquivo em diretório arbitrário gravável, sempre com sufixo `..HEAD`, conteúdo = saída do log. O sufixo fixo impede sobrescrever alvo existente pelo nome exato. Entrada é `argv[0]` — operador/skill, não fronteira remota. Severidade baixa, mas real.

**Armadilha de teste registrada no código:** a primeira fixture usou `--output=/dev/null` e **passou sem a correção** — o git tentou criar `/dev/null..HEAD` na raiz e falhou por permissão, exercitando o caminho não-vulnerável. Alvo não-gravável faz o teste passar pelo motivo errado. A fixture final usa tmpdir gravável de propósito.

## B — `git.autoRelease`

A regra vigente era `NUNCA auto-disparar`. Os dois pilares caíram na verificação:

| Pilar | Verificação |
|---|---|
| "release é outward-facing" | **Falso para o dispatch** — `gh workflow run` abre um *release PR*; quem publica é o `tag-release.yml` no merge dele, atrás de branch protection. |
| "o bump é julgamento semver" | **Enfraquecido** — foi escrito quando o `suggest-bump` respondia `patch` para toda entrega (corrigido na v1.31.1). |

A razão legítima é **cadência de release** — times que agrupam entregas num só release. Logo: config, não dogma.

| `autoRelease` | `prCli` | bump | Ação |
|---|---|---|---|
| ausente / `false` | — | — | Signpost (hoje) |
| `true` | ≠ `gh` | — | Signpost + nota de forge |
| `true` | `gh` | `major` | Signpost + auto-disparo suspenso |
| `true` | `gh` | `patch`/`minor` | `gh workflow run release.yml -f bump=<X>` |

**Semântica do `major`:** sinaliza e o workflow completa — **não** usa o mecanismo `escalated`. No Step 8.1 a entrega já está mergeada na main; pausar ali penduraria o workflow por uma decisão de *release*, não de código.

## Fora de escopo

Merge automático do release PR (é *o* ato outward-facing); aprovação automática dos runs `action_required`; ramo `glab` do release; check `harness-sensors` do doctor (workflow separado).

## Guardrails de ADR

| ADR | Aplicação |
|---|---|
| 011 | `autoRelease` lido só via `devflow-config.mjs read-field` — precedente do `prCli`, sem leitor novo. |
| 013 | `requiredSignals: [unit, lint]`; a fase V observa o ledger. |
| 009 | `--end-of-options` e os exit codes das bases malformadas verificados empiricamente. |

## Execution History

> Last updated: 2026-07-22T19:14:25.154Z | Progress: 0%

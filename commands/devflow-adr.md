---
name: devflow-adr
description: "ADR system — create, audit, or evolve Architecture Decision Records via devflow:adr-builder skill"
---

# /devflow:devflow-adr — ADR command dispatcher

Routes `/devflow:devflow-adr <subcommand>` to the `devflow:adr-builder` skill with the corresponding mode.

## Usage

```
/devflow:devflow-adr                       # Show this help
/devflow:devflow-adr help                  # Show this help
/devflow:devflow-adr new [título]          # Create new ADR (guided/free/prefilled)
/devflow:devflow-adr new --mode=guided     # Force guided mode
/devflow:devflow-adr new --mode=free       # Force free mode (extract from prose)
/devflow:devflow-adr new --mode=prefilled  # Force prefilled mode (paste briefing)
/devflow:devflow-adr audit <alvo>          # Audit existing ADR (inline, no workflow)
/devflow:devflow-adr evolve <alvo>         # Evolve ADR (patch/minor/major/refine)
```

## Argument resolution (audit/evolve)

Targets accept any of:
- `001` — number prefix (resolves to latest version of that lineage)
- `001-tdd-python` — slug-base (resolves to latest version)
- `001-tdd-python-v1.0.0` — exact filename
- `<path>` — direct path or glob

Resolution via `node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-update-index.mjs --resolve=<query>`.

## Behavior

Parse the first argument and dispatch:

| Subcommand | Routes to skill | Mode |
|---|---|---|
| (none) or `help` | inline help below | — |
| `new` | `devflow:adr-builder` | `create` |
| `audit` | `devflow:adr-builder` | `audit` |
| `evolve` | `devflow:adr-builder` | `evolve` |
| `audit-all` | (plan futuro B2 — not yet) | reject with explanatory message |
| `bundle` | (plan futuro B1 — not yet) | reject with explanatory message |
| anything else | reject + show help | — |

### `/devflow:devflow-adr new`
1. Invoke `devflow:adr-builder` skill with `mode=create`
2. Skill runs Step 1 (submode selection) → Steps 2-5 (collection, generation, audit gate, commit)
3. Workflow type: PREVC SMALL dedicated (P → E → V)

### `/devflow:devflow-adr audit <alvo>`
1. Invoke `devflow:adr-builder` skill with `mode=audit` and `target=<alvo>`
2. Skill runs Steps A1-A4 (resolve, audit, present, optionally delegate to EVOLVE)
3. Workflow type: **inline** (no PREVC, just diagnosis)

### `/devflow:devflow-adr evolve <alvo>`
1. Invoke `devflow:adr-builder` skill with `mode=evolve` and `target=<alvo>`
2. Skill runs Steps E1-E5 (classify, interview, apply via lib, gate, commit)
3. Workflow type: PREVC SMALL dedicated

## Help text (printed on `/devflow:devflow-adr` or `/devflow:devflow-adr help`)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DevFlow ADR — sistema de Architecture Decision Records v2.1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMANDOS
  /devflow:devflow-adr new [título]          Criar ADR nova (guiado/livre/pré)
  /devflow:devflow-adr audit <alvo>          Auditar ADR existente (inline, sem gate)
  /devflow:devflow-adr evolve <alvo>         Evoluir ADR (patch/minor/major/refine)
  /devflow:devflow-adr help                  Este help

MODOS DE CREATE
  --mode=guided      (padrão) Perguntas estruturadas em blocos
  --mode=free        Descrevo em prosa, skill extrai
  --mode=prefilled   Colo briefing, skill formata

RESOLUÇÃO DE ALVO (audit/evolve)
  /devflow:devflow-adr audit 001                      Mais recente da linhagem 001
  /devflow:devflow-adr audit 001-tdd-python           Mais recente do slug-base
  /devflow:devflow-adr audit 001-tdd-python-v1.0.0    Versão exata
  /devflow:devflow-adr audit <path>                   Glob ou path direto

GATES E WORKFLOWS
  new, evolve → disparam PREVC SMALL (P → E → V)
  audit       → inline, sem workflow

PLANS FUTUROS (não disponíveis ainda)
  /devflow:devflow-adr audit-all     (plan B2) — reauditoria em massa
  /devflow:devflow-adr bundle        (plan B1) — export/import cross-repo

SCOPE
  Bundled no plugin devflow@NEXUZ-SYS
  Template canônico: ${CLAUDE_PLUGIN_ROOT}/skills/adr-builder/assets/TEMPLATE-ADR.md
  Docs: https://github.com/NEXUZ-SYS/devflow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---
name: devflow-design
description: "Guia de design de front-end — roteia /devflow:devflow-design <modo> para a skill devflow:frontend-design (23 modos: craft, critique, audit, polish, colorize, animate, layout, live, init, …)."
---

# /devflow:devflow-design — dispatcher de design de front-end

Roteia `/devflow:devflow-design <modo> [alvo]` para a skill **`devflow:frontend-design`** com o modo correspondente. A skill faz o grounding obrigatório no knowledge (`product-design-system`/`tone-of-voice`/`business-icp`) antes de agir, e coexiste com os Standards determinísticos (`std-design-antipatterns`/`std-visual-quality`/`std-accessibility`).

## Usage

```
/devflow:devflow-design                      # Sem modo: analisa sinais e recomenda 2–3 próximos passos
/devflow:devflow-design help                 # Mostra esta ajuda
/devflow:devflow-design init                 # Bootstrap do subsistema de design no projeto
                                     #   (register brand/product, scaffold do knowledge, waivers)
/devflow:devflow-design init --from-impeccable  # Reconcilia um impeccable cru já instalado (consent-gated)
/devflow:devflow-design craft <alvo>         # shape→build com iteração visual
/devflow:devflow-design critique <alvo>      # Review de UX
/devflow:devflow-design audit <alvo>         # Checks técnicos (a11y/perf/responsivo)
/devflow:devflow-design polish <alvo>        # Ship readiness
/devflow:devflow-design colorize|typeset|layout|animate|delight|overdrive <alvo>   # Enhance
/devflow:devflow-design bolder|quieter|distill|harden|onboard <alvo>               # Refine
/devflow:devflow-design clarify|optimize|adapt <alvo>                             # Fix
/devflow:devflow-design shape|document|extract <alvo>                             # Build
/devflow:devflow-design live [alvo]          # Iteração ao vivo no navegador (bridge npx impeccable,
                                     #   hard-gate de feature branch + consentimento; requer Node≥24)
```

## Behavior

1. Parse o primeiro argumento como **modo**. Modos válidos (23): `craft`, `shape`, `init`, `document`, `extract`, `critique`, `audit`, `polish`, `bolder`, `quieter`, `distill`, `harden`, `onboard`, `animate`, `colorize`, `typeset`, `layout`, `delight`, `overdrive`, `clarify`, `optimize`, `adapt`, `live`.
2. Invoque a skill **`devflow:frontend-design`**, passando o modo + o alvo. A skill lê `references/<modo>.md` e conduz o trabalho.
3. **Sem modo** → a skill analisa sinais do projeto e recomenda os próximos passos.
4. **Modo `init`** → a skill roda o bootstrap (`detect-frontend`, register, knowledge, waivers); `--from-impeccable` aciona a reconciliação consent-gated.
5. **Modo `live`** → a skill usa o bridge (`scripts/design/live-bridge.mjs`): valida branch de feature + Node≥24 + integridade e pede consentimento antes de `npx impeccable@<pinned> live`.

## Arguments

- (vazio) — recomenda próximos passos
- `help` — mostra esta ajuda
- `init [--from-impeccable]` — bootstrap / reconciliação do subsistema de design
- `live [alvo]` — iteração ao vivo no navegador
- `<modo> [alvo]` — qualquer um dos 23 modos, encaminhado à skill `devflow:frontend-design`

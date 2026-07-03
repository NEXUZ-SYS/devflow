---
name: frontend-design
description: "Use QUANDO invocada explicitamente via /devflow:design <modo> (ou delegada pelo agente product-context) para projetar, redesenhar, criticar, auditar, polir, distilar ou animar uma interface de front-end — websites, landing pages, dashboards, UI de produto, componentes, forms, onboarding, empty states. Cobre hierarquia visual, tipografia, cor (OKLCH), espaçamento, layout, motion, micro-interações, UX copy, error states, i18n e design systems/tokens. Também para designs sem graça que precisam ficar mais ousados, ou barulhentos que precisam ficar mais quietos, ou iteração ao vivo no navegador. NÃO intercepta prompts genéricos de UI nem tarefas de implementação (essas seguem com o agente frontend-specialist); NÃO é catch-all — só age quando invocada/delegada. Não é para backend nem tarefas não-UI."
version: 0.1.0
deps:
  internal:
    - "skills/frontend-design/references/"
    - "assets/standards/std-design-antipatterns.md"
    - "assets/standards/std-visual-quality.md"
    - "docs/design-rules-classification.md"
    - "scripts/design/live-bridge.mjs"
trigger_phrases:
  - "/devflow:design"
  - "design da UI"
  - "redesenhar interface"
  - "critique este design"
  - "audite o design"
  - "polir a UI"
---

# frontend-design — Guia de design para front-end

Absorve a orientação de design do [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (`@skill-v3.9.1`, Apache-2.0 — ver `NOTICE`) e a integra ao DevFlow: **consome** o knowledge de negócio para grounding e **coexiste** com os Standards determinísticos (os linters `std-design-antipatterns`/`std-visual-quality`/`std-accessibility`). Codifica a decisão [[external-design-toolkit-absorption]] (ADR-010).

## Fronteira & ativação (anti-conflito)

Esta skill **só age quando invocada** via `/devflow:design <modo>` **ou delegada** pelo agente `product-context` (dono do `product-design-system`). Ela **NÃO** intercepta prompts genéricos de UI e **NÃO** compete por ativação com o agente `frontend-specialist` (que **implementa** UI a partir de um design). Divisão:
- **frontend-design** (esta skill) — **define/critica/refina** o design (o "o quê" visual e o porquê).
- **frontend-specialist** (agente) — **implementa** o design em código (o "como"), na fase E.

## Grounding obrigatório (antes de qualquer modo)

Antes de propor qualquer design, leia o knowledge de negócio como grounding — **nunca** duplique esse conteúdo, referencie via `@`:
- `@.context/product/product-design-system.md` — princípios de UX/visual + **tokens** (fonte da paleta, tipografia, espaçamento, raios).
- `@.context/product/product-tone-of-voice.md` — voz/vocabulário (governa UX copy, labels, mensagens de erro).
- `@.context/business/business-icp.md` — para quem é (JTBD/contexto de uso) — informa densidade, tom, prioridades.

Se algum desses docs **não existir** no projeto, **ofereça criá-los** via `/devflow:knowledge` (tipos `product-design-system`, `product-tone-of-voice`, `business-icp`) antes de prosseguir — o design fica ancorado na realidade do negócio, não em suposição.

## Os 23 modos

Cada modo tem um playbook em `references/<modo>.md`. Sem argumento, analise sinais do projeto e recomende 2–3 próximos passos; pedido ambíguo → mapeie a intenção (ex.: "arruma as cores" → `colorize`).

| Grupo | Modos |
|---|---|
| **Build** | `craft` · `shape` · `init` · `document` · `extract` |
| **Evaluate** | `critique` · `audit` |
| **Refine** | `polish` · `bolder` · `quieter` · `distill` · `harden` · `onboard` |
| **Enhance** | `animate` · `colorize` · `typeset` · `layout` · `delight` · `overdrive` |
| **Fix** | `clarify` · `optimize` · `adapt` |
| **Iterate** | `live` |

- `init` — bootstrap do subsistema de design no projeto (register brand/product, scaffold do knowledge, waivers). Ver `references/init.md`.
- `live` — iteração ao vivo no navegador via bridge (`scripts/design/live-bridge.mjs`, `npx impeccable@<pinned>` consent-gated, hard-gate de feature branch). Ver `references/live.md`.

## Princípios de design que o linter NÃO cobre (guidance)

Os Standards determinísticos pegam os "AI tells" decidíveis por parsing estático. As regras abaixo exigem **DOM renderizado / estilo computado / cross-file / tokens** — por isso são **guidance** aqui, não linter (ver `docs/design-rules-classification.md`). Aplique-as no `critique`/`audit`:
- **Contraste & cor** — texto sobre fundo com contraste real ≥ 4.5:1 (avaliar cor resolvida pela cascade, não só a literal); evitar cinza-sobre-cor de baixo contraste.
- **Legibilidade renderizada** — comprimento de linha ~65–75ch de fato renderizado; leading confortável; sem texto encostando na borda do viewport; sem overflow/clip cortando conteúdo.
- **Hierarquia** — um `<h1>`, sem pular níveis (considerando a página montada, não só o componente); h1 não desproporcionalmente grande vs viewport.
- **Composição** — sem cards aninhados sem propósito; sem pilha de tiles de ícone genéricos; sem eyebrow-chip antes de todo hero.
- **Design system** — fonte/cor/raio conferidos contra os **tokens** do `product-design-system` (coerência cross-file), não valores soltos.

## Relação com os Standards determinísticos

- Enforcement automático pelos linters no `post-tool-use` (sem hook novo): `std-design-antipatterns` (slop), `std-visual-quality` (legibilidade/layout estáticos), `std-accessibility` (a11y, incl. skipped-heading/tiny-text).
- **Um único sistema de waiver** (o dos Standards). Esta skill orienta; os linters barram mecanicamente. Complementares, sem duplicar.

## Atribuição

Orientação e regras derivadas de [pbakaus/impeccable](https://github.com/pbakaus/impeccable) (Apache-2.0), que credita a "Anthropic frontend-design skill". Preservar o `NOTICE`.

---
id: std-feature-sliced-design
description: Feature-Sliced Design 2.x como organização por layers na camada Frontend
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-feature-sliced-design-frontend"]
enforcement:
  linter: standards/machine/std-feature-sliced-design.js
weakStandardWarning: true
---
# Standard: feature-sliced-design
## Princípios
Adotar **Feature-Sliced Design 2.x** como organização canônica de `apps/web/src/`. Layers fixos top-down: `app → pages → widgets → features → entities → shared`. Cada layer composto por **slices** (domínio); cada slice por **segments** (`ui`, `model`, `api`, `lib`, `config`). Regra de dependência: módulo em layer N importa apenas de layer < N. Slices do mesmo layer não se importam entre si — composição sobe pelo layer superior. Atomic Design vive **dentro** de `shared/ui` (atoms/molecules) e `widgets/ui` (organisms); FSD governa macro, Atomic governa micro. `processes` omitido (deprecado em 2.x). Public API por slice via `index.ts` barrel.

```
apps/web/src/
  app/         → providers, router, global styles
  pages/       → route compositions (mapeia route groups Next)
  widgets/     → blocos compostos (header, sidebar, dashboard)
  features/    → interações de usuário (auth, search, upload)
  entities/    → modelos de domínio (user, resource, item)
  shared/      → ui kit, lib, api client, config
```
## Anti-patterns
| Errado | Certo |
|---|---|
| importar de layer superior ou de slice irmã no mesmo layer | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| usar `processes/` (deprecado em FSD 2.x) | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| colocar lógica de domínio em `shared/` — `shared` é agnóstico | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-feature-sliced-design.js` verifica:

1. rejeitar PR com import cross-slice ou upward (layer N → layer >N)
2. `@feature-sliced/steiger` configurado em `steiger.config.ts` (regras `fsd/public-api`, `fsd/no-cross-imports`, `fsd/insignificant-slice`)
3. `vitest` colocaliza spec ao lado do segment (`features/auth/model/login.test.ts`)
4. Validation phase exige `pnpm steiger ./src` com zero erros

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-feature-sliced-design-frontend (`021-adr-feature-sliced-design-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [FSD — Overview](https://feature-sliced.design/docs/get-started/overview) · [FSD — Layers Reference](https://feature-sliced.design/docs/reference/layers) · [FSD — Slices and Segments](https://feature-sliced.design/docs/reference/slices-segments)
Authoring guide: `.context/standards/README.md`

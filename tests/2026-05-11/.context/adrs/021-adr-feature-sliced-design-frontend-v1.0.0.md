---
type: adr
name: adr-feature-sliced-design-frontend
description: Feature-Sliced Design 2.x como organização por layers na camada Frontend
scope: organizational
source: local
stack: Feature-Sliced Design 2.x
category: arquitetura
status: Aprovado
version: 1.0.0
created: 2026-05-11
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: ""
---

# ADR — Feature-Sliced Design 2.x como Organização por Layers no Frontend

- **Data:** 2026-05-11
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Feature-Sliced Design 2.x
- **Categoria:** Arquitetura

---

## Contexto

Frontend Next 16 + React 19 + TS 5.9 + Tailwind 4 + shadcn/ui + Tauri 2 + Zustand 5 em monorepo Turborepo. Crescimento esperado: dezenas de route groups, múltiplas features cross-cutting, shell desktop + web compartilhando UI. Estrutura plana `components/` + `lib/` colapsa: imports cíclicos, acoplamento bidirecional entre features, módulos de UI dependendo de regras de aplicação, dificuldade de tree-shaking por package. AI-first agrava: agentes precisam de fronteiras explícitas para escopo de edição, senão alucinam acoplamento. Necessário: hierarquia unidirecional, fronteiras de import verificáveis, isolamento de slice, segments previsíveis para navegação humana e por IA.

## Decisão

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

## Alternativas Consideradas

- **Plano (`components/`+`lib/`+`hooks/`)** — baixa cerimônia; colapsa com escala, sem fronteira verificável.
- **Atomic Design puro** — bom para UI kit; não modela domínio nem fluxo de dependência.
- **DDD bounded contexts no front** — semântica forte; overhead alto para UI, contextos de back ≠ slices de UI.
- **Nx libs por feature** — isolamento via build graph; lock-in Nx, fricção com Turborepo + Next App Router.
- **Feature-Sliced Design 2.x** ✓ — hierarquia explícita, regra de import unidirecional verificável por lint, slices isoladas, segments previsíveis, comunidade ativa e doc canônica versionada.

## Consequências

**Positivas**
- Regra de import unidirecional → ciclos impossíveis por construção
- Slices isoladas → refactor local, blast radius previsível
- Segments fixos (`ui/model/api/lib`) → onboarding rápido, agentes navegam determinístico
- Public API por barrel → tree-shaking estável, refactor interno livre
- Composição via layer superior → reuso sem acoplamento horizontal

**Negativas**
- Curva inicial: equipe precisa internalizar layers + slices vs Atomic
- Pasta `pages/` FSD ≠ Next pages router (App Router em `app/` Next, FSD `pages/` em `src/pages/`) — risco de confusão
- Barrel files podem inflar bundle se mal configurados (export *)

**Riscos aceitos**
- Slice cross-layer tentadora em emergência → enforcement via lint, não disciplina

## Guardrails

- SEMPRE respeitar hierarquia `app > pages > widgets > features > entities > shared`
- SEMPRE expor slice via `index.ts` (Public API); imports externos apontam para o barrel
- NUNCA importar de layer superior ou de slice irmã no mesmo layer
- NUNCA usar `processes/` (deprecado em FSD 2.x)
- NUNCA colocar lógica de domínio em `shared/` — `shared` é agnóstico
- QUANDO componente compõe múltiplas features, ENTÃO mora em `widgets/`
- QUANDO regra de negócio é reutilizada por features, ENTÃO sobe para `entities/`
- QUANDO segment cresce além de 1 arquivo, ENTÃO vira pasta com `index.ts`

## Enforcement

- [ ] Code review: rejeitar PR com import cross-slice ou upward (layer N → layer >N)
- [ ] Lint: `@feature-sliced/steiger` configurado em `steiger.config.ts` (regras `fsd/public-api`, `fsd/no-cross-imports`, `fsd/insignificant-slice`)
- [ ] Teste: `vitest` colocaliza spec ao lado do segment (`features/auth/model/login.test.ts`)
- [ ] Gate CI/PREVC: Validation phase exige `pnpm steiger ./src` com zero erros

## Evidências / Anexos

**Fontes oficiais:** [FSD — Overview](https://feature-sliced.design/docs/get-started/overview) · [FSD — Layers Reference](https://feature-sliced.design/docs/reference/layers) · [FSD — Slices and Segments](https://feature-sliced.design/docs/reference/slices-segments)

```ts
// exemplo minimal — slice feature/auth com Public API e import unidirecional
// features/auth/index.ts (Public API barrel)
export { LoginForm } from "./ui/login-form";
export { useAuth } from "./model/use-auth";

// features/auth/model/use-auth.ts
import { userApi } from "entities/user";       // OK — layer inferior
import { http } from "shared/api";             // OK — shared
// import { Header } from "widgets/header";   // PROIBIDO — upward
// import { Search } from "features/search";  // PROIBIDO — cross-slice

export function useAuth() {
  return { login: (u: string, p: string) => userApi.login(u, p) };
}
```

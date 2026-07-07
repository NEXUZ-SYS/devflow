---
type: adr
name: external-design-toolkit-absorption
description: Integrar toolkits de design externos por absorção-nativa (regra→Standard, guidance→skill) + bridge de runtime opcional, nunca vendorizar/auto-instalar.
scope: organizational
source: local
stack: universal
category: arquitetura
status: Proposto
version: 1.0.0
created: 2026-07-02
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Toolkits de design externos entram por absorção-nativa — regra→Standard bundled, guidance→skill que consome knowledge — + bridge de runtime opcional consent-gated; nunca vendorizar no core nem auto-instalar."
---

# ADR — Absorção-nativa de toolkits de design externos (caso: impeccable)

- **Data:** 2026-07-02
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Arquitetura

---

## Contexto

impeccable (Apache-2.0): guia de design para agentes de IA — 1 skill, 23 comandos, iteração ao vivo no navegador, 45 regras determinísticas de detecção de front-end. DevFlow já tem: Standards com linters (ADR-002), knowledge DDC (ADR-006), `std-accessibility` default, e `product-context` delegando "à skill de design-system do projeto". Instalar o upstream cru colide: hook PostToolUse próprio, waivers paralelos, trigger-space de skill, a11y duplicada. Falta política de como absorver toolkits externos sem reproduzir esses conflitos.

## Decisão

Absorver toolkits de design externos pelo modelo **Híbrido**: (a) regras determinísticas → linters de **Standards bundled** (contrato `filePath → VIOLATION → exit 1`) disparando no `post-tool-use` existente; (b) guidance → **skill DevFlow** que CONSOME o knowledge (`product-design-system`/`tone-of-voice`/ICP), corpo adaptado sob atribuição Apache-2.0; (c) runtime opcional (`live`) → **bridge efêmero** `npx impeccable@<pinned>`, consent-gated; (d) distribuição default-bundled gated por globs de front-end, ativação por auto-detecção; (e) artefatos que já são canais próprios do upstream (extensão Chrome) → referenciados. Não vendorizar o código upstream no core; não auto-instalar dependência externa.

## Alternativas Consideradas

- **Vendorizar upstream + bridge** — roda o código do impeccable; dois sistemas acoplados, Node≥24 no core, drift de versão, hook próprio ativo.
- **Absorver 100% nativo** — reescreve toda a guidance do zero; independência máxima, custo alto (re-derivar 23 refs de design).
- **Híbrido** ✓ — absorve o determinístico como Standards + reaproveita a guidance adaptada; runtime opcional via bridge. Menor acoplamento com maior reuso.

## Consequências

**Positivas**
- acoplamento externo mínimo (só `live`, opt-in); um único sistema de waiver; sem hook novo (reusa `post-tool-use`).
- conforme ADR-002 (regra=linter), ADR-006 (consome knowledge), ADR-007 (.js bundled-only).
- padrão reutilizável para futuras absorções de toolkits externos.

**Negativas**
- sync manual das regras portadas (drift do upstream).
- guidance adaptada exige manutenção própria.

**Riscos aceitos**
- drift upstream → versão fixada (`@<pinned>`) + procedimento de re-sync documentado.
- sobreposição de a11y → delegada ao `std-accessibility` existente (não reimplementa).

## Guardrails

- SEMPRE implementar regra de detecção de design determinística como linter de Standards (`filePath → VIOLATION → exit 1`), nunca motor paralelo ou hook próprio.
- SEMPRE distribuir o linter como `.js` bundled-only (anti-RCE); os `.md` sincronizam com o repo standalone `devflow-standards`.
- SEMPRE a skill de design CONSOME o knowledge (`product-design-system`/`tone-of-voice`/ICP) via `@.context/...`; NUNCA duplica esse conteúdo.
- NUNCA auto-instalar a dependência externa (CLI): QUANDO ausente, ENTÃO propor o comando com consentimento e no-op se offline.
- NUNCA reconstruir artefatos que já são canais próprios do upstream (ex.: extensão Chrome) — referenciar.
- QUANDO a skill de design puder competir por ativação com prompts genéricos de UI, ENTÃO restringir o trigger a invocação explícita ou delegação de `product-context`.

## Enforcement

- [ ] Code review: regra de design nova é um linter em `assets/standards/machine/*.js`, não hook/motor próprio.
- [ ] Lint: `std-design-*` validado pelo sandbox SI-4 (`scripts/lib/run-linter.mjs`); contrato `VIOLATION`/`exit 1`.
- [ ] Teste: fixtures positivo/negativo 1:1 por regra portada; smoke do bridge (guard de branch + gate Node + no-op se ausente).
- [ ] Gate CI/PREVC: `version-guard` barra bump manual; sync `.md`→standalone no release; `NOTICE` de atribuição presente.

## Evidências / Anexos

**Fontes oficiais:** [pbakaus/impeccable](https://github.com/pbakaus/impeccable) · [impeccable.style](https://impeccable.style)

```js
// std-design-antipatterns.js — padrão de linter de Standard (não hook próprio, sem LLM)
import { readFileSync } from 'node:fs';
const src = readFileSync(process.argv[2], 'utf8');
// regra determinística portada (ex.: gradient-text) — parsing estático
if (/-webkit-background-clip:\s*text/i.test(src) && /linear-gradient/i.test(src)) {
  console.log('VIOLATION: gradient-text — texto com gradiente é "AI tell"; use cor sólida (contraste ≥4.5:1)');
  process.exit(1);
}
process.exit(0);
```

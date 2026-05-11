---
id: std-llm-claude
description: Anthropic Claude Sonnet 4.6 / Opus 4.6 como provider PT-BR e reasoning na camada BFF
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-llm-claude-bff"]
enforcement:
  linter: standards/machine/std-llm-claude.js
weakStandardWarning: true
---
# Standard: llm-claude
## Princípios
Adotar **Anthropic Claude** como provider primário para reasoning e PT-BR no BFF. **Sonnet 4.6** default (latência/custo); **Opus 4.6** para reasoning complexo (planning, multi-step tool use). Acesso exclusivo via Mastra Model Router (`@ai-sdk/anthropic` provider) — nunca SDK Anthropic direto em route handlers. Streaming + tool use via protocolo AG-UI exposto ao Frontend.

```
app/api/<slice>/route.ts                → streamText({ model: router.select('reasoning') })
packages/router/src/providers/          → anthropic.ts (Sonnet 4.6 + Opus 4.6)
packages/router/src/policies/           → escolha por task: 'reasoning' | 'cheap' | 'pt-br'
packages/contracts/llm/                 → Zod schemas de tool input/output
```
## Anti-patterns
| Errado | Certo |
|---|---|
| hardcode de modelo (`claude-sonnet-4-6`) fora de `packages/router/src/providers/` | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| expor `ANTHROPIC_API_KEY` a código client-side ou logs | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-llm-claude.js` verifica:

1. rejeitar `import` direto de `@anthropic-ai/sdk` fora do router
2. regra `no-restricted-imports` proíbe SDK Anthropic em `app/api/**`
3. contract tests do router validam policies → modelos; mocks de provider via MSW
4. secret scan bloqueia commit com `sk-ant-`; observability layer captura latência/custo por policy

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-llm-claude-bff (`012-adr-llm-claude-bff-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Anthropic — Welcome](https://docs.anthropic.com/en/docs/welcome) · [Anthropic API — Getting Started](https://docs.anthropic.com/en/api/getting-started) · [Vercel AI SDK — Anthropic Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
Authoring guide: `.context/standards/README.md`

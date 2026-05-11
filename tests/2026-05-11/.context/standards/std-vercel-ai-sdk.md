---
id: std-vercel-ai-sdk
description: Vercel AI SDK 6.x como SDK universal para LLMs na camada Frontend
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-vercel-ai-sdk-frontend"]
enforcement:
  linter: standards/machine/std-vercel-ai-sdk.js
weakStandardWarning: true
---
# Standard: vercel-ai-sdk
## Princípios
Adotar **Vercel AI SDK 6.x** como única camada de integração LLM no Frontend. Hooks `useChat`/`useCompletion`/`useObject` consomem rotas BFF (`app/api/**`) que retornam streams compatíveis. Protocolo AG-UI v6 transporta tool calls, partial state e UI components. Provider-agnostic: troca de modelo via Mastra Router no BFF não impacta Frontend. Sem `fetch` manual para LLM; sem parse de SSE customizado.

```
apps/web/src/features/{slice}/ui/        → useChat({ api: '/api/<slice>/chat' })
apps/web/src/features/{slice}/model/     → tool/UI message handlers (z.infer)
app/api/<slice>/chat/route.ts (BFF)      → streamText() + Mastra Router
packages/contracts/ag-ui/                → schemas AG-UI (Zod)
```
## Anti-patterns
| Errado | Certo |
|---|---|
| fazer parse manual de SSE/stream em componentes | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| importar SDKs de provider (`@ai-sdk/anthropic`, `@ai-sdk/openai`) no Frontend | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-vercel-ai-sdk.js` verifica:

1. rejeitar PR com `fetch('/api/.../chat')` manual ou SSE parser custom
2. regra import — `@ai-sdk/anthropic`/`@ai-sdk/openai` proibidos em `apps/web/**`
3. Vitest + MSW mocka stream AG-UI; Playwright valida render incremental
4. Validation phase roda contract test contra schemas AG-UI

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-vercel-ai-sdk-frontend (`011-adr-vercel-ai-sdk-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:** [Vercel AI SDK — Documentation](https://ai-sdk.dev/docs/introduction) · [Vercel AI SDK — GitHub](https://github.com/vercel/ai) · [Vercel AI SDK — UI Reference](https://ai-sdk.dev/docs/ai-sdk-ui/overview)
Authoring guide: `.context/standards/README.md`

---
id: std-vercel-ai-sdk
description: Vercel AI SDK 6.0.0 como SDK universal para LLMs na camada Frontend (streaming, tools, AG-UI)
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-vercel-ai-sdk-frontend"]
enforcement:
  linter: standards/machine/std-vercel-ai-sdk.js
weakStandardWarning: true
---
# Standard: vercel-ai-sdk
## Princípios
Adotar **Vercel AI SDK 6.0.0** como SDK universal de LLM na camada Frontend. `@ai-sdk/react` para hooks (`useChat`, `useCompletion`, `useObject`); UI Message Stream Protocol como contrato de wire entre BFF e cliente. Tools tipadas via Zod; renderização AG-UI a partir de `parts[]` discriminados. `experimental_useObject` para streaming de objetos validados por Zod. Provider-agnostic: cliente nunca conhece o LLM concreto — apenas o endpoint do BFF.
## Anti-patterns
| Errado | Certo |
|---|---|
| importar provider SDK (`@anthropic-ai/sdk`, `openai`) na camada Frontend — apenas o BFF os conhece. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| bypass do `transport` customizado para auth/headers — usar a API oficial. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-vercel-ai-sdk.js` verifica:

1. bloqueia `fetch('/api/chat')` cru e imports de provider SDK fora do BFF.
2. ESLint regra `no-restricted-imports` proíbe `@anthropic-ai/sdk`, `openai`, `@google/genai` em `apps/web/**`.
3. Vitest + Testing Library + MSW cobrem `useChat` com mock de UI Message Stream; Playwright cobre cancelamento de stream.
4. Gate PREVC: build CI executa typecheck contra contratos Zod compartilhados; major bump aciona ADR-evolve.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-vercel-ai-sdk-frontend (`011-adr-vercel-ai-sdk-frontend-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Vercel AI SDK Docs](https://ai-sdk.dev/docs)
- [@ai-sdk/react Reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui)
- [UI Message Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [Vercel AI SDK GitHub](https://github.com/vercel/ai)
Authoring guide: `.context/standards/README.md`

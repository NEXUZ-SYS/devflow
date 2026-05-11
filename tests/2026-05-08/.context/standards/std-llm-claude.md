---
id: std-llm-claude
description: Anthropic Claude (Sonnet 4.6 / Opus 4.6) como provider PT-BR e reasoning na camada BFF
version: 1.0.0
applyTo: []
relatedAdrs: ["adr-llm-claude-bff"]
enforcement:
  linter: standards/machine/std-llm-claude.js
weakStandardWarning: true
---
# Standard: llm-claude
## Princípios
Adotar **Claude Sonnet 4.6** como provider default para tarefas de reasoning e PT-BR no BFF; **Claude Opus 4.6** reservado para extended thinking e tarefas long-horizon. Acesso exclusivamente via `@ai-sdk/anthropic` integrado ao Mastra Model Router — nunca via `@anthropic-ai/sdk` cru fora do harness. Tool use tipado via Zod (`tool({ inputSchema })`); streaming via UI Message Stream Protocol do AI SDK. Server Tools (`web_search`, `code_execution`) habilitadas seletivamente por workflow. API keys exclusivamente do Secret Manager; nunca em env literal.
## Anti-patterns
| Errado | Certo |
|---|---|
| hardcode de model id em handler — sempre via configuração do router (`tasks.reasoning.default`). | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
| expor `ANTHROPIC_API_KEY` em logs, traces ou client-side bundle. | Aplicar a alternativa explicitada na ADR (Decisão / Enforcement) |
## Linter
`./machine/std-llm-claude.js` verifica:

1. bloqueia import de `@anthropic-ai/sdk` em `app/api/**`; exige uso do Mastra Router.
2. ESLint `no-restricted-imports` para `@anthropic-ai/sdk`; regra custom para hardcode de model id.
3. Vitest com mock do AI SDK Provider cobrindo tool calls; suíte de golden prompts em PT-BR.
4. Gate PREVC: smoke-test contra modelo real em CI nightly; alarme de custo/token via observabilidade.

Output em formato `VIOLATION: <regra> (<file>:<line>) — <correção sugerida>` per SI-4 contract.
## Referência
ADRs derivadas:
- adr-llm-claude-bff (`012-adr-llm-claude-bff-v1.0.0.md`)
Fontes oficiais (consolidadas das ADRs):

**Fontes oficiais:**
- [Anthropic Claude API Docs](https://docs.anthropic.com/en/api/overview)
- [Anthropic Models](https://docs.anthropic.com/en/docs/about-claude/models)
- [@ai-sdk/anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
- [Mastra Model Routing](https://mastra.ai/docs/agents/agent-overview)
- [Anthropic SDK GitHub](https://github.com/anthropics/anthropic-sdk-typescript)
Authoring guide: `.context/standards/README.md`

---
title: Harness Engineering
category: ai
version: n/a (disciplina, não produto)
last_updated: 2026-05-20
status: active
upstream:
  - https://www.anthropic.com/research/building-effective-agents
  - https://openai.com/index/practices-for-governing-agentic-ai-systems
  - https://eugeneyan.com/writing/llm-patterns/
  - https://huyenchip.com/books/ (Chip Huyen — AI Engineering)
---

# Harness Engineering

> **Nota de disambiguação.** Este documento trata de **Harness Engineering** no sentido de **disciplina de engenharia de harnesses para LLMs e agentes** — a "concha" de software que envolve um modelo bruto para transformá-lo em um sistema confiável (prompts, tools, memory, retrieval, guardrails, evals, observability, error handling, governance de custo). **Não** se refere ao produto comercial Harness.io (CI/CD). Qualquer menção a "Harness" daqui em diante significa o harness do agente/LLM.

## Conceito

Um **harness** é tudo que envolve o modelo de linguagem: o system prompt, o contexto montado a cada turno, as tools expostas, a memory store, o retrieval, os guardrails de input e output, o eval loop, a observability, o error handling, o retry, os rate limits e o orçamento de custo. O modelo em si é commodity intercambiável; o harness é onde o valor de produto, a diferenciação e a confiabilidade vivem.

Cursor, Claude Code, Devin, Perplexity e a maioria dos produtos de IA bem-sucedidos não são diferenciados pelo modelo subjacente, mas pelo harness construído ao redor dele. A literatura canônica (Anthropic "Building effective agents", OpenAI "Practices for Governing Agentic AI Systems", Eugene Yan "Patterns for Building LLM-based Systems & Products", Chip Huyen "AI Engineering") converge nesse princípio: **investir no harness, não no modelo**.

## Camadas de um harness

Um harness completo tem oito camadas. Nem todo produto precisa de todas — a complexidade da camada deve seguir o requisito do produto (ver "Quando NÃO complicar").

### 1. Prompt layer

- System prompts versionados em git, nunca em string literal solta no código.
- Prompt templates com composição explícita: `instructions` + `context` + `examples` + `user_input`.
- Few-shot examples gerenciados como dataset, não inline em prosa.
- Separação clara de papéis: `system`, `user`, `assistant`, `tool` — sem misturar instruções do desenvolvedor dentro do turno do usuário.
- Hierarquia de instruções: system > developer > user (instruction hierarchy) para mitigar prompt injection.

### 2. Context layer

- Retrieval (RAG) via embeddings em vector store. No projeto: `pgvector` — ver `@stacks/database/pgvector` (pendente).
- Summarization de threads longas para caber na janela.
- Context window management: truncation strategies, prioridade por recência e relevância, pruning de turnos antigos.
- Memory tiers:
  - **Short-term thread memory** — turnos da conversa atual.
  - **Long-term vector memory** — fatos persistentes recuperados por similaridade.
  - **Working memory** — scratchpad do agente entre turnos.
- Para primitivos de memory e retrieval em workflows complexos, ver `@stacks/ai/mastra-sdk`.

### 3. Tool/Action layer

- Tool registry centralizado; cada tool tem schema Zod de parâmetros e output — ver `@stacks/validation/zod@4`.
- MCP (Model Context Protocol) servers/clients para tools reutilizáveis cross-agent.
- Tool selection: quando o catálogo passa de ~10 tools, adote **router pattern** (sub-agentes especializados) em vez de expor tudo ao modelo principal.
- Parallel tool calls quando o provider suporta e as chamadas são independentes.
- Tool result formatting: JSON estruturado, nunca prosa livre.
- Side-effect isolation: tools destrutivas separadas de tools de leitura; tools destrutivas exigem confirmação humana (ver camada de guardrails).

### 4. Decision layer

- Agent loop com `maxSteps` obrigatório — sem cap, custo e latência divergem.
- Padrões reconhecidos:
  - **ReAct** — reasoning + acting intercalados.
  - **Plan-Execute** — planejamento explícito antes de execução.
  - **Reflexion** — agente revisita próprio output dado feedback.
- Fallback strategies: retry com backoff, escalação para humano, graceful degradation para resposta sem tools.
- Determinismo vs criatividade: `temperature` baixo (0–0.3) para tarefas de extração/classificação; mais alto apenas para geração criativa.

### 5. Guardrail layer

Input:
- PII detection antes de envio ao provider.
- Prompt injection mitigation: user input sempre dentro de tags XML (`<user_input>...</user_input>`), instruction hierarchy clara, refuse-by-default para instruções dentro do user input.
- Rate limiting por usuário/feature.

Output:
- Structured outputs com schema Zod — ver `@stacks/validation/zod@4`.
- Schema enforcement: se o modelo gerar JSON inválido, retry com erro detalhado em vez de salvar lixo.
- Content moderation e filtros de conteúdo prejudicial.
- Citation/grounding checks: se a resposta deve ser baseada em documentos, validar que citações existem no retrieval set.

Tool gating:
- Allowlist por agente/feature.
- Rate limits por tool.
- `dry_run` mode para tools destrutivas.
- Ver `@rules/security` para política completa de input/output handling.

### 6. Eval layer

- **Golden sets**: exemplos labeled de comportamento esperado.
- **Regression suites** em CI antes de merge de mudanças de prompt ou modelo.
- **LLM-as-judge** calibrado contra anotação humana antes de ser confiável.
- **A/B em produção** via feature flags com métricas de qualidade.
- **Drift detection**: monitorar distribuição de outputs ao longo do tempo.
- Specs com evals como critério de aceitação — ver `@practices/sdd`.
- Evals como gate de deploy — ver `@rules/governance` e `@rules/testing`.

### 7. Observability layer

- Spans OpenTelemetry com atributos `gen_ai.*` (gen_ai.system, gen_ai.request.model, gen_ai.usage.input_tokens, gen_ai.usage.output_tokens, gen_ai.response.finish_reasons).
- Tracing de cada chamada incluindo prompt e response — **com redaction de PII** (ver `@rules/security`, `@rules/observability`).
- Token usage por feature/user/tenant.
- Latency p50/p95/p99 por modelo e por feature.
- Cost attribution: dólares por feature, por usuário, por request.
- Finish reasons (`stop`, `length`, `tool_calls`, `content_filter`) como métrica.
- Retry counts e error rates por provider.

### 8. Error/Cost layer

- Timeouts em todo I/O — ver `@rules/error-handling`.
- Exponential backoff com jitter em retries.
- Fallback model: Pro → Flash → cache → erro tipado.
- Circuit breakers por provider.
- Cost budgets por feature/user com kill-switch automático — ver `@rules/governance`.
- Audit log de mudanças de prompt, modelo e configuração.

## Princípios

### Modelo é commodity, harness é produto

Trocas de modelo (gpt-4o → claude-3.7-sonnet → gemini-2.5-pro) devem ser **configuração**, não rewrite. Adote abstrações cross-provider — ver `@stacks/ai/vercel-ai-sdk`. Use APIs vendor-specific apenas quando a feature exige (ex: Gemini context caching, OpenAI Realtime).

### Determinismo por construção

Structured outputs sempre que possível. Texto livre apenas quando inevitável (chat conversacional, geração criativa). Para qualquer fluxo que alimenta lógica downstream, o output passa por schema Zod.

### Falha visível

Melhor errar com erro tipado do que retornar plausível-mas-errado. LLM-as-judge para flagging de respostas suspeitas. Erros silenciosos em sistemas de IA são piores que em sistemas tradicionais porque parecem corretos.

### Custo e latência como first-class

Orçamento por request, por feature, por usuário. Routing dinâmico: queries simples → modelo barato (Flash, Haiku); complexas → modelo caro (Pro, Opus, Sonnet). Cache de prompt (Anthropic prompt caching, Gemini context caching) sempre que o system prompt é estável.

### Human-in-the-loop em decisões críticas

Aprovação humana antes de tools destrutivas (deletar, enviar email, pagar). Preview antes de commit. Ver `@rules/governance`.

### Reprodutibilidade

`seed` quando o provider suporta. Prompt versionado em git. Dataset de eval versionado. Snapshot de contexto completo em traces — para que qualquer comportamento em produção seja reproduzível em desenvolvimento.

### Reversibilidade

Tools com `dry_run` flag. Mudanças destrutivas com confirmação. Audit log de toda ação tomada pelo agente.

## Composição típica no projeto

| Camada | Ferramenta | Referência |
|---|---|---|
| Modelo (cross-provider) | Vercel AI SDK | `@stacks/ai/vercel-ai-sdk` |
| Agents / workflows / memory / RAG / evals | Mastra | `@stacks/ai/mastra-sdk` |
| Provider direto (features vendor-specific) | OpenAI / Gemini SDK | `@stacks/ai/openai`, `@stacks/ai/gemini`, `@stacks/ai/google-genai-sdk` |
| Vector store | pgvector | `@stacks/database/pgvector` (pendente) |
| Schemas (params + outputs) | Zod 3.23 | `@stacks/validation/zod@4` |
| Observability | OpenTelemetry → Langfuse / Braintrust / SigNoz / Grafana | `@rules/observability` |
| Tools cross-agent | MCP | — |
| Runtime / linguagem | Node 20 / TypeScript 5.4 | `@stacks/runtime/node@24`, `@stacks/language/typescript@6` |
| Frontend (chat UIs, streaming) | Next.js 15 | `@stacks/frontend/next@16` |

## Padrões de harness comuns

- **Router agent** — classifica intent e despacha para sub-agent especializado. Use quando há mais de ~10 tools ou domínios distintos.
- **Critic/Reviewer** — segundo modelo (geralmente mais barato) valida output do primeiro. Use em fluxos críticos.
- **Reflexion** — agente revisita próprio output dado feedback (humano ou automatizado). Use em geração de código, redação longa.
- **Tool-use loop com cap** — `maxSteps` + budget de tokens/custo. Padrão default para qualquer agente com tools.
- **Retrieval-then-generate** — RAG clássico com re-ranking. Use quando a resposta deve ser fundamentada em corpus específico.
- **Plan-then-execute** — planejamento explícito antes de execução. Use em tarefas multi-passo com side effects.

## Quando NÃO complicar

Chat simples ou completion única **não precisa** de harness completo. Adicione camadas conforme requisito:

| Requisito | Camada a adicionar |
|---|---|
| Resposta deve seguir formato | Prompt + Guardrail (structured output) |
| Qualidade crítica | Eval layer |
| Tools destrutivas | Guardrail (gating) + Decision (HITL) |
| Volume de produção | Observability + Error/Cost |
| Contexto que não cabe na janela | Context (retrieval, summarization) |
| Multi-tenant | Memory isolation + cost attribution |
| Trocar de provider | Cross-provider abstraction (Vercel AI SDK) |
| Multi-passo com side effects | Plan-then-execute + audit log |

Overhead injustificado em produto early-stage gera fricção sem retorno. Cresça o harness sob demanda real, não preventivamente.

## Anti-patterns

- **Acoplar produto a um vendor** — rewrite necessário quando trocar modelo. Use abstração cross-provider.
- **Prompts em código sem versionamento** — perde rastreabilidade de regressões; eval impossível.
- **Tools sem schemas/validation** — modelo gera junk; side effects descontrolados. Sempre Zod (`@stacks/validation/zod@4`).
- **Logar prompts/responses inteiros com PII** — vazamento de dados sensíveis. Redaction obrigatória (`@rules/security`, `@rules/observability`).
- **Confiar em texto livre quando structured output resolve** — parsing frágil, regressões silenciosas.
- **Eval só manual ou pós-hoc** — regressões silenciosas em mudanças de prompt. Eval em CI (`@rules/testing`, `@practices/sdd`).
- **Agent loop sem `maxSteps`** — loop infinito; custo descontrolado.
- **Sem fallback** — provider down = feature down. Sempre ter modelo/path alternativo.
- **Cost monitoring ausente** — surpresa de fatura; sem capacidade de detectar abuso (`@rules/governance`).
- **Misturar contexto de tenants/usuários sem isolamento** — vazamento via memory/cache. Memory keys sempre escopadas por tenant.
- **Tratar o modelo como caixa-preta confiável** — sempre validar output; nunca passar texto cru do modelo direto para SQL, shell, ou qualquer interpretador.

## Referências

- Anthropic — "Building effective agents" (anthropic.com/research)
- OpenAI — "Practices for Governing Agentic AI Systems"
- Eugene Yan — "Patterns for Building LLM-based Systems & Products"
- Chip Huyen — "AI Engineering" (livro)
- Modelo de contexto via Model Context Protocol (modelcontextprotocol.io)

## Referências cruzadas no projeto

- `@stacks/ai/vercel-ai-sdk` — camada de modelo cross-provider
- `@stacks/ai/mastra-sdk` — agents, workflows, memory, evals
- `@stacks/ai/openai` — features vendor-specific OpenAI
- `@stacks/ai/gemini` — features vendor-specific Gemini
- `@stacks/ai/google-genai-sdk` — SDK oficial Google GenAI
- `@stacks/validation/zod@4` — schemas de tools e outputs
- `@stacks/database/pgvector` — vector store (pendente)
- `@rules/security` — PII, prompt injection, redaction
- `@rules/observability` — spans `gen_ai.*`, redaction
- `@rules/error-handling` — timeouts, retries, fallback
- `@rules/testing` — evals em CI
- `@rules/governance` — cost budgets, HITL, kill-switch
- `@practices/sdd` — specs com evals como aceitação

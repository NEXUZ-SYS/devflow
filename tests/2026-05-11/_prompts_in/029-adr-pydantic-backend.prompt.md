Crie uma ADR (Architecture Decision Record) para o monorepo nxz.one seguindo o **TEMPLATE-ADR v2.1.0** da skill `devflow:adr-builder` (`assets/TEMPLATE-ADR.md`).

## Contexto da decisao

- **Stack:** Pydantic
- **Versao fixada:** 2.10.x
- **Camada arquitetural alvo:** Camada 3 — Backend
- **Papel nesta camada:** Schema validation runtime Python
- **Categoria:** qualidade-testes
- **Slug sugerido:** adr-pydantic-backend

## Contexto tecnico da Camada 3 (Backend)

Monolito modular FastAPI em Cloud Run (concurrency 80, min-instances > 0). 6 bounded contexts: svc-sales, svc-kitchen, svc-inventory, svc-finance, svc-brain, svc-delivery. Comunicacao cross-domain via Pub/Sub. Triggers reativos (Firestore, Pub/Sub subscribers, Scheduler) ficam em Cloud Functions 2nd gen.

**Stack desta camada:** Python 3.13 + FastAPI 0.135 + Pydantic 2.10 + uv + ruff + pytest + factory-boy + testcontainers + Pub/Sub client v2 + Firestore Admin SDK + BigQuery client v3 + Secret Manager client v2.

## Contexto tecnico geral

Monorepo Turborepo da plataforma nxz.one em 4 camadas arquiteturais:

1. **Frontend** — Next.js 16 + React 19 + TypeScript 5.9 + Tailwind 4 + shadcn/ui + Tauri 2 + FSD + Atomic
2. **BFF** — Route handlers Next + Vercel AI SDK v6 + Mastra Model Router + NXZ Harness + MCP
3. **Backend** — FastAPI 0.135 modular monolith em Cloud Run + Python 3.13 + Pydantic 2.10 + bounded contexts
4. **Dados & Infra** — Firestore (canonico) + BigQuery medallion + Pub/Sub + Firebase App Hosting + Cloud Functions 2nd gen + dbt Core + Terraform

Desenvolvimento AI-first via Claude Code + Team Agents. Contratos em `packages/contracts` (Zod + YAML pareados).

## Identificacao da ADR

- `name: adr-pydantic-backend`
- `description: Pydantic 2.10.x como Schema validation runtime Python na camada Backend`
- `stack: Pydantic`
- `category: qualidade-testes` (`Qualidade & Testes`)
- `scope: organizational`
- `source: local`

> A skill `devflow:adr-builder` aplica e valida o TEMPLATE-ADR v2.1.0 internamente (frontmatter de 14 campos, ordem das secoes, defaults firmes, Hard Rules). Nao redescreva a estrutura — passe apenas contexto + restricoes de dominio abaixo.

## Restricoes absolutas (Hard Rules da skill adr-builder)

- **#4 Nunca desviar do template** — ordem das secoes e schema do frontmatter sao contrato.
- **#5 Status sempre `Proposto` na criacao** — aprovacao e humana via PR.
- **#6 Defaults firmes:** `supersedes: []`, `refines: []`, `protocol_contract: null`, `decision_kind: firm`, `version: 0.1.0` ou `1.0.0`.
- **#7 ADR e arquitetura tecnica pura.** NUNCA mencione:
  - Dominio de negocio (food service, restaurante, franqueado, delivery, cozinha, varejo)
  - Nomes de produtos (NXZ Go, KDS, ERP, Brain, Manager, Intelligence, Onboarding)
  - Operacoes funcionais (fechar venda, imprimir cupom, receber pedido, identificar cliente)
  - Justificativas de negocio (receita, ticket medio, cliente, retencao)

  SEMPRE justifique por: propriedades tecnicas (type safety, fronteira de confianca, idempotencia), ferramental (ecossistema, integracao), feedback loops (AI-first, CI/CD), propriedades arquiteturais (acoplamento, testabilidade, observabilidade).
- **#8 Evidencias APENAS oficiais** — docs do projeto, specs W3C/WHATWG/TC39/IETF (RFCs), repositorio canonico no GitHub, papers com DOI, changelogs oficiais. **PROIBIDO:** Medium, dev.to, Stack Overflow, blogs pessoais, tutoriais de terceiros, YouTube.
- **#9 Sem secao `## Relacionamentos` em prosa** — links vivem exclusivamente em `supersedes`/`refines` no frontmatter.
- **Nomes em exemplos de codigo devem ser neutros:** `Resource`, `Entity`, `User`, `Item`. NUNCA entidades de dominio (`Sale`, `Order`, `Customer`, `Invoice`, `Menu`).

## Densidade

- **80-120 linhas no total** (180 com excecao tabular). Ideal ~100.
- Modo telegrafico — keywords e frases curtas que ativam conhecimento da IA.
- A IA ja conhece SOLID, DDD, design patterns, clean code: NAO explique conceitos. `SRP; funcoes curtas; nomes auto-explicativos` no lugar de "e importante usar funcoes pequenas porque...".
- Se estourar: corte exemplos duplicados -> comentarios em codigo -> bullets redundantes em Consequencias -> prosa em Contexto.

## Regras finais

- Portugues brasileiro em textos livres.
- Exemplo de codigo usa SDK/API correto desta camada (ex: Firebase Web SDK no Frontend, Admin SDK no BFF/Backend).
- Marcar a alternativa escolhida com `✓`, nao `(escolhida)`.
- Incremente `version` semver: minor em revisao de conteudo, major quando status muda `Proposto` -> `Aprovado`.

## Saida

- **Filename:** `<NNN>-adr-pydantic-backend-v1.0.0.md` onde `<NNN>` e o proximo numero 3-digitos zero-padded.
  - Resolver via `node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-update-index.mjs --next-number` quando disponivel.
  - Se nao disponivel, listar `.context/docs/adrs/` e usar o proximo numero.
- **Path obrigatorio (HARD-GATE da skill):** `.context/docs/adrs/`
- NAO salvar em `docs/adrs/`, `adrs/`, `.context/adrs/` ou qualquer outro lugar.
- Apos gerar, regenerar o indice: `node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-update-index.mjs`.
- Validar com auditoria: `node ${CLAUDE_PLUGIN_ROOT}/scripts/adr-audit.mjs <arquivo> --enforce-gate`.

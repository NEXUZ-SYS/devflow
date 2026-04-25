<!-- EXPECTED:
1: PASS
2: PASS
3: PASS
4: PASS
5: PASS
6: PASS
7: PASS
8: PASS
9: PASS
10: PASS
11: PASS
12: PASS
-->
---
type: adr
name: zod-validation-api-boundaries
description: Adoção de Zod como camada de validação de entrada nas bordas da API backend (post-patch)
scope: organizational
source: local
stack: TypeScript
category: qualidade-testes
status: Aprovado
version: 1.0.1
created: 2026-04-24
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR — Zod nas bordas da API

- **Data:** 2026-04-24
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** TypeScript
- **Categoria:** Qualidade & Testes

---

## Contexto

Handlers de rotas aceitam payloads JSON sem validação estrutural. Erros de tipo chegam ao domínio como `any`. Stack trace aponta para desserialização, não para entrada.

## Decisão

Adotar Zod como única ferramenta de validação na borda HTTP. Schema é fonte de verdade do tipo TypeScript via `z.infer`. Falha de parse retorna 400 com detalhe estrutural.

## Alternativas Consideradas

- **Validação manual** — propenso a esquecimento, sem inferência de tipo
- **class-validator + DTO classes** — duplica schema vs tipo, decoradores opacos
- **Zod** ✓ — single source of truth, parse strict, ergonomia funcional

## Consequências

**Positivas**
- Tipagem inferida → DRY entre runtime e compile-time
- Error chain claro → 400 detalhado, debug rápido

**Negativas**
- Schema verboso para payloads grandes
- Aprender API funcional (compose, refinement)

**Riscos aceitos**
- Custo de runtime parse → mitigado por throw-on-strict-mode

## Guardrails

- SEMPRE definir Zod schema para todo handler que recebe body/query/params
- NUNCA tipar payload de entrada como `any` ou `unknown` sem schema
- QUANDO schema mudar, ENTÃO incrementar `version` no contract OpenAPI

## Enforcement

- [ ] Code review: handler sem `parse()` → bloquear
- [ ] Lint: regra ESLint `no-untyped-handlers`
- [ ] Teste: contract test valida schema vs OpenAPI

## Evidências / Anexos

**Fontes oficiais:** [Zod docs](https://zod.dev/) · [TypeScript handbook](https://www.typescriptlang.org/docs/)

```ts
const CreateOrderSchema = z.object({ items: z.array(z.string().uuid()).min(1) });
type CreateOrder = z.infer<typeof CreateOrderSchema>;
```

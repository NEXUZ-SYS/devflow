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
description: Adoção de Zod como camada de validação de entrada nas bordas da API backend
scope: organizational
source: local
stack: TypeScript
category: qualidade-testes
status: Proposto
version: 1.0.0
created: 2026-04-24
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
---

# ADR — Zod nas bordas da API

- **Data:** 2026-04-24
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** TypeScript
- **Categoria:** Qualidade & Testes

---

## Contexto

Handlers de rotas aceitam payloads JSON sem validação estrutural. Erros de tipo chegam ao domínio como `any`. Stack trace aponta para desserialização, não para entrada. Custo de debug desproporcional.

## Decisão

Zod como validador único de entrada HTTP e message queue. Schema Zod vira fonte de verdade; tipos TypeScript derivam via `z.infer`. Sem validação duplicada em camadas internas.

## Alternativas Consideradas

- **io-ts** — API de combinators densa, curva de aprendizado alta
- **class-validator** — decorator-based, incompatível com functional style do projeto
- **Zod** ✓ — API fluente, inferência de tipo automática, ecossistema maduro

## Consequências

**Positivas**
- Erros de entrada → 400 estruturado antes do handler
- Tipos derivados eliminam drift schema/type
- Error message legível para cliente

**Negativas**
- Runtime cost de validação (mitigável com schema compilation)
- Curva inicial para devs não familiarizados com combinators

**Riscos aceitos**
- Schema drift entre Zod e OpenAPI → gerar OpenAPI a partir do Zod (`zod-to-openapi`)

## Guardrails

- SEMPRE validar payload de entrada com Zod no primeiro handler da rota
- NUNCA aceitar `any` ou `unknown` derivado de `JSON.parse` sem passar por schema
- QUANDO novo endpoint, ENTÃO schema Zod obrigatório antes do controller

## Enforcement

- [ ] Code review: PRs com novo endpoint exigem schema Zod correspondente
- [ ] Lint: regra ESLint custom proibindo `JSON.parse` direto em handlers
- [ ] Teste: fixtures de request inválido testam rejeição 400
- [ ] Gate CI: testes de contrato rodam em toda PR

## Evidências / Anexos

**Fontes oficiais:** [Zod docs](https://zod.dev) · [RFC 9457](https://datatracker.ietf.org/doc/html/rfc9457)

```typescript
const CreateUser = z.object({
  email: z.string().email(),
  age: z.number().int().min(0),
});
app.post('/users', (req, res) => {
  const parsed = CreateUser.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  // parsed.data é tipado
});
```

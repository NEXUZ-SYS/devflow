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
name: rfc7807-http-error-format
description: Padronização de erros HTTP como RFC 7807 Problem Details em todas as APIs internas
scope: organizational
source: local
stack: universal
category: protocol-contracts
status: Proposto
version: 1.0.0
created: 2026-04-24
supersedes: []
refines: []
protocol_contract: ProblemDetailsV1
decision_kind: firm
---

# ADR — RFC 7807 como formato de erro

- **Data:** 2026-04-24
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Protocol Contracts

---

## Contexto

Cada microserviço retorna erros em formato próprio. Cliente frontend tem switch de parsing por serviço. Observability agrega mal — campos de erro incoerentes entre traces.

## Decisão

**RFC 7807 (Problem Details)** como content-type obrigatório para todas as respostas HTTP 4xx/5xx. Campos mínimos: `type`, `title`, `status`, `detail`. Extensões opcionais: `instance`, `errors` (para validação).

## Alternativas Consideradas

- **JSON:API errors** — mais verboso, foco em recursos, excesso para APIs internas
- **Formato custom "padrão da empresa"** — reinventar roda, sem tooling externo
- **RFC 7807** ✓ — spec IETF estável, bibliotecas em toda stack, semântica clara

## Consequências

**Positivas**
- Observability agrupa erros por `type` URI
- Cliente frontend: um único parser de erro
- Interoperabilidade com tooling externo (Postman, APM)

**Negativas**
- Migração de serviços legados é manual (5 serviços)

**Riscos aceitos**
- `type` como URI exige curadoria — governar via registry interno

## Guardrails

- SEMPRE retornar 4xx/5xx em `application/problem+json` conforme **RFC 7807**
- NUNCA retornar erro como string plain text ou HTML
- QUANDO campo `type`, ENTÃO URI resolvível no registry interno

## Enforcement

- [ ] Code review: middleware de erro central vira boilerplate
- [ ] Lint: regra custom detecta `res.status(4xx).send(string)`
- [ ] Teste: contract test valida content-type e schema de erro
- [ ] Gate CI: OpenAPI spec valida formato de response

## Evidências / Anexos

**Fontes oficiais:** [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) · [RFC 9457](https://datatracker.ietf.org/doc/html/rfc9457)

```json
{
  "type": "https://errors.example/auth/invalid-token",
  "title": "Invalid authentication token",
  "status": 401,
  "detail": "Token expired at 2026-04-24T10:00:00Z",
  "instance": "/api/v1/users/me"
}
```

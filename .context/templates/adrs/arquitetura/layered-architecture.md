---
type: adr
name: layered-architecture
description: Arquitetura em camadas — Controller-Service-Repository com regras de dependencia
scope: organizational
source: local
stack: universal
category: arquitetura
status: Aprovado
created: 2026-04-03
---

# ADR — Arquitetura em Camadas (Layered)

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Arquitetura

---

## Contexto

Sem separacao de camadas, logica de negocio se mistura com acesso a dados e apresentacao. Mudancas em uma area quebram outras. A IA tende a colocar tudo junto quando nao ha guia explicito.

## Decisao

Adotar arquitetura Controller-Service-Repository como padrao para aplicacoes backend.

## Alternativas Consideradas

- **Sem padrao** — rapido no inicio, caos depois
- **Hexagonal** — mais flexivel mas mais complexo para projetos simples
- **Layered** — escolhido; simples, bem compreendido, adequado para maioria dos projetos

## Consequencias

- Separacao clara de responsabilidades
- Camadas testaveis independentemente
- Trade-off: mais arquivos e boilerplate

## Guardrails

- SEMPRE separar em 3 camadas: Controller (entrada) -> Service (logica) -> Repository (dados)
- NUNCA a camada Controller deve acessar Repository diretamente — sempre via Service
- NUNCA a camada Service deve conhecer detalhes de HTTP (request, response, headers)
- SEMPRE a camada Repository retorna entidades de dominio, nao rows/documents crus
- NUNCA logica de negocio no Controller — delegar ao Service
- QUANDO precisar de validacao, ENTAO validar no Service (regras de negocio) e no Controller (formato de entrada)

## Enforcement

- [ ] Code review: Controllers nao importam Repositories
- [ ] Code review: Services nao importam frameworks HTTP
- [ ] Lint rule: dependencia de camadas (se disponivel na stack)
- [ ] Gate PREVC: verificar imports entre camadas

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| ADRs relacionadas | hexagonal-architecture |

## Evidencias / Anexos

```
Controller Layer          Service Layer           Repository Layer
  ┌─────────┐             ┌─────────┐             ┌─────────┐
  │ Parse   │──Request──>│ Validate│──Entity───>│ Query   │
  │ HTTP    │             │ Execute │             │ Persist │
  │ Return  │<──Response──│ Compose │<──Entity────│ Map     │
  └─────────┘             └─────────┘             └─────────┘
```

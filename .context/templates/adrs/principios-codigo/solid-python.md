---
type: adr
name: solid-python
description: Principios SOLID aplicados a projetos Python — guardrails para classes, modulos e dependencias
scope: organizational
source: local
stack: python
category: principios-codigo
status: Aprovado
created: 2026-04-03
---

# ADR — Principios SOLID para Python

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** Python
- **Categoria:** Principios de Codigo

---

## Contexto

Projetos Python tendem a crescer com classes monoliticas, acoplamento direto a implementacoes concretas e funcoes que fazem mais do que deveriam. Sem guardrails, a IA gera codigo funcional mas dificil de manter, testar e evoluir.

## Decisao

Adotar os principios SOLID como guardrails obrigatorios para todo codigo Python orientado a objetos, usando os mecanismos nativos da linguagem (abc, Protocol, dataclasses).

## Alternativas Consideradas

- **Sem padrao formal** — cada desenvolvedor decide; inconsistencia entre modulos
- **Apenas Clean Code** — cobre estilo mas nao arquitetura de classes
- **SOLID completo** — escolhido; cobre tanto design de classes quanto modulos

## Consequencias

- Codigo mais testavel (DIP facilita mocks e stubs)
- Curva de aprendizado para desenvolvedores juniores
- Mais arquivos (SRP gera classes menores e mais numerosas)

## Guardrails

- SEMPRE aplicar Single Responsibility Principle: cada classe/modulo tem uma unica razao para mudar
- SEMPRE usar `abc.ABC` ou `typing.Protocol` para definir interfaces antes de implementacoes concretas
- NUNCA depender diretamente de implementacoes concretas em construtores — usar injecao de dependencia
- SEMPRE preferir composicao sobre heranca; heranca maxima de 2 niveis
- NUNCA adicionar metodos a uma interface existente se isso quebrar implementacoes — criar nova interface (ISP)
- SEMPRE usar `dataclasses` ou `pydantic.BaseModel` para DTOs em vez de dicts soltos
- QUANDO precisar estender comportamento, ENTAO usar Strategy pattern ou decorators em vez de modificar classes existentes (OCP)
- QUANDO uma classe tiver mais de 200 linhas, ENTAO considerar decomposicao (sinal de violacao SRP)

## Enforcement

- [ ] Code review: verificar se novas classes seguem SRP (uma razao para mudar)
- [ ] Code review: construtores recebem abstrações (Protocol/ABC), nao implementacoes
- [ ] Lint rule: `pylint --max-line-length` e `pylint --max-args` como proxy de complexidade
- [ ] Gate PREVC: no Validation phase, checar se interfaces precedem implementacoes no git log

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://docs.python.org/3/library/abc.html |
| Docs externos | https://peps.python.org/pep-0544/ (Protocol) |
| ADRs relacionadas | clean-code-python |

## Evidencias / Anexos

Exemplo de DIP em Python:

```python
from typing import Protocol

class Repository(Protocol):
    def save(self, entity: dict) -> None: ...
    def find_by_id(self, id: str) -> dict | None: ...

class UserService:
    def __init__(self, repo: Repository) -> None:
        self._repo = repo

    def create_user(self, data: dict) -> dict:
        self._repo.save(data)
        return data
```

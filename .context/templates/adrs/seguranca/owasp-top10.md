---
type: adr
name: owasp-top10
description: OWASP Top 10 como baseline de seguranca — guardrails contra vulnerabilidades mais comuns
scope: organizational
source: local
stack: universal
category: seguranca
status: Aprovado
created: 2026-04-03
---

# ADR — OWASP Top 10

- **Data:** 2026-04-03
- **Status:** Aprovado
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Seguranca

---

## Contexto

A maioria das vulnerabilidades em producao pertence ao OWASP Top 10. Sem guardrails explicitos, a IA pode gerar codigo com SQL injection, XSS, ou autenticacao fraca.

## Decisao

OWASP Top 10 como baseline obrigatorio de seguranca para todo codigo que aceita input externo.

## Alternativas Consideradas

- **Security review manual** — inconsistente, depende do revisor
- **SAST tools apenas** — detectam patterns, nao logica
- **OWASP Top 10 + tools** — escolhido; guardrails humanos + automacao

## Consequencias

- Baseline de seguranca universal
- IA nunca gera patterns vulneraveis conhecidos
- Requer conhecimento basico de seguranca

## Guardrails

- NUNCA concatenar input do usuario em queries SQL — SEMPRE usar parametrized queries / prepared statements
- NUNCA renderizar input do usuario sem sanitizacao — SEMPRE escapar HTML/JS (XSS)
- NUNCA armazenar senhas em plain text — SEMPRE usar bcrypt/argon2 com salt
- NUNCA expor stack traces ou mensagens de erro internas ao usuario — retornar mensagens genericas
- NUNCA desabilitar CSRF protection em formularios web
- SEMPRE validar e sanitizar TODA entrada do usuario no boundary do sistema
- SEMPRE usar HTTPS para toda comunicacao — NUNCA HTTP em producao
- QUANDO implementar autenticacao, ENTAO usar bibliotecas maduras (nao implementar crypto do zero)
- QUANDO retornar dados ao usuario, ENTAO filtrar campos sensiveis (password, tokens, PII)
- NUNCA logar dados sensiveis (passwords, tokens, PII) — mascarar antes de logar

## Enforcement

- [ ] SAST: scan automatico no CI (semgrep, snyk, ou equivalente)
- [ ] Code review: queries parametrizadas, sem concatenacao
- [ ] Code review: outputs sanitizados
- [ ] Gate PREVC: security-auditor agent valida no Validation phase
- [ ] Dependency check: `npm audit` / `pip audit` / `govulncheck` no CI

## Relacionamentos

| Tipo | Referencia |
|------|------------|
| Docs externos | https://owasp.org/www-project-top-ten/ |
| ADRs relacionadas | secrets-management, least-privilege |

## Evidencias / Anexos

Patterns vulneraveis vs seguros:

```python
# VULNERAVEL: SQL injection
cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")

# SEGURO: parametrized query
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

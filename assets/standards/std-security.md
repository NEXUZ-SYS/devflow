---
id: std-security
description: Higiene mínima de segurança em todo código de produção
version: 1.0.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
weakStandardWarning: true
---
## Princípios

- Toda entrada externa (HTTP, fila, arquivo, LLM, webhook) é hostil até ser validada com schema
- Secrets nunca em código, log, mensagem de erro, prompt ou histórico git; use secret manager ou env var injetada
- Autenticação e autorização verificadas na primeira linha do handler, antes de qualquer side effect
- Menor privilégio: tokens, roles e service accounts com o mínimo necessário para a operação
- Output sempre escapado para o sink (HTML, SQL, shell, prompt) — preferir queries parametrizadas e JSX
- Rate limit em rotas de autenticação, signup e chamadas a LLM; combine uid + IP em rotas autenticadas
- LLM output é input não confiável: valide com Zod antes de render, ação ou persistência
- Nunca use `Math.random()` para tokens/IDs; use `crypto.randomUUID()` ou `crypto.randomBytes()`
- Nunca use MD5, SHA-1, DES ou RC4; use SHA-256+, AES-256-GCM, argon2id ou bcrypt
- Lockfile (`package-lock.json`) versionado e idêntico entre dev e CI; rode `npm audit` em CI

## Anti-patterns

| Errado | Corrija para |
|---|---|
| String interpolation em SQL | Queries parametrizadas (`$1`, `$2`) |
| `dangerouslySetInnerHTML` com output de LLM | Sanitize com DOMPurify antes |
| `NEXT_PUBLIC_OPENAI_KEY` | Env var server-side sem prefixo público |
| Comitar `.env` mesmo com "fix later" | `.gitignore` + secret manager |
| `rejectUnauthorized: false` "só em dev" | TLS sempre habilitado |
| Comparar secrets com `===` | `crypto.timingSafeEqual` |
| Retornar stack trace ao cliente | Log no servidor + mensagem genérica ao cliente |
| LLM faz tool call com efeito colateral sem confirmação | Allowlist server-side + validação Zod de args |

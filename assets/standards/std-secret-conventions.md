---
id: std-secret-conventions
description: Secrets nunca em código ou log; armazenados e acessados via mecanismo dedicado
version: 1.1.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-secret-conventions.js
---
## Princípios

- Secret = qualquer valor cuja perda de confidencialidade impacta segurança, integridade ou conformidade
- São secrets: API keys de IA, credenciais de banco, JWT signing keys, OAuth client secrets, webhook secrets, encryption keys, tokens de SaaS
- Não são secrets: Firebase web config (público por design), Stripe publishable key, URLs de endpoints públicos, feature flags não-sensíveis
- Acesse secrets via secret manager (produção/staging) ou env var injetada (CI/CD); nunca via arquivo `.env` commitado
- Nomes em `SCREAMING_SNAKE_CASE`: `OPENAI_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`
- Nunca exponha secrets em variáveis prefixadas com `NEXT_PUBLIC_` — tudo sob esse prefixo vaza para o bundle do cliente
- Nunca logue valores de secrets, headers `Authorization`, cookies de sessão ou tokens JWT
- Rotacione chaves imediatamente após qualquer suspeita de vazamento; não confie em "vou apagar depois"
- Nunca reutilize secrets entre ambientes; cada ambiente tem os seus próprios
- Nunca logue `process.env` inteiro — qualquer dump de env vaza todos os secrets de uma vez
- Mantenha `.env.example` com placeholders sincronizado; ele documenta o contrato de env sem expor valores

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `const OPENAI_KEY = "sk-..."` em código | Env var via secret manager injetada em runtime |
| `NEXT_PUBLIC_*KEY` / `*SECRET` / `*TOKEN` | Env var server-only sem prefixo público |
| `console.log(process.env)` | Nunca logar env — vaza todos os secrets |
| Secret commitado em `.env` | `.env.example` com placeholder + `.gitignore` para `.env` |
| `NEXT_PUBLIC_OPENAI_API_KEY` | Env var server-side sem prefixo `NEXT_PUBLIC_` |
| Logar o valor do token JWT | Logar apenas `tokenId` ou `sub` do payload |
| Mesmo secret em dev e prod | Secrets isolados por ambiente |
| Secret em PR description, Slack ou issue | Rotacionar imediatamente + nunca compartilhar em texto |

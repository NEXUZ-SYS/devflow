---
id: std-caching
description: Cache com chave determinística, TTL explícito e invalidação por evento
version: 1.1.0
source: devflow-default
applyTo: ["src/**/*.{ts,tsx}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: null
  enforcedBy: code-review
weakStandardWarning: true
---
## Princípios

- Meça antes de cachear: sem dado de latência ou custo, cache é overhead especulativo
- Cache é exclusivamente leitura ou derivação de leitura; nunca cacheie escritas
- Aplique o menor escopo viável: cache no nível mais próximo do consumidor que ainda preserva correção
- Nunca cacheie: dados com taxa de mudança maior que a taxa de leitura, respostas de erro 5xx, dados sem tolerância a staleness (saldo financeiro pós-transação, estado de autenticação ativa)
- Chaves determinísticas: mesmos inputs → mesma chave, sempre; namespace com prefixo de domínio e versão (`users:v2:profile:{userId}`)
- TTL explícito em toda entrada; TTL infinito proibido sem mecanismo de invalidação por evento
- Prefira invalidação por evento (tag, path, key) sobre TTL curto quando o evento de mudança é conhecido
- Cache stampede: proteja recomputações caras com single-flight; aplique jitter ao TTL (`TTL ± aleatório`)
- Nunca inclua PII em texto claro dentro da chave de cache; hashe ou use ID interno
- Cache-aside como padrão: lê do cache; em miss, lê da fonte e popula o cache
- Camadas têm escopo próprio: invalidar uma (Redis) não invalida as demais (CDN, browser) — coordene explicitamente
- Nunca implemente cache de query manual sobre o driver do banco; use o cache nativo quando existir

## Anti-patterns

| Errado | Corrija para |
|---|---|
| Cache sem TTL definido | TTL explícito + invalidação por evento |
| PII (email, CPF) em texto claro na chave | Hash do valor ou ID interno opaco |
| Mesma chave em múltiplas camadas sem invalidação coordenada | Estratégia explícita de invalidação cross-layer |
| Cache de saldo financeiro pós-transação | Nunca cachear — leitura fresca obrigatória |
| Cachear sem medir latência/custo primeiro | Profiling primeiro, cache com dado |
| TTL idêntico para todas as entradas | TTL por natureza do dado (leitura rara = menor TTL) |

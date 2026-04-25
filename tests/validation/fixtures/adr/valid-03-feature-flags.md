---
type: adr
name: feature-flags-launchdarkly-experiment
description: Adoção experimental de LaunchDarkly para feature flags com gate de 6 meses
scope: project
source: local
stack: TypeScript
category: infraestrutura
status: Proposto
version: 0.1.0
created: 2026-04-24
supersedes: []
refines: []
protocol_contract: null
decision_kind: reversible
---

# ADR — LaunchDarkly como experimento de feature flags

- **Data:** 2026-04-24
- **Status:** Proposto
- **Escopo:** Projeto
- **Stack:** TypeScript
- **Categoria:** Infraestrutura

---

## Contexto

Deploys de alto risco hoje dependem de coordenação entre times. Rollback exige redeploy. Experimentos A/B rodam via código condicional hardcoded.

## Decisão

Adotar **LaunchDarkly** como plataforma de feature flags no primeiro serviço (checkout-api). Experimento explícito: 6 meses, reavaliar contra custo + alternativas self-hosted.

## Alternativas Consideradas

- **Unleash self-hosted** — controle total, custo operacional alto
- **ConfigCat** — mais barato, menos maduro em targeting
- **LaunchDarkly** ✓ — SDK maduro, latência baixa, experiência de DX validada em pilotos

## Consequências

**Positivas**
- Rollback instantâneo de feature → 0 min vs 20 min de redeploy
- Experiment A/B sem coordenação de deploy
- Targeting granular por tenant/user/cohort

**Negativas**
- Custo recorrente (~$8/seat/mês)
- Vendor lock-in na API SDK

**Riscos aceitos**
- Gate de 6 meses: se cost/feature > baseline, migrar para Unleash
- Dependência de SDK externa em path crítico — mitigar com fallback local

## Guardrails

- SEMPRE definir flag default seguro (false) antes do rollout
- NUNCA usar flag como controle de autorização ou regra de negócio permanente
- QUANDO flag passar 6 meses ativa, ENTÃO promover para código ou remover

## Enforcement

- [ ] Code review: flag nova requer default + TTL documentado
- [ ] Lint: regra custom marca flags > 6 meses como warning
- [ ] Teste: teste de fallback quando LaunchDarkly indisponível
- [ ] Gate CI: auditoria mensal lista flags > 6 meses

## Evidências / Anexos

**Fontes oficiais:** [LaunchDarkly docs](https://docs.launchdarkly.com) · [Feature flag best practices](https://launchdarkly.com/blog/best-practices-feature-flags/)

```typescript
const client = LDClient.initialize(SDK_KEY);
const showNewCheckout = await client.variation(
  'new-checkout-ui',
  { key: userId, custom: { tenant } },
  false, // default seguro
);
```

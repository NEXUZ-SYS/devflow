---
id: std-layer-boundaries
description: Imports respeitam a direção da camada; domínio não importa infra, slices via public API
version: 1.0.0
source: devflow-default
applyTo: ["src/**/*.{ts,tsx}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-layer-boundaries.js
---
## Princípios

- A regra de dependência flui para dentro: UI → App → Domain; a infraestrutura implementa portas definidas pelo domínio, nunca o contrário
- Domínio é puro: nunca importa adapter de infra (DB, HTTP, SDK) diretamente; depende de uma porta (interface) que a infra implementa
- Cada slice/feature expõe uma public API (index); imports entre features passam por ela, nunca por path interno do slice irmão
- Imports internos (`model/`, `lib/`, `ui/`) são livres dentro do próprio slice; cruzar para o interior de outro slice é proibido
- Camadas mais especializadas conhecem as mais genéricas, não o inverso (shared não importa de features; entities não importa de widgets)
- Inversão de dependência via porta + IoC: o domínio declara a interface, a infra a satisfaz, a composição resolve no boundary
- Acoplamento acidental é dívida: se A precisa do interior de B, ou o contrato sobe para a public API de B, ou a responsabilidade está no lugar errado

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `domain/order.ts` importa `../infra/pg` | Domínio define porta `OrderRepo`; infra implementa; IoC injeta |
| `features/a/ui.ts` importa `../b/model/internal` | Importar via public API: `import { x } from '../b'` |
| UI chama repositório de dados diretamente | UI chama use-case/service; service acessa repositório |
| `shared/` importa de `features/` | Inverter: o genérico não conhece o específico |
| Slice irmão acessado por deep path | Exportar o necessário no `index.ts` do slice |

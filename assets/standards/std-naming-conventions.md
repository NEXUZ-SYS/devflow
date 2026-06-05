---
id: std-naming-conventions
description: Nomenclatura consistente e expressiva em todo o codebase
version: 1.2.0
source: devflow-default
applyTo: ["**/*.{ts,tsx,js,jsx,py,go}"]
activation: on-demand
relatedAdrs: []
enforcement:
  linter: machine/std-naming-conventions.js
---
## Princípios

- `camelCase` para variáveis, funções e propriedades; `PascalCase` para tipos, classes e componentes React
- `SCREAMING_SNAKE_CASE` para constantes verdadeiramente imutáveis exportadas em nível de módulo
- `kebab-case` para nomes de arquivo; exceção: componentes React podem usar `PascalCase` se a convenção do diretório for consistente
- Nunca use abreviações ambíguas (`usr`, `btn`, `cfg`); use o nome completo (`user`, `button`, `config`)
- Booleanos com prefixo afirmativo: `isActive`, `hasPermission`, `canEdit`; nunca negações no nome (`isNotActive`) — inverta o nome (`isActive: false`)
- Nunca enums TypeScript; use uniões literais (`type Status = 'active' | 'inactive'`) ou objetos `as const`
- Verbos para ações (`createOrder`, `sendEmail`), substantivos para dados (`user`, `orderItems`)
- Naming de API path: `kebab-case`, plural para coleções (`/order-items`), singular para singletons (`/health`, `/me`)
- JSON payloads: `camelCase` em chaves — nunca misture `snake_case` e `camelCase` no mesmo response
- `snake_case` em SQL/event payloads; `camelCase` em código TypeScript — conversão apenas no boundary
- Schemas Zod: PascalCase com sufixo `Schema` (`UserSchema`); tipo inferido tem o mesmo nome sem sufixo (`type User`)

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `const u = getUser()` | `const user = getUser()` |
| Booleano negativo (`isNotActive`) | `isActive: false` (nome afirmativo invertido) |
| `enum Status { ... }` (enum TypeScript) | Union literal `type Status = 'active' \| 'inactive'` |
| `/orderItems` no path HTTP | `/order-items` (kebab-case) |
| `userSchema` (camelCase) | `UserSchema` (PascalCase + sufixo Schema) |
| `interface User { ... }` paralela ao schema Zod | `type User = z.infer<typeof UserSchema>` |

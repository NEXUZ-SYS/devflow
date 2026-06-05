---
id: std-typescript-strict
description: Strictness de TypeScript — proíbe any, enum e default export de função
version: 1.0.0
source: devflow-default
applyTo: ["**/*.{ts,tsx}"]
activation: on-demand
relatedAdrs: ["007-default-standards-library"]
enforcement:
  linter: machine/std-typescript-strict.js
---
## Princípios

- **Nunca `: any`** — use `unknown` + narrowing, ou tipe explicitamente. `any` desliga o type-checker.
- **Nunca `enum`** — use union literal (`type Status = "ACTIVE" | "PENDING"`); enum gera runtime desnecessário e quebra tree-shaking.
- **Named exports** — evite `export default function`; named export ajuda discovery e refactor.
- Imports por alias absoluto, não `../../../`.

> Único std **stack-scoped** (TS-only) do conjunto default — exceção consciente ao set stack-agnostic.

## Anti-patterns

| Errado | Corrija para |
|---|---|
| `function f(x: any)` | `function f(x: unknown)` + narrowing |
| `enum Status { A, B }` | `type Status = "A" \| "B"` |
| `export default function f()` | `export function f()` |
| `import x from "../../../lib/x"` | `import x from "@/lib/x"` |

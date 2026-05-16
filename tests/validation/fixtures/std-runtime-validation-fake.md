---
id: std-runtime-validation
description: Validar payloads na borda externa
version: 1.0.0
applyTo: ["**/*.ts", "**/*.tsx", "**/*.py"]
relatedAdrs: ["adr-zod-frontend", "adr-pydantic-backend"]
enforcement:
  linter: standards/machine/std-runtime-validation.js
weakStandardWarning: true
---
# Standard: runtime-validation
## Princípios
Validar na borda externa antes de tocar domínio.

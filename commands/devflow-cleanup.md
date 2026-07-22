---
description: Audita context rot e arquiva planos entregues (diagnóstico por padrão; --fix para agir)
---

# /devflow:devflow-cleanup

Identifica artefatos de processo obsoletos que poluem o contexto do agente e arquiva com
segurança os planos cuja entrega é observável no código.

## Usage

```
/devflow:devflow-cleanup           # só diagnóstico
/devflow:devflow-cleanup --fix     # propõe arquivamento sob confirmação explícita
```

## Behavior

1. Invoke `devflow:context-hygiene`
2. Sem `--fix`: para no relatório de diagnóstico — nada é movido
3. Com `--fix`: propõe o arquivamento e exige confirmação explícita antes de mover

## Salvaguardas

- Só move arquivo que o git protege (`tracked && !dirty`), sempre via `git mv`
- `.context/` é território dotcontext (ADR-006) — reportado, nunca tocado
- O consentimento tem gate mecânico no CLI (`--confirmed`), não só na prosa
- Nunca executa sob `autonomy: autonomous` (ADR-012)

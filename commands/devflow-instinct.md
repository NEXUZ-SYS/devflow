---
name: devflow-instinct
description: Gerencia o Instinct system — minera, lista, promove e poda instincts aprendidos do tool-use da sessão
user_invocable: true
---

# /devflow:devflow-instinct

Interface para o **Instinct system** — o loop de aprendizado que observa o tool-use da sessão, destila instincts atômicos pontuados por confiança e os reinjeta no SessionStart.

## Uso

```
/devflow instinct <subcomando>
```

| Subcomando | O que faz | Rota |
|---|---|---|
| `status` | Lista os instincts do projeto (todos, agrupados por confiança/status) | `instinct-cli.mjs status` |
| `mine` | Minera as observações da sessão → infere e aplica instincts | skill `devflow:instinct-ops` |
| `promote` | Promove a global instincts vistos em ≥2 projetos | `instinct-cli.mjs promote` |
| `prune` | Remove instincts `pending` estagnados (confiança < 0.3, > 30 dias) | `instinct-cli.mjs prune` |
| `list` | Alias de `status` — imprime os instincts conhecidos | `instinct-cli.mjs status` |

- `mine` é o único que invoca o LLM (a skill `devflow:instinct-ops` faz a inferência + match semântico). Os demais são chamadas determinísticas à CLI Node.
- Todos os subcomandos são best-effort e nunca quebram a sessão (CLI sempre `exit 0`).

## Como ativar

O Instinct system é **opt-in pelo YAML** (piso de privacidade). Para ligar, no `.context/.devflow.yaml`:

```yaml
instincts:
  enabled: true              # opt-in — ÚNICA forma de habilitar (env não habilita)
  profile: standard          # off | minimal | standard
  recall:
    minConfidence: 0.6       # limiar p/ entrar no digest                  [MVP: default no código]
    maxChars: 2000           # teto do digest no SessionStart              [MVP: enforçado via --max-chars]
  mine:
    minObservations: 20      # limiar p/ sugerir mining na fronteira       [fase 2: nudge]
  bridges:
    napkin: propose          # off | propose                              [skill instinct-ops]
    mempalace: propose       # off | propose (só se MemPalace disponível)  [skill instinct-ops]
```

Com `enabled: true` e dentro de um repo git (escopo por hash do `git remote origin`; ou `DEVFLOW_INSTINCT_PID=<id>`), captura e recall passam a rodar. Default é **off** (sem a seção `instincts:` ou `enabled: false`).

> **MVP enforça:** `enabled` (opt-in via YAML) + os opt-outs de sessão (`DEVFLOW_INSTINCTS_ENABLED=0`, `DEVFLOW_INSTINCT_PROFILE=off`) + `recall.maxChars`. O gating fino por nível de `profile` (minimal vs standard) e o nudge por `mine.minObservations` são fase 2. Forma do YAML segue o spec aprovado (`docs/superpowers/specs/2026-06-17-instinct-system-design.md`).

### Precedência dos toggles (N2)

`enabled: false` no YAML é o **piso**; env só **RESTRINGE**, nunca habilita o que o YAML desligou:

1. **Opt-out por sessão** (env): `DEVFLOW_INSTINCTS_ENABLED=0` desliga, ponto final.
2. **Profile off por sessão** (env): `DEVFLOW_INSTINCT_PROFILE=off` desliga.
3. **YAML** (`.context/.devflow.yaml`): `instincts.enabled: true` é a **única** forma de habilitar. `DEVFLOW_INSTINCTS_ENABLED=1` **não** habilita (env não liga o que o YAML não ligou).

`enabled: false` é o **piso**: na ausência de sinal explícito, o sistema fica desligado (privacidade-por-padrão). O store XDG é local e nunca commitado.

## Privacidade

Observações são **redigidas** (PII/credenciais → `[EMAIL]`/`[TOKEN]`/`[REDACTED]`) antes de qualquer escrita; para `Bash`, captura-se só o binário (1º token), nunca os argumentos. Ver ADR-005 v1.1.0.

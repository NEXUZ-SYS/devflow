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

## Configuração (`.context/.devflow.yaml`)

```yaml
instincts:
  enabled: false          # piso de privacidade — opt-in explícito (ADR-005 v1.1.0)
  profile: balanced       # conservative | balanced | aggressive (limiares de recall/ponte)
  recall_max_chars: 2000  # teto do digest injetado no SessionStart
```

### Precedência dos toggles (N2)

A decisão de habilitar segue, do mais forte ao mais fraco:

1. **Opt-out por sessão** (env): `DEVFLOW_INSTINCTS_ENABLED=0` desliga, ponto final.
2. **Perfil por sessão** (env): `DEVFLOW_INSTINCT_PROFILE` sobrepõe o `profile` do YAML.
3. **YAML**: `instincts.enabled` / `instincts.profile` no `.context/.devflow.yaml`.

`enabled: false` é o **piso**: na ausência de sinal explícito, o sistema fica desligado (privacidade-por-padrão). O store XDG é local e nunca commitado.

## Privacidade

Observações são **redigidas** (PII/credenciais → `[EMAIL]`/`[TOKEN]`/`[REDACTED]`) antes de qualquer escrita; para `Bash`, captura-se só o binário (1º token), nunca os argumentos. Ver ADR-005 v1.1.0.

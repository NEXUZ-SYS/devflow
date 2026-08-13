---
type: plan
name: "Primeiro item do menu /devflow"
description: "Fazer devflow:devflow ser o primeiro item do menu de slash ao digitar /devflow, e travar o invariante de ordenacao contra regressao."
planSlug: slash-menu-first-command
summary: "O menu do Claude Code ordena por (comprimento, nome). Quatro entradas de 14 chars batem devflow:devflow (15). Correcao: user-invocable:false em 43 skills, rename design -> devflow-design, e um guard que replica a chave de ordenacao."
agents:
  - type: "test-writer"
    role: "Escreve o guard de regressao do invariante (AC1-AC3) em RED"
  - type: "refactoring-specialist"
    role: "Aplica user-invocable:false nas skills e o rename do comando design"
  - type: "documentation-writer"
    role: "Alinha a premissa do guard de namespace e escreve o CHANGELOG breaking"
  - type: "code-reviewer"
    role: "Revisa o diff na fase R, com foco no YAML das 43 skills"
docs:
  - "development-workflow.md"
  - "testing-strategy.md"
  - "architecture.md"
phases:
  - id: "phase-1"
    name: "Guard em RED"
    prevc: "E"
    summary: "Escrever tests/integration/test-slash-menu-ordering.mjs e confirmar as 3 falhas esperadas antes de qualquer correcao."
    required_sensors: [lint]
    deliverables:
      - "tests/integration/test-slash-menu-ordering.mjs"
      - "Evidencia dos 3 RED (AC1 lista config/design/doctor/napkin; AC2 lista 43 skills; AC3 lista design)"
    steps:
      - order: 1
        description: "Escrever o guard com AC1 (minimo da chave len,nome), AC2 (user-invocable:false exceto allowlist) e AC3 (convencao devflow-*)"
        assignee: "test-writer"
        deliverables:
          - "tests/integration/test-slash-menu-ordering.mjs"
      - order: 2
        description: "Rodar node --test e confirmar que AC1 lista exatamente config, design, doctor e napkin"
        assignee: "test-writer"
        deliverables:
          - "Saida dos 3 testes em RED"
  - id: "phase-2"
    name: "GREEN — skills e comando"
    prevc: "E"
    summary: "Aplicar user-invocable:false em 43 skills e renomear design para devflow-design, atualizando as 8 refs de produto e as 4 suites de teste."
    required_sensors: [unit, integration, lint]
    deliverables:
      - "43 skills/*/SKILL.md com user-invocable:false"
      - "commands/devflow-design.md (renomeado com git mv)"
      - "AC1, AC2 e AC3 verdes"
    steps:
      - order: 1
        description: "Inserir user-invocable:false apos description: em 43 SKILL.md (exceto scrape-stack-batch) e verificar que os 44 frontmatters seguem parseaveis"
        assignee: "refactoring-specialist"
        deliverables:
          - "AC2 verde"
      - order: 2
        description: "git mv commands/design.md commands/devflow-design.md, trocar name:, atualizar as 8 refs de produto e as 4 suites de teste do design"
        assignee: "refactoring-specialist"
        deliverables:
          - "AC1 e AC3 verdes"
      - order: 3
        description: "Registrar /devflow:devflow-design no bloco COMMANDS e em Related Commands do help, onde nunca constara"
        assignee: "documentation-writer"
        deliverables:
          - "commands/devflow.md atualizado"
  - id: "phase-3"
    name: "Consistencia e evidencia"
    prevc: "V"
    summary: "Alinhar a premissa do guard de namespace ao ADR-008 v1.2.0, registrar o breaking no CHANGELOG e observar os 3 sinais do contrato verify."
    required_sensors: [unit, integration, lint]
    deliverables:
      - "Comentario de test-profile-skills-not-registered.mjs alinhado"
      - "Entrada BREAKING no CHANGELOG"
      - "unit, integration e lint com exit 0"
    steps:
      - order: 1
        description: "Corrigir o cabecalho de test-profile-skills-not-registered.mjs: o que nao tem opt-out e o REGISTRO, nao a virada em comando"
        assignee: "documentation-writer"
        deliverables:
          - "tests/integration/test-profile-skills-not-registered.mjs"
      - order: 2
        description: "Escrever a entrada BREAKING do CHANGELOG (rename + 43 skills fora do menu + excecao scrape-stack-batch)"
        assignee: "documentation-writer"
        deliverables:
          - "CHANGELOG.md"
      - order: 3
        description: "Rodar bash tests/run-lint.sh, run-unit.sh e run-integration.sh e capturar os exit codes"
        assignee: "test-writer"
        deliverables:
          - "Evidencia dos 3 sinais observados"
generated: "2026-08-13"
status: filled
scaffoldVersion: "2.0.0"
---

# Primeiro item do menu /devflow

> Fazer `devflow:devflow` ser o primeiro item ao digitar `/devflow`, e travar o invariante contra regressão.

**Spec:** `docs/superpowers/specs/2026-08-13-slash-menu-first-command-design.md` (`c982508`)
**Plano detalhado (passo a passo, com código):** `docs/superpowers/plans/2026-08-13-slash-menu-first-command.md` (`10f38af`)
**ADR:** 008 v1.2.0 (`39cf8c1`) — já entregue, fora do escopo das fases abaixo.
**Branch:** `feat/slash-menu-first-command`

## Task Snapshot

- **Objetivo:** ao digitar `/devflow`, o primeiro item do menu é `devflow:devflow`.
- **Sinal de sucesso:** AC1 de `tests/integration/test-slash-menu-ordering.mjs` verde — nenhuma entrada visível do plugin precede `devflow:devflow` na chave `(comprimento, nome)`.
- **Verificação manual (não automatizável):** após `/devflow update` + reinício, digitar `/devflow` e conferir a ordem. O menu do Claude Code não é acessível a testes.

## Causa raiz

O bundle do Claude Code 2.1.231 (função `H8l`) ordena o menu de `/` por: (1) nome exato, (2) alias exato, (3) **prefix match, menor primeiro**, (4) alias prefixo, (5) score Fuse, (6) usage. Os critérios 1 e 2 são inalcançáveis por plugin — o `name` é sempre `plugin:nome` e o frontmatter de plugin não aceita `aliases`. Logo a chave efetiva é `(comprimento, nome)`.

Hoje quatro entradas de 14 caracteres — `devflow:config`, `devflow:design`, `devflow:doctor`, `devflow:napkin` — batem `devflow:devflow` (15), e o desempate alfabético entrega `config`.

## Decisão

| # | Decisão | Por quê |
|---|---|---|
| D1 | O invariante é sobre a chave inteira `(comprimento, nome)` | Uma skill futura chamada `cleanup` empataria em 15 e venceria no alfabético |
| D2 | `user-invocable: false` em 43 das 44 skills | Esconde do menu do usuário e mantém a invocação pelo modelo; só `disable-model-invocation` bloquearia o modelo, e não é usado |
| D3 | `design` → `devflow-design` (BREAKING) | Restaura a convenção que a v1.6.0 estabeleceu ao reverter os nomes curtos por colisão; `design` era a única exceção |

**Exceção declarada:** `scrape-stack-batch` continua visível — `docs/odoo-profile-standards.md:50` instrui o usuário a digitá-la.

## Critérios de aceite

| AC | Asserção |
|---|---|
| AC1 | `devflow:devflow` é o mínimo de `(len, nome)` entre comandos + skills visíveis |
| AC2 | Toda skill tem `user-invocable: false`, exceto a allowlist `["scrape-stack-batch"]` |
| AC3 | Todo comando chama-se `devflow` ou casa `^devflow-` |

## Alcance para projetos-cliente

DevFlow é plugin: `commands/` e `skills/` viajam no pacote. O cliente recebe a correção com `/devflow update` + reinício da sessão. Nada a materializar em `.context/`, nenhuma migração. Até atualizar, mantém `/devflow:design`.

## Sinais exigidos

```yaml
requiredSignals: [unit, integration, lint]
```

| Sinal | Comando |
|---|---|
| `unit` | `bash tests/run-unit.sh` |
| `integration` | `bash tests/run-integration.sh` |
| `lint` | `bash tests/run-lint.sh` |

## Riscos

| Risco | Mitigação |
|---|---|
| Corromper YAML ao editar 43 frontmatters | `description:` é linha única em todas as 44 skills (verificado); blocos multilinha (`deps:`, `trigger_phrases:`) vêm depois. Passo de verificação de abertura/fechamento após a edição. |
| `napkin` ser revertida pelo `/devflow update` | Step 4c usa `EXTERNAL_SKILLS_DIR` (default `~/.claude/skills`), não o diretório do plugin. A cópia bundled não é tocada. |
| Quebrar as 4 suítes de teste do design | Estão no escopo da fase 2; `test-command-design.sh` referencia `commands/design.md` por caminho. |

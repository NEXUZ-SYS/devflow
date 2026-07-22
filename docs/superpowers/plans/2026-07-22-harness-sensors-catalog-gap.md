# Melhoria — DevFlow não cuida do catálogo de sensores do harness (`.context/config/sensors.json`)

**Data:** 2026-07-22 · **Tipo:** gap de produto (genérico, afeta clientes) · **Severidade:** baixa em correção, média em higiene de processo
**Descoberto:** ao finalizar o workflow `suggest-bump-postmerge-base`, onde o gate do PREVC bloqueou duas vezes por "Missing required sensors: tests, lint" e exigiu `workflow-advance({force: true})`.
**Status:** não implementado — backlog.

---

## O sintoma

Em **todo** workflow deste repo, o avanço de fase é bloqueado:

```
Harness completion checks blocked workflow advance.
  reasons: ["Missing required sensors: tests, lint"]
```

E a resolução sugerida — `workflow-manage({action:"runSensors", sensors:["tests","lint"]})` — falha:

```
Sensor not found: tests
```

O operador (ou o agente) é empurrado para `workflow-advance({force: true})`. Aconteceu em pelo menos dois workflows seguidos: `confirmation-release-signpost` (2026-07-20) e `suggest-bump-postmerge-base` (2026-07-22).

## O que é `.context/config/sensors.json`

Da doc do serviço no `@dotcontext/cli`
(`dist/harness/application/sensors/sensorCatalogService.d.ts`):

> *Bootstraps a user-editable sensor catalog under `.context/config/sensors.json` and resolves the effective shell-based sensors for workflow/harness runtime.*

É um **catálogo de comandos de shell** que o harness executa para provar que uma fase pode avançar:

```jsonc
{ "version": 1, "source": "bootstrap" | "manual",
  "stack": { "primaryLanguage": …, "testFrameworks": […], "packageManager": … },
  "sensors": [ { "id": "test", "name": "Test", "severity": "critical",
                 "blocking": true, "command": "npm test -- --runInBand" } ] }
```

O bootstrap é **detectado por stack** (verificado em `sensorCatalogService.js`):

| Stack | Comandos gerados |
|---|---|
| Go | `go build ./...` · `go test ./...` · `go vet ./...` |
| Rust | `cargo build` · `cargo test` |
| Maven / Gradle | `mvn -q test` · `./gradlew test` |
| Python | `python -m pytest` |
| Node | `npm run build` · `npm test -- --runInBand` · `npm run lint` · `npm run typecheck` |

Ids gerados: `build`, `test`, `lint`, `typecheck`, `structural`.

**Conceitualmente é um irmão do contrato `verify:` do ADR-013** — mesma ideia (o gate observa um sinal de máquina em vez de acreditar no agente), mas morando no harness em vez do `.devflow.yaml`. Hoje são **dois sistemas de evidência paralelos** e o DevFlow só alimenta um deles.

## Causa raiz — três camadas

1. **O arquivo não existe.** `context({action:"listToFill", target:"sensors"})` retorna 0 arquivos; não é oferecido no scaffold do `/devflow init`. Sem ele valem só os built-ins genéricos (`i18n-coverage`, `tests-passing`, `typecheck-clean`).
2. **Mesmo bootstrapado, não serviria neste repo.** Não há `package.json` na raiz e os testes rodam por `bash tests/run-unit.sh` + `node --test`. O ramo Node gera `npm test -- --runInBand` — flags de **Jest**.
3. **Descasamento de nome no próprio dotcontext.** O bootstrap gera o id `test` (singular), mas o `phase-defaults` do harness injeta `requiredSensors: ["tests", "lint"]` (plural) no contrato da fase. Mesmo um catálogo perfeito não satisfaria `tests`. Esta camada é defeito do dotcontext, não nosso.

## Isto localiza o GAP-INIT-4

[`2026-07-01-devflow-e2e-fixes.md:409`](2026-07-01-devflow-e2e-fixes.md) registrava:

> **GAP-INIT-4** (sensors.json estilo-Jest): NÃO-LOCALIZADO em 1.25.0 — **provável refatoração para o dotcontext MCP** (externo ao repo).

A suspeita estava correta. O código está em
`@dotcontext/cli/dist/harness/application/sensors/sensorCatalogService.js`. O gap não sumiu — mudou de casa. **Este documento fecha a ação de re-verificação do GAP-INIT-4.**

## Nenhum comando do DevFlow cobre isso

| Comando | Escopo | Cobre sensors? |
|---|---|---|
| `/devflow:devflow-doctor` | 8 checks: `adr-injection`, `devflow-config`, `git-hooks`, `grounding-mcp`, `mcp-config-valid`, `mcp-connectivity`, `mempalace-health`, `permissions-health` | **Não** |
| `/devflow update` Step 7 | drift **só** de layout v1→v2 (`.layout-version`) | **Não** |
| `/devflow:devflow-sync` | docs, agents, skills | **Não** |

`grep -rl "sensors" skills/ commands/` → **vazio**. Nenhuma skill ou comando do DevFlow menciona o arquivo.

Consequência para o `/devflow update`: um update que traga um `@dotcontext/cli` novo pode mudar o bootstrap de sensores **sem que nada avise**.

## Por que importa

- **Correção: baixo risco.** A evidência forte continua intacta e é mais rigorosa — o ledger do `verify:` (ADR-013) e os *required checks* do CI, que re-rodam os sinais em ambiente limpo. Nenhum teste deixou de rodar por causa deste gap.
- **Higiene: risco real.** Forçar o gate virou rotina. Isso treina exatamente o reflexo que o ADR-013 existe para combater: se um dia o gate estiver vermelho *de verdade*, o `force` já é muscular.
- **Alcance em cliente.** O DevFlow é plugin. Um cliente Python/Odoo — metade do portfólio — herda sensores de Jest ou nenhum sensor utilizável, e cai na mesma armadilha sem ter o contexto para diagnosticar.

## Correção proposta

**Um check novo no doctor.** A própria skill `devflow:doctor` aponta o ponto de extensão:

> *Novos checks entram em `scripts/lib/doctor.mjs` (array `CHECKS`) — sem tocar este skill.*

### `harness-sensors`

- **Diagnóstico:** `.context/config/sensors.json` ausente **ou** com sensores cujo `command` não é executável na stack detectada (ex.: `npm test` sem `package.json`; `pytest` sem `pyproject.toml`).
- **Reparo (consentido, não-destrutivo):** gerar/atualizar o `sensors.json` **derivando do contrato `verify:` já existente** no `.context/.devflow.yaml`, em vez de chutar por stack. Cada sinal de `verify:` vira um sensor com o mesmo comando.

Assim os dois sistemas de evidência passam a observar **a mesma fonte** — o gate do harness deixa de divergir do gate do ADR-013, e o `force` desaparece por construção.

### Esboço do mapeamento

```
.context/.devflow.yaml            →  .context/config/sensors.json
verify:                              sensors: [
  unit: ["bash","tests/run-unit.sh"]   { id:"unit",  command:"bash tests/run-unit.sh",
  lint: ["bash","tests/run-lint.sh"]     severity:"critical", blocking:true }, …
                                      ]
```

**Ponto em aberto (decidir no design):** o `phase-defaults` do harness pede `tests`/`lint`. Emitir aliases (`tests` → mesmo comando de `unit`) resolve na prática, mas é acomodar um defeito de terceiro. Alternativa: reportar o descasamento upstream e, enquanto isso, o plano do PREVC declarar `required_sensors` batendo com os ids que emitimos. Decidir com o operador.

## Escopo

**Dentro:** check `harness-sensors` no `scripts/lib/doctor.mjs`; gerador `sensors.json` ← `verify:`; testes (o doctor é Node, TDD normal); nota no `/devflow update` para rodar o doctor quando o dotcontext muda de versão.

**Fora:** corrigir o bootstrap do dotcontext (upstream, não é nosso código); substituir o sistema de sensores pelo `verify:` (são camadas distintas — o harness é dono do gate de fase, o `verify:` é dono da evidência); auto-reparo sem consentimento (o doctor é diagnóstico read-only por padrão, ADR do próprio doctor).

## Ligações

- Contrato `verify:` e o princípio observar-em-vez-de-afirmar: ADR-013 · [`2026-07-14-verify-signal-pipeline.md`](2026-07-14-verify-signal-pipeline.md)
- Origem do gap na validação E2E: [`2026-07-01-devflow-e2e-fixes.md`](2026-07-01-devflow-e2e-fixes.md) (GAP-INIT-4)
- Doctor e routines: [`2026-05-28-context-doctor-routines.md`](2026-05-28-context-doctor-routines.md)
- Workflows onde o gate foi forçado: `confirmation-release-signpost`, `suggest-bump-postmerge-base`

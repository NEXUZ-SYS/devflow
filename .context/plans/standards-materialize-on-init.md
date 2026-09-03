---
type: plan
name: Materialização dos Standards default em todo projeto
description: Os ~26 standards default passam a ser materializados em .context/engineering/standards/ do projeto (.md + machine/*.js) via provenance-sync, por init, sync e rotina periódica.
planSlug: standards-materialize-on-init
summary: "Os standards default deixam de existir apenas dentro do plugin. O ponto que exige mecanismo novo: resolveAndCheckSandbox resolve o path do linter contra bases diferentes por origem (default = relativo a assets/standards/, project = relativo a .context/), então a cópia do .md PRECISA reescrever enforcement.linter e portanto NÃO é verbatim — o provenance-sync ganha transform, com pluginHash computado sobre os bytes transformados. Hash da origem classificaria todo projeto como edited na 1a passada e congelaria o sync. Invariante dura: enforcement.linter nunca vira null; 20 dos 26 defaults têm linter bundlado e rodam hoje sem eject, e é por isso que o eject simples (que anula o linter) não serve. Seleção por caminho real do repositório, não por extensão sintetizada, porque 3 defaults têm prefixo src/**. O live-merge NÃO é removido: é ele que faz um default novo valer imediatamente. 8 tasks TDD."
agents:
  - type: "backend-specialist"
    role: "Resolvedor de materialização, transform e integração no provenance-sync"
  - type: "devops-specialist"
    role: "Fiação de project-init, context-sync e a rotina periódica"
  - type: "test-writer"
    role: "Fixtures de projeto e as provas de idempotência e preservação"
  - type: "security-auditor"
    role: "Origem dos linters copiados e a 3ª raiz do registry de hashes"
  - type: "code-reviewer"
    role: "Revisão das 8 tasks contra a spec e contra a ADR-007 v3.0.0"
docs:
  - "project-overview.md"
  - "architecture.md"
  - "development-workflow.md"
  - "testing-strategy.md"
  - "security.md"
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    required_sensors: ["lint"]
    summary: "Spec aprovada no brainstorming e plano de 8 tasks escrito contra a base v3.3.0."
    deliverables:
      - "docs/superpowers/specs/2026-09-02-standards-materialize-on-init-design.md"
      - "docs/superpowers/plans/2026-09-02-standards-materialize-on-init.md"
      - "8 tasks, todas test-first, sem placeholder proibido"
      - "Estado da base reverificado na v3.3.0, não presumido da spec"
    steps:
      - order: 1
        description: "Spec com 6 decisões fechadas (D1-D6) e o achado do linter: null"
        assignee: "architect-specialist"
        deliverables:
          - "spec aprovada; ADR-007 evoluída para v3.0.0"
      - order: 2
        description: "Plano de 8 tasks com código real, contra a main pós version-scoped"
        assignee: "architect-specialist"
        deliverables:
          - "tabela Estado da base; File Structure; Interfaces por task; Self-Review"
  - id: "phase-2"
    name: "Review"
    prevc: "R"
    required_sensors: ["lint"]
    summary: "Revisar o plano contra os pontos de risco antes de escrever código."
    deliverables:
      - "veredito do code-reviewer"
      - "veredito do security-auditor sobre linters copiados e registry"
    steps:
      - order: 1
        description: "Avaliar o transform: determinismo do hash entre plugin e projeto sobrevive a fim-de-linha e encoding?"
        assignee: "code-reviewer"
        deliverables:
          - "decisão registrada"
      - order: 2
        description: "Avaliar a 3ª raiz do known-hashes: indexar cru E transformado dobra entradas; há risco de colisão ou de registry inchado?"
        assignee: "security-auditor"
        deliverables:
          - "veredito sobre o crescimento do registry"
      - order: 3
        description: "Avaliar a superfície: 20 .js executáveis passam do TCB do plugin para o repo; a detecção por hash basta ou precisa de fail-closed?"
        assignee: "security-auditor"
        deliverables:
          - "confirmação da paridade com ADR-008 ou escalonamento"
      - order: 4
        description: "Avaliar o walk de MAX_DEPTH 12 em listProjectFiles sobre monorepo grande"
        assignee: "code-reviewer"
        deliverables:
          - "decisão sobre custo e limites"
  - id: "phase-3"
    name: "Execution"
    prevc: "E"
    required_sensors: ["lint", "unit"]
    summary: "Implementar as 8 tasks em ordem, RED-GREEN-REFACTOR, commit por task."
    deliverables:
      - "tests/fixtures/standards-materialize/{odoo-py,ts-src,ts-nosrc,empty}"
      - "scripts/lib/standards-materialize.mjs (selectDefaults, retargetLinter, resolveMaterializedStandards)"
      - "transform no applySync do provenance-sync"
      - "3ª raiz em gen-known-hashes (cru + transformado)"
      - "readStandardsMaterialize no parser único"
      - "project-init, context-sync e rotina standards-materialize"
    steps:
      - order: 1
        description: "Tasks 1-3: fixtures, seleção por caminho real, transform do linter"
        assignee: "test-writer"
        deliverables:
          - "retargetLinter idempotente e nunca null"
      - order: 2
        description: "Tasks 4-5: transform no applySync e os artefatos da materialização"
        assignee: "backend-specialist"
        deliverables:
          - "hash dos bytes escritos; retrocompat de artefato sem transform"
      - order: 3
        description: "Tasks 6-7: registry indexa a raiz; escape hatch standards.materialize"
        assignee: "security-auditor"
        deliverables:
          - "invariante de pureza do devflow-config preservada"
      - order: 4
        description: "Task 8: fiação de init, sync e rotina por um só caminho de código"
        assignee: "devops-specialist"
        deliverables:
          - "o linter materializado EXECUTA; 2ª passada no-op; edição local preservada"
  - id: "phase-4"
    name: "Validation"
    prevc: "V"
    required_sensors: ["lint", "unit", "integration"]
    summary: "Três sinais observados no ledger e as invariantes da spec provadas contra os fixtures."
    deliverables:
      - "run-lint, run-unit e run-integration observados com exit 0"
      - "nenhum std materializado com enforcement.linter null"
      - "materialize: false é no-op limpo"
      - "live-merge segue ativo: default novo do plugin vale antes da materialização"
    steps:
      - order: 1
        description: "Rodar os três runners e registrar no ledger do contrato verify"
        assignee: "test-writer"
        deliverables:
          - "três sinais observados"
      - order: 2
        description: "Verificar cobertura da spec (D1-D6) contra as tasks entregues"
        assignee: "code-reviewer"
        deliverables:
          - "tabela de cobertura conferida"
      - order: 3
        description: "Confirmar que machine/*.js nunca é fetchado da rede — só copiado do bundle local"
        assignee: "security-auditor"
        deliverables:
          - "update-default-standards.sh inalterado; guardrail anti-RCE literal"
generated: "2026-09-02"
status: filled
scaffoldVersion: "2.0.0"
---

# Materialização dos Standards default em todo projeto

> **Plano detalhado (fonte da verdade para execução):** `docs/superpowers/plans/2026-09-02-standards-materialize-on-init.md`
> **Spec:** `docs/superpowers/specs/2026-09-02-standards-materialize-on-init-design.md`
> **Decisão:** ADR-007 v3.0.0 (`status: Proposto`)

## Task Snapshot

- **Objetivo:** os standards default aplicáveis viram arquivos no projeto — visíveis em git, editáveis, funcionais sem o plugin, atualizáveis sem drift.
- **Sinal de sucesso:** num fixture Odoo, o `.md` materializado tem `linter: engineering/standards/machine/std-security.js` (nunca `null`) e o `machine/*.js` **executa** a partir do projeto. Segunda passada é no-op; edição local é preservada e reportada. `materialize: false` não escreve nada.
- **Origem:** ao instalar o DevFlow num Odoo 17, o operador viu os 15 `std-odoo-*` aparecerem e concluiu que valeria para todo projeto. Aqueles eram standards de **perfil** (ADR-008, copiados por design); os ~26 universais nunca tocavam o disco.

## Restrições globais

| Restrição | Por quê |
|---|---|
| `enforcement.linter` nunca vira `null` | 20 dos 26 defaults têm linter bundlado e rodam hoje sem eject; `null` é downgrade silencioso — e é o que o `eject` simples faz |
| Hash de procedência sobre os bytes **transformados** | hash da origem → todo projeto vira `edited` na 1ª passada → sync congelado |
| Live-merge permanece ativo | é ele que faz um default novo do plugin valer antes de a materialização convergir |
| `machine/*.js` nunca fetchado da rede | a cópia vem do bundle **local**; o guardrail anti-RCE da ADR-007 fica literal |
| Seleção por **caminho real** | 3 defaults têm prefixo `src/**`; extensão sintetizada não revela isso |
| Honrar `standards.local.yaml disable:` | mesma regra que o ADR-008 impõe aos standards de perfil |
| Standard de perfil não passa por esta via | perfis seguem o `resolveArtifacts` do ADR-008 |
| Apenas `node:*` | Dependency Policy |

## Por que o `eject` não serve

`devflow standards eject <id>` reescreve `enforcement.linter` para `null` (`devflow-standards.mjs:594`) porque não traz o `machine/`. Aplicá-lo aos 26 defaults **desligaria os 20 linters hoje ativos** em todo projeto novo — o oposto do objetivo. A materialização reescreve para o caminho canônico do projeto e traz o linter junto.

## Fora de escopo

- Materializar **stacks** (`assets/stacks/`) — mesma discussão, trabalho separado.
- Variante fail-closed do hash divergente (recusar executar linter adulterado) — avaliada e adiada; a detecção é de relatório, não de enforcement.
- Mudar a resolução de origem/sandbox do `run-linter` (ADR-007 v2.1 intacto).

## Evidência a coletar

- Três runners com exit 0, registrados no ledger do contrato `verify:`.
- `grep -L "linter: engineering/standards/machine" ` sobre os `.md` materializados com linter → vazio.
- Relatório do sync mostrando `preserved` após edição local deliberada.

---
type: plan
name: "Desframeworkizar o namespace global do plugin"
description: "Reloca skills de framework para assets/skills/profiles/<fw>/ e devolve a criacao de agente de projeto ao dotcontext"
planSlug: deframework-plugin-namespace
summary: "Localizacao passa a ser o contrato de registro: artefato condicional a framework sai de skills/ e agents/ do plugin (namespace global sem opt-out) para assets/skills/profiles/<fw>/, de onde segue sendo copiado ao .context/ sob deteccao de perfil. Perfis deixam de contribuir agents. BREAKING (major)."
generated: "2026-08-05"
status: filled
scaffoldVersion: "2.0.0"
agents:
  - type: "test-writer"
    role: "Guards de regressao e integridade do trio (T1, T8, T11)"
  - type: "refactoring-specialist"
    role: "Relocacao das skills e retirada de artefatos do bundle (T2, T7)"
  - type: "backend-specialist"
    role: "Resolucao source-aware, contribuicoes de perfil, proveniencia e binding (T3, T4, T5, T6, T10)"
  - type: "documentation-writer"
    role: "Exemplos, template e CHANGELOG (T9)"
  - type: "code-reviewer"
    role: "Revisao do plano na fase R e do diff na fase V"
  - type: "security-auditor"
    role: "Revisao da superficie de proveniencia e da containment do sync na fase V"
docs:
  - "project-overview.md"
  - "architecture.md"
  - "development-workflow.md"
  - "testing-strategy.md"
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    required_sensors: []
    summary: "Diagnostico com evidencia, spec aprovado por secoes e ADR-008 evoluida para v1.1.0."
    deliverables:
      - "docs/superpowers/specs/2026-08-04-deframework-plugin-namespace-design.md"
      - ".context/engineering/adrs/008-framework-profile-scoped-standards-v1.1.0.md"
      - "docs/superpowers/plans/2026-08-04-deframework-plugin-namespace.md"
    steps:
      - order: 1
        description: "Provar a causa raiz: localizacao e o contrato de registro, nao o gating por perfil"
        assignee: "architect"
        deliverables:
          - "Evidencia: repo sem Odoo expondo devflow:odoo-* e devflow:Odoo Specialist"
      - order: 2
        description: "Evoluir a ADR-008 para v1.1.0 (minor) generalizando a regra e revogando agents por perfil"
        assignee: "architect"
        deliverables:
          - "ADR 008 v1.1.0 com 5 guardrails e 6 itens de enforcement novos"
      - order: 3
        description: "Escrever o plano test-first de 11 tarefas com requiredSignals declarados"
        assignee: "architect"
        deliverables:
          - "Plano com fixtures reais e sem placeholders"
  - id: "phase-2"
    name: "Review"
    prevc: "R"
    required_sensors: []
    summary: "Revisao do plano antes de tocar codigo: aderencia aos guardrails, cobertura de teste e risco da mudanca BREAKING."
    deliverables:
      - "Parecer de revisao do plano"
    steps:
      - order: 1
        description: "Revisar o plano contra os guardrails da ADR-008 v1.1.0 e do ADR-012"
        assignee: "code-reviewer"
        deliverables:
          - "Confirmacao de que orfao e preservado e reportado, nunca removido"
      - order: 2
        description: "Validar a ordenacao test-first e a suficiencia das fixtures"
        assignee: "test-writer"
        deliverables:
          - "Confirmacao de que as fixtures fazem o perfil casar"
  - id: "phase-3"
    name: "Execution"
    prevc: "E"
    required_sensors: ["unit", "integration", "lint"]
    summary: "Executar as 11 tarefas do plano em ordem, cada uma RED antes de GREEN."
    deliverables:
      - "assets/skills/profiles/ com as 4 skills relocadas"
      - "scripts/lib/agent-skill-binding.mjs"
      - "profiles/*.yaml sem agents, com skillBindings"
    steps:
      - order: 1
        description: "T1 guard de regressao (disjuncao) em RED antes de qualquer movimentacao"
        assignee: "test-writer"
        deliverables:
          - "test-profile-skills-not-registered.mjs falhando pelos 4 vazamentos"
      - order: 2
        description: "T2 git mv das 4 skills com conteudo byte-identico; guard vira GREEN"
        assignee: "refactoring-specialist"
        deliverables:
          - "git diff --stat -M mostrando so R100, zero linhas alteradas"
      - order: 3
        description: "T3 resolveArtifacts source-aware por slug com dest explicito"
        assignee: "backend-specialist"
        deliverables:
          - "dest sempre .context/skills/<slug>/, nunca derivado do rel do src"
      - order: 4
        description: "T4 skillsWithOrigin e skillBindings; remove agents; deleta odoo-specialist"
        assignee: "backend-specialist"
        deliverables:
          - "frameworkContributions sem a chave agents"
      - order: 5
        description: "T5 terceira raiz no known-hashes e invariante de hash preservado"
        assignee: "backend-specialist"
        deliverables:
          - "conjunto de hashes inalterado exceto pelos do nxz-go-test retirado"
      - order: 6
        description: "T6 binding skills por edicao cirurgica do frontmatter, nunca re-serializacao"
        assignee: "backend-specialist"
        deliverables:
          - "arquivo resultante validado pelo parser do proprio dotcontext"
      - order: 7
        description: "T7 retira nxz-go-test e neutraliza defaults proprietarios do adr-builder"
        assignee: "refactoring-specialist"
        deliverables:
          - "zero referencias a nxz-go-test no plugin"
      - order: 8
        description: "T8 integridade do trio e ajuste dos testes de perfil existentes"
        assignee: "test-writer"
        deliverables:
          - "test-profile-skills-integrity.mjs verde"
      - order: 9
        description: "T9 exemplos, template e CHANGELOG alinhados ao layout novo"
        assignee: "documentation-writer"
        deliverables:
          - "CHANGELOG com entrada BREAKING em Unreleased"
      - order: 10
        description: "T10 deteccao de orfao com veredito de proveniencia"
        assignee: "backend-specialist"
        deliverables:
          - "report.orphaned com verdict untouched ou diverged; nada removido"
  - id: "phase-4"
    name: "Validation"
    prevc: "V"
    required_sensors: ["unit", "integration", "lint"]
    summary: "Observar os tres sinais no ledger e registrar a observacao manual do namespace como observacao, nunca como sinal verde."
    deliverables:
      - "Ledger verify verde para unit, integration e lint"
      - "Registro da observacao manual pos-reinicio"
    steps:
      - order: 1
        description: "T11 rodar os tres sinais declarados e observar o ledger"
        assignee: "test-writer"
        deliverables:
          - "exit 0 em run-unit.sh, run-integration.sh e run-lint.sh"
      - order: 2
        description: "Auditar a superficie de proveniencia e a containment do sync"
        assignee: "security-auditor"
        deliverables:
          - "Confirmacao de que isWithinDir e a recusa de symlink seguem valendo"
      - order: 3
        description: "Registrar a observacao manual do namespace com a ressalva de reindexacao"
        assignee: "code-reviewer"
        deliverables:
          - "Observacao explicita de que nao e sinal de teste"
  - id: "phase-5"
    name: "Confirmation"
    prevc: "C"
    required_sensors: []
    summary: "Finalizar a branch, sinalizar o release major pendente e nao disparar nada automaticamente."
    deliverables:
      - "PR aberto com o resumo BREAKING"
      - "Sinalizacao do release major pendente"
    steps:
      - order: 1
        description: "Atualizar documentacao de fechamento e abrir o PR"
        assignee: "documentation-writer"
        deliverables:
          - "PR descrevendo o BREAKING e o caminho de migracao dos orfaos"
      - order: 2
        description: "Sinalizar o release major sem auto-disparar o workflow"
        assignee: "devops-specialist"
        deliverables:
          - "Comando gh workflow run indicado ao operador, nunca executado sozinho"
---

# Desframeworkizar o namespace global do plugin

> Localização passa a ser o contrato de registro: artefato condicional a framework sai de `skills/` e `agents/` do plugin — namespace global sem opt-out — para `assets/skills/profiles/<fw>/`, de onde segue sendo copiado ao `.context/` sob detecção de perfil.

## Task Snapshot

- **Objetivo:** o namespace `devflow:*` volta a conter apenas capacidades do bridge; nenhum conhecimento de framework ou de produto proprietário aparece como comando em projeto alheio.
- **Sinal de sucesso:** `tests/integration/test-profile-skills-not-registered.mjs` verde (proxy estrutural) **mais** observação manual, pós-reinício, de que `devflow:odoo-*`, `devflow:nxz-go-test` e o agent type `devflow:Odoo Specialist` sumiram da listagem.
- **Referências:**
  - Spec: `docs/superpowers/specs/2026-08-04-deframework-plugin-namespace-design.md`
  - Plano detalhado: `docs/superpowers/plans/2026-08-04-deframework-plugin-namespace.md`
  - ADR: `.context/engineering/adrs/008-framework-profile-scoped-standards-v1.1.0.md`

## Causa raiz

O Claude Code registra **todo** `skills/<nome>/SKILL.md` do plugin como comando invocável (`/devflow:<nome>`) e **todo** `agents/<nome>.md` como agent type, em qualquer projeto, sem mecanismo de opt-out por frontmatter. O gating por perfil (`profiles/<fw>.yaml` + `detect-framework.mjs`) governa apenas a **cópia** para `.context/` — nunca teve efeito sobre o registro.

Evidência: este repositório é o próprio DevFlow (bridge Node/bash, zero Odoo) e expunha `devflow:odoo-development`, `devflow:frontend-specialist-odoo`, `devflow:odoo-l10n-br`, `devflow:odoo-nxz-overlay`, `devflow:nxz-go-test` e o agent type `devflow:Odoo Specialist`. Prova por contraste: os 15 `std-odoo-*`, já sob `assets/standards/profiles/odoo/`, **nunca vazaram**.

## Layout final

| Localização | Conteúdo | Registro |
|---|---|---|
| `skills/` | 44 skills genéricas do bridge | global |
| `assets/skills/profiles/{odoo,nxz}/` | 4 skills de framework | **não registrado**; copiado sob detecção |
| `assets/standards/profiles/{odoo,nxz}/` | 17 standards | já correto, intocado |
| `profiles/{odoo,nxz}.yaml` | gating | perde `agents:`, ganha `skillBindings:` |

`nxz-go-test` sai do bundle: não é contribuído por perfil algum, carrega caminho absoluto da máquina do autor e já existe duplicado em `~/.claude/skills/`. `agents/odoo-specialist.md` é deletado — criar agente de projeto volta a ser exclusividade do dotcontext.

## Riscos

| Risco | Prob. | Impacto | Mitigação | Agente |
|---|---|---|---|---|
| Conteúdo alterado durante o `git mv`, quebrando o invariante de hash | Baixa | Alto | T2 exige `git diff --stat -M` só com `R100`; T5 assere o conjunto de hashes | `refactoring-specialist` |
| `dest` derivado do path de origem produzir `.context/assets/skills/...` | Média | Alto | T3 assere `dest` explícito e que não contenha `assets` | `backend-specialist` |
| Frontmatter do agente descartado por campo mal-tipado | Média | Alto | T6 valida com o parser do próprio dotcontext e usa edição cirúrgica | `backend-specialist` |
| Fixture sem marcador de perfil fazer o teste passar vazio | Média | Alto | Fixtures criam `__manifest__.py`; asserções exigem item encontrado antes de comparar | `test-writer` |
| Projeto-cliente perder artefato já materializado | Baixa | Alto | T10 preserva e reporta; remoção só sob confirmação (ADR-012) | `backend-specialist` |

## Premissas

- O plugin instalado durante a validação é o da branch — se não for, a observação de namespace é inconclusiva, não negativa.
- Nenhum consumidor externo depende de invocar `devflow:odoo-*` por nome; se depender, quebra, e isso é intencional (BREAKING).

## Rollback

| Fase | Ação | Impacto de dados |
|---|---|---|
| P | Descartar spec/ADR/plano da branch | nenhum |
| E | `git revert` dos commits; `git mv` de volta restaura o layout | nenhum |
| V/C | Não mergear; a branch morre sem efeito em cliente | nenhum |

Como nenhuma etapa remove artefato de projeto-cliente, o rollback não tem risco de perda de dados — a política de órfão é preservar e reportar.

## Evidências a coletar

- `git diff --stat -M` da relocação, provando renomeação pura
- Diff do `known-hashes.json` mostrando apenas a saída dos hashes do `nxz-go-test`
- Saída dos três sinais (`unit`, `integration`, `lint`) e o ledger do verify
- Listagem de skills pós-reinício, registrada como **observação**

## Limitação declarada

O desaparecimento do namespace **não é observável por teste automatizado** — depende de o Claude Code reindexar o plugin. O guard de disjunção é proxy estrutural forte; a confirmação final é observação manual, tratada como observação e **nunca** como sinal verde de teste.

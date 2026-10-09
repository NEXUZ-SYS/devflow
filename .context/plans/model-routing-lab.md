---
type: plan
name: "Laboratório de validação autônoma do roteamento de modelos"
description: Tracking dotcontext. Plano executável canônico em docs/superpowers/plans/2026-10-09-model-routing-lab.md. Spec em docs/superpowers/specs/2026-10-09-model-routing-lab-design.md. Stories em .context/workflow/stories.yaml.
planSlug: model-routing-lab
scope: LARGE
autonomy: autonomous
status: filled
progress: 0
generated: "2026-10-09"
scaffoldVersion: "2.0.0"
summary: "Repo irmão devflow-routing-lab que roda o PREVC inteiro de forma autônoma (claude -p + /devflow auto, com retomadas) sobre um software-alvo pequeno (encurtador shortlink), em braços com e sem roteamento, e gera um scorecard: vereditos HELD/MISS/N/A contra um oráculo independente, matriz de cobertura das funcionalidades da v3.7, tokens por modelo (B ÷ A) e suíte de aceitação oculta. Plugin sob teste = clone da tag v3.7.0 via --plugin-dir. Capturar, não resolver."
requiredSignals: [unit, integration, e2e, lint]
sources:
  spec: docs/superpowers/specs/2026-10-09-model-routing-lab-design.md
  plan: docs/superpowers/plans/2026-10-09-model-routing-lab.md
  stories: .context/workflow/stories.yaml
  adrs:
    - .context/engineering/adrs/017-model-routing-v1.0.0.md
phases:
  - id: "phase-1"
    name: "Planning"
    prevc: "P"
    status: completed
    summary: "Autonomia autonomous por escolha do operador: spec e plano gerados sem diálogo, com decisões L1–L11 e premissas registradas para a R. Contexto aterrado na spec/ADR-017, routes.json, model-route.mjs, router.mjs e formatos reais (stream-json com modelUsage e subagent_stats; transcript com effort; meta.json com agentType/model; prevc.json status.phases). Achados de contexto: DevFlow só em escopo de projeto e marketplace local em 3.4.0 → plugin via --plugin-dir da tag. Sem oferta de ADR (gatilho 3/4 não disparou). Plano de 12 tasks com TDD, Agent e Tier por task."
  - id: "phase-1r"
    name: "Review"
    prevc: "R"
    status: completed
    summary: "Architect e security-auditor APROVADO-COM-RESSALVAS (14 + 10 achados), todos incorporados; spec reescrita (H1/H2 pré-registradas, L12–L16, §7 contra a fase real, §13 sondas) e plano reescrito. Sondas no Claude Code 2.1.295: --plugin-dir carrega o mod 3.7.0 (documentation-writer em E com teto sonnet → haiku); XDG isola o ledger; agentId do ledger = transcript; modelUsage no result. Isolamento L12 validado (env por allowlist + git/gh neutros + --setting-sources project,local + --strict-mcp-config): sem ele a rodada herdava discord, cli-anything, conectores, mempalace e hook rtk. CLAUDE_CONFIG_DIR descartado (com o diretório real grava ~/.claude/.claude.json — criado pela sonda e removido; isolado exigiria copiar credencial). Dry-run do plano: 57 unit + 7 e2e + 18 L1 contra a tag + lint, verdes; achou um teste da suíte oculta que passava com o produto ausente (corrigido). Sem BLOCK; autonomia autonomous → R→E sem gate humano."
  - id: "phase-2"
    name: "Execution"
    prevc: "E"
    status: completed
    required_sensors:
      - lint
    summary: "12 stories em autonomous-loop sequencial (AO ausente), cada uma despachada ao agente da story com o modelo do Tier do plano (cheap→haiku, standard→sonnet, capable→opus): 16 commits no repo irmão devflow-routing-lab (branch feature/routing-lab, sem remoto). Contrato final: unit 91, e2e 19, L1 18 (CLI v3.7 = oráculo em todos os agentes×fases; H1/H2 caracterizadas no router-core), lint limpo. Revisões que mudaram o código: S7 (revisão crítica do implementador opus: 5 falso-HELD + 3 falso-MISS corrigidos, 15b5f51); S10 (security-auditor: APROVADO-COM-RESSALVAS — ALTA: cache do plugin dentro do lab expunha a suíte oculta; travamento zerava braço; suíte alterável) e S11 (implementador: sinais, sobras, config no ws) → endurecimentos 9436f81 + 8fe00d9 em paralelo (arquivos disjuntos, commits por caminho explícito) + 938dfa9 (digest da suíte na campanha, INV-ISOL). Emendas registradas no plano e na spec."
    steps:
      - order: 1
        description: "Task 1 — bootstrap do repo e braços como dados (lib/arm.mjs, arms/*.json)"
        assignee: "backend-specialist"
      - order: 2
        description: "Task 2 — oráculo independente e gabarito (oracle.json, lib/tiers.mjs, GABARITO.md)"
        assignee: "test-writer"
      - order: 3
        description: "Task 3 — cache da tag e camada L1 da CLI/hook clássico/omp"
        assignee: "test-writer"
      - order: 4
        description: "Task 4 — leitura do stream-json"
        assignee: "backend-specialist"
      - order: 5
        description: "Task 5 — leitura segura e transcripts"
        assignee: "backend-specialist"
      - order: 6
        description: "Task 6 — ledger (allowlist própria) e prevc.json"
        assignee: "backend-specialist"
      - order: 7
        description: "Task 7 — invariantes e matriz de cobertura"
        assignee: "backend-specialist"
      - order: 8
        description: "Task 8 — scorecard"
        assignee: "backend-specialist"
      - order: 9
        description: "Task 9 — brief do shortlink, seed e materialização do workspace"
        assignee: "backend-specialist"
      - order: 10
        description: "Task 10 — suíte de aceitação oculta com referência e controle quebrado"
        assignee: "test-writer"
      - order: 11
        description: "Task 11 — driver da rodada com retomada e coleta (revisão pesada)"
        assignee: "security-auditor"
      - order: 12
        description: "Task 12 — campanha, runbooks e README"
        assignee: "documentation-writer"
  - id: "phase-3"
    name: "Validation"
    prevc: "V"
    status: pending
    summary: "Contrato completo do laboratório verde; revisão de segurança de run-arm/collect/safe-read; campanha real A+B ao vivo e scorecard revisado, MISS registrados em findings.md e backlog no repo devflow."
  - id: "phase-4"
    name: "Confirmation"
    prevc: "C"
    status: pending
    summary: "Spec, plano e tracking no repo devflow via PR; laboratório fica local (sem remoto). Memória e handoff atualizados."
lastUpdated: "2026-10-09T16:48:00.660Z"
---

# Laboratório de validação autônoma do roteamento de modelos

Tracking do workflow `model-routing-e2e-validation`. O conteúdo canônico está na
[spec](../../docs/superpowers/specs/2026-10-09-model-routing-lab-design.md) e no
[plano](../../docs/superpowers/plans/2026-10-09-model-routing-lab.md).

## Riscos

| Risco | Mitigação |
|---|---|
| `/devflow auto` em `-p` para no meio | driver com `--resume` até `maxResumes`; rodada `incomplete` vira achado |
| `--plugin-dir` não carrega o mod como a instalação | sonda na fase R antes da E |
| Custo da campanha na cota da assinatura | braços em sequência; C e D opcionais |
| Oráculo contaminado pela lib sob teste | `oracle.json` transcrito da spec do roteamento, nunca do `routes.json` |

## Execution History

> Last updated: 2026-10-09T16:48:00.660Z | Progress: 0%

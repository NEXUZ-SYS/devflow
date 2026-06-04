---
status: filled
generated: 2026-06-02
prevc: { scale: LARGE, phase: P }
spec: docs/superpowers/specs/2026-06-02-standards-default-enforcement-design.md
plan: docs/superpowers/plans/2026-06-02-standards-default-enforcement.md
---

# Enforcement de Standards Default sem Eject — Plan (tracking)

> Plano canônico (TDD, detalhado): `docs/superpowers/plans/2026-06-02-standards-default-enforcement.md`
> Spec: `docs/superpowers/specs/2026-06-02-standards-default-enforcement-design.md`

## Goal
Enforçar standards default do plugin no hook PostToolUse **sem exigir eject**,
evoluindo a ADR-007 (major v2.0.0) e estendendo o SI-4 de forma origin-aware;
adicionar `eject --with-linter`.

## Success signal
Projeto sem eject + arquivo violando um default com linter bundlado → o hook
reporta a violação. SI-4 segue rejeitando traversal/symlink. Fetch nunca grava `.js`.

## Decisão arquitetural
Evoluir ADR-007 v2.0.0 (reverter warn-only; defaults podem trazer linter bundlado;
linters **bundled-only**, nunca fetchados — anti-RCE). SI-4 ganha 2º allowlist root
(`<pluginRoot>/assets/standards/machine/`) só para std `origin: default`.

## Task Groups (test-first; detalhe no plano canônico)
| TG | Título | Agente | Tests |
|----|--------|--------|-------|
| 0 | Baseline + fix parser (prerequisito) | backend-specialist | unit |
| 1 | SI-4 origin-aware (núcleo de segurança) | security-auditor | unit + segurança |
| 2 | Runner usa loadStandardsMerged | backend-specialist | unit + integração |
| 3 | CLI + hook passam pluginRoot | backend-specialist | unit + hook |
| 4 | Linters default bundlados (curados ~7) | security-auditor | unit + segurança |
| 5 | Guard anti-RCE no fetch (.js proibido) | security-auditor | shell E2E |
| 6 | `eject --with-linter` | backend-specialist | unit + segurança |
| 7 | ADR-007 v2.0.0 (evolução major) | documentation-writer | ADR audit |
| 8 | E2E + regressão completa | test-writer | E2E + suíte |
| 9 | Docs (post-update-guide, CHANGELOG, bump) | documentation-writer | docs |

## Riscos / mitigação
- **RCE remoto** → linters bundled-only; fetch só `.md` (TG5).
- **Traversal via std do projeto** → SI-4 #1–#3 inalterados (TG1).
- **Falso-positivo nos defaults** → subconjunto curado + revisão security-auditor (TG4).

## Baseline git
Branch `feat/standards-default-enforcement` a partir de `main`, trazendo só o fix
do parser. Subagents: apenas `git add`+`git commit` na branch; proibido
gh/PR/push/merge/switch/branch/delete.

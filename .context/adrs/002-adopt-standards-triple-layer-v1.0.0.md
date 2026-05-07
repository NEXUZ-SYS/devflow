---
type: adr
name: adopt-standards-triple-layer
description: Standards em 3 camadas (Markdown + LLM rules + linter executável)
scope: organizational
source: local
stack: universal
category: principios-codigo
status: Proposto
version: 1.0.0
created: 2026-05-06
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Standards vivem em .context/standards/, com Markdown para humanos, regras LLM-readable embutidas no frontmatter e ao menos 1 linter por standard executado em PostToolUse (sandboxed via SI-4)."
---

# ADR 002 — Standards com tripla camada (Markdown + LLM-readable + linter executável)

- **Data:** 2026-05-06
- **Status:** Proposto
- **Escopo:** Organizacional
- **Stack:** universal
- **Categoria:** Princípios de Código

---

## Contexto

DevFlow v0.13.x não tem pasta dedicada para standards. Convenções de código vivem espalhadas: dentro de ADRs (Layered, SOLID, OWASP), em rules de cada agent (`.context/agents/<agent>.md`), em `CONVENTIONS.md` na raiz e em comentários implícitos na codebase. Quando um agent edita um arquivo, não há mecanismo para automaticamente carregar as regras aplicáveis nem para verificá-las em runtime.

ADRs registram **decisões arquiteturais** (por que X foi escolhido sobre Y); standards são **regras vivas** (como o código deve parecer agora). Os dois coexistem mas têm finalidades diferentes — colapsá-los gera ambiguidade.

## Drivers

- Humanos precisam de prosa explicativa para entender o "porquê" das regras
- LLM agents precisam de regras estruturadas (frontmatter `applyTo` glob + `enforcement.linter`) para aplicação automática
- Code review precisa de mecanismo executável (linter) para feedback determinístico em PostToolUse
- Governança precisa de status (Ativo/Deprecated/Substituido) e relação com ADRs (`relatedAdrs`) para audit trail

## Decisão

Standards vivem em `.context/standards/<id>.md` com tripla camada:

1. **Markdown para humanos** — corpo em prosa explicando princípios, anti-patterns, exemplos.
2. **LLM-readable** — frontmatter com `id`, `applyTo` (glob subset SI-5), `enforcement.linter`, `relatedAdrs`. Hooks consumem via `scripts/lib/standards-loader.mjs`.
3. **Linter executável** — arquivo `.context/standards/machine/<id>.js` invocado pelo PostToolUse hook quando arquivo editado bate `applyTo` glob, sandboxed via SI-4 (path normalization + allowlist + execFile + timeout 5s).

Standards sem linter recebem warning `weakStandard` no audit (a menos que `weakStandardWarning: true` esteja explícito no frontmatter).

## Alternativas Consideradas

- **Manter regras dentro de ADRs (status quo)** — rejeitado: confunde decisão (por que) com regra viva (como); ADRs ficam grandes; sem mecanismo de aplicação runtime.
- **Apenas frontmatter LLM-readable, sem prosa** — rejeitado: humanos perdem contexto histórico; standard vira opaco para code review humano.
- **Apenas linters (sem prosa nem frontmatter)** — rejeitado: agents não podem aplicar standards via contexto durante edição; regra invisível até o linter rodar.
- **Tripla camada com linter obrigatório** — rejeitado: barreira muito alta; alguns standards (estética, naming) têm regras difíceis de codificar em linter mas valiosas como guia.
- **Tripla camada com linter opcional + weakStandard warning** ✓ — escolhido: permite onboarding incremental (autora prosa primeiro, adiciona linter depois), enquanto sinaliza débito.

## Consequências

**Positivas**
- Hooks aplicam standards automaticamente em runtime via PostToolUse
- Code review humano lê o markdown; agents leem o frontmatter; CI roda os linters — cada audiência tem o formato que precisa
- Standards podem evoluir sem tocar ADRs (ADR fica como justificativa estável; standard como regra evolutiva)

**Negativas**
- Mais arquivos no `.context/` (custo cognitivo)
- Linters sandboxed via SI-4 adicionam ~10-50ms por edição em PostToolUse (perf monitorada em V.4)
- Autoria de standards exige conhecimento de glob subset (SI-5) e estrutura de linter

**Riscos aceitos**
- Standards sem linter podem virar papel de parede (mitigação: weakStandard warning + downgrade para guideline após 2 sprints sem evolução)
- Linter mal escrito pode ter falsos positivos ruidosos (mitigação: feedback do linter é warning, não bloqueante; permite calibração progressiva)

## Guardrails

- SEMPRE criar standards em `.context/standards/<id>.md` (canonical) — NUNCA em `.context/docs/standards/` ou outro lugar
- SEMPRE incluir frontmatter completo (id, applyTo, version, enforcement quando aplicável)
- SEMPRE usar glob subset SI-5 em applyTo — NUNCA negação `!` ou extglob `+(...)`/`@(...)`
- QUANDO standard não tem linter, ENTÃO declarar `weakStandardWarning: true` para suprimir warning OU aceitar warning como débito visível
- QUANDO linter executa em PostToolUse, ENTÃO seguir SI-4 (path em `.context/standards/machine/**`, execFile node, timeout 5s)
- NUNCA fazer linter shell-out via `exec` ou interpolação de strings — sempre `execFile('node', [path, file])`

## Enforcement

- [ ] Lint: `devflow standards verify` (Task Group 1.4) checa frontmatter completo + applyTo glob válido + linter path em allowlist
- [ ] Test: `tests/validation/test-standards-loader.mjs` verifica parsing, glob match, weakStandard warning
- [ ] Test: `tests/hooks/test-post-tool-use-linter-rce.sh` (Task 1.3) rejeita 3 cenários de linter envenenado (path traversal, abs path, shell metacharacters)
- [ ] Code review: PRs que adicionam standards devem ter ao menos 1 ADR `relatedAdrs` ou justificar ausência
- [ ] Gate CI/PREVC: PostToolUse hook valida applyTo + roda linter sandboxed em todo Edit/Write

## Evidências / Anexos

- Plano de implementação: `.context/plans/context-layer-v2.md` (Task Groups 1.0 a 1.4)
- Spec original: `docs/devflow-context-layer-validation-v2-pt-br.md` §4.2 (Gap 1) + §5.6 (exemplo error-handling)
- Lib relacionada: `scripts/lib/standards-loader.mjs` (Task 1.2)
- Authoring guide: `.context/standards/README.md` (Task 1.1)
- Security invariant SI-4 (linter sandboxing) — `.context/plans/context-layer-v2.md`

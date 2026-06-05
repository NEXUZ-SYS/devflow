# HANDOFF — standards-standalone-ddc-restructure (retomar amanhã)

> Salvo em 2026-06-05 ao fim da fase **R (Review)**. Para retomar, leia este arquivo + o plano.

## Onde estamos
- **Workflow:** standards-standalone-ddc-restructure · **Scale:** MEDIUM · **Autonomy:** supervised · **Mode:** Lite
- **Branch:** `feat/standards-standalone-ddc-restructure` (3 commits à frente da `main`)
- **Fase atual:** P ✓ · **R ✓ (PROCEED após revisões aplicadas)** · **E ⏳ próximo** · V ⬚ · C ⬚

## Artefatos
- Spec: `docs/superpowers/specs/2026-06-05-standards-standalone-ddc-restructure-design.md`
- Plano (revisado, pronto p/ Execução): `docs/superpowers/plans/2026-06-05-standards-standalone-ddc-restructure.md`
- Commits: `f2f589a` (spec), `e50cba4` (plano), `2e0dcb8` (revisão pós-Review)

## Resultado da Review (não repetir)
- **Security-auditor: PROCEED** — R3/R4/R6/anti-RCE/migração/curl-file/ADR verificados empiricamente. Sem must-fix.
- **Code-reviewer: REVISE leve → JÁ APLICADO** (F1 sentinelas Tests 3/5; F2 Test 7 de migração=AC2; F3 paths absolutos; F4 glob aspado; F5 smoke tmp explícito; F6 audit wording).

## Próximo passo ao retomar: Execução (Phase 1 → 3)
1. **Phase 1 (TDD):** mover fixtures do `tests/scripts/test-update-default-standards.sh` p/ `.context/engineering/standards/` (RED) → retargetar `scripts/update-default-standards.sh` (constante `STD_SUBPATH=".context/engineering/standards"`, HEAD linha ~93, fetch linha ~144) (GREEN) → Test 6 (anti-RCE) → **Task 1.4 Test 7 (migração no-op = AC2)** — congelar `tests/fixtures/update-default-standards-pre-ddc.sh` ANTES do retarget.
2. **Phase 2:** ADR-007 v2.2.0 (v2.1.0→Substituído) + `docs/standards-standalone-sync.md`.
3. **Phase 3 (OUTWARD):** clonar `NEXUZ-SYS/devflow-standards`, montar layout DDC, copiar 21 `.md` + MANIFEST + 13 `machine/*.js` + READMEs, remover root stale, byte-match, **commit+push só após confirmação explícita do comando**, smoke real pós-push.

## Lembretes de execução (guardrails)
- Subagents de implementação: proibir `gh`/PR/merge/push/`git switch` — só commits na branch atual. O **push da Phase 3 é do orquestrador, com confirmação do usuário**.
- E2E/smoke destrutivo só em tmpdir (`cp -r` cópia), nunca in-place.
- Invariante dura: `.js` NUNCA fetchado (anti-RCE) — só `.md`.

## Comando para retomar
`/devflow:devflow-next` (avança R→E) ou `/devflow autonomy:supervised continuar standalone-ddc-restructure` — a fase de Execução lê este plano.

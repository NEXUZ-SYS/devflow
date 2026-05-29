# Context Doctor + Routines — Implementation Plan

> **DevFlow workflow:** context-doctor-routines | **Scale:** LARGE | **Phase:** P→R
> **Spec:** docs/superpowers/specs/2026-05-28-context-doctor-routines.md

**Goal:** Entregar `/devflow:devflow-doctor` (diagnóstico + repair guiado da saúde do contexto) e um subsistema de routines file-based que o SessionStart sugere quando vencidas.

**Architecture:** Lib de checks plugáveis (bash) + comando/skill doctor; engine de routines (bash) + comando/skill routines + `.context/routines.yaml`; injeção condicional no `hooks/session-start`. Zero deps de runtime; i18n em `locales/`; testes em `tests/hooks/` com mocks e data mockada.

**Tech Stack:** Bash puro, JSON/YAML lidos via grep/awk (padrão do repo), hooks Claude Code, i18n locales.

**Agents:** devops-specialist (hooks/scripts), test-writer (suites), documentation-writer (docs/README), security-auditor (review dos repairs destrutivos).

**Convenção TDD:** todo grupo começa por teste (RED) → implementação (GREEN). Testes usam PATH só-mock + data mockada; NUNCA tocam palace/`.mcp.json` reais.

---

## Task Group 1: Pendência herdada — limpar wings órfãs + corrigir isolamento do teste post-merge
**Agent:** bug-fixer · **Tests:** unit (bash)
> Resolve o débito desta sessão antes de construir em cima. O `mempalace-health` check (TG3) reutiliza a lógica de detecção de wings órfãs.

- [ ] Escrever teste que falha: `test-post-merge-mempalace.sh` caso "CLI absent" deve rodar com PATH **sem nenhum mempalace** (real ou mock) e provar que nada foi minerado — hoje deixa o mempalace real no PATH.
- [ ] Confirmar RED (o teste atual mineraria o palace real).
- [ ] Corrigir o harness: caso "absent" usa `PATH` mínimo controlado (sem `~/.local/bin`).
- [ ] GREEN.
- [ ] Limpar as wings órfãs `repo.*` do palace real (via tool MCP de delete ou `mempalace` — operação destrutiva, confirmar com usuário; fora da suíte de teste).

## Task Group 2: Check registry (lib) + contrato
**Agent:** devops-specialist · **Tests:** unit (bash)
- [ ] Teste: `tests/hooks/test-doctor.sh` valida o contrato de um check dummy (`id/status/diagnosis/repair/severity/destructive`) e o agregador que coleta múltiplos checks e ordena por severidade.
- [ ] RED.
- [ ] Implementar `scripts/lib/doctor-checks/_registry.sh` (loader + contrato + agregador de relatório).
- [ ] GREEN.

## Task Group 3: Checks iniciais
**Agent:** devops-specialist · **Tests:** unit (bash) com fixtures tmp
- [ ] Teste `mcp-config-valid`: fixtures de `.mcp.json` — válido / JSON inválido / `mcpServers` aninhado / `command` fora do PATH (mock) → status correto + repair R1. RED→GREEN.
- [ ] Teste `mcp-connectivity`: mock de `claude mcp list` (conectado/desconectado) → status + repair R2. RED→GREEN.
- [ ] Teste `mempalace-health`: mock `mempalace status` com wing presente / wing `repo.*` órfã / mensagem de drift → repairs R3 (destrutivo) e R4. RED→GREEN.
- [ ] Teste `devflow-config` + `git-hooks` (R5: autoMine sem hook). RED→GREEN.

## Task Group 4: Comando + skill `/devflow:devflow-doctor`
**Agent:** devops-specialist · **Tests:** unit (bash) + E2E (CLI)
- [ ] Teste E2E: doctor roda todos os checks num repo tmp e imprime relatório agrupado; `--fix` aplica repair não-destrutivo após confirmação (mock de input); destrutivo exige confirmação e nunca roda em modo não-interativo. RED.
- [ ] Implementar `skills/doctor/SKILL.md` (orquestra checks, dry-run + confirmação, modelo de consentimento C) e `commands/doctor.md` (thin, `user_invocable`).
- [ ] GREEN.

## Task Group 5: Engine de routines
**Agent:** devops-specialist · **Tests:** unit (bash) com data mockada
- [ ] Teste `tests/hooks/test-routines.sh`: parse de `.context/routines.yaml`; cálculo de `nextRun` (Nd/Nw/Nm); marcação de vencida com **data mockada** (env override); `run` grava `lastRun` e recalcula; `snooze` seta `snoozeUntil`. RED.
- [ ] Implementar `scripts/lib/routines.sh` (parse + agenda + record). GREEN.
- [ ] Template `templates/routines.yaml` com a routine default `context-maintenance` (doctor a cada 7d).

## Task Group 6: Comando + skill `/devflow:devflow-routines`
**Agent:** devops-specialist · **Tests:** E2E (CLI)
- [ ] Teste: `list` mostra estado/vencidas; `run <id>` executa os `prompts[]` em sequência (mock dos alvos command/skill/agent); `snooze`/`enable`/`disable`. RED.
- [ ] Implementar `skills/routines/SKILL.md` + `commands/routines.md`. GREEN.

## Task Group 7: SessionStart — sugestão de routines vencidas
**Agent:** devops-specialist · **Tests:** integration (bash) com data mockada
- [ ] Teste `tests/hooks/test-session-start-routines.sh`: injeta `<DEVFLOW_ROUTINES_DUE>` só quando vencida + `enabled`; respeita **1x/dia** (`lastSuggested`) e **snooze**; nunca executa. Usa data mockada e PATH só-mock. RED.
- [ ] Implementar bloco no `hooks/session-start` espelhando `DOCS_MCP_RECOMMENDATION` (ler routines, filtrar vencidas, gravar `lastSuggested`, emitir bloco). GREEN.

## Task Group 8: i18n + integração no config/init
**Agent:** documentation-writer · **Tests:** unit (lint i18n)
- [ ] Teste: chaves de mensagem do doctor/routines presentes nos 3 locales (en/pt/es); sem chave faltando.
- [ ] Adicionar strings em `locales/`. GREEN.
- [ ] `skills/config` (e init): ao ativar manutenção, criar `.context/routines.yaml` a partir do template (opt-in, mesma mecânica da oferta do install-hook).

## Task Group 9: Docs + registro
**Agent:** documentation-writer · **Tests:** n/a (docs)
- [ ] `commands/devflow.md` (Related Commands + help + QUICK REFERENCE): `/devflow:devflow-doctor` e `/devflow:devflow-routines`.
- [ ] `references/skills-map.md`: skills `doctor` e `routines`.
- [ ] `docs/tutorial-setup.md` + `references/post-update-guide.md`: seção de manutenção do contexto (doctor + routines + catálogo de repairs).
- [ ] (Opcional) abrir ADR a partir do spec (decisão do agendador file-based).

## Validação (V) — quando implementar
- Suíte `tests/hooks/test-doctor.sh`, `test-routines.sh`, `test-session-start-routines.sh` + a correção do TG1, todas verdes.
- `bash -n` em todos os scripts; revisão de segurança dos repairs destrutivos (R3) pelo security-auditor.
- E2E real: rodar `/devflow:devflow-doctor` neste repo e confirmar que ele detecta os 5 casos canônicos (incl. wings órfãs e drift) sem aplicar nada destrutivo sem confirmação.

## Confirmação (C) — quando implementar
- README (histórico de versões) + bump **minor** (nova capability) + PR via `gh` + merge (autoFinish).

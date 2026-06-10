---
type: adr
name: doc-grounding-enforcement
description: Modo doc-grounding opt-in (.devflow.yaml) — fatos de stack externo só do MCP de docs, via web-block hard + diretiva fail-closed; não é trava nos pesos
scope: organizational
source: local
stack: universal
category: seguranca
status: Aprovado
version: 1.0.0
created: 2026-06-10
supersedes: []
refines: []
protocol_contract: null
decision_kind: firm
summary: "Um flag opt-in grounding.mode (off|docs-first|docs-only) no .context/.devflow.yaml força que afirmações sobre stack EXTERNO (lib/framework/API/versão) venham apenas do MCP de documentação canônico. O enforcement é em camadas, separando o que é máquina-enforçável do que é diretiva: (1) hard — o pre-tool-use nega WebSearch/WebFetch (mesma mecânica permissionDecision=deny do ADR-004); (2) diretiva — o session-start injeta <GROUNDING_MODE> com o protocolo fail-closed (consultar MCP → citar lib@versão → parar se vazio/down, nunca responder de memória); (3) UX — pergunta no /devflow config (P10) gera a seção; (4) safety-net — o doctor (check grounding-mcp) avisa se o docsMcpServer canônico não está no .mcp.json. Honestidade explícita: o flag NÃO desliga o conhecimento de treino do modelo (não há trava nos pesos) — eleva a guarda a web-block + citação + fail-closed. Escopo = só stack externo; raciocínio geral e código do próprio projeto (já coberto pelo std-grounding via Read/Grep) seguem livres. Operacionaliza o std-grounding (prose-only) para conhecimento de stack."
---

# ADR 009 — Doc-grounding enforcement opt-in (web-block hard + diretiva fail-closed; não é trava nos pesos)

## Contexto

Num teste real, o `mcp__docs-mcp-server__search_docs` deu timeout e o agente respondeu de **memória de treino** sobre uma stack versionada (Odoo 18) — exatamente o anti-padrão que o `std-grounding` proíbe ("nunca confie só em memória"). Mas o `std-grounding` é **prose-only** (`linter: null`, `weakStandardWarning: true`): descreve a regra, não a enforça, e mira o código do próprio repo (verificável por Read/Grep), não o conhecimento de **stack externo** (libs/APIs versionadas), cuja fonte canônica é o MCP de documentação (`docs-mcp-server`).

O usuário pediu um flag que **force** o sourcing só do MCP de docs, bloqueando memória de treino e internet. A restrição técnica honesta: um flag em `.devflow.yaml` é dado lido pelo agente/hooks, **não** uma trava nos pesos do modelo — não há como "desligar" o conhecimento de treino. O que é máquina-enforçável é bloquear ferramentas web, exigir citação e ser fail-closed.

## Decisão

1. **Flag opt-in `grounding.mode`** no `.context/.devflow.yaml`: `off` (default) | `docs-first` (consulta o MCP; se vazio, complementa COM disclosure explícito) | `docs-only` (estrito: fato de stack só do MCP; vazio/down → para e avisa). Ausência da seção = `off`.

2. **Escopo = só stack EXTERNO** (lib/framework/API/versão). Raciocínio geral, o código do próprio projeto (já coberto pelo `std-grounding` via Read/Grep/Glob) e o contexto da conversa seguem livres — bloquear "todo conhecimento" degradaria o agente e é inviável.

3. **Enforcement em camadas, separando máquina de diretiva:**
   - **Hard (pre-tool-use):** quando `mode != off` e `blockWeb`, nega `WebSearch`/`WebFetch` (+ `blockToolPatterns` opcional) via `permissionDecision=deny` — a mesma mecânica do ADR-004. Ramo self-contained, só para tool-names de web, **antes** do gate Edit/Write; não toca a branch-protection.
   - **Diretiva (session-start):** injeta `<GROUNDING_MODE>` com o protocolo: consultar o MCP → citar `lib@versão` → fail-closed (parar e declarar em `docs-only`; complementar com disclosure em `docs-first`).
   - **UX (config/init):** pergunta P10 no `/devflow config` gera a seção; lista os servers `*docs*` e pede o canônico quando há mais de um.
   - **Safety-net (doctor):** o check `grounding-mcp` avisa (WARN) se o `docsMcpServer` canônico não está no `.mcp.json` enquanto o modo está ativo — senão o agente fica fail-closed "no escuro".

4. **Honestidade de escopo é parte da decisão.** A diretiva e a doc declaram que o modo NÃO é trava nos pesos — é web-block + citação + fail-closed. O bloqueio de web é best-effort: não cobre `Bash curl/wget` (gap residual documentado).

## Alternativas Consideradas

- **Só instrução (sem hook)** — sem o web-block hard, o agente continua podendo pesquisar na internet; rejeitado (a parte enforçável agrega a maior garantia).
- **Bloquear todo conhecimento de treino** — inviável (não há trava nos pesos) e degradante (trava em trivialidades/raciocínio); rejeitado em favor do escopo "só stack externo".
- **Apenas um modo estrito (`docs-only`)** — deixa o agente "mudo" para stack se o MCP cair; rejeitado em favor de também oferecer `docs-first` (meio-termo com disclosure).
- **Enforcement no harness genérico (run-linter/permissions)** — pôr "manifest Odoo"/"MCP de docs" na camada genérica fura o isolamento; rejeitado — a lógica vive no hook + config, e o web-block reusa a mecânica neutra de `permissionDecision=deny`.
- **Camadas (hard web-block + diretiva fail-closed + UX + doctor), escopo stack-only, honestidade explícita** ✓ — enforça o enforçável sem prometer o impossível.

## Consequências

**Positivas**
- Reduz drasticamente respostas não-aterradas sobre stack: web bloqueado por máquina, e a diretiva fail-closed transforma "MCP indisponível" em "declaro e paro" em vez de "respondo de memória".
- Reusa mecânica existente (deny do ADR-004, injeção do session-start, interview do config, registry do doctor) — superfície nova mínima.
- Opt-in e escopo estreito: projetos que não ativam não mudam; o agente segue funcional para raciocínio e código próprio.

**Negativas**
- Em `docs-only`, se o MCP cair o agente fica "mudo" para fatos de stack até reindexar — mitigado pelo `docs-first`, pela mensagem clara e pelo check do doctor.
- A garantia é parcial por construção (não há trava nos pesos); o valor está nas barreiras, não numa impossibilidade técnica.

**Riscos aceitos**
- Bypass por `Bash curl/wget` ou MCP de internet não-listado — gap residual documentado; hardening futuro opcional (denylist de comando de rede no Bash).
- Drift entre o `docsMcpServer` declarado e o realmente indexado — mitigado pelo check `grounding-mcp` do doctor.

## Guardrails

- SEMPRE tratar o flag como opt-in: ausência de `grounding:` ou `mode: off` → comportamento atual, sem bloqueio (fail-open correto).
- SEMPRE manter o ramo de grounding do `pre-tool-use` self-contained e só para tool-names de web, ANTES do gate Edit/Write — NUNCA alterar a branch-protection nem o deny de config-ausente.
- SEMPRE declarar a honestidade de escopo na diretiva e na doc: o modo é web-block + citação + fail-closed, NÃO trava nos pesos.
- SEMPRE restringir o escopo a stack externo; NUNCA bloquear raciocínio geral ou referência ao código do próprio projeto (esse é o domínio do `std-grounding` via Read/Grep).
- QUANDO `mode != off` e o `docsMcpServer` não estiver no `.mcp.json` ENTÃO o doctor DEVE emitir WARN (o agente não pode ficar fail-closed silenciosamente).
- SEMPRE usar `permissionDecision=deny` (mecânica do ADR-004) para o web-block — não inventar novo canal de bloqueio.

## Enforcement

- [ ] `tests/hooks/test-pre-tool-use-grounding.sh` — web-block nega WebSearch/WebFetch quando ativo, libera em off/blockWeb=false/ausente; branch-protection inalterada (regressão).
- [ ] `tests/hooks/test-session-start-grounding.sh` — `<GROUNDING_MODE>` injetado quando ativo, ausente quando off/ausente.
- [ ] `tests/validation/test-doctor.mjs` — check `grounding-mcp` (OK off/ausente; WARN ativo-sem-server; OK ativo-com-server).
- [ ] `skills/config/SKILL.md` §2.5 (P10) + regra de geração da seção `grounding:`.

## Evidências

**Referências internas:** plano `.context/plans/grounding-docs-only-mode.md` (spec + decisões travadas + review notes) · `hooks/pre-tool-use` (ramo de grounding) · `hooks/session-start` (bloco `<GROUNDING_MODE>`) · `scripts/lib/doctor.mjs` (check `grounding-mcp`) · `skills/config/SKILL.md` §2.5 · `assets/standards/std-grounding.md` (cross-ref). Operacionaliza o `std-grounding` (prose-only) para conhecimento de stack externo. Reusa a mecânica `permissionDecision=deny` do ADR-004 (permissions deny-first, vendor-neutral). Origem: incidente real de timeout do `search_docs` com resposta de memória.

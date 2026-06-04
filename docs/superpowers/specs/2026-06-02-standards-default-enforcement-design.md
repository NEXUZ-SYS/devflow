# Spec — Enforcement de Standards Default sem Eject

> **DevFlow workflow:** standards-default-enforcement · **Scale:** LARGE · **Phase:** P
> **Status:** aprovado (Planning) · **Data:** 2026-06-02

## Problema

Hoje o hook PostToolUse só enforça standards do **projeto**: `run-linter.mjs` chama
`loadStandards(projectRoot)` (project-only) e os 20 defaults do plugin têm
`enforcement.linter: null`. Resultado: um projeto que usa os defaults como vêm
**não recebe nenhum enforcement automático** — precisa ejetar + escrever linter +
religar `enforcement.linter` manualmente. O usuário quer que os defaults sejam
**enforçados out-of-the-box**, deixando o eject só para *customizar* o padrão.

## Decisão

Reverter conscientemente a postura warn-only da **ADR-007** (evolução major →
v2.0.0): defaults PODEM trazer linter **bundlado no plugin**, executados pelo
mesmo sandbox SI-4 — agora com um segundo allowlist root (o `machine/` do plugin,
trusted, mesmo nível dos hooks). Em paralelo, adicionar `eject --with-linter`
(opt-in, project-side, sem tocar em segurança) como caminho de customização.

### Alternativas consideradas
- **Manter ADR-007 + só eject --with-linter** — rejeitado pelo usuário: não atende
  o objetivo de enforçar sem eject.
- **Só loader swap (sem shippar linters)** — rejeitado: não enforça nada (defaults
  seguem `linter:null`).
- **Evoluir ADR-007 + estender SI-4** ✓ — escolhido: enforça defaults nativamente.

## Design

### D1 — ADR-007 v2.0.0 (evolução major)
Guardrails revertidos/adicionados:
- ANTES "NUNCA bundlar linter no plugin" → AGORA "defaults PODEM trazer linter bundlado".
- **(anti-RCE, crítico)** linters default são **bundled-only, NUNCA fetchados**. O
  `update-default-standards.sh` busca **só `.md`** do repo standalone — jamais `.js`.
  Buscar+executar código remoto = RCE; proibido por invariante.
- Defaults sem regra determinística **permanecem `linter:null`** (warn-only).

### D2 — SI-4 origin-aware (run-linter.mjs)
Resolução do caminho do linter conforme `std.origin`:

| origin | base de resolução | allowlist root |
|---|---|---|
| `project` (e undefined) | `<projectRoot>/.context/` | `.context/engineering/standards/machine/` (+legacy) |
| `default` (novo) | `<pluginRoot>/assets/standards/` | `<pluginRoot>/assets/standards/machine/` |

As 5 verificações SI-4 permanecem: (1) normalização (rejeita `..`/abs/whitespace/
metachars), (2) allowlist, (3) symlink-realpath dentro do allowlist, (4) `execFile`
node (nunca shell), (5) timeout 5s + maxBuffer 1MB. Só muda: o conjunto de roots
permitidos ganha o root do plugin **quando** o std é `origin: default`.

### D3 — Loader no runner + trust-anchor do pluginRoot
`runLintersFor(event, projectRoot, pluginRoot)` usa
`loadStandardsMerged(projectRoot, pluginRoot)`. Project override por id continua:
std do projeto vence o default homônimo.

**Trust-anchor (R5/S3 — crítico):** `pluginRoot` NÃO vem do env `CLAUDE_PLUGIN_ROOT`
(envenenável → RCE se apontar para dir gravável com linter falso). Vem do
`--plugin=<path>` derivado pelo hook a partir do `BASH_SOURCE` (a própria
localização on-disk do hook, confiável). O runner só habilita o branch de linter
`default` se o `pluginRoot` for **verificado** por um marker do plugin
(`.claude-plugin/plugin.json`); senão, **fail-closed** para project-only.

**Gate do hook (R1):** o bloco de linter em `hooks/post-tool-use` hoje só roda se
`.context/standards` existe — isso anula o enforcement sem eject. Passa a rodar
quando o `pluginRoot` está verificado e o arquivo editado existe.

### D4 — Linters default bundlados (subconjunto curado)
Shippar linter só para concerns de alto sinal / baixo falso-positivo. Conjunto
inicial proposto (revisável na execução):
`observability` (console.log), `security` (dangerouslySetInnerHTML),
`error-handling` (catch vazio), `performance` (SELECT *),
`test-discipline` (it.only/skip), `secret-conventions` (segredo hard-coded),
`runtime-validation` (z.any()). Demais (grounding, documentation, commit-hygiene,
data-modeling, migration, naming, schemas, accessibility, i18n, caching,
state-management, api-conventions, code-review) ficam `linter:null` por ora.
Arquivos em `assets/standards/machine/std-<id>.js` + `enforcement.linter:
machine/std-<id>.js` no `.md` correspondente.

### D5 — `eject --with-linter`
Flag no subcomando `eject`: copia o std → scaffolda
`.context/engineering/standards/machine/std-<id>.js` → religa `enforcement.linter`.
Tudo project-side (SI-4 inalterado). `eject` simples segue manual e idêntico.
Recusa sobrescrever linter existente sem `--force`.

### D6 — Prerequisito
Fix do parser de frontmatter (brace-glob `applyTo`, já no working tree) é baseline —
sem ele os `applyTo` dos defaults quebram e nenhum linter casa.

## Segurança (análise)
- **RCE remoto:** mitigado por D1 (linters bundled-only; fetch só de `.md`).
- **Path traversal via std do projeto:** SI-4 #1/#2/#3 inalterados → `..`/abs/symlink
  fora do allowlist seguem rejeitados.
- **Confiança do plugin root:** executar `.js` do plugin é o mesmo nível de confiança
  dos hooks (que já executam). O root do plugin é read-only e versionado no release.
- **Override malicioso:** um std do projeto com mesmo id de um default vence (origin
  project) e seu linter resolve no `.context` (allowlist project) — não consegue
  apontar para o plugin.

## Escopo
- IN: ADR-007 v2.0.0; SI-4 origin-aware + 2º root; loader swap no runner+cli+hook;
  ~7 linters default bundlados + wiring; `eject --with-linter`; testes (unit +
  segurança SI-4 + E2E).
- OUT: fetch de linters (proibido); shippar linter para os concerns fuzzy; UI/CLI
  além do `--with-linter`; mudar o índice Stage-1 (já usa merged); **trazer
  `edit-nudge.mjs` (Camada 2) para o merged** (R17 — deferido: projeto em defaults
  puros ganha enforcement mas não o nudge; tratar em entrega futura).

**Barra de falso-positivo (R14):** cada linter default só é shippado se passar:
(i) `applyTo` realista, (ii) teste "snippet conforme não dispara", (iii) sign-off
do security-auditor na conservadorismo da regex. `console.log`/`SELECT *`/`z.any()`
serão reavaliados (alto FP fora de contexto) antes de entrar no conjunto curado.

## Critérios de aceitação
1. Projeto SEM eject + arquivo violando um default com linter bundlado → o hook
   PostToolUse reporta a violação (origin default, linter do plugin).
2. SI-4: linter de std `origin: project` continua confinado ao `.context/.../machine`;
   `..`/abs/symlink-escape seguem rejeitados (testes verdes).
3. `update-default-standards.sh` nunca grava `.js` (teste garante: MANIFEST só `.md`).
4. `eject --with-linter <id>` gera `.md` + `machine/std-<id>.js` + `enforcement.linter`
   religado; `eject` simples permanece sem linter.
5. Project std override de um default com linter: vence o do projeto.
6. ADR-007 v2.0.0 com audit PASSED; supersedes/refines coerentes.
7. Suíte completa verde (exceto as 2 falhas de rede pré-existentes).

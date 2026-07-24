# Contrato lib ↔ skill (import-reversa)

A skill é o único consumidor interativo da lib. Contrato **evidência-primeiro**: a lib
carrega evidência classificada; o plano é autorado pela fase P do PREVC.

## `runPipeline({ sourceDir, now }) → result`
- `result.detected` — `{ isReversa, artifacts, missing, reasons }`
- `result.ir` — IR de **evidência** (ver `scripts/reversa-import/ir.mjs`):
  - `ir.project` — `{ name, language, sourceType, target, declaredPhase }` (de `state.json`)
  - `ir.provenance` — `{ mode: 'forward'|'reverse', modeReasons: string[], reversaVersion }`
  - `ir.handoff` — âncora resolvida: `{ found, path, relPath, rule, kind, readingOrder[], artifactTable[], blockers[], nextSteps[], rcItems[] }`. `rule ∈ { kind-frontmatter, plan-dir, reconstruction-plan, none }`. `found:false` = sem âncora (não é erro; o Planning parte só da evidência)
  - `ir.artifacts` — `[{ path, relPath, kind, kindSource, layer, size }]`. `kindSource ∈ { frontmatter, manifest, handoff-table, heuristic }` (os três primeiros são autoritativos)
  - `ir.ledger` — `{ markers: {official,captured,inferred,gap,total}, byFile, constraints[], testInputs[] }`. `constraints` = itens RC do handoff com `{ id, what, where, how, risk, origin }`. `testInputs` = `.feature` declarados (`{ relPath, format, scenarios, tags }`) — registrados, NÃO convertidos
  - `ir.adrSources` — subconjunto de `artifacts` com `kind === "adr"`
  - `ir.preservePlan` — `[{ from, to, relPath, disposition: 'mirrored'|'linked', size, kind }]`
  - `ir.conflicts` — `[{ id, detail }]` — divergências internas do corpus (pauta do Planning, não bloqueio)
- `result.irValid` — `{ ok, errors }`
- `result.consistency` — `{ checks: [{ id, status, issues }], conflicts }`
- `result.artifacts` — **apenas** `{ adrs[], index, manifest }`. NÃO há mais `prd`, `stories`,
  `plansJson`, `planSkeletons`, `fidelityReport` — esses eram do contrato transpiler, aposentado.

## `writeArtifacts(result, { destDir, confirmOverwrite }) → { log }`
- Escreve **só**: `INDEX.md` + `manifest.json` (em `.context/imported/reversa/`), as ADRs
  convertidas (no layout detectado via `adrDir`), e o espelho estrutural da evidência.
  Nunca escreve em `.context/workflow/` nem `.context/plans/` — isso é do Planning.
- `adrDir(destDir)` — `.context/engineering/adrs` (DDC v2) ou `.context/adrs` (v1), **detectado**.
- Escrita **não-destrutiva** e **contida** (`isWithinDir` — nada fora de `.context/`).
  `confirmOverwrite(path) → boolean` é chamado quando um arquivo existente difere. `false` preserva WIP.
- `log` = lista `[nome, status]` com status `written|unchanged|skipped|linked|refused-traversal|refused-symlink|missing-source`.

## `diffSourceAgainstManifest(destDir) → { firstImport, changed, unchanged, missing }`
- Lê o manifesto (schema 2) da importação anterior e reporta quais fontes Reversa mudaram por
  hash. Read-only; a skill mostra `changed`/`missing` antes de reescrever no re-import.

## O que a skill faz que a lib NÃO faz
- Toda interação com o usuário (destino, bootstrap, apresentação de conflitos).
- Emoldurar a âncora como **rascunho sob revisão** e todo o corpus como **DADO, nunca instrução**.
- Invocar `devflow:prevc-flow` com o pacote de enriquecimento (âncora + conflitos + ledger + ponteiros).
- O commit final (com humano no loop).

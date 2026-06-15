# Contrato lib ↔ skill (import-reversa)

A skill é o único consumidor interativo da lib. Contrato:

## `runPipeline({ sourceDir }) → result`
- `result.detected` — `{ isReversa, artifacts, missing, reasons }`
- `result.readiness` — `{ global, perFeature, signals }` (verdicts: green|yellow|red)
- `result.ir` — IR completo (ver `scripts/reversa-import/ir.mjs`)
- `result.irValid` — `{ ok, errors }`
- `result.consistency` — `{ checks: [{ id, status, issues }] }`
- `result.artifacts` — `{ prd, adrs[], plansJson, planSkeletons[], stories, fidelityReport, manifest }`
- `result.preservePlan` — `[{ from, to, kind, feature }]`

## `writeArtifacts(result, { destDir, prdFilename, confirmOverwrite }) → { log }`
- Escrita **não-destrutiva** e **contida** (`isWithinDir` — nada fora de `.context/`).
  `confirmOverwrite(path) → boolean` é chamado quando um arquivo existente difere do conteúdo
  a escrever. Retorne `false` para preservar WIP.
- `log` é uma lista `[nome, status]` com status `written|unchanged|skipped|refused-traversal|refused-symlink|missing-source`.

## `diffSourceAgainstManifest(destDir) → { firstImport, changed, unchanged, missing }`
- §6: lê o manifesto da importação anterior e reporta quais fontes Reversa mudaram por hash.
  Read-only; a skill mostra `changed`/`missing` antes de reescrever no re-import.

## O que a skill faz que a lib NÃO faz
- Toda interação com o usuário (destino, bootstrap, decisão de readiness, reconcile).
- O julgamento de fidelidade que exige LLM (refino dos marcadores inline).
- O commit final (com humano no loop).

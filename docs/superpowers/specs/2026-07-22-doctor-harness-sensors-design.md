# Design — check `harness-sensors` no doctor + catálogo derivado do `verify:`

**Data:** 2026-07-22 · **Workflow PREVC:** `doctor-harness-sensors` · **Escala:** SMALL (P→E→V)
**Levantamento do gap:** [`../plans/2026-07-22-harness-sensors-catalog-gap.md`](../plans/2026-07-22-harness-sensors-catalog-gap.md)

---

## Problema

O gate de fase do PREVC exige os sensores `tests` e `lint`. Nenhum dos dois existe: este repo nunca definiu `.context/config/sensors.json`, então valem só os built-ins genéricos do dotcontext (`i18n-coverage`, `tests-passing`, `typecheck-clean`), todos moldados para npm/TS — e o repo não tem `package.json` na raiz, rodando testes por `bash tests/run-unit.sh` + `node --test`.

Resultado: `workflow-advance({force: true})` em **todo** avanço de fase — 4 vezes só na sessão que produziu este spec. O problema não é teste faltando (os sinais rodam e ficam verdes no ledger **e** no CI); é contabilidade do harness divergindo da evidência real. E o custo não é neutro: normaliza o bypass do gate que o ADR-013 existe para construir.

## Achado: o catálogo roda em shell

Rastreando a execução no `@dotcontext/cli`:

| caminho | execução |
|---|---|
| sensores built-in (`tests-passing`) | `spawn(exe, args, { shell: false })` — sem shell |
| sensores do `sensors.json` | `promisify(child_process.exec)(command)` — **`/bin/sh -c`** |

O `verify:` do ADR-013 é deliberadamente argv-only, com `verify-contract-guard` fazendo cumprir. Espelhá-lo no catálogo o coloca num caminho que usa shell.

### Enquadramento honesto do risco

**O caminho de shell já existe e é pré-existente.** Qualquer `sensors.json` em qualquer projeto DevFlow já é executado com `sh -c` pelo harness instalado. Quem tem escrita no repositório pode criar esse arquivo hoje e obter execução em shell — gerar o arquivo **não cria essa capacidade**. E um atacante não passaria pelo nosso gerador: editaria o JSON à mão.

Logo, a superfície marginal de gerar é ≈ zero, e **a validação estrita não é uma fronteira de segurança**. Ela é um guard de **corretude**, contra nós mesmos:

- garante o round-trip `argv ↔ string` — o harness re-tokeniza a string, então um espaço dentro de um argumento quebraria o comando silenciosamente;
- impede espelhar sem perceber um comando que ganha semântica nova sob shell.

Controle adicional que já existe: `.context/config/` **não está no `.gitignore`**, então o catálogo entra versionado e passa por revisão de PR como qualquer arquivo.

## Decisões

### D1 — Gerar o catálogo a partir do `verify:`, com fail-closed

Um gerador dedicado lê o contrato `verify:` pelo parser único (ADR-011) e emite o catálogo. **Recusa e sai não-zero** se qualquer comando tiver:

- `argv[0]` fora do allowlist do ADR-013 (`node, npm, pnpm, python, python3, pytest, make, bash, sh`);
- metacaractere de shell — `; | & $ \` > < ( ) { }` — em qualquer posição;
- espaço dentro de um argumento (quebraria o round-trip).

Fail-closed é o mesmo posicionamento do ADR-013 para `verify:` inválido: nunca degradar em silêncio.

### D2 — Só `tests` e `lint` nascem bloqueantes

```
verify:                          sensors.json
  unit          →  { id: "unit",        blocking: false }
  lint          →  { id: "lint",        blocking: true  }   ← o phase-defaults auto-exige
  integration   →  { id: "integration", blocking: false }
  e2e           →  { id: "e2e",         blocking: false }
                   { id: "tests",       blocking: true  }   ← o phase-defaults auto-exige
```

`tests` recebe o comando do sinal `unit` (o loop rápido; neste repo `onTaskComplete: [unit]` confirma a escolha).

**Por quê:** o harness roda os sensores bloqueantes a cada avanço de fase. Espelhar tudo como bloqueante faria um projeto com `e2e` lento pagar minutos por transição — aqui, ~2min de e2e por avanço — e a reação previsível seria desligar tudo de novo, reintroduzindo o problema. Os demais sinais ficam **disponíveis** no catálogo, mas opcionais.

**Sobre o nome `tests`:** não é alias nem acomodação de defeito de terceiro. O catálogo é nosso, não vem do bootstrap do dotcontext; `tests` é simplesmente um id razoável para a suíte, e é o que o harness procura.

### D3 — O doctor diagnostica; quem repara é a skill

`scripts/doctor.mjs` declara: *"NEVER applies repairs (the skill drives repairs with consent)"*. O check novo respeita isso — `repair` é **texto**, e o gerador é um script separado, invocado sob consentimento.

O gerador, por sua vez, **não escreve por padrão**: sem flag imprime o JSON para inspeção; só `write` grava. Mesmo padrão do `release-scaffold`.

## Arquitetura

### `scripts/lib/sensors-from-verify.mjs` (novo)

```js
export function buildCatalog(verify)   // → { version:1, source:"manual", sensors:[…] }
                                        //   lança em comando inseguro (fail-closed)
export function assertShellSafe(argv)  // → void | throw  (allowlist + metacaractere + espaço)
```

CLI: `node scripts/lib/sensors-from-verify.mjs [write] [root]` — sem `write`, imprime; com `write`, grava `.context/config/sensors.json`.

### `harness-sensors` em `scripts/lib/doctor.mjs`

Entra no array `CHECKS`, seguindo a anatomia existente (`{ id, title, severity, destructive, run(ctx) }` → `{ status, diagnosis, repair }`).

| situação | status |
|---|---|
| projeto sem `verify:` | `OK` — nada a espelhar (o gate do ADR-013 já é warn-only aí) |
| `sensors.json` ausente | `WARN` + reparo |
| catálogo não cobre algum sinal do `verify:` (drift) | `WARN` + reparo |
| catálogo cobre todos os sinais | `OK` |

`repair`: `Rode: node scripts/lib/sensors-from-verify.mjs write`

`severity: "warn"`, `destructive: false` — consistente com os checks existentes.

## Testes

`requiredSignals: [unit, lint]` — código Node puro, sem auth/pagamento/fluxo de usuário.

| # | Alvo | Asserção |
|---|---|---|
| 1 | `assertShellSafe` | `argv[0]` fora do allowlist → lança |
| 2 | `assertShellSafe` | metacaractere (`;`, `\|`, `$`, backtick) → lança |
| 3 | `assertShellSafe` | espaço dentro de um argumento → lança |
| 4 | `assertShellSafe` | comando legítimo (`["bash","tests/run-unit.sh"]`) → não lança |
| 5 | `buildCatalog` | emite um sensor por sinal + o `tests`; só `tests` e `lint` com `blocking: true` |
| 6 | `buildCatalog` | `tests` recebe o comando do `unit` |
| 7 | check | sem `verify:` → `OK` |
| 8 | check | `sensors.json` ausente → `WARN` com o reparo exato |
| 9 | check | drift (sinal sem sensor) → `WARN` |
| 10 | check | catálogo completo → `OK` |

Fixtures em `mkdtempSync(tmpdir())`, nunca mutando diretório versionado.

## Escopo

**Dentro:** o gerador, o check, os testes, e o `.context/config/sensors.json` deste repo gerado por ele (dogfood — é o que finalmente encerra o `force`).

**Fora:** corrigir o bootstrap do dotcontext (upstream, não é nosso código); auto-executar o reparo sem consentimento; substituir o `verify:` pelo catálogo — são camadas distintas, e é exatamente por espelhar, não por substituir, que o `force` acaba.

## Guardrails de ADR

| ADR | Aplicação |
|---|---|
| 011 | `verify:` lido só via `devflow-config.mjs` (`readVerify`) — nenhum parse ad-hoc. |
| 013 | O executor do DevFlow segue argv-only e intocado; o espelhamento é validado e fail-closed. O objetivo declarado é fazer o gate do harness observar **a mesma fonte** do gate do ADR-013, encerrando o `force`. |
| 009 | O caminho de execução do catálogo (`promisify(exec)` vs `spawn shell:false`) foi lido no código do `@dotcontext/cli`, não recuperado de memória. |

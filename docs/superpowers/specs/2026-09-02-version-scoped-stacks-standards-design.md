# Escopo de versão para stacks e standards de perfil

**Data:** 2026-09-02
**Status:** aprovado (brainstorming), pendente de plano de implementação
**Origem:** bug reproduzido em produção no repositório `nexuz/odoo_17`

## Problema

O DevFlow contribui dois tipos de artefato versionado para um projeto — **stacks** (docs a
indexar no docs-mcp-server) e **standards** (regras com linter) — e **nenhum dos dois conhece
a versão do framework que o projeto realmente usa**.

### Evidência (medida, não inferida)

No `nexuz/odoo_17` — projeto exclusivamente Odoo 17 (submódulo em `branch = 17.0`, imagem
`odoo:17.0-20251222`, 48 de 54 manifestos `nxz` e 52 de 52 OCA declarando 17.x):

1. **Stacks.** O `/devflow init` semeou as **7 séries** (`odoo-12` … `odoo-18`) no
   `.context/engineering/stacks/manifest.yaml`. Não foi detecção: o bloco `stacks:` de
   `profiles/odoo.yaml` é uma lista plana e incondicional, copiada verbatim.

2. **Standards.** O linter `std-odoo-version-api-hygiene` produziu **47 violações em 589
   arquivos**, todas falso-positivo para Odoo 17:
   - 46 × `<tree>` — a tag correta no 17; a renomeação para `<list>` é do **18**.
   - 1 × `attrs=` — removido no **18**; no 17 está depreciado mas funcional.

   As regras Python do mesmo linter (`name_get`, `@api.one/multi`, `_columns`, `_defaults`,
   `invalidate_cache`, `search(count=True)`) deram **zero** — o código já está limpo para o 17.
   Após aplicar um gate manual em `series >= 18` nas duas regras de XML: **47 → 0**.

3. **Duplicação já divergente.** Quatro linters do perfil odoo implementam `odooTargetSeries()`
   por conta própria, cada um com seu piso:

   | Linter | `MIN_SERIES` | hash da função |
   |---|---|---|
   | `std-odoo-version-api-hygiene` | 17 | `d3b2771b2ba7` ← divergiu |
   | `std-odoo-js-modules` | 16 | `f71d35d7d115` |
   | `std-odoo-qweb-escaping` | 15 | `f71d35d7d115` |
   | `std-odoo-owl-patterns` | 16 | `f71d35d7d115` |

4. **`detect-framework.mjs`** (248 linhas) não tem nenhuma noção de versão.

5. **O mesmo defeito existe, latente, nos ~22 stacks default.** `assets/stacks/manifest.yaml`
   pina `react: "19"`, `typescript: "6"`, `next: "16"`, `tailwind: "4"`, `node: "24"` — pins
   fixos do plugin. O `stacks-filter-cli.mjs` usa detecção de dependência apenas para saber se
   a lib **está presente**, nunca para descobrir **qual versão**. Um projeto em React 18 + TS 5
   + Next 14, sob `grounding: docs-first`, é mandado consultar a doc de React 19 / TS 6 /
   Next 16.

6. **O `context-sync` reproduz o bug.** `skills/context-sync/SKILL.md` instrui: *"Para cada
   `stack` **ausente** no manifest, semear via `devflow-stacks.mjs add`"* — aditivo e
   incondicional. Qualquer poda manual é desfeita no sync seguinte.

### Causa raiz

Duas lacunas, uma só doença:

- **Não existe resolução da versão do framework no nível do projeto.**
- **Artefatos contribuídos pelo perfil não têm como declarar a que versões se aplicam.**
  O gate atual (`MIN_SERIES`) modela *"a partir de quando"* e **nunca** *"até quando"* — por
  isso uma regra exclusiva do 18 não tem como se declarar e acaba disparando no 17.

### Por que é risco de correção, não ruído

Com `grounding: docs-first` ativo (ver `2026-07-23-grounding-mcp-nested-field-design.md`), uma
série declarada a mais deixa de ser barulho de lint e vira **fonte de resposta errada**: o
agente consulta a doc da 12.0 para responder sobre código 17.

## Decisões tomadas

| # | Decisão | Alternativas descartadas |
|---|---|---|
| 1 | Corrigir **genericamente no sistema de perfis** | específico de Odoo; só stacks |
| 2 | **Confirmação no init + fail-closed no runtime** | fail-closed silencioso; fail-open com aviso |
| 3 | Migração **opt-in e sob confirmação**, nunca automática | só projetos novos; automático e silencioso |

**Evolução da decisão 3.** A escolha original foi *"comando de migração dedicado, opt-in"*. Ao
inspecionar o `context-sync` descobriu-se que ele **já é** a superfície de reconciliação e já usa
`provenance-sync` para standards de perfil — e que é onde o bug se reproduz (semeadura aditiva
incondicional). O comando dedicado foi então **eliminado do escopo**: o opt-in passa a ser a
invocação explícita de `/devflow:devflow-sync`, e a confirmação cobre a parte destrutiva (poda).
A propriedade exigida pela decisão — nada muda sem o usuário mandar e ver o plano — é preservada;
o que mudou foi a superfície, que deixou de ser nova e passou a ser a existente.

## Design

### 1. Dois eixos de versionamento

O modelo atual colapsa dois conceitos distintos:

- **Eixo série** (`axis: series`) — `odoo-12` … `odoo-18` são versões **alternativas da mesma
  coisa**. Exatamente uma vale. Resolver = escolher uma, descartar o resto.
- **Eixo composição** (default) — `react`, `typescript`, `expo`, `zustand` **coexistem**, cada
  um com versão independente. Resolver = manter todos os presentes, pinando cada um na versão
  real do projeto.

Os stacks default já são eixo composição e já coexistem corretamente; falta-lhes apenas o pin
correto. Os stacks de perfil Odoo são eixo série e são semeados todos.

### 2. Resolução de versão

Novo módulo `scripts/lib/framework-version.mjs`:

```
resolveStackVersions(projectPath, candidates) → Map<lib, { version, confidence, evidence[] }>
```

A sonda é declarada **por stack**, não por perfil — cada lib se detecta diferente. Um tipo
embutido cobre o ecossistema npm inteiro:

```yaml
# stack default — nenhuma configuração por entrada
react:
  version: "19"            # pin do plugin = fallback, não verdade
  versionDetect: npmDep    # lê package.json + lockfile, extrai o major

# stack de perfil (Odoo) — eixo série, sondas próprias
odoo:
  axis: series
  versionDetect:
    - { file: .gitmodules, pattern: 'path = odoo[\s\S]*?branch = (\d+)\.0' }
    - { file: Dockerfile,  pattern: 'FROM\s+odoo:(\d+)\.0' }
    - { glob: "addons/*/*/__manifest__.py",
        pattern: "version['\"]\\s*:\\s*['\"](\\d+)\\.",
        aggregate: majority }
```

`versionDetect` aceita **duas formas**, e a distinção é normativa:

- **String** — nome de uma sonda embutida no core (`npmDep` é a única no v1; lê
  `dependencies` + `devDependencies` do `package.json`, confirma no lockfile quando existe, e
  extrai o major). Cobre o ecossistema npm inteiro sem configuração por entrada.
- **Array** — sondas declarativas próprias, avaliadas **em ordem**. Duas formas de sonda
  bastam: `file` + `pattern`, ou `glob` + `pattern` + `aggregate`.

`aggregate: majority` resolve pelo valor mais frequente; **empate resolve para `ambiguous`**,
nunca por desempate arbitrário. Um perfil Rails diria
`{ file: Gemfile.lock, pattern: 'rails \((\d+)\.' }` — sem código novo, preservando o contrato
*"acrescente um perfil irmão, sem mudança de código"*.

**Confiança** sustenta o fail-closed da decisão 2:

| Valor | Condição | Comportamento |
|---|---|---|
| `high` | duas sondas independentes concordam | passa em silêncio, reportado |
| `medium` | uma sonda casa | passa em silêncio, reportado |
| `ambiguous` | sondas discordam | pergunta no init; pula no runtime |
| `unknown` | nenhuma sonda casa | pergunta no init; pula no runtime |

**Evidência** é lista (`[{probe, value, source}]`), não booleano — é o que o init mostra e o que
o relatório imprime ao pular um artefato. Opacidade aqui foi exatamente o que tornou o bug
original invisível.

No `odoo_17` as três sondas concordam em `17` → `high`, sem pergunta. Os 6 manifestos com
`"1.0"` são absorvidos pela maioria e continuam sendo achado do `std-odoo-manifest-hygiene`,
que é onde esse problema pertence.

### 3. Faixa de aplicabilidade

**Nome do campo:** `version` no frontmatter já significa a versão do **próprio standard**
(`1.1.0`). O campo novo é `appliesFrom` / `appliesUntil`, ambos **inclusivos**, referidos à
série do framework do perfil dono.

**Só standards de perfil podem declarar faixa.** Um standard default (`source:
devflow-default-*`) não pertence a framework nenhum e portanto não tem série contra a qual
comparar — declarar `appliesFrom` nele é erro de autoria, e o `standard-audit.mjs` deve
reprovar. Isso mantém os ~20 defaults intocados por esta mudança.

```yaml
id: std-odoo-owl-patterns
version: 1.1.0        # versão do standard (existente)
appliesFrom: "16"     # série do framework (novo)
appliesUntil: null
```

### 4. Onde a faixa é aplicada — a assimetria

| Artefato | Momento do filtro | Razão |
|---|---|---|
| **Standards** | na hora de **aplicar** (copia todos) | baratos de ter; faixa é dinâmica; ao migrar 17→18 os de 18 passam a valer sem re-sync |
| **Stacks** | na hora de **semear** | dispara scrape externo caro e **é a superfície de recuperação**: série errada = resposta errada |

O chokepoint para standards já existe e é único —
`hooks/post-tool-use` → `run-linter.mjs` → `findApplicableStandards()`:

```js
findApplicableStandards(filePath, standards, ctx)
//   ctx.versions: Map<framework, series>   ← lido de .devflow.yaml
//   sem faixa declarada             → aplica (retrocompatível)
//   com faixa + versão conhecida    → aplica só se dentro
//   com faixa + versão desconhecida → PULA e registra (decisão 2)
```

Com isso os quatro `MIN_SERIES` e as quatro cópias de `odooTargetSeries` são **deletados**
(~120 linhas duplicadas e já divergentes). O linter volta a conter apenas a regra.

**Perda aceita conscientemente:** hoje a resolução é por arquivo (subindo até 12 diretórios
atrás de um `__manifest__.py`, por arquivo, por linter). No nível de projeto, um monorepo com
módulos de versões misturadas perde precisão. **Não** construir override por caminho agora
(YAGNI); se aparecer um repo assim, `.devflow.yaml` ganha o override depois.

### 5. Consequência obrigatória — split de standard

`std-odoo-version-api-hygiene` mistura regras de 17 e de 18 num arquivo só. Um standard com
duas faixas **é** o defeito. Split:

| Standard | `appliesFrom` | Regras |
|---|---|---|
| `std-odoo-api-removed-17` | `17` | Python: `name_get`, `@api.one/multi`, `_columns`, `_defaults`, `invalidate_cache`, `search(count=True)` |
| `std-odoo-api-removed-18` | `18` | XML: `<tree>`, `attrs=`, `states=` |

É o único que quebra — `js-modules` (16), `qweb-escaping` (15) e `owl-patterns` (16) já são
homogêneos. O rótulo do `owl-patterns` ("Odoo 18" na `description`) é impreciso e deve virar
"OWL 2 — Odoo 16+": as regras valem no 17.

### 6. Operação única de reconciliação

A correção **não mora em skill nenhum**. Se `project-init` e `context-sync` decidirem cada um
por conta, divergem — a mesma doença dos quatro `odooTargetSeries`. Entra:

```
devflow-stacks.mjs reconcile --project=.
```

Recebe o perfil + as versões resolvidas e faz o manifesto **casar** com o projeto: adiciona o
que falta e está na faixa, **poda** o que está fora, e re-pina o eixo composição na versão real.
Os skills param de decidir e passam a chamar. `add` continua como escape manual.

**Poda é capacidade nova** — hoje só existe `add`, aditivo, e é por isso que o sync não
conseguia corrigir nada, só acumular.

### 7. Fluxo de init e de sync

`detect-framework.mjs` passa a devolver também `stackVersions` — uma chamada, saída mais rica,
sem reordenar o init.

Comportamento no `context-sync`:

| Operação | Comportamento |
|---|---|
| Adicionar stack **dentro** da faixa | silencioso (comportamento atual, seguro) |
| **Podar** stack fora da faixa | mostra o plano e **pede confirmação** |
| Re-pinar versão do eixo composição | silencioso se só muda o pin; confirma se remove |
| Standards de perfil | `provenance-sync` como já é — intocado atualiza, editado preserva e reporta |

O que a decisão 3 rejeitou foi **mutação silenciosa**, não o lugar. Rodar
`/devflow:devflow-sync` já é o opt-in; a confirmação cobre a parte destrutiva.

`/devflow update` volta a ser só o que é — atualizar plugin e toolchain. Após um bump que mude
faixas de perfil, apenas aponta: *"faixas de versão mudaram; rode `/devflow:devflow-sync`"*.

### 8. Persistência

```yaml
# .context/.devflow.yaml
frameworks:
  odoo:
    version: "17"
    confidence: high
    resolvedAt: "2026-09-02"
    evidence:
      - { probe: submodule-branch,  value: "17", source: .gitmodules }
      - { probe: docker-base-image, value: "17", source: Dockerfile }
      - { probe: manifest-majority, value: "17", source: "addons/*/*/__manifest__.py (48/54)" }
```

Só o **eixo série** é persistido. As versões do eixo composição saem do `package.json` na hora,
pelo `stacks-filter` — persistir daria estado velho no dia seguinte a um `npm upgrade`. Como
standards pertencem a perfis (eixo série), esse bloco basta como `ctx` para o `run-linter`.

## Testes

**Regressão primeiro** — o bug como fixture executável, antes de qualquer código:

- Fixture **Odoo 17**: as regras XML de 18 não disparam; o manifesto semeado contém só `odoo-17`.
- Fixture **Odoo 12** (ressuscitar `tests/2026-06-09T21-25-08-odoo12-cadastro-validation/`, hoje
  um `DEBUG.md` órfão): as regras de 17 **e** de 18 ficam caladas; manifesto só com `odoo-12`.
- Modelo de fixture de projeto: `tests/2026-06-09T21-31-04-odoo18-cadastro-validation/project/`.

**Unitário — resolvedor:** cada tipo de sonda; duas concordando → `high`; discordando →
`ambiguous`; nenhuma → `unknown`; agregação por maioria com o caso real (48/54 → 17).

**Integração — estender os existentes, não criar paralelos:**

- `tests/integration/test-detect-framework.mjs` — passa a devolver `stackVersions`
- `tests/integration/test-profile-standards-wiring.mjs` — faixa respeitada
- `tests/integration/test-stacks-add.mjs` → irmão `test-stacks-reconcile.mjs`, cobrindo a poda
  **e** o caso "não poda sem confirmação"

**Retrocompatibilidade é a propriedade de segurança principal** e tem teste próprio: perfil ou
standard **sem** `appliesFrom`/`appliesUntil` comporta-se exatamente como hoje. Sem isso, a
correção quebra silenciosamente os ~20 standards default e os dois perfis existentes.

**Split:** `tests/odoo-standards/` ganha um arquivo por standard novo;
`test-profile-standards-integrity.mjs` já valida `MANIFEST.txt` × arquivos e cobra a
consistência sozinho.

## Ordem de rollout

Cada etapa verde antes da seguinte:

1. Resolvedor + testes unitários (nada consome ainda — risco zero)
2. `appliesFrom`/`appliesUntil` no loader + predicado no `findApplicableStandards` + teste de
   retrocompatibilidade
3. Split do `version-api-hygiene`; remoção dos 4 `MIN_SERIES` e das 4 cópias de
   `odooTargetSeries`
4. `reconcile` com poda, atrás de confirmação
5. Ligação em `project-init` e `context-sync`
6. Ponteiro no `/devflow update`

Só o passo 3 muda comportamento de projeto já instalado, e é onde o `provenance-sync` protege
quem editou localmente.

## Fora de escopo

- Override de versão por caminho (monorepo multi-versão) — YAGNI até aparecer o caso.
- Adicionar `expo`/`react-native` aos stacks default: eles não estão entre os ~22 de hoje e
  entrariam por `devflow stacks add` ou perfil novo. É trabalho separado.
- Corrigir os pins dos stacks default (`react: "19"` etc.) — o design os torna *resolvíveis*;
  revisar cada pin é decisão de curadoria à parte.

## Impacto no `nexuz/odoo_17`

O repositório recebeu correções manuais durante o diagnóstico: gate `series >= 18` no
`std-odoo-version-api-hygiene.js` ejetado, texto do `.md` corrigido, rótulo do `owl-patterns`
ajustado, e manifesto podado para `odoo-17`.

Após esta correção, o primeiro `/devflow:devflow-sync` deve **preservar** essas edições (são
locais, pelo `provenance-sync`) e **reportar** que a correção oficial as substitui — para
revisão e remoção manual. Migração que engole silenciosamente o patch de alguém repete o erro
de escrita silenciosa que este próprio design combate.

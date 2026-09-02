# Materialização dos Standards default em todo projeto — Design

**Data:** 2026-09-02
**Workflow PREVC:** `standards-materialize-on-init` · **Escala:** MEDIUM · **Autonomia:** supervised
**Status:** spec aprovada; **execução adiada** — depende de
`2026-09-02-version-scoped-stacks-standards-design.md`, que entra primeiro
(ver "Ordem em relação à spec version-scoped")

---

## Problema

Ao instalar o DevFlow num projeto Odoo 17, o operador viu 15 arquivos `std-odoo-*.md`
aparecerem em `.context/engineering/standards/` e concluiu que isso seria bom para
**todo** projeto, mesmo sem framework detectado.

O que ele viu foi a cópia de **Standards de perfil** (ADR-008) — condicionais a
framework por design. Os ~26 Standards **universais** (`assets/standards/std-*.md`)
seguem outro regime: são *live-merged* do plugin em tempo de lint por
`loadStandardsMerged`, e **nunca** tocam o filesystem do projeto.

Consequências do regime atual, todas confirmadas no código:

1. **Invisibilidade.** Nada em `.context/` revela que 26 standards governam o projeto.
   Ninguém revisa em PR o que não existe como arquivo.
2. **Não-editáveis na prática.** Customizar exige `devflow standards eject <id>`,
   um comando manual, um standard por vez, que quase ninguém roda.
3. **Sem autonomia.** Sem o plugin instalado e atualizado, o projeto não tem
   standard nenhum — nem texto, nem enforcement.

## Objetivo

`/devflow init` (e o sync, e uma rotina periódica) passam a **materializar** os
Standards default aplicáveis dentro de `.context/engineering/standards/` — `.md`
**e** `machine/*.js` — de forma que sejam visíveis em git, editáveis por projeto,
funcionais sem o plugin, e **atualizáveis sem drift**.

## Não-objetivos

- Mudar a resolução de origem/sandbox do `run-linter` (ADR-007 v2.1 permanece intacto).
- Mudar o regime dos Standards de perfil (ADR-008 permanece intacto).
- Mudar o comportamento de `devflow standards eject <id>` como comando manual.
- Materializar **stacks** (`assets/stacks/`) — mesma discussão, escopo separado.

## Decisões fechadas no brainstorming

| # | Decisão | Alternativas descartadas |
|---|---|---|
| **D1** | Materializar `.md` **+** `machine/*.js` — visibilidade, editabilidade, autonomia e enforcement no projeto | Só `.md` (perde autonomia); nada (status quo) |
| **D2** | Deriva tratada por **sync de procedência** — hash decide entre atualizar intocado e preservar editado | Cópia congelada (drift permanente); só `.md` copiado |
| **D3** | Conjunto **filtrado por linguagem** — só os `std` cujo `applyTo` casa com extensões presentes no repo | Todos os 26 sempre (context rot); `.md` todos + linters filtrados |
| **D4** | Vale para projeto **novo e existente** — init, sync e rotina chamam o mesmo código | Só projetos novos (dois regimes convivendo); existentes sob confirmação |
| **D5** | Segurança: **paridade com ADR-008** (`origin: project`) + divergência de hash reportada | Hash bloqueante fail-closed; não copiar linters |
| **D6** | Uma **rotina periódica** em `.context/routines.json` reconcilia o estado | Só no init/sync sob demanda |

## Arquitetura

### Base: o motor já existe

`scripts/lib/provenance-sync.mjs` (v1.23.0, PR #49) já entrega tudo que D2 exige:

- `hashFile` / `decideArtifact` → `add | current | untouched | edited`
- manifesto `.context/.provenance.json` (`loadManifest` / `saveManifest`)
- registry histórico `assets/provenance/known-hashes.json` (`loadRegistry`)
- contenção `isWithinDir` + recusa de symlink
- `detectRetired` para artefatos removidos do bundle

O cabeçalho do arquivo declara hoje o escopo: *"Cobre apenas artefatos VERBATIM:
skills + standards de profile. Agents (preenchidos no deploy) e std-\*.md raiz
(live-loaded) ficam fora."* **Esta feature remove exatamente essa exclusão.**

Abordagens descartadas:

- **Sobrecarregar `devflow standards eject --all`** — contrato oposto. O `eject`
  simples reescreve `enforcement.linter` para `null` (`devflow-standards.mjs:594`);
  aplicá-lo aos 26 defaults **desligaria os 20 linters hoje ativos** em todo projeto novo.
- **`cp` no init** — o próprio ADR-008 proíbe para atualização: *"NÃO use `cp` cego
  nem `status: filled → SKIP` para decidir — delegue ao sync provenance-aware"*.

### O ponto que exige mecanismo novo: a cópia não é verbatim

`resolveAndCheckSandbox` (`run-linter.mjs:59`) resolve o path do linter contra
**bases diferentes por origem**:

| origem | base de resolução | valor de `enforcement.linter` |
|---|---|---|
| `default` | `<plugin>/assets/standards/` | `machine/std-security.js` |
| `project` | `<projeto>/.context/` | `engineering/standards/machine/std-security.js` |

A mesma string não serve às duas origens. Ao materializar, o `.md` **precisa** ter
o `linter:` reescrito para a forma canônica do projeto — a mesma transformação que
`eject --with-linter` já aplica (`devflow-standards.mjs:588`).

Isso quebra a premissa verbatim do `provenance-sync`. Copiar e reescrever
ingenuamente faria o hash gravado divergir do hash da origem, e **todo projeto
apareceria como `edited` já na primeira passada** — congelando o sync para sempre
e transformando a feature em cópia-congelada acidental (justamente D2 descartada).

**Solução:** o artefato ganha um campo `transform` opcional. `applySync` passa a
computar `pluginHash` sobre os **bytes transformados** e a gravar esses bytes:

```js
const bytes = art.transform ? art.transform(readFileSync(art.src, "utf-8")) : readFileSync(art.src);
const pluginHash = sha256(bytes);
```

Determinístico e idempotente ⇒ `gen-known-hashes` computa o mesmo hash do lado do
mantenedor, e a classificação `untouched` funciona para projetos materializados por
versões anteriores do plugin.

Os 6 standards warn-only (`linter: null`: `caching`, `code-review`,
`commit-hygiene`, `grounding`, `pre-commit-hygiene`, `state-management`) não têm
transform e seguem verbatim.

**Invariante:** `enforcement.linter` **nunca** vira `null` na materialização. Um
default enforçado que chega ao projeto sem linter é um downgrade silencioso.

### Componente novo: `scripts/lib/standards-materialize.mjs`

Responsabilidade única: **decidir o que materializar** e devolver a lista no formato
que `applySync` já consome.

```
resolveMaterializedStandards({ projectRoot, pluginRoot })
  -> [{ src, dest, framework: "default", transform? }]
```

1. Carrega os defaults do plugin (`readStandardsFromDir` de `assets/standards/`,
   `origin: "default"`).
2. Enumera os **caminhos reais** do repositório (walk, ignorando `.git/`,
   `node_modules/` e dotdirs).
3. Um standard é selecionado se **algum arquivo real** casa com seu `applyTo`,
   usando o `matchGlob` de `scripts/lib/glob.mjs` — o mesmo predicado que
   `findApplicableStandards` já usa em tempo de lint.

   Casar contra caminhos reais, e não contra extensões sintetizadas
   (`**/*.py`), importa: 3 defaults têm prefixo de diretório
   (`std-caching` e `std-layer-boundaries` são `src/**/*.{ts,tsx}`,
   `std-domain-events` é `src/**/*.ts`). Um projeto TypeScript sem `src/` não
   deve recebê-los, e só o caminho real revela isso.
4. Honra `standards.local.yaml` `disable:` — id desabilitado não é materializado
   (mesma regra que ADR-008 impõe aos Standards de perfil).
5. Para cada id selecionado, emite o `.md` (com `transform` quando tem linter) e,
   quando existe, `machine/<id>.js` (verbatim).

Efeito medido contra os 26 defaults atuais:

| Projeto | Materializa | Fica de fora |
|---|---|---|
| Odoo (`.py .js .xml .csv`) | 17 | +`accessibility`, `design-antipatterns`, `visual-quality` entram se houver `.css`/`.html` |
| Odoo com assets `.css` | 20 | `caching`, `domain-events`, `internationalization`, `layer-boundaries`, `state-management`, `typescript-strict` |
| TypeScript/React com `src/` | 26 | — |

Se o projeto ganhar TypeScript depois, a rotina traz os standards restantes na
passada seguinte.

### Integração no `provenance-sync`

`resolveArtifacts` passa a concatenar os artefatos de `resolveMaterializedStandards`.
`applySync` não muda além do suporte a `transform`. Nenhuma mudança em
`decideArtifact`, no manifesto ou na contenção.

### Superfície: um caminho de código, três gatilhos

| Gatilho | Onde | Comportamento |
|---|---|---|
| `/devflow init` | `project-init` Step 3c-5 | materializa no scaffold inicial |
| `/devflow:devflow-sync` | `context-sync` | reconcilia (atualiza intocados, preserva editados) |
| Rotina `standards-materialize` | `.context/routines.json` | `frequency: 7d`, `execution: confirm` |

Escape hatch em `.devflow.yaml`, lido pelo parser único do ADR-011
(`scripts/lib/devflow-config.mjs`):

```yaml
standards:
  materialize: true   # default; false = mantém o regime live-load
```

### Segurança

Nenhuma mudança no `run-linter`. Os standards copiados são carimbados
`origin: "project"` pelo loader (`loadStandardsMerged` faz `merged.set` com projeto
ganhando do default por id) e caem no sandbox `.context/engineering/standards/machine/`
— **exatamente o regime dos 15 linters Odoo hoje em produção** (ADR-008).

O que muda é a escala: 20 arquivos executáveis a mais no repositório, invocados via
`execFile("node", [linter, arquivo])` a cada Edit/Write. Mitigação (D5):

- `gen-known-hashes.mjs` ganha uma 3ª raiz de walk. Hoje `distributableFiles`
  varre `skills/`, `assets/skills/profiles/` e `assets/standards/profiles/`, com o
  comentário explícito *"Sem agents nem std raiz"* — passa a varrer também
  `assets/standards/` (raiz), com backfill sobre o histórico de commits.
- Um linter cujo hash não bate com nenhum hash conhecido é classificado `edited` e
  **reportado** no relatório do sync e no `/devflow:devflow-doctor`. Adulteração
  fica visível; não é bloqueada.

Fica registrado como limitação consciente: a detecção é de relatório, não de
enforcement. A variante fail-closed (recusar executar linter divergente) foi
avaliada e adiada — custa manifesto de hashes versionado no projeto + gate no
`run-linter`, e não foi julgada necessária dado que a superfície já existe hoje
para Standards de perfil e de projeto.

### Impacto no ADR-007

Esta decisão **contradiz** o ADR-007 v2.2.0, cujo modelo é *plugin-bundled +
live-load, eject por projeto sob demanda*. A evolução é honesta e datada:

> O modelo "nunca copiar" foi escolhido em 2026-06 porque **não existia** mecanismo
> para atualizar cópias sem drift. O `provenance-sync` passou a existir em
> 2026-06-17 (v1.23.0, PR #49) e remove precisamente essa razão.

A fase P oferece `adr:evolve` sobre `007-default-standards-library`. Os guardrails
de fetch/anti-RCE do v2.2.0 permanecem válidos e intocados — a evolução altera
**distribuição para o projeto**, não a origem remota nem o TCB dos `.js`.

## Ordem em relação à spec version-scoped

Esta spec **executa depois** de `2026-09-02-version-scoped-stacks-standards-design.md`.
A ordem não é preferência de escopo — são pontos de contato que ficam mais baratos
nesta sequência:

| Ponto de contato | Consequência da ordem |
|---|---|
| Fiação de `project-init` + `context-sync` | A §6 da version-scoped move a decisão para `devflow-stacks.mjs reconcile` (*"os skills param de decidir e passam a chamar"*). Esta spec adiciona materialização nos mesmos dois pontos. Invertendo a ordem, a fiação é escrita duas vezes. |
| `findApplicableStandards` | A §4 dela muda a assinatura (`ctx.versions`). Hoje é `(filePath, standards)` com 3 consumidores + 4 suítes. Esta spec usa o mesmo predicado como critério de seleção — tocá-lo duas vezes refaz os testes de ambas. |
| `provenance-sync` | Sem conflito, aditivo nos dois sentidos: esta spec acrescenta a 3ª família + `transform`; a version-scoped só consome o que já existe e depende dele para preservar as correções manuais do `nexuz/odoo_17`. |
| `source: devflow-default` | Compatibilidade **verificada**: os 26 defaults carregam o campo, e a materialização copia o frontmatter íntegro (só a linha `linter:` é reescrita). O discriminador da §3 dela — *"standard default não pode declarar `appliesFrom`"* — continua funcionando depois desta mudança. |

### A assimetria de filtragem é deliberada

A §4 da version-scoped justifica filtrar standards **na hora de aplicar** (copiar
todos): *"baratos de ter; faixa é dinâmica; ao migrar 17→18 os de 18 passam a valer
sem re-sync"*. A D3 desta spec faz o oposto para os defaults: filtra **na hora de
copiar**.

As duas coexistem porque **filtram propriedades diferentes**, e a natureza de cada
propriedade decide o momento certo:

| Eixo | Propriedade | Como muda | Momento do filtro |
|---|---|---|---|
| **Linguagem** (esta spec) | o repositório contém arquivos `.ts`/`.py`/`.css` | raramente, e como evento visível — adotar TypeScript num addon Odoo é uma decisão, não um efeito colateral | na **cópia**; a rotina reconcilia |
| **Versão de framework** (version-scoped) | o projeto está no Odoo 17 ou 18 | numa migração, que é exatamente o caso que ela otimiza | no **apply**; sem re-sync |

Filtrar linguagem no apply não daria ganho — `applyTo` já faz isso em tempo de lint,
e o standard inerte existiria só como arquivo. Filtrar versão na cópia custaria um
re-sync obrigatório em toda migração de série, que é o atrito que ela remove.

O custo consciente desta assimetria é uma janela de defasagem: um projeto que adota
TypeScript só recebe `std-typescript-strict` na passada seguinte da rotina (≤7 dias),
e não instantaneamente. Aceito, porque o standard não teria o que lintar até que os
arquivos `.ts` existam de fato.

Registro explícito, e não premissa implícita, porque foi assim que os quatro
`odooTargetSeries` divergiram: cada consumidor decidiu por conta e ninguém escreveu
a regra.

## Testes

| Nível | Caso |
|---|---|
| unit | seleção por caminho real: fixture Odoo→17, fixture TS com `src/`→26, fixture vazio→0 |
| unit | `src/**/*.ts` NÃO casa em projeto TS sem diretório `src/` |
| unit | `transform` determinístico e idempotente (aplicar 2× = aplicar 1×) |
| unit | `transform` reescreve para o path canônico do projeto, **nunca** para `null` |
| unit | `decideArtifact` com transform: 2ª passada = `current`, edição local = `edited` |
| unit | `standards.local.yaml disable:` suprime o id |
| unit | warn-only (`linter: null`) copiado verbatim, sem transform |
| integração | init em fixture Odoo materializa 17 e o linter **executa** de verdade |
| integração | 2ª passada é no-op (`current`), sem reescrita |
| integração | edição local do `.md` é preservada e reportada |
| integração | `standards.materialize: false` → no-op limpo |
| integração | `gen-known-hashes` indexa a 3ª raiz; hash divergente aparece no relatório |

```yaml
requiredSignals: [lint, unit, integration]
```

E2E não é exigido: a feature não toca auth, pagamentos, fluxo de usuário nem o
finish/PR. O gate de `lint` é obrigatório por D6 do ADR-013.

## Riscos

| Risco | Mitigação |
|---|---|
| Hash pós-transform diverge entre plugin e mantenedor | `transform` puro e determinístico; teste de idempotência; `gen-known-hashes` usa a mesma função |
| Projeto existente vê 18 arquivos novos de surpresa | Rotina é `execution: confirm`; relatório do sync lista o que será escrito |
| `disable:` ignorado ressuscita standard removido | Teste dedicado; mesma regra já validada para ADR-008 |
| Linter materializado desatualizado vs. plugin | Sync atualiza intocados automaticamente; rotina 7d garante convergência |

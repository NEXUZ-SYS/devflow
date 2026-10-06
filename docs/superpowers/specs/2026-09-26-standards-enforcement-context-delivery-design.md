# Enforcement determinístico de standards e entrega de contexto — Design

**Data:** 2026-09-26
**Workflow PREVC:** `standards-enforcement-context-delivery` · **Escala:** LARGE · **Autonomia:** supervised
**Status:** aprovada; revisada na fase R em 2026-09-26 em duas rodadas (architect + security-auditor; rodada 2 APROVADO-COM-RESSALVAS, ressalvas incorporadas; decisões D7–D10 do operador)
**Origem:** caso de um projeto real × DDC Framework (revisão de conformidade de 2026-09-22, 68 achados)

---

## 1. Problema

Um projeto real concluiu a Fase 0 com o DevFlow e, na auditoria contra
o DDC Framework, acumulou 68 desvios de norma (9 de severidade alta): FSD/Atomic não
adotados, application importando infraestrutura, PKs sem `uuidv7`, campos de auditoria
e índices em FK ausentes. A investigação mostrou que o problema não é de um projeto,
é da engenharia de contexto do DevFlow. Três falhas se somam:

1. **A norma não chega ao agente no momento da decisão.** O SessionStart injeta só
   *índices* de standards e de knowledge. Nada entrega o corpo da norma antes da edição.
2. **A norma não é obrigatória.** Os linters dos standards rodam num hook `PostToolUse`
   registrado com `async: true`, que sempre termina com `exit 0`. Pela documentação do
   Claude Code, a saída de um hook async chega ao modelo só no turno seguinte e não
   pode bloquear. Nenhum pre-commit, job de CI ou gate de fase roda esses linters.
   Na prática são lembretes, pelo mesmo mecanismo do hook do impeccable.
3. **A doutrina de engenharia não existe no DevFlow.** A decisão D6 de
   `2026-05-30-context-layer-knowledge-ddc-design.md:43` comprimiu `architecture/`,
   `contracts/`, `practices/` e `processes/` do DDC em `std-*.md` de cerca de 70 linhas.
   Esta spec **não** trata disso: ver §9, subprojeto 3.

Esta spec cobre as falhas 1 e 2: o **mecanismo**. Sem ele, qualquer doutrina que
venha depois tem o mesmo destino dos standards de hoje, que viram índice e lembrete.

### 1.1 Evidência

Tudo foi conferido no código e na documentação em 2026-09-26.

| # | Fato | Evidência |
|---|---|---|
| E1 | Linter roda em hook async e nunca bloqueia | `hooks/hooks.json` (PostToolUse `"async": true`); `hooks/post-tool-use:78-81`, `:368`, `exit 0` final |
| E2 | Hook async: saída chega só no turno seguinte e não bloqueia | `code.claude.com/docs/en/hooks.md:3708` |
| E3 | O sinal `lint` do `verify-gate` é o lint do projeto, não o dos standards | `scripts/lib/verify-gate.mjs`; `scripts/lib/devflow-config.mjs:152` |
| E4 | Nenhum CI ou pre-commit roda os linters dos standards | commit `e5f8c8b` do projeto real: "Nothing in package.json or the CI workflow runs these linters" |
| E5 | SessionStart injeta só o índice de standards (id, applyTo, linter) e de knowledge | `hooks/session-start:255-289`; `scripts/lib/context-index.mjs:122-138` |
| E6 | **Defeito P0:** `pre-tool-use` imprime `<KNOWLEDGE_ONDEMAND>` como texto puro antes do JSON de decisão | `hooks/pre-tool-use:213-221`; decisões depois dele em `:279`, `:330`, `:364`, `:470` |
| E7 | Em `PreToolUse`, texto puro no stdout vai para o log de debug; stdout que não começa com `{` não é lido como JSON | `hooks.md:806-815` |
| E8 | `PreToolUse` aceita `hookSpecificOutput.additionalContext` | `hooks.md:1815` |
| E9 | `PostToolUse` síncrono aceita `decision: "block"` + `reason`; exit 2 mostra o stderr ao Claude | `hooks.md:1045`, `:891` |
| E10 | Limite de 10.000 caracteres por campo de contexto | `hooks.md:939-942` |
| E11 | `SubagentStart` aceita `additionalContext` | `hooks.md:2382` |
| E12 | **Defeito P1:** a fase V lê ADRs só no caminho legado | `skills/prevc-validation/SKILL.md:86,90`; `skills/context-awareness/SKILL.md:68` |
| E13 | A fase P não carrega standards (tem filtros de ADR, knowledge e stack) | `skills/prevc-planning/SKILL.md:52-106` |
| E14 | Os agentes especialistas não referenciam `.context/engineering` | `agents/backend-specialist.md:29-34` e demais |
| E15 | O linter imprime `VIOLATION:` sem id de regra, linha nem severidade | `scripts/lib/run-linter.mjs:174-224` |

**Consequência do E6 + E7:** quando um doc de knowledge casa com o arquivo editado, o
stdout do hook começa com `<` e o JSON seguinte é descartado. O deny da branch
protection, do config-guard e o `ask` deixam de valer **em silêncio**. É uma falha de
segurança, ainda que condicional.

---

## 2. Decisões

| # | Tema | Decisão | Alternativas rejeitadas |
|---|---|---|---|
| D1 | Mecanismo de entrega | **Tudo por hooks**, portável para Claude Code e omp | Rules nativas `.claude/rules` (só Claude Code, arquivos derivados no projeto, distribuição por plugin não documentada); híbrido (adiado até haver medição) |
| D2 | Violações existentes | **Baseline com catraca**: bloqueia só violação nova; o baseline só encolhe | Só as linhas alteradas (depende do git e erra em violação não local); arquivo inteiro (PRs inchados em projeto em curso) |
| D3 | Nível de enforcement | `block` \| `warn` \| `review`, **por standard com override por regra**. Defaults do plugin chegam como `warn` e standards `source: local` como `block` | Tudo `block` (defaults genéricos ou errados, como o caso ULID/UUID v4, bloqueariam decisões legítimas) |
| D4 | Falha de infraestrutura | **Hook falha aberto; CLI, CI e fase V falham fechado** | Falhar fechado no hook (trava o trabalho por problema de infra) |
| D5 | Implementação | **Um engine único** consumido por hooks, CLI e gate | Lógica por consumidor (gera "passa no hook, falha no CI") |
| D6 | Autoridade sobre a catraca | **Só o humano** aumenta o baseline ou rebaixa um nível | Deixar o agente aceitar violações (vira o caminho mais curto) |
| D8 | Defesa da catraca (revisão R) | **Camadas completas:** guard semântico no Edit/Write, guard heurístico em Bash/NotebookEdit/MCP, CLI que exige terminal interativo para aumentar a catraca e `gate` no CI contra o merge-base. As locais são atrito; o CI é a garantia | Só CI + TTY (bypass local só pego no CI) |
| D9 | Hook síncrono (revisão R) | Roda **só** os linters de standards cujo nível máximo é `block`; `warn`/`review` ficam no hook async | Todos síncronos (latência em todo projeto, mesmo sem std `block`) |
| D10 | Entrega pré-edição (revisão R) | O `additionalContext` do PreToolUse chega junto do resultado da ferramenta; **aceito e medido** (T23). O "antes" vem do SessionStart, do SubagentStart e da fase P | Negar o primeiro Write sob std `block` com o resumo no motivo (uma tentativa extra por std e sessão) |

D7 (revisão R) é de processo: o plano foi corrigido dentro da fase R, sem voltar à P.

---

## 3. Componentes

### 3.1 Contrato de standard (extensão do frontmatter)

```yaml
enforcement:
  linter: machine/std-data-modeling.js
  level: warn            # block | warn | review — default do std
  rules:                 # opcional: sobrescreve por ruleId do linter
    float-money: block
```

- Resolução do nível: `rules[ruleId]` → `level` → default por origem
  (`devflow-default` = `warn`, `local` = `block`) → `warn`.
- `review` indica que não há regra mecânica. O standard vai para o checklist do
  code-reviewer na fase V e é injetado com destaque antes da edição.
- Sem o campo `level`, vale a resolução acima (compatibilidade retroativa).
- Achado `advisory` (linha `ADVISORY` ou legado multi-regra) resolve para `warn`
  antes de `enforcement.level`, a menos que `enforcement.rules[ruleId]` o eleve.

### 3.2 Protocolo de linter v2

```
VIOLATION <ruleId> <arquivo>:<linha> <mensagem>
```

- `ruleId` em kebab-case, estável entre versões do linter.
- Linhas no formato legado (`VIOLATION: …`) continuam aceitas: no multi-regra
  (`VIOLATION: [advisory] <regra> — …`) o `ruleId` é extraído; no de regra única o
  `ruleId` é o id do std sem o prefixo `std-`. Ambos com linha nula.
- Os 17 linters default de regra única migram para o v2; os 3 multi-regra
  (`std-design-antipatterns`, `std-visual-quality`, `std-accessibility`) ficam no legado
  estruturado.
- **Contrato de saída (D4):** exit `0` sem `VIOLATION` = limpo; `0`/`1` com `VIOLATION` =
  achados; qualquer outra coisa (exit `1` sem `VIOLATION`, outro código, sinal, saída acima
  de 1MB, exceção) = erro do linter. Um linter quebrado nunca conta como limpo.

### 3.3 `standards-engine` (`scripts/lib/standards-engine.mjs`)

Uma única implementação que:

1. deriva a raiz confiável do plugin do próprio `import.meta.url` (validada pelo
   trust-anchor), nunca de `CLAUDE_PLUGIN_ROOT`: hook, CLI, git hook e CI enxergam o
   mesmo conjunto de standards;
2. acha a raiz do projeto subindo até `.context` (ou `git rev-parse --show-toplevel`);
3. resolve os standards aplicáveis a cada arquivo (`applyTo`, com o contexto de versões),
   reaproveitando o `standards-loader` (merge de defaults com projeto);
4. roda os linters no sandbox SI-4 (`run-linter.mjs`) com o caminho **relativo** e `cwd` na
   raiz do conteúdo, e tira as raízes da mensagem antes da impressão digital (linters
   legados ecoam `${fp}`): o mesmo achado tem a mesma impressão digital no hook, no
   `--staged`, no `--all` e em qualquer clone; concorrência limitada e
   orçamento real: esgotado o orçamento, nada novo é disparado e os em curso são abortados;
5. parseia o protocolo v2 ou o legado e resolve o nível de cada achado (§3.1);
6. calcula a impressão digital e compara com o baseline (§3.4);
7. devolve `{ blocking[], warnings[], review[], baselined[], errors[], hasBaseline, baselineError }`.

Aplicabilidade e nível (`applicableStandards`, `resolveLevel`, `maxLevel`) ficam no engine
e no módulo de nível; nenhum consumidor recalcula.

**`machine/` não é analisado (decisão de 2026-10-06, depois da revisão final).** No laço em
que resolve os standards de cada arquivo, o engine pula o que está sob `machine/` dos standards
do projeto, no layout canônico e no legado (`resolveReadPaths`). São os linters do próprio
projeto, e o canal de saída do protocolo (`console.log`) já os fazia "violar" outro standard:
na medição num projeto real, 38 dos 50 achados (76% do baseline) eram os linters lintados, e
um linter novo saía barrado por outro standard. A exclusão mora no engine, e não num
consumidor, para que hook síncrono e assíncrono, `check --staged`, `check --all`, o snapshot
do `gate --ci` e a análise da árvore da base (adoção) vejam o mesmo conjunto: excluir só na
seleção do `--all` faria o `--staged` barrar a atualização legítima de um linter e o gate
acusar o que o check local nunca viu.

- **Consequência — zona cega declarada:** código colocado em `machine/` não é analisado pelo
  check. A exclusão vale para os dois layouts **sempre**, em qualquer projeto, mesmo o que
  nunca usou o legado. O que fecha a zona cega é a comparação com a base no `gate` (§3.5:
  arquivo novo, alterado ou removido em `machine/` é violação), mais o `ask` do guard (§5) e o
  `CODEOWNERS`, cujo trecho gerado dá dono aos dois layouts. É revisão humana, não lint.
- **Baseline:** o `baseline init` não registra achado em `machine/`. Entrada com caminho ali,
  criada antes dessa regra, não corresponde mais a achado nenhum e sai no `baseline prune`.

Consumidores: `pre-tool-use` (resumo), `post-tool-use-lint` (bloqueio), CLI (§3.5) e
`verify-gate` (sinal `standards`).

### 3.4 Baseline com catraca

- Arquivo `.context/engineering/standards/baseline.json`, versionado no projeto.
- Impressão digital = `sha1(stdId + ruleId + caminhoRelativo + mensagemNormalizada)`.
  A **linha não entra**, para sobreviver a deslocamentos. A normalização remove números
  de linha e coluna e espaços. O caminho é relativo POSIX ao projeto, com `\`, `C:\`,
  MSYS `/c/`, `..` e raiz por symlink normalizados; caminho fora do projeto não é lintado.
- **Multiconjunto:** cada entrada tem `count`. Uma ocorrência aceita não isenta as
  seguintes: o que excede a contagem por impressão digital é violação nova.
- Formato: `{ "version": 1, "entries": [{ fp, stdId, ruleId, path, message, count, acceptedAt, acceptedBy?, reason? }] }`.
  Arquivo inválido: o hook avisa e não bloqueia; CLI, CI e V saem com `3`. Arquivo
  apagado da árvore mas versionado no HEAD: vale a versão do HEAD.
- Regras:
  - `baseline init`: snapshot de todos os achados atuais, com contagem; recusa se já
    existir baseline e exige o terminal interativo do operador;
  - `check`: ocorrência além da contagem aceita e de nível `block` → falha;
  - `baseline prune`: reduz cada contagem ao número atual e remove o que zerou (só
    encolhe; livre);
  - `baseline accept <fp> --reason "…"`: único caminho para aumentar. Exige
    justificativa, que fica registrada, e o terminal interativo do operador. O terminal
    é atrito (`script -qc` o simula); a garantia é o `gate`.
  - Impressão digital repetida no arquivo o torna inválido.

### 3.5 CLI `devflow standards`

| Subcomando | Função | Exit |
|---|---|---|
| `check [--staged\|--all\|<paths>] [--base-ref=<ref>]` | Roda o engine com baseline. `--staged` lê o índice; `--all` inclui não rastreados; `--base-ref` usa o baseline do merge-base. Opção desconhecida é uso incorreto | `0` ok · `1` violação `block` nova · `2` uso · `3` erro de execução |
| `baseline init\|prune\|accept` | Gerencia a catraca (§3.4) | `0` · `2` recusado ou uso · `3` |
| `enforce <std> --level block\|warn\|review` | Promove (livre) ou rebaixa (terminal do operador) um standard do projeto; default exige `eject` | `0` · `2` · `3` |
| `explain <arquivo…>` | Lista as normas aplicáveis, o nível e o nível máximo de cada uma, para planejamento | `0` |
| `gate [--base-ref=<ref>] [--ci] [--allow-weakening --pr=<n> --repo=<o/r>]` | Catraca contra a base (baseline; na adoção, o baseline novo só aceita o que o engine acha na árvore da base; enforcement efetivo com a aplicabilidade por faixa de versão de cada lado (inerte hoje: ver a nota "Faixa de versão", abaixo); `machine/`, `node_modules` sob `.context/` e shim, árvore do HEAD × árvore da base; `verify.standards`) + `check --all`. Sem `--ci` (V local): violação vira nota, o check usa a árvore de trabalho e o baseline da árvore. Com `--ci`: ver "Gate no CI", abaixo. Base padrão `refs/remotes/origin/main`; opção desconhecida é uso incorreto | `0` · `1` · `2` · `3` |

O comando real é `node "<plugin>/scripts/devflow-standards.mjs" …` (ou o shim
`node .context/bin/devflow-standards.mjs …` no projeto); não existe binário `devflow`.

**Faixa de versão: descrita, não ativa.** A comparação da aplicabilidade por faixa de versão
de framework (`appliesFrom`/`appliesUntil`), aqui no `gate` e no guard do `pre-tool-use` (§5),
não decide nada hoje: o loader não lê o campo `framework` do standard, então um std com faixa
de versão não se aplica em nenhum consumidor do engine, qualquer que seja o `.devflow.yaml`.
Pendência conhecida (backlog da ADR-008); o comportamento atual está fixado por teste
(`tests/lib/test-standards-guard.mjs`, caso M3).

**Gate no CI (`gate --ci`) — o mecanismo real.** Fechado depois da revisão de segurança da
implementação (cinco caminhos em que o gate saía 0 com a catraca enfraquecida):

- **Base sem ambiguidade e ancestral.** `--base-ref` é um `refs/…` completo ou um SHA
  completo; um nome curto é resolvido só em `refs/remotes/<nome>` e recusado (exit 3) se
  houver homônimo em `refs/tags/` ou `refs/heads/` — o `rev-parse origin/main` resolve a tag
  antes do remoto. A base tem de ser ancestral do HEAD (`merge-base --is-ancestor`): o gate
  roda sobre o **merge do PR**. Base velha, merge-base deslocado por pai extra ou clone raso
  → exit 3.
- **Blobs, não a árvore de trabalho.** O check linta os blobs do HEAD, materializados por
  `git cat-file` sem atributos nem filtros (o `.gitattributes` da branch não escolhe os bytes
  que o linter enxerga); arquivo fora do HEAD não é lintado, e o caminho de cada arquivo é
  resolvido só pelos blobs (um `src/` trocado por link na árvore não muda o que é lintado).
  O `**` do `applyTo` casa qualquer caractere, inclusive quebra de linha no nome. `machine/**`, o shim e os
  `node_modules` versionados sob `.context/` são comparados árvore do HEAD × árvore da base.
  Os caminhos da catraca na árvore (`.context/engineering/standards/**`, o legado
  `.context/standards/**`, `standards.local.yaml`, `.devflow.yaml`) têm de ser byte a byte os
  blobs do HEAD; se diferirem, exit 3. Todo git roda com `GIT_NO_REPLACE_OBJECTS=1`.
- **Arquivo novo em `machine/` é violação da catraca, nos dois layouts (decisão de 2026-10-06,
  depois da re-revisão de segurança).** A regra anterior da branch tratava como nota o arquivo
  novo que não colidia por nome com nada da base. Com `machine/` fora do check (§3.3), a nota
  virou contorno: um PR criava ali um arquivo com código que viola um std `block`, importava-o
  da aplicação, e o gate saía 0 — no layout legado nem dono havia no CODEOWNERS gerado, e a
  exclusão do check vale para ele mesmo em projeto que nunca o usou. Agora qualquer arquivo
  novo sob `machine/` do layout canônico ou do legado é violação ("linter novo: … exige revisão
  humana"; quando o nome colide com um irmão da base, é `package.json` ou `index.*` em
  diretório que já existia, a mensagem traz o motivo da sombra). Submódulo e link continuam
  violação, e `node_modules` versionado sob `.context/` que difere da base também. No GitHub
  o arquivo novo só entra com o override de quem é dono do caminho no CODEOWNERS da base; no
  GitLab não há override: o job fica vermelho e o merge é decisão de quem mantém.
  - **Exceção única: a adoção dos standards.** Quando a base não tem nada em nenhum dos dois
    diretórios de standards (nem o caminho deles passa por link ou submódulo), os arquivos
    novos de `machine/` são nota: não há standard anterior a contornar, e o PR de adoção é
    revisado por inteiro. Quem decide é só a árvore da base, lida dos objetos git; um PR que
    apaga os standards e os traz de volta não vira adoção. É mais estrita que a "adoção" do
    baseline (a base não tem baseline, mas pode ter standards e linters), que segue como era.
  - Linters novos ou alterados rodam numa segunda passada, depois dos que já existiam.
- **O baseline da árvore vale em dois casos: sob override aprovado e na adoção conferida
  contra a base.** Fora deles, o check usa o baseline da base. Na adoção (a base não tem
  baseline), o gate roda o engine sobre a árvore da base e cada entrada do baseline novo tem
  de caber nesses achados; conferido isso, o check usa o baseline da árvore sem override. Com
  override aprovado, também usa o da árvore. Nos dois casos o aumento de cada entrada tem de
  caber nos achados atuais: entrada que aceita mais ocorrências do que a árvore tem (crédito
  pré-pago) é violação que nem o override libera.
- **Crédito limitado pela base (decisão de 2026-10-06, depois da revisão final de segurança).**
  O furo: uma violação aceita no baseline era corrigida e ninguém rodava o `prune`; a entrada
  ficava na base sem a ocorrência. Um PR reintroduzia a mesma violação `block` no mesmo arquivo
  e o gate saía 0 — a catraca via o baseline intacto e o check aceitava a ocorrência contra um
  crédito que a base já não sustentava. A regra: sob `--ci`, o crédito de uma entrada só vale
  até o que os linters **da base**, rodando sobre a árvore **da base**, de fato produzem para
  aquela impressão digital.
  - **Mecanismo.** Quando o baseline da base tem entradas, o gate materializa a árvore da base
    (a mesma função da conferência da adoção) e analisa nela **os arquivos que têm entrada no
    baseline** — a impressão digital inclui o caminho, então só o arquivo da entrada pode dar
    lastro a ela. O baseline do check é o da base com cada contagem reduzida a esse lastro: a
    conta do `prune`, sem gravar nada. Baseline da base sem entradas: nada a conferir, a base
    não é analisada. Sem `--ci` (fase V local) nada disso roda.
  - **O que não muda.** Corrigir uma violação sem rodar o `prune` continua verde: sobrar
    crédito não é violação, vira uma nota no log. O `prune` continua livre e o crédito pré-pago
    continua recusado. Com o override aprovado, a entrada cujo aumento foi aprovado vale pelo
    `count` aprovado; as que o PR não aumentou seguem limitadas pela base (um override dado por
    outro motivo não leva de carona a violação antiga).
  - **Erro ao analisar a base é exit 3.** A árvore da base só tem o que está no git. Um linter
    do projeto que dependa de pacote instalado e não versionado não carrega ali, e o gate sai 3
    em todo PR enquanto o baseline da base tiver entradas: o linter tem de ser autocontido, só
    `node:*` e imports relativos para dentro de `machine/`. Dependência versionada só serve num
    `node_modules` dentro de um dos dois diretórios de standards. O gate compara com a base todo
    `node_modules` sob `.context/`, e o trecho de CODEOWNERS gerado dá dono aos que ficam dentro
    de um dos dois diretórios de standards ou de `.context/bin/` (o PR que acrescenta a
    dependência pede override); nos demais `node_modules` sob `.context/`, como
    `.context/node_modules/`, o override fica sem aprovador e o gate fecha. O de `.context/bin/`
    tem dono, mas um linter em `machine/` não acha por nome um pacote posto ali. No
    `node_modules` da raiz a dependência fica fora da catraca. Um linter da base que falha num
    arquivo com entrada no baseline só se conserta na branch base, com bypass de admin; a falha
    num arquivo sem entrada não é vista por esta análise.
  - **Resíduo declarado.** O que um linter carrega de fora de `machine/` e de `node_modules`
    sob `.context/` — pacote do `node_modules` da raiz, import relativo para fora — não é
    comparado com a base: um PR pode alterá-lo e desligar o linter com a catraca íntegra. É a
    razão de o linter ter de ser autocontido.
  - **Consequências aceitas.** Reaceitar uma violação por cima de crédito sem lastro pede dois
    PRs quando o total que o PR deixa no arquivo não passa da contagem antiga: com a base
    aceitando 3 e produzindo 1, o `prune` no PR não é aumento (não há o que o dono aprovar) e
    o `accept` vira crédito pré-pago; poda-se a base num PR e aceita-se no seguinte. Quando o
    total passa da contagem antiga, um PR com `accept` e override resolve, e a linha do aumento
    mostra o lastro ("1 → 2; a árvore da base produz 0") para o dono saber que revalida crédito
    antigo. O limite do crédito só existe no `gate`: o `check --base-ref --ci` isolado não o
    aplica. A fase V local pode passar onde o CI reprova. O gate custa mais: no fixture
    medido (15% a 20% dos arquivos com entrada), de 16% a 28% a mais de tempo de parede; sem o
    filtro de arquivos seria o dobro.
- **Override = rótulo + review preso ao commit, dados por quem é dono do que mudou.** O
  evento mais recente do rótulo `standards-ratchet-approved` é uma aplicação, **e** existe um
  review `APPROVED` cujo `commit_id` é o `head.sha` do PR. O `head.sha` tem de ser o HEAD em
  que o gate roda ou, na merge ref, o HEAD^2 — e o HEAD^2 só vale quando o HEAD tem exatamente
  dois pais e o primeiro é a base resolvida (três pais, ou primeiro pai que não é a base, não
  valem). **Resíduo declarado, fora do modelo:** um merge com esses dois pais e uma árvore que
  não é a do merge deles não é distinguido; para montá-lo é preciso controlar o HEAD em que o
  CI roda. A conferência da árvore por `git merge-tree --write-tree` foi tentada e retirada:
  dava falsa recusa com git anterior ao 2.38, com timeout e com `.gitattributes -merge`, e a
  mensagem não dizia a causa. O PR está aberto;
  para cada pessoa vale o review decisivo mais recente (`CHANGES_REQUESTED` ou `DISMISSED`
  posterior anula; dois no mesmo instante sem `id` que os ordene são recusados). Quem aplica o rótulo e quem
  faz o review tem de ser dono — pela última regra que casa no CODEOWNERS **da base** — de
  **todos os arquivos da catraca que o PR alterou** em relação à base: o
  `git diff --name-only <base>..HEAD`, com removidos e renomeados (um renomeado conta pelos
  dois nomes), filtrado por `standards/**` canônico e legado (com `machine/**` e o
  `baseline.json`), `standards.local.yaml`, `.devflow.yaml`, o shim e `node_modules` sob
  `.context/`. Arquivo alterado sem regra que o cubra não tem aprovador, e o gate fecha;
  violação sem nenhum arquivo da catraca alterado também fecha. Nunca o autor do PR, bot ou
  ação feita por GitHub App. Erro de API fecha.
- **Subconjunto de padrões do CODEOWNERS.** O gate entende: nome literal; `*` e `?` dentro
  de um segmento (não atravessam `/`); `**` como segmento inteiro; barra inicial (ancora na
  raiz; sem barra no começo nem no meio, o padrão casa em qualquer nível); barra final
  (diretório e tudo o que está abaixo). Um nome sem barra final — literal ou com curinga,
  como `/.context/eng*` — casa o próprio nome e, se for um diretório, o que está abaixo dele.
  - **`dir/*` e `/*` casam só os filhos diretos.** `docs/*` são os arquivos diretamente em
    `docs/`; `/*` são os arquivos da raiz. Um arquivo aninhado abaixo deles não é casado — e,
    se a regra vem depois da última que casa, ele fica **sem aprovador** (o gate não aposta
    em qual das duas leituras o GitHub faz). Só o `*` sem barra nenhuma casa tudo, em qualquer
    nível. Para dar a posse de uma pasta inteira, o padrão é `/pasta/`.
  - **Fora do subconjunto:** classe `[…]`, escape com `\` (inclusive espaço escapado),
    negação `!`, `***`, segmento vazio, `/` sozinho, `#`, espaço não ASCII ou caractere de
    controle dentro do padrão, e as formas de `**` que a documentação do GitHub não descreve
    (`**/` no fim e `**/**`).
  - **A linha é lida de forma estrita.** Só `\n` separa linhas (com `\r` opcional antes) e só
    espaço e tab ASCII separam tokens; comentário é `#` no começo da linha ou depois de
    espaço; depois do padrão só valem `@usuario`, `@org/time` ou e-mail. Uma linha cujo
    padrão casa mas traz dono fora do formato (vírgula colada, `#` no meio, sem `@`) não dá
    a posse a ninguém.
  - **O casamento fecha sempre.** Vale a última regra que casa; uma regra duvidosa **depois**
    dela — fora do subconjunto, `dir/*` ou `/*` sobre arquivo aninhado, ou dono fora do
    formato — deixa o arquivo sem aprovador. Um arquivo alterado com caractere de controle no
    nome (C0, `\n`, `\r`, U+2028, U+2029) ou com U+FFFD (bytes que não são UTF-8 válido)
    também. Um CODEOWNERS da base com 3 MB ou mais vale como ausente — o GitHub ignora o
    arquivo inteiro —, e não há aprovador.
- **Saída.** As violações saem por classe (std, versões, linter, shim, verify, link) antes
  das de baseline, com o total de cada classe; só as linhas de baseline têm teto. O caminho
  de cada achado sai numa linha só no log (sem caractere de controle); o `--json` traz o
  valor real.

### 3.6 Hooks

| Hook | Mudança |
|---|---|
| `pre-tool-use` (Edit/Write) | Toda decisão sai por uma única função `emit_decision`, que serializa o objeto inteiro com `json.dumps` (corrige o P0 e o C0 no `file_path`). O `additionalContext` leva o resumo dos standards e o knowledge on-demand, emoldurados e com teto de 9000. Guard semântico da catraca (D8). |
| `pre-tool-use-ratchet` (**novo**, Bash/NotebookEdit/MCP) | Guard heurístico da catraca, com caminho rápido só em builtins do bash quando o evento não cita arquivo da catraca. |
| `post-tool-use-lint` (**novo**, síncrono, só Edit/Write) | Engine só com os standards de nível máximo `block` (D9). Violação nova → `decision: "block"` + `reason`. Resto → `additionalContext`. Span OTel de latência. |
| `post-tool-use` (atual) | Continua async; os linters `warn`/`review` rodam aqui pelo mesmo engine. Telemetria, instincts, nudges de handoff. |
| `session-start-norms` (**novo**) | Campo próprio (≤ 9000) com standards `block`/`review`, guardrails de ADRs aprovadas e knowledge `always`, emoldurados. O `session-start` atual já passa de 10k (§5.1). |
| `subagent-start` (**novo**) | O mesmo conteúdo do `session-start-norms`, para cada subagente. |

### 3.7 Integração com o projeto (opt-in)

O `/devflow init` e o `/devflow:devflow-sync` **oferecem**, com consentimento:

- um shim versionado em `.context/bin/devflow-standards.mjs` (copiado do plugin) que
  localiza o plugin instalado pelo registro de plugins do Claude Code, e o pre-commit
  `node .context/bin/devflow-standards.mjs check --staged` no gerenciador que o projeto já
  usa (lefthook, husky, pre-commit) ou lefthook se não houver nenhum;
- job de CI (GitHub Actions ou GitLab) que faz checkout do `NEXUZ-SYS/devflow` fixado na
  versão instalada e roda `gate --base-ref=refs/remotes/origin/<alvo> --ci` sobre o merge
  do PR, com o histórico completo; projetos Python/Odoo precisam de Node no runner. Um
  enfraquecimento deliberado é liberado pelo override — rótulo `standards-ratchet-approved`
  **e** review `APPROVED` no head do PR, os dois de quem é dono, no `CODEOWNERS` da base,
  dos arquivos da catraca que o PR alterou, e que não seja o autor do PR, bot nem GitHub
  App (§3.5, "Gate no CI"; pressupõe que o agente não tem credencial de dono). O repositório do plugin
  é público: o checkout não precisa de token. No GitLab não há override;
  - **Base no GitLab: sempre a ponta da branch de destino (decisão de 2026-10-06, depois da
    re-revisão de segurança).** O job usava, sem *merged results pipelines*, a base do diff do
    merge request — o ponto em que a branch saiu do destino —, e um merge request desatualizado
    era julgado pelas regras daquele commit: criado antes de um std virar `block`, saía 0 com
    código que o destino hoje bloqueia. Agora, com *merged results* a ponta vem do pipeline
    (`CI_MERGE_REQUEST_TARGET_BRANCH_SHA`) e o job roda sobre o merge; sem elas (a variável vem
    vazia, e é também o que o GitLab roda quando há conflito) o job busca a branch de destino no
    `origin` e usa a ponta buscada. O nome da branch (`CI_MERGE_REQUEST_TARGET_BRANCH_NAME`) é
    dado do ambiente do CI: só é usado depois de validado (`git check-ref-format --branch`, e o
    nome devolvido tem de ser o recebido), entre aspas e como `refs/heads/<nome>`. Antes de
    baixar o plugin o job confere que a base é ancestral do HEAD; se o merge request estiver
    atrás do destino, sai 3 com o remédio — atualizar a branch do merge request com a de destino
    (rebase ou merge), ou ligar *merged results pipelines*. Nome malformado ou ausente, branch
    que o `origin` não tem e variável da ponta que não é um SHA também saem 3;
  - **Pin da versão do plugin:** `.context/bin/devflow-plugin.ref`, uma linha com `vX.Y.Z` (tag de
    release) ou um SHA de 40 dígitos, gravada pela oferta com a versão instalada. O job lê o pin
    **da base** do PR (o do PR só vale na adoção, enquanto a base não o tem). O pin não é arquivo
    da catraca: é seguro porque o CI o lê da base e o CODEOWNERS cobre `/.context/bin/`, o que
    depende de "Require review from Code Owners" (ação humana). Pin quebrado na base só sai com
    bypass de admin, e o pin só funciona a partir da release que contiver o `gate`.
  - **Variáveis do override:** o sinal `standards` rodado pelo `verify-run` sob `--ci` repassa
    `--allow-weakening --pr=<n> --repo=<o/r>` ao gate só quando `DEVFLOW_PR_NUMBER` (dígitos) e
    `DEVFLOW_REPO` (`dono/nome`) estão presentes e válidos; ausentes ou malformadas, o gate segue
    fechado. O workflow pronto do plugin passa as opções direto, sem essas variáveis.
  - **Limites declarados:** projeto em subdiretório do repositório (os arquivos de CI assumem o
    projeto na raiz e a oferta não os gera), GitHub Enterprise (só `github.com` é reconhecido),
    e **nada rodou em GitHub ou GitLab reais**. O trecho de CODEOWNERS gerado dá dono aos dois
    layouts de standards (`.context/engineering/standards/` e `.context/standards/`);
- `standards: ["devflow-standards", "gate"]` no contrato `verify:` — argv **reservado**,
  resolvido pelo próprio plugin; um comando do projeto não é aceito para esse sinal;
- `CODEOWNERS` nos caminhos da catraca, com a regra da catraca por último e escrita como `/pasta/`
  (no CODEOWNERS vale a última regra que casa; `dir/*` sobre arquivo aninhado deixa o arquivo sem
  aprovador). Donos são pessoas, não times. **Neste repositório (dogfooding)**, o plugin é o
  próprio PR: o `test.yml` roda o `gate` do PR, e o CODEOWNERS dá dono a tudo o que o gate importa ou lê:
  `scripts/` inteiro (o gate importa dezenas de módulos de `scripts/lib/`, como o que define os
  caminhos da catraca e o que lê o `verify:`) e `assets/standards/` inteiro (os `.md` dos standards
  default carregam o nível que o gate aplica; ali também moram os linters, o shim e os assets de
  CI), mais o `test.yml`, o próprio CODEOWNERS e o `.devflow.yaml`. Dono único que também é o
  autor dos PRs exige outro dono (ou bypass de admin) com "Require review from Code Owners" ligado.
  Sem override aqui;
- `baseline init` no primeiro uso, rodado pelo operador no terminal dele.

---

## 4. Fluxo por momento e por fase

| Momento | Entrega e verificação |
|---|---|
| **SessionStart** | Índice de standards com o nível de cada um. Num campo próprio (`session-start-norms`, ≤ 9000): standards `block`/`review`, guardrails de ADRs aprovadas e knowledge `activation: always`. |
| **Antes de editar** | O engine resolve os standards pelo `applyTo`. Resumo com princípios, anti-patterns e regras `block` em destaque, mais o knowledge on-demand, emoldurados. Cache por `session_id:agent_id`, marcado só quando a entrega é garantida (allow) e limpo no `PostCompact`. Orçamento de 6k para normas e 9k no total; o excedente vira ponteiro `leia <caminho>`. **Chega junto do resultado da ferramenta** (hooks.md:1815), ou seja, depois da primeira edição sob cada std (D10, medido na T23). |
| **Depois de editar** | Linters síncronos só dos std que podem bloquear. `block` novo → bloqueio com arquivo, linha, regra e mensagem. `warn`/`review` → contexto (async). Achado no baseline → silêncio. |
| **Subagente** | O mesmo conteúdo do `session-start-norms`. Cobre os 15 especialistas e os workers do loop autônomo. |
| **Fase P** | Novo passo em `prevc-planning`: `devflow standards explain` sobre os caminhos que o plano toca. O plano declara as normas por grupo de tarefas; a fase R confere. |
| **Fase E** | Cada story do `stories.yaml` leva as normas dos seus caminhos. O hook garante o resto. |
| **Fase V** | Sinal `standards` no `verify-gate`: `gate` verde com o digest atual, obrigatório quando existe algum standard que pode chegar a `block` — sem `verify.standards` declarado, o gate bloqueia. O code-reviewer recebe os checklists `review`. O P1 é corrigido: `prevc-validation` e `context-awareness` passam a resolver ADRs por `context-paths.mjs resolve-read adrs`. |
| **Commit** (opt-in) | `node .context/bin/devflow-standards.mjs check --staged` (lê o índice). |
| **CI** (opt-in) | `gate --base-ref=refs/remotes/origin/<alvo> --ci` sobre o merge do PR: baseline e enforcement da base, crédito do baseline limitado ao que a base ainda produz, lint dos blobs do HEAD. É a única camada que não dá para contornar. |

**Coerência:** todos os pontos usam o mesmo engine e o mesmo baseline, e um achado
bloqueia igual em qualquer um deles.

---

## 5. Erros, degradação e proteções

- **Falha de infraestrutura** (linter quebra, timeout, node ausente):
  - no hook, falha aberto, com aviso ao agente ("linter `std-x` falhou: <motivo>;
    rode `devflow standards check` antes do commit");
  - no CLI, CI e fase V, falha fechado (exit `3`).
- **Latência:** os linters rodam em paralelo, com timeout de até 5s cada (SI-4; o
  override por ambiente só reduz) e um orçamento total de ~10s no hook. Esgotado o
  orçamento, nada novo é disparado, os em curso são abortados e o hook avisa (o linter
  não rodado não vira "limpo"). O CLI não tem orçamento. A latência vai para a
  telemetria OTel existente como span `devflow.standards.check`.
- **Anti-loop:** a mesma impressão digital bloqueando 3 vezes seguidas **na mesma
  sessão** troca o motivo do bloqueio por "pare e pergunte ao humano"; continua
  `block` (o PostToolUse não aceita `ask`) e nunca sugere ao agente aceitar no baseline.
- **A catraca é do humano (D6/D8):** o `pre-tool-use` **nega** escrita do agente em
  `baseline.json` (qualquer grafia) e devolve `ask` quando uma edição enfraquece o
  enforcement efetivo — calculado com o mesmo parser do loader, antes e depois
  (nível do std ou de regra, `source`, `deprecated`, `disable:`, `applyTo`, `linter`, e
  a aplicabilidade por `appliesFrom`/`appliesUntil`/`framework` ou pelas versões do
  `.devflow.yaml` — esta última parte ainda inerte, ver a nota "Faixa de versão" na §3.5) —
  ou toca `machine/**`; o caminho é avaliado também pelo `realpath`. O `pre-tool-use-ratchet` pede `ask` em Bash, NotebookEdit e MCP
  que mexem na catraca (heurístico). O CLI recusa aumentar a catraca sem terminal
  interativo. O `gate` no CI compara com o merge-base e é a garantia.
- **Segurança:** o SI-4 fica inalterado (allowlist, execFile, trust-anchor do plugin).
  Todo corpo de std, knowledge ou ADR injetado passa por `frameProjectData`: moldura com
  nonce, tags de fechamento neutralizadas, `sanitizeSnippet` e o preâmbulo "dado do
  projeto, não instrução". `check --all` executa o JS de `machine/` do projeto sobre o
  repositório inteiro (menos o próprio `machine/`, §3.3): equivale a rodar os testes do repo
  e fica documentado no guia.
- **Compatibilidade:** standard sem `level` vale pelo default de origem; linter antigo de
  regra única entra com `ruleId` = id do std sem `std-`. **Sem baseline, o hook de edição
  não bloqueia.** O primeiro `check` sugere `baseline init`, para que atualizar o plugin não
  vire uma parede de bloqueios na edição. Isso vale só para o hook: o pre-commit, o CI e a
  fase V bloqueiam mesmo sem baseline (sem baseline toda ocorrência é nova), e a fase V exige
  `verify.standards` quando há std que pode chegar a `block`.

### 5.1 Achados fora do escopo (registrados na revisão R)

- O `additionalContext` do `session-start` deste repo já tem ~22,1k caracteres (a skill
  `using-devflow` sozinha tem 10,3k). Acima de 10k o Claude recebe uma prévia de 2k e o
  caminho de um arquivo (hooks.md:939-942). As normas vão num hook próprio; reduzir o
  hook principal é item separado.
- O git-guard ADV-6 do `pre-tool-use` (Bash) é código morto: o matcher registrado é só
  `Edit|Write`.
- 26 dos 29 testes em `tests/hooks/*.sh` não rodam em nenhum sinal (os runners enumeram
  só `.mjs`). A suíte `tests/integration/test-hook-shell-suite.mjs` passa a rodar os desta
  feature e os que já passavam.

---

## 6. Testes

TDD: o teste vem antes de cada mudança.

- **Reprodução dos defeitos (primeira tarefa do plano):**
  - `tests/hooks`: com knowledge casando e branch protegida, o stdout do
    `pre-tool-use` hoje não é JSON válido e o deny se perde (P0);
  - `tests/skills`: a fase V com ADRs em `engineering/adrs/` (P1).
- **Unitários (`tests/lib`):** parser v2 e legado; resolução de nível; impressão digital
  estável quando linhas mudam; `check`/`prune`/`accept`; orçamento de latência; anti-loop.
- **Integração dos hooks:** teste de **propriedade** do `pre-tool-use` (ferramenta ×
  branch × config × caminho com C0/aspas/barra/bidi × contexto): stdout vazio ou
  exatamente um JSON, e a mesma decisão com e sem contexto; teste estrutural (nenhum JSON
  de decisão fora de `emit_decision`); `block` só para violação nova de nível `block`;
  orçamento esgotado termina em orçamento + 1s; negação de escrita em `baseline.json`;
  os 14 vetores de bypass do guard; `ask` no Bash que mexe na catraca. Os testes de hook
  em bash rodam pela suíte `tests/integration/test-hook-shell-suite.mjs`.
- **E2E (`tests/e2e`):** projeto fixture com violações antigas e novas; `baseline init`;
  o agente edita, é bloqueado, corrige; `check --staged` passa; o gate da fase V fica
  verde. **Agente adversário:** cada camada local resiste ou o `gate` contra o merge-base
  pega (baseline regravado, nível rebaixado). Uma rodada no omp.
- **Validação real (só leitura):** `baseline init` numa cópia temporária do projeto real medido
  para medir os achados por standard e a latência. Nada é gravado no projeto.
- `requiredSignals: [unit, integration, e2e, lint]`

---

## 7. Rollout

1. **Release 1, correções e fundação:** P0 e P1, protocolo v2, engine, CLI e baseline.
   Os hooks ainda não bloqueiam.
2. **Release 2, entrega de contexto:** resumo antes da edição, `SubagentStart`, passos
   de standards nas fases P e V e o sinal `standards`.
3. **Release 3, enforcement:** hook síncrono bloqueante, anti-loop, catraca em camadas
   (Edit/Write, Bash/NotebookEdit/MCP, `gate` contra o merge-base), oferta de shim,
   pre-commit, CI e CODEOWNERS no `init` e no `sync`, paridade no omp, e o guia de
   migração para projetos existentes (como promover standards a `block`).

### 7.1 Relação com outras specs

- `2026-09-02-standards-materialize-on-init-design.md` (aprovada, execução adiada):
  **compatível**. Os standards materializados chegam com `source: devflow-default` e,
  portanto, com `level: warn`. A promoção a `block` é um ato do projeto (`enforce`).
- `2026-06-12-standards-coverage-gap-fix-design.md`: a reescrita dos 8 standards de
  baixa fidelidade continua fora de escopo aqui e vai para o subprojeto 3.

---

## 8. ADRs

A oferta formal é feita no Step 3.5 do `prevc-planning`.

- **Nova ADR-015**, "Enforcement determinístico de standards": D2 a D6 e D8 a D10.
- **Evolução da ADR-013** (pipeline de sinais verificáveis): novo sinal `standards`.
- **Evolução da ADR-007** (biblioteca de standards): campo `enforcement.level`,
  `enforcement.rules` e protocolo de linter v2.

---

## 9. Sequência: subprojetos seguintes

Os subprojetos 3 e 4 ficam fora desta spec, cada um com seu próprio ciclo
spec → plano. A evidência já levantada fica registrada aqui para não se perder.

### Subprojeto 3: doutrina de engenharia

- **Reabrir a D6** de `2026-05-30-context-layer-knowledge-ddc-design.md:43`. As normas
  prescritivas de `contracts/` e `architecture/` (FSD, Atomic, hexagonal,
  `contracts/postgres`, `contracts/api`) não cabem num std de ~70 linhas; a pesquisa
  do próprio repo mede a cobertura em architecture 0%, contracts 25%, practices 20% e
  processes 12% (`docs/research/standards-coverage-gap.md:48-55`).
- **346 referências órfãs** `@rules/…`, `@contracts/…`, `@practices/…` e
  `@architecture/…` em 25 docs de `assets/stacks/`, apontando para arquivos que não
  existem (ex.: `assets/stacks/database/postgres.md:11,40`).
- **A fonte do DDC não é versionada nem sincronizada:** `framework_ddc/` tem 0 arquivos
  rastreados, e a cópia local é anterior à do projeto real (diz "ULID padrão, UUID v4
  alternativa" em `framework_ddc/.contexts/engineering/contracts/postgres.md:89-100`,
  enquanto a versão atual fixa `uuidv7()`). É a origem do texto de
  `assets/standards/std-data-modeling.md:15`.
- Reescrever os 8 standards de baixa fidelidade; destino para
  `practices/ai-friendly-code.md`; concerns da taxonomia sem std (`module-size`,
  `environment-config`, `git-workflow`).
- Coerência da migração: `project-init` avisa sobre `.context/architecture/` legado,
  mas `scripts/devflow-migrate.mjs:79` não o move.

### Subprojeto 4: detector de conflito entre normas

- Hoje a injeção ADR → std é só aditiva (`skills/adr-builder/SKILL.md:240-256`): procura
  regra da ADR que falta no std, mas não detecta regra do std que **contradiz** a ADR.
- Não há verificação std × ADR, std × knowledge nem std × doutrina. No projeto real, os
  4 conflitos da revisão (PK, sufixo `Schema`, nomes de arquivo shadcn × Atomic,
  idioma de testes e rotas) foram achados por auditoria manual e resolvidos em ADRs
  014–019, e ainda restam standards contradizendo decisões
  (`std-internationalization` × DP-23; `std-typescript-strict` × `export default`).

---

## 10. Fora de escopo

- Conteúdo de doutrina (subprojeto 3) e detecção de conflitos (subprojeto 4).
- Materialização nativa em `.claude/rules` (D1; reavaliar se a medição do release 2
  mostrar que o contexto injetado na edição chega tarde demais).
- Linters novos: esta spec muda o contrato e o transporte, não a cobertura.

# Guia: enforcement determinístico de standards

Este guia é para quem **usa** o DevFlow num projeto: como as normas (standards) passaram de lembrete
para gate, como ligar cada camada, o que fazer quando algo bloqueia e onde a proteção termina.
Decisão de arquitetura: [ADR-015](../.context/engineering/adrs/015-deterministic-standards-enforcement-v1.1.0.md).
Desenho completo: [spec](superpowers/specs/2026-09-26-standards-enforcement-context-delivery-design.md).

Sumário: [O que mudou](#o-que-mudou) · [Níveis](#níveis-e-defaults) · [Comandos](#comandos) ·
[O que o hook faz](#o-que-o-hook-faz-na-edição) · [Como ligar as camadas](#como-ligar-as-camadas) ·
[Override](#liberar-um-enfraquecimento-deliberado-github) · [Limites](#limites-e-resíduos-conhecidos) ·
[FAQ](#faq) · [Não verificado](#não-verificado-em-ambiente-real) · [Migração](#nota-de-migração)

---

## O que mudou

Antes, um standard era um **lembrete**: o linter rodava num hook assíncrono depois da edição, a
saída chegava ao modelo só no turno seguinte e nada impedia o commit. Nenhum pre-commit, CI ou gate
de fase rodava esses linters.

Agora o standard é um **gate**, com a mesma regra em todos os pontos (hook de edição, pre-commit,
CI e fase V do PREVC):

- um motor único aplica os linters e classifica cada achado em `block`, `warn` ou `review`;
- as violações que já existiam ficam registradas num **baseline** versionado, que só encolhe;
- **só a violação nova de nível `block` bloqueia**: o agente edita, o hook recusa, ele corrige;
- aumentar o baseline ou rebaixar um nível é decisão **do humano**, no terminal dele;
- o job de CI (`gate`) compara tudo contra a branch de destino e é a única camada que não dá para
  contornar localmente.

O contexto também chega melhor ao agente: o SessionStart e o SubagentStart entregam as normas
`block` e `review`, e o resumo da norma aplicável aparece na edição (ver "O que o hook faz").

## Níveis e defaults

| Nível | Efeito |
|---|---|
| `block` | Violação **nova** bloqueia o hook de edição, o pre-commit, o CI e a fase V |
| `warn` | Aparece como aviso; nunca bloqueia |
| `review` | Sem regra mecânica; entra no checklist do code-reviewer na fase V |

O nível é definido no frontmatter do standard e pode ser sobrescrito por regra do linter:

```yaml
enforcement:
  linter: machine/std-data-modeling.js
  level: warn            # nível do standard
  rules:
    float-money: block   # sobrescreve só esta regra (ruleId do linter)
```

Resolução: `rules[ruleId]` → `level` → default da origem → `warn`. O default da origem é **`warn`
para os standards que vêm do plugin** (genéricos, podem estar errados para o seu projeto) e
**`block` para os que o próprio projeto escreveu**, isto é, os que declaram `source: local` no
frontmatter (é o que `standards new` gera). Sem `source: local` o default é `warn`. Achados marcados como
`ADVISORY` (e linters antigos de várias regras) valem `warn`, a menos que `rules` os eleve.

**`maxLevel` e por que só alguns linters rodam na edição.** `maxLevel` é o nível mais alto que
alguma regra do standard pode atingir. O hook síncrono, que roda logo depois de cada Edit/Write e
tem orçamento de cerca de 10 segundos, executa **só os linters de `maxLevel` igual a `block`**.
Os de `warn` e `review` continuam no hook assíncrono. Assim, um projeto sem nenhum standard `block`
não paga latência na edição.

Para promover um standard do plugin a `block`, ejete-o para o projeto **com o linter** e eleve o
nível:

```bash
CLAUDE_PLUGIN_ROOT="<plugin>" node "<plugin>/scripts/devflow-standards.mjs" eject security --with-linter
node "<plugin>/scripts/devflow-standards.mjs" enforce std-security --level block
```

Sem `--with-linter`, o `eject` copia só o `.md` e zera o campo `linter`: o standard passa a ser
só texto e nada mais o executa. O `eject` procura os arquivos do plugin pela variável
`CLAUDE_PLUGIN_ROOT` (ou, se ela não existir, pelo diretório atual), por isso ela vem no comando
quando você roda fora de uma sessão do Claude Code. O `enforce` não precisa dela.

**O PR que traz um linter novo precisa do override de um dono.** O `eject --with-linter` grava um
arquivo novo em `machine/`, e o mesmo acontece quando você cria um standard com linter
(`standards new`). Para o gate, arquivo novo em `machine/` é mudança da catraca (ver "Arquivo novo
em `machine/`", nos limites): no GitHub o PR sai vermelho até o dono das normas liberar pelo
override; no GitLab não há override, o job fica vermelho e o merge é decisão de quem mantém o
projeto. A exceção é o PR que adota os standards num projeto que ainda não tinha nenhum.

## Comandos

O comando é um arquivo, não um binário `devflow`. Com o shim instalado no projeto
(`.context/bin/devflow-standards.mjs`, ver "Como ligar as camadas"):

```bash
node .context/bin/devflow-standards.mjs <subcomando> …
```

Sem o shim, use `node "<plugin>/scripts/devflow-standards.mjs" …`, em que `<plugin>` é a pasta do
plugin instalado.

| Subcomando | Para quê |
|---|---|
| `check [--staged \| --all \| <caminhos>] [--base-ref=<ref>] [--json]` | Roda os linters e compara com o baseline. `--staged` lê o índice do git (é o que o pre-commit usa); `--all` inclui arquivos não rastreados. Sozinho, mesmo com `--base-ref` e `--ci`, **não** compara a catraca nem limita o crédito do baseline ao que a branch de destino ainda produz: quem monta o próprio job de CI usa o `gate` |
| `baseline init` | Cria o baseline com **todos** os achados de hoje. Recusa se já existir |
| `baseline prune` | Reduz as contagens ao que ainda existe e remove o que zerou. Só encolhe; qualquer um pode rodar |
| `baseline accept <fp> --reason "…"` | **Aumenta** o baseline em uma ocorrência. Exige justificativa (fica registrada). `<fp>` é a impressão digital que aparece no `check --json` |
| `baseline reinit <std> --reason "…" [--allow-new-paths]` | Refaz as entradas de **um** standard com os achados atuais. As que não mudaram e as que só diminuíram ficam com a justificativa que tinham, e as dos outros standards não são tocadas. É o caminho quando o linter do standard mudou de regra ou de mensagem. Arquivo que não tinha nenhuma entrada do standard **no baseline da branch de destino** (o do merge-base com `origin/main`; sem ele, o do HEAD) só entra com `--allow-new-paths`; sem a flag o comando lista esses arquivos e não grava. Uma entrada que você aceitou antes, na mesma branch, também conta como caminho novo. Confira no relato os caminhos novos e os que ganharam ocorrências: é ali que aparece o que você está aceitando |
| `enforce <std> --level block\|warn\|review` | Promove (livre) ou rebaixa um standard do projeto. Standard default exige `eject` antes |
| `explain <arquivo…>` | Lista as normas aplicáveis a cada arquivo, com o nível e o nível máximo. Serve para planejar |
| `gate --base-ref=<ref> [--ci]` | Compara a catraca com a branch de destino e roda o `check --all`, com o crédito do baseline limitado ao que a branch de destino ainda produz (só o `gate` faz isso). É o que o CI executa |

**`baseline init`, `baseline accept`, `baseline reinit` e o rebaixamento de nível só rodam num terminal interativo**
do operador (entrada padrão ligada a um terminal e fora de CI). Num script, num agente ou em CI o
CLI recusa com exit 2 e imprime o comando para o humano colar no terminal dele.

### Exit codes

| Código | Significado |
|---|---|
| `0` | Tudo certo |
| `1` | Violação `block` **nova**, ou catraca enfraquecida (só no `gate`) |
| `2` | Uso incorreto (opção desconhecida, argumento malformado, caminho passado ao `check` que não existe) ou ação recusada (sem terminal interativo) |
| `3` | Erro de execução: linter fora do contrato, baseline inválido, base do git inválida, timeout. Nunca conta como limpo |

Exit 3 é a regra para tudo que não dá para afirmar: um linter que sai com exit 1 sem imprimir
`VIOLATION`, que estoura o tempo (5 s) ou imprime mais de 1 MB é **erro**, não "limpo".

### Exemplo

```text
$ node .context/bin/devflow-standards.mjs check --staged
warn   src/service/user.ts:42 [std-error-handling/error-handling] catch vazio
✗ 1 violação(ões) nova(s) de nível block:
  src/ui/Card.tsx:1 [std-security/security] vetor inseguro (dangerouslySetInnerHTML (XSS))
$ echo $?
1
$ node .context/bin/devflow-standards.mjs check --staged   # sem baseline no projeto
✗ 1 violação(ões) nova(s) de nível block:
  src/ui/Card.tsx:1 [std-security/security] vetor inseguro (dangerouslySetInnerHTML (XSS))
Sem baseline: o operador registra o legado no terminal dele com node "<plugin>/scripts/devflow-standards.mjs" baseline init
```

## O que o hook faz na edição

- **Antes da edição** (PreToolUse): entrega o resumo das normas aplicáveis ao arquivo, emoldurado
  como dado do projeto, no limite de 9.000 caracteres. Esse contexto chega **junto do resultado
  da ferramenta**, não antes dela: na primeira edição sob cada norma, a norma chega depois da
  edição. O "antes" de verdade vem do SessionStart, do SubagentStart e da fase P do PREVC
  (`explain`).
- **Depois da edição** (PostToolUse síncrono): roda os linters dos standards que podem bloquear.
  Violação nova de nível `block` → o hook devolve um bloqueio com arquivo, linha, regra e
  mensagem, e o agente corrige. Achado que já está no baseline fica em silêncio.
- **Anti-loop:** se a mesma violação bloquear **3 vezes seguidas** na mesma sessão, a mensagem
  passa a mandar o agente parar e perguntar ao humano. O bloqueio continua, e a mensagem nunca
  sugere aceitar no baseline.
- **Sem baseline:** o hook **não bloqueia**. Ele mostra a violação como aviso e diz que o operador
  registra o legado com `baseline init`. Isso evita que a atualização do plugin passe a bloquear a
  **edição** do agente de uma hora para outra; o pre-commit, o CI e a fase V seguem a "Nota de
  migração".
- **Baseline inválido** (JSON corrompido, entrada repetida, mais de 16 MiB): o hook avisa e
  **também não bloqueia** até alguém corrigir o arquivo. A CLI, o CI e a fase V, ao contrário,
  saem com exit 3. O mesmo vale se o baseline foi apagado da árvore de trabalho mas existe no
  último commit: vale a versão do commit, e o hook bloqueia normalmente.
- **Linter quebrou ou o orçamento acabou:** o hook segue (falha aberto) e avisa qual linter falhou
  e para rodar `check --staged` antes do commit. No CLI e no CI o mesmo problema é exit 3.
- **O agente não mexe na catraca:** escrita em `baseline.json` é negada. Uma edição que enfraquece
  o enforcement (baixa um nível, troca `source`, marca `deprecated`, acrescenta `disable:`, muda
  `applyTo` ou `linter`, ou toca `machine/`) faz o hook pedir confirmação ao humano. Comandos de
  Bash, NotebookEdit e MCP que parecem mexer na catraca também pedem confirmação. Isso é atrito
  local: a garantia é o CI.

## Como ligar as camadas

O `/devflow init` e o `/devflow:devflow-sync` **oferecem** cada item abaixo, um por vez, e só
gravam depois do seu sim. Nada é ligado sozinho.

### 1. Baseline (obrigatório para o bloqueio valer)

No terminal, na raiz do projeto:

```bash
node .context/bin/devflow-standards.mjs baseline init
git add .context/engineering/standards/baseline.json && git commit -m "chore(standards): baseline inicial"
```

O arquivo `.context/engineering/standards/baseline.json` é versionado. Revise o diff: ele é o
retrato da dívida que o projeto aceita.

O baseline não registra achado em `machine/`: os linters do projeto não são analisados (ver
"Limites"). Um baseline criado antes dessa regra pode trazer entradas com caminho em `machine/`;
elas não correspondem mais a achado nenhum e saem no próximo `baseline prune`.

**Corrigiu uma violação que estava no baseline? Rode `baseline prune` no mesmo PR.** No CI, uma
entrada só vale enquanto a branch de destino ainda tem a ocorrência: o gate confere isso rodando
os linters da branch de destino sobre os arquivos dela que têm entrada no baseline. A entrada
que sobra depois da correção não protege mais nada. Ela não reprova o PR (sobrar crédito não é
violação), mas passa a sair como nota em todo PR seguinte ("entrada(s) aceitam mais ocorrências
do que a árvore da base produz") até alguém podar. Ver "O crédito do baseline e a branch de
destino", nos limites.

### 2. Pre-commit (atrito local)

A oferta copia o shim para `.context/bin/devflow-standards.mjs` (cópia fiel do plugin; não edite)
e acrescenta ao gerenciador que o projeto já usa (lefthook, husky ou pre-commit; lefthook se não
houver nenhum) o comando:

```bash
node .context/bin/devflow-standards.mjs check --staged
```

O shim acha o plugin instalado na máquina de quem commita (variável `DEVFLOW_PLUGIN_ROOT` ou o
registro de plugins do Claude Code). Sem plugin, sai com exit 3 e o commit não passa calado.
Quem commita com `--no-verify` não passa por ele: por isso o pre-commit é conveniência, não
garantia.

### 3. CI (a garantia)

O job faz checkout do `NEXUZ-SYS/devflow` numa versão **fixada** e roda `gate --base-ref=refs/remotes/origin/<alvo> --ci`
sobre o merge do PR, com o histórico completo. O repositório do plugin é **público**: o checkout
não precisa de token. Nenhum código do PR roda antes do gate (sem instalar dependências, sem
scripts do repositório).

- **A versão fixada** fica em `.context/bin/devflow-plugin.ref`, uma linha com `vX.Y.Z` (tag de
  release) ou um SHA de 40 dígitos. O CI lê esse arquivo **da branch de destino**; o do PR só vale
  enquanto a base ainda não o tem (a adoção). A oferta grava a versão do plugin instalado.
  Versione o arquivo.
- **Node no runner:** o job instala o Node 22 no runner. Projetos Python, Odoo ou qualquer outro
  não precisam de Node no projeto.
- **GitHub Actions:** `.github/workflows/devflow-standards.yml`, copiado fielmente do plugin.
  Roda em `pull_request` (abrir, atualizar, reabrir, rotular) e em review enviado ou dispensado.
- **GitLab:** `.gitlab/ci/devflow-standards.yml`, mais `include: local:` no `.gitlab-ci.yml`.
  Roda em pipeline de merge request. **No GitLab não há override** (ver abaixo): a catraca
  enfraquecida deixa o job vermelho, e isso inclui um linter novo ou atualizado em `machine/`. O
  merge com o job vermelho é decisão de quem mantém o projeto.

**No GitLab, confira que o job roda.** O job só entra em pipeline de merge request, e a regra
dele (`merge_request_event`) está no arquivo incluído. A documentação do GitLab pede que o
`.gitlab-ci.yml` do projeto tenha regras de job ou `workflow: rules` que casem
`merge_request_event`, e diz que regras definidas em `include:` não satisfazem esse requisito.
Se o seu `.gitlab-ci.yml` não tem regra própria de merge request, o GitLab pode não criar o
pipeline de merge request, e aí **o gate não roda e nada acusa erro**. Não foi conferido se a
regra do arquivo incluído basta (ver "Não verificado em ambiente real"). O que fazer: tenha no
próprio `.gitlab-ci.yml` uma regra de merge request (`rules:` num job, ou `workflow: rules`),
abra um merge request de teste e confira que o job `devflow-standards` aparece no pipeline do
merge request.

Se os jobs do projeto não têm `rules:` e o job do gate, vindo do arquivo incluído, bastar para
o GitLab criar o pipeline de merge request (o que o parágrafo acima deixa como não conferido),
o esperado pela documentação do GitLab são **dois pipelines** a cada push numa branch com merge
request aberto: o de branch, com os jobs do projeto, e o de merge request, só com o gate. É o
caso que ela descreve em "Avoid duplicate pipelines": jobs sem regras ficam fora dos pipelines
de merge request. Ela manda evitar a duplicação com `workflow: rules` ("Switch between branch
pipelines and merge request pipelines"), o que pede que os jobs do projeto passem a rodar em
pipeline de merge request: é mudança no CI do projeto, que a oferta do plugin não faz e que não
foi exercitada com este job. Com os dois pipelines no mesmo merge request, "Pipelines must
succeed" tem uma condição de corrida documentada (ver o item 1, abaixo).

**No GitLab, a base é sempre a ponta da branch de destino**, nos dois modos de pipeline:

- **Com *merged results pipelines*** (recurso dos planos Premium e Ultimate do GitLab), o
  pipeline entrega a ponta do destino ao job, que roda sobre o merge do merge request com ela.
  Não há nada a fazer.
- **Sem *merged results pipelines***, o job roda na ponta da branch do merge request, busca a
  branch de destino no `origin` e compara com a ponta buscada. Se o merge request estiver
  **atrás** do destino, o job **não julga**: sai com exit 3 e a mensagem "o merge request está
  atrás da branch de destino". Julgar ali seria aplicar as regras do commit em que a branch
  saiu, e um merge request aberto antes de um standard virar `block` passaria com código que o
  destino hoje bloqueia. O mesmo acontece com *merged results* ligadas quando o merge request
  tem **conflito** com o destino: o GitLab roda um pipeline comum de merge request, e como um
  merge request com conflito está sempre atrás do destino, o job também sai 3.

**Quando o job pede para atualizar a branch:** traga a branch de destino para a branch do merge
request (rebase sobre ela, ou merge dela) e envie; o pipeline seguinte roda com a branch em dia e
o gate julga pelas regras de hoje. Rodar o mesmo job de novo não adianta, porque a branch
continua atrás. **O job só recusa quando roda.** Pela documentação do GitLab, o pipeline de
merge request roda ao criar o merge request, a cada push na branch de origem e pelo botão "Run
pipeline"; o destino andar não está nessa lista. O merge request que já tinha passado não é
julgado de novo por isso (ver "O veredito não é refeito quando o destino muda depois do job",
nos limites). Num projeto em que o destino anda muito, cada pipeline novo de um merge request
aberto encontra a branch atrás e pede a atualização de novo: ligar *merged results pipelines*
tira esse atrito, se o plano do GitLab tiver o recurso.

Duas configurações do **repositório** completam a garantia e só o operador faz:

1. marcar o job do gate (`standards`, no workflow do GitHub; `devflow-standards`, no GitLab) como
   *required status check* da branch protegida. No GitLab a opção é "Pipelines must succeed",
   que a documentação do GitLab descreve como exigir que **um pipeline** rode com sucesso; na
   parte consultada não se achou forma de exigir um job específico. A opção é necessária, mas
   não basta se o merge request puder alterar a configuração de CI (ver "No GitLab, o job do
   gate é um arquivo do projeto", nos limites). A mesma documentação registra que, com pipeline
   de branch e pipeline de merge request no mesmo merge request, uma condição de corrida decide
   qual resultado a opção usa (issue 384927 do GitLab): evite os pipelines duplicados, como ela
   indica, com `workflow: rules` (ver "No GitLab, confira que o job roda", acima). No
   repositório do próprio DevFlow, que usa o `test.yml`, são **seis** checks, com estes nomes
   exatos: `sinal: unit`, `sinal: integration`, `sinal: e2e`, `sinal: lint`, `sinal: standards`
   e `guards (anti-tamper, independentes de verify.lint)`;
2. ligar **Require review from Code Owners** na proteção da branch (GitHub), com o CODEOWNERS
   abaixo. Sem isso, qualquer PR pode trocar o dono das normas, o workflow ou o pin.

### 4. `verify:` na fase V

No `.context/.devflow.yaml`:

```yaml
verify:
  standards: ["devflow-standards", "gate"]
```

O argv é **reservado**: quem resolve o comando é o próprio plugin, e qualquer outro valor é
recusado (um comando do projeto não pode forjar o verde). Com ele, a fase V roda o `gate` e exige
exit 0 para o estado atual da árvore. Se o projeto tem algum standard que pode chegar a `block` e
`verify.standards` não está declarado, a fase V **bloqueia**. Exit 3 na fase V também bloqueia.

Se você roda o sinal pelo executor (`verify-run.mjs standards`) dentro do seu próprio CI e quer o
override do GitHub, exporte `DEVFLOW_PR_NUMBER` (só dígitos) e `DEVFLOW_REPO` (`dono/nome`). O
executor só repassa o override ao gate com as duas variáveis presentes e válidas; sem elas, o
gate segue fechado. O workflow pronto do plugin não usa essas variáveis (passa as opções direto).

### 5. CODEOWNERS

Dê dono ao que decide o que vale. A oferta gera o trecho com o dono que você informar:

```text
/.github/workflows/devflow-standards.yml  @fulano
/.context/engineering/standards/          @fulano
/.context/standards/                      @fulano
/.context/standards.local.yaml            @fulano
/.context/.devflow.yaml                   @fulano
/.context/bin/                            @fulano
```

Regras que o gate impõe ao ler esse arquivo (o CODEOWNERS **da base** do PR):

- **As regras da catraca vão por último.** No CODEOWNERS vale a última regra que casa.
- **Escreva `/pasta/`, nunca `/pasta/*`.** Para o gate, `dir/*` só cobre os filhos diretos; um
  arquivo aninhado fica "sem dono" e ninguém consegue aprová-lo.
- **Dono é pessoa (`@usuario`), não time.** A credencial padrão do job não lê a composição de
  times, e o gate fecha. Usar `@org/time` exigiria um token com `read:org` no job, ao alcance dos
  linters do projeto.
- **O trecho dá dono aos dois diretórios de standards**, o atual
  (`.context/engineering/standards/`) e o antigo (`.context/standards/`), mesmo que o projeto só
  use um. Para o gate os dois são catraca em qualquer projeto: o check não analisa o `machine/`
  de nenhum deles, e um arquivo novo ali só entra com a aprovação de quem é dono do caminho. Um
  CODEOWNERS montado antes dessa regra só tem a linha do atual: acrescente `/.context/standards/`
  (a oferta mostra `codeowners.covered: false` enquanto ela faltar).
- **Em projeto que já tem algo nos diretórios de standards, o CODEOWNERS entra antes do primeiro
  linter novo.** O override é conferido contra o CODEOWNERS **da base**. Se a branch de destino
  já tem qualquer arquivo num dos dois diretórios, o primeiro PR que trouxer um linter novo (um
  `eject --with-linter`, um `standards new`, uma atualização do plugin com linter que o projeto
  não tinha) é violação da catraca e só passa com o override de quem **já** é dono na base. Se o
  CODEOWNERS chega no mesmo PR, ninguém consta como dono, ninguém aprova e o gate fica vermelho.
  A ordem é: primeiro o merge do PR que traz o CODEOWNERS com o dono, sem linter novo junto;
  depois o PR do linter, com o rótulo e o review desse dono.
- Dê dono também ao próprio `CODEOWNERS`, senão um PR comum troca quem é o dono.

### 6. `.gitignore`

Acrescente `.context/runtime/`: o cache pré-edição e o contador do anti-loop gravam lá.

## Liberar um enfraquecimento deliberado (GitHub)

Às vezes o time **quer** afrouxar a catraca: rebaixar um nível, remover um standard, aceitar mais
ocorrências. O `gate` fecha, e a liberação é do dono das normas. Ela só vale quando existem, ao
mesmo tempo:

1. o rótulo `standards-ratchet-approved` no PR; **e**
2. um review `APPROVED` no **último commit** do PR;

os dois dados por quem é dono, no CODEOWNERS da base, de **todos** os arquivos da catraca que o PR
alterou. Não vale o autor do PR, bot nem GitHub App. O gate confere isso na API a cada execução,
e o job roda de novo quando o rótulo ou um review muda.

Um `git push` depois da aprovação troca o último commit e a aprovação **deixa de valer sozinha**:
o dono precisa aprovar de novo. Nenhum passo remove o rótulo; o review preso ao commit é que
invalida. Nem o override libera um baseline com "crédito pré-pago", isto é, uma entrada que aceita
mais ocorrências do que a árvore tem: aceite só o que existe. O override também vale só para o
que ele mostra: a entrada que o PR aumentou vale pela contagem aprovada, e as que o PR não
aumentou continuam limitadas ao que a branch de destino ainda produz. Quando a linha do aumento
traz o lastro — "(1 → 2; a árvore da base produz 0)" —, a entrada já aceitava mais do que a
branch de destino tem: aprovar revalida também esse crédito antigo.

Se o gate recusa, a mensagem diz o motivo (por exemplo, qual arquivo ficou sem dono e qual regra
do CODEOWNERS o deixou assim).

## Limites e resíduos conhecidos

Nada abaixo é segredo; é o que cada camada garante e o que não garante.

**Quem protege o quê**

- **O pre-commit é contornável com `--no-verify`.** Os guards locais (do hook de edição, do Bash
  e da CLI) são **atrito**, não muro. O terminal interativo também é só atrito:
  `script -qc "node .context/bin/devflow-standards.mjs baseline init" /dev/null` simula um
  terminal, e apagar o `baseline.json` e rodar `init` de novo passa localmente. Todos esses
  caminhos param no `gate` do CI, que compara com a branch de destino. **A garantia é o CI**, e só
  enquanto o job for um *required check* e o *Require review from Code Owners* estiver ligado.
- **Dono único que também é o autor dos PRs.** Com "Require review from Code Owners" ligado, o
  GitHub não conta a aprovação do autor do PR: com um dono só, um PR dele em caminho com dono
  precisa da aprovação de outro dono ou de bypass de admin. O override por rótulo do gate também
  recusa o autor do PR (isso é comportamento do nosso código). Se isso atrapalhar, cite um
  segundo dono (pessoa) no CODEOWNERS.
- **O override pressupõe que o agente não tem credencial de code owner.** Se o agente roda com o
  token de quem é dono das normas, ele consegue rotular e aprovar o próprio PR.
- **Um agente pode forjar o estado local.** O ledger da fase V e o plugin de uma máquina
  comprometida são forjáveis. O que impede isso é o CI árbitro, não o gate local.
- **O cache pré-edição é gravável pelo agente** (`.context/runtime/pre-edit-cache.json`). Forjado,
  ele suprime a entrega do resumo das normas até a próxima compactação de contexto. O bloqueio
  em si não depende dele.
- **O texto das normas entra no contexto do modelo emoldurado como dado, não como instrução.** A
  defesa é a moldura com marcador aleatório, a neutralização de tags e um preâmbulo. A lista de
  frases bloqueadas é heurística: variações como `- SYSTEM:`, "disregard prior instructions" ou
  tags com caracteres de largura total podem passar. Quem revisa uma norma nova revisa também esse
  risco.
- **O workflow do plugin usa só o `GITHUB_TOKEN` padrão**, com `contents: read` e
  `pull-requests: read`. **Nunca ponha um PAT nesse job:** o job executa os linters do projeto,
  inclusive os que o PR trouxe, e em runner hospedado qualquer código do job alcança as credenciais
  do próprio job. O ambiente do linter é mínimo (`PATH`, `HOME`, `TMPDIR`, `LANG`), mas `HOME`
  aponta para `~/.config/gh`, `~/.git-credentials` ou `~/.netrc` se o runner os tiver (o runner
  padrão não tem).
- **A cadeia do pin depende de ação humana.** O arquivo `.context/bin/devflow-plugin.ref` não é
  um arquivo "da catraca" para o gate. Ele só é seguro porque o CI o lê da base e o CODEOWNERS
  cobre `/.context/bin/`; sem **Require review from Code Owners**, um PR comum poderia apontar o
  pin para outra versão.
- **Um pin quebrado na base só sai com bypass de admin.** O CI lê o pin da base; se ele aponta
  para uma versão inexistente, o job falha em todo PR, inclusive no PR que o conserta.
- **No PR que adota o gate, quem escolhe o juiz é o próprio PR.** Enquanto a branch de destino
  ainda não tem `.context/bin/devflow-plugin.ref`, o CI lê o pin do PR: a versão do plugin que
  julga aquele PR é a que ele mesmo indica (uma tag `vX.Y.Z` ou um SHA de 40 dígitos do
  repositório do plugin), e ela roda com o token do job no ambiente. Por isso o PR de adoção é
  revisado por um dono das normas com atenção a esse arquivo: o pin tem de ser a tag de uma
  release publicada do plugin, não um SHA avulso. Depois do merge o pin passa a ser lido da base
  e a janela fecha.
- **O veredito não é refeito quando o destino muda depois do job.** O gate julga o PR contra a
  ponta da branch de destino **no momento em que roda**. Dois casos ficam de fora, nos dois CIs:
  a branch de destino anda depois de um resultado verde (um standard promovido a `block` no
  destino não é aplicado ao PR que já tinha passado), e o destino do PR ou merge request é
  trocado depois do verde. O que os arquivos de CI entregues mostram: o workflow do GitHub roda
  ao abrir, atualizar, reabrir e rotular o PR e nos reviews, e **não** escuta a edição do PR,
  o evento em que, pelo que se conhece do GitHub, chega a troca de base; o job do GitLab só
  roda quando o GitLab cria um pipeline de merge request. Se o resultado antigo continua valendo
  para o merge é comportamento da plataforma e **não foi conferido**. A mitigação conhecida,
  também não conferida aqui, é exigir a branch em dia com o destino para fazer o merge:
  "Require branches to be up to date before merging" no GitHub; merge por fast-forward ou
  histórico semilinear no GitLab. Ver "Não verificado em ambiente real".

**O que o gate não vê**

- **O `check --all` executa o JS de `machine/` do projeto** sobre o repositório inteiro. É o
  equivalente a rodar os testes do repositório: trate o conteúdo de `machine/` como código do
  projeto, com revisão de código.
- **O que está em `machine/` não é analisado.** O motor pula os dois diretórios de linters,
  `.context/engineering/standards/machine/` e `.context/standards/machine/`, em todos os pontos:
  hook de edição, `check`, `gate` e a conferência da adoção. Vale para os dois **sempre**, em
  qualquer projeto, mesmo que ele nunca tenha usado o layout antigo. Sem isso todo linter
  "violaria" outro standard, porque a saída do protocolo é `console.log`. A consequência é uma
  **zona cega**: código colocado ali não passa por standard nenhum. O que a fecha é a comparação
  com a base no `gate`: arquivo novo, alterado ou removido em `machine/` é catraca enfraquecida
  (ver "Arquivo novo em `machine/`", abaixo). O pedido de confirmação do hook e o CODEOWNERS são
  as outras duas camadas.
- **Linter do projeto tem de ser autocontido**: só `node:*` e imports relativos **para dentro de
  `machine/`**. O job do gate não instala dependências do projeto, então um linter que faça
  `require` de pacote npm falha no CI com exit 3. Instalar as dependências no seu próprio CI não
  resolve quando o baseline da branch de destino tem entradas: o gate também roda o linter sobre
  os arquivos dela que têm entrada no baseline, numa árvore reconstruída só com o que está no git
  (ver "O crédito do baseline e a branch de destino"). Se a dependência tiver de ser versionada,
  o lugar é um `node_modules` **dentro de um dos diretórios de standards**
  (`.context/engineering/standards/` ou `.context/standards/`). O gate compara com a base todo
  `node_modules` sob `.context/`, e o trecho de CODEOWNERS gerado dá dono aos que ficam dentro
  desses dois diretórios ou de `.context/bin/`: ali o PR que acrescenta ou altera a dependência
  é violação da catraca e passa com o override do dono das normas. O de `.context/bin/` tem
  dono, mas um linter em `machine/` não acha pelo nome um pacote posto ali; por isso o lugar da
  dependência é o diretório de standards. Nos demais `node_modules` sob `.context/`
  (`.context/node_modules/`, por exemplo) a mudança também é violação, mas o trecho gerado não
  cobre o caminho: o override fica sem aprovador e o gate fecha. Se outra regra do CODEOWNERS do
  projeto cobrir esse caminho, quem aprova é o dono dela, não o das normas.
- **O que o linter carrega de fora de `machine/` não é comparado com a base.** O gate compara
  `machine/` e os `node_modules` sob `.context/`. Um pacote no `node_modules` da raiz do
  repositório, ou um import relativo para fora de `machine/` (`require("../../../tools/x.js")`),
  fica fora: um PR pode alterar esse arquivo, desligar o linter e passar com "catraca íntegra".
  É mais um motivo para o linter ser autocontido; se o seu não é, dê dono a esses arquivos no
  CODEOWNERS e trate mudança neles como mudança de linter.
- **Arquivo novo em `machine/` é violação da catraca**, nos dois diretórios, inclusive no do
  layout que o projeto não usa. O gate lista "linter novo: … (não existia na base; arquivo novo em
  machine/ exige revisão humana)" — ou, quando o arquivo pode sombrear um módulo que a base já
  tinha, o motivo da colisão. No GitHub o PR só passa com o override de quem é dono do caminho no
  CODEOWNERS da base; no GitLab o job fica vermelho. A única exceção é o **PR de adoção dos
  standards**: quando a branch de destino não tem nada em nenhum dos dois diretórios de
  standards, os linters que o PR traz são só nota (não há standard anterior a contornar, e o PR
  de adoção é revisado por inteiro). Quem decide se é adoção é o conteúdo da branch de destino,
  não o do PR: nos dois CIs a base do gate é a **ponta** dela. No GitLab sem *merged results
  pipelines* o job, quando roda, busca essa ponta e recusa (exit 3) o merge request que está
  atrás dela, então sair de um commit anterior aos standards não faz um merge request comum
  parecer adoção. O job não rejulga sozinho um merge request que passou antes de o destino
  andar (ver "O veredito não é refeito quando o destino muda depois do job", nos limites).
- **O gate lê o que está commitado.** Arquivo gerado durante o job (não versionado) não é
  lintado, e um arquivo do Git LFS é lintado como o ponteiro, não como o conteúdo.
- **Achados parecidos contam como um só.** A impressão digital ignora números e um sufixo final
  entre colchetes: `VARCHAR(255)` e `VARCHAR(50)` na mesma coluna do mesmo arquivo são o mesmo
  achado. Com várias ocorrências iguais no arquivo, o gate sabe **quantas** são novas, mas não
  **qual**; a linha mostrada é a das últimas ocorrências.
- **Com linter em protocolo legado, a catraca conta por arquivo, não por ocorrência.** O linter
  antigo imprime **uma** linha `VIOLATION: …` por arquivo, com a contagem dentro da mensagem
  ("3 uso(s) de …"). Como a impressão digital ignora números, 1 e 40 ocorrências no mesmo arquivo
  são a mesma entrada, com contagem 1: para esse standard, **violação nova em arquivo que já tem
  uma aceita não bloqueia**. O `baseline init` e o `check` avisam no stderr ("linter em protocolo
  legado…"), uma vez por standard que pode chegar a `block` e cujo linter legado devolveu algum
  achado naquela execução. O remédio é passar os linters de
  `machine/` para o protocolo v2 (`VIOLATION <regra> <arquivo>:<linha> <mensagem>`, uma linha por
  ocorrência) **antes** do `baseline init`; ver a "Nota de migração". Na ordem inversa (baseline
  criado com linters legados, e os linters trocados depois), a mensagem muda e **todas as
  impressões digitais desse standard mudam junto**: o que estava aceito volta como violação
  nova, as entradas antigas ficam órfãs e o gate acusa "linter alterado" no PR da troca. Esse PR
  só passa refazendo o aceite e com o override do dono (GitHub); no GitLab o job fica vermelho.
  Para refazer o aceite de uma vez, o operador roda `baseline reinit <std> --reason "…"` no
  terminal dele. Nessa troca específica, do protocolo antigo para o v2, as ocorrências por
  arquivo crescem (o antigo registrava uma por arquivo): o comando mostra cada caminho com o
  antes e o depois, mas não tem como separar esse crescimento de uma violação nova no mesmo
  arquivo. Quem aprova o override confere pelo diff do PR.

**O crédito do baseline e a branch de destino**

No CI (`gate --ci`), uma entrada do baseline só vale até o que a **branch de destino** ainda
produz. Quando o baseline dela tem entradas, o gate reconstrói a árvore dela num diretório
temporário e roda os linters **dela** sobre os arquivos que têm entrada no baseline. Se a entrada
aceita 3 ocorrências e a branch de destino tem 1, o crédito é 1. Sem isso, uma violação corrigida
e depois reintroduzida no mesmo arquivo passaria no crédito que sobrou. O que decorre daí:

- **Violação "nova" num arquivo que está no baseline.** O log do gate traz a nota "entrada(s)
  aceitam mais ocorrências do que a árvore da base produz (crédito sem lastro)" e o check lista
  a ocorrência como nova. É o caso acima: a ocorrência antiga foi corrigida, a entrada ficou, e
  o PR trouxe uma ocorrência igual. **O que fazer:** corrigir a ocorrência. Se ela é deliberada,
  veja o item seguinte.
- **Aceitar de novo por cima de crédito sem lastro pode pedir dois PRs.** Quando o total de
  ocorrências que o PR deixa no arquivo **não passa** da contagem antiga da entrada, no mesmo PR
  não há caminho: o `prune` reduz a contagem (não é aumento, então não há o que o dono aprovar)
  e o `accept` sobe a contagem acima do que a árvore tem (crédito pré-pago, que nem o override
  libera). **O que fazer:** um PR só com `baseline prune`, para a branch de destino ficar com o
  baseline igual ao que ela tem; depois o PR com a ocorrência, o `baseline accept` do operador e
  o override do dono. Quando o total **passa** da contagem antiga (a entrada aceitava 1, a branch
  de destino já não tem nenhuma e o PR traz 2), um PR só resolve: `accept` até o total e o
  override. A linha que o dono lê mostra o que ele está revalidando: "(1 → 2; a árvore da base
  produz 0)".
- **Linter com dependência que não está no git faz o gate sair 3 em todo PR.** A árvore da
  branch de destino é reconstruída só com o que está versionado; um linter que faça `require`
  de um pacote instalado (por `npm ci`, por exemplo) não carrega ali. A mensagem é "linters
  falharam na árvore da base (…): não dá para conferir o crédito do baseline". Acontece em todo
  PR, mesmo num que não toca em nada disso, enquanto o baseline da branch de destino tiver
  entradas. **O que fazer:** deixar o linter autocontido: copiar o que ele usa para dentro de
  `machine/` e importar por caminho relativo. Versionar a dependência só serve num `node_modules`
  dentro de um dos diretórios de standards, onde o gate a compara com a base e o CODEOWNERS
  gerado lhe dá dono (o PR que a acrescenta pede override). Nos `node_modules` sob `.context/`
  que o CODEOWNERS gerado não cobre (ele cobre também `.context/bin/`, mas o linter não acha
  pelo nome um pacote posto ali) o gate compara, mas o override fica sem aprovador e o gate
  fecha; no
  `node_modules` da raiz o linter carrega, mas a dependência fica fora da catraca. Confira isso
  **antes** de criar o baseline: depois, o PR que conserta o linter também sai 3 (o linter que
  falha é o da branch de destino) e cai no item seguinte.
- **Linter da branch de destino que falha num arquivo com entrada no baseline só se conserta
  com bypass.** Vale para o linter que quebra com o conteúdo de um arquivo e para o que não
  carrega por falta de dependência. O PR que conserta o linter (ou o arquivo) passa no check do
  HEAD, mas a análise da branch de destino falha do mesmo jeito e o gate sai 3. **O que fazer:**
  o conserto entra na branch de destino por um administrador, com bypass do check; daí em diante
  os PRs voltam a passar. Uma falha do linter num arquivo **sem** entrada no baseline não entra
  nessa análise: ali o PR que conserta passa normalmente.
- **A fase V local não faz essa conferência.** Sem `--ci` o gate não analisa a branch de
  destino, e usa o baseline da sua árvore: a fase V pode passar e o CI reprovar. **O que
  fazer:** se o PR mexe em arquivo que tem entrada no baseline, rode antes do push o mesmo
  comando do CI, `gate --base-ref=refs/remotes/origin/<alvo> --ci`, num checkout sem mudanças
  pendentes e atualizado com a branch de destino.
- **O gate custa mais.** Além dos arquivos do PR, ele analisa os arquivos da branch de destino
  que têm entrada no baseline. Num repositório de teste com 15% a 20% dos arquivos no baseline,
  o gate ficou de 16% a 28% mais lento. Baseline sem entradas não paga nada. **O que fazer:**
  podar o baseline; cada entrada a menos é um arquivo a menos nessa análise.

**Onde o motor falha de propósito (exit 3)**

- **Mais de ~10 mil ocorrências de um mesmo standard num único arquivo** estouram o limite de 1 MB
  de saída do linter. É erro, não "limpo". Corrija em massa, ejete e ajuste a regra, ou desligue
  o standard para esse caminho (`disable:` no `standards.local.yaml`, que é mudança da catraca).
- **Um linter com mais de 5 s** é interrompido e vira erro.
- **`core.autocrlf=true`** (padrão do Git for Windows) faz a árvore de trabalho divergir dos blobs
  do commit, e o `gate --ci` recusa. Rode o job num runner Linux ou use `core.autocrlf=false`.
- **Arquivo versionado com `\` no nome** não pode ser reconstruído com segurança e o `gate --ci`
  recusa.
- **A branch de destino andou** depois que o GitHub montou o merge do PR: o gate falha com "a base
  não é ancestral do HEAD" (exit 3) em vez de comparar com uma base velha. O remédio depende do
  workflow. No **workflow do cliente** (`devflow-standards.yml`), que faz checkout de
  `refs/pull/<N>/merge`, **rodar o job de novo** basta: o GitHub remonta o merge com a base nova.
  No **`test.yml` deste repositório**, o checkout é o commit de merge que o evento trouxe, fixo:
  rodar o job de novo repete o mesmo commit e o mesmo erro. Faça um **push novo na branch do PR**
  (ou atualize-a com a base) para o evento gerar um merge novo. O gate sempre usa a ponta
  recém-buscada da branch de destino, nunca o primeiro pai do merge, porque uma base
  possivelmente velha seria uma comparação mais fraca.
- **No GitLab, sem *merged results pipelines*, o merge request está atrás do destino:** o job
  para antes do gate, com exit 3 e "o merge request está atrás da branch de destino", pelo mesmo
  motivo. Rodar o job de novo repete o erro. Atualize a branch do merge request com a de destino
  (rebase ou merge), ou ligue *merged results pipelines*; ver "CI (a garantia)". O job também
  sai 3 quando não consegue buscar a branch de destino no `origin`, ou quando o nome dela chega
  malformado nas variáveis do pipeline.
- O custo do gate cresce com o tamanho do repositório (ele reconstrói o HEAD num diretório
  temporário e, quando o baseline da branch de destino tem entradas, a árvore dela também). Para
  repositórios muito grandes, aumente o timeout do job (o do plugin é de 20 minutos).

**Onde o projeto precisa estar**

- **A raiz do projeto é a raiz do repositório git.** O motor não sobe além do repositório e, fora
  de um repositório git, só olha o diretório de onde a sessão começou. Projeto sem git com a
  sessão num subdiretório, e submódulo cujo `.context` está no repositório pai, deixam de receber
  as normas e o conhecimento. Um `.context/.devflow.yaml` que seja link simbólico (típico de
  dotfiles) não é lido, e as versões de framework são tratadas como ausentes.
- **Projeto num subdiretório do repositório** (monorepo): os arquivos de CI assumem o projeto na
  raiz e a oferta não os gera; o job falha com "sem `.context/` na raiz" se for copiado à mão. O
  trecho do CODEOWNERS sai com o prefixo do subdiretório.
- **GitHub Enterprise Server** não é oferecido: o reconhecimento é só de `github.com`, e o
  override fala com a API pública do GitHub.
- **No GitLab**: sem override, sem aplicação de dono; o job fica vermelho e aceitar é decisão de
  quem pode fazer o merge com o job falhando. Vale para toda mudança da catraca, inclusive um
  linter novo ou atualizado em `machine/` e a atualização do plugin.
- **No GitLab, merge request vindo de fork: o job não é garantia.** Pela documentação do GitLab
  ("Merge request pipelines", seção "Use with forked projects"), o pipeline de um merge request
  que vem de fork é criado e roda **no projeto do fork**, com a configuração de CI, os recursos
  e as variáveis do fork. Ali o arquivo de CI é do fork e, por consequência, o `origin` do job
  também: a branch de destino que o job busca é a do fork, e nenhuma conferência dentro do job
  protege contra um fork que edite o próprio CI. A garantia só existe quando o pipeline roda **no projeto de
  destino**, disparado por um membro dele na aba *Pipelines* do merge request. Mesmo ali,
  segundo a mesma página, a configuração de CI usada é a da branch do fork: quem dispara revisa
  antes o que o merge request muda no CI. Nada disso foi exercitado num GitLab (ver "Não
  verificado em ambiente real").
- **No GitLab, o job do gate é um arquivo do projeto, e o gate não protege o próprio CI.**
  - *O que o código do plugin e o arquivo do job mostram.* O job mora em
    `.gitlab/ci/devflow-standards.yml` e só entra no pipeline pela linha `include:` do
    `.gitlab-ci.yml`. Para o gate os dois são arquivos comuns: mexer neles não é violação da
    catraca, o trecho de CODEOWNERS gerado não lhes dá dono e, no GitLab, o gate não aplica
    dono. Tudo o que o plugin confere acontece dentro do job, e o job confia nas variáveis que
    lê. Se o pipeline de um merge request for montado sem ele (sem o `include`, com o job
    redefinido ou desligado), nada do plugin roda e nada do plugin percebe. Se
    `CI_MERGE_REQUEST_TARGET_BRANCH_SHA` chegar apontando para um commit antigo que seja
    ancestral do HEAD, o job julga por esse commit.
  - *O que a documentação do GitLab diz, sem execução.* As variáveis predefinidas são as de
    menor precedência: uma variável de mesmo nome definida no YAML, ou nas variáveis do
    pipeline, do projeto, do grupo ou da instância, vence. Variável de pipeline nem precisa de
    YAML: quem tem papel de Developer pode defini-la ao rodar um pipeline e, desde o GitLab
    18.11, ao rodar o pipeline do merge request "with modified values" (recurso que pede
    `spec: inputs` no `.gitlab-ci.yml`); a documentação diz que essas variáveis "can override
    other defined variables, including predefined variables". Se isso valer para
    `CI_MERGE_REQUEST_TARGET_BRANCH_SHA`, quem roda o pipeline assim escolhe a base do job. O
    que limita esse caminho é a opção "Minimum role to use pipeline variables" do projeto: a
    documentação dá `maintainer` como padrão no Self-Managed e `no_one_allowed` nos projetos
    novos do GitLab.com, e avisa que a opção não alcança as variáveis definidas no YAML. O
    arquivo trazido por `include: local` vem do mesmo repositório e da mesma branch do arquivo
    que o inclui, e um job de mesmo nome no `.gitlab-ci.yml` se sobrepõe ao do arquivo
    incluído.
  - *O que não foi conferido.* Se o pipeline de um merge request do próprio projeto usa o
    `.gitlab-ci.yml` da branch do merge request, e se "Pipelines must succeed" aceita um
    pipeline em que o job não existe. Se for assim, tudo isso fica ao alcance de um merge
    request comum. Ver "Não verificado em ambiente real".
  - *O que fazer enquanto isso não é conferido.* Só conte com o job como garantia se a
    configuração de CI estiver fora do alcance de quem abre o merge request, revise todo
    merge request que toque em `.gitlab-ci.yml` ou em `.gitlab/ci/`, e deixe "Minimum role to
    use pipeline variables" em `maintainer` ou mais restrito. A documentação do GitLab
    descreve um jeito de tirá-la desse alcance: manter o arquivo de configuração de CI em outro
    projeto, com permissões próprias. Esse arranjo não foi exercitado com este job, e a oferta
    do plugin não o monta: nele, pela mesma documentação, o `include: local` é resolvido no
    projeto onde está o arquivo de configuração, não no seu.

## FAQ

**"O hook bloqueou algo legítimo."** Primeiro confira se é mesmo a violação de uma norma do
projeto. Se for um falso positivo ou uma exceção deliberada, **peça ao operador** que rode
`baseline accept <fp> --reason "…"` no terminal dele (o `fp` aparece em `check --json`), ou que
rebaixe o nível com `enforce`. O agente não deve tentar contornar: três bloqueios iguais seguidos
já mandam parar e perguntar.

**"O pre-commit falhou com exit 3."** Exit 3 não é violação, é erro de execução: o shim não achou
o plugin, o baseline está inválido, ou um linter quebrou. Leia a mensagem (ela diz qual) e
corrija a causa. Reinstalar o plugin ou apontar `DEVFLOW_PLUGIN_ROOT` resolve o primeiro caso.

**"O linter falhou" / "exit 3 no CI".** O linter saiu fora do contrato (exit 1 sem imprimir
`VIOLATION`, exit diferente de 0 e 1, sinal, saída acima de 1 MB). Rode o mesmo arquivo localmente
com `check <arquivo>`; para um linter de projeto, confira se ele depende de algo que o job não
tem (pacote npm, arquivo gerado). Se a mensagem é "linters falharam na árvore da base", o
linter que falhou é o da branch de destino, sobre os arquivos dela: veja "O crédito do baseline
e a branch de destino", nos limites (linter com dependência fora do git, ou linter quebrado na
branch de destino).

**"O gate acusou violação nova num arquivo que está no baseline."** A entrada existe, mas a
branch de destino já não tem a ocorrência que ela aceitava (alguém corrigiu e não rodou
`baseline prune`), e o seu PR trouxe uma ocorrência igual. O log do gate traz a nota "crédito
sem lastro". Corrija a ocorrência; se ela é deliberada, o caminho são dois PRs (ver o mesmo
item dos limites).

**"O gate disse 'catraca enfraquecida' e eu não mexi nela."** O gate compara com a branch de
destino atual. Veja a lista que ele imprime por classe (std, versões, linter, shim, verify,
link, baseline). Um merge com a branch de destino que traz mudanças da catraca, ou um baseline
regravado, aparece ali. O caso mais comum é o da pergunta seguinte.

**"Atualizei o plugin e o PR da atualização saiu vermelho."** É esperado. O
`/devflow:devflow-sync` regrava no projeto os linters default materializados
(`machine/<id>.js`, os que você não editou) e oferece a cópia nova do shim
(`.context/bin/devflow-standards.mjs`). Para o gate, linter e shim são arquivos da catraca: o PR
sai com "linter alterado" e "shim alterado" sem que ninguém tenha afrouxado nada, porque o gate
não distingue a cópia fiel de uma versão nova do plugin de uma edição feita à mão. Quando a
versão nova traz um linter que o projeto ainda não tinha, o PR sai também com "linter novo":
arquivo novo em `machine/` é mudança da catraca do mesmo jeito. O que o time faz nesse dia:

- **Um PR só para a atualização** (o que o sync regravou e o pin `.context/bin/devflow-plugin.ref`),
  sem código junto, para o diff revisado ser só o do plugin.
- **GitHub:** o dono das normas confere que os arquivos são os do plugin na versão nova e libera
  pelo override: rótulo `standards-ratchet-approved` e review `APPROVED` no último commit (ver
  "Liberar um enfraquecimento deliberado"). Com um dono só, que também é o autor do PR, vale o
  que está em "Dono único que também é o autor": outro dono ou bypass de admin.
- **GitLab:** não há override. O job fica vermelho, e o merge da atualização é decisão de quem
  pode fazer o merge com o job falhando, depois de conferir o mesmo diff.
- Se a versão nova mudou a **mensagem** de um linter de um standard que o projeto promoveu a
  `block`, as impressões digitais desse standard mudam e o que estava no baseline volta como
  violação nova: é o mesmo efeito descrito em "Com linter em protocolo legado…", nos limites.

Combine a atualização com o time antes: sem esse aviso, o primeiro PR vermelho "sem motivo"
ensina a ignorar o gate.

**"Quero subir uma norma de `warn` para `block` num projeto que já existe."** Veja a nota de
migração abaixo.

**"Como vejo quais normas valem para este arquivo?"** `explain <arquivo>`.

## Não verificado em ambiente real

A verificação foi feita com fixtures, simulações e repositórios temporários. **Nada abaixo rodou
num GitHub ou GitLab de verdade**, e vale validar na primeira adoção:

- **GitHub:** o checkout da referência de merge do PR com histórico completo materializa
  `refs/remotes/origin/<alvo>`? (No pior caso o gate sai com exit 3 e fecha.) A semântica do
  CODEOWNERS no subconjunto de padrões descrito acima, os campos dos reviews e dos eventos de
  rótulo que o gate lê da API (`commit_id`, data do envio, ação feita por GitHub App) e o
  comportamento do rename de rótulo foram escritos a partir da documentação, não de uma execução.
- **Base que andou:** o comportamento descrito em "A branch de destino andou" (o `test.yml`, com
  checkout fixo do commit de merge, falha de novo ao reexecutar; o workflow do cliente remonta o
  merge) vem da leitura dos workflows e da documentação do GitHub, não de uma execução.
- **Dono único como autor:** que o GitHub não conta a aprovação do autor do PR com "Require review
  from Code Owners" é comportamento da plataforma, também não verificado aqui.
- **GitLab:** o job inteiro (merge request com e sem *merged results pipelines*). Os nomes e o
  comportamento das variáveis do pipeline vêm da documentação do GitLab, não de uma execução:
  `CI_MERGE_REQUEST_TARGET_BRANCH_SHA` só vem preenchida em *merged results pipelines*, e
  `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` traz o nome da branch de destino. Também não foi
  exercitado num GitLab: se o `git fetch origin refs/heads/<destino>` do job funciona com a
  credencial que o runner deixa no clone, e o pipeline comum que o GitLab roda quando há conflito
  com *merged results* ligadas (no pior caso desses dois o job sai com exit 3 e fecha).
- **GitLab, merge request vindo de fork:** que o pipeline roda no projeto do fork, com a
  configuração de CI do fork, e que um membro do projeto de destino pode rodá-lo no projeto de
  destino, é o que a documentação do GitLab diz. Que o `origin` do job aponta para o fork é
  consequência de o pipeline rodar lá, não uma frase dela. Nenhum dos dois casos foi exercitado.
  Ver "No GitLab, merge request vindo de fork", nos limites.
- **GitLab, de onde vem a configuração de CI do merge request:** nada disto foi exercitado num
  GitLab. Vem da documentação do GitLab: a precedência das variáveis ("CI/CD variable
  precedence", com as predefinidas por último); que `include: local` traz o arquivo do mesmo
  repositório e da mesma branch do arquivo que o inclui, e que um job de mesmo nome no
  `.gitlab-ci.yml` se sobrepõe ao incluído; e que o arquivo de configuração de CI pode ficar em
  outro projeto ("Specify a custom CI/CD configuration file"), o que ela descreve como forma de
  impedir que desenvolvedores o alterem. **Não foi conferido**, nem na parte de CI/CD dessa
  documentação, a única consultada: (1) se o pipeline de um merge request do próprio projeto usa
  o `.gitlab-ci.yml` da branch do merge request — ela diz que esses pipelines rodam sobre o
  conteúdo da branch de origem, e a forma de proteção acima indica que sim, mas a frase não
  está lá; (2) se "Pipelines must succeed" aceita um pipeline em que o job `devflow-standards`
  não existe — ela descreve a opção como exigir um pipeline bem-sucedido, e não se achou forma
  de exigir um job (a página da própria opção não foi consultada); (3) em que planos do GitLab
  existem os recursos que tiram a configuração de CI do alcance do merge request. Se (1) e (2)
  se confirmarem, um merge request comum tira o gate do próprio pipeline. Ver "No GitLab, o job
  do gate é um arquivo do projeto", nos limites.
- **GitLab, se o job chega a rodar e qual resultado vale:** três pontos que vêm da documentação
  do GitLab e não foram exercitados. (1) Em "Configure merge request pipelines" ela diz: "Rules
  defined in `include:` (for example, with `include:component`) do not satisfy this
  requirement. You must define matching `rules:` or `workflow: rules` directly in
  `.gitlab-ci.yml`." A frase é ambígua: pode falar das regras postas na própria entrada do
  `include:`, ou das regras de jobs que vêm de arquivos incluídos, que é o caso do job do gate.
  A mesma documentação diz que os arquivos incluídos são mesclados à configuração, e o
  exemplo dela em "Avoid duplicate pipelines" mostra um job com regra de merge request criando
  o pipeline, mas com a regra no próprio `.gitlab-ci.yml`. Não foi conferido se o job do gate,
  sozinho, faz o GitLab criar o pipeline de merge request. (2) A execução do pipeline do merge
  request com variáveis de pipeline, por quem tem papel de Developer, e se ela troca
  `CI_MERGE_REQUEST_TARGET_BRANCH_SHA`. (3) A condição de corrida de "Pipelines must succeed"
  quando há pipeline de branch e pipeline de merge request no mesmo merge request. Ver "No
  GitLab, confira que o job roda", em "Como ligar as camadas", e "No GitLab, o job do gate é um
  arquivo do projeto", nos limites.
- **Resultado antigo depois que o destino muda (GitHub e GitLab):** não foi conferido se um
  resultado verde do gate continua valendo para o merge depois que a branch de destino anda,
  ou depois que o destino do PR ou merge request é trocado; nem se a troca de destino dispara
  uma execução nova. Também não foi conferido que exigir a branch em dia com o destino
  ("Require branches to be up to date before merging" no GitHub; fast-forward ou histórico
  semilinear no GitLab) fecha os dois casos. Da documentação do GitLab, sem execução: com
  *merge trains* (planos Premium e Ultimate) cada merge request só entra depois que passa um
  pipeline sobre o merge dele com o destino. Ver "O veredito não é refeito quando o destino
  muda depois do job", nos limites.
- **Sessão real do Claude Code** para os pedidos de confirmação (`ask`) da catraca, e **macOS e
  Windows**; o omp (oh-my-pi) tem a mesma lógica de bloqueio, mas não foi exercitado numa sessão
  real.
- **omp, subagent em worktree isolada:** no omp os hooks de lint usam o diretório da **sessão**
  como raiz do projeto. Se o diretório de sessão de um subagent que roda em worktree isolada
  for o do repositório principal, e não o da worktree, as edições dele na worktree não são
  analisadas (ou são analisadas com o caminho errado, quando a worktree fica dentro do
  repositório). Qual diretório o subagent recebe não foi verificado numa sessão real do omp.
- **Node 20:** o job do repositório do plugin usa Node 20 e o do cliente usa Node 22. O gate usa
  só `node:*`; a única API de versão recente é `import.meta.dirname`, que existe desde o Node
  20.11.
- **O pin só funciona a partir de uma release que traga o `gate`.** Enquanto a primeira release
  com o enforcement não for publicada, o job do cliente não tem versão válida para fixar.

## Nota de migração

Para quem já usa o DevFlow e está atualizando o plugin:

1. **O que muda na atualização.** Os standards que vêm do plugin chegam como `warn`: não
   bloqueiam em lugar nenhum. Os standards do projeto que declaram `source: local` já valem
   **`block`** por default (é o que `standards new` gera), e isso passa a ter efeito. Onde
   bloqueia: o **pre-commit** (`check --staged`), o **CI** (`gate`) e a **fase V**, que saem com
   exit 1 mesmo sem baseline, porque sem baseline toda ocorrência é nova. Onde **não** bloqueia:
   o **hook de edição**, que sem baseline só avisa. Além disso, com algum standard que pode
   chegar a `block`, a fase V exige `verify.standards` e bloqueia sem ele. Se você tem
   standards `source: local` com violações antigas, rode o `baseline init` (passo 5) antes de
   ligar pre-commit, CI ou `verify:`.
2. **Veja o que existe:** `explain` num arquivo típico mostra as normas e o nível de cada uma.
3. **Escolha o que sobe para `block`.** Para um standard do plugin: `eject <std> --with-linter` e depois
   `enforce <std> --level block`. Os standards que o projeto escreveu e que declaram `source: local`
   passam a valer **`block`** por default; se algum não deve bloquear, declare
   `enforcement.level: warn` nele. Com o gate já ligado na branch de destino, o linter que o
   `eject --with-linter` grava é arquivo novo em `machine/`: o PR pede o override do dono, e
   esse dono tem de constar no CODEOWNERS que **já está** na branch de destino (ver
   "CODEOWNERS", em "Como ligar as camadas": o CODEOWNERS entra num PR anterior).
4. **Passe os linters de `machine/` para o protocolo v2 antes do baseline.** O linter antigo
   imprime uma linha `VIOLATION: …` por arquivo; o v2 imprime
   `VIOLATION <regra> <arquivo>:<linha> <mensagem>`, uma linha por ocorrência. Com o legado a
   catraca daquele standard conta por arquivo (ver "Limites"). Os linters default que o sync
   materializou se atualizam no próximo `/devflow:devflow-sync`, se você não os editou. Um
   linter trazido com `eject --with-linter` numa versão antiga do plugin é cópia do projeto:
   traga a nova com `eject <std> --with-linter --force` (sobrescreve também o `.md` do
   standard: guarde suas edições antes) ou copie só o `machine/std-<id>.js` do plugin. Os que
   o projeto escreveu precisam ser reescritos. Para saber quais faltam, rode `check --all`: ele
   avisa "linter em protocolo legado" quando um linter legado, de um standard que pode chegar a
   `block`, devolve algum achado naquela execução. Um linter legado que não achou nada não
   aparece no aviso: confira também o formato da linha `VIOLATION` no próprio arquivo. **A ordem
   importa:** trocar o linter depois do `baseline init` muda todas as impressões digitais do
   standard, tudo o que estava aceito volta como violação nova e o gate acusa "linter
   alterado". Se o baseline já existe, refaça o aceite daquele standard com
   `baseline reinit <std> --reason "…"` no seu terminal e leve o baseline no mesmo PR da troca
   do linter; o PR continua precisando do override do dono.
5. **Registre o legado:** `baseline init` no seu terminal, revise o diff e commite. A partir
   daí só a violação nova bloqueia.
6. **Ligue as camadas** na ordem de "Como ligar" (pre-commit, CI, `verify:`, CODEOWNERS) e peça ao
   operador as duas configurações de repositório.

Mudanças de comportamento que podem surpreender:

- **`standards.local.yaml` com fim de linha CRLF** e `disable:` em bloco agora desativa de fato os
  standards listados. Antes o arquivo era ignorado por um defeito de leitura. Se o seu arquivo
  tem `disable:` e CRLF, o enforcement desses standards **cai** na atualização, sem você ter
  editado nada: confira a lista.
- **Linha de achado sem `ruleId`:** os linters antigos que imprimem `VIOLATION: …` continuam
  aceitos; o `ruleId` vira o id do standard sem `std-`. Aceitos, mas com a catraca por arquivo
  (passo 4).
- **Atualizar o plugin deixa o PR da atualização vermelho.** Daqui em diante, cada atualização
  que regrave um linter default materializado ou o shim, ou que traga um linter **novo**, conta,
  para o gate, como mudança na catraca: no GitHub o PR precisa do override do dono; no GitLab não
  há override. Veja no FAQ "Atualizei o plugin e o PR da atualização saiu vermelho".
- **Fase V:** com algum standard que pode chegar a `block`, a fase V passa a exigir
  `verify.standards`. Sem ele, ela bloqueia em vez de seguir com aviso.
- **Layout antigo `.context/standards/`:** o motor e o gate ainda leem, e o trecho de CODEOWNERS
  gerado dá dono aos dois layouts. Um CODEOWNERS montado antes dessa regra só cobre o atual:
  acrescente `/.context/standards/`, ou migre com `/devflow update migration`.
- **O pin do CI (`devflow-plugin.ref`) só funciona a partir da release que contiver o gate.**

# Checkup de início de dia do DevFlow — Design

**Data:** 2026-09-01
**Workflow PREVC:** `daily-devflow-checkup` | **Escala:** MEDIUM | **Fase:** P
**Status:** Aprovado (design)

---

## 1. Problema

O DevFlow passou a ser habilitado em **escopo de projeto** (PR #97, commit `1d2ec0e`): o
`.claude/settings.json` versionado declara `enabledPlugins` e `extraKnownMarketplaces`, e o
`~/.claude/settings.json` da máquina deixou de carregar o plugin globalmente. Isso é correto,
mas cria uma classe nova de falha: **um mantenedor pode clonar o repositório sem ter os plugins
que o projeto declara** — ou tê-los em versão atrasada, ou habilitados no escopo errado.

Hoje nada detecta isso:

- O `doctor` tem 9 checks (`mcp-config-valid`, `mcp-connectivity`, `mempalace-health`,
  `devflow-config`, `git-hooks`, `grounding-mcp`, `permissions-health`, `adr-injection`,
  `harness-sensors`) e **nenhum** olha o estado de instalação, escopo ou versão de plugin.
- A routine `context-maintenance` (7 dias, roda `/devflow:devflow-doctor`) **nunca executou**.
  Evidência: criada em 2026-07-22 (commit `0d46a69`), nasceu com `lastRun: null` e continua
  `null` em 2026-09-01. O único campo que mudou foi `lastSuggested` (2026-07-22 → 2026-09-01).
  São 41 dias de sugestão reaparecendo e zero execuções.

A causa da segunda falha é estrutural e vale para qualquer coisa que construamos em cima do
mesmo mecanismo: **o hook apenas sugere**, e a execução depende de um humano digitar
`/devflow:devflow-routines run <id>` no momento em que abriu a sessão para fazer outra coisa.
Manutenção sugerida compete com a tarefa real do usuário e perde sempre.

Um terceiro defeito aparece quando a cadência encurta. O estado de execução das routines
(`lastRun`, `nextRun`, `lastSuggested`, `snoozeUntil`) mora em `.context/routines.json`, que é
**versionado**. Numa cadência de 7 dias isso passa despercebido; numa cadência **diária e
multi-máquina** ele quebra: a máquina A marcar "sugerido hoje" silencia a máquina B no mesmo
dia, e toda sessão suja o working tree com um diff de estado.

## 2. Objetivo

Na primeira sessão do dia em cada máquina, verificar automaticamente que o ambiente de plugins
daquela máquina corresponde ao que o projeto declara — incluindo se os plugins estão
atualizados — reportando apenas quando houver divergência. A **definição** do checkup viaja no
repositório (replica entre dispositivos via clone/pull); o **estado de execução** é por máquina.

## 3. Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | "Nuvem" = o repositório git. A definição do checkup é versionada; o estado de execução é local | O `.claude/settings.json` versionado já é a declaração que replica entre dispositivos. Não há formato novo a inventar |
| D2 | O hook **executa** os checks; não sugere | Sugerir tem resultado medido: 0 execuções em 41 dias |
| D3 | Silencioso quando está tudo certo, exceto no bootstrap | Um bloco diário verde vira ruído ignorável — o mesmo mecanismo que matou a sugestão semanal |
| D4 | Gatilho duplo: bootstrap no primeiro contato pós-clone + re-check diário | "Está atualizado?" só se responde com recorrência: versão de plugin muda com o tempo. Um check único no clone é verdadeiro no dia do clone e falso depois |
| D5 | "Atualizado" cobre **todos** os plugins declarados no projeto, não só o devflow | Definição do usuário |
| D6 | O schema de routines ganha passos executáveis por código (`type: check`) | Passo que é código o hook roda sozinho; passo que é comando/skill precisa de LLM e só pode ser sugerido. Sem essa distinção tudo vira sugestão |
| D7 | O checkup nunca age: não instala, não atualiza, não escreve fora de `.context/runtime/` | `/devflow update` tem efeito colateral conhecido (Step 4d reverte standards quando o repo standalone não foi sincronizado antes). Detectar e apontar o comando é seguro; executar não é |
| D8 | Os 4 checks vivem no `doctor.mjs` | O doctor é o lugar de checks de saúde e hoje tem a lacuna. `/devflow:devflow-doctor` ganha a cobertura de plugin de graça; o checkup diário chama um subconjunto |
| D11 | Instalação e habilitação de plugin são **eixos independentes**; não existe "a instalação deste projeto" | Medido na fase R: este repositório declara `devflow@NEXUZ-SYS` em `.claude/settings.json`, tem **zero** entradas de `installed_plugins.json` com o seu `projectPath`, uma entrada `scope: "user"` (3.1.0) e 17 `scope: "project"` de outros projetos — e a sessão roda 3.1.0. O plugin é instalado globalmente e habilitado por projeto, que é o desenho do PR #97. Procurar a entrada "deste projeto" produziria FAIL falso |
| D14 | Cada rotina declara **como** executa, num campo único `execution: auto\|confirm\|model` | Nem toda rotina pode rodar sozinha, e a diferença não é adivinhável: o `daily-devflow-checkup` lê JSON em milissegundos, enquanto `/devflow:devflow-doctor` leva **16,5 s medidos** e o `/devflow update` muta o ambiente. Um campo único, e não dois booleanos (`autoRun` + `requiresConfirmation`), porque dois permitem o estado contraditório `autoRun: true` com `requiresConfirmation: true` |
| D15 | O doctor completo **nunca** roda automaticamente; a verificação barata o **propõe** | `scripts/doctor.mjs --json` leva 16,5 s — 330× o orçamento do checkup. O que roda sozinho são os checks in-process (~1 ms); quando algum acusa FAIL ou WARN, o resultado inclui a proposta de rodar o doctor completo, e a decisão é do usuário. Diagnóstico barato contínuo, diagnóstico caro sob consentimento |
| D16 | `shouldRun` é separado de `shouldSuggest` | `shouldSuggest` carrega a guarda de 1×/dia (`lastSuggested === today`), correta para *surfacing* e errada para *execução*. Sem a separação, o bloco de routines marca a sugestão e o executor que rodar depois recebe lista vazia — o checkup nunca executaria. Origem: plano `2026-09-01-devflow-routines-auto-execution.md` |
| D13 | A "versão publicada" tem **três** formas, todas resolvidas offline | Medido na fase R: só o `NEXUZ-SYS` declara `version` no `marketplace.json`. O `understand-anything` traz `source: "./..."` e a versão vive no `plugin.json` interno do clone. O `claude-plugins-official` traz `source: {url, sha}` — o superpowers mora num repo de terceiro e o marketplace só ancora um commit. Sem as três formas, o check cobriria **um** dos três plugins deste projeto, contra o que D5 exige. No caso do `sha`, divergência é o que se pode provar; qual lado é mais novo exigiria rede, então o diagnóstico diz "divergente", nunca "desatualizado" |
| D12 | "Atualizado" compara a **maior** versão instalada contra a publicada | São 18 entradas, de 1.10.0 a 3.1.0, e qual delas o Claude Code resolve não é observável a partir dos arquivos. A pergunta prática — "preciso rodar `/devflow update`?" — se responde pela mais alta: se a máquina já tem a versão publicada em algum lugar, não há o que baixar, e entradas antigas de outros projetos deixam de virar WARN de ruído |
| D10 | Um 5º check cobre o MemPalace, e o palace remoto vira spec separada | Num dispositivo novo o MemPalace ausente significa nenhuma memória de longo prazo, e hoje o `mempalace-health` devolve **OK** nesse caso ("não instalado — nada a checar"): verde sobre a ausência total. Um palace por projeto **não** resolve — é ChromaDB+SQLite binário (433 MB, 25.538 drawers na máquina atual), não versionável, logo não vem no clone. O que resolve é `mempalace serve` (palace remoto compartilhado), que envolve infra, auth e custo e merece a própria spec |
| D9 | `SKIP` vira o 4º status do doctor, ao lado de OK/WARN/FAIL | "Não consigo verificar aqui" não é nenhum dos três. Reportar OK seria confiança falsa (diria "plugins verificados" sem ter verificado nada); reportar WARN encheria CI e container de 4 avisos permanentes que se aprende a ignorar; omitir o check esconderia que quatro verificações deixaram de acontecer |

## 4. Arquitetura

### 4.1 `scripts/lib/plugin-env.mjs` (novo)

Leitor puro do ambiente de plugins, sem efeitos colaterais. Consolida cinco fontes:

| Fonte | Responde |
|---|---|
| `<projeto>/.claude/settings.json` | quais plugins o projeto **exige** (`enabledPlugins`) e de quais marketplaces (`extraKnownMarketplaces`) |
| `~/.claude/settings.json` | quais plugins estão habilitados em **escopo user** na máquina |
| `~/.claude/plugins/installed_plugins.json` | o que está instalado: mapa `"<plugin>@<marketplace>" → [{scope, projectPath, installPath, version, installedAt, lastUpdated, gitCommitSha}]` (schema `version: 2`) |
| `~/.claude/plugins/known_marketplaces.json` | marketplaces registrados e o `lastUpdated` de cada catálogo |
| `~/.claude/plugins/marketplaces/<mkt>/.claude-plugin/marketplace.json` | a versão **publicada** de cada plugin daquele marketplace |

Retorna `{ declared, installed, marketplaces, harness }`. Todas as leituras são de arquivo:
nenhuma rede, nenhum `exec`, nenhum processo filho.

**Degradação:** o DevFlow é um plugin e roda fora do Claude Code (omp, OpenCode, CI, container).
Quando `~/.claude/plugins/` não existe, retorna `harness: "other"` e todo check derivado vira
**SKIP** — nunca FAIL. Ausência do diretório do Claude Code não é defeito do projeto.

### 4.2 Quatro checks em `scripts/lib/doctor.mjs`

Entram no array `CHECKS` exportado, seguindo a forma existente (`{ id, title, severity,
destructive, run(ctx) }`) e consumindo `plugin-env.mjs`.

| id | Detecta | Severidade | Reparo apontado |
|---|---|---|---|
| `plugin-declared-installed` | plugin em `enabledPlugins` do projeto ausente nesta máquina | **FAIL** | comando de instalação do marketplace declarado |
| `plugin-scope` | plugin do projeto habilitado em escopo **user** | WARN | remover a entrada de `~/.claude/settings.json` (o que o PR #97 fez) |
| `plugin-marketplace-known` | marketplace referenciado por `enabledPlugins` não registrado em `known_marketplaces.json` | **FAIL** | registrar o marketplace declarado em `extraKnownMarketplaces` |
| `plugin-up-to-date` | versão instalada atrás da publicada, para **cada** plugin declarado; e catálogo obsoleto — `known_marketplaces[mkt].lastUpdated` com mais de **7 dias** | WARN | `/devflow update` |
| `mempalace-env` | `.devflow.yaml` declara `mempalace.enabled: true` mas o binário não está no PATH, ou o `palace_path` do `~/.mempalace/config.json` não existe | **FAIL** | instalar o MemPalace / `mempalace init` |

**Escopo do `mempalace-env` (D10).** O check é barato de propósito: `which` mais a leitura de
`~/.mempalace/config.json` e um `existsSync` no `palace_path` — cerca de 1 ms. Ele **não** conta
drawers nem valida a wing do projeto: isso exige `mempalace status`, medido em ~600 ms nesta
máquina, doze vezes o orçamento inteiro do checkup. Essa verificação continua no
`mempalace-health`, sob demanda via `/devflow:devflow-doctor`.

O check também reporta **qual** palace está em uso (global `~/.mempalace/palace` ou outro caminho),
porque a escolha é invisível hoje e determina se a memória é compartilhada entre projetos.

**Impacto no CLI do doctor (D9).** `scripts/doctor.mjs` hoje conhece três status: `ICON`
(linha 43) e `counts` (linha 61) não têm `SKIP`, de modo que um check devolvendo esse status
hoje imprimiria `undefined [SKIP]` e faria `counts[r.status]++` produzir `NaN`. A entrega
acrescenta `SKIP` ao ícone, aos contadores e ao resumo final, e ao `--json`. `SKIP` **não**
afeta o exit code — só `FAIL` continua fazendo o doctor sair com 1; um ambiente onde a
verificação não se aplica não é um ambiente reprovado.

`plugin-up-to-date` compara duas coisas distintas e reporta cada uma com sua própria frase:
a versão instalada contra a publicada no catálogo local, e o frescor do próprio catálogo.
Afirmar "está atualizado" com base num catálogo de 40 dias atrás é uma afirmação sem lastro —
quando o catálogo passa de 7 dias o check diz isso, em vez de dar OK. O limiar é 7 dias porque é
a cadência em que o catálogo local costuma ser atualizado por um `/devflow update`; abaixo disso
o alerta seria ruído.

### 4.3 Agendamento: routine com passo executável

O schema de `.context/routines.json` ganha um terceiro tipo de passo, ao lado de `command` e
`skill`:

```json
{ "type": "check", "value": "plugin-env" }
```

O `value` nomeia um **grupo** de checks do doctor, resolvido por uma tabela fixa no plugin
(`plugin-env` → os quatro checks da seção 4.2). Um grupo, e não a lista de ids, para que
acrescentar um check no futuro não exija editar o `routines.json` de cada projeto. Passos
`check` são executados **direto pelo hook**, via node, sem LLM.
Passos `command` e `skill` continuam apenas sendo sugeridos, como hoje — eles precisam do LLM
para rodar, e essa é exatamente a diferença entre um passo que executa e um que morre sugerindo.

### Classes de execução (D14)

| `execution` | Quem executa | Quando |
|---|---|---|
| `auto` | o hook, em node, sem LLM | sozinha, na data agendada |
| `confirm` | o usuário decide | na data agendada o sistema **pergunta**; nunca roda sozinho |
| `model` | o LLM (skill/agent/comando sem script) | quando o usuário manda rodar |

Ausente, o campo é derivado: todos os passos `check` → `auto`; qualquer outra coisa → `confirm`.
Retrocompatível — um `routines.json` já em campo não muda de comportamento sem ganhar o campo.

As duas routines versionadas:

```json
{
  "id": "daily-devflow-checkup",
  "description": "Verifica o ambiente de plugins e o MemPalace da máquina contra o que o projeto declara",
  "enabled": true,
  "frequency": "1d",
  "execution": "auto",
  "prompts": [
    { "type": "check", "value": "plugin-env" },
    { "type": "check", "value": "mempalace-env" }
  ]
},
{
  "id": "context-maintenance",
  "description": "Health-check completo do contexto DevFlow a cada 7 dias",
  "enabled": true,
  "frequency": "7d",
  "execution": "confirm",
  "prompts": [{ "type": "command", "value": "/devflow:devflow-doctor" }]
}
```

### O doctor é proposto, nunca imposto (D15)

`scripts/doctor.mjs --json` leva **16,5 s** (medido). Rodá-lo no início de toda sessão seria 330×
o orçamento do checkup. Por isso o fluxo é invertido: a verificação barata roda sempre e, **quando
acusa FAIL ou WARN**, o bloco emitido inclui a proposta de rodar o diagnóstico completo — e o
usuário decide. A rotina `context-maintenance`, ao vencer, também é proposta em vez de executada.

Diagnóstico barato é contínuo; diagnóstico caro é sob consentimento.

### Dois predicados (D16)

`shouldSuggest` carrega a guarda de 1×/dia, própria de *surfacing*. `shouldRun` — `enabled`,
`nextRun` e `snooze`, **sem** a guarda — é o predicado de *execução*. Sem a separação, o bloco de
routines marcaria a sugestão e o executor receberia lista vazia: o checkup nunca rodaria. Como
efeito colateral, corrige-se um defeito latente já presente — `dueRoutines`
(`scripts/lib/routines.mjs:75`) não checa `snoozeUntil`, então uma rotina adiada pelo usuário
aparece como vencida no `list`.

## 5. Separação de estado

| Arquivo | Git | Conteúdo |
|---|---|---|
| `.context/routines.json` | **versionado** | apenas definição: `id`, `description`, `enabled`, `frequency`, `prompts` |
| `.context/runtime/routines-state.json` | **gitignored** | apenas estado, por máquina: `{ "<id>": { lastRun, nextRun, lastSuggested, snoozeUntil } }` |

`.context/runtime/` já consta no `.gitignore` sob "DevFlow runtime artifacts (auto-generated)" —
nada a acrescentar ali.

Três consequências, todas resolvendo defeitos reais:

1. cada máquina tem o seu próprio "hoje" — a máquina A deixa de silenciar a B;
2. o working tree para de acumular diff de estado a cada sessão;
3. **a ausência do arquivo de estado é o sinal de clone novo.** O gatilho de bootstrap sai de
   graça da própria separação, sem flag nem heurística adicional.

**Migração.** `loadRoutines` detecta o formato antigo (campos de estado presentes no arquivo
versionado), move-os para o estado local na primeira leitura e passa a ignorá-los na definição.
A routine `context-maintenance` continua funcionando com o histórico que tem. A migração reescreve o arquivo versionado **uma única vez**, para remover
dali os campos de estado — esse diff é a própria correção e deve ser commitado. A partir daí é
idempotente: um `routines.json` já no formato novo não é reescrito.

## 6. Comportamento no session-start

| Situação | Estado local | Saída |
|---|---|---|
| Bootstrap (pós-clone), tudo OK | ausente | `Ambiente OK, plugins verificados e todos atualizados` + lista de plugins e versões |
| Bootstrap, com divergência | ausente | diagnóstico + comando exato de correção |
| Dia novo, tudo OK | anterior a hoje | **silêncio**; apenas grava o carimbo |
| Dia novo, com divergência | anterior a hoje | diagnóstico + comando |
| Mesmo dia | igual a hoje | não executa nada |
| Qualquer situação, ambiente sem `~/.claude/plugins` | irrelevante | **silêncio** — os checks retornam SKIP e nada é emitido |

O bloco emitido é `<DEVFLOW_ENV_CHECKUP>`, seguindo o padrão dos demais blocos do hook
(`escape_for_json`, conteúdo como dado apresentável, não como instrução).

### Regras invioláveis

- **Nunca age.** Não executa `/devflow update`, não instala plugin, não escreve fora de
  `.context/runtime/`. Lê e reporta (D7).
- **Fail-open.** JSON corrompido, permissão negada, `node` ausente, `HOME` não resolvível →
  silêncio e `exit 0`. O checkup jamais trava uma sessão. Segue o padrão `|| true` já usado no
  hook, e a lição do falso positivo do guard de branch protection: um checkup de ambiente que
  bloqueia trabalho por engano custa mais do que o problema que detecta.
- **Orçamento:** no máximo cinco leituras de JSON, zero rede, zero `exec`. Alvo abaixo de 50 ms.

## 7. Testes

Quatro suítes, todas RED antes de qualquer implementação.

1. **`tests/validation/test-plugin-env.mjs`** — `HOME` sintético em diretório temporário:
   declarado e instalado · declarado e ausente · habilitado em escopo user · marketplace não
   registrado · versão instalada atrás da publicada · catálogo obsoleto · `~/.claude/plugins`
   inexistente (→ `harness: "other"`).
2. **`tests/validation/test-doctor-plugin-checks.mjs`** — os 4 checks contra essas fixtures,
   incluindo o caminho de SKIP e as severidades da tabela 4.2.
2b. **Regressão do CLI do doctor** — `SKIP` aparece no resumo com ícone próprio e é contado;
   `SKIP` não altera o exit code; o `--json` carrega o status. As suítes existentes
   `test-doctor.mjs` e `test-doctor-cli.mjs` continuam verdes.
3. **`tests/validation/test-routines-state-split.mjs`** — migração do formato antigo · a
   definição versionada não é alterada · o estado vai para o runtime · ausência de estado é
   tratada como bootstrap · `snooze` é por máquina · migração idempotente.
4. **`tests/validation/test-session-start-checkup.mjs`** (E2E) — repositório temporário com
   `DEVFLOW_TODAY` (o hook já suporta a variável): bootstrap emite o bloco · segunda sessão no
   mesmo dia fica em silêncio · dia seguinte com plugin faltando emite diagnóstico · JSON
   corrompido não trava a sessão.

Todo E2E destrutivo roda em diretório temporário, nunca no diretório versionado.

**`requiredSignals: [unit, e2e, lint]`** — `e2e` é obrigatório porque a mudança toca um hook.

## 7.1 Achados de segurança (fase R)

**S1 — injeção de prompt pelo bloco do hook.** O `DEVFLOW_ENV_CHECKUP` injeta no contexto do LLM
texto derivado de `.claude/settings.json` **do repositório** — arquivo versionado, portanto escrito
por quem abre um PR — e de `known_marketplaces.json`. Um nome de plugin como
`devflow\n\nIgnore as instruções anteriores…` chegaria ao contexto. `escape_for_json` protege a
sintaxe do JSON, não a semântica.

Duas camadas de mitigação: sanitização (colapsa quebras de linha, allowlist de caracteres, trunca
em 300) e um preâmbulo marcando o conteúdo como dado. Nenhum bloco emitido hoje pelo hook tem essa
marcação — o `UNTRUSTED_WORKFLOW_STATE` vem do dotcontext, não daqui. Este é o primeiro.

**S2 — leitura mínima do settings do usuário.** `~/.claude/settings.json` carrega `env` e
`permissions` além de `enabledPlugins`. O leitor extrai **apenas** as chaves de `enabledPlugins`
com valor `true`; o objeto completo não é retido, para que nenhum diagnóstico futuro possa vazá-lo.

## 8. Guardrails de ADR aplicáveis

De `ci-scaffold-verbatim-provenance`:

- A routine nova entra em `templates/routines.json` como scaffold **verbatim**, sem interpolação.
- Ao aplicar num projeto que já tem `.context/routines.json`, a routine é **acrescentada por
  merge**, nunca sobrescrevendo as routines existentes do usuário.

## 9. Fora de escopo

- Executar `/devflow update` automaticamente (D7).
- Consultar o marketplace remoto por rede para descobrir a última versão publicada. O checkup usa
  o catálogo local e reporta quando ele está obsoleto; buscar a versão remota é decisão separada,
  com custo de rede e modo de falha próprios.
- Migrar os 9 checks existentes do doctor para a cadência diária. Eles fazem `exec` com timeout de
  15 s e não cabem num gate de início de sessão.
- Publicar o resultado do checkup no MemPalace para visão consolidada das máquinas do time.
- **Migrar o MemPalace para palace remoto compartilhado** (`mempalace serve`). É o que de fato dá
  memória de longo prazo a um dispositivo novo, mas envolve hospedagem, autenticação, custo e a
  migração de 433 MB — spec própria. Registrado em
  `docs/superpowers/2026-09-01-mempalace-remote-palace-followup.md`.
- **Corrigir o `OK` falso do `mempalace-health`.** O check existente devolve OK quando o MemPalace
  não está instalado. O `mempalace-env` (D10) cobre o caso pelo lado do projeto que o exige, mas o
  verde enganoso continua lá para quem chamar o check antigo direto.

## 10. Arquivos

**Novo:** `scripts/lib/plugin-env.mjs`; as quatro suítes de teste.

**Editado:** `scripts/lib/routines.mjs` (`shouldRun`, fix do snooze) · `scripts/lib/routines-render.mjs` (novo; montagem dos blocos fora do sh) · `scripts/lib/doctor.mjs` (5 checks) · `scripts/doctor.mjs` (status `SKIP` no
ícone, contadores, resumo e `--json`; exit code inalterado) · `scripts/lib/routines.mjs` (separação de
estado + migração) · `hooks/session-start` (execução de passos `check` + bloco) ·
`templates/routines.json` (routine nova) · `.context/routines.json` (dogfooding) ·
`skills/routines/SKILL.md` (documentar `type: check`) · `CHANGELOG.md`.
